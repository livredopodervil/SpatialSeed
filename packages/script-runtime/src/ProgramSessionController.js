import {
  PROGRAM_PLAN_VERSION
} from "./DisposableProgramRun.js";
import {
  PROGRAM_WORKER_PROTOCOL_VERSION
} from "./ProgramRunController.js";

export class ProgramSessionController {
  #active = null;
  #generation = 0;
  #keys = [];
  #lastError = null;
  #revision = 0;
  #state = "idle";
  #worker = null;

  constructor({
    workerFactory,
    timeoutMs = 5000,
    setTimer = (callback, delay) =>
      globalThis.setTimeout(callback, delay),
    clearTimer = timerId =>
      globalThis.clearTimeout(timerId)
  } = {}) {
    if (typeof workerFactory !== "function") {
      throw new TypeError("workerFactory deve ser função.");
    }
    if (typeof setTimer !== "function" || typeof clearTimer !== "function") {
      throw new TypeError("Temporizadores incompatíveis.");
    }

    this.workerFactory = workerFactory;
    this.timeoutMs = positiveInteger(timeoutMs, "timeoutMs");
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
  }

  get running() {
    return this.#state === "running";
  }

  run({
    runId,
    baseVersion = 0,
    seed = 0,
    source = "",
    mode = "expression",
    snapshot = null,
    maxOutput = 100
  } = {}) {
    if (this.#state === "disposed") {
      throw new Error("Controlador de sessão foi descartado.");
    }
    if (this.running) {
      throw new Error("A sessão já está executando um programa.");
    }

    const request = clone({
      runId: nonEmptyString(runId, "runId"),
      baseVersion: nonNegativeInteger(baseVersion, "baseVersion"),
      seed,
      source: String(source),
      mode: normalizeMode(mode),
      snapshot,
      allowedCommands: [],
      maxCommands: 1,
      maxOutput: positiveInteger(maxOutput, "maxOutput")
    });
    const worker = this.#ensureWorker();

    return new Promise((resolve, reject) => {
      const token = Object.freeze({});
      const onMessage = event =>
        this.#receive(token, event?.data);
      const onError = event =>
        this.#invalidate(
          token,
          "failed",
          new Error(event?.message ?? "Falha não tratada no Worker.")
        );

      worker.addEventListener("message", onMessage);
      worker.addEventListener("error", onError);

      this.#active = {
        token,
        worker,
        request,
        resolve,
        reject,
        onMessage,
        onError,
        timerId: this.setTimer(
          () => this.#invalidate(
            token,
            "timed-out",
            new Error(
              `Programa excedeu o limite de ${this.timeoutMs} ms.`
            )
          ),
          this.timeoutMs
        )
      };
      this.#state = "running";
      this.#lastError = null;

