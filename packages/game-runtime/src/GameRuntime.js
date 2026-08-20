import {
  SimulationClock
} from "../../runtime-layers/src/index.js?build=20260810-0054f";
import {
  aroundPivot,
  multiplyMatrices,
  translationMatrix
} from "../../math-affine/src/index.js?build=20260810-0054f";
import {
  characterWorldBounds,
  createCharacterPhysicsState,
  normalizeCharacterGameConfig,
  stepCharacterPhysics
} from "./CharacterPhysics.js?build=20260818-0054my";
import {
  characterBodyHorizontalSupport,
  characterBodyWorldObb
} from "./CharacterBodyFrame.js?build=20260818-0054my";
import {
  castCollisionSegment,
  normalizeCollisionWorld,
  queryCharacterBodyOverlaps
} from "./CollisionWorld.js?build=20260819-0054nb";
import {
  applyKinematicSupportMotion,
  mergeKinematicCollisionWorld
} from "./KinematicCollisionWorld.js?build=20260818-0054my";

export const GAME_RUNTIME_VERSION = "game-runtime-v9-sensors-triggers";

const DEFAULT_CONTROLS = Object.freeze({
  movementReference: "camera",
  surfacePitch: true,
  surfaceHeight: true,
  surfaceRoll: false
});

const CHARACTER_SURFACE_PITCH_RESPONSE = 6;
const CHARACTER_SURFACE_AIRBORNE_RESPONSE = 3;
const CHARACTER_SURFACE_HEIGHT_RESPONSE = 12;
const CHARACTER_SURFACE_MAXIMUM_PITCH = 35 * Math.PI / 180;
const CHARACTER_SURFACE_MAXIMUM_PITCH_RATE = 2.2;

const DEFAULT_CAMERA = Object.freeze({
  distance: 6,
  height: 2.2,
  targetHeightRatio: 0.35,
  lag: 10,
  pitch: -0.12,
  minimumPitch: -0.75,
  maximumPitch: 0.55,
  lookSensitivity: 0.004,
  invertYaw: false,
  collisionEnabled: true,
  collisionProbeRadius: 0.18,
  collisionMinimumDistance: 0.35,
  collisionCharacterPadding: 0.08,
  minimumBaseClearance: 0.25
});

export class GameRuntime {
  #listeners = new Set();
  #unsubscribeFrame = () => {};
  #frameDemandToken = null;
  #targets = null;
  #physics = null;
  #baseColliders = Object.freeze([]);
  #colliders = Object.freeze([]);
  #baseSensors = Object.freeze([]);
  #sensors = Object.freeze([]);
  #activeSensorIds = new Set();
  #lastTriggerEvent = null;
  #collisionModeForObject = () => "solid";
  #kinematicRevision = null;
  #kinematicOwnerIds = Object.freeze([]);
  #initialCamera = null;
  #cameraPosition = null;
  #cameraFreePosition = null;
  #cameraYaw = 0;
  #cameraPitch = DEFAULT_CAMERA.pitch;
  #visualSurfacePitch = 0;
  #visualSurfaceOffsetY = 0;
  #visualFootPivot = null;
  #visualSupport = null;
  #input = initialInput();
  #jumpQueued = false;
  #collisionDebugEnabled = false;
  #disposed = false;
  #lastPublishedTick = -1;

  constructor({
    surface,
    cameraController,
    clock = new SimulationClock(),
    config = {},
    camera = {},
    controls = {},
    events = null,
    characterAnimation = null,
    collisionModeForObject = null
  } = {}) {
    validateSurface(surface);
    if (!cameraController?.snapshot || !cameraController?.execute) {
      throw new TypeError("GameRuntime requires a camera controller.");
    }
    if (!clock?.advance || !clock?.reset) {
      throw new TypeError("GameRuntime requires a simulation clock.");
    }
    this.surface = surface;
    this.cameraController = cameraController;
    this.clock = clock;
    this.events = events;
    this.characterAnimation = characterAnimation;
    if (collisionModeForObject !== null && typeof collisionModeForObject !== "function") {
      throw new TypeError("collisionModeForObject must be a function.");
    }
    this.#collisionModeForObject = collisionModeForObject ?? (() => "solid");
    this.config = normalizeCharacterGameConfig(config);
    this.cameraConfig = normalizeCameraConfig(camera);
    this.controlConfig = normalizeControlConfig(controls);
    this.state = "idle";
    this.characterId = null;
    this.statistics = initialStatistics();
    this.#unsubscribeFrame = surface.subscribeFrame(frame => this.advance(frame));
  }

