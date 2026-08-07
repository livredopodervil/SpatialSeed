import {
  EvolutionKind,
  EvolutionResult
} from "../../temporal-runtime/src/EvolutionResult.js?build=20260806-0050c";
import {
  identityMatrix
} from "../../math-affine/src/index.js?build=20260719-0028b";

export const TEMPORAL_ANIMATION_RUNTIME_VERSION =
  "temporal-animation-runtime-v2-independent-overlays";

const FRAME_EVENT = "animation.overlay.frame";
const FULL_SCENE_CHANGE_TYPES = new Set([
  "sandbox-undo",
  "sandbox-discard",
  "sandbox-rebased",
  "sandbox-state-replaced"
]);

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
    this.instances = new Map();
    this.activeInstanceId = null;
    this.disposed = false;
    this.statistics = initialStatistics();
  }

  get state() {
    return aggregateState(this.instances.values());
  }

  get clip() {
    return this.#activeInstance();
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
    const playbackId = createPlaybackId();
    const overlayId = `animation-overlay:${playbackId}`;
    const targets = this.surface.captureAnimationTargets(ids, {
      targetMode: mode,
      overlayId
    });
    const objectIds = targetObjectIds(targets);
    if (!targets?.units?.length || objectIds.length === 0) {
      this.surface.restoreAnimationTargets(targets, { overlayId });
      throw new RangeError("A seleção não contém alvos renderizáveis.");
    }

    // Instâncias podem compartilhar alvos: cada uma mantém uma camada
    // temporal própria, composta pelo renderer em ordem estável de criação.
    // Parar ou substituir uma instância nunca remove as demais camadas.

    let normalizedSegments;
    try {
      normalizedSegments = normalizeSegments({
        segments,
        targets,
        timeDomains: this.timeDomains,
        playbackId,
        initialTime: startTime
      });
    } catch (error) {
      this.surface.restoreAnimationTargets(targets, { overlayId });
      throw error;
    }

    const instance = {
      id: String(id),
      instanceId: playbackId,
      playbackId,
      overlayId,
      targetIds: Object.freeze(ids),
      targetMode: mode,
      targets,
      objectIds: Object.freeze(objectIds),
      objectIdSet: new Set(objectIds),
      objectCount: objectIds.length,
      segments: normalizedSegments.segments,
      operationIds: [],
      domainIds: [],
      state: "playing",
      timeSource,
      timelineTime: startTime,
      timelineTick: Math.floor(startTime / this.stepSeconds),
      createdOrder: this.statistics.starts + 1
    };

    this.instances.set(instance.instanceId, instance);
    this.activeInstanceId = instance.instanceId;
    this.statistics.starts += 1;

    try {
      for (const [index, segment] of instance.segments.entries()) {
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
        instance.domainIds.push(domainId);

        const operationId = `animation:${playbackId}:${segment.id}`;
        segment.operationId = operationId;
        instance.operationIds.push(operationId);
        this.temporalRuntime.register({
          id: operationId,
          phase: "animation",
          order: instance.createdOrder * 1000 + index,
          timeDomainId: domainId,
          targetId: segment.id,
          dependencyIds: segment.targetIds.map(
            targetId => `object:${targetId}`
          ),
          idempotent: !segment.timeDependent,
          evaluate: context =>
            this.#evaluateSegment(instance, segment, context)
        });
      }
    } catch (error) {
      this.#removeTemporalRegistrations(instance);
      this.instances.delete(instance.instanceId);
      this.#selectNewestActiveInstance();
      this.surface.restoreAnimationTargets(targets, { overlayId });
      throw error;
    }

    return this.status();
  }

  play(selector = null) {
    this.#assertActive();
    const instances = this.#selectedInstances(selector);
    if (!instances.length) {
      throw new Error("Nenhuma animação pausada para continuar.");
    }
    let resumed = 0;
    for (const instance of instances) {
      if (instance.state === "playing") continue;
      if (instance.state !== "paused") continue;
      for (const segment of instance.segments) {
        this.timeDomains.resume(segment.privateDomainId);
        this.temporalRuntime.enable(segment.operationId, true);
        this.temporalRuntime.wake(segment.operationId);
      }
      instance.state = "playing";
      resumed += 1;
    }
    if (!resumed && instances.every(item => item.state !== "playing")) {
      throw new Error("Nenhuma animação pausada para continuar.");
    }
    this.statistics.resumes += resumed;
    return this.status();
  }

  pause(selector = null) {
    this.#assertActive();
    const instances = this.#selectedInstances(selector);
    if (!instances.length) {
      throw new Error("Nenhuma animação em execução para pausar.");
    }
    let paused = 0;
    for (const instance of instances) {
      if (instance.state === "paused") continue;
      if (instance.state !== "playing") continue;
      for (const segment of instance.segments) {
        this.timeDomains.pause(segment.privateDomainId);
        this.temporalRuntime.enable(segment.operationId, false);
      }
      instance.state = "paused";
      paused += 1;
    }
    if (!paused && instances.every(item => item.state !== "paused")) {
      throw new Error("Nenhuma animação em execução para pausar.");
    }
    this.statistics.pauses += paused;
    return this.status();
  }

  stop(reason = "stopped", selector = null) {
    if (this.disposed || this.instances.size === 0) return this.status();
    const instances = this.#selectedInstances(selector);
    for (const instance of instances) {
      this.#stopInstance(instance, reason);
    }
    return this.status();
  }

  stopAll(reason = "stopped-all") {
    if (this.disposed || this.instances.size === 0) return this.status();
    for (const instance of [...this.instances.values()]) {
      this.#stopInstance(instance, reason);
    }
    return this.status();
  }

  sceneChanged(changes = []) {
    const impact = classifySceneChanges(changes);
    if (!impact.full && impact.objectIds.size === 0) {
      return Object.freeze({
        changed: false,
        full: false,
        affectedObjectIds: Object.freeze([]),
        stoppedInstanceIds: Object.freeze([])
      });
    }
    const stopped = [];
    for (const instance of [...this.instances.values()]) {
      if (impact.full || setsIntersect(instance.objectIdSet, impact.objectIds)) {
        stopped.push(instance.instanceId);
        this.#stopInstance(instance, impact.full
          ? "scene-replaced"
          : "animated-object-changed");
      }
    }
    return Object.freeze({
      changed: stopped.length > 0,
      full: impact.full,
      affectedObjectIds: Object.freeze([...impact.objectIds]),
      stoppedInstanceIds: Object.freeze(stopped)
    });
  }

  affectedByChanges(changes = [], selector = null) {
    const impact = classifySceneChanges(changes);
    const instances = selector === null
      ? [...this.instances.values()]
      : this.#selectedInstances(selector);
    const affected = impact.full
      ? instances
      : instances.filter(instance =>
          setsIntersect(instance.objectIdSet, impact.objectIds)
        );
    return Object.freeze({
      affected: affected.length > 0,
      full: impact.full,
      affectedObjectIds: Object.freeze([...impact.objectIds]),
      instanceIds: Object.freeze(affected.map(item => item.instanceId))
    });
  }

  fault(error, { operationId = null } = {}) {
    const record = errorRecord(error);
    let instance = operationId
      ? this.#instanceForOperation(operationId)
      : this.#activeInstance();
    try {
      if (instance) this.#stopInstance(instance, "runtime-error");
    } finally {
      this.statistics.lastError = record;
    }
    return this.status();
  }

  setTimeSource(timeSource = null, selector = null) {
    this.#assertActive();
    if (timeSource !== null && typeof timeSource !== "function") {
      throw new TypeError("Fonte temporal deve ser função.");
    }
    const instances = this.#selectedInstances(selector);
    for (const instance of instances) {
      instance.timeSource = timeSource;
      for (const segment of instance.segments) {
        this.temporalRuntime.wake(segment.operationId);
      }
    }
    return this.status();
  }

  seek(simulationTime, selector = null) {
    this.#assertActive();
    const instances = this.#selectedInstances(selector);
    if (!instances.length) {
      throw new Error("Nenhuma animação disponível para posicionar.");
    }
    const nextTime = finiteTime(simulationTime);
    let changed = false;
    let advanced = 0;
    for (const instance of instances) {
      const startedAt = this.now();
      const frames = [];
      for (const segment of instance.segments) {
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
        instance.targets,
        Object.freeze(frames),
        { overlayId: instance.overlayId }
      );
      this.#recordSurfaceResult(result, startedAt);
      instance.timelineTime = nextTime;
      instance.timelineTick = Math.floor(nextTime / this.stepSeconds);
      changed = changed || surfaceChanged(result);
      advanced += 1;
    }
    return Object.freeze({
      advanced: advanced > 0,
      advancedInstances: advanced,
      changed,
      state: this.state
    });
  }

  consumeTemporalEvents(events = []) {
    if (!Array.isArray(events) || !events.length || !this.instances.size) {
      return Object.freeze({
        handled: 0,
        changed: false,
        instanceCount: 0,
        result: null
      });
    }

    const grouped = new Map();
    let handled = 0;
    for (const event of events) {
      if (event?.type !== FRAME_EVENT ||
          event?.payload?.runtimeId !== this.runtimeId) {
        continue;
      }
      const instance = this.instances.get(event.payload.playbackId);
      if (!instance) continue;
      let list = grouped.get(instance.instanceId);
      if (!list) grouped.set(instance.instanceId, list = []);
      list.push(event);
      handled += 1;
    }
    if (!handled) {
      return Object.freeze({
        handled: 0,
        changed: false,
        instanceCount: 0,
        result: null
      });
    }

    let changed = false;
    const results = [];
    for (const [instanceId, relevant] of grouped) {
      const instance = this.instances.get(instanceId);
      if (!instance) continue;
      for (const event of relevant) {
        const segment = instance.segments.find(
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
        instance.segments.flatMap(segment => segment.currentFrame)
      );
      const startedAt = this.now();
      const result = this.surface.applyAnimationFrame(
        instance.targets,
        combined,
        { overlayId: instance.overlayId }
      );
      this.#recordSurfaceResult(result, startedAt);
      changed = changed || surfaceChanged(result);
      results.push(Object.freeze({ instanceId, result }));
    }

    return Object.freeze({
      handled,
      changed,
      instanceCount: results.length,
      result: results.length === 1 ? results[0].result : Object.freeze(results)
    });
  }

  status() {
    const instances = [...this.instances.values()]
      .sort((left, right) => left.createdOrder - right.createdOrder)
      .map(instance => this.#describeInstance(instance));
    const active = this.#activeInstance();
    return Object.freeze({
      version: TEMPORAL_ANIMATION_RUNTIME_VERSION,
      state: this.state,
      activeInstanceId: active?.instanceId ?? null,
      waiting: active
        ? temporalWaiting(active, this.temporalRuntime)
        : null,
      frameDemandActive: [...this.instances.values()].some(instance =>
        instance.operationIds.some(id =>
          this.temporalRuntime.describe(id).enabled
        )
      ),
      clip: active ? this.#describeInstance(active) : null,
      instanceCount: instances.length,
      instances: Object.freeze(instances),
      time: Object.freeze({
        tick: active?.timelineTick ?? 0,
        simulationTime: round(active?.timelineTime ?? 0),
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
      this.stopAll("disposed");
    } finally {
      this.disposed = true;
    }
    return true;
  }

  #evaluateSegment(instance, segment, context) {
    if (!this.instances.has(instance.instanceId) ||
        instance.state !== "playing") {
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
    instance.timelineTime = t;
    instance.timelineTick = tick;
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
          playbackId: instance.playbackId,
          overlayId: instance.overlayId,
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

  #stopInstance(instance, reason) {
    if (!instance || !this.instances.has(instance.instanceId)) return false;
    this.#removeTemporalRegistrations(instance);
    let restoreError = null;
    try {
      this.surface.restoreAnimationTargets(instance.targets, {
        overlayId: instance.overlayId
      });
    } catch (error) {
      restoreError = error;
    }
    this.instances.delete(instance.instanceId);
    this.statistics.stops += 1;
    this.statistics.lastStopReason = String(reason);
    if (this.activeInstanceId === instance.instanceId) {
      this.#selectNewestActiveInstance();
    }
    if (restoreError) {
      this.statistics.lastError = errorRecord(restoreError);
      throw restoreError;
    }
    return true;
  }

  #removeTemporalRegistrations(instance) {
    for (const operationId of [...instance.operationIds].reverse()) {
      try { this.temporalRuntime.unregister(operationId); } catch {}
    }
    for (const domainId of [...instance.domainIds].reverse()) {
      try { this.timeDomains.delete(domainId); } catch {}
    }
    instance.operationIds.length = 0;
    instance.domainIds.length = 0;
  }

  #describeInstance(instance) {
    const currentTime = currentInstanceTime(instance, this.timeDomains);
    instance.timelineTime = currentTime;
    instance.timelineTick = Math.floor(currentTime / this.stepSeconds);
    return Object.freeze({
      id: instance.id,
      instanceId: instance.instanceId,
      playbackId: instance.playbackId,
      overlayId: instance.overlayId,
      state: instance.state,
      targetCount: instance.targetIds.length,
      targetIds: Object.freeze([...instance.targetIds]),
      objectCount: instance.objectCount,
      objectIds: Object.freeze([...instance.objectIds]),
      unitCount: instance.targets.units.length,
      targetMode: instance.targetMode,
      segmentCount: instance.segments.length,
      operationIds: Object.freeze([...instance.operationIds]),
      domains: Object.freeze(instance.segments.map(segment => Object.freeze({
        segmentId: segment.id,
        parentDomainId: segment.timeDomainId,
        privateDomainId: segment.privateDomainId
      }))),
      time: Object.freeze({
        tick: instance.timelineTick,
        simulationTime: round(instance.timelineTime)
      })
    });
  }

  #selectedInstances(selector) {
    if (this.instances.size === 0) return [];
    if (selector === null || selector === undefined) {
      const active = this.#activeInstance();
      return active ? [active] : [];
    }
    if (selector === "all" || selector?.all === true) {
      return [...this.instances.values()];
    }
    if (typeof selector === "string") {
      const instance = this.instances.get(selector);
      return instance ? [instance] : [];
    }
    if (selector?.instanceId) {
      const instance = this.instances.get(String(selector.instanceId));
      return instance ? [instance] : [];
    }
    if (Array.isArray(selector?.targetIds)) {
      const targets = new Set(normalizeTargetIds(selector.targetIds));
      return [...this.instances.values()].filter(instance =>
        setsIntersect(instance.objectIdSet, targets) ||
        instance.targetIds.some(id => targets.has(id))
      );
    }
    throw new TypeError("Seletor de animação inválido.");
  }

  #activeInstance() {
    return this.instances.get(this.activeInstanceId) ?? null;
  }

  #selectNewestActiveInstance() {
    const newest = [...this.instances.values()]
      .sort((left, right) => right.createdOrder - left.createdOrder)[0] ?? null;
    this.activeInstanceId = newest?.instanceId ?? null;
  }

  #instanceForOperation(operationId) {
    const id = String(operationId ?? "");
    return [...this.instances.values()].find(instance =>
      instance.operationIds.includes(id)
    ) ?? null;
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
  return Object.freeze({
    overlayId: targets.overlayId ?? null,
    units: Object.freeze(units)
  });
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

