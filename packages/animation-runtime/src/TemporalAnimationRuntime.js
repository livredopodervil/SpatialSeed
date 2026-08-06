import {
  EvolutionKind,
  EvolutionResult
} from "../../temporal-runtime/src/EvolutionResult.js?build=20260806-0050b";
import {
  identityMatrix
} from "../../math-affine/src/index.js?build=20260719-0028b";

export const TEMPORAL_ANIMATION_RUNTIME_VERSION =
  "temporal-animation-runtime-v1";

const FRAME_EVENT = "animation.overlay.frame";

export class TemporalAnimationRuntime {
  constructor({
    surface,
    temporalRuntime,
    timeDomains = temporalRuntime?.domains,
    stepSeconds = 1 / 60,
    now = defaultNow
  } = {}) {
    validateSurface(surface);
    if (!temporalRuntime?.register || !temporalRuntime?.unregister) {
      throw new TypeError(
        "TemporalAnimationRuntime exige TemporalRuntime."
      );
    }
    if (!timeDomains?.create || !timeDomains?.delete) {
      throw new TypeError(
        "TemporalAnimationRuntime exige domínios temporais."
      );
    }
    const step = Number(stepSeconds);
    if (!Number.isFinite(step) || step <= 0) {
      throw new RangeError("stepSeconds deve ser positivo.");
    }

    this.surface = surface;
    this.temporalRuntime = temporalRuntime;
    this.timeDomains = timeDomains;
    this.stepSeconds = step;
    this.now = now;
    this.runtimeId = createRuntimeId();
    this.state = "idle";
    this.clip = null;
    this.timeSource = null;
    this.timelineTime = 0;
    this.timelineTick = 0;
    this.disposed = false;
    this.statistics = initialStatistics();
  }

  start({
    id = "temporary",
    targetIds,
    targetMode = "selection",
    evaluate,
    timeSource = null,
    initialTime = 0,
    timeDomainId = "world",
    timeDependent = true
  } = {}) {
    if (typeof evaluate !== "function") {
      throw new TypeError("Animação exige evaluate().");
    }
    return this.startSegments({
      id,
      targetIds,
      targetMode,
      timeSource,
      initialTime,
      segments: [{
        id: "main",
        targetIds,
        timeDomainId,
        evaluate,
        timeDependent
      }]
    });
  }

  startSegments({
    id = "composition",
    targetIds,
    targetMode = "objects",
    segments,
    timeSource = null,
    initialTime = 0
  } = {}) {
    this.#assertActive();
    if (timeSource !== null && typeof timeSource !== "function") {
      throw new TypeError("Fonte temporal deve ser função.");
    }
    if (!Array.isArray(segments) || !segments.length) {
      throw new TypeError("Animação temporal exige segmentos.");
    }

    const ids = normalizeTargetIds(targetIds);
    const mode = normalizeTargetMode(targetMode);
    const startTime = finiteTime(initialTime);
    if (this.state !== "idle") this.stop("replaced");

    const targets = this.surface.captureAnimationTargets(ids, {
      targetMode: mode
    });
    const objectCount = targetObjectCount(targets);
    if (!targets?.units?.length || objectCount === 0) {
      throw new RangeError("A seleção não contém alvos renderizáveis.");
    }

    let normalizedSegments;
    try {
      normalizedSegments = normalizeSegments({
        segments,
        targets,
        timeDomains: this.timeDomains,
        playbackId: createPlaybackId(),
        initialTime: startTime
      });
    } catch (error) {
      this.surface.restoreAnimationTargets(targets);
      throw error;
    }

    const playbackId = normalizedSegments.playbackId;
    const clip = {
      id: String(id),
      playbackId,
      targetIds: Object.freeze(ids),
      targetMode: mode,
      targets,
      objectCount,
      segments: normalizedSegments.segments,
      operationIds: [],
      domainIds: []
    };

    this.clip = clip;
    this.timeSource = timeSource;
    this.timelineTime = startTime;
    this.timelineTick = Math.floor(startTime / this.stepSeconds);
    this.state = "playing";
    this.statistics = initialStatistics();
    this.statistics.starts = 1;

    try {
      for (const [index, segment] of clip.segments.entries()) {
        const domainId = privateDomainId(playbackId, segment.id);
        this.timeDomains.create({
          id: domainId,
          parentId: segment.timeDomainId,
          localTime: scaledTimelineTime(
            startTime,
            this.timeDomains.effectiveRate(segment.timeDomainId)
          ),
          rate: 1,
          paused: false
        });
        segment.privateDomainId = domainId;
        clip.domainIds.push(domainId);

        const operationId = `animation:${playbackId}:${segment.id}`;
        segment.operationId = operationId;
        clip.operationIds.push(operationId);
        this.temporalRuntime.register({
          id: operationId,
          phase: "animation",
          order: index,
          timeDomainId: domainId,
          targetId: segment.id,
          dependencyIds: [],
          idempotent: !segment.timeDependent,
          evaluate: context => this.#evaluateSegment(segment, context)
        });
      }
    } catch (error) {
      this.#removeTemporalRegistrations(clip);
      this.clip = null;
      this.state = "idle";
      this.surface.restoreAnimationTargets(targets);
      throw error;
    }

    return this.status();
  }

