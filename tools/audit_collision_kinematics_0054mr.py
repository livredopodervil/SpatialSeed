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
if build.get("build") not in {"20260818-0054mr", "20260818-0054ms", "20260818-0054mt", "20260818-0054mu", "20260818-0054mv"}:
    errors.append(f"build incorreto: {build.get('build')!r}")
expected_channels = {
    "20260818-0054mr": "feature/0054mr-obb-slope-kinematics",
    "20260818-0054ms": "fix/0054ms-recovery-before-demo-launch",
    "20260818-0054mt": "fix/0054mt-visual-facing-on-slopes",
    "20260818-0054mu": "feature/0054mu-property-clipboard",
    "20260818-0054mv": "feature/0054mv-property-transfer-preview",
}
if build.get("channel") != expected_channels.get(build.get("build")):
    errors.append(f"canal incorreto: {build.get('channel')!r}")

require(
    "packages/game-runtime/src/CharacterBodyFrame.js",
    "character-body-frame-v2-obb",
    "characterBodyWorldObb",
)
require(
    "packages/game-runtime/src/CollisionWorld.js",
    "intersectsCharacterBody",
    "intersectsObbs",
    "segmentLocalBoxHit",
    "transformNormal",
)
require(
    "packages/game-runtime/src/CharacterPhysics.js",
    "stepHeight",
    "groundSnapDistance",
    "maximumSlopeDegrees",
    "followGroundSurface",
    "canFollowGround",
)
require(
    "packages/renderer-three/src/GameCollisionDebugOverlay.js",
    "game-collision-debug-overlay-v2-obb",
    "characterBodyMatrix",
)
require(
    "packages/runtime-test-plugin/src/GameRuntimeTests.js",
    "corpo OBB rejeita falso positivo da AABB conservadora",
    "rampa sobe e desce aderida sem converter inclinação em degraus",
    "parede bloqueia a normal e preserva o movimento tangencial",
)

if errors:
    print("0054mr falhou:")
    for error in errors:
        print("-", error)
    raise SystemExit(1)

print(
    "0054mr ok: OBB participa da narrow phase e a cinemática mantém "
    "aderência em rampas e deslizamento tangencial em paredes."
)
