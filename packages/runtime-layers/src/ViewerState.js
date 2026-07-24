export class ViewerState {
  static apiVersion = "viewer-state-v1";
  #listeners = new Set();

  constructor({
    viewerId = crypto.randomUUID(),
    camera = {},
    activeCameraId = null,
    selection = [],
    hover = null,
    panels = {},
    metadata = {}
  } = {}) {
    this.viewerId = String(viewerId);
    this.camera = structuredClone(camera);
    this.activeCameraId = activeCameraId === null
      ? null
      : String(activeCameraId);
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
      activeCameraId: this.activeCameraId,
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

    if ("activeCameraId" in patch) {
      this.activeCameraId = patch.activeCameraId === null
        ? null
        : String(patch.activeCameraId);
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

export function normalizeCameraProjection({
  near = 0.1,
  far = 1000
} = {}) {
  const normalized = {
    near: Number(near),
    far: Number(far)
  };

  if (
    !Number.isFinite(normalized.near) ||
    !Number.isFinite(normalized.far)
  ) {
    throw new TypeError(
      "Os planos near e far precisam ser números finitos."
    );
  }

  if (!(normalized.near > 0 && normalized.far > normalized.near)) {
    throw new RangeError(
      "A projeção precisa satisfazer 0 < near < far."
    );
  }

  return Object.freeze(normalized);
}
