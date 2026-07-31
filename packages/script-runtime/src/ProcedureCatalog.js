export const PROCEDURE_LIBRARY_SCHEMA_VERSION =
  "spatial-seed-procedure-library-v1";

const MAX_PROCEDURE_SOURCE_LENGTH = 100000;
const PROCEDURE_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_.-]*$/;
const PARAMETER_ID_PATTERN = /^[A-Za-z_][A-Za-z0-9_-]*$/;
const UI_PARAMETER_TYPES = new Set([
  "number",
  "integer",
  "boolean",
  "text",
  "color",
  "select",
  "vector3"
]);

export class ProcedureCatalog {
  #entries = new Map();
  #lastStorageError = null;
  #revision = 0;
  #storage = null;
  #restored = false;
  #subscribers = new Set();

  constructor({ storage = null } = {}) {
    if (storage !== null) {
      for (const method of ["load", "save"]) {
        if (typeof storage?.[method] !== "function") {
          throw new TypeError(
            `Armazenamento de procedimentos exige ${method}.`
          );
        }
      }
      this.#storage = storage;

      try {
        const document = storage.load();
        if (document !== null && document !== undefined) {
          this.#entries = recordsMap(normalizeDocument(document));
          this.#restored = true;
        }
      } catch (error) {
        this.#lastStorageError = error?.message ?? String(error);
      }
    }
  }

  get revision() {
    return this.#revision;
  }

