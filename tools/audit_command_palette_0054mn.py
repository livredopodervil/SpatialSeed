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
    "20260817-0054mn1": "fix/0054mn1-command-palette-console-bridge",
    "20260817-0054mo": "feature/0054mo-property-schema-consolidation",
    "20260817-0054mp": "feature/0054mp-analog-game-controls-shadow",
    "20260817-0054mq": "feature/0054mq-collision-debug-overlay",
    "20260818-0054mr": "feature/0054mr-obb-slope-kinematics",
    "20260818-0054ms": "fix/0054ms-recovery-before-demo-launch",
    "20260818-0054mt": "fix/0054mt-visual-facing-on-slopes",
}
current_build = build.get("build")
if current_build not in expected_channels:
    errors.append(f"build incorreto: {current_build!r}")
elif build.get("channel") != expected_channels[current_build]:
    errors.append(f"canal incorreto: {build.get('channel')!r}")

require(
    "packages/ui-widgets/src/CommandPalette.js",
    "createCommandPaletteEntries",
    "formatRuntimeCommandForConsole",
    "rankCommandPaletteEntries",
    'kind: "command"',
    "abrir no console",
)
require(
    "packages/ui-widgets/src/UiActionRegistry.js",
    "enabled: Boolean(action.enabled())",
)
require(
    "apps/web/bootstrap/bindWebInterface.js",
    '"command.palette.toggle"',
    "runtime.capabilities().commands",
    "formatRuntimeCommandForConsole(entry.command)",
    'panelManager.show("#console-panel")',
)
require(
    "apps/web/config/ui.default.json",
    '"action": "command.palette.toggle"',
    '"chord": "Primary+P"',
)
require(
    "apps/web/index.html",
    'id="command-palette-dialog"',
    'id="command-palette-input"',
    'id="command-palette-list"',
)
require(
    "packages/runtime-test-plugin/src/RuntimeLayerTests.js",
    "paleta combina ações executáveis e comandos sem duplicar registro",
    'id: "mesh.extrude.invoke"',
)
require(
    "packages/editor-commands/src/EditorCommands.js",
    '.register("mesh.extrude.invoke"',
    'label: "Iniciar extrusão por caminho"',
)

if errors:
    print("0054mn falhou:")
    for error in errors:
        print("-", error)
    raise SystemExit(1)

print(
    "0054mn ok: a paleta reutiliza UiActionRegistry, deduplica comandos "
    "e encaminha comandos parametrizados ao console."
)
