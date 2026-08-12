#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
checks = {
    "kernel-path": ("packages/mesh-operator-kernel/src/MeshPath.js", ["prepareMeshPath", "drag-line", "drawn"]),
    "kernel-contract": ("packages/mesh-operator-kernel/src/MeshOperatorContract.js", ["mesh-operator-contract-v1", "pathSpace: \"mesh-local\""]),
    "interaction": ("packages/mesh-interaction/src/MeshPathGestureController.js", ["resolvePointerPlacement", "previewTopology", "commitTopologyPreview"]),
    "controller": ("packages/mesh-editor-core/src/MeshEditController.js", ["previewTopology", "commitTopologyPreview", "cancelTopologyPreview"]),
    "extrude": ("packages/mesh-editor-core/src/MeshTopologyOperations.js", ["extrudeComponentsAlongPath", "pathDiagnostics"]),
    "ui": ("apps/web/index.html", ["mesh-extrude-path-mode", "Reta pelo arrasto", "Caminho desenhado"]),
    "console": ("packages/devtools/src/DevConsole.js", ["pathMode=drag-line|drawn", "path exige pelo menos dois pontos"]),
}
failed = []
for name, (rel, tokens) in checks.items():
    path = ROOT / rel
    text = path.read_text(encoding="utf-8") if path.is_file() else ""
    for token in tokens:
        if token not in text:
            failed.append(f"{name}:{token}")
if failed:
    raise SystemExit("0054g mesh operator/path audit failed: " + ", ".join(failed))
print("0054g mesh operator/path audit: ok")
