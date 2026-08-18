const DEFAULT_LIMIT = 80;

export function createCommandPaletteEntries({
  uiActions = {},
  runtimeCommands = []
} = {}) {
  const bindings = Array.isArray(uiActions.bindings) ? uiActions.bindings : [];
  const shortcuts = new Map();
  for (const binding of bindings) {
    const current = shortcuts.get(binding.action) ?? [];
    current.push(displayChord(binding.chord));
    shortcuts.set(binding.action, current);
  }

  const entries = [];
  const representedCommands = new Set();
  for (const action of uiActions.actions ?? []) {
    const command = String(action.metadata?.command ?? "").trim();
    if (command) representedCommands.add(command);
    entries.push(Object.freeze({
      id: action.id,
      label: readableLabel(action.label, action.id),
      kind: "action",
      enabled: action.enabled !== false,
      command: command || null,
      shortcut: (shortcuts.get(action.id) ?? []).join(" ou "),
      metadata: Object.freeze({ ...action.metadata })
    }));
  }

  for (const command of runtimeCommands ?? []) {
    if (!command?.id || representedCommands.has(command.id)) continue;
    entries.push(Object.freeze({
      id: command.id,
      label: readableLabel(command.metadata?.label, command.id),
      kind: "command",
      enabled: true,
      command: command.id,
      shortcut: "",
      metadata: Object.freeze({ ...command.metadata })
    }));
  }
  return Object.freeze(entries);
}

export function rankCommandPaletteEntries(entries, query = "", {
  limit = DEFAULT_LIMIT
} = {}) {
  const terms = normalizeSearch(query).split(/\s+/).filter(Boolean);
  const ranked = [];
  for (const entry of entries ?? []) {
    const fields = [
      entry.label,
      entry.id,
      entry.command,
      entry.shortcut,
      entry.metadata?.category
    ].map(normalizeSearch).filter(Boolean);
    let score = entry.kind === "action" ? 20 : 0;
    let matches = true;
    for (const term of terms) {
      const termScore = Math.max(...fields.map(field => scoreField(field, term)));
      if (!Number.isFinite(termScore)) {
        matches = false;
        break;
      }
      score += termScore;
    }
    if (matches) ranked.push({ entry, score });
  }
  ranked.sort((left, right) =>
    right.score - left.score ||
    left.entry.label.localeCompare(right.entry.label, "pt-BR") ||
    left.entry.id.localeCompare(right.entry.id)
  );
  return Object.freeze(ranked.slice(0, Math.max(1, limit)).map(item => item.entry));
}

export function formatRuntimeCommandForConsole(commandId) {
  const id = String(commandId ?? "").trim();
  if (!id) throw new TypeError("Identificador de comando ausente.");
  return `runtime command ${id}`;
}

export class CommandPalette {
  static apiVersion = "command-palette-v1";

  #dialog;
  #input;
  #list;
  #empty;
  #entries;
  #onSelect;
  #onError;
  #visibleEntries = [];
  #activeIndex = 0;
  #inputListener;
  #keydownListener;
  #clickListener;

  constructor({ dialog, input, list, empty, entries, onSelect, onError = null }) {
    if (!dialog || !input || !list || !empty) {
      throw new TypeError("CommandPalette exige dialog, input, list e empty.");
    }
    if (typeof entries !== "function" || typeof onSelect !== "function") {
      throw new TypeError("CommandPalette exige providers funcionais.");
    }
    this.#dialog = dialog;
    this.#input = input;
    this.#list = list;
    this.#empty = empty;
    this.#entries = entries;
    this.#onSelect = onSelect;
    this.#onError = onError;
    this.#inputListener = () => this.refresh();
    this.#keydownListener = event => this.#handleKeydown(event);
    this.#clickListener = event => {
      const button = event.target.closest?.("button[data-command-index]");
      if (!button || !this.#list.contains(button)) return;
      this.#execute(Number(button.dataset.commandIndex));
    };
    this.#input.addEventListener("input", this.#inputListener);
    this.#input.addEventListener("keydown", this.#keydownListener);
    this.#list.addEventListener("click", this.#clickListener);
  }

