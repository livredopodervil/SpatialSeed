import { immutableClone } from "./Immutable.js";

export class PrototypeStore {
  constructor(initial = {}) {
    this.records = new Map(Object.entries(initial).map(([id, value]) => [id, immutableClone({ ...value, id })]));
  }
  has(id) { return this.records.has(id); }
  get(id) { return this.records.get(id) ?? null; }
  set(prototype) {
    const id = String(prototype?.id ?? "");
    if (!id) throw new Error("Protótipo sem id.");
    this.records.set(id, immutableClone(prototype));
    return this.get(id);
  }
  cloneVariant(sourceId, { id = crypto.randomUUID(), patch = {} } = {}) {
    const source = this.get(sourceId);
    if (!source) throw new Error(`Protótipo inexistente: ${sourceId}`);
    return this.set({
      ...structuredClone(source),
      ...structuredClone(patch),
      id,
      derivedFrom: sourceId,
      revision: Number(source.revision ?? 0) + 1
    });
  }
  toObject() { return Object.fromEntries([...this.records].map(([id, value]) => [id, structuredClone(value)])); }
}
