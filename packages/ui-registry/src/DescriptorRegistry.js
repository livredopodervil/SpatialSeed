export class DescriptorRegistry {
  #kind;
  #normalize;
  #entries = new Map();
  #listeners = new Set();

  constructor({ kind = "descriptor", normalize = value => value } = {}) {
    this.#kind = String(kind);
    this.#normalize = normalize;
  }

  register(value, { runtime = null, replace = false } = {}) {
    const descriptor = this.#normalize(value);
    if (this.#entries.has(descriptor.id) && !replace) {
      throw new Error(`${this.#kind} já registrado: ${descriptor.id}.`);
    }
    this.#entries.set(descriptor.id, Object.freeze({
      descriptor,
      runtime
    }));
    this.#emit({ type: "registered", id: descriptor.id });
    return descriptor;
  }

  unregister(id) {
    const key = String(id ?? "").trim();
    const entry = this.#entries.get(key);
    if (!entry) return false;
    try { entry.runtime?.dispose?.(); }
    catch (error) { console.error(`Falha ao liberar ${this.#kind} ${key}`, error); }
    this.#entries.delete(key);
    this.#emit({ type: "unregistered", id: key });
    return true;
  }

  get(id, { includeRuntime = false } = {}) {
    const entry = this.#entries.get(String(id ?? "").trim());
    if (!entry) return null;
    return includeRuntime
      ? Object.freeze({ descriptor: entry.descriptor, runtime: entry.runtime })
      : entry.descriptor;
  }

  has(id) {
    return this.#entries.has(String(id ?? "").trim());
  }

  describe({ includeRuntime = false } = {}) {
    const values = [...this.#entries.values()];
    return Object.freeze(values.map(entry => includeRuntime
      ? Object.freeze({ descriptor: entry.descriptor, runtime: entry.runtime })
      : entry.descriptor));
  }

  subscribe(listener) {
    if (typeof listener !== "function") throw new TypeError("Listener inválido.");
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  clear() {
    for (const id of [...this.#entries.keys()]) this.unregister(id);
  }

  #emit(event) {
    const snapshot = Object.freeze({ ...event, kind: this.#kind });
    for (const listener of this.#listeners) listener(snapshot);
  }
}
