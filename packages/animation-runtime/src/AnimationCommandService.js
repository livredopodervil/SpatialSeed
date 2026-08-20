import {
  compileAnimationProgram,
  createAnimationEvaluator,
  describeAnimationProgram
} from "./AnimationProgram.js?build=20260806-0050c";
import {
  listAnimationPresets,
  resolveAnimationPreset
} from "./AnimationPresetCatalog.js?build=20260720-0028d";
import {
  compileAnimationTrackProgram,
  createAnimationTrackEvaluator,
  describeAnimationTrackProgram
} from "./AnimationTrackProgram.js?build=20260806-0050c";

export const ANIMATION_COMMAND_SERVICE_VERSION =
  "animation-command-service-v4-independent-instances";

export class AnimationCommandService {
  constructor({ runtime, selection }) {
    if (!runtime || typeof runtime.start !== "function") {
      throw new TypeError("AnimationCommandService exige runtime.");
    }
    if (typeof selection !== "function") {
      throw new TypeError("AnimationCommandService exige seleção consultável.");
    }
    this.runtime = runtime;
    this.selection = selection;
    this.currentProgram = null;
    this.currentPreset = null;
    this.currentComposition = null;
    this.currentInstanceId = null;
    this.sharedSession = null;
    this.sharedPlaybackId = null;
    this.sharedRuntimeInstanceId = null;
    this.sharedNow = () => Date.now();
  }

