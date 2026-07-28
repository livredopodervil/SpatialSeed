import * as THREE from "three";

export function bufferDescriptorFromGeometry(geometry) {
  const position = geometry?.getAttribute?.("position");
  if (!position) {
    throw new Error("A geometria de referência não possui atributo position.");
  }
  const positions = [];
  for (let index = 0; index < position.count; index += 1) {
    positions.push([
      position.getX(index),
      position.getY(index),
      position.getZ(index)
    ]);
  }
  const normal = geometry.getAttribute("normal");
  const normals = [];
  if (normal) {
    for (let index = 0; index < normal.count; index += 1) {
      normals.push([
        normal.getX(index),
        normal.getY(index),
        normal.getZ(index)
      ]);
    }
  }
  const uv = geometry.getAttribute("uv");
  const uvs = [];
  if (uv) {
    for (let index = 0; index < uv.count; index += 1) {
      uvs.push([uv.getX(index), uv.getY(index)]);
    }
  }
  return Object.freeze({
    type: "buffer",
    positions: Object.freeze(positions.map(point => Object.freeze(point))),
    indices: Object.freeze(
      geometry.index
        ? Array.from(geometry.index.array)
        : Array.from({ length: position.count }, (_, index) => index)
    ),
    normals: Object.freeze(normals.map(point => Object.freeze(point))),
    uvs: Object.freeze(uvs.map(point => Object.freeze(point))),
    edges: Object.freeze([])
  });
}

export function transformPoints(points, matrixArray) {
  const matrix = new THREE.Matrix4().fromArray(matrixArray);
  return points.map(point =>
    Object.freeze(new THREE.Vector3().fromArray(point).applyMatrix4(matrix).toArray())
  );
}

export function localizedPoints(points) {
  const normalized = normalizePointList(points, 2, "caminho");
  const origin = [...normalized[0]];
  return Object.freeze({
    origin: Object.freeze(origin),
    points: Object.freeze(normalized.map(point => Object.freeze([
      point[0] - origin[0],
      point[1] - origin[1],
      point[2] - origin[2]
    ])))
  });
}

export function normalizePointList(points, minimum = 2, name = "pontos") {
  if (!Array.isArray(points) || points.length < minimum) {
    throw new RangeError(`${name} exige ao menos ${minimum} pontos.`);
  }
  const result = points.map((point, index) => {
    if (!Array.isArray(point) || point.length !== 3) {
      throw new TypeError(`${name}[${index}] deve conter x, y e z.`);
    }
    const values = point.map(Number);
    if (!values.every(Number.isFinite)) {
      throw new TypeError(`${name}[${index}] contém valor inválido.`);
    }
    return values;
  });
  return removeConsecutiveDuplicates(result);
}

export function removeConsecutiveDuplicates(points, epsilon = 1e-9) {
  const result = [];
  for (const point of points) {
    const previous = result.at(-1);
    if (!previous || distanceSquared(previous, point) > epsilon * epsilon) {
      result.push([...point]);
    }
  }
  if (result.length > 2 &&
      distanceSquared(result[0], result.at(-1)) <= epsilon * epsilon) {
    result[result.length - 1] = [...result[0]];
  }
  return result;
}

export function orderEdgeChain(edges, { allowLoop = true } = {}) {
  if (!Array.isArray(edges) || !edges.length) {
    throw new Error("O caminho não contém arestas.");
  }
  const adjacency = new Map();
  const unique = new Map();
  for (const edge of edges) {
    const a = Number(edge?.a ?? edge?.[0]);
    const b = Number(edge?.b ?? edge?.[1]);
    if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0 || a === b) {
      throw new TypeError("Aresta de caminho inválida.");
    }
    const key = a < b ? `${a}:${b}` : `${b}:${a}`;
    if (unique.has(key)) continue;
    unique.set(key, [a, b]);
    for (const [left, right] of [[a, b], [b, a]]) {
      const neighbors = adjacency.get(left) ?? [];
      neighbors.push(right);
      adjacency.set(left, neighbors);
    }
  }
  for (const [vertex, neighbors] of adjacency) {
    if (neighbors.length > 2) {
      throw new Error(
        `O conjunto de arestas ramifica no vértice ${vertex}; escolha uma cadeia simples.`
      );
    }
  }
  const endpoints = [...adjacency]
    .filter(([, neighbors]) => neighbors.length === 1)
    .map(([vertex]) => vertex)
    .sort((a, b) => a - b);
  const closed = endpoints.length === 0;
  if (!closed && endpoints.length !== 2) {
    throw new Error("As arestas não formam uma cadeia conectada.");
  }
  if (closed && !allowLoop) {
    throw new Error("Esta ferramenta exige um caminho aberto.");
  }
  const start = closed
    ? Math.min(...adjacency.keys())
    : endpoints[0];
  const ordered = [start];
  const visitedEdges = new Set();
  let previous = null;
  let current = start;
  let guard = unique.size + 2;
  while (guard-- > 0) {
    const candidates = (adjacency.get(current) ?? [])
      .filter(next => next !== previous)
      .filter(next => {
        const key = current < next ? `${current}:${next}` : `${next}:${current}`;
        return !visitedEdges.has(key);
      })
      .sort((a, b) => a - b);
    if (!candidates.length) break;
    const next = candidates[0];
    const key = current < next ? `${current}:${next}` : `${next}:${current}`;
    visitedEdges.add(key);
    ordered.push(next);
    previous = current;
    current = next;
    if (closed && current === start) break;
  }
  if (visitedEdges.size !== unique.size) {
    throw new Error("As arestas não formam uma única cadeia conectada.");
  }
  return Object.freeze({
    indices: Object.freeze(ordered),
    closed
  });
}

