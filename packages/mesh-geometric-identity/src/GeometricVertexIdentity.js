const DEFAULT_EPSILON = 1e-6;

export function buildGeometricVertexIdentity({
  positions,
  indices = [],
  vertexNeighbors = null,
  epsilon = DEFAULT_EPSILON
} = {}) {
  const points = normalizePositions(positions);
  const tolerance = Number(epsilon);
  if (!Number.isFinite(tolerance) || tolerance <= 0) {
    throw new RangeError("A tolerância geométrica deve ser positiva.");
  }
  const groups = groupCoincidentPoints(points, tolerance);
  const geometricIndexByVertex = new Int32Array(points.length);
  groups.forEach((group, geometricIndex) => {
    for (const vertexIndex of group) {
      geometricIndexByVertex[vertexIndex] = geometricIndex;
    }
  });
  const geometricPositions = groups.map(group => averagePoints(
    group.map(index => points[index])
  ));
  const renderNeighbors = normalizeNeighbors({
    vertexCount: points.length,
    indices,
    vertexNeighbors
  });
  const geometricNeighbors = groups.map(() => new Set());
  renderNeighbors.forEach((neighbors, vertexIndex) => {
    const from = geometricIndexByVertex[vertexIndex];
    for (const neighbor of neighbors) {
      const to = geometricIndexByVertex[neighbor];
      if (from === to) continue;
      geometricNeighbors[from].add(to);
      geometricNeighbors[to].add(from);
    }
  });
  return Object.freeze({
    epsilon: tolerance,
    renderVertexCount: points.length,
    geometricVertexCount: groups.length,
    groups: Object.freeze(groups.map(group => Object.freeze([...group]))),
    geometricIndexByVertex: Object.freeze(Array.from(geometricIndexByVertex)),
    positions: Object.freeze(
      geometricPositions.map(point => Object.freeze([...point]))
    ),
    vertexNeighbors: Object.freeze(
      geometricNeighbors.map(neighbors =>
        Object.freeze([...neighbors].sort((a, b) => a - b))
      )
    )
  });
}

export function geometricIndicesForVertices(identity, vertexIndices = []) {
  validateIdentity(identity);
  const result = new Set();
  for (const raw of vertexIndices) {
    const index = Number(raw);
    if (!Number.isInteger(index) || index < 0 ||
        index >= identity.renderVertexCount) {
      throw new RangeError(`Índice de renderização inválido: ${raw}.`);
    }
    result.add(identity.geometricIndexByVertex[index]);
  }
  return Object.freeze([...result].sort((a, b) => a - b));
}

export function renderVerticesForGeometricIndices(identity, indices = []) {
  validateIdentity(identity);
  const result = new Set();
  for (const raw of indices) {
    const index = Number(raw);
    if (!Number.isInteger(index) || index < 0 ||
        index >= identity.geometricVertexCount) {
      throw new RangeError(`Índice geométrico inválido: ${raw}.`);
    }
    for (const vertexIndex of identity.groups[index]) result.add(vertexIndex);
  }
  return Object.freeze([...result].sort((a, b) => a - b));
}

export function expandGeometricValues(identity, values, fallback = Infinity) {
  validateIdentity(identity);
  if (!values || Number(values.length) !== identity.geometricVertexCount) {
    throw new TypeError(
      "Os valores geométricos devem corresponder aos vértices geométricos."
    );
  }
  const expanded = new Float64Array(identity.renderVertexCount);
  for (let index = 0; index < identity.renderVertexCount; index += 1) {
    const value = Number(values[identity.geometricIndexByVertex[index]]);
    expanded[index] = Number.isFinite(value) ? value : fallback;
  }
  return expanded;
}

