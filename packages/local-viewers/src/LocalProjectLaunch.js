const LAUNCH_FORMAT = "spatial-seed-local-project-launch";
const LAUNCH_VERSION = 1;

export class LocalProjectLaunchSender {
  static apiVersion = "local-project-launch-v1";

  #channel = null;
  #ready = false;
  #pending = null;
  #resolveAck = null;
  #rejectAck = null;

  constructor({
    launchId,
    channelFactory = defaultChannelFactory
  } = {}) {
    this.launchId = normalizeLaunchId(launchId);
    this.channelFactory = channelFactory;
    this.#channel = channelFactory(channelName(this.launchId));
    this.#channel.addEventListener?.("message", this.#receive);
  }

  sendProject(text) {
    if (this.#pending) {
      throw new Error("O lançamento já possui um projeto preparado.");
    }
    this.#pending = {
      type: "project",
      text: String(text ?? "")
    };
    const result = new Promise((resolve, reject) => {
      this.#resolveAck = resolve;
      this.#rejectAck = reject;
    });
    this.#flush();
    return result;
  }

  cancel(reason = "cancelled") {
    this.#pending = {
      type: "cancel",
      reason: String(reason)
    };
    this.#flush();
    return true;
  }

  dispose() {
    this.#channel?.removeEventListener?.("message", this.#receive);
    this.#channel?.close?.();
    this.#channel = null;
    this.#rejectAck?.(
      new Error("Lançamento de projeto encerrado antes da confirmação.")
    );
    this.#resolveAck = null;
    this.#rejectAck = null;
  }

  #receive = event => {
    const message = event?.data;
    if (!validMessage(message, this.launchId)) return;
    if (message.type === "ready") {
      this.#ready = true;
      this.#flush();
    } else if (message.type === "accepted") {
      this.#resolveAck?.(Object.freeze({
        accepted: true,
        launchId: this.launchId,
        projectName: message.payload?.projectName ?? null,
        objectCount: Number(message.payload?.objectCount ?? 0)
      }));
      this.#resolveAck = null;
      this.#rejectAck = null;
    } else if (message.type === "rejected") {
      this.#rejectAck?.(
        new Error(
          message.payload?.error ??
          "A nova aba rejeitou o projeto."
        )
      );
      this.#resolveAck = null;
      this.#rejectAck = null;
    }
  };

  #flush() {
    if (!this.#channel || !this.#ready || !this.#pending) return false;
    this.#post(this.#pending.type, this.#pending);
    return true;
  }

  #post(type, payload = {}) {
    this.#channel.postMessage({
      format: LAUNCH_FORMAT,
      schemaVersion: LAUNCH_VERSION,
      launchId: this.launchId,
      type,
      payload: structuredClone(payload)
    });
  }
}

export class LocalProjectLaunchReceiver {
  static apiVersion = "local-project-launch-v1";

  #channel = null;
  #resolve = null;
  #reject = null;
  #timer = null;
  #heartbeat = null;

  constructor({
    launchId,
    channelFactory = defaultChannelFactory,
    setTimeoutFn = globalThis.setTimeout?.bind(globalThis),
    clearTimeoutFn = globalThis.clearTimeout?.bind(globalThis),
    setIntervalFn = globalThis.setInterval?.bind(globalThis),
    clearIntervalFn = globalThis.clearInterval?.bind(globalThis)
  } = {}) {
    this.launchId = normalizeLaunchId(launchId);
    this.channelFactory = channelFactory;
    this.setTimeoutFn = setTimeoutFn;
    this.clearTimeoutFn = clearTimeoutFn;
    this.setIntervalFn = setIntervalFn;
    this.clearIntervalFn = clearIntervalFn;
  }

