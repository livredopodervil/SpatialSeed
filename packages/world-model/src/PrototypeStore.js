import { immutableClone } from "./Immutable.js";

export class PrototypeStore {
  #records = new Map();

  constructor(initial = {}) {
    for (const [id, value] of Object.entries(initial)) {
      this.set({
        ...value,
        id
      });
    }
  }

  has(id) {
    return this.#records.has(id);
  }

  get(id) {
    return this.#records.get(id) ?? null;
  }

  set(prototype) {
    const id = String(prototype?.id ?? "");

    if (!id) {
      throw new Error("Protótipo sem id.");
    }

    const normalized = immutableClone({
      revision: 1,
      ...prototype,
      id
    });

    this.#records.set(id, normalized);

    return normalized;
  }

  delete(id) {
    return this.#records.delete(id);
  }

  cloneVariant(
    sourceId,
    {
      id = crypto.randomUUID(),
      patch = {}
    } = {}
  ) {
    const source = this.get(sourceId);

    if (!source) {
      throw new Error(
        `Protótipo inexistente: ${sourceId}.`
      );
    }

    return this.set({
      ...structuredClone(source),
      ...structuredClone(patch),
      id,
      derivedFrom: sourceId,
      revision: Number(source.revision ?? 0) + 1
    });
  }

  toObject() {
    return Object.fromEntries(
      [...this.#records].map(([id, value]) => [
        id,
        structuredClone(value)
      ])
    );
  }
}
