import {
  createOccurrenceRef,
  createResolvedOccurrence,
  isOccurrenceRef,
  occurrenceRefKey,
  parentOccurrenceRef
} from "../../occurrence-contracts/src/index.js?build=20260807-0053d";
import {
  instanceOccurrenceId,
  isInstanceNode,
  parseInstanceOccurrenceId
} from "../../instance-graph/src/index.js?build=20260807-0053d";

export const OCCURRENCE_RESOLVER_VERSION = "occurrence-resolver-v1";

/**
 * Canonical compatibility boundary between semantic instances and all editor
 * clients. It deliberately hides Sandbox/InstanceGraph representation details.
 */
export class OccurrenceResolver {
  #sandbox;
  #cache = new Map();
  #activeScope = null;
  #statistics = {
    resolveCalls: 0,
    cacheHits: 0,
    cacheMisses: 0,
    pathSteps: 0,
    descendantQueries: 0,
    descendantsVisited: 0,
    invalidations: 0
  };

  constructor({ sandbox } = {}) {
    if (!sandbox?.getSnapshot || !sandbox?.getObject) {
      throw new TypeError("OccurrenceResolver exige Sandbox compatível.");
    }
    this.#sandbox = sandbox;
  }

  withScope(scope, callback) {
    const previous = this.#activeScope;
    this.#activeScope = scope ?? previous;
    try {
      return callback();
    } finally {
      this.#activeScope = previous;
    }
  }

  toRef(value) {
    if (isOccurrenceRef(value)) return value;
    if (value && typeof value === "object" && value.rootInstanceId) {
      return createOccurrenceRef(value);
    }
    const id = String(value?.objectId ?? value?.id ?? value ?? "").trim();
    if (!id) throw new TypeError("Referência de ocorrência vazia.");
    const parsed = parseInstanceOccurrenceId(id);
    return parsed
      ? createOccurrenceRef({ rootInstanceId: parsed.rootId, path: parsed.path })
      : createOccurrenceRef({ rootInstanceId: id, path: [] });
  }

  id(value) {
    const ref = this.toRef(value);
    return ref.path.length
      ? instanceOccurrenceId(ref.rootInstanceId, ref.path)
      : ref.rootInstanceId;
  }

  exists(value) {
    return Boolean(this.object(value));
  }

  object(value) {
    const ref = this.toRef(value);
    this.#count("resolveCalls");
    this.#statistics.resolveCalls += 1;
    const key = `${this.#sandbox.revision}:${occurrenceRefKey(ref)}`;
    const cached = this.#cache.get(key);
    if (cached) {
      this.#count("resolveCacheHits");
      this.#statistics.cacheHits += 1;
      return cached.object;
    }
    this.#count("resolveCacheMisses");
    this.#statistics.cacheMisses += 1;
    this.#count("instancesVisited", 1);
    if (ref.path.length) {
      this.#count("pathSteps", ref.path.length);
      this.#statistics.pathSteps += ref.path.length;
    }
    const object = this.#sandbox.getObject(this.id(ref));
    if (object) this.#cache.set(key, { object, resolved: null });
    return object ?? null;
  }

  resolve(value) {
    const ref = this.toRef(value);
    const key = `${this.#sandbox.revision}:${occurrenceRefKey(ref)}`;
    const cached = this.#cache.get(key);
    if (cached?.resolved) {
      this.#count("resolveCalls");
      this.#count("resolveCacheHits");
      this.#statistics.resolveCalls += 1;
      this.#statistics.cacheHits += 1;
      return cached.resolved;
    }
    const object = cached?.object ?? this.object(ref);
    if (!object) return null;
    const rawRoot = this.#sandbox.getRawObject?.(ref.rootInstanceId) ?? null;
    const occurrence = ref.path.length
      ? this.#sandbox.getInstanceOccurrence?.(this.id(ref)) ?? null
      : null;
    const definitionId = String(
      occurrence?.definition?.id ?? object.definitionId ?? rawRoot?.definitionId ?? object.id
    );
    const world = this.#sandbox.getObjectWorldMatrix?.(this.id(ref)) ?? null;
    const resolved = createResolvedOccurrence({
      ref,
      definitionId,
      kind: String(object.kind ?? occurrence?.definition?.type ?? "object"),
      transform: {
        local: Object.freeze({
          position: Object.freeze([...(object.position ?? [0, 0, 0])]),
          rotation: Object.freeze([...(object.rotation ?? [0, 0, 0, 1])]),
          scale: Object.freeze([...(object.scale ?? [1, 1, 1])])
        }),
        world: world ? Object.freeze([...world]) : null
      },
      geometryRef: stringRef(object.geometryRef ?? object.geometryId ?? null),
      appearanceRef: stringRef(object.appearanceRef ?? object.appearanceId ?? null),
      effectiveOverrides: occurrence?.override ?? {},
      bounds: null,
      revisions: {
        definition: 0,
        instance: Number(this.#sandbox.revision ?? 0),
        transform: Number(this.#sandbox.revision ?? 0),
        geometry: 0,
        appearance: 0,
        bounds: 0
      }
    });
    this.#cache.set(key, { object, resolved });
    return resolved;
  }

  resolveMany(values = []) {
    return Object.freeze(values.map(value => this.resolve(value)).filter(Boolean));
  }

  parent(value) {
    const ref = this.toRef(value);
    if (ref.path.length) return parentOccurrenceRef(ref);
    const object = this.object(ref);
    if (!object?.parentId) return null;
    return this.toRef(String(object.parentId));
  }

  children(value) {
    const id = this.id(value);
    const page = this.#sandbox.listObjectChildren?.(id, { offset: 0, limit: Number.MAX_SAFE_INTEGER });
    const ids = page?.items ?? [];
    return Object.freeze(ids.map(childId => this.toRef(childId)));
  }

  descendantIds(values = [], { includeRoots = false, renderablesOnly = false } = {}) {
    const ids = values.map(value => this.id(value));
    this.#statistics.descendantQueries += 1;
    const result = this.#sandbox.getObjectDescendantIds?.(ids, { includeRoots }) ?? ids;
    const filtered = renderablesOnly
      ? result.filter(id => {
          const kind = this.object(id)?.kind;
          return !["group", "camera", "light"].includes(kind);
        })
      : result;
    this.#count("descendantsVisited", filtered.length);
    this.#statistics.descendantsVisited += filtered.length;
    return Object.freeze([...filtered]);
  }

  descendants(value, options = {}) {
    return Object.freeze(this.descendantIds([value], options).map(id => this.toRef(id)));
  }

  transform(value) {
    const resolved = this.resolve(value);
    return resolved?.transform ?? null;
  }

  geometry(value) {
    return this.object(value)?.geometry ?? null;
  }

  appearance(value) {
    const object = this.object(value);
    return object ? (object.appearanceId ?? object.material ?? null) : null;
  }

  invalidate(_changes = null) {
    this.#cache.clear();
    this.#statistics.invalidations += 1;
  }

  status() {
    return Object.freeze({
      version: OCCURRENCE_RESOLVER_VERSION,
      revision: Number(this.#sandbox.revision ?? 0),
      cacheSize: this.#cache.size,
      ...this.#statistics
    });
  }

  #count(name, amount = 1) {
    this.#activeScope?.count?.(name, amount);
  }
}

function stringRef(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}
