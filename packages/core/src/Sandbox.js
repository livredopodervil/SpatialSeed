const PREPARED_COMMAND_MARKER = "spatialseed-prepared-command-v1";

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
    this.#baseState = region.getState();
    this.#state = structuredClone(this.#baseState);
    this.#rebuildObjectIndex();
  }

  get baseVersion() { return this.#baseVersion; }
  get revision() { return this.#revision; }
  get canUndo() { return this.#undo.length > 0; }
  get canRedo() { return this.#redo.length > 0; }
  get dirty() { return this.#commands.length > 0; }
  get objectCount() { return this.#state.objects.length; }
  getSnapshot() { return this.#state; }
  getState() { return structuredClone(this.#state); }
  getBaseState() { return structuredClone(this.#baseState); }
  getObject(id) {
    return this.#objectsById.get(String(id)) ?? null;
  }
  getObjects(ids = []) {
    return ids.map(id => this.getObject(id));
  }

  dispatch(command) {
    const dispatchStartedAt = performanceNow();
    const before = this.#state;
    const preparationStartedAt = performanceNow();
    const prepared = isPreparedImmutableCommand(command);
    /*
     * Comandos preparados preservam identidade e imutabilidade do produtor
     * até o histórico. Comandos comuns continuam isolados por cópia.
     */
    const reducerCommand = prepared
      ? deepFreeze(command)
      : structuredClone(command);
    const historyCommand = prepared
      ? reducerCommand
      : structuredClone(command);
    const commandPreparationMs = performanceNow() - preparationStartedAt;
    const reducerStartedAt = performanceNow();
    const result = this.reducer(
      before,
      reducerCommand,
      this.#reducerContext()
    );
    if (!result || result.state === before) return false;
    const reducerMs = performanceNow() - reducerStartedAt;
    const changes = this.#materializeChanges(
      result.changes ?? [],
      before,
      result.state
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
    this.#state = result.state;
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
    this.#state = structuredClone(this.#baseState);
    this.#undo.length = 0;
    this.#redo.length = 0;
    this.#commands.length = 0;
    this.#revision += 1;
    this.#rebuildObjectIndex();
    this.#notify([{ type: "sandbox-discard" }]);
  }

  rebaseFromRegion() {
    this.#baseVersion = this.region.version;
    this.#baseState = this.region.getState();
    this.#state = structuredClone(this.#baseState);
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
    const next = structuredClone(state);

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
      this.#baseState = structuredClone(next);
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

    return structuredClone(state);
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

    this.#baseState = structuredClone(base);
    this.#baseVersion = nonNegativeInteger(
      baseVersion,
      "A versão-base recuperada"
    );
    this.#state = state;
    this.#undo = undo;
    this.#redo.length = 0;
    this.#commands = structuredClone(sequence);
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
      performance: Object.freeze({ ...this.#performance })
    });
  }

  createProposal() {
    return Object.freeze({
      regionId: this.region.descriptor.id,
      baseVersion: this.#baseVersion,
      commands: structuredClone(this.#commands),
      proposedState: this.getState(),
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
    this.#objectPositions.clear();
    for (const [index, object] of this.#state.objects.entries()) {
      this.#objectsById.set(String(object.id), object);
      this.#objectPositions.set(String(object.id), index);
    }
    this.#objectPositionsValid = true;
  }

  #reducerContext() {
    return Object.freeze({
      hasObject: id => this.#objectsById.has(String(id)),
      getObject: id => this.#objectsById.get(String(id)) ?? null
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

    const createdCount = list.filter(
      change => change.type === "object-created"
    ).length;
    const createdOffset = after.objects.length - createdCount;
    let createdIndex = 0;
    const materialized = [];

    for (const change of list) {
      const id = String(change.objectId ?? change.object?.id ?? "");
      if (!id) return list;
      const previousObject = this.#objectsById.get(id) ?? null;
      let object = change.object ?? null;

      let objectPosition = null;
      if (change.type === "object-created") {
        const position = createdOffset + createdIndex;
        createdIndex += 1;
        objectPosition = position;
        object ??= after.objects[position] ?? null;
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
    const supported = new Set([
      "object-created",
      "object-deleted",
      "object-transform",
      "object-updated"
    ]);
    if (!list.length || list.some(change => !supported.has(change?.type))) {
      this.#rebuildObjectIndex();
      return;
    }

    for (const change of list) {
      const id = String(change.objectId ?? change.object?.id ?? "");
      if (!id) {
        this.#rebuildObjectIndex();
        return;
      }
      if (change.type === "object-deleted") {
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
        type: "object-updated",
        objectId: id,
        object,
        previousObject: change.object
      }));
      continue;
    }
    return Object.freeze([]);
  }
  return Object.freeze(inverse);
}

function validateState(value) {
  const state = structuredClone(value);
  if (
    !state ||
    typeof state !== "object" ||
    !Array.isArray(state.objects)
  ) {
    throw new TypeError(
      "O estado do sandbox deve conter um array objects."
    );
  }
  return state;
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
  return structuredClone(value);
}

function nonNegativeInteger(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) {
    throw new TypeError(`${label} deve ser um inteiro não negativo.`);
  }
  return number;
}
