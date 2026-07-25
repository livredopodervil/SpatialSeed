export class CoordinatedSandbox {
  static apiVersion = "coordinated-sandbox-v2";

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
