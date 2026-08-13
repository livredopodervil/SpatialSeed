import {
  invertAffineMatrix
} from "../../math-affine/src/index.js?build=20260812-0054l";

const EPSILON = 1e-9;
const MIN_BROAD_HALF_THICKNESS = 1e-6;
const normalizedWorlds = new WeakSet();

/**
 * CollisionWorld v3
 *
 * Contract:
 * - broadBounds are world-space AABBs used only for broad phase.
 * - local-box is reserved for actual boxes.
 * - sphere is reserved for actual spheres under rigid/uniform-scale transforms.
 * - triangle-mesh represents the final tessellated render geometry for every
 *   other solid. Its parts keep local triangles plus a local->world matrix.
 *
 * This module deliberately has no Three.js/renderer dependency. A BVH can
 * later replace the linear triangle walk without changing CharacterPhysics or
 * GameRuntime.
 */
export const COLLISION_WORLD_VERSION = "game-collision-world-v3-final-mesh";

export function normalizeCollisionWorld(colliders = []) {
  if (!Array.isArray(colliders)) {
    throw new TypeError("Collision world must be a list.");
  }
  if (normalizedWorlds.has(colliders)) return colliders;
  const normalized = Object.freeze(colliders.map((entry, index) =>
    normalizeCollider(entry, index)
  ));
  normalizedWorlds.add(normalized);
  return normalized;
}

export function intersectsCharacterBounds(bounds, collider, skin = 0) {
  const body = normalizeBounds(bounds, "character.bounds");
  const normalized = normalizeCollider(collider, 0);
  const padding = nonNegative(skin, "skin");
  if (!aabbOverlap(body, normalized.broadBounds, padding)) return false;
  switch (normalized.collider.type) {
    case "local-box":
      return intersectsAabbLocalBox(body, normalized.collider, padding);
    case "sphere":
      return intersectsAabbSphere(body, normalized.collider, padding);
    case "triangle-mesh":
      return intersectsAabbTriangleMesh(body, normalized.collider, padding);
    default:
      return false;
  }
}

export function worldIntersectsCharacterBounds(bounds, colliders, skin = 0) {
  const world = normalizeCollisionWorld(colliders);
  for (const collider of world) {
    if (intersectsCharacterBounds(bounds, collider, skin)) return true;
  }
  return false;
}


export function castCollisionSegment(start, end, colliders, { margin = 0 } = {}) {
  const from = vector3(start, "segment.start");
  const to = vector3(end, "segment.end");
  const padding = nonNegative(margin, "segment.margin");
  const delta = subtract(to, from);
  const length = Math.hypot(...delta);
  if (length <= EPSILON) return null;
  const world = normalizeCollisionWorld(colliders);
  let nearest = null;
  for (const entry of world) {
    const broad = expandedBounds(entry.broadBounds, padding);
    if (segmentAabbFraction(from, to, broad) === null) continue;
    const fraction = segmentColliderFraction(from, to, entry.collider);
    if (fraction === null || fraction < -EPSILON || fraction > 1 + EPSILON) continue;
    const clamped = Math.max(0, Math.min(1, fraction));
    if (nearest && clamped >= nearest.fraction) continue;
    nearest = Object.freeze({
      colliderId: entry.id,
      fraction: clamped,
      distance: length * clamped,
      point: Object.freeze(from.map((value, axis) => value + delta[axis] * clamped))
    });
  }
  return nearest;
}

function segmentColliderFraction(start, end, collider) {
  switch (collider.type) {
    case "local-box":
      return segmentLocalBoxFraction(start, end, collider);
    case "sphere":
      return segmentSphereFraction(start, end, collider);
    case "triangle-mesh":
      return segmentTriangleMeshFraction(start, end, collider);
    default:
      return null;
  }
}

function segmentLocalBoxFraction(start, end, box) {
  let inverse;
  try { inverse = invertAffineMatrix(box.worldMatrix); }
  catch { return null; }
  return segmentAabbFraction(
    transformPoint(inverse, start),
    transformPoint(inverse, end),
    box.localBounds
  );
}

