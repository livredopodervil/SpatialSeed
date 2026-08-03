// Contrato imutável compartilhado por documento, autoria e providers.
export const SKETCH_DESCRIPTOR_VERSION = "spatial-seed-sketch-v1";

const SKETCH_ROLES = new Set([
  "point",
  "path",
  "profile",
  "boundary"
]);

export function createPlanarSketchDescriptor({
  mode,
  style = "stroke",
  points,
  closed = false,
  primitive = null,
  source = null
} = {}) {
  const normalizedPoints = normalizePointList(points);
  const isClosed = Boolean(closed);
  const roles = [];
  if (normalizedPoints.length === 1) roles.push("point");
  if (normalizedPoints.length >= 2) roles.push("path");
  if (
    isClosed &&
    normalizedPoints.length >= 3 &&
    Math.abs(signedArea(normalizedPoints)) > 1e-12
  ) {
    roles.push("profile", "boundary");
  }
  return normalizeSketchDescriptor({
    descriptorVersion: SKETCH_DESCRIPTOR_VERSION,
    plane: "local-xy",
    points: normalizedPoints,
    closed: isClosed,
    roles,
    primitive: primitive ?? { type: String(mode ?? "polyline") },
    source: source ?? {
      toolId: "planar.sketch",
      mode: String(mode ?? "polyline"),
      style: String(style ?? "stroke")
    }
  });
}

export function normalizeSketchDescriptor(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Descritor de esboço inválido.");
  }
  const descriptorVersion = String(
    value.descriptorVersion ?? SKETCH_DESCRIPTOR_VERSION
  );
  if (descriptorVersion !== SKETCH_DESCRIPTOR_VERSION) {
    throw new RangeError(
      `Versão de esboço incompatível: ${descriptorVersion}.`
    );
  }
  const plane = String(value.plane ?? "local-xy").trim().toLowerCase();
  if (plane !== "local-xy") {
    throw new RangeError(`Plano de esboço desconhecido: ${plane}.`);
  }
  const points = normalizePointList(value.points);
  const closed = Boolean(value.closed);
  const roles = [...new Set((value.roles ?? [])
    .map(role => String(role ?? "").trim().toLowerCase())
    .filter(Boolean))];
  if (!roles.length) {
    throw new TypeError("Esboço deve declarar ao menos um papel semântico.");
  }
  for (const role of roles) {
    if (!SKETCH_ROLES.has(role)) {
      throw new RangeError(`Papel de esboço desconhecido: ${role}.`);
    }
  }
  if (roles.includes("point") && points.length !== 1) {
    throw new Error("Esboço com papel point exige exatamente um ponto.");
  }
  if (roles.includes("path") && points.length < 2) {
    throw new Error("Esboço com papel path exige ao menos dois pontos.");
  }
  if (roles.some(role => role === "profile" || role === "boundary")) {
    if (!closed || points.length < 3 || Math.abs(signedArea(points)) <= 1e-12) {
      throw new Error(
        "Perfis e contornos exigem um esboço fechado e não degenerado."
      );
    }
  }
  const primitive = normalizePrimitive(value.primitive);
  const source = normalizeSource(value.source);
  return deepFreeze({
    descriptorVersion,
    plane,
    points,
    closed,
    roles,
    primitive,
    source
  });
}

export function sketchSupportsRole(value, role) {
  const normalized = normalizeSketchDescriptor(value);
  return normalized.roles.includes(String(role ?? "").trim().toLowerCase());
}

function normalizePointList(value) {
  if (!Array.isArray(value) || !value.length || value.length > 4096) {
    throw new RangeError("Esboço exige entre 1 e 4096 pontos.");
  }
  return value.map((point, index) => {
    if (!Array.isArray(point) || point.length !== 2) {
      throw new TypeError(`Ponto 2D inválido no índice ${index}.`);
    }
    const result = point.map(Number);
    if (!result.every(Number.isFinite)) {
      throw new TypeError(`Ponto 2D não finito no índice ${index}.`);
    }
    return result;
  });
}

function normalizePrimitive(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Esboço exige uma primitiva declarada.");
  }
  const primitive = structuredClone(value);
  primitive.type = String(primitive.type ?? "").trim().toLowerCase();
  if (!primitive.type) {
    throw new TypeError("Primitiva do esboço exige tipo.");
  }
  return primitive;
}

function normalizeSource(value) {
  const source = value && typeof value === "object" && !Array.isArray(value)
    ? structuredClone(value)
    : {};
  return {
    toolId: String(source.toolId ?? "planar.sketch"),
    mode: String(source.mode ?? "polyline"),
    style: String(source.style ?? "stroke")
  };
}

function signedArea(points) {
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    area += current[0] * next[1] - next[0] * current[1];
  }
  return area * 0.5;
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  for (const item of Object.values(value)) deepFreeze(item);
  return Object.freeze(value);
}
