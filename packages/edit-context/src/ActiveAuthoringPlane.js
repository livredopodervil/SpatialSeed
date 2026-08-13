/**
 * SpatialSeed active authoring plane.
 *
 * One public authoring plane is shared by creation, planar drawing, path tools,
 * measurement and mesh path gestures. editPlane/drawingPlane remain legacy
 * aliases during migration and are resolved here in one place.
 */
export const ACTIVE_AUTHORING_PLANE_VERSION = "active-authoring-plane-v1";

export function resolveActiveAuthoringPlane(renderer, { viewerFallback = true } = {}) {
  if (!renderer) throw new TypeError("Renderer ausente para resolver o plano ativo.");
  const editPlane = renderer.getEditPlane?.() ?? null;
  const drawingPlane = renderer.getDrawingPlane?.() ?? null;
  if (editPlane) return Object.freeze({ frame: editPlane, source: "active-plane" });
  if (drawingPlane) return Object.freeze({ frame: drawingPlane, source: "active-plane" });
  const viewer = viewerFallback ? renderer.readViewerReferenceFrame?.() ?? null : null;
  return Object.freeze({ frame: viewer, source: viewer ? "viewer" : null });
}

export function activeAuthoringPlaneFrame(renderer, options) {
  return resolveActiveAuthoringPlane(renderer, options).frame;
}
