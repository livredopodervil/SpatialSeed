#!/usr/bin/env python3
"""Static markers for the 0053g regression-recovery increment."""

from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
EXPECTED_BUILDS = {
    "20260808-0053g",
    "20260808-0053h",
    "20260808-0053i",
    "20260809-0053k",
    "20260809-0053l",
    "20260809-0053m",
    "20260810-0054f",
    "20260812-0054g",
}


def require(relative: str, marker: str) -> None:
    source = (ROOT / relative).read_text(encoding="utf-8")
    if marker not in source:
        raise SystemExit(f"{relative}: marcador ausente: {marker}")


build = json.loads((ROOT / "apps/web/build-info.json").read_text(encoding="utf-8"))
if build.get("build") not in EXPECTED_BUILDS:
    raise SystemExit(
        f"build incorreto: {build.get('build')!r}; esperado um descendente "
        f"de 0053g em {sorted(EXPECTED_BUILDS)}."
    )

checks = [
    ("packages/region-box/src/RegionBoxModule.js", "export { boxRegionReducer };"),
    ("packages/core/src/Sandbox.js", "getBaseState() { return materializeState(this.#baseState); }"),
    ("packages/core/src/Sandbox.js", "const stack = [rootId];"),
    ("packages/core/src/Sandbox.js", "isInstanceNode(rawParent)"),
    ("packages/animation-runtime/src/AnimationCommandService.js", "timeSource,\n        initialTime: currentTime"),
    ("packages/animation-runtime/src/TemporalAnimationRuntime.js", "animated-object-rebased"),
    ("packages/renderer-three/src/AnimationTransformOverlay.js", "rebaseAnimationLayerInput"),
    ("packages/platform-web/src/PwaRegistration.js", "cache ${controllerBuild} · feche para atualizar"),
    ("packages/benchmarks/src/CompactRuntimeBenchmark.js", "compact-runtime-baseline-v2-instance-graph"),
    ("tools/run_runtime_regressions.mjs", "requires-browser-dom"),
    ("tools/analyze_reachable_surface.py", "static-first-party-javascript-import-reachability"),
]
for relative, marker in checks:
    require(relative, marker)

reachability = json.loads(
    (ROOT / "docs/project/REACHABILITY_MANIFEST_0053G.json").read_text(
        encoding="utf-8"
    )
)
if reachability.get("unresolvedRelativeReferences"):
    raise SystemExit("Manifesto de alcance contém referências relativas não resolvidas.")

print(
    "Auditoria 0053g aprovada: contratos recuperados, rebase temporal e "
    "alcance reproduzível."
)
