const MESSAGE_FORMAT = "spatial-seed-local-animation";
const MESSAGE_VERSION = 1;

export class LocalAnimationCoordinator {
  static apiVersion = "local-animation-coordinator-v1";

  #listeners = new Set();
  #channel = null;
  #unsubscribeSandbox = null;
  #started = false;
  #disposed = false;
  #lastOutcome = null;
  #lastError = null;

  constructor({
    sandbox,
    sandboxId,
    viewerId,
    isAuthority,
    adapter,
    channelFactory = defaultChannelFactory,
    now = () => Date.now()
  } = {}) {
    if (!sandbox?.subscribe || !Number.isInteger(sandbox?.revision)) {
      throw new TypeError(
        "LocalAnimationCoordinator exige um Sandbox."
      );
    }
    if (!isSandboxId(sandboxId)) {
      throw new TypeError("Identidade de sandbox inválida.");
    }
    if (!String(viewerId ?? "").trim()) {
      throw new TypeError("Identidade de viewer inválida.");
    }
    if (typeof isAuthority !== "function") {
      throw new TypeError("Coordenação de animação exige isAuthority().");
    }
    for (const method of ["prepare", "apply", "status"]) {
      if (typeof adapter?.[method] !== "function") {
        throw new TypeError(
          `Adaptador de animação compartilhada sem ${method}().`
        );
      }
    }

    this.sandbox = sandbox;
    this.sandboxId = String(sandboxId);
    this.viewerId = String(viewerId);
    this.isAuthority = isAuthority;
    this.adapter = adapter;
    this.channelFactory = channelFactory;
    this.now = now;
    this.session = initialSession();
  }

