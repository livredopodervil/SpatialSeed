import {
  packStrokePoints,
  preprocessStrokePoints,
  unpackStrokePoints
} from "./StrokePreprocess.js?build=20260730-0040g";

export class StrokePreprocessPool {
  #workers = [];
  #queue = [];
  #tasks = new Map();
  #sequence = 0;
  #pumpScheduled = false;
  #disposed = false;
  #diagnostics = {
    submitted: 0,
    completed: 0,
    failed: 0,
    synchronous: 0,
    workers: 0,
    queued: 0,
    active: 0,
    lastMs: 0,
    maximumMs: 0
  };

  constructor({ size = defaultWorkerCount() } = {}) {
    const total = Math.max(0, Math.min(2, Number(size) || 0));
    if (typeof globalThis.Worker !== "function") return;
    for (let index = 0; index < total; index += 1) {
      try {
        const worker = new Worker(
          new URL(
            "./StrokePreprocessWorker.js?build=20260730-0040g",
            import.meta.url
          ),
          { type: "module", name: `spatialseed-stroke-${index + 1}` }
        );
        const slot = { worker, busy: false, taskId: null };
        worker.addEventListener("message", event =>
          this.#complete(slot, event.data)
        );
        worker.addEventListener("error", event =>
          this.#workerFailed(slot, event)
        );
        this.#workers.push(slot);
      } catch {
        break;
      }
    }
    this.#diagnostics.workers = this.#workers.length;
  }

  prepare({
    points,
    packedPoints = null,
    pointCount = null,
    settings = {},
    mode = "tube"
  } = {}) {
    if (this.#disposed) {
      return Promise.reject(new Error("Pool de traços já encerrado."));
    }
    this.#diagnostics.submitted += 1;
    if (!this.#workers.length) {
      const startedAt = performanceNow();
      try {
        const prepared = preprocessStrokePoints({ points, settings, mode });
        this.#diagnostics.completed += 1;
        this.#diagnostics.synchronous += 1;
        this.#recordTime(performanceNow() - startedAt);
        return Promise.resolve(prepared);
      } catch (error) {
        this.#diagnostics.failed += 1;
        return Promise.reject(error);
      }
    }
    const id = ++this.#sequence;
    const startedAt = performanceNow();
    return new Promise((resolve, reject) => {
      this.#tasks.set(id, {
        id,
        mode,
        settings: {
          simplify: Number(settings.simplify ?? 0),
          smoothIterations: Number(settings.smoothIterations ?? 0)
        },
        rawPoints: points,
        points: packedPoints instanceof Float32Array ? packedPoints : null,
        pointCount: Number.isInteger(Number(pointCount))
          ? Number(pointCount)
          : Array.isArray(points) ? points.length : null,
        startedAt,
        resolve,
        reject
      });
      this.#queue.push(id);
      this.#diagnostics.queued = this.#queue.length;
      this.#schedulePump();
    });
  }

  status() {
    return Object.freeze({ ...this.#diagnostics });
  }

  dispose() {
    if (this.#disposed) return false;
    this.#disposed = true;
    for (const slot of this.#workers) slot.worker.terminate();
    for (const task of this.#tasks.values()) {
      task.reject(new Error("Pool de traços encerrado."));
    }
    this.#workers = [];
    this.#queue = [];
    this.#tasks.clear();
    this.#diagnostics.queued = 0;
    this.#diagnostics.active = 0;
    return true;
  }

  #schedulePump() {
    if (this.#pumpScheduled || this.#disposed) return;
    this.#pumpScheduled = true;
    queueMicrotask(() => {
      this.#pumpScheduled = false;
      this.#pump();
    });
  }

  #pump() {
    for (const slot of this.#workers) {
      if (slot.busy || !this.#queue.length) continue;
      const id = this.#queue.shift();
      const task = this.#tasks.get(id);
      if (!task) continue;
      slot.busy = true;
      slot.taskId = id;
      this.#diagnostics.queued = this.#queue.length;
      this.#diagnostics.active += 1;
      task.points ??= packStrokePoints(task.rawPoints);
      task.pointCount ??= task.rawPoints?.length ?? task.points.length / 3;
      task.rawPoints = null;
      slot.worker.postMessage({
        id,
        mode: task.mode,
        settings: task.settings,
        points: task.points.buffer,
        pointCount: task.pointCount
      }, [task.points.buffer]);
    }
  }

  #complete(slot, response = {}) {
    const id = Number(response.id ?? slot.taskId);
    const task = this.#tasks.get(id);
    this.#releaseSlot(slot);
    if (!task) {
      this.#schedulePump();
      return;
    }
    this.#tasks.delete(id);
    if (response.ok) {
      this.#diagnostics.completed += 1;
      this.#recordTime(performanceNow() - task.startedAt);
      task.resolve(unpackStrokePoints(response.points, response.pointCount));
    } else {
      this.#diagnostics.failed += 1;
      task.reject(new Error(response.error ?? "Falha no worker de traço."));
    }
    this.#schedulePump();
  }

  #workerFailed(slot, event) {
    const task = this.#tasks.get(slot.taskId);
    if (task) {
      this.#tasks.delete(task.id);
      this.#diagnostics.failed += 1;
      task.reject(event?.error ?? new Error(event?.message ?? "Worker falhou."));
    }
    this.#releaseSlot(slot);
    this.#schedulePump();
  }

  #releaseSlot(slot) {
    if (slot.busy) {
      this.#diagnostics.active = Math.max(0, this.#diagnostics.active - 1);
    }
    slot.busy = false;
    slot.taskId = null;
  }

  #recordTime(elapsed) {
    this.#diagnostics.lastMs = elapsed;
    this.#diagnostics.maximumMs = Math.max(
      this.#diagnostics.maximumMs,
      elapsed
    );
  }
}

function defaultWorkerCount() {
  const hardware = Number(globalThis.navigator?.hardwareConcurrency ?? 2);
  return hardware >= 4 ? 2 : hardware >= 2 ? 1 : 0;
}

function performanceNow() {
  return globalThis.performance?.now?.() ?? Date.now();
}
