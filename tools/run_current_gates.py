#!/usr/bin/env python3
"""Run the reusable gates for the current SpatialSeed working increment."""

from __future__ import annotations

import json
import shutil
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
    ("0053k-canonical-regressions", [PYTHON, "tools/audit_canonical_regressions_0053k.py"]),
    ("0053l-main-consolidation", [PYTHON, "tools/audit_main_consolidation_0053l.py"]),
    ("0053m-interaction-console-mirror", [PYTHON, "tools/audit_interaction_console_mirror_0053m.py"]),
    ("0054a-game-mode", [PYTHON, "tools/audit_game_mode_0054a.py"]),
    ("0054b-game-collision", [PYTHON, "tools/audit_game_collision_0054b.py"]),
    ("0054d-input-collision-optimization", [PYTHON, "tools/audit_game_collision_0054c.py"]),
    ("0054f-game-runtime", [PYTHON, "tools/audit_game_runtime_0054f.py"]),
    ("0054g-mesh-operator-path", [PYTHON, "tools/audit_mesh_operator_path_0054g.py"]),
    ("0054h-authoring-usability", [PYTHON, "tools/audit_authoring_usability_0054h.py"]),
    ("0054i-game-camera-audio-flat-colliders", [PYTHON, "tools/audit_game_runtime_0054i.py"]),
    ("0054j-stl-mesh-exchange", [PYTHON, "tools/audit_mesh_exchange_0054j.py"]),
    ("0054k-path-drawing-plane", [PYTHON, "tools/audit_path_drawing_plane_0054k.py"]),
    ("0054l-unified-authoring-plane", [PYTHON, "tools/audit_unified_authoring_plane_0054l.py"]),
    ("0054m-character-animation", [PYTHON, "tools/audit_character_animation_0054m.py"]),
    ("0054ma-character-visual-alignment", [PYTHON, "tools/audit_character_animation_0054ma.py"]),
    ("0054mb-character-preview-controls", [PYTHON, "tools/audit_character_animation_0054mb.py"]),
    ("0054mc-character-local-anchor-history", [PYTHON, "tools/audit_character_animation_0054mc.py"]),
    ("0054md-character-canonical-frame", [PYTHON, "tools/audit_character_frame_0054md.py"]),
    ("0054me-camera-relative-default-visual", [PYTHON, "tools/audit_character_camera_policy_0054me.py"]),
    ("0054mf-default-game-demo", [PYTHON, "tools/audit_default_game_demo_0054mf.py"]),
    ("0054mh-physical-proxy-stable-camera", [PYTHON, "tools/audit_character_physical_proxy_camera_0054mh.py"]),
    ("0054mi-character-session-lifecycle", [PYTHON, "tools/audit_character_session_lifecycle_0054mi.py"]),
    ("0054mj-visual-scale-camera-pwa", [PYTHON, "tools/audit_character_visual_camera_pwa_0054mj.py"]),
    ("0054mk-character-scale-isolation", [PYTHON, "tools/audit_character_scale_isolation_0054mk.py"]),
    ("0054ml-character-runtime-consolidation", [PYTHON, "tools/audit_character_runtime_consolidation_0054ml.py"]),
    ("0054mn-command-palette", [PYTHON, "tools/audit_command_palette_0054mn.py"]),
    ("0054mo-property-schema", [PYTHON, "tools/audit_property_schema_consolidation_0054mo.py"]),
    ("0054mp-analog-game-controls-shadow", [PYTHON, "tools/audit_analog_game_controls_shadow_0054mp.py"]),
    ("event-previews", [PYTHON, "tools/audit_event_driven_previews.py"]),
    ("animation-overlays", [PYTHON, "tools/audit_independent_animation_overlays.py"]),
    ("mesh-ui", [PYTHON, "tools/audit_mesh_edit_ui.py"]),
]
NODE_GATES = [
    ("runtime", ["node", "tools/run_runtime_regressions.mjs"]),
    ("standalone", [PYTHON, "tools/run_standalone_regressions.py"]),
]


def main() -> int:
    results = []
    gates = list(GATES)
    node_available = shutil.which("node") is not None
    if node_available:
        gates.extend(NODE_GATES)
    for name, command in gates:
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
    if not node_available:
        for name, _command in NODE_GATES:
            results.append({
                "gate": name,
                "ok": True,
                "skipped": True,
                "reason": (
                    "Node.js ausente; execute runtime test all no perfil "
                    "diagnóstico do navegador."
                ),
            })
    failed = [result for result in results if not result["ok"]]
    skipped = [result for result in results if result.get("skipped")]
    report = {
        "scope": "current-gates",
        "passed": len(results) - len(failed) - len(skipped),
        "skipped": len(skipped),
        "failed": len(failed),
        "total": len(results),
        "ok": not failed,
        "failures": failed,
    }
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
