const BINARY_HEADER_BYTES = 80;
const BINARY_COUNT_BYTES = 4;
const BINARY_FACET_BYTES = 50;
const EPSILON = 1e-12;

export const STL_MESH_FORMAT = Object.freeze({
  id: "stl",
  label: "STL (Stereolithography)",
  extensions: Object.freeze([".stl"]),
  mediaType: "model/stl",
  import: true,
  export: true,
  binary: true
});

export function decodeStl(data, {
  scale = 1,
  mergeVertices = true,
  mergeTolerance = null
} = {}) {
  const bytes = toUint8Array(data);
  const unitScale = positiveFinite(scale, "scale");
  const parsed = looksBinaryStl(bytes)
    ? parseBinaryStl(bytes, unitScale)
    : parseAsciiStl(bytes, unitScale);
  const indexed = mergeVertices
    ? indexTriangleSoup(parsed.positions, { tolerance: mergeTolerance })
    : unindexedTriangleSoup(parsed.positions);
  return Object.freeze({
    format: "stl",
    encoding: parsed.encoding,
    triangleCount: indexed.indices.length / 3,
    sourceVertexCount: parsed.positions.length,
    mergedVertexCount: indexed.positions.length,
    geometry: Object.freeze({
      type: "buffer",
      positions: Object.freeze(indexed.positions.map(point => Object.freeze(point))),
      indices: Object.freeze(indexed.indices),
      normals: Object.freeze([]),
      uvs: Object.freeze([]),
      edges: Object.freeze([])
    })
  });
}

export function encodeBinaryStl(meshes, { header = "SpatialSeed STL" } = {}) {
  const facets = normalizedFacetMeshes(meshes);
  const count = facets.reduce((sum, mesh) => sum + mesh.triangles.length / 9, 0);
  if (count > 0xffffffff) throw new RangeError("STL excede o limite de facetas binárias.");
  const buffer = new ArrayBuffer(BINARY_HEADER_BYTES + BINARY_COUNT_BYTES + count * BINARY_FACET_BYTES);
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const headerBytes = new TextEncoder().encode(String(header ?? "SpatialSeed STL"));
  bytes.set(headerBytes.subarray(0, BINARY_HEADER_BYTES), 0);
  view.setUint32(BINARY_HEADER_BYTES, count, true);
  let offset = BINARY_HEADER_BYTES + BINARY_COUNT_BYTES;
  for (const mesh of facets) {
    const triangles = mesh.triangles;
    for (let index = 0; index < triangles.length; index += 9) {
      const a = triangles.slice(index, index + 3);
      const b = triangles.slice(index + 3, index + 6);
      const c = triangles.slice(index + 6, index + 9);
      const normal = triangleNormal(a, b, c);
      for (const value of normal) {
        view.setFloat32(offset, value, true);
        offset += 4;
      }
      for (const point of [a, b, c]) {
        for (const value of point) {
          view.setFloat32(offset, value, true);
          offset += 4;
        }
      }
      view.setUint16(offset, 0, true);
      offset += 2;
    }
  }
  return buffer;
}

export function encodeAsciiStl(meshes, { name = "SpatialSeed" } = {}) {
  const facets = normalizedFacetMeshes(meshes);
  const lines = [`solid ${sanitizeSolidName(name)}`];
  for (const mesh of facets) {
    const triangles = mesh.triangles;
    for (let index = 0; index < triangles.length; index += 9) {
      const a = triangles.slice(index, index + 3);
      const b = triangles.slice(index + 3, index + 6);
      const c = triangles.slice(index + 6, index + 9);
      const normal = triangleNormal(a, b, c);
      lines.push(`  facet normal ${fmt(normal[0])} ${fmt(normal[1])} ${fmt(normal[2])}`);
      lines.push("    outer loop");
      for (const point of [a, b, c]) {
        lines.push(`      vertex ${fmt(point[0])} ${fmt(point[1])} ${fmt(point[2])}`);
      }
      lines.push("    endloop", "  endfacet");
    }
  }
  lines.push(`endsolid ${sanitizeSolidName(name)}`);
  return `${lines.join("\n")}\n`;
}

export function stlPreparedPayload(meshes, {
  binary = true,
  filename = "selection.stl",
  name = "SpatialSeed"
} = {}) {
  const data = binary
    ? encodeBinaryStl(meshes, { header: name })
    : encodeAsciiStl(meshes, { name });
  const bytes = typeof data === "string"
    ? new TextEncoder().encode(data).byteLength
    : data.byteLength;
  return Object.freeze({
    prepared: true,
    format: "stl",
    filename: ensureExtension(filename, ".stl"),
    mediaType: "model/stl",
    binary: Boolean(binary),
    data,
    bytes
  });
}

