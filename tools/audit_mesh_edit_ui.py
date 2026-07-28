#!/usr/bin/env python3
"""Audit the unified topological mesh-edit UI and renderer contract."""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def audit_toolbar_controls() -> None:
    import json

    configuration = json.loads(
        (ROOT / "apps/web/config/ui.default.json").read_text(encoding="utf-8")
    )
    toolbar = configuration.get("toolbar", {})
    controls = [
        *toolbar.get("primary", []),
        *(
            item
            for menu in toolbar.get("menus", [])
            for item in menu.get("items", [])
        ),
        *toolbar.get("hidden", []),
    ]
    seen = set()
    duplicates = []
    for control in controls:
        if control in seen and control not in duplicates:
            duplicates.append(control)
        seen.add(control)
    if duplicates:
        raise SystemExit(
            "Controles duplicados na configuração da barra: "
            + ", ".join(duplicates)
        )

    html = (ROOT / "apps/web/index.html").read_text(encoding="utf-8")
    toolbar_match = re.search(
        r'<header id="toolbar"[^>]*>(.*?)</header>',
        html,
        flags=re.S
    )
    if not toolbar_match:
        raise SystemExit("Barra principal não encontrada no HTML.")
    toolbar_ids = set(re.findall(
        r'<(?:button|select)\b[^>]*\bid="([^"]+)"',
        toolbar_match.group(1)
    ))
    unconfigured = sorted(toolbar_ids - set(controls))
    if unconfigured:
        raise SystemExit(
            "Controles cairiam no menu Mais: " + ", ".join(unconfigured)
        )


def require(path: str, needle: str) -> None:
    text = (ROOT / path).read_text(encoding="utf-8")
    if needle not in text:
        raise SystemExit(f"Contrato ausente em {path}: {needle}")


for path, needle in [
    ("packages/region-box/src/reducer.js", 'case "light.create"'),
    ("packages/renderer-three/src/ThreeRegionRenderer.js", "#upsertLightVisual"),
    ("packages/property-registry/src/createDefaultPropertyRegistry.js", 'id: "light.intensity"'),
    ("packages/property-registry/src/createDefaultPropertyRegistry.js", 'id: "appearance.roughness"'),
    ("packages/edit-hud/src/EditHud.js", "#refreshContextActions"),
    ("packages/geometry-creation-panel/src/GeometryCreationPanel.js", 'reference-object')
]:
    require(path, needle)


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
    'data-mesh-section-toggle="topology"',
    'data-mesh-section-toggle="paths"',
    'id="path-reference-object"',
    'id="path-profile-object"',
    'id="path-create-tube"',
    'id="path-create-sweep"',
    'id="path-create-array"',
    'id="path-sketch-begin"',
    'id="path-from-selection-create"',
    'id="path-convert-bezier"',
    'id="edit-hud-columns"',
    'id="edit-hud-rows"',
    'id="edit-hud-create-light"',
    'id="edit-hud-material"',
    'id="edit-hud-extrude"',
    'id="edit-hud-help"',
    'id="edit-hud-area-selection"',
    'id="edit-hud-undo"',
    'id="edit-hud-tooltip"',
    'id="edit-hud-tap-hints"',
    'id="edit-hud-array-along-path"',
    'id="edit-hud-sweep-from-objects"',
    'id="edit-hud-tube-from-object"',
    'id="edit-hud-resize"',
    'id="edit-hud-selection-toggle"',
    'id="edit-hud-selection-remove"',
    'id="edit-hud-selection-add"',
    'id="edit-hud-selection-replace"',
    'id="edit-hud-adaptive-order"',
    'id="edit-create-reference"',
    'id="edit-material-apply"',
    'id="edit-light-apply"',
    'id="path-sketch-sample"',
    'id="path-sketch-source"',
    'id="path-sketch-geometry"',
    'id="path-sketch-source-color"',
    'id="path-sketch-spacing-mode"',
    'id="path-sketch-spacing-world"',
    'id="path-sketch-spacing-scale"'
]:
    require("apps/web/index.html", needle)

