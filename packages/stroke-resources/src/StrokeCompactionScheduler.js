import {
  createStrokeCompactionJob,
  normalizeStrokeBundleDescriptor,
  strokeBundleCompactionStatus
} from "./StrokeBundle.js?build=20260801-0045a";
import {
  DEFAULT_STROKE_COMPACTION_POLICY,
  normalizeStrokeCompactionPolicy
} from "./StrokeCompactionPolicy.js?build=20260801-0045a";

export class StrokeCompactionScheduler {
  static apiVersion = "stroke-compaction-scheduler-v1";

  constructor({
    sandbox,
    policy = DEFAULT_STROKE_COMPACTION_POLICY,
    now = () => globalThis.performance?.now?.() ?? Date.now()
  } = {}) {
    if (!sandbox?.getObject || !sandbox?.dispatchMaintenance) {
      throw new TypeError(
        "StrokeCompactionScheduler exige sandbox com dispatchMaintenance."
      );
    }
    this.sandbox = sandbox;
    this.policy = normalizeStrokeCompactionPolicy(policy);
    this.now = now;
    this.pending = new Map();
    this.appendCounts = new Map();
    this.handle = null;
    this.lastInputAt = -Infinity;
    this.inputTarget = null;
    this.inputListener = () => this.notifyInput();
    this.diagnostics = {
      scheduled: 0,
      completed: 0,
      skipped: 0,
      cancelledForInput: 0,
      cancelledForRevision: 0,
      slices: 0,
      maximumSliceMs: 0,
      maintenanceDispatches: 0
    };
  }

  configure(patch = {}) {
    this.policy = normalizeStrokeCompactionPolicy({
      ...this.policy,
      ...patch
    });
    if (!this.policy.enabled || this.policy.schedule === "off") this.cancelAll();
    return this.status();
  }

  attachInputSource(target = globalThis) {
    this.detachInputSource();
    if (!target?.addEventListener) return false;
    this.inputTarget = target;
    for (const type of ["pointerdown", "pointermove", "wheel", "touchstart"]) {
      target.addEventListener(type, this.inputListener, {
        passive: true,
        capture: true
      });
    }
    return true;
  }

  detachInputSource() {
    if (!this.inputTarget?.removeEventListener) return false;
    for (const type of ["pointerdown", "pointermove", "wheel", "touchstart"]) {
      this.inputTarget.removeEventListener(type, this.inputListener, true);
    }
    this.inputTarget = null;
    return true;
  }

  notifyInput() {
    this.lastInputAt = this.now();
    if (this.policy.cancelOnInput && this.handle !== null) {
      this.#cancelHandle();
      this.diagnostics.cancelledForInput += 1;
      this.#scheduleHandle();
    }
  }

  noteAppend(objectId) {
    const id = String(objectId);
    const count = (this.appendCounts.get(id) ?? 0) + 1;
    this.appendCounts.set(id, count);
    if (count < this.policy.compactAfterAppends) return false;
    this.appendCounts.set(id, 0);
    return this.schedule(id, { reason: "append-threshold" });
  }

  schedule(objectId, { force = false, reason = "manual" } = {}) {
    const id = String(objectId ?? "").trim();
    if (!id) throw new TypeError("Compactação exige objectId.");
    if (!force && (!this.policy.enabled ||
        !["idle", "manual"].includes(this.policy.schedule))) {
      this.diagnostics.skipped += 1;
      return false;
    }
    if (!this.pending.has(id) &&
        this.pending.size >= this.policy.maximumPendingJobs) {
      this.diagnostics.skipped += 1;
      return false;
    }
    const object = this.sandbox.getObject(id);
    if (!isStrokeBundleObject(object)) {
      this.diagnostics.skipped += 1;
      return false;
    }
    const geometry = normalizeStrokeBundleDescriptor(object.geometry);
    const compaction = strokeBundleCompactionStatus(geometry, this.policy);
    if (!force && !compaction.needed) {
      this.diagnostics.skipped += 1;
      return false;
    }
    this.pending.set(id, {
      objectId: id,
      sourceGeometry: object.geometry,
      sourceRevision: Number(this.sandbox.revision),
      reason,
      job: createStrokeCompactionJob(geometry, this.policy)
    });
    this.diagnostics.scheduled += 1;
    this.#scheduleHandle();
    return true;
  }

  runNow(objectId = null) {
    if (objectId !== null && objectId !== undefined) {
      this.schedule(objectId, { force: true, reason: "manual" });
    }
    let guard = 0;
    while (this.pending.size && guard++ < 1000000) {
      this.#runSlice({ force: true });
    }
    return this.status();
  }

