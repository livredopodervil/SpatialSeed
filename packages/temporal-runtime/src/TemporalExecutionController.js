export const TEMPORAL_EXECUTION_CONTROLLER_VERSION =
  "temporal-execution-controller-v1";

export class TemporalExecutionController {
  #runtime;
  #surface;
  #snapshot;
  #apply;
  #publishEvents;
  #setTimer;
  #clearTimer;
  #runtimeUnsubscribe;
  #frameUnsubscribe;
  #frameDemandToken = null;
  #wakeTimer = null;
  #wakeGlobalTime = Infinity;
  #running = null;
  #fault = null;
  #disposed = false;
  #statistics = {
    reconciliations: 0,
    frameLeases: 0,
    frameReleases: 0,
    evaluationsStarted: 0,
    evaluationsCompleted: 0,
    evaluationsFailed: 0,
    appliedChanges: 0,
    publishedEvents: 0,
    renderInvalidations: 0,
    timerSchedules: 0,
    timerWakes: 0
  };

  constructor({
    runtime,
    surface,
    snapshot = () => null,
    apply = () => Object.freeze({ changed: false, applied: 0 }),
    publishEvents = () => 0,
    setTimer = (callback, delay) => setTimeout(callback, delay),
    clearTimer = handle => clearTimeout(handle)
  } = {}) {
    if (!runtime?.evaluateParallel || !runtime?.readiness || !runtime?.subscribe) {
      throw new TypeError(
        "TemporalExecutionController exige TemporalRuntime observável."
      );
    }
    for (const [name, value] of Object.entries({
      snapshot,
      apply,
      publishEvents,
      setTimer,
      clearTimer
    })) {
      if (typeof value !== "function") {
        throw new TypeError(`${name} deve ser função.`);
      }
    }
    for (const method of [
      "subscribeFrame",
      "acquireFrameDemand",
      "releaseFrameDemand",
      "invalidateRender"
    ]) {
      if (typeof surface?.[method] !== "function") {
        throw new TypeError(`Superfície temporal exige ${method}().`);
      }
    }

    this.#runtime = runtime;
    this.#surface = surface;
    this.#snapshot = snapshot;
    this.#apply = apply;
    this.#publishEvents = publishEvents;
    this.#setTimer = setTimer;
    this.#clearTimer = clearTimer;

    this.#runtimeUnsubscribe = runtime.subscribe(event => {
      if (event.reason !== "evaluated") this.#fault = null;
      this.reconcile();
    });
    this.#frameUnsubscribe = surface.subscribeFrame(
      frame => this.#onFrame(frame)
    );
    this.reconcile();
  }

  reconcile(globalTime = this.#runtime.domains.now()) {
    if (this.#disposed) return this.status(globalTime);
    this.#statistics.reconciliations += 1;
    const readiness = this.#runtime.readiness(globalTime);
    this.#scheduleWake(readiness.nextWakeGlobalTime, globalTime);

    if (readiness.readyCount > 0 && this.#running === null && !this.#fault) {
      this.#acquireFrameDemand();
    } else {
      this.#releaseFrameDemand();
    }
    return this.status(globalTime);
  }

  resetFault() {
    const changed = this.#fault !== null;
    this.#fault = null;
    this.reconcile();
    return changed;
  }

  status(globalTime = this.#runtime.domains.now()) {
    const readiness = this.#runtime.readiness(globalTime);
    return Object.freeze({
      version: TEMPORAL_EXECUTION_CONTROLLER_VERSION,
      globalTime,
      running: this.#running !== null,
      frameDemandActive: this.#frameDemandToken !== null,
      wakeScheduled: this.#wakeTimer !== null,
      wakeGlobalTime: this.#wakeGlobalTime,
      fault: this.#fault === null
        ? null
        : Object.freeze({
            name: this.#fault.name ?? "Error",
            message: String(this.#fault.message ?? this.#fault)
          }),
      readiness,
      statistics: Object.freeze({ ...this.#statistics })
    });
  }

  dispose() {
    if (this.#disposed) return false;
    this.#disposed = true;
    this.#releaseFrameDemand();
    this.#cancelWake();
    this.#frameUnsubscribe?.();
    this.#runtimeUnsubscribe?.();
    this.#frameUnsubscribe = null;
    this.#runtimeUnsubscribe = null;
    return true;
  }

  #onFrame(frame) {
    if (this.#disposed || this.#running !== null || this.#fault) {
      return Object.freeze({ changed: false, continue: false });
    }
    const readiness = this.#runtime.readiness();
    if (readiness.readyCount === 0) {
      this.reconcile();
      return Object.freeze({ changed: false, continue: false });
    }

    /*
     * Uma lease serve apenas para acordar a avaliação. Ela é liberada antes
     * do trabalho assíncrono para que nenhum frame vazio seja produzido
     * enquanto as operações calculam seus resultados em paralelo.
     */
    this.#releaseFrameDemand();
    this.#statistics.evaluationsStarted += 1;
    this.#running = this.#evaluate(frame).finally(() => {
      this.#running = null;
      this.reconcile();
    });
    return Object.freeze({ changed: false, continue: false });
  }

  async #evaluate(frame) {
    try {
      const globalTime = this.#runtime.domains.now();
      const snapshot = this.#snapshot();
      const cycle = await this.#runtime.evaluateParallel({
        snapshot,
        globalTime
      });
      const applyResult = normalizeApplyResult(await this.#apply(cycle));
      const publishedEvents = Number(
        await this.#publishEvents(cycle.events, cycle)
      ) || 0;

      this.#statistics.evaluationsCompleted += 1;
      this.#statistics.appliedChanges += applyResult.applied;
      this.#statistics.publishedEvents += publishedEvents;

      if (applyResult.changed) {
        this.#surface.invalidateRender("temporal-commit");
        this.#statistics.renderInvalidations += 1;
      }
      return Object.freeze({
        changed: applyResult.changed,
        applied: applyResult.applied,
        publishedEvents,
        cycle,
        frame
      });
    } catch (error) {
      this.#fault = error instanceof Error ? error : new Error(String(error));
      this.#statistics.evaluationsFailed += 1;
      console.error("Temporal evaluation failed", error);
      return Object.freeze({ changed: false, error: this.#fault, frame });
    }
  }

  #acquireFrameDemand() {
    if (this.#frameDemandToken !== null) return false;
    this.#frameDemandToken = this.#surface.acquireFrameDemand(
      "temporal-runtime"
    );
    this.#statistics.frameLeases += 1;
    return true;
  }

  #releaseFrameDemand() {
    if (this.#frameDemandToken === null) return false;
    const token = this.#frameDemandToken;
    this.#frameDemandToken = null;
    const changed = this.#surface.releaseFrameDemand(token);
    if (changed) this.#statistics.frameReleases += 1;
    return changed;
  }

  #scheduleWake(nextWakeGlobalTime, globalTime) {
    const next = Number(nextWakeGlobalTime);
    if (!Number.isFinite(next) || next <= Number(globalTime)) {
      this.#cancelWake();
      return false;
    }
    if (this.#wakeTimer !== null && this.#wakeGlobalTime === next) {
      return false;
    }
    this.#cancelWake();
    const delayMs = Math.max(0, (next - Number(globalTime)) * 1000);
    this.#wakeGlobalTime = next;
    this.#wakeTimer = this.#setTimer(() => {
      this.#wakeTimer = null;
      this.#wakeGlobalTime = Infinity;
      this.#statistics.timerWakes += 1;
      this.reconcile();
    }, delayMs);
    this.#statistics.timerSchedules += 1;
    return true;
  }

  #cancelWake() {
    if (this.#wakeTimer === null) {
      this.#wakeGlobalTime = Infinity;
      return false;
    }
    this.#clearTimer(this.#wakeTimer);
    this.#wakeTimer = null;
    this.#wakeGlobalTime = Infinity;
    return true;
  }
}

function normalizeApplyResult(value) {
  if (value === true) return Object.freeze({ changed: true, applied: 1 });
  if (!value || typeof value !== "object") {
    return Object.freeze({ changed: false, applied: 0 });
  }
  return Object.freeze({
    changed: Boolean(value.changed),
    applied: nonNegativeInteger(value.applied ?? value.changeCount ?? 0)
  });
}

function nonNegativeInteger(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return 0;
  return Math.floor(number);
}
