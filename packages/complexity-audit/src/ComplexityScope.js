import { ComplexityCounters } from "./ComplexityCounters.js";

export const COMPLEXITY_SCOPE_VERSION = "complexity-scope-v1";

export class ComplexityScope {
  constructor({ id, operation, counters = new ComplexityCounters(), metadata = {} } = {}) {
    this.id = requiredId(id ?? operation, "id");
    this.operation = requiredId(operation, "operation");
    this.counters = counters;
    this.metadata = Object.freeze({ ...metadata });
    this.startedAtMs = now();
    this.finishedAtMs = null;
  }

  count(name, amount = 1) {
    return this.counters.increment(name, amount);
  }

  finish(extra = {}) {
    if (this.finishedAtMs === null) this.finishedAtMs = now();
    return Object.freeze({
      version: COMPLEXITY_SCOPE_VERSION,
      id: this.id,
      operation: this.operation,
      elapsedMs: Math.max(0, this.finishedAtMs - this.startedAtMs),
      metadata: Object.freeze({ ...this.metadata, ...extra }),
      ...this.counters.snapshot()
    });
  }
}

function requiredId(value, label) {
  const id = String(value ?? "").trim();
  if (!id) throw new TypeError(`${label} é obrigatório.`);
  return id;
}
function now() {
  return globalThis.performance?.now?.() ?? Date.now();
}
