const MAX_STROKES = 100000;
const MAX_POINTS = 5000000;
const VALIDATED_BUNDLE_MARKER = "spatialseed-stroke-bundle-v2";
const LEGACY_BUNDLE_MARKER = "spatialseed-stroke-bundle-v1";
const VALIDATED_STROKE_MARKER = "spatialseed-stroke-v1";
const VALIDATED_CHUNK_MARKER = "spatialseed-stroke-chunk-v1";
const CURVE_TYPES = new Set([
  "centripetal",
  "chordal",
  "catmullrom",
  "polyline",
  "bezier"
]);

export const STROKE_BUNDLE_GEOMETRY_TYPE = "stroke-bundle";
export const DEFAULT_STROKE_CHUNK_POLICY = Object.freeze({
  targetChunkPoints: 8192,
  maximumChunkPoints: 16384,
  maximumChunkStrokes: 128,
  targetChunkBytes: 262144
});

export function normalizeStrokeBundleDescriptor(value = {}, options = {}) {
  if (isTrustedBundle(value)) return value;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Descritor de conjunto de traços inválido.");
  }

  const policy = normalizeStrokeChunkPolicy(
    options.policy ?? value.compactionPolicy ?? DEFAULT_STROKE_CHUNK_POLICY
  );
  const originPolicy = normalizeOriginPolicy(value.originPolicy ?? "first-point");
  const selectionAnchorPolicy = normalizeSelectionAnchorPolicy(
    value.selectionAnchorPolicy ?? "bounds-center"
  );
  const selectionAnchorLocal = selectionAnchorPolicy === "custom"
    ? Object.freeze(normalizedVector3(
        value.selectionAnchorLocal,
        "âncora personalizada do conjunto de traços"
      ))
    : null;

  let chunks;
  if (Array.isArray(value.chunks) && value.chunks.length) {
    chunks = value.chunks.map((chunk, index) => normalizeChunk(chunk, index));
  } else {
    const legacy = Array.isArray(value.strokes) ? value.strokes : [];
    if (!legacy.length) {
      throw new RangeError("Conjunto de traços exige ao menos um traço.");
    }
    chunks = packStrokesIntoChunks(
      legacy.map((stroke, index) => normalizeStroke(stroke, index)),
      policy
    );
  }

  return trustedBundle({
    chunks,
    storageOrigin: normalizedVector3(
      value.storageOrigin ?? value.origin ?? [0, 0, 0],
      "origem geométrica do conjunto de traços"
    ),
    originPolicy,
    selectionAnchorPolicy,
    selectionAnchorLocal,
    compactionPolicy: policy,
    compactionRevision: nonNegativeInteger(
      value.compactionRevision ?? 0,
      "revisão de compactação"
    )
  });
}

export function strokeBundleFromStroke(stroke, options = {}) {
  const normalized = normalizeStroke(stroke, 0);
  return trustedBundle({
    chunks: [createChunk([normalized], options.chunkId ?? "chunk-1")],
    storageOrigin: normalizedVector3(
      options.storageOrigin ?? [0, 0, 0],
      "origem geométrica do conjunto de traços"
    ),
    originPolicy: normalizeOriginPolicy(options.originPolicy ?? "first-point"),
    selectionAnchorPolicy: normalizeSelectionAnchorPolicy(
      options.selectionAnchorPolicy ?? "bounds-center"
    ),
    selectionAnchorLocal: options.selectionAnchorPolicy === "custom"
      ? Object.freeze(normalizedVector3(
          options.selectionAnchorLocal,
          "âncora personalizada do conjunto de traços"
        ))
      : null,
    compactionPolicy: normalizeStrokeChunkPolicy(
      options.policy ?? DEFAULT_STROKE_CHUNK_POLICY
    ),
    compactionRevision: 0
  });
}

