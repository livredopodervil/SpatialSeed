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
if build.get("build") not in {"20260817-0054mp", "20260817-0054mq", "20260818-0054mr", "20260818-0054ms", "20260818-0054mt", "20260818-0054mu", "20260818-0054mv"}:
    errors.append(f"build incorreto: {build.get('build')!r}")
expected_channels = {
    "20260817-0054mp": "feature/0054mp-analog-game-controls-shadow",
    "20260817-0054mq": "feature/0054mq-collision-debug-overlay",
    "20260818-0054mr": "feature/0054mr-obb-slope-kinematics",
    "20260818-0054ms": "fix/0054ms-recovery-before-demo-launch",
    "20260818-0054mt": "fix/0054mt-visual-facing-on-slopes",
    "20260818-0054mu": "feature/0054mu-property-clipboard",
    "20260818-0054mv": "feature/0054mv-property-transfer-preview",
}
if build.get("channel") != expected_channels.get(build.get("build")):
    errors.append(f"canal incorreto: {build.get('channel')!r}")

require(
    "packages/game-runtime/src/GameDirectionalInput.js",
    "game-directional-input-v1-analog-radial",
    "deadZone",
    "forward: -directionY * magnitude",
    "strafe: directionX * magnitude",
)
require(
    "apps/web/index.html",
    'id="game-direction-control"',
    'id="game-direction-thumb"',
    "Controle direcional analógico",
)
index = read("apps/web/index.html")
for legacy in (
    'data-game-control="forward"',
    'data-game-control="back"',
    'data-game-control="left"',
    'data-game-control="right"',
):
    if legacy in index:
        errors.append(f"HUD ainda contém direção discreta: {legacy}")
require(
    "apps/web/bootstrap/bindWebInterface.js",
    "normalizeGameDirectionalInput",
    "gameDirectionalInput.forward",
    "gameDirectionalInput.strafe",
    "onGameDirectionStart",
    "onGameDirectionMove",
    "onGameDirectionEnd",
)
require(
    "packages/character-animation-three/src/ThreeCharacterAnimationBackend.js",
    "object.castShadow = true",
    "object.receiveShadow = true",
)
require(
    "packages/runtime-test-plugin/src/GameRuntimeTests.js",
    "controle circular preserva direção diagonal intensidade e zona morta",
)
require(
    "packages/runtime-test-plugin/src/CharacterAnimationTests.js",
    "assertEqual(shadowMesh.castShadow, true)",
    "assertEqual(shadowMesh.receiveShadow, true)",
)

if errors:
    print("0054mp falhou:")
    for error in errors:
        print("-", error)
    raise SystemExit(1)

print(
    "0054mp ok: HUD táctil usa vetor analógico contínuo e o visual GLB "
    "participa do pipeline de sombras existente."
)
