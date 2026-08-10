#!/usr/bin/env python3
"""Gate for final-mesh collision projection and composable game controls."""
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

collision = require("packages/game-runtime/src/CollisionWorld.js", (
    'COLLISION_WORLD_VERSION = "game-collision-world-v3-final-mesh"',
    'case "local-box"',
    'case "sphere"',
    'case "triangle-mesh"',
    "triangleIntersectsAabb",
    "worldIntersectsCharacterBounds",
))
for forbidden in ('from "three', "ThreeRegionRenderer", "document.", "window."):
    if forbidden in collision:
        errors.append(f"CollisionWorld acoplado a camada externa: {forbidden}")

projection = require("packages/renderer-three/src/GameCollisionProjection.js", (
    "geometryTriangleSoup",
    "gameCollisionShapeKind",
    "worldSphereFromGeometry",
    "freezeMeshPart",
))
renderer = require("packages/renderer-three/src/ThreeRegionRenderer.js", (
    'version: "game-collision-world-v3-final-mesh"',
    "#gameCollisionResourcesForObject",
    "#gameCollisionBroadBounds",
    'type: "triangle-mesh"',
    'type: "sphere"',
    'type: "local-box"',
))
heterogeneous = require("packages/renderer-three/src/HeterogeneousBatchManager.js", (
    "this.resourceGeometry = new Map()",
    "geometryOf(resourceId)",
    "this.resourceGeometry.set(id, geometry)",
    "this.resourceGeometry.delete(id)",
))
ui = require("apps/web/bootstrap/bindWebInterface.js", (
    "const gameKeyboardCodes = new Set()",
    "const gamePointerControls = new Map()",
    "gamePointerControls.set(event.pointerId, control)",
    "gameControlActive",
))
if "gamePressed.add(control)" in ui:
    errors.append("UI ainda usa estado único legado para controles de jogo")

tests = require("packages/runtime-test-plugin/src/GameRuntimeTests.js", (
    '"malha triangular rejeita vazio interno ao broad bounds"',
    '"esfera analítica não usa os cantos da AABB"',
))

if errors:
    print("Auditoria 0054c FALHOU:")
    for error in errors:
        print(f"- {error}")
    raise SystemExit(1)

print("Auditoria 0054c aprovada: controles combináveis e colisão por malha final.")
