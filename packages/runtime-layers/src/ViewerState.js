export class ViewerState {
  #listeners = new Set();

  constructor({
    viewerId = crypto.randomUUID(),
    camera = {},
    selection = [],
    hover = null,
    panels = {},
    metadata = {}
  } = {}) {
    this.viewerId = String(viewerId);
    this.camera = structuredClone(camera);
    this.selection = [...selection];
    this.hover = hover;
    this.panels = structuredClone(panels);
    this.metadata = structuredClone(metadata);
    this.revision = 0;
  }

  snapshot() {
    return Object.freeze({
      viewerId: this.viewerId,
      revision: this.revision,
      camera: structuredClone(this.camera),
      selection: Object.freeze([...this.selection]),
      hover: this.hover,
      panels: structuredClone(this.panels),
      metadata: structuredClone(this.metadata)
    });
  }

  update(patch = {}) {
    if ("camera" in patch) {
      this.camera = {
        ...this.camera,
        ...structuredClone(patch.camera)
      };
    }

    if ("selection" in patch) {
      this.selection = [...patch.selection];
    }

    if ("hover" in patch) {
      this.hover = patch.hover;
    }

    if ("panels" in patch) {
      this.panels = {
        ...this.panels,
        ...structuredClone(patch.panels)
      };
    }

    if ("metadata" in patch) {
      this.metadata = {
        ...this.metadata,
        ...structuredClone(patch.metadata)
      };
    }

    this.revision += 1;
    this.#notify();

    return this.snapshot();
  }

  subscribe(listener) {
    this.#listeners.add(listener);
    listener(this.snapshot());

    return () => {
      this.#listeners.delete(listener);
    };
  }

  #notify() {
    const snapshot = this.snapshot();

    for (const listener of this.#listeners) {
      try {
        listener(snapshot);
      } catch (error) {
        console.error(
          "ViewerState subscriber failed",
          error
        );
      }
    }
  }
}
