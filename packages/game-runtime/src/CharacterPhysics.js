import {
  normalizeCollisionWorld,
  worldIntersectsCharacterBounds
} from "./CollisionWorld.js?build=20260810-0054f";

export const DEFAULT_CHARACTER_GAME_CONFIG = Object.freeze({
  gravity: 18,
  walkSpeed: 4.5,
  sprintMultiplier: 1.65,
  groundAcceleration: 30,
  airAcceleration: 10,
  groundFriction: 24,
  jumpSpeed: 7.25,
  coyoteSeconds: 0.1,
  colliderHorizontalScale: 0.82,
  collisionSkin: 0.001,
  groundProbe: 0.035,
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
  config = DEFAULT_CHARACTER_GAME_CONFIG
} = {}) {
  const normalizedConfig = normalizeCharacterGameConfig(config);
  const normalizedBounds = normalizeBounds(bounds, "character.bounds");
  const position = vector3(pivot, "character.pivot");
  const center = normalizedBounds.min.map(
    (minimum, axis) => (minimum + normalizedBounds.max[axis]) * 0.5
  );
  const size = normalizedBounds.min.map(
    (minimum, axis) => normalizedBounds.max[axis] - minimum
  );
  const horizontalScale = normalizedConfig.colliderHorizontalScale;
  const halfExtents = [
    Math.max(size[0] * horizontalScale * 0.5, 0.025),
    Math.max(size[1] * 0.5, 0.025),
    Math.max(size[2] * horizontalScale * 0.5, 0.025)
  ];
  return {
    position: [...position],
    spawnPosition: [...position],
    velocity: [0, 0, 0],
    yaw: 0,
    grounded: false,
    coyoteRemaining: 0,
    animationState: "fall",
    centerOffset: center.map((value, axis) => value - position[axis]),
    halfExtents,
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
    const targetYaw = Math.atan2(directionX, -directionZ);
    state.yaw = approachAngle(state.yaw, targetYaw, 12 * dt);
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
  moveHorizontalAxis(state, world, config, 0, state.velocity[0] * dt);
  moveHorizontalAxis(state, world, config, 2, state.velocity[2] * dt);
  moveVertical(state, world, config, state.velocity[1] * dt);

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
  const center = state.position.map(
    (value, axis) => value + state.centerOffset[axis]
  );
  return Object.freeze({
    min: Object.freeze(center.map(
      (value, axis) => value - state.halfExtents[axis]
    )),
    max: Object.freeze(center.map(
      (value, axis) => value + state.halfExtents[axis]
    ))
  });
}

function resolvePenetrations(state, colliders, config) {
  if (!worldIntersectsCharacterBounds(mutableCharacterBounds(state), colliders)) {
    return false;
  }
  let grounded = false;
  for (let iteration = 0; iteration < 4; iteration += 1) {
    const body = mutableCharacterBounds(state);
    if (!worldIntersectsCharacterBounds(body, colliders)) break;
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
    const delta = resolution.sign * (resolution.distance + config.collisionSkin);
    state.position[resolution.axis] += delta;
    state.velocity[resolution.axis] = 0;
    if (resolution.axis === 1 && delta > 0) grounded = true;
  }
  return grounded;
}

function separationDistance(state, colliders, axis, sign) {
  const original = state.position[axis];
  const extent = Math.max(0.05, state.halfExtents[axis] * 0.5);
  let low = 0;
  let high = extent;
  let separated = false;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    state.position[axis] = original + sign * high;
    if (!worldIntersectsCharacterBounds(mutableCharacterBounds(state), colliders)) {
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
    if (worldIntersectsCharacterBounds(mutableCharacterBounds(state), colliders)) {
      low = middle;
    } else {
      high = middle;
    }
  }
  state.position[axis] = original;
  return high;
}

function moveHorizontalAxis(state, colliders, config, axis, displacement) {
  const allowed = moveAxis(state, colliders, config, axis, displacement);
  if (Math.abs(allowed - displacement) > EPSILON) state.velocity[axis] = 0;
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
  const maxStep = Math.max(0.02, Math.min(0.1, state.halfExtents[axis] * 0.5));
  const steps = Math.max(1, Math.ceil(Math.abs(displacement) / maxStep));
  const increment = displacement / steps;
  let moved = 0;
  for (let step = 0; step < steps; step += 1) {
    const from = moved;
    const to = moved + increment;
    state.position[axis] = original + to;
    if (!worldIntersectsCharacterBounds(
      movementCollisionBounds(state, axis, config),
      colliders,
      axis === 1 ? config.collisionSkin : 0
    )) {
      moved = to;
      continue;
    }
    let safe = from;
    let blocked = to;
    for (let iteration = 0; iteration < 16; iteration += 1) {
      const middle = (safe + blocked) * 0.5;
      state.position[axis] = original + middle;
      if (worldIntersectsCharacterBounds(
        movementCollisionBounds(state, axis, config),
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
  return worldIntersectsCharacterBounds(
    supportProbeBounds(state, config), colliders, 0
  );
}

function supportProbeBounds(state, config) {
  const bounds = mutableCharacterBounds(state);
  const foot = bounds.min[1];
  const horizontalInset = Math.max(config.collisionSkin * 2, 1e-5);
  for (const axis of [0, 2]) {
    if (bounds.max[axis] - bounds.min[axis] > horizontalInset * 2) {
      bounds.min[axis] += horizontalInset;
      bounds.max[axis] -= horizontalInset;
    }
  }
  bounds.min[1] = foot - config.groundProbe;
  bounds.max[1] = foot + Math.max(config.collisionSkin, 1e-5);
  return bounds;
}

function movementCollisionBounds(state, axis, config) {
  const bounds = mutableCharacterBounds(state);
  const inset = Math.max(config.collisionSkin, 1e-6);
  if (axis === 0 || axis === 2) {
    if (bounds.max[1] - bounds.min[1] > inset * 2) {
      bounds.min[1] += inset;
      bounds.max[1] -= inset;
    }
  } else if (axis === 1) {
    for (const horizontalAxis of [0, 2]) {
      if (bounds.max[horizontalAxis] - bounds.min[horizontalAxis] > inset * 2) {
        bounds.min[horizontalAxis] += inset;
        bounds.max[horizontalAxis] -= inset;
      }
    }
  }
  return bounds;
}

function mutableCharacterBounds(state) {
  const center = state.position.map(
    (value, axis) => value + state.centerOffset[axis]
  );
  return {
    min: center.map((value, axis) => value - state.halfExtents[axis]),
    max: center.map((value, axis) => value + state.halfExtents[axis])
  };
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
}

function normalizeBounds(source, label) {
  const min = vector3(source?.min, `${label}.min`);
  const max = vector3(source?.max, `${label}.max`);
  if (min.some((value, axis) => !(max[axis] > value))) {
    throw new RangeError(`${label} must have positive volume.`);
  }
  return Object.freeze({ min: Object.freeze(min), max: Object.freeze(max) });
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
