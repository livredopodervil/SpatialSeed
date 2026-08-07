export const RENDER_DELTA_VERSION = "render-delta-v1";

export function createRenderDelta(value = {}) {
  return Object.freeze({
    version: RENDER_DELTA_VERSION,
    added: freezeList(value.added),
    changed: freezeList(value.changed),
    removed: freezeList(value.removed),
    previewsAdded: freezeList(value.previewsAdded),
    previewsChanged: freezeList(value.previewsChanged),
    previewsRemoved: freezeList(value.previewsRemoved),
    selectionChanged: Boolean(value.selectionChanged)
  });
}

export function renderDeltaWorkSize(delta) {
  return [
    "added", "changed", "removed",
    "previewsAdded", "previewsChanged", "previewsRemoved"
  ].reduce((sum, key) => sum + (delta?.[key]?.length ?? 0), 0);
}

function freezeList(value) {
  return Object.freeze([...(value ?? [])]);
}
