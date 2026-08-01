const MAX_STROKES = 10000;
const MAX_POINTS = 200000;
const VALIDATED_BUNDLE_MARKER = "spatialseed-stroke-bundle-v1";
const VALIDATED_STROKE_MARKER = "spatialseed-stroke-v1";
const CURVE_TYPES = new Set([
  "centripetal",
  "chordal",
  "catmullrom",
  "polyline",
  "bezier"
]);

export const STROKE_BUNDLE_GEOMETRY_TYPE = "stroke-bundle";

export function normalizeStrokeBundleDescriptor(value = {}) {
  if (isTrustedBundle(value)) return value;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Descritor de conjunto de traços inválido.");
  }
  const source = Array.isArray(value.strokes) ? value.strokes : [];
  if (source.length < 1 || source.length > MAX_STROKES) {
    throw new RangeError(
      `Conjunto de traços exige entre 1 e ${MAX_STROKES} traços.`
    );
  }
  let pointCount = 0;
  const strokes = source.map((stroke, index) => {
    const normalized = normalizeStroke(stroke, index);
    pointCount += normalized.points.length;
    return normalized;
  });
  if (pointCount > MAX_POINTS) {
    throw new RangeError(
      `Conjunto de traços limitado a ${MAX_POINTS} pontos.`
    );
  }
  const ids = strokes.map(stroke => stroke.id);
  if (new Set(ids).size !== ids.length) {
    throw new Error("IDs duplicados no conjunto de traços.");
  }
  return deepFreeze({
    type: STROKE_BUNDLE_GEOMETRY_TYPE,
    validated: VALIDATED_BUNDLE_MARKER,
    strokes: Object.freeze(strokes),
    pointCount
  });
}

export function strokeBundleFromStroke(stroke) {
  return normalizeStrokeBundleDescriptor({
    type: STROKE_BUNDLE_GEOMETRY_TYPE,
    strokes: [stroke]
  });
}

export function mergeStrokeBundles(values, {
  idPrefix = "stroke"
} = {}) {
  if (!Array.isArray(values) || !values.length) {
    throw new TypeError("Fusão exige ao menos um conjunto de traços.");
  }
  const strokes = [];
  const used = new Set();
  let pointCount = 0;
  let next = 1;
  for (const value of values) {
    const bundle = normalizeStrokeBundleDescriptor(value);
    for (const stroke of bundle.strokes) {
      let candidate = stroke;
      let id = stroke.id;
      while (used.has(id)) id = `${idPrefix}-${next++}`;
      if (id !== stroke.id) candidate = normalizeStroke({ ...stroke, id }, 0);
      used.add(id);
      strokes.push(candidate);
      pointCount += candidate.points.length;
      if (strokes.length > MAX_STROKES || pointCount > MAX_POINTS) {
        throw new RangeError("Fusão excede o limite do conjunto de traços.");
      }
    }
  }
  return trustedBundle(strokes, pointCount);
}

export function appendStrokeToBundle(bundleValue, strokeValue) {
  const bundle = normalizeStrokeBundleDescriptor(bundleValue);
  let stroke = normalizeStroke(strokeValue, bundle.strokes.length);
  const used = new Set(bundle.strokes.map(item => item.id));
  if (used.has(stroke.id)) {
    let suffix = 2;
    let id = `${stroke.id}-${suffix}`;
    while (used.has(id)) id = `${stroke.id}-${++suffix}`;
    stroke = normalizeStroke({ ...stroke, id }, bundle.strokes.length);
  }
  if (bundle.strokes.length >= MAX_STROKES ||
      bundle.pointCount + stroke.points.length > MAX_POINTS) {
    throw new RangeError("Conjunto de traços atingiu o limite compacto.");
  }
  return trustedBundle(
    [...bundle.strokes, stroke],
    bundle.pointCount + stroke.points.length
  );
}

export function strokeTouchesBundle(strokeValue, bundleValue, {
  tolerance = 0
} = {}) {
  const stroke = normalizeStroke(strokeValue, 0);
  const bundle = normalizeStrokeBundleDescriptor(bundleValue);
  const extra = finiteNonNegative(tolerance, "tolerância de fusão");
  return bundle.strokes.some(candidate =>
    strokesTouch(stroke, candidate, extra)
  );
}

