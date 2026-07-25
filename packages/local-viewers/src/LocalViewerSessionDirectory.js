const DIRECTORY_FORMAT = "spatial-seed-local-viewer-directory";
const DIRECTORY_VERSION = 1;
const DIRECTORY_CHANNEL = "spatial-seed:viewer-directory";

export class LocalViewerSessionDirectory {
  static apiVersion = "local-viewer-session-directory-v1";

  #listeners = new Set();
  #viewers = new Map();
  #channel = null;
  #heartbeat = null;
  #started = false;
  #disposed = false;
  #lastError = null;

  constructor({
    describe,
    channelFactory = defaultChannelFactory,
    now = () => Date.now(),
    setIntervalFn = globalThis.setInterval?.bind(globalThis),
    clearIntervalFn = globalThis.clearInterval?.bind(globalThis),
    setTimeoutFn = globalThis.setTimeout?.bind(globalThis),
    heartbeatMs = 2000,
    staleAfterMs = 7000
  } = {}) {
    if (typeof describe !== "function") {
      throw new TypeError(
        "Diretório de viewers exige uma descrição da sessão local."
      );
    }
    this.describe = describe;
    this.channelFactory = channelFactory;
    this.now = now;
    this.setIntervalFn = setIntervalFn;
    this.clearIntervalFn = clearIntervalFn;
    this.setTimeoutFn = setTimeoutFn;
    this.heartbeatMs = positiveNumber(heartbeatMs, "heartbeatMs");
    this.staleAfterMs = positiveNumber(staleAfterMs, "staleAfterMs");
  }

  start() {
    if (this.#started) return this.status();
    this.#started = true;
    try {
      this.#channel = this.channelFactory(DIRECTORY_CHANNEL);
      this.#channel?.addEventListener?.(
        "message",
        this.#receiveMessage
      );
      this.#post("query");
      this.announce();
      if (typeof this.setIntervalFn === "function") {
        this.#heartbeat = this.setIntervalFn(
          () => this.announce(),
          this.heartbeatMs
        );
      }
    } catch (error) {
      this.#channel = null;
      this.#lastError = error;
    }
    this.#notify();
    return this.status();
  }

  announce() {
    if (!this.#started || this.#disposed) return false;
    const descriptor = normalizeDescriptor(this.describe());
    this.#remember(descriptor);
    this.#post("announce", { descriptor });
    this.#notify();
    return true;
  }

  async discover({ waitMs = 80 } = {}) {
    this.#assertActive();
    this.#post("query");
    if (
      this.#channel &&
      typeof this.setTimeoutFn === "function" &&
      Number(waitMs) > 0
    ) {
      await new Promise(resolve =>
        this.setTimeoutFn(resolve, Number(waitMs))
      );
    }
    this.announce();
    return this.status();
  }

  status() {
    this.#prune();
    const local = normalizeDescriptor(this.describe());
    this.#remember(local);
    const viewers = [...this.#viewers.values()]
      .sort((left, right) =>
        left.viewerId.localeCompare(right.viewerId)
      )
      .map(entry => Object.freeze(publicDescriptor(entry)));
    const sessions = summarizeSessions(viewers, local.sandboxId);
    return Object.freeze({
      apiVersion: LocalViewerSessionDirectory.apiVersion,
      available: Boolean(this.#channel),
      currentSandboxId: local.sandboxId,
      sessions,
      viewers: Object.freeze(viewers),
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
    const descriptor = normalizeDescriptor(this.describe());
    this.#post("bye", {
      viewerId: descriptor.viewerId
    });
    if (this.#heartbeat !== null) {
      this.clearIntervalFn?.(this.#heartbeat);
      this.#heartbeat = null;
    }
    this.#channel?.removeEventListener?.(
      "message",
      this.#receiveMessage
    );
    this.#channel?.close?.();
    this.#channel = null;
    this.#listeners.clear();
    return true;
  }

  #receiveMessage = event => {
    const message = event?.data;
    if (!validMessage(message)) return;
    try {
      if (message.type === "query") {
        this.announce();
        return;
      }
      if (message.type === "announce") {
        const descriptor = normalizeDescriptor(
          message.payload?.descriptor
        );
        const local = normalizeDescriptor(this.describe());
        if (descriptor.viewerId === local.viewerId) return;
        this.#remember(descriptor);
      } else if (message.type === "bye") {
        this.#viewers.delete(String(message.payload?.viewerId ?? ""));
      }
    } catch (error) {
      this.#lastError = error;
    }
    this.#notify();
  };

  #remember(descriptor) {
    this.#viewers.set(descriptor.viewerId, {
      ...descriptor,
      lastSeenMs: this.now()
    });
  }

  #prune() {
    const threshold = this.now() - this.staleAfterMs;
    const localViewerId = normalizeDescriptor(
      this.describe()
    ).viewerId;
    for (const [viewerId, descriptor] of this.#viewers) {
      if (
        viewerId !== localViewerId &&
        descriptor.lastSeenMs < threshold
      ) {
        this.#viewers.delete(viewerId);
      }
    }
  }

  #post(type, payload = {}) {
    if (!this.#channel) return false;
    this.#channel.postMessage({
      format: DIRECTORY_FORMAT,
      schemaVersion: DIRECTORY_VERSION,
      type,
      payload: structuredClone(payload)
    });
    return true;
  }

  #notify() {
    const snapshot = this.status();
    for (const listener of this.#listeners) {
      try {
        listener(snapshot);
      } catch (error) {
        console.error(
          "LocalViewerSessionDirectory subscriber failed",
          error
        );
      }
    }
  }

  #assertActive() {
    if (!this.#started || this.#disposed) {
      throw new Error("Diretório de viewers não está ativo.");
    }
  }
}

