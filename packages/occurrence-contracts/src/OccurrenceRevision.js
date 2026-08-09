export const OCCURRENCE_REVISION_VERSION = "occurrence-revision-v1";

export function createOccurrenceRevision(value = {}) {
  return Object.freeze({
    version: OCCURRENCE_REVISION_VERSION,
    definition: nonNegativeInteger(value.definition ?? 0, "definition"),
    instance: nonNegativeInteger(value.instance ?? 0, "instance"),
    transform: nonNegativeInteger(value.transform ?? 0, "transform"),
    geometry: nonNegativeInteger(value.geometry ?? 0, "geometry"),
    appearance: nonNegativeInteger(value.appearance ?? 0, "appearance"),
    bounds: nonNegativeInteger(value.bounds ?? 0, "bounds")
  });
}

export function occurrenceRevisionChanged(previous, next, keys = null) {
  if (!previous || !next) return true;
  const fields = keys ?? ["definition", "instance", "transform", "geometry", "appearance", "bounds"];
  return fields.some(key => Number(previous[key] ?? 0) !== Number(next[key] ?? 0));
}

function nonNegativeInteger(value, label) {
  const normalized = Number(value);
  if (!Number.isInteger(normalized) || normalized < 0) {
    throw new RangeError(`${label} deve ser inteiro não negativo.`);
  }
  return normalized;
}
