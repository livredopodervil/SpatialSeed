import * as THREE from "three";

const EPSILON = 1e-9;

export function cameraFrameQuaternion(cameraQuaternion) {
  return normalizedQuaternion(cameraQuaternion, "Orientação do viewer");
}

export function assertInvertibleWorldMatrix(worldMatrix) {
  const matrix = matrix4(worldMatrix, "Matriz mundial do objeto");
  const determinant = new THREE.Matrix3()
    .setFromMatrix4(matrix)
    .determinant();
  if (Math.abs(determinant) <= EPSILON) {
    throw new RangeError("O objeto possui matriz mundial não invertível.");
  }
  return matrix.toArray();
}

export function composeRotationFrame(rotations = []) {
  const result = new THREE.Quaternion();
  for (const [index, rotation] of rotations.entries()) {
    result.multiply(new THREE.Quaternion().fromArray(
      normalizedQuaternion(rotation, `Rotação local ${index}`)
    ));
  }
  return result.normalize().toArray();
}

export function selectedVertexPivotWorld({
  positions,
  selectedIndices,
  objectWorldMatrix
}) {
  const indices = normalizedIndices(selectedIndices, positions.length);
  if (!indices.length) return null;
  const world = matrix4(objectWorldMatrix, "Matriz mundial do objeto");
  const pivot = new THREE.Vector3();
  for (const index of indices) {
    pivot.add(new THREE.Vector3().fromArray(positions[index]).applyMatrix4(world));
  }
  return pivot.multiplyScalar(1 / indices.length).toArray();
}

export function affineDeltaWorld({
  type,
  value,
  pivotWorld = [0, 0, 0],
  frameQuaternion = [0, 0, 0, 1]
}) {
  const frame = new THREE.Matrix4().makeRotationFromQuaternion(
    new THREE.Quaternion().fromArray(
      normalizedQuaternion(frameQuaternion, "Orientação do referencial")
    )
  );
  const frameInverse = frame.clone().invert();
  const pivot = vector3(pivotWorld, "Pivô");

  if (type === "move") {
    const delta = vector3(value, "Deslocamento")
      .applyMatrix4(frame)
      .sub(new THREE.Vector3().setFromMatrixPosition(frame));
    return new THREE.Matrix4().makeTranslation(
      delta.x,
      delta.y,
      delta.z
    ).toArray();
  }

  let operation;
  if (type === "rotate") {
    const [x, y, z] = vector3(value, "Rotação").toArray()
      .map(component => component * Math.PI / 180);
    operation = new THREE.Matrix4().makeRotationFromEuler(
      new THREE.Euler(x, y, z, "XYZ")
    );
  } else if (type === "scale") {
    const factors = vector3(value, "Escala");
    for (const component of factors.toArray()) {
      if (Math.abs(component) <= EPSILON) {
        throw new RangeError("A escala de vértices não pode ser nula.");
      }
    }
    operation = new THREE.Matrix4().makeScale(
      factors.x,
      factors.y,
      factors.z
    );
  } else {
    throw new RangeError(`Operação afim de malha desconhecida: ${type}.`);
  }

  return new THREE.Matrix4()
    .makeTranslation(pivot.x, pivot.y, pivot.z)
    .multiply(frame)
    .multiply(operation)
    .multiply(frameInverse)
    .multiply(new THREE.Matrix4().makeTranslation(-pivot.x, -pivot.y, -pivot.z))
    .toArray();
}

export function transformLocalPositions({
  positions,
  selectedIndices,
  objectWorldMatrix,
  deltaWorldMatrix
}) {
  const next = positions.map(point =>
    vector3(point, "Posição de vértice").toArray()
  );
  return transformLocalPositionsInto({
    sourcePositions: positions,
    targetPositions: next,
    selectedIndices,
    objectWorldMatrix,
    deltaWorldMatrix
  });
}

