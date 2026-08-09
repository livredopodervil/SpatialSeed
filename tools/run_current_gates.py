#!/usr/bin/env python3
"""Run the reusable gates for the current SpatialSeed working increment."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PYTHON = sys.executable
GATES = [
    ("architecture", [PYTHON, "tools/audit_architecture.py"]),
    ("web-entrypoints", [PYTHON, "tools/audit_web_entrypoints.py"]),
    ("pwa-update", [PYTHON, "tools/audit_pwa_update_path.py"]),
    ("pwa-precache", [PYTHON, "tools/generate_pwa_precache.py", "--check"]),
    ("reachability", [PYTHON, "tools/analyze_reachable_surface.py", "--check"]),
    ("0053g-contract", [PYTHON, "tools/audit_regression_systematization_0053g.py"]),
    ("0053h-gizmo-orbit", [PYTHON, "tools/audit_mouse_gizmo_orbit_0053h.py"]),
    ("0053i-scale-render-preset", [PYTHON, "tools/audit_scale_render_preset_0053i.py"]),
    ("event-previews", [PYTHON, "tools/audit_event_driven_previews.py"]),
    ("animation-overlays", [PYTHON, "tools/audit_independent_animation_overlays.py"]),
    ("mesh-ui", [PYTHON, "tools/audit_mesh_edit_ui.py"]),
    ("runtime", ["node", "tools/run_runtime_regressions.mjs"]),
    ("standalone", [PYTHON, "tools/run_standalone_regressions.py"]),
]


def main() -> int:
    results = []
    for name, command in GATES:
        completed = subprocess.run(
            command,
            cwd=ROOT,
            text=True,
            capture_output=True,
            check=False,
        )
        results.append({
            "gate": name,
            "ok": completed.returncode == 0,
            "exitCode": completed.returncode,
            "stdout": completed.stdout.strip(),
            "stderr": completed.stderr.strip(),
        })
    failed = [result for result in results if not result["ok"]]
    report = {
        "scope": "current-gates",
        "passed": len(results) - len(failed),
        "failed": len(failed),
        "total": len(results),
        "ok": not failed,
        "failures": failed,
    }
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
