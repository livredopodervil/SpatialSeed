const FULL_REBUILD_TYPES = new Set([
  "initial",
  "sandbox-undo",
  "sandbox-discard",
  "sandbox-rebased",
  "sandbox-state-replaced"
]);

const NON_SPATIAL_TYPES = new Set([
  "data-object-created",
  "data-object-deleted",
  "data-object-updated",
  "interaction-bindings-changed"
]);

const INCREMENTAL_TYPES = new Set([
  "object-created",
  "object-deleted",
  "object-transform",
  "object-updated"
]);

export function classifyChanges(changes = []) {
  const list = Array.isArray(changes) ? changes : [];

  if (!list.length || list.some(change => FULL_REBUILD_TYPES.has(change?.type))) {
    return Object.freeze({
      mode: "full",
      changes: Object.freeze([...list]),
      objectIds: Object.freeze([])
    });
  }

  const spatial = list.filter(change => !NON_SPATIAL_TYPES.has(change?.type));
  if (!spatial.length) {
    return Object.freeze({
      mode: "none",
      changes: Object.freeze([]),
      objectIds: Object.freeze([])
    });
  }

  if (spatial.some(change => !INCREMENTAL_TYPES.has(change?.type))) {
    return Object.freeze({
      mode: "full",
      changes: Object.freeze([...spatial]),
      objectIds: Object.freeze([])
    });
  }

  return Object.freeze({
    mode: "incremental",
    changes: Object.freeze([...spatial]),
    objectIds: Object.freeze([
      ...new Set(spatial.map(change => change.objectId).filter(Boolean))
    ])
  });
}
