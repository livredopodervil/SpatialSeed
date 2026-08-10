import * as THREE from "three";

const triangleSoupCache = new WeakMap();

export function geometryTriangleSoup(geometry) {
  if (geometry && triangleSoupCache.has(geometry)) {
    return triangleSoupCache.get(geometry);
  }
  const position = geometry?.getAttribute?.("position");
  if (!position || position.itemSize < 3) return Object.freeze([]);
  const index = geometry.index;
  const start = Math.max(0, Number(geometry.drawRange?.start ?? 0));
  const requested = Number(geometry.drawRange?.count ?? Infinity);
  const available = index ? index.count : position.count;
  const end = Math.min(
    available,
    Number.isFinite(requested) ? start + Math.max(0, requested) : available
  );
  const alignedEnd = start + Math.floor((end - start) / 3) * 3;
  const triangles = [];
  for (let offset = start; offset < alignedEnd; offset += 3) {
    for (let corner = 0; corner < 3; corner += 1) {
      const vertexIndex = index ? index.getX(offset + corner) : offset + corner;
      triangles.push(
        position.getX(vertexIndex),
        position.getY(vertexIndex),
        position.getZ(vertexIndex)
      );
    }
  }
  const frozen = Object.freeze(triangles);
  if (geometry && typeof geometry === "object") {
    triangleSoupCache.set(geometry, frozen);
  }
  return frozen;
}

export function gameCollisionShapeKind(object, { compound = false } = {}) {
  if (compound) return "triangle-mesh";
  const type = String(
    object?.geometry?.type ?? (object?.kind === "box" ? "box" : "")
  ).trim().toLowerCase();
  if (type === "box") return "local-box";
  if (type === "sphere" && isCompleteSphere(object?.geometry)) return "sphere";
  return "triangle-mesh";
}

export function worldSphereFromGeometry(geometry, worldMatrix) {
  if (!geometry) return null;
  if (!geometry.boundingSphere) geometry.computeBoundingSphere?.();
  const sphere = geometry.boundingSphere;
  if (!sphere || !worldMatrix?.isMatrix4) return null;
  const scales = matrixAxisScales(worldMatrix);
  if (!uniformScale(scales) || !orthogonalAxes(worldMatrix)) return null;
  return Object.freeze({
    center: Object.freeze(
      sphere.center.clone().applyMatrix4(worldMatrix).toArray()
    ),
    radius: Number(sphere.radius) * scales[0]
  });
}

export function freezeMeshPart(geometry, worldMatrix) {
  const triangles = geometryTriangleSoup(geometry);
  if (!triangles.length || !worldMatrix?.isMatrix4) return null;
  if (!geometry.boundingBox) geometry.computeBoundingBox?.();
  const localBounds = geometry.boundingBox;
  if (!localBounds || localBounds.isEmpty()) return null;
  const broadBounds = localBounds.clone().applyMatrix4(worldMatrix);
  return Object.freeze({
    triangles,
    worldMatrix: Object.freeze(worldMatrix.toArray()),
    broadBounds: Object.freeze({
      min: Object.freeze(broadBounds.min.toArray()),
      max: Object.freeze(broadBounds.max.toArray())
    })
  });
}

export function preferLocalBoxForGeometry(geometry) {
  const type = String(geometry?.type ?? "").toLowerCase();
  if (type === "boxgeometry") return true;
  if (type !== "cylindergeometry") return false;
  const parameters = geometry?.parameters ?? {};
  const radius = Math.max(
    Math.abs(Number(parameters.radiusTop ?? 0)),
    Math.abs(Number(parameters.radiusBottom ?? 0))
  );
  const height = Math.abs(Number(parameters.height ?? 0));
  return Number.isFinite(radius) && Number.isFinite(height) &&
    height > 1e-9 && radius * 2 <= height * 0.2;
}

function isCompleteSphere(descriptor = {}) {
  const phiLength = Number(descriptor?.phiLengthDeg ?? 360);
  const thetaStart = Number(descriptor?.thetaStartDeg ?? 0);
  const thetaLength = Number(descriptor?.thetaLengthDeg ?? 180);
  return Math.abs(phiLength - 360) <= 1e-7 &&
    Math.abs(thetaStart) <= 1e-7 &&
    Math.abs(thetaLength - 180) <= 1e-7;
}

function matrixAxisScales(matrix) {
  const e = matrix.elements;
  return [
    Math.hypot(e[0], e[1], e[2]),
    Math.hypot(e[4], e[5], e[6]),
    Math.hypot(e[8], e[9], e[10])
  ];
}

function uniformScale(scales) {
  const maximum = Math.max(...scales);
  const minimum = Math.min(...scales);
  return minimum > 1e-9 && maximum - minimum <= maximum * 1e-7;
}

function orthogonalAxes(matrix) {
  const e = matrix.elements;
  const axes = [
    new THREE.Vector3(e[0], e[1], e[2]).normalize(),
    new THREE.Vector3(e[4], e[5], e[6]).normalize(),
    new THREE.Vector3(e[8], e[9], e[10]).normalize()
  ];
  return Math.abs(axes[0].dot(axes[1])) <= 1e-7 &&
    Math.abs(axes[0].dot(axes[2])) <= 1e-7 &&
    Math.abs(axes[1].dot(axes[2])) <= 1e-7;
}
