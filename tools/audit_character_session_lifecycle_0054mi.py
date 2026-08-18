#!/usr/bin/env python3
from pathlib import Path
import json
ROOT=Path(__file__).resolve().parents[1]
errors=[]
def src(rel):
 p=ROOT/rel
 if not p.is_file(): errors.append(f"arquivo ausente: {rel}"); return ""
 return p.read_text(encoding="utf-8")
def req(rel,tokens):
 s=src(rel)
 for token in tokens:
  if token not in s: errors.append(f"{rel}: ausente {token}")
 return s
b=json.loads(src("apps/web/build-info.json") or "{}")
current=b.get("build")
if current not in {"20260812-0054mi", "20260813-0054mj", "20260813-0054mk", "20260813-0054ml", "20260817-0054mm", "20260817-0054mn", "20260817-0054mn1", "20260817-0054mo", "20260817-0054mp", "20260817-0054mq", "20260818-0054mr", "20260818-0054ms", "20260818-0054mt", "20260818-0054mu", "20260818-0054mv", "20260818-0054mw"}: errors.append(f"build incorreto: {current!r}")
req("apps/web/bootstrap/createWebRuntime.js", ("retainOnlyCharacterVisual","unloadCharacterVisual","await retainOnlyCharacterVisual(selectedId)","if (activeId) await unloadCharacterVisual(activeId)"))
req("apps/web/bootstrap/bindWebInterface.js", ('event.pointerType === "mouse"','event.button !== 0'))
if current in {"20260813-0054ml", "20260817-0054mm", "20260817-0054mn", "20260817-0054mn1", "20260817-0054mo", "20260817-0054mp", "20260817-0054mq", "20260818-0054mr", "20260818-0054ms", "20260818-0054mt", "20260818-0054mu", "20260818-0054mv", "20260818-0054mw"}:
 req("packages/character-animation-three/src/ThreeCharacterAnimationBackend.js", ('previewInEditor: false','fit: "none"'))
 req("packages/renderer-three/src/ThreeRegionRenderer.js", ('discardedReason = "game-input-owned"','this.scene.add(poseRoot)'))
else:
 req("packages/character-animation-three/src/ThreeCharacterAnimationBackend.js", ("previewInEditor: false","compensatedBounds","physical proxy boundary"))
req("packages/character-animation/src/CharacterAnimationSystem.js", ("!inferred.jump && inferred.run","DEFAULT_TRANSITIONS.jump"))
req("apps/web/index.html", ('data-character-visual-preview type="checkbox"',))
if errors:
 print("0054mi falhou:")
 for e in errors: print("-",e)
 raise SystemExit(1)
print("0054mi ok: lifecycle exclusivo, input do jogo e fallback jump->run permanecem ativos.")
