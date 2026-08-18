import {
  castCollisionSegment,
  normalizeCollisionWorld,
  queryCharacterBodyOverlaps,
  worldIntersectsCharacterBody
} from "./CollisionWorld.js?build=20260818-0054mv";
import {
  characterBodyWorldBounds,
  characterBodyWorldHalfExtents,
  characterBodyWorldObb,
  normalizeCharacterBodyFrame
} from "./CharacterBodyFrame.js?build=20260818-0054mv";

export const DEFAULT_CHARACTER_GAME_CONFIG = Object.freeze({
  gravity: 18,
  walkSpeed: 4.5,
  sprintMultiplier: 1.65,
  groundAcceleration: 30,
  airAcceleration: 10,
  groundFriction: 24,
  jumpSpeed: 7.25,
  coyoteSeconds: 0.1,
  colliderHorizontalScale: 1,
  collisionSkin: 0.001,
  groundProbe: 0.035,
  stepHeight: 0.35,
  groundSnapDistance: 0.3,
  maximumSlopeDegrees: 50,
  respawnBelow: -100
});

const EPSILON = 1e-9;
const normalizedConfigs = new WeakSet();

export function normalizeCharacterGameConfig(source = {}) {
  if (source && typeof source === "object" && normalizedConfigs.has(source)) {
    return source;
  }
  const value = source && typeof source === "object" ? source : {};
  const normalized = Object.freeze({
    gravity: positive(value.gravity ?? DEFAULT_CHARACTER_GAME_CONFIG.gravity, "gravity"),
    walkSpeed: positive(value.walkSpeed ?? DEFAULT_CHARACTER_GAME_CONFIG.walkSpeed, "walkSpeed"),
    sprintMultiplier: positive(
      value.sprintMultiplier ?? DEFAULT_CHARACTER_GAME_CONFIG.sprintMultiplier,
      "sprintMultiplier"
    ),
    groundAcceleration: positive(
      value.groundAcceleration ?? DEFAULT_CHARACTER_GAME_CONFIG.groundAcceleration,
      "groundAcceleration"
    ),
    airAcceleration: positive(
      value.airAcceleration ?? DEFAULT_CHARACTER_GAME_CONFIG.airAcceleration,
      "airAcceleration"
    ),
    groundFriction: positive(
      value.groundFriction ?? DEFAULT_CHARACTER_GAME_CONFIG.groundFriction,
      "groundFriction"
    ),
    jumpSpeed: positive(value.jumpSpeed ?? DEFAULT_CHARACTER_GAME_CONFIG.jumpSpeed, "jumpSpeed"),
    coyoteSeconds: nonNegative(
      value.coyoteSeconds ?? DEFAULT_CHARACTER_GAME_CONFIG.coyoteSeconds,
      "coyoteSeconds"
    ),
    colliderHorizontalScale: ranged(
      value.colliderHorizontalScale ??
        DEFAULT_CHARACTER_GAME_CONFIG.colliderHorizontalScale,
      0.05,
      1,
      "colliderHorizontalScale"
    ),
    collisionSkin: nonNegative(
      value.collisionSkin ?? DEFAULT_CHARACTER_GAME_CONFIG.collisionSkin,
      "collisionSkin"
    ),
    groundProbe: positive(
      value.groundProbe ?? DEFAULT_CHARACTER_GAME_CONFIG.groundProbe,
      "groundProbe"
    ),
    stepHeight: nonNegative(
      value.stepHeight ?? DEFAULT_CHARACTER_GAME_CONFIG.stepHeight,
      "stepHeight"
    ),
    groundSnapDistance: nonNegative(
      value.groundSnapDistance ?? DEFAULT_CHARACTER_GAME_CONFIG.groundSnapDistance,
      "groundSnapDistance"
    ),
    maximumSlopeDegrees: ranged(
      value.maximumSlopeDegrees ?? DEFAULT_CHARACTER_GAME_CONFIG.maximumSlopeDegrees,
      0,
      89,
      "maximumSlopeDegrees"
    ),
    respawnBelow: finite(
      value.respawnBelow ?? DEFAULT_CHARACTER_GAME_CONFIG.respawnBelow,
      "respawnBelow"
    )
  });
  normalizedConfigs.add(normalized);
  return normalized;
}

