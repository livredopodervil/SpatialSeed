import {
  multiplyMatrices,
  validateMatrix
} from "../../math-affine/src/index.js?build=20260719-0028a";

export function composeAnimationOverlay(targets, unitFrames) {
  validateTargets(targets);
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
    byUnit.set(unitId, entry.matrix);
  }

  const transforms = [];
  const pivots = [];
  for (const unit of targets.units) {
    const delta = byUnit.get(unit.unitId);
    if (!delta) {
      throw new Error(`Quadro sem transformação para ${unit.unitId}.`);
    }
    pivots.push(Object.freeze({
      unitId: unit.unitId,
      position: Object.freeze(transformPoint(delta, unit.pivot))
    }));
    for (const object of unit.objects) {
      transforms.push(Object.freeze({
        objectId: object.objectId,
        matrix: Object.freeze(multiplyMatrices(delta, object.baseMatrix))
      }));
    }
  }

  if (byUnit.size !== targets.units.length) {
    const known = new Set(targets.units.map(unit => unit.unitId));
    const unknown = [...byUnit.keys()].find(id => !known.has(id));
    throw new Error(`Unidade desconhecida no quadro: ${unknown}.`);
  }

  return Object.freeze({
    transforms: Object.freeze(transforms),
    pivots: Object.freeze(pivots)
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
      pivot: Object.freeze(pivot),
      objects: Object.freeze(objects)
    });
  });
  return Object.freeze({ units: Object.freeze(normalized) });
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
