export class RefCountCache {
  #records = new Map();
  #retentionClock = 0;

  constructor({
    create,
    dispose = value => value?.dispose?.(),
    deferDisposal = false,
    retainReleased = 0,
    retainWhen = () => false
  }) {
    if (typeof create !== "function") {
      throw new TypeError("RefCountCache exige função create.");
    }
    this.create = create;
    this.dispose = dispose;
    this.deferDisposal = Boolean(deferDisposal);
    this.retainReleased = Math.max(0, Math.floor(Number(retainReleased) || 0));
    this.retainWhen = typeof retainWhen === "function"
      ? retainWhen
      : () => false;
  }

  acquire(key, context = null) {
    const normalized = String(key);
    let record = this.#records.get(normalized);

    if (!record) {
      record = {
        key: normalized,
        refs: 0,
        value: null,
        promise: null,
        disposeWhenReady: false,
        retainedAt: 0
      };

      const created = this.create(normalized, context);

      if (created && typeof created.then === "function") {
        record.promise = Promise.resolve(created)
          .then(value => {
            record.value = value;
            if (record.disposeWhenReady || record.refs === 0) {
              this.dispose(value, normalized);
              this.#records.delete(normalized);
              return null;
            }
            return value;
          })
          .catch(error => {
            this.#records.delete(normalized);
            throw error;
          });
      } else {
        record.value = created;
      }

      this.#records.set(normalized, record);
    }

    record.refs += 1;
    record.disposeWhenReady = false;
    record.retainedAt = 0;

    return {
      key: normalized,
      value: record.value,
      promise: record.promise,
      refs: record.refs
    };
  }

  release(key) {
    if (!key) return false;

    const record = this.#records.get(String(key));
    if (!record) return false;

    record.refs = Math.max(0, record.refs - 1);
    if (record.refs > 0) return true;

    if (record.value) {
      if (this.#retainReleasedRecord(record)) return true;
      if (this.deferDisposal) {
        record.disposeWhenReady = true;
        queueMicrotask(() => {
          const current = this.#records.get(record.key);
          if (
            current !== record ||
            record.refs > 0 ||
            !record.disposeWhenReady
          ) {
            return;
          }
          this.dispose(record.value, record.key);
          this.#records.delete(record.key);
        });
      } else {
        this.dispose(record.value, record.key);
        this.#records.delete(record.key);
      }
    } else {
      record.disposeWhenReady = true;
    }

    return true;
  }

  #retainReleasedRecord(record) {
    if (this.retainReleased <= 0 ||
        !this.retainWhen(record.key, record.value)) {
      return false;
    }
    record.disposeWhenReady = false;
    record.retainedAt = ++this.#retentionClock;
    const retained = [...this.#records.values()]
      .filter(candidate => candidate.refs === 0 && candidate.retainedAt > 0)
      .sort((left, right) => left.retainedAt - right.retainedAt);
    while (retained.length > this.retainReleased) {
      const oldest = retained.shift();
      if (!oldest || oldest.refs > 0) continue;
      this.dispose(oldest.value, oldest.key);
      this.#records.delete(oldest.key);
    }
    return true;
  }

  stats() {
    let references = 0;
    let ready = 0;
    let pending = 0;
    let retained = 0;

    for (const record of this.#records.values()) {
      references += record.refs;
      if (record.value) ready += 1;
      else if (record.promise) pending += 1;
      if (record.refs === 0 && record.retainedAt > 0) retained += 1;
    }

    return Object.freeze({
      entries: this.#records.size,
      references,
      ready,
      pending,
      retained
    });
  }
}
