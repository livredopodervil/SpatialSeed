import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  EDITOR_ORBIT_POLICY_VERSION,
  resolveEditorOrbitEnabled
} from "../packages/renderer-three/src/EditorOrbitPolicy.js?build=20260808-0053h";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const renderer = fs.readFileSync(
  path.join(root, "packages/renderer-three/src/ThreeRegionRenderer.js"),
  "utf8"
);

assert.equal(EDITOR_ORBIT_POLICY_VERSION, "editor-orbit-policy-v1");
assert.equal(resolveEditorOrbitEnabled({}), true);
assert.equal(resolveEditorOrbitEnabled({ selectionGestureActive: true }), false);
assert.equal(resolveEditorOrbitEnabled({
  selectionGestureActive: true,
  toolGestureNavigationActive: true
}), true);

for (const pointerType of ["mouse", "touch", "pen"]) {
  assert.equal(resolveEditorOrbitEnabled({
    pointerType,
    transformDragging: true,
    toolGestureNavigationActive: true
  }), false, `${pointerType}: o gizmo deve bloquear a câmera`);
}

assert.equal(resolveEditorOrbitEnabled({
  boundsScaleActive: true,
  toolGestureNavigationActive: true
}), false);
assert.match(renderer, /transformDragging:\s*Boolean\(event\.value\)/);
assert.doesNotMatch(
  renderer,
  /orbit\.enabled\s*=\s*this\.#toolGestureNavigation\.active\s*\|\|\s*!event\.value/
);

console.log("editor orbit policy 0053h: ok");
