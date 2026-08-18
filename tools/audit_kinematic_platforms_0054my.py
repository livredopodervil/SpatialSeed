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
if build.get("build") != "20260818-0054my":
    errors.append(f"build incorreto: {build.get('build')!r}")
if build.get("channel") != "feature/0054my-kinematic-platforms":
    errors.append(f"canal incorreto: {build.get('channel')!r}")

require(
    "packages/game-runtime/src/KinematicCollisionWorld.js",
    '"kinematic-collision-world-v1-moving-support"',
    "mergeKinematicCollisionWorld",
    "applyKinematicSupportMotion",
    "nextMatrix",
    "invertAffineMatrix(previousMatrix)",
    "Velocity is intentionally unchanged",
)
require(
    "packages/game-runtime/src/CollisionWorld.js",
    '"game-collision-world-v4-kinematic-owners"',
    "const ownerId = String(entry?.ownerId ?? id)",
)
require(
    "packages/game-runtime/src/CharacterPhysics.js",
    "supportColliderId: null",
    "state.supportColliderId = state.grounded",
)
require(
    "packages/game-runtime/src/GameRuntime.js",
    '"game-runtime-v8-kinematic-platforms"',
    "readGameKinematicCollisionFrame",
    "mergeKinematicCollisionWorld",
    "applyKinematicSupportMotion",
    "platformCarries",
    "lastKinematicRefreshMs",
)
game_runtime = read("packages/game-runtime/src/GameRuntime.js")
refresh_marker = "this.#refreshKinematicCollisionFrame();"
step_marker = "const result = this.clock.advance"
if not (
    refresh_marker in game_runtime and
    step_marker in game_runtime and
    game_runtime.index(refresh_marker) < game_runtime.index(step_marker)
):
    errors.append("GameRuntime deve atualizar poses cinemáticas antes do passo fixo")

require(
    "packages/renderer-three/src/ThreeRegionRenderer.js",
    "readGameKinematicCollisionFrame",
    "sinceRevision",
    "#gameCollidersForObject",
    "#gameCollisionPoseRevisions",
    'ownerId: id',
)
require(
    "packages/runtime-test-plugin/src/GameRuntimeTests.js",
    "delta afim do apoio transporta o personagem sem virar locomoção",
    "mundo cinemático substitui somente o proprietário animado",
    "runtime acompanha plataforma animada e conserva apoio",
)
require(
    "tools/test_kinematic_platforms_0054my.mjs",
    "kinematic platform tests passed",
)
require(
    "docs/KINEMATIC_PLATFORMS_0054MY.md",
    "readGameKinematicCollisionFrame",
    "supportColliderId",
    "solid",
    "trigger",
    "asset-reference",
)
require(
    "docs/MANUAL_DO_USUARIO.md",
    "### Plataformas móveis",
    "statistics.platformCarries",
)
require(
    "docs/REFERENCIA_TECNICA.md",
    "### Mundo cinemático revisionado",
    "nextMatrix * inverse(previousMatrix)",
)
require(
    "docs/project/DECISIONS.md",
    "## D-059",
    "Colisor animado é corpo cinemático efêmero",
)

kinematic = read("packages/game-runtime/src/KinematicCollisionWorld.js")
for forbidden in ("THREE.", "document.", "sandbox.dispatch", "commands.execute"):
    if forbidden in kinematic:
        errors.append(f"contrato cinemático acoplado a autoridade proibida: {forbidden}")

if errors:
    print("0054my falhou:")
    for error in errors:
        print("-", error)
    raise SystemExit(1)

print(
    "0054my ok: poses animadas atualizam somente colisores cinemáticos e "
    "transportam o personagem apoiado sem persistir estado físico."
)