function segmentSphereFraction(start, end, sphere) {
  const direction = subtract(end, start);
  const offset = subtract(start, sphere.center);
  const a = dot(direction, direction);
  const c = dot(offset, offset) - sphere.radius * sphere.radius;
  if (c <= 0) return 0;
  const b = 2 * dot(offset, direction);
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0 || a <= EPSILON) return null;
  const root = Math.sqrt(discriminant);
  const t0 = (-b - root) / (2 * a);
  const t1 = (-b + root) / (2 * a);
  if (t0 >= 0 && t0 <= 1) return t0;
  if (t1 >= 0 && t1 <= 1) return t1;
  return null;
}

function segmentTriangleMeshFraction(start, end, mesh) {
  let nearest = null;
  for (const part of mesh.parts) {
    if (segmentAabbFraction(start, end, part.broadBounds) === null) continue;
    const triangles = part.triangles;
    for (let offset = 0; offset < triangles.length; offset += 9) {
      const a = transformPoint(part.matrix, triangles.slice(offset, offset + 3));
      const b = transformPoint(part.matrix, triangles.slice(offset + 3, offset + 6));
      const c = transformPoint(part.matrix, triangles.slice(offset + 6, offset + 9));
      const fraction = segmentTriangleFraction(start, end, a, b, c);
      if (fraction === null) continue;
      if (nearest === null || fraction < nearest) nearest = fraction;
    }
  }
  return nearest;
}

function segmentTriangleFraction(start, end, a, b, c) {
  const direction = subtract(end, start);
  const edge1 = subtract(b, a);
  const edge2 = subtract(c, a);
  const p = cross(direction, edge2);
  const determinant = dot(edge1, p);
  if (Math.abs(determinant) <= EPSILON) return null;
  const inverse = 1 / determinant;
  const tvec = subtract(start, a);
  const u = dot(tvec, p) * inverse;
  if (u < -EPSILON || u > 1 + EPSILON) return null;
  const q = cross(tvec, edge1);
  const v = dot(direction, q) * inverse;
  if (v < -EPSILON || u + v > 1 + EPSILON) return null;
  const t = dot(edge2, q) * inverse;
  return t >= -EPSILON && t <= 1 + EPSILON ? t : null;
}

function segmentAabbFraction(start, end, bounds) {
  let minimum = 0;
  let maximum = 1;
  for (let axis = 0; axis < 3; axis += 1) {
    const delta = end[axis] - start[axis];
    if (Math.abs(delta) <= EPSILON) {
      if (start[axis] < bounds.min[axis] - EPSILON ||
          start[axis] > bounds.max[axis] + EPSILON) return null;
      continue;
    }
    let near = (bounds.min[axis] - start[axis]) / delta;
    let far = (bounds.max[axis] - start[axis]) / delta;
    if (near > far) [near, far] = [far, near];
    minimum = Math.max(minimum, near);
    maximum = Math.min(maximum, far);
    if (minimum > maximum + EPSILON) return null;
  }
  return minimum <= 1 + EPSILON && maximum >= -EPSILON
    ? Math.max(0, minimum)
    : null;
}

export function queryCharacterOverlaps(bounds, colliders, skin = 0) {
  const world = normalizeCollisionWorld(colliders);
  const hits = [];
  for (const collider of world) {
    if (intersectsCharacterBounds(bounds, collider, skin)) hits.push(collider);
  }
  return hits;
}

