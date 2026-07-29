import * as THREE from "three";
import {
  curveFromDescriptor
} from "../../geometry-registry/src/index.js?build=20260728-0039d";
import {
  normalizePointList,
  removeConsecutiveDuplicates,
  stripRepeatedEndpoint
} from "./ReferenceGeometry.js";

export function createPathCurve(points, {
  closed = false,
  curveType = "centripetal",
  tension = 0.5
} = {}) {
  let normalized = removeConsecutiveDuplicates(
    normalizePointList(points, 2, "caminho")
  );
  if (closed) normalized = stripRepeatedEndpoint(normalized);
  if (normalized.length < 2) {
    throw new Error("O caminho precisa de ao menos dois pontos distintos.");
  }
  if (closed && normalized.length < 3) {
    throw new Error("Um caminho fechado exige ao menos três pontos distintos.");
  }
  const vectors = normalized.map(point => new THREE.Vector3().fromArray(point));
  const normalizedCurveType = String(curveType ?? "centripetal").toLowerCase();
  if (normalizedCurveType === "bezier") {
    if (closed) {
      throw new Error("O caminho Bézier distribuído deve ser aberto.");
    }
    if ((normalized.length - 1) % 3 !== 0) {
      throw new Error("O caminho Bézier exige 3n+1 pontos de controle.");
    }
    return curveFromDescriptor({
      points: normalized,
      closed: Boolean(closed),
      curveType: normalizedCurveType,
      tension: finite(tension, "tension")
    });
  }
  if (vectors.length === 2) {
    return new THREE.LineCurve3(vectors[0], vectors[1]);
  }
  if (normalizedCurveType === "polyline") {
    return curveFromDescriptor({
      points: normalized,
      closed: Boolean(closed),
      curveType: normalizedCurveType,
      tension: finite(tension, "tension")
    });
  }
  return new THREE.CatmullRomCurve3(
    vectors,
    Boolean(closed),
    normalizeCurveType(normalizedCurveType),
    finite(tension, "tension")
  );
}

export function rotationMinimizingFrames({
  points,
  segments = 32,
  closed = false,
  curveType = "centripetal",
  tension = 0.5,
  initialNormal = null,
  twistDegrees = 0
} = {}) {
  const count = integerAtLeast(segments, 1, "segments");
  const curve = createPathCurve(points, { closed, curveType, tension });
  const ringCount = closed ? Math.max(3, count) : count + 1;
  const parameters = Array.from({ length: ringCount }, (_, index) =>
    closed ? index / ringCount : index / (ringCount - 1)
  );
  return framesAtParameters({
    curve,
    parameters,
    closed,
    initialNormal,
    twistDegrees
  });
}

export function samplePathFramesBySpacing({
  points,
  spacing,
  maximumSamples = 10000,
  closed = false,
  curveType = "centripetal",
  tension = 0.5,
  initialNormal = null,
  twistDegrees = 0
} = {}) {
  const distance = positive(spacing, "spacing");
  const limit = integerAtLeast(maximumSamples, 1, "maximumSamples");
  const curve = createPathCurve(points, { closed, curveType, tension });
  const length = curve.getLength();
  const epsilon = Math.max(1e-12, length * 1e-12);
  const estimatedCount = closed
    ? Math.max(1, Math.ceil((length - epsilon) / distance))
    : Math.floor((length + epsilon) / distance) + 1;
  const requestedCount = Number.isSafeInteger(estimatedCount)
    ? estimatedCount
    : Number.MAX_SAFE_INTEGER;
  const sampleCount = Math.min(requestedCount, limit);
  const parameters = Array.from({ length: sampleCount }, (_, index) =>
    length > epsilon
      ? THREE.MathUtils.clamp((index * distance) / length, 0, 1)
      : 0
  );
  const frames = framesAtParameters({
    curve,
    parameters,
    closed,
    initialNormal,
    twistDegrees
  });
  return Object.freeze({
    ...frames,
    length,
    spacing: distance,
    requestedCount,
    sampleCount,
    truncated: requestedCount !== sampleCount
  });
}

