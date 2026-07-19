import { Region } from "../../core/src/Region.js";
import { Sandbox } from "../../core/src/Sandbox.js";
import { summarizeSamples } from "./BenchmarkStatistics.js";
import { createBenchmarkScene, createTransforms } from "./SceneFactory.js";

export class BenchmarkRunner {
  static apiVersion = "benchmark-runner-v1";

  constructor({ reducer, projectService }) {
    this.reducer = reducer;
    this.projectService = projectService;
    this.history = [];
  }

  runScene({ objectCount = 1000, samples = 5, transformCount = 100 } = {}) {
    const count = integer(objectCount, 1, 100000, "objectCount");
    const repetitions = integer(samples, 1, 50, "samples");
    const batchCount = Math.min(
      integer(transformCount, 1, 100000, "transformCount"),
      count
    );

    const metrics = {
      createSceneMs: [],
      constructSandboxMs: [],
      replaceStateMs: [],
      cloneStateMs: [],
      transformOneMs: [],
      transformBatchMs: [],
      undoMs: [],
      redoMs: [],
      stringifyMs: [],
      validateMs: []
    };

    let serialized = "";

    for (let sample = 0; sample < repetitions; sample += 1) {
      let state;
      metrics.createSceneMs.push(measure(() => {
        state = createBenchmarkScene(count, {
          prefix: `bench-${sample}-${Date.now()}`
        });
      }));

      let sandbox;
      metrics.constructSandboxMs.push(measure(() => {
        const region = new Region(
          {
            id: `benchmark-${sample}`,
            name: "Benchmark",
            type: "box-region"
          },
          { schemaVersion: 1, objects: [] }
        );
        sandbox = new Sandbox(region, this.reducer);
      }));

      metrics.replaceStateMs.push(measure(() => {
        sandbox.replaceState(state, { markClean: true });
      }));

      metrics.cloneStateMs.push(measure(() => {
        sandbox.getState();
      }));

      const one = createTransforms(sandbox.getState(), 1);
      metrics.transformOneMs.push(measure(() => {
        sandbox.dispatch({
          type: "selection.transform",
          source: "benchmark-one",
          transforms: one
        });
      }));

      metrics.undoMs.push(measure(() => sandbox.undo()));
      metrics.redoMs.push(measure(() => sandbox.redo()));

      sandbox.replaceState(state, { markClean: true });
      const batch = createTransforms(sandbox.getState(), batchCount);
      metrics.transformBatchMs.push(measure(() => {
        sandbox.dispatch({
          type: "selection.transform",
          source: "benchmark-batch",
          transforms: batch
        });
      }));

      const document = {
        format: "spatial-seed",
        schemaVersion: 1,
        metadata: {
          name: "Benchmark",
          createdAt: new Date().toISOString(),
          savedAt: new Date().toISOString()
        },
        region: {},
        scene: sandbox.getState(),
        editor: {},
        renderer: {}
      };

      metrics.stringifyMs.push(measure(() => {
        serialized = JSON.stringify(document);
      }));

      metrics.validateMs.push(measure(() => {
        this.projectService.validator.parse(serialized);
      }));
    }

    const result = {
      id: `scene-${count}-${Date.now()}`,
      type: "scene",
      timestamp: new Date().toISOString(),
      objectCount: count,
      transformCount: batchCount,
      samples: repetitions,
      serializedBytes: new Blob([serialized]).size,
      metrics: Object.fromEntries(
        Object.entries(metrics).map(([name, values]) => [
          name,
          summarizeSamples(values)
        ])
      )
    };

    this.#record(result);
    return result;
  }

  compare() {
    if (this.history.length < 2) {
      return {
        comparable: false,
        reason: "São necessários pelo menos dois benchmarks."
      };
    }

    const current = this.history.at(-1);
    const previous = [...this.history]
      .slice(0, -1)
      .reverse()
      .find(result =>
        result.type === current.type &&
        result.objectCount === current.objectCount &&
        result.transformCount === current.transformCount
      );

    if (!previous) {
      return {
        comparable: false,
        reason: "Não existe medição anterior com a mesma escala."
      };
    }

    const metrics = {};
    for (const [name, currentSummary] of Object.entries(current.metrics)) {
      const before = previous.metrics[name];
      if (!before || !Number.isFinite(before.median) ||
          !Number.isFinite(currentSummary.median)) continue;

      metrics[name] = {
        previousMedianMs: before.median,
        currentMedianMs: currentSummary.median,
        deltaMs: round(currentSummary.median - before.median),
        changePercent: before.median === 0
          ? null
          : round(((currentSummary.median - before.median) / before.median) * 100)
      };
    }

    return {
      comparable: true,
      previousId: previous.id,
      currentId: current.id,
      metrics
    };
  }

  list() {
    return structuredClone(this.history);
  }

  clear() {
    const removed = this.history.length;
    this.history.length = 0;
    return { cleared: true, removed };
  }

  help() {
    return {
      commands: [
        "benchmark scene [objetos] [amostras] [transformados]",
        "benchmark selection [objetos] [amostras]",
        "benchmark compare",
        "benchmark history",
        "benchmark clear"
      ],
      defaults: {
        objectCount: 1000,
        samples: 5,
        transformCount: 100
      },
      note: "Executado em Sandbox isolado; a cena ativa não é alterada."
    };
  }

  #record(result) {
    this.history.push(structuredClone(result));
    if (this.history.length > 20) {
      this.history.splice(0, this.history.length - 20);
    }
  }
}

function measure(callback) {
  const start = performance.now();
  callback();
  return performance.now() - start;
}

function integer(value, minimum, maximum, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < minimum || number > maximum) {
    throw new RangeError(
      `${label} deve ser inteiro entre ${minimum} e ${maximum}.`
    );
  }
  return number;
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}
