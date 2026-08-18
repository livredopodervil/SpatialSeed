#!/usr/bin/env python3
from pathlib import Path
import json
ROOT=Path(__file__).resolve().parents[1]
errors=[]
def src(rel):
 p=ROOT/rel
 if not p.is_file(): errors.append(f"arquivo ausente: {rel}"); return ""
 return p.read_text(encoding="utf-8")
b=json.loads(src("apps/web/build-info.json") or "{}")
current=b.get("build")
if current not in {"20260813-0054mk", "20260813-0054ml", "20260817-0054mm", "20260817-0054mn", "20260817-0054mn1", "20260817-0054mo", "20260817-0054mp"}: errors.append(f"build incorreto: {current!r}")
backend=src("packages/character-animation-three/src/ThreeCharacterAnimationBackend.js")
renderer=src("packages/renderer-three/src/ThreeRegionRenderer.js")
tests=src("packages/runtime-test-plugin/src/CharacterAnimationTests.js")
if current in {"20260813-0054ml", "20260817-0054mm", "20260817-0054mn", "20260817-0054mn1", "20260817-0054mo", "20260817-0054mp"}:
 for forbidden in ("scaleIsolationRoot", "parentEffectiveScale", "isolationScale"):
  if forbidden in backend: errors.append(f"consolidação ainda contém {forbidden}")
 for token in ("SpatialSeedRuntimePose", "this.scene.add(poseRoot)", "poseRoot.scale.set(1, 1, 1)"):
  if token not in renderer: errors.append(f"renderer: ausente {token}")
 if "body físico pode mudar sem redimensionar a geometria visual" not in tests:
  errors.append("teste de independência body/visual ausente")
else:
 for token in ("scale-isolation-wrapper", "scaleIsolationRoot.add(visualRoot)", "scaleIsolationRoot.scale.fromArray(isolationScale)"):
  if token not in backend: errors.append(f"backend: ausente {token}")
if errors:
 print("0054mk falhou:")
 for e in errors: print("-",e)
 raise SystemExit(1)
print("0054mk ok: sucessor consolidado remove compensação hierárquica sem reintroduzir escala visual.")