for needle in [
    'static apiVersion = "mesh-edit-panel-v7"',
    '"mesh.topology.apply"',
    '"mesh.component.mode.set"',
    '"mesh.selection.apply"',
    '"mesh.deform.settings.set"',
    'spatialseed.edit.workspace.sections.v3',
    "activateSelection()",
    'this.#click("mesh-frame-world", "edit.context.frame.set"',
    'this.#click("mesh-frame-local", "edit.context.frame.set"',
    'this.#click("mesh-frame-viewer", "edit.context.frame.set"',
    '"path.tube.create"',
    '"path.sweep.create"',
    '"path.array.create"'
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
require("apps/web/bootstrap/bindWebInterface.js", "const openEditWorkspace = () =>")
for needle in [
    'id="edit-hud"',
    'id="edit-hud-plane-lock"',
    'id="edit-hud-point-lock"',
    'data-edit-workspace-subject="object"'
]:
    require("apps/web/index.html", needle)
require("packages/edit-context/src/EditContextController.js", "class EditContextController")
require("packages/edit-context/src/EditContextController.js", "editor.selection?.subscribe")
require("packages/edit-hud/src/HudContextHeuristics.js", "deriveHudContext")
require("packages/edit-hud/src/EditHud.js", "class EditHud")
for needle in [
    "#prepareHints",
    "#onHintPointerDown",
    "#onHintClickCapture",
    "Modo ajuda ativado",
    "HUD_HINT_DETAILS",
    'this.#execute(active ? "mesh.edit.undo" : "history.undo")',
    'this.#execute("selection.area.toggle")',
    "deriveHudContext",
    "#buildGeometryTools",
    "#applyAdaptiveLayout",
    "spatialseed:geometry-default-changed"
]:
    require("packages/edit-hud/src/EditHud.js", needle)
for needle in [
    '.register("history.status"',
    "const unsubscribeHistory = sandbox.subscribe",
    "listener(editContext.status())"
]:
    require("apps/web/bootstrap/createWebRuntime.js", needle)
require("packages/mesh-editor-core/src/MeshEditController.js", 'setTransformMode("translate")')


for path, needle in [
    ("packages/region-box/src/reducer.js", 'case "light.create"'),
    ("packages/renderer-three/src/ThreeRegionRenderer.js", "#upsertLightVisual"),
    ("packages/property-registry/src/createDefaultPropertyRegistry.js", 'id: "light.intensity"'),
    ("packages/property-registry/src/createDefaultPropertyRegistry.js", 'id: "appearance.roughness"'),
    ("packages/edit-hud/src/EditHud.js", "#refreshContextActions"),
    ("packages/geometry-creation-panel/src/GeometryCreationPanel.js", 'reference-object')
]:
    require(path, needle)

html = (ROOT / "apps/web/index.html").read_text(encoding="utf-8")
ids = set(re.findall(r'id="([^"]+)"', html))
panel_source = (ROOT / "packages/mesh-edit-panel/src/MeshEditPanel.js").read_text(
    encoding="utf-8"
)
referenced = set()
for method in ["element", "click", "value", "text"]:
    referenced.update(re.findall(
        rf'this\.#{method}\("([a-z0-9-]+)"',
        panel_source
    ))
missing = sorted(reference for reference in referenced if reference not in ids)
if missing:
    raise SystemExit(
        "Controles do workspace ausentes no HTML: " + ", ".join(missing)
    )

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

selection_query = runtime_source.find('.register("selection.snapshot"')
history_query = runtime_source.find('.register("history.status"')
edit_hud_construction = runtime_source.find("new EditHud({")
if selection_query < 0 or history_query < 0 or edit_hud_construction < 0:
    raise SystemExit(
        "Não foi possível auditar as queries fundamentais ou a construção do HUD."
    )
if selection_query > edit_hud_construction:
    raise SystemExit(
        "selection.snapshot deve ser registrada antes da construção do EditHud."
    )
if history_query > edit_hud_construction:
    raise SystemExit(
        "history.status deve ser registrada antes da construção do EditHud."
    )

audit_toolbar_controls()

print("Auditoria da UI topológica de edição de malha aprovada.")
