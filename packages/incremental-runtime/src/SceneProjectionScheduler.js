const MAX_INCREMENTAL_CHANGES = 4096;
const INPUT_DEFER_LIMIT_MS = 40;
const GESTURE_FULL_DEFER_LIMIT_MS = 160;

export class SceneProjectionScheduler {
  #applyIncremental;
  #applyFull;
  #interactionActive;
  #queue = [];
  #handle = null;
  #disposed = false;
  #diagnostics = {
    enqueued: 0,
    merged: 0,
    compactedChanges: 0,
    cancelledChanges: 0,
    fullReplacements: 0,
    appliedIncremental: 0,
    appliedFull: 0,
    deferredForInput: 0,
    deferredForGesture: 0,
    forcedAfterInput: 0,
    lastApplyMs: 0,
    maximumApplyMs: 0,
    maximumQueueDepth: 0,
    maximumQueueAgeMs: 0,
    changesApplied: 0
  };

  constructor({ applyIncremental, applyFull, interactionActive = () => false }) {
    if (typeof applyIncremental !== "function" || typeof applyFull !== "function") {
      throw new TypeError("SceneProjectionScheduler exige aplicadores.");
    }
    this.#applyIncremental = applyIncremental;
    this.#applyFull = applyFull;
    this.#interactionActive = interactionActive;
  }

  enqueue(state, classification) {
    if (this.#disposed) return false;
    const mode = classification?.mode === "incremental" ? "incremental" : "full";
    const changes = Array.isArray(classification?.changes)
      ? classification.changes
      : [];
    const enqueuedAt = nowMs();
    this.#diagnostics.enqueued += 1;

    if (mode === "full") {
      this.#queue = [{ mode, state, changes, enqueuedAt, deferredSince: null }];
      this.#diagnostics.fullReplacements += 1;
    } else {
      const tail = this.#queue.at(-1);
      if (tail?.mode === "incremental" &&
          tail.changes.length + changes.length <= MAX_INCREMENTAL_CHANGES) {
        const compacted = compactObjectChanges([...tail.changes, ...changes]);
        this.#diagnostics.compactedChanges += compacted.compacted;
        this.#diagnostics.cancelledChanges += compacted.cancelled;
        tail.state = state;
        tail.changes = compacted.changes;
        tail.enqueuedAt = Math.min(tail.enqueuedAt, enqueuedAt);
        this.#diagnostics.merged += 1;
        if (!tail.changes.length) this.#queue.pop();
      } else {
        const compacted = compactObjectChanges(changes);
        this.#diagnostics.compactedChanges += compacted.compacted;
        this.#diagnostics.cancelledChanges += compacted.cancelled;
        if (compacted.changes.length) {
          this.#queue.push({
            mode,
            state,
            changes: compacted.changes,
            enqueuedAt,
            deferredSince: null
          });
        }
      }
    }
    this.#diagnostics.maximumQueueDepth = Math.max(
      this.#diagnostics.maximumQueueDepth,
      this.#queue.length
    );
    this.#schedule();
    return true;
  }

  applyInitial(state) {
    if (this.#disposed) return false;
    const startedAt = nowMs();
    this.#applyFull(state);
    this.#recordApply(nowMs() - startedAt, "full", 0);
    return true;
  }

  status() {
    const oldest = this.#queue[0];
    return Object.freeze({
      ...this.#diagnostics,
      queued: this.#queue.length,
      scheduled: this.#handle !== null,
      oldestQueueAgeMs: oldest ? Math.max(0, nowMs() - oldest.enqueuedAt) : 0
    });
  }

  dispose() {
    this.#disposed = true;
    this.#cancel();
    this.#queue = [];
  }

  #schedule() {
    if (this.#disposed || this.#handle !== null || !this.#queue.length) return;
    const run = () => {
      this.#handle = null;
      const entry = this.#queue[0];
      if (!entry) return;
      const now = nowMs();
      const age = Math.max(0, now - entry.enqueuedAt);
      this.#diagnostics.maximumQueueAgeMs = Math.max(
        this.#diagnostics.maximumQueueAgeMs,
        age
      );
      const gestureActive = Boolean(this.#interactionActive());
      const pendingInput = inputPending();
      entry.deferredSince ??= pendingInput || gestureActive ? now : null;
      const deferredFor = entry.deferredSince === null
        ? 0
        : Math.max(0, now - entry.deferredSince);

      /* Alterações incrementais precisam progredir durante desenho contínuo.
         Só rebuilds completos aguardam brevemente o término do gesto. */
      if (entry.mode === "full" && gestureActive &&
          deferredFor < GESTURE_FULL_DEFER_LIMIT_MS) {
        this.#diagnostics.deferredForGesture += 1;
        this.#schedule();
        return;
      }
      if (pendingInput && deferredFor < INPUT_DEFER_LIMIT_MS) {
        this.#diagnostics.deferredForInput += 1;
        this.#schedule();
        return;
      }
      if (pendingInput) this.#diagnostics.forcedAfterInput += 1;

      this.#queue.shift();
      const startedAt = nowMs();
      if (entry.mode === "incremental") {
        this.#applyIncremental(entry.state, entry.changes);
      } else {
        this.#applyFull(entry.state);
      }
      this.#recordApply(
        nowMs() - startedAt,
        entry.mode,
        entry.changes.length
      );
      if (this.#queue.length) this.#schedule();
    };

    if (typeof globalThis.requestAnimationFrame === "function") {
      this.#handle = {
        kind: "frame",
        id: globalThis.requestAnimationFrame(run)
      };
    } else {
      this.#handle = {
        kind: "timeout",
        id: globalThis.setTimeout(run, 16)
      };
    }
  }

  #cancel() {
    if (!this.#handle) return;
    if (this.#handle.kind === "frame" &&
        typeof globalThis.cancelAnimationFrame === "function") {
      globalThis.cancelAnimationFrame(this.#handle.id);
    } else {
      globalThis.clearTimeout(this.#handle.id);
    }
    this.#handle = null;
  }

  #recordApply(elapsed, mode, changeCount) {
    this.#diagnostics.lastApplyMs = elapsed;
    this.#diagnostics.maximumApplyMs = Math.max(
      this.#diagnostics.maximumApplyMs,
      elapsed
    );
    this.#diagnostics.changesApplied += changeCount;
    if (mode === "incremental") this.#diagnostics.appliedIncremental += 1;
    else this.#diagnostics.appliedFull += 1;
  }
}