export function transformLocalPositionsInto({
  sourcePositions,
  targetPositions,
  selectedIndices,
  objectWorldMatrix,
  deltaWorldMatrix
}) {
  if (
    !Array.isArray(sourcePositions) ||
    !Array.isArray(targetPositions) ||
    sourcePositions.length !== targetPositions.length
  ) {
    throw new TypeError(
      "As posições de origem e destino devem ter o mesmo comprimento."
    );
  }
  const indices = normalizedIndices(
    selectedIndices,
    sourcePositions.length
  );
  if (!indices.length) return targetPositions;

  const world = new THREE.Matrix4().fromArray(
    assertInvertibleWorldMatrix(objectWorldMatrix)
  );
  const inverseWorld = world.clone().invert();
  const delta = matrix4(deltaWorldMatrix, "Transformação mundial");
  const transformed = new THREE.Vector3();

  for (const index of indices) {
    transformed
      .copy(vector3(
        sourcePositions[index],
        `Posição de vértice ${index}`
      ))
      .applyMatrix4(world)
      .applyMatrix4(delta)
      .applyMatrix4(inverseWorld);
    const target = targetPositions[index];
    if (Array.isArray(target) && target.length === 3) {
      target[0] = transformed.x;
      target[1] = transformed.y;
      target[2] = transformed.z;
    } else {
      targetPositions[index] = transformed.toArray();
    }
  }
  return targetPositions;
}

export function snapWorldPointToFrameGrid({
  pointWorld,
  frameQuaternion = [0, 0, 0, 1],
  step
}) {
  const spacing = Number(step);
  if (!Number.isFinite(spacing) || spacing <= 0) {
    throw new RangeError("O passo da grade deve ser positivo.");
  }
  const frame = new THREE.Quaternion().fromArray(
    normalizedQuaternion(frameQuaternion, "Orientação do referencial")
  );
  const inverse = frame.clone().invert();
  const coordinates = vector3(pointWorld, "Ponto mundial")
    .applyQuaternion(inverse);
  coordinates.set(
    Math.round(coordinates.x / spacing) * spacing,
    Math.round(coordinates.y / spacing) * spacing,
    Math.round(coordinates.z / spacing) * spacing
  );
  return coordinates.applyQuaternion(frame).toArray();
}

export function translatePivotToWorld({
  positions,
  selectedIndices,
  objectWorldMatrix,
  targetWorld
}) {
  const pivot = selectedVertexPivotWorld({
    positions,
    selectedIndices,
    objectWorldMatrix
  });
  if (!pivot) return positions.map(point => [...point]);
  const target = vector3(targetWorld, "Posição de destino");
  const delta = target.sub(new THREE.Vector3().fromArray(pivot));
  return transformLocalPositions({
    positions,
    selectedIndices,
    objectWorldMatrix,
    deltaWorldMatrix: new THREE.Matrix4().makeTranslation(
      delta.x,
      delta.y,
      delta.z
    ).toArray()
  });
}


export const MESH_CONSTRAINTS = Object.freeze([
  "free", "none", "x", "y", "z", "xy", "xz", "yz"
]);

export function normalizeMeshConstraint(value = "free") {
  const normalized = String(value ?? "free").toLowerCase();
  if (!MESH_CONSTRAINTS.includes(normalized)) {
    throw new RangeError(`Restrição de malha desconhecida: ${value}.`);
  }
  return normalized;
}

export function meshConstraintMask(value = "free") {
  const constraint = normalizeMeshConstraint(value);
  return Object.freeze([
    constraint === "free" || constraint.includes("x") ? 1 : 0,
    constraint === "free" || constraint.includes("y") ? 1 : 0,
    constraint === "free" || constraint.includes("z") ? 1 : 0
  ]);
}

export function constrainAffineValue({ type, value, constraint = "free" } = {}) {
  const mask = meshConstraintMask(constraint);
  const input = vector3(value, `Valor ${type}`).toArray();
  if (type === "move" || type === "rotate") {
    return input.map((component, index) => component * mask[index]);
  }
  if (type === "scale") {
    return input.map((component, index) => mask[index] ? component : 1);
  }
  throw new RangeError(`Operação afim de malha desconhecida: ${type}.`);
}