  start({ characterId, config = {}, camera = {}, controls = {} } = {}) {
    this.#assertActive();
    const id = String(characterId ?? "").trim();
    if (!id) throw new TypeError("Game mode requires a character object.");
    if (this.state === "running") this.stop("replaced");
    this.config = normalizeCharacterGameConfig({ ...this.config, ...config });
    this.cameraConfig = normalizeCameraConfig({ ...this.cameraConfig, ...camera });
    this.controlConfig = normalizeControlConfig({ ...this.controlConfig, ...controls });

    const world = this.surface.readGameCollisionWorld(id);
    if (!world?.character?.bounds) {
      throw new Error(`Character has no renderable bounds: ${id}.`);
    }
    const targets = this.surface.captureAnimationTargets([id], {
      targetMode: "selection",
      overlayId: `game-character:${id}`
    });
    if (!targets?.units?.length) {
      this.surface.restoreAnimationTargets(targets, {
        overlayId: `game-character:${id}`
      });
      throw new Error("Character selection has no renderable geometry.");
    }

    try {
      const pivot = targets.units[0].pivot;
      this.#targets = targets;
      const collisionSets = this.#partitionCollisionWorld(world.colliders);
      this.#baseColliders = collisionSets.solids;
      this.#baseSensors = collisionSets.sensors;
      this.#colliders = this.#baseColliders;
      this.#sensors = this.#baseSensors;
      this.#activeSensorIds.clear();
      this.#lastTriggerEvent = null;
      this.#kinematicRevision = null;
      this.#kinematicOwnerIds = Object.freeze([]);
      this.#physics = createCharacterPhysicsState({
        pivot,
        bounds: world.character.bounds,
        bodyFrame: world.character.bodyFrame ?? null,
        config: this.config
      });
      this.#visualSurfacePitch = 0;
      this.#visualSurfaceOffsetY = 0;
      this.#visualFootPivot = characterVisualFootPivot(pivot, world.character.bounds);
      this.#visualSupport = null;
      this.characterId = id;
      this.#initialCamera = this.cameraController.snapshot();
      const target = characterCameraTarget(this.#physics, this.cameraConfig);
      this.#cameraYaw = yawFromCamera(this.#initialCamera.position, target);
      this.#cameraPitch = this.cameraConfig.pitch;
      const initialDesired = desiredCameraPosition(
        target,
        this.#cameraYaw,
        this.#cameraPitch,
        this.cameraConfig,
        this.#physics
      );
      this.#cameraFreePosition = [...initialDesired];
      this.#cameraPosition = this.cameraConfig.collisionEnabled
        ? cameraCollisionPosition(
            target,
            initialDesired,
            this.#colliders,
            this.cameraConfig,
            this.#physics
          )
        : [...initialDesired];
      this.#input = initialInput();
      this.#jumpQueued = false;
      this.clock.reset();
      this.state = "running";
      this.characterAnimation?.activate?.(id);
      this.statistics.starts += 1;
      this.statistics.lastStopReason = null;
      this.surface.setRuntimePresentationMode("game");
      this.#frameDemandToken = this.surface.acquireFrameDemand(
        `game-runtime:${id}`
      );
      this.#applyFrame();
      this.#notify("started");
      this.#emitEvent("game.start", { objectId: id });
      return this.status();
    } catch (error) {
      this.#releaseFrameDemand();
      if (this.#targets) {
        this.surface.restoreAnimationTargets(this.#targets, {
          overlayId: this.#targets.overlayId
        });
      }
      this.surface.setRuntimePresentationMode("authoring");
      this.#resetSession();
      throw error;
    }
  }

  stop(reason = "stopped", { restoreCamera = true } = {}) {
    if (this.state === "idle") return this.status();
    const targets = this.#targets;
    const initialCamera = this.#initialCamera;
    const stoppedCharacterId = this.characterId;
    this.#releaseFrameDemand();
    try {
      if (targets) this.surface.restoreAnimationTargets(targets, {
        overlayId: targets.overlayId
      });
    } finally {
      this.surface.setGameCollisionDebug?.(null);
      this.surface.setRuntimePresentationMode("authoring");
      if (restoreCamera && initialCamera) {
        this.cameraController.execute("viewer.camera.restore", {
          camera: initialCamera
        });
      }
      this.characterAnimation?.deactivate?.(stoppedCharacterId);
      this.statistics.stops += 1;
      this.statistics.lastStopReason = String(reason);
      this.#resetSession();
      this.#notify("stopped");
      this.#emitEvent("game.stop", { objectId: stoppedCharacterId, reason: String(reason) });
    }
    return this.status();
  }

  setInput(patch = {}) {
    this.#assertActive();
    const next = normalizeInputPatch(patch, this.#input);
    if (next.jump && !this.#input.jump) this.#jumpQueued = true;
    this.#input = next;
    this.#cameraYaw += next.lookYawDelta;
    this.#cameraPitch = clamp(
      this.#cameraPitch + next.lookPitchDelta,
      this.cameraConfig.minimumPitch,
      this.cameraConfig.maximumPitch
    );
    this.#input.lookYawDelta = 0;
    this.#input.lookPitchDelta = 0;
    return this.status();
  }

  configure({ character = {}, camera = {}, controls = {} } = {}) {
    const previousConfig = this.config;
    this.config = normalizeCharacterGameConfig({ ...this.config, ...character });
    this.cameraConfig = normalizeCameraConfig({ ...this.cameraConfig, ...camera });
    this.controlConfig = normalizeControlConfig({ ...this.controlConfig, ...controls });
    if (this.#physics &&
        this.config.colliderHorizontalScale !==
          previousConfig.colliderHorizontalScale) {
      const ratio = this.config.colliderHorizontalScale /
        previousConfig.colliderHorizontalScale;
      this.#physics.halfExtents[0] *= ratio;
      this.#physics.halfExtents[2] *= ratio;
    }
    if (Object.hasOwn(camera, "pitch")) {
      this.#cameraPitch = this.cameraConfig.pitch;
    }
    this.#notify("configured");
    return this.status();
  }

  setCollisionDebug({ enabled = true } = {}) {
    this.#collisionDebugEnabled = Boolean(enabled);
    if (this.#collisionDebugEnabled && this.state === "running") {
      this.#publishCollisionDebug();
    } else {
      this.surface.setGameCollisionDebug?.(null);
    }
    this.#notify("collision-debug");
    return this.status();
  }

  respawn() {
    if (!this.#physics) return this.status();
    this.#physics.position = [...this.#physics.spawnPosition];
    this.#physics.velocity = [0, 0, 0];
    this.#physics.grounded = false;
    this.#physics.supportColliderId = null;
    this.#physics.contacts = [];
    this.#physics.coyoteRemaining = 0;
    this.#physics.respawns += 1;
    this.#applyFrame();
    this.#emitEvent("character.respawn", { objectId: this.characterId });
    this.#notify("respawned");
    return this.status();
  }

  refreshCollisionWorld() {
    if (!this.characterId || this.state !== "running") return this.status();
    const world = this.surface.readGameCollisionWorld(this.characterId);
    const collisionSets = this.#partitionCollisionWorld(world.colliders);
    this.#baseColliders = collisionSets.solids;
    this.#baseSensors = collisionSets.sensors;
    this.#replaceCollisionWorld(this.#baseColliders);
    this.#sensors = this.#baseSensors;
    this.#refreshKinematicCollisionFrame({ force: true, rebuildBase: false });
    this.#refreshSensorOverlaps();
    this.statistics.worldRefreshes += 1;
    this.#notify("world-refreshed");
    return this.status();
  }

  sceneChanged(changes = []) {
    if (this.state !== "running" || !this.characterId) return false;
    const records = Array.isArray(changes) ? changes : [];
    const replaced = records.some(change => [
      "sandbox-undo",
      "sandbox-discard",
      "sandbox-rebased",
      "sandbox-state-replaced"
    ].includes(String(change?.type ?? "")));
    const characterChanged = records.some(change =>
      String(change?.objectId ?? change?.object?.id ?? "") === this.characterId
    );
    if (replaced || characterChanged) {
      this.stop(replaced ? "scene-replaced" : "character-changed");
      return true;
    }
    return false;
  }

  advance({ deltaSeconds = 0 } = {}) {
    if (this.#disposed || this.state !== "running" || !this.#physics) {
      return Object.freeze({ changed: false, continue: false });
    }
    this.#refreshKinematicCollisionFrame();
    const result = this.clock.advance(deltaSeconds, step => this.#step(step));
    this.statistics.steps += result.executed;
    this.statistics.droppedSteps += result.dropped;
    if (result.executed > 0) {
      this.#applyFrame();
      this.statistics.frames += 1;
      if (result.tick - this.#lastPublishedTick >= 6) {
        this.#lastPublishedTick = result.tick;
        this.#notify("frame");
      }
    }
    return Object.freeze({
      changed: result.executed > 0,
      continue: true,
      ...result
    });
  }

  status() {
    const physics = this.#physics;
    return Object.freeze({
      apiVersion: GAME_RUNTIME_VERSION,
      state: this.state,
      characterId: this.characterId,
      animationState: physics?.animationState ?? "idle",
      position: Object.freeze([...(physics?.position ?? [0, 0, 0])]),
      velocity: Object.freeze([...(physics?.velocity ?? [0, 0, 0])]),
      yaw: Number(physics?.yaw ?? 0),
      visualYaw: Number(physics?.facingYaw ?? physics?.yaw ?? 0),
      visualPitch: Number(this.#visualSurfacePitch ?? 0),
      visualGroundOffsetY: Number(this.#visualSurfaceOffsetY ?? 0),
      grounded: Boolean(physics?.grounded),
      supportColliderId: physics?.supportColliderId ?? null,
      triggers: Object.freeze({
        sensorCount: this.#sensors.length,
        activeSensorIds: Object.freeze([...this.#activeSensorIds].sort()),
        lastEvent: this.#lastTriggerEvent
      }),
      debug: Object.freeze({
        collision: this.#collisionDebugEnabled,
        contacts: Object.freeze((physics?.contacts ?? []).map(contact =>
          Object.freeze({ ...contact })
        )),
        visualSurface: this.#visualSupport
          ? Object.freeze({
              colliderId: this.#visualSupport.colliderId,
              point: Object.freeze([...this.#visualSupport.point]),
              normal: Object.freeze([...this.#visualSupport.normal]),
              targetPitch: this.#visualSupport.targetPitch,
              targetOffsetY: this.#visualSupport.targetOffsetY
            })
          : null
      }),
      body: physics ? Object.freeze({
        baseYaw: Number(physics.baseYaw ?? 0),
        halfExtents: Object.freeze([...physics.halfExtents]),
        bounds: characterWorldBounds(physics)
      }) : null,
      colliderCount: this.#colliders.length,
      kinematics: Object.freeze({
        revision: this.#kinematicRevision,
        activeOwnerIds: this.#kinematicOwnerIds,
        activeColliderCount: this.#colliders.filter(entry =>
          this.#kinematicOwnerIds.includes(entry.ownerId)
        ).length
      }),
      respawns: Number(physics?.respawns ?? 0),
      input: Object.freeze({
        forward: this.#input.forward,
        strafe: this.#input.strafe,
        sprint: this.#input.sprint,
        jump: this.#input.jump
      }),
      config: this.config,
      controls: this.controlConfig,
      camera: Object.freeze({
        ...this.cameraConfig,
        yaw: this.#cameraYaw,
        pitch: this.#cameraPitch
      }),
      skeletalAnimation: this.characterId
        ? this.characterAnimation?.status?.(this.characterId) ?? null
        : null,
      statistics: Object.freeze({ ...this.statistics })
    });
  }

  subscribe(listener) {
    if (typeof listener !== "function") {
      throw new TypeError("GameRuntime listener must be a function.");
    }
    this.#listeners.add(listener);
    listener(this.status(), Object.freeze({ type: "initial" }));
    return () => this.#listeners.delete(listener);
  }

  dispose() {
    if (this.#disposed) return false;
    if (this.state === "running") this.stop("disposed");
    this.#disposed = true;
    this.#unsubscribeFrame();
    this.#listeners.clear();
    return true;
  }

  #step({ deltaSeconds }) {
    const wasGrounded = Boolean(this.#physics?.grounded);
    const previousAnimationState = this.#physics?.animationState ?? null;
    const jumpRequested = this.#jumpQueued;
    const { forward, right } = movementBasis(
      this.controlConfig.movementReference,
      this.#cameraYaw
    );
    const worldX = forward[0] * this.#input.forward +
      right[0] * this.#input.strafe;
    const worldZ = forward[2] * this.#input.forward +
      right[2] * this.#input.strafe;
    stepCharacterPhysics(
      this.#physics,
      {
        worldX,
        worldZ,
        sprint: this.#input.sprint,
        jump: this.#jumpQueued
      },
      this.#colliders,
      this.config,
      deltaSeconds
    );
    this.characterAnimation?.observeMotion?.(
      this.characterId,
      characterMotionSnapshot(this.#physics, this.#input)
    );
    this.characterAnimation?.advance?.(deltaSeconds);
    this.#jumpQueued = false;
    if (jumpRequested && this.#physics.velocity[1] > 0) {
      this.#emitEvent("character.jump", { objectId: this.characterId });
    }
    if (!wasGrounded && this.#physics.grounded) {
      this.#emitEvent("character.land", { objectId: this.characterId });
    }
    this.#refreshSensorOverlaps();
    if (previousAnimationState !== this.#physics.animationState) {
      this.#emitEvent("character.state", {
        objectId: this.characterId,
        state: this.#physics.animationState,
        previousState: previousAnimationState
      });
    }
    if (this.events?.has?.("game.tick")) {
      this.#emitEvent("game.tick", {
        objectId: this.characterId,
        deltaSeconds,
        position: [...this.#physics.position],
        velocity: [...this.#physics.velocity]
      });
    }
  }

  #refreshKinematicCollisionFrame({
    force = false,
    rebuildBase = true
  } = {}) {
    if (typeof this.surface.readGameKinematicCollisionFrame !== "function" ||
        !this.characterId || !this.#physics) return false;
    const startedAt = nowMilliseconds();
    const frame = this.surface.readGameKinematicCollisionFrame(
      this.characterId,
      { sinceRevision: force ? null : this.#kinematicRevision }
    );
    if (!frame || (!force && frame.changed === false)) return false;
    const ownerIds = Object.freeze([
      ...new Set((frame.activeOwnerIds ?? []).map(String).filter(Boolean))
    ].sort());
    const ownerSignature = ownerIds.join("\u0000");
    const previousSignature = this.#kinematicOwnerIds.join("\u0000");
    if (rebuildBase && ownerSignature !== previousSignature) {
      const world = this.surface.readGameCollisionWorld(this.characterId);
      const collisionSets = this.#partitionCollisionWorld(world.colliders);
      this.#baseColliders = collisionSets.solids;
      this.#baseSensors = collisionSets.sensors;
      this.statistics.worldRefreshes += 1;
    }
    const dynamicSets = this.#partitionCollisionWorld(frame.colliders ?? []);
    const next = mergeKinematicCollisionWorld(this.#baseColliders, {
      ...frame,
      colliders: dynamicSets.solids
    });
    const nextSensors = mergeKinematicCollisionWorld(this.#baseSensors, {
      ...frame,
      colliders: dynamicSets.sensors
    });
    const carried = this.#replaceCollisionWorld(next);
    this.#sensors = nextSensors;
    this.#kinematicRevision = frame.revision ?? null;
    this.#kinematicOwnerIds = ownerIds;
    this.statistics.kinematicRefreshes += 1;
    if (carried.changed) this.statistics.platformCarries += 1;
    const elapsed = nowMilliseconds() - startedAt;
    this.statistics.lastKinematicRefreshMs = elapsed;
    this.statistics.maximumKinematicRefreshMs = Math.max(
      this.statistics.maximumKinematicRefreshMs,
      elapsed
    );
    return true;
  }

  #replaceCollisionWorld(nextColliders) {
    const next = normalizeCollisionWorld(nextColliders);
    const carried = applyKinematicSupportMotion(
      this.#physics,
      this.#colliders,
      next
    );
    this.#colliders = next;
    return carried;
  }

  #partitionCollisionWorld(colliders) {
    const normalized = normalizeCollisionWorld(colliders ?? []);
    const solids = [];
    const sensors = [];
    for (const collider of normalized) {
      const mode = normalizeCollisionMode(
        this.#collisionModeForObject(collider.ownerId)
      );
      if (mode === "sensor") sensors.push(collider);
      else if (mode === "solid") solids.push(collider);
    }
    return Object.freeze({
      solids: normalizeCollisionWorld(solids),
      sensors: normalizeCollisionWorld(sensors)
    });
  }

  #refreshSensorOverlaps() {
    if (!this.#physics) return false;
    const body = characterBodyWorldObb(this.#physics);
    const hits = queryCharacterBodyOverlaps(body, this.#sensors, 0);
    const byOwner = new Map();
    for (const hit of hits) {
      const sensorId = String(hit.ownerId ?? hit.id);
      const colliderIds = byOwner.get(sensorId) ?? [];
      colliderIds.push(String(hit.id));
      byOwner.set(sensorId, colliderIds);
    }
    const next = new Set(byOwner.keys());
    for (const sensorId of next) {
      if (this.#activeSensorIds.has(sensorId)) continue;
      this.statistics.triggerEnters += 1;
      this.#lastTriggerEvent = Object.freeze({
        type: "trigger.enter",
        objectId: sensorId
      });
      this.#emitEvent("trigger.enter", {
        objectId: sensorId,
        sensorId,
        characterId: this.characterId,
        colliderIds: Object.freeze([...(byOwner.get(sensorId) ?? [])])
      });
    }
    for (const sensorId of this.#activeSensorIds) {
      if (next.has(sensorId)) continue;
      this.statistics.triggerExits += 1;
      this.#lastTriggerEvent = Object.freeze({
        type: "trigger.exit",
        objectId: sensorId
      });
      this.#emitEvent("trigger.exit", {
        objectId: sensorId,
        sensorId,
        characterId: this.characterId,
        colliderIds: Object.freeze([])
      });
    }
    const changed = next.size !== this.#activeSensorIds.size ||
      [...next].some(id => !this.#activeSensorIds.has(id));
    this.#activeSensorIds = next;
    return changed;
  }

  #emitEvent(type, payload) {
    try {
      const pending = this.events?.emit?.(type, payload);
      pending?.catch?.(error => console.error("Game event failed", type, error));
    } catch (error) {
      console.error("Game event failed", type, error);
    }
  }

  #applyFrame() {
    if (!this.#physics || !this.#targets) return false;
    const pivot = this.#targets.units[0].pivot;
    const time = this.clock.simulationTime;
    const moving = this.#physics.animationState === "walk";
    const skeletal = this.characterAnimation?.status?.(this.characterId);
    const bob = skeletal?.loaded
      ? 0
      : this.#physics.animationState === "idle"
        ? Math.sin(time * 2.5) * 0.012
        : moving
          ? Math.abs(Math.sin(time * 10)) * 0.045
          : 0;
    this.#visualSupport = sampleVisualSupport(
      this.#physics,
      this.#colliders,
      this.config
    );
    const targetPitch = this.controlConfig.surfacePitch && this.#visualSupport
      ? this.#visualSupport.targetPitch
      : 0;
    const targetOffsetY = this.controlConfig.surfaceHeight && this.#visualSupport
      ? this.#visualSupport.targetOffsetY
      : 0;
    this.#visualSurfacePitch = nextVisualSurfacePitch(
      this.#visualSurfacePitch,
      targetPitch,
      this.#physics.grounded,
      this.clock.stepSeconds
    );
    this.#visualSurfaceOffsetY = nextVisualSurfaceOffset(
      this.#visualSurfaceOffsetY,
      targetOffsetY,
      this.#physics.grounded,
      this.clock.stepSeconds,
      characterWorldBounds(this.#physics)
    );
    const translation = this.#physics.position.map(
      (value, axis) => value - pivot[axis] +
        (axis === 1 ? bob + this.#visualSurfaceOffsetY : 0)
    );
    const yawDelta = (this.#physics.facingYaw ?? this.#physics.yaw) -
      (this.#physics.baseYaw ?? 0);
    const visualPivot = this.#visualFootPivot ?? pivot;
    const rotation = aroundPivot(
      multiplyMatrices(
        rotationYMatrix(yawDelta),
        rotationZMatrix(this.#visualSurfacePitch)
      ),
      visualPivot
    );
    const matrix = multiplyMatrices(translationMatrix(translation), rotation);
    const frame = this.#targets.units.map(unit => Object.freeze({
      unitId: unit.unitId,
      matrix: unit.unitId === this.#targets.units[0].unitId
        ? Object.freeze(matrix)
        : Object.freeze(translationMatrix(translation)),
      color: null
    }));
    const applied = this.surface.applyAnimationFrame(
      this.#targets,
      Object.freeze(frame),
      { overlayId: this.#targets.overlayId }
    );
    this.#updateCamera();
    this.#publishCollisionDebug();
    return Boolean(applied?.changed);
  }

  #publishCollisionDebug() {
    if (!this.#collisionDebugEnabled || !this.#physics) return false;
    return Boolean(this.surface.setGameCollisionDebug?.({
      enabled: true,
      revision: this.statistics.worldRefreshes,
      grounded: Boolean(this.#physics.grounded),
      characterBody: characterBodyWorldObb(this.#physics),
      characterBounds: characterWorldBounds(this.#physics),
      contacts: this.#physics.contacts ?? [],
      colliders: this.#colliders
    }));
  }

  #updateCamera() {
    const target = characterCameraTarget(this.#physics, this.cameraConfig);
    const desired = desiredCameraPosition(
      target,
      this.#cameraYaw,
      this.#cameraPitch,
      this.cameraConfig,
      this.#physics
    );
    const alpha = 1 - Math.exp(
      -this.cameraConfig.lag * this.clock.stepSeconds
    );
    const freeStart = this.#cameraFreePosition ?? this.#cameraPosition ?? desired;
    const candidate = freeStart.map(
      (value, axis) => value + (desired[axis] - value) * alpha
    );
    // The unconstrained camera has its own state. Collision resolution never
    // feeds back into the lag integrator, avoiding the wall push/snap cycle.
    this.#cameraFreePosition = candidate;
    this.#cameraPosition = this.cameraConfig.collisionEnabled
      ? cameraCollisionPosition(
          target,
          candidate,
          this.#colliders,
          this.cameraConfig,
          this.#physics
        )
      : candidate;
    this.cameraController.execute("viewer.camera.look-at", {
      position: this.#cameraPosition,
      target
    });
  }

  #notify(type) {
    const snapshot = this.status();
    const event = Object.freeze({ type: String(type) });
    for (const listener of this.#listeners) {
      try { listener(snapshot, event); }
      catch (error) { console.error("GameRuntime subscriber failed", error); }
    }
  }

  #releaseFrameDemand() {
    if (this.#frameDemandToken !== null) {
      this.surface.releaseFrameDemand(this.#frameDemandToken);
      this.#frameDemandToken = null;
    }
  }

  #resetSession() {
    this.state = "idle";
    this.characterId = null;
    this.#targets = null;
    this.#physics = null;
    this.#baseColliders = Object.freeze([]);
    this.#colliders = Object.freeze([]);
    this.#baseSensors = Object.freeze([]);
    this.#sensors = Object.freeze([]);
    this.#activeSensorIds.clear();
    this.#lastTriggerEvent = null;
    this.#kinematicRevision = null;
    this.#kinematicOwnerIds = Object.freeze([]);
    this.#initialCamera = null;
    this.#cameraPosition = null;
    this.#cameraFreePosition = null;
    this.#visualSurfacePitch = 0;
    this.#visualSurfaceOffsetY = 0;
    this.#visualFootPivot = null;
    this.#visualSupport = null;
    this.#input = initialInput();
    this.#jumpQueued = false;
    this.#lastPublishedTick = -1;
    this.clock.reset();
  }

  #assertActive() {
    if (this.#disposed) throw new Error("GameRuntime has been disposed.");
  }
}

