#!/usr/bin/env python3
"""Static integration gate for the local game-mode boundary introduced in 0054a."""

from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
errors: list[str] = []


def source(relative: str) -> str:
    path = ROOT / relative
    if not path.is_file():
        errors.append(f"arquivo ausente: {relative}")
        return ""
    return path.read_text(encoding="utf-8")


def require(relative: str, markers: tuple[str, ...]) -> None:
    content = source(relative)
    for marker in markers:
        if marker not in content:
            errors.append(f"{relative}: marcador ausente: {marker}")


build = json.loads(source("apps/web/build-info.json") or "{}")
if build.get("build") not in {"20260810-0054f", "20260812-0054g", "20260812-0054i", "20260812-0054j", "20260812-0054k", "20260812-0054l", "20260812-0054m", "20260812-0054ma", "20260812-0054mc", "20260812-0054md", "20260812-0054mh", "20260812-0054mi", "20260813-0054mj", "20260813-0054mk", "20260813-0054ml", "20260817-0054mm", "20260817-0054mn", "20260817-0054mn1", "20260817-0054mo", "20260817-0054mp", "20260817-0054mq", "20260818-0054mr", "20260818-0054ms", "20260818-0054mt", "20260818-0054mu", "20260818-0054mv", "20260818-0054mw"}:
    errors.append(f"build incorreto: {build.get('build')!r}")

require("packages/game-runtime/src/CharacterPhysics.js", (
    "stepCharacterPhysics",
    "moveHorizontalAxis",
    "moveVertical",
    "respawnBelow",
))
game_runtime = source("packages/game-runtime/src/GameRuntime.js")
for marker in (
    "new SimulationClock()",
    "readGameCollisionWorld",
    "captureAnimationTargets",
    "setRuntimePresentationMode(\"game\")",
    'cameraController.execute("viewer.camera.look-at"',
    "restoreAnimationTargets",
):
    if marker not in game_runtime:
        errors.append(f"GameRuntime: marcador ausente: {marker}")
for forbidden in ("sandbox.execute", "history.undo", "history.redo"):
    if forbidden in game_runtime:
        errors.append(f"GameRuntime acoplado ao estado editorial: {forbidden}")

require("packages/renderer-three/src/ThreeRegionRenderer.js", (
    "readGameCollisionWorld(characterId)",
    'setRuntimePresentationMode(mode = "authoring")',
    'this.#runtimePresentationMode === "game"',
))
require("apps/web/bootstrap/createWebRuntime.js", (
    '"game.start"',
    '"game.stop"',
    '"game.input.set"',
    '.register("game.status"',
    'runtime.emit("game.changed"',
))
require("apps/web/bootstrap/bindWebInterface.js", (
    'uiActions.bindControl($("game-mode"), "game.toggle")',
    'documentRoot.body.classList.toggle("ss-game-mode", active)',
    'execute("game.input.set"',
    'execute("game.stop", { reason: "escape" })',
))
require("apps/web/index.html", (
    'id="game-mode"',
    'id="game-hud"',
    'data-game-control="jump"',
))
require("apps/web/style.css", (
    "body.ss-game-mode > :not(#world):not(#game-hud):not(#error-box)",
    "body.ss-game-mode #game-hud",
))
require("packages/runtime-test-plugin/src/GameRuntimeTests.js", (
    '"gravidade apoia o personagem sobre uma plataforma"',
    '"colisão lateral impede atravessar uma parede"',
    '"pulo sobe, cai e retorna ao chão"',
    '"runtime aplica overlay local, acompanha com câmera e restaura autoria"',
))
require("docs/GAME_MODE_0054A.md", (
    "estado efêmero",
    "Limites deliberados",
))

ui = json.loads(source("apps/web/config/ui.default.json") or "{}")
if "game-mode" not in ui.get("toolbar", {}).get("primary", []):
    errors.append("game-mode ausente da toolbar primária")
bindings = {
    (entry.get("action"), entry.get("chord"), entry.get("context"))
    for entry in ui.get("shortcuts", {}).get("bindings", [])
}
if ("game.toggle", "G", "viewport") not in bindings:
    errors.append("atalho G do modo jogo ausente")

if errors:
    print("Auditoria 0054a FALHOU:")
    for error in errors:
        print(f"- {error}")
    raise SystemExit(1)

print(
    "Auditoria 0054a aprovada: física e câmera locais, apresentação de jogo, "
    "comandos públicos, controles e regressões."
)
