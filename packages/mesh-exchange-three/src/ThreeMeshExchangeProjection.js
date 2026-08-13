import * as THREE from "three";

export function createThreeMeshTriangulator({ geometryRegistry } = {}) {
  if (!geometryRegistry?.describeLegacyObject || !geometryRegistry?.create) {
    throw new TypeError("Triangulador STL exige GeometryRegistry.");
  }
  return (object, worldMatrix) => objectTriangleSoup({
    object,
    worldMatrix,
    geometryRegistry
  });
}

export function objectTriangleSoup({ object, worldMatrix, geometryRegistry } = {}) {
  const descriptor = geometryRegistry.describeLegacyObject(object);
  const geometry = geometryRegistry.create(descriptor);
  try {
    const position = geometry.getAttribute?.("position");
    if (!position || position.itemSize < 3) {
      throw new Error(`Objeto sem superfície triangular exportável: ${object?.id ?? "(sem id)"}.`);
    }
    const matrix = new THREE.Matrix4().fromArray(normalizeMatrix(worldMatrix));
    const mirrored = matrix.determinant() < 0;
    const index = geometry.index;
    const available = index ? index.count : position.count;
    const start = Math.max(0, Number(geometry.drawRange?.start ?? 0));
    const requested = Number(geometry.drawRange?.count ?? Infinity);
    const end = Math.min(
      available,
      Number.isFinite(requested) ? start + Math.max(0, requested) : available
    );
    const alignedEnd = start + Math.floor((end - start) / 3) * 3;
    const triangles = [];
    const point = new THREE.Vector3();
    for (let offset = start; offset < alignedEnd; offset += 3) {
      const order = mirrored ? [0, 2, 1] : [0, 1, 2];
      for (const corner of order) {
        const vertexIndex = index ? index.getX(offset + corner) : offset + corner;
        point.fromBufferAttribute(position, vertexIndex).applyMatrix4(matrix);
        triangles.push(point.x, point.y, point.z);
      }
    }
    if (!triangles.length) {
      throw new Error(`Objeto sem triângulos exportáveis: ${object?.id ?? "(sem id)"}.`);
    }
    return Object.freeze(triangles);
  } finally {
    geometry.dispose?.();
  }
}

function normalizeMatrix(value) {
  if (!Array.isArray(value) || value.length !== 16) {
    throw new TypeError("worldMatrix deve conter 16 valores.");
  }
  const matrix = value.map(Number);
  if (!matrix.every(Number.isFinite)) throw new TypeError("worldMatrix contém valor inválido.");
  return matrix;
}
