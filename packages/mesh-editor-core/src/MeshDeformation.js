import * as THREE from "three";
import {
  compileAffineExpression,
  evaluateCompiledAffineExpression
} from "../../selection-operations/src/AffineProgram.js";
import {
  affineDeltaWorld,
  constrainAffineValue,
  pointInFrame
} from "./MeshEditMath.js";
import {
  buildMeshTopology,
  geodesicVertexDistances
} from "./MeshTopology.js";

const EPSILON = 1e-9;
const METRICS = Object.freeze(["euclidean", "geodesic", "viewer", "axis"]);
const FALLOFFS = Object.freeze([
  "linear", "smooth", "smoother", "gaussian", "elastic", "custom"
]);

export function applyMeshDeformation({
  descriptor,
  selectedIndices,
  objectWorldMatrix,
  frameQuaternion = [0, 0, 0, 1],
  constraint = "free",
  operation = "move",
  expressions = ["0", "0", "0"],
  variables = {},
  radius = 0,
  metric = "euclidean",
  falloff = "smooth",
  falloffExpression = "1-smoothstep(0,1,q)",
  axis = "x",
  elastic = {}
} = {}) {
  if (!descriptor?.positions) {
    throw new TypeError("A deformação exige um descritor de malha.");
  }
  if (!["move", "rotate", "scale"].includes(operation)) {
    throw new RangeError(`Operação procedural desconhecida: ${operation}.`);
  }
  const normalizedMetric = String(metric).toLowerCase();
  if (!METRICS.includes(normalizedMetric)) {
    throw new RangeError(`Métrica de influência desconhecida: ${metric}.`);
  }
  const normalizedFalloff = String(falloff).toLowerCase();
  if (!FALLOFFS.includes(normalizedFalloff)) {
    throw new RangeError(`Falloff desconhecido: ${falloff}.`);
  }
  const influenceRadius = Number(radius);
  if (!Number.isFinite(influenceRadius) || influenceRadius < 0) {
    throw new RangeError("O raio de influência não pode ser negativo.");
  }
  if (!Array.isArray(expressions) || expressions.length !== 3) {
    throw new TypeError("expressions deve conter X, Y e Z.");
  }
  const selected = normalizeIndices(
    selectedIndices,
    descriptor.positions.length
  );
  if (!selected.length) throw new Error("Selecione ao menos um vértice.");
  const worldMatrix = normalizeMatrix4(objectWorldMatrix);
  const inverseWorld = worldMatrix.clone().invert();
  const positions = descriptor.positions.map((point, index) =>
    normalizeVector3(point, `positions[${index}]`).toArray()
  );
  const worldPoints = positions.map(point =>
    new THREE.Vector3().fromArray(point).applyMatrix4(worldMatrix)
  );
  const selectedSet = new Set(selected);
  const pivotWorld = selected.reduce(
    (sum, index) => sum.add(worldPoints[index]),
    new THREE.Vector3()
  ).multiplyScalar(1 / selected.length);
  const topology = buildMeshTopology({
    positions,
    indices: descriptor.indices ?? []
  });
  const distances = influenceDistances({
    metric: normalizedMetric,
    positions,
    worldPoints,
    selected,
    topology,
    worldMatrix,
    frameQuaternion,
    pivotWorld: pivotWorld.toArray(),
    radius: influenceRadius,
    axis
  });
  const affected = [];
  for (let index = 0; index < positions.length; index += 1) {
    if (selectedSet.has(index) ||
        (influenceRadius > 0 && distances[index] <= influenceRadius)) {
      affected.push(index);
    }
  }
  const compiled = expressions.map(compileAffineExpression);
  const compiledFalloff = normalizedFalloff === "custom"
    ? compileAffineExpression(falloffExpression)
    : null;
  const next = positions.map(point => [...point]);
  const weightByIndex = new Map();
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(worldMatrix);
  const normals = Array.isArray(descriptor.normals) &&
    descriptor.normals.length === positions.length
      ? descriptor.normals
      : null;
  const customVariables = normalizeVariables(variables);
  const damping = finiteOr(elastic.damping, 2.5);
  const frequency = finiteOr(elastic.frequency, 3);

  affected.forEach((vertexIndex, order) => {
    const worldPoint = worldPoints[vertexIndex];
    const distance = selectedSet.has(vertexIndex) ? 0 : distances[vertexIndex];
    const q = influenceRadius <= EPSILON
      ? (selectedSet.has(vertexIndex) ? 0 : Infinity)
      : distance / influenceRadius;
    const baseContext = {
      ...customVariables,
      vi: vertexIndex,
      gi: vertexIndex,
      i: order + 1,
      count: affected.length,
      lx: positions[vertexIndex][0],
      ly: positions[vertexIndex][1],
      lz: positions[vertexIndex][2],
      wx: worldPoint.x,
      wy: worldPoint.y,
      wz: worldPoint.z,
      px: pivotWorld.x,
      py: pivotWorld.y,
      pz: pivotWorld.z,
      r: distance,
      q: Number.isFinite(q) ? q : 1,
      radius: influenceRadius,
      selected: selectedSet.has(vertexIndex) ? 1 : 0,
      damping,
      frequency
    };
    const framePoint = pointInFrame({
      pointWorld: worldPoint.toArray(),
      frameQuaternion,
      originWorld: pivotWorld.toArray()
    });
    baseContext.fx = framePoint[0];
    baseContext.fy = framePoint[1];
    baseContext.fz = framePoint[2];
    if (normals) {
      const normal = new THREE.Vector3()
        .fromArray(normals[vertexIndex])
        .applyMatrix3(normalMatrix)
        .normalize();
      baseContext.nx = normal.x;
      baseContext.ny = normal.y;
      baseContext.nz = normal.z;
    } else {
      baseContext.nx = 0;
      baseContext.ny = 0;
      baseContext.nz = 0;
    }
    const weight = selectedSet.has(vertexIndex)
      ? 1
      : evaluateFalloff({
          kind: normalizedFalloff,
          q,
          distance,
          context: baseContext,
          compiled: compiledFalloff,
          damping,
          frequency
        });
    baseContext.w = weight;
    weightByIndex.set(vertexIndex, weight);
    const value = constrainAffineValue({
      type: operation,
      value: compiled.map(expression =>
        evaluateCompiledAffineExpression(expression, {
          ...baseContext,
          position: framePoint
        })
      ),
      constraint
    });
    const delta = affineDeltaWorld({
      type: operation,
      value,
      pivotWorld: pivotWorld.toArray(),
      frameQuaternion
    });
    next[vertexIndex] = worldPoint.clone()
      .applyMatrix4(new THREE.Matrix4().fromArray(delta))
      .applyMatrix4(inverseWorld)
      .toArray();
  });

  return Object.freeze({
    positions: Object.freeze(next.map(point => Object.freeze(point))),
    affectedIndices: Object.freeze(affected),
    weights: Object.freeze(
      affected.map(index => weightByIndex.get(index) ?? 0)
    ),
    pivotWorld: Object.freeze(pivotWorld.toArray()),
    metric: normalizedMetric,
    falloff: normalizedFalloff
  });
}

