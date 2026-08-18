import { normalizeHexColor } from "./ColorCodec.js";
import { PropertyRegistry } from "./PropertyRegistry.js";
import {
  appearanceBindingForObject,
  effectiveAppearanceColor
} from "../../appearance-binding/src/index.js?build=20260818-0054mv";

export function createDefaultPropertyRegistry({ geometryRegistry = null } = {}) {
  const registry = new PropertyRegistry()
    .register(property({
      id: "object.name",
      label: "Nome",
      group: "object",
      scope: "object",
      path: ["name"],
      valueType: "string",
      editableMany: false,
      normalize: nonEmptyString,
      read: object => object.name ?? object.id
    }))
    .register(property({
      id: "transform.position",
      label: "Posição",
      group: "transform",
      scope: "object",
      path: ["position"],
      valueType: "vector3",
      editableMany: false,
      procedural: true,
      normalize: value => vector(value, 3),
      read: object => [...(object.position ?? [0, 0, 0])]
    }))
    .register(property({
      id: "transform.rotationDeg",
      label: "Rotação °",
      group: "transform",
      scope: "object",
      path: ["rotation"],
      valueType: "vector3",
      editableMany: false,
      procedural: true,
      normalize: value => vector(value, 3),
      read: object => quaternionToEuler(
        object.rotation ?? [0, 0, 0, 1]
      ),
      write: (patch, value) => {
        patch.rotation = eulerToQuaternion(value);
      }
    }))
    .register(property({
      id: "transform.scale",
      label: "Escala",
      group: "transform",
      scope: "object",
      path: ["scale"],
      valueType: "vector3",
      procedural: true,
      normalize: value => nonZeroVector(value, 3),
      read: object => [...(object.scale ?? [1, 1, 1])]
    }))
    .register(property({
      id: "geometry.size",
      label: "Dimensões",
      group: "geometry",
      scope: "object",
      path: ["size"],
      valueType: "vector3",
      procedural: true,
      minimum: 0.001,
      normalize: value => positiveVector(value, 3),
      supports: object =>
        object?.kind === "box" && (
          Array.isArray(object.size) ||
          geometryTypeOf(geometryRegistry, object) === "box"
        ),
      read: object => [...(
        object.size ?? geometryRegistry.describeLegacyObject(object).size
      )],
      write: (patch, value, { object }) => {
        if (object.geometry && geometryRegistry) {
          patch.geometry = geometryRegistry.normalize({
            ...geometryRegistry.describeLegacyObject(object),
            size: value
          });
        } else {
          patch.size = value;
        }
      }
    }))
    .register(property({
      id: "camera.fov",
      label: "Campo visual °",
      group: "camera",
      scope: "object",
      path: ["camera", "fov"],
      valueType: "number",
      normalize: value => boundedNumber(value, 1, 179),
      supports: object => object?.kind === "camera",
      read: object => Number(object.camera?.fov ?? 55)
    }))
    .register(property({
      id: "camera.near",
      label: "Plano near",
      group: "camera",
      scope: "object",
      path: ["camera", "near"],
      valueType: "number",
      normalize: positiveNumber,
      supports: object => object?.kind === "camera",
      read: object => Number(object.camera?.near ?? 0.1)
    }))
    .register(property({
      id: "camera.far",
      label: "Plano far",
      group: "camera",
      scope: "object",
      path: ["camera", "far"],
      valueType: "number",
      normalize: positiveNumber,
      supports: object => object?.kind === "camera",
      read: object => Number(object.camera?.far ?? 1000)
    }))
    .register(property({
      id: "camera.focusDistance",
      label: "Distância de foco",
      group: "camera",
      scope: "object",
      path: ["camera", "focusDistance"],
      valueType: "number",
      normalize: positiveNumber,
      supports: object => object?.kind === "camera",
      read: object => Number(object.camera?.focusDistance ?? 10)
    }))
    .register(property({
      id: "light.type",
      label: "Tipo de luz",
      group: "light",
      scope: "object",
      path: ["light", "type"],
      valueType: "enum",
      values: ["point", "directional", "spot", "ambient"],
      normalize: value => enumValue(value, ["point", "directional", "spot", "ambient"]),
      supports: object => object?.kind === "light",
      read: object => object.light?.type ?? "point"
    }))
    .register(property({
      id: "light.color",
      label: "Cor da luz",
      group: "light",
      scope: "object",
      path: ["light", "color"],
      valueType: "color",
      normalize: normalizeHexColor,
      supports: object => object?.kind === "light",
      read: object => object.light?.color ?? "#ffffff"
    }))
    .register(property({
      id: "light.intensity",
      label: "Intensidade",
      group: "light",
      scope: "object",
      path: ["light", "intensity"],
      valueType: "number",
      normalize: nonNegativeNumber,
      supports: object => object?.kind === "light",
      read: object => Number(object.light?.intensity ?? 3)
    }))
    .register(property({
      id: "light.distance",
      label: "Distância",
      group: "light",
      scope: "object",
      path: ["light", "distance"],
      valueType: "number",
      normalize: nonNegativeNumber,
      supports: object => object?.kind === "light",
      read: object => Number(object.light?.distance ?? 0)
    }))
    .register(property({
      id: "light.decay",
      label: "Decaimento",
      group: "light",
      scope: "object",
      path: ["light", "decay"],
      valueType: "number",
      normalize: nonNegativeNumber,
      supports: object => object?.kind === "light",
      read: object => Number(object.light?.decay ?? 2)
    }))
    .register(property({
      id: "light.angleDeg",
      label: "Ângulo °",
      group: "light",
      scope: "object",
      path: ["light", "angleDeg"],
      valueType: "number",
      normalize: value => boundedNumber(value, 1, 179),
      supports: object => object?.kind === "light",
      read: object => Number(object.light?.angleDeg ?? 45)
    }))
    .register(property({
      id: "light.penumbra",
      label: "Penumbra",
      group: "light",
      scope: "object",
      path: ["light", "penumbra"],
      valueType: "number",
      normalize: value => boundedNumber(value, 0, 1),
      supports: object => object?.kind === "light",
      read: object => Number(object.light?.penumbra ?? 0.2)
    }))
    .register(property({
      id: "light.castShadow",
      label: "Projetar sombra",
      group: "light",
      scope: "object",
      path: ["light", "castShadow"],
      valueType: "boolean",
      normalize: booleanValue,
      supports: object => object?.kind === "light",
      read: object => Boolean(object.light?.castShadow ?? true)
    }))
    .register(property({
      id: "appearance.model",
      label: "Modelo",
      group: "appearance",
      scope: "appearance",
      path: ["model"],
      valueType: "enum",
      values: ["standard", "physical"],
      normalize: value => enumValue(value, ["standard", "physical"]),
      read: (object, context) => context.material(object).model ?? "standard"
    }))
    .register(property({
      id: "appearance.roughness",
      label: "Rugosidade",
      group: "appearance",
      scope: "appearance",
      path: ["parameters", "roughness"],
      valueType: "number",
      procedural: true,
      normalize: value => boundedNumber(value, 0, 1),
      read: (object, context) => context.material(object).parameters?.roughness ?? 0.55
    }))
    .register(property({
      id: "appearance.metalness",
      label: "Metallicidade",
      group: "appearance",
      scope: "appearance",
      path: ["parameters", "metalness"],
      valueType: "number",
      procedural: true,
      normalize: value => boundedNumber(value, 0, 1),
      read: (object, context) => context.material(object).parameters?.metalness ?? 0
    }))
    .register(property({
      id: "appearance.transmission",
      label: "Transmissão",
      group: "appearance",
      scope: "appearance",
      path: ["parameters", "transmission"],
      valueType: "number",
      procedural: true,
      normalize: value => boundedNumber(value, 0, 1),
      read: (object, context) => context.material(object).parameters?.transmission ?? 0
    }))
    .register(property({
      id: "appearance.ior",
      label: "Índice de refração",
      group: "appearance",
      scope: "appearance",
      path: ["parameters", "ior"],
      valueType: "number",
      normalize: value => boundedNumber(value, 1, 2.333),
      read: (object, context) => context.material(object).parameters?.ior ?? 1.5
    }))
    .register(property({
      id: "appearance.thickness",
      label: "Espessura óptica",
      group: "appearance",
      scope: "appearance",
      path: ["parameters", "thickness"],
      valueType: "number",
      normalize: nonNegativeNumber,
      read: (object, context) => context.material(object).parameters?.thickness ?? 0.5
    }))
    .register(property({
      id: "appearance.dispersion",
      label: "Dispersão",
      group: "appearance",
      scope: "appearance",
      path: ["parameters", "dispersion"],
      valueType: "number",
      normalize: nonNegativeNumber,
      read: (object, context) => context.material(object).parameters?.dispersion ?? 0
    }))
    .register(property({
      id: "appearance.clearcoat",
      label: "Verniz",
      group: "appearance",
      scope: "appearance",
      path: ["parameters", "clearcoat"],
      valueType: "number",
      normalize: value => boundedNumber(value, 0, 1),
      read: (object, context) => context.material(object).parameters?.clearcoat ?? 0
    }))
    .register(property({
      id: "appearance.envMapIntensity",
      label: "Reflexo ambiente",
      group: "appearance",
      scope: "appearance",
      path: ["parameters", "envMapIntensity"],
      valueType: "number",
      normalize: nonNegativeNumber,
      read: (object, context) => context.material(object).parameters?.envMapIntensity ?? 1
    }))
    .register(property({
      id: "appearance.color",
      label: "Cor-base do material",
      group: "appearance",
      scope: "appearance",
      path: ["color"],
      valueType: "color",
      procedural: true,
      normalize: normalizeHexColor,
      read: (object, context) => context.material(object).color
    }))
    .register(property({
      id: "appearance.opacity",
      label: "Opacidade",
      group: "appearance",
      scope: "appearance",
      path: ["opacity"],
      valueType: "number",
      procedural: true,
      normalize: value => boundedNumber(value, 0, 1),
      read: (object, context) => context.material(object).opacity ?? 1
    }))
    .register(property({
      id: "appearance.transparent",
      label: "Transparente",
      group: "appearance",
      scope: "appearance",
      path: ["transparent"],
      valueType: "boolean",
      normalize: booleanValue,
      read: (object, context) => Boolean(context.material(object).transparent)
    }))
    .register(property({
      id: "texture.src",
      label: "Fonte da textura",
      group: "texture",
      scope: "appearance",
      path: ["texture", "src"],
      valueType: "uri",
      nullable: true,
      normalize: nullableString,
      read: (object, context) => context.material(object).texture?.src ?? null
    }))
    .register(property({
      id: "texture.repeat",
      label: "Repetição",
      group: "texture",
      scope: "appearance",
      path: ["texture", "repeat"],
      valueType: "vector2",
      procedural: true,
      normalize: value => vector(value, 2),
      read: (object, context) => context.textureTransform(object).repeat
    }))
    .register(property({
      id: "texture.offset",
      label: "Deslocamento",
      group: "texture",
      scope: "appearance",
      path: ["texture", "offset"],
      valueType: "vector2",
      procedural: true,
      normalize: value => vector(value, 2),
      read: (object, context) => context.textureTransform(object).offset
    }))
    .register(property({
      id: "texture.rotationDeg",
      label: "Rotação da textura",
      group: "texture",
      scope: "appearance",
      path: ["texture", "rotationDeg"],
      valueType: "number",
      procedural: true,
      normalize: finiteNumber,
      read: (object, context) => context.textureTransform(object).rotationDeg
    }))
    .register(property({
      id: "texture.wrap",
      label: "Repetição nas bordas",
      group: "texture",
      scope: "appearance",
      path: ["texture", "wrap"],
      valueType: "enum",
      values: ["repeat", "clamp", "mirror"],
      normalize: value => enumValue(value, ["repeat", "clamp", "mirror"]),
      read: (object, context) => context.textureTransform(object).wrap
    }))
    .register(property({
      id: "appearance.colorMode",
      label: "Fonte da cor",
      group: "appearance-binding",
      scope: "appearance-binding",
      path: ["colorMode"],
      valueType: "enum",
      values: ["inherit", "uniform", "per-instance"],
      normalize: value => enumValue(
        value,
        ["inherit", "uniform", "per-instance"]
      ),
      read: object => appearanceBindingForObject(object).colorMode
    }))
    .register(property({
      id: "appearance.uniformColor",
      label: "Cor uniforme",
      group: "appearance-binding",
      scope: "appearance-binding",
      path: ["uniformColor"],
      valueType: "color",
      normalize: normalizeHexColor,
      write: (patch, value) => {
        patch.uniformColor = value;
        patch.colorMode = "uniform";
      },
      read: object => appearanceBindingForObject(object).uniformColor ?? null
    }))
    .register(property({
      id: "appearance.tint",
      label: "Matiz final",
      group: "appearance-binding",
      scope: "appearance-binding",
      path: ["tint"],
      valueType: "color",
      procedural: true,
      normalize: normalizeHexColor,
      read: object => appearanceBindingForObject(object).tint
    }))
    .register(property({
      id: "appearance.effectiveColor",
      label: "Cor efetiva",
      group: "appearance-binding",
      scope: "derived",
      path: [],
      valueType: "color",
      writable: false,
      normalize: normalizeHexColor,
      read: (object, context) => effectiveAppearanceColor(
        appearanceBindingForObject(object),
        {
          baseColor: context.material(object)?.color ?? "#ffffff",
          instanceColor: object.instanceState?.color ?? null
        }
      )
    }))
    .register(property({
      id: "instance.color",
      label: "Cor própria da instância",
      group: "instance",
      scope: "instance",
      path: ["color"],
      valueType: "color",
      procedural: true,
      nullable: true,
      normalize: value => value === null || value === ""
        ? null
        : normalizeHexColor(value),
      read: object => object.instanceState?.color ?? null
    }));

  return registerGeometryProperties(registry, geometryRegistry);
}