function normalizeCollider(entry, index) {
  if (entry?.__normalizedGameCollider === true) return entry;
  const id = String(entry?.id ?? `collider-${index}`);
  const legacyBounds = entry?.bounds ?? null;
  const broadBounds = normalizeBroadBounds(
    entry?.broadBounds ?? legacyBounds ?? entry,
    `colliders[${index}].broadBounds`
  );
  const source = entry?.collider;
  let collider;
  if (source?.type === "local-box") {
    collider = Object.freeze({
      type: "local-box",
      localBounds: normalizeBounds(
        source.localBounds,
        `colliders[${index}].collider.localBounds`
      ),
      worldMatrix: Object.freeze(matrix4(
        source.worldMatrix,
        `colliders[${index}].collider.worldMatrix`
      ))
    });
  } else if (source?.type === "sphere") {
    collider = Object.freeze({
      type: "sphere",
      center: Object.freeze(vector3(
        source.center,
        `colliders[${index}].collider.center`
      )),
      radius: positive(
        source.radius,
        `colliders[${index}].collider.radius`
      )
    });
  } else if (source?.type === "triangle-mesh") {
    collider = normalizeTriangleMesh(source, index);
  } else {
    // 0054a compatibility only. New renderer projections must explicitly
    // declare their narrow-phase shape.
    collider = Object.freeze({
      type: "local-box",
      localBounds: broadBounds,
      worldMatrix: IDENTITY_MATRIX
    });
  }
  return Object.freeze({
    __normalizedGameCollider: true,
    id,
    broadBounds,
    collider
  });
}

function normalizeTriangleMesh(source, index) {
  if (!Array.isArray(source.parts) || source.parts.length === 0) {
    throw new TypeError(
      `colliders[${index}].collider.parts must contain mesh parts.`
    );
  }
  const parts = source.parts.map((part, partIndex) => {
    const matrix = Object.freeze(matrix4(
      part?.worldMatrix,
      `colliders[${index}].collider.parts[${partIndex}].worldMatrix`
    ));
    const triangles = reusableNumberList(
      part?.triangles,
      `colliders[${index}].collider.parts[${partIndex}].triangles`
    );
    if (triangles.length % 9 !== 0) {
      throw new RangeError(
        `colliders[${index}].collider.parts[${partIndex}].triangles ` +
        "must contain complete triangles."
      );
    }
    const broadBounds = part?.broadBounds
      ? normalizeBroadBounds(
          part.broadBounds,
          `colliders[${index}].collider.parts[${partIndex}].broadBounds`
        )
      : boundsForTransformedTriangles(triangles, matrix);
    return Object.freeze({ matrix, triangles, broadBounds });
  });
  return Object.freeze({
    type: "triangle-mesh",
    parts: Object.freeze(parts)
  });
}

function intersectsAabbTriangleMesh(aabb, mesh, padding) {
  const expanded = expandedBounds(aabb, padding);
  for (const part of mesh.parts) {
    if (!aabbOverlap(expanded, part.broadBounds)) continue;
    const triangles = part.triangles;
    for (let offset = 0; offset < triangles.length; offset += 9) {
      const a = transformPoint(part.matrix, triangles.slice(offset, offset + 3));
      const b = transformPoint(part.matrix, triangles.slice(offset + 3, offset + 6));
      const c = transformPoint(part.matrix, triangles.slice(offset + 6, offset + 9));
      if (!triangleBroadOverlap(expanded, a, b, c)) continue;
      if (triangleIntersectsAabb(expanded, a, b, c)) return true;
    }
  }
  return false;
}

function boundsForTransformedTriangles(triangles, matrix) {
  const minimum = [Infinity, Infinity, Infinity];
  const maximum = [-Infinity, -Infinity, -Infinity];
  for (let offset = 0; offset < triangles.length; offset += 3) {
    const point = transformPoint(matrix, triangles.slice(offset, offset + 3));
    for (let axis = 0; axis < 3; axis += 1) {
      minimum[axis] = Math.min(minimum[axis], point[axis]);
      maximum[axis] = Math.max(maximum[axis], point[axis]);
    }
  }
  for (let axis = 0; axis < 3; axis += 1) {
    if (maximum[axis] - minimum[axis] <= EPSILON) {
      minimum[axis] -= MIN_BROAD_HALF_THICKNESS;
      maximum[axis] += MIN_BROAD_HALF_THICKNESS;
    }
  }
  return Object.freeze({
    min: Object.freeze(minimum),
    max: Object.freeze(maximum)
  });
}

