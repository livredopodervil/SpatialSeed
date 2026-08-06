import {
  EvolutionResult
} from "./EvolutionResult.js?build=20260806-0050a1";

export const TEMPORAL_TRANSFORM_GROUP_VERSION =
  "temporal-transform-group-v1";

/**
 * Cria uma operação temporal que confirma todas as transformações do grupo em
 * um único comando selection.transform. Saídas numericamente idênticas à
 * última confirmação são identidade e não chegam ao reducer ou renderer.
 */
export function createTemporalTransformGroupOperation({
  id,
  evaluate,
  timeDomainId = "world",
  phase = "transform",
  order = 0,
  dependencyIds = [],
  enabled = true,
  idempotent = false,
  epsilon = 1e-10
} = {}) {
  if (typeof evaluate !== "function") {
    throw new TypeError("Grupo temporal exige evaluate().");
  }
  const tolerance = Number(epsilon);
  if (!Number.isFinite(tolerance) || tolerance < 0) {
    throw new RangeError("epsilon deve ser finito e não negativo.");
  }

  let previousSignature = null;
  return Object.freeze({
    id,
    phase,
    order,
    timeDomainId,
    dependencyIds,
    enabled,
    idempotent,
    evaluate: async context => {
      const candidate = await evaluate(context);
      if (EvolutionResult.is(candidate)) return candidate;

      const normalized = normalizeTransformGroupResult(candidate);
      if (normalized.sleepUntil !== null) {
        return EvolutionResult.sleepUntil(normalized.sleepUntil, {
          value: normalized.value
        });
      }
      if (normalized.fixedPoint && normalized.transforms.length === 0) {
        return EvolutionResult.fixedPoint({ value: normalized.value });
      }

      const signature = transformGroupSignature(
        normalized.transforms,
        tolerance
      );
      if (signature === previousSignature) {
        return normalized.fixedPoint
          ? EvolutionResult.fixedPoint({ value: normalized.value })
          : EvolutionResult.identity();
      }
      previousSignature = signature;

      if (!normalized.transforms.length) {
        return normalized.fixedPoint
          ? EvolutionResult.fixedPoint({ value: normalized.value })
          : EvolutionResult.identity();
      }

      return EvolutionResult.changed([
        Object.freeze({
          type: "selection.transform",
          transforms: normalized.transforms
        })
      ], {
        events: normalized.events,
        value: normalized.value
      });
    }
  });
}

function normalizeTransformGroupResult(candidate) {
  if (candidate === undefined || candidate === null || candidate === false) {
    return Object.freeze({
      transforms: Object.freeze([]),
      events: Object.freeze([]),
      fixedPoint: false,
      sleepUntil: null,
      value: null
    });
  }
  const source = Array.isArray(candidate)
    ? { transforms: candidate }
    : candidate;
  if (!source || typeof source !== "object") {
    throw new TypeError(
      "Resultado do grupo deve ser lista, objeto ou EvolutionResult."
    );
  }
  const transforms = source.transforms ?? [];
  const events = source.events ?? [];
  if (!Array.isArray(transforms) || !Array.isArray(events)) {
    throw new TypeError("transforms e events devem ser listas.");
  }
  const sleepUntil = source.sleepUntil === undefined ||
    source.sleepUntil === null
    ? null
    : Number(source.sleepUntil);
  if (sleepUntil !== null && !Number.isFinite(sleepUntil)) {
    throw new RangeError("sleepUntil deve ser finito.");
  }
  return Object.freeze({
    transforms: Object.freeze(
      transforms.map(normalizeTransformEntry)
        .sort((a, b) => a.id.localeCompare(b.id))
    ),
    events: Object.freeze([...events]),
    fixedPoint: Boolean(source.fixedPoint),
    sleepUntil,
    value: source.value ?? null
  });
}

function normalizeTransformEntry(entry) {
  if (!entry || typeof entry !== "object") {
    throw new TypeError("Transformação temporal inválida.");
  }
  const id = String(entry.id ?? entry.objectId ?? "").trim();
  if (!id) throw new TypeError("Transformação temporal exige id.");
  const normalized = { id };
  for (const [key, length] of [
    ["position", 3],
    ["rotation", 4],
    ["scale", 3],
    ["matrix", 16]
  ]) {
    if (entry[key] === undefined) continue;
    if (!Array.isArray(entry[key]) || entry[key].length !== length ||
        !entry[key].every(Number.isFinite)) {
      throw new TypeError(`${key} de ${id} exige ${length} números finitos.`);
    }
    normalized[key] = Object.freeze(entry[key].map(Number));
  }
  if (Object.keys(normalized).length === 1) {
    throw new TypeError(`Transformação ${id} não possui dados espaciais.`);
  }
  return Object.freeze(normalized);
}

function transformGroupSignature(transforms, epsilon) {
  return transforms.map(transform => {
    const fields = [transform.id];
    for (const key of ["position", "rotation", "scale", "matrix"]) {
      if (!transform[key]) continue;
      fields.push(key);
      for (const value of transform[key]) {
        fields.push(quantizedNumber(value, epsilon));
      }
    }
    return fields.join(":");
  }).join("|");
}

function quantizedNumber(value, epsilon) {
  if (epsilon === 0) return String(value);
  return String(Math.round(value / epsilon));
}