  play() {
    this.#assertActive();
    if (this.state === "playing") return this.status();
    if (this.state !== "paused" || !this.clip) {
      throw new Error("Nenhuma animação pausada para continuar.");
    }
    for (const segment of this.clip.segments) {
      this.timeDomains.resume(segment.privateDomainId);
      this.temporalRuntime.enable(segment.operationId, true);
      this.temporalRuntime.wake(segment.operationId);
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
    for (const segment of this.clip.segments) {
      this.timeDomains.pause(segment.privateDomainId);
      this.temporalRuntime.enable(segment.operationId, false);
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
    this.#removeTemporalRegistrations(clip);
    let restoreError = null;
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

  fault(error) {
    const record = errorRecord(error);
    try {
      if (this.state !== "idle") this.stop("runtime-error");
    } finally {
      this.statistics.lastError = record;
    }
    return this.status();
  }

  setTimeSource(timeSource = null) {
    this.#assertActive();
    if (timeSource !== null && typeof timeSource !== "function") {
      throw new TypeError("Fonte temporal deve ser função.");
    }
    this.timeSource = timeSource;
    if (this.clip) {
      for (const segment of this.clip.segments) {
        this.temporalRuntime.wake(segment.operationId);
      }
    }
    return this.status();
  }

  seek(simulationTime) {
    this.#assertActive();
    if (!this.clip) {
      throw new Error("Nenhuma animação disponível para posicionar.");
    }
    const nextTime = finiteTime(simulationTime);
    const startedAt = this.now();
    const frames = [];

    for (const segment of this.clip.segments) {
      const segmentTime = scaledTimelineTime(
        nextTime,
        this.timeDomains.effectiveRate(segment.timeDomainId)
      );
      this.timeDomains.seek(segment.privateDomainId, segmentTime);
      const evaluated = segment.evaluate(Object.freeze({
        t: segmentTime,
        dt: segment.lastEvaluationTime === null
          ? 0
          : segmentTime - segment.lastEvaluationTime,
        tick: Math.floor(segmentTime / this.stepSeconds),
        targets: segment.targets,
        result: EvolutionResult
      }));
      const resolved = resolveAnimationEvaluation(evaluated);
      segment.lastEvaluationTime = segmentTime;
      if (resolved.kind === EvolutionKind.CHANGED) {
        segment.currentFrame = resolved.frame;
        segment.lastAppliedSignature = frameSignature(resolved.frame);
      }
      frames.push(...segment.currentFrame);
      this.temporalRuntime.wake(segment.operationId);
    }

    const result = this.surface.applyAnimationFrame(
      this.clip.targets,
      Object.freeze(frames)
    );
    this.#recordSurfaceResult(result, startedAt);
    this.timelineTime = nextTime;
    this.timelineTick = Math.floor(nextTime / this.stepSeconds);
    return Object.freeze({
      advanced: true,
      changed: surfaceChanged(result),
      state: this.state,
      result
    });
  }

  consumeTemporalEvents(events = []) {
    if (!Array.isArray(events) || !events.length || !this.clip) {
      return Object.freeze({ handled: 0, changed: false, result: null });
    }
    const relevant = events.filter(event =>
      event?.type === FRAME_EVENT &&
      event?.payload?.runtimeId === this.runtimeId &&
      event?.payload?.playbackId === this.clip.playbackId
    );
    if (!relevant.length) {
      return Object.freeze({ handled: 0, changed: false, result: null });
    }

    for (const event of relevant) {
      const segment = this.clip.segments.find(
        entry => entry.id === event.payload.segmentId
      );
      if (!segment) continue;
      const frame = normalizeUnitFrameList(
        event.payload.frame,
        segment.targets
      );
      segment.currentFrame = frame;
      segment.lastAppliedSignature = event.payload.signature ??
        frameSignature(frame);
      segment.lastEvaluationTime = Number(event.payload.t);
    }

    const combined = Object.freeze(
      this.clip.segments.flatMap(segment => segment.currentFrame)
    );
    const startedAt = this.now();
    const result = this.surface.applyAnimationFrame(
      this.clip.targets,
      combined
    );
    this.#recordSurfaceResult(result, startedAt);
    return Object.freeze({
      handled: relevant.length,
      changed: surfaceChanged(result),
      result
    });
  }

  status() {
    const clip = this.clip;
    const currentTime = clip
      ? currentClipTime(clip, this.timeDomains, this.timeSource)
      : 0;
    this.timelineTime = currentTime;
    this.timelineTick = Math.floor(currentTime / this.stepSeconds);
    return Object.freeze({
      version: TEMPORAL_ANIMATION_RUNTIME_VERSION,
      state: this.state,
      waiting: clip ? temporalWaiting(clip, this.temporalRuntime) : null,
      frameDemandActive: clip
        ? clip.operationIds.some(id =>
            this.temporalRuntime.describe(id).enabled
          )
        : false,
      clip: clip ? Object.freeze({
        id: clip.id,
        playbackId: clip.playbackId,
        targetCount: clip.targetIds.length,
        unitCount: clip.targets.units.length,
        objectCount: clip.objectCount,
        targetMode: clip.targetMode,
        segmentCount: clip.segments.length,
        operationIds: Object.freeze([...clip.operationIds]),
        domains: Object.freeze(clip.segments.map(segment => Object.freeze({
          segmentId: segment.id,
          parentDomainId: segment.timeDomainId,
          privateDomainId: segment.privateDomainId
        })))
      }) : null,
      time: Object.freeze({
        tick: this.timelineTick,
        simulationTime: round(this.timelineTime),
        stepSeconds: this.stepSeconds
      }),
      statistics: Object.freeze({ ...this.statistics }),
      surface: typeof this.surface.getAnimationSurfaceDiagnostics === "function"
        ? this.surface.getAnimationSurfaceDiagnostics()
        : null
    });
  }

  dispose() {
    if (this.disposed) return false;
    try {
      if (this.state !== "idle") this.stop("disposed");
    } finally {
      this.disposed = true;
    }
    return true;
  }

  #evaluateSegment(segment, context) {
    if (!this.clip || this.state !== "playing") {
      return EvolutionResult.identity();
    }
    const t = finiteTime(context.t);
    const dt = segment.lastEvaluationTime === null
      ? 0
      : t - segment.lastEvaluationTime;
    const tick = Math.floor(t / this.stepSeconds);
    const evaluated = segment.evaluate(Object.freeze({
      t,
      dt,
      tick,
      targets: segment.targets,
      result: EvolutionResult
    }));
    const resolved = resolveAnimationEvaluation(evaluated);
    segment.lastEvaluationTime = t;
    this.timelineTime = t;
    this.timelineTick = tick;
    this.statistics.steps += 1;
    this.statistics.frames += 1;

    if (resolved.kind !== EvolutionKind.CHANGED) {
      if (resolved.kind === EvolutionKind.IDENTITY) {
        this.statistics.identityFrames += 1;
      } else if (resolved.kind === EvolutionKind.FIXED_POINT) {
        this.statistics.fixedPointFrames += 1;
      } else if (resolved.kind === EvolutionKind.SLEEP_UNTIL) {
        this.statistics.sleepFrames += 1;
      }
      return resolved.result;
    }

    const signature = frameSignature(resolved.frame);
    if (signature === segment.lastAppliedSignature) {
      this.statistics.identityFrames += 1;
      return EvolutionResult.identity();
    }

    return EvolutionResult.changed([], {
      events: [Object.freeze({
        type: FRAME_EVENT,
        payload: Object.freeze({
          runtimeId: this.runtimeId,
          playbackId: this.clip.playbackId,
          segmentId: segment.id,
          t,
          dt,
          tick,
          signature,
          frame: resolved.frame
        })
      })]
    });
  }

  #recordSurfaceResult(result, startedAt) {
    const elapsed = Math.max(0, this.now() - startedAt);
    const changed = surfaceChanged(result);
    if (changed) this.statistics.changedFrames += 1;
    else this.statistics.identitySurfaceFrames += 1;
    this.statistics.matrixWrites += Number(result?.matrixWrites ?? 0);
    this.statistics.colorWrites += Number(result?.colorWrites ?? 0);
    this.statistics.lastUpdateMs = round(elapsed);
    this.statistics.maximumUpdateMs = Math.max(
      this.statistics.maximumUpdateMs,
      this.statistics.lastUpdateMs
    );
    this.statistics.lastError = null;
  }

  #removeTemporalRegistrations(clip) {
    for (const operationId of [...clip.operationIds].reverse()) {
      try { this.temporalRuntime.unregister(operationId); } catch {}
    }
    for (const domainId of [...clip.domainIds].reverse()) {
      try { this.timeDomains.delete(domainId); } catch {}
    }
    clip.operationIds.length = 0;
    clip.domainIds.length = 0;
  }

