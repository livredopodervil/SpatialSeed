const PARAMETER_TYPES = new Set([
  "boolean",
  "color",
  "enum",
  "integer",
  "number",
  "optional-boolean",
  "string"
]);

export class EditToolRegistry {
  static apiVersion = "edit-tool-registry-v2";

  #definitions = new Map();

  register(definition) {
    const normalized = normalizeDefinition(definition);
    if (this.#definitions.has(normalized.id)) {
      throw new Error(`Ferramenta já registrada: ${normalized.id}.`);
    }
    this.#definitions.set(normalized.id, normalized);
    return this;
  }

  has(toolId) {
    return this.#definitions.has(normalizeId(toolId));
  }

  definition(toolId) {
    const id = normalizeId(toolId);
    const definition = this.#definitions.get(id);
    if (!definition) {
      throw new Error(`Ferramenta não registrada: ${id}.`);
    }
    return definition;
  }

  describe(toolId = null) {
    if (toolId !== null && toolId !== undefined) {
      return deepFreeze(structuredClone(this.definition(toolId)));
    }
    return Object.freeze(
      [...this.#definitions.values()].map(definition =>
        deepFreeze(structuredClone(definition))
      )
    );
  }

  defaults(toolId) {
    return Object.freeze(Object.fromEntries(
      this.definition(toolId).parameters.map(parameter => [
        parameter.id,
        structuredClone(parameter.default)
      ])
    ));
  }

  normalize(toolId, values = {}, { base = null } = {}) {
    const definition = this.definition(toolId);
    const source = values && typeof values === "object" && !Array.isArray(values)
      ? values
      : {};
    const current = base && typeof base === "object" && !Array.isArray(base)
      ? base
      : {};
    return Object.freeze(Object.fromEntries(
      definition.parameters.map(parameter => {
        const candidate = source[parameter.id] !== undefined
          ? source[parameter.id]
          : current[parameter.id] !== undefined
            ? current[parameter.id]
            : parameter.default;
        return [parameter.id, normalizeParameterValue(parameter, candidate)];
      })
    ));
  }

  normalizePatch(toolId, patch = {}) {
    const definition = this.definition(toolId);
    const source = patch && typeof patch === "object" && !Array.isArray(patch)
      ? patch
      : {};
    const known = new Set(definition.parameters.map(parameter => parameter.id));
    const unknown = Object.keys(source).filter(id => !known.has(id));
    if (unknown.length) {
      throw new Error(
        `Parâmetro desconhecido em ${definition.id}: ${unknown.join(", ")}.`
      );
    }
    const values = {};
    for (const parameter of definition.parameters) {
      if (source[parameter.id] === undefined) continue;
      values[parameter.id] = normalizeParameterValue(
        parameter,
        source[parameter.id]
      );
    }
    return Object.freeze(values);
  }
}

function normalizeDefinition(definition) {
  if (!definition || typeof definition !== "object" || Array.isArray(definition)) {
    throw new TypeError("Definição de ferramenta inválida.");
  }
  const id = normalizeId(definition.id);
  const parameters = [];
  const parameterIds = new Set();
  for (const source of definition.parameters ?? []) {
    const parameter = normalizeParameter(source);
    if (parameterIds.has(parameter.id)) {
      throw new Error(`Parâmetro duplicado em ${id}: ${parameter.id}.`);
    }
    parameterIds.add(parameter.id);
    parameters.push(parameter);
  }
  return Object.freeze({
    id,
    label: String(definition.label ?? id),
    family: String(definition.family ?? "general"),
    command: definition.command === null
      ? null
      : String(definition.command ?? id),
    lifecycle: String(definition.lifecycle ?? "single-shot"),
    parameters: Object.freeze(parameters)
  });
}

