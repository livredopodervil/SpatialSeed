import {
  compileAnimationProgram,
  createAnimationEvaluator,
  describeAnimationProgram
} from "./AnimationProgram.js?build=20260720-0028d";
import {
  listAnimationPresets,
  resolveAnimationPreset
} from "./AnimationPresetCatalog.js?build=20260720-0028d";
import {
  compileAnimationTrackProgram,
  createAnimationTrackEvaluator,
  describeAnimationTrackProgram
} from "./AnimationTrackProgram.js?build=20260720-0028d";

export const ANIMATION_COMMAND_SERVICE_VERSION =
  "animation-command-service-v1";

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
  }

  start({
    id = "custom",
    operations,
    targetIds = null,
    targetMode = "selection"
  } = {}) {
    const program = compileAnimationProgram(operations, { id });
    const resolvedTargets = targetIds === null
      ? selectedTargetIds(this.selection())
      : normalizeTargetIds(targetIds);

    this.currentProgram = null;
    this.currentPreset = null;
    this.currentComposition = null;
    this.runtime.start({
      id: program.id,
      targetIds: resolvedTargets,
      targetMode,
      evaluate: createAnimationEvaluator(program)
    });
    this.currentProgram = program;
    return this.status();
  }

  preset(id, parameters = {}, {
    targetIds = null,
    targetMode = "selection"
  } = {}) {
    const preset = resolveAnimationPreset(id, parameters);
    const result = this.start({
      id: `preset.${preset.id}`,
      operations: preset.operations,
      targetIds,
      targetMode
    });
    this.currentPreset = preset;
    return Object.freeze({
      ...result,
      preset: describePreset(preset)
    });
  }

  compose({ id = "composition", tracks, targetMode = "objects" } = {}) {
    let fallbackTargets = null;
    const resolvedTracks = (tracks ?? []).map((track, index) => {
      const targetIds = track?.targetIds == null
        ? (fallbackTargets ??= selectedTargetIds(this.selection()))
        : normalizeTargetIds(track.targetIds);
      if (track?.presetId) {
        const preset = resolveAnimationPreset(
          track.presetId,
          track.parameters ?? {}
        );
        return {
          id: track.id ?? `track-${index + 1}`,
          targetIds,
          operations: preset.operations,
          metadata: { preset: describePreset(preset) }
        };
      }
      return {
        id: track?.id ?? `track-${index + 1}`,
        targetIds,
        operations: track?.operations,
        metadata: structuredClone(track?.metadata ?? {})
      };
    });
    const composition = compileAnimationTrackProgram(resolvedTracks, { id });

    this.currentProgram = null;
    this.currentPreset = null;
    this.currentComposition = null;
    this.runtime.start({
      id: composition.id,
      targetIds: composition.targetIds,
      targetMode,
      evaluate: createAnimationTrackEvaluator(composition)
    });
    this.currentComposition = composition;
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
    this.currentProgram = null;
    this.currentPreset = null;
    this.currentComposition = null;
    return this.status();
  }

  status() {
    const runtime = this.runtime.status();
    if (runtime.state === "idle") {
      this.currentProgram = null;
      this.currentPreset = null;
      this.currentComposition = null;
    }
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

function describePreset(preset) {
  return Object.freeze({
    version: preset.version,
    id: preset.id,
    title: preset.title,
    parameters: Object.freeze(structuredClone(preset.parameters))
  });
}