  #assertActive() {
    if (this.disposed) {
      throw new Error("TemporalAnimationRuntime foi descartado.");
    }
  }
}

function normalizeSegments({
  segments,
  targets,
  timeDomains,
  playbackId,
  initialTime
}) {
  const ids = new Set();
  const unitOwners = new Map();
  const normalized = segments.map((segment, index) => {
    const id = nonEmpty(segment?.id ?? `segment-${index + 1}`);
    if (ids.has(id)) throw new Error(`Segmento repetido: ${id}.`);
    ids.add(id);
    if (typeof segment?.evaluate !== "function") {
      throw new TypeError(`Segmento ${id} exige evaluate().`);
    }
    const parentDomainId = nonEmpty(segment.timeDomainId ?? "world");
    if (!timeDomains.has(parentDomainId)) {
      throw new Error(`Domínio temporal inexistente: ${parentDomainId}.`);
    }
    const requestedIds = normalizeTargetIds(segment.targetIds);
    const segmentTargets = subsetTargets(targets, requestedIds);
    for (const unit of segmentTargets.units) {
      if (unitOwners.has(unit.unitId)) {
        throw new Error(
          `Unidade ${unit.unitId} pertence a ${unitOwners.get(unit.unitId)} e ${id}.`
        );
      }
      unitOwners.set(unit.unitId, id);
    }
    return {
      id,
      targetIds: Object.freeze(requestedIds),
      targets: segmentTargets,
      timeDomainId: parentDomainId,
      evaluate: segment.evaluate,
      timeDependent: segment.timeDependent !== false,
      privateDomainId: null,
      operationId: null,
      lastEvaluationTime: initialTime,
      lastAppliedSignature: null,
      currentFrame: identityUnitFrame(segmentTargets)
    };
  });

  for (const unit of targets.units) {
    if (!unitOwners.has(unit.unitId)) {
      throw new Error(`Unidade ${unit.unitId} não possui segmento temporal.`);
    }
  }
  return { playbackId, segments: normalized };
}

