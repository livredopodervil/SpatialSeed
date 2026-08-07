export const COMPLEXITY_COUNTERS_VERSION = "complexity-counters-v1";

export const COMPLEXITY_COUNTER_NAMES = Object.freeze([
  "definitionsVisited",
  "instancesVisited",
  "assemblyEdgesVisited",
  "overridesRead",
  "overridesWritten",
  "geometryBytesCloned",
  "fullSnapshotsCreated",
  "resolveCalls",
  "resolveCacheHits",
  "resolveCacheMisses",
  "pathSteps",
  "descendantsVisited",
  "transformRecomputes",
  "occurrenceBoundsRecomputes",
  "editTargetsVisited",
  "patchOperations",
  "previewOperations",
  "committedOperations",
  "renderNodesVisited",
  "renderNodesChanged",
  "shardsVisited",
  "shardsChanged",
  "renderBoundsRecomputes",
  "spatialIndexNodesVisited",
  "rayCandidates",
  "exactRaycasts",
  "trianglesTested",
  "subscribersConsidered",
  "subscribersNotified",
  "propertiesResolved",
  "globalSnapshotsRequested",
  "periodicEvaluations",
  "renderedFrames"
]);

export class ComplexityCounters {
  #values = new Map(COMPLEXITY_COUNTER_NAMES.map(name => [name, 0]));

  increment(name, amount = 1) {
    assertName(name);
    const delta = Number(amount);
    if (!Number.isFinite(delta) || delta < 0) throw new RangeError("Incremento deve ser finito e não negativo.");
    const next = this.value(name) + delta;
    this.#values.set(name, next);
    return next;
  }

  set(name, value) {
    assertName(name);
    const next = Number(value);
    if (!Number.isFinite(next) || next < 0) throw new RangeError("Contador deve ser finito e não negativo.");
    this.#values.set(name, next);
    return next;
  }

  value(name) {
    assertName(name);
    return this.#values.get(name) ?? 0;
  }

  snapshot() {
    return Object.freeze({
      version: COMPLEXITY_COUNTERS_VERSION,
      counters: Object.freeze(Object.fromEntries(COMPLEXITY_COUNTER_NAMES.map(name => [name, this.value(name)])))
    });
  }

  reset() {
    for (const name of COMPLEXITY_COUNTER_NAMES) this.#values.set(name, 0);
  }
}

function assertName(name) {
  if (!COMPLEXITY_COUNTER_NAMES.includes(name)) {
    throw new RangeError(`Contador de complexidade desconhecido: ${name}.`);
  }
}
