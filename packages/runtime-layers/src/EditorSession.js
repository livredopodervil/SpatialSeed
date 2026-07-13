export class EditorSession {
  #listeners = new Set();
  #operation = null;

  constructor({
    sessionId = crypto.randomUUID(),
    viewerId,
    baseVersion = 0,
    emitCommand
  }) {
    if (typeof emitCommand !== "function") {
      throw new TypeError(
        "emitCommand deve ser função."
      );
    }

    this.sessionId = String(sessionId);
    this.viewerId = String(viewerId);
    this.baseVersion = integer(baseVersion);
    this.emitCommand = emitCommand;
  }

  get active() {
    return this.#operation !== null;
  }

  begin({
    type,
    targets = [],
    initial = {},
    metadata = {}
  }) {
    if (this.#operation) {
      throw new Error(
        "Já existe uma operação editorial ativa."
      );
    }

    this.#operation = {
      operationId: crypto.randomUUID(),
      type: String(type),
      targets: [...targets],
      initial: structuredClone(initial),
      preview: structuredClone(initial),
      metadata: structuredClone(metadata),
      startedAt: new Date().toISOString()
    };

    this.#notify("begin");

    return this.snapshot();
  }

  preview(patch = {}) {
    if (!this.#operation) {
      throw new Error(
        "Não existe operação editorial ativa."
      );
    }

    this.#operation.preview = merge(
      this.#operation.preview,
      patch
    );

    this.#notify("preview");

    return this.snapshot();
  }

  commit({
    commandType = this.#operation?.type,
    payload = null
  } = {}) {
    if (!this.#operation) {
      throw new Error(
        "Não existe operação editorial ativa."
      );
    }

    const operation = this.#operation;
    const command = Object.freeze({
      commandId: crypto.randomUUID(),
      sessionId: this.sessionId,
      viewerId: this.viewerId,
      baseVersion: this.baseVersion,
      type: String(commandType),
      targets: Object.freeze([...operation.targets]),
      payload: structuredClone(
        payload ?? operation.preview
      ),
      metadata: structuredClone(
        operation.metadata
      ),
      createdAt: new Date().toISOString()
    });

    this.#operation = null;
    this.#notify("commit");

    this.emitCommand(command);

    return command;
  }

  cancel() {
    if (!this.#operation) {
      return {
        cancelled: false,
        reason: "no-active-operation"
      };
    }

    const operationId =
      this.#operation.operationId;

    this.#operation = null;
    this.#notify("cancel");

    return {
      cancelled: true,
      operationId
    };
  }

  rebase(version) {
    if (this.#operation) {
      throw new Error(
        "Não é possível rebasear durante operação ativa."
      );
    }

    this.baseVersion = integer(version);

    return {
      rebased: true,
      baseVersion: this.baseVersion
    };
  }

  snapshot() {
    return Object.freeze({
      sessionId: this.sessionId,
      viewerId: this.viewerId,
      baseVersion: this.baseVersion,
      active: this.active,
      operation: this.#operation
        ? structuredClone(this.#operation)
        : null
    });
  }

  subscribe(listener) {
    this.#listeners.add(listener);
    listener(this.snapshot(), {
      type: "initial"
    });

    return () => {
      this.#listeners.delete(listener);
    };
  }

  #notify(type) {
    const snapshot = this.snapshot();

    for (const listener of this.#listeners) {
      try {
        listener(snapshot, { type });
      } catch (error) {
        console.error(
          "EditorSession subscriber failed",
          error
        );
      }
    }
  }
}

function merge(current, patch) {
  if (
    current === null ||
    typeof current !== "object" ||
    Array.isArray(current)
  ) {
    return structuredClone(patch);
  }

  const next = {
    ...structuredClone(current)
  };

  for (const [key, value] of Object.entries(patch)) {
    next[key] =
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      current[key] &&
      typeof current[key] === "object" &&
      !Array.isArray(current[key])
        ? merge(current[key], value)
        : structuredClone(value);
  }

  return next;
}

function integer(value) {
  const number = Number(value);

  if (!Number.isInteger(number) || number < 0) {
    throw new RangeError(
      "Versão deve ser inteiro não negativo."
    );
  }

  return number;
}
