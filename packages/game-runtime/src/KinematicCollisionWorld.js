import {
  invertAffineMatrix,
  multiplyMatrices
} from "../../math-affine/src/index.js?build=20260818-0054my";
import {
  normalizeCollisionWorld
} from "./CollisionWorld.js?build=20260818-0054my";

export const KINEMATIC_COLLISION_WORLD_VERSION =
  "kinematic-collision-world-v1-moving-support";

const EPSILON = 1e-9;

/**
 * Replaces only the owners whose current pose is supplied by the animation
 * projection. Static colliders remain shared with the base collision world.
 */
export function mergeKinematicCollisionWorld(baseColliders, frame = {}) {
  const base = normalizeCollisionWorld(baseColliders);
  const dynamic = normalizeCollisionWorld(frame?.colliders ?? []);
  const activeOwnerIds = new Set(
    (frame?.activeOwnerIds ?? []).map(value => String(value)).filter(Boolean)
  );
  const merged = [
    ...base.filter(entry => !activeOwnerIds.has(entry.ownerId)),
    ...dynamic
  ];
  const ids = new Set();
  for (const entry of merged) {
    if (ids.has(entry.id)) {
      throw new Error(`Colisor cinemático duplicado: ${entry.id}.`);
    }
    ids.add(entry.id);
  }
  return normalizeCollisionWorld(merged);
}

/**
 * Carries a grounded character by the affine delta of its support collider.
 * The character remains upright; only the horizontal yaw component is inherited.
 * Velocity is intentionally unchanged because support motion is not locomotion.
 */
export function applyKinematicSupportMotion(
  state,
  previousColliders,
  nextColliders
) {
  const colliderId = String(state?.supportColliderId ?? "").trim();
  if (!colliderId || !state?.grounded) return unchanged(colliderId || null);
  const previous = collisionById(previousColliders, colliderId);
  const next = collisionById(nextColliders, colliderId);
  if (!previous || !next) return unchanged(colliderId);
  const previousMatrix = collisionPoseMatrix(previous);
  const nextMatrix = collisionPoseMatrix(next);
  if (matricesEqual(previousMatrix, nextMatrix)) return unchanged(colliderId);

  let deltaMatrix;
  try {
    deltaMatrix = multiplyMatrices(
      nextMatrix,
      invertAffineMatrix(previousMatrix)
    );
  } catch {
    return unchanged(colliderId);
  }
  const before = vector3(state.position, "state.position");
  const after = transformPoint(deltaMatrix, before);
  const displacement = after.map((value, axis) => value - before[axis]);
  if (![...after, ...displacement].every(Number.isFinite)) {
    return unchanged(colliderId);
  }
  const yawDelta = horizontalYaw(deltaMatrix);
  const previousYaw = Number(state.yaw ?? 0);
  const previousFacingYaw = Number(state.facingYaw ?? previousYaw);
  state.position = after;
  if (Number.isFinite(yawDelta) && Math.abs(yawDelta) > EPSILON) {
    state.yaw = normalizeAngle(previousYaw + yawDelta);
    state.facingYaw = normalizeAngle(previousFacingYaw + yawDelta);
  }
  return Object.freeze({
    changed: displacement.some(value => Math.abs(value) > EPSILON) ||
      Math.abs(yawDelta) > EPSILON,
    colliderId,
    displacement: Object.freeze(displacement),
    yawDelta,
    deltaMatrix: Object.freeze(deltaMatrix)
  });
}

export function collisionPoseMatrix(rawEntry) {
  const entry = normalizeCollisionWorld([rawEntry])[0];
  const collider = entry.collider;
  if (collider.type === "local-box") return collider.worldMatrix;
  if (collider.type === "triangle-mesh") {
    return collider.parts[0]?.matrix ?? translationFromBounds(entry.broadBounds);
  }
  if (collider.type === "sphere") {
    return translationMatrix(collider.center);
  }
  return translationFromBounds(entry.broadBounds);
}

function collisionById(colliders, id) {
  return normalizeCollisionWorld(colliders).find(entry => entry.id === id) ?? null;
}

function horizontalYaw(matrix) {
  const length = Math.hypot(matrix[0], matrix[2]);
  return length <= EPSILON ? 0 : Math.atan2(-matrix[2], matrix[0]);
}

function transformPoint(matrix, point) {
  const [x, y, z] = point;
  const w = matrix[3] * x + matrix[7] * y + matrix[11] * z + matrix[15];
  const denominator = Math.abs(w) > EPSILON ? w : 1;
  return [
    (matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12]) / denominator,
    (matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13]) / denominator,
    (matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14]) / denominator
  ];
}

function translationFromBounds(bounds) {
  return translationMatrix(bounds.min.map(
    (value, axis) => (value + bounds.max[axis]) * 0.5
  ));
}

function translationMatrix([x, y, z]) {
  return Object.freeze([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    x, y, z, 1
  ]);
}

function matricesEqual(left, right) {
  return left.every((value, index) => Math.abs(value - right[index]) <= EPSILON);
}

function unchanged(colliderId) {
  return Object.freeze({
    changed: false,
    colliderId,
    displacement: Object.freeze([0, 0, 0]),
    yawDelta: 0,
    deltaMatrix: null
  });
}

function vector3(value, label) {
  if (!Array.isArray(value) || value.length !== 3) {
    throw new TypeError(`${label} deve conter três números.`);
  }
  return value.map(component => {
    const number = Number(component);
    if (!Number.isFinite(number)) {
      throw new TypeError(`${label} deve conter somente números finitos.`);
    }
    return number;
  });
}

function normalizeAngle(value) {
  let result = (value + Math.PI) % (Math.PI * 2) - Math.PI;
  if (result < -Math.PI) result += Math.PI * 2;
  return result;
}