  receive({ timeoutMs = 120000 } = {}) {
    if (this.#channel) {
      throw new Error("O receptor de projeto já está aguardando.");
    }
    this.#channel = this.channelFactory(channelName(this.launchId));
    this.#channel.addEventListener?.("message", this.#receive);
    const promise = new Promise((resolve, reject) => {
      this.#resolve = resolve;
      this.#reject = reject;
    });
    this.#post("ready");
    if (typeof this.setIntervalFn === "function") {
      this.#heartbeat = this.setIntervalFn(
        () => this.#post("ready"),
        500
      );
    }
    if (
      typeof this.setTimeoutFn === "function" &&
      Number(timeoutMs) > 0
    ) {
      this.#timer = this.setTimeoutFn(
        () => this.#finishError(
          new Error("Tempo esgotado aguardando o arquivo do projeto.")
        ),
        Number(timeoutMs)
      );
    }
    return promise;
  }

  accept(result = {}) {
    this.#post("accepted", {
      projectName: result.name ?? null,
      objectCount: Number(result.objectCount ?? 0)
    });
    this.dispose();
    return true;
  }

  reject(error) {
    this.#post("rejected", {
      error: error?.message ?? String(error)
    });
    this.dispose();
    return true;
  }

  dispose() {
    if (this.#timer !== null) {
      this.clearTimeoutFn?.(this.#timer);
      this.#timer = null;
    }
    if (this.#heartbeat !== null) {
      this.clearIntervalFn?.(this.#heartbeat);
      this.#heartbeat = null;
    }
    this.#channel?.removeEventListener?.("message", this.#receive);
    this.#channel?.close?.();
    this.#channel = null;
    this.#resolve = null;
    this.#reject = null;
  }

  #receive = event => {
    const message = event?.data;
    if (!validMessage(message, this.launchId)) return;
    if (message.type === "project") {
      const text = String(message.payload?.text ?? "");
      const resolve = this.#resolve;
      this.#resolve = null;
      resolve?.(Object.freeze({
        type: "project",
        text
      }));
    } else if (message.type === "cancel") {
      this.#finishError(
        new Error("A abertura do projeto foi cancelada.")
      );
    }
  };

  #finishError(error) {
    const reject = this.#reject;
    this.#reject = null;
    reject?.(error);
    this.dispose();
  }

  #post(type, payload = {}) {
    this.#channel?.postMessage({
      format: LAUNCH_FORMAT,
      schemaVersion: LAUNCH_VERSION,
      launchId: this.launchId,
      type,
      payload: structuredClone(payload)
    });
  }
}

export function createIndependentProjectUrl(
  href,
  {
    sandboxId,
    mode = "new",
    launchId = null
  } = {}
) {
  const url = new URL(String(href));
  if (!isSandboxId(sandboxId)) {
    throw new TypeError("Identidade de sandbox inválida.");
  }
  if (!["new", "open"].includes(mode)) {
    throw new RangeError(`Modo de projeto desconhecido: ${mode}.`);
  }
  url.searchParams.set("sandbox", String(sandboxId));
  url.searchParams.set("viewer", "auto");
  url.searchParams.set("project", mode);
  if (mode === "open") {
    url.searchParams.set("launch", normalizeLaunchId(launchId));
  } else {
    url.searchParams.delete("launch");
  }
  return url.href;
}

function channelName(launchId) {
  return `spatial-seed:project-launch:${launchId}`;
}

function normalizeLaunchId(value) {
  const id = String(value ?? "");
  if (!/^launch-[a-zA-Z0-9-]{8,}$/.test(id)) {
    throw new TypeError("Identidade de lançamento inválida.");
  }
  return id;
}

function validMessage(message, launchId) {
  return Boolean(
    message &&
    message.format === LAUNCH_FORMAT &&
    message.schemaVersion === LAUNCH_VERSION &&
    message.launchId === launchId &&
    ["ready", "project", "cancel", "accepted", "rejected"].includes(
      message.type
    ) &&
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
  return /^sandbox-[a-zA-Z0-9-]{8,}$/.test(String(value ?? ""));
}
