#!/usr/bin/env python3
"""Boundary gate for 0054j STL mesh exchange."""
from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]
errors = []

def require(relative, markers):
    path = ROOT / relative
    text = path.read_text(encoding="utf-8") if path.is_file() else ""
    if not text:
        errors.append(f"arquivo ausente ou vazio: {relative}")
    for marker in markers:
        if marker not in text:
            errors.append(f"{relative}: marcador ausente: {marker}")
    return text

build = json.loads((ROOT / "apps/web/build-info.json").read_text(encoding="utf-8"))
if build.get("build") not in {"20260812-0054j", "20260812-0054k", "20260812-0054l", "20260812-0054m", "20260812-0054ma", "20260812-0054mc", "20260812-0054md", "20260812-0054mh", "20260812-0054mi", "20260813-0054mj", "20260813-0054mk", "20260813-0054ml", "20260817-0054mm", "20260817-0054mn", "20260817-0054mn1", "20260817-0054mo", "20260817-0054mp", "20260817-0054mq", "20260818-0054mr", "20260818-0054ms", "20260818-0054mt", "20260818-0054mu"}:
    errors.append(f"build incorreto: {build.get('build')!r}")

codec = require("packages/mesh-exchange/src/StlCodec.js", (
    "decodeStl", "encodeBinaryStl", "encodeAsciiStl", "indexTriangleSoup"
))
for forbidden in ('from "three', "document.", "window."):
    if forbidden in codec:
        errors.append(f"codec STL acoplado a camada externa: {forbidden}")

service = require("packages/mesh-exchange/src/MeshExchangeService.js", (
    "MeshExchangeService", "importStl", "exportSelectionStl", "triangulateObject"
))
for forbidden in ('from "three', "document.", "window."):
    if forbidden in service:
        errors.append(f"MeshExchangeService acoplado a camada externa: {forbidden}")

require("packages/mesh-exchange-three/src/ThreeMeshExchangeProjection.js", (
    'from "three"', "createThreeMeshTriangulator", "describeLegacyObject", "determinant() < 0"
))
require("packages/platform-web/src/BrowserAssetFileGateway.js", (
    "BrowserAssetFileGateway", "arrayBuffer", "showOpenFilePicker", "showSaveFilePicker"
))
require("apps/web/bootstrap/createWebRuntime.js", (
    "MeshExchangeService", "createThreeMeshTriangulator", '"mesh.import.stl"', '"mesh.export.stl"', '"mesh.exchange.formats"'
))
require("apps/web/bootstrap/bindWebInterface.js", (
    "BrowserAssetFileGateway", '$("mesh-import-stl")', '$("mesh-export-stl")', "mesh.import.stl", "mesh.export.stl"
))
require("apps/web/index.html", (
    'id="mesh-import-stl"', 'id="mesh-export-stl"', 'id="mesh-stl-file-input"'
))
require("packages/runtime-test-plugin/src/RuntimeLayerTests.js", (
    '"mesh-exchange"', "decodeStl", "encodeBinaryStl", "MeshExchangeService"
))
require("docs/MESH_EXCHANGE_0054J.md", (
    "formato de transporte", "mesh-exchange-three", "mesh.exchange.formats", "glTF/GLB"
))

if errors:
    print("Auditoria 0054j FALHOU:")
    for error in errors:
        print(f"- {error}")
    raise SystemExit(1)
print("0054j STL mesh exchange audit: ok")
