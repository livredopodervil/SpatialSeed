export const INCREMENTAL_PROPERTY_GRAPH_VERSION = "incremental-property-graph-v1";

export class IncrementalPropertyGraph {
  #nodes = new Map();
  #consumers = new Map();
  #statistics = {
    sourceWrites: 0,
    equalWrites: 0,
    invalidations: 0,
    evaluations: 0,
    cacheHits: 0
  };

  defineSource(id, initialValue, { equals = Object.is } = {}) {
    const key = normalizeId(id);
    this.#assertNew(key);
    if (typeof equals !== "function") throw new TypeError("equals deve ser função.");
    this.#nodes.set(key, {
      id: key,
      kind: "source",
      value: initialValue,
      version: 0,
      dirty: false,
      equals,
      compute: null,
      dependencies: Object.freeze([]),
      dependencyVersions: new Map(),
      evaluations: 0
    });
    return this.describe(key);
  }

  defineDerived(id, dependencies, compute, { equals = Object.is } = {}) {
    const key = normalizeId(id);
    this.#assertNew(key);
    if (!Array.isArray(dependencies) || !dependencies.length) {
      throw new TypeError("Propriedade derivada exige dependências.");
    }
    if (typeof compute !== "function") throw new TypeError("compute deve ser função.");
    if (typeof equals !== "function") throw new TypeError("equals deve ser função.");
    const deps = Object.freeze([...new Set(dependencies.map(normalizeId))]);
    for (const dependencyId of deps) this.#require(dependencyId);
    this.#assertAcyclic(key, deps);
    const node = {
      id: key,
      kind: "derived",
      value: undefined,
      version: 0,
      dirty: true,
      equals,
      compute,
      dependencies: deps,
      dependencyVersions: new Map(),
      evaluations: 0
    };
    this.#nodes.set(key, node);
    for (const dependencyId of deps) {
      const consumers = this.#consumers.get(dependencyId) ?? new Set();
      consumers.add(key);
      this.#consumers.set(dependencyId, consumers);
    }
    return this.describe(key);
  }

  set(id, nextValue) {
    const node = this.#require(id);
    if (node.kind !== "source") {
      throw new Error(`Propriedade derivada não pode ser escrita: ${node.id}.`);
    }
    if (node.equals(node.value, nextValue)) {
      this.#statistics.equalWrites += 1;
      return Object.freeze({ changed: false, id: node.id, version: node.version });
    }
    node.value = nextValue;
    node.version += 1;
    this.#statistics.sourceWrites += 1;
    const invalidated = this.#invalidateConsumers(node.id);
    return Object.freeze({
      changed: true,
      id: node.id,
      version: node.version,
      invalidated
    });
  }

  get(id) {
    const node = this.#require(id);
    if (node.kind === "source") return node.value;
    if (!this.#needsEvaluation(node)) {
      this.#statistics.cacheHits += 1;
      return node.value;
    }

    const values = Object.create(null);
    for (const dependencyId of node.dependencies) {
      values[dependencyId] = this.get(dependencyId);
    }
    const nextValue = node.compute(Object.freeze(values), this);
    const changed = node.evaluations === 0 || !node.equals(node.value, nextValue);
    node.value = nextValue;
    node.dirty = false;
    node.evaluations += 1;
    this.#statistics.evaluations += 1;
    for (const dependencyId of node.dependencies) {
      node.dependencyVersions.set(
        dependencyId,
        this.#require(dependencyId).version
      );
    }
    if (changed) {
      node.version += 1;
      this.#invalidateConsumers(node.id);
    }
    return node.value;
  }

  versionOf(id) {
    return this.#require(id).version;
  }

  isDirty(id) {
    return this.#require(id).dirty;
  }

  invalidate(id) {
    const node = this.#require(id);
    if (node.kind === "source") return this.#invalidateConsumers(node.id);
    if (node.dirty) return 0;
    node.dirty = true;
    this.#statistics.invalidations += 1;
    return 1 + this.#invalidateConsumers(node.id);
  }

  describe(id) {
    const node = this.#require(id);
    return Object.freeze({
      id: node.id,
      kind: node.kind,
      version: node.version,
      dirty: node.dirty,
      dependencies: node.dependencies,
      evaluations: node.evaluations
    });
  }

  status() {
    return Object.freeze({
      version: INCREMENTAL_PROPERTY_GRAPH_VERSION,
      nodeCount: this.#nodes.size,
      nodes: Object.freeze(
        [...this.#nodes.keys()].sort().map(id => this.describe(id))
      ),
      statistics: Object.freeze({ ...this.#statistics })
    });
  }

  #needsEvaluation(node) {
    if (node.dirty || node.evaluations === 0) return true;
    return node.dependencies.some(dependencyId =>
      node.dependencyVersions.get(dependencyId) !==
        this.#require(dependencyId).version
    );
  }

  #invalidateConsumers(id) {
    const pending = [...(this.#consumers.get(id) ?? [])];
    const visited = new Set();
    let count = 0;
    while (pending.length) {
      const consumerId = pending.pop();
      if (visited.has(consumerId)) continue;
      visited.add(consumerId);
      const node = this.#require(consumerId);
      if (!node.dirty) {
        node.dirty = true;
        this.#statistics.invalidations += 1;
        count += 1;
      }
      pending.push(...(this.#consumers.get(consumerId) ?? []));
    }
    return count;
  }

  #assertAcyclic(id, dependencies) {
    const reaches = start => {
      const pending = [start];
      const visited = new Set();
      while (pending.length) {
        const current = pending.pop();
        if (current === id) return true;
        if (visited.has(current)) continue;
        visited.add(current);
        const node = this.#nodes.get(current);
        if (node?.kind === "derived") pending.push(...node.dependencies);
      }
      return false;
    };
    if (dependencies.some(reaches)) {
      throw new Error(`Dependência cíclica para ${id}.`);
    }
  }

  #assertNew(id) {
    if (this.#nodes.has(id)) throw new Error(`Propriedade já definida: ${id}.`);
  }

  #require(id) {
    const key = normalizeId(id);
    const node = this.#nodes.get(key);
    if (!node) throw new Error(`Propriedade inexistente: ${key}.`);
    return node;
  }
}

export function arrayShallowEqual(a, b) {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
    return false;
  }
  return a.every((value, index) => Object.is(value, b[index]));
}

function normalizeId(value) {
  const id = String(value ?? "").trim();
  if (!id) throw new TypeError("Identificador de propriedade vazio.");
  return id;
}
