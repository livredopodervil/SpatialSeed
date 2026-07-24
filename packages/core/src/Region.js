export class Region {
  #state;
  #version = 0;
  #subscribers = new Set();

  constructor(descriptor, initialState) {
    this.descriptor = Object.freeze(structuredClone(descriptor));
    this.#state = structuredClone(initialState);
  }

  get version() { return this.#version; }
  getSnapshot() { return this.#state; }
  getState() { return structuredClone(this.#state); }

  restoreCheckpoint(state, { version = 0 } = {}) {
    const next = structuredClone(state);
    const nextVersion = Number(version);

    if (
      !next ||
      typeof next !== "object" ||
      !Array.isArray(next.objects)
    ) {
      throw new TypeError(
        "O checkpoint regional deve conter um array objects."
      );
    }
    if (!Number.isInteger(nextVersion) || nextVersion < 0) {
      throw new TypeError(
        "A versão do checkpoint regional deve ser inteira e não negativa."
      );
    }

    this.#state = next;
    this.#version = nextVersion;
    this.#notify({
      type: "region-checkpoint-restored",
      version: this.#version
    });
    return true;
  }

  acceptProposal(proposal) {
    if (proposal.regionId !== this.descriptor.id) {
      return { accepted:false, reason:"wrong-region" };
    }
    if (proposal.baseVersion !== this.#version) {
      return { accepted:false, reason:"version-conflict", currentVersion:this.#version };
    }
    this.#state = structuredClone(proposal.proposedState);
    this.#version += 1;
    this.#notify({ type:"proposal-accepted", version:this.#version });
    return { accepted:true, version:this.#version };
  }

  subscribe(listener) {
    this.#subscribers.add(listener);
    listener(this.getSnapshot(), { type:"initial", version:this.#version });
    return () => this.#subscribers.delete(listener);
  }

  #notify(change) {
    const snapshot = this.getSnapshot();
    for (const listener of this.#subscribers) {
      try { listener(snapshot, change); }
      catch (error) { console.error("Region subscriber failed", error); }
    }
  }
}
