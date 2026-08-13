#!/usr/bin/env python3
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
checks={
 "core":("packages/character-animation/src/CharacterAnimationSystem.js",["CharacterAnimationSystem","observeMotion","inferCharacterAnimationBindings"]),
 "three":("packages/character-animation-three/src/ThreeCharacterAnimationBackend.js",["GLTFLoader","AnimationMixer","attachRuntimeVisual","in-place-horizontal"]),
 "renderer":("packages/renderer-three/src/ThreeRegionRenderer.js",["attachRuntimeVisual","setRuntimeVisualActive","detachRuntimeVisual"]),
 "game":("packages/game-runtime/src/GameRuntime.js",["characterAnimation","characterMotionSnapshot"]),
 "web":("apps/web/bootstrap/createWebRuntime.js",["character.animation.asset.load","character.animation.play","ThreeCharacterAnimationBackend"]),
 "ui":("apps/web/index.html",["character-import-glb","character-glb-file-input"]),
}
errors=[]
for name,(rel,tokens) in checks.items():
 text=(ROOT/rel).read_text(encoding='utf-8')
 for token in tokens:
  if token not in text: errors.append(f'{name}:{token}')
if errors: raise SystemExit('0054m character animation audit failed: '+', '.join(errors))
print('0054m character animation audit: ok')
