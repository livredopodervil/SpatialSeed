const TOOL_LIFECYCLES = Object.freeze({
  navigate: "sticky",
  select: "sticky",
  translate: "sticky",
  rotate: "sticky",
  scale: "sticky",
  "object.place": "sticky",
  "path.sketch": "continuous"
});

export class ToolLifecycleController {
  static apiVersion = "tool-lifecycle-controller-v1";

  #listeners = new Set();
  #execute = null;
  #activeAction = null;
  #defaultKeepActive = true;
  #keepByTool = new Map([
    ["object.place", true],
    ["path.sketch", true]
  ]);
  #lastRepeatable = null;
  #repeating = false;
  #storage = null;
  #storageKey = "spatialseed.edit.tools.v1";

  constructor({ editor, storage = null, storageKey = null }) {
    if (!editor?.snapshot || !editor?.subscribe) {
      throw new TypeError("ToolLifecycleController exige editor compatível.");
    }
    this.editor = editor;
    this.#storage = storage ?? safeLocalStorage();
    if (storageKey) this.#storageKey = String(storageKey);
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
    const toolId = this.#activeAction ?? editorTool;
    return Object.freeze({
      toolId,
      editorTool,
      activeAction: this.#activeAction,
      lifecycle: lifecycleOf(toolId),
      keepActive: this.keepActive(this.#activeAction),
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
    const normalized = String(toolId ?? this.#activeAction ?? "").trim();
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
    const normalized = String(toolId ?? this.#activeAction ?? "").trim();
    if (normalized) {
      this.#keepByTool.set(normalized, value);
    } else {
      this.#defaultKeepActive = value;
      this.#keepByTool.set("object.place", value);
      this.#keepByTool.set("path.sketch", value);
    }
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
    if (this.#repeating || metadata.repeatable !== true) return;
    if (result?.changed === false) return;
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
    try {
      const value = JSON.parse(this.#storage?.getItem?.(this.#storageKey) ?? "{}");
      if (value.defaultKeepActive !== undefined) {
        this.#defaultKeepActive = Boolean(value.defaultKeepActive);
      }
      for (const [toolId, enabled] of Object.entries(value.keepByTool ?? {})) {
        this.#keepByTool.set(toolId, Boolean(enabled));
      }
    } catch {
      // Preferências inválidas não impedem a inicialização do editor.
    }
  }

  #savePreferences() {
    try {
      this.#storage?.setItem?.(this.#storageKey, JSON.stringify({
        defaultKeepActive: this.#defaultKeepActive,
        keepByTool: Object.fromEntries(this.#keepByTool)
      }));
    } catch {
      // Armazenamento indisponível mantém o estado somente na sessão atual.
    }
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
