export const EXPLICIT_INSTANCE_FAMILY_TYPE = "explicit-trs-v1";
const VALIDATED_FAMILY_MARKER = "spatialseed-explicit-family-v1";

export function packExplicitInstanceFamily(
  instances,
  options = {}
) {
  return packExplicitInstanceFamilyInternal(instances, options, null);
}

export function packAnchoredExplicitInstanceFamily(
  instances,
  options = {}
) {
  const anchorPolicy = normalizeAnchorPolicy(
    options.anchorPolicy ?? options.generator?.anchorPolicy ?? "first"
  );
  const origin = explicitInstanceFamilyAnchor(instances, {
    policy: anchorPolicy,
    anchor: options.anchor
  });
  return Object.freeze({
    origin: Object.freeze(origin),
    anchorPolicy,
    family: packExplicitInstanceFamilyInternal(instances, {
      ...options,
      generator: {
        ...(options.generator ?? {}),
        anchorPolicy
      }
    }, origin)
  });
}

export function explicitInstanceFamilyAnchor(
  instances,
  { policy = "first", anchor = null } = {}
) {
  validateInstanceCollection(instances);
  const normalizedPolicy = normalizeAnchorPolicy(policy);
  if (normalizedPolicy === "world") return [0, 0, 0];
  if (normalizedPolicy === "custom") {
    return normalizedVector(anchor, 3, "âncora personalizada da família");
  }
  if (normalizedPolicy === "first") {
    return normalizedVector(
      instances[0]?.position,
      3,
      "posição da primeira instância"
    );
  }

  const minimum = [Infinity, Infinity, Infinity];
  const maximum = [-Infinity, -Infinity, -Infinity];
  for (let index = 0; index < instances.length; index += 1) {
    const value = normalizedVector(
      instances[index]?.position,
      3,
      `posição da instância ${index + 1}`
    );
    for (let axis = 0; axis < 3; axis += 1) {
      minimum[axis] = Math.min(minimum[axis], value[axis]);
      maximum[axis] = Math.max(maximum[axis], value[axis]);
    }
  }
  return minimum.map((value, axis) =>
    value + (maximum[axis] - value) * 0.5
  );
}

function packExplicitInstanceFamilyInternal(
  instances,
  { colors = null, memberIds = null, generator = null } = {},
  origin = null
) {
  validateInstanceCollection(instances);
  const count = instances.length;
  const anchor = origin ?? [0, 0, 0];
  const normalizedMemberIds = normalizeMemberIds(
    memberIds ?? instances.map(instance => instance?.id ?? null),
    count
  );
  const positions = new Array(count * 3);
  const rotations = new Array(count * 4);
  let scales = null;
  let hasNonIdentityRotation = false;
  let hasNonIdentityScale = false;
  const minimum = [Infinity, Infinity, Infinity];
  const maximum = [-Infinity, -Infinity, -Infinity];
  let maximumScale = 1;

  for (let index = 0; index < count; index += 1) {
    const instance = instances[index] ?? {};
    const position = normalizedVector(
      instance.position,
      3,
      `posição da instância ${index + 1}`
    );
    const rotation = normalizedQuaternion(
      instance.rotation,
      `rotação da instância ${index + 1}`
    );
    const scale = normalizedVector(
      instance.scale ?? [1, 1, 1],
      3,
      `escala da instância ${index + 1}`
    );

    const positionOffset = index * 3;
    const rotationOffset = index * 4;
    for (let axis = 0; axis < 3; axis += 1) {
      const local = position[axis] - anchor[axis];
      positions[positionOffset + axis] = local;
      minimum[axis] = Math.min(minimum[axis], local);
      maximum[axis] = Math.max(maximum[axis], local);
      maximumScale = Math.max(maximumScale, Math.abs(scale[axis]));
    }
    for (let axis = 0; axis < 4; axis += 1) {
      rotations[rotationOffset + axis] = rotation[axis];
    }
    if (!nearIdentityQuaternion(rotation)) {
      hasNonIdentityRotation = true;
    }
    if (!nearIdentityScale(scale)) {
      hasNonIdentityScale = true;
      scales ??= new Array(count * 3).fill(1);
    }
    if (scales) {
      for (let axis = 0; axis < 3; axis += 1) {
        scales[positionOffset + axis] = scale[axis];
      }
    }
  }

  const packedColors = colors === null || colors === undefined
    ? null
    : packColors(colors, count);
  const family = {
    type: EXPLICIT_INSTANCE_FAMILY_TYPE,
    validated: VALIDATED_FAMILY_MARKER,
    count,
    memberIds: normalizedMemberIds,
    positions: Object.freeze(positions),
    ...(hasNonIdentityRotation
      ? { rotations: Object.freeze(rotations) }
      : {}),
    ...(hasNonIdentityScale && scales
      ? { scales: Object.freeze(scales) }
      : {}),
    ...(packedColors ? { colors: packedColors } : {}),
    bounds: deepFreeze({
      min: Object.freeze(minimum),
      max: Object.freeze(maximum),
      maximumScale
    }),
    ...(generator ? { generator: deepFreezeClone(generator) } : {})
  };
  return deepFreeze(family);
}