function subsetTargets(targets, targetIds) {
  const requested = new Set(targetIds);
  const units = targets.units.filter(unit =>
    requested.has(unit.sourceId ?? unit.unitId) ||
    requested.has(unit.unitId)
  );
  if (!units.length) {
    throw new Error(
      `Nenhuma unidade renderizável corresponde a ${targetIds.join(", ")}.`
    );
  }
  return Object.freeze({ units: Object.freeze(units) });
}

function identityUnitFrame(targets) {
  return Object.freeze(targets.units.map(unit => Object.freeze({
    unitId: unit.unitId,
    matrix: Object.freeze(identityMatrix()),
    color: null
  })));
}

function resolveAnimationEvaluation(candidate) {
  if (EvolutionResult.is(candidate)) {
    if (candidate.kind !== EvolutionKind.CHANGED) {
      return Object.freeze({
        kind: candidate.kind,
        result: candidate,
        frame: null
      });
    }
    const frame = Array.isArray(candidate.value)
      ? candidate.value
      : candidate.changes;
    return Object.freeze({
      kind: EvolutionKind.CHANGED,
      result: candidate,
      frame: normalizeUnitFrameList(frame)
    });
  }
  if (candidate === undefined || candidate === null || candidate === false) {
    return Object.freeze({
      kind: EvolutionKind.IDENTITY,
      result: EvolutionResult.identity(),
      frame: null
    });
  }
  if (!Array.isArray(candidate)) {
    throw new TypeError("Quadro de animação deve ser uma lista.");
  }
  const frame = normalizeUnitFrameList(candidate);
  return Object.freeze({
    kind: EvolutionKind.CHANGED,
    result: EvolutionResult.changed([], { value: frame }),
    frame
  });
}

