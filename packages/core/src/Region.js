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
