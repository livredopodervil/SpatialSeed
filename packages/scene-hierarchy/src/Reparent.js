import {
  decomposeTransformStrict,
  identityMatrix,
  invertAffineMatrix,
  multiplyMatrices
} from "../../math-affine/src/index.js";
import { HierarchyIndex } from "./HierarchyIndex.js";

export function reparentPreservingWorld(
  nodes,
  { id, parentId = null } = {}
) {
  if (!Array.isArray(nodes)) {
    throw new TypeError("Reparentamento exige um array de nós.");
  }

  const hierarchy=new HierarchyIndex(nodes);
  const normalizedId=String(id ?? "").trim();
  const normalizedParent=normalizeParentId(parentId);
  hierarchy.assertCanReparent(normalizedId,normalizedParent);

  if (hierarchy.parentOf(normalizedId) === normalizedParent) return nodes;

  const worldBefore=hierarchy.worldMatrixOf(normalizedId);
  const parentWorld=normalizedParent === null
    ? identityMatrix()
    : hierarchy.worldMatrixOf(normalizedParent);
  const localMatrix=multiplyMatrices(
    invertAffineMatrix(parentWorld),
    worldBefore
  );
  const local=decomposeTransformStrict(localMatrix);

  return Object.freeze(nodes.map(node => {
    if (String(node.id) !== normalizedId) return node;
    return Object.freeze({
      ...node,
      parentId: normalizedParent,
      position: Object.freeze([...local.position]),
      rotation: Object.freeze([...local.rotation]),
      scale: Object.freeze([...local.scale])
    });
  }));
}

function normalizeParentId(value) {
  if (value === null || value === undefined || value === "") return null;
  return String(value).trim();
}