export function samplePathFrameTailBySpacing({
  points,
  spacing,
  maximumSamples = 10000,
  startIndex = 0,
  previousFrame = null,
  closed = false,
  curveType = "centripetal",
  tension = 0.5,
  initialNormal = null,
  twistDegrees = 0
} = {}) {
  const distance = positive(spacing, "spacing");
  const limit = integerAtLeast(maximumSamples, 1, "maximumSamples");
  const requestedStart = integerAtLeast(startIndex, 0, "startIndex");
  const isClosed = Boolean(closed);
  const twist = finite(twistDegrees, "twistDegrees");
  if (requestedStart > 0 && (isClosed || Math.abs(twist) > 1e-14)) {
    throw new Error(
      "Amostragem parcial exige caminho aberto e sem torção total."
    );
  }
  const curve = createPathCurve(points, {
    closed: isClosed,
    curveType,
    tension
  });
  const length = curve.getLength();
  const epsilon = Math.max(1e-12, length * 1e-12);
  const estimatedCount = isClosed
    ? Math.max(1, Math.ceil((length - epsilon) / distance))
    : Math.floor((length + epsilon) / distance) + 1;
  const requestedCount = Number.isSafeInteger(estimatedCount)
    ? estimatedCount
    : Number.MAX_SAFE_INTEGER;
  const sampleCount = Math.min(requestedCount, limit);
  const resolvedStart = Math.min(requestedStart, sampleCount);
  const parameters = Array.from(
    { length: sampleCount - resolvedStart },
    (_, offset) => {
      const index = resolvedStart + offset;
      return length > epsilon
        ? THREE.MathUtils.clamp((index * distance) / length, 0, 1)
        : 0;
    }
  );
  const frames = resolvedStart === 0
    ? framesAtParameters({
        curve,
        parameters,
        closed: isClosed,
        initialNormal,
        twistDegrees: twist
      })
    : framesAfterPrevious({
        curve,
        parameters,
        previousFrame
      });
  return Object.freeze({
    ...frames,
    length,
    spacing: distance,
    requestedCount,
    sampleCount,
    startIndex: resolvedStart,
    evaluatedCount: parameters.length,
    truncated: requestedCount !== sampleCount
  });
}

function framesAtParameters({
  curve,
  parameters,
  closed,
  initialNormal,
  twistDegrees
}) {
  const ringCount = parameters.length;
  if (!ringCount) {
    throw new RangeError("A amostragem do caminho exige ao menos um frame.");
  }
  const positions = parameters.map(value => curve.getPointAt(value));
  const tangents = parameters.map(value => safeTangent(curve, value));
  const normals = [];
  const binormals = [];
  const firstNormal = chooseInitialNormal(
    tangents[0],
    initialNormal
  );
  normals.push(firstNormal);
  binormals.push(new THREE.Vector3().crossVectors(tangents[0], firstNormal).normalize());
  for (let index = 1; index < ringCount; index += 1) {
    const previousTangent = tangents[index - 1];
    const tangent = tangents[index];
    const quaternion = minimalRotation(previousTangent, tangent);
    const normal = normals[index - 1].clone().applyQuaternion(quaternion);
    orthogonalize(normal, tangent);
    normals.push(normal);
    binormals.push(new THREE.Vector3().crossVectors(tangent, normal).normalize());
  }
  if (closed) {
    const endTangent = safeTangent(curve, 1);
    const endNormal = normals.at(-1).clone().applyQuaternion(
      minimalRotation(tangents.at(-1), endTangent)
    );
    orthogonalize(endNormal, tangents[0]);
    const seamAngle = signedAngleAroundAxis(endNormal, normals[0], tangents[0]);
    for (let index = 1; index < ringCount; index += 1) {
      rotateFrame(
        normals[index],
        binormals[index],
        tangents[index],
        seamAngle * (parameters[index] ?? index / ringCount)
      );
    }
  }
  const twist = THREE.MathUtils.degToRad(finite(twistDegrees, "twistDegrees"));
  if (Math.abs(twist) > 1e-14) {
    for (let index = 0; index < ringCount; index += 1) {
      const progress = parameters[index] ?? 0;
      rotateFrame(
        normals[index],
        binormals[index],
        tangents[index],
        twist * progress
      );
    }
  }
  const quaternions = tangents.map((tangent, index) => {
    const basis = new THREE.Matrix4().makeBasis(
      normals[index],
      binormals[index],
      tangent
    );
    return new THREE.Quaternion().setFromRotationMatrix(basis);
  });
  return Object.freeze({
    curve,
    closed: Boolean(closed),
    positions: Object.freeze(positions.map(vector => Object.freeze(vector.toArray()))),
    tangents: Object.freeze(tangents.map(vector => Object.freeze(vector.toArray()))),
    normals: Object.freeze(normals.map(vector => Object.freeze(vector.toArray()))),
    binormals: Object.freeze(binormals.map(vector => Object.freeze(vector.toArray()))),
    quaternions: Object.freeze(quaternions.map(value => Object.freeze(value.toArray())))
  });
}

