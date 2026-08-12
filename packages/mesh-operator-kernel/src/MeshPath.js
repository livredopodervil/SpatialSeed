const EPSILON = 1e-9;

export const MESH_PATH_MODES = Object.freeze([
  "drag-line",
  "drawn",
  "normal",
  "explicit"
]);

export function normalizeMeshPathMode(value, { allowNormal = true } = {}) {
  const raw = String(value ?? "drag-line").trim().toLowerCase();
  const aliases = Object.freeze({
    line: "drag-line",
    straight: "drag-line",
    drag: "drag-line",
    stroke: "drawn",
    freehand: "drawn",
    path: "drawn",
    legacy: "normal"
  });
  const mode = aliases[raw] ?? raw;
  if (!MESH_PATH_MODES.includes(mode) || (!allowNormal && mode === "normal")) {
    throw new RangeError(`Modo de caminho de malha desconhecido: ${value}.`);
  }
  return mode;
}

export function prepareMeshPath({
  points,
  mode = "explicit",
  simplifyTolerance = 0,
  minimumSegment = 1e-6
} = {}) {
  const pathMode = normalizeMeshPathMode(mode, { allowNormal: false });
  const tolerance = nonNegative(simplifyTolerance, "simplifyTolerance");
  const minimum = nonNegative(minimumSegment, "minimumSegment");
  let normalized = normalizePoints(points);
  normalized = removeNearDuplicates(normalized, minimum);
  if (normalized.length < 2) {
    throw new Error("Um caminho de malha exige pelo menos dois pontos distintos.");
  }
  if (pathMode === "drag-line") {
    normalized = [normalized[0], normalized.at(-1)];
  } else if (pathMode === "drawn" && tolerance > 0 && normalized.length > 2) {
    normalized = simplifyRdp(normalized, tolerance);
  }
  const segments = meshPathSegments(normalized, { minimumSegment: minimum });
  if (!segments.length) {
    throw new Error("O caminho de malha possui comprimento nulo.");
  }
  return Object.freeze({
    mode: pathMode,
    points: Object.freeze(normalized.map(point => Object.freeze([...point]))),
    segments,
    length: segments.reduce((sum, segment) => sum + segment.length, 0)
  });
}

export function meshPathSegments(points, { minimumSegment = 1e-6 } = {}) {
  const normalized = normalizePoints(points);
  const minimum = nonNegative(minimumSegment, "minimumSegment");
  const result = [];
  for (let index = 1; index < normalized.length; index += 1) {
    const start = normalized[index - 1];
    const end = normalized[index];
    const delta = [
      end[0] - start[0],
      end[1] - start[1],
      end[2] - start[2]
    ];
    const length = Math.hypot(...delta);
    if (length <= Math.max(EPSILON, minimum)) continue;
    result.push(Object.freeze({
      index: result.length,
      start: Object.freeze([...start]),
      end: Object.freeze([...end]),
      delta: Object.freeze(delta),
      length
    }));
  }
  return Object.freeze(result);
}

export function pathDiagonal(points) {
  const normalized = normalizePoints(points);
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const point of normalized) {
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis], point[axis]);
      max[axis] = Math.max(max[axis], point[axis]);
    }
  }
  return Math.hypot(
    max[0] - min[0],
    max[1] - min[1],
    max[2] - min[2]
  );
}

function simplifyRdp(points, tolerance) {
  if (points.length <= 2) return points.map(point => [...point]);
  const start = points[0];
  const end = points.at(-1);
  let maximum = -1;
  let split = -1;
  for (let index = 1; index < points.length - 1; index += 1) {
    const distance = pointSegmentDistance(points[index], start, end);
    if (distance > maximum) {
      maximum = distance;
      split = index;
    }
  }
  if (maximum <= tolerance || split < 0) return [[...start], [...end]];
  const left = simplifyRdp(points.slice(0, split + 1), tolerance);
  const right = simplifyRdp(points.slice(split), tolerance);
  return [...left.slice(0, -1), ...right];
}

function pointSegmentDistance(point, start, end) {
  const ab = subtract(end, start);
  const lengthSquared = dot(ab, ab);
  if (lengthSquared <= EPSILON) return Math.hypot(...subtract(point, start));
  const t = clamp(dot(subtract(point, start), ab) / lengthSquared, 0, 1);
  const closest = [
    start[0] + ab[0] * t,
    start[1] + ab[1] * t,
    start[2] + ab[2] * t
  ];
  return Math.hypot(...subtract(point, closest));
}

function removeNearDuplicates(points, minimum) {
  if (!points.length) return [];
  const result = [[...points[0]]];
  for (let index = 1; index < points.length; index += 1) {
    const previous = result.at(-1);
    const current = points[index];
    if (Math.hypot(...subtract(current, previous)) <= Math.max(EPSILON, minimum)) {
      continue;
    }
    result.push([...current]);
  }
  return result;
}

function normalizePoints(value) {
  if (!Array.isArray(value)) {
    throw new TypeError("points deve ser uma lista de pontos 3D.");
  }
  return value.map((point, index) => vector3(point, `points[${index}]`));
}

function vector3(value, label) {
  if (!Array.isArray(value) || value.length !== 3) {
    throw new TypeError(`${label} deve conter três números.`);
  }
  return value.map(component => finite(component, label));
}

function finite(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new TypeError(`${label} contém valor inválido.`);
  return number;
}

function nonNegative(value, label) {
  const number = finite(value, label);
  if (number < 0) throw new RangeError(`${label} não pode ser negativo.`);
  return number;
}

function subtract(left, right) {
  return [left[0] - right[0], left[1] - right[1], left[2] - right[2]];
}

function dot(left, right) {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}
