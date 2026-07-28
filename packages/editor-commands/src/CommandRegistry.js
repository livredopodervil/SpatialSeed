export class CommandRegistry {
  static apiVersion = "editor-command-registry-v1";
  #commands = new Map();
  #executionObserver = null;

  setExecutionObserver(observer = null) {
    if (observer !== null && typeof observer !== "function") {
      throw new TypeError("Command execution observer must be a function.");
    }
    this.#executionObserver = observer;
    return this;
  }

  register(id, handler, metadata = {}) {
    if (typeof id !== "string" || !id.trim()) {
      throw new TypeError("Command id must be a non-empty string.");
    }
    if (typeof handler !== "function") {
      throw new TypeError(`Command handler must be a function: ${id}`);
    }
    if (this.#commands.has(id)) {
      throw new Error(`Command already registered: ${id}`);
    }
    this.#commands.set(id, {
      id,
      handler,
      metadata: Object.freeze({ ...metadata })
    });
    return this;
  }

  execute(id, args = {}) {
    const command = this.#commands.get(id);
    if (!command) throw new Error(`Unknown editor command: ${id}`);
    const clonedArgs = structuredClone(args);
    const result = command.handler(clonedArgs);
    if (this.#executionObserver) {
      try {
        this.#executionObserver({
          id: command.id,
          args: clonedArgs,
          result,
          metadata: command.metadata
        });
      } catch (error) {
        console.error("Command execution observer failed", error);
      }
    }
    return result;
  }

  describe() {
    return [...this.#commands.values()].map(command => ({
      id: command.id,
      metadata: { ...command.metadata }
    }));
  }
}
