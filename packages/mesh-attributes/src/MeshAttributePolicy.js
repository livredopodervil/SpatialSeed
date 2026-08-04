const DEFAULT_EPSILON = 1e-8;
const ZERO_NORMAL = Object.freeze([0, 0, 0]);

export const MESH_NORMAL_POLICIES = Object.freeze([
  "preserve",
  "recompute-local",
  "recompute-all"
]);

export function normalizeMeshNormalPolicy(value = "recompute-local") {
  const normalized = String(value ?? "recompute-local").trim().toLowerCase();
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
  normalPolicy = "recompute-local",
  preferTargetNormals = false,
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
    const normalSource = targetHasNormals
      ? target.normals
      : sourceFitsTarget
        ? source.normals
        : [];
    if (preferTargetNormals && targetHasNormals) {
      // Uma ferramenta explícita de normais já decidiu o atributo final.
      // A política automática não deve substituir esse resultado no commit.
      normals = target.normals.map(point => [...point]);
    } else if (policy === "preserve") {
      if (targetHasNormals) {
        normals = target.normals.map(point => [...point]);
      } else if (!change.topologyChanged && sourceFitsTarget) {
        normals = source.normals.map(point => [...point]);
      } else {
        normals = [];
      }
    } else if (policy === "recompute-all") {
      normals = recomputeVertexNormals({
        positions: target.positions,
        indices: target.indices,
        sourceNormals: normalSource
      });
    } else if (change.positionsChanged && !change.topologyChanged &&
        source.normals.length === source.positions.length &&
        source.indices.length === target.indices.length) {
      normals = recomputeLocalVertexNormals({
        positions: target.positions,
        indices: target.indices,
        sourceNormals: normalSource,
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

export function recomputeVertexNormals({
  positions,
  indices,
  sourceNormals = [],
  positionEpsilon = 1e-7,
  normalEpsilon = 1e-5
} = {}) {
  const points = Array.isArray(positions) ? positions : [];
  const triangles = Array.from(indices ?? [], Number);
  if (!points.length || triangles.length % 3 !== 0) return [];

  const accumulated = points.map(() => [0, 0, 0]);
  for (let offset = 0; offset < triangles.length; offset += 3) {
    const a = triangles[offset];
    const b = triangles[offset + 1];
    const c = triangles[offset + 2];
    if (![a, b, c].every(index =>
      Number.isInteger(index) && index >= 0 && index < points.length
    )) continue;
    const normal = triangleNormal(points[a], points[b], points[c]);
    for (const index of [a, b, c]) {
      accumulated[index][0] += normal[0];
      accumulated[index][1] += normal[1];
      accumulated[index][2] += normal[2];
    }
  }

  synchronizeContinuousNormalGroups({
    positions: points,
    sourceNormals,
    accumulated,
    positionEpsilon,
    normalEpsilon
  });

  return accumulated.map((value, index) => {
    const normalized = normalize3(value);
    if (lengthSquared3(normalized) > 0) return normalized;
    const fallback = sourceNormals[index];
    return Array.isArray(fallback) ? [...fallback] : [...ZERO_NORMAL];
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

  const continuityGroups = normalContinuityGroups({
    positions: points,
    sourceNormals: source
  });
  for (const group of continuityGroups) {
    if (group.some(index => affected.has(index))) {
      group.forEach(index => affected.add(index));
    }
  }

  const accumulated = points.map(() => [0, 0, 0]);
  for (let offset = 0; offset < triangles.length; offset += 3) {
    const a = triangles[offset];
    const b = triangles[offset + 1];
    const c = triangles[offset + 2];
    if (![a, b, c].some(index => affected.has(index))) continue;
    const normal = triangleNormal(points[a], points[b], points[c]);
    for (const index of [a, b, c]) {
      if (!affected.has(index)) continue;
      accumulated[index][0] += normal[0];
      accumulated[index][1] += normal[1];
      accumulated[index][2] += normal[2];
    }
  }

  synchronizeContinuousNormalGroups({
    positions: points,
    sourceNormals: source,
    accumulated,
    restrictedIndices: affected
  });

  const result = source.map(point => [...point]);
  for (const index of affected) {
    const normalized = normalize3(accumulated[index]);
    result[index] = lengthSquared3(normalized) > 0
      ? normalized
      : [...(source[index] ?? ZERO_NORMAL)];
  }
  return result;
}

function synchronizeContinuousNormalGroups({
  positions,
  sourceNormals,
  accumulated,
  restrictedIndices = null,
  positionEpsilon = 1e-7,
  normalEpsilon = 1e-5
}) {
  const groups = normalContinuityGroups({
    positions,
    sourceNormals,
    positionEpsilon,
    normalEpsilon
  });
  for (const group of groups) {
    const active = restrictedIndices
      ? group.filter(index => restrictedIndices.has(index))
      : group;
    if (active.length < 2) continue;
    const sum = [0, 0, 0];
    for (const index of active) {
      const value = accumulated[index] ?? ZERO_NORMAL;
      sum[0] += value[0];
      sum[1] += value[1];
      sum[2] += value[2];
    }
    for (const index of active) accumulated[index] = [...sum];
  }
}

function normalContinuityGroups({
  positions,
  sourceNormals,
  positionEpsilon = 1e-7,
  normalEpsilon = 1e-5
}) {
  if (!Array.isArray(sourceNormals) || sourceNormals.length !== positions.length) {
    return [];
  }
  const positionBuckets = new Map();
  for (let index = 0; index < positions.length; index += 1) {
    const point = positions[index] ?? [0, 0, 0];
    const key = [
      quantize(point[0], positionEpsilon),
      quantize(point[1], positionEpsilon),
      quantize(point[2], positionEpsilon)
    ].join(":");
    const bucket = positionBuckets.get(key) ?? [];
    bucket.push(index);
    positionBuckets.set(key, bucket);
  }

  const groups = [];
  for (const bucket of positionBuckets.values()) {
    if (bucket.length < 2) continue;
    const partitions = [];
    for (const index of bucket) {
      const normal = normalize3(sourceNormals[index] ?? ZERO_NORMAL);
      if (lengthSquared3(normal) === 0) {
        partitions.push({ normal, indices: [index] });
        continue;
      }
      const partition = partitions.find(candidate =>
        lengthSquared3(candidate.normal) > 0 &&
        dot3(candidate.normal, normal) >= 1 - normalEpsilon
      );
      if (partition) partition.indices.push(index);
      else partitions.push({ normal, indices: [index] });
    }
    for (const partition of partitions) {
      if (partition.indices.length > 1) groups.push(partition.indices);
    }
  }
  return groups;
}

function quantize(value, epsilon) {
  return Math.round(Number(value ?? 0) / epsilon);
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

function dot3(left, right) {
  return Number(left?.[0] ?? 0) * Number(right?.[0] ?? 0) +
    Number(left?.[1] ?? 0) * Number(right?.[1] ?? 0) +
    Number(left?.[2] ?? 0) * Number(right?.[2] ?? 0);
}

function lengthSquared3(value) {
  return Number(value?.[0] ?? 0) ** 2 +
    Number(value?.[1] ?? 0) ** 2 +
    Number(value?.[2] ?? 0) ** 2;
}
