#!/usr/bin/env python3
from pathlib import Path
import json
import sys

ROOT = Path(__file__).resolve().parents[1]
EXPECTED_BUILD = "20260807-0053b"

required = [
    "packages/occurrence-contracts/src/OccurrenceRef.js",
    "packages/occurrence-contracts/src/ResolvedOccurrence.js",
    "packages/edit-contracts/src/EditPatch.js",
    "packages/preview-contracts/src/PreviewDescriptor.js",
    "packages/render-contracts/src/RenderNode.js",
    "packages/render-contracts/src/RenderDelta.js",
    "packages/complexity-audit/src/ComplexityCounters.js",
    "packages/complexity-audit/src/ComplexityBudget.js",
    "docs/project/CANONICAL_DATA_CONTRACTS_0053A.md",
    "docs/project/COMPLEXITY_MODEL_0053A.md",
    "docs/project/MODULE_DEPENDENCY_RULES_0053A.md",
]

missing = [path for path in required if not (ROOT / path).is_file()]
if missing:
    print("Arquivos ausentes:", *missing, sep="\n- ")
    raise SystemExit(1)

build = json.loads((ROOT / "apps/web/build-info.json").read_text(encoding="utf-8"))
if build.get("build") != EXPECTED_BUILD:
    print(f"Build incorreto: {build.get('build')!r}; esperado {EXPECTED_BUILD}.")
    raise SystemExit(1)

checks = {
    "OccurrenceRef sem recurso pesado": "geometryRef" not in (ROOT / required[0]).read_text(encoding="utf-8"),
    "EditPatch contém set-transform": '"set-transform"' in (ROOT / required[2]).read_text(encoding="utf-8"),
    "Preview proíbe renderer": '"renderer"' in (ROOT / required[3]).read_text(encoding="utf-8"),
    "RenderNode proíbe project": '"project"' in (ROOT / required[4]).read_text(encoding="utf-8"),
    "Complexity audit mede globalSnapshotsRequested": "globalSnapshotsRequested" in (ROOT / required[6]).read_text(encoding="utf-8"),
    "Budget idle exige zero frames": '"scene.idle"' in (ROOT / required[7]).read_text(encoding="utf-8"),
}
failed = [name for name, ok in checks.items() if not ok]
if failed:
    print("Falhas de contrato:", *failed, sep="\n- ")
    raise SystemExit(1)

print("Auditoria 0053a aprovada: contratos canônicos e budgets de complexidade presentes.")
