import {
  AnalyticTimeDomains,
  DependencyVersions,
  TemporalRuntime
} from "../packages/temporal-runtime/src/index.js?build=20260806-0050b";
import {
  AnimationCommandService,
  AnimationProcedureService,
  TemporalAnimationRuntime
} from "../packages/animation-runtime/src/index.js?build=20260806-0050b";
import {
  identityMatrix
} from "../packages/math-affine/src/index.js";

let now = 0;
const domains = new AnalyticTimeDomains({ nowSeconds: () => now });
const temporal = new TemporalRuntime({
  domains,
  dependencies: new DependencyVersions()
});
const applied = [];
const surface = {
  active: false,
  captureAnimationTargets(ids) {
    if (this.active) throw new Error("overlay already active");
    this.active = true;
    return Object.freeze({
      units: Object.freeze(ids.map(id => Object.freeze({
        unitId: id,
        sourceId: id,
        pivot: Object.freeze([0, 0, 0]),
        objects: Object.freeze([Object.freeze({
          objectId: id,
          baseMatrix: Object.freeze(identityMatrix())
        })])
      })))
    });
  },
  applyAnimationFrame(_targets, frame) {
    applied.push(structuredClone(frame));
    return Object.freeze({
      changed: true,
      matrixWrites: frame.length,
      colorWrites: 0,
      pivotWrites: 0
    });
  },
  restoreAnimationTargets() {
    this.active = false;
    return { restored: 1 };
  },
  getAnimationSurfaceDiagnostics() {
    return { frames: applied.length };
  }
};

const runtime = new TemporalAnimationRuntime({
  surface,
  temporalRuntime: temporal,
  timeDomains: domains,
  now: () => now * 1000
});
const service = new AnimationCommandService({
  runtime,
  selection: () => ({
    members: [{ objectId: "a" }]
  })
});

service.preset("spin", { axis: "z", speed: 90 });
assert(temporal.status().operationCount === 1, "preset must register one temporal operation");
now = 1;
let cycle = await temporal.evaluateParallel({ snapshot: {} });
let outcome = runtime.consumeTemporalEvents(cycle.events);
assert(outcome.handled === 1, "single-unit frame must be handled as a list");
assert(applied.length === 1 && applied[0].length === 1, "single unit frame must remain wrapped");
assert(service.status().state === "playing", "preset must remain playing");

service.pause();
assert(temporal.status().readiness.disabledCount === 1, "pause must disable temporal operation");
service.resume();
service.stop();
assert(temporal.status().operationCount === 0, "stop must unregister temporal operation");
assert(surface.active === false, "stop must restore animation surface");

// Two tracks use different parent domains and therefore distinct local times.
domains.create({ id: "slow", rate: 0.5, localTime: 0 });
service.compose({
  tracks: [
    {
      id: "world-track",
      targetIds: ["a"],
      operations: [{ type: "move", value: ["t", 0, 0] }],
      timeDomainId: "world"
    },
    {
      id: "slow-track",
      targetIds: ["b"],
      operations: [{ type: "move", value: ["t", 0, 0] }],
      timeDomainId: "slow"
    }
  ],
  targetMode: "objects"
});
now = 2;
cycle = await temporal.evaluateParallel({ snapshot: {} });
outcome = runtime.consumeTemporalEvents(cycle.events);
assert(outcome.handled === 2, "composition must emit one event per temporal track");
const latest = applied.at(-1);
const byId = new Map(latest.map(entry => [entry.unitId, entry]));
assert(close(byId.get("a").matrix[12], 1), "world track must advance by one second from start");
assert(close(byId.get("b").matrix[12], 0.5), "slow track must advance at half rate");
service.stop();

// A catalog procedure resolves once to an affine animation descriptor.
const procedureService = new AnimationProcedureService({
  catalog: {
    list: () => [{ name: "animation.test", sourceLength: 10 }],
    get: () => ({ name: "animation.test", source: "() => []" }),
    describeUi: () => ({ groups: [] }),
    invocationSource: () => "return [];"
  },
  programs: {
    async run() {
      return {
        commands: [],
        result: {
          value: [{ type: "move", value: ["t", 0, 0] }]
        }
      };
    }
  },
  selection: () => ({ members: [{ objectId: "a" }] })
});
const descriptor = await procedureService.resolve({
  name: "animation.test"
});
assert(descriptor.kind === "program", "procedure must resolve to program");
assert(descriptor.args.operations.length === 1, "procedure operations must be preserved");

console.log("Temporal animation bridge: 12/12 testes aprovados.");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function close(a, b, tolerance = 1e-9) {
  return Math.abs(Number(a) - Number(b)) <= tolerance;
}