export function mergeStrokeBundles(values, {
  idPrefix = "stroke",
  policy = DEFAULT_STROKE_CHUNK_POLICY,
  storageOrigin = null,
  originPolicy = null,
  selectionAnchorPolicy = null,
  selectionAnchorLocal = null
} = {}) {
  if (!Array.isArray(values) || !values.length) {
    throw new TypeError("Fusão exige ao menos um conjunto de traços.");
  }
  const normalizedValues = values.map(value =>
    normalizeStrokeBundleDescriptor(value, { policy })
  );
  const strokes = [];
  const used = new Set();
  let next = 1;
  for (const bundle of normalizedValues) {
    for (const stroke of iterateStrokeBundle(bundle)) {
      let candidate = stroke;
      let id = stroke.id;
      while (used.has(id)) id = `${idPrefix}-${next++}`;
      if (id !== stroke.id) candidate = normalizeStroke({ ...stroke, id }, 0);
      used.add(id);
      strokes.push(candidate);
      assertCollectionLimits(strokes.length, sumStrokePoints(strokes));
    }
  }
  const first = normalizedValues[0];
  return trustedBundle({
    chunks: packStrokesIntoChunks(strokes, normalizeStrokeChunkPolicy(policy)),
    storageOrigin: normalizedVector3(
      storageOrigin ?? first.storageOrigin,
      "origem geométrica do conjunto fundido"
    ),
    originPolicy: normalizeOriginPolicy(originPolicy ?? first.originPolicy),
    selectionAnchorPolicy: normalizeSelectionAnchorPolicy(
      selectionAnchorPolicy ?? first.selectionAnchorPolicy
    ),
    selectionAnchorLocal: (selectionAnchorPolicy ?? first.selectionAnchorPolicy) === "custom"
      ? Object.freeze(normalizedVector3(
          selectionAnchorLocal ?? first.selectionAnchorLocal,
          "âncora personalizada do conjunto fundido"
        ))
      : null,
    compactionPolicy: normalizeStrokeChunkPolicy(policy),
    compactionRevision: Math.max(
      ...normalizedValues.map(bundle => bundle.compactionRevision ?? 0)
    )
  });
}

export function appendStrokeToBundle(bundleValue, strokeValue, {
  policy = null,
  chunkId = null
} = {}) {
  const bundle = normalizeStrokeBundleDescriptor(bundleValue);
  const resolvedPolicy = normalizeStrokeChunkPolicy(
    policy ?? bundle.compactionPolicy
  );
  let stroke = normalizeStroke(strokeValue, bundle.strokeCount);
  if (strokeBundleFindStroke(bundle, stroke.id)) {
    let suffix = 2;
    let id = `${stroke.id}-${suffix}`;
    while (strokeBundleFindStroke(bundle, id)) id = `${stroke.id}-${++suffix}`;
    stroke = normalizeStroke({ ...stroke, id }, bundle.strokeCount);
  }
  assertCollectionLimits(
    bundle.strokeCount + 1,
    bundle.pointCount + stroke.points.length
  );

  const chunks = [...bundle.chunks];
  const last = chunks.at(-1);
  if (last && chunkCanAccept(last, stroke, resolvedPolicy)) {
    chunks[chunks.length - 1] = createChunk(
      [...last.strokes, stroke],
      last.id
    );
  } else {
    chunks.push(createChunk(
      [stroke],
      chunkId ?? `chunk-${bundle.chunks.length + 1}`
    ));
  }
  return trustedBundle({
    chunks,
    storageOrigin: bundle.storageOrigin,
    originPolicy: bundle.originPolicy,
    selectionAnchorPolicy: bundle.selectionAnchorPolicy,
    selectionAnchorLocal: bundle.selectionAnchorLocal,
    compactionPolicy: resolvedPolicy,
    compactionRevision: bundle.compactionRevision
  });
}