export function projectWorldDeltaToConstraint({
  deltaWorld,
  frameQuaternion = [0, 0, 0, 1],
  constraint = "free"
} = {}) {
  const mask = meshConstraintMask(constraint);
  const frame = new THREE.Quaternion().fromArray(
    normalizedQuaternion(frameQuaternion, "Orientação do referencial")
  );
  const inverse = frame.clone().invert();
  const original = vector3(deltaWorld, "Deslocamento mundial");
  const local = original.clone().applyQuaternion(inverse);
  const projectedLocal = new THREE.Vector3(
    local.x * mask[0],
    local.y * mask[1],
    local.z * mask[2]
  );
  const projected = projectedLocal.applyQuaternion(frame);
  const residual = original.clone().sub(projected);
  return Object.freeze({
    deltaWorld: Object.freeze(projected.toArray()),
    residualWorld: Object.freeze(residual.toArray()),
    residualLength: residual.length()
  });
}

export function constrainWorldDeltaMatrix({
  type,
  deltaWorldMatrix,
  pivotWorld = [0, 0, 0],
  frameQuaternion = [0, 0, 0, 1],
  constraint = "free"
} = {}) {
  const normalizedConstraint = normalizeMeshConstraint(constraint);
  const delta = matrix4(deltaWorldMatrix, "Transformação mundial");
  if (normalizedConstraint === "free") return delta.toArray();
  const pivot = vector3(pivotWorld, "Pivô");
  const frameQuaternionObject = new THREE.Quaternion().fromArray(
    normalizedQuaternion(frameQuaternion, "Orientação do referencial")
  );
  const frame = new THREE.Matrix4().makeRotationFromQuaternion(frameQuaternionObject);
  const frameInverse = frame.clone().invert();

  if (type === "move") {
    const translation = new THREE.Vector3().setFromMatrixPosition(delta);
    const projected = projectWorldDeltaToConstraint({
      deltaWorld: translation.toArray(),
      frameQuaternion,
      constraint: normalizedConstraint
    });
    return new THREE.Matrix4().makeTranslation(...projected.deltaWorld).toArray();
  }

  const operation = frameInverse.clone()
    .multiply(new THREE.Matrix4().makeTranslation(-pivot.x, -pivot.y, -pivot.z))
    .multiply(delta)
    .multiply(new THREE.Matrix4().makeTranslation(pivot.x, pivot.y, pivot.z))
    .multiply(frame);
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  operation.decompose(position, rotation, scale);
  const mask = meshConstraintMask(normalizedConstraint);

  if (type === "rotate") {
    const euler = new THREE.Euler().setFromQuaternion(rotation, "XYZ");
    const degrees = [euler.x, euler.y, euler.z]
      .map((component, index) => component * 180 / Math.PI * mask[index]);
    return affineDeltaWorld({
      type: "rotate",
      value: degrees,
      pivotWorld,
      frameQuaternion
    });
  }

  if (type === "scale") {
    const factors = [scale.x, scale.y, scale.z]
      .map((component, index) => mask[index] ? component : 1);
    return affineDeltaWorld({
      type: "scale",
      value: factors,
      pivotWorld,
      frameQuaternion
    });
  }

  throw new RangeError(`Operação afim de malha desconhecida: ${type}.`);
}

export function pointInFrame({
  pointWorld,
  frameQuaternion = [0, 0, 0, 1],
  originWorld = [0, 0, 0]
} = {}) {
  const frame = new THREE.Quaternion().fromArray(
    normalizedQuaternion(frameQuaternion, "Orientação do referencial")
  );
  return vector3(pointWorld, "Ponto mundial")
    .sub(vector3(originWorld, "Origem mundial"))
    .applyQuaternion(frame.clone().invert())
    .toArray();
}

export function frameVectorToWorld({
  vector,
  frameQuaternion = [0, 0, 0, 1]
} = {}) {
  const frame = new THREE.Quaternion().fromArray(
    normalizedQuaternion(frameQuaternion, "Orientação do referencial")
  );
  return vector3(vector, "Vetor no referencial").applyQuaternion(frame).toArray();
}

