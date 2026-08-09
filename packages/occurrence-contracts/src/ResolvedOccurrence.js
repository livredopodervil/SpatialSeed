import { createOccurrenceRevision } from "./OccurrenceRevision.js";
import { normalizeOccurrenceRef } from "./OccurrenceRef.js";

export const RESOLVED_OCCURRENCE_VERSION = "resolved-occurrence-v1";

export function createResolvedOccurrence(value = {}) {
  const definitionId = String(value.definitionId ?? "").trim();
  if (!definitionId) throw new TypeError("definitionId é obrigatório.");
  const kind = String(value.kind ?? "").trim();
  if (!kind) throw new TypeError("kind é obrigatório.");
  return Object.freeze({
    version: RESOLVED_OCCURRENCE_VERSION,
    ref: normalizeOccurrenceRef(value.ref),
    definitionId,
    kind,
    transform: freezeShallow(value.transform ?? null),
    geometryRef: value.geometryRef ?? null,
    appearanceRef: value.appearanceRef ?? null,
    effectiveOverrides: freezeShallow(value.effectiveOverrides ?? {}),
    bounds: freezeShallow(value.bounds ?? null),
    revisions: createOccurrenceRevision(value.revisions ?? {})
  });
}

export function isResolvedOccurrence(value) {
  return Boolean(value && value.version === RESOLVED_OCCURRENCE_VERSION);
}

function freezeShallow(value) {
  if (!value || typeof value !== "object") return value;
  return Object.freeze(Array.isArray(value) ? [...value] : { ...value });
}
