import {
  normalizeHexColor
} from "../../property-registry/src/ColorCodec.js";

export const EXPERIMENT_DEFINITION_VERSION =
  "spatial-seed-experiment-v1";

const PARAMETER_TYPES = new Set([
  "number",
  "integer",
  "color",
  "select",
  "boolean"
]);

const CONTROL_TYPES = new Set([
  "number",
  "slider",
  "color",
  "select",
  "toggle"
]);

const CONTROL_BY_TYPE = Object.freeze({
  number: new Set(["number", "slider"]),
  integer: new Set(["number", "slider"]),
  color: new Set(["color"]),
  select: new Set(["select"]),
  boolean: new Set(["toggle"])
});

export class ExperimentRegistry {
  #definitions = new Map();

  register(input) {
    const definition = normalizeExperimentDefinition(input);

    if (this.#definitions.has(definition.id)) {
      throw new Error(`Experimento duplicado: ${definition.id}.`);
    }

    this.#definitions.set(definition.id, definition);
    return this;
  }

  has(id) {
    return this.#definitions.has(normalizeId(id, "id"));
  }

  get(id) {
    const normalizedId = normalizeId(id, "id");
    const definition = this.#definitions.get(normalizedId);

    if (!definition) {
      throw new Error(`Experimento desconhecido: ${normalizedId}.`);
    }

    return clone(definition, "Definição de experimento");
  }

  list() {
    return [...this.#definitions.values()]
      .map(definition => summarize(definition))
      .sort((left, right) =>
        left.title.localeCompare(right.title, "pt-BR")
      );
  }

  describe(id = null) {
    if (id === null || id === undefined || String(id).trim() === "") {
      return this.list();
    }

    return this.get(id);
  }

  resolveParameters(id, input = {}) {
    const definition = this.get(id);
    const values = normalizeRecord(input, "Parâmetros");
    const allowed = new Set(
      definition.parameters.map(parameter => parameter.id)
    );

    for (const name of Object.keys(values)) {
      if (!allowed.has(name)) {
        throw new Error(
          `Parâmetro desconhecido em ${definition.id}: ${name}.`
        );
      }
    }

    return deepFreeze(Object.fromEntries(
      definition.parameters.map(parameter => [
        parameter.id,
        normalizeParameterValue(
          parameter,
          Object.hasOwn(values, parameter.id)
            ? values[parameter.id]
            : parameter.default
        )
      ])
    ));
  }
}

export function normalizeExperimentDefinition(input) {
  const source = normalizeRecord(input, "Definição de experimento");
  const apiVersion = String(
    source.apiVersion ?? EXPERIMENT_DEFINITION_VERSION
  );

  if (apiVersion !== EXPERIMENT_DEFINITION_VERSION) {
    throw new Error(
      `Versão de experimento incompatível: ${apiVersion}.`
    );
  }

  const id = normalizeId(source.id, "id");
  const title = nonEmptyString(source.title, "title");
  const description = optionalString(source.description);
  const tags = normalizeTags(source.tags ?? []);
  const parameters = normalizeParameters(source.parameters ?? []);
  const program = normalizeProgram(source.program);

  return deepFreeze({
    apiVersion,
    id,
    title,
    description,
    tags,
    parameters,
    program
  });
}

function normalizeParameters(values) {
  if (!Array.isArray(values)) {
    throw new TypeError("parameters deve formar uma lista.");
  }

  const ids = new Set();
  return values.map((value, index) => {
    const parameter = normalizeParameter(value, index);

    if (ids.has(parameter.id)) {
      throw new Error(`Parâmetro duplicado: ${parameter.id}.`);
    }

    ids.add(parameter.id);
    return parameter;
  });
}

function normalizeParameter(input, index) {
  const source = normalizeRecord(
    input,
    `parameters[${index}]`
  );
  const id = normalizeId(source.id, `parameters[${index}].id`);
  const type = String(source.type ?? "number").toLowerCase();

  if (!PARAMETER_TYPES.has(type)) {
    throw new Error(`Tipo de parâmetro desconhecido: ${type}.`);
  }

  const control = String(
    source.control ?? defaultControl(type)
  ).toLowerCase();

  if (!CONTROL_TYPES.has(control) || !CONTROL_BY_TYPE[type].has(control)) {
    throw new Error(
      `Controle ${control} incompatível com parâmetro ${type}.`
    );
  }

  const parameter = {
    id,
    label: nonEmptyString(source.label ?? id, `${id}.label`),
    type,
    control
  };

  if (source.help !== undefined) {
    parameter.help = optionalString(source.help);
  }

  if (type === "number" || type === "integer") {
    Object.assign(parameter, normalizeNumericParameter(source, type, id));
  } else if (type === "color") {
    parameter.default = normalizeHexColor(source.default ?? "#6699cc");
  } else if (type === "boolean") {
    parameter.default = normalizeBoolean(source.default ?? false, id);
  } else {
    Object.assign(parameter, normalizeSelectParameter(source, id));
  }

  return deepFreeze(parameter);
}

function normalizeNumericParameter(source, type, id) {
  const minimum = optionalFinite(source.min, `${id}.min`);
  const maximum = optionalFinite(source.max, `${id}.max`);
  const step = optionalFinite(source.step, `${id}.step`);

  if (minimum !== null && maximum !== null && minimum > maximum) {
    throw new RangeError(`${id}: min não pode exceder max.`);
  }
  if (step !== null && step <= 0) {
    throw new RangeError(`${id}.step deve ser positivo.`);
  }

  const result = {
    default: normalizeNumericValue(
      source.default ?? (minimum ?? 0),
      { id, type, min: minimum, max: maximum }
    )
  };
  if (minimum !== null) result.min = minimum;
  if (maximum !== null) result.max = maximum;
  if (step !== null) result.step = step;
  return result;
}

function normalizeSelectParameter(source, id) {
  if (!Array.isArray(source.options) || source.options.length === 0) {
    throw new TypeError(`${id}.options deve conter ao menos uma opção.`);
  }

  const seen = new Set();
  const options = source.options.map((input, index) => {
    const option = typeof input === "string"
      ? { value: input, label: input }
      : normalizeRecord(input, `${id}.options[${index}]`);
    const value = nonEmptyString(
      option.value,
      `${id}.options[${index}].value`
    );

    if (seen.has(value)) {
      throw new Error(`${id}: opção duplicada ${value}.`);
    }

    seen.add(value);
    return deepFreeze({
      value,
      label: nonEmptyString(
        option.label ?? value,
        `${id}.options[${index}].label`
      )
    });
  });
  const fallback = options[0].value;
  const value = String(source.default ?? fallback);

  if (!seen.has(value)) {
    throw new Error(`${id}: valor inicial não pertence às opções.`);
  }

  return { default: value, options };
}

function normalizeProgram(input) {
  const source = normalizeRecord(input, "program");
  const mode = String(source.mode ?? "expression").toLowerCase();

  if (mode !== "expression") {
    throw new Error(
      "Experimentos 0027a aceitam apenas programa em modo expression."
    );
  }

  return deepFreeze({
    mode,
    source: nonEmptyString(source.source, "program.source")
  });
}

function normalizeParameterValue(parameter, value) {
  switch (parameter.type) {
    case "number":
    case "integer":
      return normalizeNumericValue(value, parameter);
    case "color":
      return normalizeHexColor(value);
    case "boolean":
      return normalizeBoolean(value, parameter.id);
    case "select": {
      const normalized = String(value);
      if (!parameter.options.some(option => option.value === normalized)) {
        throw new Error(
          `${parameter.id}: valor não pertence às opções.`
        );
      }
      return normalized;
    }
    default:
      throw new Error(`Tipo de parâmetro desconhecido: ${parameter.type}.`);
  }
}

function normalizeNumericValue(value, parameter) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    throw new TypeError(`${parameter.id}: use um número finito.`);
  }
  if (parameter.type === "integer" && !Number.isInteger(number)) {
    throw new TypeError(`${parameter.id}: use um inteiro.`);
  }
  if (parameter.min !== null && parameter.min !== undefined && number < parameter.min) {
    throw new RangeError(`${parameter.id}: mínimo ${parameter.min}.`);
  }
  if (parameter.max !== null && parameter.max !== undefined && number > parameter.max) {
    throw new RangeError(`${parameter.id}: máximo ${parameter.max}.`);
  }

  return number;
}

