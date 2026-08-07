const DEFAULT_CELL_SIZE = 32;
const DEFAULT_MAX_CELLS_PER_OBJECT = 512;

/**
 * Incremental uniform-grid index for logical scene objects.
 *
 * The index stores world-space AABBs and lets picking visit only cells crossed
 * by the ray. Normal object updates touch only the old/new cells of that object.
 * Oversized objects are kept in a tiny overflow set so one pathological bound
 * never expands the grid update cost without limit.
 */
export class SpatialObjectIndex {
  static apiVersion = "spatial-object-index-v1";

  #cellSize;
  #maxCellsPerObject;
  #cells = new Map();
  #entries = new Map();
  #overflow = new Set();
  #statistics = {
    updates: 0,
    removals: 0,
    unchangedUpdates: 0,
    cellLinksAdded: 0,
    cellLinksRemoved: 0,
    rayQueries: 0,
    rayCellsVisited: 0,
    rayCandidates: 0,
    rayBoundsHits: 0,
    overflowTests: 0
  };

  constructor({
    cellSize = DEFAULT_CELL_SIZE,
    maxCellsPerObject = DEFAULT_MAX_CELLS_PER_OBJECT
  } = {}) {
    this.#cellSize = positiveFinite(cellSize, "cellSize");
    this.#maxCellsPerObject = positiveInteger(
      maxCellsPerObject,
      "maxCellsPerObject"
    );
  }

  get cellSize() { return this.#cellSize; }
  get size() { return this.#entries.size; }

  has(objectId) {
    return this.#entries.has(String(objectId));
  }

  boundsOf(objectId) {
    const entry = this.#entries.get(String(objectId));
    return entry ? cloneBounds(entry.bounds) : null;
  }

  update(objectId, boundsValue) {
    const id = String(objectId ?? "").trim();
    if (!id) throw new TypeError("SpatialObjectIndex exige objectId.");
    const bounds = normalizeBounds(boundsValue);
    const previous = this.#entries.get(id);
    if (previous && boundsEqual(previous.bounds, bounds)) {
      this.#statistics.unchangedUpdates += 1;
      return false;
    }

    if (previous) this.#unlink(id, previous);
    const cellKeys = cellsForBounds(
      bounds,
      this.#cellSize,
      this.#maxCellsPerObject
    );
    const overflow = cellKeys === null;
    const entry = Object.freeze({
      bounds: Object.freeze(bounds),
      cellKeys: overflow ? null : Object.freeze(cellKeys),
      overflow
    });
    this.#entries.set(id, entry);
    if (overflow) {
      this.#overflow.add(id);
    } else {
      for (const key of cellKeys) {
        let bucket = this.#cells.get(key);
        if (!bucket) {
          bucket = new Set();
          this.#cells.set(key, bucket);
        }
        if (!bucket.has(id)) {
          bucket.add(id);
          this.#statistics.cellLinksAdded += 1;
        }
      }
    }
    this.#statistics.updates += 1;
    return true;
  }

  remove(objectId) {
    const id = String(objectId ?? "");
    const previous = this.#entries.get(id);
    if (!previous) return false;
    this.#unlink(id, previous);
    this.#entries.delete(id);
    this.#statistics.removals += 1;
    return true;
  }

  clear() {
    this.#cells.clear();
    this.#entries.clear();
    this.#overflow.clear();
  }

  /**
   * Returns logical object candidates ordered by entry distance along the ray.
   * `ray` may be a THREE.Ray or any {origin:{x,y,z}, direction:{x,y,z}}.
   */
  queryRay(ray, {
    maxDistance = Infinity,
    maxCells = 4096
  } = {}) {
    const origin = vector3(ray?.origin, "ray.origin");
    const direction = vector3(ray?.direction, "ray.direction");
    const directionLength = Math.hypot(...direction);
    if (!(directionLength > 0)) return Object.freeze([]);
    const dir = direction.map(value => value / directionLength);
    const distanceLimit = finiteNonNegativeOrInfinity(maxDistance);
    const cellLimit = positiveInteger(maxCells, "maxCells");
    this.#statistics.rayQueries += 1;

    const candidateIds = new Set();
    const visit = id => candidateIds.add(id);
    traverseRayCells({
      origin,
      direction: dir,
      cellSize: this.#cellSize,
      maxDistance: distanceLimit,
      maxCells: cellLimit,
      onCell: key => {
        this.#statistics.rayCellsVisited += 1;
        for (const id of this.#cells.get(key) ?? []) visit(id);
      }
    });

    for (const id of this.#overflow) {
      this.#statistics.overflowTests += 1;
      visit(id);
    }
    this.#statistics.rayCandidates += candidateIds.size;

    const hits = [];
    for (const id of candidateIds) {
      const entry = this.#entries.get(id);
      if (!entry) continue;
      const distance = rayBoxDistance(origin, dir, entry.bounds);
      if (distance === null || distance > distanceLimit) continue;
      hits.push(Object.freeze({ id, distance }));
    }
    hits.sort((left, right) => left.distance - right.distance);
    this.#statistics.rayBoundsHits += hits.length;
    return Object.freeze(hits);
  }

  diagnostics() {
    let links = 0;
    let maximumBucketSize = 0;
    for (const bucket of this.#cells.values()) {
      links += bucket.size;
      maximumBucketSize = Math.max(maximumBucketSize, bucket.size);
    }
    return Object.freeze({
      version: SpatialObjectIndex.apiVersion,
      cellSize: this.#cellSize,
      maxCellsPerObject: this.#maxCellsPerObject,
      objects: this.#entries.size,
      cells: this.#cells.size,
      links,
      overflowObjects: this.#overflow.size,
      maximumBucketSize,
      statistics: Object.freeze({ ...this.#statistics })
    });
  }

  #unlink(id, entry) {
    if (entry.overflow) {
      this.#overflow.delete(id);
      return;
    }
    for (const key of entry.cellKeys ?? []) {
      const bucket = this.#cells.get(key);
      if (!bucket?.delete(id)) continue;
      this.#statistics.cellLinksRemoved += 1;
      if (!bucket.size) this.#cells.delete(key);
    }
  }
}

export function spatialCellKeyForPoint(pointValue, cellSize = DEFAULT_CELL_SIZE) {
  const point = vector3(pointValue, "point");
  const size = positiveFinite(cellSize, "cellSize");
  return `${Math.floor(point[0] / size)}:${Math.floor(point[1] / size)}:${Math.floor(point[2] / size)}`;
}

function cellsForBounds(bounds, cellSize, maximumCells) {
  const minCell = bounds.min.map(value => Math.floor(value / cellSize));
  const maxCell = bounds.max.map(value => Math.floor(value / cellSize));
  const nx = maxCell[0] - minCell[0] + 1;
  const ny = maxCell[1] - minCell[1] + 1;
  const nz = maxCell[2] - minCell[2] + 1;
  if (nx * ny * nz > maximumCells) return null;
  const keys = [];
  for (let x = minCell[0]; x <= maxCell[0]; x += 1) {
    for (let y = minCell[1]; y <= maxCell[1]; y += 1) {
      for (let z = minCell[2]; z <= maxCell[2]; z += 1) {
        keys.push(`${x}:${y}:${z}`);
      }
    }
  }
  return keys;
}

function traverseRayCells({
  origin,
  direction,
  cellSize,
  maxDistance,
  maxCells,
  onCell
}) {
  let ix = Math.floor(origin[0] / cellSize);
  let iy = Math.floor(origin[1] / cellSize);
  let iz = Math.floor(origin[2] / cellSize);
  const stepX = Math.sign(direction[0]);
  const stepY = Math.sign(direction[1]);
  const stepZ = Math.sign(direction[2]);
  const nextBoundary = (index, step) =>
    (index + (step > 0 ? 1 : 0)) * cellSize;
  const axis = (component, index, step) => {
    if (step === 0) return { tMax: Infinity, tDelta: Infinity };
    const boundary = nextBoundary(index, step);
    return {
      tMax: Math.max(0, (boundary - origin[component]) / direction[component]),
      tDelta: cellSize / Math.abs(direction[component])
    };
  };
  let xAxis = axis(0, ix, stepX);
  let yAxis = axis(1, iy, stepY);
  let zAxis = axis(2, iz, stepZ);
  let distance = 0;

  for (let visited = 0; visited < maxCells; visited += 1) {
    if (distance > maxDistance) break;
    onCell(`${ix}:${iy}:${iz}`);
    const next = Math.min(xAxis.tMax, yAxis.tMax, zAxis.tMax);
    if (!Number.isFinite(next) || next > maxDistance) break;
    if (xAxis.tMax <= next) {
      ix += stepX;
      xAxis = { ...xAxis, tMax: xAxis.tMax + xAxis.tDelta };
    }
    if (yAxis.tMax <= next) {
      iy += stepY;
      yAxis = { ...yAxis, tMax: yAxis.tMax + yAxis.tDelta };
    }
    if (zAxis.tMax <= next) {
      iz += stepZ;
      zAxis = { ...zAxis, tMax: zAxis.tMax + zAxis.tDelta };
    }
    distance = next;
  }
}

function rayBoxDistance(origin, direction, bounds) {
  let tMin = -Infinity;
  let tMax = Infinity;
  for (let axis = 0; axis < 3; axis += 1) {
    const o = origin[axis];
    const d = direction[axis];
    const min = bounds.min[axis];
    const max = bounds.max[axis];
    if (Math.abs(d) < 1e-12) {
      if (o < min || o > max) return null;
      continue;
    }
    let a = (min - o) / d;
    let b = (max - o) / d;
    if (a > b) [a, b] = [b, a];
    tMin = Math.max(tMin, a);
    tMax = Math.min(tMax, b);
    if (tMin > tMax) return null;
  }
  if (tMax < 0) return null;
  return Math.max(0, tMin);
}

function normalizeBounds(value) {
  const min = vector3(value?.min, "bounds.min");
  const max = vector3(value?.max, "bounds.max");
  for (let axis = 0; axis < 3; axis += 1) {
    if (min[axis] > max[axis]) [min[axis], max[axis]] = [max[axis], min[axis]];
  }
  return { min, max };
}

function cloneBounds(bounds) {
  return Object.freeze({
    min: Object.freeze([...bounds.min]),
    max: Object.freeze([...bounds.max])
  });
}

function boundsEqual(left, right) {
  return left.min.every((value, index) => value === right.min[index]) &&
    left.max.every((value, index) => value === right.max[index]);
}

function vector3(value, label) {
  const result = Array.isArray(value)
    ? value.map(Number)
    : [Number(value?.x), Number(value?.y), Number(value?.z)];
  if (result.length !== 3 || !result.every(Number.isFinite)) {
    throw new TypeError(`${label} deve ter três componentes finitos.`);
  }
  return result;
}

function positiveFinite(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    throw new RangeError(`${label} deve ser positivo e finito.`);
  }
  return number;
}

function positiveInteger(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) {
    throw new RangeError(`${label} deve ser inteiro positivo.`);
  }
  return number;
}

function finiteNonNegativeOrInfinity(value) {
  if (value === Infinity) return Infinity;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new RangeError("maxDistance deve ser não negativo ou Infinity.");
  }
  return number;
}
