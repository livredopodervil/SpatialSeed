import * as THREE from "three";

export function composeAffineStep(operations = [], defaultPivot = [0, 0, 0]) {
  if (!Array.isArray(operations)) {
    throw new TypeError("operations deve ser um array.");
  }

  let pivot = vector3(defaultPivot, "pivot");
  const step = new THREE.Matrix4().identity();

  for (const operation of operations) {
    const type = String(operation?.type ?? "").toLowerCase();
    const value = operation?.value;

    if (type === "pivot") {
      pivot = vector3(value, "pivot");
      continue;
    }

    let matrix;

    if (type === "move") {
      const [x, y, z] = vector3(value, "move");
      matrix = new THREE.Matrix4().makeTranslation(x, y, z);
    } else if (type === "rotate") {
      const [x, y, z] = vector3(value, "rotate");
      const euler = new THREE.Euler(
        THREE.MathUtils.degToRad(x),
        THREE.MathUtils.degToRad(y),
        THREE.MathUtils.degToRad(z),
        "XYZ"
      );
      matrix = aroundPivot(
        new THREE.Matrix4().makeRotationFromEuler(euler),
        pivot
      );
    } else if (type === "scale") {
      const [x, y, z] = vector3(value, "scale");
      matrix = aroundPivot(
        new THREE.Matrix4().makeScale(x, y, z),
        pivot
      );
    } else if (type === "matrix") {
      if (!Array.isArray(value) || value.length !== 16) {
        throw new TypeError("matrix exige 16 valores.");
      }
      matrix = new THREE.Matrix4().fromArray(value.map(finite));
    } else {
      throw new Error(`Operação afim desconhecida: ${type || "(vazia)"}.`);
    }

    step.premultiply(matrix);
  }

  return step;
}

export function affineCopies(object, count, step) {
  const copies = Number(count);
  if (!Number.isInteger(copies) || copies < 1) {
    throw new RangeError("count deve ser inteiro positivo.");
  }
  if (!step?.isMatrix4) {
    throw new TypeError("step deve ser THREE.Matrix4.");
  }

  let current = matrixFromObject(object);
  const result = [];

  for (let index = 1; index <= copies; index += 1) {
    current = step.clone().multiply(current);
    result.push({ index, ...decomposeMatrix(current) });
  }

  return result;
}

export function matrixFromObject(object) {
  return new THREE.Matrix4().compose(
    new THREE.Vector3().fromArray(object.position ?? [0, 0, 0]),
    new THREE.Quaternion().fromArray(object.rotation ?? [0, 0, 0, 1]),
    new THREE.Vector3().fromArray(object.scale ?? [1, 1, 1])
  );
}

export function decomposeMatrix(matrix) {
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  matrix.decompose(position, rotation, scale);
  return {
    position: position.toArray(),
    rotation: rotation.toArray(),
    scale: scale.toArray()
  };
}

function aroundPivot(operation, pivotArray) {
  const [x, y, z] = pivotArray;
  return new THREE.Matrix4()
    .makeTranslation(x, y, z)
    .multiply(operation)
    .multiply(new THREE.Matrix4().makeTranslation(-x, -y, -z));
}

function vector3(value, label) {
  if (!Array.isArray(value) || value.length !== 3) {
    throw new TypeError(`${label} exige 3 valores.`);
  }
  return value.map(finite);
}

function finite(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new TypeError(`Valor numérico inválido: ${value}.`);
  }
  return number;
}
