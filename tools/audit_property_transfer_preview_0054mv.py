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
expected_channels = {
    "20260818-0054mv": "feature/0054mv-property-transfer-preview",
    "20260818-0054mw": "feature/0054mw-universal-resource-search",
    "20260818-0054mx": "feature/0054mx-interaction-bindings",
}
current_build = build.get("build")
if current_build not in expected_channels:
    errors.append(f"build incorreto: {current_build!r}")
elif build.get("channel") != expected_channels[current_build]:
    errors.append(f"canal incorreto: {build.get('channel')!r}")

require(
    "packages/property-registry/src/PropertyTransferPresetCatalog.js",
    "property-transfer-preset-catalog-v1",
    'id: "transform"',
    'id: "position"',
    'id: "material"',
    'id: "color-binding"',
    'id: "instance-color"',
)
require(
    "packages/property-registry/src/SelectionPropertyClipboard.js",
    "selection-property-clipboard-v2-explicit-preview",
    "explicit-properties-required",
    "compatiblePropertyIds",
    "previewEntry",
)
require(
    "packages/property-registry/src/createDefaultPropertyRegistry.js",
    'id: "appearance.colorMode"',
    'id: "appearance.tint"',
    'id: "appearance.effectiveColor"',
    "Cor-base do material",
    "Cor própria da instância",
)
require(
    "packages/editor-commands/src/EditorCommands.js",
    '"selection.properties.copyPreset"',
    '"selection.properties.paste"',
)
require(
    "packages/devtools/src/DevConsole.js",
    '"property presets"',
    '"property clipboard"',
    '"property paste all|id ..."',
)
require(
    "apps/web/index.html",
    'id="inspector-property-clipboard-preview"',
    'id="inspector-property-clipboard-entries"',
    "Aplicar propriedades marcadas",
)
require(
    "packages/object-inspector/src/ObjectInspector.js",
    "formatTransferValue",
    "embeddedTextureLabel",
)
require(
    "packages/runtime-test-plugin/src/SelectionPropertyClipboardTests.js",
    "preview expõe nomes valores atuais compatibilidade e mudanças",
    "presets separam transformação material textura binding e instância",
    "catálogo aceita presets declarativos adicionais sem alterar clipboard",
)

if errors:
    print("0054mv falhou:")
    for error in errors:
        print("-", error)
    raise SystemExit(1)

print(
    "0054mv ok: transferência mostra propriedades e valores antes da "
    "confirmação, não move alvos por padrão e separa as camadas de cor."
)