function compactObjectChanges(changes = []) {
  const order = [];
  const byId = new Map();
  let compacted = 0;
  let cancelled = 0;

  for (const raw of changes) {
    const id = String(raw?.objectId ?? "");
    if (!id) {
      order.push(Symbol("change"));
      byId.set(order.at(-1), raw);
      continue;
    }
    if (!byId.has(id)) order.push(id);
    const previous = byId.get(id);
    const next = mergeObjectChange(previous, raw);
    if (previous) compacted += 1;
    if (next === null) {
      byId.delete(id);
      const index = order.indexOf(id);
      if (index >= 0) order.splice(index, 1);
      cancelled += 2;
    } else {
      byId.set(id, next);
    }
  }

  return {
    changes: order.map(key => byId.get(key)).filter(Boolean),
    compacted,
    cancelled
  };
}

function mergeObjectChange(previous, next) {
  if (!previous) return next;
  const left = previous.type;
  const right = next.type;

  if (left === "object-created" && right === "object-deleted") {
    return null;
  }
  if (left === "object-created" &&
      ["object-updated", "object-transform"].includes(right)) {
    return Object.freeze({
      ...previous,
      object: next.object ?? previous.object
    });
  }
  if (["object-updated", "object-transform"].includes(left) &&
      ["object-updated", "object-transform"].includes(right)) {
    return Object.freeze({
      ...next,
      previousObject: previous.previousObject ?? previous.object ?? null
    });
  }
  if (["object-updated", "object-transform"].includes(left) &&
      right === "object-deleted") {
    return Object.freeze({
      ...next,
      previousObject: previous.previousObject ?? previous.object ?? next.previousObject
    });
  }
  if (left === "object-deleted" && right === "object-created") {
    return Object.freeze({
      type: "object-updated",
      objectId: next.objectId,
      object: next.object,
      previousObject: previous.previousObject ?? previous.object ?? null,
      source: next.source ?? previous.source
    });
  }
  return next;
}

function inputPending() {
  try {
    return Boolean(globalThis.navigator?.scheduling?.isInputPending?.({
      includeContinuous: true
    }));
  } catch {
    return false;
  }
}

function nowMs() {
  return globalThis.performance?.now?.() ?? Date.now();
}