  start({
    id = "custom",
    operations,
    targetIds = null,
    targetMode = "selection",
    timeDomainId = "world"
  } = {}) {
    this.#detachSharedSelection();
    return this.#applyDescriptor(this.prepareShared("program", {
      id,
      operations,
      targetIds,
      targetMode,
      timeDomainId
    }));
  }

  preset(id, parameters = {}, {
    targetIds = null,
    targetMode = "selection",
    timeDomainId = "world"
  } = {}) {
    this.#detachSharedSelection();
    return this.#applyDescriptor(this.prepareShared("preset", {
      id,
      parameters,
      targetIds,
      targetMode,
      timeDomainId
    }));
  }

  compose({ id = "composition", tracks, targetMode = "objects" } = {}) {
    this.#detachSharedSelection();
    return this.#applyDescriptor(this.prepareShared("composition", {
      id,
      tracks,
      targetMode
    }));
  }

  prepareShared(operation, args = {}) {
    const kind = String(operation ?? "");
    if (kind === "program") {
      const program = compileAnimationProgram(args.operations, {
        id: args.id ?? "custom"
      });
      return deepFreeze({
        kind,
        id: program.id,
        operations: structuredClone(program.operations),
        targetIds: resolvedTargetIds(args.targetIds, this.selection),
        targetMode: normalizeTargetMode(args.targetMode),
        timeDomainId: normalizeTimeDomainId(args.timeDomainId)
      });
    }
    if (kind === "preset") {
      const preset = resolveAnimationPreset(
        args.id,
        args.parameters ?? {}
      );
      return deepFreeze({
        kind,
        id: `preset.${preset.id}`,
        operations: structuredClone(preset.operations),
        targetIds: resolvedTargetIds(args.targetIds, this.selection),
        targetMode: normalizeTargetMode(args.targetMode),
        timeDomainId: normalizeTimeDomainId(args.timeDomainId),
        preset: describePreset(preset)
      });
    }
    if (kind !== "composition") {
      throw new RangeError(
        `Definição de animação desconhecida: ${kind}.`
      );
    }

    let fallbackTargets = null;
    const resolvedTracks = (args.tracks ?? []).map((track, index) => {
      const targetIds = track?.targetIds == null
        ? (fallbackTargets ??= selectedTargetIds(this.selection()))
        : normalizeTargetIds(track.targetIds);
      const timeDomainId = normalizeTimeDomainId(track?.timeDomainId);
      if (track?.presetId) {
        const preset = resolveAnimationPreset(
          track.presetId,
          track.parameters ?? {}
        );
        return {
          id: track.id ?? `track-${index + 1}`,
          targetIds,
          operations: structuredClone(preset.operations),
          metadata: {
            ...structuredClone(track?.metadata ?? {}),
            timeDomainId,
            preset: describePreset(preset)
          }
        };
      }
      return {
        id: track?.id ?? `track-${index + 1}`,
        targetIds,
        operations: track?.operations,
        metadata: {
          ...structuredClone(track?.metadata ?? {}),
          timeDomainId
        }
      };
    });
    const composition = compileAnimationTrackProgram(resolvedTracks, {
      id: args.id ?? "composition"
    });
    return deepFreeze({
      kind,
      id: composition.id,
      tracks: structuredClone(resolvedTracks),
      targetIds: [...composition.targetIds],
      targetMode: normalizeTargetMode(args.targetMode ?? "objects")
    });
  }

  synchronizeShared(session, {
    now = () => Date.now()
  } = {}) {
    validateSharedSession(session);
    this.sharedNow = now;

    if (session.state === "idle") {
      if (this.sharedRuntimeInstanceId &&
          this.#hasInstance(this.sharedRuntimeInstanceId)) {
        this.runtime.stop(
          session.reason ?? "shared-stop",
          { instanceId: this.sharedRuntimeInstanceId }
        );
      }
      this.#clearSharedBinding();
      this.#refreshCurrentSelection();
      return this.status();
    }

    const next = deepFreeze(structuredClone(session));
    const samePlayback =
      this.sharedPlaybackId === next.playbackId &&
      this.sharedRuntimeInstanceId !== null &&
      this.#hasInstance(this.sharedRuntimeInstanceId);
    this.sharedSession = next;
    const timeSource = () => sharedSessionTime(
      this.sharedSession,
      this.sharedNow()
    );
    const currentTime = timeSource();

    if (!samePlayback) {
      const previousInstanceId = this.sharedRuntimeInstanceId;
      if (previousInstanceId && this.#hasInstance(previousInstanceId)) {
        this.runtime.stop(
          "shared-replaced",
          { instanceId: previousInstanceId }
        );
      }
      this.#applyDescriptor(next.descriptor, {
        timeSource,
        initialTime: currentTime
      });
      this.sharedPlaybackId = next.playbackId;
      this.sharedRuntimeInstanceId = this.currentInstanceId;
    } else {
      this.runtime.seek(currentTime, {
        instanceId: this.sharedRuntimeInstanceId
      });
    }

    const instance = this.#instance(this.sharedRuntimeInstanceId);
    if (next.state === "paused" && instance?.state === "playing") {
      this.runtime.pause({ instanceId: this.sharedRuntimeInstanceId });
    } else if (next.state === "playing" && instance?.state === "paused") {
      this.runtime.play({ instanceId: this.sharedRuntimeInstanceId });
    }
    return this.status();
  }

  pause(selector = null) {
    this.runtime.pause(this.#resolvedSelector(selector));
    return this.status();
  }

  resume(selector = null) {
    this.runtime.play(this.#resolvedSelector(selector));
    return this.status();
  }

  stop(selector = null, reason = "user") {
    const resolved = this.#resolvedSelector(selector);
    const ids = this.#selectorInstanceIds(resolved);
    this.runtime.stop(reason, resolved);
    this.#forgetStopped(ids);
    return this.status();
  }

  stopAll(reason = "user-all") {
    if (typeof this.runtime.stopAll === "function") {
      this.runtime.stopAll(reason);
    } else {
      this.runtime.stop(reason);
    }
    this.#clearSharedBinding();
    this.currentInstanceId = null;
    this.#clearCurrent();
    return this.status();
  }

  sceneChanged(changes = [], session = null) {
    const sharedId = this.sharedRuntimeInstanceId;
    const currentId = this.currentInstanceId;
    const result = this.runtime.sceneChanged(changes);
    const stopped = new Set(result.stoppedInstanceIds ?? []);
    const sharedAffected = Boolean(sharedId && stopped.has(sharedId));
    const currentAffected = Boolean(currentId && stopped.has(currentId));
    if (sharedAffected) this.#clearSharedBinding();
    if (currentAffected) this.#refreshCurrentSelection();
    return Object.freeze({
      ...result,
      sharedAffected,
      currentAffected,
      sharedPlaybackId: session?.playbackId ?? this.sharedPlaybackId
    });
  }

  status() {
    const runtime = this.runtime.status();
    if (this.currentInstanceId && !this.#hasInstance(this.currentInstanceId)) {
      this.#refreshCurrentSelection(runtime);
    }
    if (this.sharedRuntimeInstanceId &&
        !this.#hasInstance(this.sharedRuntimeInstanceId)) {
      this.#clearSharedBinding();
    }
    return Object.freeze({
      serviceVersion: ANIMATION_COMMAND_SERVICE_VERSION,
      ...runtime,
      currentInstanceId: this.currentInstanceId,
      sharedRuntimeInstanceId: this.sharedRuntimeInstanceId,
      program: this.currentProgram
        ? describeAnimationProgram(this.currentProgram)
        : null,
      preset: this.currentPreset
        ? describePreset(this.currentPreset)
        : null,
      composition: this.currentComposition
        ? describeAnimationTrackProgram(this.currentComposition)
        : null
    });
  }

  presets() {
    return Object.freeze({
      version: ANIMATION_COMMAND_SERVICE_VERSION,
      presets: listAnimationPresets()
    });
  }

  #applyDescriptor(descriptor, {
    timeSource = null,
    initialTime = 0
  } = {}) {
    validateDescriptor(descriptor);
    this.#clearCurrent();

    if (descriptor.kind === "composition") {
      const composition = compileAnimationTrackProgram(
        descriptor.tracks,
        { id: descriptor.id }
      );
      if (typeof this.runtime.startSegments === "function") {
        this.runtime.startSegments({
          id: composition.id,
          targetIds: composition.targetIds,
          targetMode: descriptor.targetMode,
          segments: composition.tracks.map(track => ({
            id: track.id,
            targetIds: track.targetIds,
            timeDomainId: normalizeTimeDomainId(
              track.metadata?.timeDomainId
            ),
            evaluate: createAnimationEvaluator(track.program),
            timeDependent: track.program.timeDependent
          })),
          timeSource,
          initialTime
        });
      } else {
        this.runtime.start({
          id: composition.id,
          targetIds: composition.targetIds,
          targetMode: descriptor.targetMode,
          evaluate: createAnimationTrackEvaluator(composition),
          timeSource,
          initialTime
        });
      }
      this.currentComposition = composition;
      this.currentInstanceId = this.#runtimeCurrentInstanceId();
      return this.status();
    }

    const program = compileAnimationProgram(
      descriptor.operations,
      { id: descriptor.id }
    );
    this.runtime.start({
      id: program.id,
      targetIds: descriptor.targetIds,
      targetMode: descriptor.targetMode,
      evaluate: createAnimationEvaluator(program),
      timeSource,
      initialTime,
      timeDomainId: normalizeTimeDomainId(descriptor.timeDomainId),
      timeDependent: program.timeDependent
    });
    this.currentInstanceId = this.#runtimeCurrentInstanceId();
    this.currentProgram = program;
    this.currentPreset = descriptor.kind === "preset"
      ? deepFreeze(structuredClone(descriptor.preset))
      : null;
    return this.status();
  }

  #resolvedSelector(selector) {
    if (!this.#runtimeSupportsInstances()) return null;
    if (selector !== null && selector !== undefined) return selector;
    if (this.currentInstanceId) {
      return { instanceId: this.currentInstanceId };
    }
    return null;
  }

  #selectorInstanceIds(selector) {
    const status = this.runtime.status();
    if (!Array.isArray(status.instances)) {
      return status.state === "idle" ? [] : ["__legacy__"];
    }
    if (selector === "all" || selector?.all === true) {
      return status.instances.map(instance => instance.instanceId);
    }
    if (typeof selector === "string") return [selector];
    if (selector?.instanceId) return [String(selector.instanceId)];
    if (selector === null || selector === undefined) {
      return status.activeInstanceId ? [status.activeInstanceId] : [];
    }
    if (Array.isArray(selector?.targetIds)) {
      const targets = new Set(selector.targetIds.map(String));
      return status.instances
        .filter(instance => instance.objectIds.some(id => targets.has(id)))
        .map(instance => instance.instanceId);
    }
    return [];
  }

  #forgetStopped(instanceIds) {
    const stopped = new Set(instanceIds);
    if (this.sharedRuntimeInstanceId &&
        stopped.has(this.sharedRuntimeInstanceId)) {
      this.#clearSharedBinding();
    }
    if (this.currentInstanceId && stopped.has(this.currentInstanceId)) {
      this.#refreshCurrentSelection();
    }
  }

  #refreshCurrentSelection(runtimeStatus = this.runtime.status()) {
    this.currentInstanceId = Array.isArray(runtimeStatus.instances)
      ? runtimeStatus.activeInstanceId ?? null
      : runtimeStatus.state === "idle" ? null : "__legacy__";
    if (!this.currentInstanceId) this.#clearCurrent();
  }

  #runtimeSupportsInstances() {
    return Array.isArray(this.runtime.status().instances);
  }

  #runtimeCurrentInstanceId() {
    const status = this.runtime.status();
    return Array.isArray(status.instances)
      ? status.activeInstanceId ?? null
      : status.state === "idle" ? null : "__legacy__";
  }

  #hasInstance(instanceId) {
    return Boolean(this.#instance(instanceId));
  }

  #instance(instanceId) {
    if (!instanceId) return null;
    const status = this.runtime.status();
    if (!Array.isArray(status.instances)) {
      return instanceId === "__legacy__" && status.state !== "idle"
        ? Object.freeze({ instanceId, state: status.state })
        : null;
    }
    return status.instances.find(
      instance => instance.instanceId === instanceId
    ) ?? null;
  }

  #detachSharedSelection() {
    this.sharedSession = null;
    this.sharedPlaybackId = null;
    this.sharedRuntimeInstanceId = null;
  }

  #clearSharedBinding() {
    this.sharedSession = null;
    this.sharedPlaybackId = null;
    this.sharedRuntimeInstanceId = null;
  }

  #clearCurrent() {
    this.currentProgram = null;
    this.currentPreset = null;
    this.currentComposition = null;
  }
}

