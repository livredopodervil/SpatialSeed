export class CommandRegistry {
  static apiVersion = "editor-command-registry-v1";
  #commands = new Map();

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
    return command.handler(structuredClone(args));
  }

  describe() {
    return [...this.#commands.values()].map(command => ({
      id: command.id,
      metadata: { ...command.metadata }
    }));
  }
}
