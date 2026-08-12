import {
  SimulationClock
} from "../../runtime-layers/src/index.js?build=20260810-0054f";
import {
  aroundPivot,
  eulerQuaternion,
  multiplyMatrices,
  quaternionMatrix,
  translationMatrix
} from "../../math-affine/src/index.js?build=20260810-0054f";
import {
  createCharacterPhysicsState,
  normalizeCharacterGameConfig,
  stepCharacterPhysics
} from "./CharacterPhysics.js?build=20260812-0054i";
import {
  castCollisionSegment,
  normalizeCollisionWorld
} from "./CollisionWorld.js?build=20260812-0054i";

export const GAME_RUNTIME_VERSION = "game-runtime-v4-camera-collision";

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
  collisionMinimumDistance: 0.35
});

export class GameRuntime {
  #listeners = new Set();
  #unsubscribeFrame = () => {};
  #frameDemandToken = null;
  #targets = null;
  #physics = null;
  #colliders = Object.freeze([]);
  #initialCamera = null;
  #cameraPosition = null;
  #cameraYaw = 0;
  #cameraPitch = DEFAULT_CAMERA.pitch;
  #input = initialInput();
  #jumpQueued = false;
  #disposed = false;
  #lastPublishedTick = -1;

  constructor({
    surface,
    cameraController,
    clock = new SimulationClock(),
    config = {},
    camera = {},
    events = null
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
    this.config = normalizeCharacterGameConfig(config);
    this.cameraConfig = normalizeCameraConfig(camera);
    this.state = "idle";
    this.characterId = null;
    this.statistics = initialStatistics();
    this.#unsubscribeFrame = surface.subscribeFrame(frame => this.advance(frame));
  }

  start({ characterId, config = {}, camera = {} } = {}) {
    this.#assertActive();
    const id = String(characterId ?? "").trim();
    if (!id) throw new TypeError("Game mode requires a character object.");
    if (this.state === "running") this.stop("replaced");
    this.config = normalizeCharacterGameConfig({ ...this.config, ...config });
    this.cameraConfig = normalizeCameraConfig({ ...this.cameraConfig, ...camera });

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
      this.#colliders = normalizeCollisionWorld(world.colliders);
      this.#physics = createCharacterPhysicsState({
        pivot,
        bounds: world.character.bounds,
        config: this.config
      });
      this.characterId = id;
      this.#initialCamera = this.cameraController.snapshot();
      this.#cameraPosition = [...this.#initialCamera.position];
      const target = characterCameraTarget(this.#physics, this.cameraConfig);
      this.#cameraYaw = yawFromCamera(this.#cameraPosition, target);
      this.#cameraPitch = this.cameraConfig.pitch;
      this.#input = initialInput();
      this.#jumpQueued = false;
      this.clock.reset();
      this.state = "running";
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
      this.surface.setRuntimePresentationMode("authoring");
      if (restoreCamera && initialCamera) {
        this.cameraController.execute("viewer.camera.restore", {
          camera: initialCamera
        });
      }
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

  configure({ character = {}, camera = {} } = {}) {
    const previousConfig = this.config;
    this.config = normalizeCharacterGameConfig({ ...this.config, ...character });
    this.cameraConfig = normalizeCameraConfig({ ...this.cameraConfig, ...camera });
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

  respawn() {
    if (!this.#physics) return this.status();
    this.#physics.position = [...this.#physics.spawnPosition];
    this.#physics.velocity = [0, 0, 0];
    this.#physics.grounded = false;
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
    this.#colliders = normalizeCollisionWorld(world.colliders);
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
      grounded: Boolean(physics?.grounded),
      colliderCount: this.#colliders.length,
      respawns: Number(physics?.respawns ?? 0),
      input: Object.freeze({
        forward: this.#input.forward,
        strafe: this.#input.strafe,
        sprint: this.#input.sprint,
        jump: this.#input.jump
      }),
      config: this.config,
      camera: Object.freeze({
        ...this.cameraConfig,
        yaw: this.#cameraYaw,
        pitch: this.#cameraPitch
      }),
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
    const forward = [Math.sin(this.#cameraYaw), 0, -Math.cos(this.#cameraYaw)];
    const right = [Math.cos(this.#cameraYaw), 0, Math.sin(this.#cameraYaw)];
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
    this.#jumpQueued = false;
    if (jumpRequested && this.#physics.velocity[1] > 0) {
      this.#emitEvent("character.jump", { objectId: this.characterId });
    }
    if (!wasGrounded && this.#physics.grounded) {
      this.#emitEvent("character.land", { objectId: this.characterId });
    }
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
    const bob = this.#physics.animationState === "idle"
      ? Math.sin(time * 2.5) * 0.012
      : moving
        ? Math.abs(Math.sin(time * 10)) * 0.045
        : 0;
    const translation = this.#physics.position.map(
      (value, axis) => value - pivot[axis] + (axis === 1 ? bob : 0)
    );
    const rotation = aroundPivot(
      quaternionMatrix(eulerQuaternion([0, this.#physics.yaw * 180 / Math.PI, 0])),
      pivot
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
    return Boolean(applied?.changed);
  }

  #updateCamera() {
    const target = characterCameraTarget(this.#physics, this.cameraConfig);
    const horizontal = this.cameraConfig.distance * Math.cos(this.#cameraPitch);
    const desired = [
      target[0] - Math.sin(this.#cameraYaw) * horizontal,
      target[1] + this.cameraConfig.height +
        Math.sin(this.#cameraPitch) * this.cameraConfig.distance,
      target[2] + Math.cos(this.#cameraYaw) * horizontal
    ];
    const alpha = 1 - Math.exp(
      -this.cameraConfig.lag * this.clock.stepSeconds
    );
    const candidate = this.#cameraPosition.map(
      (value, axis) => value + (desired[axis] - value) * alpha
    );
    this.#cameraPosition = this.cameraConfig.collisionEnabled
      ? cameraCollisionPosition(
          target,
          candidate,
          this.#colliders,
          this.cameraConfig
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
    this.#colliders = Object.freeze([]);
    this.#initialCamera = null;
    this.#cameraPosition = null;
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
    )
  });
}

function cameraCollisionPosition(target, desired, colliders, camera) {
  const delta = desired.map((value, axis) => value - target[axis]);
  const requestedDistance = Math.hypot(...delta);
  if (requestedDistance <= 1e-9) return [...desired];
  const hit = castCollisionSegment(target, desired, colliders);
  if (!hit) return [...desired];
  const safeDistance = Math.max(
    camera.collisionMinimumDistance,
    hit.distance - camera.collisionProbeRadius
  );
  const scale = Math.min(1, safeDistance / requestedDistance);
  return target.map((value, axis) => value + delta[axis] * scale);
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
  return [
    physics.position[0] + physics.centerOffset[0],
    physics.position[1] + physics.centerOffset[1] +
      physics.halfExtents[1] * camera.targetHeightRatio,
    physics.position[2] + physics.centerOffset[2]
  ];
}

function yawFromCamera(position, target) {
  const x = target[0] - position[0];
  const z = target[2] - position[2];
  return Math.hypot(x, z) <= 1e-9 ? 0 : Math.atan2(x, -z);
}

function initialStatistics() {
  return {
    starts: 0,
    stops: 0,
    frames: 0,
    steps: 0,
    droppedSteps: 0,
    worldRefreshes: 0,
    lastStopReason: null
  };
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
