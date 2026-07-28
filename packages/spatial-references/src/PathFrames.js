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
        seamAngle * (index / ringCount)
      );
    }
  }
  const twist = THREE.MathUtils.degToRad(finite(twistDegrees, "twistDegrees"));
  if (Math.abs(twist) > 1e-14) {
    for (let index = 0; index < ringCount; index += 1) {
      const progress = closed ? index / ringCount : index / (ringCount - 1);
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

function integerAtLeast(value, minimum, name) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < minimum) {
    throw new RangeError(`${name} deve ser inteiro maior ou igual a ${minimum}.`);
  }
  return number;
}