function validateSurface(surface) {
  const required = [
    "subscribeFrame",
    "acquireFrameDemand",
    "releaseFrameDemand",
    "readGameCollisionWorld",
    "captureAnimationTargets",
    "applyAnimationFrame",
    "restoreAnimationTargets",
    "setRuntimePresentationMode"
  ];
  const missing = required.filter(name => typeof surface?.[name] !== "function");
  if (missing.length) {
    throw new TypeError(`GameRuntime surface is missing: ${missing.join(", ")}.`);
  }
}

function normalizeControlConfig(source = {}) {
  const value = source && typeof source === "object" ? source : {};
  const movementReference = String(
    value.movementReference ?? DEFAULT_CONTROLS.movementReference
  ).trim().toLowerCase();
  if (!["world", "camera"].includes(movementReference)) {
    throw new RangeError("controls.movementReference must be world or camera.");
  }
  return Object.freeze({
    movementReference,
    surfacePitch: value.surfacePitch === undefined
      ? DEFAULT_CONTROLS.surfacePitch
      : Boolean(value.surfacePitch),
    surfaceHeight: value.surfaceHeight === undefined
      ? DEFAULT_CONTROLS.surfaceHeight
      : Boolean(value.surfaceHeight),
    surfaceRoll: value.surfaceRoll === undefined
      ? DEFAULT_CONTROLS.surfaceRoll
      : Boolean(value.surfaceRoll)
  });
}

