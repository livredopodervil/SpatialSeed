export class RuntimeQueryRegistry {
  #queries = new Map();

  register(id, handler, metadata = {}) {
    const key = String(id ?? "").trim();

    if (!key) {
      throw new TypeError("Query id must be a non-empty string.");
    }

    if (typeof handler !== "function") {
      throw new TypeError(`Query handler must be a function: ${key}`);
    }

    if (this.#queries.has(key)) {
      throw new Error(`Runtime query already registered: ${key}`);
    }

    this.#queries.set(key, {
      id: key,
      handler,
      metadata: Object.freeze({ ...metadata })
    });

    return this;
  }

  execute(id, args = {}) {
    const query = this.#queries.get(String(id));

    if (!query) {
      throw new Error(`Unknown runtime query: ${id}`);
    }

    return query.handler(structuredClone(args));
  }

  describe() {
    return [...this.#queries.values()].map(query => ({
      id: query.id,
      metadata: { ...query.metadata }
    }));
  }
}
