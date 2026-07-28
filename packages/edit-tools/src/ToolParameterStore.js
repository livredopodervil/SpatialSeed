export const TOOL_PARAMETER_SCHEMA_VERSION = 1;
export const TOOL_PARAMETER_STORAGE_KEY =
  "spatialseed.edit.tool-parameters.v1";

export class ToolParameterStore {
  static apiVersion = "tool-parameter-store-v1";

  #values = new Map();
  #listeners = new Set();
  #storage = null;
  #storageKey = TOOL_PARAMETER_STORAGE_KEY;
  #futureSchema = false;
  #activeToolId = null;

  constructor({
    registry,
    storage = null,
    storageKey = TOOL_PARAMETER_STORAGE_KEY,
    migrate = null
  }) {
    if (!registry?.normalize || !registry?.definition) {
      throw new TypeError("ToolParameterStore exige EditToolRegistry.");
    }
    this.registry = registry;
    this.#storage = storage ?? safeLocalStorage();
    this.#storageKey = String(storageKey);
    const loaded = this.#load();
    if (!loaded && typeof migrate === "function") {
      let migrated = null;
      try {
        migrated = migrate(this.#storage);
      } catch {
        migrated = null;
      }
      if (migrated && typeof migrated === "object") {
        for (const [toolId, values] of Object.entries(migrated)) {
          if (!this.registry.has(toolId)) continue;
          try {
            this.#values.set(toolId, this.registry.normalize(toolId, values));
          } catch {
            // Uma preferência legada inválida não bloqueia as demais.
          }
        }
        if (this.#values.size) this.#save();
      }
    }
  }

  dispose() {
    this.#listeners.clear();
  }

  subscribe(listener) {
    if (typeof listener !== "function") {
      throw new TypeError("Listener de parâmetros deve ser função.");
    }
    this.#listeners.add(listener);
    listener(this.status());
    return () => this.#listeners.delete(listener);
  }

  status() {
    return Object.freeze({
      schemaVersion: TOOL_PARAMETER_SCHEMA_VERSION,
      storageKey: this.#storageKey,
      activeToolId: this.#activeToolId,
      futureSchema: this.#futureSchema,
      tools: Object.freeze(Object.fromEntries(
        [...this.#values].map(([toolId, values]) => [
          toolId,
          Object.freeze(structuredClone(values))
        ])
      ))
    });
  }

  values(toolId) {
    const id = normalizeToolId(toolId);
    return this.registry.normalize(id, {}, {
      base: this.#values.get(id) ?? null
    });
  }

  resolve(toolId, provided = {}) {
    const id = normalizeToolId(toolId);
    return this.registry.normalize(id, provided, {
      base: this.#values.get(id) ?? null
    });
  }

  activate(toolId) {
    const id = normalizeToolId(toolId);
    this.registry.definition(id);
    if (this.#activeToolId === id) return this.status();
    this.#activeToolId = id;
    this.#notify();
    return this.status();
  }

  set(toolId, patch = {}) {
    const id = normalizeToolId(toolId);
    if (this.#futureSchema) {
      throw new Error(
        "Parâmetros foram gravados por uma versão futura e permanecem somente leitura."
      );
    }
    const normalizedPatch = this.registry.normalizePatch(id, patch);
    const next = this.registry.normalize(id, normalizedPatch, {
      base: this.#values.get(id) ?? null
    });
    this.#values.set(id, next);
    this.#activeToolId = id;
    this.#save();
    this.#notify();
    return next;
  }

  remember(toolId, values = {}) {
    return this.set(toolId, values);
  }

  reset(toolId) {
    const id = normalizeToolId(toolId);
    if (this.#futureSchema) {
      throw new Error(
        "Parâmetros foram gravados por uma versão futura e permanecem somente leitura."
      );
    }
    this.#values.delete(id);
    this.#activeToolId = id;
    this.#save();
    this.#notify();
    return this.values(id);
  }

  #load() {
    let parsed = null;
    try {
      const source = this.#storage?.getItem?.(this.#storageKey);
      if (source === null || source === undefined) return false;
      parsed = JSON.parse(source);
    } catch {
      return false;
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return false;
    }
    const version = Number(parsed.schemaVersion);
    if (version > TOOL_PARAMETER_SCHEMA_VERSION) {
      this.#futureSchema = true;
      return true;
    }
    if (version !== TOOL_PARAMETER_SCHEMA_VERSION) return false;
    const tools = parsed.tools;
    if (!tools || typeof tools !== "object" || Array.isArray(tools)) {
      return true;
    }
    for (const [toolId, values] of Object.entries(tools)) {
      if (!this.registry.has(toolId)) continue;
      try {
        this.#values.set(toolId, this.registry.normalize(toolId, values));
      } catch {
        // Uma ferramenta inválida não impede a recuperação das demais.
      }
    }
    return true;
  }

  #save() {
    if (this.#futureSchema) return;
    try {
      this.#storage?.setItem?.(this.#storageKey, JSON.stringify({
        schemaVersion: TOOL_PARAMETER_SCHEMA_VERSION,
        tools: Object.fromEntries(this.#values)
      }));
    } catch {
      // Armazenamento indisponível mantém valores somente nesta sessão.
    }
  }

  #notify() {
    if (!this.#listeners.size) return;
    const snapshot = this.status();
    for (const listener of [...this.#listeners]) {
      try {
        listener(snapshot);
      } catch (error) {
        console.error("ToolParameterStore subscriber failed", error);
      }
    }
  }
}

function normalizeToolId(value) {
  const id = String(value ?? "").trim();
  if (!id) throw new TypeError("Ferramenta ausente.");
  return id;
}

function safeLocalStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}