  start() {
    if (this.#started) return this.status();
    this.#started = true;
    this.#openChannel();
    this.#unsubscribeSandbox = this.sandbox.subscribe(
      (_state, changes) => this.#sandboxChanged(changes)
    );
    this.#post("hello", {
      authority: Boolean(this.isAuthority())
    });
    if (!this.isAuthority()) this.#post("session-request");
    this.#notify();
    return this.status();
  }

  play(operation, args = {}) {
    this.#assertActive();
    const descriptor = this.adapter.prepare(
      String(operation),
      structuredClone(args)
    );
    return this.#request("start", { descriptor });
  }

  pause() {
    this.#assertActive();
    return this.#request("pause");
  }

  resume() {
    this.#assertActive();
    return this.#request("resume");
  }

  stop(reason = "user") {
    this.#assertActive();
    return this.#request("stop", { reason: String(reason) });
  }

  sceneChanged(reason = "scene-changed") {
    if (this.session.state === "idle") return false;
    if (this.isAuthority()) {
      this.#transition("stop", {
        reason: String(reason)
      });
    } else {
      this.#applySession(idleAfter(this.session, {
        reason: String(reason),
        changedAtMs: this.now()
      }));
    }
    return true;
  }

  switchSandbox(nextSandboxId) {
    this.#assertActive();
    const nextId = String(nextSandboxId ?? "");
    if (!isSandboxId(nextId)) {
      throw new TypeError("Nova identidade de sandbox inválida.");
    }
    if (nextId === this.sandboxId) return this.status();

    if (this.session.state !== "idle") {
      if (this.isAuthority()) {
        this.#transition("stop", { reason: "sandbox-switched" });
      } else {
        this.#applySession(idleAfter(this.session, {
          reason: "sandbox-switched",
          changedAtMs: this.now()
        }));
      }
    }
    this.#closeChannel();
    this.sandboxId = nextId;
    this.session = initialSession();
    this.#openChannel();
    this.#post("hello", {
      authority: Boolean(this.isAuthority())
    });
    if (!this.isAuthority()) this.#post("session-request");
    this.#notify();
    return this.status();
  }

  status() {
    const local = this.adapter.status();
    return Object.freeze({
      ...local,
      shared: Object.freeze({
        apiVersion: LocalAnimationCoordinator.apiVersion,
        available: Boolean(this.#channel),
        sandboxId: this.sandboxId,
        viewerId: this.viewerId,
        authority: Boolean(this.isAuthority()),
        sequence: this.session.sequence,
        playbackId: this.session.playbackId,
        state: this.session.state,
        positionSeconds: round(sessionTime(this.session, this.now())),
        changedAtMs: this.session.changedAtMs,
        baseRevision: this.session.baseRevision,
        reason: this.session.reason,
        lastOutcome: this.#lastOutcome
          ? structuredClone(this.#lastOutcome)
          : null,
        lastError: this.#lastError?.message ?? null
      })
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
    this.#unsubscribeSandbox?.();
    this.#unsubscribeSandbox = null;
    try {
      this.adapter.apply(idleAfter(this.session, {
        reason: "disposed",
        changedAtMs: this.now()
      }), { now: this.now });
    } catch (error) {
      this.#lastError = error;
    }
    this.#post("bye");
    this.#closeChannel();
    this.#listeners.clear();
    return true;
  }

  #request(operation, extra = {}) {
    if (this.isAuthority()) {
      return this.#transition(operation, extra);
    }
    if (!this.#channel) {
      throw new Error(
        "A réplica não pode controlar animação sem o canal local."
      );
    }
    const requestId = createId();
    this.#lastOutcome = {
      status: "queued",
      requestId,
      operation
    };
    this.#post("session-intent", {
      requestId,
      operation,
      observedSequence: this.session.sequence,
      baseRevision: this.sandbox.revision,
      ...structuredClone(extra)
    });
    this.#notify();
    return this.status();
  }

  #transition(operation, payload = {}) {
    const previous = this.session;
    const changedAtMs = this.now();
    let next;

    if (operation === "start") {
      next = {
        sequence: previous.sequence + 1,
        playbackId: createId(),
        state: "playing",
        descriptor: structuredClone(payload.descriptor),
        positionSeconds: 0,
        changedAtMs,
        baseRevision: this.sandbox.revision,
        reason: null
      };
    } else if (operation === "pause") {
      if (previous.state !== "playing") {
        throw new Error("Nenhuma animação compartilhada para pausar.");
      }
      next = {
        ...structuredClone(previous),
        sequence: previous.sequence + 1,
        state: "paused",
        positionSeconds: sessionTime(previous, changedAtMs),
        changedAtMs,
        reason: null
      };
    } else if (operation === "resume") {
      if (previous.state !== "paused") {
        throw new Error("Nenhuma animação compartilhada para continuar.");
      }
      next = {
        ...structuredClone(previous),
        sequence: previous.sequence + 1,
        state: "playing",
        changedAtMs,
        reason: null
      };
    } else if (operation === "stop") {
      if (previous.state === "idle") return this.status();
      next = idleAfter(previous, {
        reason: payload.reason ?? "stopped",
        changedAtMs
      });
    } else {
      throw new Error(
        `Operação de animação compartilhada desconhecida: ${operation}.`
      );
    }

    this.#applySession(next);
    this.#lastOutcome = {
      status: "accepted",
      requestId: payload.requestId ?? null,
      operation,
      sequence: this.session.sequence
    };
    this.#broadcastSession();
    this.#notify();
    return this.status();
  }

  #acceptIntent(message) {
    const intent = message.payload ?? {};
    if (
      Number(intent.baseRevision) !== this.sandbox.revision ||
      Number(intent.observedSequence) !== this.session.sequence
    ) {
      this.#sendResult(message.source, intent.requestId, {
        status: "rejected-stale",
        operation: intent.operation,
        expectedRevision: this.sandbox.revision,
        observedRevision: Number(intent.baseRevision),
        expectedSequence: this.session.sequence,
        observedSequence: Number(intent.observedSequence),
        session: this.session
      });
      return;
    }

    try {
      this.#transition(intent.operation, {
        requestId: intent.requestId,
        descriptor: intent.descriptor,
        reason: intent.reason
      });
      this.#sendResult(message.source, intent.requestId, {
        status: "accepted",
        operation: intent.operation,
        sequence: this.session.sequence,
        session: this.session
      });
    } catch (error) {
      this.#sendResult(message.source, intent.requestId, {
        status: "rejected-error",
        operation: intent.operation,
        error: error?.message ?? String(error),
        session: this.session
      });
    }
  }

  #receiveMessage = event => {
    const message = event?.data;
    if (!validMessage(message, this.sandboxId, this.viewerId)) return;

    try {
      switch (message.type) {
        case "hello":
        case "session-request":
          if (this.isAuthority()) {
            this.#sendSession(message.source);
          }
          break;
        case "session-intent":
          if (this.isAuthority()) this.#acceptIntent(message);
          break;
        case "session-result":
          if (!this.isAuthority() && isFor(message, this.viewerId)) {
            this.#completeIntent(message.payload);
          }
          break;
        case "session-sync":
          if (!this.isAuthority() && isFor(message, this.viewerId)) {
            this.#applyRemoteSession(message.payload.session);
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

  #completeIntent(result = {}) {
    if (result.session) this.#applyRemoteSession(result.session);
    this.#lastOutcome = {
      status: result.status,
      requestId: result.requestId ?? null,
      operation: result.operation ?? null,
      sequence: result.sequence ?? this.session.sequence,
      expectedRevision: result.expectedRevision ?? null,
      observedRevision: result.observedRevision ?? null,
      expectedSequence: result.expectedSequence ?? null,
      observedSequence: result.observedSequence ?? null,
      error: result.error ?? null
    };
  }

  #applyRemoteSession(session) {
    validateSession(session);
    if (session.sequence < this.session.sequence) return false;
    if (
      session.sequence === this.session.sequence &&
      sameSession(session, this.session)
    ) {
      return false;
    }
    this.#applySession(session);
    return true;
  }

  #applySession(session) {
    validateSession(session);
    const next = deepFreeze(structuredClone(session));
    this.adapter.apply(next, { now: this.now });
    this.session = next;
  }

  #sandboxChanged(changes = []) {
    if (
      changes.some(change => change?.type === "initial") ||
      this.session.state === "idle"
    ) {
      return;
    }
    this.sceneChanged();
  }

  #sendResult(target, requestId, result) {
    this.#post("session-result", {
      target,
      requestId,
      ...structuredClone(result)
    });
  }

  #sendSession(target = null) {
    this.#post("session-sync", {
      target,
      session: this.session
    });
  }

  #broadcastSession() {
    if (!this.#channel || !this.isAuthority()) return;
    this.#sendSession();
  }

  #openChannel() {
    try {
      this.#channel = this.channelFactory(
        `spatial-seed:${this.sandboxId}:animation`
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

  #post(type, payload = {}) {
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
          "LocalAnimationCoordinator subscriber failed",
          error
        );
      }
    }
  }

  #assertActive() {
    if (!this.#started || this.#disposed) {
      throw new Error("Coordenador de animação não está ativo.");
    }
  }
}

