import { decomposeTransformStrict } from "./Matrix4.js";

const EPSILON = 1e-10;

const CANONICAL_PLANES = Object.freeze({
  xy: Object.freeze({
    tangent: Object.freeze([1, 0, 0]),
    normal: Object.freeze([0, 0, 1])
  }),
  xz: Object.freeze({
    tangent: Object.freeze([1, 0, 0]),
    normal: Object.freeze([0, 1, 0])
  }),
  yz: Object.freeze({
    tangent: Object.freeze([0, 1, 0]),
    normal: Object.freeze([1, 0, 0])
  })
});

/**
 * Resolve um referencial ortonormal que leva a geometria local XY ao plano
 * desejado. A geometria permanece independente de sua colocação no mundo.
 */
export function resolvePlacementFrame({
  origin = [0, 0, 0],
  plane = "xy",
  normal = null,
  tangent = null,
  points = null
} = {}) {
  let frameOrigin;
  let frameNormal;
  let frameTangent;
  let mode;

  if (points !== null) {
    if (normal !== null || tangent !== null) {
      throw new Error("points não pode ser combinado com normal ou tangent.");
    }
    if (!Array.isArray(points) || points.length !== 3) {
      throw new TypeError("points exige três pontos tridimensionais.");
    }

    const [first, second, third] = points.map((point, index) =>
      vector3(point, `points[${index}]`)
    );
    const firstEdge = subtract(second, first);
    const secondEdge = subtract(third, first);

    frameOrigin = first;
    frameTangent = normalize(firstEdge, "Os dois primeiros pontos coincidem.");
    frameNormal = normalize(
      cross(firstEdge, secondEdge),
      "Os três pontos são colineares."
    );
    mode = "points";
  } else if (normal !== null) {
    frameOrigin = vector3(origin, "origin");
    frameNormal = normalize(
      vector3(normal, "normal"),
      "normal não pode ser nula."
    );
    const candidate = tangent === null
      ? leastParallelAxis(frameNormal)
      : vector3(tangent, "tangent");
    frameTangent = normalize(
      subtract(candidate, scale(frameNormal, dot(candidate, frameNormal))),
      "tangent deve ser diferente e não paralela a normal."
    );
    mode = tangent === null ? "normal" : "normal-tangent";
  } else {
    if (tangent !== null) {
      throw new Error("tangent exige normal.");
    }
    const planeName = String(plane ?? "xy").trim().toLowerCase();
    const canonical = CANONICAL_PLANES[planeName];

    if (!canonical) {
      throw new Error(`Plano desconhecido: ${planeName}. Use xy, xz ou yz.`);
    }

    frameOrigin = vector3(origin, "origin");
    frameNormal = [...canonical.normal];
    frameTangent = [...canonical.tangent];
    mode = `plane-${planeName}`;
  }

  const bitangent = normalize(
    cross(frameNormal, frameTangent),
    "Não foi possível construir o plano."
  );
  const transform = decomposeTransformStrict([
    ...frameTangent, 0,
    ...bitangent, 0,
    ...frameNormal, 0,
    ...frameOrigin, 1
  ]);

  return Object.freeze({
    mode,
    origin: Object.freeze([...frameOrigin]),
    tangent: Object.freeze([...frameTangent]),
    bitangent: Object.freeze([...bitangent]),
    normal: Object.freeze([...frameNormal]),
    rotation: Object.freeze([...transform.rotation])
  });
}

function vector3(value, name) {
  if (!Array.isArray(value) || value.length !== 3) {
    throw new TypeError(`${name} deve conter três valores.`);
  }

  return value.map(component => {
    const number = Number(component);
    if (!Number.isFinite(number)) {
      throw new TypeError(`${name} contém valor inválido: ${component}.`);
    }
    return number;
  });
}

function leastParallelAxis(normal) {
  const axes = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  return axes.reduce((best, axis) =>
    Math.abs(dot(axis, normal)) < Math.abs(dot(best, normal))
      ? axis
      : best
  );
}

function normalize(vector, message) {
  const length = Math.hypot(...vector);
  if (length <= EPSILON) throw new RangeError(message);
  return vector.map(value => value / length);
}

function subtract(a, b) {
  return a.map((value, index) => value - b[index]);
}

function scale(vector, factor) {
  return vector.map(value => value * factor);
}

function dot(a, b) {
  return a.reduce((sum, value, index) => sum + value * b[index], 0);
}

function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
  ];
}
