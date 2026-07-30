export function preprocessStrokePoints({ points, settings = {}, mode = "tube" } = {}) {
  const source = normalizePoints(points);
  if (String(mode).toLowerCase() !== "tube") {
    return removeNearDuplicates(source);
  }
  const diagonal = boundingDiagonal(source);
  const tolerance = diagonal * nonNegative(settings.simplify ?? 0);
  let result = simplifyRdp(source, tolerance);
  const iterations = integerAtLeast(settings.smoothIterations ?? 0, 0);
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    result = chaikin(result);
  }
  return removeNearDuplicates(result);
}

export function packStrokePoints(points) {
  const source = normalizePoints(points);
  const packed = new Float32Array(source.length * 3);
  for (let index = 0; index < source.length; index += 1) {
    packed.set(source[index], index * 3);
  }
  return packed;
}

export function unpackStrokePoints(packed, pointCount = null) {
  const values = packed instanceof Float32Array
    ? packed
    : new Float32Array(packed);
  if (values.length % 3 !== 0) {
    throw new TypeError("Buffer de pontos inválido.");
  }
  const available = values.length / 3;
  const count = pointCount === null || pointCount === undefined
    ? available
    : Number(pointCount);
  if (!Number.isInteger(count) || count < 2 || count > available) {
    throw new RangeError("Quantidade de pontos inválida no buffer.");
  }
  const points = new Array(count);
  for (let index = 0; index < points.length; index += 1) {
    const offset = index * 3;
    points[index] = [
      values[offset],
      values[offset + 1],
      values[offset + 2]
    ];
  }
  return points;
}

function normalizePoints(points) {
  if (!Array.isArray(points) || points.length < 2) {
    throw new TypeError("Pré-processamento exige ao menos dois pontos.");
  }
  return points.map((point, index) => {
    if (!Array.isArray(point) || point.length !== 3) {
      throw new TypeError(`Ponto inválido na posição ${index + 1}.`);
    }
    const normalized = point.map(Number);
    if (!normalized.every(Number.isFinite)) {
      throw new TypeError(`Ponto inválido na posição ${index + 1}.`);
    }
    return normalized;
  });
}

function simplifyRdp(points, tolerance) {
  if (points.length <= 2 || !(tolerance > 0)) {
    return points.map(point => [...point]);
  }
  let maximum = 0;
  let split = 0;
  for (let index = 1; index < points.length - 1; index += 1) {
    const distance = distanceToSegment(points[index], points[0], points.at(-1));
    if (distance > maximum) {
      maximum = distance;
      split = index;
    }
  }
  if (maximum <= tolerance) return [[...points[0]], [...points.at(-1)]];
  const left = simplifyRdp(points.slice(0, split + 1), tolerance);
  const right = simplifyRdp(points.slice(split), tolerance);
  return [...left.slice(0, -1), ...right];
}

function chaikin(points) {
  if (points.length < 3) return points.map(point => [...point]);
  const result = [[...points[0]]];
  for (let index = 0; index < points.length - 1; index += 1) {
    result.push(
      mix3(points[index], points[index + 1], 0.25),
      mix3(points[index], points[index + 1], 0.75)
    );
  }
  result.push([...points.at(-1)]);
  return result;
}

function removeNearDuplicates(points, epsilon = 1e-7) {
  const result = [];
  for (const point of points) {
    const previous = result.at(-1);
    if (!previous || distance3(point, previous) > epsilon) {
      result.push([...point]);
    }
  }
  return result;
}

function distanceToSegment(point, start, end) {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const dz = end[2] - start[2];
  const denominator = dx * dx + dy * dy + dz * dz;
  if (denominator <= 1e-18) return distance3(point, start);
  const t = Math.max(0, Math.min(1,
    ((point[0] - start[0]) * dx +
      (point[1] - start[1]) * dy +
      (point[2] - start[2]) * dz) / denominator
  ));
  return distance3(point, [
    start[0] + dx * t,
    start[1] + dy * t,
    start[2] + dz * t
  ]);
}

function boundingDiagonal(points) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const point of points) {
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis], point[axis]);
      max[axis] = Math.max(max[axis], point[axis]);
    }
  }
  return distance3(min, max);
}

function mix3(left, right, t) {
  return [
    left[0] + (right[0] - left[0]) * t,
    left[1] + (right[1] - left[1]) * t,
    left[2] + (right[2] - left[2]) * t
  ];
}

function distance3(left, right) {
  return Math.hypot(
    left[0] - right[0],
    left[1] - right[1],
    left[2] - right[2]
  );
}

function nonNegative(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new RangeError("Valor de simplificação inválido.");
  }
  return number;
}

function integerAtLeast(value, minimum) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < minimum) {
    throw new RangeError("Quantidade de suavizações inválida.");
  }
  return number;
}