export function registerGeometryProperties(registry, geometryRegistry) {
  if (!geometryRegistry || typeof geometryRegistry.describe !== "function") {
    return registry;
  }

  for (const geometry of geometryRegistry.describe()) {
    for (const parameter of geometry.parameters ?? []) {
      if (geometry.type === "box" && parameter.id === "size") continue;
      registry.register(geometryProperty({
        geometryRegistry,
        geometry,
        parameter
      }));
    }
  }
  return registry;
}

function geometryProperty({ geometryRegistry, geometry, parameter }) {
  const valueType = geometryPropertyValueType(parameter.type);
  return property({
    id: `geometry.${geometry.type}.${parameter.id}`,
    label: parameter.label,
    group: "geometry",
    scope: "object",
    path: ["geometry", parameter.id],
    valueType,
    values: parameter.options ?? parameter.values ?? null,
    minimum: parameter.minimum,
    maximum: parameter.maximum,
    step: parameter.step,
    unit: parameter.unit,
    integer: ["integer", "integer-vector3"].includes(parameter.type),
    procedural: ["number", "vector3"].includes(parameter.type),
    normalize: value => normalizeGeometryParameter(parameter, value),
    supports: object => geometryTypeOf(geometryRegistry, object) === geometry.type,
    read: object => geometryRegistry.describeLegacyObject(object)[parameter.id],
    write: (patch, value, { object }) => {
      const current = patch.geometry ??
        geometryRegistry.describeLegacyObject(object);
      const normalized = geometryRegistry.normalize({
        ...current,
        [parameter.id]: value
      });
      if (!object.geometry && object.kind === "box") {
        patch.size = normalized.size;
        if (parameter.id !== "size") patch.geometry = normalized;
      } else {
        patch.geometry = normalized;
      }
    }
  });
}

