import {
  compactSceneToInstanceGraph,
  duplicateReferenceRoots,
  InstanceGraphProjectionCache,
  instanceGraphDiagnostics,
  projectInstanceGraphScene,
  validateInstanceGraph
} from "../packages/instance-graph/src/index.js?build=20260807-0052a";
import { boxRegionReducer } from "../packages/region-box/src/reducer.js?build=20260807-0052a";
import { ProjectSerializer } from "../packages/project-files/src/ProjectSerializer.js?build=20260807-0052a";
import { HierarchyIndex } from "../packages/scene-hierarchy/src/HierarchyIndex.js?build=20260807-0052a";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function leaf(id, x = 0, prototypeId = "shared-heavy") {
  return {
    id,
    prototypeId,
    kind: "buffer",
    name: id,
    parentId: null,
    position: [x, 0, 0],
    rotation: [0, 0, 0, 1],
    scale: [1, 1, 1],
    geometry: {
      type: "buffer",
      positions: Array(3000).fill(0),
      indices: Array(1000).fill(0)
    },
    appearanceId: "appearance:default",
    appearanceBinding: {},
    instanceState: { color: "#ffffff" }
  };
}

// 1. 1001 ocorrências da mesma geometria: uma definição pesada.
{
  const objects = Array.from({ length: 1001 }, (_, index) =>
    leaf(`leaf-${index}`, index)
  );
  const scene = compactSceneToInstanceGraph({ objects });
  const diag = instanceGraphDiagnostics(scene);
  const text = JSON.stringify(scene);
  assert(diag.objectDefinitions === 1, "geometria duplicada em definições");
  assert(diag.rootInstanceCount === 1001, "instâncias de topo incorretas");
  assert((text.match(/\"positions\"/g) ?? []).length === 1, "positions repetida no arquivo");
  assert(scene.objects.every(object => object.kind === "instance"), "objeto legado não compactado");
  assert(scene.objects.every(object => !object.geometry), "geometria vazou para instância");
}

// 2. A -> assembly S -> assembly T; cópias de T não expandem S/A.
{
  let state = { objects: [leaf("a", 0), leaf("b", 2)] };
  state = boxRegionReducer(state, {
    type: "selection.group",
    groupId: "S",
    targetIds: ["a", "b"],
    name: "S"
  }, {}).state;

  state = duplicateReferenceRoots(state, [{ sourceId: "S", id: "S2", position: [10, 0, 0] }]).scene;
  state = boxRegionReducer(state, {
    type: "selection.group",
    groupId: "T",
    targetIds: ["S", "S2"],
    name: "T"
  }, {}).state;

  const copies = Array.from({ length: 100 }, (_, index) => ({
    sourceId: "T",
    id: `T-copy-${index}`,
    position: [0, index + 1, 0]
  }));
  state = duplicateReferenceRoots(state, copies).scene;
  validateInstanceGraph(state);

  const diag = instanceGraphDiagnostics(state);
  assert(diag.objectDefinitions === 1, "esperada uma definição de objeto");
  assert(diag.assemblyDefinitions === 2, "esperadas duas definições de assembly");
  assert(diag.edgeCount === 4, "arestas internas foram expandidas");
  assert(diag.rootInstanceCount === 101, "cópias da estrutura foram materializadas");

  const projected = projectInstanceGraphScene(state);
  assert(projected.objects.length === 101 * 7, "projeção derivada incorreta");

  const deleted = boxRegionReducer(state, {
    type: "selection.delete",
    ids: ["T-copy-0"],
    expandedSubtree: true
  }, {});
  assert(deleted.changes.length === 1, "delete de instância não publicou mudança");
  assert(deleted.changes[0].object?.id === "T-copy-0", "delete perdeu objeto removido");
  assert(!deleted.state.objects.some(object => object.id === "T-copy-0"), "delete não removeu instância");
}

// 3. Estado local da instância sobrevive à compactação.
{
  const scene = compactSceneToInstanceGraph({
    objects: [leaf("stateful")]
  });
  const projected = projectInstanceGraphScene(scene);
  assert(projected.objects[0].instanceState?.color === "#ffffff", "override local perdido");
}

// 4. Serializer schema 4 grava a geometria somente uma vez.
{
  const state = {
    objects: Array.from({ length: 500 }, (_, index) => leaf(`save-${index}`, index))
  };
  const serializer = new ProjectSerializer({
    sandbox: { getState: () => state },
    editor: { snapshot: () => ({}) },
    renderer: { getTransformConfig: () => ({}) },
    region: { descriptor: { id: "region-main" }, version: 0 },
    appearanceRuntime: {
      normalizeScene: scene => scene,
      exportAssets: () => ({ schemaVersion: 1, assets: {} })
    }
  });
  const document = serializer.serialize({ name: "dag-test" });
  const text = JSON.stringify(document);
  assert(document.schemaVersion === 4, "schema do projeto não é 4");
  assert((text.match(/\"positions\"/g) ?? []).length === 1, "save repetiu geometria");
}

// 5. Projeção incremental toca somente a raiz alterada.
{
  let scene = compactSceneToInstanceGraph({
    objects: Array.from({ length: 1000 }, (_, index) => leaf(`local-${index}`, index))
  });
  const cache = new InstanceGraphProjectionCache();
  cache.reset(scene);
  const before = cache.status().statistics.projectedObjectsVisited;
  const previousObject = scene.objects[500];
  const object = Object.freeze({ ...previousObject, position: [999, 0, 0] });
  scene = {
    ...scene,
    objects: Object.freeze(scene.objects.map((value, index) => index === 500 ? object : value))
  };
  const update = cache.update(scene, [{
    type: "object-transform",
    objectId: object.id,
    object,
    previousObject
  }]);
  const delta = cache.status().statistics.projectedObjectsVisited - before;
  assert(delta === 1, "transform de uma folha reprojetou objetos não relacionados");
  assert(update.changes.length === 1, "transform local gerou mudanças extras");
}

// 6. HierarchyIndex invalida apenas a subárvore transformada.
{
  const nodes = [
    { id: "root", parentId: null, position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
    { id: "child", parentId: "root", position: [1, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
    { id: "other", parentId: null, position: [100, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] }
  ];
  const hierarchy = new HierarchyIndex(nodes);
  hierarchy.worldMatrixOf("child");
  const unrelated = hierarchy.worldMatrixOf("other");
  const invalidated = hierarchy.updateNode("root", { ...nodes[0], position: [10, 0, 0] });
  assert(invalidated === 2, "HierarchyIndex invalidou fora da subárvore");
  assert(hierarchy.worldMatrixOf("child")[12] === 11, "matriz descendente não foi recalculada");
  assert(hierarchy.worldMatrixOf("other") === unrelated, "matriz não relacionada foi recalculada");
}

// 7. Ciclos permanecem proibidos nesta primeira etapa.
{
  const cyclic = {
    instanceGraph: {
      version: "instance-graph-v1",
      definitions: {
        A: {
          id: "A",
          type: "assembly",
          signature: "cycle",
          prototypeId: "A",
          pivot: [0, 0, 0],
          children: [{
            slotId: "slot:0",
            ref: "A",
            name: null,
            transform: { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
            overrides: {}
          }]
        }
      }
    },
    objects: []
  };
  let rejected = false;
  try {
    validateInstanceGraph(cyclic);
  } catch (error) {
    rejected = /Ciclo de definição ainda não permitido/.test(error.message);
  }
  assert(rejected, "ciclo não foi rejeitado no 0052a");
}

console.log("0052a InstanceGraph DAG: 8/8 testes aprovados.");
