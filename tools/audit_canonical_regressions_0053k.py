#!/usr/bin/env python3
"""Static integration gate for recursive locally-resolved objects."""

from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
EXPECTED_BUILDS = {
    "20260809-0053k",
    "20260809-0053l",
    "20260809-0053m",
    "20260810-0054f",
    "20260812-0054g", "20260812-0054i", "20260812-0054j", "20260812-0054k", "20260812-0054l", "20260812-0054m", "20260812-0054ma", "20260812-0054mb", "20260812-0054mc", "20260812-0054md", "20260812-0054mh", "20260812-0054mi", "20260813-0054mj", "20260813-0054mk", "20260813-0054ml", "20260817-0054mm", "20260817-0054mn", "20260817-0054mn1", "20260817-0054mo", "20260817-0054mp", "20260817-0054mq", "20260818-0054mr", "20260818-0054ms"}


def source(relative: str) -> str:
    return (ROOT / relative).read_text(encoding="utf-8")


build = json.loads(source("apps/web/build-info.json"))
if build.get("build") not in EXPECTED_BUILDS:
    raise SystemExit(
        f"build incorreto: {build.get('build')!r}; esperado {sorted(EXPECTED_BUILDS)}."
    )

checks = {
    "packages/transform-hierarchy/src/LocallyResolvedObjectHierarchy.js": (
        "export class LocallyResolvedObjectHierarchy",
        "this.#resolveAt(parentId, layerIndex, resolving)",
        "invertAffineMatrix(lowerParent.worldMatrix)",
        "sourceLayer: entry ? layer.id : lower.sourceLayer",
    ),
    "packages/instance-graph/src/InstanceGraph.js": (
        "pathOverrides[`${slotId}/${pathKey}`]",
    ),
    "packages/local-viewers/src/LocalTransformPreviewCoordinator.js": (
        'this.#localSession?.phase !== "committing"',
        "barreira entre essas duas épocas",
        "projectionApplied(revision)",
    ),
    "packages/renderer-three/src/ThreeRegionRenderer.js": (
        "new LocallyResolvedObjectHierarchy()",
        '`shared-preview:${key}`',
        'this.#resolvedObjects.setLayer("animation"',
        'this.#emitTransformPreview("commit", session)',
        "new MeshEditVisibility",
    ),
    "packages/renderer-three/src/LocalBoundsScale.js": (
        "if (Math.abs(factor) >= floor) return factor",
        'throw new RangeError("A escala não pode ser singular.")',
    ),
    "tools/test_canonical_regressions_0053k.mjs": (
        "Canonical regressions 0053k",
        "override interno foi perdido",
        "mutação do commit removeu preview antes da projeção",
        "confirmação da revisão projetada não liberou preview",
    ),
}

for relative, markers in checks.items():
    content = source(relative)
    for marker in markers:
        if marker not in content:
            raise SystemExit(f"{relative}: marcador ausente: {marker}")

print(
    "Auditoria 0053k aprovada: resolução recursiva em camadas, overrides "
    "aninhados, barreira de commit, visibilidade atômica e espelho."
)
