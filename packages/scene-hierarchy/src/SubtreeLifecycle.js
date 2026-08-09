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
    hasNode = null,
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

  const generatedIds = new Set();
  const reservedIds = typeof hasNode === "function"
    ? null
    : new Set(nodes.map(node => String(node.id)));
  const isReserved = id => generatedIds.has(id) ||
    (reservedIds ? reservedIds.has(id) : Boolean(hasNode(id)));
  const reserve = id => {
    generatedIds.add(id);
    reservedIds?.add(id);
  };
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
      if (isReserved(id)) {
        throw new HierarchyError(
          "DUPLICATE_NODE_ID",
          `Identificador duplicado durante clonagem: ${id}.`,
          { id }
        );
      }
      reserve(id);
      idMap.set(sourceId,id);
    }

    const copyObjects=[];
    for (const sourceId of sourceIds) {
      const source=hierarchy.node(sourceId);
      const isRoot=rootSet.has(sourceId);
      /*
       * Recursos pesados (geometry/sketch/material/family) são imutáveis no
       * modelo e devem continuar compartilhados entre duplicatas. Clonamos
       * apenas o envelope lógico e os vetores de transformação.
       */
      const clone={
        ...cloneNodeShell(source),
        id:idMap.get(sourceId),
        prototypeId: source.prototypeId ?? source.id
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
      const frozen=freezeNodeShell(transformed);
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

  /* A hierarquia de entrada já foi validada e cada parentId novo foi
     resolvido acima. Evitamos reconstruir um HierarchyIndex O(N) apenas para
     confirmar a clonagem. */
  return Object.freeze({
    sourceRootIds:Object.freeze([...roots]),
    sourceIds,
    objects:Object.freeze(objects),
    duplicatedRootIds:Object.freeze(duplicatedRootIds),
    copies:Object.freeze(copiesResult)
  });
}


function cloneNodeShell(source) {
  const clone = { ...source };
  for (const key of ["position", "rotation", "scale"]) {
    if (Array.isArray(source?.[key])) clone[key] = [...source[key]];
  }
  return clone;
}

function freezeNodeShell(value) {
  const clone = cloneNodeShell(value);
  for (const key of ["position", "rotation", "scale"]) {
    if (Array.isArray(clone[key])) clone[key] = Object.freeze(clone[key]);
  }
  return Object.freeze(clone);
}
