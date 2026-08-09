const MESSAGE_FORMAT = "spatial-seed-local-transform-preview";
const MESSAGE_VERSION = 1;

export class LocalTransformPreviewCoordinator {
  static apiVersion = "local-transform-preview-coordinator-v1";

  #listeners = new Set();
  #channel = null;
  #unsubscribeSandbox = () => {};
  #started = false;
  #disposed = false;
  #sequence = 0;
  #localSession = null;
  #remoteSessions = new Map();
  #lastSentAt = -Infinity;
  #releaseTimers = new Map();
  #lastError = null;
  #diagnostics = {
    sessionsStarted: 0,
    updatesSent: 0,
    updatesThrottled: 0,
    updatesReceived: 0,
    sessionsReleased: 0,
    staleMessagesIgnored: 0
  };

  constructor({
    sandbox,
    sandboxId,
    viewerId,
    adapter,
    channelFactory = defaultChannelFactory,
    now = performanceNow,
    setTimeoutFn = globalThis.setTimeout?.bind(globalThis),
    clearTimeoutFn = globalThis.clearTimeout?.bind(globalThis),
    maximumHz = 30,
    releaseAfterMs = 1600
  } = {}) {
    if (!sandbox?.subscribe || !Number.isInteger(sandbox?.revision)) {
      throw new TypeError(
        "Coordenação de preview exige um Sandbox."
      );
    }
    if (!isSandboxId(sandboxId)) {
      throw new TypeError("Identidade de sandbox inválida.");
    }
    if (!String(viewerId ?? "").trim()) {
      throw new TypeError("Identidade de viewer inválida.");
    }
    for (const method of ["apply", "clear"]) {
      if (typeof adapter?.[method] !== "function") {
        throw new TypeError(
          `Adaptador de preview compartilhado sem ${method}().`
        );
      }
    }
    this.sandbox = sandbox;
    this.sandboxId = String(sandboxId);
    this.viewerId = String(viewerId);
    this.adapter = adapter;
    this.channelFactory = channelFactory;
    this.now = now;
    this.setTimeoutFn = setTimeoutFn;
    this.clearTimeoutFn = clearTimeoutFn;
    this.minimumIntervalMs = 1000 / Math.max(
      1,
      Math.min(120, Number(maximumHz) || 30)
    );
    this.releaseAfterMs = Math.max(
      100,
      Number(releaseAfterMs) || 1600
    );
  }

  start() {
    if (this.#started) return this.status();
    this.#started = true;
    this.#openChannel();
    this.#unsubscribeSandbox = this.sandbox.subscribe(
      (_state, changes) => this.#sandboxChanged(changes)
    );
    this.#notify();
    return this.status();
  }

  begin({
    previewId,
    transforms = []
  } = {}) {
    this.#assertActive();
    const id = requiredText(previewId, "Identificador do preview");
    this.#sequence += 1;
    this.#localSession = previewSession({
      previewId: id,
      source: this.viewerId,
      sequence: this.#sequence,
      phase: "active",
      baseRevision: this.sandbox.revision,
      transforms
    });
    this.#lastSentAt = -Infinity;
    this.#diagnostics.sessionsStarted += 1;
    this.adapter.apply(this.#localSession);
    this.#post("preview", this.#localSession);
    this.#notify();
    return this.status();
  }

  update({
    previewId,
    transforms = []
  } = {}) {
    this.#assertActive();
    const id = requiredText(previewId, "Identificador do preview");
    if (!this.#localSession || this.#localSession.previewId !== id) {
      return this.begin({ previewId: id, transforms });
    }
    this.#sequence += 1;
    this.#localSession = previewSession({
      ...this.#localSession,
      sequence: this.#sequence,
      phase: "active",
      transforms
    });
    this.adapter.apply(this.#localSession);
    const now = this.now();
    if (now - this.#lastSentAt >= this.minimumIntervalMs) {
      this.#lastSentAt = now;
      this.#post("preview", this.#localSession);
      this.#diagnostics.updatesSent += 1;
    } else {
      this.#diagnostics.updatesThrottled += 1;
    }
    this.#notify();
    return this.status();
  }

  end({
    previewId,
    transforms = [],
    committed = true
  } = {}) {
    this.#assertActive();
    const id = requiredText(previewId, "Identificador do preview");
    if (!this.#localSession || this.#localSession.previewId !== id) {
      return this.status();
    }
    this.#sequence += 1;
    this.#localSession = previewSession({
      ...this.#localSession,
      sequence: this.#sequence,
      phase: committed ? "committing" : "cancelled",
      transforms
    });
    if (committed) {
      this.adapter.apply(this.#localSession);
      this.#scheduleRelease(this.#localSession);
    } else {
      this.adapter.clear(this.#localSession);
    }
    this.#post("preview", this.#localSession);
    if (!committed) this.#localSession = null;
    this.#notify();
    return this.status();
  }

  cancel(previewId = this.#localSession?.previewId) {
    if (!previewId || !this.#localSession) return this.status();
    return this.end({
      previewId,
      transforms: this.#localSession.transforms,
      committed: false
    });
  }

  switchSandbox(nextSandboxId) {
    this.#assertActive();
    const nextId = String(nextSandboxId ?? "");
    if (!isSandboxId(nextId)) {
      throw new TypeError("Nova identidade de sandbox inválida.");
    }
    if (nextId === this.sandboxId) return this.status();
    this.#releaseAll("sandbox-switched");
    this.#closeChannel();
    this.sandboxId = nextId;
    this.#openChannel();
    this.#notify();
    return this.status();
  }

  projectionApplied(revision) {
    this.#assertActive();
    const appliedRevision = Number(revision);
    if (!Number.isInteger(appliedRevision) || appliedRevision < 0) {
      throw new TypeError("Revisão projetada inválida.");
    }
    if (
      this.#localSession?.phase === "committing" &&
      appliedRevision > this.#localSession.baseRevision
    ) {
      this.adapter.clear(this.#localSession);
      this.#clearReleaseTimer(this.viewerId);
      this.#localSession = null;
      this.#diagnostics.sessionsReleased += 1;
    }
    for (const [source, session] of [...this.#remoteSessions]) {
      if (
        session.phase !== "committing" ||
        appliedRevision <= session.baseRevision
      ) continue;
      this.adapter.clear(session);
      this.#remoteSessions.delete(source);
      this.#clearReleaseTimer(source);
      this.#diagnostics.sessionsReleased += 1;
    }
    this.#notify();
    return this.status();
  }

  status() {
    return Object.freeze({
      apiVersion: LocalTransformPreviewCoordinator.apiVersion,
      available: Boolean(this.#channel),
      sandboxId: this.sandboxId,
      viewerId: this.viewerId,
      maximumHz: Math.round(1000 / this.minimumIntervalMs),
      localPreviewId: this.#localSession?.previewId ?? null,
      remotePreviewCount: this.#remoteSessions.size,
      lastError: this.#lastError?.message ?? null,
      diagnostics: Object.freeze({ ...this.#diagnostics })
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
    this.#post("bye", {});
    this.#unsubscribeSandbox();
    this.#unsubscribeSandbox = () => {};
    this.#releaseAll("disposed");
    this.#closeChannel();
    this.#listeners.clear();
    return true;
  }

  #receiveMessage = event => {
    const message = event?.data;
    if (!validMessage(message, this.sandboxId, this.viewerId)) return;
    try {
      if (message.type === "preview") {
        this.#acceptRemote(message.payload);
      } else if (message.type === "bye") {
        this.#releaseRemoteSource(message.source);
      }
    } catch (error) {
      this.#lastError = error;
    }
    this.#notify();
  };

  #acceptRemote(payload = {}) {
    const session = previewSession(payload);
    const previous = this.#remoteSessions.get(session.source);
    if (previous && session.sequence <= previous.sequence) {
      this.#diagnostics.staleMessagesIgnored += 1;
      return false;
    }
    if (session.phase === "cancelled") {
      if (previous) {
        this.adapter.clear(previous);
        this.#remoteSessions.delete(session.source);
        this.#diagnostics.sessionsReleased += 1;
      }
      return true;
    }
    this.#remoteSessions.set(session.source, session);
    this.adapter.apply(session);
    this.#diagnostics.updatesReceived += 1;
    if (session.phase === "committing") {
      this.#scheduleRelease(session);
    }
    return true;
  }

  #sandboxChanged(changes = []) {
    if (
      !changes.length ||
      changes.every(change => change?.type === "initial")
    ) {
      return;
    }
    /*
     * Um commit altera o Sandbox de forma síncrona, mas a projeção visual só
     * instala essa revisão no quadro seguinte. A camada em fase `committing`
     * é a barreira entre essas duas épocas e não pode ser retirada pelo mesmo
     * evento que aceitou o comando. Sessões ainda `active` são obsoletas e
     * continuam sendo canceladas quando outra mutação modifica sua base.
     */
    if (this.#localSession?.phase !== "committing") {
      if (this.#localSession) {
        this.adapter.clear(this.#localSession);
        this.#localSession = null;
        this.#diagnostics.sessionsReleased += 1;
      }
    }
    for (const [source, session] of [...this.#remoteSessions]) {
      if (session.phase === "committing") continue;
      this.adapter.clear(session);
      this.#remoteSessions.delete(source);
      this.#clearReleaseTimer(source);
      this.#diagnostics.sessionsReleased += 1;
    }
    this.#notify();
  }

  #scheduleRelease(session) {
    if (!this.setTimeoutFn) return;
    const key = session.source;
    const previous = this.#releaseTimers.get(key);
    if (previous !== undefined) this.clearTimeoutFn?.(previous);
    const timer = this.setTimeoutFn(() => {
      this.#releaseTimers.delete(key);
      if (key === this.viewerId) {
        if (this.#localSession?.previewId === session.previewId) {
          this.adapter.clear(this.#localSession);
          this.#localSession = null;
          this.#diagnostics.sessionsReleased += 1;
        }
      } else {
        const remote = this.#remoteSessions.get(key);
        if (remote?.previewId === session.previewId) {
          this.adapter.clear(remote);
          this.#remoteSessions.delete(key);
          this.#diagnostics.sessionsReleased += 1;
        }
      }
      this.#notify();
    }, this.releaseAfterMs);
    this.#releaseTimers.set(key, timer);
  }

  #releaseRemoteSource(source) {
    const session = this.#remoteSessions.get(source);
    if (!session) return false;
    this.adapter.clear(session);
    this.#remoteSessions.delete(source);
    this.#clearReleaseTimer(source);
    this.#diagnostics.sessionsReleased += 1;
    return true;
  }

  #releaseAll(_reason) {
    if (this.#localSession) {
      this.adapter.clear(this.#localSession);
      this.#localSession = null;
      this.#diagnostics.sessionsReleased += 1;
    }
    for (const session of this.#remoteSessions.values()) {
      this.adapter.clear(session);
      this.#diagnostics.sessionsReleased += 1;
    }
    this.#remoteSessions.clear();
    for (const key of [...this.#releaseTimers.keys()]) {
      this.#clearReleaseTimer(key);
    }
  }

  #clearReleaseTimer(key) {
    const timer = this.#releaseTimers.get(key);
    if (timer !== undefined) this.clearTimeoutFn?.(timer);
    this.#releaseTimers.delete(key);
  }

  #post(type, payload) {
    if (!this.#channel) return false;
    this.#channel.postMessage({
      format: MESSAGE_FORMAT,
      schemaVersion: MESSAGE_VERSION,
      sandboxId: this.sandboxId,
      source: this.viewerId,
      type,
      payload: structuredClone(payload)
    });
    return true;
  }

  #openChannel() {
    try {
      this.#channel = this.channelFactory(
        `spatial-seed:${this.sandboxId}:transform-preview`
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
          "Transform preview subscriber failed",
          error
        );
      }
    }
  }

  #assertActive() {
    if (!this.#started || this.#disposed) {
      throw new Error("Coordenador de preview não está ativo.");
    }
  }
}

