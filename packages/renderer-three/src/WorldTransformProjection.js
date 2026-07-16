import * as THREE from "three";

export function applyProjectedWorldMatrix(proxy, matrix) {
  if (!proxy?.isObject3D) {
    throw new TypeError("Projeção mundial exige THREE.Object3D.");
  }
  if (!Array.isArray(matrix) || matrix.length !== 16) {
    throw new TypeError("Matriz mundial deve conter 16 valores.");
  }

  proxy.matrixAutoUpdate=false;
  proxy.matrix.fromArray(matrix);
  proxy.matrix.decompose(proxy.position,proxy.quaternion,proxy.scale);
  proxy.matrixWorldNeedsUpdate=true;
  proxy.updateMatrixWorld(true);
  return proxy;
}

export function affectedHierarchyIds(hierarchy, changes = []) {
  const affected=new Set();

  for (const change of changes) {
    const id=change?.objectId;
    if (!id) continue;
    affected.add(id);
    if (!hierarchy.has(id)) continue;
    for (const descendantId of hierarchy.descendantsOf(id)) {
      affected.add(descendantId);
    }
  }

  return Object.freeze([...affected]);
}
