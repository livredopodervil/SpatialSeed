import assert from "node:assert/strict";
import {
  AnimationRuntime,
  EvolutionResult
} from "../packages/animation-runtime/src/index.js";

class FakeClock {
  constructor() {
    this.stepSeconds = 1;
    this.tick = 0;
    this.time = 0;
  }
  reset() {
    this.tick = 0;
    this.time = 0;
  }
  advance(deltaSeconds, callback) {
    const delta = Number(deltaSeconds);
    if (!(delta > 0)) return { executed: 0, dropped: 0 };
    this.tick += 1;
    this.time += delta;
    callback({
      tick: this.tick,
      simulationTime: this.time,
      deltaSeconds: delta
    });
    return { executed: 1, dropped: 0 };
  }
}

function createSurface() {
  let frameListener = null;
  let nextToken = 1;
  const active = new Set();
  const state = {
    applyCalls: 0,
    restoreCalls: 0,
    invalidations: 0,
    acquired: 0,
    released: 0
  };
  return {
    state,
    emit(frame) { return frameListener?.(frame); },
    subscribeFrame(listener) {
      frameListener = listener;
      return () => { frameListener = null; };
    },
    acquireFrameDemand() {
      const token = `lease-${nextToken++}`;
      active.add(token);
      state.acquired += 1;
      return token;
    },
    releaseFrameDemand(token) {
      if (!active.delete(token)) return false;
      state.released += 1;
      return true;
    },
    invalidateRender() { state.invalidations += 1; },
    captureAnimationTargets(ids) {
      return Object.freeze({
        units: Object.freeze(ids.map(id => Object.freeze({
          unitId: id,
          objects: Object.freeze([Object.freeze({ objectId: id })])
        })))
      });
    },
    applyAnimationFrame(_targets, frame) {
      state.applyCalls += 1;
      return frame?.unchanged
        ? Object.freeze({ changed: false, matrixWrites: 0, colorWrites: 0 })
        : Object.freeze({ changed: true, matrixWrites: 1, colorWrites: 0 });
    },
    restoreAnimationTargets() {
      state.restoreCalls += 1;
      return Object.freeze({ restored: 1, matrixWrites: 1 });
    },
    getAnimationSurfaceDiagnostics() {
      return Object.freeze({ activeLeases: active.size });
    }
  };
}

{
  const surface = createSurface();
  const runtime = new AnimationRuntime({ surface, clock: new FakeClock() });
  runtime.start({
    targetIds: ["a"],
    evaluate: () => EvolutionResult.identity()
  });
  assert.equal(surface.state.acquired, 1);
  const result = surface.emit({ deltaSeconds: 1 });
  assert.equal(result.changed, false);
  assert.equal(surface.state.applyCalls, 0);
  assert.equal(runtime.status().time.simulationTime, 1);
  runtime.pause();
  assert.equal(surface.state.released, 1);
  runtime.play();
  assert.equal(surface.state.acquired, 2);
  runtime.stop();
  assert.equal(surface.state.released, 2);
  assert.equal(surface.state.restoreCalls, 1);
}

{
  const surface = createSurface();
  const runtime = new AnimationRuntime({ surface, clock: new FakeClock() });
  runtime.start({
    targetIds: ["a"],
    evaluate: () => EvolutionResult.fixedPoint()
  });
  const result = surface.emit({ deltaSeconds: 1 });
  assert.equal(result.evolutionKind, "fixed-point");
  assert.equal(runtime.status().waiting.kind, "fixed-point");
  assert.equal(surface.state.released, 1);
  assert.equal(surface.state.applyCalls, 0);
  assert.equal(runtime.wake("dependency"), true);
  assert.equal(surface.state.acquired, 2);
  runtime.stop();
}

{
  const surface = createSurface();
  const runtime = new AnimationRuntime({ surface, clock: new FakeClock() });
  runtime.start({
    targetIds: ["a"],
    evaluate: () => EvolutionResult.changed([{ matrix: true }], {
      value: Object.freeze({ matrix: true })
    })
  });
  const result = surface.emit({ deltaSeconds: 1 });
  assert.equal(result.changed, true);
  assert.equal(surface.state.applyCalls, 1);
  runtime.stop();
}

{
  const surface = createSurface();
  const runtime = new AnimationRuntime({ surface, clock: new FakeClock() });
  runtime.start({
    targetIds: ["a"],
    evaluate: () => Object.freeze({ unchanged: true })
  });
  const result = surface.emit({ deltaSeconds: 1 });
  assert.equal(result.changed, false);
  assert.equal(surface.state.applyCalls, 1);
  assert.equal(runtime.status().statistics.identitySurfaceFrames, 1);
  runtime.stop();
}

console.log("4/4 animation runtime event-driven tests passed");
