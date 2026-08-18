export const INTERACTION_BINDINGS_VERSION = "spatialseed-interactions-v1";

const EVENT_ID = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/;
const MAX_BINDINGS = 4096;
const MAX_ACTIONS = 32;
const MAX_DEPTH = 32;

export function normalizeInteractionDocument(
  value = null,
  { allowedActionTypes = ["command"] } = {}
) {
  const source = Array.isArray(value)
    ? { bindings: value }
    : value && typeof value === "object"
      ? value
      : {};
  const version = source.version ?? INTERACTION_BINDINGS_VERSION;
  if (version !== INTERACTION_BINDINGS_VERSION) {
    throw new Error(`Versão de interações incompatível: ${version}.`);
  }
  const rawBindings = source.bindings ?? [];
  if (!Array.isArray(rawBindings)) {
    throw new TypeError("O documento de interações exige bindings em lista.");
  }
  if (rawBindings.length > MAX_BINDINGS) {
    throw new RangeError(`O documento excede ${MAX_BINDINGS} bindings.`);
  }
  const ids = new Set();
  const bindings = rawBindings.map((binding, index) => {
    const normalized = normalizeInteractionBinding(binding, {
      index,
      allowedActionTypes
    });
    if (ids.has(normalized.id)) {
      throw new Error(`Binding de interação duplicado: ${normalized.id}.`);
    }
    ids.add(normalized.id);
    return normalized;
  });
  return Object.freeze({
    version: INTERACTION_BINDINGS_VERSION,
    bindings: Object.freeze(bindings)
  });
}

export function normalizeInteractionBinding(
  value,
  { index = null, allowedActionTypes = ["command"] } = {}
) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(bindingMessage(index, "estrutura inválida"));
  }
  const id = requiredText(value.id, bindingMessage(index, "id ausente"));
  const event = normalizeInteractionEventId(value.event);
  const objectId = optionalText(value.objectId);
  const rawActions = value.actions ?? [];
  if (!Array.isArray(rawActions) || !rawActions.length) {
    throw new TypeError(bindingMessage(index, "ao menos uma ação é necessária"));
  }
  if (rawActions.length > MAX_ACTIONS) {
    throw new RangeError(bindingMessage(
      index,
      `mais de ${MAX_ACTIONS} ações`
    ));
  }
  return Object.freeze({
    id,
    event,
    objectId,
    enabled: value.enabled !== false,
    actions: Object.freeze(rawActions.map(action =>
      normalizeInteractionAction(action, { allowedActionTypes })
    ))
  });
}

export function normalizeInteractionAction(
  value,
  { allowedActionTypes = ["command"] } = {}
) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Ação de interação inválida.");
  }
  const type = requiredText(value.type ?? "command", "Tipo de ação ausente.");
  if (
    Array.isArray(allowedActionTypes) &&
    !allowedActionTypes.includes(type)
  ) {
    throw new TypeError(`Tipo de ação não permitido no documento: ${type}.`);
  }
  const portable = portableClone(value, "ação");
  portable.type = type;
  if (type === "command") {
    portable.command = requiredText(
      value.command,
      "Ação do tipo command exige um comando."
    );
    portable.args = portableClone(value.args ?? {}, "argumentos do comando");
  }
  return deepFreeze(portable);
}

export function normalizeInteractionEventId(value) {
  const event = requiredText(value, "Evento de interação ausente.")
    .toLocaleLowerCase("en-US");
  if (!EVENT_ID.test(event)) {
    throw new TypeError(`Identificador de evento inválido: ${event}.`);
  }
  return event;
}

export function portableInteractionValue(value, label = "valor") {
  return deepFreeze(portableClone(value, label));
}

function portableClone(value, label, depth = 0, ancestors = new Set()) {
  if (depth > MAX_DEPTH) {
    throw new RangeError(`${label} excede a profundidade portátil permitida.`);
  }
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError(`${label} contém número não finito.`);
    return value;
  }
  if (typeof value !== "object") {
    throw new TypeError(`${label} deve conter somente dados JSON portáteis.`);
  }
  if (ancestors.has(value)) {
    throw new TypeError(`${label} não pode conter ciclos.`);
  }
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return value.map(entry => portableClone(entry, label, depth + 1, ancestors));
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError(`${label} deve usar objetos JSON simples.`);
    }
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [
      String(key),
      portableClone(entry, label, depth + 1, ancestors)
    ]));
  } finally {
    ancestors.delete(value);
  }
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const entry of Object.values(value)) deepFreeze(entry);
  return Object.freeze(value);
}

function requiredText(value, message) {
  const text = String(value ?? "").trim();
  if (!text) throw new TypeError(message);
  if (text.length > 512) throw new RangeError(`${message} Limite: 512 caracteres.`);
  return text;
}

function optionalText(value) {
  if (value === null || value === undefined || value === "") return null;
  return requiredText(value, "Identificador de objeto inválido.");
}

function bindingMessage(index, detail) {
  return Number.isInteger(index)
    ? `Binding de interação ${index + 1}: ${detail}.`
    : `Binding de interação: ${detail}.`;
}