export function compactStrokeBundle(bundleValue, policyValue = null) {
  const bundle = normalizeStrokeBundleDescriptor(bundleValue);
  const policy = normalizeStrokeChunkPolicy(
    policyValue ?? bundle.compactionPolicy
  );
  const chunks = packStrokesIntoChunks([...iterateStrokeBundle(bundle)], policy);
  if (sameChunkLayout(bundle.chunks, chunks) &&
      sameChunkPolicy(bundle.compactionPolicy, policy)) {
    return Object.freeze({ changed: false, bundle });
  }
  return Object.freeze({
    changed: true,
    bundle: trustedBundle({
      chunks,
      storageOrigin: bundle.storageOrigin,
      originPolicy: bundle.originPolicy,
      selectionAnchorPolicy: bundle.selectionAnchorPolicy,
      selectionAnchorLocal: bundle.selectionAnchorLocal,
      compactionPolicy: policy,
      compactionRevision: bundle.compactionRevision + 1
    })
  });
}

export function createStrokeCompactionJob(bundleValue, policyValue = null) {
  const bundle = normalizeStrokeBundleDescriptor(bundleValue);
  const policy = normalizeStrokeChunkPolicy(
    policyValue ?? bundle.compactionPolicy
  );
  const source = [...iterateStrokeBundle(bundle)];
  let index = 0;
  let current = [];
  const chunks = [];
  return Object.freeze({
    get done() { return index >= source.length && current.length === 0; },
    step(maximumStrokes = 1) {
      let processed = 0;
      const limit = Math.max(1, Number(maximumStrokes) || 1);
      while (index < source.length && processed < limit) {
        const stroke = source[index++];
        if (current.length) {
          const currentChunk = createChunk(current, `chunk-${chunks.length + 1}`);
          if (!chunkCanAccept(currentChunk, stroke, policy)) {
            chunks.push(currentChunk);
            current = [];
          }
        }
        current.push(stroke);
        processed += 1;
      }
      if (index >= source.length && current.length) {
        chunks.push(createChunk(current, `chunk-${chunks.length + 1}`));
        current = [];
      }
      return Object.freeze({ processed, done: index >= source.length && !current.length });
    },
    finish() {
      if (index < source.length || current.length) {
        throw new Error("Compactação ainda não terminou.");
      }
      const changed = !sameChunkLayout(bundle.chunks, chunks) ||
        !sameChunkPolicy(bundle.compactionPolicy, policy);
      return Object.freeze({
        changed,
        bundle: changed
          ? trustedBundle({
              chunks,
              storageOrigin: bundle.storageOrigin,
              originPolicy: bundle.originPolicy,
              selectionAnchorPolicy: bundle.selectionAnchorPolicy,
              selectionAnchorLocal: bundle.selectionAnchorLocal,
              compactionPolicy: policy,
              compactionRevision: bundle.compactionRevision + 1
            })
          : bundle
      });
    }
  });
}

export function rebaseStrokeBundleOrigin(bundleValue, nextOriginValue) {
  const bundle = normalizeStrokeBundleDescriptor(bundleValue);
  const nextOrigin = normalizedVector3(nextOriginValue, "nova origem geométrica");
  const delta = bundle.storageOrigin.map((value, axis) => value - nextOrigin[axis]);
  if (delta.every(value => Math.abs(value) <= 1e-12)) return bundle;
  const chunks = bundle.chunks.map(chunk => createChunk(
    chunk.strokes.map(stroke => normalizeStroke({
      ...stroke,
      points: stroke.points.map(point => point.map((value, axis) =>
        value + delta[axis]
      ))
    }, 0)),
    chunk.id
  ));
  return trustedBundle({
    chunks,
    storageOrigin: nextOrigin,
    originPolicy: bundle.originPolicy,
    selectionAnchorPolicy: bundle.selectionAnchorPolicy,
    selectionAnchorLocal: bundle.selectionAnchorLocal
      ? bundle.selectionAnchorLocal.map((value, axis) => value + delta[axis])
      : null,
    compactionPolicy: bundle.compactionPolicy,
    compactionRevision: bundle.compactionRevision + 1
  });
}

