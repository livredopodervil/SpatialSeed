import { HierarchyError, HierarchyIndex } from "./HierarchyIndex.js";

export function hierarchySubtreeIds(nodes, rootIds = []) {
  const hierarchy=new HierarchyIndex(nodes);
  const roots=hierarchy.canonicalizeSelection(rootIds);
  const result=[];

  for (const rootId of roots) {
    result.push(rootId,...hierarchy.descendantsOf(rootId));
  }

  return Object.freeze(result);
}

export function cloneHierarchySubtrees(
  nodes,
  {
    rootIds = [],
    copies = 1,
    createId,
    rename = ({ name }) => name,
    transformRoot = ({ clone }) => clone,
    maxNodes = 100000
  } = {}
) {
  if (!Number.isInteger(copies) || copies < 1) {
    throw new RangeError("Quantidade de cópias deve ser um inteiro positivo.");
  }
  if (typeof createId !== "function") {
    throw new TypeError("Duplicação de subárvore exige createId.");
  }

  const hierarchy=new HierarchyIndex(nodes);
  const roots=hierarchy.canonicalizeSelection(rootIds);
  const rootSet=new Set(roots);
  if (!roots.length) {
    throw new HierarchyError("EMPTY_SELECTION","Duplicação exige ao menos uma raiz.");
  }
  const sourceIds=hierarchySubtreeIds(nodes,roots);
  const total=sourceIds.length*copies;
  if (total > maxNodes) {
    throw new HierarchyError(
      "DUPLICATE_LIMIT_EXCEEDED",
      `Duplicação criaria ${total} nós; limite ${maxNodes}.`,
      { total, maxNodes }
    );
  }

  const reservedIds=new Set(nodes.map(node => String(node.id)));
  const objects=[];
  const duplicatedRootIds=[];
  const copiesResult=[];

  for (let copyIndex=1; copyIndex<=copies; copyIndex+=1) {
    const idMap=new Map();

    for (const sourceId of sourceIds) {
      const id=String(createId({sourceId,copyIndex}) ?? "").trim();
      if (!id) {
        throw new HierarchyError("INVALID_NODE_ID","createId retornou ID inválido.");
      }
      if (reservedIds.has(id)) {
        throw new HierarchyError(
          "DUPLICATE_NODE_ID",
          `Identificador duplicado durante clonagem: ${id}.`,
          { id }
        );
      }
      reservedIds.add(id);
      idMap.set(sourceId,id);
    }

    const copyObjects=[];
    for (const sourceId of sourceIds) {
      const source=hierarchy.node(sourceId);
      const isRoot=rootSet.has(sourceId);
      const clone={
        ...structuredClone(source),
        id:idMap.get(sourceId)
      };
      const parentId=hierarchy.parentOf(sourceId);
      if (parentId !== null) {
        clone.parentId=idMap.get(parentId) ?? parentId;
      } else {
        clone.parentId=null;
      }
      if ("name" in source) {
        clone.name=String(rename({
          name:source.name,
          source,
          sourceId,
          copyIndex,
          isRoot
        }));
      }
      const transformed=isRoot
        ? transformRoot({clone,source,sourceId,copyIndex})
        : clone;
      const frozen=Object.freeze(structuredClone(transformed));
      copyObjects.push(frozen);
      objects.push(frozen);
    }

    const rootIdsForCopy=roots.map(rootId => idMap.get(rootId));
    duplicatedRootIds.push(...rootIdsForCopy);
    copiesResult.push(Object.freeze({
      copyIndex,
      rootIds:Object.freeze(rootIdsForCopy),
      objects:Object.freeze(copyObjects)
    }));
  }

  new HierarchyIndex([...nodes,...objects]);
  return Object.freeze({
    sourceRootIds:Object.freeze([...roots]),
    sourceIds,
    objects:Object.freeze(objects),
    duplicatedRootIds:Object.freeze(duplicatedRootIds),
    copies:Object.freeze(copiesResult)
  });
}
