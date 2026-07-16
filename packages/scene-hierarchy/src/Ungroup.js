import {
  decomposeTransformStrict,
  identityMatrix,
  invertAffineMatrix,
  multiplyMatrices
} from "../../math-affine/src/index.js";
import { HierarchyError, HierarchyIndex } from "./HierarchyIndex.js";

export function ungroupNodes(nodes, {groupIds = []} = {}) {
  if (!Array.isArray(nodes) || !Array.isArray(groupIds)) {
    throw new TypeError("Desagrupamento exige arrays de nós e grupos.");
  }

  const hierarchy=new HierarchyIndex(nodes);
  const requested=[];
  const seen=new Set();

  for (const value of groupIds) {
    const id=String(value ?? "").trim();
    const node=hierarchy.node(id);
    if (node.kind !== "group") {
      throw new HierarchyError(
        "NOT_A_GROUP",
        `Nó não é um grupo: ${id}.`,
        { id }
      );
    }
    if (!seen.has(id)) {
      seen.add(id);
      requested.push(id);
    }
  }

  const groups=hierarchy.canonicalizeSelection(requested);
  if (!groups.length) return Object.freeze({
    nodes,
    groupIds:Object.freeze([]),
    promotedIds:Object.freeze([])
  });

  const localById=new Map();
  const promotedIds=[];

  for (const groupId of groups) {
    const parentId=hierarchy.parentOf(groupId);
    const parentWorld=parentId === null
      ? identityMatrix()
      : hierarchy.worldMatrixOf(parentId);
    const inverseParentWorld=invertAffineMatrix(parentWorld);

    for (const childId of hierarchy.childrenOf(groupId)) {
      const localMatrix=multiplyMatrices(
        inverseParentWorld,
        hierarchy.worldMatrixOf(childId)
      );
      localById.set(childId,Object.freeze({
        parentId,
        transform:decomposeTransformStrict(localMatrix)
      }));
      promotedIds.push(childId);
    }
  }

  const removed=new Set(groups);
  const next=Object.freeze(nodes
    .filter(node => !removed.has(String(node.id)))
    .map(node => {
      const update=localById.get(String(node.id));
      if (!update) return node;
      const result={
        ...node,
        position:Object.freeze([...update.transform.position]),
        rotation:Object.freeze([...update.transform.rotation]),
        scale:Object.freeze([...update.transform.scale])
      };
      if (update.parentId === null) delete result.parentId;
      else result.parentId=update.parentId;
      return Object.freeze(result);
    }));

  new HierarchyIndex(next);
  return Object.freeze({
    nodes:next,
    groupIds:Object.freeze([...groups]),
    promotedIds:Object.freeze(promotedIds)
  });
}
