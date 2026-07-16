#!/usr/bin/env python3
"""Generate or verify the deterministic Spatial Seed PWA precache manifest."""

from __future__ import annotations

import argparse
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "apps/web/pwa/precache-manifest.json"
SOURCE_ROOTS = (ROOT / "apps/web", ROOT / "packages", ROOT / "vendor")
ALLOWED_SUFFIXES = {
    ".css", ".html", ".js", ".json", ".png", ".svg", ".webmanifest"
}
EXCLUDED = {OUTPUT}


def collect_files() -> list[str]:
    files = {"service-worker.js"}
    for source_root in SOURCE_ROOTS:
        for path in source_root.rglob("*"):
            if path.is_file() and path.suffix in ALLOWED_SUFFIXES and path not in EXCLUDED:
                files.add(path.relative_to(ROOT).as_posix())
    return sorted(files)


def render_manifest() -> str:
    payload = {"schemaVersion": 1, "files": collect_files()}
    return json.dumps(payload, ensure_ascii=False, indent=2) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--check",
        action="store_true",
        help="fail if the checked-in manifest is not current",
    )
    args = parser.parse_args()
    expected = render_manifest()

    if args.check:
        current = OUTPUT.read_text(encoding="utf-8") if OUTPUT.exists() else ""
        if current != expected:
            print("PWA precache manifest is stale; run tools/generate_pwa_precache.py")
            return 1
        print(f"PWA precache manifest is current ({len(collect_files())} files).")
        return 0

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(expected, encoding="utf-8")
    print(f"Wrote {OUTPUT.relative_to(ROOT)} ({len(collect_files())} files).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
