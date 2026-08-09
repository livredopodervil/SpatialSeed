import {
  SimulationClock
} from "../../runtime-layers/src/SimulationClock.js?build=20260719-0028a";
import {
  EvolutionKind,
  EvolutionResult
} from "../../temporal-runtime/src/index.js?build=20260808-0053h";

export const ANIMATION_RUNTIME_VERSION = "animation-runtime-v3-event-driven";

export class AnimationRuntime {
  constructor({
    surface,
    clock = new SimulationClock(),
    now = defaultNow,
    setTimer = (callback, delay) => setTimeout(callback, delay),
    clearTimer = handle => clearTimeout(handle)
  }) {
    validateSurface(surface);
    if (!clock?.advance || !clock?.reset) {
      throw new TypeError("AnimationRuntime exige relógio compatível.");
    }
    if (typeof setTimer !== "function" || typeof clearTimer !== "function") {
      throw new TypeError("AnimationRuntime exige temporizadores compatíveis.");
    }

    this.surface = surface;
    this.clock = clock;
    this.now = now;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.state = "idle";
    this.clip = null;
    this.timeSource = null;
    this.timelineTime = 0;
    this.timelineTick = 0;
    this.disposed = false;
    this.waiting = null;
    this.frameDemandToken = null;
    this.wakeTimer = null;
    this.statistics = initialStatistics();
    this.unsubscribeFrame = surface.subscribeFrame(frame => this.advance(frame));
  }

  start({
    id = "temporary",
    targetIds,
    targetMode = "selection",
    evaluate,
    timeSource = null,
    initialTime = 0
  }) {
    this.#assertActive();
    if (typeof evaluate !== "function") {
      throw new TypeError("Animação exige evaluate().");
    }
    if (timeSource !== null && typeof timeSource !== "function") {
      throw new TypeError("Fonte temporal deve ser função.");
    }

    const ids = normalizeTargetIds(targetIds);
    const resolvedTargetMode = normalizeTargetMode(targetMode);
    if (!ids.length) throw new RangeError("Animação exige ao menos um alvo.");
    if (this.state !== "idle") this.stop("replaced");

    const targets = this.surface.captureAnimationTargets(ids, {
      targetMode: resolvedTargetMode
    });
    const objectCount = targetObjectCount(targets);
    if (!targets?.units?.length || objectCount === 0) {
      throw new RangeError("A seleção não contém alvos renderizáveis.");
    }

    this.clock.reset();
    this.timeSource = timeSource;
    this.timelineTime = nonNegativeTime(initialTime);
    this.timelineTick = Math.floor(this.timelineTime / this.clock.stepSeconds);
    this.clip = Object.freeze({
      id: String(id),
      targetIds: Object.freeze(ids),
      targetMode: resolvedTargetMode,
      targets,
      evaluate,
      objectCount
    });
    this.state = "playing";
    this.waiting = null;
    this.statistics = initialStatistics();
    this.statistics.starts = 1;
    this.statistics.lastStopReason = null;
    this.#ensureFrameDemand();
    if (this.timelineTime > 0) this.seek(this.timelineTime);
    return this.status();
  }

  play() {
    this.#assertActive();
    if (this.state === "playing") {
      if (this.waiting) this.wake("play");
      return this.status();
    }
    if (this.state !== "paused" || !this.clip) {
      throw new Error("Nenhuma animação pausada para continuar.");
    }
    this.state = "playing";
    this.statistics.resumes += 1;
    this.#clearWaiting();
    this.#ensureFrameDemand();
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
    this.#clearWaiting();
    this.#releaseFrameDemand();
    return this.status();
  }

  wake(reason = "dependency-changed") {
    this.#assertActive();
    if (!this.clip || this.state !== "playing") return false;
    const changed = this.waiting !== null || this.wakeTimer !== null;
    this.#clearWaiting();
    this.statistics.wakes += changed ? 1 : 0;
    this.statistics.lastWakeReason = String(reason);
    this.#ensureFrameDemand();
    this.surface.invalidateRender?.(`animation-wake:${reason}`);
    return changed;
  }

