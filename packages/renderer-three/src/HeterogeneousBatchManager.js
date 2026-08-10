import * as THREE from "three";

export class HeterogeneousBatchManager {
  static apiVersion = "heterogeneous-batch-manager-v1";

  constructor({
    maximumInstances = 256,
    maximumVertices = 1048576,
    maximumIndices = 3145728,
    onBatchCreated = null,
    onBatchDeleted = null
  } = {}) {
    const prototype = THREE.BatchedMesh?.prototype;
    this.supported = typeof THREE.BatchedMesh === "function" &&
      typeof prototype?.addGeometry === "function" &&
      typeof prototype?.addInstance === "function" &&
      typeof prototype?.setMatrixAt === "function" &&
      typeof prototype?.getMatrixAt === "function" &&
      typeof prototype?.setColorAt === "function" &&
      typeof prototype?.deleteInstance === "function" &&
      typeof prototype?.deleteGeometry === "function";
    this.maximumInstances = positiveInteger(maximumInstances, "maximumInstances");
    this.maximumVertices = positiveInteger(maximumVertices, "maximumVertices");
    this.maximumIndices = positiveInteger(maximumIndices, "maximumIndices");
    this.onBatchCreated = typeof onBatchCreated === "function"
      ? onBatchCreated
      : null;
    this.onBatchDeleted = typeof onBatchDeleted === "function"
      ? onBatchDeleted
      : null;
    this.batchesByKey = new Map();
    this.locations = new Map();
    this.resourceMetadata = new Map();
    this.resourceGeometry = new Map();
    this.ownerResources = new Map();
    this.shards = new Map();
    this.diagnostics = {
      batchesCreated: 0,
      resourcesAdded: 0,
      resourcesRemoved: 0,
      matrixWrites: 0,
      colorWrites: 0,
      fallbacks: 0,
      geometryVertices: 0,
      geometryIndices: 0
    };
  }

  has(objectId) {
    const id = String(objectId);
    return this.locations.has(id) || Boolean(this.ownerResources.get(id)?.size);
  }

  locationOf(objectId) {
    const id = String(objectId);
    let location = this.locations.get(id);
    if (!location) {
      const resourceId = this.ownerResources.get(id)?.values?.().next?.().value;
      if (resourceId) location = this.locations.get(resourceId);
    }
    return location ? Object.freeze({ ...location }) : null;
  }

  getBatch(batchKey) {
    return this.batchesByKey.get(String(batchKey)) ?? null;
  }

  geometryOf(resourceId) {
    return this.resourceGeometry.get(String(resourceId)) ?? null;
  }

