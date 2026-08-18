#!/usr/bin/env python3
from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]
errors = []

def src(rel):
    path = ROOT / rel
    if not path.is_file():
        errors.append(f"arquivo ausente: {rel}")
        return ""
    return path.read_text(encoding="utf-8")

def require(rel, tokens):
    text = src(rel)
    for token in tokens:
        if token not in text:
            errors.append(f"{rel}: marcador ausente: {token}")
    return text

build = json.loads(src("apps/web/build-info.json") or "{}")
expected_channels = {
    "20260813-0054ml": "feature/0054ml-character-runtime-consolidation",
    "20260817-0054mm": "release/0054mm-documentation-demo",
    "20260817-0054mn": "feature/0054mn-command-palette",
    "20260817-0054mn1": "fix/0054mn1-command-palette-console-bridge",
    "20260817-0054mo": "feature/0054mo-property-schema-consolidation",
    "20260817-0054mp": "feature/0054mp-analog-game-controls-shadow",
    "20260817-0054mq": "feature/0054mq-collision-debug-overlay",
    "20260818-0054mr": "feature/0054mr-obb-slope-kinematics",
    "20260818-0054ms": "fix/0054ms-recovery-before-demo-launch",
}
current_build = build.get("build")
if current_build not in expected_channels:
    errors.append(f"build incorreto: {current_build!r}")
elif build.get("channel") != expected_channels[current_build]:
    errors.append(f"canal incorreto: {build.get('channel')!r}")

body = require("packages/game-runtime/src/CharacterBodyFrame.js", (
    "character-body-frame-v2-obb",
    "characterBodyWorldBounds",
    "characterBodyWorldHalfExtents",
    "baseYaw",
))
physics = require("packages/game-runtime/src/CharacterPhysics.js", (
    "colliderHorizontalScale: 1",
    "normalizeCharacterBodyFrame",
    "characterBodyWorldBounds",
    "characterBodyWorldHalfExtents",
))
game = require("packages/game-runtime/src/GameRuntime.js", (
    "game-runtime-v6-character-body-frame",
    "bodyFrame: world.character.bodyFrame ?? null",
    "yawDelta = this.#physics.yaw - (this.#physics.baseYaw ?? 0)",
    "characterWorldBounds",
    "orbitDistance = camera.distance + bodySupport",
    "characterBodyHorizontalSupport",
))
renderer = require("packages/renderer-three/src/ThreeRegionRenderer.js", (
    "SpatialSeedRuntimePose",
    "this.scene.add(poseRoot)",
    "#syncRuntimeVisualPose",
    "#syncRuntimeVisualsForObject(String(entry.id))",
    "#characterBodyFrameForObjectId",
    'discardedReason = "game-input-owned"',
    "bodyFrame: this.#characterBodyFrameForObjectId(id)",
))
backend = require("packages/character-animation-three/src/ThreeCharacterAnimationBackend.js", (
    "independent-visual-projection",
    'fit: "none"',
    "visualRoot",
    "anchorTranslation",
))
for forbidden in (
    "scaleIsolationRoot",
    "referenceParentScale",
    "parentEffectiveScale",
    "parentCompensation",
):
    if forbidden in backend:
        errors.append(f"backend ainda contém compensação removida: {forbidden}")
if "proxy.add(visual)" in renderer:
    errors.append("renderer ainda anexa visual diretamente ao proxy físico")
web = require("apps/web/bootstrap/createWebRuntime.js", (
    "DEFAULT_CHARACTER_VISUAL_OPTIONS",
    'fit: "none"',
    "scale: 0.01",
    "defaultDemoLaunch",
))
require("apps/web/bootstrap/bindWebInterface.js", (
    'fit: characterVisualControls.fit?.value ?? "none"',
    'characterVisualControls.fit.value = visual.fit ?? "none"',
))
index = require("apps/web/index.html", (
    '<option value="none" selected>Sem auto-fit</option>',
))
if '<option value="height" selected>' in index:
    errors.append("UI ainda possui auto-fit de altura como default paralelo")
require("apps/web/main.js", (
    "await interfaceBinding.ready",
    'application.runtime.execute("game.start"',
    "defaultDemoLaunch",
))
if "globalThis.setTimeout?.(async () =>" in web:
    errors.append("autostart demo ainda depende de timer do bootstrap")
for forbidden in ("scheduleCharacterVisualReconcile", '"proxy-bounds-sync"'):
    if forbidden in web:
        errors.append(f"web ainda contém reconciliador redundante: {forbidden}")
require("packages/runtime-test-plugin/src/GameRuntimeTests.js", (
    "body horizontal acompanha o yaw sem perder comprimento físico",
    "distância nominal da câmera cresce com o comprimento físico do body",
))
require("packages/runtime-test-plugin/src/CharacterAnimationTests.js", (
    "body físico pode mudar sem redimensionar a geometria visual",
))

demo = json.loads(src("apps/web/assets/demo/default-game.spatialseed") or "{}")
objects = demo.get("scene", {}).get("objects", [])
if len(objects) < 46:
    errors.append("demo não contém o personagem 46")
else:
    character = objects[45]
    if character.get("rotation") != [0, 0, 0, 1]:
        errors.append("personagem demo não está com rotação identidade")
    scale = character.get("scale") or []
    if len(scale) != 3 or not (scale[0] > scale[2] and scale[0] > scale[1]):
        errors.append(f"body demo não representa quadrúpede horizontal: {scale!r}")

if errors:
    print("0054ml falhou:")
    for error in errors:
        print("-", error)
    raise SystemExit(1)
print("0054ml ok: body orientado, visual independente, input exclusivo e câmera consome o mesmo body.")
