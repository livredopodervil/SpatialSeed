import { InstanceBatch } from "./InstanceBatch.js";

export class InstanceBatchManager {
  #batches = new Map();
  #objectLocations = new Map();

  constructor({ createBatch } = {}) {
    this.createBatch = createBatch ?? (descriptor => new InstanceBatch(descriptor));
  }

  get batchCount() { return this.#batches.size; }
  hasObject(objectId) { return this.#objectLocations.has(String(objectId)); }
  locationOf(objectId) { const v = this.#objectLocations.get(String(objectId)); return v ? { ...v } : null; }
  getBatch(key) { return this.#batches.get(String(key)) ?? null; }

  ensureBatch(descriptor) {
    const key = String(descriptor.key);
    let batch = this.#batches.get(key);
    if (!batch) {
      batch = this.createBatch({ ...descriptor, key });
      this.#batches.set(key, batch);
    }
    return batch;
  }

  add({ objectId, batchKey, matrix, attributes = {}, descriptor }) {
    const id = String(objectId);
    if (this.#objectLocations.has(id)) throw new Error(`Objeto já registrado: ${id}`);
    const batch = this.ensureBatch({ ...descriptor, key: batchKey });
    const instanceIndex = batch.add(id, matrix, attributes);
    this.#objectLocations.set(id, { batchKey: String(batchKey), instanceIndex });
    return { batch, instanceIndex };
  }

  update(objectId, matrix) {
    const id = String(objectId);
    const location = this.#objectLocations.get(id);
    if (!location) return false;
    return Boolean(this.#batches.get(location.batchKey)?.update(id, matrix));
  }

  updateAttributes(objectId, attributes = {}) {
    const id = String(objectId);
    const location = this.#objectLocations.get(id);
    if (!location) return false;

    return Boolean(
      this.#batches
        .get(location.batchKey)
        ?.updateAttributes(id, attributes)
    );
  }

  remove(objectId) {
    const id = String(objectId);
    const location = this.#objectLocations.get(id);
    if (!location) return { removed: false };
    const result = this.#batches.get(location.batchKey)?.remove(id) ?? { removed: false };
    this.#objectLocations.delete(id);
    return { ...result, batchKey: location.batchKey };
  }

  objectFromHit(hit) {
    if (!hit?.object?.isInstancedMesh || !Number.isInteger(hit.instanceId)) return null;
    const batch = this.#batches.get(String(hit.object.userData.batchKey));
    return batch?.objectAt(hit.instanceId) ?? null;
  }

  deleteBatch(key, options = {}) {
    const normalized = String(key);
    const batch = this.#batches.get(normalized);
    if (!batch) return false;
    if (batch.size > 0 && !options.force) return false;
    batch.dispose(options);
    this.#batches.delete(normalized);
    return true;
  }

  batches() {
    return [...this.#batches.values()];
  }

  stats() {
    return Object.freeze({ batches: this.#batches.size, objects: this.#objectLocations.size, byBatch: [...this.#batches.values()].map(batch => batch.stats()) });
  }

  clear(options = {}) {
    for (const batch of this.#batches.values()) batch.dispose(options);
    this.#batches.clear();
    this.#objectLocations.clear();
  }
}
