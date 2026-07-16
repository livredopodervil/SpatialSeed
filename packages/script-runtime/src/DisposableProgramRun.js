export const PROGRAM_PLAN_VERSION =
  "spatial-seed-program-plan-v1";

export class DisposableProgramRun {
  #allowedCommands;
  #commands = [];
  #handleSequence = 0;
  #state = "active";

  constructor({
    runId,
    baseVersion = 0,
    seed = 0,
    allowedCommands = [],
    maxCommands = 10000
  } = {}) {
    this.runId = nonEmptyString(runId, "runId");
    this.baseVersion = nonNegativeInteger(
      baseVersion,
      "baseVersion"
    );
    this.seed = clone(seed, "seed");
    this.maxCommands = positiveInteger(
      maxCommands,
      "maxCommands"
    );
    this.#allowedCommands = new Set(
      allowedCommands.map(command =>
        nonEmptyString(command, "allowedCommands")
      )
    );
  }

  get state() {
    return this.#state;
  }

  get active() {
    return this.#state === "active";
  }

  get commandCount() {
    return this.#commands.length;
  }

  createHandle(kind = "object") {
    this.#assertActive();

    const normalizedKind = nonEmptyString(kind, "kind");
    this.#handleSequence += 1;

    return deepFreeze({
      kind: normalizedKind,
      id: [
        this.runId,
        normalizedKind,
        this.#handleSequence
      ].join(":")
    });
  }

  emit(command, args = {}) {
    this.#assertActive();

    const id = nonEmptyString(command, "command");

    if (!this.#allowedCommands.has(id)) {
      throw new Error(
        `Comando não permitido no programa: ${id}.`
      );
    }

    if (this.#commands.length >= this.maxCommands) {
      throw new RangeError(
        `O programa excedeu o limite de ${this.maxCommands} comandos.`
      );
    }

    const intent = deepFreeze({
      sequence: this.#commands.length,
      command: id,
      args: clone(args, "args")
    });

    this.#commands.push(intent);
    return intent;
  }

  complete(result = null) {
    this.#assertActive();

    const plan = deepFreeze({
      planVersion: PROGRAM_PLAN_VERSION,
      runId: this.runId,
      baseVersion: this.baseVersion,
      seed: clone(this.seed, "seed"),
      commands: this.#commands.map(command =>
        clone(command, "command")
      ),
      result: clone(result, "result")
    });

    this.#commands.length = 0;
    this.#state = "completed";
    return plan;
  }

  cancel(reason = "cancelled") {
    return this.#discard("cancelled", reason);
  }

  terminate(reason = "terminated") {
    return this.#discard("terminated", reason);
  }

  fail(error) {
    const reason = error instanceof Error
      ? `${error.name}: ${error.message}`
      : String(error ?? "unknown-error");

    return this.#discard("failed", reason);
  }

  snapshot() {
    return Object.freeze({
      runId: this.runId,
      baseVersion: this.baseVersion,
      state: this.#state,
      commandCount: this.#commands.length,
      maxCommands: this.maxCommands
    });
  }

  #discard(state, reason) {
    if (!this.active) {
      return Object.freeze({
        discarded: false,
        state: this.#state
      });
    }

    const discardedCommands = this.#commands.length;
    this.#commands.length = 0;
    this.#state = state;

    return Object.freeze({
      discarded: true,
      state,
      reason: String(reason),
      discardedCommands
    });
  }

  #assertActive() {
    if (!this.active) {
      throw new Error(
        `Execução de programa não está ativa: ${this.#state}.`
      );
    }
  }
}

function clone(value, label) {
  try {
    return structuredClone(value);
  } catch (error) {
    throw new TypeError(
      `${label} deve ser serializável por structuredClone.`,
      { cause: error }
    );
  }
}

function deepFreeze(value, visited = new WeakSet()) {
  if (
    !value ||
    typeof value !== "object" ||
    Object.isFrozen(value) ||
    visited.has(value)
  ) {
    return value;
  }

  if (ArrayBuffer.isView(value)) {
    return value;
  }

  visited.add(value);

  for (const child of Object.values(value)) {
    deepFreeze(child, visited);
  }

  return Object.freeze(value);
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