export function createCharacterPhysicsState({
  pivot,
  bounds,
  bodyFrame = null,
  config = DEFAULT_CHARACTER_GAME_CONFIG
} = {}) {
  const normalizedConfig = normalizeCharacterGameConfig(config);
  const position = vector3(pivot, "character.pivot");
  const body = normalizeCharacterBodyFrame({
    pivot: position,
    bounds,
    bodyFrame,
    horizontalScale: normalizedConfig.colliderHorizontalScale
  });
  return {
    position: [...position],
    spawnPosition: [...position],
    velocity: [0, 0, 0],
    yaw: body.baseYaw,
    facingYaw: body.baseYaw,
    baseYaw: body.baseYaw,
    grounded: false,
    contacts: [],
    coyoteRemaining: 0,
    animationState: "fall",
    centerOffset: [...body.centerOffset],
    halfExtents: body.halfExtents.map(value => Math.max(value, 0.025)),
    distanceTravelled: 0,
    respawns: 0
  };
}

export function stepCharacterPhysics(
  state,
  input,
  colliders,
  rawConfig,
  deltaSeconds
) {
  validatePhysicsState(state);
  const config = normalizeCharacterGameConfig(rawConfig);
  const world = normalizeCollisionWorld(colliders);
  const dt = ranged(deltaSeconds, 0, 0.25, "deltaSeconds");
  if (dt <= EPSILON) return state;
  state.contacts = [];
  const recoveredGround = resolvePenetrations(state, world, config);
  if (recoveredGround || isGrounded(state, world, config)) {
    state.grounded = true;
    if (state.velocity[1] < 0) state.velocity[1] = 0;
  }
  const controls = normalizeMovementInput(input);

  const length = Math.hypot(controls.worldX, controls.worldZ);
  const directionX = length > 1 ? controls.worldX / length : controls.worldX;
  const directionZ = length > 1 ? controls.worldZ / length : controls.worldZ;
  const speed = config.walkSpeed * (controls.sprint ? config.sprintMultiplier : 1);
  const targetX = directionX * speed;
  const targetZ = directionZ * speed;
  const acceleration = state.grounded
    ? config.groundAcceleration
    : config.airAcceleration;

  if (length > EPSILON) {
    state.velocity[0] = approach(state.velocity[0], targetX, acceleration * dt);
    state.velocity[2] = approach(state.velocity[2], targetZ, acceleration * dt);
    const targetYaw = Math.atan2(-directionZ, directionX);
    state.facingYaw = approachAngle(
      state.facingYaw ?? state.yaw,
      targetYaw,
      12 * dt
    );
    const previousYaw = state.yaw;
    state.yaw = state.facingYaw;
    if (worldIntersectsCharacterBody(
      movementCollisionBody(state, 0, config),
      world
    )) state.yaw = previousYaw;
  } else if (state.grounded) {
    state.velocity[0] = approach(state.velocity[0], 0, config.groundFriction * dt);
    state.velocity[2] = approach(state.velocity[2], 0, config.groundFriction * dt);
  }

  state.coyoteRemaining = state.grounded
    ? config.coyoteSeconds
    : Math.max(0, state.coyoteRemaining - dt);
  if (controls.jump && (state.grounded || state.coyoteRemaining > 0)) {
    state.velocity[1] = config.jumpSpeed;
    state.grounded = false;
    state.coyoteRemaining = 0;
  }
  state.velocity[1] -= config.gravity * dt;

  const before = [...state.position];
  const canFollowGround = state.grounded && state.velocity[1] <= 0;
  moveHorizontalAxis(
    state, world, config, 0, state.velocity[0] * dt, canFollowGround
  );
  moveHorizontalAxis(
    state, world, config, 2, state.velocity[2] * dt, canFollowGround
  );
  if (canFollowGround && followGroundSurface(state, world, config)) {
    state.velocity[1] = 0;
  }
  moveVertical(state, world, config, state.velocity[1] * dt);
  if (state.grounded && !state.contacts.some(contact => contact.kind === "support")) {
    recordAxisContacts(
      state,
      world,
      supportProbeBody(state, config),
      1,
      1,
      "support"
    );
  }

  if (state.position[1] < config.respawnBelow) {
    state.position = [...state.spawnPosition];
    state.velocity = [0, 0, 0];
    state.grounded = false;
    state.coyoteRemaining = 0;
    state.respawns += 1;
  }

  const horizontalDistance = Math.hypot(
    state.position[0] - before[0],
    state.position[2] - before[2]
  );
  state.distanceTravelled += horizontalDistance;
  state.animationState = !state.grounded
    ? state.velocity[1] > 0.05 ? "jump" : "fall"
    : horizontalDistance / dt > 0.08 ? "walk" : "idle";
  return state;
}