  add({
    objectId,
    resourceId = objectId,
    ownerId = objectId,
    metadata = null,
    batchBaseKey,
    geometry,
    matrix,
    color = null,
    materialFactory
  } = {}) {
    if (!this.supported) {
      this.diagnostics.fallbacks += 1;
      return Object.freeze({ added: false, reason: "batched-mesh-unavailable" });
    }
    const id = String(resourceId ?? "").trim();
    const owner = String(ownerId ?? objectId ?? "").trim();
    if (!id) throw new TypeError("Batch heterogêneo exige resourceId.");
    if (!owner) throw new TypeError("Batch heterogêneo exige ownerId.");
    if (this.locations.has(id)) throw new Error(`Recurso já registrado: ${id}.`);
    if (!geometry?.getAttribute) {
      throw new TypeError("Batch heterogêneo exige BufferGeometry.");
    }
    if (typeof materialFactory !== "function") {
      throw new TypeError("Batch heterogêneo exige materialFactory.");
    }
    const counts = geometryCounts(geometry);
    if (counts.vertices > this.maximumVertices ||
        counts.indices > this.maximumIndices) {
      this.diagnostics.fallbacks += 1;
      return Object.freeze({ added: false, reason: "geometry-oversized", counts });
    }

    const baseKey = String(batchBaseKey);
    let shard = this.shards.get(baseKey) ?? 0;
    let batch = null;
    let key = null;
    while (true) {
      key = `${baseKey}#${shard}`;
      batch = this.batchesByKey.get(key) ?? null;
      if (!batch || batchCanFit(batch, counts)) break;
      shard += 1;
    }
    this.shards.set(baseKey, shard);
    let createdBatch = false;
    if (!batch) {
      const materialResource = materialFactory();
      if (!materialResource?.material) {
        throw new TypeError("materialFactory não retornou material.");
      }
      const mesh = new THREE.BatchedMesh(
        this.maximumInstances,
        this.maximumVertices,
        this.maximumIndices,
        materialResource.material
      );
      mesh.name = `heterogeneous-batch-${key}`;
      mesh.userData.heterogeneousBatchKey = key;
      batch = {
        key,
        baseKey,
        mesh,
        materialKey: materialResource.materialKey ?? null,
        size: 0,
        vertices: 0,
        indices: 0,
        maximumInstances: this.maximumInstances,
        maximumVertices: this.maximumVertices,
        maximumIndices: this.maximumIndices,
        instances: new Map(),
        objectByInstance: new Map()
      };
      this.batchesByKey.set(key, batch);
      createdBatch = true;
      this.onBatchCreated?.(batch);
      this.diagnostics.batchesCreated += 1;
    }

    let geometryId;
    let instanceId;
    try {
      geometryId = batch.mesh.addGeometry(geometry);
      instanceId = batch.mesh.addInstance(geometryId);
      batch.mesh.setMatrixAt(instanceId, normalizeMatrix(matrix));
      if (color !== null && typeof batch.mesh.setColorAt === "function") {
        batch.mesh.setColorAt(instanceId, normalizeColor(color));
      }
    } catch (error) {
      if (instanceId !== undefined) batch.mesh.deleteInstance?.(instanceId);
      if (geometryId !== undefined) batch.mesh.deleteGeometry?.(geometryId);
      if (createdBatch && batch.size === 0) this.#deleteBatch(batch.key);
      throw error;
    }

    const location = {
      batchKey: key,
      geometryId,
      instanceId,
      vertices: counts.vertices,
      indices: counts.indices
    };
    batch.instances.set(id, location);
    batch.objectByInstance.set(instanceId, id);
    batch.size += 1;
    batch.vertices += counts.vertices;
    batch.indices += counts.indices;
    this.locations.set(id, location);
    this.resourceGeometry.set(id, geometry);
    this.resourceMetadata.set(id, Object.freeze({
      ownerId: owner,
      metadata
    }));
    let ownerSet = this.ownerResources.get(owner);
    if (!ownerSet) {
      ownerSet = new Set();
      this.ownerResources.set(owner, ownerSet);
    }
    ownerSet.add(id);
    this.diagnostics.resourcesAdded += 1;
    this.diagnostics.geometryVertices += counts.vertices;
    this.diagnostics.geometryIndices += counts.indices;
    return Object.freeze({ added: true, batch, location: Object.freeze({ ...location }) });
  }

  update(objectId, matrix) {
    const id = String(objectId);
    const location = this.locations.get(id);
    const batch = location ? this.batchesByKey.get(location.batchKey) : null;
    if (!batch) return false;
    batch.mesh.setMatrixAt(location.instanceId, normalizeMatrix(matrix));
    this.diagnostics.matrixWrites += 1;
    return true;
  }

  updateColor(objectId, color) {
    const id = String(objectId);
    const location = this.locations.get(id);
    const batch = location ? this.batchesByKey.get(location.batchKey) : null;
    if (!batch || typeof batch.mesh.setColorAt !== "function") return false;
    batch.mesh.setColorAt(location.instanceId, normalizeColor(color));
    this.diagnostics.colorWrites += 1;
    return true;
  }

  remove(objectId) {
    const id = String(objectId);
    const location = this.locations.get(id);
    if (!location) return Object.freeze({ removed: false });
    const batch = this.batchesByKey.get(location.batchKey);
    this.locations.delete(id);
    this.resourceGeometry.delete(id);
    const metadata = this.resourceMetadata.get(id);
    this.resourceMetadata.delete(id);
    if (metadata?.ownerId) {
      const resources = this.ownerResources.get(metadata.ownerId);
      resources?.delete(id);
      if (resources && !resources.size) this.ownerResources.delete(metadata.ownerId);
    }
    if (!batch) return Object.freeze({ removed: false });
    // Cada recurso possui uma geometria e uma instância próprias no lote.
    // Remova primeiro a instância para não depender de efeitos colaterais
    // específicos da versão de Three.js usada pelo viewer.
    batch.mesh.deleteInstance(location.instanceId);
    batch.mesh.deleteGeometry(location.geometryId);
    batch.instances.delete(id);
    batch.objectByInstance.delete(location.instanceId);
    batch.size -= 1;
    batch.vertices -= location.vertices;
    batch.indices -= location.indices;
    this.diagnostics.resourcesRemoved += 1;
    if (batch.size === 0) this.#deleteBatch(batch.key);
    return Object.freeze({ removed: true, batchKey: batch.key });
  }

