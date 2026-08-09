#!/usr/bin/env python3
from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]
BUILD = "20260807-0052b"

def read(path):
    p = ROOT / path
    if not p.is_file():
        raise SystemExit(f"Arquivo ausente: {path}")
    return p.read_text(encoding="utf-8")

def require(text, token, label):
    if token not in text:
        raise SystemExit(f"Falha 0052b: {label}.")

build = json.loads(read("apps/web/build-info.json"))
if build.get("build") != BUILD:
    raise SystemExit(f"Build incorreto: {build.get('build')!r}; esperado {BUILD}.")

instance = read("packages/instance-graph/src/InstanceGraph.js")
sandbox = read("packages/core/src/Sandbox.js")
reducer = read("packages/region-box/src/reducer.js")
projection = read("packages/instance-graph/src/InstanceGraphProjectionCache.js")
inspector = read("packages/object-inspector/src/ObjectInspector.js")
selection = read("packages/selection-operations/src/SelectionOperations.js")
web = read("apps/web/bootstrap/createWebRuntime.js")

checks = [
    (instance, 'INSTANCE_OCCURRENCE_ID_PREFIX = "@ig/"', "identidade de ocorrência ausente"),
    (instance, "export function resolveInstanceOccurrence", "resolver local de ocorrência ausente"),
    (instance, "export function updateInstanceOccurrenceRoot", "override local de ocorrência ausente"),
    (instance, "replaceInstanceOccurrenceObjectDefinition", "copy-on-write geométrico ausente"),
    (sandbox, "getInstanceOccurrence(id)", "Sandbox não resolve ocorrência"),
    (sandbox, "getObjectWorldMatrix(id)", "matriz mundial de ocorrência ausente"),
    (reducer, 'case "selection.delete"', "delete ausente"),
    (reducer, "hidden: true", "delete de ocorrência não usa máscara estrutural"),
    (reducer, "affectedOccurrenceIds", "mudança incremental de ocorrência ausente"),
    (reducer, "replaceInstanceOccurrenceObjectDefinition", "mesh/geometry COW não ligado ao reducer"),
    (projection, "#syncOccurrence", "projection cache não atualiza ocorrência isolada"),
    (projection, "occurrenceChanges", "projection cache não recebe metadata local"),
    (inspector, "affectedOccurrenceIds", "Inspector não invalida por ocorrência"),
    (selection, "expandedSubtree: false", "delete volta a expandir DAG"),
    (web, '.register("instance.occurrence"', "consulta diagnóstica de ocorrência ausente"),
]
for text, token, label in checks:
    require(text, token, label)

print("Auditoria 0052b aprovada: ocorrências do InstanceGraph mantêm identidade, edição local, delete, Inspector, COW geométrico e projeção incremental.")