export function evaluateMeshFalloff(kind, q, options = {}) {
  return evaluateFalloff({
    kind: String(kind).toLowerCase(),
    q: Number(q),
    distance: Number(options.distance ?? q),
    context: options.context ?? {},
    compiled: options.compiled ?? null,
    damping: finiteOr(options.damping, 2.5),
    frequency: finiteOr(options.frequency, 3)
  });
}

function influenceDistances({
  metric,
  positions,
  worldPoints,
  selected,
  topology,
  worldMatrix,
  frameQuaternion,
  pivotWorld,
  radius,
  axis
}) {
  if (metric === "geodesic") {
    return geodesicVertexDistances({
      positions,
      topology,
      seeds: selected,
      maxDistance: radius > 0 ? radius : Infinity,
      worldMatrix
    });
  }
  const result = new Float64Array(positions.length);
  const seedPoints = selected.map(index => worldPoints[index]);
  const frameSeeds = seedPoints.map(point => pointInFrame({
    pointWorld: point.toArray(),
    frameQuaternion,
    originWorld: pivotWorld
  }));
  const axisIndex = { x: 0, y: 1, z: 2 }[String(axis).toLowerCase()] ?? 0;
  worldPoints.forEach((point, index) => {
    if (metric === "euclidean") {
      result[index] = Math.min(...seedPoints.map(seed => point.distanceTo(seed)));
      return;
    }
    const framePoint = pointInFrame({
      pointWorld: point.toArray(),
      frameQuaternion,
      originWorld: pivotWorld
    });
    if (metric === "viewer") {
      result[index] = Math.min(...frameSeeds.map(seed =>
        Math.hypot(framePoint[0] - seed[0], framePoint[1] - seed[1])
      ));
      return;
    }
    result[index] = Math.min(...frameSeeds.map(seed =>
      Math.abs(framePoint[axisIndex] - seed[axisIndex])
    ));
  });
  return result;
}

