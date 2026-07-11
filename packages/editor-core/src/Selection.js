export class Selection {
  #members = [];
  #activeIndex = -1;
  #listeners = new Set();

  constructor({
    id = "selection-local",
    pivotPolicy = "median",
    orientationPolicy = "world",
    transformPolicy = "group"
  } = {}) {
    this.id = id;
    this.pivotPolicy = pivotPolicy;
    this.orientationPolicy = orientationPolicy;
    this.transformPolicy = transformPolicy;
  }

  get members() {
    return this.#members.map(member => ({ ...member }));
  }

  get activeMember() {
    return this.#activeIndex >= 0
      ? { ...this.#members[this.#activeIndex] }
      : null;
  }

  get size() {
    return this.#members.length;
  }

  get empty() {
    return this.#members.length === 0;
  }

  contains(objectId) {
    return this.#members.some(member => member.objectId === objectId);
  }

  replace(member) {
    this.#members = member ? [{ ...member }] : [];
    this.#activeIndex = this.#members.length ? 0 : -1;
    this.#emit("replace");
  }

  toggle(member) {
    const index = this.#members.findIndex(
      current =>
        current.regionId === member.regionId &&
        current.objectId === member.objectId
    );

    if (index >= 0) {
      this.#members.splice(index, 1);
      this.#activeIndex = this.#members.length
        ? Math.min(index, this.#members.length - 1)
        : -1;
      this.#emit("remove");
      return;
    }

    this.#members.push({ ...member });
    this.#activeIndex = this.#members.length - 1;
    this.#emit("add");
  }

  clear() {
    if (this.empty) return;
    this.#members = [];
    this.#activeIndex = -1;
    this.#emit("clear");
  }

  snapshot() {
    return Object.freeze({
      id: this.id,
      members: this.members,
      activeMember: this.activeMember,
      pivotPolicy: this.pivotPolicy,
      orientationPolicy: this.orientationPolicy,
      transformPolicy: this.transformPolicy
    });
  }

  subscribe(listener) {
    this.#listeners.add(listener);
    listener(this.snapshot(), { type: "initial" });
    return () => this.#listeners.delete(listener);
  }

  #emit(type) {
    const snapshot = this.snapshot();
    for (const listener of this.#listeners) {
      try {
        listener(snapshot, { type });
      } catch (error) {
        console.error("Selection subscriber failed", error);
      }
    }
  }
}
