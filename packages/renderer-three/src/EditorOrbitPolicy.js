export const EDITOR_ORBIT_POLICY_VERSION = "editor-orbit-policy-v1";

/**
 * Resolve a disponibilidade do OrbitControls durante interações do editor.
 *
 * Uma transformação autoritativa tem precedência sobre a navegação auxiliar:
 * enquanto o gizmo arrasta ou a escala por limites está ativa, a câmera deve
 * permanecer imóvel mesmo que a ferramenta tenha adquirido navegação touch.
 */
export function resolveEditorOrbitEnabled({
  transformDragging = false,
  boundsScaleActive = false,
  toolGestureNavigationActive = false,
  selectionGestureActive = false
} = {}) {
  if (transformDragging || boundsScaleActive) return false;
  if (toolGestureNavigationActive) return true;
  return !selectionGestureActive;
}
