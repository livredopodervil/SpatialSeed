import {
  compactHierarchyRoots,
  instanceOccurrenceId,
  projectInstanceGraphScene,
  InstanceGraphProjectionCache
} from "../packages/instance-graph/src/index.js?build=20260807-0052b";
import { Sandbox } from "../packages/core/src/Sandbox.js?build=20260807-0052b";
import { boxRegionReducer } from "../packages/region-box/src/reducer.js?build=20260807-0052b";
import {
  SelectionPropertyService,
  createDefaultPropertyRegistry
} from "../packages/property-registry/src/index.js?build=20260807-0051a";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function leaf(id, parentId, x) {
  return Object.freeze({
    id,
    prototypeId: "shared-box",
    kind: "box",
    name: id,
    parentId,
    position: [x, 0, 0],
    rotation: [0, 0, 0, 1],
    scale: [1, 1, 1],
    size: [1, 1, 1],
    geometry: { type: "box", size: [1, 1, 1] },
    material: { color: "#ffffff" }
  });
}
const legacy = {
  objects: Object.freeze([
    Object.freeze({
      id: "S", kind: "group", name: "S", parentId: null,
      position: [10, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1], pivot: [0, 0, 0]
    }),
    leaf("a", "S", 1),
    leaf("b", "S", 2)
  ])
};
const compacted = compactHierarchyRoots(legacy, ["S"]).scene;
const childA = instanceOccurrenceId("S", ["slot:0"]);
const childB = instanceOccurrenceId("S", ["slot:1"]);
const region = {
  version: 1,
  descriptor: { id: "region-main" },
  getState: () => compacted
};
const sandbox = new Sandbox(region, boxRegionReducer);

// 1. projected occurrence resolves without materializing it in authoritative objects.
assert(sandbox.getRawObject(childA) === null, "ocorrência virou objeto autoritativo");
assert(sandbox.getObject(childA)?.name === "a", "ocorrência não resolve no Sandbox");
assert(sandbox.objectCount === 1, "estrutura compacta materializou filhos");

// 2. Inspector sees a projected occurrence.
const selection = { id: "selection-test", members: [{ objectId: childA }] };
const propertyService = new SelectionPropertyService({
  selection,
  sandbox,
  appearanceRuntime: {
    legacyMaterial: () => ({ color: "#ffffff" }),
    resolve: () => null
  },
  registry: createDefaultPropertyRegistry()
});
const inspection = propertyService.inspectSelection();
assert(inspection.count === 1, "Inspector perdeu ocorrência projetada");
assert(inspection.targetIds[0] === childA, "Inspector mudou identidade da ocorrência");

// 3. Property write updates only root override and remains projected.
const propertyResult = propertyService.set({
  targetIds: [childA],
  patch: { "object.name": "A-local" }
});
assert(propertyResult.changed, "propriedade local não foi aplicada");
assert(sandbox.getObject(childA)?.name === "A-local", "override de nome não foi resolvido");
assert(sandbox.objectCount === 1, "propriedade local materializou filho");

// 4. Local transform writes an occurrence override, not a new object.
assert(sandbox.dispatch({
  type: "selection.transform",
  transforms: [{
    id: childA,
    position: [3, 4, 5],
    rotation: [0, 0, 0, 1],
    scale: [2, 2, 2]
  }]
}), "transform local não alterou estado");
const transformed = sandbox.getObject(childA);
assert(JSON.stringify(transformed.position) === JSON.stringify([3, 4, 5]), "posição local incorreta");
assert(JSON.stringify(transformed.scale) === JSON.stringify([2, 2, 2]), "escala local incorreta");
assert(sandbox.objectCount === 1, "transform local materializou filho");

// 5. Projection cache updates one occurrence when only that override changes.
const cache = new InstanceGraphProjectionCache();
cache.reset(compacted);
let projectedChanges = null;
const unsub = sandbox.subscribe((_state, changes) => {
  if (changes?.some(change => change.affectedOccurrenceIds?.includes(childA))) {
    projectedChanges = cache.update(sandbox.getSnapshot(), changes);
  }
});
sandbox.dispatch({
  type: "object.update",
  id: childA,
  patch: { name: "A-local-2" }
});
unsub();
assert(projectedChanges?.full === false, "override forçou projeção completa");
assert(projectedChanges.changes.some(change => change.objectId === childA), "cache não publicou ocorrência alterada");

// 6. Delete hides only one occurrence; sibling and compact structure survive.
assert(sandbox.dispatch({
  type: "selection.delete",
  ids: [childA],
  expandedSubtree: false
}), "delete de ocorrência não alterou estado");
assert(sandbox.getObject(childA) === null, "ocorrência deletada continua resolvível");
assert(sandbox.getObject(childB) !== null, "delete removeu irmão não relacionado");
assert(sandbox.objectCount === 1, "delete materializou/removeu raiz incorretamente");
const afterDelete = projectInstanceGraphScene(sandbox.getSnapshot());
assert(!afterDelete.objects.some(object => object.id === childA), "projeção ainda contém ocorrência deletada");
assert(afterDelete.objects.some(object => object.id === childB), "projeção perdeu irmão");

// 7. Undo restores the same occurrence identity.
assert(sandbox.undo(), "undo do delete falhou");
assert(sandbox.getObject(childA)?.name === "A-local-2", "undo não restaurou ocorrência");
assert(sandbox.objectCount === 1, "undo materializou descendente");

// 8. World transform can be committed to projected occurrence.
const beforeWorld = sandbox.getObjectWorldMatrix(childA);
const desired = [...beforeWorld];
desired[12] += 7;
assert(sandbox.dispatch({
  type: "selection.transform-world",
  transforms: [{ id: childA, worldMatrix: desired }]
}), "transform mundial da ocorrência falhou");
const afterWorld = sandbox.getObjectWorldMatrix(childA);
assert(Math.abs(afterWorld[12] - desired[12]) < 1e-9, "transform mundial não foi convertido ao local correto");
assert(sandbox.objectCount === 1, "transform mundial materializou descendente");


// 9. Geometry replacement is copy-on-write for only the selected occurrence.
const siblingBeforeGeometry = sandbox.getObject(childB)?.geometry;
const definitionsBefore = Object.keys(sandbox.getSnapshot().instanceGraph.definitions).length;
assert(sandbox.dispatch({
  type: "object.geometry.replace",
  id: childA,
  geometry: { type: "box", size: [4, 1, 1] },
  source: "test-occurrence-cow"
}), "geometry replace da ocorrência falhou");
assert(JSON.stringify(sandbox.getObject(childA)?.geometry?.size) === JSON.stringify([4, 1, 1]), "geometria local não divergiu");
assert(sandbox.getObject(childB)?.geometry === siblingBeforeGeometry, "copy-on-write alterou definição compartilhada do irmão");
assert(Object.keys(sandbox.getSnapshot().instanceGraph.definitions).length === definitionsBefore + 1, "copy-on-write não criou definição divergente única");
assert(sandbox.objectCount === 1, "geometry replace materializou descendente");

console.log("0052b occurrence compatibility: 9/9 testes aprovados.");
