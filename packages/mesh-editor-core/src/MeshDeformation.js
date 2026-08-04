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
import {
  buildGeometricVertexIdentity,
  expandGeometricValues,
  geometricIndicesForVertices,
  renderVerticesForGeometricIndices
} from "../../mesh-geometric-identity/src/index.js";

const EPSILON = 1e-9;
const METRICS = Object.freeze(["euclidean", "geodesic", "viewer", "axis"]);
const FALLOFFS = Object.freeze([
  "linear", "smooth", "smoother", "gaussian", "elastic", "custom"
]);

export const DEFAULT_MESH_DEFORMATION_SETTINGS = Object.freeze({
  enabled: true,
  radius: 5,
  metric: "geodesic",
  axis: "x",
  falloff: "smooth",
  falloffExpression: "1-smoothstep(0,1,q)",
  variables: Object.freeze({}),
  elastic: Object.freeze({ damping: 2.5, frequency: 3 })
});

export function normalizeMeshDeformationSettings(value = {}) {
  const source = value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
  const metric = String(
    source.metric ?? DEFAULT_MESH_DEFORMATION_SETTINGS.metric
  ).toLowerCase();
  if (!METRICS.includes(metric)) {
    throw new RangeError(`Métrica de influência desconhecida: ${source.metric}.`);
  }
  const falloff = String(
    source.falloff ?? DEFAULT_MESH_DEFORMATION_SETTINGS.falloff
  ).toLowerCase();
  if (!FALLOFFS.includes(falloff)) {
    throw new RangeError(`Falloff desconhecido: ${source.falloff}.`);
  }
  const radius = Number(
    source.radius ?? DEFAULT_MESH_DEFORMATION_SETTINGS.radius
  );
  if (!Number.isFinite(radius) || radius < 0) {
    throw new RangeError("O raio de influência não pode ser negativo.");
  }
  const axis = String(
    source.axis ?? DEFAULT_MESH_DEFORMATION_SETTINGS.axis
  ).toLowerCase();
  if (!["x", "y", "z"].includes(axis)) {
    throw new RangeError(`Eixo de influência desconhecido: ${source.axis}.`);
  }
  const elasticSource = {
    ...DEFAULT_MESH_DEFORMATION_SETTINGS.elastic,
    ...(source.elastic ?? {})
  };
  const elastic = Object.freeze({
    damping: finiteOr(elasticSource.damping, 2.5),
    frequency: finiteOr(elasticSource.frequency, 3)
  });
  const variables = Object.freeze(normalizeVariables(source.variables));
  const falloffExpression = String(
    source.falloffExpression ??
    DEFAULT_MESH_DEFORMATION_SETTINGS.falloffExpression
  ).trim();
  if (!falloffExpression) {
    throw new Error("A expressão de falloff não pode ficar vazia.");
  }
  if (falloff === "custom") compileAffineExpression(falloffExpression);
  return Object.freeze({
    enabled: source.enabled === undefined
      ? DEFAULT_MESH_DEFORMATION_SETTINGS.enabled
      : Boolean(source.enabled),
    radius,
    metric,
    axis,
    falloff,
    falloffExpression,
    variables,
    elastic
  });
}