function triangleBroadOverlap(box, a, b, c) {
  for (let axis = 0; axis < 3; axis += 1) {
    const minimum = Math.min(a[axis], b[axis], c[axis]);
    const maximum = Math.max(a[axis], b[axis], c[axis]);
    if (maximum < box.min[axis] - EPSILON ||
        minimum > box.max[axis] + EPSILON) return false;
  }
  return true;
}

function triangleIntersectsAabb(box, a, b, c) {
  const center = [0, 1, 2].map(axis =>
    (box.min[axis] + box.max[axis]) * 0.5
  );
  const half = [0, 1, 2].map(axis =>
    (box.max[axis] - box.min[axis]) * 0.5
  );
  const vertices = [a, b, c].map(point => subtract(point, center));
  const edges = [
    subtract(vertices[1], vertices[0]),
    subtract(vertices[2], vertices[1]),
    subtract(vertices[0], vertices[2])
  ];
  const axes = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
    cross(edges[0], edges[1])
  ];
  const worldAxes = axes.slice(0, 3);
  for (const edge of edges) {
    for (const worldAxis of worldAxes) axes.push(cross(edge, worldAxis));
  }
  for (const axis of axes) {
    if (dot(axis, axis) <= EPSILON * EPSILON) continue;
    if (separatedOnAxis(vertices, half, axis)) return false;
  }
  return true;
}

function separatedOnAxis(vertices, half, axis) {
  const projections = vertices.map(vertex => dot(vertex, axis));
  const radius = half[0] * Math.abs(axis[0]) +
    half[1] * Math.abs(axis[1]) + half[2] * Math.abs(axis[2]);
  return Math.min(...projections) > radius + EPSILON ||
    Math.max(...projections) < -radius - EPSILON;
}

function intersectsAabbSphere(aabb, sphere, padding) {
  let distanceSquared = 0;
  for (let axis = 0; axis < 3; axis += 1) {
    const minimum = aabb.min[axis] - padding;
    const maximum = aabb.max[axis] + padding;
    const value = sphere.center[axis];
    const nearest = Math.max(minimum, Math.min(maximum, value));
    const delta = value - nearest;
    distanceSquared += delta * delta;
  }
  const radius = sphere.radius + padding;
  return distanceSquared <= radius * radius + EPSILON;
}

function intersectsAabbLocalBox(aabb, localBox, padding) {
  const aCenter = [0, 1, 2].map(axis =>
    (aabb.min[axis] + aabb.max[axis]) * 0.5
  );
  const aHalf = [0, 1, 2].map(axis =>
    (aabb.max[axis] - aabb.min[axis]) * 0.5 + padding
  );
  const localCenter = [0, 1, 2].map(axis =>
    (localBox.localBounds.min[axis] + localBox.localBounds.max[axis]) * 0.5
  );
  const localHalf = [0, 1, 2].map(axis =>
    (localBox.localBounds.max[axis] - localBox.localBounds.min[axis]) * 0.5
  );
  const matrix = localBox.worldMatrix;
  const bCenter = transformPoint(matrix, localCenter);
  const columns = [
    [matrix[0], matrix[1], matrix[2]],
    [matrix[4], matrix[5], matrix[6]],
    [matrix[8], matrix[9], matrix[10]]
  ];
  const bAxes = [];
  const bHalf = [];
  for (let axis = 0; axis < 3; axis += 1) {
    const scale = Math.hypot(...columns[axis]);
    if (scale <= EPSILON) return false;
    bAxes.push(columns[axis].map(value => value / scale));
    bHalf.push(localHalf[axis] * scale + padding);
  }

  const translationWorld = bCenter.map((value, axis) => value - aCenter[axis]);
  const rotation = [0, 1, 2].map(aAxis =>
    [0, 1, 2].map(bAxis => bAxes[bAxis][aAxis])
  );
  const absolute = rotation.map(row => row.map(value => Math.abs(value) + 1e-12));

  for (let i = 0; i < 3; i += 1) {
    const rb = bHalf[0] * absolute[i][0] +
      bHalf[1] * absolute[i][1] + bHalf[2] * absolute[i][2];
    if (Math.abs(translationWorld[i]) > aHalf[i] + rb) return false;
  }

  const translationB = [0, 1, 2].map(j =>
    translationWorld[0] * rotation[0][j] +
    translationWorld[1] * rotation[1][j] +
    translationWorld[2] * rotation[2][j]
  );
  for (let j = 0; j < 3; j += 1) {
    const ra = aHalf[0] * absolute[0][j] +
      aHalf[1] * absolute[1][j] + aHalf[2] * absolute[2][j];
    if (Math.abs(translationB[j]) > ra + bHalf[j]) return false;
  }

  for (let i = 0; i < 3; i += 1) {
    const i1 = (i + 1) % 3;
    const i2 = (i + 2) % 3;
    for (let j = 0; j < 3; j += 1) {
      const j1 = (j + 1) % 3;
      const j2 = (j + 2) % 3;
      const ra = aHalf[i1] * absolute[i2][j] +
        aHalf[i2] * absolute[i1][j];
      const rb = bHalf[j1] * absolute[i][j2] +
        bHalf[j2] * absolute[i][j1];
      const separation = Math.abs(
        translationWorld[i2] * rotation[i1][j] -
        translationWorld[i1] * rotation[i2][j]
      );
      if (separation > ra + rb) return false;
    }
  }
  return true;
}

