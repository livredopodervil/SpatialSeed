#!/usr/bin/env python3
from pathlib import Path
import json, sys
ROOT = Path(__file__).resolve().parents[1]
errors=[]
def src(p):
    q=ROOT/p
    if not q.exists(): errors.append(f"arquivo ausente: {p}"); return ""
    return q.read_text(encoding="utf-8")
path=src("packages/spatial-references/src/PathSketchController.js")
panel=src("packages/mesh-edit-panel/src/MeshEditPanel.js")
html=src("apps/web/index.html")
build=json.loads(src("apps/web/build-info.json") or "{}")
if build.get("build") == "20260812-0054k":
    for marker in [
        "const automatic = editPlane ?? drawingPlane ?? navigationPlane",
        'return normalizeFrame(automatic, resolvedSource)',
        'resolvedPlaneSource: active?.frame?.source ?? null'
    ]:
        if marker not in path: errors.append(f"contrato de plano ausente: {marker}")
    if "plano efetivo:" not in panel: errors.append("painel não publica plano efetivo")
    if "Automático: edição → desenho → trava → viewer" not in html:
        errors.append("UI não explicita prioridade automática")
elif build.get("build") in {"20260812-0054l", "20260812-0054m", "20260812-0054ma", "20260812-0054mc", "20260812-0054md", "20260812-0054mh", "20260812-0054mi", "20260813-0054mj", "20260813-0054mk", "20260813-0054ml", "20260817-0054mm", "20260817-0054mn", "20260817-0054mn1", "20260817-0054mo"}:
    for marker in ["resolveActiveAuthoringPlane", 'resolvedPlaneSource: active?.frame?.source ?? null']:
        if marker not in path: errors.append(f"migração 0054l ausente: {marker}")
    if "plano efetivo:" not in panel: errors.append("painel não publica plano efetivo")
    if 'value="active">Plano ativo' not in html:
        errors.append("UI 0054l não expõe plano ativo")
else:
    errors.append(f"build incorreto: {build.get('build')!r}")
print(json.dumps({"scope":"0054k-path-drawing-plane","ok":not errors,"failures":errors},ensure_ascii=False,indent=2))
sys.exit(1 if errors else 0)
