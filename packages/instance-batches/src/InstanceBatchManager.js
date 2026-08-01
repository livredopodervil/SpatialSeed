import { InstanceBatch } from "./InstanceBatch.js";

export class InstanceBatchManager {
  #batches = new Map();
  #objectLocations = new Map();
  #resourceMetadata = new Map();
  #ownerResources = new Map();
  #baseBatchShards = new Map();

  constructor({ createBatch } = {}) {
    this.createBatch = createBatch ?? (descriptor => new InstanceBatch(descriptor));
  }

  get batchCount() { return this.#batches.size; }
  get resourceCount() { return this.#objectLocations.size; }
  hasObject(objectId) {
    const id = String(objectId);
    return this.#objectLocations.has(id) || Boolean(this.#ownerResources.get(id)?.size);
  }
  locationOf(objectId) {
    const id = String(objectId);
    let resourceId = id;
    let value = this.#objectLocations.get(resourceId);
    if (!value) {
      resourceId = this.#ownerResources.get(id)?.values?.().next?.().value;
      if (resourceId) value = this.#objectLocations.get(resourceId);
    }
    return value ? { ...value, resourceId } : null;
  }
  metadataOf(resourceId) {
    const value = this.#resourceMetadata.get(String(resourceId));
    return value ? Object.freeze({ ...value }) : null;
  }
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

  add({
    objectId,
    resourceId = objectId,
    ownerId = objectId,
    memberId = null,
    batchKey,
    matrix,
    attributes = {},
    descriptor,
    metadata = null
  }) {
    const id = String(resourceId);
    if (this.#objectLocations.has(id)) {
      throw new Error(`Recurso já registrado: ${id}`);
    }
    const batch = this.ensureBatch({ ...descriptor, key: batchKey });
    const instanceIndex = batch.add(id, matrix, attributes);
    this.#registerLocation(id, {
      batchKey: String(batchKey),
      instanceIndex,
      ownerId: String(ownerId),
      memberId: memberId == null ? null : String(memberId),
      metadata
    });
    return { batch, instanceIndex, resourceId: id };
  }

  addSegmented({
    batchBaseKey,
    descriptor,
    ...entry
  }) {
    const baseKey = String(batchBaseKey);
    const capacity = Number(descriptor?.capacity ?? 64);
    let shard = this.#baseBatchShards.get(baseKey) ?? 0;
    let batchKey = `${baseKey}#${shard}`;
    let batch = this.#batches.get(batchKey);
    while (batch && batch.size >= batch.capacity) {
      shard += 1;
      batchKey = `${baseKey}#${shard}`;
      batch = this.#batches.get(batchKey);
    }
    this.#baseBatchShards.set(baseKey, shard);
    return this.add({
      ...entry,
      batchKey,
      descriptor: { ...descriptor, capacity }
    });
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
      this.#batches.get(location.batchKey)?.updateAttributes(id, attributes)
    );
  }

  updateOwner(ownerId, updater) {
    const resources = this.#ownerResources.get(String(ownerId));
    if (!resources?.size) return 0;
    let changed = 0;
    for (const resourceId of resources) {
      const location = this.locationOf(resourceId);
      const metadata = this.metadataOf(resourceId);
      const update = updater({ resourceId, location, metadata });
      if (!update) continue;
      if (update.matrix && this.update(resourceId, update.matrix)) changed += 1;
      if (update.attributes && this.updateAttributes(resourceId, update.attributes)) {
        changed += 1;
      }
    }
    return changed;
  }

  remove(objectId) {
    const id = String(objectId);
    const location = this.#objectLocations.get(id);
    if (!location) return { removed: false };
    const result = this.#batches.get(location.batchKey)?.remove(id) ?? {
      removed: false
    };
    this.#unregisterLocation(id, location);
    return { ...result, batchKey: location.batchKey };
  }

  removeOwner(ownerId) {
    const id = String(ownerId);
    const resources = [...(this.#ownerResources.get(id) ?? [])];
    const results = resources.map(resourceId => this.remove(resourceId));
    return Object.freeze({
      ownerId: id,
      removed: results.filter(result => result.removed).length,
      results: Object.freeze(results)
    });
  }

  resourcesForOwner(ownerId) {
    return Object.freeze([...(this.#ownerResources.get(String(ownerId)) ?? [])]);
  }

  referenceFromHit(hit) {
    if (!hit?.object?.isInstancedMesh || !Number.isInteger(hit.instanceId)) {
      return null;
    }
    const batch = this.#batches.get(String(hit.object.userData.batchKey));
    const resourceId = batch?.objectAt(hit.instanceId) ?? null;
    if (!resourceId) return null;
    const metadata = this.#resourceMetadata.get(String(resourceId));
    return Object.freeze({
      resourceId: String(resourceId),
      ownerId: String(metadata?.ownerId ?? resourceId),
      memberId: metadata?.memberId ?? null,
      batchKey: String(hit.object.userData.batchKey),
      instanceIndex: hit.instanceId,
      ...(metadata?.metadata ? { metadata: metadata.metadata } : {})
    });
  }

  objectFromHit(hit) {
    return this.referenceFromHit(hit)?.ownerId ?? null;
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
    return Object.freeze({
      batches: this.#batches.size,
      resources: this.#objectLocations.size,
      objects: this.#objectLocations.size,
      owners: this.#ownerResources.size,
      byBatch: [...this.#batches.values()].map(batch => batch.stats())
    });
  }

  clear(options = {}) {
    for (const batch of this.#batches.values()) batch.dispose(options);
    this.#batches.clear();
    this.#objectLocations.clear();
    this.#resourceMetadata.clear();
    this.#ownerResources.clear();
    this.#baseBatchShards.clear();
  }

  #registerLocation(resourceId, location) {
    this.#objectLocations.set(resourceId, {
      batchKey: location.batchKey,
      instanceIndex: location.instanceIndex
    });
    const ownerId = String(location.ownerId);
    const metadata = Object.freeze({
      ownerId,
      memberId: location.memberId,
      metadata: location.metadata
    });
    this.#resourceMetadata.set(resourceId, metadata);
    let resources = this.#ownerResources.get(ownerId);
    if (!resources) {
      resources = new Set();
      this.#ownerResources.set(ownerId, resources);
    }
    resources.add(resourceId);
  }

  #unregisterLocation(resourceId, location) {
    const metadata = this.#resourceMetadata.get(resourceId);
    this.#objectLocations.delete(resourceId);
    this.#resourceMetadata.delete(resourceId);
    const ownerId = metadata?.ownerId;
    if (ownerId) {
      const resources = this.#ownerResources.get(ownerId);
      resources?.delete(resourceId);
      if (resources && !resources.size) this.#ownerResources.delete(ownerId);
    }
  }
}
