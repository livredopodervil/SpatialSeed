import * as THREE from "three";

const MIRROR_X = new THREE.Matrix4().makeScale(-1, 1, 1);

/**
 * Converts a geometry resource to its X-mirrored representation while fixing
 * triangle winding. This is used to avoid negative instance matrices, which
 * THREE.InstancedMesh does not support.
 */
export function mirrorGeometryXInPlace(geometry) {
  if (!geometry?.isBufferGeometry) return geometry;
  geometry.applyMatrix4(MIRROR_X);
  const index = geometry.getIndex?.();
  if (index?.array) {
    const array = index.array;
    for (let offset = 0; offset + 2 < array.length; offset += 3) {
      const value = array[offset + 1];
      array[offset + 1] = array[offset + 2];
      array[offset + 2] = value;
    }
    index.needsUpdate = true;
  } else {
    reverseNonIndexedTriangles(geometry.attributes);
    for (const attributes of Object.values(geometry.morphAttributes ?? {})) {
      reverseNonIndexedTriangles(attributes);
    }
  }
  flipTangentHandedness(geometry.getAttribute?.("tangent"));
  for (const tangent of geometry.morphAttributes?.tangent ?? []) {
    flipTangentHandedness(tangent);
  }
  geometry.computeBoundingBox?.();
  geometry.computeBoundingSphere?.();
  return geometry;
}

export function positiveInstanceMatrixForMirror(matrix) {
  if (!matrix?.isMatrix4) {
    throw new TypeError("Espelho exige THREE.Matrix4.");
  }
  return matrix.determinant() < 0
    ? matrix.clone().multiply(MIRROR_X)
    : matrix.clone();
}

function reverseNonIndexedTriangles(attributes) {
  for (const attribute of Object.values(attributes ?? {})) {
    if (!attribute?.array || attribute.isInterleavedBufferAttribute) continue;
    const itemSize = Number(attribute.itemSize);
    if (!Number.isInteger(itemSize) || itemSize < 1) continue;
    const array = attribute.array;
    const triangleStride = itemSize * 3;
    for (let offset = 0; offset + triangleStride <= array.length;
         offset += triangleStride) {
      for (let component = 0; component < itemSize; component += 1) {
        const left = offset + itemSize + component;
        const right = offset + itemSize * 2 + component;
        const value = array[left];
        array[left] = array[right];
        array[right] = value;
      }
    }
    attribute.needsUpdate = true;
  }
}

function flipTangentHandedness(attribute) {
  if (!attribute || Number(attribute.itemSize) < 4) return;
  for (let index = 0; index < attribute.count; index += 1) {
    attribute.setW(index, -attribute.getW(index));
  }
  attribute.needsUpdate = true;
}