export function setStrokeBundleAnchorPolicy(bundleValue, {
  policy = "bounds-center",
  position = null
} = {}) {
  const bundle = normalizeStrokeBundleDescriptor(bundleValue);
  const selectionAnchorPolicy = normalizeSelectionAnchorPolicy(policy);
  const selectionAnchorLocal = selectionAnchorPolicy === "custom"
    ? Object.freeze(normalizedVector3(position, "âncora personalizada"))
    : null;
  return trustedBundle({
    chunks: bundle.chunks,
    storageOrigin: bundle.storageOrigin,
    originPolicy: bundle.originPolicy,
    selectionAnchorPolicy,
    selectionAnchorLocal,
    compactionPolicy: bundle.compactionPolicy,
    compactionRevision: bundle.compactionRevision
  });
}

export function strokeBundleAnchorLocal(bundleValue) {
  const bundle = normalizeStrokeBundleDescriptor(bundleValue);
  if (bundle.selectionAnchorPolicy === "custom") {
    return Object.freeze([...bundle.selectionAnchorLocal]);
  }
  if (bundle.selectionAnchorPolicy === "origin") return Object.freeze([0, 0, 0]);
  return Object.freeze(bundle.bounds.min.map((value, axis) =>
    value + (bundle.bounds.max[axis] - value) * 0.5
  ));
}

export function* iterateStrokeBundle(bundleValue) {
  const bundle = normalizeStrokeBundleDescriptor(bundleValue);
  for (const chunk of bundle.chunks) {
    for (const stroke of chunk.strokes) yield stroke;
  }
}

export function strokeBundleStrokes(bundleValue) {
  return Object.freeze([...iterateStrokeBundle(bundleValue)]);
}

export function strokeBundleFindStroke(bundleValue, strokeId) {
  const id = String(strokeId ?? "").trim();
  if (!id) return null;
  const bundle = normalizeStrokeBundleDescriptor(bundleValue);
  for (const chunk of bundle.chunks) {
    const stroke = chunk.strokes.find(item => item.id === id);
    if (stroke) return stroke;
  }
  return null;
}

export function strokeBundleStrokeAt(bundleValue, index) {
  const bundle = normalizeStrokeBundleDescriptor(bundleValue);
  if (!Number.isInteger(index) || index < 0 || index >= bundle.strokeCount) {
    throw new RangeError(`Índice de traço inválido: ${index}.`);
  }
  let offset = index;
  for (const chunk of bundle.chunks) {
    if (offset < chunk.strokes.length) return chunk.strokes[offset];
    offset -= chunk.strokes.length;
  }
  throw new RangeError(`Índice de traço inválido: ${index}.`);
}

export function strokeTouchesBundle(strokeValue, bundleValue, {
  tolerance = 0,
  candidateStrokeIds = null
} = {}) {
  const stroke = normalizeStroke(strokeValue, 0);
  const bundle = normalizeStrokeBundleDescriptor(bundleValue);
  const extra = finiteNonNegative(tolerance, "tolerância de fusão");
  const ids = Array.isArray(candidateStrokeIds)
    ? new Set(candidateStrokeIds.map(String))
    : null;
  for (const candidate of iterateStrokeBundle(bundle)) {
    if (ids && !ids.has(candidate.id)) continue;
    if (strokesTouch(stroke, candidate, extra)) return true;
  }
  return false;
}

