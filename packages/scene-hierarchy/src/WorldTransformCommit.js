import {
  decomposeTransformStrict,
  identityMatrix,
  invertAffineMatrix,
  multiplyMatrices,
  validateAffineMatrix
} from "../../math-affine/src/index.js";
import { HierarchyError, HierarchyIndex } from "./HierarchyIndex.js";

export function applyWorldTransforms(nodes, transforms = []) {
  if (!Array.isArray(nodes) || !Array.isArray(transforms)) {
    throw new TypeError("Transformação mundial exige arrays de nós e transforms.");
  }
  if (!transforms.length) return nodes;

  const hierarchy=new HierarchyIndex(nodes);
  const desiredWorld=new Map();

  for (const transform of transforms) {
    const id=String(transform?.id ?? "").trim();
    hierarchy.node(id);
    if (desiredWorld.has(id)) {
      throw new HierarchyError(
        "DUPLICATE_TRANSFORM_TARGET",
        `Alvo de transformação duplicado: ${id}.`,
        { id }
      );
    }
    validateAffineMatrix(transform.worldMatrix);
    desiredWorld.set(id,Object.freeze([...transform.worldMatrix]));
  }

  const proposedWorldCache=new Map(desiredWorld);
  const proposedWorld=id => {
    if (proposedWorldCache.has(id)) return proposedWorldCache.get(id);

    const unresolved=[];
    let cursor=id;
    while (cursor !== null && !proposedWorldCache.has(cursor)) {
      unresolved.push(cursor);
      cursor=hierarchy.parentOf(cursor);
    }

    let world=cursor === null
      ? identityMatrix()
      : proposedWorldCache.get(cursor);

    while (unresolved.length) {
      const current=unresolved.pop();
      world=Object.freeze(multiplyMatrices(
        world,
        hierarchy.localMatrixOf(current)
      ));
      proposedWorldCache.set(current,world);
    }
    return proposedWorldCache.get(id);
  };

  const localById=new Map();
  for (const [id,world] of desiredWorld) {
    const parentId=hierarchy.parentOf(id);
    const parentWorld=parentId === null
      ? identityMatrix()
      : proposedWorld(parentId);
    const localMatrix=multiplyMatrices(
      invertAffineMatrix(parentWorld),
      world
    );
    if (matricesNear(localMatrix,hierarchy.localMatrixOf(id))) continue;
    localById.set(id,decomposeTransformStrict(localMatrix));
  }

  if (!localById.size) return nodes;

  return Object.freeze(nodes.map(node => {
    const local=localById.get(String(node.id));
    if (!local) return node;
    return Object.freeze({
      ...node,
      position: Object.freeze([...local.position]),
      rotation: Object.freeze([...local.rotation]),
      scale: Object.freeze([...local.scale])
    });
  }));
}

function matricesNear(left, right, epsilon = 1e-12) {
  return left.every((value,index) =>
    Math.abs(value-right[index]) <= epsilon
  );
}