function evaluateFalloff({
  kind,
  q,
  distance,
  context,
  compiled,
  damping,
  frequency
}) {
  const normalizedQ = THREE.MathUtils.clamp(Number(q), 0, 1);
  if (kind === "linear") return 1 - normalizedQ;
  if (kind === "smooth") return 1 - smoothstep(normalizedQ);
  if (kind === "smoother") return 1 - smootherstep(normalizedQ);
  if (kind === "gaussian") {
    const sigma = 0.35;
    return Math.exp(-(normalizedQ * normalizedQ) / (2 * sigma * sigma));
  }
  if (kind === "elastic") {
    return (1 - smoothstep(normalizedQ)) *
      Math.exp(-damping * normalizedQ) *
      Math.cos(frequency * Math.PI * normalizedQ);
  }
  if (kind === "custom") {
    if (!compiled) throw new Error("Falloff customizado sem expressão compilada.");
    return evaluateCompiledAffineExpression(compiled, {
      ...context,
      q: normalizedQ,
      r: distance,
      damping,
      frequency
    });
  }
  throw new RangeError(`Falloff desconhecido: ${kind}.`);
}

function smoothstep(value) {
  return value * value * (3 - 2 * value);
}

function smootherstep(value) {
  return value * value * value * (value * (value * 6 - 15) + 10);
}

function normalizeVariables(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result = {};
  for (const [name, raw] of Object.entries(value)) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
      throw new Error(`Nome de variável inválido: ${name}.`);
    }
    const number = Number(raw);
    if (!Number.isFinite(number)) {
      throw new Error(`Variável ${name} deve ser numérica.`);
    }
    result[name] = number;
  }
  return result;
}

function normalizeIndices(indices, count) {
  const result = [...new Set(Array.from(indices ?? [], Number))];
  for (const index of result) {
    if (!Number.isInteger(index) || index < 0 || index >= count) {
      throw new RangeError(`Índice de vértice inválido: ${index}.`);
    }
  }
  return result.sort((a, b) => a - b);
}

function normalizeMatrix4(value) {
  if (value?.isMatrix4) return value.clone();
  if (!Array.isArray(value) || value.length !== 16) {
    throw new TypeError("objectWorldMatrix deve conter 16 valores.");
  }
  const values = value.map(Number);
  if (!values.every(Number.isFinite)) {
    throw new TypeError("objectWorldMatrix contém valor inválido.");
  }
  return new THREE.Matrix4().fromArray(values);
}

function normalizeVector3(value, label) {
  if (!Array.isArray(value) || value.length !== 3) {
    throw new TypeError(`${label} deve conter três valores.`);
  }
  const values = value.map(Number);
  if (!values.every(Number.isFinite)) {
    throw new TypeError(`${label} contém valor inválido.`);
  }
  return new THREE.Vector3().fromArray(values);
}

function finiteOr(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
