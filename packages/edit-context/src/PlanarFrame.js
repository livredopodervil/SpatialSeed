import {
  resolvePlacementFrame
} from "../../math-affine/src/index.js";

const EPSILON = 1e-10;
const DEG_TO_RAD = Math.PI / 180;
const NORMALIZED_FRAMES = new WeakSet();

export function normalizePlanarFrame(frame = {}, {
  source = frame?.source ?? "explicit"
} = {}) {
  if (!frame || typeof frame !== "object" || Array.isArray(frame)) {
    throw new TypeError("Plano deve ser um objeto.");
  }
  if (Array.isArray(frame.points)) {
    return planarFrameFromPoints(frame.points, { source });
  }
  const origin = vector3(frame.origin ?? [0, 0, 0], "origem do plano");
  const normal = vector3(frame.normal, "normal do plano");
  const tangent = vector3(
    frame.xAxis ?? frame.tangent,
    "eixo X do plano"
  );
  const resolved = resolvePlacementFrame({
    origin,
    normal,
    tangent
  });
  return freezeFrame({
    origin: resolved.origin,
    xAxis: resolved.tangent,
    yAxis: resolved.bitangent,
    normal: resolved.normal,
    quaternion: resolved.rotation,
    source
  });
}

export function planarFrameFromPoints(points, {
  source = "three-points"
} = {}) {
  if (!Array.isArray(points) || points.length !== 3) {
    throw new TypeError("O plano por pontos exige exatamente três pontos.");
  }
  const resolved = resolvePlacementFrame({ points });
  return freezeFrame({
    origin: resolved.origin,
    xAxis: resolved.tangent,
    yAxis: resolved.bitangent,
    normal: resolved.normal,
    quaternion: resolved.rotation,
    source: sourceWithDetails(source, {
      points: points.map((point, index) =>
        vector3(point, `ponto ${index + 1}`)
      )
    })
  });
}

export function inclinePlanarFrame(frame, {
  inclinationDegrees = 0,
  azimuthDegrees = 0,
  source = "object-inclination"
} = {}) {
  const base = normalizePlanarFrame(frame);
  const inclination = finite(
    inclinationDegrees,
    "inclinação do plano"
  );
  const azimuth = finite(azimuthDegrees, "azimute do plano");
  const azimuthRadians = azimuth * DEG_TO_RAD;
  const inclinationRadians = inclination * DEG_TO_RAD;
  const x = base.xAxis;
  const y = base.yAxis;
  const n = base.normal;
  const slopeDirection = normalize3(add3(
    scale3(x, Math.cos(azimuthRadians)),
    scale3(y, Math.sin(azimuthRadians))
  ));
  const contourDirection = normalize3(add3(
    scale3(x, -Math.sin(azimuthRadians)),
    scale3(y, Math.cos(azimuthRadians))
  ));
  const inclinedX = normalize3(add3(
    scale3(slopeDirection, Math.cos(inclinationRadians)),
    scale3(n, Math.sin(inclinationRadians))
  ));
  const inclinedNormal = normalize3(cross3(inclinedX, contourDirection));
  return normalizePlanarFrame({
    origin: base.origin,
    xAxis: inclinedX,
    normal: inclinedNormal
  }, {
    source: sourceWithDetails(source, {
      base: base.source,
      inclinationDegrees: inclination,
      azimuthDegrees: canonicalDegrees(azimuth)
    })
  });
}

export function planarFrameCoordinates(frame, point) {
  const normalized = knownPlanarFrame(frame);
  const delta = subtract3(
    vector3(point, "ponto no plano"),
    normalized.origin
  );
  return Object.freeze([
    dot3(delta, normalized.xAxis),
    dot3(delta, normalized.yAxis),
    dot3(delta, normalized.normal)
  ]);
}

export function planarFramePoint(frame, coordinates) {
  const normalized = knownPlanarFrame(frame);
  const [x, y, z] = vector3(coordinates, "coordenadas do plano");
  return Object.freeze(add3(
    normalized.origin,
    add3(
      scale3(normalized.xAxis, x),
      add3(
        scale3(normalized.yAxis, y),
        scale3(normalized.normal, z)
      )
    )
  ));
}

function freezeFrame({
  origin,
  xAxis,
  yAxis,
  normal,
  quaternion,
  source
}) {
  const frame = Object.freeze({
    origin: Object.freeze([...origin]),
    xAxis: Object.freeze([...xAxis]),
    yAxis: Object.freeze([...yAxis]),
    normal: Object.freeze([...normal]),
    quaternion: Object.freeze([...quaternion]),
    source: freezeValue(source)
  });
  NORMALIZED_FRAMES.add(frame);
  return frame;
}

function knownPlanarFrame(frame) {
  return frame && typeof frame === "object" &&
    NORMALIZED_FRAMES.has(frame)
    ? frame
    : normalizePlanarFrame(frame);
}

function sourceWithDetails(source, details) {
  return {
    type: typeof source === "string"
      ? source
      : String(source?.type ?? "derived"),
    ...(source && typeof source === "object" && !Array.isArray(source)
      ? structuredClone(source)
      : {}),
    ...structuredClone(details)
  };
}

function freezeValue(value) {
  if (value && typeof value === "object") {
    return Object.freeze(structuredClone(value));
  }
  return value === undefined ? null : value;
}

function vector3(value, label) {
  if (!Array.isArray(value) || value.length !== 3) {
    throw new TypeError(`${label} deve conter três valores.`);
  }
  const result = value.map(Number);
  if (!result.every(Number.isFinite)) {
    throw new TypeError(`${label} contém valor inválido.`);
  }
  return result;
}

function finite(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new TypeError(`${label} deve ser finita.`);
  }
  return number;
}

function canonicalDegrees(value) {
  const result = ((Number(value) % 360) + 360) % 360;
  return Object.is(result, -0) ? 0 : result;
}

function dot3(left, right) {
  return left[0] * right[0] +
    left[1] * right[1] +
    left[2] * right[2];
}

function add3(left, right) {
  return [
    left[0] + right[0],
    left[1] + right[1],
    left[2] + right[2]
  ];
}

function subtract3(left, right) {
  return [
    left[0] - right[0],
    left[1] - right[1],
    left[2] - right[2]
  ];
}

function scale3(vector, factor) {
  return vector.map(value => value * factor);
}

function cross3(left, right) {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0]
  ];
}

function normalize3(vector) {
  const length = Math.hypot(...vector);
  if (length <= EPSILON) {
    throw new RangeError("Não foi possível construir o referencial do plano.");
  }
  return vector.map(value => value / length);
}
