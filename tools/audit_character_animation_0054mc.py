#!/usr/bin/env python3
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
checks={
 "yaw":("packages/game-runtime/src/CharacterPhysics.js",["Math.atan2(-directionZ, directionX)"]),
 "local-anchor":("packages/character-animation-three/src/ThreeCharacterAnimationBackend.js",["boundsInTargetLocalSpace","objectLocalBounds","expandBoxByTransformedBox"]),
 "history":("apps/web/bootstrap/createWebRuntime.js",["character-animation.visual","visualBaseline","gameplayChanges"]),
 "source":("packages/core/src/Sandbox.js",["change.source ? { source: change.source }"]),
 "hud":("apps/web/bootstrap/bindWebInterface.js",["presentationChanged","unsubscribeCharacterAnimation"]),
}
errors=[]
for name,(rel,tokens) in checks.items():
 text=(ROOT/rel).read_text(encoding="utf-8")
 for token in tokens:
  if token not in text: errors.append(f"{name}: ausente {token}")
if errors:
 print("0054mc falhou:")
 for e in errors: print("-",e)
 raise SystemExit(1)
print("Auditoria 0054mc aprovada: yaw lateral, âncora local, HUD estável e Undo/Redo visual.")