function movementBasis(reference, cameraYaw) {
  if (reference === "camera") {
    return Object.freeze({
      forward: Object.freeze([Math.sin(cameraYaw), 0, -Math.cos(cameraYaw)]),
      right: Object.freeze([Math.cos(cameraYaw), 0, Math.sin(cameraYaw)])
    });
  }
  return Object.freeze({
    // Character/world frame: +Y up, +X forward, +Z right.
    // Keyboard semantics remain W/S=forward/back and A/D=left/right.
    forward: Object.freeze([1, 0, 0]),
    right: Object.freeze([0, 0, 1])
  });
}

function normalizeCameraConfig(source = {}) {
  const value = source && typeof source === "object" ? source : {};
  const minimumPitch = finite(value.minimumPitch ?? DEFAULT_CAMERA.minimumPitch, "camera.minimumPitch");
  const maximumPitch = finite(value.maximumPitch ?? DEFAULT_CAMERA.maximumPitch, "camera.maximumPitch");
  if (!(maximumPitch > minimumPitch)) {
    throw new RangeError("camera.maximumPitch must exceed camera.minimumPitch.");
  }
  return Object.freeze({
    distance: positive(value.distance ?? DEFAULT_CAMERA.distance, "camera.distance"),
    height: finite(value.height ?? DEFAULT_CAMERA.height, "camera.height"),
    targetHeightRatio: ranged(
      value.targetHeightRatio ?? DEFAULT_CAMERA.targetHeightRatio,
      -1,
      1,
      "camera.targetHeightRatio"
    ),
    lag: positive(value.lag ?? DEFAULT_CAMERA.lag, "camera.lag"),
    pitch: ranged(
      value.pitch ?? DEFAULT_CAMERA.pitch,
      minimumPitch,
      maximumPitch,
      "camera.pitch"
    ),
    minimumPitch,
    maximumPitch,
    lookSensitivity: positive(
      value.lookSensitivity ?? DEFAULT_CAMERA.lookSensitivity,
      "camera.lookSensitivity"
    ),
    invertYaw: Boolean(value.invertYaw ?? DEFAULT_CAMERA.invertYaw),
    collisionEnabled: value.collisionEnabled === undefined
      ? DEFAULT_CAMERA.collisionEnabled
      : Boolean(value.collisionEnabled),
    collisionProbeRadius: nonNegative(
      value.collisionProbeRadius ?? DEFAULT_CAMERA.collisionProbeRadius,
      "camera.collisionProbeRadius"
    ),
    collisionMinimumDistance: nonNegative(
      value.collisionMinimumDistance ?? DEFAULT_CAMERA.collisionMinimumDistance,
      "camera.collisionMinimumDistance"
    ),
    collisionCharacterPadding: nonNegative(
      value.collisionCharacterPadding ?? DEFAULT_CAMERA.collisionCharacterPadding,
      "camera.collisionCharacterPadding"
    ),
    minimumBaseClearance: nonNegative(
      value.minimumBaseClearance ?? DEFAULT_CAMERA.minimumBaseClearance,
      "camera.minimumBaseClearance"
    )
  });
}