function normalizeDescriptor(value = {}) {
  if (!isSandboxId(value.sandboxId)) {
    throw new TypeError(
      "Sessão local sem identidade de sandbox válida."
    );
  }
  const viewerId = nonEmptyString(value.viewerId, "viewerId");
  const role = ["authority", "replica", "starting"].includes(value.role)
    ? value.role
    : "unknown";
  return Object.freeze({
    sandboxId: String(value.sandboxId),
    viewerId,
    role,
    projectName: nonEmptyString(
      value.projectName ?? "Projeto Spatial Seed",
      "projectName"
    ),
    revision: nonNegativeInteger(value.revision),
    dirty: Boolean(value.dirty),
    objectCount: nonNegativeInteger(value.objectCount)
  });
}

function publicDescriptor(value) {
  return {
    sandboxId: value.sandboxId,
    viewerId: value.viewerId,
    role: value.role,
    projectName: value.projectName,
    revision: value.revision,
    dirty: value.dirty,
    objectCount: value.objectCount
  };
}

function summarizeSessions(viewers, currentSandboxId) {
  const groups = new Map();
  for (const viewer of viewers) {
    const group = groups.get(viewer.sandboxId) ?? [];
    group.push(viewer);
    groups.set(viewer.sandboxId, group);
  }
  return Object.freeze(
    [...groups.entries()]
      .map(([sandboxId, entries]) => {
        const preferred =
          entries.find(entry => entry.role === "authority") ??
          entries[0];
        return Object.freeze({
          sandboxId,
          projectName: preferred.projectName,
          viewerCount: entries.length,
          authorityAvailable: entries.some(
            entry => entry.role === "authority"
          ),
          revision: Math.max(...entries.map(entry => entry.revision)),
          dirty: entries.some(entry => entry.dirty),
          objectCount: Math.max(
            ...entries.map(entry => entry.objectCount)
          ),
          current: sandboxId === currentSandboxId
        });
      })
      .sort((left, right) =>
        Number(right.current) - Number(left.current) ||
        left.projectName.localeCompare(right.projectName, "pt-BR") ||
        left.sandboxId.localeCompare(right.sandboxId)
      )
  );
}

function validMessage(message) {
  return Boolean(
    message &&
    message.format === DIRECTORY_FORMAT &&
    message.schemaVersion === DIRECTORY_VERSION &&
    ["query", "announce", "bye"].includes(message.type) &&
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

function nonEmptyString(value, label) {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    throw new TypeError(`${label} deve ser texto não vazio.`);
  }
  return normalized;
}

function nonNegativeInteger(value) {
  const normalized = Number(value ?? 0);
  return Number.isInteger(normalized) && normalized >= 0
    ? normalized
    : 0;
}

function positiveNumber(value, label) {
  const normalized = Number(value);
  if (!Number.isFinite(normalized) || normalized <= 0) {
    throw new RangeError(`${label} deve ser positivo.`);
  }
  return normalized;
}