function selectedTargetIds(snapshot) {
  return normalizeTargetIds(
    snapshot?.members?.map(member => member.objectId) ?? []
  );
}

function normalizeTargetIds(values) {
  if (!Array.isArray(values)) {
    throw new TypeError("Alvos de animação devem formar uma lista.");
  }
  const ids = [...new Set(
    values.map(value => String(value ?? "").trim()).filter(Boolean)
  )];
  if (!ids.length) {
    throw new RangeError("Selecione ao menos um objeto para animar.");
  }
  return ids;
}

function resolvedTargetIds(values, selection) {
  return values === null || values === undefined
    ? selectedTargetIds(selection())
    : normalizeTargetIds(values);
}

function normalizeTargetMode(value = "selection") {
  const mode = String(value ?? "selection");
  if (!["selection", "objects"].includes(mode)) {
    throw new RangeError(`Modo de alvos de animação desconhecido: ${mode}.`);
  }
  return mode;
}

function normalizeTimeDomainId(value = "world") {
  const id = String(value ?? "world").trim();
  if (!id) throw new TypeError("Domínio temporal vazio.");
  return id;
}

function describePreset(preset) {
  return Object.freeze({
    version: preset.version,
    id: preset.id,
    title: preset.title,
    parameters: Object.freeze(structuredClone(preset.parameters))
  });
}

