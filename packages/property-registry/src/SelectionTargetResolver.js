import {
  HierarchyIndex
} from "../../scene-hierarchy/src/HierarchyIndex.js";

export const PROPERTY_TARGET_SCOPES = Object.freeze([
  "selection",
  "renderables"
]);

export function resolveSelectionTargetIds({
  selection,
  state,
  targetScope = "selection"
}) {
  if (!PROPERTY_TARGET_SCOPES.includes(targetScope)) {
    throw new RangeError(`Escopo de alvos desconhecido: ${targetScope}.`);
  }
  const selectedIds = uniqueIds(
    selection?.members?.map(member => member.objectId) ?? []
  );
  if (targetScope === "selection" || !selectedIds.length) {
    return Object.freeze(selectedIds);
  }

  const hierarchy = new HierarchyIndex(state?.objects ?? []);
  const roots = hierarchy.canonicalizeSelection(
    selectedIds.filter(id => hierarchy.has(id))
  );
  const resolved = [];
  const seen = new Set();

  for (const rootId of roots) {
    for (const id of [rootId, ...hierarchy.descendantsOf(rootId)]) {
      if (seen.has(id) || hierarchy.node(id)?.kind === "group") continue;
      seen.add(id);
      resolved.push(id);
    }
  }
  return Object.freeze(resolved);
}

function uniqueIds(values) {
  const result = [];
  const seen = new Set();
  for (const value of values) {
    const id = String(value ?? "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    result.push(id);
  }
  return result;
}
