const MESSAGE_FORMAT = "spatial-seed-local-viewer";
const MESSAGE_VERSION = 1;

export class LocalViewerCoordinator {
  static apiVersion = "local-viewer-coordinator-v1";

  #listeners = new Set();
  #peers = new Map();
  #channel = null;
  #unsubscribeSandbox = null;
  #snapshotAdapter = null;
  #started = false;
  #disposed = false;
  #broadcastScheduled = false;
  #applyingRemoteIntent = false;
  #intentQueue = [];
  #inFlight = null;
  #lastOutcome = null;
  #lastError = null;
  #releaseLock = null;
  #lockTask = null;
  #promotionTask = null;
  #promotionAbort = null;

  constructor({
    sandbox,
    sandboxId,
    viewerId = createId(),
    requestedRole = "auto",
    channelFactory = defaultChannelFactory,
    lockManager = globalThis.navigator?.locks ?? null,
    now = () => Date.now()
  } = {}) {
    if (!sandbox?.dispatch || !sandbox?.restoreCommandSequence) {
      throw new TypeError(
        "LocalViewerCoordinator exige um Sandbox."
      );
    }
    if (!isSandboxId(sandboxId)) {
      throw new TypeError("Identidade de sandbox inválida.");
    }
    if (!["auto", "authority", "replica"].includes(requestedRole)) {
      throw new RangeError(
        `Papel de viewer desconhecido: ${requestedRole}.`
      );
    }
    this.sandbox = sandbox;
    this.sandboxId = String(sandboxId);
    this.viewerId = String(viewerId);
    this.requestedRole = requestedRole;
    this.channelFactory = channelFactory;
    this.lockManager = lockManager;
    this.now = now;
    this.role = "starting";
    this.sharedRevision = sandbox.revision;
    this.sharedHistory = historySnapshot(sandbox);
  }

  get isAuthority() {
    return this.role === "authority";
  }

