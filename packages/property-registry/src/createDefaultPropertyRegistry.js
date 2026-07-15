import { normalizeHexColor } from "./ColorCodec.js";
import { PropertyRegistry } from "./PropertyRegistry.js";

export function createDefaultPropertyRegistry() {
  return new PropertyRegistry()
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
      id: "appearance.color",
      label: "Cor",
      group: "appearance",
      scope: "appearance",
      path: ["color"],
      valueType: "color",
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
      id: "instance.color",
      label: "Cor da instância",
      group: "instance",
      scope: "instance",
      path: ["color"],
      valueType: "color",
      nullable: true,
      normalize: value => value === null || value === ""
        ? null
        : normalizeHexColor(value),
      read: object => object.instanceState?.color ?? null
    }));
}

function property(input) {
  return {
    editableMany: true,
    supports: object => Boolean(object?.id),
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

function enumValue(value, values) {
  const result = String(value);
  if (!values.includes(result)) {
    throw new TypeError(`Valor deve ser um de: ${values.join(", ")}.`);
  }
  return result;
}