  define(name, source, {
    replace = false,
    ui = undefined
  } = {}) {
    const normalizedName = normalizeName(name);
    const previous = this.#entries.get(normalizedName);
    const record = normalizeRecord({
      name: normalizedName,
      source,
      ...(ui === undefined && previous?.ui
        ? { ui: previous.ui }
        : { ui })
    });

    if (previous && recordsEqual(previous, record)) {
      return Object.freeze({
        changed: false,
        procedure: clone(previous),
        revision: this.#revision
      });
    }
    if (previous && !replace) {
      throw new Error(
        `Procedimento já existe: ${record.name}.`
      );
    }

    const candidate = new Map(this.#entries);
    candidate.set(record.name, record);
    this.#commit(candidate);
    return Object.freeze({
      changed: true,
      procedure: clone(record),
      revision: this.#revision
    });
  }

  get(name) {
    const normalizedName = normalizeName(name);
    const record = this.#entries.get(normalizedName);

    if (!record) {
      throw new Error(
        `Procedimento desconhecido: ${normalizedName}.`
      );
    }

    return clone(record);
  }

  list() {
    return Object.freeze(
      [...this.#entries.values()]
        .sort((left, right) => left.name.localeCompare(right.name))
        .map(record => Object.freeze({
          name: record.name,
          sourceLength: record.source.length
        }))
    );
  }

  describeUi() {
    const procedures = [...this.#entries.values()]
      .filter(record => record.ui)
      .map(record => Object.freeze({
        name: record.name,
        ...clone(record.ui)
      }))
      .sort((left, right) =>
        left.group.localeCompare(right.group) ||
        left.order - right.order ||
        left.label.localeCompare(right.label) ||
        left.name.localeCompare(right.name)
      );
    const groups = [];
    for (const procedure of procedures) {
      let group = groups.find(entry => entry.id === procedure.group);
      if (!group) {
        group = {
          id: procedure.group,
          label: procedure.group,
          procedures: []
        };
        groups.push(group);
      }
      group.procedures.push(procedure);
    }
    return deepFreeze({
      schemaVersion: PROCEDURE_LIBRARY_SCHEMA_VERSION,
      revision: this.#revision,
      groups
    });
  }

  remove(name) {
    const normalizedName = normalizeName(name);
    if (!this.#entries.has(normalizedName)) {
      return Object.freeze({
        changed: false,
        name: normalizedName,
        revision: this.#revision
      });
    }

    const candidate = new Map(this.#entries);
    candidate.delete(normalizedName);
    this.#commit(candidate);
    return Object.freeze({
      changed: true,
      name: normalizedName,
      revision: this.#revision
    });
  }

  snapshot() {
    return Object.freeze({
      revision: this.#revision,
      count: this.#entries.size,
      procedures: this.list(),
      uiProcedureCount: [...this.#entries.values()].filter(
        record => Boolean(record.ui)
      ).length,
      persistence: Object.freeze({
        enabled: this.#storage !== null,
        restored: this.#restored,
        lastError: this.#lastStorageError
      })
    });
  }

  subscribe(listener) {
    if (typeof listener !== "function") {
      throw new TypeError("Observador de catálogo deve ser função.");
    }
    this.#subscribers.add(listener);
    listener(this.snapshot());
    return () => this.#subscribers.delete(listener);
  }

  exportDocument() {
    return documentFromEntries(this.#entries);
  }

  exportText() {
    return JSON.stringify(this.exportDocument(), null, 2) + "\n";
  }

  importText(text, options = {}) {
    let document;
    try {
      document = JSON.parse(String(text));
    } catch (error) {
      throw new TypeError("Biblioteca textual contém JSON inválido.", {
        cause: error
      });
    }
    return this.importDocument(document, options);
  }

  importDocument(document, { mode = "merge" } = {}) {
    const normalizedMode = normalizeImportMode(mode);
    const records = normalizeDocument(document);
    const candidate = normalizedMode === "replace"
      ? new Map()
      : new Map(this.#entries);

    for (const record of records) {
      const previous = candidate.get(record.name);

      if (
        normalizedMode === "merge" &&
        previous &&
        !recordsEqual(previous, record)
      ) {
        throw new Error(
          `Importação conflita com o procedimento ${record.name}.`
        );
      }

      candidate.set(record.name, record);
    }

    if (sameEntries(this.#entries, candidate)) {
      return Object.freeze({
        changed: false,
        mode: normalizedMode,
        imported: records.length,
        ...this.snapshot()
      });
    }

    this.#commit(candidate);
    return Object.freeze({
      changed: true,
      mode: normalizedMode,
      imported: records.length,
      ...this.snapshot()
    });
  }

  invocationSource(name, argument = {}) {
    const record = this.get(name);
    const serializedArgument = JSON.stringify(argument);

    if (serializedArgument === undefined) {
      throw new TypeError(
        "Argumento do procedimento deve ser serializável como JSON."
      );
    }

    return [
      "const __spatialSeedProcedure = (",
      record.source,
      ");",
      "if (typeof __spatialSeedProcedure !== 'function') {",
      `  throw new TypeError(${JSON.stringify(
        `Procedimento ${record.name} não produziu uma função.`
      )});`,
      "}",
      `return __spatialSeedProcedure(${serializedArgument});`
    ].join("\n");
  }

  #commit(candidate) {
    if (this.#storage) {
      try {
        this.#storage.save(documentFromEntries(candidate));
      } catch (error) {
        this.#lastStorageError = error?.message ?? String(error);
        throw new Error(
          `Não foi possível persistir o catálogo: ${this.#lastStorageError}`,
          { cause: error }
        );
      }
    }

    this.#entries = candidate;
    this.#revision += 1;
    this.#lastStorageError = null;
    const snapshot = this.snapshot();
    for (const listener of this.#subscribers) {
      try {
        listener(snapshot);
      } catch (error) {
        console.error("ProcedureCatalog observer failed", error);
      }
    }
  }
}

function normalizeDocument(document) {
  if (
    !document ||
    typeof document !== "object" ||
    Array.isArray(document) ||
    document.schemaVersion !== PROCEDURE_LIBRARY_SCHEMA_VERSION ||
    !Array.isArray(document.procedures)
  ) {
    throw new TypeError("Biblioteca de procedimentos incompatível.");
  }

  const records = document.procedures.map(normalizeRecord);
  const names = new Set();

  for (const record of records) {
    if (names.has(record.name)) {
      throw new Error(
        `Biblioteca contém procedimento duplicado: ${record.name}.`
      );
    }
    names.add(record.name);
  }

  return records;
}

function normalizeRecord(record) {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    throw new TypeError("Definição de procedimento inválida.");
  }

  const name = normalizeName(record.name);
  const source = String(record.source ?? "").trim();

  if (!source) {
    throw new TypeError(`Procedimento ${name} não contém código-fonte.`);
  }
  if (source.length > MAX_PROCEDURE_SOURCE_LENGTH) {
    throw new RangeError(
      `Procedimento ${name} excede ${MAX_PROCEDURE_SOURCE_LENGTH} caracteres.`
    );
  }

  const ui = normalizeUi(record.ui, name);
  return deepFreeze({
    name,
    source,
    ...(ui ? { ui } : {})
  });
}

function normalizeUi(value, procedureName) {
  if (value === undefined || value === null || value === false) return null;
  const input = value === true ? {} : value;
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError(`UI de ${procedureName} deve ser um objeto.`);
  }
  const label = nonEmptyText(input.label ?? procedureName, "Rótulo de UI");
  const description = String(input.description ?? "").trim();
  const icon = String(input.icon ?? "ƒ").trim() || "ƒ";
  const group = nonEmptyText(input.group ?? "Procedimentos", "Grupo de UI");
  const order = finiteNumber(input.order ?? 0, "Ordem de UI");
  const commit = String(input.commit ?? "review").toLowerCase();
  if (!["review", "immediate"].includes(commit)) {
    throw new RangeError(
      `Commit de UI de ${procedureName} deve ser review ou immediate.`
    );
  }
  const parameters = normalizeParameters(input.parameters ?? [], procedureName);
  return {
    label,
    description,
    icon,
    group,
    order,
    commit,
    parameters
  };
}

function normalizeParameters(values, procedureName) {
  if (!Array.isArray(values)) {
    throw new TypeError(`Parâmetros de UI de ${procedureName} devem formar uma lista.`);
  }
  const ids = new Set();
  return values.map((value, index) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new TypeError(
        `Parâmetro ${index + 1} de ${procedureName} é inválido.`
      );
    }
    const id = String(value.id ?? "").trim();
    if (!PARAMETER_ID_PATTERN.test(id)) {
      throw new TypeError(`Id de parâmetro inválido em ${procedureName}: ${id}.`);
    }
    if (ids.has(id)) {
      throw new Error(`Parâmetro duplicado em ${procedureName}: ${id}.`);
    }
    ids.add(id);
    const type = String(value.type ?? "number").toLowerCase();
    if (!UI_PARAMETER_TYPES.has(type)) {
      throw new RangeError(`Tipo de parâmetro desconhecido: ${type}.`);
    }
    const parameter = {
      id,
      type,
      label: nonEmptyText(value.label ?? id, "Rótulo de parâmetro")
    };
    if (value.description !== undefined) {
      parameter.description = String(value.description).trim();
    }
    if (type === "select") {
      parameter.options = normalizeOptions(value.options, procedureName, id);
      parameter.default = normalizeSelectDefault(
        value.default,
        parameter.options
      );
      return parameter;
    }
    if (type === "boolean") {
      parameter.default = Boolean(value.default ?? false);
      return parameter;
    }
    if (type === "vector3") {
      parameter.default = vector3(value.default ?? [0, 0, 0], id);
      if (value.step !== undefined) {
        parameter.step = positiveNumber(value.step, `Passo de ${id}`);
      }
      return parameter;
    }
    if (type === "color") {
      const color = String(value.default ?? "#6699cc").trim().toLowerCase();
      if (!/^#[0-9a-f]{6}$/.test(color)) {
        throw new TypeError(`Cor padrão inválida em ${procedureName}.${id}.`);
      }
      parameter.default = color;
      return parameter;
    }
    if (type === "text") {
      parameter.default = String(value.default ?? "");
      return parameter;
    }
    parameter.default = finiteNumber(value.default ?? 0, `Valor padrão de ${id}`);
    if (type === "integer") parameter.default = Math.round(parameter.default);
    if (value.min !== undefined) {
      parameter.min = finiteNumber(value.min, `Mínimo de ${id}`);
    }
    if (value.max !== undefined) {
      parameter.max = finiteNumber(value.max, `Máximo de ${id}`);
    }
    if (
      parameter.min !== undefined &&
      parameter.max !== undefined &&
      parameter.max < parameter.min
    ) {
      throw new RangeError(`Intervalo inválido em ${procedureName}.${id}.`);
    }
    parameter.step = value.step === undefined
      ? (type === "integer" ? 1 : "any")
      : positiveNumber(value.step, `Passo de ${id}`);
    return parameter;
  });
}

function normalizeOptions(values, procedureName, parameterId) {
  if (!Array.isArray(values) || !values.length) {
    throw new TypeError(
      `Seleção ${procedureName}.${parameterId} exige opções.`
    );
  }
  const encoded = new Set();
  return values.map(option => {
    const input = option && typeof option === "object" && !Array.isArray(option)
      ? option
      : { value: option, label: option };
    const value = input.value;
    if (!["string", "number", "boolean"].includes(typeof value)) {
      throw new TypeError(
        `Opção inválida em ${procedureName}.${parameterId}.`
      );
    }
    const key = JSON.stringify(value);
    if (encoded.has(key)) {
      throw new Error(
        `Opção duplicada em ${procedureName}.${parameterId}: ${key}.`
      );
    }
    encoded.add(key);
    return {
      value,
      label: nonEmptyText(input.label ?? value, "Rótulo de opção")
    };
  });
}

function normalizeSelectDefault(value, options) {
  const resolved = value === undefined ? options[0].value : value;
  const key = JSON.stringify(resolved);
  if (!options.some(option => JSON.stringify(option.value) === key)) {
    throw new RangeError("Valor padrão de seleção não pertence às opções.");
  }
  return resolved;
}

function normalizeName(value) {
  const name = String(value ?? "").trim();

  if (!PROCEDURE_NAME_PATTERN.test(name)) {
    throw new TypeError(
      "Nome de procedimento deve começar por letra ou _ e conter " +
      "apenas letras, números, _, . ou -."
    );
  }

  return name;
}

function normalizeImportMode(value) {
  const mode = String(value ?? "merge").toLowerCase();

  if (!["merge", "replace"].includes(mode)) {
    throw new Error("Modo de importação deve ser merge ou replace.");
  }

  return mode;
}

function sameEntries(left, right) {
  if (left.size !== right.size) return false;

  for (const [name, record] of left) {
    if (!recordsEqual(right.get(name), record)) return false;
  }

  return true;
}

function recordsEqual(left, right) {
  return Boolean(left && right) &&
    JSON.stringify(left) === JSON.stringify(right);
}

function recordsMap(records) {
  return new Map(records.map(record => [record.name, record]));
}

function documentFromEntries(entries) {
  return deepFreeze({
    schemaVersion: PROCEDURE_LIBRARY_SCHEMA_VERSION,
    procedures: [...entries.values()]
      .sort((left, right) => left.name.localeCompare(right.name))
      .map(clone)
  });
}

function nonEmptyText(value, label) {
  const text = String(value ?? "").trim();
  if (!text) throw new TypeError(`${label} não pode ser vazio.`);
  return text;
}

function finiteNumber(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new TypeError(`${label} deve ser finito.`);
  }
  return number;
}

function positiveNumber(value, label) {
  const number = finiteNumber(value, label);
  if (!(number > 0)) throw new RangeError(`${label} deve ser positivo.`);
  return number;
}

function vector3(value, id) {
  if (!Array.isArray(value) || value.length !== 3) {
    throw new TypeError(`Vetor padrão de ${id} deve ter três componentes.`);
  }
  return value.map((component, index) =>
    finiteNumber(component, `${id}[${index}]`)
  );
}

function clone(value) {
  return structuredClone(value);
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  for (const entry of Object.values(value)) deepFreeze(entry);
  return Object.freeze(value);
}
