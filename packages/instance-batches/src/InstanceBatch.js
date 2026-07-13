import * as THREE from "three";
import { InstanceBatchIndex } from "./InstanceBatchIndex.js";

export class InstanceBatch {
  constructor({ key, geometry, material, capacity = 64 }) {
    if (!geometry) throw new TypeError("InstanceBatch exige geometry.");
    if (!material) throw new TypeError("InstanceBatch exige material.");
    this.key = String(key);
    this.geometry = geometry;
    this.material = material;
    this.capacity = normalizeCapacity(capacity);
    this.index = new InstanceBatchIndex();
    this.mesh = new THREE.InstancedMesh(geometry, material, this.capacity);
    this.mesh.count = 0;
    this.mesh.userData.batchKey = this.key;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  }

  get size() { return this.index.size; }
  has(objectId) { return this.index.has(objectId); }

  add(objectId, matrix) {
    if (this.size >= this.capacity) throw new RangeError(`Lote ${this.key} sem capacidade: ${this.capacity}.`);
    const index = this.index.allocate(objectId);
    this.mesh.setMatrixAt(index, normalizeMatrix(matrix));
    this.mesh.count = Math.max(this.mesh.count, index + 1);
    this.mesh.instanceMatrix.needsUpdate = true;
    return index;
  }

  update(objectId, matrix) {
    const index = this.index.indexOf(objectId);
    if (index < 0) return false;
    this.mesh.setMatrixAt(index, normalizeMatrix(matrix));
    this.mesh.instanceMatrix.needsUpdate = true;
    return true;
  }

  remove(objectId) {
    const released = this.index.release(objectId);
    if (!released.removed) return released;
    this.mesh.setMatrixAt(released.index, new THREE.Matrix4().makeScale(0, 0, 0));
    this.mesh.instanceMatrix.needsUpdate = true;
    return released;
  }

  objectAt(instanceId) { return this.index.objectAt(instanceId); }
  stats() { return Object.freeze({ key: this.key, size: this.size, capacity: this.capacity, count: this.mesh.count, index: this.index.stats() }); }

  dispose({ disposeGeometry = false, disposeMaterial = false } = {}) {
    this.index.clear();
    if (disposeGeometry) this.geometry.dispose?.();
    if (disposeMaterial) this.material.dispose?.();
    this.mesh.dispose?.();
  }
}

function normalizeCapacity(value) {
  const capacity = Number(value);
  if (!Number.isInteger(capacity) || capacity < 1) throw new RangeError("capacity deve ser inteiro positivo.");
  return capacity;
}

function normalizeMatrix(matrix) {
  if (matrix?.isMatrix4) return matrix;
  if (Array.isArray(matrix) && matrix.length === 16) return new THREE.Matrix4().fromArray(matrix);
  throw new TypeError("matrix deve ser THREE.Matrix4 ou array de 16 valores.");
}
