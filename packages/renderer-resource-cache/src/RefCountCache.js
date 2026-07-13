export class RefCountCache {
  #records = new Map();

  constructor({ create, dispose = value => value?.dispose?.() }) {
    if (typeof create !== "function") {
      throw new TypeError("RefCountCache exige função create.");
    }
    this.create = create;
    this.dispose = dispose;
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
        disposeWhenReady: false
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
      this.dispose(record.value, record.key);
      this.#records.delete(record.key);
    } else {
      record.disposeWhenReady = true;
    }

    return true;
  }

  stats() {
    let references = 0;
    let ready = 0;
    let pending = 0;

    for (const record of this.#records.values()) {
      references += record.refs;
      if (record.value) ready += 1;
      else if (record.promise) pending += 1;
    }

    return Object.freeze({
      entries: this.#records.size,
      references,
      ready,
      pending
    });
  }
}
