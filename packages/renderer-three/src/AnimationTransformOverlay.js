import {
  multiplyMatrices,
  translationMatrix,
  validateMatrix
} from "../../math-affine/src/index.js?build=20260719-0028a";

export function composeAnimationOverlay(targets, unitFrames) {
  validateTargets(targets);
  const byUnit = normalizeUnitFrames(unitFrames);

  const transforms = [];
  const pivots = [];
  const colors = [];
  for (const unit of targets.units) {
    const frame = byUnit.get(unit.unitId);
    if (!frame) {
      throw new Error(`Quadro sem transformação para ${unit.unitId}.`);
    }
    pivots.push(Object.freeze({
      unitId: unit.unitId,
      position: Object.freeze(transformPoint(frame.matrix, unit.pivot))
    }));
    for (const object of unit.objects) {
      transforms.push(Object.freeze({
        objectId: object.objectId,
        matrix: Object.freeze(multiplyMatrices(frame.matrix, object.baseMatrix))
      }));
      if (frame.color !== null) {
        colors.push(Object.freeze({
          objectId: object.objectId,
          color: frame.color
        }));
      }
    }
  }

  assertKnownUnits(targets, byUnit);

  return Object.freeze({
    transforms: Object.freeze(transforms),
    pivots: Object.freeze(pivots),
    colors: Object.freeze(colors)
  });
}


export function composeAnimationLayer(targets, unitFrames) {
  validateTargets(targets);
  const byUnit = normalizeUnitFrames(unitFrames);
  const transforms = [];
  const pivots = [];
  const colors = [];

  for (const unit of targets.units) {
    const frame = byUnit.get(unit.unitId);
    if (!frame) {
      throw new Error(`Quadro sem transformação para ${unit.unitId}.`);
    }
    pivots.push(Object.freeze({
      unitId: unit.unitId,
      position: Object.freeze(transformPoint(frame.matrix, unit.pivot))
    }));
    for (const object of unit.objects) {
      transforms.push(Object.freeze({
        objectId: object.objectId,
        matrix: frame.matrix
      }));
      if (frame.color !== null) {
        colors.push(Object.freeze({
          objectId: object.objectId,
          color: frame.color
        }));
      }
    }
  }

  assertKnownUnits(targets, byUnit);
  return Object.freeze({
    transforms: Object.freeze(transforms),
    pivots: Object.freeze(pivots),
    colors: Object.freeze(colors)
  });
}

/**
 * Moves an already-evaluated affine delta from its captured pivot to the
 * current canonical pivot. This keeps rotations/scales relative after an
 * editorial transform without changing the declarative animation program.
 */
export function rebaseAnimationLayerInput(
  targets,
  unitFrames,
  currentPivotForUnit
) {
  validateTargets(targets);
  if (!Array.isArray(unitFrames)) {
    throw new TypeError("Quadro de animação deve ser uma lista.");
  }
  if (typeof currentPivotForUnit !== "function") {
    throw new TypeError("Rebase de animação exige resolvedor de pivô.");
  }
  const targetById = new Map(
    targets.units.map(unit => [String(unit.unitId), unit])
  );
  const currentPivots = new Map();
  const frames = unitFrames.map(frame => {
    const unit = targetById.get(String(frame?.unitId ?? ""));
    if (!unit) return frame;
    const candidate = currentPivotForUnit(unit.unitId, unit);
    const current = candidate == null
      ? [...unit.pivot]
      : vector3(candidate, `Pivô atual inválido para ${unit.unitId}.`);
    currentPivots.set(unit.unitId, current);
    const offset = current.map((value, index) => value - unit.pivot[index]);
    if (offset.every(value => Math.abs(value) <= 1e-12)) return frame;
    validateMatrix(frame.matrix);
    const matrix = multiplyMatrices(
      translationMatrix(offset),
      multiplyMatrices(
        frame.matrix,
        translationMatrix(offset.map(value => -value))
      )
    );
    return Object.freeze({
      ...frame,
      matrix: Object.freeze(matrix)
    });
  });
  const units = targets.units.map(unit => Object.freeze({
    ...unit,
    pivot: Object.freeze(currentPivots.get(unit.unitId) ?? [...unit.pivot])
  }));
  return Object.freeze({
    targets: Object.freeze({
      ...targets,
      units: Object.freeze(units)
    }),
    unitFrames: Object.freeze(frames)
  });
}