function geometryTypeOf(geometryRegistry, object) {
  const explicit = String(object?.geometry?.type ?? "").trim().toLowerCase();
  if (explicit && geometryRegistry?.has?.(explicit)) return explicit;
  if (
    object?.kind === "box" &&
    Array.isArray(object.size) &&
    geometryRegistry?.has?.("box")
  ) {
    return "box";
  }
  return null;
}

function geometryPropertyValueType(type) {
  if (type === "integer") return "number";
  if (type === "integer-vector3") return "vector3";
  if (["number", "boolean", "vector3", "json", "enum"].includes(type)) {
    return type;
  }
  return "string";
}

function normalizeGeometryParameter(parameter, value) {
  const type = String(parameter.type ?? "string");
  if (type === "number" || type === "integer") {
    const number = boundedGeometryNumber(parameter, value);
    if (type === "integer" && !Number.isInteger(number)) {
      throw new TypeError(`${parameter.id} deve ser inteiro.`);
    }
    return number;
  }
  if (type === "vector3" || type === "integer-vector3") {
    const result = vector(value, 3).map(component =>
      boundedGeometryNumber(parameter, component)
    );
    if (type === "integer-vector3" && result.some(value => !Number.isInteger(value))) {
      throw new TypeError(`${parameter.id} deve conter inteiros.`);
    }
    return result;
  }
  if (type === "boolean") return booleanValue(value);
  if (type === "enum") {
    return enumValue(value, parameter.options ?? parameter.values ?? []);
  }
  if (type === "json") {
    if (value === null || typeof value !== "object") {
      throw new TypeError(`${parameter.id} deve ser JSON estruturado.`);
    }
    return structuredClone(value);
  }
  return String(value);
}