function validateInstanceCollection(instances) {
  if (!Array.isArray(instances) || !instances.length) {
    throw new TypeError("Família de instâncias exige transformações.");
  }
  if (instances.length > 100000) {
    throw new RangeError("Família de instâncias limitada a 100000 membros.");
  }
}

export function normalizeExplicitInstanceFamily(value) {
  if (isTrustedFamily(value)) return value;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Descritor de família de instâncias inválido.");
  }
  if (String(value.type) !== EXPLICIT_INSTANCE_FAMILY_TYPE) {
    throw new RangeError(`Tipo de família desconhecido: ${value.type}.`);
  }
  const count = Number(value.count);
  if (!Number.isInteger(count) || count < 1 || count > 100000) {
    throw new RangeError("Quantidade inválida na família de instâncias.");
  }
  const memberIds = normalizeMemberIds(value.memberIds, count);
  const positions = normalizedFlatVectorArray(
    value.positions,
    count,
    3,
    "posições"
  );
  const rotations = value.rotations === undefined
    ? null
    : normalizedFlatVectorArray(value.rotations, count, 4, "rotações", {
        quaternion: true
      });
  const scales = value.scales === undefined
    ? null
    : normalizedFlatVectorArray(value.scales, count, 3, "escalas");
  const colors = value.colors === undefined
    ? null
    : normalizedPackedColors(value.colors, count);
  const bounds = normalizeFamilyBounds(value.bounds, positions, scales, count);
  return deepFreeze({
    type: EXPLICIT_INSTANCE_FAMILY_TYPE,
    validated: VALIDATED_FAMILY_MARKER,
    count,
    memberIds,
    positions,
    ...(rotations ? { rotations } : {}),
    ...(scales ? { scales } : {}),
    ...(colors ? { colors } : {}),
    bounds,
    ...(value.generator
      ? { generator: deepFreezeClone(value.generator) }
      : {})
  });
}

export function explicitInstanceFamilyEstimatedBytes(family) {
  const normalized = normalizeExplicitInstanceFamily(family);
  return (
    normalized.positions.length * 4 +
    normalized.memberIds.reduce((total, id) => total + 8 + id.length * 2, 0) +
    (normalized.rotations?.length ?? 0) * 4 +
    (normalized.scales?.length ?? 0) * 4 +
    (normalized.colors?.length ?? 0) * 4 +
    7 * 4
  );
}

export function explicitFamilyTransformAt(family, index, target = {}) {
  const count = Number(family?.count);
  if (!Number.isInteger(index) || index < 0 || index >= count) {
    throw new RangeError(`Índice de instância inválido: ${index}.`);
  }
  const p = index * 3;
  const q = index * 4;
  target.position ??= [0, 0, 0];
  target.rotation ??= [0, 0, 0, 1];
  target.scale ??= [1, 1, 1];
  for (let axis = 0; axis < 3; axis += 1) {
    target.position[axis] = Number(family.positions[p + axis]);
    target.scale[axis] = family.scales
      ? Number(family.scales[p + axis])
      : 1;
  }
  for (let axis = 0; axis < 4; axis += 1) {
    target.rotation[axis] = family.rotations
      ? Number(family.rotations[q + axis])
      : axis === 3 ? 1 : 0;
  }
  target.color = family.colors
    ? Number(family.colors[index])
    : null;
  target.memberId = explicitFamilyMemberIdAt(family, index);
  return target;
}

