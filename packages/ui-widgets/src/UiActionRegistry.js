import {
  normalizeShortcutActionId,
  normalizeShortcutBindings,
  normalizeShortcutChord
} from "../../ui-config/src/ShortcutConfiguration.js";

export { normalizeShortcutChord };

export class UiActionRegistry {
  static apiVersion = "ui-action-registry-v1";

  #actions = new Map();
  #bindings = [];
  #defaultBindings = [];
  #root;
  #storage;
  #storageKey;
  #profile;
  #keydown;
  #controlBindings = [];
  #statistics = {
    keyEvents: 0,
    handled: 0,
    ignoredTextEditing: 0,
    ignoredRepeat: 0,
    disabled: 0,
    conflicts: 0,
    failures: 0,
    lastAction: null,
    lastChord: null
  };

  constructor({
    root = globalThis.document ?? null,
    configuration = {},
    storage = root?.defaultView?.localStorage ?? null
  } = {}) {
    this.#root = root;
    this.#storage = storage;
    this.#storageKey = String(
      configuration.storageKey ?? "spatialseed.ui.shortcuts.v1"
    );
    this.#profile = String(configuration.profile ?? "spatialseed");
    this.#defaultBindings = normalizeShortcutBindings(configuration.bindings ?? []);
    this.#bindings = this.#readStoredBindings() ?? this.#defaultBindings;
    this.#keydown = event => this.handleKeydown(event);
    this.#root?.addEventListener?.("keydown", this.#keydown);
  }

  register(id, handler, {
    label = id,
    enabled = () => true,
    metadata = {}
  } = {}) {
    const key = normalizeShortcutActionId(id);
    if (typeof handler !== "function") {
      throw new TypeError(`Ação de UI exige handler: ${key}.`);
    }
    if (typeof enabled !== "function") {
      throw new TypeError(`Ação de UI exige enabled funcional: ${key}.`);
    }
    if (this.#actions.has(key)) {
      throw new Error(`Ação de UI já registrada: ${key}.`);
    }
    this.#actions.set(key, Object.freeze({
      id: key,
      label: String(label),
      handler,
      enabled,
      metadata: Object.freeze({ ...metadata })
    }));
    return this;
  }

  execute(id, args = {}, source = "interface") {
    const key = normalizeShortcutActionId(id);
    const action = this.#actions.get(key);
    if (!action) throw new Error(`Ação de UI desconhecida: ${key}.`);
    if (!action.enabled()) {
      this.#statistics.disabled += 1;
      return Object.freeze({ handled: false, disabled: true, action: key });
    }

    try {
      const result = action.handler(structuredClone(args), { source });
      this.#statistics.handled += 1;
      this.#statistics.lastAction = key;
      return result;
    } catch (error) {
      this.#statistics.failures += 1;
      throw error;
    }
  }

  bindControl(element, actionId, {
    eventName = "click",
    args = () => ({})
  } = {}) {
    if (!element?.addEventListener) {
      throw new TypeError("Controle de UI inválido.");
    }
    const id = normalizeShortcutActionId(actionId);
    const listener = event => this.execute(id, args(event), "control");
    element.addEventListener(eventName, listener);
    element.dataset.uiAction = id;
    const shortcuts = this.#bindings
      .filter(binding => binding.action === id)
      .map(binding => displayChord(binding.chord));
    if (shortcuts.length) {
      element.dataset.shortcuts = shortcuts.join(", ");
      const hint = shortcuts.join(" ou ");
      if (!String(element.title ?? "").includes(hint)) {
        element.title = [element.title, hint].filter(Boolean).join(" · ");
      }
    }
    this.#controlBindings.push({ element, eventName, listener });
    return element;
  }

  handleKeydown(event, context = contextForTarget(event?.target)) {
    this.#statistics.keyEvents += 1;
    if (!event || event.defaultPrevented) return false;
    if (event.repeat) {
      this.#statistics.ignoredRepeat += 1;
      return false;
    }
    if (isTextEditingTarget(event.target)) {
      this.#statistics.ignoredTextEditing += 1;
      return false;
    }
    if (event.target?.closest?.("dialog[open],[aria-modal='true']")) {
      return false;
    }

    const matches = this.#bindings
      .filter(binding =>
        (binding.context === "global" || binding.context === context) &&
        matchesChord(binding.chord, event)
      )
      .sort((left, right) =>
        contextPriority(right.context, context) -
        contextPriority(left.context, context)
      );

    if (!matches.length) return false;
    const priority = contextPriority(matches[0].context, context);
    const candidates = matches.filter(
      binding => contextPriority(binding.context, context) === priority
    );
    if (candidates.length !== 1) {
      this.#statistics.conflicts += 1;
      return false;
    }

    const binding = candidates[0];
    const action = this.#actions.get(binding.action);
    if (!action || !action.enabled()) {
      this.#statistics.disabled += 1;
      return false;
    }

    event.preventDefault?.();
    event.stopPropagation?.();
    this.#statistics.lastChord = binding.chord;
    this.execute(binding.action, {}, "shortcut");
    return true;
  }

  setBindings(bindings, { persist = true } = {}) {
    const normalized = normalizeShortcutBindings(bindings);
    this.#bindings = normalized;
    if (persist) this.#writeStoredBindings(normalized);
    return this.describeBindings();
  }

  resetBindings() {
    this.#bindings = this.#defaultBindings;
    try { this.#storage?.removeItem?.(this.#storageKey); }
    catch {}
    return this.describeBindings();
  }

  describeBindings() {
    return Object.freeze(this.#bindings.map(binding =>
      Object.freeze({ ...binding })
    ));
  }

  describe() {
    return Object.freeze({
      apiVersion: UiActionRegistry.apiVersion,
      profile: this.#profile,
      actions: Object.freeze([...this.#actions.values()].map(action =>
        Object.freeze({
          id: action.id,
          label: action.label,
          metadata: { ...action.metadata }
        })
      )),
      bindings: this.describeBindings(),
      statistics: Object.freeze({ ...this.#statistics })
    });
  }

  dispose() {
    this.#root?.removeEventListener?.("keydown", this.#keydown);
    for (const { element, eventName, listener } of this.#controlBindings) {
      element.removeEventListener(eventName, listener);
    }
    this.#controlBindings.length = 0;
    this.#actions.clear();
  }

  #readStoredBindings() {
    try {
      const source = JSON.parse(this.#storage?.getItem?.(this.#storageKey) ?? "null");
      if (
        !source ||
        source.version !== 1 ||
        source.profile !== this.#profile
      ) return null;
      return normalizeShortcutBindings(source.bindings);
    } catch {
      return null;
    }
  }

  #writeStoredBindings(bindings) {
    try {
      this.#storage?.setItem?.(this.#storageKey, JSON.stringify({
        version: 1,
        profile: this.#profile,
        bindings
      }));
    } catch {}
  }
}

