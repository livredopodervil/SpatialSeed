#!/usr/bin/env python3
"""Audit the unified topological mesh-edit UI and renderer contract."""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def require(path: str, needle: str) -> None:
    text = (ROOT / path).read_text(encoding="utf-8")
    if needle not in text:
        raise SystemExit(f"Contrato ausente em {path}: {needle}")


for needle in [
    "#mesh-edit-panel {",
    "position: fixed;",
    "#mesh-edit-panel:not([hidden])",
    "resize: both;",
    "[data-mesh-section][hidden]"
]:
    require("apps/web/style.css", needle)

for needle in [
    'id="mesh-frame-viewer"',
    'id="mesh-deform-live"',
    'id="mesh-mode-vertex"',
    'id="mesh-mode-edge"',
    'id="mesh-mode-face"',
    'id="mesh-create-face"',
    'id="mesh-extrude"',
    'id="mesh-bridge"',
    'id="mesh-flip-normal"',
    'data-mesh-section-toggle="topology"'
]:
    require("apps/web/index.html", needle)

for needle in [
    'static apiVersion = "mesh-edit-panel-v4"',
    '"mesh.topology.apply"',
    '"mesh.component.mode.set"',
    '"mesh.selection.apply"',
    '"mesh.deform.settings.set"',
    'spatialseed.mesh.panel.sections.v1',
    "activateSelection()"
]:
    require("packages/mesh-edit-panel/src/MeshEditPanel.js", needle)

for needle in [
    "applyMeshTopologyOperation",
    "topologyOf",
    "jacobiEigenSymmetric3",
    "earClip",
    "bridgeBoundaryLoops",
    "halfEdges"
]:
    require("packages/mesh-editor-core/src/MeshTopologyOperations.js", needle)

for needle in [
    "transformLocalPositionsWithInfluenceInto",
    "updateMeshEditComponentSelection",
    "setMeshEditComponentMode",
    "faceOverlay",
    "edgeOverlay",
    "depthTest: false"
]:
    require("packages/renderer-three/src/ThreeRegionRenderer.js", needle)

require("packages/mesh-editor-core/src/MeshDeformation.js", "createMeshInfluenceField")
require("apps/web/bootstrap/bindWebInterface.js", "meshEditPanel.activateSelection();")
require("packages/mesh-editor-core/src/MeshEditController.js", 'setTransformMode("translate")')

html = (ROOT / "apps/web/index.html").read_text(encoding="utf-8")
ids = set(re.findall(r'id="([^"]+)"', html))
panel_source = (ROOT / "packages/mesh-edit-panel/src/MeshEditPanel.js").read_text(
    encoding="utf-8"
)
referenced = set(re.findall(r'"(mesh-[a-z0-9-]+)"', panel_source))
allowed_prefixes = {"mesh-create", "mesh-move", "mesh-rotate", "mesh-scale"}
missing = sorted(reference for reference in referenced
                 if reference not in ids and reference not in allowed_prefixes
                 and reference != "mesh-edit-panel-v4")
if missing:
    raise SystemExit(f"Controles de malha ausentes no HTML: {', '.join(missing)}")

runtime_source = (ROOT / "apps/web/bootstrap/createWebRuntime.js").read_text(
    encoding="utf-8"
)
renderer_source = (ROOT / "packages/renderer-three/src/ThreeRegionRenderer.js").read_text(
    encoding="utf-8"
)
expected_match = re.search(r'const EXPECTED_RENDERER_API = "([^"]+)";', runtime_source)
actual_match = re.search(r'static apiVersion = "([^"]+)";', renderer_source)
if not expected_match or not actual_match:
    raise SystemExit("Não foi possível auditar o contrato de API do renderer.")
if expected_match.group(1) != actual_match.group(1):
    raise SystemExit(
        "Contrato do renderer divergente: "
        f"bootstrap espera {expected_match.group(1)}, "
        f"renderer declara {actual_match.group(1)}."
    )

print("Auditoria da UI topológica de edição de malha aprovada.")
