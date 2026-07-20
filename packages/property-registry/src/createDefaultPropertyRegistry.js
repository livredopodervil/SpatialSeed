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
      normalize: value => positiveVector(value, 3),
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
      normalize: value => positiveVector(value, 3),
      supports: object =>
        object?.kind === "box" && Array.isArray(object.size),
      read: object => [...object.size]
    }))
    .register(property({
      id: "appearance.color",
      label: "Cor",
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
      id: "instance.color",
      label: "Cor da instância",
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
}

function property(input) {
  return {
    editableMany: true,
    supports: ["appearance", "instance"].includes(input.scope)
      ? object => Boolean(object?.id) && object.kind !== "group"
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
