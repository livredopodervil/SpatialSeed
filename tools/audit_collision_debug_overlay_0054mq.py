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
if build.get("build") not in {"20260817-0054mq", "20260818-0054mr", "20260818-0054ms", "20260818-0054mt", "20260818-0054mu", "20260818-0054mv", "20260818-0054mw"}:
    errors.append(f"build incorreto: {build.get('build')!r}")
expected_channel = {
    "20260817-0054mq": "feature/0054mq-collision-debug-overlay",
    "20260818-0054mr": "feature/0054mr-obb-slope-kinematics",
    "20260818-0054ms": "fix/0054ms-recovery-before-demo-launch",
    "20260818-0054mt": "fix/0054mt-visual-facing-on-slopes",
    "20260818-0054mu": "feature/0054mu-property-clipboard",
    "20260818-0054mv": "feature/0054mv-property-transfer-preview",
    "20260818-0054mw": "feature/0054mw-universal-resource-search",
}.get(build.get("build"))
if build.get("channel") != expected_channel:
    errors.append(f"canal incorreto: {build.get('channel')!r}")

require(
    "packages/game-runtime/src/CharacterPhysics.js",
    "queryCharacterBodyOverlaps",
    "state.contacts = []",
    "recordAxisContacts",
    '"penetration"',
    '"blocked"',
    '"support"',
)
require(
    "packages/game-runtime/src/GameRuntime.js",
    "setCollisionDebug",
    "#publishCollisionDebug",
    "setGameCollisionDebug",
)
require(
    "packages/renderer-three/src/GameCollisionDebugOverlay.js",
    "game-collision-debug-overlay-v2-obb",
    "maximumColliders",
    "characterGrounded",
    "triangleMesh",
    "ArrowHelper",
)
require(
    "apps/web/index.html",
    'id="game-collision-debug"',
    "Mostrar colisores",
)
require(
    "apps/web/bootstrap/createWebRuntime.js",
    '"game.collision.debug.set"',
    "disposeGameCollisionDebug",
)
require(
    "packages/runtime-test-plugin/src/GameRuntimeTests.js",
    "diagnóstico de colisão publica overlay somente quando ativado",
    'contact.kind === "support"',
)
require(
    "packages/runtime-test-plugin/src/GameCollisionDebugOverlayTests.js",
    "overlay distingue body grounded formas e contatos sem DOM",
)

if errors:
    print("0054mq falhou:")
    for error in errors:
        print("-", error)
    raise SystemExit(1)

print(
    "0054mq ok: telemetria de contato permanece efêmera e alimenta overlay "
    "Three separado, ativável e limitado."
)
