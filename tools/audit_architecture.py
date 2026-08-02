#!/usr/bin/env python3
"""Audit SpatialSeed component boundaries with a monotonic debt baseline."""

from __future__ import annotations

import argparse
import json
import re
from collections import defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MAP_PATH = ROOT / "docs/project/MODULE_MIGRATION_MAP.json"
BASELINE_PATH = ROOT / "tools/architecture-debt-baseline.json"
STATIC_IMPORT_RE = re.compile(
    r"\b(?:import|export)\s+(?:[\w*{},\s]+?\s+from\s+)?[\"']([^\"']+)[\"']"
)
DYNAMIC_IMPORT_RE = re.compile(r"\bimport\s*\(\s*[\"']([^\"']+)[\"']\s*\)")
BROWSER_GLOBAL_RE = re.compile(
    r"(?:"
    r"\bglobalThis\.(?:window|document|localStorage|sessionStorage|indexedDB|navigator)\b|"
    r"\bwindow\s*(?:\.|\[)|"
    r"\bdocument\s*\.\s*(?:createElement|createTextNode|querySelector|"
    r"querySelectorAll|getElementById|body|documentElement|addEventListener|"
    r"removeEventListener)\b|"
    r"\b(?:localStorage|sessionStorage|indexedDB|navigator|customElements)\s*(?:\.|\[)|"
    r"\b(?:requestAnimationFrame|cancelAnimationFrame)\s*\(|"
    r"\b(?:HTMLElement|CustomEvent)\b"
    r")"
)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--write-baseline",
        action="store_true",
        help="replace the accepted debt set after explicit review",
    )
    parser.add_argument(
        "--show-issues",
        action="store_true",
        help="print every current finding",
    )
    args = parser.parse_args()

    migration_map = load_json(MAP_PATH)
    components = discover_components()
    validate_map(migration_map, components)
    findings = audit(migration_map, components)
    issue_ids = sorted(
        f"{category}|{issue}"
        for category, issues in findings.items()
        for issue in issues
    )

    if args.write_baseline:
        payload = {
            "schemaVersion": 1,
            "architecture": migration_map["architecture"],
            "issueIds": issue_ids,
        }
        BASELINE_PATH.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        print(
            f"Wrote {BASELINE_PATH.relative_to(ROOT)} "
            f"({len(issue_ids)} accepted findings)."
        )
        print_summary(findings)
        return 0

    if not BASELINE_PATH.exists():
        print(
            "Architecture debt baseline is missing; review findings and run "
            "tools/audit_architecture.py --write-baseline."
        )
        print_summary(findings)
        if args.show_issues:
            print_items("Current findings", issue_ids)
        return 1

    baseline = load_json(BASELINE_PATH)
    if baseline.get("architecture") != migration_map["architecture"]:
        print("Architecture baseline and migration map identify different models.")
        return 1

    accepted = set(baseline.get("issueIds", []))
    current = set(issue_ids)
    introduced = sorted(current - accepted)
    resolved = sorted(accepted - current)

    print_summary(findings)
    if args.show_issues:
        print_items("Current findings", issue_ids)
    if resolved:
        print_items("Resolved findings awaiting baseline reduction", resolved)
    if introduced:
        print_items("New architecture debt", introduced)
        return 1

    print(
        "Architecture audit passed: no finding was added; "
        f"{len(resolved)} legacy finding(s) were removed."
    )
    return 0


def discover_components() -> dict[str, Path]:
    components = {"apps/web": ROOT / "apps/web"}
    for path in sorted((ROOT / "packages").iterdir()):
        if path.is_dir():
            components[f"packages/{path.name}"] = path
    return components


def validate_map(migration_map: dict, components: dict[str, Path]) -> None:
    if migration_map.get("schemaVersion") != 1:
        raise SystemExit("Unsupported module migration map schema.")
    modules = migration_map.get("modules")
    mapped = migration_map.get("components")
    if not isinstance(modules, dict) or not isinstance(mapped, dict):
        raise SystemExit("Migration map must define modules and components.")

    missing = sorted(set(components) - set(mapped))
    stale = sorted(set(mapped) - set(components))
    unknown_targets = sorted(
        component
        for component, entry in mapped.items()
        if entry.get("target") not in modules
    )
    invalid_dependencies = sorted(
        f"{module}->{dependency}"
        for module, entry in modules.items()
        for dependency in entry.get("dependsOn", [])
        if dependency not in modules or dependency == module
    )
    errors = []
    if missing:
        errors.append(f"unmapped components: {', '.join(missing)}")
    if stale:
        errors.append(f"stale mapped components: {', '.join(stale)}")
    if unknown_targets:
        errors.append(f"unknown targets: {', '.join(unknown_targets)}")
    if invalid_dependencies:
        errors.append(f"invalid module dependencies: {', '.join(invalid_dependencies)}")
    if errors:
        raise SystemExit("Invalid migration map: " + "; ".join(errors))


