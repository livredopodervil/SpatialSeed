import {
  PROGRAM_PLAN_VERSION
} from "./DisposableProgramRun.js";

export const PROGRAM_WORKER_PROTOCOL_VERSION =
  "spatial-seed-program-worker-v1";

export class ProgramRunController {
  #active = null;
  #listeners = new Set();
  #plan = null;
  #state = "idle";
  #lastError = null;

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

  get state() {
    return this.#state;
  }

  get running() {
    return this.#state === "running";
  }

  start({
    runId,
    baseVersion = 0,
    seed = 0,
    source = "",
    snapshot = null,
    allowedCommands = [],
    maxCommands = 10000
  } = {}) {
    if (this.#state === "disposed") {
      throw new Error("Controlador de programas foi descartado.");
    }
    if (this.running) {
      throw new Error("Já existe um programa em execução.");
    }
    if (this.#plan) {
      throw new Error(
        "Existe um plano concluído aguardando consumo ou descarte."
      );
    }

    const request = clone({
      runId: nonEmptyString(runId, "runId"),
      baseVersion: nonNegativeInteger(
        baseVersion,
        "baseVersion"
      ),
      seed,
      source: String(source),
      snapshot,
      allowedCommands: allowedCommands.map(command =>
        nonEmptyString(command, "allowedCommands")
      ),
      maxCommands: positiveInteger(
        maxCommands,
        "maxCommands"
      )
    });
    const worker = this.workerFactory({
      runId: request.runId
    });

    validateWorker(worker);

    const token = Object.freeze({});
    const onMessage = event =>
      this.#receive(token, event?.data);
    const onError = event =>
      this.#workerError(token, event);

    worker.addEventListener("message", onMessage);
    worker.addEventListener("error", onError);

    this.#active = {
      token,
      worker,
      onMessage,
      onError,
      request,
      timerId: null
    };
    this.#state = "running";
    this.#lastError = null;
    this.#notify("started");

