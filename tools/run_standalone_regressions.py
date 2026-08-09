#!/usr/bin/env python3
"""Run every standalone JavaScript regression with the vendored Three map."""

from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
REGISTER = ROOT / "tools/register_node_vendor_loader.mjs"


def main() -> int:
    node = shutil.which("node")
    if node is None:
        print("Node.js is unavailable; standalone diagnostic tests were not run.")
        return 2

    tests = sorted((ROOT / "tools").glob("test_*.mjs"))
    failures = []
    passed = []
    for test in tests:
        completed = subprocess.run(
            [node, "--import", str(REGISTER), str(test)],
            cwd=ROOT,
            text=True,
            capture_output=True,
            check=False,
        )
        record = {
            "test": test.relative_to(ROOT).as_posix(),
            "exitCode": completed.returncode,
        }
        if completed.returncode == 0:
            passed.append(record)
        else:
            record["stdout"] = completed.stdout.strip()
            record["stderr"] = completed.stderr.strip()
            failures.append(record)

    report = {
        "scope": "standalone-regressions",
        "passed": len(passed),
        "failed": len(failures),
        "total": len(tests),
        "ok": not failures,
        "failures": failures,
    }
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
