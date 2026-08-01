import {
  DEFAULT_STROKE_CHUNK_POLICY,
  normalizeStrokeChunkPolicy
} from "./StrokeBundle.js?build=20260801-0045a1";

export const DEFAULT_STROKE_COMPACTION_POLICY = Object.freeze({
  enabled: true,
  schedule: "idle",
  idleBudgetMs: 2,
  idleDelayAfterInputMs: 300,
  compactAfterAppends: 32,
  fragmentationThreshold: 0.2,
  minimumSmallChunks: 4,
  maximumPendingJobs: 1,
  cancelOnInput: true,
  originRebasePolicy: "on-approve",
  ...DEFAULT_STROKE_CHUNK_POLICY
});

export function normalizeStrokeCompactionPolicy(value = {}) {
  const source = value && typeof value === "object" ? value : {};
  const chunk = normalizeStrokeChunkPolicy(source);
  const schedule = String(
    source.schedule ?? DEFAULT_STROKE_COMPACTION_POLICY.schedule
  ).toLowerCase();
  if (!["off", "manual", "idle", "on-save", "on-approve", "on-export"].includes(schedule)) {
    throw new RangeError(`Agendamento de compactação desconhecido: ${schedule}.`);
  }
  const originRebasePolicy = String(
    source.originRebasePolicy ??
      DEFAULT_STROKE_COMPACTION_POLICY.originRebasePolicy
  ).toLowerCase();
  if (!["never", "manual", "on-save", "on-approve", "on-export"].includes(
    originRebasePolicy
  )) {
    throw new RangeError(
      `Política de rebase de origem desconhecida: ${originRebasePolicy}.`
    );
  }
  return Object.freeze({
    enabled: source.enabled === undefined
      ? DEFAULT_STROKE_COMPACTION_POLICY.enabled
      : Boolean(source.enabled),
    schedule,
    idleBudgetMs: finiteBetween(
      source.idleBudgetMs ?? DEFAULT_STROKE_COMPACTION_POLICY.idleBudgetMs,
      0.25,
      16,
      "idleBudgetMs"
    ),
    idleDelayAfterInputMs: integerBetween(
      source.idleDelayAfterInputMs ??
        DEFAULT_STROKE_COMPACTION_POLICY.idleDelayAfterInputMs,
      0,
      60000,
      "idleDelayAfterInputMs"
    ),
    compactAfterAppends: integerBetween(
      source.compactAfterAppends ??
        DEFAULT_STROKE_COMPACTION_POLICY.compactAfterAppends,
      1,
      100000,
      "compactAfterAppends"
    ),
    fragmentationThreshold: finiteBetween(
      source.fragmentationThreshold ??
        DEFAULT_STROKE_COMPACTION_POLICY.fragmentationThreshold,
      0,
      1,
      "fragmentationThreshold"
    ),
    minimumSmallChunks: integerBetween(
      source.minimumSmallChunks ??
        DEFAULT_STROKE_COMPACTION_POLICY.minimumSmallChunks,
      1,
      10000,
      "minimumSmallChunks"
    ),
    maximumPendingJobs: integerBetween(
      source.maximumPendingJobs ??
        DEFAULT_STROKE_COMPACTION_POLICY.maximumPendingJobs,
      1,
      32,
      "maximumPendingJobs"
    ),
    cancelOnInput: source.cancelOnInput === undefined
      ? DEFAULT_STROKE_COMPACTION_POLICY.cancelOnInput
      : Boolean(source.cancelOnInput),
    originRebasePolicy,
    ...chunk
  });
}

function finiteBetween(value, minimum, maximum, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < minimum || number > maximum) {
    throw new RangeError(`${label} deve estar entre ${minimum} e ${maximum}.`);
  }
  return number;
}
function integerBetween(value, minimum, maximum, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < minimum || number > maximum) {
    throw new RangeError(`${label} deve ser inteiro entre ${minimum} e ${maximum}.`);
  }
  return number;
}
