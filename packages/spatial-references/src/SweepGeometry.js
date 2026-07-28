import * as THREE from "three";
import { rotationMinimizingFrames } from "./PathFrames.js";

export function createSweepGeometryDescriptor({
  pathPoints,
  profilePoints,
  segments = 32,
  closedPath = false,
  curveType = "centripetal",
  tension = 0.5,
  twistDegrees = 0,
  scaleStart = 1,
  scaleEnd = 1,
  caps = true,
  initialNormal = null
} = {}) {
  const profile = normalizeProfile(profilePoints);
  const frames = rotationMinimizingFrames({
    points: pathPoints,
    segments,
    closed: closedPath,
    curveType,
    tension,
    twistDegrees,
    initialNormal
  });
  const ringCount = frames.positions.length;
  const profileCount = profile.length;
  const origin = [...frames.positions[0]];
  const positions = [];
  const uvs = [];
  const perimeter = profilePerimeterCoordinates(profile);
  for (let ring = 0; ring < ringCount; ring += 1) {
    const progress = closedPath ? ring / ringCount : ring / (ringCount - 1);
    const scale = THREE.MathUtils.lerp(
      finiteNonZero(scaleStart, "scaleStart"),
      finiteNonZero(scaleEnd, "scaleEnd"),
      progress
    );
    const center = new THREE.Vector3().fromArray(frames.positions[ring]);
    const normal = new THREE.Vector3().fromArray(frames.normals[ring]);
    const binormal = new THREE.Vector3().fromArray(frames.binormals[ring]);
    for (let profileIndex = 0; profileIndex < profileCount; profileIndex += 1) {
      const [x, y] = profile[profileIndex];
      const point = center.clone()
        .addScaledVector(normal, x * scale)
        .addScaledVector(binormal, y * scale);
      positions.push([
        point.x - origin[0],
        point.y - origin[1],
        point.z - origin[2]
      ]);
      uvs.push([progress, perimeter[profileIndex]]);
    }
  }
  const indices = [];
  const segmentRings = closedPath ? ringCount : ringCount - 1;
  for (let ring = 0; ring < segmentRings; ring += 1) {
    const nextRing = (ring + 1) % ringCount;
    for (let profileIndex = 0; profileIndex < profileCount; profileIndex += 1) {
      const nextProfile = (profileIndex + 1) % profileCount;
      const a = ring * profileCount + profileIndex;
      const b = nextRing * profileCount + profileIndex;
      const c = nextRing * profileCount + nextProfile;
      const d = ring * profileCount + nextProfile;
      indices.push(a, d, b, d, c, b);
    }
  }
  if (!closedPath && caps) {
    const triangles = THREE.ShapeUtils.triangulateShape(
      profile.map(([x, y]) => new THREE.Vector2(x, y)),
      []
    );
    const endOffset = (ringCount - 1) * profileCount;
    for (const [a, b, c] of triangles) {
      indices.push(c, b, a);
      indices.push(endOffset + a, endOffset + b, endOffset + c);
    }
  }
  return Object.freeze({
    origin: Object.freeze(origin),
    geometry: Object.freeze({
      type: "buffer",
      positions: Object.freeze(positions.map(point => Object.freeze(point))),
      indices: Object.freeze(indices),
      normals: Object.freeze([]),
      uvs: Object.freeze(uvs.map(point => Object.freeze(point))),
      edges: Object.freeze([])
    }),
    diagnostics: Object.freeze({
      rings: ringCount,
      profileVertices: profileCount,
      vertices: positions.length,
      triangles: indices.length / 3,
      closedPath: Boolean(closedPath),
      caps: Boolean(!closedPath && caps)
    })
  });
}

function normalizeProfile(points) {
  if (!Array.isArray(points) || points.length < 3) {
    throw new RangeError("O perfil exige ao menos três pontos 2D.");
  }
  const normalized = points.map((point, index) => {
    if (!Array.isArray(point) || point.length !== 2) {
      throw new TypeError(`profilePoints[${index}] deve conter x e y.`);
    }
    const values = point.map(Number);
    if (!values.every(Number.isFinite)) {
      throw new TypeError(`profilePoints[${index}] contém valor inválido.`);
    }
    return values;
  });
  if (normalized.length > 3 && near2(normalized[0], normalized.at(-1))) {
    normalized.pop();
  }
  if (Math.abs(signedArea(normalized)) < 1e-12) {
    throw new Error("O perfil possui área nula.");
  }
  if (signedArea(normalized) < 0) normalized.reverse();
  return normalized;
}

function profilePerimeterCoordinates(points) {
  const lengths = [0];
  let total = 0;
  for (let index = 1; index <= points.length; index += 1) {
    const left = points[index - 1];
    const right = points[index % points.length];
    total += Math.hypot(right[0] - left[0], right[1] - left[1]);
    if (index < points.length) lengths.push(total);
  }
  if (total <= 1e-12) return points.map(() => 0);
  return lengths.map(value => value / total);
}

function signedArea(points) {
  let sum = 0;
  for (let index = 0; index < points.length; index += 1) {
    const [x1, y1] = points[index];
    const [x2, y2] = points[(index + 1) % points.length];
    sum += x1 * y2 - x2 * y1;
  }
  return sum * 0.5;
}

function near2(left, right, epsilon = 1e-9) {
  return Math.hypot(left[0] - right[0], left[1] - right[1]) <= epsilon;
}

function finiteNonZero(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number) || Math.abs(number) < 1e-12) {
    throw new RangeError(`${name} deve ser finito e diferente de zero.`);
  }
  return number;
}