function desiredCameraPosition(target, yaw, pitch, camera, physics = null) {
  const bodySupport = physics
    ? characterBodyHorizontalSupport(
        physics,
        -Math.sin(yaw),
        Math.cos(yaw)
      )
    : 0;
  // `distance` is clearance from the physical body, not from its center.
  // Scaling the authoring body therefore moves the nominal camera rig too.
  const orbitDistance = camera.distance + bodySupport;
  const horizontal = orbitDistance * Math.cos(pitch);
  const desired = [
    target[0] - Math.sin(yaw) * horizontal,
    target[1] + camera.height + Math.sin(pitch) * orbitDistance,
    target[2] + Math.cos(yaw) * horizontal
  ];
  if (physics) {
    const body = characterWorldBounds(physics);
    desired[1] = Math.max(
      desired[1],
      body.min[1] + camera.minimumBaseClearance
    );
  }
  return desired;
}

function cameraCollisionPosition(target, desired, colliders, camera, physics = null) {
  const delta = desired.map((value, axis) => value - target[axis]);
  const requestedDistance = Math.hypot(...delta);
  if (requestedDistance <= 1e-9) return [...desired];
  const hit = castCollisionSegment(target, desired, colliders);
  const wallDistance = hit
    ? Math.max(0, hit.distance - camera.collisionProbeRadius)
    : requestedDistance;
  const characterClearance = physics
    ? cameraCharacterClearance(
        physics,
        target,
        delta,
        camera.collisionCharacterPadding + camera.collisionProbeRadius
      )
    : 0;
  const preferredMinimum = Math.max(
    camera.collisionMinimumDistance,
    characterClearance
  );
  // If a wall leaves enough room, never enter the physical character volume.
  // If there is genuinely no gap, the wall remains authoritative rather than
  // pushing the camera through it. Enlarging the proxy enlarges this clearance.
  const safeDistance = wallDistance >= preferredMinimum
    ? Math.max(preferredMinimum, Math.min(requestedDistance, wallDistance))
    : wallDistance;
  const scale = Math.min(1, safeDistance / requestedDistance);
  return target.map((value, axis) => value + delta[axis] * scale);
}

