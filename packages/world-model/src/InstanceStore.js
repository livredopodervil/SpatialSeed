import { immutableClone } from "./Immutable.js";

export class InstanceStore {
  #records = new Map();

  constructor({
    prototypes,
    initial = {}
  }) {
    this.prototypes = prototypes;

    for (const [id, value] of Object.entries(initial)) {
      this.set({
        ...value,
        id
      });
    }
  }

  get(id) {
    return this.#records.get(id) ?? null;
  }

  set(instance) {
    const id = String(instance?.id ?? "");

    if (!id) {
      throw new Error("Instância sem id.");
    }

    if (!this.prototypes.has(instance.prototypeId)) {
      throw new Error(
        `Protótipo inexistente: ${instance.prototypeId}.`
      );
    }

    const normalized = immutableClone(
      normalizeInstance(instance)
    );

    this.#records.set(id, normalized);

    return normalized;
  }

  transform(id, patch) {
    const current = this.get(id);

    if (!current) {
      throw new Error(`Instância inexistente: ${id}.`);
    }

    return this.set({
      ...structuredClone(current),
      transform: {
        ...current.transform,
        ...structuredClone(patch)
      }
    });
  }

  makeUnique(
    instanceId,
    {
      prototypeId = crypto.randomUUID(),
      prototypePatch = {}
    } = {}
  ) {
    const instance = this.get(instanceId);

    if (!instance) {
      throw new Error(
        `Instância inexistente: ${instanceId}.`
      );
    }

    const prototype = this.prototypes.cloneVariant(
      instance.prototypeId,
      {
        id: prototypeId,
        patch: prototypePatch
      }
    );

    const updated = this.set({
      ...structuredClone(instance),
      prototypeId: prototype.id
    });

    return {
      prototype,
      instance: updated
    };
  }

  delete(id) {
    return this.#records.delete(id);
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

function normalizeInstance(value) {
  return {
    ...structuredClone(value),
    id: String(value.id),
    prototypeId: String(value.prototypeId),
    transform: {
      position: [
        ...(value.transform?.position ?? [0, 0, 0])
      ],
      rotation: [
        ...(value.transform?.rotation ?? [0, 0, 0, 1])
      ],
      scale: [
        ...(value.transform?.scale ?? [1, 1, 1])
      ]
    }
  };
}
