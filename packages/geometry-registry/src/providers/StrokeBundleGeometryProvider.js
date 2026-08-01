import * as THREE from "three";
import {
  normalizeStrokeBundleDescriptor,
  strokeBundleStrokes
} from "../../../stroke-resources/src/index.js?build=20260801-0045a";
import {
  TubeGeometryProvider
} from "./TubeGeometryProvider.js?build=20260731-0044a";

export const StrokeBundleGeometryProvider = Object.freeze({
  type: "stroke-bundle",
  topology: "open-surface",
  label: "Conjunto compacto de traços",
  parameters: Object.freeze([
    Object.freeze({
      id: "strokes",
      label: "Traços compactados",
      type: "json",
      default: [{
        id: "stroke-1",
        points: [[0, 0, 0], [1, 0, 0]],
        radius: 0.04,
        radialSegments: 6,
        tubularSegments: 2,
        closed: false,
        curveType: "polyline",
        tension: 0.5
      }]
    })
  ]),

  normalize(input = {}) {
    return normalizeStrokeBundleDescriptor(input);
  },

  create(descriptor) {
    const bundle = normalizeStrokeBundleDescriptor(descriptor);
    const strokes = strokeBundleStrokes(bundle);
    const parts = strokes.map(stroke =>
      TubeGeometryProvider.create({
        type: "tube",
        points: stroke.points,
        tubularSegments: stroke.tubularSegments,
        radius: stroke.radius,
        radialSegments: stroke.radialSegments,
        closed: stroke.closed,
        curveType: stroke.curveType,
        tension: stroke.tension
      })
    );
    try {
      const geometry = mergeBufferGeometries(parts);
      geometry.userData.strokeBundle = Object.freeze({
        strokeIds: Object.freeze(strokes.map(stroke => stroke.id)),
        strokeCount: bundle.strokeCount,
        pointCount: bundle.pointCount,
        chunkCount: bundle.chunks.length,
        chunks: Object.freeze(bundle.chunks.map(chunk => Object.freeze({
          id: chunk.id,
          strokeCount: chunk.strokeCount,
          pointCount: chunk.pointCount,
          estimatedBytes: chunk.estimatedBytes
        })))
      });
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      return geometry;
    } finally {
      for (const part of parts) part.dispose();
    }
  }
});

function mergeBufferGeometries(geometries) {
  if (!geometries.length) return new THREE.BufferGeometry();
  const names = Object.keys(geometries[0].attributes).sort();
  for (const geometry of geometries) {
    const current = Object.keys(geometry.attributes).sort();
    if (JSON.stringify(current) !== JSON.stringify(names)) {
      throw new Error("Traços incompatíveis para fusão geométrica.");
    }
  }
  const result = new THREE.BufferGeometry();
  const vertexOffsets = [];
  let vertexCount = 0;
  for (const geometry of geometries) {
    vertexOffsets.push(vertexCount);
    vertexCount += geometry.getAttribute("position").count;
  }

  for (const name of names) {
    const sample = geometries[0].getAttribute(name);
    const ArrayType = sample.array.constructor;
    const length = geometries.reduce(
      (total, geometry) => total + geometry.getAttribute(name).array.length,
      0
    );
    const merged = new ArrayType(length);
    let offset = 0;
    for (const geometry of geometries) {
      const attribute = geometry.getAttribute(name);
      if (attribute.itemSize !== sample.itemSize ||
          attribute.normalized !== sample.normalized ||
          attribute.array.constructor !== ArrayType) {
        throw new Error(`Atributo incompatível na fusão: ${name}.`);
      }
      merged.set(attribute.array, offset);
      offset += attribute.array.length;
    }
    result.setAttribute(
      name,
      new THREE.BufferAttribute(merged, sample.itemSize, sample.normalized)
    );
  }

  const indexed = geometries.every(geometry => Boolean(geometry.index));
  if (indexed) {
    const totalIndices = geometries.reduce(
      (total, geometry) => total + geometry.index.count,
      0
    );
    const IndexType = vertexCount > 65535 ? Uint32Array : Uint16Array;
    const indices = new IndexType(totalIndices);
    let offset = 0;
    geometries.forEach((geometry, geometryIndex) => {
      const vertexOffset = vertexOffsets[geometryIndex];
      for (let index = 0; index < geometry.index.count; index += 1) {
        indices[offset++] = geometry.index.getX(index) + vertexOffset;
      }
    });
    result.setIndex(new THREE.BufferAttribute(indices, 1));
  } else if (geometries.some(geometry => Boolean(geometry.index))) {
    throw new Error("Traços indexados e não indexados não podem ser fundidos.");
  }
  return result;
}