function cameraCharacterClearance(physics, _target, delta, padding = 0) {
  const length = Math.hypot(...delta);
  const horizontalLength = Math.hypot(delta[0], delta[2]);
  if (length <= 1e-9 || horizontalLength <= 1e-9) return 0;
  const support = characterBodyHorizontalSupport(
    physics,
    delta[0],
    delta[2]
  );
  const horizontalFraction = horizontalLength / length;
  const bodyExitDistance = support / Math.max(horizontalFraction, 1e-6);
  return Math.max(
    0,
    bodyExitDistance + Math.max(0, Number(padding) || 0)
  );
}

function normalizeInputPatch(patch, previous) {
  const source = patch && typeof patch === "object" ? patch : {};
  return {
    forward: ranged(source.forward ?? previous.forward, -1, 1, "input.forward"),
    strafe: ranged(source.strafe ?? previous.strafe, -1, 1, "input.strafe"),
    sprint: source.sprint === undefined ? previous.sprint : Boolean(source.sprint),
    jump: source.jump === undefined ? previous.jump : Boolean(source.jump),
    lookYawDelta: finite(source.lookYawDelta ?? 0, "input.lookYawDelta"),
    lookPitchDelta: finite(source.lookPitchDelta ?? 0, "input.lookPitchDelta")
  };
}