      try {
        worker.postMessage(clone({
          protocolVersion: PROGRAM_WORKER_PROTOCOL_VERSION,
          type: "program.run",
          request
        }));
      } catch (error) {
        this.#invalidate(token, "failed", error);
      }
    });
  }

  cancel(reason = "cancelled-by-user") {
    if (!this.running || !this.#active) {
      return Object.freeze({
        cancelled: false,
        state: this.#state
      });
    }

    this.#invalidate(
      this.#active.token,
      "cancelled",
      new Error(String(reason))
    );

    return Object.freeze({
      cancelled: true,
      state: this.#state,
      reason: this.#lastError
    });
  }

  reset(reason = "session-reset") {
    if (this.#state === "disposed") {
      throw new Error("Controlador de sessão foi descartado.");
    }

    if (this.#active) {
      this.#invalidate(
        this.#active.token,
        "cancelled",
        new Error(String(reason))
      );
    } else {
      this.#terminateWorker();
    }

    this.#revision = 0;
    this.#keys = [];
    this.#lastError = null;
    this.#state = "idle";
    return this.snapshot();
  }

  dispose() {
    if (this.#state === "disposed") return false;

    if (this.#active) {
      this.#invalidate(
        this.#active.token,
        "disposed",
        new Error("Controlador de sessão foi descartado.")
      );
    } else {
      this.#terminateWorker();
      this.#state = "disposed";
    }

    return true;
  }

  snapshot() {
    return Object.freeze({
      state: this.#state,
      running: this.running,
      generation: this.#generation,
      revision: this.#revision,
      keys: Object.freeze([...this.#keys]),
      sessionAlive: this.#worker !== null,
      runId: this.#active?.request.runId ?? null,
      lastError: this.#lastError
    });
  }

  #ensureWorker() {
    if (this.#worker) return this.#worker;

    const worker = this.workerFactory({
      generation: this.#generation + 1
    });
    validateWorker(worker);
    this.#worker = worker;
    this.#generation += 1;
    this.#revision = 0;
    this.#keys = [];
    return worker;
  }

  #receive(token, message) {
    if (this.#active?.token !== token) return false;

    let envelope;
    try {
      envelope = clone(message);
      validateSessionEnvelope(envelope, this.#active.request);
    } catch (error) {
      this.#invalidate(token, "failed", error);
      return false;
    }

    if (envelope.type === "program.failed") {
      this.#invalidate(
        token,
        "failed",
        new Error(
          String(
            envelope.error?.message ??
            envelope.error ??
            "Falha no Worker."
          )
        )
      );
      return true;
    }

    const active = this.#releaseActive(token);
    this.#revision = envelope.session.revision;
    this.#keys = [...envelope.session.keys];
    this.#state = "idle";
    this.#lastError = null;
    active.resolve(clone(envelope.plan));
    return true;
  }

  #invalidate(token, state, error) {
    if (this.#active?.token !== token) return false;

    const active = this.#releaseActive(token);
    this.#terminateWorker();
    this.#revision = 0;
    this.#keys = [];
    this.#state = state;
    this.#lastError = error?.message ?? String(error);
    active.reject(error instanceof Error ? error : new Error(this.#lastError));
    return true;
  }

  #releaseActive(token) {
    if (this.#active?.token !== token) {
      throw new Error("Execução de sessão não está ativa.");
    }

    const active = this.#active;
    this.#active = null;
    this.clearTimer(active.timerId);
    active.worker.removeEventListener("message", active.onMessage);
    active.worker.removeEventListener("error", active.onError);
    return active;
  }

  #terminateWorker() {
    if (!this.#worker) return false;

    this.#worker.terminate();
    this.#worker = null;
    return true;
  }
}

function validateSessionEnvelope(envelope, request) {
  if (
    !envelope ||
    envelope.protocolVersion !== PROGRAM_WORKER_PROTOCOL_VERSION
  ) {
    throw new Error("Protocolo de Worker incompatível.");
  }
  if (envelope.runId !== request.runId) {
    throw new Error("Resposta pertence a outra execução.");
  }
  if (!["program.completed", "program.failed"].includes(envelope.type)) {
    throw new Error(`Mensagem de Worker desconhecida: ${envelope.type}.`);
  }
  if (envelope.type === "program.failed") return;

  if (envelope.plan?.planVersion !== PROGRAM_PLAN_VERSION) {
    throw new Error("Plano de programa incompatível.");
  }
  if (
    envelope.plan.runId !== request.runId ||
    envelope.plan.baseVersion !== request.baseVersion
  ) {
    throw new Error("Plano de programa pertence a outra execução.");
  }
  if (
    !Array.isArray(envelope.plan.commands) ||
    envelope.plan.commands.length !== 0
  ) {
    throw new Error("Sessão matemática não pode emitir comandos de cena.");
  }
  if (
    envelope.session?.state !== "active" ||
    !Number.isInteger(envelope.session.revision) ||
    !Array.isArray(envelope.session.keys)
  ) {
    throw new Error("Metadados de sessão incompatíveis.");
  }
}

function validateWorker(worker) {
  for (const method of [
    "postMessage",
    "terminate",
    "addEventListener",
    "removeEventListener"
  ]) {
    if (typeof worker?.[method] !== "function") {
      throw new TypeError(`Worker incompatível: ${method}.`);
    }
  }
}

function clone(value) {
  try {
    return structuredClone(value);
  } catch (error) {
    throw new TypeError(
      "Mensagem da sessão deve ser serializável por structuredClone.",
      { cause: error }
    );
  }
}

function nonEmptyString(value, label) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new TypeError(`${label} deve ser texto não vazio.`);
  return normalized;
}

function nonNegativeInteger(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) {
    throw new RangeError(`${label} deve ser inteiro não negativo.`);
  }
  return number;
}

function positiveInteger(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    throw new RangeError(`${label} deve ser inteiro positivo.`);
  }
  return number;
}

function normalizeMode(value) {
  const mode = String(value ?? "expression");
  if (!["expression", "program"].includes(mode)) {
    throw new Error(`Modo de programa desconhecido: ${mode}.`);
  }
  return mode;
}
