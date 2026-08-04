const DEFAULT_EPSILON = 1e-8;
const ZERO_NORMAL = Object.freeze([0, 0, 0]);

export const MESH_NORMAL_POLICIES = Object.freeze([
  "preserve",
  "recompute-local",
  "recompute-all"
]);

export function normalizeMeshNormalPolicy(value = "preserve") {
  const normalized = String(value ?? "preserve").trim().toLowerCase();
  if (!MESH_NORMAL_POLICIES.includes(normalized)) {
    throw new RangeError(`Política de normais desconhecida: ${value}.`);
  }
  return normalized;
}

export function classifyMeshDescriptorChange({
  before,
  after,
  epsilon = DEFAULT_EPSILON
} = {}) {
  const source = normalizeDescriptorShape(before);
  const target = normalizeDescriptorShape(after);
  const changedVertexIndices = changedPointIndices(
    source.positions,
    target.positions,
    epsilon
  );
  const positionsChanged = changedVertexIndices.length > 0 ||
    source.positions.length !== target.positions.length;
  const indicesChanged = !integerArraysEqual(source.indices, target.indices);
  const edgesChanged = !nestedIntegerArraysEqual(source.edges, target.edges);
  const topologyChanged = (
    positionsChanged && source.positions.length !== target.positions.length
  ) || indicesChanged || edgesChanged;
  const uvsChanged = !nestedNumericArraysNear(source.uvs, target.uvs, epsilon);
  const normalsChanged = !nestedNumericArraysNear(
    source.normals,
    target.normals,
    epsilon
  );
  const changed = positionsChanged || topologyChanged || uvsChanged ||
    normalsChanged;
  const kind = !changed
    ? "none"
    : topologyChanged
      ? "topology"
      : positionsChanged
        ? "positions"
        : "attributes";

  return Object.freeze({
    changed,
    kind,
    positionsChanged,
    topologyChanged,
    indicesChanged,
    edgesChanged,
    uvsChanged,
    normalsChanged,
    changedVertexIndices: Object.freeze(changedVertexIndices)
  });
}

export function prepareMeshCommitDescriptor({
  before,
  after,
  autoNormals = true,
  normalPolicy = "preserve",
  epsilon = DEFAULT_EPSILON
} = {}) {
  const source = normalizeDescriptorShape(before);
  const target = normalizeDescriptorShape(after);
  const change = classifyMeshDescriptorChange({
    before: source,
    after: target,
    epsilon
  });
  if (!change.changed) {
    return Object.freeze({
      changed: false,
      descriptor: freezeDescriptor(source),
      change
    });
  }

  const policy = normalizeMeshNormalPolicy(normalPolicy);
  let normals = target.normals.map(point => [...point]);

  if (autoNormals) {
    const targetHasNormals = target.normals.length === target.positions.length;
    const sourceFitsTarget = source.normals.length === target.positions.length;
    if (policy === "preserve") {
      if (targetHasNormals) {
        normals = target.normals.map(point => [...point]);
      } else if (!change.topologyChanged && sourceFitsTarget) {
        normals = source.normals.map(point => [...point]);
      } else {
        normals = [];
      }
    } else if (policy === "recompute-all") {
      normals = recomputeLocalVertexNormals({
        positions: target.positions,
        indices: target.indices,
        sourceNormals: sourceFitsTarget ? source.normals : target.normals,
        changedVertexIndices: target.positions.map((_, index) => index)
      });
    } else if (change.positionsChanged && !change.topologyChanged &&
        source.normals.length === source.positions.length &&
        source.indices.length === target.indices.length) {
      normals = recomputeLocalVertexNormals({
        positions: target.positions,
        indices: target.indices,
        sourceNormals: source.normals,
        changedVertexIndices: change.changedVertexIndices
      });
    } else if (targetHasNormals) {
      normals = target.normals.map(point => [...point]);
    } else {
      normals = [];
    }
  }

  return Object.freeze({
    changed: true,
    descriptor: freezeDescriptor({
      ...target,
      normals
    }),
    change: Object.freeze({
      ...change,
      normalPolicy: policy,
      normalsPreserved: arraysExactlyEqual(normals, source.normals),
      normalsInvalidated: normals.length === 0
    })
  });
}