export function explicitFamilyMemberIdAt(family, index) {
  const normalized = normalizeExplicitInstanceFamily(family);
  if (!Number.isInteger(index) || index < 0 || index >= normalized.count) {
    throw new RangeError(`Índice de membro inválido: ${index}.`);
  }
  return normalized.memberIds[index];
}

export function explicitFamilyMemberIndex(family, memberId) {
  const normalized = normalizeExplicitInstanceFamily(family);
  const id = String(memberId ?? "").trim();
  if (!id) return -1;
  return normalized.memberIds.indexOf(id);
}

export function familyMemberResourcePath(familyObjectId, memberId) {
  const objectId = String(familyObjectId ?? "").trim();
  const id = String(memberId ?? "").trim();
  if (!objectId || !id) {
    throw new TypeError("Referência de membro exige família e membro.");
  }
  return `/objects/${encodeURIComponent(objectId)}/members/${encodeURIComponent(id)}`;
}

export function parseFamilyMemberResourcePath(value) {
  const match = String(value ?? "").match(
    /^\/objects\/([^/]+)\/members\/([^/]+)$/
  );
  if (!match) return null;
  return Object.freeze({
    familyId: decodeURIComponent(match[1]),
    memberId: decodeURIComponent(match[2])
  });
}

function isTrustedFamily(value) {
  if (!value || typeof value !== "object" || !Object.isFrozen(value)) {
    return false;
  }
  if (value.validated !== VALIDATED_FAMILY_MARKER ||
      value.type !== EXPLICIT_INSTANCE_FAMILY_TYPE) {
    return false;
  }
  const count = Number(value.count);
  if (!Number.isInteger(count) || count < 1 || count > 100000) return false;
  if (!Object.isFrozen(value.memberIds) ||
      value.memberIds.length !== count ||
      new Set(value.memberIds).size !== count ||
      value.memberIds.some(id => !String(id).trim())) return false;
  if (!Object.isFrozen(value.positions) ||
      value.positions.length !== count * 3) return false;
  if (value.rotations &&
      (!Object.isFrozen(value.rotations) ||
       value.rotations.length !== count * 4)) return false;
  if (value.scales &&
      (!Object.isFrozen(value.scales) || value.scales.length !== count * 3)) {
    return false;
  }
  if (value.colors &&
      (!Object.isFrozen(value.colors) || value.colors.length !== count)) {
    return false;
  }
  if (!value.bounds || !Object.isFrozen(value.bounds) ||
      !Object.isFrozen(value.bounds.min) ||
      !Object.isFrozen(value.bounds.max) ||
      value.bounds.min.length !== 3 || value.bounds.max.length !== 3 ||
      !Number.isFinite(Number(value.bounds.maximumScale))) {
    return false;
  }
  return true;
}


function normalizeMemberIds(value, count) {
  const source = value === null || value === undefined
    ? []
    : Array.from(value);
  if (source.length && source.length !== count) {
    throw new RangeError("IDs de membros devem acompanhar as instâncias.");
  }
  const ids = Array.from({ length: count }, (_, index) => {
    const candidate = String(source[index] ?? "").trim();
    return candidate || `member-${index + 1}`;
  });
  if (new Set(ids).size !== ids.length) {
    throw new Error("IDs duplicados na família de instâncias.");
  }
  return Object.freeze(ids);
}

function normalizeAnchorPolicy(value) {
  const policy = String(value ?? "first").toLowerCase();
  if (!["first", "bounds", "world", "custom"].includes(policy)) {
    throw new RangeError(`Política de âncora desconhecida: ${value}.`);
  }
  return policy;
}

