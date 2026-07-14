import * as THREE from "three";
import {
  compileAffineProgram,
  createAffineEvaluationContext,
  evaluateAffineProgram,
  evaluateAffineVector
} from "./AffineProgram.js";

export {
  compileAffineProgram,
  evaluateAffineExpression,
  evaluateAffineProgram
} from "./AffineProgram.js";


export function resolveAffineOperations(
  operations = [],
  {
    defaultPivot = [0, 0, 0],
    medianPivot = defaultPivot,
    boundsPivot = medianPivot,
    activePosition = medianPivot
  } = {}
) {
  if (!Array.isArray(operations)) {
    throw new TypeError("operations deve ser um array.");
  }

  const resolved = [];
  const pivots = [];
  let currentPivot = vector3(defaultPivot, "defaultPivot");

  for (const operation of operations) {
    const type = String(operation?.type ?? "").toLowerCase();

    if (type !== "pivot") {
      resolved.push(structuredClone(operation));
      continue;
    }

    const specification = normalizePivotSpecification(operation);
    let position;

    if (specification.mode === "median") {
      position = vector3(medianPivot, "medianPivot");
    } else if (specification.mode === "bounds") {
      position = vector3(boundsPivot, "boundsPivot");
    } else if (specification.mode === "active") {
      position = vector3(activePosition, "activePosition");
    } else if (specification.mode === "relative") {
      const offset = vector3(specification.value, "pivot relative");
      const center = vector3(activePosition, "activePosition");
      position = center.map(
        (value, index) => value + offset[index]
      );
    } else {
      position = vector3(specification.value, "pivot absolute");
    }

    currentPivot = position;

    resolved.push({
      type: "pivot",
      value: [...position]
    });

    pivots.push({
      mode: specification.mode,
      requested: specification.value
        ? [...specification.value]
        : null,
      resolved: [...position]
    });
  }

  return Object.freeze({
    operations: Object.freeze(resolved),
    pivot: Object.freeze({
      default: Object.freeze(
        vector3(defaultPivot, "defaultPivot")
      ),
      effective: Object.freeze([...currentPivot]),
      explicit: pivots.length > 0,
      trace: Object.freeze(
        pivots.map(pivot => Object.freeze(pivot))
      )
    })
  });
}


/**
 * Gera cópias a partir de um programa paramétrico.
 *
 * O programa é reavaliado para cada índice. Assim, a etapa pode depender de
 * i, u, tempo, posição, escala e variáveis do usuário.
 */
export function affineProgramCopies(
  object,
  count,
  program,
  {
    variables = {},
    time = 0,
    deltaTime = 0,
    defaultPivot = [0, 0, 0]
  } = {}
) {
  const copies = Number(count);

  if (!Number.isInteger(copies) || copies < 1) {
    throw new RangeError("count deve ser inteiro positivo.");
  }

  const compiled =
    program?.type === "affine-program"
      ? program
      : compileAffineProgram(program);

  let current = matrixFromObject(object);
  const result = [];

  for (let index = 1; index <= copies; index += 1) {
    const currentTransform = decomposeMatrix(current);
    const context = createAffineEvaluationContext({
      index,
      count: copies,
      time,
      deltaTime,
      transform: currentTransform,
      variables
    });

    const evaluated = evaluateAffineProgram(
      compiled,
      context
    );

    const step = composeAffineStep(
      evaluated,
      evaluateAffineVector(
        defaultPivot,
        context,
        "defaultPivot"
      )
    );

    current = step.multiply(current);

    result.push({
      index,
      context: Object.freeze({
        i: context.i,
        count: context.count,
        u: context.u,
        t: context.t,
        dt: context.dt
      }),
      operations: evaluated,
      ...decomposeMatrix(current)
    });
  }

  return result;
}

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



function normalizePivotSpecification(operation) {
  const mode = String(
    operation?.mode ??
    operation?.value?.mode ??
    ""
  ).toLowerCase();

  if (["median", "bounds", "active"].includes(mode)) {
    return { mode, value: null };
  }

  if (mode === "relative") {
    return {
      mode,
      value:
        operation?.offset ??
        operation?.value?.offset ??
        operation?.value?.value
    };
  }

  if (mode === "absolute" || mode === "custom") {
    return {
      mode: "absolute",
      value:
        operation?.position ??
        operation?.value?.position ??
        operation?.value?.value
    };
  }

  if (
    Array.isArray(operation?.value) &&
    operation.value.length === 3
  ) {
    return {
      mode: "absolute",
      value: operation.value
    };
  }

  throw new Error(
    "Pivot afim inválido. Use median, bounds, active, " +
    "absolute x y z ou relative dx dy dz."
  );
}