    this.#active.timerId = this.setTimer(
      () => this.#timeout(token),
      this.timeoutMs
    );

    if (!this.#isCurrent(token)) {
      return this.snapshot();
    }

    try {
      worker.postMessage(clone({
        protocolVersion: PROGRAM_WORKER_PROTOCOL_VERSION,
        type: "program.run",
        request
      }));
    } catch (error) {
      this.#finishFailure(token, "failed", error);
    }

    return this.snapshot();
  }

  cancel(reason = "cancelled-by-user") {
    if (!this.running || !this.#active) {
      return Object.freeze({
        cancelled: false,
        state: this.#state
      });
    }

    const token = this.#active.token;
    this.#closeWorker(token);
    this.#state = "cancelled";
    this.#lastError = String(reason);
    this.#notify("cancelled");

    return Object.freeze({
      cancelled: true,
      state: this.#state,
      reason: this.#lastError
    });
  }

  takePlan() {
    if (this.#state !== "ready" || !this.#plan) {
      throw new Error("Nenhum plano concluído está disponível.");
    }

    const plan = clone(this.#plan);
    this.#plan = null;
    this.#state = "idle";
    this.#notify("plan-taken");
    return plan;
  }

  discardPlan(reason = "discarded-by-user") {
    if (this.#state !== "ready" || !this.#plan) {
      return Object.freeze({
        discarded: false,
        state: this.#state
      });
    }

    this.#plan = null;
    this.#state = "idle";
    this.#lastError = String(reason);
    this.#notify("plan-discarded");

    return Object.freeze({
      discarded: true,
      state: this.#state,
      reason: this.#lastError
    });
  }

  dispose() {
    if (this.#state === "disposed") return false;

    if (this.#active) {
      this.#closeWorker(this.#active.token);
    }

    this.#plan = null;
    this.#state = "disposed";
    this.#listeners.clear();
    return true;
  }

  subscribe(listener) {
    if (typeof listener !== "function") {
      throw new TypeError("listener deve ser função.");
    }

    this.#listeners.add(listener);
    listener(this.snapshot(), { type: "initial" });

    return () => this.#listeners.delete(listener);
  }

  snapshot() {
    return Object.freeze({
      state: this.#state,
      running: this.running,
      runId: this.#active?.request.runId ?? null,
      baseVersion:
        this.#active?.request.baseVersion ??
        this.#plan?.baseVersion ??
        null,
      hasPlan: this.#plan !== null,
      lastError: this.#lastError
    });
  }

  #receive(token, message) {
    if (!this.#isCurrent(token)) return false;

    let envelope;
    try {
      envelope = clone(message);
      validateEnvelope(envelope, this.#active.request);
    } catch (error) {
      this.#finishFailure(token, "failed", error);
      return false;
    }

    if (envelope.type === "program.failed") {
      this.#finishFailure(
        token,
        "failed",
        new Error(String(envelope.error ?? "Falha no Worker."))
      );
      return true;
    }

    this.#plan = clone(envelope.plan);
    this.#closeWorker(token);
    this.#state = "ready";
    this.#lastError = null;
    this.#notify("completed");
    return true;
  }

  #workerError(token, event) {
    if (!this.#isCurrent(token)) return false;

    this.#finishFailure(
      token,
      "failed",
      new Error(event?.message ?? "Falha não tratada no Worker.")
    );
    return true;
  }

  #timeout(token) {
    if (!this.#isCurrent(token)) return false;

    this.#finishFailure(
      token,
      "timed-out",
      new Error(
        `Programa excedeu o limite de ${this.timeoutMs} ms.`
      )
    );
    return true;
  }

  #finishFailure(token, state, error) {
    if (!this.#isCurrent(token)) return false;

    this.#closeWorker(token);
    this.#state = state;
    this.#lastError = error?.message ?? String(error);
    this.#notify(state);
    return true;
  }

  #closeWorker(token) {
    if (!this.#isCurrent(token)) return false;

    const active = this.#active;
    this.#active = null;

    if (active.timerId !== null) {
      this.clearTimer(active.timerId);
    }

    active.worker.removeEventListener(
      "message",
      active.onMessage
    );
    active.worker.removeEventListener(
      "error",
      active.onError
    );
    active.worker.terminate();
    return true;
  }

  #isCurrent(token) {
    return this.#active?.token === token;
  }

  #notify(type) {
    const snapshot = this.snapshot();

    for (const listener of this.#listeners) {
      try {
        listener(snapshot, { type });
      } catch (error) {
        console.error("ProgramRunController listener failed", error);
      }
    }
  }
}

function validateEnvelope(envelope, request) {
  if (
    !envelope ||
    envelope.protocolVersion !== PROGRAM_WORKER_PROTOCOL_VERSION
  ) {
    throw new Error("Protocolo de Worker incompatível.");
  }
  if (envelope.runId !== request.runId) {
    throw new Error("Resposta pertence a outra execução.");
  }
  if (![
    "program.completed",
    "program.failed"
  ].includes(envelope.type)) {
    throw new Error(`Mensagem de Worker desconhecida: ${envelope.type}.`);
  }
  if (envelope.type === "program.failed") return;

  const plan = envelope.plan;
  if (plan?.planVersion !== PROGRAM_PLAN_VERSION) {
    throw new Error("Plano de programa incompatível.");
  }
  if (plan.runId !== request.runId) {
    throw new Error("Plano pertence a outra execução.");
  }
  if (plan.baseVersion !== request.baseVersion) {
    throw new Error("Plano usa versão-base inesperada.");
  }
  if (!Array.isArray(plan.commands)) {
    throw new Error("Plano não contém lista de comandos.");
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
      "Mensagem do programa deve ser serializável por structuredClone.",
      { cause: error }
    );
  }
}

function nonEmptyString(value, label) {
  const normalized = String(value ?? "").trim();

  if (!normalized) {
    throw new TypeError(`${label} deve ser texto não vazio.`);
  }

  return normalized;
}

function nonNegativeInteger(value, label) {
  const number = Number(value);

  if (!Number.isInteger(number) || number < 0) {
    throw new RangeError(
      `${label} deve ser inteiro não negativo.`
    );
  }

  return number;
}

function positiveInteger(value, label) {
  const number = Number(value);

  if (!Number.isInteger(number) || number <= 0) {
    throw new RangeError(
      `${label} deve ser inteiro positivo.`
    );
  }

  return number;
}
