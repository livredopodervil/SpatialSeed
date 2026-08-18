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
if build.get("build") not in {"20260818-0054mt", "20260818-0054mu", "20260818-0054mv", "20260818-0054mw", "20260818-0054mx"}:
    errors.append(f"build incorreto: {build.get('build')!r}")
expected_channels = {
    "20260818-0054mt": "fix/0054mt-visual-facing-on-slopes",
    "20260818-0054mu": "feature/0054mu-property-clipboard",
    "20260818-0054mv": "feature/0054mv-property-transfer-preview",
    "20260818-0054mw": "feature/0054mw-universal-resource-search",
    "20260818-0054mx": "feature/0054mx-interaction-bindings",
}
if build.get("channel") != expected_channels.get(build.get("build")):
    errors.append(f"canal incorreto: {build.get('channel')!r}")

require(
    "packages/game-runtime/src/CharacterPhysics.js",
    "facingYaw: body.baseYaw",
    "state.facingYaw = approachAngle(",
    "state.yaw = state.facingYaw",
)
require(
    "packages/game-runtime/src/GameRuntime.js",
    "game-runtime-v7-independent-visual-facing",
    "visualYaw:",
    "this.#physics.facingYaw ?? this.#physics.yaw",
)
require(
    "packages/runtime-test-plugin/src/GameRuntimeTests.js",
    "visual acompanha a direção mesmo quando a OBB não pode girar",
    "descending.facingYaw",
)

if errors:
    print("0054mt falhou:")
    for error in errors:
        print("-", error)
    raise SystemExit(1)

print(
    "0054mt ok: direção visual responde ao movimento sem forçar a OBB "
    "através do apoio inclinado ou de paredes."
)