function initialInput() {
  return {
    forward: 0,
    strafe: 0,
    sprint: false,
    jump: false,
    lookYawDelta: 0,
    lookPitchDelta: 0
  };
}

function characterCameraTarget(physics, camera) {
  const body = characterWorldBounds(physics);
  const center = body.min.map(
    (value, axis) => (value + body.max[axis]) * 0.5
  );
  return [
    center[0],
    center[1] + (body.max[1] - body.min[1]) * 0.5 * camera.targetHeightRatio,
    center[2]
  ];
}

function yawFromCamera(position, target) {
  const x = target[0] - position[0];
  const z = target[2] - position[2];
  return Math.hypot(x, z) <= 1e-9 ? 0 : Math.atan2(x, -z);
}


function characterVisualFootPivot(pivot, bounds) {
  const minimumY = Number(bounds?.min?.[1]);
  return Number.isFinite(minimumY)
    ? [pivot[0], minimumY, pivot[2]]
    : [...pivot];
}

function sampleVisualSupport(physics, colliders, config) {
  if (!physics?.grounded) return null;
  const bounds = characterWorldBounds(physics);
  const centerX = (bounds.min[0] + bounds.max[0]) * 0.5;
  const centerZ = (bounds.min[2] + bounds.max[2]) * 0.5;
  const footY = bounds.min[1];
  const bodyHeight = Math.max(0.05, bounds.max[1] - bounds.min[1]);
  const rise = Math.max(config.stepHeight, config.groundProbe, 0.05) +
    config.collisionSkin * 2;
  const drop = Math.max(
    config.groundSnapDistance,
    config.stepHeight,
    config.groundProbe,
    bodyHeight * 0.75
  );
  const hit = castCollisionSegment(
    [centerX, footY + rise, centerZ],
    [centerX, footY - drop, centerZ],
    colliders
  );
  if (!hit || !Array.isArray(hit.normal)) return null;
  const normal = normalizedVector3(hit.normal);
  if (!normal) return null;
  const minimumNormalY = Math.cos(config.maximumSlopeDegrees * Math.PI / 180);
  if (normal[1] < minimumNormalY) return null;
  const yaw = Number(physics.facingYaw ?? physics.yaw ?? 0);
  const forwardX = Math.cos(yaw);
  const forwardZ = -Math.sin(yaw);
  const dot = forwardX * normal[0] + forwardZ * normal[2];
  const tangentX = forwardX - normal[0] * dot;
  const tangentY = -normal[1] * dot;
  const tangentZ = forwardZ - normal[2] * dot;
  const horizontal = Math.hypot(tangentX, tangentZ);
  const targetPitch = horizontal <= 1e-9
    ? 0
    : clamp(
        Math.atan2(tangentY, horizontal),
        -CHARACTER_SURFACE_MAXIMUM_PITCH,
        CHARACTER_SURFACE_MAXIMUM_PITCH
      );
  const maximumOffset = bodyHeight * 0.75;
  const targetOffsetY = clamp(
    hit.point[1] + config.collisionSkin - footY,
    -maximumOffset,
    maximumOffset
  );
  return Object.freeze({
    colliderId: hit.colliderId ?? null,
    point: Object.freeze([...hit.point]),
    normal: Object.freeze(normal),
    targetPitch,
    targetOffsetY
  });
}

