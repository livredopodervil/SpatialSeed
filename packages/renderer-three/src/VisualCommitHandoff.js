const DEFAULT_EPSILON = 1e-7;
const MAX_STALE_MATRICES_PER_OBJECT = 4;

export class VisualCommitHandoff {
  #pending = new Map();
  #acknowledgedIds = [];
  #nextGeneration = 1;
  #diagnostics = {
    begun: 0,
    chained: 0,
    acknowledged: 0,
    staleSuppressed: 0,
    superseded: 0,
    cancelled: 0,
    rolledBack: 0,
    released: 0,
    maximumPending: 0
  };

  begin(entries = []) {
    return this.beginTransaction(entries).begun;
  }

  beginTransaction(entries = []) {
    const records = [];
    for (const raw of entries) {
      const id = String(raw?.objectId ?? "").trim();
      if (!id) continue;
      const previous = cloneMatrix(raw?.previousWorldMatrix);
      const expected = cloneMatrix(raw?.expectedWorldMatrix);
      if (matricesApproximatelyEqual(previous, expected)) continue;

      const existing = this.#pending.get(id) ?? null;
      const staleWorldMatrices = existing
        ? existing.staleWorldMatrices.map(matrix => [...matrix])
        : [];
      if (existing) {
        appendUniqueMatrix(staleWorldMatrices, existing.expectedWorldMatrix);
      }
      appendUniqueMatrix(staleWorldMatrices, previous);
      if (staleWorldMatrices.length > MAX_STALE_MATRICES_PER_OBJECT) {
        staleWorldMatrices.splice(
          0,
          staleWorldMatrices.length - MAX_STALE_MATRICES_PER_OBJECT
        );
      }

      const generation = this.#nextGeneration++;
      records.push(Object.freeze({
        id,
        generation,
        previous: existing ? clonePending(existing) : null
      }));
      this.#pending.set(id, {
        generation,
        staleWorldMatrices,
        expectedWorldMatrix: expected,
        acknowledged: false
      });
      this.#diagnostics.begun += 1;
      if (existing) this.#diagnostics.chained += 1;
    }

    this.#diagnostics.maximumPending = Math.max(
      this.#diagnostics.maximumPending,
      this.#pending.size
    );
    return Object.freeze({
      begun: records.length,
      records: Object.freeze(records)
    });
  }

  beginObject(objectId, previousWorldMatrix, expectedWorldMatrix) {
    return this.beginTransaction([{
      objectId,
      previousWorldMatrix,
      expectedWorldMatrix
    }]).begun > 0;
  }

  rollbackTransaction(transaction) {
    let count = 0;
    for (const record of transaction?.records ?? []) {
      const current = this.#pending.get(record.id);
      if (!current || current.generation !== record.generation) continue;
      if (record.previous) {
        this.#pending.set(record.id, clonePending(record.previous));
      } else {
        this.#pending.delete(record.id);
      }
      count += 1;
    }
    this.#diagnostics.rolledBack += count;
    return count;
  }

  project(objectId, incomingWorldMatrix) {
    const id = String(objectId ?? "");
    const pending = this.#pending.get(id);
    if (!pending) return incomingWorldMatrix;

    if (matricesApproximatelyEqual(
      incomingWorldMatrix,
      pending.expectedWorldMatrix
    )) {
      if (!pending.acknowledged) {
        pending.acknowledged = true;
        this.#acknowledgedIds.push(id);
        this.#diagnostics.acknowledged += 1;
      }
      return pending.expectedWorldMatrix;
    }

    for (const matrix of pending.staleWorldMatrices) {
      if (!matricesApproximatelyEqual(incomingWorldMatrix, matrix)) continue;
      this.#diagnostics.staleSuppressed += 1;
      return pending.expectedWorldMatrix;
    }

    this.#pending.delete(id);
    this.#diagnostics.superseded += 1;
    return incomingWorldMatrix;
  }

  has(objectId) {
    return this.#pending.has(String(objectId ?? ""));
  }

  cancel(objectIds = null) {
    if (objectIds === null) {
      const count = this.#pending.size;
      this.#pending.clear();
      this.#acknowledgedIds = [];
      this.#diagnostics.cancelled += count;
      return count;
    }
    let count = 0;
    for (const raw of objectIds) {
      const id = String(raw ?? "");
      if (this.#pending.delete(id)) count += 1;
    }
    this.#diagnostics.cancelled += count;
    return count;
  }

  remove(objectId) {
    return this.cancel([objectId]) > 0;
  }

  releaseAcknowledged() {
    let count = 0;
    for (const id of this.#acknowledgedIds) {
      const pending = this.#pending.get(id);
      if (!pending?.acknowledged) continue;
      this.#pending.delete(id);
      count += 1;
    }
    this.#acknowledgedIds = [];
    this.#diagnostics.released += count;
    return count;
  }

  status() {
    let acknowledgedPending = 0;
    for (const entry of this.#pending.values()) {
      if (entry.acknowledged) acknowledgedPending += 1;
    }
    return Object.freeze({
      ...this.#diagnostics,
      pending: this.#pending.size,
      acknowledgedPending
    });
  }
}

export function matricesApproximatelyEqual(
  left,
  right,
  epsilon = DEFAULT_EPSILON
) {
  if (!Array.isArray(left) || !Array.isArray(right) ||
      left.length !== 16 || right.length !== 16) {
    return false;
  }
  for (let index = 0; index < 16; index += 1) {
    if (Math.abs(Number(left[index]) - Number(right[index])) > epsilon) {
      return false;
    }
  }
  return true;
}

function cloneMatrix(value) {
  if (!Array.isArray(value) || value.length !== 16) {
    throw new TypeError("O handoff visual exige uma matriz 4x4.");
  }
  return value.map(Number);
}

function clonePending(entry) {
  return {
    generation: entry.generation,
    staleWorldMatrices: entry.staleWorldMatrices.map(matrix => [...matrix]),
    expectedWorldMatrix: [...entry.expectedWorldMatrix],
    acknowledged: Boolean(entry.acknowledged)
  };
}

function appendUniqueMatrix(target, matrix) {
  if (target.some(candidate =>
    matricesApproximatelyEqual(candidate, matrix)
  )) {
    return false;
  }
  target.push([...matrix]);
  return true;
}
