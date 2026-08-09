import assert from "node:assert/strict";
import {
  AnalyticTimeDomains,
  DependencyVersions,
  EvolutionKind,
  EvolutionResult,
  IncrementalPropertyGraph,
  TemporalExecutionController,
  TemporalRuntime,
  createTemporalTransformGroupOperation,
  arrayShallowEqual
} from "../packages/temporal-runtime/src/index.js";
import {
  RenderDemandScheduler
} from "../packages/renderer-three/src/RenderDemandScheduler.js";

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }


function fakeTemporalSurface() {
  const listeners = new Set();
  const leases = new Map();
  let next = 1;
  let invalidations = 0;
  return {
    subscribeFrame(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    acquireFrameDemand(owner) {
      const token = `lease:${next++}`;
      leases.set(token, owner);
      return token;
    },
    releaseFrameDemand(token) { return leases.delete(token); },
    invalidateRender() { invalidations += 1; return true; },
    fire(frame = Object.freeze({ timestampMs: 0, deltaSeconds: 0 })) {
      for (const listener of [...listeners]) listener(frame);
    },
    leaseCount() { return leases.size; },
    invalidations() { return invalidations; },
    listenerCount() { return listeners.size; }
  };
}

async function settleAsync() {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise(resolve => setTimeout(resolve, 0));
}

function fakeFrames() {
  let next = 1;
  const callbacks = new Map();
  return {
    request(callback) {
      const id = next++;
      callbacks.set(id, callback);
      return id;
    },
    cancel(id) { callbacks.delete(id); },
    pending() { return callbacks.size; },
    run(timestamp = 0) {
      const entries = [...callbacks.entries()];
      callbacks.clear();
      for (const [, callback] of entries) callback(timestamp);
    }
  };
}

test("renderiza uma vez e entra em repouso", () => {
  const frames = fakeFrames();
  let renders = 0;
  const scheduler = new RenderDemandScheduler({
    render: () => { renders += 1; },
    requestFrame: callback => frames.request(callback),
    cancelFrame: id => frames.cancel(id),
    now: () => 0
  });
  assert.equal(frames.pending(), 0);
  scheduler.invalidate("initial");
  assert.equal(frames.pending(), 1);
  frames.run(16);
  assert.equal(renders, 1);
  assert.equal(frames.pending(), 0);
  frames.run(32);
  assert.equal(renders, 1);
});

test("lease contínuo processa frames sem renderizar quando nada muda", () => {
  const frames = fakeFrames();
  let renders = 0;
  let callbacks = 0;
  const scheduler = new RenderDemandScheduler({
    render: () => { renders += 1; },
    requestFrame: callback => frames.request(callback),
    cancelFrame: id => frames.cancel(id),
    now: () => 0
  });
  scheduler.subscribeFrame(() => { callbacks += 1; return EvolutionResult.identity(); });
  const lease = scheduler.acquireContinuous("test");
  frames.run(16);
  assert.equal(callbacks, 1);
  assert.equal(renders, 0);
  assert.equal(frames.pending(), 1);
  scheduler.releaseContinuous(lease);
  assert.equal(frames.pending(), 0);
  frames.run(32);
  assert.equal(callbacks, 1);
  assert.equal(renders, 0);
});

test("damping agenda somente enquanto a câmera muda", () => {
  const frames = fakeFrames();
  let prepares = 0;
  let renders = 0;
  const scheduler = new RenderDemandScheduler({
    prepareFrame: () => {
      prepares += 1;
      return { changed: prepares <= 2, continue: prepares <= 2 };
    },
    render: () => { renders += 1; },
    requestFrame: callback => frames.request(callback),
    cancelFrame: id => frames.cancel(id),
    now: () => 0
  });
  scheduler.invalidate("camera");
  frames.run(16);
  frames.run(32);
  frames.run(48);
  assert.equal(prepares, 3);
  assert.equal(renders, 2);
  assert.equal(frames.pending(), 0);
});

test("tempo local é analítico e domínios aninhados compõem taxas", () => {
  let now = 10;
  const domains = new AnalyticTimeDomains({ nowSeconds: () => now });
  domains.create({ id: "slow", rate: 0.5 });
  domains.create({ id: "very-slow", parentId: "slow", rate: 0.25 });
  const revision = domains.snapshot("very-slow").revision;
  now = 18;
  assert.equal(domains.time("slow"), 14);
  assert.equal(domains.time("very-slow"), 11);
  assert.equal(domains.effectiveRate("very-slow"), 0.125);
  assert.equal(domains.snapshot("very-slow").revision, revision);
  domains.setRate("slow", 0.5);
  assert.equal(domains.snapshot("slow").revision, 0);
});

test("pausa e mudança de taxa preservam continuidade", () => {
  let now = 0;
  const domains = new AnalyticTimeDomains({ nowSeconds: () => now });
  domains.create({ id: "group", rate: 2, localTime: 5 });
  now = 3;
  assert.equal(domains.time("group"), 11);
  domains.pause("group");
  now = 30;
  assert.equal(domains.time("group"), 11);
  domains.resume("group");
  now = 31;
  assert.equal(domains.time("group"), 13);
  domains.setRate("group", 0.5);
  now = 35;
  assert.equal(domains.time("group"), 15);
});

test("grafo incremental não recalcula propriedades inalteradas", () => {
  const graph = new IncrementalPropertyGraph();
  let boundsComputes = 0;
  let worldBoundsComputes = 0;
  graph.defineSource("geometry.positions", [0, 0, 0], { equals: arrayShallowEqual });
  graph.defineSource("transform.position", [0, 0, 0], { equals: arrayShallowEqual });
  graph.defineDerived("geometry.bounds", ["geometry.positions"], values => {
    boundsComputes += 1;
    return [values["geometry.positions"][0], 1];
  }, { equals: arrayShallowEqual });
  graph.defineDerived("world.bounds", ["geometry.bounds", "transform.position"], values => {
    worldBoundsComputes += 1;
    return [values["geometry.bounds"][0] + values["transform.position"][0], 1];
  }, { equals: arrayShallowEqual });

  assert.deepEqual(graph.get("world.bounds"), [0, 1]);
  assert.deepEqual(graph.get("world.bounds"), [0, 1]);
  assert.equal(boundsComputes, 1);
  assert.equal(worldBoundsComputes, 1);

  assert.equal(graph.set("transform.position", [0, 0, 0]).changed, false);
  assert.deepEqual(graph.get("world.bounds"), [0, 1]);
  assert.equal(boundsComputes, 1);
  assert.equal(worldBoundsComputes, 1);

  assert.equal(graph.set("transform.position", [2, 0, 0]).changed, true);
  assert.deepEqual(graph.get("world.bounds"), [2, 1]);
  assert.equal(boundsComputes, 1);
  assert.equal(worldBoundsComputes, 2);
});

test("runtime não percorre objetos estáticos e respeita identidade", () => {
  let now = 0;
  const domains = new AnalyticTimeDomains({ nowSeconds: () => now });
  const runtime = new TemporalRuntime({ domains });
  const empty = runtime.evaluate({ snapshot: Object.freeze({ objects: new Array(10000) }) });
  assert.equal(empty.evaluated, 0);
  assert.equal(empty.changed, false);

  let evaluations = 0;
  runtime.register({
    id: "identity",
    evaluate: () => { evaluations += 1; return EvolutionResult.identity(); }
  });
  const result = runtime.evaluate({ snapshot: Object.freeze({}) });
  assert.equal(result.evaluated, 1);
  assert.equal(result.changed, false);
  assert.equal(evaluations, 1);
});

test("operação idempotente converte identidade em ponto fixo", () => {
  const runtime = new TemporalRuntime();
  let evaluations = 0;
  runtime.register({
    id: "normalize-once",
    idempotent: true,
    dependencyIds: ["object:a:geometry"],
    evaluate: ({ result }) => {
      evaluations += 1;
      return result.identity();
    }
  });
  assert.equal(runtime.evaluate({ snapshot: Object.freeze({}) }).evaluated, 1);
  assert.equal(runtime.describe("normalize-once").state, "fixed-point");
  assert.equal(runtime.evaluate({ snapshot: Object.freeze({}) }).evaluated, 0);
  assert.equal(evaluations, 1);
  runtime.bumpDependency("object:a:geometry");
  assert.equal(runtime.evaluate({ snapshot: Object.freeze({}) }).evaluated, 1);
  assert.equal(evaluations, 2);
});

test("ponto fixo dorme até uma dependência mudar", () => {
  const dependencies = new DependencyVersions();
  const runtime = new TemporalRuntime({ dependencies });
  let evaluations = 0;
  runtime.register({
    id: "projection",
    dependencyIds: ["object:a:position"],
    evaluate: ({ result }) => {
      evaluations += 1;
      return result.fixedPoint();
    }
  });
  const first = runtime.evaluate({ snapshot: Object.freeze({}) });
  assert.equal(first.evaluated, 1);
  const second = runtime.evaluate({ snapshot: Object.freeze({}) });
  assert.equal(second.evaluated, 0);
  assert.equal(evaluations, 1);
  runtime.bumpDependency("object:a:position");
  const third = runtime.evaluate({ snapshot: Object.freeze({}) });
  assert.equal(third.evaluated, 1);
  assert.equal(evaluations, 2);
});

test("lote de dependências desperta somente operações afetadas", () => {
  const runtime = new TemporalRuntime();
  let a = 0;
  let b = 0;
  let unrelated = 0;
  runtime.register({
    id: "a",
    dependencyIds: ["object:a:position"],
    evaluate: ({ result }) => { a += 1; return result.fixedPoint(); }
  });
  runtime.register({
    id: "b",
    dependencyIds: ["object:b", "world"],
    evaluate: ({ result }) => { b += 1; return result.fixedPoint(); }
  });
  runtime.register({
    id: "unrelated",
    dependencyIds: ["object:c:material"],
    evaluate: ({ result }) => {
      unrelated += 1;
      return result.fixedPoint();
    }
  });
  runtime.evaluate({ snapshot: Object.freeze({}) });
  assert.deepEqual([a, b, unrelated], [1, 1, 1]);

  const bumped = runtime.bumpDependencies([
    "object:a:position",
    "world",
    "object:a:position"
  ]);
  assert.equal(bumped.changed, true);
  assert.deepEqual(bumped.dependencyIds, ["object:a:position", "world"]);
  assert.equal(bumped.wakeCount, 2);

  const cycle = runtime.evaluate({ snapshot: Object.freeze({}) });
  assert.equal(cycle.evaluated, 2);
  assert.deepEqual([a, b, unrelated], [2, 2, 1]);
});

test("lote vazio de dependências é identidade", () => {
  const runtime = new TemporalRuntime();
  const result = runtime.bumpDependencies([]);
  assert.equal(result.changed, false);
  assert.deepEqual(result.versions, {});
});

test("sleep-until não é consultado antes do instante relevante", () => {
  let now = 0;
  const domains = new AnalyticTimeDomains({ nowSeconds: () => now });
  const runtime = new TemporalRuntime({ domains });
  let evaluations = 0;
  runtime.register({
    id: "event",
    evaluate: ({ t, result }) => {
      evaluations += 1;
      return t < 5 ? result.sleepUntil(5) : result.changed([{ type: "fire" }]);
    }
  });
  const first = runtime.evaluate({ snapshot: Object.freeze({}) });
  assert.equal(first.evaluated, 1);
  assert.equal(first.nextWakeGlobalTime, 5);
  now = 4;
  assert.equal(runtime.evaluate({ snapshot: Object.freeze({}) }).evaluated, 0);
  now = 5;
  const fired = runtime.evaluate({ snapshot: Object.freeze({}) });
  assert.equal(fired.changed, true);
  assert.equal(evaluations, 2);
});

test("operações de uma fase leem o mesmo snapshot e têm merge determinístico", async () => {
  const runtime = new TemporalRuntime();
  const snapshot = Object.freeze({ value: 7 });
  runtime.register({
    id: "b",
    phase: "behavior",
    order: 2,
    evaluate: async ({ snapshot: state, result }) => {
      await Promise.resolve();
      return result.changed([{ id: "b", read: state.value }]);
    }
  });
  runtime.register({
    id: "a",
    phase: "behavior",
    order: 1,
    evaluate: async ({ snapshot: state, result }) =>
      result.changed([{ id: "a", read: state.value }])
  });
  const output = await runtime.evaluateParallel({ snapshot });
  assert.deepEqual(output.changes, [
    { id: "a", read: 7 },
    { id: "b", read: 7 }
  ]);
});


test("grupos de transformação usam tempos locais diferentes e filtram saída igual", async () => {
  let now = 0;
  const domains = new AnalyticTimeDomains({ nowSeconds: () => now });
  domains.create({ id: "slow", rate: 0.5 });
  const runtime = new TemporalRuntime({ domains });
  runtime.register(createTemporalTransformGroupOperation({
    id: "normal-group",
    timeDomainId: "world",
    evaluate: ({ t }) => [{ id: "a", position: [t, 0, 0] }]
  }));
  runtime.register(createTemporalTransformGroupOperation({
    id: "slow-group",
    timeDomainId: "slow",
    evaluate: ({ t }) => [{ id: "b", position: [t, 0, 0] }]
  }));

  now = 4;
  const first = await runtime.evaluateParallel({ snapshot: Object.freeze({}) });
  assert.deepEqual(first.changes, [
    {
      type: "selection.transform",
      transforms: [{ id: "a", position: [4, 0, 0] }]
    },
    {
      type: "selection.transform",
      transforms: [{ id: "b", position: [2, 0, 0] }]
    }
  ]);

  runtime.wakeAll();
  const same = await runtime.evaluateParallel({ snapshot: Object.freeze({}) });
  assert.equal(same.changed, false);
  assert.equal(same.changes.length, 0);
});

test("controlador temporal fica totalmente inativo sem operações", () => {
  const runtime = new TemporalRuntime();
  const surface = fakeTemporalSurface();
  const controller = new TemporalExecutionController({ runtime, surface });
  assert.equal(surface.leaseCount(), 0);
  assert.equal(surface.invalidations(), 0);
  assert.equal(controller.status().readiness.readyCount, 0);
  controller.dispose();
  assert.equal(surface.listenerCount(), 0);
});

test("ponto fixo executa uma vez e dependência o desperta", async () => {
  let now = 0;
  const domains = new AnalyticTimeDomains({ nowSeconds: () => now });
  const runtime = new TemporalRuntime({ domains });
  const surface = fakeTemporalSurface();
  let evaluations = 0;
  const controller = new TemporalExecutionController({ runtime, surface });

  runtime.register({
    id: "fixed",
    dependencyIds: ["object:a"],
    evaluate: ({ result }) => {
      evaluations += 1;
      return result.fixedPoint();
    }
  });
  assert.equal(surface.leaseCount(), 1);
  surface.fire();
  await settleAsync();
  assert.equal(evaluations, 1);
  assert.equal(surface.leaseCount(), 0);
  assert.equal(surface.invalidations(), 0);

  runtime.bumpDependency("object:a");
  assert.equal(surface.leaseCount(), 1);
  surface.fire();
  await settleAsync();
  assert.equal(evaluations, 2);
  assert.equal(surface.leaseCount(), 0);
  controller.dispose();
});

test("domínio pausado não reavalia identidade no mesmo tempo", async () => {
  let now = 0;
  const domains = new AnalyticTimeDomains({ nowSeconds: () => now });
  domains.create({ id: "paused", paused: true, localTime: 4 });
  const runtime = new TemporalRuntime({ domains });
  const surface = fakeTemporalSurface();
  let evaluations = 0;
  const controller = new TemporalExecutionController({ runtime, surface });
  runtime.register({
    id: "paused-identity",
    timeDomainId: "paused",
    evaluate: ({ result }) => {
      evaluations += 1;
      return result.identity();
    }
  });
  surface.fire();
  await settleAsync();
  assert.equal(evaluations, 1);
  assert.equal(surface.leaseCount(), 0);
  now = 100;
  controller.reconcile();
  assert.equal(surface.leaseCount(), 0);
  assert.equal(evaluations, 1);
  controller.dispose();
});

test("sleep-until usa timer e não faz polling por frame", async () => {
  let now = 0;
  const domains = new AnalyticTimeDomains({ nowSeconds: () => now });
  const runtime = new TemporalRuntime({ domains });
  const surface = fakeTemporalSurface();
  const timers = new Map();
  let nextTimer = 1;
  let evaluations = 0;
  const controller = new TemporalExecutionController({
    runtime,
    surface,
    setTimer(callback, delay) {
      const id = nextTimer++;
      timers.set(id, { callback, delay });
      return id;
    },
    clearTimer(id) { timers.delete(id); }
  });
  runtime.register({
    id: "alarm",
    evaluate: ({ t, result }) => {
      evaluations += 1;
      return t < 5
        ? result.sleepUntil(5)
        : result.fixedPoint();
    }
  });
  surface.fire();
  await settleAsync();
  assert.equal(evaluations, 1);
  assert.equal(surface.leaseCount(), 0);
  assert.equal(timers.size, 1);
  const [{ callback, delay }] = timers.values();
  assert.equal(delay, 5000);
  timers.clear();
  now = 5;
  callback();
  assert.equal(surface.leaseCount(), 1);
  surface.fire();
  await settleAsync();
  assert.equal(evaluations, 2);
  assert.equal(surface.leaseCount(), 0);
  controller.dispose();
});

test("mudança temporal confirmada invalida um quadro visual", async () => {
  let now = 0;
  const domains = new AnalyticTimeDomains({ nowSeconds: () => now });
  const runtime = new TemporalRuntime({ domains });
  const surface = fakeTemporalSurface();
  const applied = [];
  const controller = new TemporalExecutionController({
    runtime,
    surface,
    apply(cycle) {
      applied.push(...cycle.changes);
      return { changed: cycle.changes.length > 0, applied: cycle.changes.length };
    }
  });
  runtime.register({
    id: "move-once",
    evaluate: ({ result }) => result.changed([{
      type: "selection.transform",
      transforms: []
    }])
  });
  surface.fire();
  await settleAsync();
  assert.equal(applied.length, 1);
  assert.equal(surface.invalidations(), 1);
  controller.dispose();
});

let failed = 0;
for (const { name, fn } of tests) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`not ok - ${name}`);
    console.error(error);
  }
}
console.log(`\n${tests.length - failed}/${tests.length} tests passed`);
if (failed) process.exit(1);
