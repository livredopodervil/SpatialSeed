#!/usr/bin/env python3
"""Compatibility gate for the broad/narrow collision boundary introduced in 0054b."""
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
    "broadBounds",
    'case "local-box"',
    "intersectsAabbLocalBox",
    "worldIntersectsCharacterBounds",
))
for forbidden in ('from "three', "ThreeRegionRenderer", "document.", "window."):
    if forbidden in collision:
        errors.append(f"CollisionWorld acoplado a camada externa: {forbidden}")

physics = require("packages/game-runtime/src/CharacterPhysics.js", (
    'from "./CollisionWorld.js?build=20260810-0054e"',
    "worldIntersectsCharacterBounds",
    "separationDistance",
    "moveAxis",
))
if "collider.bounds" in physics:
    errors.append("CharacterPhysics ainda acessa diretamente bounds legado")

renderer = require("packages/renderer-three/src/ThreeRegionRenderer.js", (
    "broadBounds: freezeBounds(broadBounds)",
    "#gameCollisionBroadBounds",
))

tests = require("packages/runtime-test-plugin/src/GameRuntimeTests.js", (
    '"narrow phase respeita caixa local rotacionada"',
    '"contrato legado AABB continua aceito"',
))

if errors:
    print("Auditoria 0054b FALHOU:")
    for error in errors:
        print(f"- {error}")
    raise SystemExit(1)
print("Auditoria 0054b aprovada: broad phase separada da narrow phase.")