  referenceFromHit(hit) {
    if (!hit?.object) return null;
    const instanceId = Number.isInteger(hit.batchId)
      ? hit.batchId
      : Number.isInteger(hit.instanceId)
        ? hit.instanceId
        : null;
    if (instanceId === null) return null;
    const key = String(hit.object.userData?.heterogeneousBatchKey ?? "");
    const resourceId = this.batchesByKey.get(key)?.objectByInstance
      .get(instanceId) ?? null;
    if (!resourceId) return null;
    const metadata = this.resourceMetadata.get(resourceId);
    return Object.freeze({
      resourceId,
      ownerId: String(metadata?.ownerId ?? resourceId),
      batchKey: key,
      instanceId,
      ...(metadata?.metadata ? { metadata: metadata.metadata } : {})
    });
  }

  objectFromHit(hit) {
    return this.referenceFromHit(hit)?.ownerId ?? null;
  }

  resourcesForOwner(ownerId) {
    return Object.freeze([...(this.ownerResources.get(String(ownerId)) ?? [])]);
  }

  removeOwner(ownerId) {
    const id = String(ownerId);
    const resources = [...(this.ownerResources.get(id) ?? [])];
    const results = resources.map(resourceId => this.remove(resourceId));
    return Object.freeze({
      ownerId: id,
      removed: results.filter(result => result.removed).length,
      results: Object.freeze(results)
    });
  }

  updateOwner(ownerId, matrix) {
    let changed = 0;
    for (const resourceId of this.resourcesForOwner(ownerId)) {
      if (this.update(resourceId, matrix)) changed += 1;
    }
    return changed;
  }

  updateOwnerColor(ownerId, color) {
    let changed = 0;
    for (const resourceId of this.resourcesForOwner(ownerId)) {
      if (this.updateColor(resourceId, color)) changed += 1;
    }
    return changed;
  }

  batches() {
    return [...this.batchesByKey.values()];
  }

  status() {
    return Object.freeze({
      supported: this.supported,
      batches: this.batchesByKey.size,
      resources: this.locations.size,
      owners: this.ownerResources.size,
      diagnostics: Object.freeze({ ...this.diagnostics }),
      byBatch: Object.freeze(this.batches().map(batch => Object.freeze({
        key: batch.key,
        size: batch.size,
        vertices: batch.vertices,
        indices: batch.indices
      })))
    });
  }

  clear() {
    for (const resourceId of [...this.locations.keys()]) {
      this.remove(resourceId);
    }
    for (const key of [...this.batchesByKey.keys()]) this.#deleteBatch(key);
    this.locations.clear();
    this.resourceMetadata.clear();
    this.ownerResources.clear();
    this.shards.clear();
  }

  #deleteBatch(key) {
    const batch = this.batchesByKey.get(String(key));
    if (!batch) return false;
    this.onBatchDeleted?.(batch);
    batch.mesh.dispose?.();
    this.batchesByKey.delete(String(key));
    return true;
  }
}

function batchCanFit(batch, counts) {
  return batch.size < batch.maximumInstances &&
    batch.vertices + counts.vertices <= batch.maximumVertices &&
    batch.indices + counts.indices <= batch.maximumIndices;
}

function geometryCounts(geometry) {
  const vertices = Number(geometry.getAttribute("position")?.count ?? 0);
  const indices = Number(geometry.index?.count ?? 0);
  if (!Number.isInteger(vertices) || vertices < 1) {
    throw new RangeError("Geometria sem vértices para batching heterogêneo.");
  }
  return Object.freeze({ vertices, indices });
}

function normalizeMatrix(value) {
  if (value?.isMatrix4) return value;
  if (Array.isArray(value) && value.length === 16) {
    return new THREE.Matrix4().fromArray(value);
  }
  throw new TypeError("Matriz heterogênea inválida.");
}

function normalizeColor(value) {
  return value?.isColor ? value : new THREE.Color(value ?? 0xffffff);
}

function positiveInteger(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) {
    throw new RangeError(`${label} deve ser inteiro positivo.`);
  }
  return number;
}
