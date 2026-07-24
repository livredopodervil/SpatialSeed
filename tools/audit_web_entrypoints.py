#!/usr/bin/env python3
"""Audit the SpatialSeed portal and experiment catalog without network access."""

from __future__ import annotations

import argparse
from dataclasses import dataclass
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import sys
from urllib.parse import unquote, urlsplit


ROOT = Path(__file__).resolve().parents[1]
PORTAL = ROOT / "index.html"
CATALOG_PAGE = ROOT / "apps/web/experiments/index.html"
CATALOG_MANIFEST = ROOT / "apps/web/experiments/catalog.json"
HISTORICAL_ROOT = ROOT / "apps/experiments"
ALGEBRAIC_ROOT = HISTORICAL_ROOT / "algebraic-structures"
MATHJS_BUNDLE = ROOT / "vendor/mathjs-11.11.0/math.js"
MATHJS_REQUIRED_FILES = (
    MATHJS_BUNDLE,
    ROOT / "vendor/mathjs-11.11.0/math.js.LICENSE.txt",
    ROOT / "vendor/mathjs-11.11.0/LICENSE",
    ROOT / "vendor/mathjs-11.11.0/NOTICE",
)
MATHJS_SHA256 = (
    "aaccf701adf44cdddf2161d06132471ca9668dffd355aefd52c3c54d74bfd4ee"
)
ID_PATTERN = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
FETCH_PATTERN = re.compile(r"""\bfetch\(\s*["']([^"']+)["']""")
RESOURCE_ATTRIBUTES = {
    "a": "href",
    "iframe": "src",
    "img": "src",
    "link": "href",
    "script": "src",
    "source": "src",
}
IGNORED_SCHEMES = {"blob", "data", "javascript", "mailto", "tel"}


@dataclass(frozen=True)
class Reference:
    kind: str
    value: str


class ReferenceParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.references: list[Reference] = []
        self._importmap_depth = 0
        self._importmap_data: list[str] = []

    def handle_starttag(
        self,
        tag: str,
        attrs: list[tuple[str, str | None]],
    ) -> None:
        attributes = dict(attrs)
        reference_attribute = RESOURCE_ATTRIBUTES.get(tag)
        if reference_attribute and attributes.get(reference_attribute):
            kind = "anchor" if tag == "a" else "resource"
            self.references.append(
                Reference(kind, attributes[reference_attribute] or "")
            )
        if tag == "script" and attributes.get("type") == "importmap":
            self._importmap_depth += 1
            self._importmap_data = []

    def handle_data(self, data: str) -> None:
        if self._importmap_depth:
            self._importmap_data.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag != "script" or not self._importmap_depth:
            return
        self._importmap_depth -= 1
        try:
            payload = json.loads("".join(self._importmap_data))
        except json.JSONDecodeError as error:
            raise ValueError(f"import map inválido: {error}") from error
        for value in payload.get("imports", {}).values():
            if isinstance(value, str):
                self.references.append(Reference("importmap", value))
        self._importmap_data = []


