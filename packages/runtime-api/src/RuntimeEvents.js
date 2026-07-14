export class RuntimeEvents {
  #listeners = new Map();

  subscribe(type, listener) {
    const key = String(type ?? "").trim();

    if (!key) {
      throw new TypeError("Event type must be a non-empty string.");
    }

    if (typeof listener !== "function") {
      throw new TypeError("Event listener must be a function.");
    }

    const listeners = this.#listeners.get(key) ?? new Set();
    listeners.add(listener);
    this.#listeners.set(key, listeners);

    return () => {
      listeners.delete(listener);
      if (!listeners.size) this.#listeners.delete(key);
    };
  }

  emit(type, payload) {
    const listeners = this.#listeners.get(String(type));

    if (!listeners) return 0;

    let delivered = 0;

    for (const listener of [...listeners]) {
      listener(payload);
      delivered += 1;
    }

    return delivered;
  }

  clear() {
    this.#listeners.clear();
  }
}
