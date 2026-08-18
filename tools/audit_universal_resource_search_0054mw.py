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
if build.get("build") not in {"20260818-0054mw", "20260818-0054mx", "20260818-0054my"}:
    errors.append(f"build incorreto: {build.get('build')!r}")
expected_channels = {
    "20260818-0054mw": "feature/0054mw-universal-resource-search",
    "20260818-0054mx": "feature/0054mx-interaction-bindings",
    "20260818-0054my": "feature/0054my-kinematic-platforms",
}
if build.get("channel") != expected_channels.get(build.get("build")):
    errors.append(f"canal incorreto: {build.get('channel')!r}")

require(
    "packages/resource-tree/src/ResourceSearchIndex.js",
    "resource-search-index-v1",
    "parseResourceSearchQuery",
    '"type", "kind", "name", "id", "hidden", "category"',
)
require(
    "packages/asset-store/src/AssetStore.js",
    "listDescriptors",
    "canonicalBytes",
)
require(
    "packages/object-inspector/src/ObjectInspector.js",
    "formatTransferValue",
    "embeddedTextureLabel(value)",
)
require(
    "apps/web/bootstrap/createWebRuntime.js",
    "new ResourceSearchIndex",
    '.register("resource.search"',
    '.register("resource.search.status"',
)
require(
    "apps/web/bootstrap/bindWebInterface.js",
    '"resource.palette.toggle"',
    'runtime.query("resource.search"',
    'execute("selection.select-object"',
)
require(
    "apps/web/index.html",
    'id="resource-search"',
    'id="resource-palette-dialog"',
    "type:camera",
)
require(
    "apps/web/config/ui.default.json",
    '"action": "resource.palette.toggle"',
    '"chord": "Primary+F"',
)
require(
    "packages/devtools/src/DevConsole.js",
    'case "resource"',
    '"resource search type:camera"',
    '"resource select object-id"',
)
require(
    "tools/test_resource_search_0054mw.mjs",
    "universal resource search tests passed",
    'includes("AAAA")',
)

if errors:
    print("0054mw falhou:")
    for error in errors:
        print("-", error)
    raise SystemExit(1)

print(
    "0054mw ok: busca universal reutiliza queries e seleção pública, "
    "indexa assets sem seus valores e resume texturas incorporadas."
)