function normalizeFamilyBounds(value, positions, scales, count) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const minimum = normalizedVector(value.min, 3, "mínimo da família");
    const maximum = normalizedVector(value.max, 3, "máximo da família");
    const maximumScale = Number(value.maximumScale ?? 1);
    if (!(maximumScale > 0) || !Number.isFinite(maximumScale)) {
      throw new TypeError("Escala máxima da família inválida.");
    }
    return deepFreeze({
      min: Object.freeze(minimum),
      max: Object.freeze(maximum),
      maximumScale
    });
  }
  const minimum = [Infinity, Infinity, Infinity];
  const maximum = [-Infinity, -Infinity, -Infinity];
  let maximumScale = 1;
  for (let index = 0; index < count; index += 1) {
    const offset = index * 3;
    for (let axis = 0; axis < 3; axis += 1) {
      const coordinate = Number(positions[offset + axis]);
      minimum[axis] = Math.min(minimum[axis], coordinate);
      maximum[axis] = Math.max(maximum[axis], coordinate);
      maximumScale = Math.max(
        maximumScale,
        Math.abs(Number(scales?.[offset + axis] ?? 1))
      );
    }
  }
  return deepFreeze({
    min: Object.freeze(minimum),
    max: Object.freeze(maximum),
    maximumScale
  });
}

function normalizedVector(value, length, label) {
  if (!Array.isArray(value) || value.length !== length) {
    throw new TypeError(`${label} inválida.`);
  }
  const result = value.map(Number);
  if (!result.every(Number.isFinite)) {
    throw new TypeError(`${label} inválida.`);
  }
  return result;
}

function normalizedQuaternion(value, label) {
  const result = normalizedVector(value ?? [0, 0, 0, 1], 4, label);
  const length = Math.hypot(...result);
  if (!(length > 1e-12)) throw new TypeError(`${label} inválida.`);
  return result.map(component => component / length);
}

function normalizedFlatVectorArray(
  value,
  count,
  width,
  label,
  { quaternion = false } = {}
) {
  if (!Array.isArray(value) || value.length !== count * width) {
    throw new RangeError(`Quantidade inválida de ${label} da família.`);
  }
  const result = value.map(Number);
  if (!result.every(Number.isFinite)) {
    throw new TypeError(`${label} da família contêm valores inválidos.`);
  }
  if (quaternion) {
    for (let index = 0; index < count; index += 1) {
      const offset = index * 4;
      const length = Math.hypot(
        result[offset],
        result[offset + 1],
        result[offset + 2],
        result[offset + 3]
      );
      if (!(length > 1e-12)) {
        throw new TypeError(`Rotação inválida na instância ${index + 1}.`);
      }
      for (let axis = 0; axis < 4; axis += 1) {
        result[offset + axis] /= length;
      }
    }
  }
  return Object.freeze(result);
}

function packColors(colors, count) {
  if (!Array.isArray(colors) || colors.length !== count) {
    throw new RangeError("Cores da família devem acompanhar as instâncias.");
  }
  const packed = colors.map((value, index) => {
    const text = String(value ?? "").trim();
    if (!/^#[0-9a-f]{6}$/i.test(text)) {
      throw new TypeError(`Cor inválida na instância ${index + 1}.`);
    }
    return Number.parseInt(text.slice(1), 16);
  });
  return Object.freeze(packed);
}

function normalizedPackedColors(colors, count) {
  if (!Array.isArray(colors) || colors.length !== count) {
    throw new RangeError("Quantidade inválida de cores da família.");
  }
  return Object.freeze(colors.map((value, index) => {
    const number = Number(value);
    if (!Number.isInteger(number) || number < 0 || number > 0xffffff) {
      throw new TypeError(`Cor compactada inválida na instância ${index + 1}.`);
    }
    return number;
  }));
}

function nearIdentityQuaternion(value, epsilon = 1e-10) {
  return Math.abs(value[0]) <= epsilon &&
    Math.abs(value[1]) <= epsilon &&
    Math.abs(value[2]) <= epsilon &&
    Math.abs(Math.abs(value[3]) - 1) <= epsilon;
}

function nearIdentityScale(value, epsilon = 1e-10) {
  return value.every(component => Math.abs(component - 1) <= epsilon);
}

function deepFreezeClone(value) {
  return deepFreeze(structuredClone(value));
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}