function currentInstanceTime(instance, timeDomains) {
  const first = instance.segments[0];
  return first ? timeDomains.time(first.privateDomainId) : 0;
}

function temporalWaiting(instance, runtime) {
  const states = instance.operationIds.map(id => runtime.describe(id));
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

function targetObjectIds(targets) {
  return [...new Set(
    targets?.units?.flatMap(unit =>
      unit.objects?.map(object => String(object.objectId)) ?? []
    ) ?? []
  )];
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

function aggregateState(instances) {
  const list = [...instances];
  if (!list.length) return "idle";
  if (list.some(instance => instance.state === "playing")) return "playing";
  return "paused";
}

function classifySceneChanges(changes) {
  const list = Array.isArray(changes) ? changes : [];
  const full = list.some(change =>
    FULL_SCENE_CHANGE_TYPES.has(String(change?.type ?? ""))
  );
  const objectIds = new Set();
  for (const change of list) {
    const id = String(change?.objectId ?? change?.object?.id ?? "").trim();
    if (id) objectIds.add(id);
  }
  return Object.freeze({ full, objectIds });
}

function setsIntersect(left, right) {
  if (!left?.size || !right?.size) return false;
  const [small, large] = left.size <= right.size
    ? [left, right]
    : [right, left];
  for (const value of small) {
    if (large.has(value)) return true;
  }
  return false;
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