export function characterWorldBounds(state) {
  validatePhysicsState(state);
  return characterBodyWorldBounds(state);
}

function resolvePenetrations(state, colliders, config) {
  if (!worldIntersectsCharacterBody(mutableCharacterBody(state), colliders)) {
    return false;
  }
  let grounded = false;
  for (let iteration = 0; iteration < 4; iteration += 1) {
    const body = mutableCharacterBody(state);
    if (!worldIntersectsCharacterBody(body, colliders)) break;
    let resolution = null;
    for (const axis of [0, 1, 2]) {
      for (const sign of [-1, 1]) {
        const distance = separationDistance(state, colliders, axis, sign);
        if (distance === null) continue;
        if (!resolution || distance < resolution.distance) {
          resolution = { axis, sign, distance };
        }
      }
    }
    if (!resolution) break;
    recordAxisContacts(
      state,
      colliders,
      body,
      resolution.axis,
      resolution.sign,
      "penetration"
    );
    const delta = resolution.sign * (resolution.distance + config.collisionSkin);
    state.position[resolution.axis] += delta;
    state.velocity[resolution.axis] = 0;
    if (resolution.axis === 1 && delta > 0) grounded = true;
  }
  return grounded;
}

function separationDistance(state, colliders, axis, sign) {
  const original = state.position[axis];
  const extent = Math.max(0.05, characterBodyWorldHalfExtents(state)[axis] * 0.5);
  let low = 0;
  let high = extent;
  let separated = false;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    state.position[axis] = original + sign * high;
    if (!worldIntersectsCharacterBody(mutableCharacterBody(state), colliders)) {
      separated = true;
      break;
    }
    low = high;
    high *= 2;
  }
  if (!separated) {
    state.position[axis] = original;
    return null;
  }
  for (let iteration = 0; iteration < 16; iteration += 1) {
    const middle = (low + high) * 0.5;
    state.position[axis] = original + sign * middle;
    if (worldIntersectsCharacterBody(mutableCharacterBody(state), colliders)) {
      low = middle;
    } else {
      high = middle;
    }
  }
  state.position[axis] = original;
  return high;
}

function moveHorizontalAxis(
  state,
  colliders,
  config,
  axis,
  displacement,
  canStep = false
) {
  const before = [...state.position];
  const allowed = moveAxis(state, colliders, config, axis, displacement);
  if (Math.abs(allowed - displacement) <= EPSILON) return;
  const safePosition = [...state.position];
  if (canStep && config.stepHeight > EPSILON) {
    state.position = [...before];
    state.position[1] += config.stepHeight + config.collisionSkin;
    if (!worldIntersectsCharacterBody(mutableCharacterBody(state), colliders)) {
      const stepped = moveAxis(state, colliders, config, axis, displacement);
      const improved = Math.abs(stepped) > Math.abs(allowed) + EPSILON;
      if (improved && followGroundSurface(
        state,
        colliders,
        config,
        config.stepHeight + config.groundSnapDistance
      )) return;
    }
    state.position = safePosition;
  }
  state.velocity[axis] = 0;
}

function moveVertical(state, colliders, config, displacement) {
  const allowed = moveAxis(state, colliders, config, 1, displacement);
  if (Math.abs(allowed - displacement) > EPSILON) state.velocity[1] = 0;
  const blockedDownward = displacement < 0 && allowed > displacement + EPSILON;
  state.grounded = blockedDownward || isGrounded(state, colliders, config);
  if (state.grounded && state.velocity[1] < 0) state.velocity[1] = 0;
}

