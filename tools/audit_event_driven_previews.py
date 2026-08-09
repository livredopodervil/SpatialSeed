#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
checks = {
    "packages/object-placement/src/ObjectPlacementController.js": [
        'invalidateRender?.("object-placement-preview")',
        'invalidateRender?.("object-placement-preview-clear")',
    ],
    "packages/planar-authoring/src/PlanarSketchController.js": [
        'invalidateRender?.("planar-sketch-preview")',
        'invalidateRender?.("planar-sketch-preview-clear")',
    ],
    "packages/spatial-references/src/PathSketchController.js": [
        'invalidateRender?.("path-sketch-input-preview")',
        'invalidateRender?.("path-sketch-result-preview")',
        'invalidateRender?.("path-sketch-array-preview")',
    ],
    "packages/drawing-target/src/DrawingTargetController.js": [
        'invalidateRender?.("drawing-target-set")',
        'invalidateRender?.("drawing-target-surface-cursor")',
    ],
    "packages/measurement-tools/src/MeasurementController.js": [
        'invalidateRender?.("measurement-overlay")',
    ],
}
missing = []
for relative, markers in checks.items():
    path = ROOT / relative
    text = path.read_text(encoding="utf-8") if path.is_file() else ""
    for marker in markers:
        if marker not in text:
            missing.append(f"{relative}: {marker}")
if missing:
    raise SystemExit("\n".join(missing))
print("Auditoria de previews sob demanda: aprovada.")