function expandedBounds(bounds, padding) {
  return {
    min: bounds.min.map(value => value - padding),
    max: bounds.max.map(value => value + padding)
  };
}

function aabbOverlap(left, right, padding = 0) {
  return [0, 1, 2].every(axis =>
    left.max[axis] + padding > right.min[axis] + EPSILON &&
    left.min[axis] - padding < right.max[axis] - EPSILON
  );
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

function subtract(left, right) {
  return [left[0] - right[0], left[1] - right[1], left[2] - right[2]];
}

function dot(left, right) {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function cross(left, right) {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0]
  ];
}

function normalizeBroadBounds(source, label) {
  const min = vector3(source?.min, `${label}.min`);
  const max = vector3(source?.max, `${label}.max`);
  for (let axis = 0; axis < 3; axis += 1) {
    if (max[axis] < min[axis]) {
      throw new RangeError(`${label} has inverted bounds.`);
    }
    if (max[axis] - min[axis] <= EPSILON) {
      const center = (min[axis] + max[axis]) * 0.5;
      min[axis] = center - MIN_BROAD_HALF_THICKNESS;
      max[axis] = center + MIN_BROAD_HALF_THICKNESS;
    }
  }
  return Object.freeze({ min: Object.freeze(min), max: Object.freeze(max) });
}

function normalizeBounds(source, label) {
  const min = vector3(source?.min, `${label}.min`);
  const max = vector3(source?.max, `${label}.max`);
  if (min.some((value, axis) => !(max[axis] > value))) {
    throw new RangeError(`${label} must have positive volume.`);
  }
  return Object.freeze({ min: Object.freeze(min), max: Object.freeze(max) });
}

function matrix4(value, label) {
  if (!Array.isArray(value) || value.length !== 16) {
    throw new TypeError(`${label} must contain sixteen numbers.`);
  }
  return value.map(component => finite(component, label));
}

function numberList(value, label) {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be a list.`);
  return value.map(component => finite(component, label));
}

function reusableNumberList(value, label) {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be a list.`);
  for (const component of value) finite(component, label);
  return Object.isFrozen(value) ? value : Object.freeze([...value]);
}

function vector3(value, label) {
  if (!Array.isArray(value) || value.length !== 3) {
    throw new TypeError(`${label} must contain three numbers.`);
  }
  return value.map(component => finite(component, label));
}

function finite(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new TypeError(`${label} must be finite.`);
  return number;
}

function positive(value, label) {
  const number = finite(value, label);
  if (number <= 0) throw new RangeError(`${label} must be positive.`);
  return number;
}

function nonNegative(value, label) {
  const number = finite(value, label);
  if (number < 0) throw new RangeError(`${label} cannot be negative.`);
  return number;
}

const IDENTITY_MATRIX = Object.freeze([
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1
]);