  stop(reason = "stopped") {
    if (this.disposed || this.state === "idle" || !this.clip) {
      return this.status();
    }

    const clip = this.clip;
    let restoreError = null;
    this.#clearWaiting();
    this.#releaseFrameDemand();
    try {
      this.surface.restoreAnimationTargets(clip.targets);
    } catch (error) {
      restoreError = error;
    }

    this.clip = null;
    this.timeSource = null;
    this.timelineTime = 0;
    this.timelineTick = 0;
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
    if (
      this.disposed ||
      this.state !== "playing" ||
      !this.clip ||
      this.waiting !== null
    ) {
      return Object.freeze({
        advanced: false,
        changed: false,
        state: this.state,
        waiting: this.waiting
      });
    }

    if (this.timeSource) {
      const nextTime = nonNegativeTime(this.timeSource());
      const previousTime = this.timelineTime;
      this.timelineTime = nextTime;
      this.timelineTick = Math.floor(nextTime / this.clock.stepSeconds);
      this.statistics.steps += 1;
      return this.#applyFrame({
        t: nextTime,
        dt: Math.max(0, nextTime - previousTime),
        tick: this.timelineTick,
        executed: 1,
        dropped: 0,
        simulationTime: nextTime
      });
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
        changed: false,
        state: this.state,
        ...clockResult
      });
    }

    this.timelineTime = latestStep.simulationTime;
    this.timelineTick = latestStep.tick;
    return this.#applyFrame({
      t: latestStep.simulationTime,
      dt: latestStep.deltaSeconds,
      tick: latestStep.tick,
      ...clockResult
    });
  }

  setTimeSource(timeSource = null) {
    this.#assertActive();
    if (timeSource !== null && typeof timeSource !== "function") {
      throw new TypeError("Fonte temporal deve ser função.");
    }
    this.timeSource = timeSource;
    this.wake("time-source-changed");
    return this.status();
  }

  seek(simulationTime) {
    this.#assertActive();
    if (!this.clip) throw new Error("Nenhuma animação disponível para posicionar.");
    this.#clearWaiting();
    const nextTime = nonNegativeTime(simulationTime);
    const previousTime = this.timelineTime;
    this.timelineTime = nextTime;
    this.timelineTick = Math.floor(nextTime / this.clock.stepSeconds);
    const result = this.#applyFrame({
      t: nextTime,
      dt: Math.max(0, nextTime - previousTime),
      tick: this.timelineTick,
      executed: 1,
      dropped: 0,
      simulationTime: nextTime
    });
    if (this.state === "playing" && !this.waiting) this.#ensureFrameDemand();
    return result;
  }

  #applyFrame({ t, dt, tick, ...clockResult }) {
    const startedAt = this.now();
    try {
      const evaluated = this.clip.evaluate(Object.freeze({
        t,
        dt,
        tick,
        targets: this.clip.targets,
        result: EvolutionResult
      }));
      // Uma lista bruta representa o quadro completo, mesmo quando contém
      // apenas uma unidade. Não a converta em uma lista de mudanças, pois o
      // caso unitário seria desembrulhado como objeto pelo caminho genérico.
      const evolution = Array.isArray(evaluated)
        ? EvolutionResult.changed([], { value: evaluated })
        : EvolutionResult.normalize(evaluated);
      let surfaceResult = null;
      let changed = false;

      switch (evolution.kind) {
        case EvolutionKind.IDENTITY:
          this.statistics.identityFrames += 1;
          break;

        case EvolutionKind.FIXED_POINT:
          this.statistics.fixedPointFrames += 1;
          this.waiting = Object.freeze({
            kind: EvolutionKind.FIXED_POINT,
            dependencyVersions: evolution.dependencyVersions
          });
          this.#releaseFrameDemand();
          break;

        case EvolutionKind.SLEEP_UNTIL:
          this.statistics.sleepFrames += 1;
          this.#sleepUntil(evolution.wakeLocalTime);
          break;

        case EvolutionKind.CHANGED: {
          const frame = evolution.value ?? (
            evolution.changes.length === 1
              ? evolution.changes[0]
              : evolution.changes
          );
          surfaceResult = this.surface.applyAnimationFrame(
            this.clip.targets,
            frame
          );
          changed = surfaceChanged(surfaceResult);
          if (changed) this.statistics.changedFrames += 1;
          else this.statistics.identitySurfaceFrames += 1;
          break;
        }

        default:
          throw new Error(`Resultado de animação desconhecido: ${evolution.kind}.`);
      }

      const elapsed = Math.max(0, this.now() - startedAt);
      this.statistics.frames += 1;
      this.statistics.matrixWrites += Number(surfaceResult?.matrixWrites ?? 0);
      this.statistics.colorWrites += Number(surfaceResult?.colorWrites ?? 0);
      this.statistics.lastUpdateMs = round(elapsed);
      this.statistics.maximumUpdateMs = Math.max(
        this.statistics.maximumUpdateMs,
        this.statistics.lastUpdateMs
      );
      this.statistics.lastError = null;
      return Object.freeze({
        advanced: true,
        changed,
        continue: this.state === "playing" && this.waiting === null,
        state: this.state,
        waiting: this.waiting,
        evolutionKind: evolution.kind,
        ...clockResult,
        result: surfaceResult
      });
    } catch (error) {
      this.statistics.lastError = errorRecord(error);
      try { this.stop("runtime-error"); } catch {}
      return Object.freeze({
        advanced: false,
        changed: false,
        state: this.state,
        error: this.statistics.lastError
      });
    }
  }

  #sleepUntil(wakeLocalTime) {
    this.#clearWaiting();
    const wake = nonNegativeTime(wakeLocalTime);
    this.waiting = Object.freeze({
      kind: EvolutionKind.SLEEP_UNTIL,
      wakeLocalTime: wake
    });
    this.#releaseFrameDemand();
    const delayMs = Math.max(0, (wake - this.timelineTime) * 1000);
    this.wakeTimer = this.setTimer(() => {
      this.wakeTimer = null;
      if (this.disposed || this.state !== "playing" || !this.clip) return;
      this.waiting = null;
      this.statistics.wakes += 1;
      this.statistics.lastWakeReason = "sleep-complete";
      this.#ensureFrameDemand();
      this.surface.invalidateRender?.("animation-sleep-complete");
    }, delayMs);
  }

  #clearWaiting() {
    this.waiting = null;
    if (this.wakeTimer !== null) {
      this.clearTimer(this.wakeTimer);
      this.wakeTimer = null;
    }
  }

  #ensureFrameDemand() {
    if (this.frameDemandToken !== null || this.state !== "playing") return;
    if (typeof this.surface.acquireFrameDemand === "function") {
      this.frameDemandToken = this.surface.acquireFrameDemand(
        `animation:${this.clip?.id ?? "unknown"}`
      );
    }
  }

  #releaseFrameDemand() {
    if (this.frameDemandToken === null) return false;
    const token = this.frameDemandToken;
    this.frameDemandToken = null;
    return this.surface.releaseFrameDemand?.(token) ?? false;
  }

  status() {
    const clip = this.clip;
    return Object.freeze({
      version: ANIMATION_RUNTIME_VERSION,
      state: this.state,
      waiting: this.waiting,
      frameDemandActive: this.frameDemandToken !== null,
      clip: clip ? Object.freeze({
        id: clip.id,
        targetCount: clip.targetIds.length,
        unitCount: clip.targets.units.length,
        objectCount: clip.objectCount,
        targetMode: clip.targetMode
      }) : null,
      time: Object.freeze({
        tick: this.timelineTick,
        simulationTime: round(this.timelineTime),
        stepSeconds: this.clock.stepSeconds
      }),
      statistics: Object.freeze({ ...this.statistics }),
      surface: typeof this.surface.getAnimationSurfaceDiagnostics === "function"
        ? this.surface.getAnimationSurfaceDiagnostics()
        : null
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
      this.#clearWaiting();
      this.#releaseFrameDemand();
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

function surfaceChanged(result) {
  if (result === false || result?.changed === false) return false;
  if (result?.changed === true) return true;
  return Number(result?.matrixWrites ?? 0) > 0 ||
    Number(result?.colorWrites ?? 0) > 0 ||
    Number(result?.pivotWrites ?? 0) > 0;
}

function normalizeTargetIds(values) {
  if (!Array.isArray(values)) throw new TypeError("targetIds deve ser uma lista.");
  return [...new Set(values.map(value => String(value).trim()).filter(Boolean))];
}

function normalizeTargetMode(value) {
  const mode = String(value ?? "selection");
  if (!["selection", "objects"].includes(mode)) {
    throw new RangeError(`Modo de alvos de animação desconhecido: ${mode}.`);
  }
  return mode;
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
    changedFrames: 0,
    identityFrames: 0,
    identitySurfaceFrames: 0,
    fixedPointFrames: 0,
    sleepFrames: 0,
    wakes: 0,
    steps: 0,
    droppedSteps: 0,
    matrixWrites: 0,
    colorWrites: 0,
    lastUpdateMs: 0,
    maximumUpdateMs: 0,
    lastStopReason: null,
    lastWakeReason: null,
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

function nonNegativeTime(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new RangeError("Tempo de animação deve ser finito e não negativo.");
  }
  return number;
}
