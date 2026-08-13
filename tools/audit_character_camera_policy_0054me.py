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

game = require("packages/game-runtime/src/GameRuntime.js", (
    'movementReference: "camera"',
    'forward: Object.freeze([Math.sin(cameraYaw), 0, -Math.cos(cameraYaw)])',
    'right: Object.freeze([Math.cos(cameraYaw), 0, Math.sin(cameraYaw)])',
    'forward: Object.freeze([1, 0, 0])',
    'right: Object.freeze([0, 0, 1])',
))
for forbidden in ("Fox.glb", "GLTFLoader", "ThreeCharacterAnimationBackend"):
    if forbidden in game:
        errors.append(f"game-runtime conhece implementação visual: {forbidden}")

require("apps/web/bootstrap/createWebRuntime.js", (
    'DEFAULT_CHARACTER_VISUAL_ASSET',
    'src: "assets/characters/Fox.glb"',
    'object?.characterAnimation?.sourceMode ?? "default"',
    'customCharacterSources',
    'loadedCharacterSourceModes',
    'sourceReconcileSuppressed',
    '"character.animation.source.set"',
    '"character.animation.source.status"',
    'await ensureCharacterVisual(selectedId)',
    'source: "character-animation.source"',
))
require("apps/web/bootstrap/bindWebInterface.js", (
    'data-character-visual-source',
    'snapshot.controls?.movementReference ?? "camera"',
    'event.currentTarget?.value ?? "camera"',
))
require("apps/web/index.html", (
    'value="camera" selected',
    'Raposa padrão',
    'GLB carregado',
    'Objeto original',
))
require("packages/runtime-test-plugin/src/GameRuntimeTests.js", (
    '"movimento padrão acompanha a câmera livre"',
    '"referência mundial permanece configurável"',
))

if errors:
    print("0054me falhou:")
    for error in errors:
        print("-", error)
    raise SystemExit(1)
print(
    "Auditoria 0054me aprovada: câmera é referência padrão e fonte visual "
    "possui uma única política persistente na aplicação."
)
