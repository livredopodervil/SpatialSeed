import {
  decomposeTransformStrict,
  identityMatrix,
  invertAffineMatrix,
  multiplyMatrices,
  translationMatrix
} from "../../math-affine/src/index.js";
import { HierarchyError, HierarchyIndex } from "./HierarchyIndex.js";

export function groupNodes(
  nodes,
  {
    groupId,
    targetIds = [],
    name,
    anchorWorldPosition,
    pivot = [0,0,0]
  } = {}
) {
  if (!Array.isArray(nodes)) {
    throw new TypeError("Agrupamento exige um array de nós.");
  }

  const hierarchy=new HierarchyIndex(nodes);
  const id=normalizeId(groupId,"INVALID_GROUP_ID");
  if (hierarchy.has(id)) {
    throw new HierarchyError(
      "DUPLICATE_NODE_ID",
      `Identificador de grupo já existe: ${id}.`,
      { id }
    );
  }

  const explicitTargets=normalizeTargets(targetIds,hierarchy);
  const targets=hierarchy.canonicalizeSelection(explicitTargets);
  if (!targets.length) {
    throw new HierarchyError(
      "EMPTY_GROUP",
      "Agrupamento exige ao menos um alvo."
    );
  }

  const parentId=lowestCommonParent(hierarchy,targets);
  const parentWorld=parentId === null
    ? identityMatrix()
    : hierarchy.worldMatrixOf(parentId);
  const anchorWorld=anchorWorldPosition === undefined
    ? medianWorldPosition(hierarchy,targets)
    : vector3(anchorWorldPosition,"Posição mundial da âncora inválida.");
  const anchorLocal=transformPoint(
    invertAffineMatrix(parentWorld),
    anchorWorld
  );
  const groupWorld=multiplyMatrices(
    parentWorld,
    translationMatrix(anchorLocal)
  );
  const inverseGroupWorld=invertAffineMatrix(groupWorld);
  const localById=new Map();

  for (const targetId of targets) {
    const localMatrix=multiplyMatrices(
      inverseGroupWorld,
      hierarchy.worldMatrixOf(targetId)
    );
    localById.set(targetId,decomposeTransformStrict(localMatrix));
  }

  const group=Object.freeze({
    id,
    kind:"group",
    name:String(name ?? `Grupo ${id}`),
    parentId,
    position:Object.freeze([...anchorLocal]),
    rotation:Object.freeze([0,0,0,1]),
    scale:Object.freeze([1,1,1]),
    pivot:Object.freeze(vector3(pivot,"Pivô local do grupo inválido."))
  });

  const firstTargetIndex=Math.min(...targets.map(targetId =>
    nodes.findIndex(node => String(node.id) === targetId)
  ));
  const next=[];

  for (let index=0; index<nodes.length; index+=1) {
    if (index === firstTargetIndex) next.push(group);
    const node=nodes[index];
    const local=localById.get(String(node.id));
    next.push(local
      ? Object.freeze({
          ...node,
          parentId:id,
          position:Object.freeze([...local.position]),
          rotation:Object.freeze([...local.rotation]),
          scale:Object.freeze([...local.scale])
        })
      : node
    );
  }

  const frozen=Object.freeze(next);
  new HierarchyIndex(frozen);
  return Object.freeze({
    nodes:frozen,
    group,
    targetIds:targets
  });
}

function normalizeTargets(values, hierarchy) {
  if (!Array.isArray(values)) {
    throw new TypeError("Alvos do grupo devem formar um array.");
  }
  const targets=[];
  const seen=new Set();
  for (const value of values) {
    const id=normalizeId(value,"INVALID_GROUP_TARGET");
    hierarchy.node(id);
    if (seen.has(id)) {
      throw new HierarchyError(
        "DUPLICATE_GROUP_TARGET",
        `Alvo de agrupamento duplicado: ${id}.`,
        { id }
      );
    }
    seen.add(id);
    targets.push(id);
  }
  return targets;
}

function lowestCommonParent(hierarchy, targets) {
  const lineages=targets.map(id => {
    const result=[];
    let cursor=hierarchy.parentOf(id);
    while (cursor !== null) {
      result.push(cursor);
      cursor=hierarchy.parentOf(cursor);
    }
    result.push(null);
    return result;
  });
  const otherSets=lineages.slice(1).map(lineage => new Set(lineage));
  return lineages[0].find(candidate =>
    otherSets.every(set => set.has(candidate))
  ) ?? null;
}

function medianWorldPosition(hierarchy, targets) {
  const result=[0,0,0];
  for (const id of targets) {
    const matrix=hierarchy.worldMatrixOf(id);
    result[0]+=matrix[12];
    result[1]+=matrix[13];
    result[2]+=matrix[14];
  }
  return result.map(value => value/targets.length);
}

function transformPoint(matrix, [x,y,z]) {
  return [
    matrix[0]*x+matrix[4]*y+matrix[8]*z+matrix[12],
    matrix[1]*x+matrix[5]*y+matrix[9]*z+matrix[13],
    matrix[2]*x+matrix[6]*y+matrix[10]*z+matrix[14]
  ];
}

function vector3(value, message) {
  if (!Array.isArray(value) || value.length !== 3) {
    throw new TypeError(message);
  }
  const result=value.map(Number);
  if (!result.every(Number.isFinite)) throw new TypeError(message);
  return result;
}

function normalizeId(value, code) {
  const id=String(value ?? "").trim();
  if (!id) throw new HierarchyError(code,"Identificador inválido.");
  return id;
}
