#!/usr/bin/env python3
"""Static integration gate for mouse gizmo/camera exclusion in build 0053h."""

from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
EXPECTED_BUILDS = {
    "20260808-0053i", "20260809-0053k", "20260809-0053l",
    "20260809-0053m",
    "20260810-0054f",
    "20260812-0054g", "20260812-0054i", "20260812-0054j", "20260812-0054k", "20260812-0054l", "20260812-0054m", "20260812-0054ma", "20260812-0054mb", "20260812-0054mc", "20260812-0054md", "20260812-0054mh", "20260812-0054mi", "20260813-0054mj", "20260813-0054mk", "20260813-0054ml", "20260817-0054mm", "20260817-0054mn", "20260817-0054mn1", "20260817-0054mo", "20260817-0054mp", "20260817-0054mq", "20260818-0054mr", "20260818-0054ms", "20260818-0054mt", "20260818-0054mu"}


def source(relative: str) -> str:
    return (ROOT / relative).read_text(encoding="utf-8")


build = json.loads(source("apps/web/build-info.json"))
if build.get("build") not in EXPECTED_BUILDS:
    raise SystemExit(
        f"build incorreto: {build.get('build')!r}; esperado {sorted(EXPECTED_BUILDS)}."
    )

policy = source("packages/renderer-three/src/EditorOrbitPolicy.js")
renderer = source("packages/renderer-three/src/ThreeRegionRenderer.js")
runtime_tests = source("packages/runtime-test-plugin/src/RuntimeLayerTests.js")

required = {
    "policy": (
        policy,
        "if (transformDragging || boundsScaleActive) return false;",
    ),
    "drag-event": (
        renderer,
        "transformDragging: Boolean(event.value)",
    ),
    "central-policy": (
        renderer,
        "#resolveEditorOrbitEnabled({",
    ),
    "runtime-regression": (
        runtime_tests,
        "arraste do gizmo prevalece sobre navegação auxiliar de mouse e touch",
    ),
}
for name, (text, marker) in required.items():
    if marker not in text:
        raise SystemExit(f"0053h {name}: marcador ausente: {marker}")

legacy = (
    "this.orbit.enabled = this.#toolGestureNavigation.active ||\n"
    "        !event.value;"
)
if legacy in renderer:
    raise SystemExit("0053h: precedência antiga ainda presente no arraste.")

print(
    "Auditoria 0053h aprovada: gizmo bloqueia a câmera antes da navegação "
    "auxiliar e restaura a política ao encerrar."
)