export function strokesTouch(leftValue, rightValue, tolerance = 0) {
  const left = normalizeStroke(leftValue, 0);
  const right = normalizeStroke(rightValue, 1);
  const threshold = left.radius + right.radius +
    finiteNonNegative(tolerance, "tolerância de fusão");
  const thresholdSquared = threshold * threshold;
  const leftSegments = strokeSegments(left);
  const rightSegments = strokeSegments(right);
  for (const [a0, a1] of leftSegments) {
    for (const [b0, b1] of rightSegments) {
      if (segmentDistanceSquared(a0, a1, b0, b1) <= thresholdSquared) {
        return true;
      }
    }
  }
  return false;
}

export function strokeBundleEstimatedBytes(value) {
  const bundle = normalizeStrokeBundleDescriptor(value);
  return bundle.strokes.reduce((total, stroke) =>
    total + 64 + stroke.id.length * 2 + stroke.points.length * 3 * 4,
  32);
}

export function strokeResourcePath(objectId, strokeId) {
  const owner = nonEmptyString(objectId, "objeto");
  const stroke = nonEmptyString(strokeId, "traço");
  return `/objects/${encodeURIComponent(owner)}/strokes/${encodeURIComponent(stroke)}`;
}

export function parseStrokeResourcePath(value) {
  const match = String(value ?? "").match(
    /^\/objects\/([^/]+)\/strokes\/([^/]+)$/
  );
  if (!match) return null;
  return Object.freeze({
    objectId: decodeURIComponent(match[1]),
    strokeId: decodeURIComponent(match[2])
  });
}

export function transformStroke(strokeValue, matrix) {
  const stroke = normalizeStroke(strokeValue, 0);
  if (!Array.isArray(matrix) || matrix.length !== 16 ||
      !matrix.every(Number.isFinite)) {
    throw new TypeError("Matriz de transformação do traço inválida.");
  }
  return normalizeStroke({
    ...stroke,
    points: stroke.points.map(point => transformPoint(matrix, point))
  }, 0);
}

function normalizeStroke(value, index) {
  if (isTrustedStroke(value)) return value;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`Traço ${index + 1} inválido.`);
  }
  const id = String(value.id ?? `stroke-${index + 1}`).trim();
  if (!id) throw new TypeError(`Traço ${index + 1} sem id.`);
  const points = normalizePoints(value.points, index);
  const radius = positive(value.radius ?? 0.04, `raio do traço ${index + 1}`);
  const radialSegments = integerAtLeast(
    value.radialSegments ?? 6,
    3,
    `segmentos radiais do traço ${index + 1}`
  );
  const tubularSegments = integerAtLeast(
    value.tubularSegments ?? Math.max(2, points.length - 1),
    2,
    `segmentos longitudinais do traço ${index + 1}`
  );
  const curveType = String(value.curveType ?? "polyline").toLowerCase();
  if (!CURVE_TYPES.has(curveType)) {
    throw new RangeError(`Interpolação de traço desconhecida: ${curveType}.`);
  }
  const closed = Boolean(value.closed);
  const tension = finite(value.tension ?? 0.5, `tensão do traço ${index + 1}`);
  return deepFreeze({
    validated: VALIDATED_STROKE_MARKER,
    id,
    points,
    radius,
    radialSegments,
    tubularSegments,
    closed,
    curveType,
    tension
  });
}

function trustedBundle(strokes, pointCount) {
  return deepFreeze({
    type: STROKE_BUNDLE_GEOMETRY_TYPE,
    validated: VALIDATED_BUNDLE_MARKER,
    strokes: Object.freeze(strokes),
    pointCount
  });
}

function isTrustedStroke(value) {
  return Boolean(
    value && typeof value === "object" && Object.isFrozen(value) &&
    value.validated === VALIDATED_STROKE_MARKER &&
    typeof value.id === "string" && value.id &&
    Object.isFrozen(value.points) && value.points.length >= 2 &&
    Number.isFinite(value.radius) && value.radius > 0
  );
}

