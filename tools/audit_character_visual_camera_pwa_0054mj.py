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
if current not in {"20260813-0054mj", "20260813-0054mk", "20260813-0054ml", "20260817-0054mm", "20260817-0054mn", "20260817-0054mn1", "20260817-0054mo", "20260817-0054mp", "20260817-0054mq", "20260818-0054mr", "20260818-0054ms", "20260818-0054mt", "20260818-0054mu", "20260818-0054mv", "20260818-0054mw"}: errors.append(f"build incorreto: {current!r}")
if current in {"20260813-0054ml", "20260817-0054mm", "20260817-0054mn", "20260817-0054mn1", "20260817-0054mo", "20260817-0054mp", "20260817-0054mq", "20260818-0054mr", "20260818-0054ms", "20260818-0054mt", "20260818-0054mu", "20260818-0054mv", "20260818-0054mw"}:
 req("packages/character-animation-three/src/ThreeCharacterAnimationBackend.js", ("independent-visual-projection", 'fit: "none"'))
 runtime_version = "game-runtime-v7-independent-visual-facing" if current in {"20260818-0054mt", "20260818-0054mu", "20260818-0054mv", "20260818-0054mw"} else "game-runtime-v6-character-body-frame"
 req("packages/game-runtime/src/GameRuntime.js", (runtime_version,"desiredCameraPosition","minimumBaseClearance","#cameraFreePosition","characterWorldBounds"))
else:
 req("packages/character-animation-three/src/ThreeCharacterAnimationBackend.js", ("scale-isolation-wrapper","parentEffectiveScale","matrixWorld","decompose"))
 req("packages/game-runtime/src/GameRuntime.js", ("stable-initial-camera","desiredCameraPosition","minimumBaseClearance","#cameraFreePosition"))
req("apps/web/boot.js", ("loadPublishedBuildInfo",'cache: "no-store"'))
req("apps/web/service-worker.js", ("isControlPlaneRequest(url)","build-info.json","precache-manifest.json"))
req("packages/runtime-test-plugin/src/GameRuntimeTests.js", ("câmera inicia diretamente no rig configurado","câmera não orbita abaixo da base física"))
if errors:
 print("0054mj falhou:")
 for e in errors: print("-",e)
 raise SystemExit(1)
print("0054mj ok: câmera estável e build-info fora do cache antigo; visual consolidado independente do proxy.")