function normalizeUnitFrameList(frame, targets = null) {
  if (!Array.isArray(frame)) {
    throw new TypeError("Quadro de animação deve ser uma lista.");
  }
  const normalized = Object.freeze(frame.map(entry => {
    const unitId = nonEmpty(entry?.unitId);
    if (!Array.isArray(entry?.matrix) || entry.matrix.length !== 16) {
      throw new TypeError(`Matriz inválida para ${unitId}.`);
    }
    return Object.freeze({
      unitId,
      matrix: Object.freeze(entry.matrix.map(Number)),
      color: entry.color ?? null
    });
  }));
  if (targets) {
    const expected = new Set(targets.units.map(unit => unit.unitId));
    const actual = new Set(normalized.map(entry => entry.unitId));
    if (expected.size !== actual.size ||
        [...expected].some(id => !actual.has(id))) {
      throw new Error("Quadro não cobre todas as unidades do segmento.");
    }
  }
  return normalized;
}

function frameSignature(frame) {
  return JSON.stringify(frame.map(entry => [
    entry.unitId,
    entry.matrix.map(roundSignature),
    entry.color ?? null
  ]));
}

function currentClipTime(clip, timeDomains, _timeSource) {
  const first = clip.segments[0];
  return first ? timeDomains.time(first.privateDomainId) : 0;
}

function temporalWaiting(clip, runtime) {
  const states = clip.operationIds.map(id => runtime.describe(id));
  if (states.every(state => state.state === "ready")) return null;
  return Object.freeze(states.map(state => Object.freeze({
    id: state.id,
    state: state.state,
    wakeLocalTime: state.wakeLocalTime
  })));
}

function validateSurface(surface) {
  for (const method of [
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
  const ids = [...new Set(
    values.map(value => String(value ?? "").trim()).filter(Boolean)
  )];
  if (!ids.length) throw new RangeError("Animação exige ao menos um alvo.");
  return ids;
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

function surfaceChanged(result) {
  if (result === false || result?.changed === false) return false;
  if (result?.changed === true) return true;
  return Number(result?.matrixWrites ?? 0) > 0 ||
    Number(result?.colorWrites ?? 0) > 0 ||
    Number(result?.pivotWrites ?? 0) > 0;
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

function scaledTimelineTime(time, effectiveRate) {
  const value = Number(time) * Number(effectiveRate);
  if (!Number.isFinite(value)) {
    throw new RangeError("Tempo escalado de animação deve ser finito.");
  }
  return value;
}

function privateDomainId(playbackId, segmentId) {
  return `animation.${playbackId}.${segmentId}`;
}

function createRuntimeId() {
  return `animation-runtime-${createPlaybackId()}`;
}

function createPlaybackId() {
  return globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
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

function finiteTime(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new RangeError("Tempo de animação deve ser finito.");
  }
  return number;
}

function nonEmpty(value) {
  const text = String(value ?? "").trim();
  if (!text) throw new TypeError("Identificador vazio.");
  return text;
}

function round(value) {
  return Math.round(Number(value) * 1e6) / 1e6;
}

function roundSignature(value) {
  return Math.round(Number(value) * 1e12) / 1e12;
}
