export const APPEARANCE_BINDING_VERSION = "appearance-binding-v1";
export const APPEARANCE_COLOR_MODES = Object.freeze([
  "inherit",
  "uniform",
  "per-instance"
]);
export const APPEARANCE_MATERIAL_MODES = Object.freeze([
  "inherit",
  "unlit",
  "standard",
  "physical"
]);

const WHITE = "#ffffff";
const FAMILY_COLOR_INFERENCE = new WeakMap();

export function normalizeAppearanceBinding(
  value = null,
  {
    family = null,
    fallbackColor = WHITE,
    instanceColor = null
  } = {}
) {
  const inferred = inferAppearanceBinding({
    family,
    fallbackColor,
    instanceColor
  });
  const source = value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
  const colorMode = normalizeEnum(
    source.colorMode ?? inferred.colorMode,
    APPEARANCE_COLOR_MODES,
    "modo de cor"
  );
  const materialMode = normalizeEnum(
    source.materialMode ?? "inherit",
    APPEARANCE_MATERIAL_MODES,
    "modo de material"
  );
  const tint = normalizeHexColor(source.tint ?? WHITE, "matiz");
  const opacityMultiplier = finiteRange(
    source.opacityMultiplier ?? 1,
    0,
    1,
    "multiplicador de opacidade"
  );
  const uniformColor = colorMode === "uniform"
    ? normalizeHexColor(
        source.uniformColor ?? inferred.uniformColor ?? fallbackColor,
        "cor uniforme"
      )
    : null;
  return deepFreeze({
    version: APPEARANCE_BINDING_VERSION,
    colorMode,
    ...(uniformColor ? { uniformColor } : {}),
    tint,
    opacityMultiplier,
    materialMode
  });
}

export function patchAppearanceBinding(
  current,
  patch = {},
  context = {}
) {
  const previous = normalizeAppearanceBinding(current, context);
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    throw new TypeError("Patch de aparência deve ser um objeto.");
  }
  const nextPatch = { ...patch };
  if ("color" in nextPatch && !("uniformColor" in nextPatch)) {
    nextPatch.uniformColor = nextPatch.color;
    nextPatch.colorMode ??= "uniform";
  }
  delete nextPatch.color;
  return normalizeAppearanceBinding({
    ...previous,
    ...nextPatch
  }, context);
}

export function inferAppearanceBinding({
  family = null,
  fallbackColor = WHITE,
  instanceColor = null
} = {}) {
  const directColor = validHexColor(instanceColor)
    ? normalizeHexColor(instanceColor, "cor da instância")
    : null;
  if (directColor) {
    return deepFreeze({
      version: APPEARANCE_BINDING_VERSION,
      colorMode: "uniform",
      uniformColor: directColor,
      tint: WHITE,
      opacityMultiplier: 1,
      materialMode: "inherit"
    });
  }
  const colors = family?.colors;
  if (Array.isArray(colors) && colors.length) {
    const inferred = inferFamilyColors(family);
    return deepFreeze({
      version: APPEARANCE_BINDING_VERSION,
      colorMode: inferred.uniform ? "uniform" : "per-instance",
      ...(inferred.uniform ? { uniformColor: inferred.color } : {}),
      tint: WHITE,
      opacityMultiplier: 1,
      materialMode: "inherit"
    });
  }
  normalizeHexColor(fallbackColor, "cor de fallback");
  return deepFreeze({
    version: APPEARANCE_BINDING_VERSION,
    colorMode: "inherit",
    tint: WHITE,
    opacityMultiplier: 1,
    materialMode: "inherit"
  });
}

export function appearanceBindingForObject(object = {}) {
  return normalizeAppearanceBinding(object.appearanceBinding, {
    family: object.family,
    fallbackColor: object.material?.color ?? WHITE,
    instanceColor: object.instanceState?.color ?? null
  });
}

export function appearanceMaterialReference(object = {}) {
  if (object.appearanceId) {
    return deepFreeze({
      kind: "appearance",
      appearanceId: String(object.appearanceId)
    });
  }
  return deepFreeze({
    kind: "legacy",
    material: deepFreezeClone(object.material ?? { color: WHITE })
  });
}

export function effectiveAppearanceColor(
  binding,
  {
    baseColor = WHITE,
    instanceColor = null
  } = {}
) {
  const normalized = normalizeAppearanceBinding(binding, {
    fallbackColor: baseColor,
    instanceColor
  });
  let source = normalizeHexColor(baseColor, "cor-base");
  if (normalized.colorMode === "uniform") {
    source = normalized.uniformColor;
  } else if (normalized.colorMode === "per-instance" && validHexColor(instanceColor)) {
    source = normalizeHexColor(instanceColor, "cor da instância");
  }
  return multiplyHexColors(source, normalized.tint);
}

