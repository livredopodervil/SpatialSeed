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
const normalizedWorlds = new WeakSet();

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

export function normalizeCollisionWorld(colliders = []) {
  if (!Array.isArray(colliders)) {
    throw new TypeError("Collision world must be a list.");
  }
  if (normalizedWorlds.has(colliders)) return colliders;
  const normalized = Object.freeze(colliders.map((entry, index) => Object.freeze({
    id: String(entry?.id ?? `collider-${index}`),
    bounds: normalizeBounds(entry?.bounds ?? entry, `colliders[${index}].bounds`)
  })));
  normalizedWorlds.add(normalized);
  return normalized;
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
  let grounded = false;
  for (let iteration = 0; iteration < 4; iteration += 1) {
    const body = mutableCharacterBounds(state);
    let resolution = null;
    for (const collider of colliders) {
      const box = collider.bounds;
      if (!overlapsVolume(body, box)) continue;
      const candidates = [
        { axis: 0, delta: box.max[0] - body.min[0] + config.collisionSkin },
        { axis: 0, delta: box.min[0] - body.max[0] - config.collisionSkin },
        { axis: 1, delta: box.max[1] - body.min[1] + config.collisionSkin },
        { axis: 1, delta: box.min[1] - body.max[1] - config.collisionSkin },
        { axis: 2, delta: box.max[2] - body.min[2] + config.collisionSkin },
        { axis: 2, delta: box.min[2] - body.max[2] - config.collisionSkin }
      ];
      const candidate = candidates.reduce(
        (best, value) =>
          !best || Math.abs(value.delta) < Math.abs(best.delta)
            ? value
            : best,
        null
      );
      if (!resolution ||
          Math.abs(candidate.delta) < Math.abs(resolution.delta)) {
        resolution = candidate;
      }
    }
    if (!resolution) break;
    state.position[resolution.axis] += resolution.delta;
    state.velocity[resolution.axis] = 0;
    if (resolution.axis === 1 && resolution.delta > 0) grounded = true;
  }
  return grounded;
}

function moveHorizontalAxis(state, colliders, config, axis, displacement) {
  if (Math.abs(displacement) <= EPSILON) return;
  const current = mutableCharacterBounds(state);
  let allowed = displacement;
  for (const collider of colliders) {
    const box = collider.bounds;
    if (!overlapsAxes(current, box, axis, config.collisionSkin)) continue;
    if (displacement > 0 && current.max[axis] <= box.min[axis] + config.collisionSkin) {
      const gap = box.min[axis] - current.max[axis];
      if (gap < allowed) allowed = Math.max(0, gap - config.collisionSkin);
    } else if (
      displacement < 0 &&
      current.min[axis] >= box.max[axis] - config.collisionSkin
    ) {
      const gap = box.max[axis] - current.min[axis];
      if (gap > allowed) allowed = Math.min(0, gap + config.collisionSkin);
    }
  }
  state.position[axis] += allowed;
  if (Math.abs(allowed - displacement) > EPSILON) state.velocity[axis] = 0;
}

function moveVertical(state, colliders, config, displacement) {
  const axis = 1;
  const current = mutableCharacterBounds(state);
  let allowed = displacement;
  let grounded = false;
  for (const collider of colliders) {
    const box = collider.bounds;
    if (!overlapsHorizontalAfterMove(current, box)) continue;
    if (displacement <= 0 && current.min[axis] >= box.max[axis] - config.collisionSkin) {
      const gap = box.max[axis] - current.min[axis];
      if (gap >= allowed - config.collisionSkin) {
        allowed = Math.max(allowed, gap);
        if (current.min[axis] + displacement <= box.max[axis] + config.collisionSkin) {
          grounded = true;
        }
      }
    } else if (
      displacement > 0 &&
      current.max[axis] <= box.min[axis] + config.collisionSkin
    ) {
      const gap = box.min[axis] - current.max[axis];
      if (gap <= allowed + config.collisionSkin) {
        allowed = Math.min(allowed, gap);
      }
    }
  }
  state.position[axis] += allowed;
  if (Math.abs(allowed - displacement) > EPSILON) state.velocity[axis] = 0;
  state.grounded = grounded || isGrounded(state, colliders, config);
  if (state.grounded && state.velocity[1] < 0) state.velocity[1] = 0;
}

function isGrounded(state, colliders, config) {
  const body = mutableCharacterBounds(state);
  for (const collider of colliders) {
    const box = collider.bounds;
    if (!overlapsHorizontalAfterMove(body, box)) continue;
    const gap = body.min[1] - box.max[1];
    if (gap >= -config.collisionSkin && gap <= config.groundProbe) return true;
  }
  return false;
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
    worldX: ranged(source.worldX ?? 0, -1, 1, "input.worldX"),
    worldZ: ranged(source.worldZ ?? 0, -1, 1, "input.worldZ"),
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