function parseBinaryStl(bytes, scale) {
  if (bytes.byteLength < 84) throw new Error("STL binário incompleto.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = view.getUint32(80, true);
  const required = 84 + count * 50;
  if (required > bytes.byteLength) throw new Error("STL binário truncado.");
  const positions = [];
  let offset = 84;
  for (let facet = 0; facet < count; facet += 1) {
    offset += 12; // normal supplied by STL; SpatialSeed recomputes from topology.
    for (let vertex = 0; vertex < 3; vertex += 1) {
      positions.push([
        view.getFloat32(offset, true) * scale,
        view.getFloat32(offset + 4, true) * scale,
        view.getFloat32(offset + 8, true) * scale
      ]);
      offset += 12;
    }
    offset += 2;
  }
  return { encoding: "binary", positions };
}

function parseAsciiStl(bytes, scale) {
  const text = new TextDecoder().decode(bytes);
  const vertexPattern = /\bvertex\s+([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)\s+([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)\s+([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)/g;
  const positions = [];
  for (const match of text.matchAll(vertexPattern)) {
    positions.push([
      Number(match[1]) * scale,
      Number(match[2]) * scale,
      Number(match[3]) * scale
    ]);
  }
  if (!positions.length || positions.length % 3 !== 0) {
    throw new Error("STL ASCII sem triângulos válidos.");
  }
  return { encoding: "ascii", positions };
}

function looksBinaryStl(bytes) {
  if (bytes.byteLength < 84) return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = view.getUint32(80, true);
  const required = 84 + count * 50;
  if (required === bytes.byteLength) return true;
  const prefix = new TextDecoder().decode(bytes.subarray(0, Math.min(bytes.length, 256))).trimStart().toLowerCase();
  if (prefix.startsWith("solid") && /\bfacet\b/.test(prefix)) return false;
  return count > 0 && required <= bytes.byteLength;
}

function indexTriangleSoup(sourcePositions, { tolerance = null } = {}) {
  const positions = sourcePositions.map(point => point.map(Number));
  const bounds = pointBounds(positions);
  const diagonal = Math.hypot(
    bounds.max[0] - bounds.min[0],
    bounds.max[1] - bounds.min[1],
    bounds.max[2] - bounds.min[2]
  );
  const epsilon = tolerance === null || tolerance === undefined
    ? Math.max(EPSILON, diagonal * 1e-9)
    : nonNegativeFinite(tolerance, "mergeTolerance");
  if (epsilon <= EPSILON) return exactIndex(positions);
  const cells = new Map();
  const unique = [];
  const indices = [];
  for (const point of positions) {
    const cell = point.map(value => Math.round(value / epsilon));
    let resolved = null;
    for (let dx = -1; dx <= 1 && resolved === null; dx += 1) {
      for (let dy = -1; dy <= 1 && resolved === null; dy += 1) {
        for (let dz = -1; dz <= 1 && resolved === null; dz += 1) {
          const key = `${cell[0] + dx}:${cell[1] + dy}:${cell[2] + dz}`;
          for (const candidate of cells.get(key) ?? []) {
            if (distanceSquared(unique[candidate], point) <= epsilon * epsilon) {
              resolved = candidate;
              break;
            }
          }
        }
      }
    }
    if (resolved === null) {
      resolved = unique.length;
      unique.push([...point]);
      const key = cell.join(":");
      const bucket = cells.get(key) ?? [];
      bucket.push(resolved);
      cells.set(key, bucket);
    }
    indices.push(resolved);
  }
  return { positions: unique, indices };
}

function exactIndex(positions) {
  const keys = new Map();
  const unique = [];
  const indices = positions.map(point => {
    const key = point.map(value => Object.is(value, -0) ? 0 : value).join(":");
    if (keys.has(key)) return keys.get(key);
    const index = unique.length;
    unique.push([...point]);
    keys.set(key, index);
    return index;
  });
  return { positions: unique, indices };
}

function unindexedTriangleSoup(positions) {
  return {
    positions: positions.map(point => [...point]),
    indices: positions.map((_, index) => index)
  };
}

function normalizedFacetMeshes(meshes) {
  if (!Array.isArray(meshes) || !meshes.length) {
    throw new Error("Exportação STL exige ao menos uma malha.");
  }
  return meshes.map((mesh, meshIndex) => {
    const triangles = Array.from(mesh?.triangles ?? [], Number);
    if (!triangles.length || triangles.length % 9 !== 0 || !triangles.every(Number.isFinite)) {
      throw new TypeError(`Malha ${meshIndex + 1} não contém triângulos válidos.`);
    }
    return { triangles };
  });
}

function triangleNormal(a, b, c) {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const cross = [
    ab[1] * ac[2] - ab[2] * ac[1],
    ab[2] * ac[0] - ab[0] * ac[2],
    ab[0] * ac[1] - ab[1] * ac[0]
  ];
  const length = Math.hypot(...cross);
  return length <= EPSILON ? [0, 0, 0] : cross.map(value => value / length);
}

function pointBounds(points) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const point of points) {
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis], point[axis]);
      max[axis] = Math.max(max[axis], point[axis]);
    }
  }
  return { min, max };
}

function distanceSquared(a, b) {
  return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
}

function toUint8Array(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  if (typeof value === "string") return new TextEncoder().encode(value);
  throw new TypeError("Dados STL devem ser ArrayBuffer, TypedArray ou texto ASCII.");
}

function ensureExtension(filename, extension) {
  const name = String(filename ?? "selection.stl").trim() || "selection.stl";
  return name.toLowerCase().endsWith(extension) ? name : `${name}${extension}`;
}

function sanitizeSolidName(value) {
  return String(value ?? "SpatialSeed").replace(/[\r\n]+/g, " ").trim() || "SpatialSeed";
}

function fmt(value) {
  return Number(value).toPrecision(9).replace(/(?:\.0+|(?:(\.\d*?)0+))(?=e|$)/, "$1");
}

function positiveFinite(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new RangeError(`${label} deve ser positivo.`);
  return number;
}

function nonNegativeFinite(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new RangeError(`${label} deve ser não negativo.`);
  return number;
}