export function recomputeLocalVertexNormals({
  positions,
  indices,
  sourceNormals,
  changedVertexIndices
} = {}) {
  const points = Array.isArray(positions) ? positions : [];
  const triangles = Array.from(indices ?? [], Number);
  const source = Array.isArray(sourceNormals) ? sourceNormals : [];
  const changed = new Set(
    Array.from(changedVertexIndices ?? [], Number).filter(index =>
      Number.isInteger(index) && index >= 0 && index < points.length
    )
  );
  if (!changed.size || source.length !== points.length ||
      triangles.length % 3 !== 0) {
    return source.map(point => [...point]);
  }

  const affected = new Set();
  for (let offset = 0; offset < triangles.length; offset += 3) {
    const face = [triangles[offset], triangles[offset + 1], triangles[offset + 2]];
    if (face.some(index => changed.has(index))) {
      face.forEach(index => affected.add(index));
    }
  }
  if (!affected.size) return source.map(point => [...point]);

  const accumulated = new Map(
    [...affected].map(index => [index, [0, 0, 0]])
  );
  for (let offset = 0; offset < triangles.length; offset += 3) {
    const a = triangles[offset];
    const b = triangles[offset + 1];
    const c = triangles[offset + 2];
    if (![a, b, c].some(index => affected.has(index))) continue;
    const normal = triangleNormal(points[a], points[b], points[c]);
    for (const index of [a, b, c]) {
      const sum = accumulated.get(index);
      if (!sum) continue;
      sum[0] += normal[0];
      sum[1] += normal[1];
      sum[2] += normal[2];
    }
  }

  const result = source.map(point => [...point]);
  for (const [index, value] of accumulated) {
    const normalized = normalize3(value);
    result[index] = lengthSquared3(normalized) > 0
      ? normalized
      : [...(source[index] ?? ZERO_NORMAL)];
  }
  return result;
}

function normalizeDescriptorShape(value = {}) {
  return {
    type: "buffer",
    positions: copyNested(value.positions, 3),
    indices: Array.from(value.indices ?? [], Number),
    normals: copyNested(value.normals, 3),
    uvs: copyNested(value.uvs, 2),
    edges: Array.from(value.edges ?? [], edge => Array.from(edge ?? [], Number))
  };
}

function freezeDescriptor(value) {
  return Object.freeze({
    type: "buffer",
    positions: Object.freeze(value.positions.map(point => Object.freeze([...point]))),
    indices: Object.freeze([...value.indices]),
    normals: Object.freeze(value.normals.map(point => Object.freeze([...point]))),
    uvs: Object.freeze(value.uvs.map(point => Object.freeze([...point]))),
    edges: Object.freeze(value.edges.map(edge => Object.freeze([...edge])))
  });
}

function copyNested(value, width) {
  if (!Array.isArray(value)) return [];
  return value.map(point => Array.from(point ?? [], Number).slice(0, width));
}

function changedPointIndices(left, right, epsilon) {
  const length = Math.min(left.length, right.length);
  const changed = [];
  for (let index = 0; index < length; index += 1) {
    if (!numericArraysNear(left[index], right[index], epsilon)) {
      changed.push(index);
    }
  }
  if (left.length !== right.length) {
    for (let index = length; index < Math.max(left.length, right.length); index += 1) {
      changed.push(index);
    }
  }
  return changed;
}

function nestedNumericArraysNear(left, right, epsilon) {
  if (left.length !== right.length) return false;
  return left.every((value, index) => numericArraysNear(value, right[index], epsilon));
}

function numericArraysNear(left, right, epsilon) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
    return false;
  }
  return left.every((value, index) =>
    Math.abs(Number(value) - Number(right[index])) <= epsilon
  );
}

function integerArraysEqual(left, right) {
  return left.length === right.length &&
    left.every((value, index) => Number(value) === Number(right[index]));
}

function nestedIntegerArraysEqual(left, right) {
  return left.length === right.length && left.every((value, index) =>
    integerArraysEqual(value, right[index] ?? [])
  );
}

function arraysExactlyEqual(left, right) {
  return left.length === right.length && left.every((value, index) =>
    value.length === (right[index]?.length ?? -1) &&
    value.every((component, componentIndex) =>
      component === right[index][componentIndex]
    )
  );
}

function triangleNormal(a, b, c) {
  if (!a || !b || !c) return [0, 0, 0];
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  return [
    ab[1] * ac[2] - ab[2] * ac[1],
    ab[2] * ac[0] - ab[0] * ac[2],
    ab[0] * ac[1] - ab[1] * ac[0]
  ];
}

function normalize3(value) {
  const length = Math.sqrt(lengthSquared3(value));
  return length > 1e-20
    ? [value[0] / length, value[1] / length, value[2] / length]
    : [0, 0, 0];
}

function lengthSquared3(value) {
  return Number(value?.[0] ?? 0) ** 2 +
    Number(value?.[1] ?? 0) ** 2 +
    Number(value?.[2] ?? 0) ** 2;
}
