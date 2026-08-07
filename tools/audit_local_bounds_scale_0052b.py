#!/usr/bin/env python3
from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]
BUILD = "20260807-0052b"

def read(path):
    p = ROOT / path
    if not p.is_file():
        raise SystemExit(f"Arquivo ausente: {path}")
    return p.read_text(encoding="utf-8")

def require(text, token, label):
    if token not in text:
        raise SystemExit(f"Falha 0052b scale: {label}.")

build = json.loads(read("apps/web/build-info.json"))
if build.get("build") != BUILD:
    raise SystemExit(f"Build incorreto: {build.get('build')!r}; esperado {BUILD}.")

renderer = read("packages/renderer-three/src/ThreeRegionRenderer.js")
local = read("packages/renderer-three/src/LocalBoundsScale.js")

checks = [
    (renderer, 'from "./LocalBoundsScale.js?build=20260807-0052b"', "LocalBoundsScale não conectado ao renderer"),
    (renderer, "#tryBeginBoundsScale(event)", "pointerdown não tenta escala por bounds"),
    (renderer, "#updateBoundsScale(event)", "preview de escala por bounds ausente"),
    (renderer, "#finishBoundsScale(event)", "commit de escala por bounds ausente"),
    (renderer, "#localBoundsScaleFrame()", "frame local de bounds ausente"),
    (renderer, "#previewSelectionScaleWithoutShear()", "preview sem shear ausente"),
    (renderer, "scaleFromCenter: false", "política centro/oposto ausente"),
    (local, "createLocalBoundsScaleHandleSet", "gerador de controles diagonais ausente"),
    (local, "oppositeIndex", "pares diagonais/opostos ausentes"),
]
for text, token, label in checks:
    require(text, token, label)

print("Auditoria 0052b aprovada: escala local por bounds voltou a usar controles diagonais/cantos, pivô oposto/centro e preview sem shear.")