export function strokesTouch(leftValue, rightValue, tolerance = 0) {
  const left = normalizeStroke(leftValue, 0);
  const right = normalizeStroke(rightValue, 1);
  const threshold = left.radius + right.radius +
    finiteNonNegative(tolerance, "tolerância de fusão");
  const thresholdSquared = threshold * threshold;
  if (!boundsOverlap(
    strokeBounds(left, tolerance),
    strokeBounds(right, tolerance)
  )) return false;
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
  return bundle.chunks.reduce((total, chunk) => total + chunk.estimatedBytes, 128) +
    bundle.chunks.length * 64;
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

export function transformStrokeBundle(bundleValue, matrix) {
  const bundle = normalizeStrokeBundleDescriptor(bundleValue);
  return trustedBundle({
    chunks: bundle.chunks.map(chunk => createChunk(
      chunk.strokes.map(stroke => transformStroke(stroke, matrix)),
      chunk.id
    )),
    storageOrigin: transformPoint(matrix, bundle.storageOrigin),
    originPolicy: bundle.originPolicy,
    selectionAnchorPolicy: bundle.selectionAnchorPolicy,
    selectionAnchorLocal: bundle.selectionAnchorLocal
      ? transformPoint(matrix, bundle.selectionAnchorLocal)
      : null,
    compactionPolicy: bundle.compactionPolicy,
    compactionRevision: bundle.compactionRevision
  });
}

export function normalizeStrokeChunkPolicy(value = {}) {
  const source = value && typeof value === "object" ? value : {};
  return deepFreeze({
    targetChunkPoints: integerBetween(
      source.targetChunkPoints ?? DEFAULT_STROKE_CHUNK_POLICY.targetChunkPoints,
      64,
      MAX_POINTS,
      "targetChunkPoints"
    ),
    maximumChunkPoints: integerBetween(
      source.maximumChunkPoints ?? DEFAULT_STROKE_CHUNK_POLICY.maximumChunkPoints,
      64,
      MAX_POINTS,
      "maximumChunkPoints"
    ),
    maximumChunkStrokes: integerBetween(
      source.maximumChunkStrokes ?? DEFAULT_STROKE_CHUNK_POLICY.maximumChunkStrokes,
      1,
      MAX_STROKES,
      "maximumChunkStrokes"
    ),
    targetChunkBytes: integerBetween(
      source.targetChunkBytes ?? DEFAULT_STROKE_CHUNK_POLICY.targetChunkBytes,
      1024,
      64 * 1024 * 1024,
      "targetChunkBytes"
    )
  });
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

function normalizeChunk(value, index) {
  if (isTrustedChunk(value)) return value;
  if (!value || typeof value !== "object" || !Array.isArray(value.strokes) ||
      !value.strokes.length) {
    throw new TypeError(`Chunk de traços ${index + 1} inválido.`);
  }
  return createChunk(
    value.strokes.map((stroke, strokeIndex) =>
      normalizeStroke(stroke, strokeIndex)
    ),
    String(value.id ?? `chunk-${index + 1}`)
  );
}

function createChunk(strokesValue, idValue) {
  const strokes = Object.freeze(strokesValue.map((stroke, index) =>
    normalizeStroke(stroke, index)
  ));
  const id = nonEmptyString(idValue, "id do chunk");
  const pointCount = sumStrokePoints(strokes);
  const bounds = boundsForStrokes(strokes);
  const estimatedBytes = strokes.reduce((total, stroke) =>
    total + estimateStrokeBytes(stroke), 64
  );
  return deepFreeze({
    validated: VALIDATED_CHUNK_MARKER,
    id,
    strokes,
    strokeCount: strokes.length,
    pointCount,
    estimatedBytes,
    bounds
  });
}

function trustedBundle({
  chunks,
  storageOrigin,
  originPolicy,
  selectionAnchorPolicy,
  selectionAnchorLocal,
  compactionPolicy,
  compactionRevision
}) {
  const normalizedChunks = Object.freeze(chunks.map((chunk, index) =>
    normalizeChunk(chunk, index)
  ));
  const strokeCount = normalizedChunks.reduce(
    (total, chunk) => total + chunk.strokeCount,
    0
  );
  const pointCount = normalizedChunks.reduce(
    (total, chunk) => total + chunk.pointCount,
    0
  );
  assertCollectionLimits(strokeCount, pointCount);
  const ids = [];
  for (const chunk of normalizedChunks) {
    for (const stroke of chunk.strokes) ids.push(stroke.id);
  }
  if (new Set(ids).size !== ids.length) {
    throw new Error("IDs duplicados no conjunto de traços.");
  }
  return deepFreeze({
    type: STROKE_BUNDLE_GEOMETRY_TYPE,
    schemaVersion: "spatialseed-stroke-bundle-v2",
    validated: VALIDATED_BUNDLE_MARKER,
    chunks: normalizedChunks,
    strokeCount,
    pointCount,
    bounds: mergeChunkBounds(normalizedChunks),
    storageOrigin: Object.freeze(normalizedVector3(
      storageOrigin,
      "origem geométrica do conjunto de traços"
    )),
    originPolicy: normalizeOriginPolicy(originPolicy),
    selectionAnchorPolicy: normalizeSelectionAnchorPolicy(selectionAnchorPolicy),
    ...(selectionAnchorLocal
      ? { selectionAnchorLocal: Object.freeze(normalizedVector3(
          selectionAnchorLocal,
          "âncora personalizada do conjunto de traços"
        )) }
      : {}),
    compactionPolicy: normalizeStrokeChunkPolicy(compactionPolicy),
    compactionRevision: nonNegativeInteger(
      compactionRevision,
      "revisão de compactação"
    )
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

function isTrustedChunk(value) {
  return Boolean(
    value && typeof value === "object" && Object.isFrozen(value) &&
    value.validated === VALIDATED_CHUNK_MARKER &&
    typeof value.id === "string" && value.id &&
    Object.isFrozen(value.strokes) && value.strokes.length >= 1 &&
    value.strokes.every(isTrustedStroke) &&
    Number.isInteger(value.strokeCount) &&
    value.strokeCount === value.strokes.length &&
    Number.isInteger(value.pointCount) && value.pointCount >= 2 &&
    Number.isFinite(value.estimatedBytes) && value.estimatedBytes > 0 &&
    validBounds(value.bounds)
  );
}

function isTrustedBundle(value) {
  return Boolean(
    value && typeof value === "object" && Object.isFrozen(value) &&
    value.type === STROKE_BUNDLE_GEOMETRY_TYPE &&
    value.validated === VALIDATED_BUNDLE_MARKER &&
    value.validated !== LEGACY_BUNDLE_MARKER &&
    Object.isFrozen(value.chunks) && value.chunks.length >= 1 &&
    value.chunks.every(isTrustedChunk) &&
    Number.isInteger(value.strokeCount) && value.strokeCount >= 1 &&
    Number.isInteger(value.pointCount) && value.pointCount >= 2 &&
    validBounds(value.bounds) &&
    Object.isFrozen(value.storageOrigin) && value.storageOrigin.length === 3 &&
    value.compactionPolicy && Object.isFrozen(value.compactionPolicy)
  );
}

function packStrokesIntoChunks(strokes, policy) {
  const chunks = [];
  let current = [];
  for (const stroke of strokes) {
    if (current.length) {
      const chunk = createChunk(current, `chunk-${chunks.length + 1}`);
      if (!chunkCanAccept(chunk, stroke, policy)) {
        chunks.push(chunk);
        current = [];
      }
    }
    current.push(stroke);
  }
  if (current.length) chunks.push(createChunk(current, `chunk-${chunks.length + 1}`));
  return chunks;
}

function chunkCanAccept(chunk, stroke, policy) {
  const nextPoints = chunk.pointCount + stroke.points.length;
  const nextBytes = chunk.estimatedBytes + estimateStrokeBytes(stroke);
  return chunk.strokeCount < policy.maximumChunkStrokes &&
    nextPoints <= policy.maximumChunkPoints &&
    nextBytes <= Math.max(policy.targetChunkBytes * 2, policy.targetChunkBytes + 65536) &&
    (chunk.pointCount < policy.targetChunkPoints ||
      chunk.estimatedBytes < policy.targetChunkBytes);
}

function sameChunkLayout(left, right) {
  if (left.length !== right.length) return false;
  return left.every((chunk, index) => {
    const other = right[index];
    return other && chunk.strokes.length === other.strokes.length &&
      chunk.strokes.every((stroke, strokeIndex) =>
        stroke.id === other.strokes[strokeIndex]?.id
      );
  });
}

function sameChunkPolicy(left, right) {
  return [
    "targetChunkPoints",
    "maximumChunkPoints",
    "maximumChunkStrokes",
    "targetChunkBytes"
  ].every(key => Number(left?.[key]) === Number(right?.[key]));
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

function boundsForStrokes(strokes) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const stroke of strokes) {
    const bounds = strokeBounds(stroke);
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis], bounds.min[axis]);
      max[axis] = Math.max(max[axis], bounds.max[axis]);
    }
  }
  return deepFreeze({ min: Object.freeze(min), max: Object.freeze(max) });
}

function mergeChunkBounds(chunks) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const chunk of chunks) {
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis], chunk.bounds.min[axis]);
      max[axis] = Math.max(max[axis], chunk.bounds.max[axis]);
    }
  }
  return deepFreeze({ min: Object.freeze(min), max: Object.freeze(max) });
}

