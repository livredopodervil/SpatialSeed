import {
  composeTransform,
  decomposeTransformStrict,
  identityMatrix,
  invertAffineMatrix,
  multiplyMatrices
} from "../../math-affine/src/index.js";

export const OCCURRENCE_TRANSFORM_HIERARCHY_VERSION =
  "occurrence-transform-hierarchy-v1";

/**
 * Transform hierarchy backed directly by OccurrenceResolver.  It never builds
 * a scene-wide node map: cold resolution is proportional to path depth H and
 * cached resolution is O(1) with respect to scene size.
 */
export class OccurrenceTransformHierarchy {
  #resolver;
  #scope = null;
  #worldCache = new Map();
  #localCache = new Map();
  #stats = {
    localReads: 0,
    worldReads: 0,
    cacheHits: 0,
    cacheMisses: 0,
    parentReads: 0,
    anchorReads: 0,
    worldToLocal: 0,
    invalidations: 0,
    sceneScans: 0,
    descendantsVisited: 0
  };

  constructor({ occurrenceResolver, scope = null } = {}) {
    if (!occurrenceResolver?.resolve || !occurrenceResolver?.parent) {
      throw new TypeError("OccurrenceTransformHierarchy exige OccurrenceResolver.");
    }
    this.#resolver = occurrenceResolver;
    this.#scope = scope;
  }

  withScope(scope, callback) {
    const previous = this.#scope;
    this.#scope = scope ?? previous;
    try { return callback(); }
    finally { this.#scope = previous; }
  }

  ref(value) { return this.#resolver.toRef(value); }
  id(value) { return this.#resolver.id(value); }
  object(value) { return this.#resolver.object(value); }
  resolve(value) { return this.#resolver.resolve(value); }
  exists(value) { return this.#resolver.exists(value); }

  parent(value) {
    this.#stats.parentReads += 1;
    return this.#resolver.parent(value);
  }

  children(value) { return this.#resolver.children(value); }

  localTransform(value) {
    const id = this.id(value);
    const revision = Number(this.#resolver.status?.().revision ?? 0);
    const key = `${revision}:${id}`;
    const cached = this.#localCache.get(key);
    this.#stats.localReads += 1;
    if (cached) {
      this.#stats.cacheHits += 1;
      this.#count("resolveCacheHits");
      return cached;
    }
    this.#stats.cacheMisses += 1;
    this.#count("resolveCacheMisses");
    const object = this.object(value);
    if (!object) return null;
    const result = Object.freeze({
      position: Object.freeze([...(object.position ?? [0, 0, 0])]),
      rotation: Object.freeze([...(object.rotation ?? [0, 0, 0, 1])]),
      scale: Object.freeze([...(object.scale ?? [1, 1, 1])])
    });
    this.#localCache.set(key, result);
    return result;
  }

  localMatrix(value) {
    const transform = this.localTransform(value);
    return transform ? composeTransform(transform) : null;
  }

  worldMatrix(value) {
    const id = this.id(value);
    const revision = Number(this.#resolver.status?.().revision ?? 0);
    const key = `${revision}:${id}`;
    const cached = this.#worldCache.get(key);
    this.#stats.worldReads += 1;
    if (cached) {
      this.#stats.cacheHits += 1;
      this.#count("resolveCacheHits");
      return cached;
    }
    this.#stats.cacheMisses += 1;
    this.#count("resolveCacheMisses");
    const resolved = this.resolve(value);
    if (!resolved) return null;
    let matrix = resolved.transform?.world;
    if (!Array.isArray(matrix) || matrix.length !== 16) {
      const local = this.localMatrix(value) ?? identityMatrix();
      const parent = this.parent(value);
      matrix = parent
        ? multiplyMatrices(this.worldMatrix(parent), local)
        : local;
    }
    const frozen = Object.freeze([...matrix]);
    this.#worldCache.set(key, frozen);
    return frozen;
  }

  worldTransform(value) {
    const matrix = this.worldMatrix(value);
    return matrix ? decomposeTransformStrict(matrix) : null;
  }

  anchor(value) {
    this.#stats.anchorReads += 1;
    const object = this.object(value);
    const ref = normalizeAnchorRef(object);
    if (ref.mode === "reference") {
      const targetMatrix = this.worldMatrix(ref.target);
      if (!targetMatrix) return null;
      const point = transformPoint(targetMatrix, ref.point);
      return Object.freeze({
        mode: ref.mode,
        source: this.ref(value),
        target: this.ref(ref.target),
        local: Object.freeze([...ref.point]),
        world: Object.freeze([
          point[0] + ref.offset[0],
          point[1] + ref.offset[1],
          point[2] + ref.offset[2]
        ])
      });
    }
    const local = ref.point;
    const world = transformPoint(this.worldMatrix(value), local);
    return Object.freeze({
      mode: ref.mode,
      source: this.ref(value),
      target: null,
      local: Object.freeze([...local]),
      world: Object.freeze(world)
    });
  }

  worldToLocalTransform(value, worldMatrix) {
    if (!Array.isArray(worldMatrix) || worldMatrix.length !== 16) {
      throw new TypeError("worldToLocalTransform exige matriz 4x4.");
    }
    this.#stats.worldToLocal += 1;
    this.#count("editTargetsVisited");
    const parent = this.parent(value);
    const parentWorld = parent ? this.worldMatrix(parent) : identityMatrix();
    return decomposeTransformStrict(
      multiplyMatrices(invertAffineMatrix(parentWorld), worldMatrix)
    );
  }

  localToWorldMatrix(value, localTransform) {
    const parent = this.parent(value);
    const parentWorld = parent ? this.worldMatrix(parent) : identityMatrix();
    return Object.freeze([
      ...multiplyMatrices(parentWorld, composeTransform(localTransform))
    ]);
  }

  canonicalize(values = []) {
    const refs = [];
    const ids = new Set();
    for (const value of values) {
      const ref = this.ref(value);
      const id = this.id(ref);
      if (!ids.has(id)) { ids.add(id); refs.push(ref); }
    }
    return Object.freeze(refs.filter(ref => {
      let parent = this.parent(ref);
      while (parent) {
        if (ids.has(this.id(parent))) return false;
        parent = this.parent(parent);
      }
      return true;
    }));
  }

  commonParent(values = []) {
    const refs = this.canonicalize(values);
    if (!refs.length) return null;
    const lines = refs.map(ref => {
      const line = [];
      let parent = this.parent(ref);
      while (parent) { line.push(this.id(parent)); parent = this.parent(parent); }
      line.push(null);
      return line;
    });
    const sets = lines.slice(1).map(line => new Set(line));
    const id = lines[0].find(candidate => sets.every(set => set.has(candidate))) ?? null;
    return id == null ? null : this.ref(id);
  }

  invalidate() {
    this.#worldCache.clear();
    this.#localCache.clear();
    this.#stats.invalidations += 1;
  }

  status() {
    return Object.freeze({
      version: OCCURRENCE_TRANSFORM_HIERARCHY_VERSION,
      worldCacheSize: this.#worldCache.size,
      localCacheSize: this.#localCache.size,
      statistics: Object.freeze({ ...this.#stats })
    });
  }

  #count(name, amount = 1) { this.#scope?.count?.(name, amount); }
}

export function normalizeAnchorRef(object = null) {
  const anchorRef = object?.anchorRef;
  if (anchorRef?.mode === "reference" && anchorRef.target) {
    return Object.freeze({
      mode: "reference",
      target: anchorRef.target,
      point: Object.freeze(vector3(anchorRef.point ?? [0, 0, 0])),
      offset: Object.freeze(vector3(anchorRef.offset ?? [0, 0, 0]))
    });
  }
  const explicit = object?.anchor?.local
    ?? object?.selectionAnchorLocal
    ?? (Array.isArray(object?.anchor) ? object.anchor : null)
    ?? [0, 0, 0];
  return Object.freeze({
    mode: "local",
    target: null,
    point: Object.freeze(vector3(explicit)),
    offset: Object.freeze([0, 0, 0])
  });
}

function transformPoint(matrix, point) {
  const [x, y, z] = vector3(point);
  return [
    matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12],
    matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13],
    matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14]
  ];
}
function vector3(value) {
  if (!Array.isArray(value) || value.length !== 3) throw new TypeError("Vetor 3D inválido.");
  const result = value.map(Number);
  if (!result.every(Number.isFinite)) throw new TypeError("Vetor 3D inválido.");
  return result;
}
