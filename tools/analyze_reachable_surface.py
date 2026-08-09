#!/usr/bin/env python3
"""Classify first-party JavaScript by production/diagnostic import reachability."""

from __future__ import annotations

import argparse
import json
import re
from collections import deque
from pathlib import Path
from urllib.parse import unquote, urlsplit


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "docs/project/REACHABILITY_MANIFEST_0053G.json"
MAP = ROOT / "docs/project/MODULE_MIGRATION_MAP.json"
STATIC_IMPORT = re.compile(
    r"\b(?:import|export)\s+(?:[\w*{},\s]+?\s+from\s+)?[\"']([^\"']+)[\"']"
)
DYNAMIC_IMPORT = re.compile(r"\bimport\s*\(\s*([\"'`])(.+?)\1\s*\)")
IMPORT_META_URL = re.compile(
    r"\bnew\s+URL\s*\(\s*[\"']([^\"']+)[\"']\s*,\s*import\.meta\.url\s*\)"
)


def relative(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


def clean_specifier(value: str) -> str:
    value = value.split("${", 1)[0]
    parsed = urlsplit(value)
    return unquote(parsed.path)


def resolve(source: Path, specifier: str) -> Path | None:
    clean = clean_specifier(specifier)
    if not clean.startswith("."):
        return None
    candidate = (source.parent / clean).resolve()
    if candidate.is_dir():
        candidate = candidate / "index.js"
    elif not candidate.suffix:
        candidate = candidate.with_suffix(".js")
    try:
        candidate.relative_to(ROOT)
    except ValueError:
        return None
    return candidate if candidate.is_file() else None


def dependencies(path: Path) -> tuple[set[Path], set[str]]:
    source = path.read_text(encoding="utf-8")
    specifiers = set(STATIC_IMPORT.findall(source))
    specifiers.update(match.group(2) for match in DYNAMIC_IMPORT.finditer(source))
    specifiers.update(IMPORT_META_URL.findall(source))
    found: set[Path] = set()
    unresolved: set[str] = set()
    for specifier in specifiers:
        if not clean_specifier(specifier).startswith("."):
            continue
        target = resolve(path, specifier)
        if target is None:
            unresolved.add(f"{relative(path)}->{specifier}")
        elif target.suffix in {".js", ".mjs"}:
            found.add(target)
    return found, unresolved


def closure(roots: list[Path]) -> tuple[set[Path], set[str]]:
    visited: set[Path] = set()
    unresolved: set[str] = set()
    queue = deque(roots)
    while queue:
        path = queue.popleft().resolve()
        if path in visited or not path.is_file():
            continue
        visited.add(path)
        found, missing = dependencies(path)
        unresolved.update(missing)
        queue.extend(sorted(found))
    return visited, unresolved


def diagnostic_roots() -> list[Path]:
    definition = json.loads(
        (ROOT / "apps/web/config/application.diagnostics.json").read_text(
            encoding="utf-8"
        )
    )
    base = ROOT / "apps/web/config"
    roots = []
    for extension in definition.get("extensions", []):
        target = resolve(base / "application.diagnostics.json", extension["entry"])
        if target is not None:
            roots.append(target)
    return roots


def owner(path: Path) -> str:
    rel = path.relative_to(ROOT).parts
    if rel[:2] == ("apps", "web"):
        return "apps/web"
    if rel and rel[0] == "packages" and len(rel) > 1:
        return f"packages/{rel[1]}"
    return rel[0] if rel else "."


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--write", action="store_true")
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()

    production_roots = [
        ROOT / "apps/web/boot.js",
        ROOT / "apps/web/service-worker.js",
    ]
    diagnostics_roots = diagnostic_roots()
    production, unresolved_production = closure(production_roots)
    diagnostics_all, unresolved_diagnostics = closure(diagnostics_roots)
    diagnostics = diagnostics_all - production
    all_sources = {
        path.resolve()
        for base in (ROOT / "apps/web", ROOT / "packages")
        for path in base.rglob("*.js")
    }
    unreferenced = all_sources - production - diagnostics
    migration = json.loads(MAP.read_text(encoding="utf-8"))["components"]

    components = {}
    for component in sorted(migration):
        files = {path for path in all_sources if owner(path) == component}
        prod = files & production
        diag = files & diagnostics
        unused = files & unreferenced
        if prod and diag:
            status = "production-and-diagnostics"
        elif prod:
            status = "production"
        elif diag:
            status = "diagnostics"
        elif migration[component].get("role") == "diagnostics":
            status = "unreferenced-diagnostic"
        else:
            status = "unreferenced"
        components[component] = {
            "status": status,
            "target": migration[component]["target"],
            "role": migration[component].get("role", "production"),
            "sourceFiles": len(files),
            "productionFiles": len(prod),
            "diagnosticFiles": len(diag),
            "unreferencedFiles": len(unused),
        }

    payload = {
        "schemaVersion": 1,
        "analysis": "static-first-party-javascript-import-reachability",
        "limitations": [
            "Computed resource names and non-import runtime registration need manual review.",
            "Non-JavaScript assets are outside this manifest.",
            "Unreferenced means absent from the maintained web roots, not safe to delete.",
        ],
        "roots": {
            "production": [relative(path) for path in production_roots],
            "diagnostics": [relative(path) for path in diagnostics_roots],
        },
        "summary": {
            "firstPartyJavaScriptFiles": len(all_sources),
            "productionFiles": len(production),
            "productionFirstPartyFiles": len(production & all_sources),
            "productionExternalFiles": len(production - all_sources),
            "diagnosticFiles": len(diagnostics),
            "unreferencedFiles": len(unreferenced),
            "productionComponents": sum(
                item["status"] in {"production", "production-and-diagnostics"}
                for item in components.values()
            ),
            "diagnosticComponents": sum(
                item["status"] in {"diagnostics", "unreferenced-diagnostic"}
                for item in components.values()
            ),
            "unreferencedComponents": sum(
                item["status"] == "unreferenced"
                for item in components.values()
            ),
        },
        "components": components,
        "productionFiles": sorted(relative(path) for path in production),
        "diagnosticFiles": sorted(relative(path) for path in diagnostics),
        "unreferencedFiles": sorted(relative(path) for path in unreferenced),
        "unresolvedRelativeReferences": sorted(
            unresolved_production | unresolved_diagnostics
        ),
    }
    rendered = json.dumps(payload, ensure_ascii=False, indent=2) + "\n"

    if args.check:
        if not OUTPUT.is_file() or OUTPUT.read_text(encoding="utf-8") != rendered:
            print(f"Reachability manifest is stale: {relative(OUTPUT)}")
            return 1
    if args.write:
        OUTPUT.write_text(rendered, encoding="utf-8")

    summary = payload["summary"]
    print(
        "Reachability: "
        f"production={summary['productionFiles']}, "
        f"diagnostics={summary['diagnosticFiles']}, "
        f"unreferenced={summary['unreferencedFiles']}, "
        f"unresolved={len(payload['unresolvedRelativeReferences'])}."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