function boundedGeometryNumber(parameter, value) {
  const number = finiteNumber(value);
  if (parameter.minimum != null && number < Number(parameter.minimum)) {
    throw new RangeError(`${parameter.id} deve ser ≥ ${parameter.minimum}.`);
  }
  if (parameter.maximum != null && number > Number(parameter.maximum)) {
    throw new RangeError(`${parameter.id} deve ser ≤ ${parameter.maximum}.`);
  }
  return number;
}

function property(input) {
  return {
    editableMany: true,
    supports: ["appearance", "appearance-binding", "derived", "instance"].includes(input.scope)
      ? object => Boolean(object?.id) &&
          !["group", "camera", "light"].includes(object.kind)
      : object => Boolean(object?.id),
    ...input
  };
}

function nonEmptyString(value) {
  const result = String(value ?? "").trim();
  if (!result) throw new TypeError("Texto não pode ser vazio.");
  return result;
}

function nullableString(value) {
  if (value === null || value === "") return null;
  const result = String(value).trim();
  return result || null;
}

function finiteNumber(value) {
  const result = Number(value);
  if (!Number.isFinite(result)) throw new TypeError("Número inválido.");
  return result;
}

function boundedNumber(value, minimum, maximum) {
  const result = finiteNumber(value);
  if (result < minimum || result > maximum) {
    throw new RangeError(`Número fora do intervalo ${minimum}–${maximum}.`);
  }
  return result;
}

