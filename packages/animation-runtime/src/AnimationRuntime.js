import {
  SimulationClock
} from "../../runtime-layers/src/SimulationClock.js?build=20260719-0028a";

export const ANIMATION_RUNTIME_VERSION = "animation-runtime-v1";

export class AnimationRuntime {
  constructor({
    surface,
    clock = new SimulationClock(),
    now = defaultNow
  }) {
    validateSurface(surface);
    if (!clock?.advance || !clock?.reset) {
      throw new TypeError("AnimationRuntime exige relógio compatível.");
    }

    this.surface = surface;
    this.clock = clock;
    this.now = now;
    this.state = "idle";
    this.clip = null;
    this.disposed = false;
    this.statistics = initialStatistics();
    this.unsubscribeFrame = surface.subscribeFrame(frame =>
      this.advance(frame)
    );
  }

  start({ id = "temporary", targetIds, evaluate }) {
    this.#assertActive();
    if (typeof evaluate !== "function") {
      throw new TypeError("Animação exige evaluate().");
    }

    const ids = normalizeTargetIds(targetIds);
    if (!ids.length) {
      throw new RangeError("Animação exige ao menos um alvo.");
    }

    if (this.state !== "idle") this.stop("replaced");
    const targets = this.surface.captureAnimationTargets(ids);
    const objectCount = targetObjectCount(targets);
    if (!targets?.units?.length || objectCount === 0) {
      throw new RangeError("A seleção não contém alvos renderizáveis.");
    }

    this.clock.reset();
    this.clip = Object.freeze({
      id: String(id),
      targetIds: Object.freeze(ids),
      targets,
      evaluate,
      objectCount
    });
    this.state = "playing";
    this.statistics = initialStatistics();
    this.statistics.starts = 1;
    this.statistics.lastStopReason = null;
    return this.status();
  }

  play() {
    this.#assertActive();
    if (this.state === "playing") return this.status();
    if (this.state !== "paused" || !this.clip) {
      throw new Error("Nenhuma animação pausada para continuar.");
    }
    this.state = "playing";
    this.statistics.resumes += 1;
    return this.status();
  }

  pause() {
    this.#assertActive();
    if (this.state === "paused") return this.status();
    if (this.state !== "playing" || !this.clip) {
      throw new Error("Nenhuma animação em execução para pausar.");
    }
    this.state = "paused";
    this.statistics.pauses += 1;
    return this.status();
  }

  stop(reason = "stopped") {
    if (this.disposed || this.state === "idle" || !this.clip) {
      return this.status();
    }

    const clip = this.clip;
    let restoreError = null;
    try {
      this.surface.restoreAnimationTargets(clip.targets);
    } catch (error) {
      restoreError = error;
    }

    this.clip = null;
    this.state = "idle";
    this.clock.reset();
    this.statistics.stops += 1;
    this.statistics.lastStopReason = String(reason);
    if (restoreError) {
      this.statistics.lastError = errorRecord(restoreError);
      throw restoreError;
    }
    return this.status();
  }

  sceneChanged() {
    if (this.state === "idle") return false;
    this.stop("scene-changed");
    return true;
  }

  advance({ deltaSeconds = 0 } = {}) {
    if (this.disposed || this.state !== "playing" || !this.clip) {
      return Object.freeze({ advanced: false, state: this.state });
    }

    let latestStep = null;
    const clockResult = this.clock.advance(deltaSeconds, step => {
      latestStep = step;
    });
    this.statistics.steps += clockResult.executed;
    this.statistics.droppedSteps += clockResult.dropped ?? 0;

    if (!latestStep) {
      return Object.freeze({
        advanced: false,
        state: this.state,
        ...clockResult
      });
    }

    const startedAt = this.now();
    try {
      const frame = this.clip.evaluate(Object.freeze({
        t: latestStep.simulationTime,
        dt: latestStep.deltaSeconds,
        tick: latestStep.tick,
        targets: this.clip.targets
      }));
      const result = this.surface.applyAnimationFrame(
        this.clip.targets,
        frame
      );
      const elapsed = Math.max(0, this.now() - startedAt);
      this.statistics.frames += 1;
      this.statistics.matrixWrites += Number(result?.matrixWrites ?? 0);
      this.statistics.lastUpdateMs = round(elapsed);
      this.statistics.maximumUpdateMs = Math.max(
        this.statistics.maximumUpdateMs,
        this.statistics.lastUpdateMs
      );
      this.statistics.lastError = null;
      return Object.freeze({
        advanced: true,
        state: this.state,
        ...clockResult,
        result
      });
    } catch (error) {
      this.statistics.lastError = errorRecord(error);
      try {
        this.stop("runtime-error");
      } catch {}
      return Object.freeze({
        advanced: false,
        state: this.state,
        error: this.statistics.lastError
      });
    }
  }

  status() {
    const clip = this.clip;
    return Object.freeze({
      version: ANIMATION_RUNTIME_VERSION,
      state: this.state,
      clip: clip ? Object.freeze({
        id: clip.id,
        targetCount: clip.targetIds.length,
        unitCount: clip.targets.units.length,
        objectCount: clip.objectCount
      }) : null,
      time: Object.freeze({
        tick: this.clock.tick,
        simulationTime: round(this.clock.simulationTime),
        stepSeconds: this.clock.stepSeconds
      }),
      statistics: Object.freeze({ ...this.statistics })
    });
  }

  dispose() {
    if (this.disposed) return false;
    let stopError = null;
    try {
      if (this.state !== "idle") this.stop("disposed");
    } catch (error) {
      stopError = error;
    } finally {
      this.disposed = true;
      this.unsubscribeFrame?.();
    }
    if (stopError) throw stopError;
    return true;
  }

  #assertActive() {
    if (this.disposed) throw new Error("AnimationRuntime foi descartado.");
  }
}

function validateSurface(surface) {
  for (const method of [
    "subscribeFrame",
    "captureAnimationTargets",
    "applyAnimationFrame",
    "restoreAnimationTargets"
  ]) {
    if (typeof surface?.[method] !== "function") {
      throw new TypeError(`Superfície de animação sem ${method}().`);
    }
  }
}

function normalizeTargetIds(values) {
  if (!Array.isArray(values)) {
    throw new TypeError("targetIds deve ser uma lista.");
  }
  return [...new Set(values.map(value => String(value).trim()).filter(Boolean))];
}

function targetObjectCount(targets) {
  return targets?.units?.reduce(
    (total, unit) => total + (unit.objects?.length ?? 0),
    0
  ) ?? 0;
}

function initialStatistics() {
  return {
    starts: 0,
    pauses: 0,
    resumes: 0,
    stops: 0,
    frames: 0,
    steps: 0,
    droppedSteps: 0,
    matrixWrites: 0,
    lastUpdateMs: 0,
    maximumUpdateMs: 0,
    lastStopReason: null,
    lastError: null
  };
}

function errorRecord(error) {
  return Object.freeze({
    name: error?.name ?? "Error",
    message: error?.message ?? String(error)
  });
}

function defaultNow() {
  return globalThis.performance?.now?.() ?? Date.now();
}

function round(value) {
  return Math.round(Number(value) * 1e6) / 1e6;
}
