export const FAST_TRANSFORM_OVERLAY_VERSION = "fast-transform-overlay-v1";

/**
 * Render-only transform cache.  It is intentionally unaware of ProjectModel,
 * undo, properties and serialization.  A tool/animation writes matrices here;
 * commit is a separate semantic operation.
 */
export class FastTransformOverlay {
  #entries = new Map();
  #owners = new Map();
  #stats = {
    begins: 0,
    writes: 0,
    noops: 0,
    clears: 0,
    logicalWrites: 0
  };

  begin(owner, values = []) {
    const key = String(owner ?? "");
    if (!key) throw new TypeError("Overlay exige owner.");
    this.clearOwner(key);
    const ids = new Set();
    for (const value of values) {
      const id = String(value?.id ?? "");
      const matrix = normalizedMatrix(value?.worldMatrix);
      if (!id || !matrix) continue;
      this.#entries.set(id, Object.freeze({ owner: key, worldMatrix: matrix }));
      ids.add(id);
    }
    this.#owners.set(key, ids);
    this.#stats.begins += 1;
  }

  setWorldMatrix(owner, id, worldMatrix) {
    const ownerId = String(owner ?? "");
    const objectId = String(id ?? "");
    const matrix = normalizedMatrix(worldMatrix);
    if (!ownerId || !objectId || !matrix) return false;
    const previous = this.#entries.get(objectId);
    if (previous?.owner === ownerId && matricesEqual(previous.worldMatrix, matrix)) {
      this.#stats.noops += 1;
      return false;
    }
    this.#entries.set(objectId, Object.freeze({ owner: ownerId, worldMatrix: matrix }));
    let ids = this.#owners.get(ownerId);
    if (!ids) { ids = new Set(); this.#owners.set(ownerId, ids); }
    ids.add(objectId);
    this.#stats.writes += 1;
    return true;
  }

  worldMatrix(id) { return this.#entries.get(String(id))?.worldMatrix ?? null; }
  has(id) { return this.#entries.has(String(id)); }

  clearOwner(owner) {
    const key = String(owner ?? "");
    const ids = this.#owners.get(key);
    if (!ids) return 0;
    let count = 0;
    for (const id of ids) {
      if (this.#entries.get(id)?.owner !== key) continue;
      this.#entries.delete(id); count += 1;
    }
    this.#owners.delete(key);
    if (count) this.#stats.clears += 1;
    return count;
  }

  clear() { for (const owner of [...this.#owners.keys()]) this.clearOwner(owner); }
  status() {
    return Object.freeze({
      version: FAST_TRANSFORM_OVERLAY_VERSION,
      entryCount: this.#entries.size,
      ownerCount: this.#owners.size,
      statistics: Object.freeze({ ...this.#stats })
    });
  }
}
function normalizedMatrix(value) {
  if (!Array.isArray(value) || value.length !== 16) return null;
  const result = value.map(Number);
  return result.every(Number.isFinite) ? Object.freeze(result) : null;
}
function matricesEqual(a, b, epsilon = 1e-12) {
  for (let i = 0; i < 16; i += 1) if (Math.abs(a[i] - b[i]) > epsilon) return false;
  return true;
}
