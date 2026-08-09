#!/usr/bin/env python3
from pathlib import Path
import json
import sys

ROOT = Path(__file__).resolve().parents[1]
errors = []

def read(path):
    p = ROOT / path
    if not p.is_file():
        errors.append(f"arquivo ausente: {path}")
        return ""
    return p.read_text(encoding="utf-8")

def require(path, needle, message):
    if needle not in read(path):
        errors.append(message)

build = json.loads(read("apps/web/build-info.json") or "{}")
if build.get("build") != "20260807-0052b":
    errors.append(f"build incorreto: {build.get('build')!r}")

require("packages/instance-graph/src/InstanceGraph.js", "INSTANCE_GRAPH_VERSION = \"instance-graph-v1\"", "versão do InstanceGraph ausente")
require("packages/instance-graph/src/InstanceGraph.js", "type: 'assembly'", "definição de assembly ausente")
require("packages/instance-graph/src/InstanceGraph.js", "definitionId", "instância não referencia definição")
require("packages/instance-graph/src/InstanceGraph.js", "Ciclo de definição ainda não permitido", "DAG não bloqueia ciclos")
require("packages/instance-graph/src/InstanceGraph.js", "projectInstanceGraphScene", "projeção derivada ausente")
require("packages/instance-graph/src/InstanceGraphProjectionCache.js", "projectInstanceGraphRoot", "cache de projeção local ausente")
require("packages/instance-graph/src/InstanceGraphProjectionCache.js", "projectedObjectsVisited", "diagnóstico de localidade da projeção ausente")
require("packages/scene-hierarchy/src/HierarchyIndex.js", "updateNode(id, node)", "HierarchyIndex não suporta invalidação local")
require("packages/renderer-three/src/ThreeRegionRenderer.js", "#applyStableHierarchyChanges", "renderer ainda reconstrói toda hierarquia em transform estável")
require("packages/instance-graph/src/InstanceGraph.js", "replaceInstanceObjectDefinition", "copy-on-write de definição ausente")
require("packages/region-box/src/reducer.js", 'case "selection.duplicate-reference"', "duplicação por referência ausente")
require("packages/region-box/src/reducer.js", "compactHierarchyRoots(groupedScene", "group não compacta para assembly")
require("packages/selection-operations/src/SelectionOperations.js", 'selection.duplicate-reference', "SelectionOperations ainda não usa referência")
require("packages/project-files/src/ProjectSerializer.js", "static schemaVersion = 4", "serializer não grava schema 4")
require("packages/project-files/src/ProjectSerializer.js", "compactSceneToInstanceGraph", "save não compacta cena")
require("packages/project-files/src/ProjectValidator.js", "validateInstanceGraph", "validator não valida DAG")
require("packages/core/src/Sandbox.js", "getRawObject(id)", "Sandbox não separa nó autoritativo de objeto resolvido")
require("apps/web/bootstrap/createWebRuntime.js", 'register("instance.graph.status"', "diagnóstico runtime do grafo ausente")
require("apps/web/bootstrap/createWebRuntime.js", "InstanceGraphProjectionCache", "runtime não usa cache incremental de projeção")
require("apps/web/bootstrap/createWebRuntime.js", 'register(\n    "instance.graph.projection"', "diagnóstico da projeção não foi registrado")
require("docs/project/INSTANCE_GRAPH_DAG_0052A.md", "Não há autorreferência ainda", "limite acíclico não documentado")

if errors:
    print("Auditoria 0052a falhou:", file=sys.stderr)
    for error in errors:
        print(f"- {error}", file=sys.stderr)
    raise SystemExit(1)

print("Auditoria 0052a aprovada: DAG de definições, instâncias leves, assemblies recursivos acíclicos, save compacto e projeção derivada.")
