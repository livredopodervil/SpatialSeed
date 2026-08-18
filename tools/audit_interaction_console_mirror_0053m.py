#!/usr/bin/env python3
from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]
errors = []


def source(relative):
    path = ROOT / relative
    if not path.is_file():
        errors.append(f"arquivo ausente: {relative}")
        return ""
    return path.read_text(encoding="utf-8")


def require(relative, markers):
    value = source(relative)
    for marker in markers:
        if marker not in value:
            errors.append(f"{relative}: marcador ausente: {marker}")
    return value


build = json.loads(source("apps/web/build-info.json") or "{}")
if build.get("build") not in {"20260809-0053m", "20260810-0054f", "20260812-0054g", "20260812-0054i", "20260812-0054j", "20260812-0054k", "20260812-0054l", "20260812-0054m", "20260812-0054ma", "20260812-0054mc", "20260812-0054md", "20260812-0054mh", "20260812-0054mi", "20260813-0054mj", "20260813-0054mk", "20260813-0054ml", "20260817-0054mm", "20260817-0054mn", "20260817-0054mn1", "20260817-0054mo", "20260817-0054mp", "20260817-0054mq", "20260818-0054mr", "20260818-0054ms", "20260818-0054mt", "20260818-0054mu", "20260818-0054mv"}:
    errors.append(f"build incorreto: {build.get('build')!r}")

require("packages/renderer-three/src/MirroredGeometry.js", [
    "flipTangentHandedness",
    "reverseNonIndexedTriangles",
    "positiveInstanceMatrixForMirror",
])
require("packages/renderer-three/src/ThreeRegionRenderer.js", [
    "resourceMirrors",
    "mirroredGeometryKey",
    "heterogeneousMirroredX",
    "#addFamilyResource",
])
require("packages/object-placement/src/ObjectPlacementController.js", [
    "scaleReference: geometryScaleReference(geometry)",
    "#scaledPlacement",
    "scale: placement.scale",
])
require("packages/selection-operations/src/SelectionOperations.js", [
    "scale = [1, 1, 1]",
    "scale: [...scale]",
])
require("packages/region-box/src/reducer.js", [
    '"Escala do objeto inválida."',
])
require("packages/ui-widgets/src/ConsoleOutputFormatter.js", [
    "formatConsoleEntry",
    "isRuntimeTestResult",
])
require("apps/web/index.html", [
    'id="selection-panel"',
    'id="status-console-form"',
    'id="status-console-output"',
])
require("apps/web/bootstrap/bindWebInterface.js", [
    '"#selection-panel"',
    "formatConsoleEntry(entry)",
    "runConsoleInput",
])

ui = json.loads(source("apps/web/config/ui.default.json") or "{}")
bindings = {
    (entry.get("action"), entry.get("chord"), entry.get("context"))
    for entry in ui.get("shortcuts", {}).get("bindings", [])
}
for binding in [
    ("selection.duplicate", "Primary+C", "global"),
    ("selection.repeat", "Primary+D", "global"),
]:
    if binding not in bindings:
        errors.append(f"atalho ausente: {binding}")

if errors:
    print("Auditoria 0053m FALHOU:")
    for error in errors:
        print(f"- {error}")
    raise SystemExit(1)

print(
    "Auditoria 0053m aprovada: mirror orientado, inserção por arrasto, "
    "console compacto móvel e atalhos canônicos."
)