  open() {
    this.#input.value = "";
    this.refresh();
    if (typeof this.#dialog.showModal === "function") {
      if (!this.#dialog.open) this.#dialog.showModal();
    } else {
      this.#dialog.setAttribute("open", "");
    }
    this.#input.focus();
    this.#input.select?.();
    return true;
  }

  close() {
    if (!this.#dialog.open) return false;
    if (typeof this.#dialog.close === "function") this.#dialog.close();
    else this.#dialog.removeAttribute("open");
    return true;
  }

  toggle() {
    return this.#dialog.open ? this.close() : this.open();
  }

  refresh() {
    this.#visibleEntries = rankCommandPaletteEntries(
      this.#entries(),
      this.#input.value
    );
    this.#activeIndex = Math.min(
      this.#activeIndex,
      Math.max(0, this.#visibleEntries.length - 1)
    );
    this.#list.replaceChildren();
    const ownerDocument = this.#list.ownerDocument;
    this.#visibleEntries.forEach((entry, index) => {
      const button = ownerDocument.createElement("button");
      button.type = "button";
      button.dataset.commandIndex = String(index);
      button.dataset.active = index === this.#activeIndex ? "true" : "false";
      button.disabled = entry.enabled === false;
      button.setAttribute("role", "option");
      button.setAttribute("aria-selected", index === this.#activeIndex ? "true" : "false");

      const label = ownerDocument.createElement("strong");
      label.textContent = entry.label;
      const detail = ownerDocument.createElement("span");
      detail.textContent = entry.kind === "command"
        ? `${entry.id} - abrir no console`
        : entry.id;
      button.append(label, detail);
      if (entry.shortcut) {
        const shortcut = ownerDocument.createElement("kbd");
        shortcut.textContent = entry.shortcut;
        button.append(shortcut);
      }
      this.#list.append(button);
    });
    this.#empty.hidden = this.#visibleEntries.length > 0;
    return this.#visibleEntries;
  }

  dispose() {
    this.#input.removeEventListener("input", this.#inputListener);
    this.#input.removeEventListener("keydown", this.#keydownListener);
    this.#list.removeEventListener("click", this.#clickListener);
    this.close();
  }

  #handleKeydown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      this.close();
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      const count = this.#visibleEntries.length;
      if (!count) return;
      this.#activeIndex = (this.#activeIndex + direction + count) % count;
      this.refresh();
      this.#list.children[this.#activeIndex]?.scrollIntoView?.({ block: "nearest" });
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      this.#execute(this.#activeIndex);
    }
  }

  #execute(index) {
    const entry = this.#visibleEntries[index];
    if (!entry || entry.enabled === false) return false;
    this.close();
    try {
      this.#onSelect(entry);
      return true;
    } catch (error) {
      this.#onError?.(error);
      return false;
    }
  }
}

function readableLabel(label, id) {
  const source = String(label ?? "").trim();
  if (source && source !== id) return source;
  return String(id)
    .split(/[.\-_]+/)
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function normalizeSearch(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .trim();
}

function scoreField(field, term) {
  if (!field) return Number.NEGATIVE_INFINITY;
  if (field === term) return 1000;
  if (field.startsWith(term)) return 800 - Math.min(200, field.length - term.length);
  const contained = field.indexOf(term);
  if (contained >= 0) return 600 - Math.min(250, contained * 4);
  let cursor = -1;
  let gaps = 0;
  for (const character of term) {
    const next = field.indexOf(character, cursor + 1);
    if (next < 0) return Number.NEGATIVE_INFINITY;
    gaps += next - cursor - 1;
    cursor = next;
  }
  return 300 - Math.min(250, gaps * 5);
}

function displayChord(chord) {
  return String(chord ?? "")
    .replace("Primary", "Ctrl/Cmd")
    .replace("Backspace", "⌫")
    .replace("Delete", "Del");
}