export function projectPlanarProfile(points, {
  toleranceRelative = 1e-5
} = {}) {
  const normalized = normalizePointList(points, 3, "perfil");
  const ring = stripRepeatedEndpoint(normalized);
  const centroid = averagePoint(ring);
  const normal = newellNormal(ring);
  if (normal.lengthSq() < 1e-18) {
    throw new Error("O contorno do perfil é degenerado.");
  }
  normal.normalize();
  let xAxis = null;
  for (let index = 0; index < ring.length; index += 1) {
    const edge = new THREE.Vector3()
      .fromArray(ring[(index + 1) % ring.length])
      .sub(new THREE.Vector3().fromArray(ring[index]));
    edge.addScaledVector(normal, -edge.dot(normal));
    if (edge.lengthSq() > 1e-16) {
      xAxis = edge.normalize();
      break;
    }
  }
  if (!xAxis) throw new Error("Não foi possível definir o eixo do perfil.");
  const yAxis = normal.clone().cross(xAxis).normalize();
  const centerVector = new THREE.Vector3().fromArray(centroid);
  const projected = ring.map(point => {
    const delta = new THREE.Vector3().fromArray(point).sub(centerVector);
    return [delta.dot(xAxis), delta.dot(yAxis)];
  });
  const diagonal = boundingDiagonal(ring);
  const tolerance = Math.max(1e-7, diagonal * toleranceRelative);
  const maxDeviation = Math.max(...ring.map(point => Math.abs(
    new THREE.Vector3().fromArray(point).sub(centerVector).dot(normal)
  )));
  if (maxDeviation > tolerance) {
    throw new Error(
      `O perfil não é planar: desvio ${maxDeviation.toPrecision(4)}; tolerância ${tolerance.toPrecision(4)}.`
    );
  }
  if (signedArea2(projected) < 0) projected.reverse();
  const basis = new THREE.Matrix4().makeBasis(xAxis, yAxis, normal);
  const quaternion = new THREE.Quaternion().setFromRotationMatrix(basis);
  return Object.freeze({
    points: Object.freeze(projected.map(point => Object.freeze(point))),
    origin: Object.freeze(centroid),
    xAxis: Object.freeze(xAxis.toArray()),
    yAxis: Object.freeze(yAxis.toArray()),
    normal: Object.freeze(normal.toArray()),
    quaternion: Object.freeze(quaternion.toArray()),
    maxDeviation,
    tolerance
  });
}

export function stripRepeatedEndpoint(points, epsilon = 1e-9) {
  const result = points.map(point => [...point]);
  if (result.length > 2 &&
      distanceSquared(result[0], result.at(-1)) <= epsilon * epsilon) {
    result.pop();
  }
  return result;
}

function averagePoint(points) {
  const sum = points.reduce((accumulator, point) => [
    accumulator[0] + point[0],
    accumulator[1] + point[1],
    accumulator[2] + point[2]
  ], [0, 0, 0]);
  return sum.map(value => value / points.length);
}

function newellNormal(points) {
  const normal = new THREE.Vector3();
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    normal.x += (current[1] - next[1]) * (current[2] + next[2]);
    normal.y += (current[2] - next[2]) * (current[0] + next[0]);
    normal.z += (current[0] - next[0]) * (current[1] + next[1]);
  }
  return normal;
}

function boundingDiagonal(points) {
  const box = new THREE.Box3();
  for (const point of points) box.expandByPoint(new THREE.Vector3().fromArray(point));
  return box.getSize(new THREE.Vector3()).length();
}

function signedArea2(points) {
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const [x1, y1] = points[index];
    const [x2, y2] = points[(index + 1) % points.length];
    area += x1 * y2 - x2 * y1;
  }
  return area * 0.5;
}

function distanceSquared(left, right) {
  return (
    (left[0] - right[0]) ** 2 +
    (left[1] - right[1]) ** 2 +
    (left[2] - right[2]) ** 2
  );
}
