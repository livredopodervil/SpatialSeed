export class RuntimeMetrics {
  #series = new Map();
  #limit;

  constructor({ sampleLimit = 2048 } = {}) {
    this.#limit = Math.max(32, Number(sampleLimit) || 2048);
  }

  measure(name, operation) {
    const startedAt = performance.now();

    try {
      return operation();
    } finally {
      this.record(name, performance.now() - startedAt);
    }
  }

  async measureAsync(name, operation) {
    const startedAt = performance.now();

    try {
      return await operation();
    } finally {
      this.record(name, performance.now() - startedAt);
    }
  }

  record(name, durationMs) {
    const key = String(name);
    const values = this.#series.get(key) ?? [];
    values.push(Number(durationMs));

    if (values.length > this.#limit) {
      values.splice(0, values.length - this.#limit);
    }

    this.#series.set(key, values);
  }

  snapshot() {
    return Object.freeze(
      Object.fromEntries(
        [...this.#series].map(([name, values]) => [
          name,
          summarize(values)
        ])
      )
    );
  }

  clear() {
    this.#series.clear();
  }
}

function summarize(values) {
  if (!values.length) {
    return Object.freeze({
      samples: 0,
      totalMs: 0,
      meanMs: 0,
      medianMs: 0,
      p95Ms: 0,
      maxMs: 0
    });
  }

  const ordered = [...values].sort((a, b) => a - b);
  const total = ordered.reduce((sum, value) => sum + value, 0);

  return Object.freeze({
    samples: ordered.length,
    totalMs: round(total),
    meanMs: round(total / ordered.length),
    medianMs: round(percentile(ordered, 0.5)),
    p95Ms: round(percentile(ordered, 0.95)),
    maxMs: round(ordered.at(-1))
  });
}

function percentile(ordered, ratio) {
  const index = Math.min(
    ordered.length - 1,
    Math.max(0, Math.ceil(ordered.length * ratio) - 1)
  );

  return ordered[index];
}

function round(value) {
  return Math.round(value * 1e6) / 1e6;
}