function framesAfterPrevious({ curve, parameters, previousFrame }) {
  if (!parameters.length) return emptyFrames(curve);
  const previousTangent = frameVector(
    previousFrame?.tangent,
    "tangente anterior"
  );
  const previousNormal = frameVector(
    previousFrame?.normal,
    "normal anterior"
  );
  const positions = parameters.map(value => curve.getPointAt(value));
  const tangents = parameters.map(value => safeTangent(curve, value));
  const normals = [];
  const binormals = [];
  const firstNormal = previousNormal
    .applyQuaternion(minimalRotation(previousTangent, tangents[0]));
  orthogonalize(firstNormal, tangents[0]);
  if (firstNormal.lengthSq() < 1e-18) {
    firstNormal.copy(chooseInitialNormal(tangents[0], null));
  }
  normals.push(firstNormal);
  binormals.push(
    new THREE.Vector3()
      .crossVectors(tangents[0], firstNormal)
      .normalize()
  );
  for (let index = 1; index < tangents.length; index += 1) {
    const normal = normals[index - 1]
      .clone()
      .applyQuaternion(
        minimalRotation(tangents[index - 1], tangents[index])
      );
    orthogonalize(normal, tangents[index]);
    normals.push(normal);
    binormals.push(
      new THREE.Vector3()
        .crossVectors(tangents[index], normal)
        .normalize()
    );
  }
  return frozenFrames({
    curve,
    closed: false,
    positions,
    tangents,
    normals,
    binormals
  });
}

function emptyFrames(curve) {
  return Object.freeze({
    curve,
    closed: false,
    positions: Object.freeze([]),
    tangents: Object.freeze([]),
    normals: Object.freeze([]),
    binormals: Object.freeze([]),
    quaternions: Object.freeze([])
  });
}

function frozenFrames({
  curve,
  closed,
  positions,
  tangents,
  normals,
  binormals
}) {
  const quaternions = tangents.map((tangent, index) => {
    const basis = new THREE.Matrix4().makeBasis(
      normals[index],
      binormals[index],
      tangent
    );
    return new THREE.Quaternion().setFromRotationMatrix(basis);
  });
  return Object.freeze({
    curve,
    closed: Boolean(closed),
    positions: frozenVectors(positions),
    tangents: frozenVectors(tangents),
    normals: frozenVectors(normals),
    binormals: frozenVectors(binormals),
    quaternions: Object.freeze(
      quaternions.map(value => Object.freeze(value.toArray()))
    )
  });
}

function frozenVectors(vectors) {
  return Object.freeze(
    vectors.map(vector => Object.freeze(vector.toArray()))
  );
}

function frameVector(value, name) {
  if (!Array.isArray(value) || value.length !== 3) {
    throw new TypeError(`${name} deve conter x, y e z.`);
  }
  const vector = new THREE.Vector3().fromArray(value.map(Number));
  if (![vector.x, vector.y, vector.z].every(Number.isFinite) ||
      vector.lengthSq() < 1e-18) {
    throw new TypeError(`${name} inválida.`);
  }
  return vector.normalize();
}

