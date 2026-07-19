export class UiRefreshCoordinator {
  constructor({ refresh, schedule, cancel, now = defaultNow }) {
    if (typeof refresh !== "function") {
      throw new TypeError("UiRefreshCoordinator exige refresh.");
    }
    if (typeof schedule !== "function") {
      throw new TypeError("UiRefreshCoordinator exige schedule.");
    }

    this.refresh = refresh;
    this.schedule = schedule;
    this.cancel = typeof cancel === "function" ? cancel : () => {};
    this.now = now;
    this.handle = null;
    this.pendingReasons = new Set();
    this.disposed = false;
    this.statistics = {
      requests: 0,
      coalesced: 0,
      refreshes: 0,
      failures: 0,
      lastDurationMs: 0,
      maximumDurationMs: 0,
      lastReasons: []
    };
  }

  request(reason = "unspecified") {
    if (this.disposed) return false;

    this.statistics.requests += 1;
    this.pendingReasons.add(String(reason));

    if (this.handle !== null) {
      this.statistics.coalesced += 1;
      return false;
    }

    this.handle = this.schedule(() => this.#flush());
    return true;
  }

  flushNow(reason = "manual") {
    if (this.disposed) return false;
    this.pendingReasons.add(String(reason));
    if (this.handle !== null) {
      this.cancel(this.handle);
      this.handle = null;
    }
    this.#flush();
    return true;
  }

  snapshot() {
    return Object.freeze({
      ...this.statistics,
      lastReasons: Object.freeze([...this.statistics.lastReasons]),
      pending: this.handle !== null,
      pendingReasons: Object.freeze([...this.pendingReasons])
    });
  }

  dispose() {
    if (this.disposed) return false;
    this.disposed = true;
    if (this.handle !== null) this.cancel(this.handle);
    this.handle = null;
    this.pendingReasons.clear();
    return true;
  }

  #flush() {
    if (this.disposed) return;
    this.handle = null;
    const reasons = [...this.pendingReasons];
    this.pendingReasons.clear();
    const startedAt = this.now();

    try {
      this.refresh(Object.freeze(reasons));
    } catch (error) {
      this.statistics.failures += 1;
      throw error;
    } finally {
      const duration = Math.max(0, this.now() - startedAt);
      this.statistics.refreshes += 1;
      this.statistics.lastDurationMs = round(duration);
      this.statistics.maximumDurationMs = Math.max(
        this.statistics.maximumDurationMs,
        this.statistics.lastDurationMs
      );
      this.statistics.lastReasons = reasons;
    }
  }
}

function defaultNow() {
  return globalThis.performance?.now?.() ?? Date.now();
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}
