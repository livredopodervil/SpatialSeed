export const PROCEDURE_LIBRARY_SCHEMA_VERSION =
  "spatial-seed-procedure-library-v1";

const MAX_PROCEDURE_SOURCE_LENGTH = 100000;
const PROCEDURE_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_.-]*$/;

export class ProcedureCatalog {
  #entries = new Map();
  #lastStorageError = null;
  #revision = 0;
  #storage = null;
  #restored = false;

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

  define(name, source, { replace = false } = {}) {
    const record = normalizeRecord({ name, source });
    const previous = this.#entries.get(record.name);

    if (previous?.source === record.source) {
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
      persistence: Object.freeze({
        enabled: this.#storage !== null,
        restored: this.#restored,
        lastError: this.#lastStorageError
      })
    });
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
        previous.source !== record.source
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

  return Object.freeze({ name, source });
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
    if (right.get(name)?.source !== record.source) return false;
  }

  return true;
}

function recordsMap(records) {
  return new Map(records.map(record => [record.name, record]));
}

function documentFromEntries(entries) {
  return Object.freeze({
    schemaVersion: PROCEDURE_LIBRARY_SCHEMA_VERSION,
    procedures: Object.freeze(
      [...entries.values()]
        .sort((left, right) => left.name.localeCompare(right.name))
        .map(clone)
    )
  });
}

function clone(value) {
  return structuredClone(value);
}