def relative(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


def classify_reference(value: str) -> str:
    if value.startswith("//"):
        return "external"
    parsed = urlsplit(value)
    if parsed.scheme in {"http", "https"}:
        return "external"
    if parsed.scheme in IGNORED_SCHEMES or not parsed.path:
        return "ignored"
    return "local"


def resolve_local_reference(
    source: Path,
    reference: Reference,
    errors: list[str],
) -> Path | None:
    value = reference.value
    if value.startswith("/"):
        errors.append(
            f"{relative(source)}: referência dependente da raiz do domínio: {value}"
        )
        return None
    parsed = urlsplit(value)
    candidate = (source.parent / unquote(parsed.path)).resolve()
    try:
        candidate.relative_to(ROOT)
    except ValueError:
        errors.append(
            f"{relative(source)}: referência escapa do repositório: {value}"
        )
        return None

    if candidate.is_dir():
        if reference.kind == "importmap" and value.endswith("/"):
            return candidate
        candidate = candidate / "index.html"
    if not candidate.exists():
        errors.append(
            f"{relative(source)}: referência local ausente: {value}"
        )
        return None
    return candidate


def parse_html(path: Path, errors: list[str]) -> list[Reference]:
    parser = ReferenceParser()
    try:
        parser.feed(path.read_text(encoding="utf-8"))
        parser.close()
    except (OSError, UnicodeError, ValueError) as error:
        errors.append(f"{relative(path)}: não pôde ser analisado: {error}")
    return parser.references


def audit_html(
    path: Path,
    errors: list[str],
    *,
    audit_fetches: bool = False,
) -> set[str]:
    external_resources: set[str] = set()
    for reference in parse_html(path, errors):
        classification = classify_reference(reference.value)
        if classification == "external":
            if reference.kind != "anchor":
                external_resources.add(reference.value)
            continue
        if classification != "local":
            continue
        resolved = resolve_local_reference(path, reference, errors)
        if (
            audit_fetches
            and resolved
            and reference.kind == "resource"
            and resolved.suffix == ".js"
        ):
            audit_js_fetches(resolved, errors)
    return external_resources


def audit_js_fetches(path: Path, errors: list[str]) -> None:
    try:
        source = path.read_text(encoding="utf-8")
    except (OSError, UnicodeError) as error:
        errors.append(f"{relative(path)}: não pôde ser lido: {error}")
        return
    for value in FETCH_PATTERN.findall(source):
        if classify_reference(value) == "local":
            resolve_local_reference(path, Reference("fetch", value), errors)


def load_catalog(errors: list[str]) -> dict:
    try:
        payload = json.loads(CATALOG_MANIFEST.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        errors.append(f"{relative(CATALOG_MANIFEST)}: manifesto inválido: {error}")
        return {}
    if payload.get("schemaVersion") != 1:
        errors.append(
            f"{relative(CATALOG_MANIFEST)}: schemaVersion deve ser 1"
        )
    return payload


def audit_experiment_baseline(errors: list[str]) -> int:
    snapshots = sorted(ALGEBRAIC_ROOT.glob("*.html"))
    if len(snapshots) != 7:
        errors.append(
            "linha de base 0029b: esperados 7 snapshots algébricos, "
            f"encontrados {len(snapshots)}"
        )

    for required_file in MATHJS_REQUIRED_FILES:
        if not required_file.is_file():
            errors.append(
                f"{relative(required_file)}: arquivo vendorizado ausente"
            )

    try:
        digest = hashlib.sha256(MATHJS_BUNDLE.read_bytes()).hexdigest()
    except OSError as error:
        errors.append(
            f"{relative(MATHJS_BUNDLE)}: bundle ausente ou ilegível: {error}"
        )
    else:
        if digest != MATHJS_SHA256:
            errors.append(
                f"{relative(MATHJS_BUNDLE)}: SHA-256 inesperado: {digest}"
            )

    required_markers = {
        "../../../vendor/mathjs-11.11.0/math.js":
            "não carrega Math.js vendorizado",
        "./legacy-experiment-controls.js":
            "não carrega os controles comuns",
        "SpatialSeedLegacy.install({":
            "não instala os controles comuns",
        "SpatialSeedLegacy.selectObject(":
            "não usa a seleção móvel comum",
        "instancedMesh.computeBoundingBox();":
            "não recalcula o bounding box das instâncias",
        "instancedMesh.computeBoundingSphere();":
            "não recalcula a bounding sphere das instâncias",
    }

    for snapshot in snapshots:
        try:
            source = snapshot.read_text(encoding="utf-8")
        except (OSError, UnicodeError) as error:
            errors.append(f"{relative(snapshot)}: não pôde ser lido: {error}")
            continue
        for marker, message in required_markers.items():
            if marker not in source:
                errors.append(f"{relative(snapshot)}: {message}")
        if 'id="btn-export"' in source and \
                "SpatialSeedLegacy.saveJson(" not in source:
            errors.append(
                f"{relative(snapshot)}: exportação não usa salvamento nomeado"
            )
    return len(snapshots)


def audit_catalog(
    payload: dict,
    errors: list[str],
    *,
    strict_offline: bool,
) -> tuple[int, int, set[str]]:
    entries = payload.get("entries")
    if not isinstance(entries, list):
        errors.append(f"{relative(CATALOG_MANIFEST)}: entries deve ser uma lista")
        return 0, 0, set()

    identifiers: set[str] = set()
    targets: set[Path] = set()
    standalone_targets: set[Path] = set()
    declared_external: set[str] = set()
    required = {
        "id",
        "title",
        "summary",
        "kind",
        "status",
        "path",
        "offline",
        "externalDependencies",
        "knownIssues",
    }

    for index, entry in enumerate(entries):
        label = f"{relative(CATALOG_MANIFEST)}: entrada {index + 1}"
        if not isinstance(entry, dict):
            errors.append(f"{label} deve ser um objeto")
            continue
        missing = sorted(required - entry.keys())
        if missing:
            errors.append(f"{label} não contém: {', '.join(missing)}")
            continue

        identifier = entry["id"]
        if not isinstance(identifier, str) or not ID_PATTERN.fullmatch(identifier):
            errors.append(f"{label}: id inválido: {identifier!r}")
        elif identifier in identifiers:
            errors.append(f"{label}: id duplicado: {identifier}")
        else:
            identifiers.add(identifier)

        if entry["kind"] not in {"integrated", "standalone"}:
            errors.append(f"{label}: kind inválido: {entry['kind']!r}")
        if entry["status"] not in {"maintained", "historical", "diagnostic"}:
            errors.append(f"{label}: status inválido: {entry['status']!r}")
        if entry["offline"] not in {
            "app-cache",
            "local-assets",
            "network-required",
        }:
            errors.append(f"{label}: offline inválido: {entry['offline']!r}")
        if not isinstance(entry["externalDependencies"], list):
            errors.append(f"{label}: externalDependencies deve ser uma lista")
            continue
        if not isinstance(entry["knownIssues"], list):
            errors.append(f"{label}: knownIssues deve ser uma lista")

        entry_reference = Reference("catalog", entry["path"])
        if classify_reference(entry_reference.value) != "local":
            errors.append(f"{label}: path deve ser local e relativo")
            continue
        target = resolve_local_reference(
            CATALOG_MANIFEST,
            entry_reference,
            errors,
        )
        if not target:
            continue
        if target in targets:
            errors.append(f"{label}: alvo duplicado: {relative(target)}")
        targets.add(target)
        if entry["kind"] == "standalone":
            standalone_targets.add(target)

        observed_external = audit_html(target, errors)
        declared_for_entry = set(entry["externalDependencies"])
        for dependency in declared_for_entry:
            if classify_reference(dependency) != "external":
                errors.append(
                    f"{label}: dependência externa inválida: {dependency!r}"
                )
        undeclared = observed_external - declared_for_entry
        stale = declared_for_entry - observed_external
        if undeclared:
            errors.append(
                f"{label}: dependências externas não declaradas: "
                f"{', '.join(sorted(undeclared))}"
            )
        if stale:
            errors.append(
                f"{label}: dependências declaradas não observadas: "
                f"{', '.join(sorted(stale))}"
            )
        declared_external.update(declared_for_entry)

    historical_html = {
        path.resolve()
        for path in HISTORICAL_ROOT.rglob("*.html")
        if path.is_file()
    }
    missing_from_catalog = historical_html - standalone_targets
    unexpected_standalone = standalone_targets - historical_html
    if missing_from_catalog:
        errors.append(
            "HTMLs históricos ausentes do catálogo: "
            + ", ".join(sorted(relative(path) for path in missing_from_catalog))
        )
    if unexpected_standalone:
        errors.append(
            "Entradas standalone fora de apps/experiments: "
            + ", ".join(sorted(relative(path) for path in unexpected_standalone))
        )

    if strict_offline and declared_external:
        errors.append(
            "modo offline estrito: ainda existem dependências externas declaradas"
        )
    return len(entries), len(standalone_targets), declared_external


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--strict-offline",
        action="store_true",
        help="falhar enquanto qualquer experimento depender de recurso externo",
    )
    args = parser.parse_args()
    errors: list[str] = []

    audit_html(PORTAL, errors, audit_fetches=True)
    audit_html(CATALOG_PAGE, errors, audit_fetches=True)
    payload = load_catalog(errors)
    baseline_snapshots = audit_experiment_baseline(errors)
    entries, standalone, external = audit_catalog(
        payload,
        errors,
        strict_offline=args.strict_offline,
    )

    if errors:
        print("Auditoria web falhou:", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1

    print(
        "Auditoria web aprovada: "
        f"portal, catálogo, {entries} entradas e "
        f"{standalone} protótipos independentes; "
        f"linha de base em {baseline_snapshots} snapshots algébricos."
    )
    if external:
        print(
            "Dívida externa declarada para o 0029b: "
            f"{len(external)} URL(s) única(s)."
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
