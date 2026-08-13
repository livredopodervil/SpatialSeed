#!/usr/bin/env python3
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
checks={
 "resolver": ("packages/edit-context/src/ActiveAuthoringPlane.js", ["resolveActiveAuthoringPlane", "active-plane"]),
 "mirrored-write": ("packages/edit-context/src/EditContextController.js", ["setAuthoringPlane", "setEditPlane?.(resolved)", "setDrawingPlane?.(resolved)"]),
 "path": ("packages/spatial-references/src/PathSketchController.js", ["resolveActiveAuthoringPlane", 'planeSource: "active"']),
 "planar": ("packages/planar-authoring/src/PlanarSketchController.js", ["resolveActiveAuthoringPlane"]),
 "placement": ("packages/object-placement/src/ObjectPlacementController.js", ["resolveActiveAuthoringPlane"]),
 "mesh-gesture": ("packages/mesh-interaction/src/MeshPathGestureController.js", ["resolveActiveAuthoringPlane"]),
 "measurement": ("packages/measurement-tools/src/MeasurementController.js", ["resolveActiveAuthoringPlane"]),
 "ui": ("apps/web/index.html", ["Plano ativo", 'value="active">Plano ativo']),
}
errors=[]
for name,(rel,tokens) in checks.items():
 text=(ROOT/rel).read_text(encoding="utf-8")
 for token in tokens:
  if token not in text: errors.append(f"{name}:{token}")
if errors: raise SystemExit("0054l unified authoring plane audit failed: "+", ".join(errors))
print("0054l unified authoring plane audit: ok")
