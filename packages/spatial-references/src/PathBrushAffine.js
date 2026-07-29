import * as THREE from "three";
import {
  compileAffineProgram,
  createAffineEvaluationContext,
  evaluateAffineProgram
} from "../../selection-operations/src/AffineProgram.js?build=20260729-0039g";

export const PATH_BRUSH_AFFINE_DEFAULTS = Object.freeze({
  affineMoveX: "0",
  affineMoveY: "0",
  affineMoveZ: "0",
  affineRotateX: "0",
  affineRotateY: "0",
  affineRotateZ: "0",
  affineScale: "1"
});

export const PATH_BRUSH_AFFINE_VARIABLES = Object.freeze([
  "i", "index", "u", "count",
  "d", "distance", "length", "pathLength", "spacing",
  "k", "curvature",
  "x", "y", "z",
  "tx", "ty", "tz",
  "nx", "ny", "nz",
  "bx", "by", "bz"
]);

const PATH_BRUSH_AFFINE_SYMBOLS = new Set([
  ...PATH_BRUSH_AFFINE_VARIABLES,
  "pi", "e", "tau", "phi",
  "deg", "rad", "turn"
]);

export function compilePathBrushAffineModifier(source = {}) {
  const expressions = normalizeExpressions({
    ...PATH_BRUSH_AFFINE_DEFAULTS,
    ...source
  });
  const program = compileAffineProgram([
    {
      type: "move",
      value: [
        expressions.affineMoveX,
        expressions.affineMoveY,
        expressions.affineMoveZ
      ]
    },
    {
      type: "rotate",
      value: [
        expressions.affineRotateX,
        expressions.affineRotateY,
        expressions.affineRotateZ
      ]
    },
    {
      type: "scale",
      value: [
        expressions.affineScale,
        expressions.affineScale,
        expressions.affineScale
      ]
    }
  ], {
    mode: "indexed",
    translationSpace: "local"
  });
  validateProgramVariables(program);
  return Object.freeze({
    type: "path-brush-affine-modifier",
    version: 1,
    expressions,
    identity: isIdentity(expressions),
    program
  });
}

export function evaluatePathBrushAffineModifier(modifier, {
  index,
  count,
  progress = undefined,
  position,
  rotation,
  variables = {}
} = {}) {
  if (modifier?.type !== "path-brush-affine-modifier" ||
      modifier?.version !== 1 ||
      modifier?.program?.type !== "affine-program") {
    throw new TypeError("Modificador afim do pincel inválido.");
  }
  const context = createAffineEvaluationContext({
    index,
    count,
    transform: {
      position: vector3(position, "position"),
      rotation: quaternion(rotation),
      scale: [1, 1, 1]
    },
    normalizedProgress: progress,
    variables
  });
  const evaluated = evaluateAffineProgram(modifier.program, context);
  const move = operationValue(evaluated, "move");
  const rotate = operationValue(evaluated, "rotate");
  const scaleVector = operationValue(evaluated, "scale");
  const signedScale = finite(scaleVector[0], "scale");
  if (scaleVector.some(value => Math.abs(value - signedScale) > 1e-12)) {
    throw new RangeError(
      "A escala afim do pincel deve ser uniforme."
    );
  }
  const scale = Math.max(Math.abs(signedScale), 1e-6);
  const quaternionValue = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(
      THREE.MathUtils.degToRad(rotate[0]),
      THREE.MathUtils.degToRad(rotate[1]),
      THREE.MathUtils.degToRad(rotate[2]),
      "XYZ"
    )
  );
  const matrix = new THREE.Matrix4().compose(
    new THREE.Vector3().fromArray(move),
    quaternionValue,
    new THREE.Vector3(scale, scale, scale)
  );
  return Object.freeze({
    matrix: Object.freeze(matrix.toArray()),
    context: Object.freeze({
      i: context.i,
      index: context.index,
      count: context.count,
      u: context.u,
      x: context.x,
      y: context.y,
      z: context.z,
      ...Object.freeze(Object.fromEntries(
        Object.entries(variables).filter(([, value]) =>
          typeof value === "number"
        )
      ))
    }),
    move: Object.freeze([...move]),
    rotate: Object.freeze([...rotate]),
    scale,
    signedScale,
    invertColor: signedScale < 0,
    clampedAtZero: Math.abs(signedScale) < 1e-6
  });
}

function validateProgramVariables(program) {
  for (const operation of program.operations) {
    for (const value of operation.value ?? []) {
      for (const name of expressionVariables(value?.ast)) {
        if (!PATH_BRUSH_AFFINE_SYMBOLS.has(name)) {
          throw new ReferenceError(
            `Variável não disponível no pincel afim: ${name}.`
          );
        }
      }
    }
  }
}

function expressionVariables(node, result = new Set()) {
  if (!node || typeof node !== "object") return result;
  if (node.type === "variable") result.add(node.name);
  if (node.left) expressionVariables(node.left, result);
  if (node.right) expressionVariables(node.right, result);
  if (node.value) expressionVariables(node.value, result);
  for (const argument of node.args ?? []) {
    expressionVariables(argument, result);
  }
  return result;
}

function normalizeExpressions(source) {
  return Object.freeze(Object.fromEntries(
    Object.keys(PATH_BRUSH_AFFINE_DEFAULTS).map(id => [
      id,
      expression(source[id], id)
    ])
  ));
}

function isIdentity(expressions) {
  return [
    expressions.affineMoveX,
    expressions.affineMoveY,
    expressions.affineMoveZ,
    expressions.affineRotateX,
    expressions.affineRotateY,
    expressions.affineRotateZ
  ].every(value => Number(value) === 0) &&
    Number(expressions.affineScale) === 1;
}

function expression(value, name) {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError(`${name} inválido.`);
    return value;
  }
  const text = String(value ?? "").trim();
  if (!text) throw new TypeError(`${name} exige um valor ou expressão.`);
  return text;
}

function operationValue(operations, type) {
  const operation = operations.find(candidate => candidate.type === type);
  if (!operation || !Array.isArray(operation.value) ||
      operation.value.length !== 3) {
    throw new TypeError(`Operação ${type} ausente no modificador do pincel.`);
  }
  return operation.value.map(value => finite(value, type));
}

function vector3(value, name) {
  if (!Array.isArray(value) || value.length !== 3) {
    throw new TypeError(`${name} deve conter x, y e z.`);
  }
  return value.map(item => finite(item, name));
}

function quaternion(value) {
  if (!Array.isArray(value) || value.length !== 4) {
    throw new TypeError("rotation deve conter quaternion x, y, z e w.");
  }
  const result = value.map(item => finite(item, "rotation"));
  if (Math.hypot(...result) <= 1e-12) {
    throw new RangeError("rotation não pode ser um quaternion nulo.");
  }
  return result;
}

function finite(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new TypeError(`${name} inválido.`);
  return number;
}
