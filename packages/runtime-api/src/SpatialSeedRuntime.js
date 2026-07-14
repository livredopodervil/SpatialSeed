import { RuntimeQueryRegistry } from "./RuntimeQueryRegistry.js";
import { RuntimeEvents } from "./RuntimeEvents.js";
import { RuntimeCapabilities } from "./RuntimeCapabilities.js";
import { RuntimeMetrics } from "./RuntimeMetrics.js";

export class SpatialSeedRuntime {
  static apiVersion = "spatial-seed-runtime-v1";

  #commands;
  #queries;
  #events;
  #capabilities;
  #metrics;
  #disposeCallbacks = [];
  #disposed = false;

  constructor({
    commands,
    queries = new RuntimeQueryRegistry(),
    events = new RuntimeEvents(),
    capabilities = new RuntimeCapabilities(),
    metrics = new RuntimeMetrics()
  }) {
    if (!commands || typeof commands.execute !== "function") {
      throw new TypeError("Runtime requires a command registry.");
    }

    this.#commands = commands;
    this.#queries = queries;
    this.#events = events;
    this.#capabilities = capabilities;
    this.#metrics = metrics;
  }

  execute(id, args = {}) {
    this.#assertActive();

    return this.#metrics.measure(
      `command:${id}`,
      () => this.#commands.execute(id, args)
    );
  }

  query(id, args = {}) {
    this.#assertActive();

    return this.#metrics.measure(
      `query:${id}`,
      () => this.#queries.execute(id, args)
    );
  }

  subscribe(type, listener) {
    this.#assertActive();
    return this.#events.subscribe(type, listener);
  }

  emit(type, payload) {
    this.#assertActive();
    return this.#events.emit(type, payload);
  }

  capabilities() {
    this.#assertActive();

    return Object.freeze({
      runtimeApi: SpatialSeedRuntime.apiVersion,
      commands: this.#commands.describe(),
      queries: this.#queries.describe(),
      modules: this.#capabilities.describe()
    });
  }

  metrics() {
    return this.#metrics.snapshot();
  }

  benchmark({
    iterations = 10000,
    command = "runtime.api.noop"
  } = {}) {
    this.#assertActive();

    const count = Math.max(100, Math.floor(Number(iterations) || 10000));
    const args = Object.freeze({ value: 1 });

    for (let index = 0; index < 256; index += 1) {
      this.#commands.execute(command, args);
      this.execute(command, args);
    }

    const directStart = performance.now();

    for (let index = 0; index < count; index += 1) {
      this.#commands.execute(command, args);
    }

    const directMs = performance.now() - directStart;
    const facadeStart = performance.now();

    for (let index = 0; index < count; index += 1) {
      this.execute(command, args);
    }

    const facadeMs = performance.now() - facadeStart;
    const overheadMs = facadeMs - directMs;

    return Object.freeze({
      iterations: count,
      directMs: round(directMs),
      facadeMs: round(facadeMs),
      overheadMs: round(overheadMs),
      overheadPerCallUs: round(overheadMs * 1000 / count),
      ratio: directMs > 0 ? round(facadeMs / directMs) : null,
      metrics: this.metrics()
    });
  }

  onDispose(callback) {
    if (typeof callback !== "function") {
      throw new TypeError("Dispose callback must be a function.");
    }

    this.#disposeCallbacks.push(callback);
    return this;
  }

  dispose() {
    if (this.#disposed) return false;

    this.#disposed = true;

    for (const callback of this.#disposeCallbacks.splice(0).reverse()) {
      callback();
    }

    this.#events.clear();
    return true;
  }

  #assertActive() {
    if (this.#disposed) {
      throw new Error("SpatialSeedRuntime is disposed.");
    }
  }
}

function round(value) {
  return Math.round(value * 1e6) / 1e6;
}
