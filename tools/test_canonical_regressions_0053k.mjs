import * as THREE from "three";
import {
  LocallyResolvedObjectHierarchy
} from "../packages/transform-hierarchy/src/index.js?build=20260809-0053k";
import {
  compactHierarchyRoots,
  instanceOccurrenceId,
  instanceOccurrenceWorldContext,
  projectInstanceGraphScene,
  updateInstanceOccurrenceRoot
} from "../packages/instance-graph/src/index.js?build=20260809-0053k";
import { MeshEditVisibility } from "../packages/renderer-three/src/MeshEditVisibility.js?build=20260809-0053k";
import {
  LocalTransformPreviewCoordinator
} from "../packages/local-viewers/src/LocalTransformPreviewCoordinator.js?build=20260809-0053k";

let passed = 0;
function assert(condition, message) {
  if (!condition) throw new Error(message);
  passed += 1;
}
function near(value, expected, message) {
  assert(Math.abs(Number(value) - Number(expected)) < 1e-9, message);
}
function matrixX(x) {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, 0, 0, 1];
}
function object(id, parentId, x, geometry = { type: "box", size: [1, 1, 1] }) {
  return Object.freeze({
    id,
    kind: "box",
    name: id,
    parentId,
    position: [x, 0, 0],
    rotation: [0, 0, 0, 1],
    scale: [1, 1, 1],
    size: [1, 1, 1],
    ...(geometry ? { geometry } : {})
  });
}
function group(id, parentId, x) {
  return Object.freeze({
    id,
    kind: "group",
    name: id,
    parentId,
    position: [x, 0, 0],
    rotation: [0, 0, 0, 1],
    scale: [1, 1, 1],
    pivot: [0, 0, 0]
  });
}

// 1. Each ephemeral layer falls back to the immediately lower local cache.
const hierarchy = new LocallyResolvedObjectHierarchy();
hierarchy.replaceBase([
  { object: group("root", null, 10), worldMatrix: matrixX(10) },
  { object: group("child", "root", 2), worldMatrix: matrixX(12) },
  { object: object("leaf", "child", 3), worldMatrix: matrixX(15) }
], { revision: 4 });
hierarchy.setLayer("animation", [{ id: "root", worldMatrix: matrixX(20) }], {
  priority: 100,
  baseRevision: 4
});
near(hierarchy.worldMatrix("leaf")[12], 25,
  "descendente não herdou pai animado pelo local inferior");
hierarchy.setLayer("shared", [{ id: "child", worldMatrix: matrixX(100) }], {
  priority: 200,
  baseRevision: 4,
  phase: "committing"
});
near(hierarchy.worldMatrix("leaf")[12], 103,
  "preview mais efêmero não reutilizou local da folha");
hierarchy.setLayer("appearance", [{
  id: "leaf",
  patch: { material: { color: "#ff0000" } }
}], { priority: 300, baseRevision: 4 });
assert(hierarchy.resolve("leaf").geometry.type === "box",
  "patch efêmero perdeu geometria da camada inferior");
assert(hierarchy.resolve("leaf").appearance.color === "#ff0000",
  "patch efêmero não substituiu aparência");
hierarchy.clearLayer("shared");
near(hierarchy.worldMatrix("leaf")[12], 25,
  "remoção do preview não recuperou animação");

// 2. Overrides of nested compact instances survive regrouping with prefixed paths.
const innerLegacy = {
  objects: Object.freeze([
    group("inner", null, 1),
    object("inner-leaf", "inner", 2)
  ])
};
const innerCompacted = compactHierarchyRoots(innerLegacy, ["inner"]).scene;
const innerRoot = updateInstanceOccurrenceRoot(
  innerCompacted.objects[0],
  ["slot:0"],
  { transform: { position: [9, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] } }
);
const outerScene = {
  objects: Object.freeze([
    group("outer", null, 5),
    Object.freeze({ ...innerRoot, parentId: "outer" })
  ]),
  instanceGraph: innerCompacted.instanceGraph
};
const outerCompacted = compactHierarchyRoots(outerScene, ["outer"]).scene;
const nestedLeafId = instanceOccurrenceId("outer", ["slot:0", "slot:0"]);
const projectedOuter = projectInstanceGraphScene(outerCompacted);
const nestedLeaf = projectedOuter.objects.find(value => value.id === nestedLeafId);
assert(Boolean(nestedLeaf), "folha do grupo de grupos desapareceu");
near(nestedLeaf.position[0], 9,
  "override interno foi perdido ao compactar grupo de grupos");
assert(Boolean(outerCompacted.objects[0].overrides["slot:0/slot:0"]),
  "caminho do override interno não foi prefixado");

// 3. World context applies the root exactly once at arbitrary recursion depth.
const context = instanceOccurrenceWorldContext(outerCompacted, nestedLeafId);
near(context.worldMatrix[12], 15,
  "contexto mundial aplicou raiz ou aresta número incorreto de vezes");

// 4. Visibility reasons compose without exposing a mesh still hidden elsewhere.
const matrices = new Map([["leaf", new THREE.Matrix4()]]);
const writes = [];
const batchManager = {
  resourcesForOwner: id => id === "leaf" ? ["leaf"] : [],
  locationOf: () => ({ batchKey: "batch" }),
  update: (id, matrix) => { matrices.set(id, matrix.clone()); writes.push(matrix.clone()); return true; }
};
const visibility = new MeshEditVisibility({ batchManager });
visibility.setHidden("leaf", true, matrixX(10), { reason: "mesh-edit" });
visibility.setHidden("leaf", true, matrixX(10), { reason: "other-policy" });
visibility.setHidden("leaf", false, matrixX(10), { reason: "mesh-edit" });
assert(visibility.isHidden("leaf") && writes.at(-1).determinant() === 0,
  "uma razão de visibilidade removeu outra razão ativa");
visibility.setHidden("leaf", false, matrixX(10), { reason: "other-policy" });
near(writes.at(-1).elements[12], 10,
  "última razão não restaurou matriz canônica");

// 5. Committing previews survive the synchronous Sandbox notification.
let sandboxListener = null;
const sandbox = {
  revision: 0,
  subscribe(listener) { sandboxListener = listener; return () => {}; }
};
let clears = 0;
const coordinator = new LocalTransformPreviewCoordinator({
  sandbox,
  sandboxId: "sandbox-12345678-test",
  viewerId: "viewer-test",
  adapter: { apply() {}, clear() { clears += 1; } },
  channelFactory: () => ({
    addEventListener() {}, removeEventListener() {}, postMessage() {}, close() {}
  }),
  setTimeoutFn: () => 1,
  clearTimeoutFn() {}
});
coordinator.start();
coordinator.begin({ previewId: "p", transforms: [{ id: "leaf", worldMatrix: matrixX(1) }] });
coordinator.end({ previewId: "p", transforms: [{ id: "leaf", worldMatrix: matrixX(2) }], committed: true });
sandbox.revision = 1;
sandboxListener({}, [{ type: "object-transform", objectId: "leaf" }]);
assert(clears === 0 && coordinator.status().localPreviewId === "p",
  "mutação do commit removeu preview antes da projeção");
coordinator.projectionApplied(1);
assert(clears === 1 && coordinator.status().localPreviewId === null,
  "confirmação da revisão projetada não liberou preview");
coordinator.dispose();

console.log(`Canonical regressions 0053k: ${passed}/13`);