function groupCoincidentPoints(points, tolerance) {
  const parent = points.map((_, index) => index);
  const rank = points.map(() => 0);
  const buckets = new Map();
  const toleranceSquared = tolerance * tolerance;
  const find = index => {
    let root = index;
    while (parent[root] !== root) root = parent[root];
    while (parent[index] !== index) {
      const next = parent[index];
      parent[index] = root;
      index = next;
    }
    return root;
  };
  const unite = (left, right) => {
    let a = find(left);
    let b = find(right);
    if (a === b) return;
    if (rank[a] < rank[b]) [a, b] = [b, a];
    parent[b] = a;
    if (rank[a] === rank[b]) rank[a] += 1;
  };
  const cellOf = point => point.map(value => Math.floor(value / tolerance));
  const keyOf = cell => cell.join(":");

  points.forEach((point, index) => {
    const cell = cellOf(point);
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dz = -1; dz <= 1; dz += 1) {
          const candidates = buckets.get(keyOf([
            cell[0] + dx,
            cell[1] + dy,
            cell[2] + dz
          ])) ?? [];
          for (const candidate of candidates) {
            const other = points[candidate];
            const distanceSquared =
              (point[0] - other[0]) ** 2 +
              (point[1] - other[1]) ** 2 +
              (point[2] - other[2]) ** 2;
            if (distanceSquared <= toleranceSquared) unite(index, candidate);
          }
        }
      }
    }
    const key = keyOf(cell);
    const bucket = buckets.get(key) ?? [];
    bucket.push(index);
    buckets.set(key, bucket);
  });

  const grouped = new Map();
  points.forEach((_, index) => {
    const root = find(index);
    const group = grouped.get(root) ?? [];
    group.push(index);
    grouped.set(root, group);
  });
  return [...grouped.values()]
    .map(group => group.sort((a, b) => a - b))
    .sort((a, b) => a[0] - b[0]);
}

function normalizeNeighbors({ vertexCount, indices, vertexNeighbors }) {
  if (Array.isArray(vertexNeighbors) && vertexNeighbors.length === vertexCount) {
    return vertexNeighbors.map((neighbors, index) =>
      normalizeIndexList(neighbors, vertexCount, `vertexNeighbors[${index}]`)
    );
  }
  const result = Array.from({ length: vertexCount }, () => new Set());
  const triangles = Array.from(indices ?? [], Number);
  if (triangles.length % 3 !== 0) {
    throw new RangeError("indices deve conter triângulos completos.");
  }
  for (let offset = 0; offset < triangles.length; offset += 3) {
    const face = [triangles[offset], triangles[offset + 1], triangles[offset + 2]];
    face.forEach(index => validateIndex(index, vertexCount, "indices"));
    for (const [a, b] of [[face[0], face[1]], [face[1], face[2]], [face[2], face[0]]]) {
      result[a].add(b);
      result[b].add(a);
    }
  }
  return result.map(neighbors => [...neighbors]);
}

function normalizePositions(value) {
  if (!Array.isArray(value)) throw new TypeError("positions deve ser array.");
  return value.map((point, index) => {
    if (!Array.isArray(point) || point.length !== 3) {
      throw new TypeError(`positions[${index}] deve conter três valores.`);
    }
    const result = point.map(Number);
    if (!result.every(Number.isFinite)) {
      throw new TypeError(`positions[${index}] contém valor inválido.`);
    }
    return result;
  });
}

function normalizeIndexList(values, count, label) {
  return [...new Set(Array.from(values ?? [], Number))]
    .map(value => validateIndex(value, count, label))
    .sort((a, b) => a - b);
}

function validateIndex(value, count, label) {
  const index = Number(value);
  if (!Number.isInteger(index) || index < 0 || index >= count) {
    throw new RangeError(`${label} contém índice inválido: ${value}.`);
  }
  return index;
}

function averagePoints(points) {
  const sum = points.reduce(
    (result, point) => [
      result[0] + point[0],
      result[1] + point[1],
      result[2] + point[2]
    ],
    [0, 0, 0]
  );
  return sum.map(value => value / Math.max(1, points.length));
}

function validateIdentity(identity) {
  if (!identity || !Array.isArray(identity.groups) ||
      !Array.isArray(identity.geometricIndexByVertex)) {
    throw new TypeError("Identidade geométrica inválida.");
  }
}
