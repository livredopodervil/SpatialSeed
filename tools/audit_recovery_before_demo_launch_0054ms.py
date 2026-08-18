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


def require(relative: str, *tokens: str) -> str:
    source = read(relative)
    for token in tokens:
        if token not in source:
            errors.append(f"{relative}: marcador ausente: {token}")
    return source


build = json.loads(read("apps/web/build-info.json") or "{}")
if build.get("build") not in {"20260818-0054ms", "20260818-0054mt", "20260818-0054mu", "20260818-0054mv", "20260818-0054mw", "20260818-0054mx"}:
    errors.append(f"build incorreto: {build.get('build')!r}")
expected_channels = {
    "20260818-0054ms": "fix/0054ms-recovery-before-demo-launch",
    "20260818-0054mt": "fix/0054mt-visual-facing-on-slopes",
    "20260818-0054mu": "feature/0054mu-property-clipboard",
    "20260818-0054mv": "feature/0054mv-property-transfer-preview",
    "20260818-0054mw": "feature/0054mw-universal-resource-search",
    "20260818-0054mx": "feature/0054mx-interaction-bindings",
}
if build.get("channel") != expected_channels.get(build.get("build")):
    errors.append(f"canal incorreto: {build.get('channel')!r}")

policy = require(
    "packages/platform-web/src/DefaultDemoLaunchPolicy.js",
    "default-demo-launch-policy-v1-recovery-first",
    '"empty"',
    '"discarded"',
    "shouldStartDefaultDemoAfterRecovery",
)
main = require(
    "apps/web/main.js",
    "const recoveryStatus = await interfaceBinding.ready",
    "shouldStartDefaultDemoAfterRecovery(",
    'await application.runtime.execute("game.start"',
)
create = read("apps/web/bootstrap/createWebRuntime.js")
if 'await commands.execute("game.start"' in create:
    errors.append("bootstrap inicia jogo antes da recuperação")
if main.find("await interfaceBinding.ready") > main.find(
    'await application.runtime.execute("game.start"'
):
    errors.append("modo jogo aparece antes da conclusão da recuperação")
require(
    "apps/web/style.css",
    ":not(#recovery-dialog)",
)
require(
    "packages/runtime-test-plugin/src/DefaultDemoLaunchPolicyTests.js",
    'mode: "continued"',
    'mode: "restored-clean"',
    'mode: "discarded"',
)
if "continued" in policy and "continued" in policy.split(
    "RECOVERY_MODES_WITHOUT_PERSISTED_PROJECT", 1
)[1].split("]);", 1)[0]:
    errors.append("política permite iniciar demo sobre rascunho recuperado")

if errors:
    print("0054ms falhou:")
    for error in errors:
        print("-", error)
    raise SystemExit(1)

print(
    "0054ms ok: recuperação persistente termina antes do demo e projetos "
    "recuperados permanecem no modo de autoria."
)
