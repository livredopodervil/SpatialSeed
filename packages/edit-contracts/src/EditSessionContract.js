import { normalizeOccurrenceRef } from "../../occurrence-contracts/src/index.js";

export const EDIT_SESSION_CONTRACT_VERSION = "edit-session-contract-v1";
export const EDIT_SESSION_STATES = Object.freeze(new Set(["active", "committed", "cancelled"]));

export function createEditSessionDescriptor(value = {}) {
  const id = normalizeId(value.id, "id");
  const toolId = normalizeId(value.toolId, "toolId");
  const targets = Object.freeze((value.targets ?? []).map(normalizeOccurrenceRef));
  const state = String(value.state ?? "active");
  if (!EDIT_SESSION_STATES.has(state)) throw new RangeError(`Estado de EditSession inválido: ${state}.`);
  return Object.freeze({
    version: EDIT_SESSION_CONTRACT_VERSION,
    id,
    toolId,
    targets,
    parameters: freezeObject(value.parameters ?? {}),
    snapshotRevisions: freezeObject(value.snapshotRevisions ?? {}),
    previewId: value.previewId ?? null,
    state
  });
}

export function assertEditSessionApi(session) {
  for (const method of ["preview", "commit", "cancel"]) {
    if (typeof session?.[method] !== "function") {
      throw new TypeError(`EditSession deve implementar ${method}().`);
    }
  }
  return session;
}

function normalizeId(value, label) {
  const id = String(value ?? "").trim();
  if (!id) throw new TypeError(`${label} é obrigatório.`);
  return id;
}

function freezeObject(value) {
  return Object.freeze(value && typeof value === "object" ? { ...value } : {});
}
