#!/usr/bin/env python3
from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]
errors = []

def text(rel):
    path = ROOT / rel
    if not path.is_file():
        errors.append(f"arquivo ausente: {rel}")
        return ""
    return path.read_text(encoding="utf-8")

def require(rel, needles):
    source = text(rel)
    for needle in needles:
        if needle not in source:
            errors.append(f"{rel}: marcador ausente: {needle}")
    return source

build = json.loads(text("apps/web/build-info.json") or "{}")
if build.get("build") != "20260807-0052a":
    errors.append(f"build incorreto: {build.get('build')!r}")

require("packages/core/src/PersistentObjectArray.js", [
    "createPersistentObjectArray",
    "persistentObjectUpdateAt",
    "persistentObjectUpdateMany",
    "persistentObjectAppendMany",
    "persistentObjectArrayDiagnostics",
])
sandbox = require("packages/core/src/Sandbox.js", [
    "PersistentObjectArray.js?build=20260807-0051a",
    "getObject(id)",
    "getObjects(ids = [])",
    "#objectsById",
    "#objectPositions",
    "materializeState(this.#state)",
    "objectStorage: persistentObjectArrayDiagnostics",
])
if "structuredClone(this.#state)" in sandbox:
    errors.append("Sandbox ainda clona o estado inteiro em getState")

subtree = require("packages/scene-hierarchy/src/SubtreeLifecycle.js", [
    "prototypeId: source.prototypeId ?? source.id",
    "Recursos pesados",
    "hasNode = null",
])
if "structuredClone(source)" in subtree:
    errors.append("SubtreeLifecycle ainda clona profundamente a origem")

reducer = require("packages/region-box/src/reducer.js", [
    "persistentObjectUpdateAt",
    "persistentObjectUpdateMany",
    "persistentObjectAppendMany",
    "getObjectPosition",
    "newPrototypeId",
])
if "context?.getObjectPosition" not in reducer and "context.getObjectPosition" not in reducer:
    errors.append("reducer não usa posição indexada no caminho principal")

selection = require("packages/selection-operations/src/SelectionOperations.js", [
    'operation: "mirror"',
    '"console-mirror"',
    "getObjectDescendantIds",
])
property_registry = require("packages/property-registry/src/createDefaultPropertyRegistry.js", [
    "nonZeroVector",
    "valores negativos representam espelho",
])
devconsole = require("packages/devtools/src/DevConsole.js", [
    'factors: tokens.map(value => this.#nonZero(value))',
    "valor negativo = espelho no eixo",
])
property_service = require("packages/property-registry/src/SelectionPropertyService.js", [
    "getObjectDescendantIds",
    "#selectionTargets",
])
if "sandbox.getState()" in property_service:
    errors.append("SelectionPropertyService ainda consulta o estado global")

require("packages/object-inspector/src/ObjectInspector.js", [
    "#sandboxChangesAffectInspector",
    "sandbox-ignored",
    "targetIds = new Set",
])
require("packages/renderer-outline/src/OutlineRenderer.js", [
    "sandbox",
    "VirtualResourceTree",
])
require("packages/runtime-layers/src/CameraObjectService.js", [
    "#cameraLineageIds",
    "#changeTouchesCamera",
    "Mudanças em objetos não relacionados",
])
require("apps/web/bootstrap/bindWebInterface.js", [
    "cameraAffected",
])

require("packages/renderer-three/src/SpatialObjectIndex.js", [
    "class SpatialObjectIndex",
    "queryRay(ray",
    "traverseRayCells",
    "rayBoxDistance",
])
require("packages/renderer-three/src/MirroredGeometry.js", [
    "mirrorGeometryXInPlace",
    "positiveInstanceMatrixForMirror",
])
require("packages/instance-batches/src/InstanceBatchManager.js", [
    "writableBatchForBaseKey",
    "addSegmented",
    "shardBases",
])
require("packages/renderer-three/src/HeterogeneousBatchManager.js", [
    "getBatch(batchKey)",
])
renderer = require("packages/renderer-three/src/ThreeRegionRenderer.js", [
    "SpatialObjectIndex.js?build=20260807-0051a",
    "MirroredGeometry.js?build=20260807-0051a",
    "#spatialShardSize = 32",
    "#spatialShardCapacity = 256",
    "#raycastSpatialObjects",
    "#spatialObjectIndex.queryRay",
    "#spatialShardBaseKey",
    "addSegmented",
    "mirror:x",
    "frustumCulled = true",
    "spatialShardMigrations",
])
for obsolete in [
    "selectionBatches.map(batch => batch.mesh)",
    "this.#raycaster.intersectObjects(this.#batchManager",
    "this.raycaster.intersectObjects(this.#batchManager",
]:
    if obsolete in renderer:
        errors.append(f"renderer ainda contém picking global: {obsolete}")

if errors:
    print("Auditoria 0051b FALHOU:")
    for error in errors:
        print(f"- {error}")
    raise SystemExit(1)

print("Auditoria 0051b aprovada: armazenamento persistente, recursos compartilhados, shards espaciais, culling local, picking indexado e espelho por escala negativa.")
