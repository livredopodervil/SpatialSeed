import {
  composeTransform,
  decomposeTransformStrict,
  identityMatrix,
  invertAffineMatrix,
  multiplyMatrices
} from "../../math-affine/src/index.js";

export const TRANSFORM_HIERARCHY_KERNEL_VERSION = "transform-hierarchy-kernel-v1";

export class TransformHierarchyKernel {
  #nodes = new Map();
  #parents = new Map();
  #children = new Map();
  #worldCache = new Map();
  #worldRevision = 0;
  #scope;

  constructor(nodes = [], { scope = null } = {}) {
    if (!Array.isArray(nodes)) throw new TypeError("TransformHierarchyKernel exige array de nós.");
    this.#scope = scope;
    for (const node of nodes) {
      const id = requiredId(node?.id, "Nó sem id.");
      if (this.#nodes.has(id)) throw new Error(`Nó duplicado: ${id}.`);
      this.#nodes.set(id, node);
      this.#children.set(id, []);
    }
    for (const [id, node] of this.#nodes) {
      const parentId = optionalId(node.parentId);
      if (parentId !== null && !this.#nodes.has(parentId)) {
        throw new Error(`Pai inexistente para ${id}: ${parentId}.`);
      }
      this.#parents.set(id, parentId);
      if (parentId !== null) this.#children.get(parentId).push(id);
    }
    assertAcyclic(this.#parents);
  }

  has(id) { return this.#nodes.has(String(id)); }
  node(id) {
    const key = String(id);
    const node = this.#nodes.get(key);
    if (!node) throw new Error(`Nó inexistente: ${key}.`);
    return node;
  }
  parentOf(id) { this.node(id); return this.#parents.get(String(id)); }
  childrenOf(id) { this.node(id); return Object.freeze([...this.#children.get(String(id))]); }

  canonicalize(ids = []) {
    const selected = [];
    const set = new Set();
    for (const value of ids) {
      const id = String(value);
      this.node(id);
      if (!set.has(id)) { set.add(id); selected.push(id); }
    }
    return Object.freeze(selected.filter(id => {
      let parent = this.#parents.get(id);
      while (parent !== null) {
        if (set.has(parent)) return false;
        parent = this.#parents.get(parent);
      }
      return true;
    }));
  }

  localMatrixOf(id) {
    const node = this.node(id);
    return composeTransform({
      position: node.position ?? [0, 0, 0],
      rotation: node.rotation ?? [0, 0, 0, 1],
      scale: node.scale ?? [1, 1, 1]
    });
  }

  worldMatrixOf(id) {
    const key = String(id);
    this.node(key);
    const cached = this.#worldCache.get(key);
    if (cached) return cached.matrix;
    this.#scope?.count?.("pathSteps", 1);
    const parentId = this.#parents.get(key);
    const parentWorld = parentId === null ? identityMatrix() : this.worldMatrixOf(parentId);
    const matrix = Object.freeze(multiplyMatrices(parentWorld, this.localMatrixOf(key)));
    this.#worldCache.set(key, { matrix, revision: ++this.#worldRevision });
    this.#scope?.count?.("transformRecomputes", 1);
    return matrix;
  }

  worldPointOf(id, point = [0, 0, 0]) {
    return Object.freeze(transformPoint(this.worldMatrixOf(id), vector3(point)));
  }

  anchorLocalOf(id) {
    return Object.freeze(resolveAnchorLocal(this.node(id)));
  }

  pivotLocalOf(id) {
    const node = this.node(id);
    return Object.freeze(resolvePivotLocal(node, this.anchorLocalOf(id)));
  }

  worldAnchorOf(id) { return this.worldPointOf(id, this.anchorLocalOf(id)); }
  worldPivotOf(id) { return this.worldPointOf(id, this.pivotLocalOf(id)); }

  commonParentOf(ids = []) {
    const canonical = this.canonicalize(ids);
    if (!canonical.length) return null;
    const lineages = canonical.map(id => {
      const line = [];
      let cursor = this.#parents.get(id);
      while (cursor !== null) { line.push(cursor); cursor = this.#parents.get(cursor); }
      line.push(null);
      return line;
    });
    const sets = lineages.slice(1).map(line => new Set(line));
    return lineages[0].find(candidate => sets.every(set => set.has(candidate))) ?? null;
  }

  reparentLocalTransform(id, newParentId) {
    const world = this.worldMatrixOf(id);
    const parentWorld = newParentId == null ? identityMatrix() : this.worldMatrixOf(newParentId);
    this.#scope?.count?.("editTargetsVisited", 1);
    return decomposeTransformStrict(
      multiplyMatrices(invertAffineMatrix(parentWorld), world)
    );
  }

  selectionPivotWorld(ids = [], { policy = "auto", activeId = null, customWorld = null } = {}) {
    const canonical = this.canonicalize(ids);
    if (!canonical.length) return null;
    if (policy === "custom") return Object.freeze(vector3(customWorld));
    if (policy === "active") {
      const id = activeId && canonical.includes(String(activeId)) ? String(activeId) : canonical.at(-1);
      return this.worldPivotOf(id);
    }
    if (canonical.length === 1 || policy === "anchor") return this.worldPivotOf(canonical[0]);
    const sum = [0, 0, 0];
    for (const id of canonical) {
      const point = this.worldPivotOf(id);
      sum[0] += point[0]; sum[1] += point[1]; sum[2] += point[2];
    }
    return Object.freeze(sum.map(value => value / canonical.length));
  }
}

export function groupWithTransformKernel(nodes, {
  groupId,
  targetIds = [],
  name = null,
  anchorWorldPosition,
  pivot = null,
  scope = null
} = {}) {
  const kernel = new TransformHierarchyKernel(nodes, { scope });
  const id = requiredId(groupId, "Identificador de grupo ausente.");
  if (kernel.has(id)) throw new Error(`Identificador de grupo já existe: ${id}.`);
  const targets = kernel.canonicalize(targetIds);
  if (!targets.length) throw new Error("Agrupamento exige ao menos um alvo.");
  const parentId = kernel.commonParentOf(targets);
  const parentWorld = parentId === null ? identityMatrix() : kernel.worldMatrixOf(parentId);
  const anchorWorld = anchorWorldPosition === undefined
    ? medianPoints(targets.map(targetId => kernel.worldPivotOf(targetId)))
    : vector3(anchorWorldPosition);
  const anchorLocal = transformPoint(invertAffineMatrix(parentWorld), anchorWorld);
  const groupWorld = multiplyMatrices(parentWorld, composeTransform({ position: anchorLocal }));
  const inverseGroupWorld = invertAffineMatrix(groupWorld);
  const locals = new Map();
  for (const targetId of targets) {
    locals.set(targetId, decomposeTransformStrict(
      multiplyMatrices(inverseGroupWorld, kernel.worldMatrixOf(targetId))
    ));
    scope?.count?.("editTargetsVisited", 1);
  }
  const pivotLocal = pivot == null ? [0, 0, 0] : vector3(pivot);
  const group = Object.freeze({
    id,
    kind: "group",
    name: String(name ?? `Grupo ${id}`),
    ...(parentId === null ? {} : { parentId }),
    position: Object.freeze([...anchorLocal]),
    rotation: Object.freeze([0, 0, 0, 1]),
    scale: Object.freeze([1, 1, 1]),
    anchor: Object.freeze([0, 0, 0]),
    anchorPolicy: "explicit",
    pivot: Object.freeze([...pivotLocal]),
    pivotPolicy: "explicit"
  });
  const first = Math.min(...targets.map(targetId => nodes.findIndex(node => String(node.id) === targetId)));
  const next = [];
  for (let index = 0; index < nodes.length; index += 1) {
    if (index === first) next.push(group);
    const node = nodes[index];
    const local = locals.get(String(node.id));
    next.push(local ? Object.freeze({
      ...node,
      parentId: id,
      position: Object.freeze([...local.position]),
      rotation: Object.freeze([...local.rotation]),
      scale: Object.freeze([...local.scale])
    }) : node);
  }
  return Object.freeze({ nodes: Object.freeze(next), group, targetIds: targets });
}

export function ungroupWithTransformKernel(nodes, { groupIds = [], scope = null } = {}) {
  const kernel = new TransformHierarchyKernel(nodes, { scope });
  const groups = kernel.canonicalize(groupIds.map(String));
  const removed = new Set();
  const updates = new Map();
  const promotedIds = [];
  for (const groupId of groups) {
    const group = kernel.node(groupId);
    if (group.kind !== "group" && group.instanceKind !== "assembly") {
      throw new Error(`Nó não é um grupo: ${groupId}.`);
    }
    const parentId = kernel.parentOf(groupId);
    const parentWorld = parentId === null ? identityMatrix() : kernel.worldMatrixOf(parentId);
    const inverseParentWorld = invertAffineMatrix(parentWorld);
    for (const childId of kernel.childrenOf(groupId)) {
      const local = decomposeTransformStrict(
        multiplyMatrices(inverseParentWorld, kernel.worldMatrixOf(childId))
      );
      updates.set(childId, { parentId, local });
      promotedIds.push(childId);
      scope?.count?.("editTargetsVisited", 1);
    }
    removed.add(groupId);
  }
  const next = nodes.filter(node => !removed.has(String(node.id))).map(node => {
    const update = updates.get(String(node.id));
    if (!update) return node;
    const result = {
      ...node,
      position: Object.freeze([...update.local.position]),
      rotation: Object.freeze([...update.local.rotation]),
      scale: Object.freeze([...update.local.scale])
    };
    if (update.parentId == null) delete result.parentId;
    else result.parentId = update.parentId;
    return Object.freeze(result);
  });
  return Object.freeze({
    nodes: Object.freeze(next),
    groupIds: Object.freeze([...groups]),
    promotedIds: Object.freeze(promotedIds)
  });
}

export function resolveAnchorLocal(node) {
  const explicit = node?.anchor?.local ?? node?.anchor ?? node?.selectionAnchorLocal;
  if (Array.isArray(explicit) && explicit.length === 3) return vector3(explicit);
  return [0, 0, 0];
}

export function resolvePivotLocal(node, anchor = resolveAnchorLocal(node)) {
  if (Array.isArray(node?.pivot) && node.pivot.length === 3) return vector3(node.pivot);
  return [...anchor];
}

export function transformPoint(matrix, point) {
  const [x, y, z] = vector3(point);
  return [
    matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12],
    matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13],
    matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14]
  ];
}

function medianPoints(points) {
  const sum = [0, 0, 0];
  for (const point of points) {
    sum[0] += point[0]; sum[1] += point[1]; sum[2] += point[2];
  }
  return sum.map(value => value / points.length);
}

function requiredId(value, message) {
  const id = String(value ?? "").trim();
  if (!id) throw new TypeError(message);
  return id;
}
function optionalId(value) {
  if (value === null || value === undefined || value === "") return null;
  return requiredId(value, "Identificador de pai inválido.");
}
function vector3(value) {
  if (!Array.isArray(value) || value.length !== 3) throw new TypeError("Vetor 3D inválido.");
  const result = value.map(Number);
  if (!result.every(Number.isFinite)) throw new TypeError("Vetor 3D inválido.");
  return result;
}
function assertAcyclic(parents) {
  for (const start of parents.keys()) {
    const seen = new Set();
    let cursor = start;
    while (cursor !== null) {
      if (seen.has(cursor)) throw new Error(`Ciclo hierárquico detectado em ${cursor}.`);
      seen.add(cursor);
      cursor = parents.get(cursor) ?? null;
    }
  }
}
