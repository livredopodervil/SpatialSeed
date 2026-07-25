import {
  createRecoveryRecord,
  validateRecoveryRecord
} from "./RecoveryRecord.js";

export class SandboxRecoveryController {
  static apiVersion = "sandbox-recovery-controller-v2";

  #pendingRecord = null;
  #sandboxUnsubscribe = null;
  #projectUnsubscribe = null;
  #timer = null;
  #started = false;
  #suspended = false;
  #lastError = null;
  #performance = {
    flushes: 0,
    lastBuildMs: 0,
    maximumBuildMs: 0,
    lastStoreMs: 0,
    maximumStoreMs: 0,
    lastFlushMs: 0,
    maximumFlushMs: 0
  };

  constructor({
    sandbox,
    projectService,
    store,
    identity,
    debounceMs = 300,
    setTimer = globalThis.setTimeout?.bind(globalThis),
    clearTimer = globalThis.clearTimeout?.bind(globalThis),
    now = () => new Date(),
    onIdentityChanged = () => {}
  }) {
    if (!sandbox || !projectService || !store || !identity) {
      throw new TypeError(
        "SandboxRecoveryController exige sandbox, projeto, store e identidade."
      );
    }
    if (typeof onIdentityChanged !== "function") {
      throw new TypeError(
        "onIdentityChanged deve ser função."
      );
    }
    this.sandbox = sandbox;
    this.projectService = projectService;
    this.store = store;
    this.identity = identity;
    this.debounceMs = Math.max(0, Number(debounceMs) || 0);
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.now = now;
    this.onIdentityChanged = onIdentityChanged;
    this.sandboxId = null;
  }

  async initialize() {
    if (this.#started) return this.status();
    this.#started = true;
    this.sandboxId = this.identity.current();

    if (!this.store.available) {
      this.#attach();
      return this.status("unavailable");
    }

    try {
      this.#pendingRecord = await this.store.load(this.sandboxId);
      if (!this.#pendingRecord) {
        this.#attach();
        this.#schedulePersist();
        return this.status("empty");
      }
      if (!this.#pendingRecord.dirty) {
        const result = this.#restore(this.#pendingRecord);
        this.#pendingRecord = null;
        this.#attach();
        this.#schedulePersist();
        return this.status("restored-clean", { result });
      }
      return this.status("draft");
    } catch (error) {
      this.#lastError = error;
      this.#pendingRecord = null;
      this.#attach();
      return this.status("error");
    }
  }

  adoptCurrentSession(sandboxId = this.identity.current()) {
    if (this.#started) return this.status();
    const nextId = String(sandboxId ?? "");
    if (!/^sandbox-[a-zA-Z0-9-]{8,}$/.test(nextId)) {
      throw new TypeError(
        "Não é possível adotar recuperação sem sandboxId válido."
      );
    }
    this.#started = true;
    this.sandboxId = nextId;
    this.#pendingRecord = null;
    this.#attach();
    this.#schedulePersist();
    return this.status("adopted-current");
  }

  async continueRecovery() {
    if (!this.#pendingRecord) {
      return this.status("empty");
    }
    const result = this.#restore(this.#pendingRecord);
    this.#pendingRecord = null;
    this.#attach();
    this.#schedulePersist();
    return this.status("continued", { result });
  }

  prepareExport() {
    if (!this.#pendingRecord) {
      throw new Error("Não há rascunho recuperável para exportar.");
    }
    return this.projectService.prepareRecoveryExport(
      this.#pendingRecord
    );
  }

  async discardRecovery() {
    if (this.#pendingRecord) {
      await this.store.delete(this.sandboxId);
    }
    this.#pendingRecord = null;
    this.#attach();
    this.#schedulePersist();
    return this.status("discarded");
  }

  async flush() {
    if (
      this.#suspended ||
      !this.#started ||
      this.#pendingRecord
    ) {
      return false;
    }
    this.#cancelTimer();
    const flushStartedAt = performanceNow();
    const buildStartedAt = performanceNow();
    const proposal = this.sandbox.createProposal();
    const record = createRecoveryRecord({
      sandboxId: this.sandboxId,
      checkpoint: this.projectService.createCheckpoint(),
      commands: proposal.commands,
      baseVersion: proposal.baseVersion,
      revision: this.sandbox.revision,
      dirty: this.sandbox.dirty,
      updatedAt: this.now().toISOString()
    });
    const buildMs = performanceNow() - buildStartedAt;
    const storeStartedAt = performanceNow();
    try {
      const saved = await this.store.save(record);
      this.#recordFlushPerformance(
        buildMs,
        performanceNow() - storeStartedAt,
        performanceNow() - flushStartedAt
      );
      this.#lastError = null;
      return saved;
    } catch (error) {
      this.#recordFlushPerformance(
        buildMs,
        performanceNow() - storeStartedAt,
        performanceNow() - flushStartedAt
      );
      this.#lastError = error;
      return false;
    }
  }

  status(mode = null, extra = {}) {
    return Object.freeze({
      mode: mode ?? (
        this.#pendingRecord?.dirty ? "draft" : "active"
      ),
      sandboxId: this.sandboxId,
      available: Boolean(this.store.available),
      pending: this.#pendingRecord
        ? Object.freeze({
            dirty: this.#pendingRecord.dirty,
            commandCount: this.#pendingRecord.commands.length,
            revision: this.#pendingRecord.revision,
            updatedAt: this.#pendingRecord.updatedAt,
            projectName:
              this.#pendingRecord.checkpoint.metadata?.name ??
              "Projeto Spatial Seed"
          })
        : null,
      lastError: this.#lastError?.message ?? null,
      performance: Object.freeze({ ...this.#performance }),
      ...extra
    });
  }

  dispose() {
    this.#cancelTimer();
    this.#sandboxUnsubscribe?.();
    this.#projectUnsubscribe?.();
    this.#sandboxUnsubscribe = null;
    this.#projectUnsubscribe = null;
  }

  #restore(record) {
    this.#suspended = true;
    try {
      return this.projectService.restoreRecovery(
        validateRecoveryRecord(record)
      );
    } finally {
      this.#suspended = false;
    }
  }

  #attach() {
    if (this.#sandboxUnsubscribe) return;
    this.#sandboxUnsubscribe = this.sandbox.subscribe(() => {
      if (!this.#suspended) this.#schedulePersist();
    });
    this.#projectUnsubscribe = this.projectService.subscribe(event => {
      if (
        event.type !== "project-opened" &&
        event.type !== "project-created"
      ) {
        return;
      }
      this.#replaceIdentity();
    });
  }

  #replaceIdentity() {
    const previousId = this.sandboxId;
    this.#cancelTimer();
    this.sandboxId = this.identity.rotate();
    try {
      this.onIdentityChanged(Object.freeze({
        previousId,
        sandboxId: this.sandboxId
      }));
    } catch (error) {
      this.#lastError = error;
    }
    Promise.resolve(this.store.delete(previousId)).catch(error => {
      this.#lastError = error;
    });
    this.#schedulePersist();
  }

  #schedulePersist() {
    if (this.#suspended || !this.setTimer) return;
    this.#cancelTimer();
    this.#timer = this.setTimer(
      () => {
        this.#timer = null;
        void this.flush();
      },
      this.debounceMs
    );
  }

  #cancelTimer() {
    if (this.#timer !== null && this.clearTimer) {
      this.clearTimer(this.#timer);
    }
    this.#timer = null;
  }

  #recordFlushPerformance(buildMs, storeMs, flushMs) {
    this.#performance.flushes += 1;
    this.#performance.lastBuildMs = buildMs;
    this.#performance.maximumBuildMs = Math.max(
      this.#performance.maximumBuildMs,
      buildMs
    );
    this.#performance.lastStoreMs = storeMs;
    this.#performance.maximumStoreMs = Math.max(
      this.#performance.maximumStoreMs,
      storeMs
    );
    this.#performance.lastFlushMs = flushMs;
    this.#performance.maximumFlushMs = Math.max(
      this.#performance.maximumFlushMs,
      flushMs
    );
  }
}

function performanceNow() {
  return typeof globalThis.performance?.now === "function"
    ? globalThis.performance.now()
    : Date.now();
}
