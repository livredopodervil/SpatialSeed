#!/usr/bin/env python3
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
checks={
 "core":("packages/character-animation/src/CharacterAnimationSystem.js",["configureVisual","visual"]),
 "three":("packages/character-animation-three/src/ThreeCharacterAnimationBackend.js",["normalizeVisualOptions","applyCharacterVisualAlignment","sourceForward","anchorTranslation","fitScale"]),
 "renderer":("packages/renderer-three/src/ThreeRegionRenderer.js",["readRuntimeVisualTargetFrame"]),
 "web":("apps/web/bootstrap/createWebRuntime.js",["character.animation.visual.configure"]),
 "ui":("apps/web/index.html",["data-character-visual-fit","data-character-visual-forward","data-character-visual-anchor","data-character-visual-hover"]),
 "tests":("packages/runtime-test-plugin/src/CharacterAnimationTests.js",["auto-fit alinha altura pés","ajuste visual permite hover"]),
}
errors=[]
for name,(rel,tokens) in checks.items():
 text=(ROOT/rel).read_text(encoding='utf-8')
 for token in tokens:
  if token not in text: errors.append(f'{name}:{token}')
if errors: raise SystemExit('0054ma character visual alignment audit failed: '+', '.join(errors))
print('0054ma character visual alignment audit: ok')