function isTrustedBundle(value) {
  return Boolean(
    value && typeof value === "object" && Object.isFrozen(value) &&
    value.type === STROKE_BUNDLE_GEOMETRY_TYPE &&
    value.validated === VALIDATED_BUNDLE_MARKER &&
    Object.isFrozen(value.strokes) && value.strokes.length >= 1 &&
    value.strokes.length <= MAX_STROKES &&
    value.strokes.every(isTrustedStroke) &&
    Number.isInteger(value.pointCount) && value.pointCount >= 2 &&
    value.pointCount <= MAX_POINTS
  );
}

function normalizePoints(value, index) {
  if (!Array.isArray(value) || value.length < 2) {
    throw new TypeError(`Traço ${index + 1} exige ao menos dois pontos.`);
  }
  return Object.freeze(value.map((point, pointIndex) => {
    if (!Array.isArray(point) || point.length !== 3) {
      throw new TypeError(
        `Ponto ${pointIndex + 1} do traço ${index + 1} inválido.`
      );
    }
    const result = point.map(Number);
    if (!result.every(Number.isFinite)) {
      throw new TypeError(
        `Ponto ${pointIndex + 1} do traço ${index + 1} inválido.`
      );
    }
    return Object.freeze(result);
  }));
}

function strokeSegments(stroke) {
  const segments = [];
  for (let index = 1; index < stroke.points.length; index += 1) {
    segments.push([stroke.points[index - 1], stroke.points[index]]);
  }
  if (stroke.closed && stroke.points.length > 2) {
    segments.push([stroke.points.at(-1), stroke.points[0]]);
  }
  return segments;
}

// Distância quadrática entre dois segmentos em R³, baseada na projeção
// simultânea dos parâmetros e com tratamento dos casos degenerados.
function segmentDistanceSquared(p1, q1, p2, q2) {
  const d1 = subtract(q1, p1);
  const d2 = subtract(q2, p2);
  const r = subtract(p1, p2);
  const a = dot(d1, d1);
  const e = dot(d2, d2);
  const f = dot(d2, r);
  let s;
  let t;

  if (a <= 1e-18 && e <= 1e-18) return dot(r, r);
  if (a <= 1e-18) {
    s = 0;
    t = clamp(f / e, 0, 1);
  } else {
    const c = dot(d1, r);
    if (e <= 1e-18) {
      t = 0;
      s = clamp(-c / a, 0, 1);
    } else {
      const b = dot(d1, d2);
      const denominator = a * e - b * b;
      s = denominator === 0 ? 0 : clamp((b * f - c * e) / denominator, 0, 1);
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = clamp(-c / a, 0, 1);
      } else if (t > 1) {
        t = 1;
        s = clamp((b - c) / a, 0, 1);
      }
    }
  }
  const closest = add(r, subtract(scale(d1, s), scale(d2, t)));
  return dot(closest, closest);
}

function transformPoint(matrix, [x, y, z]) {
  return Object.freeze([
    matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12],
    matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13],
    matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14]
  ]);
}

function subtract(left, right) {
  return [left[0] - right[0], left[1] - right[1], left[2] - right[2]];
}
function add(left, right) {
  return [left[0] + right[0], left[1] + right[1], left[2] + right[2]];
}
function scale(value, factor) {
  return [value[0] * factor, value[1] * factor, value[2] * factor];
}
function dot(left, right) {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}
function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}
function finite(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new TypeError(`${label} inválida.`);
  return number;
}
function positive(value, label) {
  const number = finite(value, label);
  if (!(number > 0)) throw new RangeError(`${label} deve ser positivo.`);
  return number;
}
function finiteNonNegative(value, label) {
  const number = finite(value, label);
  if (number < 0) throw new RangeError(`${label} não pode ser negativa.`);
  return number;
}
function integerAtLeast(value, minimum, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < minimum) {
    throw new RangeError(`${label} deve ser inteiro >= ${minimum}.`);
  }
  return number;
}
function nonEmptyString(value, label) {
  const text = String(value ?? "").trim();
  if (!text) throw new TypeError(`${label} deve ser texto não vazio.`);
  return text;
}
function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}