export function coincidentVertexGroups(positions, epsilon = 1e-6) {
  const tolerance = Number(epsilon);
  if (!Number.isFinite(tolerance) || tolerance <= 0) {
    throw new RangeError("A tolerância de soldagem deve ser positiva.");
  }
  const points = positions.map((point, index) =>
    vector3(point, `positions[${index}]`).toArray()
  );
  const parent = points.map((_, index) => index);
  const rank = points.map(() => 0);
  const buckets = new Map();
  const toleranceSquared = tolerance * tolerance;

  const find = index => {
    let root = index;
    while (parent[root] !== root) root = parent[root];
    while (parent[index] !== index) {
      const next = parent[index];
      parent[index] = root;
      index = next;
    }
    return root;
  };
  const unite = (left, right) => {
    let leftRoot = find(left);
    let rightRoot = find(right);
    if (leftRoot === rightRoot) return;
    if (rank[leftRoot] < rank[rightRoot]) {
      [leftRoot, rightRoot] = [rightRoot, leftRoot];
    }
    parent[rightRoot] = leftRoot;
    if (rank[leftRoot] === rank[rightRoot]) rank[leftRoot] += 1;
  };
  const cellOf = point => point.map(value => Math.floor(value / tolerance));
  const keyOf = cell => cell.join(":");

  points.forEach((point, index) => {
    const cell = cellOf(point);
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dz = -1; dz <= 1; dz += 1) {
          const neighbors = buckets.get(keyOf([
            cell[0] + dx,
            cell[1] + dy,
            cell[2] + dz
          ])) ?? [];
          for (const neighbor of neighbors) {
            const other = points[neighbor];
            const distanceSquared =
              (point[0] - other[0]) ** 2 +
              (point[1] - other[1]) ** 2 +
              (point[2] - other[2]) ** 2;
            if (distanceSquared <= toleranceSquared) unite(index, neighbor);
          }
        }
      }
    }
    const key = keyOf(cell);
    const bucket = buckets.get(key) ?? [];
    bucket.push(index);
    buckets.set(key, bucket);
  });

  const grouped = new Map();
  points.forEach((_, index) => {
    const root = find(index);
    const group = grouped.get(root) ?? [];
    group.push(index);
    grouped.set(root, group);
  });
  const groups = [...grouped.values()]
    .map(group => group.sort((left, right) => left - right))
    .sort((left, right) => left[0] - right[0])
    .map(group => Object.freeze(group));
  const byIndex = new Map();
  for (const group of groups) {
    for (const index of group) byIndex.set(index, group);
  }
  return Object.freeze({ groups: Object.freeze(groups), byIndex });
}

export function expandCoincidentSelection(indices, groups) {
  const expanded = new Set();
  for (const index of indices) {
    const group = groups?.byIndex?.get(index) ?? [index];
    for (const member of group) expanded.add(member);
  }
  return [...expanded].sort((left, right) => left - right);
}

function matrix4(value, label) {
  if (value?.isMatrix4) return value.clone();
  if (!Array.isArray(value) || value.length !== 16) {
    throw new TypeError(`${label} deve conter 16 valores.`);
  }
  const values = value.map(Number);
  if (!values.every(Number.isFinite)) {
    throw new TypeError(`${label} contém valor inválido.`);
  }
  return new THREE.Matrix4().fromArray(values);
}

function vector3(value, label) {
  if (!Array.isArray(value) || value.length !== 3) {
    throw new TypeError(`${label} deve conter três valores.`);
  }
  const values = value.map(Number);
  if (!values.every(Number.isFinite)) {
    throw new TypeError(`${label} contém valor inválido.`);
  }
  return new THREE.Vector3().fromArray(values);
}

function normalizedQuaternion(value, label) {
  if (!Array.isArray(value) || value.length !== 4) {
    throw new TypeError(`${label} deve conter quatro valores.`);
  }
  const values = value.map(Number);
  if (!values.every(Number.isFinite) || Math.hypot(...values) <= EPSILON) {
    throw new TypeError(`${label} é inválida.`);
  }
  return new THREE.Quaternion().fromArray(values).normalize().toArray();
}

function normalizedIndices(indices, vertexCount) {
  const unique = [...new Set(Array.from(indices ?? [], Number))];
  for (const index of unique) {
    if (!Number.isInteger(index) || index < 0 || index >= vertexCount) {
      throw new RangeError(`Índice de vértice inválido: ${index}.`);
    }
  }
  return unique.sort((left, right) => left - right);
}
