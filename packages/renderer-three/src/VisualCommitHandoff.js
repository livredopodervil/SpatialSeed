const DEFAULT_EPSILON = 1e-7;
const MAX_STALE_MATRICES_PER_OBJECT = 4;

export class VisualCommitHandoff {
  #pending = new Map();
  #acknowledgedIds = [];
  #diagnostics = {
    begun: 0,
    chained: 0,
    acknowledged: 0,
    staleSuppressed: 0,
    superseded: 0,
    cancelled: 0,
    released: 0,
    maximumPending: 0
  };

  begin(entries = []) {
    let begun = 0;
    for (const raw of entries) {
      if (this.beginObject(
        raw?.objectId,
        raw?.previousWorldMatrix,
        raw?.expectedWorldMatrix
      )) {
        begun += 1;
      }
    }
    return begun;
  }

  beginObject(objectId, previousWorldMatrix, expectedWorldMatrix) {
    const id = String(objectId ?? "").trim();
    if (!id) return false;
    const previous = assertMatrix(previousWorldMatrix);
    const expected = assertMatrix(expectedWorldMatrix);
    if (matricesApproximatelyEqual(previous, expected)) return false;

    const existing = this.#pending.get(id);
    const staleWorldMatrices = existing
      ? [...existing.staleWorldMatrices]
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

    this.#pending.set(id, {
      staleWorldMatrices,
      expectedWorldMatrix: expected,
      acknowledged: false
    });
    this.#diagnostics.begun += 1;
    if (existing) this.#diagnostics.chained += 1;
    this.#diagnostics.maximumPending = Math.max(
      this.#diagnostics.maximumPending,
      this.#pending.size
    );
    return true;
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

function assertMatrix(value) {
  if (!Array.isArray(value) || value.length !== 16) {
    throw new TypeError("O handoff visual exige uma matriz 4x4.");
  }
  return value;
}

function appendUniqueMatrix(target, matrix) {
  if (target.some(candidate =>
    matricesApproximatelyEqual(candidate, matrix)
  )) {
    return false;
  }
  target.push(matrix);
  return true;
}
