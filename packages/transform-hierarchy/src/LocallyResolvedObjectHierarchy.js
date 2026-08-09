import {
  identityMatrix,
  invertAffineMatrix,
  multiplyMatrices
} from "../../math-affine/src/index.js";

export const LOCALLY_RESOLVED_OBJECT_HIERARCHY_VERSION =
  "locally-resolved-object-hierarchy-v1";

/**
 * Derived, renderer-independent view of one object hierarchy.
 *
 * The canonical layer owns complete objects and world matrices. More ephemeral
 * layers only store the values they override. A missing value is resolved from
 * the immediately lower layer; when an ancestor changes in the current layer,
 * descendants inherit that change through their lower-layer local matrix.
 *
 * No layer mutates the document and no Three.js object enters this cache.
 */
export class LocallyResolvedObjectHierarchy {
  #base = new Map();
  #children = new Map();
  #layers = new Map();
  #order = [];
  #revision = 0;
  #sequence = 0;
  #stats = {
    baseReplacements: 0,
    baseUpserts: 0,
    baseRemovals: 0,
    layerWrites: 0,
    layerClears: 0,
    resolves: 0,
    cacheHits: 0,
    fallbacks: 0,
    inheritedTransforms: 0
  };

  replaceBase(entries = [], { revision = this.#revision + 1 } = {}) {
    const next = new Map();
    for (const entry of entries) {
      const normalized = normalizeBaseEntry(entry, revision);
      if (next.has(normalized.id)) {
        throw new Error(`Objeto local duplicado: ${normalized.id}.`);
      }
      next.set(normalized.id, normalized);
    }
    validateParents(next);
    this.#base = next;
    this.#revision = nonNegativeInteger(revision, "revision");
    this.#rebuildChildren();
    this.#invalidateLayerCaches();
    this.#stats.baseReplacements += 1;
    return this.status();
  }

  upsertBase(entry, { revision = this.#revision } = {}) {
    const normalized = normalizeBaseEntry(entry, revision);
    const previous = this.#base.get(normalized.id) ?? null;
    this.#base.set(normalized.id, normalized);
    this.#revision = nonNegativeInteger(revision, "revision");
    if (previous?.parentId !== normalized.parentId) this.#rebuildChildren();
    else this.#ensureChildBucket(normalized.id);
    this.#invalidateLayerCachesFor(normalized.id);
    this.#stats.baseUpserts += 1;
    return normalized;
  }

  removeBase(idValue, { revision = this.#revision } = {}) {
    const id = String(idValue ?? "");
    if (!this.#base.delete(id)) return false;
    this.#revision = nonNegativeInteger(revision, "revision");
    for (const layer of this.#layers.values()) {
      layer.entries.delete(id);
      layer.cache.clear();
    }
    this.#rebuildChildren();
    this.#stats.baseRemovals += 1;
    return true;
  }

  setLayer(layerIdValue, entries = [], {
    priority = 0,
    baseRevision = this.#revision,
    phase = "active"
  } = {}) {
    const layerId = requiredText(layerIdValue, "Identificador da camada");
    const normalizedPhase = String(phase ?? "active");
    if (!["active", "committing", "stable"].includes(normalizedPhase)) {
      throw new RangeError(`Fase de camada inválida: ${normalizedPhase}.`);
    }
    const normalizedEntries = new Map();
    for (const entry of entries) {
      const normalized = normalizeLayerEntry(entry);
      if (!this.#base.has(normalized.id)) continue;
      normalizedEntries.set(normalized.id, normalized);
    }
    const previous = this.#layers.get(layerId);
    const layer = {
      id: layerId,
      priority: Number.isFinite(Number(priority)) ? Number(priority) : 0,
      sequence: previous?.sequence ?? ++this.#sequence,
      baseRevision: nonNegativeInteger(baseRevision, "baseRevision"),
      phase: normalizedPhase,
      entries: normalizedEntries,
      cache: new Map()
    };
    this.#layers.set(layerId, layer);
    this.#sortLayers();
    this.#invalidateCachesFrom(layerId);
    this.#stats.layerWrites += normalizedEntries.size;
    return Object.freeze({
      layerId,
      entryCount: normalizedEntries.size,
      phase: normalizedPhase,
      baseRevision: layer.baseRevision
    });
  }

  clearLayer(layerIdValue) {
    const layerId = String(layerIdValue ?? "");
    const index = this.#order.indexOf(layerId);
    if (!this.#layers.delete(layerId)) return Object.freeze([]);
    if (index >= 0) this.#order.splice(index, 1);
    for (let cursor = Math.max(0, index); cursor < this.#order.length; cursor += 1) {
      this.#layers.get(this.#order[cursor])?.cache.clear();
    }
    this.#stats.layerClears += 1;
    return Object.freeze([...this.#base.keys()]);
  }

  has(idValue) {
    return this.#base.has(String(idValue ?? ""));
  }

  resolve(idValue, { throughLayer = null } = {}) {
    const id = String(idValue ?? "");
    if (!this.#base.has(id)) return null;
    this.#stats.resolves += 1;
    const layerIndex = throughLayer === null
      ? this.#order.length - 1
      : this.#order.indexOf(String(throughLayer));
    if (throughLayer !== null && layerIndex < 0) {
      throw new Error(`Camada local inexistente: ${throughLayer}.`);
    }
    return this.#resolveAt(id, layerIndex, new Set());
  }

  worldMatrix(idValue, options = {}) {
    return this.resolve(idValue, options)?.worldMatrix ?? null;
  }

  descendantsOf(idValue) {
    const id = String(idValue ?? "");
    if (!this.#base.has(id)) return Object.freeze([]);
    const result = [];
    const stack = [...(this.#children.get(id) ?? [])].reverse();
    while (stack.length) {
      const current = stack.pop();
      result.push(current);
      const children = this.#children.get(current) ?? [];
      for (let index = children.length - 1; index >= 0; index -= 1) {
        stack.push(children[index]);
      }
    }
    return Object.freeze(result);
  }

  affectedBy(entries = []) {
    const result = new Set();
    for (const entry of entries) {
      const id = String(entry?.id ?? entry ?? "");
      if (!this.#base.has(id)) continue;
      result.add(id);
      for (const descendant of this.descendantsOf(id)) result.add(descendant);
    }
    return Object.freeze([...result]);
  }

  status() {
    return Object.freeze({
      version: LOCALLY_RESOLVED_OBJECT_HIERARCHY_VERSION,
      revision: this.#revision,
      objectCount: this.#base.size,
      layers: Object.freeze(this.#order.map(id => {
        const layer = this.#layers.get(id);
        return Object.freeze({
          id,
          priority: layer.priority,
          baseRevision: layer.baseRevision,
          phase: layer.phase,
          entryCount: layer.entries.size,
          cacheSize: layer.cache.size
        });
      })),
      statistics: Object.freeze({ ...this.#stats })
    });
  }

  #resolveAt(id, layerIndex, resolving) {
    if (layerIndex < 0) {
      const base = this.#base.get(id);
      return Object.freeze({
        id,
        parentId: base.parentId,
        object: base.object,
        worldMatrix: base.worldMatrix,
        geometry: base.object?.geometry ?? null,
        appearance: base.object?.appearanceId ?? base.object?.material ?? null,
        bounds: base.bounds,
        revision: base.revision,
        sourceLayer: "canonical"
      });
    }
    const layer = this.#layers.get(this.#order[layerIndex]);
    const cached = layer.cache.get(id);
    if (cached) {
      this.#stats.cacheHits += 1;
      return cached;
    }
    const guard = `${layerIndex}:${id}`;
    if (resolving.has(guard)) {
      throw new Error(`Ciclo durante resolução local: ${id}.`);
    }
    resolving.add(guard);
    const lower = this.#resolveAt(id, layerIndex - 1, resolving);
    const entry = layer.entries.get(id) ?? null;
    let worldMatrix = entry?.worldMatrix ?? null;
    if (!worldMatrix) {
      const parentId = lower.parentId;
      if (parentId === null || parentId === undefined || !this.#base.has(parentId)) {
        worldMatrix = lower.worldMatrix;
        this.#stats.fallbacks += 1;
      } else {
        const lowerParent = this.#resolveAt(parentId, layerIndex - 1, resolving);
        const effectiveParent = this.#resolveAt(parentId, layerIndex, resolving);
        const local = multiplyMatrices(
          invertAffineMatrix(lowerParent.worldMatrix),
          lower.worldMatrix
        );
        worldMatrix = Object.freeze([
          ...multiplyMatrices(effectiveParent.worldMatrix, local)
        ]);
        this.#stats.inheritedTransforms += 1;
      }
    }
    const object = entry?.patch
      ? Object.freeze({ ...lower.object, ...entry.patch })
      : lower.object;
    const resolved = Object.freeze({
      id,
      parentId: lower.parentId,
      object,
      worldMatrix,
      geometry: entry?.patch && "geometry" in entry.patch
        ? entry.patch.geometry
        : lower.geometry,
      appearance: entry?.patch && ("appearanceId" in entry.patch || "material" in entry.patch)
        ? (entry.patch.appearanceId ?? entry.patch.material ?? null)
        : lower.appearance,
      bounds: entry?.bounds ?? lower.bounds,
      revision: Math.max(lower.revision, layer.baseRevision),
      sourceLayer: entry ? layer.id : lower.sourceLayer
    });
    resolving.delete(guard);
    layer.cache.set(id, resolved);
    return resolved;
  }

  #rebuildChildren() {
    this.#children = new Map([...this.#base.keys()].map(id => [id, []]));
    for (const entry of this.#base.values()) {
      if (entry.parentId && this.#children.has(entry.parentId)) {
        this.#children.get(entry.parentId).push(entry.id);
      }
    }
  }

  #ensureChildBucket(id) {
    if (!this.#children.has(id)) this.#children.set(id, []);
  }

  #sortLayers() {
    this.#order = [...this.#layers.values()]
      .sort((left, right) =>
        left.priority - right.priority || left.sequence - right.sequence
      )
      .map(layer => layer.id);
  }

  #invalidateLayerCaches() {
    for (const layer of this.#layers.values()) layer.cache.clear();
  }

  #invalidateLayerCachesFor(id) {
    const affected = new Set([id, ...this.descendantsOf(id)]);
    for (const layer of this.#layers.values()) {
      for (const value of affected) layer.cache.delete(value);
    }
  }

  #invalidateCachesFrom(layerId) {
    const index = this.#order.indexOf(layerId);
    for (let cursor = Math.max(0, index); cursor < this.#order.length; cursor += 1) {
      this.#layers.get(this.#order[cursor])?.cache.clear();
    }
  }
}

function normalizeBaseEntry(value, fallbackRevision) {
  const object = value?.object ?? value;
  const id = requiredText(value?.id ?? object?.id, "Identificador do objeto");
  const parentId = object?.parentId === null || object?.parentId === undefined || object?.parentId === ""
    ? null
    : String(object.parentId);
  return Object.freeze({
    id,
    parentId,
    object: Object.freeze({ ...object, id, parentId }),
    worldMatrix: normalizedMatrix(value?.worldMatrix ?? identityMatrix()),
    bounds: freezeBounds(value?.bounds ?? null),
    revision: nonNegativeInteger(value?.revision ?? fallbackRevision, "revision")
  });
}

function normalizeLayerEntry(value) {
  const id = requiredText(value?.id, "Identificador do override local");
  const patch = value?.patch && typeof value.patch === "object"
    ? Object.freeze({ ...value.patch })
    : null;
  return Object.freeze({
    id,
    worldMatrix: value?.worldMatrix == null
      ? null
      : normalizedMatrix(value.worldMatrix),
    patch,
    bounds: freezeBounds(value?.bounds ?? null)
  });
}

function normalizedMatrix(value) {
  if (!Array.isArray(value) || value.length !== 16) {
    throw new TypeError("Matriz local resolvida deve conter 16 valores.");
  }
  const result = value.map(Number);
  if (!result.every(Number.isFinite)) {
    throw new TypeError("Matriz local resolvida deve ser finita.");
  }
  return Object.freeze(result);
}

function freezeBounds(value) {
  if (!value || typeof value !== "object") return null;
  return Object.freeze({
    min: Object.freeze([...(value.min ?? [])].map(Number)),
    max: Object.freeze([...(value.max ?? [])].map(Number))
  });
}

function validateParents(entries) {
  for (const entry of entries.values()) {
    if (entry.parentId !== null && !entries.has(entry.parentId)) {
      throw new Error(`Pai local inexistente para ${entry.id}: ${entry.parentId}.`);
    }
  }
  for (const entry of entries.values()) {
    const seen = new Set([entry.id]);
    let parentId = entry.parentId;
    while (parentId !== null) {
      if (seen.has(parentId)) {
        throw new Error(`Ciclo na hierarquia local: ${[...seen, parentId].join(" -> ")}.`);
      }
      seen.add(parentId);
      parentId = entries.get(parentId)?.parentId ?? null;
    }
  }
}

function requiredText(value, label) {
  const text = String(value ?? "").trim();
  if (!text) throw new TypeError(`${label} vazio.`);
  return text;
}

function nonNegativeInteger(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) {
    throw new RangeError(`${label} deve ser inteiro não negativo.`);
  }
  return number;
}
