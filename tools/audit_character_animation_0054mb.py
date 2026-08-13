#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
errors = []

def source(relative):
    path = ROOT / relative
    if not path.is_file():
        errors.append(f"arquivo ausente: {relative}")
        return ""
    return path.read_text(encoding="utf-8")

def require(relative, markers):
    text = source(relative)
    for marker in markers:
        if marker not in text:
            errors.append(f"{relative}: marcador ausente: {marker}")
    return text

game_runtime = require("packages/game-runtime/src/GameRuntime.js", (
    'function movementBasis(reference, cameraYaw)',
    'controls: this.controlConfig',
))
if 'movementReference:' not in game_runtime:
    errors.append("game-runtime: política movementReference ausente")
require("packages/character-animation/src/CharacterAnimationSystem.js", (
    '"survey"',
    'character-animation-v1.',
    'this.#playState(instance, "idle", { reset: true, fadeSeconds: 0 })',
))
require("packages/character-animation-three/src/ThreeCharacterAnimationBackend.js", (
    'previewInEditor',
    'entry.active || entry.visualOptions.previewInEditor !== false',
    'if (!entry.active) entry.mixer.update(0)',
))
require("apps/web/bootstrap/bindWebInterface.js", (
    'function placeCharacterVisualPanel(inGame)',
    'id="game-movement-reference"' if False else '$("game-movement-reference")',
    'data-character-visual-preview',
))
require("apps/web/index.html", (
    'id="game-movement-reference"',
    'data-character-visual-preview',
))
game_tests = source("packages/runtime-test-plugin/src/GameRuntimeTests.js")
legacy_tests = (
    '"movimento padrão é estável e independente da câmera"',
    '"referência de movimento por câmera permanece configurável"',
)
current_tests = (
    '"movimento padrão acompanha a câmera livre"',
    '"referência mundial permanece configurável"',
)
if not (all(token in game_tests for token in legacy_tests) or
        all(token in game_tests for token in current_tests)):
    errors.append("game-runtime tests: contrato de referência de movimento ausente")
require("packages/runtime-test-plugin/src/CharacterAnimationTests.js", (
    '"Survey do Fox é reconhecido como idle"',
    '"load e deactivate deixam o personagem em idle para preview"',
))

if errors:
    print("0054mb falhou:")
    for error in errors:
        print(f"- {error}")
    raise SystemExit(1)
print("Auditoria 0054mb aprovada: movimento explícito, idle estável e preview único editor/jogo.")