  checkpoint(kind = "approve") {
    const normalized = String(kind).trim().toLowerCase();
    const expected = normalized === "approve"
      ? "on-approve"
      : normalized === "save"
        ? "on-save"
        : normalized === "export"
          ? "on-export"
          : normalized;
    const result = { compacted: 0, rebased: 0, visited: 0 };
    const objectIds = (this.sandbox.getSnapshot()?.objects ?? [])
      .filter(isStrokeBundleObject)
      .map(object => String(object.id));
    for (const objectId of objectIds) {
      let object = this.sandbox.getObject(objectId);
      if (!isStrokeBundleObject(object)) continue;
      result.visited += 1;
      if (this.policy.schedule === expected) {
        const beforeGeometry = object.geometry;
        this.runNow(objectId);
        object = this.sandbox.getObject(objectId);
        if (object?.geometry !== beforeGeometry) result.compacted += 1;
      }
      if (this.policy.originRebasePolicy !== expected ||
          !isStrokeBundleObject(object)) continue;
      const geometry = normalizeStrokeBundleDescriptor(object.geometry);
      const nextOrigin = geometry.bounds.min.map((value, axis) =>
        value + (geometry.bounds.max[axis] - value) * 0.5
      );
      const changed = this.sandbox.dispatchMaintenance({
        type: "stroke-bundle.rebase-origin",
        objectId,
        expectedGeometry: object.geometry,
        nextOrigin,
        source: `stroke-checkpoint-${normalized}`
      });
      if (changed) result.rebased += 1;
    }
    return Object.freeze(result);
  }

  cancelAll() {
    this.#cancelHandle();
    this.pending.clear();
    return true;
  }

  status() {
    return Object.freeze({
      policy: this.policy,
      pendingJobs: this.pending.size,
      lastInputAt: this.lastInputAt,
      diagnostics: Object.freeze({ ...this.diagnostics })
    });
  }

  #scheduleHandle() {
    if (this.handle !== null || !this.pending.size) return;
    const delay = Math.max(
      0,
      this.policy.idleDelayAfterInputMs - (this.now() - this.lastInputAt)
    );
    const launch = deadline => {
      this.handle = null;
      this.#runSlice({ deadline });
      if (this.pending.size) this.#scheduleHandle();
    };
    if (delay > 0) {
      this.handle = {
        kind: "timeout",
        id: globalThis.setTimeout(() => launch(null), delay)
      };
      return;
    }
    if (typeof globalThis.requestIdleCallback === "function") {
      this.handle = {
        kind: "idle",
        id: globalThis.requestIdleCallback(launch, {
          timeout: Math.max(50, this.policy.idleDelayAfterInputMs)
        })
      };
      return;
    }
    this.handle = {
      kind: "timeout",
      id: globalThis.setTimeout(() => launch(null), 0)
    };
  }

  #runSlice({ deadline = null, force = false } = {}) {
    if (!this.pending.size) return;
    if (!force && this.#inputPending()) {
      this.diagnostics.cancelledForInput += 1;
      return;
    }
    const startedAt = this.now();
    const budget = force ? Infinity : this.policy.idleBudgetMs;
    const entries = [...this.pending.values()];
    for (const entry of entries) {
      const current = this.sandbox.getObject(entry.objectId);
      if (!current || current.geometry !== entry.sourceGeometry) {
        this.pending.delete(entry.objectId);
        this.diagnostics.cancelledForRevision += 1;
        continue;
      }
      do {
        entry.job.step(1);
        if (entry.job.done) {
          const result = entry.job.finish();
          this.pending.delete(entry.objectId);
          if (result.changed) {
            const changed = this.sandbox.dispatchMaintenance({
              type: "stroke-bundle.compact",
              objectId: entry.objectId,
              expectedGeometry: entry.sourceGeometry,
              geometry: result.bundle,
              source: "idle-stroke-compaction"
            });
            if (changed) this.diagnostics.maintenanceDispatches += 1;
          }
          this.diagnostics.completed += 1;
          break;
        }
        if (!force && this.#inputPending()) break;
      } while (
        force ||
        (this.now() - startedAt < budget &&
          (deadline?.timeRemaining?.() ?? budget) > 0.25)
      );
      if (!force && this.now() - startedAt >= budget) break;
    }
    const elapsed = this.now() - startedAt;
    this.diagnostics.slices += 1;
    this.diagnostics.maximumSliceMs = Math.max(
      this.diagnostics.maximumSliceMs,
      elapsed
    );
  }

  #inputPending() {
    if (this.now() - this.lastInputAt < this.policy.idleDelayAfterInputMs) {
      return true;
    }
    return Boolean(globalThis.navigator?.scheduling?.isInputPending?.());
  }

  #cancelHandle() {
    if (this.handle === null) return;
    if (this.handle.kind === "idle" &&
        typeof globalThis.cancelIdleCallback === "function") {
      globalThis.cancelIdleCallback(this.handle.id);
    } else {
      globalThis.clearTimeout(this.handle.id);
    }
    this.handle = null;
  }
}

function isStrokeBundleObject(object) {
  return Boolean(
    object &&
    (object.kind === "stroke-bundle" || object.geometry?.type === "stroke-bundle")
  );
}