function nonNegativeNumber(value) {
  const result = finiteNumber(value);
  if (result < 0) throw new RangeError("Número não pode ser negativo.");
  return result;
}

function positiveNumber(value) {
  const result = finiteNumber(value);
  if (!(result > 0)) {
    throw new RangeError("Número precisa ser positivo.");
  }
  return result;
}

function booleanValue(value) {
  if (value === true || value === false) return value;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new TypeError("Valor booleano inválido.");
}

function vector(value, length) {
  if (!Array.isArray(value) || value.length !== length) {
    throw new TypeError(`Vetor deve ter ${length} componentes.`);
  }
  return value.map(finiteNumber);
}

function positiveVector(value, length) {
  const result = vector(value, length);
  if (result.some(component => component <= 0)) {
    throw new RangeError("Todos os componentes devem ser positivos.");
  }
  return result;
}

function nonZeroVector(value, length) {
  const result = vector(value, length);
  if (result.some(component => component === 0)) {
    throw new RangeError(
      "Escala zero não é permitida; valores negativos representam espelho."
    );
  }
  return result;
}

function enumValue(value, values) {
  const result = String(value);
  if (!values.includes(result)) {
    throw new TypeError(`Valor deve ser um de: ${values.join(", ")}.`);
  }
  return result;
}

function eulerToQuaternion([xDegrees, yDegrees, zDegrees]) {
  const x = xDegrees * Math.PI / 180;
  const y = yDegrees * Math.PI / 180;
  const z = zDegrees * Math.PI / 180;
  const c1 = Math.cos(x / 2);
  const c2 = Math.cos(y / 2);
  const c3 = Math.cos(z / 2);
  const s1 = Math.sin(x / 2);
  const s2 = Math.sin(y / 2);
  const s3 = Math.sin(z / 2);

  return [
    s1 * c2 * c3 + c1 * s2 * s3,
    c1 * s2 * c3 - s1 * c2 * s3,
    c1 * c2 * s3 + s1 * s2 * c3,
    c1 * c2 * c3 - s1 * s2 * s3
  ];
}

function quaternionToEuler([x, y, z, w]) {
  const roll = Math.atan2(
    2 * (w * x + y * z),
    1 - 2 * (x * x + y * y)
  );
  const sinPitch = 2 * (w * y - z * x);
  const pitch = Math.abs(sinPitch) >= 1
    ? Math.sign(sinPitch) * Math.PI / 2
    : Math.asin(sinPitch);
  const yaw = Math.atan2(
    2 * (w * z + x * y),
    1 - 2 * (y * y + z * z)
  );

  return [roll, pitch, yaw].map(radians =>
    radians * 180 / Math.PI
  );
}
