import {
  compileAffineProgram,
  createAffineEvaluationContext,
  evaluateAffineProgram
} from "../../selection-operations/src/AffineProgram.js?build=20260719-0028b";
import {
  composeAffineOperations
} from "../../math-affine/src/index.js?build=20260719-0028b";

export const ANIMATION_PROGRAM_VERSION = "animation-program-v1";

export function compileAnimationProgram(operations, {
  id = "custom"
} = {}) {
  if (!Array.isArray(operations) || operations.length === 0) {
    throw new TypeError("Programa de animação exige operações afins.");
  }

  const source = structuredClone(operations);
  const compiled = compileAffineProgram(source, {
    mode: "indexed",
    translationSpace: "world"
  });

  return deepFreeze({
    type: "animation-program",
    version: ANIMATION_PROGRAM_VERSION,
    id: nonEmpty(id, "Identificador de animação ausente."),
    operations: source,
    compiled,
    unitDependent: usesUnitVariables(source)
  });
}

export function createAnimationEvaluator(program) {
  validateProgram(program);

  return ({ t = 0, dt = 0, targets } = {}) => {
    const units = targets?.units;
    if (!Array.isArray(units) || units.length === 0) {
      throw new TypeError("Programa de animação sem unidades de destino.");
    }

    const count = units.length;
    const shared = program.unitDependent
      ? null
      : evaluate(program, { t, dt, i: 1, count });

    return Object.freeze(units.map((unit, index) => {
      const operations = shared ?? evaluate(program, {
        t,
        dt,
        i: index + 1,
        count
      });
      const matrix = composeAffineOperations([
        { type: "pivot", value: unit.pivot },
        ...operations
      ]);

      return Object.freeze({
        unitId: unit.unitId,
        matrix: Object.freeze(matrix)
      });
    }));
  };
}

export function describeAnimationProgram(program) {
  validateProgram(program);
  return Object.freeze({
    version: program.version,
    id: program.id,
    operationCount: program.operations.length,
    unitDependent: program.unitDependent,
    astHash: program.compiled.astHash,
    language: program.compiled.syntax
  });
}

function evaluate(program, context) {
  return evaluateAffineProgram(
    program.compiled,
    createAffineEvaluationContext({
      index: context.i,
      count: context.count,
      time: context.t,
      deltaTime: context.dt
    })
  );
}

function usesUnitVariables(value) {
  if (typeof value === "string") {
    return /\b(?:i|index|u|count)\b/.test(value);
  }
  if (Array.isArray(value)) return value.some(usesUnitVariables);
  if (value && typeof value === "object") {
    return Object.values(value).some(usesUnitVariables);
  }
  return false;
}

function validateProgram(program) {
  if (
    program?.type !== "animation-program" ||
    program?.version !== ANIMATION_PROGRAM_VERSION
  ) {
    throw new TypeError("Programa de animação incompatível.");
  }
}

function nonEmpty(value, message) {
  const result = String(value ?? "").trim();
  if (!result) throw new TypeError(message);
  return result;
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}