function moveAxis(state, colliders, config, axis, displacement) {
  if (Math.abs(displacement) <= EPSILON) return 0;
  const original = state.position[axis];
  const maxStep = Math.max(
    0.02,
    Math.min(0.1, characterBodyWorldHalfExtents(state)[axis] * 0.5)
  );
  const steps = Math.max(1, Math.ceil(Math.abs(displacement) / maxStep));
  const increment = displacement / steps;
  let moved = 0;
  for (let step = 0; step < steps; step += 1) {
    const from = moved;
    const to = moved + increment;
    state.position[axis] = original + to;
    if (!worldIntersectsCharacterBody(
      movementCollisionBody(state, axis, config),
      colliders,
      axis === 1 ? config.collisionSkin : 0
    )) {
      moved = to;
      continue;
    }
    recordAxisContacts(
      state,
      colliders,
      movementCollisionBody(state, axis, config),
      axis,
      displacement > 0 ? -1 : 1,
      "blocked"
    );
    let safe = from;
    let blocked = to;
    for (let iteration = 0; iteration < 16; iteration += 1) {
      const middle = (safe + blocked) * 0.5;
      state.position[axis] = original + middle;
      if (worldIntersectsCharacterBody(
        movementCollisionBody(state, axis, config),
        colliders,
        axis === 1 ? config.collisionSkin : 0
      )) {
        blocked = middle;
      } else {
        safe = middle;
      }
    }
    moved = safe;
    break;
  }
  state.position[axis] = original + moved;
  return moved;
}

function isGrounded(state, colliders, config) {
  return worldIntersectsCharacterBody(
    supportProbeBody(state, config), colliders, 0
  );
}

function followGroundSurface(
  state,
  colliders,
  config,
  maximumDrop = config.groundSnapDistance
) {
  const body = mutableCharacterBody(state);
  const foot = body.center[1] - body.halfExtents[1];
  const insetX = body.halfExtents[0];
  const insetZ = body.halfExtents[2];
  const offsets = [
    [0, 0],
    [-insetX, -insetZ],
    [-insetX, insetZ],
    [insetX, -insetZ],
    [insetX, insetZ]
  ];
  const rise = config.stepHeight + config.collisionSkin * 2;
  const minimumNormalY = Math.cos(config.maximumSlopeDegrees * Math.PI / 180);
  let surface = null;
  for (const [localX, localZ] of offsets) {
    const x = body.center[0] +
      body.axes[0][0] * localX + body.axes[2][0] * localZ;
    const z = body.center[2] +
      body.axes[0][2] * localX + body.axes[2][2] * localZ;
    const hit = castCollisionSegment(
      [x, foot + rise, z],
      [x, foot - maximumDrop, z],
      colliders
    );
    if (!hit || hit.normal[1] < minimumNormalY) continue;
    if (!surface || hit.point[1] > surface.point[1]) surface = hit;
  }
  if (!surface) return false;
  const adjustment = surface.point[1] - foot + config.collisionSkin;
  if (adjustment > config.stepHeight + config.collisionSkin * 3 ||
      adjustment < -maximumDrop - config.collisionSkin) return false;
  state.position[1] += adjustment;
  state.grounded = true;
  recordSurfaceContact(state, surface);
  return true;
}

function recordSurfaceContact(state, hit) {
  const key = `${hit.colliderId}:surface:support`;
  if (state.contacts.some(contact => contact.key === key)) return;
  state.contacts.push(Object.freeze({
    key,
    colliderId: hit.colliderId,
    kind: "support",
    axis: 1,
    point: Object.freeze([...hit.point]),
    normal: Object.freeze([...hit.normal])
  }));
}

function recordAxisContacts(state, colliders, probeBounds, axis, normalSign, kind) {
  const body = mutableCharacterBounds(state);
  const point = body.min.map(
    (value, currentAxis) => (value + body.max[currentAxis]) * 0.5
  );
  point[axis] = normalSign > 0 ? body.min[axis] : body.max[axis];
  const normal = [0, 0, 0];
  normal[axis] = normalSign;
  for (const collider of queryCharacterBodyOverlaps(probeBounds, colliders)) {
    const key = `${collider.id}:${axis}:${normalSign}:${kind}`;
    if (state.contacts.some(contact => contact.key === key)) continue;
    state.contacts.push(Object.freeze({
      key,
      colliderId: collider.id,
      kind,
      axis,
      point: Object.freeze([...point]),
      normal: Object.freeze([...normal])
    }));
  }
}

