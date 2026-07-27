#!/usr/bin/env python3
"""Audit the mesh-edit UI wiring that must remain visible and actionable."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def require(path: str, needle: str) -> None:
    text = (ROOT / path).read_text(encoding="utf-8")
    if needle not in text:
        raise SystemExit(f"Contrato ausente em {path}: {needle}")


require("apps/web/style.css", "#mesh-edit-panel {")
require("apps/web/style.css", "position: fixed;")
require("apps/web/style.css", "#mesh-edit-panel:not([hidden])")
require("apps/web/style.css", "#mesh-frame-viewer")
require("apps/web/index.html", 'id="mesh-frame-viewer"')
require("apps/web/bootstrap/bindWebInterface.js", "meshEditPanel.activateSelection();")
require("packages/mesh-edit-panel/src/MeshEditPanel.js", "activateSelection()")
require("packages/renderer-three/src/ThreeRegionRenderer.js", "depthTest: false")
require("packages/mesh-editor-core/src/MeshEditController.js", 'setTransformMode("translate")')

html = (ROOT / "apps/web/index.html").read_text(encoding="utf-8")
if html.index('id="mesh-frame-viewer"') > html.index('<legend>Vértices</legend>'):
    raise SystemExit("O controle de frame deve permanecer antes da seção de vértices.")

print("Auditoria da UI de edição de malha aprovada.")