export function familyColorAt(family, index) {
  if (!family?.colors) return null;
  const value = family.colors[index];
  return value === undefined ? null : packedColorToHex(normalizePackedColor(value));
}

export function compactUniformFamilyColors(colors) {
  if (colors === null || colors === undefined) {
    return Object.freeze({
      colors: null,
      appearanceBinding: normalizeAppearanceBinding(null)
    });
  }
  if (!Array.isArray(colors) || !colors.length) {
    throw new TypeError("Cores da família devem ser um array não vazio.");
  }
  const normalized = colors.map((value, index) =>
    normalizeHexColor(value, `cor ${index + 1}`)
  );
  const first = normalized[0];
  const uniform = normalized.every(value => value === first);
  return Object.freeze({
    colors: uniform ? null : Object.freeze(normalized),
    appearanceBinding: normalizeAppearanceBinding(
      uniform
        ? { colorMode: "uniform", uniformColor: first }
        : { colorMode: "per-instance" }
    )
  });
}

export function mergeAppearanceMaterial(material = {}, patch = {}) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    throw new TypeError("Patch de material deve ser um objeto.");
  }
  const current = material && typeof material === "object" && !Array.isArray(material)
    ? material
    : {};
  const next = {
    ...structuredClone(current),
    ...structuredClone(patch)
  };
  if (patch.parameters) {
    next.parameters = {
      ...(current.parameters ?? {}),
      ...structuredClone(patch.parameters)
    };
  }
  if (patch.texture) {
    next.texture = {
      ...(current.texture ?? {}),
      ...structuredClone(patch.texture)
    };
  }
  if (next.color !== undefined) {
    next.color = normalizeHexColor(next.color, "cor-base do material");
  }
  if (next.opacity !== undefined) {
    next.opacity = finiteRange(next.opacity, 0, 1, "opacidade do material");
  }
  return deepFreeze(next);
}

export function appearanceBindingIdentity(binding, context = {}) {
  const normalized = normalizeAppearanceBinding(binding, context);
  return JSON.stringify(normalized);
}

export function multiplyHexColors(left, right) {
  const a = parseHexColor(left);
  const b = parseHexColor(right);
  return `#${[0, 1, 2].map(index =>
    Math.round((a[index] * b[index]) / 255)
      .toString(16)
      .padStart(2, "0")
  ).join("")}`;
}

export function normalizeHexColor(value, label = "cor") {
  const text = String(value ?? "").trim().toLowerCase();
  if (!/^#[0-9a-f]{6}$/.test(text)) {
    throw new TypeError(`${label} inválida: ${value}.`);
  }
  return text;
}


function inferFamilyColors(family) {
  if (FAMILY_COLOR_INFERENCE.has(family)) {
    return FAMILY_COLOR_INFERENCE.get(family);
  }
  const colors = family.colors;
  const first = normalizePackedColor(colors[0]);
  let uniform = true;
  for (let index = 1; index < colors.length; index += 1) {
    if (normalizePackedColor(colors[index]) !== first) {
      uniform = false;
      break;
    }
  }
  const result = Object.freeze({
    uniform,
    color: uniform ? packedColorToHex(first) : null
  });
  FAMILY_COLOR_INFERENCE.set(family, result);
  return result;
}
function validHexColor(value) {
  return /^#[0-9a-f]{6}$/i.test(String(value ?? "").trim());
}

function parseHexColor(value) {
  const text = normalizeHexColor(value);
  return [
    Number.parseInt(text.slice(1, 3), 16),
    Number.parseInt(text.slice(3, 5), 16),
    Number.parseInt(text.slice(5, 7), 16)
  ];
}

function normalizePackedColor(value) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0 || number > 0xffffff) {
    throw new TypeError(`Cor compactada inválida: ${value}.`);
  }
  return number;
}

function packedColorToHex(value) {
  return `#${Number(value).toString(16).padStart(6, "0")}`;
}

function normalizeEnum(value, allowed, label) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!allowed.includes(normalized)) {
    throw new RangeError(`${label} desconhecido: ${value}.`);
  }
  return normalized;
}

function finiteRange(value, minimum, maximum, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < minimum || number > maximum) {
    throw new RangeError(
      `${label} deve estar entre ${minimum} e ${maximum}.`
    );
  }
  return number;
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