function normalizeBoolean(value, id) {
  if (value === true || value === false) return value;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new TypeError(`${id}: use true ou false.`);
}

function summarize(definition) {
  return deepFreeze({
    apiVersion: definition.apiVersion,
    id: definition.id,
    title: definition.title,
    description: definition.description,
    tags: [...definition.tags],
    parameterCount: definition.parameters.length
  });
}

function defaultControl(type) {
  return {
    number: "number",
    integer: "number",
    color: "color",
    select: "select",
    boolean: "toggle"
  }[type];
}

function normalizeTags(values) {
  if (!Array.isArray(values)) {
    throw new TypeError("tags deve formar uma lista.");
  }

  return [...new Set(values.map(value =>
    nonEmptyString(value, "tag").toLowerCase()
  ))].sort();
}

function normalizeId(value, label) {
  const id = nonEmptyString(value, label).toLowerCase();

  if (!/^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/.test(id)) {
    throw new TypeError(`${label} inválido: ${id}.`);
  }

  return id;
}

function optionalFinite(value, label) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new TypeError(`${label} deve ser número finito.`);
  }
  return number;
}

function normalizeRecord(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} deve formar um objeto.`);
  }
  return clone(value, label);
}

function nonEmptyString(value, label) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new TypeError(`${label} deve ser texto não vazio.`);
  return normalized;
}

function optionalString(value) {
  return String(value ?? "").trim();
}

function clone(value, label) {
  try {
    return structuredClone(value);
  } catch (error) {
    throw new TypeError(`${label} deve ser serializável.`, { cause: error });
  }
}

function deepFreeze(value, visited = new WeakSet()) {
  if (
    !value ||
    typeof value !== "object" ||
    Object.isFrozen(value) ||
    visited.has(value)
  ) {
    return value;
  }

  visited.add(value);
  for (const child of Object.values(value)) {
    deepFreeze(child, visited);
  }
  return Object.freeze(value);
}
