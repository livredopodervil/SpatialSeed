const FULL_REBUILD_TYPES = new Set([
  "initial",
  "sandbox-undo",
  "sandbox-discard",
  "sandbox-rebased",
  "sandbox-state-replaced"
]);

const INCREMENTAL_TYPES = new Set([
  "object-created",
  "object-deleted",
  "object-transform",
  "object-updated"
]);

export function classifyChanges(changes = []) {
  const list = Array.isArray(changes) ? changes : [];

  if (
    !list.length ||
    list.some(change => FULL_REBUILD_TYPES.has(change?.type)) ||
    list.some(change => !INCREMENTAL_TYPES.has(change?.type))
  ) {
    return Object.freeze({
      mode: "full",
      changes: Object.freeze([...list]),
      objectIds: Object.freeze([])
    });
  }

  return Object.freeze({
    mode: "incremental",
    changes: Object.freeze([...list]),
    objectIds: Object.freeze([
      ...new Set(list.map(change => change.objectId).filter(Boolean))
    ])
  });
}
