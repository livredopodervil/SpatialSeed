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
if build.get("build") not in {"20260818-0054mu", "20260818-0054mv", "20260818-0054mw", "20260818-0054mx", "20260818-0054my"}:
    errors.append(f"build incorreto: {build.get('build')!r}")
expected_channels = {
    "20260818-0054mu": "feature/0054mu-property-clipboard",
    "20260818-0054mv": "feature/0054mv-property-transfer-preview",
    "20260818-0054mw": "feature/0054mw-universal-resource-search",
    "20260818-0054mx": "feature/0054mx-interaction-bindings",
    "20260818-0054my": "feature/0054my-kinematic-platforms",
}
if build.get("channel") != expected_channels.get(build.get("build")):
    errors.append(f"canal incorreto: {build.get('channel')!r}")

require(
    "packages/property-registry/src/SelectionPropertyClipboard.js",
    "selection-property-clipboard-v2-explicit-preview",
    "copyTransform",
    "copyAppearance",
    "not-editable-many",
    "propertyService.setSelection",
)
require(
    "packages/editor-commands/src/EditorCommands.js",
    '"selection.properties.copy"',
    '"selection.properties.copyTransform"',
    '"selection.properties.copyAppearance"',
    '"selection.properties.paste"',
)
require(
    "apps/web/index.html",
    'id="inspector-property-copy-mode"',
    'id="inspector-properties-copy"',
    'id="inspector-properties-paste"',
)
require(
    "packages/runtime-test-plugin/src/SelectionPropertyClipboardTests.js",
    "preset padrão seguro não substitui posição nem identidade",
    "colar em lote ignora propriedade não editável em muitos",
    "colar exige propriedades explicitamente confirmadas",
)

if errors:
    print("0054mu falhou:")
    for error in errors:
        print("-", error)
    raise SystemExit(1)

print(
    "0054mu ok: clipboard tipado reutiliza o registro de propriedades, "
    "comandos e mutação atômica com compatibilidade por destino."
)
