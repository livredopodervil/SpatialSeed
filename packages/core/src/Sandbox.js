import {
  normalizeDataObjectDocument
} from "./DataObjects.js?build=20260819-0054na";
import {
  createPersistentObjectArray,
  isPersistentObjectArray,
  materializePersistentObjectArray,
  persistentObjectArrayDiagnostics
} from "./PersistentObjectArray.js?build=20260807-0051a";
import {
  emptyInstanceGraph,
  isInstanceNode,
  normalizeInstanceGraph,
  resolveInstanceNode,
  resolveInstanceOccurrence,
  projectInstanceGraphObject,
  projectInstanceOccurrenceSubtree,
  instanceGraphDiagnostics
} from "../../instance-graph/src/index.js?build=20260807-0052b";
import {
  composeTransform,
  multiplyMatrices
} from "../../math-affine/src/index.js";

const PREPARED_COMMAND_MARKER = "spatialseed-prepared-command-v1";
const DATA_OBJECT_CHANGE_TYPES = new Set([
  "data-object-created",
  "data-object-deleted",
  "data-object-updated"
]);

export class Sandbox {
  #baseState;
  #state;
  #baseVersion;
  #undo = [];
  #redo = [];
  #commands = [];
  #revision = 0;
  #subscribers = new Set();
  #objectsById = new Map();
  #objectIdsByParent = new Map();
  #objectPositions = new Map();
  #objectPositionsValid = true;
  #performance = {
    dispatches: 0,
    lastReducerMs: 0,
    maximumReducerMs: 0,
    lastNotificationMs: 0,
    maximumNotificationMs: 0,
    lastDispatchMs: 0,
    maximumDispatchMs: 0,
    preparedDispatches: 0,
    maintenanceDispatches: 0,
    lastMaintenanceMs: 0,
    maximumMaintenanceMs: 0,
    lastCommandPreparationMs: 0,
    maximumCommandPreparationMs: 0,
    undos: 0,
    redos: 0,
    lastUndoMs: 0,
    maximumUndoMs: 0,
    lastRedoMs: 0,
    maximumRedoMs: 0,
    objectIndexRebuilds: 0,
    objectIndexObjectsVisited: 0,
    subscriberVisits: 0
  };

  constructor(region, reducer) {
    this.region = region;
    this.reducer = reducer;
    this.#baseVersion = region.version;
    this.#baseState = normalizeSandboxState(region.getState());
    this.#state = this.#baseState;
    this.#rebuildObjectIndex();
  }

  get baseVersion() { return this.#baseVersion; }
  get revision() { return this.#revision; }
  get canUndo() { return this.#undo.length > 0; }
  get canRedo() { return this.#redo.length > 0; }
  get dirty() { return this.#commands.length > 0; }
  get objectCount() { return this.#state.objects.length; }
  getSnapshot() { return this.#state; }
  /*
   * Snapshot público imutável. Recursos geométricos/materials já são
   * imutáveis e permanecem compartilhados; não fazemos structuredClone do
   * mundo inteiro a cada consulta. Para serialização explícita do estado
   * corrente use materializeState(). O estado-base é uma fronteira de
   * checkpoint e por isso getBaseState() devolve um valor clonável.
   */
  getState() { return cloneStateShell(this.#state); }
  getBaseState() { return materializeState(this.#baseState); }
  materializeState() { return materializeState(this.#state); }
  getObjectPosition(id) {
    this.#ensureObjectPositions();
    const value = this.#objectPositions.get(String(id));
    return Number.isInteger(value) ? value : -1;
  }
  getObjectDescendantIds(rootIds = [], { includeRoots = false } = {}) {
    const roots = [...new Set((rootIds ?? []).map(String).filter(Boolean))];
    const rootSet = new Set(roots);
    const seen = new Set();
    const result = [];

    const appendProjected = segment => {
      for (const object of segment ?? []) {
        const id = String(object?.id ?? "");
        if (!id || seen.has(id)) continue;
        seen.add(id);
        if (includeRoots || !rootSet.has(id)) result.push(id);
      }
    };

    for (const rootId of roots) {
      const raw = this.#objectsById.get(rootId) ?? null;
      if (raw && isInstanceNode(raw)) {
        const segment = projectInstanceGraphObject(this.#state, raw);
        if (segment.length > 1) {
          appendProjected(segment);
          continue;
        }
      }
      const occurrence = this.getInstanceOccurrence(rootId);
      if (occurrence) {
        appendProjected(projectInstanceOccurrenceSubtree(
          this.#state,
          rootId,
          { rootInstance: occurrence.rootInstance }
        ));
        continue;
      }

      const stack = [rootId];
      while (stack.length) {
        const id = stack.pop();
        if (!id || seen.has(id) || !this.#objectsById.has(id)) continue;
        seen.add(id);
        if (includeRoots || !rootSet.has(id)) result.push(id);
        const children = this.#objectIdsByParent.get(hierarchyParentKey(id)) ?? [];
        for (let index = children.length - 1; index >= 0; index -= 1) {
          stack.push(children[index]);
        }
      }
    }
    return Object.freeze(result);
  }
  getRawObject(id) {
    return this.#objectsById.get(String(id)) ?? null;
  }
  getInstanceOccurrence(id) {
    const value = String(id ?? "");
    if (!value || this.#objectsById.has(value)) return null;
    const parsedRoot = occurrenceRootId(value);
    const rootInstance = parsedRoot
      ? this.#objectsById.get(parsedRoot) ?? null
      : null;
    return resolveInstanceOccurrence(this.#state, value, { rootInstance });
  }
  getObject(id) {
    const raw = this.getRawObject(id);
    if (raw) return resolveInstanceNode(this.#state, raw);
    return this.getInstanceOccurrence(id)?.object ?? null;
  }
  getObjectWorldMatrix(id) {
    const start = this.getObject(id);
    if (!start) return null;
    const chain = [];
    let current = start;
    const seen = new Set();
    while (current) {
      const currentId = String(current.id ?? "");
      if (!currentId || seen.has(currentId)) break;
      seen.add(currentId);
      chain.push(current);
      if (current.parentId === null || current.parentId === undefined || current.parentId === "") break;
      current = this.getObject(String(current.parentId));
    }
    let world = identityMatrix();
    for (let index = chain.length - 1; index >= 0; index -= 1) {
      world = multiplyMatrices(world, composeTransform({
        position: chain[index].position ?? [0, 0, 0],
        rotation: chain[index].rotation ?? [0, 0, 0, 1],
        scale: chain[index].scale ?? [1, 1, 1]
      }));
    }
    return Object.freeze([...world]);
  }
  getObjectParentWorldMatrix(id) {
    const object = this.getObject(id);
    if (!object || object.parentId === null || object.parentId === undefined || object.parentId === "") {
      return Object.freeze(identityMatrix());
    }
    return this.getObjectWorldMatrix(String(object.parentId)) ?? Object.freeze(identityMatrix());
  }
  getObjects(ids = []) {
    return ids.map(id => this.getObject(id));
  }
  listObjectChildren(parentId = null, { offset = 0, limit = 100 } = {}) {
    const start = nonNegativeInteger(offset, "O offset hierárquico");
    const size = nonNegativeInteger(limit, "O limite hierárquico");
    let ids = this.#objectIdsByParent.get(hierarchyParentKey(parentId)) ?? [];
    if (parentId !== null && parentId !== undefined) {
      const parentIdString = String(parentId);
      const parent = this.getObject(parentIdString);
      const rawParent = this.getRawObject(parentIdString);
      if (
        parent?.kind === "group" &&
        (parent?.projectedInstance === true || isInstanceNode(rawParent))
      ) {
        const segment = this.getObjectDescendantIds([String(parentId)], { includeRoots: true });
        ids = segment.filter(id => this.getObject(id)?.parentId === String(parentId));
      }
    }
    const end = Math.min(ids.length, start + size);
    return Object.freeze({
      items: Object.freeze(ids.slice(start, end)),
      offset: start,
      limit: size,
      total: ids.length,
      nextOffset: end < ids.length ? end : null
    });
  }
  getObjectChildCount(parentId = null) {
    return this.listObjectChildren(parentId, { offset: 0, limit: 0 }).total;
  }

  dispatch(command) {
    const dispatchStartedAt = performanceNow();
    const before = this.#state;
    const preparationStartedAt = performanceNow();
    const prepared = isPreparedImmutableCommand(command);
    /*
     * Duplicações podem carregar descritores geométricos grandes. Copiar o
     * comando inteiro destruiria o compartilhamento de recursos antes mesmo
     * de o reducer recebê-lo. O preparador especial preserva recursos
     * imutáveis por referência e copia apenas o envelope mutável.
     */
    const reducerCommand = prepared
      ? deepFreeze(command)
      : prepareSandboxCommand(command);
    const historyCommand = reducerCommand;
    const commandPreparationMs = performanceNow() - preparationStartedAt;
    const reducerStartedAt = performanceNow();
    const result = this.reducer(
      before,
      reducerCommand,
      this.#reducerContext()
    );
    if (!result || result.state === before) return false;
    const nextState = normalizeSandboxState(result.state);
    const reducerMs = performanceNow() - reducerStartedAt;
    const changes = this.#materializeChanges(
      result.changes ?? [],
      before,
      nextState
    );
    const inverseChanges = invertObjectChanges(changes);

    this.#undo.push({
      state: before,
      command: historyCommand,
      forwardChanges: changes,
      inverseChanges
    });
    this.#redo.length = 0;
    this.#commands.push(historyCommand);
    this.#state = nextState;
    this.#revision += 1;
    this.#updateObjectIndex(changes);
    const notificationStartedAt = performanceNow();
    this.#notify(changes);
    const notificationMs = performanceNow() - notificationStartedAt;
    const dispatchMs = performanceNow() - dispatchStartedAt;
    this.#performance.dispatches += 1;
    this.#performance.lastReducerMs = reducerMs;
    this.#performance.maximumReducerMs = Math.max(
      this.#performance.maximumReducerMs,
      reducerMs
    );
    this.#performance.lastNotificationMs = notificationMs;
    this.#performance.maximumNotificationMs = Math.max(
      this.#performance.maximumNotificationMs,
      notificationMs
    );
    this.#performance.lastDispatchMs = dispatchMs;
    this.#performance.maximumDispatchMs = Math.max(
      this.#performance.maximumDispatchMs,
      dispatchMs
    );
    if (prepared) this.#performance.preparedDispatches += 1;
    this.#performance.lastCommandPreparationMs = commandPreparationMs;
    this.#performance.maximumCommandPreparationMs = Math.max(
      this.#performance.maximumCommandPreparationMs,
      commandPreparationMs
    );
    return true;
  }

  dispatchMaintenance(command) {
    const startedAt = performanceNow();
    const before = this.#state;
    const reducerCommand = deepFreeze(command);
    const result = this.reducer(
      before,
      reducerCommand,
      this.#reducerContext()
    );
    if (!result || result.state === before) return false;
    const nextState = normalizeSandboxState(result.state);

    const changes = this.#materializeChanges(
      result.changes ?? [],
      before,
      nextState
    );
    this.#state = nextState;
    this.#revision += 1;
    this.#updateObjectIndex(changes);
    this.#notify(changes);

    const elapsed = performanceNow() - startedAt;
    this.#performance.maintenanceDispatches += 1;
    this.#performance.lastMaintenanceMs = elapsed;
    this.#performance.maximumMaintenanceMs = Math.max(
      this.#performance.maximumMaintenanceMs,
      elapsed
    );
    return true;
  }

  undo() {
    const startedAt = performanceNow();
    const entry = this.#undo.pop();
    if (!entry) return false;

    const after = this.#state;
    this.#redo.push({
      state: after,
      command: entry.command,
      forwardChanges: entry.forwardChanges,
      inverseChanges: entry.inverseChanges
    });
    this.#state = entry.state;
    this.#commands.pop();
    this.#revision += 1;
    const changes = entry.inverseChanges?.length
      ? entry.inverseChanges
      : [{ type: "sandbox-undo" }];
    this.#updateObjectIndex(changes);
    this.#notify(changes);
    const elapsed = performanceNow() - startedAt;
    this.#performance.undos += 1;
    this.#performance.lastUndoMs = elapsed;
    this.#performance.maximumUndoMs = Math.max(
      this.#performance.maximumUndoMs,
      elapsed
    );
    return true;
  }

  redo() {
    const startedAt = performanceNow();
    const entry = this.#redo.pop();
    if (!entry) return false;

    const before = this.#state;
    this.#undo.push({
      state: before,
      command: entry.command,
      forwardChanges: entry.forwardChanges,
      inverseChanges: entry.inverseChanges
    });
    this.#state = entry.state;
    this.#commands.push(entry.command);
    this.#revision += 1;
    const changes = entry.forwardChanges?.length
      ? entry.forwardChanges
      : [{ type: "sandbox-redo" }];
    this.#updateObjectIndex(changes);
    this.#notify(changes);
    const elapsed = performanceNow() - startedAt;
    this.#performance.redos += 1;
    this.#performance.lastRedoMs = elapsed;
    this.#performance.maximumRedoMs = Math.max(
      this.#performance.maximumRedoMs,
      elapsed
    );
    return true;
  }

  discard() {
    this.#state = this.#baseState;
    this.#undo.length = 0;
    this.#redo.length = 0;
    this.#commands.length = 0;
    this.#revision += 1;
    this.#rebuildObjectIndex();
    this.#notify([{ type: "sandbox-discard" }]);
  }

  rebaseFromRegion() {
    this.#baseVersion = this.region.version;
    this.#baseState = normalizeSandboxState(this.region.getState());
    this.#state = this.#baseState;
    this.#undo.length = 0;
    this.#redo.length = 0;
    this.#commands.length = 0;
    this.#revision += 1;
    this.#rebuildObjectIndex();
    this.#notify([{
      type: "sandbox-rebased",
      baseVersion: this.#baseVersion
    }]);
  }

  replaceState(state, { markClean = true } = {}) {
    const next = normalizeSandboxState(state);

    if (
      !next ||
      typeof next !== "object" ||
      !Array.isArray(next.objects)
    ) {
      throw new TypeError(
        "O estado do sandbox deve conter um array objects."
      );
    }

    this.#state = next;
    this.#undo.length = 0;
    this.#redo.length = 0;
    this.#commands.length = 0;
    this.#revision += 1;
    this.#rebuildObjectIndex();

    if (markClean) {
      this.#baseState = next;
      this.#baseVersion = this.region.version;
    }

    this.#notify([{
      type: "sandbox-state-replaced",
      markClean
    }]);

    return true;
  }

  previewCommandSequence(baseState, commands = []) {
    const base = validateState(baseState);
    const sequence = validateCommands(commands);
    let state = base;

    for (const [index, command] of sequence.entries()) {
      const result = this.reducer(state, structuredClone(command));
      if (!result || result.state === state) {
        throw new Error(
          `Comando de recuperação ${index + 1} não altera o checkpoint.`
        );
      }
      state = result.state;
    }

    return materializeState(state);
  }

  restoreCommandSequence({
    baseState,
    commands = [],
    baseVersion = this.region.version,
    revision = commands.length
  } = {}) {
    const base = validateState(baseState);
    const sequence = validateCommands(commands);
    const restoredRevision = Number(revision);

    if (
      !Number.isInteger(restoredRevision) ||
      restoredRevision < sequence.length
    ) {
      throw new TypeError(
        "A revisão recuperada deve ser inteira e não menor que os comandos."
      );
    }

    let state = base;
    const undo = [];
    for (const [index, command] of sequence.entries()) {
      const before = state;
      const result = this.reducer(before, structuredClone(command));
      if (!result || result.state === before) {
        throw new Error(
          `Comando de recuperação ${index + 1} não altera o checkpoint.`
        );
      }
      undo.push({
        state: before,
        command: structuredClone(command)
      });
      state = result.state;
    }

    this.#baseState = normalizeSandboxState(base);
    this.#baseVersion = nonNegativeInteger(
      baseVersion,
      "A versão-base recuperada"
    );
    this.#state = state;
    this.#undo = undo;
    this.#redo.length = 0;
    this.#commands = sequence.map(prepareSandboxCommand);
    this.#revision = restoredRevision;
    this.#rebuildObjectIndex();
    this.#notify([{
      type: "sandbox-recovered",
      commandCount: sequence.length,
      revision: restoredRevision
    }]);
    return true;
  }

  getHistoryDiagnostics() {
    return Object.freeze({
      undoDepth: this.#undo.length,
      redoDepth: this.#redo.length,
      revision: this.#revision,
      commandCount: this.#commands.length,
      dirty: this.dirty,
      canUndo: this.canUndo,
      canRedo: this.canRedo,
      subscriberCount: this.#subscribers.size,
      objectStorage: persistentObjectArrayDiagnostics(this.#state.objects),
      instanceGraph: instanceGraphDiagnostics(this.#state),
      performance: Object.freeze({ ...this.#performance })
    });
  }

  createProposal() {
    return Object.freeze({
      regionId: this.region.descriptor.id,
      baseVersion: this.#baseVersion,
      commands: this.#commands.map(cloneCommandForExport),
      proposedState: materializeState(this.#state),
      createdAt: new Date().toISOString()
    });
  }

  subscribe(listener) {
    this.#subscribers.add(listener);
    listener(this.getSnapshot(), [{ type: "initial" }]);
    return () => this.#subscribers.delete(listener);
  }

  #notify(changes) {
    const snapshot = this.getSnapshot();
    this.#performance.subscriberVisits += this.#subscribers.size;
    for (const listener of this.#subscribers) {
      try {
        listener(snapshot, changes);
      } catch (error) {
        console.error("Sandbox subscriber failed", error);
      }
    }
  }

  #rebuildObjectIndex() {
    this.#performance.objectIndexRebuilds += 1;
    this.#performance.objectIndexObjectsVisited += this.#state.objects.length;
    this.#objectsById.clear();
    this.#objectIdsByParent.clear();
    this.#objectPositions.clear();
    for (const [index, object] of this.#state.objects.entries()) {
      const id = String(object.id);
      this.#objectsById.set(id, object);
      this.#objectPositions.set(id, index);
      this.#attachObjectToParentIndex(id, object.parentId);
    }
    this.#objectPositionsValid = true;
  }

  #reducerContext() {
    return Object.freeze({
      hasObject: id => Boolean(this.getObject(id)),
      getObject: id => this.getObject(id),
      getRawObject: id => this.#objectsById.get(String(id)) ?? null,
      getObjectPosition: id => this.getObjectPosition(id),
      getInstanceOccurrence: id => this.getInstanceOccurrence(id),
      getObjectWorldMatrix: id => this.getObjectWorldMatrix(id),
      getObjectParentWorldMatrix: id => this.getObjectParentWorldMatrix(id),
      getObjectDescendantIds: (ids, options) =>
        this.getObjectDescendantIds(ids, options)
    });
  }

  #materializeChanges(rawChanges, before, after) {
    const list = Array.isArray(rawChanges) ? rawChanges : [];
    const supported = new Set([
      "object-created",
      "object-deleted",
      "object-transform",
      "object-updated"
    ]);
    if (!list.length || list.some(change => !supported.has(change?.type))) {
      return list;
    }

    const createdChanges = list.filter(
      change => change.type === "object-created"
    );
    const createdCount = createdChanges.length;
    const createdOffset = after.objects.length - createdCount;
    const appendOnlyCreates = createdCount > 0
      && createdOffset >= 0
      && createdChanges.every((change, index) => {
        const id = String(change.objectId ?? change.object?.id ?? "");
        return id && String(after.objects[createdOffset + index]?.id ?? "") === id;
      });
    let createdPositionById = null;
    if (createdCount > 0 && !appendOnlyCreates) {
      createdPositionById = new Map();
      for (let index = 0; index < after.objects.length; index += 1) {
        createdPositionById.set(String(after.objects[index]?.id ?? ""), index);
      }
    }
    let createdIndex = 0;
    const materialized = [];

    for (const change of list) {
      const id = String(change.objectId ?? change.object?.id ?? "");
      if (!id) return list;
      const previousObject = this.#objectsById.get(id) ?? null;
      let object = change.object ?? null;

      let objectPosition = null;
      if (change.type === "object-created") {
        const position = appendOnlyCreates
          ? createdOffset + createdIndex
          : createdPositionById?.get(id);
        createdIndex += 1;
        if (Number.isInteger(position)) {
          objectPosition = position;
          object ??= after.objects[position] ?? null;
        }
      } else if (change.type !== "object-deleted" && !object) {
        const position = this.#objectPositionsValid
          ? this.#objectPositions.get(id)
          : undefined;
        object = Number.isInteger(position)
          ? after.objects[position] ?? null
          : null;
        if (!object || String(object.id) !== id) {
          object = after.objects.find(candidate => String(candidate.id) === id) ?? null;
        }
      }

      if (change.type !== "object-deleted" && !object) return list;
      materialized.push(Object.freeze({
        ...change,
        objectId: id,
        ...(object ? { object } : {}),
        ...(Number.isInteger(objectPosition) ? { objectPosition } : {}),
        ...(previousObject ? { previousObject } : {})
      }));
    }
    return Object.freeze(materialized);
  }

  #updateObjectIndex(changes) {
    const list = Array.isArray(changes) ? changes : [];
    const spatial = list.filter(change => !DATA_OBJECT_CHANGE_TYPES.has(change?.type));
    if (!spatial.length) return;
    const supported = new Set([
      "object-created",
      "object-deleted",
      "object-transform",
      "object-updated"
    ]);
    if (spatial.some(change => !supported.has(change?.type))) {
      this.#rebuildObjectIndex();
      return;
    }

    for (const change of spatial) {
      const id = String(change.objectId ?? change.object?.id ?? "");
      if (!id) {
        this.#rebuildObjectIndex();
        return;
      }
      const previous = change.previousObject ?? this.#objectsById.get(id) ?? null;
      if (change.type === "object-deleted") {
        this.#detachObjectFromParentIndex(id, previous?.parentId);
        this.#objectsById.delete(id);
        this.#objectPositions.delete(id);
        this.#objectPositionsValid = false;
        continue;
      }
      const object = change.object;
      if (!object || String(object.id) !== id) {
        this.#rebuildObjectIndex();
        return;
      }
      const previousParent = previous?.parentId == null
        ? null
        : String(previous.parentId);
      const nextParent = object.parentId == null ? null : String(object.parentId);
      if (!previous || previousParent !== nextParent) {
        if (previous) this.#detachObjectFromParentIndex(id, previousParent);
        this.#attachObjectToParentIndex(id, nextParent);
      }
      this.#objectsById.set(id, object);
      if (change.type === "object-created" && this.#objectPositionsValid) {
        const position = Number(change.objectPosition);
        if (Number.isInteger(position) && position >= 0) {
          this.#objectPositions.set(id, position);
        } else {
          this.#objectPositionsValid = false;
        }
      }
    }
  }

  #ensureObjectPositions() {
    if (this.#objectPositionsValid) return;
    this.#objectPositions.clear();
    let index = 0;
    for (const object of this.#state.objects) {
      this.#objectPositions.set(String(object.id), index);
      index += 1;
    }
    this.#objectPositionsValid = true;
  }

  #attachObjectToParentIndex(idValue, parentValue) {
    const id = String(idValue);
    const key = hierarchyParentKey(parentValue);
    let ids = this.#objectIdsByParent.get(key);
    if (!ids) {
      ids = [];
      this.#objectIdsByParent.set(key, ids);
    }
    if (!ids.includes(id)) ids.push(id);
  }

  #detachObjectFromParentIndex(idValue, parentValue) {
    const id = String(idValue);
    const key = hierarchyParentKey(parentValue);
    const ids = this.#objectIdsByParent.get(key);
    if (!ids) return;
    const index = ids.indexOf(id);
    if (index >= 0) ids.splice(index, 1);
    if (!ids.length) this.#objectIdsByParent.delete(key);
  }


}

