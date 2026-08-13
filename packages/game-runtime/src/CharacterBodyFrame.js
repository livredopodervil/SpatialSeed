export const CHARACTER_BODY_FRAME_VERSION = "character-body-frame-v1-oriented-aabb";

const EPSILON = 1e-9;

export function normalizeCharacterBodyFrame({
  pivot,
  bounds = null,
  bodyFrame = null,
  horizontalScale = 1
} = {}) {
  const origin = vector3(pivot, "character.pivot");
  const horizontal = positive(horizontalScale, "horizontalScale");
  if (bodyFrame && typeof bodyFrame === "object") {
    const halfExtents = vector3(bodyFrame.halfExtents, "character.bodyFrame.halfExtents")
      .map((value, axis) => positive(value, `character.bodyFrame.halfExtents[${axis}]`));
    halfExtents[0] *= horizontal;
    halfExtents[2] *= horizontal;
    return Object.freeze({
      centerOffset: Object.freeze(vector3(
        bodyFrame.centerOffset ?? [0, 0, 0],
        "character.bodyFrame.centerOffset"
      )),
      halfExtents: Object.freeze(halfExtents),
      baseYaw: finite(bodyFrame.baseYaw ?? 0, "character.bodyFrame.baseYaw")
    });
  }

  const normalized = normalizeBounds(bounds, "character.bounds");
  const center = normalized.min.map(
    (minimum, axis) => (minimum + normalized.max[axis]) * 0.5
  );
  const halfExtents = normalized.min.map(
    (minimum, axis) => (normalized.max[axis] - minimum) * 0.5
  );
  halfExtents[0] *= horizontal;
  halfExtents[2] *= horizontal;
  return Object.freeze({
    centerOffset: Object.freeze(center.map((value, axis) => value - origin[axis])),
    halfExtents: Object.freeze(halfExtents),
    baseYaw: 0
  });
}

export function characterBodyWorldCenter(state) {
  const offset = rotateY(state.centerOffset, state.yaw);
  return Object.freeze(state.position.map(
    (value, axis) => value + offset[axis]
  ));
}

export function characterBodyWorldHalfExtents(state) {
  const [halfX, halfY, halfZ] = state.halfExtents;
  const cosine = Math.cos(state.yaw);
  const sine = Math.sin(state.yaw);
  return Object.freeze([
    Math.abs(cosine) * halfX + Math.abs(sine) * halfZ,
    halfY,
    Math.abs(sine) * halfX + Math.abs(cosine) * halfZ
  ]);
}

export function characterBodyWorldBounds(state) {
  const center = characterBodyWorldCenter(state);
  const halfExtents = characterBodyWorldHalfExtents(state);
  return Object.freeze({
    min: Object.freeze(center.map((value, axis) => value - halfExtents[axis])),
    max: Object.freeze(center.map((value, axis) => value + halfExtents[axis]))
  });
}

export function characterBodyHorizontalSupport(state, directionX, directionZ) {
  const length = Math.hypot(directionX, directionZ);
  if (length <= EPSILON) return 0;
  const dx = directionX / length;
  const dz = directionZ / length;
  const cosine = Math.cos(state.yaw);
  const sine = Math.sin(state.yaw);
  const localXDot = dx * cosine - dz * sine;
  const localZDot = dx * sine + dz * cosine;
  return Math.abs(localXDot) * state.halfExtents[0] +
    Math.abs(localZDot) * state.halfExtents[2];
}

function rotateY(vector, yaw) {
  const cosine = Math.cos(yaw);
  const sine = Math.sin(yaw);
  return [
    cosine * vector[0] + sine * vector[2],
    vector[1],
    -sine * vector[0] + cosine * vector[2]
  ];
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

function positive(value, label) {
  const number = finite(value, label);
  if (!(number > 0)) throw new RangeError(`${label} must be positive.`);
  return number;
}

function finite(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new TypeError(`${label} must be finite.`);
  return number;
}
