import {
  composeTransform,
  identityMatrix,
  multiplyMatrices
} from "../../math-affine/src/index.js";

export class HierarchyError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "HierarchyError";
    this.code = code;
    this.details = Object.freeze({ ...details });
  }
}

export class HierarchyIndex {
  #nodes = new Map();
  #parents = new Map();
  #children = new Map();
  #roots = [];
  #worldMatrices = new Map();

  constructor(nodes = []) {
    for (const node of nodes) {
      const id=requiredId(node?.id,"Identificador de nó ausente.");
      if (this.#nodes.has(id)) {
        throw new HierarchyError(
          "DUPLICATE_NODE_ID",
          `Identificador de nó duplicado: ${id}.`,
          { id }
        );
      }
      this.#nodes.set(id,node);
      this.#children.set(id,[]);
    }

    for (const [id,node] of this.#nodes) {
      const parentId=optionalId(node.parentId);
      if (parentId !== null && !this.#nodes.has(parentId)) {
        throw new HierarchyError(
          "UNKNOWN_PARENT",
          `Pai inexistente para ${id}: ${parentId}.`,
          { id, parentId }
        );
      }
      if (parentId === id) {
        throw new HierarchyError(
          "HIERARCHY_CYCLE",
          `Nó não pode ser seu próprio pai: ${id}.`,
          { cycle: Object.freeze([id]) }
        );
      }
      this.#parents.set(id,parentId);
      if (parentId === null) this.#roots.push(id);
      else this.#children.get(parentId).push(id);
    }

    validateAcyclic(this.#parents);
    Object.freeze(this.#roots);
    for (const children of this.#children.values()) Object.freeze(children);
  }

  get size() { return this.#nodes.size; }

  has(id) { return this.#nodes.has(id); }

  node(id) {
    this.#assertKnown(id);
    return this.#nodes.get(id);
  }

  parentOf(id) {
    this.#assertKnown(id);
    return this.#parents.get(id);
  }

  childrenOf(id) {
    this.#assertKnown(id);
    return this.#children.get(id);
  }

  roots() { return this.#roots; }

  ancestorsOf(id) {
    this.#assertKnown(id);
    const ancestors=[];
    let cursor=this.#parents.get(id);
    while (cursor !== null) {
      ancestors.push(cursor);
      cursor=this.#parents.get(cursor);
    }
    return Object.freeze(ancestors);
  }

  descendantsOf(id) {
    this.#assertKnown(id);
    const descendants=[];
    const stack=[...this.#children.get(id)].reverse();
    while (stack.length) {
      const current=stack.pop();
      descendants.push(current);
      const children=this.#children.get(current);
      for (let index=children.length-1; index>=0; index-=1) {
        stack.push(children[index]);
      }
    }
    return Object.freeze(descendants);
  }

  canonicalizeSelection(ids = []) {
    const selected=[];
    const selectedSet=new Set();
    for (const id of ids) {
      this.#assertKnown(id);
      if (!selectedSet.has(id)) {
        selected.push(id);
        selectedSet.add(id);
      }
    }

    return Object.freeze(selected.filter(id => {
      let parent=this.#parents.get(id);
      while (parent !== null) {
        if (selectedSet.has(parent)) return false;
        parent=this.#parents.get(parent);
      }
      return true;
    }));
  }

  assertCanReparent(id, parentId) {
    this.#assertKnown(id);
    if (parentId === null || parentId === undefined || parentId === "") {
      return true;
    }
    this.#assertKnown(parentId);
    let cursor=parentId;
    while (cursor !== null) {
      if (cursor === id) {
        throw new HierarchyError(
          "HIERARCHY_CYCLE",
          `Reparentamento de ${id} para ${parentId} criaria um ciclo.`,
          { id, parentId }
        );
      }
      cursor=this.#parents.get(cursor);
    }
    return true;
  }

  localMatrixOf(id) {
    const node=this.node(id);
    return composeTransform({
      position: node.position ?? [0,0,0],
      rotation: node.rotation ?? [0,0,0,1],
      scale: node.scale ?? [1,1,1]
    });
  }

  worldMatrixOf(id) {
    this.#assertKnown(id);
    if (this.#worldMatrices.has(id)) return this.#worldMatrices.get(id);

    const unresolved=[];
    let cursor=id;
    while (cursor !== null && !this.#worldMatrices.has(cursor)) {
      unresolved.push(cursor);
      cursor=this.#parents.get(cursor);
    }

    let world=cursor === null
      ? identityMatrix()
      : this.#worldMatrices.get(cursor);

    while (unresolved.length) {
      const current=unresolved.pop();
      world=Object.freeze(multiplyMatrices(world,this.localMatrixOf(current)));
      this.#worldMatrices.set(current,world);
    }
    return this.#worldMatrices.get(id);
  }

  #assertKnown(id) {
    if (!this.#nodes.has(id)) {
      throw new HierarchyError(
        "UNKNOWN_NODE",
        `Nó inexistente: ${id}.`,
        { id }
      );
    }
  }
}

function validateAcyclic(parents) {
  const completed=new Set();

  for (const start of parents.keys()) {
    if (completed.has(start)) continue;
    const path=[];
    const pathIndex=new Map();
    let cursor=start;

    while (cursor !== null && !completed.has(cursor)) {
      if (pathIndex.has(cursor)) {
        const cycle=path.slice(pathIndex.get(cursor));
        throw new HierarchyError(
          "HIERARCHY_CYCLE",
          `Ciclo hierárquico detectado: ${cycle.join(" -> ")}.`,
          { cycle: Object.freeze(cycle) }
        );
      }
      pathIndex.set(cursor,path.length);
      path.push(cursor);
      cursor=parents.get(cursor);
    }

    for (const id of path) completed.add(id);
  }
}

function requiredId(value, message) {
  const id=String(value ?? "").trim();
  if (!id) throw new HierarchyError("INVALID_NODE_ID",message);
  return id;
}

function optionalId(value) {
  if (value === null || value === undefined || value === "") return null;
  return requiredId(value,"Identificador de pai inválido.");
}
