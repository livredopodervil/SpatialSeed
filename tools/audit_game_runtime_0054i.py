#!/usr/bin/env python3
"""Boundary gate for 0054i game camera/audio/flat-collider consolidation."""
from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]
errors = []

def require(relative, markers):
    path = ROOT / relative
    text = path.read_text(encoding="utf-8") if path.is_file() else ""
    if not text:
        errors.append(f"arquivo ausente ou vazio: {relative}")
    for marker in markers:
        if marker not in text:
            errors.append(f"{relative}: marcador ausente: {marker}")
    return text

build = json.loads((ROOT / "apps/web/build-info.json").read_text(encoding="utf-8"))
if build.get("build") not in {"20260812-0054i", "20260812-0054j", "20260812-0054k", "20260812-0054l", "20260812-0054m", "20260812-0054ma", "20260812-0054mc", "20260812-0054md", "20260812-0054mh", "20260812-0054mi", "20260813-0054mj", "20260813-0054mk", "20260813-0054ml", "20260817-0054mm", "20260817-0054mn", "20260817-0054mn1", "20260817-0054mo", "20260817-0054mp", "20260817-0054mq", "20260818-0054mr", "20260818-0054ms", "20260818-0054mt", "20260818-0054mu", "20260818-0054mv"}:
    errors.append(f"build incorreto: {build.get('build')!r}")

collision = require("packages/game-runtime/src/CollisionWorld.js", (
    "castCollisionSegment",
    "normalizeBroadBounds",
    "MIN_BROAD_HALF_THICKNESS",
    "segmentTriangleFraction",
))
for forbidden in ('from "three', "ThreeRegionRenderer", "document.", "window."):
    if forbidden in collision:
        errors.append(f"CollisionWorld acoplado a camada externa: {forbidden}")

require("packages/game-runtime/src/GameRuntime.js", (
    "collisionEnabled: true",
    "collisionProbeRadius: 0.18",
    "collisionMinimumDistance: 0.35",
    "cameraCollisionPosition",
    "castCollisionSegment",
))
require("apps/web/bootstrap/createWebRuntime.js", (
    'src: "assets/audio/music.ogg"',
    'src: "assets/audio/jump.mp3"',
    'src: "assets/audio/land.mp3"',
    'event: "game.start"',
    'event: "game.stop"',
    'action.clip',
    'gameAudio.playMusic()',
))
require("packages/runtime-test-plugin/src/GameRuntimeTests.js", (
    '"plano copiado permanece válido como colisor sem volume AABB"',
    '"consulta de câmera retorna a primeira superfície no segmento"',
    '"câmera de jogo retrai antes de atravessar parede"',
))
require("docs/project/ROADMAP.md", (
    "0054b–0054i",
    "0055 é o critério de maturidade",
    "MODULE_TYPELESS_PACKAGE_JSON",
))

if errors:
    print("Auditoria 0054i FALHOU:")
    for error in errors:
        print(f"- {error}")
    raise SystemExit(1)
print("0054i game camera/audio/flat-collider audit: ok")