export function createMeshInfluenceField({
  descriptor,
  selectedIndices,
  objectWorldMatrix,
  frameQuaternion = [0, 0, 0, 1],
  enabled = true,
  radius = 0,
  metric = "geodesic",
  falloff = "smooth",
  falloffExpression = "1-smoothstep(0,1,q)",
  axis = "x",
  variables = {},
  elastic = {},
  geometricIdentity: providedGeometricIdentity = null
} = {}) {
  if (!descriptor?.positions) {
    throw new TypeError("O campo de influência exige um descritor de malha.");
  }
  const settings = normalizeMeshDeformationSettings({
    enabled,
    radius,
    metric,
    falloff,
    falloffExpression,
    axis,
    variables,
    elastic
  });
  const selected = normalizeIndices(
    selectedIndices,
    descriptor.positions.length
  );
  if (!selected.length) throw new Error("Selecione ao menos um vértice.");
  const worldMatrix = normalizeMatrix4(objectWorldMatrix);
  const positions = descriptor.positions.map((point, index) =>
    normalizeVector3(point, `positions[${index}]`).toArray()
  );
  const worldPoints = positions.map(point =>
    new THREE.Vector3().fromArray(point).applyMatrix4(worldMatrix)
  );
  const topology = buildMeshTopology({
    positions,
    indices: descriptor.indices ?? []
  });
  const geometricIdentity = providedGeometricIdentity ??
    buildGeometricVertexIdentity({
      positions,
      indices: descriptor.indices ?? [],
      vertexNeighbors: topology.vertexNeighbors
    });
  const selectedGeometric = geometricIndicesForVertices(
    geometricIdentity,
    selected
  );
  const selectedRender = renderVerticesForGeometricIndices(
    geometricIdentity,
    selectedGeometric
  );
  const selectedSet = new Set(selectedRender);
  const geometricWorldPoints = geometricIdentity.positions.map(point =>
    new THREE.Vector3().fromArray(point).applyMatrix4(worldMatrix)
  );
  const pivotWorld = selectedGeometric.reduce(
    (sum, index) => sum.add(geometricWorldPoints[index]),
    new THREE.Vector3()
  ).multiplyScalar(1 / selectedGeometric.length);
  const geometricDistances = settings.enabled && settings.radius > EPSILON
    ? influenceDistances({
        metric: settings.metric,
        positions: geometricIdentity.positions,
        worldPoints: geometricWorldPoints,
        selected: selectedGeometric,
        topology: { vertexNeighbors: geometricIdentity.vertexNeighbors },
        worldMatrix,
        frameQuaternion,
        pivotWorld: pivotWorld.toArray(),
        radius: settings.radius,
        axis: settings.axis
      })
    : new Float64Array(geometricIdentity.geometricVertexCount).fill(Infinity);
  for (const index of selectedGeometric) geometricDistances[index] = 0;
  const selectedGeometricSet = new Set(selectedGeometric);
  const affectedGeometric = [];
  for (let index = 0; index < geometricIdentity.geometricVertexCount; index += 1) {
    if (selectedGeometricSet.has(index) || (
      settings.enabled &&
      settings.radius > EPSILON &&
      geometricDistances[index] <= settings.radius
    )) affectedGeometric.push(index);
  }
  const affected = renderVerticesForGeometricIndices(
    geometricIdentity,
    affectedGeometric
  );
  const distances = expandGeometricValues(
    geometricIdentity,
    geometricDistances
  );
  const compiledFalloff = settings.falloff === "custom"
    ? compileAffineExpression(settings.falloffExpression)
    : null;
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(worldMatrix);
  const normals = Array.isArray(descriptor.normals) &&
    descriptor.normals.length === positions.length
      ? descriptor.normals
      : null;
  const weights = [];
  const contexts = [];

  affected.forEach((vertexIndex, order) => {
    const worldPoint = worldPoints[vertexIndex];
    const distance = selectedSet.has(vertexIndex) ? 0 : distances[vertexIndex];
    const q = settings.radius <= EPSILON
      ? (selectedSet.has(vertexIndex) ? 0 : Infinity)
      : distance / settings.radius;
    const framePoint = pointInFrame({
      pointWorld: worldPoint.toArray(),
      frameQuaternion,
      originWorld: pivotWorld.toArray()
    });
    const context = {
      ...settings.variables,
      vi: vertexIndex,
      gi: geometricIdentity.geometricIndexByVertex[vertexIndex],
      i: order + 1,
      count: affected.length,
      u: affected.length <= 1 ? 0 : order / (affected.length - 1),
      lx: positions[vertexIndex][0],
      ly: positions[vertexIndex][1],
      lz: positions[vertexIndex][2],
      wx: worldPoint.x,
      wy: worldPoint.y,
      wz: worldPoint.z,
      fx: framePoint[0],
      fy: framePoint[1],
      fz: framePoint[2],
      px: pivotWorld.x,
      py: pivotWorld.y,
      pz: pivotWorld.z,
      r: distance,
      q: Number.isFinite(q) ? q : 1,
      radius: settings.radius,
      selected: selectedSet.has(vertexIndex) ? 1 : 0,
      damping: settings.elastic.damping,
      frequency: settings.elastic.frequency
    };
    if (normals) {
      const normal = new THREE.Vector3()
        .fromArray(normals[vertexIndex])
        .applyMatrix3(normalMatrix)
        .normalize();
      context.nx = normal.x;
      context.ny = normal.y;
      context.nz = normal.z;
    } else {
      context.nx = 0;
      context.ny = 0;
      context.nz = 0;
    }
    const weight = selectedSet.has(vertexIndex)
      ? 1
      : evaluateFalloff({
          kind: settings.falloff,
          q,
          distance,
          context,
          compiled: compiledFalloff,
          damping: settings.elastic.damping,
          frequency: settings.elastic.frequency
        });
    context.w = weight;
    weights.push(weight);
    contexts.push(Object.freeze(context));
  });

  return Object.freeze({
    affectedIndices: Object.freeze(affected),
    selectedIndices: Object.freeze(selectedRender),
    selectedGeometricIndices: Object.freeze(selectedGeometric),
    weights: Object.freeze(weights),
    distances,
    contexts: Object.freeze(contexts),
    pivotWorld: Object.freeze(pivotWorld.toArray()),
    metric: settings.metric,
    falloff: settings.falloff,
    enabled: settings.enabled,
    radius: settings.radius,
    renderVertexCount: geometricIdentity.renderVertexCount,
    geometricVertexCount: geometricIdentity.geometricVertexCount
  });
}

