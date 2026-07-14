import * as THREE from "three";
import { InstanceBatchIndex } from "./InstanceBatchIndex.js";

export class InstanceBatch {
  #boundsDirty = true;
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
  get boundsDirty() { return this.#boundsDirty; }
  has(objectId) { return this.index.has(objectId); }

  add(objectId, matrix, attributes = {}) {
    if (this.size >= this.capacity) throw new RangeError(`Lote ${this.key} sem capacidade: ${this.capacity}.`);
    const index = this.index.allocate(objectId);
    this.mesh.setMatrixAt(index, normalizeMatrix(matrix));
    this.mesh.count = Math.max(this.mesh.count, index + 1);
    this.mesh.instanceMatrix.needsUpdate = true;

    if (attributes.color !== undefined) {
      this.setColorAt(index, attributes.color);
    }

    this.#boundsDirty = true;
    return index;
  }

  update(objectId, matrix) {
    const index = this.index.indexOf(objectId);
    if (index < 0) return false;
    this.mesh.setMatrixAt(index, normalizeMatrix(matrix));
    this.mesh.instanceMatrix.needsUpdate = true;
    this.#boundsDirty = true;
    return true;
  }

  updateAttributes(objectId, attributes = {}) {
    const index = this.index.indexOf(objectId);
    if (index < 0) return false;

    if (attributes.color !== undefined) {
      this.setColorAt(index, attributes.color);
    }

    return true;
  }

  setColorAt(index, color) {
    if (!Number.isInteger(index) || index < 0 || index >= this.capacity) {
      throw new RangeError(`Índice de instância inválido: ${index}.`);
    }

    this.mesh.setColorAt(index, normalizeColor(color));
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor.needsUpdate = true;
    return true;
  }

  colorAt(objectId, target = new THREE.Color()) {
    const index = this.index.indexOf(objectId);
    if (index < 0 || !this.mesh.instanceColor) return null;
    this.mesh.getColorAt(index, target);
    return target;
  }

  remove(objectId) {
    const released = this.index.release(objectId);
    if (!released.removed) return released;
    this.mesh.setMatrixAt(released.index, new THREE.Matrix4().makeScale(0, 0, 0));
    this.mesh.instanceMatrix.needsUpdate = true;

    if (this.mesh.instanceColor) {
      this.setColorAt(released.index, 0xffffff);
    }
    this.#boundsDirty = true;
    return released;
  }

  flushBounds() {
    if (!this.#boundsDirty) return false;

    this.mesh.computeBoundingBox();
    this.mesh.computeBoundingSphere();
    this.#boundsDirty = false;

    return true;
  }

  objectAt(instanceId) { return this.index.objectAt(instanceId); }
  stats() {
    return Object.freeze({
      key: this.key,
      size: this.size,
      capacity: this.capacity,
      count: this.mesh.count,
      boundsDirty: this.#boundsDirty,
      hasInstanceColor: Boolean(this.mesh.instanceColor),
      colorBytes: this.mesh.instanceColor
        ? this.mesh.instanceColor.array.byteLength
        : 0,
      index: this.index.stats()
    });
  }

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


function normalizeColor(color) {
  if (color?.isColor) return color;

  if (
    Array.isArray(color) &&
    color.length === 3 &&
    color.every(value => Number.isFinite(Number(value)))
  ) {
    return new THREE.Color().setRGB(
      Number(color[0]),
      Number(color[1]),
      Number(color[2])
    );
  }

  return new THREE.Color(color ?? 0xffffff);
}
