export class CoordinatedSandbox {
  static apiVersion = "coordinated-sandbox-v4-occurrences";

  constructor({ sandbox, coordinator } = {}) {
    if (!sandbox?.dispatch || !sandbox?.subscribe) {
      throw new TypeError("CoordinatedSandbox exige Sandbox.");
    }
    if (!coordinator?.dispatch || !coordinator?.status) {
      throw new TypeError(
        "CoordinatedSandbox exige coordenador de viewers."
      );
    }
    this.sandbox = sandbox;
    this.coordinator = coordinator;
    this.region = sandbox.region;
    this.reducer = sandbox.reducer;
  }

  get baseVersion() { return this.sandbox.baseVersion; }
  get revision() { return this.sandbox.revision; }
  get canUndo() {
    return this.coordinator.status().canUndo;
  }
  get canRedo() {
    return this.coordinator.status().canRedo;
  }
  get dirty() { return this.sandbox.dirty; }
  get objectCount() { return this.sandbox.objectCount; }

  getSnapshot() { return this.sandbox.getSnapshot(); }
  getState() { return this.sandbox.getState(); }
  getBaseState() { return this.sandbox.getBaseState(); }
  materializeState() {
    return typeof this.sandbox.materializeState === "function"
      ? this.sandbox.materializeState()
      : this.sandbox.getState();
  }
  getObjectPosition(id) {
    return typeof this.sandbox.getObjectPosition === "function"
      ? this.sandbox.getObjectPosition(id)
      : this.sandbox.getSnapshot().objects.findIndex(
          object => String(object.id) === String(id)
        );
  }
  getObjectDescendantIds(ids, options) {
    if (typeof this.sandbox.getObjectDescendantIds === "function") {
      return this.sandbox.getObjectDescendantIds(ids, options);
    }
    return Object.freeze([...(ids ?? [])].map(String));
  }
  getRawObject(id) {
    if (typeof this.sandbox.getRawObject === "function") {
      return this.sandbox.getRawObject(id);
    }
    return this.sandbox.getSnapshot().objects.find(
      object => String(object.id) === String(id)
    ) ?? null;
  }
  getInstanceOccurrence(id) {
    return typeof this.sandbox.getInstanceOccurrence === "function"
      ? this.sandbox.getInstanceOccurrence(id)
      : null;
  }
  getObjectWorldMatrix(id) {
    return typeof this.sandbox.getObjectWorldMatrix === "function"
      ? this.sandbox.getObjectWorldMatrix(id)
      : null;
  }
  getObjectParentWorldMatrix(id) {
    return typeof this.sandbox.getObjectParentWorldMatrix === "function"
      ? this.sandbox.getObjectParentWorldMatrix(id)
      : null;
  }
  listObjectChildren(parentId = null, options = {}) {
    if (typeof this.sandbox.listObjectChildren === "function") {
      return this.sandbox.listObjectChildren(parentId, options);
    }
    const items = this.sandbox.getSnapshot().objects
      .filter(object => (object.parentId ?? null) === parentId)
      .map(object => String(object.id));
    return Object.freeze({
      items: Object.freeze(items),
      offset: 0,
      limit: items.length,
      total: items.length,
      nextOffset: null
    });
  }
  getObjectChildCount(parentId = null) {
    if (typeof this.sandbox.getObjectChildCount === "function") {
      return this.sandbox.getObjectChildCount(parentId);
    }
    return this.listObjectChildren(parentId).total;
  }
  getObject(id) {
    if (typeof this.sandbox.getObject === "function") {
      return this.sandbox.getObject(id);
    }
    return this.sandbox.getSnapshot().objects.find(
      object => String(object.id) === String(id)
    ) ?? null;
  }
  getObjects(ids) {
    if (typeof this.sandbox.getObjects === "function") {
      return this.sandbox.getObjects(ids);
    }
    return (ids ?? []).map(id =>
      this.sandbox.getSnapshot().objects.find(
        object => String(object.id) === String(id)
      ) ?? null
    );
  }
  getHistoryDiagnostics() {
    return this.sandbox.getHistoryDiagnostics();
  }
  createProposal() { return this.sandbox.createProposal(); }
  previewCommandSequence(baseState, commands) {
    return this.sandbox.previewCommandSequence(baseState, commands);
  }
  subscribe(listener) { return this.sandbox.subscribe(listener); }
  coordinationStatus() { return this.coordinator.status(); }
  subscribeCoordination(listener) {
    return this.coordinator.subscribe(listener);
  }

  dispatch(command) {
    return this.coordinator.dispatch(command);
  }

  undo() {
    return this.coordinator.undo();
  }

  redo() {
    return this.coordinator.redo();
  }

  discard() {
    this.coordinator.requireAuthority("descartar o sandbox");
    return this.sandbox.discard();
  }

  rebaseFromRegion() {
    this.coordinator.requireAuthority("publicar e rebasear o sandbox");
    return this.sandbox.rebaseFromRegion();
  }

  replaceState(state, options) {
    this.coordinator.requireAuthority("substituir o projeto");
    return this.sandbox.replaceState(state, options);
  }

  restoreCommandSequence(options) {
    this.coordinator.requireAuthority("restaurar o histórico");
    return this.sandbox.restoreCommandSequence(options);
  }
}
