export const COMPLEXITY_BUDGET_VERSION = "complexity-budget-v1";

export const DEFAULT_COMPLEXITY_BUDGETS = Object.freeze({
  "scene.idle": Object.freeze({
    periodicEvaluations: 0,
    renderedFrames: 0,
    globalSnapshotsRequested: 0
  }),
  "occurrence.resolve": Object.freeze({
    instancesVisited: 1,
    fullSnapshotsCreated: 0,
    globalSnapshotsRequested: 0
  }),
  "selection.translate.single": Object.freeze({
    instancesVisited: 1,
    geometryBytesCloned: 0,
    renderNodesChanged: 1,
    shardsChanged: 1,
    fullSnapshotsCreated: 0,
    globalSnapshotsRequested: 0
  }),
  "instance.duplicate": Object.freeze({
    definitionsVisited: 0,
    assemblyEdgesVisited: 0,
    geometryBytesCloned: 0,
    fullSnapshotsCreated: 0
  }),
  "assembly.duplicate": Object.freeze({
    definitionsVisited: 0,
    assemblyEdgesVisited: 0,
    geometryBytesCloned: 0,
    fullSnapshotsCreated: 0
  })
});

export function evaluateComplexityBudget(operation, snapshot, budgets = DEFAULT_COMPLEXITY_BUDGETS) {
  const budget = budgets[operation];
  if (!budget) return Object.freeze({
    version: COMPLEXITY_BUDGET_VERSION,
    operation,
    known: false,
    ok: true,
    violations: Object.freeze([])
  });
  const counters = snapshot?.counters ?? snapshot ?? {};
  const violations = Object.entries(budget).flatMap(([name, maximum]) => {
    const actual = Number(counters[name] ?? 0);
    return actual <= maximum ? [] : [{ name, actual, maximum }];
  });
  return Object.freeze({
    version: COMPLEXITY_BUDGET_VERSION,
    operation,
    known: true,
    ok: violations.length === 0,
    violations: Object.freeze(violations.map(item => Object.freeze(item)))
  });
}
