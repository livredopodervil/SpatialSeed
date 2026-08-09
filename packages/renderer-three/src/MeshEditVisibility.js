import * as THREE from "three";

export class MeshEditVisibility {
  #batchManager;
  #heterogeneousBatchManager;
  #markBatchDirty;
  #hiddenReasons = new Map();
  #hiddenMatrix = new THREE.Matrix4().makeScale(0, 0, 0);
  #lastStatusByOwner = new Map();

  constructor({
    batchManager,
    heterogeneousBatchManager = null,
    markBatchDirty = null
  } = {}) {
    if (!batchManager?.resourcesForOwner || !batchManager?.update) {
      throw new TypeError("MeshEditVisibility exige InstanceBatchManager.");
    }
    this.#batchManager = batchManager;
    this.#heterogeneousBatchManager = heterogeneousBatchManager;
    this.#markBatchDirty = typeof markBatchDirty === "function"
      ? markBatchDirty
      : () => {};
  }

  isHidden(ownerId) {
    return Boolean(this.#hiddenReasons.get(String(ownerId))?.size);
  }

  effectiveMatrix(ownerId, matrix) {
    return this.isHidden(ownerId) ? this.#hiddenMatrix : matrix;
  }


  writeOwnerMatrix(ownerId, matrix) {
    const id = String(ownerId ?? "").trim();
    if (!id) return 0;
    const target = this.effectiveMatrix(id, normalizeMatrix(matrix));
    let changed = 0;
    for (const resourceId of this.#batchManager.resourcesForOwner(id)) {
      const location = this.#batchManager.locationOf(resourceId);
      if (!this.#batchManager.update(resourceId, target)) continue;
      changed += 1;
      if (location?.batchKey) this.#markBatchDirty(location.batchKey);
    }
    for (const resourceId of
      this.#heterogeneousBatchManager?.resourcesForOwner?.(id) ?? []) {
      if (this.#heterogeneousBatchManager.update(resourceId, target)) {
        changed += 1;
      }
    }
    return changed;
  }

  setHidden(ownerId, hidden, canonicalMatrix = null, {
    reason = "mesh-edit"
  } = {}) {
    const id = String(ownerId ?? "").trim();
    if (!id) return Object.freeze({ changed: false, ownerId: id });
    const normalizedReason = String(reason ?? "mesh-edit").trim() || "mesh-edit";
    let reasons = this.#hiddenReasons.get(id);
    if (!reasons) this.#hiddenReasons.set(id, reasons = new Set());
    if (hidden) reasons.add(normalizedReason);
    else reasons.delete(normalizedReason);
    if (!reasons.size) this.#hiddenReasons.delete(id);

    const effectivelyHidden = this.isHidden(id);
    const target = effectivelyHidden
      ? this.#hiddenMatrix
      : normalizeMatrix(canonicalMatrix);
    const standardResources = this.#batchManager.resourcesForOwner(id);
    let standardWrites = 0;
    const batchKeys = new Set();
    for (const resourceId of standardResources) {
      const location = this.#batchManager.locationOf(resourceId);
      if (!this.#batchManager.update(resourceId, target)) continue;
      standardWrites += 1;
      if (location?.batchKey) {
        batchKeys.add(location.batchKey);
        this.#markBatchDirty(location.batchKey);
      }
    }

    let heterogeneousWrites = 0;
    for (const resourceId of
      this.#heterogeneousBatchManager?.resourcesForOwner?.(id) ?? []) {
      if (this.#heterogeneousBatchManager.update(resourceId, target)) {
        heterogeneousWrites += 1;
      }
    }

    const status = Object.freeze({
      ownerId: id,
      hidden: effectivelyHidden,
      reasons: Object.freeze([...(this.#hiddenReasons.get(id) ?? [])]),
      standardResourceCount: standardResources.length,
      standardWrites,
      heterogeneousWrites,
      batchKeys: Object.freeze([...batchKeys])
    });
    this.#lastStatusByOwner.set(id, status);
    return Object.freeze({
      ...status,
      changed: standardWrites + heterogeneousWrites > 0
    });
  }

  remove(ownerId) {
    const id = String(ownerId ?? "");
    this.#hiddenReasons.delete(id);
    this.#lastStatusByOwner.delete(id);
  }

  status(ownerId) {
    const id = String(ownerId ?? "");
    return this.#lastStatusByOwner.get(id) ?? Object.freeze({
      ownerId: id,
      hidden: this.isHidden(id),
      reasons: Object.freeze([...(this.#hiddenReasons.get(id) ?? [])]),
      standardResourceCount:
        this.#batchManager.resourcesForOwner(id).length,
      standardWrites: 0,
      heterogeneousWrites: 0,
      batchKeys: Object.freeze([])
    });
  }
}

function normalizeMatrix(value) {
  if (value?.isMatrix4) return value;
  if (Array.isArray(value) && value.length === 16) {
    return new THREE.Matrix4().fromArray(value);
  }
  throw new TypeError("A matriz canônica da visibilidade é inválida.");
}
