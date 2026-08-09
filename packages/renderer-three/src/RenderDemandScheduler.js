export const RENDER_DEMAND_SCHEDULER_VERSION = "render-demand-scheduler-v1";

export class RenderDemandScheduler {
  #render;
  #prepareFrame;
  #requestFrame;
  #cancelFrame;
  #setTimer;
  #clearTimer;
  #now;
  #frameHandle = null;
  #lastTimestamp = null;
  #dirty = false;
  #dirtyReasons = new Set();
  #frameListeners = new Set();
  #continuousLeases = new Map();
  #timers = new Map();
  #nextToken = 1;
  #disposed = false;
  #statistics = {
    requestedFrames: 0,
    processedFrames: 0,
    renderedFrames: 0,
    idleFrames: 0,
    invalidations: 0,
    listenerCalls: 0,
    listenerErrors: 0,
    timerWakes: 0
  };

  constructor({
    render,
    prepareFrame = null,
    requestFrame = callback => globalThis["requestAnimationFrame"](callback),
    cancelFrame = handle => globalThis["cancelAnimationFrame"](handle),
    setTimer = (callback, delay) => setTimeout(callback, delay),
    clearTimer = handle => clearTimeout(handle),
    now = () => globalThis.performance?.now?.() ?? Date.now()
  }) {
    if (typeof render !== "function") throw new TypeError("render deve ser função.");
    if (prepareFrame !== null && typeof prepareFrame !== "function") {
      throw new TypeError("prepareFrame deve ser função ou null.");
    }
    for (const [label, value] of Object.entries({
      requestFrame,
      cancelFrame,
      setTimer,
      clearTimer,
      now
    })) {
      if (typeof value !== "function") throw new TypeError(`${label} deve ser função.`);
    }
    this.#render = render;
    this.#prepareFrame = prepareFrame;
    this.#requestFrame = requestFrame;
    this.#cancelFrame = cancelFrame;
    this.#setTimer = setTimer;
    this.#clearTimer = clearTimer;
    this.#now = now;
  }

  invalidate(reason = "unspecified") {
    this.#assertActive();
    this.#dirty = true;
    this.#dirtyReasons.add(String(reason));
    this.#statistics.invalidations += 1;
    this.#ensureFrame();
    return true;
  }

  subscribeFrame(listener) {
    this.#assertActive();
    if (typeof listener !== "function") {
      throw new TypeError("Listener de quadro deve ser função.");
    }
    this.#frameListeners.add(listener);
    return () => this.#frameListeners.delete(listener);
  }

  acquireContinuous(owner = "anonymous") {
    this.#assertActive();
    const token = `frame-demand:${this.#nextToken++}`;
    this.#continuousLeases.set(token, String(owner));
    this.#ensureFrame();
    return token;
  }

  releaseContinuous(token) {
    const changed = this.#continuousLeases.delete(String(token));
    if (changed && !this.#shouldContinue()) {
      if (this.#frameHandle !== null) {
        this.#cancelFrame(this.#frameHandle);
        this.#frameHandle = null;
      }
      this.#lastTimestamp = null;
    }
    return changed;
  }

  wakeAt(timestampMs, owner = "timer") {
    this.#assertActive();
    const target = finiteTimestamp(timestampMs);
    const token = `frame-wake:${this.#nextToken++}`;
    const delay = Math.max(0, target - this.#now());
    const handle = this.#setTimer(() => {
      this.#timers.delete(token);
      this.#statistics.timerWakes += 1;
      this.invalidate(`wake:${owner}`);
    }, delay);
    this.#timers.set(token, handle);
    return token;
  }

  cancelWake(token) {
    const key = String(token);
    const handle = this.#timers.get(key);
    if (handle === undefined) return false;
    this.#timers.delete(key);
    this.#clearTimer(handle);
    return true;
  }

  flush(timestampMs = this.#now()) {
    this.#assertActive();
    if (this.#frameHandle !== null) {
      this.#cancelFrame(this.#frameHandle);
      this.#frameHandle = null;
    }
    this.#processFrame(finiteTimestamp(timestampMs));
  }

  status() {
    return Object.freeze({
      version: RENDER_DEMAND_SCHEDULER_VERSION,
      dirty: this.#dirty,
      dirtyReasons: Object.freeze([...this.#dirtyReasons]),
      framePending: this.#frameHandle !== null,
      continuousLeaseCount: this.#continuousLeases.size,
      continuousOwners: Object.freeze([...this.#continuousLeases.values()]),
      listenerCount: this.#frameListeners.size,
      timerCount: this.#timers.size,
      statistics: Object.freeze({ ...this.#statistics })
    });
  }

  dispose() {
    if (this.#disposed) return false;
    this.#disposed = true;
    if (this.#frameHandle !== null) {
      this.#cancelFrame(this.#frameHandle);
      this.#frameHandle = null;
    }
    for (const handle of this.#timers.values()) this.#clearTimer(handle);
    this.#timers.clear();
    this.#frameListeners.clear();
    this.#continuousLeases.clear();
    this.#dirtyReasons.clear();
    return true;
  }

  #ensureFrame(force = false) {
    if (this.#frameHandle !== null || (!force && !this.#shouldContinue())) return;
    this.#statistics.requestedFrames += 1;
    this.#frameHandle = this.#requestFrame(timestamp => {
      this.#frameHandle = null;
      this.#processFrame(finiteTimestamp(timestamp));
    });
  }

  #processFrame(timestampMs) {
    if (this.#disposed) return;
    this.#statistics.processedFrames += 1;
    const deltaSeconds = this.#lastTimestamp === null
      ? 0
      : Math.max(0, (timestampMs - this.#lastTimestamp) / 1000);
    this.#lastTimestamp = timestampMs;
    let continueRequested = false;

    if (this.#prepareFrame) {
      try {
        const result = normalizeFrameResult(this.#prepareFrame(Object.freeze({
          timestampMs,
          deltaSeconds
        })));
        if (result.changed) {
          this.#dirty = true;
          this.#dirtyReasons.add("prepare-frame");
        }
        continueRequested ||= result.continue;
      } catch (error) {
        console.error("Render frame preparation failed", error);
      }
    }

    const frame = Object.freeze({ timestampMs, deltaSeconds });
    for (const listener of [...this.#frameListeners]) {
      try {
        this.#statistics.listenerCalls += 1;
        const result = normalizeFrameResult(listener(frame));
        if (result.changed) {
          this.#dirty = true;
          this.#dirtyReasons.add("frame-listener");
        }
        continueRequested ||= result.continue;
      } catch (error) {
        this.#statistics.listenerErrors += 1;
        console.error("Animation frame listener failed", error);
      }
    }

    if (this.#dirty) {
      const reasons = Object.freeze([...this.#dirtyReasons]);
      this.#dirty = false;
      this.#dirtyReasons.clear();
      this.#render(Object.freeze({ timestampMs, deltaSeconds, reasons }));
      this.#statistics.renderedFrames += 1;
    } else {
      this.#statistics.idleFrames += 1;
    }

    if (continueRequested || this.#continuousLeases.size > 0 || this.#dirty) {
      this.#ensureFrame(continueRequested);
    } else {
      this.#lastTimestamp = null;
    }
  }

  #shouldContinue() {
    return this.#dirty || this.#continuousLeases.size > 0;
  }

  #assertActive() {
    if (this.#disposed) throw new Error("RenderDemandScheduler foi descartado.");
  }
}

function normalizeFrameResult(value) {
  if (value === true) return { changed: true, continue: false };
  if (!value || typeof value !== "object") {
    return { changed: false, continue: false };
  }
  const changed = Boolean(
    value.changed ??
    value.render ??
    value.result?.changed ??
    (
      Number(value.result?.matrixWrites ?? 0) > 0 ||
      Number(value.result?.colorWrites ?? 0) > 0 ||
      Number(value.result?.pivotWrites ?? 0) > 0 ||
      Number(value.result?.restored ?? 0) > 0
    )
  );
  return {
    changed,
    continue: Boolean(value.continue ?? value.continuous ?? false)
  };
}

function finiteTimestamp(value) {
  const timestamp = Number(value);
  if (!Number.isFinite(timestamp)) {
    throw new RangeError("Timestamp deve ser finito.");
  }
  return timestamp;
}
