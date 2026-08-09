import { normalizeOccurrenceRef } from "../../occurrence-contracts/src/index.js";

export const PREVIEW_DESCRIPTOR_VERSION = "preview-descriptor-v1";
export const PREVIEW_KINDS = Object.freeze(new Set([
  "geometry",
  "transform",
  "selection-overlay",
  "animation-overlay",
  "measurement-overlay",
  "helper-overlay"
]));

export function createPreviewDescriptor(value = {}) {
  const id = requiredId(value.id, "id");
  const owner = requiredId(value.owner, "owner");
  const kind = String(value.kind ?? "").trim();
  if (!PREVIEW_KINDS.has(kind)) throw new RangeError(`Preview kind inválido: ${kind || "ausente"}.`);
  const descriptor = {
    version: PREVIEW_DESCRIPTOR_VERSION,
    id,
    owner,
    kind,
    target: value.target ? normalizeOccurrenceRef(value.target) : null,
    geometryRef: value.geometryRef ?? null,
    transform: freezeShallow(value.transform ?? null),
    appearanceRef: value.appearanceRef ?? null,
    bounds: freezeShallow(value.bounds ?? null),
    revision: nonNegativeInteger(value.revision ?? 0)
  };
  return Object.freeze(descriptor);
}

export function assertPreviewIsolation(descriptor) {
  const forbidden = ["project", "undo", "history", "threeObject", "mesh", "renderer"];
  for (const key of forbidden) {
    if (Object.prototype.hasOwnProperty.call(descriptor ?? {}, key)) {
      throw new Error(`PreviewDescriptor não pode conter '${key}'.`);
    }
  }
  return descriptor;
}

function requiredId(value, label) {
  const id = String(value ?? "").trim();
  if (!id) throw new TypeError(`${label} é obrigatório.`);
  return id;
}
function nonNegativeInteger(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) throw new RangeError("revision deve ser inteira não negativa.");
  return n;
}
function freezeShallow(value) {
  if (!value || typeof value !== "object") return value;
  return Object.freeze(Array.isArray(value) ? [...value] : { ...value });
}
