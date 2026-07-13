export class InstanceBatchIndex {
  #objectToIndex = new Map();
  #indexToObject = [];
  #free = [];

  get size() { return this.#objectToIndex.size; }
  has(objectId) { return this.#objectToIndex.has(String(objectId)); }
  indexOf(objectId) { return this.#objectToIndex.get(String(objectId)) ?? -1; }
  objectAt(index) { return this.#indexToObject[index] ?? null; }

  allocate(objectId) {
    const id = String(objectId);
    if (this.#objectToIndex.has(id)) throw new Error(`Objeto já registrado no lote: ${id}`);
    const index = this.#free.length ? this.#free.pop() : this.#indexToObject.length;
    this.#objectToIndex.set(id, index);
    this.#indexToObject[index] = id;
    return index;
  }

  release(objectId) {
    const id = String(objectId);
    const index = this.#objectToIndex.get(id);
    if (index === undefined) return { removed: false, index: -1 };
    this.#objectToIndex.delete(id);
    this.#indexToObject[index] = null;
    this.#free.push(index);
    return { removed: true, index };
  }

  clear() {
    this.#objectToIndex.clear();
    this.#indexToObject.length = 0;
    this.#free.length = 0;
  }

  stats() {
    return Object.freeze({ size: this.size, capacity: this.#indexToObject.length, free: this.#free.length });
  }
}
