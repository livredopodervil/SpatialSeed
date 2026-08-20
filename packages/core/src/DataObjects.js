export const DATA_OBJECTS_VERSION = "spatialseed-data-objects-v1";

const EMPTY_DATA_OBJECT_ITEMS = Object.freeze([]);
const EMPTY_DATA_OBJECT_DOCUMENT = Object.freeze({
  version: DATA_OBJECTS_VERSION,
  items: EMPTY_DATA_OBJECT_ITEMS
});

export function emptyDataObjectDocument() {
  return EMPTY_DATA_OBJECT_DOCUMENT;
}

export function normalizeDataObjectDocument(source = null) {
  if (source === null || source === undefined) return EMPTY_DATA_OBJECT_DOCUMENT;
  const value = source && typeof source === "object" ? source : {};
  if (
    Object.isFrozen(value) &&
    value.version === DATA_OBJECTS_VERSION &&
    Array.isArray(value.items) &&
    Object.isFrozen(value.items) &&
    value.items.every(item => Object.isFrozen(item) && item?.kind === "data")
  ) {
    return value;
  }
  const version = value.version == null
    ? DATA_OBJECTS_VERSION
    : String(value.version);
  if (version !== DATA_OBJECTS_VERSION) {
    throw new Error(`Versão de DataObjects incompatível: ${version}.`);
  }
  const input = value.items == null ? [] : value.items;
  if (!Array.isArray(input)) {
    throw new TypeError("DataObjects.items deve ser uma lista.");
  }
  const ids = new Set();
  const items = input.map((entry, index) => {
    const object = normalizeDataObject(entry, { index });
    if (ids.has(object.id)) {
      throw new Error(`DataObject duplicado: ${object.id}.`);
    }
    ids.add(object.id);
    return object;
  });
  if (!items.length) return EMPTY_DATA_OBJECT_DOCUMENT;
  return Object.freeze({
    version: DATA_OBJECTS_VERSION,
    items: Object.freeze(items)
  });
}

export function normalizeDataObject(source = {}, { index = null } = {}) {
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    throw new TypeError(
      index == null
        ? "DataObject inválido."
        : `DataObject inválido no índice ${index}.`
    );
  }
  const id = String(source.id ?? "").trim();
  if (!id) {
    throw new TypeError(
      index == null
        ? "DataObject exige id."
        : `DataObject sem id no índice ${index}.`
    );
  }
  const kind = source.kind == null ? "data" : String(source.kind);
  if (kind !== "data") {
    throw new TypeError(`DataObject ${id} deve usar kind \"data\".`);
  }
  const dataType = String(source.dataType ?? "record").trim() || "record";
  return Object.freeze({
    id,
    kind: "data",
    name: String(source.name ?? id),
    dataType,
    value: portableDataValue(source.value ?? null, `valor de ${id}`),
    metadata: portableDataValue(source.metadata ?? {}, `metadata de ${id}`)
  });
}

export function portableDataValue(value, label = "valor de dados") {
  return deepFreezePortable(clonePortable(value, label, new Set()));
}

export function dataObjectDocumentEqual(left, right) {
  return portableDeepEqual(
    normalizeDataObjectDocument(left),
    normalizeDataObjectDocument(right)
  );
}

function clonePortable(value, label, seen) {
  if (value === null) return null;
  const type = typeof value;
  if (type === "string" || type === "boolean") return value;
  if (type === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError(`${label} deve conter apenas números finitos.`);
    }
    return value;
  }
  if (type !== "object") {
    throw new TypeError(`${label} deve conter apenas valores JSON portáteis.`);
  }
  if (seen.has(value)) {
    throw new TypeError(`${label} não pode conter referências cíclicas.`);
  }
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      return value.map((entry, index) =>
        clonePortable(entry, `${label}[${index}]`, seen)
      );
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError(`${label} deve conter apenas objetos JSON simples.`);
    }
    const result = {};
    for (const [key, entry] of Object.entries(value)) {
      result[String(key)] = clonePortable(entry, `${label}.${key}`, seen);
    }
    return result;
  } finally {
    seen.delete(value);
  }
}

function deepFreezePortable(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value)) deepFreezePortable(child);
  return Object.freeze(value);
}

function portableDeepEqual(left, right) {
  if (Object.is(left, right)) return true;
  if (typeof left !== typeof right || left === null || right === null) return false;
  if (typeof left !== "object") return false;
  if (Array.isArray(left) !== Array.isArray(right)) return false;
  if (Array.isArray(left)) {
    return left.length === right.length &&
      left.every((entry, index) => portableDeepEqual(entry, right[index]));
  }
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  return leftKeys.length === rightKeys.length && leftKeys.every(key =>
    Object.hasOwn(right, key) && portableDeepEqual(left[key], right[key])
  );
}
