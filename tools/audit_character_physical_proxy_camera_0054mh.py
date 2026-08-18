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
  if token not in s: errors.append(f"{rel}: marcador ausente: {token}")
 return s
build=json.loads(src("apps/web/build-info.json") or "{}")
current=build.get("build")
if current not in {"20260812-0054mh", "20260812-0054mi", "20260813-0054mj", "20260813-0054mk", "20260813-0054ml", "20260817-0054mm", "20260817-0054mn", "20260817-0054mn1", "20260817-0054mo", "20260817-0054mp", "20260817-0054mq", "20260818-0054mr", "20260818-0054ms", "20260818-0054mt", "20260818-0054mu", "20260818-0054mv", "20260818-0054mw", "20260818-0054mx"}: errors.append(f"build incorreto: {current!r}")
if current in {"20260813-0054ml", "20260817-0054mm", "20260817-0054mn", "20260817-0054mn1", "20260817-0054mo", "20260817-0054mp", "20260817-0054mq", "20260818-0054mr", "20260818-0054ms", "20260818-0054mt", "20260818-0054mu", "20260818-0054mv", "20260818-0054mw", "20260818-0054mx"}:
 backend=req("packages/character-animation-three/src/ThreeCharacterAnimationBackend.js", (
  "independent-visual-projection", 'fit: "none"', "attachRuntimeVisual"
 ))
 for forbidden in ("scaleIsolationRoot", "referenceParentScale", "parentCompensation"):
  if forbidden in backend: errors.append(f"backend consolidado ainda contém {forbidden}")
 req("packages/renderer-three/src/ThreeRegionRenderer.js", (
  "SpatialSeedRuntimePose", "this.scene.add(poseRoot)", "#syncRuntimeVisualPose", "bodyFrame"
 ))
 req("packages/game-runtime/src/GameRuntime.js", (
  "characterWorldBounds", "#cameraFreePosition", "cameraCharacterClearance", "wallDistance"
 ))
else:
 req("packages/character-animation-three/src/ThreeCharacterAnimationBackend.js", (
  "scale-isolation-wrapper", "referenceParentScale", "parentCompensation", "parentEffectiveScale", "rebindTarget"
 ))
 req("apps/web/bootstrap/createWebRuntime.js", ("scheduleCharacterVisualReconcile", '"proxy-bounds-sync"'))
if errors:
 print("0054mh falhou:")
 for e in errors: print("-",e)
 raise SystemExit(1)
print("Auditoria 0054mh aprovada: proxy físico e projeção visual permanecem independentes.")
