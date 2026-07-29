const TOOL_LIFECYCLES = Object.freeze({
  navigate: "sticky",
  select: "sticky",
  translate: "sticky",
  rotate: "sticky",
  scale: "sticky",
  "object.place": "sticky",
  "path.sketch": "continuous",
  "planar.sketch": "continuous"
});

export const TOOL_PREFERENCES_SCHEMA_VERSION = 2;
export const TOOL_PREFERENCES_STORAGE_KEY = "spatialseed.edit.tools.v2";
export const LEGACY_TOOL_PREFERENCES_STORAGE_KEY = "spatialseed.edit.tools.v1";

export class ToolLifecycleController {
  static apiVersion = "tool-lifecycle-controller-v3";

  #listeners = new Set();
  #execute = null;
  #activeAction = null;
  #defaultKeepActive = true;
  #keepByTool = new Map([
    ["object.place", true],
    ["path.sketch", true],
    ["planar.sketch", true]
  ]);
  #lastRepeatable = null;
  #repeating = false;
  #storage = null;
  #storageKey = TOOL_PREFERENCES_STORAGE_KEY;
  #legacyStorageKey = LEGACY_TOOL_PREFERENCES_STORAGE_KEY;

  constructor({
    editor,
    storage = null,
    storageKey = null,
    legacyStorageKey = undefined
  }) {
    if (!editor?.snapshot || !editor?.subscribe) {
      throw new TypeError("ToolLifecycleController exige editor compatível.");
    }
    this.editor = editor;
    this.#storage = storage ?? safeLocalStorage();
    if (storageKey) {
      this.#storageKey = String(storageKey);
      this.#legacyStorageKey = null;
    }
    if (legacyStorageKey !== undefined) {
      const normalized = String(legacyStorageKey ?? "").trim();
      this.#legacyStorageKey = normalized || null;
    }
    this.#loadPreferences();
    this.#unsubscribeEditor = editor.subscribe(() => this.#notify());
  }

  #unsubscribeEditor = null;

  dispose() {
    this.#unsubscribeEditor?.();
    this.#listeners.clear();
    this.#execute = null;
  }

  attachExecute(execute) {
    if (typeof execute !== "function") {
      throw new TypeError("Executor de ferramentas deve ser função.");
    }
    this.#execute = execute;
    return this;
  }

  subscribe(listener) {
    if (typeof listener !== "function") {
      throw new TypeError("Listener de ferramentas deve ser função.");
    }
    this.#listeners.add(listener);
    listener(this.status());
    return () => this.#listeners.delete(listener);
  }

  status() {
    const editorTool = this.editor.snapshot().tool.mode;
    const toolId = this.#resolveToolId();
    return Object.freeze({
      toolId,
      editorTool,
      activeAction: this.#activeAction,
      lifecycle: lifecycleOf(toolId),
      keepActive: this.keepActive(toolId),
      canRepeat: Boolean(this.#lastRepeatable),
      lastRepeatable: this.#lastRepeatable
        ? Object.freeze({
            id: this.#lastRepeatable.id,
            label: this.#lastRepeatable.label,
            timestamp: this.#lastRepeatable.timestamp
          })
        : null
    });
  }

  keepActive(toolId = null) {
    const normalized = this.#resolveToolId(toolId);
    if (!normalized) return this.#defaultKeepActive;
    if (this.#keepByTool.has(normalized)) {
      return Boolean(this.#keepByTool.get(normalized));
    }
    return lifecycleOf(normalized) === "single-shot"
      ? false
      : this.#defaultKeepActive;
  }

  setKeepActive(enabled, { toolId = null } = {}) {
    const value = Boolean(enabled);
    const normalized = this.#resolveToolId(toolId);
    if (!normalized) {
      throw new Error("Ferramenta ausente para configurar continuidade.");
    }
    this.#keepByTool.set(normalized, value);
    this.#savePreferences();
    this.#notify();
    return this.status();
  }

  activateAction(toolId) {
    const normalized = String(toolId ?? "").trim();
    if (!normalized) throw new Error("Ação de ferramenta ausente.");
    this.#activeAction = normalized;
    this.#notify();
    return this.status();
  }

  completeAction(toolId = this.#activeAction) {
    const normalized = String(toolId ?? "").trim();
    if (!normalized || this.#activeAction !== normalized) return this.status();
    if (!this.keepActive(normalized)) {
      this.#activeAction = null;
    }
    this.#notify();
    return this.status();
  }

  cancelAction(toolId = null) {
    if (!toolId || this.#activeAction === String(toolId)) {
      this.#activeAction = null;
      this.#notify();
    }
    return this.status();
  }

  observeExecution({ id, args, result, metadata = {} }) {
    if (this.#repeating) return;
    if (result?.changed === false) return;
    if (result?.repeatDeferred === true) {
      this.clearRepeatable();
      return;
    }
    if (result?.repeatCommand?.id) {
      this.remember(result.repeatCommand);
      return;
    }
    if (metadata.repeatable !== true) return;
    this.#lastRepeatable = Object.freeze({
      id: String(id),
      args: structuredClone(args ?? {}),
      label: String(metadata.label ?? id),
      timestamp: Date.now()
    });
    this.#notify();
  }

  remember({ id, args = {}, label = id } = {}) {
    const commandId = String(id ?? "").trim();
    if (!commandId) throw new Error("Comando repetível ausente.");
    this.#lastRepeatable = Object.freeze({
      id: commandId,
      args: structuredClone(args),
      label: String(label ?? commandId),
      timestamp: Date.now()
    });
    this.#notify();
    return this.status();
  }

  clearRepeatable(id = null) {
    const expected = id === null
      ? null
      : String(id).trim();
    if (
      expected &&
      this.#lastRepeatable?.id !== expected
    ) {
      return this.status();
    }
    if (!this.#lastRepeatable) return this.status();
    this.#lastRepeatable = null;
    this.#notify();
    return this.status();
  }

  repeat() {
    if (!this.#lastRepeatable) {
      return Object.freeze({ changed: false, reason: "no-repeatable-command" });
    }
    if (!this.#execute) {
      throw new Error("Executor de repetição não foi conectado.");
    }
    const command = this.#lastRepeatable;
    this.#repeating = true;
    try {
      const result = this.#execute(command.id, command.args);
      return Object.freeze({
        repeated: true,
        command: command.id,
        result
      });
    } finally {
      this.#repeating = false;
      this.#notify();
    }
  }

  #loadPreferences() {
    const current = this.#readPreferences(this.#storageKey);
    if (current) {
      if (current.schemaVersion === TOOL_PREFERENCES_SCHEMA_VERSION) {
        this.#applyPreferences(current);
      }
      return;
    }

    const legacy = this.#readPreferences(this.#legacyStorageKey);
    if (!legacy) return;
    this.#applyPreferences(legacy);
    this.#savePreferences();
  }

  #savePreferences() {
    try {
      this.#storage?.setItem?.(this.#storageKey, JSON.stringify({
        schemaVersion: TOOL_PREFERENCES_SCHEMA_VERSION,
        defaultKeepActive: this.#defaultKeepActive,
        keepByTool: Object.fromEntries(this.#keepByTool)
      }));
    } catch {
      // Armazenamento indisponível mantém o estado somente na sessão atual.
    }
  }

  #readPreferences(storageKey) {
    if (!storageKey) return null;
    try {
      const source = this.#storage?.getItem?.(storageKey);
      if (source === null || source === undefined) return null;
      const value = JSON.parse(source);
      return value && typeof value === "object" && !Array.isArray(value)
        ? value
        : null;
    } catch {
      return null;
    }
  }

  #applyPreferences(value) {
    if (typeof value.defaultKeepActive === "boolean") {
      this.#defaultKeepActive = value.defaultKeepActive;
    }
    const keepByTool = value.keepByTool;
    if (!keepByTool || typeof keepByTool !== "object" || Array.isArray(keepByTool)) {
      return;
    }
    for (const [toolId, enabled] of Object.entries(keepByTool)) {
      const normalized = String(toolId ?? "").trim();
      if (normalized && typeof enabled === "boolean") {
        this.#keepByTool.set(normalized, enabled);
      }
    }
  }

  #resolveToolId(toolId = null) {
    const explicit = String(toolId ?? "").trim();
    if (explicit) return explicit;
    const active = String(this.#activeAction ?? "").trim();
    if (active) return active;
    return String(this.editor.snapshot().tool?.mode ?? "").trim();
  }

  #notify() {
    if (!this.#listeners.size) return;
    const snapshot = this.status();
    for (const listener of [...this.#listeners]) {
      try {
        listener(snapshot);
      } catch (error) {
        console.error("ToolLifecycleController subscriber failed", error);
      }
    }
  }
}

export function lifecycleOf(toolId) {
  return TOOL_LIFECYCLES[String(toolId ?? "")] ?? "single-shot";
}

function safeLocalStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}