function initialSession() {
  return deepFreeze({
    sequence: 0,
    playbackId: null,
    state: "idle",
    descriptor: null,
    positionSeconds: 0,
    changedAtMs: 0,
    baseRevision: 0,
    reason: null
  });
}

function idleAfter(session, {
  reason,
  changedAtMs
}) {
  return deepFreeze({
    sequence: session.sequence + 1,
    playbackId: null,
    state: "idle",
    descriptor: null,
    positionSeconds: 0,
    changedAtMs: Number(changedAtMs),
    baseRevision: session.baseRevision,
    reason: String(reason ?? "stopped")
  });
}

function sessionTime(session, nowMs) {
  const base = Math.max(0, Number(session.positionSeconds) || 0);
  if (session.state !== "playing") return base;
  return base + Math.max(
    0,
    (Number(nowMs) - Number(session.changedAtMs)) / 1000
  );
}

function validateSession(value) {
  if (
    !value ||
    !Number.isInteger(value.sequence) ||
    value.sequence < 0 ||
    !["idle", "playing", "paused"].includes(value.state) ||
    !Number.isFinite(Number(value.changedAtMs))
  ) {
    throw new TypeError("Sessão local de animação inválida.");
  }
  if (value.state !== "idle") {
    if (
      !String(value.playbackId ?? "").trim() ||
      !value.descriptor ||
      typeof value.descriptor !== "object"
    ) {
      throw new TypeError(
        "Sessão ativa de animação sem definição válida."
      );
    }
  }
}

function sameSession(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
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

function createId() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function round(value) {
  return Math.round(Number(value) * 1e6) / 1e6;
}
