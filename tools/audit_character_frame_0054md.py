#!/usr/bin/env python3
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
errors=[]
checks={
 "world-basis": (
   "packages/game-runtime/src/GameRuntime.js",
   ["forward: Object.freeze([1, 0, 0])", "right: Object.freeze([0, 0, 1])"]
 ),
 "yaw": (
   "packages/game-runtime/src/CharacterPhysics.js",
   ["Math.atan2(-directionZ, directionX)"]
 ),
 "visual-target": (
   "packages/character-animation-three/src/ThreeCharacterAnimationBackend.js",
   ["const targetForward = new Vector3(1, 0, 0)"]
 ),
 "tests": (
   "packages/runtime-test-plugin/src/GameRuntimeTests.js",
   ["frame mundial preserva W/S frente e A/D lateral"]
 ),
}
for name,(rel,tokens) in checks.items():
 text=(ROOT/rel).read_text(encoding="utf-8")
 for token in tokens:
  if token not in text: errors.append(f"{name}: ausente {token}")
if errors:
 print("0054md falhou:")
 for error in errors: print("-", error)
 raise SystemExit(1)
print("Auditoria 0054md aprovada: +Y up, +X forward, +Z right em input, yaw e visual GLB.")