function isPreparedImmutableCommand(command) {
  return Boolean(
    command &&
    typeof command === "object" &&
    command.preparedImmutable === PREPARED_COMMAND_MARKER
  );
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function invertObjectChanges(changes) {
  if (!Array.isArray(changes) || !changes.length) return Object.freeze([]);
  const inverse = [];
  for (let index = changes.length - 1; index >= 0; index -= 1) {
    const change = changes[index];
    if (change?.type === "data-object-created") {
      const dataId = String(change.dataObjectId ?? change.dataObject?.id ?? "");
      if (!dataId) return Object.freeze([]);
      inverse.push(Object.freeze({
        type: "data-object-deleted",
        dataObjectId: dataId,
        dataObject: change.dataObject,
        previousDataObject: change.dataObject
      }));
      continue;
    }
    if (change?.type === "data-object-deleted") {
      const dataObject = change.previousDataObject ?? change.dataObject;
      const dataId = String(change.dataObjectId ?? dataObject?.id ?? "");
      if (!dataId || !dataObject) return Object.freeze([]);
      inverse.push(Object.freeze({
        type: "data-object-created",
        dataObjectId: dataId,
        dataObject
      }));
      continue;
    }
    if (change?.type === "data-object-updated") {
      const dataObject = change.previousDataObject;
      const dataId = String(change.dataObjectId ?? dataObject?.id ?? "");
      if (!dataId || !dataObject) return Object.freeze([]);
      inverse.push(Object.freeze({
        type: "data-object-updated",
        dataObjectId: dataId,
        dataObject,
        previousDataObject: change.dataObject
      }));
      continue;
    }
    const id = String(change?.objectId ?? "");
    if (!id) return Object.freeze([]);
    if (change.type === "object-created") {
      inverse.push(Object.freeze({
        type: "object-deleted",
        objectId: id,
        previousObject: change.object,
        object: change.object
      }));
      continue;
    }
    if (change.type === "object-deleted") {
      const object = change.previousObject ?? change.object;
      if (!object) return Object.freeze([]);
      inverse.push(Object.freeze({
        type: "object-created",
        objectId: id,
        object
      }));
      continue;
    }
    if (["object-transform", "object-updated"].includes(change.type)) {
      const object = change.previousObject;
      if (!object) return Object.freeze([]);
      inverse.push(Object.freeze({
        type: change.type,
        objectId: id,
        object,
        previousObject: change.object,
        ...(Array.isArray(change.affectedOccurrenceIds)
          ? { affectedOccurrenceIds: change.affectedOccurrenceIds }
          : {}),
        ...(Array.isArray(change.occurrenceChanges)
          ? { occurrenceChanges: change.occurrenceChanges }
          : {}),
        ...(change.source ? { source: change.source } : {})
      }));
      continue;
    }
    return Object.freeze([]);
  }
  return Object.freeze(inverse);
}

function hierarchyParentKey(value) {
  return value === null || value === undefined ? "@root" : `@${String(value)}`;
}

function occurrenceRootId(value) {
  const id = String(value ?? "");
  if (!id.startsWith("@ig/")) return null;
  const body = id.slice(4);
  const slash = body.indexOf("/");
  if (slash <= 0) return null;
  try {
    return decodeURIComponent(body.slice(0, slash));
  } catch {
    return null;
  }
}

function identityMatrix() {
  return [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1
  ];
}

function validateState(value) {
  return normalizeSandboxState(value);
}

function performanceNow() {
  return typeof globalThis.performance?.now === "function"
    ? globalThis.performance.now()
    : Date.now();
}

function validateCommands(value) {
  if (!Array.isArray(value)) {
    throw new TypeError(
      "A sequência de comandos recuperada deve ser um array."
    );
  }
  return value.map(prepareSandboxCommand);
}


function normalizeSandboxState(value) {
  if (!value || typeof value !== "object" || !Array.isArray(value.objects)) {
    throw new TypeError("O estado do sandbox deve conter um array objects.");
  }
  const objects = isPersistentObjectArray(value.objects)
    ? value.objects
    : createPersistentObjectArray(
        value.objects.map(object => freezeObjectShell(object))
      );
  const instanceGraph = value.instanceGraph
    ? normalizeInstanceGraph(value.instanceGraph)
    : emptyInstanceGraph();
  const hasDataObjects = Object.hasOwn(value, "dataObjects");
  const dataObjects = hasDataObjects
    ? normalizeDataObjectDocument(value.dataObjects)
    : null;
  const keepDataObjects = Boolean(dataObjects?.items.length);
  if (
    objects === value.objects &&
    instanceGraph === value.instanceGraph &&
    (!hasDataObjects || (keepDataObjects && dataObjects === value.dataObjects)) &&
    Object.isFrozen(value)
  ) return value;
  const { dataObjects: _dataObjects, ...shell } = value;
  return Object.freeze({
    ...shell,
    objects,
    instanceGraph,
    ...(keepDataObjects ? { dataObjects } : {})
  });
}

function freezeObjectShell(value) {
  if (!value || typeof value !== "object") return value;
  if (Object.isFrozen(value)) return value;
  const object = { ...value };
  for (const key of ["position", "rotation", "scale"]) {
    if (Array.isArray(object[key]) && !Object.isFrozen(object[key])) {
      object[key] = Object.freeze([...object[key]]);
    }
  }
  for (const key of [
    "geometry", "sketch", "material", "appearanceBinding", "family",
    "camera", "light", "instanceState"
  ]) {
    if (object[key] && typeof object[key] === "object") {
      object[key] = deepFreeze(object[key]);
    }
  }
  return Object.freeze(object);
}

function cloneStateShell(state) {
  return Object.freeze({
    ...state,
    objects: state.objects
  });
}

function materializeState(state) {
  const dataObjects = normalizeDataObjectDocument(state.dataObjects);
  const { dataObjects: _dataObjects, ...shell } = state;
  return {
    ...shell,
    instanceGraph: cloneExportValue(state.instanceGraph ?? emptyInstanceGraph()),
    ...(dataObjects.items.length
      ? { dataObjects: cloneExportValue(dataObjects) }
      : {}),
    objects: materializePersistentObjectArray(state.objects).map(
      cloneObjectForExport
    )
  };
}

function cloneObjectForExport(object) {
  const result = {};
  for (const [key, value] of Object.entries(object ?? {})) {
    result[key] = cloneExportValue(value);
  }
  return result;
}

function cloneExportValue(value) {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(cloneExportValue);
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [key, cloneExportValue(child)])
  );
}

function prepareSandboxCommand(command) {
  if (!command || typeof command !== "object") return command;
  if (command.type === "selection.duplicate" && Array.isArray(command.objects)) {
    return deepFreeze({
      ...command,
      objects: Object.freeze(command.objects.map(object => freezeObjectShell(object)))
    });
  }
  return deepFreeze(structuredClone(command));
}

function cloneCommandForExport(command) {
  return cloneExportValue(command);
}

function nonNegativeInteger(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) {
    throw new TypeError(`${label} deve ser um inteiro não negativo.`);
  }
  return number;
}
