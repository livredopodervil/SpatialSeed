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
    "20260818-0054mx": "feature/0054mx-interaction-bindings",
    "20260818-0054my": "feature/0054my-kinematic-platforms",
}
if build.get("build") not in expected_channels:
    errors.append(f"build incorreto: {build.get('build')!r}")
if build.get("channel") != expected_channels.get(build.get("build")):
    errors.append(f"canal incorreto: {build.get('channel')!r}")

require(
    "packages/core/src/InteractionBindings.js",
    'INTERACTION_BINDINGS_VERSION = "spatialseed-interactions-v1"',
    "normalizeInteractionDocument",
    "portableInteractionValue",
    "Binding de interação duplicado",
    "Tipo de ação não permitido no documento",
)
require(
    "packages/interaction-runtime/src/InteractionRuntime.js",
    'configureSource("default"',
    "allowedActionTypes: null",
    "resolveInteractionTemplates",
    'if (value === "$self")',
    "cyclesPrevented",
    "#activeBindings.has(binding)",
)
require(
    "packages/interaction-runtime/src/SelectionInteractionService.js",
    "INTERACTION_EVENT_CATALOG",
    "metadata?.interactionAction",
    'type: "interaction.bindings.set"',
    "Comando não autorizado como ação",
)
require(
    "packages/region-box/src/reducer.js",
    'case "interaction.bindings.set"',
    'type: "interaction-bindings-changed"',
)
require(
    "packages/project-files/src/ProjectValidator.js",
    "interactions: normalizeInteractionDocument(scene?.interactions)",
)
require(
    "packages/object-inspector/src/InteractionComposer.js",
    'this.query("interaction.catalog.describe")',
    'this.execute("selection.interactions.add"',
    'this.execute("selection.interactions.remove"',
    'this.execute("selection.interactions.enabled.set"',
    "#reloadCatalog()",
)
require(
    "packages/object-inspector/src/ObjectInspector.js",
    "new InteractionComposer",
    'this.document.createElement("details")',
    'row?.closest?.("details.ins-property-group")',
)
require(
    "apps/web/bootstrap/createWebRuntime.js",
    "new SelectionInteractionService",
    'configureSource("document"',
    '.register(\n      "selection.interactions.add"',
    '.register("interaction.catalog.describe"',
)
require(
    "apps/web/main.js",
    "const recoveryStatus = await interfaceBinding.ready",
    'await application.runtime.execute("interaction.event.emit"',
    'type: "app.start"',
)
main = read("apps/web/main.js")
recovery_marker = "const recoveryStatus = await interfaceBinding.ready"
start_marker = 'await application.runtime.execute("interaction.event.emit"'
demo_marker = "const defaultDemoLaunch = application.web?.defaultDemoLaunch"
if not (
    recovery_marker in main and start_marker in main and demo_marker in main and
    main.index(recovery_marker) < main.index(start_marker) < main.index(demo_marker)
):
    errors.append("apps/web/main.js: app.start deve ocorrer entre recuperação e demo")
require(
    "packages/devtools/src/DevConsole.js",
    'case "interaction"',
    '"interaction add evento comando [{JSON de argumentos}]"',
    '"interaction emit evento [{JSON}]"',
)
require(
    "packages/runtime-test-plugin/src/InteractionBindingTests.js",
    "createInteractionBindingTests",
    "catálogo expõe somente comandos autorizados",
    "runtime interrompe reentrada imediata do mesmo binding",
)
require(
    "tools/test_interaction_bindings_0054mx.mjs",
    "interaction binding tests passed",
)

for relative in (
    "packages/core/src/InteractionBindings.js",
    "packages/interaction-runtime/src/InteractionRuntime.js",
    "packages/interaction-runtime/src/SelectionInteractionService.js",
    "packages/object-inspector/src/InteractionComposer.js",
):
    source = read(relative)
    for forbidden in ("eval(", "new Function(", ".innerHTML"):
        if forbidden in source:
            errors.append(f"{relative}: execução ou HTML livre proibido: {forbidden}")

if errors:
    print("0054mx falhou:")
    for error in errors:
        print("-", error)
    raise SystemExit(1)

print(
    "0054mx ok: comportamentos portáteis persistem evento → comando autorizado, "
    "com autoria contextual, console equivalente e runtime em camadas."
)
