import { immutableClone } from "./Immutable.js";

export class InstanceStore {
  constructor({ prototypes, initial = {} }) {
    this.prototypes = prototypes;
    this.records = new Map();
    for (const [id, value] of Object.entries(initial)) this.set({ ...value, id });
  }
  get(id) { return this.records.get(id) ?? null; }
  set(instance) {
    const id = String(instance?.id ?? "");
    if (!id) throw new Error("Instância sem id.");
    if (!this.prototypes.has(instance.prototypeId)) throw new Error(`Protótipo inexistente: ${instance.prototypeId}`);
    const normalized = {
      ...structuredClone(instance),
      id,
      prototypeId: String(instance.prototypeId),
      transform: {
        position: [...(instance.transform?.position ?? [0, 0, 0])],
        rotation: [...(instance.transform?.rotation ?? [0, 0, 0, 1])],
        scale: [...(instance.transform?.scale ?? [1, 1, 1])]
      }
    };
    this.records.set(id, immutableClone(normalized));
    return this.get(id);
  }
  makeUnique(instanceId, { prototypeId = crypto.randomUUID(), prototypePatch = {} } = {}) {
    const instance = this.get(instanceId);
    if (!instance) throw new Error(`Instância inexistente: ${instanceId}`);
    const prototype = this.prototypes.cloneVariant(instance.prototypeId, { id: prototypeId, patch: prototypePatch });
    return { prototype, instance: this.set({ ...structuredClone(instance), prototypeId: prototype.id }) };
  }
  toObject() { return Object.fromEntries([...this.records].map(([id, value]) => [id, structuredClone(value)])); }
}
