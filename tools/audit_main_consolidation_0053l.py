#!/usr/bin/env python3
"""Static integration gate for the 0053l main-consolidation contracts."""

from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
EXPECTED_BUILDS = {"20260809-0053l", "20260809-0053m", "20260810-0054f", "20260812-0054g"}


def source(relative: str) -> str:
    return (ROOT / relative).read_text(encoding="utf-8")


build = json.loads(source("apps/web/build-info.json"))
if build.get("build") not in EXPECTED_BUILDS:
    raise SystemExit(
        f"build incorreto: {build.get('build')!r}; esperado um de {sorted(EXPECTED_BUILDS)}."
    )

checks = {
    "packages/editor-core/src/EditorState.js": (
        'policy: "bounds"',
    ),
    "packages/editor-core/src/Selection.js": (
        'pivotPolicy = "bounds"',
    ),
    "packages/edit-context/src/EditContextController.js": (
        "const lastTransformMode = this.editor.snapshot().tool.transformMode;",
        "this.renderer.setTransformMode(",
    ),
    "packages/mesh-editor-core/src/MeshEditController.js": (
        "enter({ selectAll = false } = {})",
        "descriptor.positions.length\n        ? [0]",
        "const transformMode = this.editor.snapshot?.().tool?.transformMode;",
    ),
    "packages/transform-hierarchy/src/LocallyResolvedObjectHierarchy.js": (
        "resolveAffectedBy(entries = [], options = {})",
        "const affected = this.affectedBy([...layer.entries.keys()]);",
    ),
    "packages/renderer-three/src/ThreeRegionRenderer.js": (
        "#localTransformPreviewLayers = new Map();",
        "`local-preview:${session.previewId}`",
        "#applyLocalTransformPreview(session, entries",
        "this.#resolvedObjects.resolveAffectedBy(entries)",
        'if (policy === "reference")',
        "this.#resolvedObjects.worldMatrix(targetId)",
    ),
    "apps/web/bootstrap/createWebRuntime.js": (
        "reference: object?.anchorRef ?? object?.geometry?.anchorRef ?? null",
    ),
    "packages/runtime-test-plugin/src/RuntimeLayerTests.js": (
        "pivô padrão acompanha o centro dos limites da seleção",
        "entrada em componentes reativa a última transformação",
        "entrada de malha seleciona o primeiro vértice e preserva a transformação",
        "cache de preview enumera recursivamente a subárvore afetada",
        "console executa consulta registrada por identificador canônico",
        "rótulo denuncia cache controlador anterior",
    ),
}

for relative, markers in checks.items():
    content = source(relative)
    for marker in markers:
        if marker not in content:
            raise SystemExit(f"{relative}: marcador ausente: {marker}")

hud = source("packages/edit-hud/src/EditHud.js")
duplicate_start = hud.index(
    'this.#element("edit-hud-duplicate").addEventListener("click", () => {'
)
duplicate_end = hud.index("\n    });", duplicate_start)
duplicate_handler = hud[duplicate_start:duplicate_end]
if "edit.context.tool.set" in duplicate_handler:
    raise SystemExit("duplicação do HUD ainda redefine a ferramenta ativa.")

print(
    "Auditoria 0053l aprovada: continuidade de ferramenta, seleção inicial, "
    "pivô em bounds, preview hierárquico e âncora referenciada."
)