function strokeBounds(stroke, tolerance = 0) {
  const margin = Math.max(0, Number(stroke.radius)) +
    Math.max(0, Number(tolerance));
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const point of stroke.points) {
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis], point[axis] - margin);
      max[axis] = Math.max(max[axis], point[axis] + margin);
    }
  }
  return { min, max };
}

function boundsOverlap(left, right) {
  return [0, 1, 2].every(axis =>
    left.min[axis] <= right.max[axis] &&
    left.max[axis] >= right.min[axis]
  );
}

function validBounds(value) {
  return Boolean(
    value && typeof value === "object" &&
    Array.isArray(value.min) && value.min.length === 3 &&
    Array.isArray(value.max) && value.max.length === 3 &&
    [...value.min, ...value.max].every(Number.isFinite)
  );
}

function estimateStrokeBytes(stroke) {
  return 80 + stroke.id.length * 2 + stroke.points.length * 3 * 4;
}

function sumStrokePoints(strokes) {
  return strokes.reduce((total, stroke) => total + stroke.points.length, 0);
}

function assertCollectionLimits(strokeCount, pointCount) {
  if (strokeCount < 1 || strokeCount > MAX_STROKES) {
    throw new RangeError(`Conjunto de traços limitado a ${MAX_STROKES} traços.`);
  }
  if (pointCount < 2 || pointCount > MAX_POINTS) {
    throw new RangeError(`Conjunto de traços limitado a ${MAX_POINTS} pontos.`);
  }
}

function normalizeOriginPolicy(value) {
  const policy = String(value ?? "first-point").toLowerCase();
  if (!["first-point", "custom", "world", "checkpoint"].includes(policy)) {
    throw new RangeError(`Política de origem desconhecida: ${value}.`);
  }
  return policy;
}

function normalizeSelectionAnchorPolicy(value) {
  const policy = String(value ?? "bounds-center").toLowerCase();
  if (!["bounds-center", "origin", "custom"].includes(policy)) {
    throw new RangeError(`Política de âncora desconhecida: ${value}.`);
  }
  return policy;
}

function normalizedVector3(value, label) {
  if (!Array.isArray(value) || value.length !== 3) {
    throw new TypeError(`${label} inválida.`);
  }
  const result = value.map(Number);
  if (!result.every(Number.isFinite)) throw new TypeError(`${label} inválida.`);
  return result;
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
function integerBetween(value, minimum, maximum, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < minimum || number > maximum) {
    throw new RangeError(`${label} deve ser inteiro entre ${minimum} e ${maximum}.`);
  }
  return number;
}
function nonNegativeInteger(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) {
    throw new RangeError(`${label} deve ser inteiro não negativo.`);
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
