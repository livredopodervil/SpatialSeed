import {
  instanceDefinition,
  isInstanceNode,
  projectInstanceGraphObject,
  projectInstanceGraphRoot,
  projectInstanceGraphScene,
  projectInstanceOccurrenceSubtree,
  resolveInstanceOccurrence,
  instanceGraphCompiledProjectionDiagnostics
} from "./InstanceGraph.js?build=20260808-0053f";

/**
 * Mutable, derived projection cache. The authoritative scene remains immutable;
 * this cache exists only so a transform/update does not re-expand unrelated
 * instance roots on every dispatch.
 */
export class InstanceGraphProjectionCache {
  #objects = [];
  #positions = new Map();
  #rootMembers = new Map();
  #initialized = false;
  #statistics = {
    fullProjections: 0,
    localUpdates: 0,
    structuralUpdates: 0,
    projectedObjectsVisited: 0,
    rootReplacements: 0,
    rootAppends: 0,
    rootRemovals: 0,
    occurrenceUpdates: 0,
    occurrenceCreates: 0,
    occurrenceRemovals: 0
  };

  reset(scene) {
    const projected = projectInstanceGraphScene(scene);
    this.#objects = [...(projected.objects ?? [])];
    this.#rebuildPositions();
    this.#initialized = true;
    this.#statistics.fullProjections += 1;
    this.#statistics.projectedObjectsVisited += this.#objects.length;
    return Object.freeze({
      scene: this.#sceneShell(scene),
      changes: Object.freeze([]),
      full: true
    });
  }

  update(scene, changes = []) {
    if (!this.#initialized) return this.reset(scene);
    const list = Array.isArray(changes) ? changes : [];
    if (!list.length) {
      return Object.freeze({
        scene: this.#sceneShell(scene),
        changes: Object.freeze([]),
        full: false
      });
    }

    if (list.some(change => !isIncrementalProjectionChange(change))) {
      return this.reset(scene);
    }

    const projectedChanges = [];
    let structural = false;
    for (const change of list) {
      if (change.type === "object-created") {
        structural = true;
        projectedChanges.push(...this.#create(scene, change));
        continue;
      }
      if (change.type === "object-deleted") {
        structural = true;
        projectedChanges.push(...this.#delete(change));
        continue;
      }
      projectedChanges.push(...this.#updateObject(scene, change));
    }

    if (structural) {
      this.#statistics.structuralUpdates += 1;
      this.#rebuildPositions();
    } else {
      this.#statistics.localUpdates += 1;
    }

    return Object.freeze({
      scene: this.#sceneShell(scene),
      changes: Object.freeze(projectedChanges),
      full: false
    });
  }

  status() {
    return Object.freeze({
      version: "instance-graph-projection-cache-v1",
      initialized: this.#initialized,
      projectedObjectCount: this.#objects.length,
      statistics: Object.freeze({ ...this.#statistics }),
      compiledDefinitions: instanceGraphCompiledProjectionDiagnostics()
    });
  }

  #updateObject(scene, change) {
    const id = String(change.objectId ?? change.object?.id ?? "");
    const object = change.object;
    if (!id || !object) return [];
    if (Array.isArray(change.occurrenceChanges) && change.occurrenceChanges.length) {
      const projected = [];
      for (const occurrenceChange of change.occurrenceChanges) {
        projected.push(...this.#syncOccurrence(
          scene,
          String(occurrenceChange?.occurrenceId ?? ""),
          object,
          change
        ));
      }
      return projected;
    }
    const index = this.#positions.get(id);
    if (!Number.isInteger(index)) {
      // A cache miss means topology/projection no longer matches. Treat this as
      // a local creation rather than scanning/reprojecting every root.
      return this.#create(scene, {
        ...change,
        type: "object-created"
      });
    }

    if (!isInstanceNode(object)) {
      const previous = this.#objects[index];
      this.#objects[index] = object;
      this.#statistics.rootReplacements += 1;
      return [Object.freeze({
        ...change,
        objectId: id,
        object,
        ...(previous ? { previousObject: previous } : {})
      })];
    }

    const definition = instanceDefinition(scene, object);
    const previousRaw = change.previousObject;
    const sameAssembly = definition?.type === "assembly"
      && isInstanceNode(previousRaw)
      && previousRaw.definitionId === object.definitionId;
    const assemblyOverridesChanged = sameAssembly
      && previousRaw?.overrides !== object?.overrides;

    if ((sameAssembly && !assemblyOverridesChanged) || definition?.type === "object") {
      // Only the root envelope changed. A leaf/root projection is O(1), and an
      // assembly transform never re-expands immutable descendant definitions.
      const projectedRoot = projectInstanceGraphRoot(scene, object);
      this.#statistics.projectedObjectsVisited += 1;
      const previous = this.#objects[index];
      this.#objects[index] = projectedRoot;
      this.#statistics.rootReplacements += 1;
      return [Object.freeze({
        ...change,
        objectId: id,
        object: projectedRoot,
        ...(previous ? { previousObject: previous } : {})
      })];
    }

    const segment = projectInstanceGraphObject(scene, object);
    this.#statistics.projectedObjectsVisited += segment.length;

    const oldProjectedDescendants = this.#objects.filter(candidate =>
      candidate?.projectedInstance === true
      && String(candidate.instanceRootId ?? "") === id
      && String(candidate.id ?? "") !== id
    );

    // A definition/type change may alter subtree cardinality. Remove only that
    // root's derived descendants; never touch unrelated roots.
    if (oldProjectedDescendants.length) {
      const removedIds = new Set(oldProjectedDescendants.map(candidate => String(candidate.id)));
      this.#objects = this.#objects.filter(candidate => !removedIds.has(String(candidate?.id ?? "")));
      this.#rebuildPositions();
    }

    const rootIndex = this.#positions.get(id);
    const previousRoot = Number.isInteger(rootIndex) ? this.#objects[rootIndex] : null;
    if (Number.isInteger(rootIndex)) {
      this.#objects[rootIndex] = segment[0];
    } else {
      this.#objects.push(segment[0]);
    }
    for (const child of segment.slice(1)) this.#objects.push(child);
    this.#rebuildPositions();
    this.#statistics.rootReplacements += 1;

    return [
      ...oldProjectedDescendants.map(previousObject => Object.freeze({
        type: "object-deleted",
        objectId: String(previousObject.id),
        previousObject,
        source: change.source ?? "instance-graph.projection"
      })),
      Object.freeze({
        ...change,
        objectId: id,
        object: segment[0],
        ...(previousRoot ? { previousObject: previousRoot } : {})
      }),
      ...segment.slice(1).map(child => Object.freeze({
        type: "object-created",
        objectId: String(child.id),
        object: child,
        source: change.source ?? "instance-graph.projection"
      }))
    ];
  }

  #create(scene, change) {
    const object = change.object;
    const id = String(change.objectId ?? object?.id ?? "");
    if (!object || !id) return [];
    const definition = isInstanceNode(object)
      ? instanceDefinition(scene, object)
      : null;
    const segment = definition?.type === "assembly"
      ? projectInstanceGraphObject(scene, object)
      : Object.freeze([projectInstanceGraphRoot(scene, object)]);
    this.#statistics.projectedObjectsVisited += segment.length;
    for (const projected of segment) {
      const existing = this.#positions.get(String(projected.id));
      if (Number.isInteger(existing)) this.#objects[existing] = projected;
      else this.#objects.push(projected);
    }
    this.#statistics.rootAppends += 1;
    return segment.map(projected => Object.freeze({
      type: "object-created",
      objectId: String(projected.id),
      object: projected,
      source: change.source ?? "instance-graph.projection"
    }));
  }

  #delete(change) {
    const id = String(change.objectId ?? change.previousObject?.id ?? "");
    if (!id) return [];
    const removed = this.#objects.filter(candidate =>
      String(candidate?.id ?? "") === id
      || (
        candidate?.projectedInstance === true
        && String(candidate.instanceRootId ?? "") === id
      )
    );
    if (!removed.length) return [];
    const removedIds = new Set(removed.map(candidate => String(candidate.id)));
    this.#objects = this.#objects.filter(candidate => !removedIds.has(String(candidate?.id ?? "")));
    this.#statistics.rootRemovals += 1;
    return removed.map(previousObject => Object.freeze({
      type: "object-deleted",
      objectId: String(previousObject.id),
      previousObject,
      source: change.source ?? "instance-graph.projection"
    }));
  }

  #syncOccurrence(scene, occurrenceId, rootInstance, sourceChange) {
    if (!occurrenceId) return [];
    const current = resolveInstanceOccurrence(
      scene,
      occurrenceId,
      { rootInstance }
    );
    const existingIndex = this.#positions.get(occurrenceId);

    if (!current) {
      if (!Number.isInteger(existingIndex)) return [];
      const previous = this.#objects[existingIndex];
      const prefix = previous?.instancePath ?? [];
      const rootId = String(previous?.instanceRootId ?? rootInstance?.id ?? "");
      const memberIds = this.#rootMembers.get(rootId) ?? new Set([occurrenceId]);
      const removeIds = [];
      for (const id of memberIds) {
        const index = this.#positions.get(id);
        if (!Number.isInteger(index)) continue;
        const object = this.#objects[index];
        const path = object?.instancePath ?? [];
        if (pathStartsWith(path, prefix)) removeIds.push(id);
      }
      const removed = removeIds.map(id => {
        const index = this.#positions.get(id);
        return Number.isInteger(index) ? this.#objects[index] : null;
      }).filter(Boolean);
      this.#removeProjectedIds(removeIds);
      this.#statistics.occurrenceRemovals += removed.length;
      return removed.map(previousObject => Object.freeze({
        type: "object-deleted",
        objectId: String(previousObject.id),
        previousObject,
        source: sourceChange.source ?? "instance-graph.occurrence"
      }));
    }

    if (Number.isInteger(existingIndex)) {
      const previousObject = this.#objects[existingIndex];
      this.#objects[existingIndex] = current.object;
      this.#statistics.projectedObjectsVisited += 1;
      this.#statistics.occurrenceUpdates += 1;
      return [Object.freeze({
        type: sourceChange.type === "object-transform" ? "object-transform" : "object-updated",
        objectId: occurrenceId,
        object: current.object,
        previousObject,
        source: sourceChange.source ?? "instance-graph.occurrence"
      })];
    }

    const segment = projectInstanceOccurrenceSubtree(
      scene,
      occurrenceId,
      { rootInstance }
    );
    if (!segment.length) return [];
    for (const object of segment) this.#appendProjectedObject(object);
    this.#statistics.projectedObjectsVisited += segment.length;
    this.#statistics.occurrenceCreates += segment.length;
    return segment.map(object => Object.freeze({
      type: "object-created",
      objectId: String(object.id),
      object,
      source: sourceChange.source ?? "instance-graph.occurrence"
    }));
  }

  #appendProjectedObject(object) {
    const id = String(object?.id ?? "");
    if (!id) return false;
    const existing = this.#positions.get(id);
    if (Number.isInteger(existing)) {
      this.#objects[existing] = object;
      return false;
    }
    this.#positions.set(id, this.#objects.length);
    this.#objects.push(object);
    this.#registerRootMember(object);
    return true;
  }

  #removeProjectedIds(values) {
    const pending = new Set((values ?? []).map(String));
    while (pending.size) {
      const id = pending.values().next().value;
      pending.delete(id);
      const index = this.#positions.get(id);
      if (!Number.isInteger(index)) continue;
      const lastIndex = this.#objects.length - 1;
      const removed = this.#objects[index];
      const last = this.#objects[lastIndex];
      this.#unregisterRootMember(removed);
      if (index !== lastIndex) {
        this.#objects[index] = last;
        this.#positions.set(String(last?.id ?? ""), index);
      }
      this.#objects.pop();
      this.#positions.delete(id);
    }
  }

  #registerRootMember(object) {
    if (object?.projectedInstance !== true) return;
    const rootId = String(object.instanceRootId ?? "");
    const id = String(object.id ?? "");
    if (!rootId || !id) return;
    let members = this.#rootMembers.get(rootId);
    if (!members) {
      members = new Set();
      this.#rootMembers.set(rootId, members);
    }
    members.add(id);
  }

  #unregisterRootMember(object) {
    if (object?.projectedInstance !== true) return;
    const rootId = String(object.instanceRootId ?? "");
    const id = String(object.id ?? "");
    const members = this.#rootMembers.get(rootId);
    if (!members) return;
    members.delete(id);
    if (!members.size) this.#rootMembers.delete(rootId);
  }

  #sceneShell(scene) {
    return Object.freeze({
      ...scene,
      objects: this.#objects,
      projectedFromInstanceGraph: true
    });
  }

  #rebuildPositions() {
    this.#positions.clear();
    this.#rootMembers.clear();
    for (let index = 0; index < this.#objects.length; index += 1) {
      const object = this.#objects[index];
      this.#positions.set(String(object?.id ?? ""), index);
      this.#registerRootMember(object);
    }
  }
}

function pathStartsWith(path, prefix) {
  if (!Array.isArray(path) || !Array.isArray(prefix) || path.length < prefix.length) {
    return false;
  }
  return prefix.every((value, index) => String(path[index]) === String(value));
}

function isIncrementalProjectionChange(change) {
  return [
    "object-created",
    "object-deleted",
    "object-transform",
    "object-updated"
  ].includes(change?.type);
}