function normalizeParameter(source) {
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    throw new TypeError("Descritor de parâmetro inválido.");
  }
  const id = normalizeId(source.id);
  const type = String(source.type ?? "string").toLowerCase();
  if (!PARAMETER_TYPES.has(type)) {
    throw new TypeError(`Tipo de parâmetro desconhecido em ${id}: ${type}.`);
  }
  const options = type === "enum"
    ? Object.freeze((source.options ?? []).map(option => Object.freeze(
        typeof option === "object" && option !== null
          ? {
              value: String(option.value),
              label: String(option.label ?? option.value)
            }
          : { value: String(option), label: String(option) }
      )))
    : Object.freeze([]);
  if (type === "enum" && !options.length) {
    throw new TypeError(`Parâmetro enum sem opções: ${id}.`);
  }
  const parameter = {
    id,
    label: String(source.label ?? id),
    description: source.description === undefined
      ? null
      : String(source.description),
    type,
    default: structuredClone(source.default),
    minimum: optionalFinite(source.minimum, `${id}.minimum`),
    maximum: optionalFinite(source.maximum, `${id}.maximum`),
    step: source.step === undefined ? null : String(source.step),
    options,
    when: normalizeCondition(source.when)
  };
  parameter.default = normalizeParameterValue(parameter, parameter.default);
  return Object.freeze(parameter);
}

function normalizeParameterValue(parameter, value) {
  if (parameter.type === "boolean") {
    if (typeof value === "boolean") return value;
    if (["true", "on", "1", "yes", "sim"].includes(
      String(value).toLowerCase()
    )) return true;
    if (["false", "off", "0", "no", "não", "nao"].includes(
      String(value).toLowerCase()
    )) return false;
    throw new TypeError(`${parameter.label} deve ser verdadeiro ou falso.`);
  }
  if (parameter.type === "optional-boolean") {
    if (value === null || value === undefined || value === "auto") return null;
    if (typeof value === "boolean") return value;
    if (["true", "on", "closed"].includes(String(value).toLowerCase())) {
      return true;
    }
    if (["false", "off", "open"].includes(String(value).toLowerCase())) {
      return false;
    }
    throw new TypeError(`${parameter.label} deve ser automático, aberto ou fechado.`);
  }
  if (parameter.type === "integer") {
    const number = Number(value);
    if (!Number.isInteger(number)) {
      throw new TypeError(`${parameter.label} deve ser inteiro.`);
    }
    assertRange(parameter, number);
    return number;
  }
  if (parameter.type === "number") {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      throw new TypeError(`${parameter.label} deve ser um número finito.`);
    }
    assertRange(parameter, number);
    return number;
  }
  if (parameter.type === "enum") {
    const normalized = String(value);
    if (!parameter.options.some(option => option.value === normalized)) {
      throw new RangeError(
        `${parameter.label} deve ser um de: ${
          parameter.options.map(option => option.value).join(", ")
        }.`
      );
    }
    return normalized;
  }
  const normalized = String(value ?? "");
  if (parameter.type === "color" &&
      !/^#[0-9a-f]{6}$/i.test(normalized)) {
    throw new TypeError(`${parameter.label} deve usar a forma #rrggbb.`);
  }
  return normalized;
}

function assertRange(parameter, value) {
  if (parameter.minimum !== null && value < parameter.minimum) {
    throw new RangeError(
      `${parameter.label} deve ser maior ou igual a ${parameter.minimum}.`
    );
  }
  if (parameter.maximum !== null && value > parameter.maximum) {
    throw new RangeError(
      `${parameter.label} deve ser menor ou igual a ${parameter.maximum}.`
    );
  }
}

function normalizeCondition(value) {
  if (value === undefined || value === null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Condição de parâmetro inválida.");
  }
  const entries = Object.entries(value);
  if (!entries.length) {
    throw new TypeError("Condição de parâmetro deve conter ao menos uma igualdade.");
  }
  return Object.freeze(Object.fromEntries(entries.map(([id, expected]) => [
    normalizeId(id),
    structuredClone(expected)
  ])));
}

function normalizeId(value) {
  const id = String(value ?? "").trim();
  if (!id) throw new TypeError("Identificador ausente.");
  return id;
}

function optionalFinite(value, name) {
  if (value === undefined || value === null) return null;
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new TypeError(`${name} inválido.`);
  }
  return number;
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  for (const item of Object.values(value)) deepFreeze(item);
  return Object.freeze(value);
}