function supportProbeBody(state, config) {
  const body = mutableCharacterBody(state);
  const foot = body.center[1] - body.halfExtents[1];
  const horizontalInset = Math.max(config.collisionSkin * 2, 1e-5);
  body.halfExtents[0] = Math.max(1e-5, body.halfExtents[0] - horizontalInset);
  body.halfExtents[2] = Math.max(1e-5, body.halfExtents[2] - horizontalInset);
  const top = foot + Math.max(config.collisionSkin, 1e-5);
  const bottom = foot - config.groundProbe;
  body.center[1] = (top + bottom) * 0.5;
  body.halfExtents[1] = (top - bottom) * 0.5;
  return body;
}

function movementCollisionBody(state, axis, config) {
  const body = mutableCharacterBody(state);
  const inset = Math.max(config.collisionSkin, 1e-6);
  if (axis === 0 || axis === 2) {
    body.halfExtents[1] = Math.max(1e-5, body.halfExtents[1] - inset);
  } else if (axis === 1) {
    body.halfExtents[0] = Math.max(1e-5, body.halfExtents[0] - inset);
    body.halfExtents[2] = Math.max(1e-5, body.halfExtents[2] - inset);
  }
  return body;
}

function mutableCharacterBody(state) {
  const body = characterBodyWorldObb(state);
  return {
    center: [...body.center],
    halfExtents: [...body.halfExtents],
    axes: body.axes.map(axis => [...axis])
  };
}

function mutableCharacterBounds(state) {
  const bounds = characterBodyWorldBounds(state);
  return { min: [...bounds.min], max: [...bounds.max] };
}

function overlapsAxes(left, right, movingAxis, skin) {
  for (let axis = 0; axis < 3; axis += 1) {
    if (axis === movingAxis) continue;
    const tolerance = axis === 1 ? skin : 0;
    if (
      left.max[axis] <= right.min[axis] + tolerance ||
      left.min[axis] >= right.max[axis] - tolerance
    ) return false;
  }
  return true;
}

function overlapsHorizontalAfterMove(left, right) {
  return left.max[0] > right.min[0] + EPSILON &&
    left.min[0] < right.max[0] - EPSILON &&
    left.max[2] > right.min[2] + EPSILON &&
    left.min[2] < right.max[2] - EPSILON;
}

function overlapsVolume(left, right) {
  return [0, 1, 2].every(axis =>
    left.max[axis] > right.min[axis] + EPSILON &&
    left.min[axis] < right.max[axis] - EPSILON
  );
}

function normalizeMovementInput(source = {}) {
  return {
    // Camera-relative basis vectors are combined before this layer.
    // Diagonal input can therefore produce components outside [-1, 1]
    // even though the logical controls themselves are normalized. Accept
    // any finite vector here; stepCharacterPhysics normalizes its length.
    worldX: finite(source.worldX ?? 0, "input.worldX"),
    worldZ: finite(source.worldZ ?? 0, "input.worldZ"),
    jump: Boolean(source.jump),
    sprint: Boolean(source.sprint)
  };
}

function validatePhysicsState(state) {
  if (!state || typeof state !== "object") {
    throw new TypeError("Character physics state is required.");
  }
  for (const key of ["position", "velocity", "centerOffset", "halfExtents"]) {
    vector3(state[key], `state.${key}`);
  }
  finite(state.baseYaw ?? 0, "state.baseYaw");
  finite(state.yaw ?? 0, "state.yaw");
  finite(state.facingYaw ?? state.yaw ?? 0, "state.facingYaw");
}

function vector3(value, label) {
  if (!Array.isArray(value) || value.length !== 3) {
    throw new TypeError(`${label} must contain three numbers.`);
  }
  return value.map(component => finite(component, label));
}

function approach(value, target, maximumDelta) {
  if (value < target) return Math.min(value + maximumDelta, target);
  if (value > target) return Math.max(value - maximumDelta, target);
  return target;
}

function approachAngle(value, target, maximumDelta) {
  let difference = (target - value + Math.PI) % (Math.PI * 2) - Math.PI;
  if (difference < -Math.PI) difference += Math.PI * 2;
  return value + Math.max(-maximumDelta, Math.min(maximumDelta, difference));
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
  if (number < 0) throw new RangeError(`${label} cannot be negative.`);
  return number;
}

function ranged(value, minimum, maximum, label) {
  const number = finite(value, label);
  if (number < minimum || number > maximum) {
    throw new RangeError(`${label} must be between ${minimum} and ${maximum}.`);
  }
  return number;
}