export function createAnimationTargetSnapshot(units) {
  if (!Array.isArray(units)) {
    throw new TypeError("Unidades de animação devem formar uma lista.");
  }
  const objectIds = new Set();
  const unitIds = new Set();
  const normalized = units.map(unit => {
    const unitId = String(unit?.unitId ?? "").trim();
    if (!unitId || unitIds.has(unitId)) {
      throw new Error(`Unidade de animação inválida ou repetida: ${unitId}.`);
    }
    unitIds.add(unitId);
    const pivot = vector3(unit.pivot, `Pivô inválido para ${unitId}.`);
    const objects = (unit.objects ?? []).map(object => {
      const objectId = String(object?.objectId ?? "").trim();
      if (!objectId || objectIds.has(objectId)) {
        throw new Error(`Objeto de animação inválido ou repetido: ${objectId}.`);
      }
      objectIds.add(objectId);
      validateMatrix(object.baseMatrix);
      return Object.freeze({
        objectId,
        baseMatrix: Object.freeze([...object.baseMatrix])
      });
    });
    return Object.freeze({
      unitId,
      sourceId: String(unit.sourceId ?? unitId),
      pivot: Object.freeze(pivot),
      objects: Object.freeze(objects)
    });
  });
  return Object.freeze({ units: Object.freeze(normalized) });
}

function normalizeUnitFrames(unitFrames) {
  if (!Array.isArray(unitFrames)) {
    throw new TypeError("Quadro de animação deve ser uma lista.");
  }
  const byUnit = new Map();
  for (const entry of unitFrames) {
    const unitId = String(entry?.unitId ?? "").trim();
    if (!unitId) throw new TypeError("Quadro contém unidade sem id.");
    if (byUnit.has(unitId)) {
      throw new Error(`Unidade repetida no quadro: ${unitId}.`);
    }
    validateMatrix(entry.matrix);
    const matrix = Object.freeze([...entry.matrix]);
    const color = entry.color == null ? null : normalizeColor(entry.color);
    byUnit.set(unitId, Object.freeze({ matrix, color }));
  }
  return byUnit;
}

function assertKnownUnits(targets, byUnit) {
  if (byUnit.size === targets.units.length) return;
  const known = new Set(targets.units.map(unit => unit.unitId));
  const unknown = [...byUnit.keys()].find(id => !known.has(id));
  if (unknown) {
    throw new Error(`Unidade desconhecida no quadro: ${unknown}.`);
  }
  const missing = targets.units.find(unit => !byUnit.has(unit.unitId));
  throw new Error(`Quadro sem transformação para ${missing?.unitId ?? "unidade"}.`);
}

function validateTargets(targets) {
  if (!targets || !Array.isArray(targets.units)) {
    throw new TypeError("Snapshot de alvos de animação inválido.");
  }
}

function transformPoint(matrix, point) {
  const [x, y, z] = vector3(point, "Ponto de animação inválido.");
  return [
    matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12],
    matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13],
    matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14]
  ];
}

function vector3(value, message) {
  if (
    !Array.isArray(value) ||
    value.length !== 3 ||
    !value.every(component => Number.isFinite(Number(component)))
  ) {
    throw new TypeError(message);
  }
  return value.map(Number);
}

function normalizeColor(value) {
  const color = String(value ?? "").trim().toLowerCase();
  if (!/^#[0-9a-f]{6}$/.test(color)) {
    throw new TypeError(`Cor de animação inválida: ${value}.`);
  }
  return color;
}