function previewSession({
  previewId,
  source,
  sequence,
  phase,
  baseRevision,
  transforms
} = {}) {
  const normalizedPhase = String(phase ?? "active");
  if (!["active", "committing", "cancelled"].includes(normalizedPhase)) {
    throw new RangeError(`Fase de preview inválida: ${normalizedPhase}.`);
  }
  const normalizedSequence = Number(sequence);
  const normalizedRevision = Number(baseRevision);
  if (!Number.isInteger(normalizedSequence) || normalizedSequence < 0) {
    throw new TypeError("Sequência de preview inválida.");
  }
  if (!Number.isInteger(normalizedRevision) || normalizedRevision < 0) {
    throw new TypeError("Revisão-base de preview inválida.");
  }
  return deepFreeze({
    previewId: requiredText(previewId, "Identificador do preview"),
    source: requiredText(source, "Origem do preview"),
    sequence: normalizedSequence,
    phase: normalizedPhase,
    baseRevision: normalizedRevision,
    transforms: normalizeTransforms(transforms)
  });
}

function normalizeTransforms(transforms = []) {
  if (!Array.isArray(transforms)) {
    throw new TypeError("Transformações de preview devem formar um array.");
  }
  const seen = new Set();
  return transforms.map(entry => {
    const id = requiredText(
      entry?.id ?? entry?.objectId,
      "Objeto do preview"
    );
    if (seen.has(id)) {
      throw new Error(`Objeto repetido no preview: ${id}.`);
    }
    seen.add(id);
    if (
      !Array.isArray(entry?.worldMatrix) ||
      entry.worldMatrix.length !== 16 ||
      !entry.worldMatrix.every(Number.isFinite)
    ) {
      throw new TypeError(`Matriz mundial inválida para ${id}.`);
    }
    return {
      id,
      worldMatrix: entry.worldMatrix.map(Number)
    };
  });
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

function defaultChannelFactory(name) {
  if (typeof globalThis.BroadcastChannel !== "function") {
    throw new Error("BroadcastChannel indisponível.");
  }
  return new globalThis.BroadcastChannel(name);
}

function isSandboxId(value) {
  return /^sandbox-[a-zA-Z0-9-]{8,}$/.test(
    String(value ?? "")
  );
}

function requiredText(value, label) {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    throw new TypeError(`${label} deve ser texto não vazio.`);
  }
  return normalized;
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function performanceNow() {
  return typeof globalThis.performance?.now === "function"
    ? globalThis.performance.now()
    : Date.now();
}