export function samplePathFrames({
  points,
  count,
  closed = false,
  curveType = "centripetal",
  tension = 0.5,
  initialNormal = null,
  twistDegrees = 0
} = {}) {
  const samples = integerAtLeast(count, 1, "count");
  if (samples === 1) {
    const frames = rotationMinimizingFrames({
      points,
      segments: 1,
      closed: false,
      curveType,
      tension,
      initialNormal,
      twistDegrees: 0
    });
    return Object.freeze({
      positions: Object.freeze([frames.positions[0]]),
      tangents: Object.freeze([frames.tangents[0]]),
      normals: Object.freeze([frames.normals[0]]),
      binormals: Object.freeze([frames.binormals[0]]),
      quaternions: Object.freeze([frames.quaternions[0]])
    });
  }
  return rotationMinimizingFrames({
    points,
    segments: closed ? samples : samples - 1,
    closed,
    curveType,
    tension,
    initialNormal,
    twistDegrees
  });
}

function safeTangent(curve, value) {
  const tangent = curve.getTangentAt(value);
  if (tangent.lengthSq() < 1e-18) {
    const epsilon = 1e-5;
    const left = curve.getPointAt(Math.max(0, value - epsilon));
    const right = curve.getPointAt(Math.min(1, value + epsilon));
    tangent.copy(right).sub(left);
  }
  if (tangent.lengthSq() < 1e-18) {
    throw new Error("O caminho contém trecho sem direção definida.");
  }
  return tangent.normalize();
}

function chooseInitialNormal(tangent, candidate) {
  const normal = candidate
    ? new THREE.Vector3().fromArray(candidate)
    : defaultAxisFor(tangent);
  orthogonalize(normal, tangent);
  if (normal.lengthSq() < 1e-18) {
    const fallback = defaultAxisFor(tangent);
    orthogonalize(fallback, tangent);
    return fallback;
  }
  return normal;
}

function defaultAxisFor(tangent) {
  const axes = [
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(0, 0, 1)
  ];
  axes.sort((left, right) =>
    Math.abs(left.dot(tangent)) - Math.abs(right.dot(tangent))
  );
  return axes[0];
}

function orthogonalize(vector, tangent) {
  vector.addScaledVector(tangent, -vector.dot(tangent));
  if (vector.lengthSq() > 1e-18) vector.normalize();
  return vector;
}

function minimalRotation(from, to) {
  const dot = THREE.MathUtils.clamp(from.dot(to), -1, 1);
  if (dot > 1 - 1e-12) return new THREE.Quaternion();
  if (dot < -1 + 1e-12) {
    const axis = defaultAxisFor(from).cross(from).normalize();
    return new THREE.Quaternion().setFromAxisAngle(axis, Math.PI);
  }
  return new THREE.Quaternion().setFromUnitVectors(from, to);
}

function rotateFrame(normal, binormal, tangent, angle) {
  const quaternion = new THREE.Quaternion().setFromAxisAngle(tangent, angle);
  normal.applyQuaternion(quaternion).normalize();
  binormal.crossVectors(tangent, normal).normalize();
}

function signedAngleAroundAxis(from, to, axis) {
  const cross = new THREE.Vector3().crossVectors(from, to);
  return Math.atan2(axis.dot(cross), THREE.MathUtils.clamp(from.dot(to), -1, 1));
}

function normalizeCurveType(value) {
  const type = String(value ?? "centripetal").toLowerCase();
  if (!["centripetal", "chordal", "catmullrom"].includes(type)) {
    throw new RangeError(`Interpolação desconhecida: ${value}.`);
  }
  return type;
}

function finite(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new TypeError(`${name} inválido.`);
  return number;
}

function positive(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    throw new RangeError(`${name} deve ser positivo.`);
  }
  return number;
}

function integerAtLeast(value, minimum, name) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < minimum) {
    throw new RangeError(`${name} deve ser inteiro maior ou igual a ${minimum}.`);
  }
  return number;
}
