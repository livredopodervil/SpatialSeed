import {
  compileAnimationProgram,
  createAnimationEvaluator,
  describeAnimationProgram
} from "./AnimationProgram.js?build=20260806-0050b";
import {
  listAnimationPresets,
  resolveAnimationPreset
} from "./AnimationPresetCatalog.js?build=20260720-0028d";
import {
  compileAnimationTrackProgram,
  createAnimationTrackEvaluator,
  describeAnimationTrackProgram
} from "./AnimationTrackProgram.js?build=20260806-0050b";

export const ANIMATION_COMMAND_SERVICE_VERSION =
  "animation-command-service-v3-temporal";

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
    this.sharedSession = null;
    this.sharedNow = () => Date.now();
  }

  start({
    id = "custom",
    operations,
    targetIds = null,
    targetMode = "selection",
    timeDomainId = "world"
  } = {}) {
    this.sharedSession = null;
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
    this.sharedSession = null;
    return this.#applyDescriptor(this.prepareShared("preset", {
      id,
      parameters,
      targetIds,
      targetMode,
      timeDomainId
    }));
  }

  compose({ id = "composition", tracks, targetMode = "objects" } = {}) {
    this.sharedSession = null;
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
      if (this.runtime.status().state !== "idle") {
        this.runtime.stop(session.reason ?? "shared-stop");
      }
      this.sharedSession = null;
      this.#clearCurrent();
      return this.status();
    }

    const next = deepFreeze(structuredClone(session));
    const samePlayback =
      this.sharedSession?.playbackId === next.playbackId &&
      this.runtime.status().state !== "idle";
    this.sharedSession = next;
    const timeSource = () => sharedSessionTime(
      this.sharedSession,
      this.sharedNow()
    );
    const currentTime = timeSource();

    if (!samePlayback) {
      this.#applyDescriptor(next.descriptor, {
        initialTime: currentTime
      });
    } else {
      this.runtime.seek(currentTime);
    }

    const runtimeState = this.runtime.status().state;
    if (next.state === "paused" && runtimeState === "playing") {
      this.runtime.pause();
    } else if (next.state === "playing" && runtimeState === "paused") {
      this.runtime.play();
    }
    return this.status();
  }

  pause() {
    this.runtime.pause();
    return this.status();
  }

  resume() {
    this.runtime.play();
    return this.status();
  }

  stop() {
    this.runtime.stop("user");
    this.sharedSession = null;
    this.#clearCurrent();
    return this.status();
  }

  status() {
    const runtime = this.runtime.status();
    if (runtime.state === "idle") this.#clearCurrent();
    return Object.freeze({
      serviceVersion: ANIMATION_COMMAND_SERVICE_VERSION,
      ...runtime,
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
    this.currentProgram = program;
    this.currentPreset = descriptor.kind === "preset"
      ? deepFreeze(structuredClone(descriptor.preset))
      : null;
    return this.status();
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
