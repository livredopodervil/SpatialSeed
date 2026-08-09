export const TRANSFORM_OVERLAY_VERSION = "transform-overlay-v1";

export class TransformOverlay {
  #entries = new Map();

  set(targetId, transform, { owner = "interactive", channel = "preview" } = {}) {
    const id = String(targetId ?? "").trim();
    if (!id) throw new TypeError("TransformOverlay exige targetId.");
    const entry = Object.freeze({
      targetId: id,
      owner: String(owner),
      channel: String(channel),
      transform: Object.freeze(structuredClone(transform))
    });
    this.#entries.set(`${owner}:${channel}:${id}`, entry);
    return entry;
  }

  get(targetId, { owner = "interactive", channel = "preview" } = {}) {
    return this.#entries.get(`${owner}:${channel}:${String(targetId)}`) ?? null;
  }

  clearOwner(owner) {
    const prefix = `${String(owner)}:`;
    let removed = 0;
    for (const key of [...this.#entries.keys()]) {
      if (!key.startsWith(prefix)) continue;
      this.#entries.delete(key);
      removed += 1;
    }
    return removed;
  }

  snapshot() { return Object.freeze([...this.#entries.values()]); }
}
