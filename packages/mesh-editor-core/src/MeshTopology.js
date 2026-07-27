import * as THREE from "three";
import { topologyOf } from "./MeshTopologyOperations.js";

const EPSILON = 1e-12;

export function buildMeshTopology(descriptor = {}) {
  return topologyOf(descriptor);
}

export function geodesicVertexDistances({
  positions,
  topology,
  seeds,
  maxDistance = Infinity,
  worldMatrix = null
} = {}) {
  const points = normalizePositions(positions);
  const graph = topology ?? buildMeshTopology({ positions: points });
  const limit = Number(maxDistance);
  if (!(limit > 0) && limit !== Infinity) {
    throw new RangeError("maxDistance deve ser positivo ou Infinity.");
  }
  const world = worldMatrix
    ? normalizeMatrix4(worldMatrix)
    : new THREE.Matrix4();
  const worldPoints = points.map(point =>
    new THREE.Vector3().fromArray(point).applyMatrix4(world)
  );
  const distances = new Float64Array(points.length);
  distances.fill(Infinity);
  const queue = new MinHeap();
  const seedSet = normalizeIndices(seeds, points.length);
  for (const seed of seedSet) {
    distances[seed] = 0;
    queue.push({ index: seed, distance: 0 });
  }
  while (queue.size) {
    const current = queue.pop();
    if (current.distance !== distances[current.index]) continue;
    if (current.distance > limit) continue;
    for (const neighbor of graph.vertexNeighbors[current.index] ?? []) {
      const nextDistance = current.distance +
        worldPoints[current.index].distanceTo(worldPoints[neighbor]);
      if (nextDistance >= distances[neighbor] || nextDistance > limit) continue;
      distances[neighbor] = nextDistance;
      queue.push({ index: neighbor, distance: nextDistance });
    }
  }
  return distances;
}

export function closestPointOnSegment(point, start, end) {
  const p = normalizeVector3(point, "point");
  const a = normalizeVector3(start, "start");
  const b = normalizeVector3(end, "end");
  const direction = b.clone().sub(a);
  const lengthSquared = direction.lengthSq();
  const parameter = lengthSquared <= EPSILON
    ? 0
    : THREE.MathUtils.clamp(p.clone().sub(a).dot(direction) / lengthSquared, 0, 1);
  return Object.freeze({
    parameter,
    point: Object.freeze(a.addScaledVector(direction, parameter).toArray())
  });
}

function registerEdge(a, b, faceIndex, edgesByKey, vertexNeighbors) {
  const left = Math.min(a, b);
  const right = Math.max(a, b);
  const key = `${left}:${right}`;
  const edge = edgesByKey.get(key) ?? { a: left, b: right, faces: [] };
  edge.faces.push(faceIndex);
  edgesByKey.set(key, edge);
  vertexNeighbors[a].add(b);
  vertexNeighbors[b].add(a);
}

function normalizeTriangles(vertexCount, indices) {
  const values = Array.isArray(indices) || ArrayBuffer.isView(indices)
    ? Array.from(indices, Number)
    : [];
  if (values.length) {
    if (values.length % 3 !== 0) {
      throw new RangeError("indices deve conter triângulos completos.");
    }
    values.forEach(index => {
      if (!Number.isInteger(index) || index < 0 || index >= vertexCount) {
        throw new RangeError(`Índice de triângulo inválido: ${index}.`);
      }
    });
    const triangles = [];
    for (let offset = 0; offset < values.length; offset += 3) {
      triangles.push([values[offset], values[offset + 1], values[offset + 2]]);
    }
    return triangles;
  }
  if (vertexCount % 3 !== 0) {
    throw new RangeError(
      "Geometria não indexada deve possuir quantidade de vértices múltipla de 3."
    );
  }
  const triangles = [];
  for (let offset = 0; offset < vertexCount; offset += 3) {
    triangles.push([offset, offset + 1, offset + 2]);
  }
  return triangles;
}

function normalizePositions(positions) {
  if (!Array.isArray(positions)) throw new TypeError("positions deve ser array.");
  return positions.map((point, index) =>
    normalizeVector3(point, `positions[${index}]`).toArray()
  );
}

function normalizeIndices(indices, count) {
  const result = [...new Set(Array.from(indices ?? [], Number))];
  for (const index of result) {
    if (!Number.isInteger(index) || index < 0 || index >= count) {
      throw new RangeError(`Índice de vértice inválido: ${index}.`);
    }
  }
  return result;
}

function normalizeMatrix4(value) {
  if (value?.isMatrix4) return value.clone();
  if (!Array.isArray(value) || value.length !== 16) {
    throw new TypeError("worldMatrix deve conter 16 valores.");
  }
  const values = value.map(Number);
  if (!values.every(Number.isFinite)) {
    throw new TypeError("worldMatrix contém valor inválido.");
  }
  return new THREE.Matrix4().fromArray(values);
}

function normalizeVector3(value, label) {
  if (!Array.isArray(value) || value.length !== 3) {
    throw new TypeError(`${label} deve conter três valores.`);
  }
  const values = value.map(Number);
  if (!values.every(Number.isFinite)) {
    throw new TypeError(`${label} contém valor inválido.`);
  }
  return new THREE.Vector3().fromArray(values);
}

class MinHeap {
  #items = [];
  get size() { return this.#items.length; }
  push(value) {
    this.#items.push(value);
    let index = this.#items.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.#items[parent].distance <= value.distance) break;
      this.#items[index] = this.#items[parent];
      index = parent;
    }
    this.#items[index] = value;
  }
  pop() {
    const first = this.#items[0];
    const last = this.#items.pop();
    if (!this.#items.length) return first;
    let index = 0;
    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;
      if (left >= this.#items.length) break;
      let child = left;
      if (
        right < this.#items.length &&
        this.#items[right].distance < this.#items[left].distance
      ) child = right;
      if (this.#items[child].distance >= last.distance) break;
      this.#items[index] = this.#items[child];
      index = child;
    }
    this.#items[index] = last;
    return first;
  }
}
