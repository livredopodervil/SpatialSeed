import {
  AppearanceRuntime
} from "../packages/appearance-runtime/src/AppearanceRuntime.js?build=20260807-0051b";
import {
  ProjectService
} from "../packages/project-files/src/ProjectService.js";
import {
  createPersistentObjectArray
} from "../packages/core/src/PersistentObjectArray.js?build=20260807-0051a";
import {
  ScreenSelectionIndex,
  normalizeScreenSelectionGesture,
  screenSelectionGestureContains
} from "../packages/renderer-three/src/ScreenSelectionGesture.js?build=20260807-0051b";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const state = {
  schemaVersion: 1,
  objects: createPersistentObjectArray([{
    id: "group-a",
    kind: "group",
    position: [0, 0, 0],
    rotation: [0, 0, 0, 1],
    scale: [1, 1, 1]
  }])
};
const appearanceRuntime = new AppearanceRuntime();
const service = new ProjectService({
  sandbox: {
    getState: () => state,
    getBaseState: () => state
  },
  editor: { snapshot: () => ({ selection: [] }) },
  renderer: { getTransformConfig: () => ({}) },
  region: { descriptor: { id: "region-main" }, version: 0 },
  appearanceRuntime
});
const prepared = service.save();
assert(prepared.prepared === true, "project.save não preparou o documento");
assert(prepared.text.includes('"objects"'), "project.save perdeu objects");

const rectangle = normalizeScreenSelectionGesture({
  mode: "rectangle",
  rectangle: { left: 0, top: 0, right: 10, bottom: 10 }
});
assert(screenSelectionGestureContains(rectangle, {
  x: 20,
  y: 5,
  bounds: { left: 8, top: 4, right: 22, bottom: 6 }
}), "retângulo não intersectou bounds visuais");
assert(!screenSelectionGestureContains(rectangle, {
  x: 20,
  y: 5,
  bounds: { left: 11, top: 4, right: 22, bottom: 6 }
}), "retângulo produziu falso positivo");

const lasso = normalizeScreenSelectionGesture({
  mode: "lasso",
  points: [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 }
  ]
});
assert(screenSelectionGestureContains(lasso, {
  x: 20,
  y: 5,
  bounds: { left: 8, top: 4, right: 22, bottom: 6 }
}), "laço não intersectou bounds visuais");

const index = new ScreenSelectionIndex({ cellSize: 16 }).rebuild([{
  id: "object-a",
  x: 20,
  y: 5,
  bounds: { left: 8, top: 4, right: 22, bottom: 6 }
}]);
assert(index.query(rectangle).length === 1, "índice retangular perdeu candidato");
assert(index.query(lasso).length === 1, "índice de laço perdeu candidato");

console.log("0051b save/selection: 6/6 testes aprovados.");