  connectSnapshotAdapter({
    capture,
    restore,
    prepareIntent = command => ({ command }),
    applyIntent = payload =>
      this.sandbox.dispatch(payload.command)
  } = {}) {
    if (
      typeof capture !== "function" ||
      typeof restore !== "function" ||
      typeof prepareIntent !== "function" ||
      typeof applyIntent !== "function"
    ) {
      throw new TypeError(
        "Adaptador compartilhado exige capture, restore, " +
        "prepareIntent e applyIntent."
      );
    }
    this.#snapshotAdapter = {
      capture,
      restore,
      prepareIntent,
      applyIntent
    };
    return this;
  }

  async start() {
    if (this.#started) return this.status();
    if (!this.#snapshotAdapter) {
      throw new Error(
        "Conecte o adaptador de snapshot antes de iniciar viewers."
      );
    }
    this.#started = true;
    this.role = await this.#resolveRole();
    this.#openChannel();
    this.#unsubscribeSandbox = this.sandbox.subscribe(
      (_state, changes) => this.#sandboxChanged(changes)
    );
    this.#post("hello", {
      role: this.role,
      revision: this.sandbox.revision
    });
    if (!this.isAuthority) {
      this.#post("sync-request", {
        revision: this.sandbox.revision
      });
    }
    this.#notify();
    return this.status();
  }

  dispatch(command) {
    this.#assertActive();
    if (this.isAuthority) {
      return this.sandbox.dispatch(command);
    }
    this.#queueIntent("dispatch", {
      payload: this.#snapshotAdapter.prepareIntent(
        structuredClone(command)
      )
    });
    return true;
  }

  undo() {
    this.#assertActive();
    if (this.isAuthority) return this.sandbox.undo();
    if (!this.sharedHistory.canUndo) return false;
    this.#queueIntent("undo");
    return true;
  }

  redo() {
    this.#assertActive();
    if (this.isAuthority) return this.sandbox.redo();
    if (!this.sharedHistory.canRedo) return false;
    this.#queueIntent("redo");
    return true;
  }

  requireAuthority(action = "alterar o sandbox") {
    if (this.isAuthority) return true;
    throw new Error(
      `Somente o viewer autoritativo pode ${action}. ` +
      "As câmeras e seleções deste viewer continuam locais."
    );
  }

  requestSync() {
    this.#assertActive();
    if (this.isAuthority) {
      this.#broadcastSnapshot();
      return this.status();
    }
    this.#post("sync-request", {
      revision: this.sandbox.revision
    });
    return this.status();
  }

  switchSandbox(nextSandboxId) {
    this.#assertActive();
    this.requireAuthority("trocar a identidade compartilhada");
    const nextId = String(nextSandboxId ?? "");
    if (!isSandboxId(nextId)) {
      throw new TypeError("Nova identidade de sandbox inválida.");
    }
    if (nextId === this.sandboxId) return this.status();

    this.#cancelPromotionWait();
    const snapshot = this.#captureSnapshot(nextId);
    this.#post("sandbox-switch", {
      nextSandboxId: nextId,
      snapshot,
      history: historySnapshot(this.sandbox)
    });
    this.#closeChannel();
    this.#peers.clear();
    this.sandboxId = nextId;
    this.sharedRevision = this.sandbox.revision;
    this.#renewAuthorityLock();
    this.#openChannel();
    this.#post("hello", {
      role: this.role,
      revision: this.sandbox.revision
    });
    this.#notify();
    return this.status();
  }

  viewerUrl(
    href = globalThis.location?.href,
    { sandboxId = this.sandboxId } = {}
  ) {
    if (!this.#channel) {
      throw new Error(
        "Não é possível abrir outro viewer: BroadcastChannel indisponível."
      );
    }
    return createSharedViewerUrl(href, {
      sandboxId
    });
  }

  status() {
    const peers = [...this.#peers.values()]
      .sort((left, right) =>
        left.viewerId.localeCompare(right.viewerId)
      )
      .map(peer => Object.freeze({ ...peer }));
    return Object.freeze({
      apiVersion: LocalViewerCoordinator.apiVersion,
      sandboxId: this.sandboxId,
      viewerId: this.viewerId,
      role: this.role,
      available: Boolean(this.#channel),
      sharedRevision: this.sharedRevision,
      localRevision: this.sandbox.revision,
      canUndo: this.sharedHistory.canUndo,
      canRedo: this.sharedHistory.canRedo,
      pendingIntents:
        this.#intentQueue.length + (this.#inFlight ? 1 : 0),
      peers: Object.freeze(peers),
      authorityViewerId: this.isAuthority
        ? this.viewerId
        : peers.find(peer => peer.role === "authority")?.viewerId ?? null,
      lastOutcome: this.#lastOutcome
        ? structuredClone(this.#lastOutcome)
        : null,
      lastError: this.#lastError?.message ?? null
    });
  }

  subscribe(listener) {
    this.#listeners.add(listener);
    listener(this.status());
    return () => this.#listeners.delete(listener);
  }

  dispose() {
    if (this.#disposed) return false;
    this.#disposed = true;
    this.#post("bye", { role: this.role });
    this.#unsubscribeSandbox?.();
    this.#unsubscribeSandbox = null;
    this.#closeChannel();
    this.#cancelPromotionWait();
    this.#releaseLock?.();
    this.#releaseLock = null;
    this.#listeners.clear();
    return true;
  }

  async #resolveRole() {
    if (this.requestedRole !== "auto") {
      return this.requestedRole;
    }
    if (typeof this.lockManager?.request !== "function") {
      return "authority";
    }
    return await this.#tryAcquireAuthorityLock()
      ? "authority"
      : "replica";
  }

  async #tryAcquireAuthorityLock() {
    let resolveDecision;
    const decision = new Promise(resolve => {
      resolveDecision = resolve;
    });
    const name = `spatial-seed:${this.sandboxId}:authority`;
    try {
      this.#lockTask = Promise.resolve(
        this.lockManager.request(
          name,
          { mode: "exclusive", ifAvailable: true },
          lock => {
            if (!lock) {
              resolveDecision(false);
              return false;
            }
            resolveDecision(true);
            return new Promise(resolve => {
              this.#releaseLock = resolve;
            });
          }
        )
      ).catch(error => {
        this.#lastError = error;
        resolveDecision(false);
      });
    } catch (error) {
      this.#lastError = error;
      resolveDecision(false);
    }
    return decision;
  }

  #renewAuthorityLock() {
    if (
      this.requestedRole !== "auto" ||
      typeof this.lockManager?.request !== "function"
    ) {
      return;
    }
    this.#releaseLock?.();
    this.#releaseLock = null;
    void this.#tryAcquireAuthorityLock().then(acquired => {
      if (!acquired) {
        this.#lastError = new Error(
          "A nova identidade não obteve a trava local de autoridade."
        );
        this.#notify();
      }
    });
  }

  #openChannel() {
    try {
      this.#channel = this.channelFactory(
        `spatial-seed:${this.sandboxId}`
      );
      this.#channel?.addEventListener?.(
        "message",
        this.#receiveMessage
      );
    } catch (error) {
      this.#channel = null;
      this.#lastError = error;
    }
  }

  #receiveMessage = event => {
    const message = event?.data;
    if (!validMessage(message, this.sandboxId, this.viewerId)) return;
    this.#rememberPeer(message);

    try {
      switch (message.type) {
        case "hello":
          if (this.isAuthority) {
            this.#sendSnapshot(message.source);
          } else if (message.payload?.role === "authority") {
            this.#cancelPromotionWait();
          }
          break;
        case "bye":
          {
            const departing = this.#peers.get(message.source);
            this.#peers.delete(message.source);
            if (departing?.role === "authority") {
              void this.#promoteAfterAuthorityDeparture();
            }
          }
          break;
        case "sync-request":
          if (this.isAuthority) {
            this.#sendSnapshot(message.source);
          }
          break;
        case "sync":
          if (!this.isAuthority && isFor(message, this.viewerId)) {
            this.#applySnapshot(message.payload.snapshot);
            this.#applyHistory(message.payload.history);
          }
          break;
        case "sandbox-switch":
          if (!this.isAuthority && isFor(message, this.viewerId)) {
            this.#followSandboxSwitch(message.payload);
          }
          break;
        case "intent":
          if (this.isAuthority) {
            this.#acceptIntent(message);
          }
          break;
        case "intent-result":
          if (!this.isAuthority && isFor(message, this.viewerId)) {
            this.#completeIntent(message.payload);
          }
          break;
        default:
          break;
      }
    } catch (error) {
      this.#lastError = error;
    }
    this.#notify();
  };

  #rememberPeer(message) {
    this.#peers.set(message.source, {
      viewerId: message.source,
      role: String(message.payload?.role ?? "unknown"),
      revision: Number(message.payload?.revision ?? 0),
      lastSeen: new Date(this.now()).toISOString()
    });
  }

  async #promoteAfterAuthorityDeparture() {
    if (
      this.#promotionTask ||
      this.#disposed ||
      this.isAuthority ||
      this.requestedRole !== "auto"
    ) {
      return false;
    }
    this.#promotionTask = this.#waitForAuthorityLock();
    try {
      const acquired = await this.#promotionTask;
      if (!acquired || this.#disposed) return false;
      this.role = "authority";
      this.sharedRevision = this.sandbox.revision;
      this.sharedHistory = historySnapshot(this.sandbox);
      this.#post("hello", {
        role: this.role,
        revision: this.sandbox.revision
      });
      this.#broadcastSnapshot();
      this.#notify();
      return true;
    } finally {
      this.#promotionTask = null;
    }
  }

  #waitForAuthorityLock() {
    if (typeof this.lockManager?.request !== "function") {
      return Promise.resolve(false);
    }
    let resolveDecision;
    const decision = new Promise(resolve => {
      resolveDecision = resolve;
    });
    const name = `spatial-seed:${this.sandboxId}:authority`;
    const AbortControllerClass = globalThis.AbortController;
    const abort = typeof AbortControllerClass === "function"
      ? new AbortControllerClass()
      : null;
    this.#promotionAbort = abort;
    const options = {
      mode: "exclusive",
      ...(abort ? { signal: abort.signal } : {})
    };
    try {
      this.#lockTask = Promise.resolve(
        this.lockManager.request(name, options, lock => {
          if (!lock || this.#disposed) {
            resolveDecision(false);
            return false;
          }
          this.#promotionAbort = null;
          resolveDecision(true);
          return new Promise(resolve => {
            this.#releaseLock = resolve;
          });
        })
      ).catch(error => {
        if (error?.name !== "AbortError") {
          this.#lastError = error;
        }
        resolveDecision(false);
      });
    } catch (error) {
      this.#lastError = error;
      resolveDecision(false);
    }
    return decision;
  }

  #cancelPromotionWait() {
    this.#promotionAbort?.abort();
    this.#promotionAbort = null;
  }

  #sandboxChanged(changes = []) {
    this.sharedRevision = this.sandbox.revision;
    if (this.isAuthority) {
      this.sharedHistory = historySnapshot(this.sandbox);
    }
    if (
      !this.isAuthority ||
      this.#applyingRemoteIntent ||
      changes.some(change => change?.type === "initial")
    ) {
      return;
    }
    if (this.#broadcastScheduled) return;
    this.#broadcastScheduled = true;
    queueMicrotask(() => {
      this.#broadcastScheduled = false;
      if (!this.#disposed && this.isAuthority) {
        this.#broadcastSnapshot();
      }
    });
  }

  #queueIntent(operation, extra = {}) {
    if (!this.#channel) {
      throw new Error(
        "A réplica não pode editar sem o canal de coordenação local."
      );
    }
    const request = {
      requestId: createId(),
      operation,
      ...structuredClone(extra)
    };
    this.#intentQueue.push(request);
    this.#lastOutcome = {
      status: "queued",
      requestId: request.requestId,
      operation
    };
    this.#pumpIntentQueue();
    this.#notify();
  }

  #pumpIntentQueue() {
    if (this.#inFlight || !this.#intentQueue.length) return;
    this.#inFlight = this.#intentQueue.shift();
    this.#post("intent", {
      ...this.#inFlight,
      baseRevision: this.sharedRevision
    });
  }

  #acceptIntent(message) {
    const intent = message.payload ?? {};
    if (Number(intent.baseRevision) !== this.sandbox.revision) {
      this.#sendIntentResult(message.source, intent.requestId, {
        status: "rejected-stale",
        expectedRevision: this.sandbox.revision,
        observedRevision: Number(intent.baseRevision),
        snapshot: this.#captureSnapshot(),
        history: historySnapshot(this.sandbox)
      });
      return;
    }

    let changed = false;
    this.#applyingRemoteIntent = true;
    try {
      if (intent.operation === "dispatch") {
        changed = this.#snapshotAdapter.applyIntent(
          structuredClone(intent.payload)
        );
      } else if (intent.operation === "undo") {
        changed = this.sandbox.undo();
      } else if (intent.operation === "redo") {
        changed = this.sandbox.redo();
      } else {
        throw new Error(
          `Intenção local desconhecida: ${intent.operation}.`
        );
      }
    } catch (error) {
      this.#sendIntentResult(message.source, intent.requestId, {
        status: "rejected-error",
        error: error?.message ?? String(error),
        snapshot: this.#captureSnapshot(),
        history: historySnapshot(this.sandbox)
      });
      return;
    } finally {
      this.#applyingRemoteIntent = false;
    }

    const snapshot = this.#captureSnapshot();
    const status = changed ? "accepted" : "rejected-no-change";
    this.#sendIntentResult(message.source, intent.requestId, {
      status,
      revision: this.sandbox.revision,
      snapshot,
      history: historySnapshot(this.sandbox)
    });
    this.#post("sync", {
      snapshot,
      history: historySnapshot(this.sandbox)
    });
    this.#notify();
  }

  #completeIntent(result = {}) {
    if (
      !this.#inFlight ||
      result.requestId !== this.#inFlight.requestId
    ) {
      return;
    }
    if (result.snapshot) {
      this.#applySnapshot(result.snapshot);
    }
    this.#applyHistory(result.history);
    const accepted = result.status === "accepted";
    this.#lastOutcome = {
      status: result.status,
      requestId: result.requestId,
      revision: result.revision ?? this.sharedRevision,
      expectedRevision: result.expectedRevision ?? null,
      observedRevision: result.observedRevision ?? null,
      error: result.error ?? null
    };
    this.#inFlight = null;
    if (!accepted) {
      this.#intentQueue.length = 0;
    }
    this.#pumpIntentQueue();
  }

  #sendSnapshot(target = null) {
    this.#post("sync", {
      target,
      snapshot: this.#captureSnapshot(),
      history: historySnapshot(this.sandbox)
    });
  }

  #followSandboxSwitch(payload = {}) {
    const nextId = String(payload.nextSandboxId ?? "");
    if (!isSandboxId(nextId) || !payload.snapshot) {
      throw new TypeError(
        "Troca de sandbox compartilhado inválida."
      );
    }
    this.#cancelPromotionWait();
    if (this.#inFlight || this.#intentQueue.length) {
      this.#lastOutcome = {
        status: "rejected-sandbox-replaced",
        requestId:
          this.#inFlight?.requestId ??
          this.#intentQueue[0]?.requestId ??
          null,
        revision: Number(payload.snapshot.revision)
      };
      this.#inFlight = null;
      this.#intentQueue.length = 0;
    }
    this.#applySnapshot(payload.snapshot);
    this.#applyHistory(payload.history);
    this.#closeChannel();
    this.#peers.clear();
    this.sandboxId = nextId;
    this.#openChannel();
    this.#post("hello", {
      role: this.role,
      revision: this.sandbox.revision
    });
  }

  #broadcastSnapshot() {
    if (!this.#channel || !this.isAuthority) return;
    this.#sendSnapshot();
  }

  #captureSnapshot(sandboxId = this.sandboxId) {
    const snapshot = this.#snapshotAdapter.capture({
      sandboxId
    });
    this.sharedRevision = this.sandbox.revision;
    return structuredClone(snapshot);
  }

  #applySnapshot(snapshot) {
    const revision = Number(snapshot?.revision);
    if (!Number.isInteger(revision) || revision < 0) {
      throw new TypeError(
        "Snapshot compartilhado sem revisão válida."
      );
    }
    if (revision < this.sharedRevision) return false;
    this.#snapshotAdapter.restore(structuredClone(snapshot));
    this.sharedRevision = revision;
    return true;
  }

  #applyHistory(history) {
    if (!history || typeof history !== "object") return;
    this.sharedHistory = Object.freeze({
      canUndo: Boolean(history.canUndo),
      canRedo: Boolean(history.canRedo)
    });
  }

  #sendIntentResult(target, requestId, result) {
    this.#post("intent-result", {
      target,
      requestId,
      ...structuredClone(result)
    });
  }

  #post(type, payload = {}) {
    if (!this.#channel) return false;
    this.#channel.postMessage({
      format: MESSAGE_FORMAT,
      schemaVersion: MESSAGE_VERSION,
      sandboxId: this.sandboxId,
      source: this.viewerId,
      type,
      payload: {
        role: this.role,
        revision: this.sandbox.revision,
        ...structuredClone(payload)
      }
    });
    return true;
  }

  #closeChannel() {
    if (!this.#channel) return;
    this.#channel.removeEventListener?.(
      "message",
      this.#receiveMessage
    );
    this.#channel.close?.();
    this.#channel = null;
  }

  #notify() {
    const snapshot = this.status();
    for (const listener of this.#listeners) {
      try {
        listener(snapshot);
      } catch (error) {
        console.error(
          "LocalViewerCoordinator subscriber failed",
          error
        );
      }
    }
  }

  #assertActive() {
    if (!this.#started || this.#disposed) {
      throw new Error("Coordenador de viewers não está ativo.");
    }
  }
}