function validateDescriptor(value) {
  if (
    !value ||
    !["program", "preset", "composition"].includes(value.kind) ||
    !Array.isArray(value.targetIds) ||
    !value.targetIds.length
  ) {
    throw new TypeError("Descritor compartilhado de animação inválido.");
  }
  normalizeTargetMode(value.targetMode);
  if (value.kind !== "composition") {
    normalizeTimeDomainId(value.timeDomainId);
  }
}

function validateSharedSession(value) {
  if (
    !value ||
    !Number.isInteger(value.sequence) ||
    value.sequence < 0 ||
    !["idle", "playing", "paused"].includes(value.state)
  ) {
    throw new TypeError("Sessão compartilhada de animação inválida.");
  }
  if (value.state !== "idle") {
    if (!String(value.playbackId ?? "").trim()) {
      throw new TypeError("Sessão compartilhada sem playbackId.");
    }
    validateDescriptor(value.descriptor);
  }
}

function sharedSessionTime(session, nowMs) {
  const base = Math.max(0, Number(session.positionSeconds) || 0);
  if (session.state !== "playing") return base;
  const elapsed = Math.max(
    0,
    (Number(nowMs) - Number(session.changedAtMs)) / 1000
  );
  return base + (Number.isFinite(elapsed) ? elapsed : 0);
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}
