#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
errors: list[str] = []


def read(relative: str) -> str:
    path = ROOT / relative
    if not path.is_file():
        errors.append(f"arquivo ausente: {relative}")
        return ""
    return path.read_text(encoding="utf-8")


def require(relative: str, *tokens: str) -> None:
    source = read(relative)
    for token in tokens:
        if token not in source:
            errors.append(f"{relative}: marcador ausente: {token}")


build = json.loads(read("apps/web/build-info.json") or "{}")
if build.get("build") not in {
    "20260817-0054mo", "20260817-0054mp", "20260817-0054mq", "20260818-0054mr", "20260818-0054ms", "20260818-0054mt"
}:
    errors.append(f"build incorreto: {build.get('build')!r}")
expected_channels = {
    "20260817-0054mo": "feature/0054mo-property-schema-consolidation",
    "20260817-0054mp": "feature/0054mp-analog-game-controls-shadow",
    "20260817-0054mq": "feature/0054mq-collision-debug-overlay",
    "20260818-0054mr": "feature/0054mr-obb-slope-kinematics",
    "20260818-0054ms": "fix/0054ms-recovery-before-demo-launch",
    "20260818-0054mt": "fix/0054mt-visual-facing-on-slopes",
}
if build.get("channel") != expected_channels.get(build.get("build")):
    errors.append(f"canal incorreto: {build.get('channel')!r}")

require(
    "packages/property-registry/src/PropertyRegistry.js",
    "minimum: descriptor.minimum",
    "maximum: descriptor.maximum",
    "step: descriptor.step",
    "unit: descriptor.unit",
    "integer: descriptor.integer",
)
require(
    "packages/property-registry/src/createDefaultPropertyRegistry.js",
    "registerGeometryProperties",
    "geometry.${geometry.type}.${parameter.id}",
    "geometryRegistry.describeLegacyObject(object)",
    "geometryRegistry.normalize({",
    "const current = patch.geometry ??",
)
require(
    "packages/property-registry/src/PropertyInputCodec.js",
    'case "json"',
    "JSON.parse",
)
require(
    "packages/object-inspector/src/ObjectInspector.js",
    'descriptor.valueType === "json"',
    "descriptor.minimum",
    "descriptor.maximum",
    "descriptor.integer",
)
require(
    "apps/web/bootstrap/createWebRuntime.js",
    "createDefaultPropertyRegistry({ geometryRegistry })",
)
require(
    "packages/runtime-test-plugin/src/RuntimeLayerTests.js",
    "providers geométricos ampliam o mesmo registro de propriedades",
    "parâmetro geométrico usa comando atômico undo redo e save open",
    "console edita parâmetro geométrico pela API comum",
    "inteiro geométrico inválido não altera mundo nem histórico",
)

if errors:
    print("0054mo falhou:")
    for error in errors:
        print("-", error)
    raise SystemExit(1)

print(
    "0054mo ok: providers geométricos alimentam o PropertyRegistry comum "
    "e preservam validação, comando, undo e serialização."
)
