#!/usr/bin/env python3
"""Static integration gate for scale commit and render-preset rebuild."""

from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
EXPECTED_BUILDS = {
    "20260808-0053i", "20260809-0053k", "20260809-0053l",
    "20260809-0053m",
    "20260810-0054f",
    "20260812-0054g", "20260812-0054i", "20260812-0054j", "20260812-0054k", "20260812-0054l", "20260812-0054m", "20260812-0054ma", "20260812-0054mb", "20260812-0054mc", "20260812-0054md", "20260812-0054mh", "20260812-0054mi", "20260813-0054mj", "20260813-0054mk", "20260813-0054ml", "20260817-0054mm", "20260817-0054mn", "20260817-0054mn1", "20260817-0054mo", "20260817-0054mp", "20260817-0054mq", "20260818-0054mr", "20260818-0054ms", "20260818-0054mt", "20260818-0054mu", "20260818-0054mv"}


def source(relative: str) -> str:
    return (ROOT / relative).read_text(encoding="utf-8")


build = json.loads(source("apps/web/build-info.json"))
if build.get("build") not in EXPECTED_BUILDS:
    raise SystemExit(
        f"build incorreto: {build.get('build')!r}; esperado {sorted(EXPECTED_BUILDS)}."
    )

renderer = source("packages/renderer-three/src/ThreeRegionRenderer.js")

rebuild_start = renderer.index("  #rebuildRenderableBatches() {")
rebuild_end = renderer.index("\n  #upsertObject(", rebuild_start)
rebuild = renderer[rebuild_start:rebuild_end]
for marker in (
    "proxy.userData.batchKey = null;",
    "proxy.userData.batchBaseKey = null;",
    "proxy.userData.spatialShardBaseKey = null;",
):
    if marker not in rebuild:
        raise SystemExit(
            f"0053i preset rebuild: invalidação ausente: {marker}"
        )

scale_start = renderer.index("  #previewSelectionScaleWithoutShear() {")
scale_end = renderer.index("\n  #updateVertexMarkers()", scale_start)
scale_preview = renderer[scale_start:scale_end]
required_scale = (
    "scaleWorldTrsWithoutShear({",
    "this.#fastTransformOverlay.setWorldMatrix(",
    "session.previewId,",
    "objectId,",
    "next.toArray()",
)
for marker in required_scale:
    if marker not in scale_preview:
        raise SystemExit(
            f"0053i scale commit: atualização ausente: {marker}"
        )

commit_start = renderer.index("  #commitSession() {")
commit_end = renderer.index("\n  #restorePreviewSession(", commit_start)
commit = renderer[commit_start:commit_end]
if "this.#fastTransformOverlay.worldMatrix(objectId)" not in commit:
    raise SystemExit("0053i scale commit: commit não consulta o overlay.")

print(
    "Auditoria 0053i aprovada: escala publica a matriz visual final e "
    "presets reinserem objetos nos lotes reconstruídos."
)