function nextVisualSurfacePitch(current, target, grounded, deltaSeconds) {
  const safeCurrent = Number.isFinite(current) ? current : 0;
  const safeTarget = Number.isFinite(target) ? target : 0;
  const dt = clamp(Number(deltaSeconds) || 0, 0, 0.25);
  if (dt <= 0) return safeCurrent;
  const response = grounded
    ? CHARACTER_SURFACE_PITCH_RESPONSE
    : CHARACTER_SURFACE_AIRBORNE_RESPONSE;
  const alpha = 1 - Math.exp(-response * dt);
  const maximumStep = CHARACTER_SURFACE_MAXIMUM_PITCH_RATE * dt;
  return safeCurrent + clamp(
    (safeTarget - safeCurrent) * alpha,
    -maximumStep,
    maximumStep
  );
}

function nextVisualSurfaceOffset(current, target, grounded, deltaSeconds, bounds) {
  const safeCurrent = Number.isFinite(current) ? current : 0;
  const safeTarget = Number.isFinite(target) ? target : 0;
  const dt = clamp(Number(deltaSeconds) || 0, 0, 0.25);
  if (dt <= 0) return safeCurrent;
  const response = grounded ? CHARACTER_SURFACE_HEIGHT_RESPONSE : CHARACTER_SURFACE_AIRBORNE_RESPONSE;
  const alpha = 1 - Math.exp(-response * dt);
  const bodyHeight = Math.max(0.05, Number(bounds?.max?.[1]) - Number(bounds?.min?.[1]));
  const maximumStep = Math.max(0.25, bodyHeight * 4) * dt;
  return safeCurrent + clamp(
    (safeTarget - safeCurrent) * alpha,
    -maximumStep,
    maximumStep
  );
}

function normalizedVector3(source) {
  const x = Number(source?.[0]) || 0;
  const y = Number(source?.[1]) || 0;
  const z = Number(source?.[2]) || 0;
  const length = Math.hypot(x, y, z);
  return length > 1e-9 ? [x / length, y / length, z / length] : null;
}

function rotationYMatrix(angle) {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return [
    cosine, 0, -sine, 0,
    0, 1, 0, 0,
    sine, 0, cosine, 0,
    0, 0, 0, 1
  ];
}

function rotationZMatrix(angle) {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return [
    cosine, sine, 0, 0,
    -sine, cosine, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1
  ];
}

function characterMotionSnapshot(physics, input) {
  return Object.freeze({
    grounded: Boolean(physics?.grounded),
    horizontalSpeed: Math.hypot(
      Number(physics?.velocity?.[0]) || 0,
      Number(physics?.velocity?.[2]) || 0
    ),
    verticalSpeed: Number(physics?.velocity?.[1]) || 0,
    sprint: Boolean(input?.sprint)
  });
}

function initialStatistics() {
  return {
    starts: 0,
    stops: 0,
    frames: 0,
    steps: 0,
    droppedSteps: 0,
    worldRefreshes: 0,
    kinematicRefreshes: 0,
    platformCarries: 0,
    triggerEnters: 0,
    triggerExits: 0,
    lastKinematicRefreshMs: 0,
    maximumKinematicRefreshMs: 0,
    lastStopReason: null
  };
}

function normalizeCollisionMode(value) {
  const mode = String(value ?? "solid").trim().toLowerCase();
  return mode === "sensor" || mode === "none" ? mode : "solid";
}

function nowMilliseconds() {
  return globalThis.performance?.now?.() ?? Date.now();
}

function finite(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new TypeError(`${label} must be finite.`);
  return number;
}

function positive(value, label) {
  const number = finite(value, label);
  if (!(number > 0)) throw new RangeError(`${label} must be positive.`);
  return number;
}

function nonNegative(value, label) {
  const number = finite(value, label);
  if (number < 0) throw new RangeError(`${label} must be non-negative.`);
  return number;
}

function ranged(value, minimum, maximum, label) {
  const number = finite(value, label);
  if (number < minimum || number > maximum) {
    throw new RangeError(`${label} must be between ${minimum} and ${maximum}.`);
  }
  return number;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}
