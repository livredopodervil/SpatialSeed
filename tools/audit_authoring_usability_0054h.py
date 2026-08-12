#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
checks = {
    "placement-plane": ("packages/object-placement/src/ObjectPlacementController.js", [
        "getDrawingPlane", "getEditPlane", "placementPlane"
    ]),
    "mesh-path-plane": ("packages/mesh-interaction/src/MeshPathGestureController.js", [
        "getDrawingPlane", "getEditPlane", "interactionFrame"
    ]),
    "hud-extrude-options": ("packages/edit-hud/src/EditHud.js", [
        "edit-hud-extrude-options", 'this.#focusFeature("mesh.extrude")'
    ]),
    "hud-plane-live": ("packages/edit-hud/src/EditHud.js", [
        '"drawing.target.set"', "source: event.target.value"
    ]),
    "viewport-input": ("apps/web/bootstrap/bindWebInterface.js", [
        "suppressViewportContextMenu", 'addEventListener("contextmenu"'
    ]),
    "field-help": ("packages/ui-widgets/src/FormFieldHints.js", [
        "attachFormFieldHints", "aria-description", "parameterHelp"
    ]),
    "css-touch": ("apps/web/style.css", [
        "#world{display:block;width:100%;height:100%;touch-action:none", "-webkit-touch-callout:none"
    ]),
}
failed = []
for name, (relative, tokens) in checks.items():
    path = ROOT / relative
    text = path.read_text(encoding="utf-8") if path.is_file() else ""
    for token in tokens:
        if token not in text:
            failed.append(f"{name}:{token}")
if failed:
    raise SystemExit("0054h authoring usability audit failed: " + ", ".join(failed))
print("0054h authoring usability audit: ok")
