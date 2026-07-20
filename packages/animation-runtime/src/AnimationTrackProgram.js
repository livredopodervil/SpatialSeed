import {
  compileAnimationProgram,
  createAnimationEvaluator,
  describeAnimationProgram
} from "./AnimationProgram.js?build=20260720-0028d";

export const ANIMATION_TRACK_PROGRAM_VERSION = "animation-track-program-v1";

export function compileAnimationTrackProgram(tracks, {
  id = "composition"
} = {}) {
  if (!Array.isArray(tracks) || !tracks.length) {
    throw new TypeError("Composição exige ao menos uma faixa.");
  }
  const targetOwners = new Map();
  const compiled = tracks.map((track, index) => {
    const trackId = nonEmpty(track?.id ?? `track-${index + 1}`);
    const targetIds = uniqueIds(track?.targetIds);
    if (!targetIds.length) {
      throw new Error(`Faixa sem alvos: ${trackId}.`);
    }
    for (const targetId of targetIds) {
      if (targetOwners.has(targetId)) {
        throw new Error(
          `Alvo ${targetId} aparece em ${targetOwners.get(targetId)} e ${trackId}.`
        );
      }
      targetOwners.set(targetId, trackId);
    }
    return deepFreeze({
      id: trackId,
      targetIds,
      program: compileAnimationProgram(track.operations, {
        id: `${id}.${trackId}`
      }),
      metadata: structuredClone(track.metadata ?? {})
    });
  });
  return deepFreeze({
    version: ANIMATION_TRACK_PROGRAM_VERSION,
    id: nonEmpty(id),
    tracks: compiled,
    targetIds: uniqueIds(compiled.flatMap(track => track.targetIds))
  });
}

export function createAnimationTrackEvaluator(composition) {
  validateComposition(composition);
  const evaluators = new Map(composition.tracks.map(track => [
    track.id,
    createAnimationEvaluator(track.program)
  ]));

  return ({ t = 0, dt = 0, targets } = {}) => {
    const units = targets?.units;
    if (!Array.isArray(units) || !units.length) {
      throw new TypeError("Composição sem unidades de destino.");
    }
    const assigned = new Map(composition.tracks.map(track => [track.id, []]));

    for (const unit of units) {
      const matches = composition.tracks.filter(track =>
        track.targetIds.includes(unit.sourceId ?? unit.unitId) ||
        track.targetIds.includes(unit.unitId)
      );
      if (matches.length !== 1) {
        throw new Error(
          matches.length
            ? `Unidade ${unit.unitId} pertence a mais de uma faixa.`
            : `Unidade ${unit.unitId} não possui faixa.`
        );
      }
      assigned.get(matches[0].id).push(unit);
    }

    return Object.freeze(composition.tracks.flatMap(track => {
      const trackUnits = assigned.get(track.id);
      if (!trackUnits.length) {
        throw new Error(`Faixa ${track.id} não possui unidades renderizáveis.`);
      }
      return evaluators.get(track.id)({
        t,
        dt,
        targets: Object.freeze({ units: Object.freeze(trackUnits) })
      });
    }));
  };
}

export function describeAnimationTrackProgram(composition) {
  validateComposition(composition);
  return Object.freeze({
    version: composition.version,
    id: composition.id,
    targetCount: composition.targetIds.length,
    tracks: Object.freeze(composition.tracks.map(track => Object.freeze({
      id: track.id,
      targetIds: Object.freeze([...track.targetIds]),
      program: describeAnimationProgram(track.program),
      metadata: Object.freeze(structuredClone(track.metadata))
    })))
  });
}

function validateComposition(value) {
  if (value?.version !== ANIMATION_TRACK_PROGRAM_VERSION) {
    throw new TypeError("Composição de animação incompatível.");
  }
}

function uniqueIds(values = []) {
  if (!Array.isArray(values)) throw new TypeError("Alvos devem formar uma lista.");
  return Object.freeze([...new Set(values.map(nonEmpty))]);
}

function nonEmpty(value) {
  const text = String(value ?? "").trim();
  if (!text) throw new TypeError("Identificador vazio.");
  return text;
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}