function matchesChord(chord, event) {
  const tokens = chord.split("+");
  const key = tokens.at(-1);
  const modifiers = new Set(tokens.slice(0, -1));
  const primary = Boolean(event.ctrlKey || event.metaKey);
  if (modifiers.has("Primary") !== primary) return false;
  if (!modifiers.has("Primary")) {
    if (modifiers.has("Control") !== Boolean(event.ctrlKey)) return false;
    if (modifiers.has("Meta") !== Boolean(event.metaKey)) return false;
  }
  if (modifiers.has("Alt") !== Boolean(event.altKey)) return false;
  if (modifiers.has("Shift") !== Boolean(event.shiftKey)) return false;
  return normalizeEventKey(event.key) === key;
}

function normalizeEventKey(value) {
  if (value === " ") return "Space";
  if (/^[a-z0-9]$/i.test(value ?? "")) return String(value).toUpperCase();
  return String(value ?? "");
}

function contextForTarget(target) {
  return target?.closest?.("[data-shortcut-context]")
    ?.dataset?.shortcutContext ?? "viewport";
}

function contextPriority(bindingContext, currentContext) {
  return bindingContext === currentContext ? 2 : bindingContext === "global" ? 1 : 0;
}

function isTextEditingTarget(target) {
  return Boolean(target?.closest?.(
    "input,textarea,select,[contenteditable]:not([contenteditable='false'])"
  ));
}

function displayChord(chord) {
  return chord
    .replace("Primary", "Ctrl/Cmd")
    .replace("Backspace", "⌫")
    .replace("Delete", "Del");
}
