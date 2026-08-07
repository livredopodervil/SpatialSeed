import { normalizeOccurrenceRef } from "../../occurrence-contracts/src/index.js";

export const EDIT_PATCH_VERSION = "edit-patch-v1";

export const EDIT_OPERATION_TYPES = Object.freeze(new Set([
  "set-transform",
  "set-property",
  "set-appearance",
  "hide-occurrence",
  "create-root-instance",
  "remove-root-instance",
  "set-occurrence-override",
  "clear-occurrence-override",
  "replace-definition-ref"
]));

export function createEditPatch({ operations = [], metadata = null } = {}) {
  if (!Array.isArray(operations)) throw new TypeError("EditPatch.operations deve ser uma lista.");
  const normalized = operations.map(normalizeEditOperation);
  return Object.freeze({
    version: EDIT_PATCH_VERSION,
    operations: Object.freeze(normalized),
    metadata: metadata && typeof metadata === "object" ? Object.freeze({ ...metadata }) : metadata
  });
}

export function normalizeEditOperation(operation, index = 0) {
  if (!operation || typeof operation !== "object") {
    throw new TypeError(`EditPatch.operations[${index}] inválida.`);
  }
  const type = String(operation.type ?? "").trim();
  if (!EDIT_OPERATION_TYPES.has(type)) {
    throw new RangeError(`Tipo de operação de edição não suportado: ${type || "ausente"}.`);
  }
  const requiresTarget = !["create-root-instance"].includes(type);
  return Object.freeze({
    ...operation,
    type,
    ...(requiresTarget ? { target: normalizeOccurrenceRef(operation.target) } : {})
  });
}
