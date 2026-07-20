const ACTION_ID = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/;
const MODIFIER_ORDER = ["Primary", "Control", "Meta", "Alt", "Shift"];

export function normalizeShortcutBindings(bindings = []) {
  if (!Array.isArray(bindings)) {
    throw new TypeError("shortcuts.bindings deve ser uma lista.");
  }

  const normalized = bindings.map((binding, index) => {
    const path = `shortcuts.bindings[${index}]`;
    if (!binding || typeof binding !== "object" || Array.isArray(binding)) {
      throw new TypeError(`${path} deve ser um objeto.`);
    }
    return Object.freeze({
      action: normalizeShortcutActionId(binding.action, `${path}.action`),
      chord: normalizeShortcutChord(binding.chord, `${path}.chord`),
      context: normalizeShortcutContext(
        binding.context ?? "global",
        `${path}.context`
      )
    });
  });

  const seen = new Set();
  for (const binding of normalized) {
    const key = `${binding.context}:${binding.chord}`;
    if (seen.has(key)) {
      throw new Error(`Atalho duplicado no mesmo contexto: ${key}.`);
    }
    seen.add(key);
  }
  return Object.freeze(normalized);
}

export function normalizeShortcutChord(value, path = "atalho") {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError(`${path} deve ser texto não vazio.`);
  }
  const tokens = value.split("+").map(token => token.trim()).filter(Boolean);
  const modifiers = new Set();
  let key = null;

  for (const token of tokens) {
    const modifier = MODIFIER_ORDER.find(
      candidate => candidate.toLowerCase() === token.toLowerCase()
    );
    if (modifier) {
      if (modifiers.has(modifier)) {
        throw new Error(`${path}: modificador repetido ${modifier}.`);
      }
      modifiers.add(modifier);
      continue;
    }
    if (key !== null) throw new Error(`${path}: mais de uma tecla.`);
    key = normalizeShortcutKey(token, path);
  }

  if (!key) throw new Error(`${path}: tecla ausente.`);
  if (
    modifiers.has("Primary") &&
    (modifiers.has("Control") || modifiers.has("Meta"))
  ) {
    throw new Error(`${path}: Primary conflita com Control ou Meta.`);
  }
  return [
    ...MODIFIER_ORDER.filter(modifier => modifiers.has(modifier)),
    key
  ].join("+");
}

export function normalizeShortcutActionId(value, path = "action") {
  const text = String(value ?? "").trim();
  if (!ACTION_ID.test(text)) {
    throw new TypeError(`${path} inválido: ${text}.`);
  }
  return text;
}

export function normalizeShortcutContext(value, path = "context") {
  const text = String(value ?? "").trim();
  if (!/^[a-z][a-z0-9-]*$/.test(text)) {
    throw new TypeError(`${path} inválido: ${text}.`);
  }
  return text;
}

function normalizeShortcutKey(value, path) {
  const text = String(value).trim();
  if (/^[a-z0-9]$/i.test(text)) return text.toUpperCase();
  const named = {
    backspace: "Backspace",
    delete: "Delete",
    enter: "Enter",
    escape: "Escape",
    space: "Space",
    tab: "Tab"
  }[text.toLowerCase()];
  if (named) return named;
  throw new TypeError(`${path}: tecla inválida ${text}.`);
}
