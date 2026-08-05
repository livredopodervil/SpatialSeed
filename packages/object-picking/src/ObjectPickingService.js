export class ObjectPickingService {
  static apiVersion = "object-picking-service-v1";

  #backend;
  #diagnostics = {
    attempts: 0,
    hits: 0,
    misses: 0,
    fallbacks: 0,
    failures: 0,
    lastDurationMs: 0,
    maximumDurationMs: 0,
    lastReason: null,
    lastSource: null
  };

  constructor({ backend } = {}) {
    if (!backend || typeof backend.pickAt !== "function") {
      throw new TypeError("ObjectPickingService exige backend de picking.");
    }
    this.#backend = backend;
  }

  get supported() {
    return this.#backend.supported !== false;
  }

  pickAt(point, options = {}) {
    this.#diagnostics.attempts += 1;
    const started = now();
    let raw;
    try {
      if (!this.supported) {
        raw = {
          objectId: null,
          fallback: true,
          reason: "backend-unavailable",
          source: "gpu-id"
        };
      } else {
        raw = this.#backend.pickAt(point, options) ?? {};
      }
    } catch (error) {
      this.#diagnostics.failures += 1;
      raw = {
        objectId: null,
        fallback: true,
        reason: String(error?.message ?? error),
        source: "gpu-id"
      };
    }
    const durationMs = Math.max(0, now() - started);
    const objectId = raw.objectId === null || raw.objectId === undefined
      ? null
      : String(raw.objectId);
    const fallback = Boolean(raw.fallback);
    if (fallback) this.#diagnostics.fallbacks += 1;
    else if (objectId) this.#diagnostics.hits += 1;
    else this.#diagnostics.misses += 1;
    this.#diagnostics.lastDurationMs = durationMs;
    this.#diagnostics.maximumDurationMs = Math.max(
      this.#diagnostics.maximumDurationMs,
      durationMs
    );
    this.#diagnostics.lastReason = raw.reason ?? null;
    this.#diagnostics.lastSource = raw.source ?? "gpu-id";
    return Object.freeze({
      objectId,
      fallback,
      reason: raw.reason ?? null,
      source: raw.source ?? "gpu-id",
      durationMs,
      renderedResources: Number(raw.renderedResources ?? 0),
      renderedBatches: Number(raw.renderedBatches ?? 0)
    });
  }

  status() {
    return Object.freeze({
      apiVersion: ObjectPickingService.apiVersion,
      supported: this.supported,
      ...this.#diagnostics,
      backend: typeof this.#backend.status === "function"
        ? this.#backend.status()
        : null
    });
  }

  dispose() {
    this.#backend.dispose?.();
  }
}

function now() {
  return globalThis.performance?.now?.() ?? Date.now();
}
