import * as THREE from "three";

/**
 * Derived renderer-only index for compact instance-graph replicas.
 *
 * It never owns semantic state.  It remembers the root->render-member relation
 * and canonical world matrices so moving/previewing a referenced assembly does
 * not need to traverse its definition or scan the scene.
 */
export class ReplicaRenderIndex {
  static apiVersion = "replica-render-index-v1";

  #roots = new Map();
  #memberToRoot = new Map();
  #diagnostics = {
    registrations: 0,
    unregisters: 0,
    rootMatrixChanges: 0,
    memberMatrixChanges: 0,
    memberLookups: 0,
    definitionTraversals: 0,
    sceneScans: 0
  };

  register(object, worldMatrix) {
    const id = String(object?.id ?? "");
    if (!id) return { rootChanged: false, rootId: null };
    const rootId = String(object?.instanceRootId ?? id);
    const isReplica = object?.projectedInstance === true || rootId !== id;
    if (!isReplica) {
      this.unregister(id);
      return { rootChanged: false, rootId: null };
    }

    let root = this.#roots.get(rootId);
    if (!root) {
      root = {
        rootId,
        definitionId: String(object?.definitionId ?? ""),
        worldMatrix: null,
        members: new Map()
      };
      this.#roots.set(rootId, root);
    }

    const matrix = normalizedMatrix(worldMatrix);
    let rootChanged = false;
    if (id === rootId) {
      if (root.worldMatrix && !matrixNear(root.worldMatrix, matrix)) {
        rootChanged = true;
      } else if (!root.worldMatrix) {
        root.worldMatrix = matrix;
      }
      if (object?.definitionId) root.definitionId = String(object.definitionId);
    } else {
      const previousRoot = this.#memberToRoot.get(id);
      if (previousRoot && previousRoot !== rootId) {
        this.#roots.get(previousRoot)?.members.delete(id);
      }
      const previous = root.members.get(id);
      if (!previous || !matrixNear(previous.worldMatrix, matrix)) {
        this.#diagnostics.memberMatrixChanges += 1;
      }
      root.members.set(id, {
        id,
        path: Object.freeze([...(object?.instancePath ?? [])].map(String)),
        definitionId: String(object?.definitionId ?? ""),
        worldMatrix: matrix
      });
      this.#memberToRoot.set(id, rootId);
    }
    this.#diagnostics.registrations += 1;
    return { rootChanged, rootId };
  }

  unregister(idValue) {
    const id = String(idValue ?? "");
    if (!id) return false;
    if (this.#roots.has(id)) {
      const root = this.#roots.get(id);
      for (const memberId of root.members.keys()) this.#memberToRoot.delete(memberId);
      this.#roots.delete(id);
      this.#diagnostics.unregisters += 1;
      return true;
    }
    const rootId = this.#memberToRoot.get(id);
    if (!rootId) return false;
    this.#memberToRoot.delete(id);
    this.#roots.get(rootId)?.members.delete(id);
    this.#diagnostics.unregisters += 1;
    return true;
  }

  members(rootIdValue, { includeRoot = false } = {}) {
    const rootId = String(rootIdValue ?? "");
    const root = this.#roots.get(rootId);
    this.#diagnostics.memberLookups += 1;
    if (!root) return Object.freeze(includeRoot && rootId ? [rootId] : []);
    const values = [...root.members.keys()];
    return Object.freeze(includeRoot ? [rootId, ...values] : values);
  }

  /**
   * Applies a new root world matrix to cached descendant matrices via one
   * constant delta.  This is O(render members), but performs zero semantic
   * hierarchy/definition traversal.
   */
  rebaseRoot(rootIdValue, nextRootWorldMatrix) {
    const rootId = String(rootIdValue ?? "");
    const root = this.#roots.get(rootId);
    const next = normalizedMatrix(nextRootWorldMatrix);
    if (!root?.worldMatrix) {
      if (root) root.worldMatrix = next;
      return Object.freeze([]);
    }
    if (matrixNear(root.worldMatrix, next)) return Object.freeze([]);

    const previous = new THREE.Matrix4().fromArray(root.worldMatrix);
    const current = new THREE.Matrix4().fromArray(next);
    const delta = current.clone().multiply(previous.clone().invert());
    const changes = [];
    for (const member of root.members.values()) {
      const world = delta
        .clone()
        .multiply(new THREE.Matrix4().fromArray(member.worldMatrix))
        .toArray();
      member.worldMatrix = Object.freeze([...world]);
      changes.push(Object.freeze({ id: member.id, worldMatrix: member.worldMatrix }));
    }
    root.worldMatrix = next;
    this.#diagnostics.rootMatrixChanges += 1;
    this.#diagnostics.memberMatrixChanges += changes.length;
    return Object.freeze(changes);
  }

  rootOf(memberIdValue) {
    const id = String(memberIdValue ?? "");
    return this.#memberToRoot.get(id) ?? (this.#roots.has(id) ? id : null);
  }

  clear() {
    this.#roots.clear();
    this.#memberToRoot.clear();
  }

  status() {
    return Object.freeze({
      version: ReplicaRenderIndex.apiVersion,
      replicaRootCount: this.#roots.size,
      renderMemberCount: [...this.#roots.values()].reduce(
        (sum, root) => sum + root.members.size,
        0
      ),
      diagnostics: Object.freeze({ ...this.#diagnostics })
    });
  }
}

function normalizedMatrix(value) {
  if (!Array.isArray(value) || value.length !== 16 || !value.every(Number.isFinite)) {
    throw new TypeError("ReplicaRenderIndex exige matriz 4x4 finita.");
  }
  return Object.freeze(value.map(Number));
}

function matrixNear(a, b, epsilon = 1e-10) {
  if (!a || !b || a.length !== 16 || b.length !== 16) return false;
  for (let index = 0; index < 16; index += 1) {
    if (Math.abs(Number(a[index]) - Number(b[index])) > epsilon) return false;
  }
  return true;
}