def audit(migration_map: dict, components: dict[str, Path]) -> dict[str, set[str]]:
    findings: dict[str, set[str]] = defaultdict(set)
    component_entries = migration_map["components"]
    module_entries = migration_map["modules"]
    edges: dict[str, set[str]] = defaultdict(set)

    for component, root in components.items():
        public_index = root / "src/index.js" if component.startswith("packages/") else None
        if public_index is not None:
            if not public_index.exists():
                findings["public-api"].add(f"missing:{component}/src/index.js")
            elif not public_index.read_text(encoding="utf-8").strip():
                findings["public-api"].add(f"empty:{component}/src/index.js")

        for source in sorted(root.rglob("*.js")):
            text = source.read_text(encoding="utf-8")
            relative_source = source.relative_to(ROOT).as_posix()
            source_target = component_entries[component]["target"]

            if source_target != "platform-web" and BROWSER_GLOBAL_RE.search(text):
                findings["browser-global"].add(relative_source)

            for specifier in import_specifiers(text):
                clean = specifier.split("?", 1)[0].split("#", 1)[0]
                if clean == "three" or clean.startswith("three/"):
                    if (
                        source_target != "renderer-three"
                        and component_entries[component].get("role") != "diagnostics"
                    ):
                        findings["three-boundary"].add(
                            f"{relative_source}->{clean}"
                        )
                    continue
                if not clean.startswith("."):
                    continue

                target = resolve_import(source, clean)
                if target is None:
                    findings["unresolved-import"].add(
                        f"{relative_source}->{clean}"
                    )
                    continue
                target_component = owner_of(target)
                if target_component is None or target_component == component:
                    continue

                edges[component].add(target_component)
                target_relative = target.relative_to(ROOT).as_posix()
                if target_component.startswith("packages/") and not is_public_entry(
                    target, target_component
                ):
                    findings["deep-import"].add(
                        f"{component}->{target_relative}"
                    )

                if target_component not in component_entries:
                    findings["unmapped-import-target"].add(
                        f"{relative_source}->{target_relative}"
                    )
                    continue

                destination_target = component_entries[target_component]["target"]
                allowed = set(module_entries[source_target].get("dependsOn", []))
                if destination_target != source_target and destination_target not in allowed:
                    findings["forbidden-module-edge"].add(
                        f"{component}({source_target})->"
                        f"{target_component}({destination_target})"
                    )

                if (
                    component == "apps/web"
                    and component_entries[target_component].get("role") == "diagnostics"
                ):
                    findings["production-diagnostics"].add(
                        f"apps/web->{target_component}"
                    )
                if (
                    component_entries[component].get("role") == "diagnostics"
                    and target_component == "apps/web"
                ):
                    findings["diagnostics-backedge"].add(
                        f"{component}->apps/web"
                    )

    for component in components:
        edges.setdefault(component, set())
    for cycle in strongly_connected_components(edges):
        if len(cycle) > 1:
            findings["component-cycle"].add("<->".join(sorted(cycle)))

    reachable = reachable_from("apps/web", edges)
    for component in sorted(set(components) - reachable):
        findings["unreachable-component"].add(component)

    return findings


def import_specifiers(text: str) -> set[str]:
    return {
        match.group(1)
        for pattern in (STATIC_IMPORT_RE, DYNAMIC_IMPORT_RE)
        for match in pattern.finditer(text)
    }


def resolve_import(source: Path, specifier: str) -> Path | None:
    candidate = (source.parent / specifier).resolve()
    candidates = [candidate]
    if not candidate.suffix:
        candidates.append(candidate.with_suffix(".js"))
        candidates.append(candidate / "index.js")
    for resolved in candidates:
        if resolved.is_file() and resolved.is_relative_to(ROOT):
            return resolved
    return None


def owner_of(path: Path) -> str | None:
    parts = path.relative_to(ROOT).parts
    if len(parts) >= 2 and parts[0] == "packages":
        return f"packages/{parts[1]}"
    if len(parts) >= 2 and parts[0] == "apps" and parts[1] == "web":
        return "apps/web"
    return None


def is_public_entry(path: Path, component: str) -> bool:
    root = ROOT / component
    return path in {root / "index.js", root / "src/index.js"}


def strongly_connected_components(edges: dict[str, set[str]]) -> list[set[str]]:
    index = 0
    indices: dict[str, int] = {}
    lowlinks: dict[str, int] = {}
    stack: list[str] = []
    on_stack: set[str] = set()
    result: list[set[str]] = []

    def visit(node: str) -> None:
        nonlocal index
        indices[node] = index
        lowlinks[node] = index
        index += 1
        stack.append(node)
        on_stack.add(node)

        for target in sorted(edges[node]):
            if target not in edges:
                continue
            if target not in indices:
                visit(target)
                lowlinks[node] = min(lowlinks[node], lowlinks[target])
            elif target in on_stack:
                lowlinks[node] = min(lowlinks[node], indices[target])

        if lowlinks[node] == indices[node]:
            component = set()
            while True:
                member = stack.pop()
                on_stack.remove(member)
                component.add(member)
                if member == node:
                    break
            result.append(component)

    for node in sorted(edges):
        if node not in indices:
            visit(node)
    return result


def reachable_from(root: str, edges: dict[str, set[str]]) -> set[str]:
    reached = set()
    pending = [root]
    while pending:
        component = pending.pop()
        if component in reached:
            continue
        reached.add(component)
        pending.extend(sorted(edges.get(component, set()) - reached))
    return reached


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def print_summary(findings: dict[str, set[str]]) -> None:
    total = sum(len(issues) for issues in findings.values())
    summary = ", ".join(
        f"{category}={len(findings[category])}"
        for category in sorted(findings)
    )
    print(f"Architecture findings: {total} ({summary or 'none'}).")


def print_items(title: str, items: list[str]) -> None:
    print(f"{title} ({len(items)}):")
    for item in items:
        print(f"  {item}")


if __name__ == "__main__":
    raise SystemExit(main())
