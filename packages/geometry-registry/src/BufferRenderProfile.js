const DEFAULT_EPSILON = 1e-6;

export function normalizeBufferRenderProfile(value = null) {
  if (value === null || value === undefined) return null;
  if (!value || typeof value !== "object") {
    throw new TypeError("renderProfile deve ser objeto.");
  }
  const topology = String(value.topology ?? "").trim().toLowerCase();
  const side = String(value.side ?? "").trim().toLowerCase();
  if (![
    "closed-solid",
    "open-surface"
  ].includes(topology)) {
    throw new RangeError(`Topologia de renderização inválida: ${value.topology}.`);
  }
  if (!["front", "double"].includes(side)) {
    throw new RangeError(`Lado de renderização inválido: ${value.side}.`);
  }
  return Object.freeze({ topology, side });
}

export function classifyBufferRenderProfile({
  positions = [],
  indices = [],
  epsilon = DEFAULT_EPSILON
} = {}) {
  const points = normalizePositions(positions);
  const triangles = Array.from(indices ?? [], Number);
  if (triangles.length % 3 !== 0) {
    throw new RangeError("indices deve conter triângulos completos.");
  }
  if (!points.length || !triangles.length) {
    return OPEN_SURFACE;
  }
  for (const index of triangles) {
    if (!Number.isInteger(index) || index < 0 || index >= points.length) {
      throw new RangeError(`Índice de face inválido: ${index}.`);
    }
  }

  const identity = groupCoincidentPositions(points, epsilon);
  const edgeUse = new Map();
  let faceCount = 0;
  let degenerateFaceCount = 0;

  for (let offset = 0; offset < triangles.length; offset += 3) {
    const face = [
      identity[triangles[offset]],
      identity[triangles[offset + 1]],
      identity[triangles[offset + 2]]
    ];
    if (new Set(face).size !== 3) {
      degenerateFaceCount += 1;
      continue;
    }
    faceCount += 1;
    for (const [a, b] of [
      [face[0], face[1]],
      [face[1], face[2]],
      [face[2], face[0]]
    ]) {
      const left = Math.min(a, b);
      const right = Math.max(a, b);
      const key = `${left}:${right}`;
      edgeUse.set(key, (edgeUse.get(key) ?? 0) + 1);
    }
  }

  const closed = faceCount > 0 && degenerateFaceCount === 0 &&
    [...edgeUse.values()].every(count => count === 2);
  return closed ? CLOSED_SOLID : OPEN_SURFACE;
}

const CLOSED_SOLID = Object.freeze({
  topology: "closed-solid",
  side: "front"
});
const OPEN_SURFACE = Object.freeze({
  topology: "open-surface",
  side: "double"
});

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

function groupCoincidentPositions(points, epsilon) {
  const tolerance = Number(epsilon);
  if (!Number.isFinite(tolerance) || tolerance <= 0) {
    throw new RangeError("epsilon deve ser positivo.");
  }
  const parent = points.map((_, index) => index);
  const rank = points.map(() => 0);
  const buckets = new Map();
  const toleranceSquared = tolerance * tolerance;

  const find = value => {
    let root = value;
    while (parent[root] !== root) root = parent[root];
    while (parent[value] !== value) {
      const next = parent[value];
      parent[value] = root;
      value = next;
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

  const roots = new Map();
  const result = new Int32Array(points.length);
  points.forEach((_, index) => {
    const root = find(index);
    if (!roots.has(root)) roots.set(root, roots.size);
    result[index] = roots.get(root);
  });
  return result;
}