export function createSharedViewerUrl(
  href,
  { sandboxId } = {}
) {
  const url = new URL(String(href));
  if (!isSandboxId(sandboxId)) {
    throw new TypeError("Identidade de sandbox inválida.");
  }
  url.searchParams.set("sandbox", String(sandboxId));
  url.searchParams.set("viewer", "auto");
  return url.href;
}

function defaultChannelFactory(name) {
  if (typeof globalThis.BroadcastChannel !== "function") {
    throw new Error("BroadcastChannel indisponível.");
  }
  return new globalThis.BroadcastChannel(name);
}

function validMessage(message, sandboxId, viewerId) {
  return Boolean(
    message &&
    message.format === MESSAGE_FORMAT &&
    message.schemaVersion === MESSAGE_VERSION &&
    message.sandboxId === sandboxId &&
    message.source &&
    message.source !== viewerId &&
    typeof message.type === "string" &&
    message.payload &&
    typeof message.payload === "object"
  );
}

function isFor(message, viewerId) {
  const target = message.payload?.target;
  return target === null || target === undefined || target === viewerId;
}

function isSandboxId(value) {
  return /^sandbox-[a-zA-Z0-9-]{8,}$/.test(
    String(value ?? "")
  );
}

function createId() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function historySnapshot(sandbox) {
  return Object.freeze({
    canUndo: Boolean(sandbox.canUndo),
    canRedo: Boolean(sandbox.canRedo)
  });
}