export function transformLocalPositionsWithInfluenceInto({
  sourcePositions,
  targetPositions,
  affectedIndices,
  weights,
  objectWorldMatrix,
  deltaWorldMatrix,
  type,
  pivotWorld = [0, 0, 0],
  frameQuaternion = [0, 0, 0, 1]
} = {}) {
  if (!Array.isArray(sourcePositions) || !Array.isArray(targetPositions) ||
      sourcePositions.length !== targetPositions.length) {
    throw new TypeError(
      "As posições de origem e destino devem ter o mesmo comprimento."
    );
  }
  const indices = normalizeIndices(affectedIndices, sourcePositions.length);
  if (!Array.isArray(weights) || weights.length !== indices.length) {
    throw new TypeError("Os pesos devem corresponder aos vértices afetados.");
  }
  if (!["translate", "rotate", "scale", "move"].includes(type)) {
    throw new RangeError(`Transformação ponderada desconhecida: ${type}.`);
  }
  const normalizedType = type === "move" ? "translate" : type;
  const world = normalizeMatrix4(objectWorldMatrix);
  const inverseWorld = world.clone().invert();
  const delta = normalizeMatrix4(deltaWorldMatrix);
  const pivot = normalizeVector3(pivotWorld, "Pivô mundial");
  const frame = new THREE.Quaternion().fromArray(frameQuaternion).normalize();
  const frameInverse = frame.clone().invert();
  const translation = new THREE.Vector3().setFromMatrixPosition(delta);
  let localRotation = new THREE.Quaternion();
  let localScale = new THREE.Vector3(1, 1, 1);

  if (normalizedType !== "translate") {
    const frameMatrix = new THREE.Matrix4().makeRotationFromQuaternion(frame);
    const frameInverseMatrix = frameMatrix.clone().invert();
    const localOperation = frameInverseMatrix
      .multiply(new THREE.Matrix4().makeTranslation(-pivot.x, -pivot.y, -pivot.z))
      .multiply(delta)
      .multiply(new THREE.Matrix4().makeTranslation(pivot.x, pivot.y, pivot.z))
      .multiply(frameMatrix);
    localOperation.decompose(new THREE.Vector3(), localRotation, localScale);
    localRotation.normalize();
  }

  const source = new THREE.Vector3();
  const worldPoint = new THREE.Vector3();
  const framePoint = new THREE.Vector3();
  const result = new THREE.Vector3();
  for (let order = 0; order < indices.length; order += 1) {
    const index = indices[order];
    const weight = Number(weights[order]);
    if (!Number.isFinite(weight)) {
      throw new TypeError(`Peso inválido para o vértice ${index}.`);
    }
    source.fromArray(sourcePositions[index]);
    worldPoint.copy(source).applyMatrix4(world);

    if (normalizedType === "translate") {
      result.copy(worldPoint).addScaledVector(translation, weight);
    } else {
      framePoint.copy(worldPoint).sub(pivot).applyQuaternion(frameInverse);
      if (normalizedType === "rotate") {
        framePoint.applyQuaternion(weightedQuaternion(localRotation, weight));
      } else {
        framePoint.set(
          framePoint.x * weightedScaleFactor(localScale.x, weight),
          framePoint.y * weightedScaleFactor(localScale.y, weight),
          framePoint.z * weightedScaleFactor(localScale.z, weight)
        );
      }
      result.copy(framePoint).applyQuaternion(frame).add(pivot);
    }
    result.applyMatrix4(inverseWorld);
    const target = targetPositions[index];
    if (Array.isArray(target) && target.length === 3) {
      target[0] = result.x;
      target[1] = result.y;
      target[2] = result.z;
    } else {
      targetPositions[index] = result.toArray();
    }
  }
  return targetPositions;
}

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
  if (!Array.isArray(expressions) || expressions.length !== 3) {
    throw new TypeError("expressions deve conter X, Y e Z.");
  }
  const field = createMeshInfluenceField({
    descriptor,
    selectedIndices,
    objectWorldMatrix,
    frameQuaternion,
    enabled: true,
    radius,
    metric,
    falloff,
    falloffExpression,
    axis,
    variables,
    elastic
  });
  const worldMatrix = normalizeMatrix4(objectWorldMatrix);
  const inverseWorld = worldMatrix.clone().invert();
  const positions = descriptor.positions.map((point, index) =>
    normalizeVector3(point, `positions[${index}]`).toArray()
  );
  const worldPoints = positions.map(point =>
    new THREE.Vector3().fromArray(point).applyMatrix4(worldMatrix)
  );
  const compiled = expressions.map(compileAffineExpression);
  const next = positions.map(point => [...point]);

  field.affectedIndices.forEach((vertexIndex, order) => {
    const context = field.contexts[order];
    const framePoint = [context.fx, context.fy, context.fz];
    const value = constrainAffineValue({
      type: operation,
      value: compiled.map(expression =>
        evaluateCompiledAffineExpression(expression, {
          ...context,
          position: framePoint
        })
      ),
      constraint
    });
    const delta = affineDeltaWorld({
      type: operation,
      value,
      pivotWorld: field.pivotWorld,
      frameQuaternion
    });
    next[vertexIndex] = worldPoints[vertexIndex].clone()
      .applyMatrix4(new THREE.Matrix4().fromArray(delta))
      .applyMatrix4(inverseWorld)
      .toArray();
  });

  return Object.freeze({
    positions: Object.freeze(next.map(point => Object.freeze(point))),
    affectedIndices: field.affectedIndices,
    weights: field.weights,
    pivotWorld: field.pivotWorld,
    metric: field.metric,
    falloff: field.falloff
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

function weightedQuaternion(quaternion, weight) {
  const source = quaternion.clone().normalize();
  if (source.w < 0) source.set(-source.x, -source.y, -source.z, -source.w);
  const halfAngle = Math.acos(THREE.MathUtils.clamp(source.w, -1, 1));
  const sine = Math.sin(halfAngle);
  if (Math.abs(sine) <= EPSILON || Math.abs(weight) <= EPSILON) {
    return new THREE.Quaternion();
  }
  const axis = new THREE.Vector3(source.x, source.y, source.z)
    .multiplyScalar(1 / sine)
    .normalize();
  return new THREE.Quaternion().setFromAxisAngle(axis, 2 * halfAngle * weight);
}

function weightedScaleFactor(fullFactor, weight) {
  const factor = 1 + weight * (fullFactor - 1);
  if (Math.abs(factor) > 1e-6) return factor;
  return factor < 0 ? -1e-6 : 1e-6;
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
