export class Sandbox {
  #baseState;
  #state;
  #baseVersion;
  #undo = [];
  #redo = [];
  #commands = [];
  #subscribers = new Set();

  constructor(region, reducer) {
    this.region = region;
    this.reducer = reducer;
    this.#baseVersion = region.version;
    this.#baseState = region.getState();
    this.#state = structuredClone(this.#baseState);
  }

  get baseVersion() { return this.#baseVersion; }
  get canUndo() { return this.#undo.length > 0; }
  get canRedo() { return this.#redo.length > 0; }
  get dirty() { return this.#commands.length > 0; }
  getSnapshot() { return this.#state; }
  getState() { return structuredClone(this.#state); }

  dispatch(command) {
    const before = this.#state;
    const result = this.reducer(before, structuredClone(command));
    if (!result || result.state === before) return false;

    this.#undo.push({
      state: before,
      command: structuredClone(command)
    });
    this.#redo.length = 0;
    this.#commands.push(structuredClone(command));
    this.#state = result.state;
    this.#notify(result.changes ?? []);
    return true;
  }

  undo() {
    const entry = this.#undo.pop();
    if (!entry) return false;

    this.#redo.push({
      state: this.#state,
      command: entry.command
    });
    this.#state = entry.state;
    this.#commands.pop();
    this.#notify([{ type: "sandbox-undo" }]);
    return true;
  }

  redo() {
    const entry = this.#redo.pop();
    if (!entry) return false;

    const result = this.reducer(this.#state, entry.command);
    if (!result || result.state === this.#state) return false;

    this.#undo.push({
      state: this.#state,
      command: entry.command
    });
    this.#state = result.state;
    this.#commands.push(structuredClone(entry.command));
    this.#notify(result.changes ?? [{ type: "sandbox-redo" }]);
    return true;
  }

  discard() {
    this.#state = structuredClone(this.#baseState);
    this.#undo.length = 0;
    this.#redo.length = 0;
    this.#commands.length = 0;
    this.#notify([{ type: "sandbox-discard" }]);
  }

  rebaseFromRegion() {
    this.#baseVersion = this.region.version;
    this.#baseState = this.region.getState();
    this.#state = structuredClone(this.#baseState);
    this.#undo.length = 0;
    this.#redo.length = 0;
    this.#commands.length = 0;
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
    for (const listener of this.#subscribers) {
      try {
        listener(snapshot, changes);
      } catch (error) {
        console.error("Sandbox subscriber failed", error);
      }
    }
  }
}
