import { normalizeOccurrenceRef } from "../../occurrence-contracts/src/index.js";

export const RENDER_NODE_VERSION = "render-node-v1";

export function createRenderNode(value = {}) {
  const renderNodeId = requiredId(value.renderNodeId, "renderNodeId");
  return Object.freeze({
    version: RENDER_NODE_VERSION,
    renderNodeId,
    occurrenceRef: value.occurrenceRef ? normalizeOccurrenceRef(value.occurrenceRef) : null,
    geometryRef: value.geometryRef ?? null,
    appearanceRef: value.appearanceRef ?? null,
    worldTransform: freezeShallow(value.worldTransform ?? null),
    worldBounds: freezeShallow(value.worldBounds ?? null),
    flags: Object.freeze({
      visible: value.flags?.visible !== false,
      selectable: value.flags?.selectable !== false
    }),
    revisions: Object.freeze({ ...(value.revisions ?? {}) })
  });
}

export function assertRenderNodeIsolation(node) {
  for (const key of ["definition", "instanceGraph", "sandbox", "project", "threeObject"]) {
    if (Object.prototype.hasOwnProperty.call(node ?? {}, key)) {
      throw new Error(`RenderNode não pode conter '${key}'.`);
    }
  }
  return node;
}

function requiredId(value, label) {
  const id = String(value ?? "").trim();
  if (!id) throw new TypeError(`${label} é obrigatório.`);
  return id;
}
function freezeShallow(value) {
  if (!value || typeof value !== "object") return value;
  return Object.freeze(Array.isArray(value) ? [...value] : { ...value });
}
