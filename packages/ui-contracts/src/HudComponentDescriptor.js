export const HUD_COMPONENT_KINDS = Object.freeze([
  "button",
  "toggle",
  "radio",
  "select",
  "number",
  "integer",
  "range",
  "color",
  "text",
  "boolean",
  "vector2",
  "vector3",
  "label",
  "separator",
  "spacer",
  "menu",
  "composite",
  "procedure-form"
]);

export const HUD_COMPONENT_VISIBILITY = Object.freeze([
  "inherit",
  "auto",
  "always",
  "hidden"
]);

const DEFAULT_SIZING = Object.freeze({
  button: Object.freeze({ minWidth: 1, minHeight: 1, preferredWidth: 1, preferredHeight: 1, maxWidth: 16, maxHeight: 8, resizeX: true, resizeY: true }),
  toggle: Object.freeze({ minWidth: 1, minHeight: 1, preferredWidth: 1, preferredHeight: 1, maxWidth: 16, maxHeight: 8, resizeX: true, resizeY: true }),
  radio: Object.freeze({ minWidth: 1, minHeight: 1, preferredWidth: 1, preferredHeight: 1, maxWidth: 16, maxHeight: 8, resizeX: true, resizeY: true }),
  select: Object.freeze({ minWidth: 2, minHeight: 1, preferredWidth: 3, preferredHeight: 1, maxWidth: 32, maxHeight: 4, resizeX: true, resizeY: false }),
  number: Object.freeze({ minWidth: 2, minHeight: 1, preferredWidth: 3, preferredHeight: 1, maxWidth: 16, maxHeight: 2, resizeX: true, resizeY: false }),
  integer: Object.freeze({ minWidth: 2, minHeight: 1, preferredWidth: 3, preferredHeight: 1, maxWidth: 16, maxHeight: 2, resizeX: true, resizeY: false }),
  range: Object.freeze({ minWidth: 3, minHeight: 1, preferredWidth: 5, preferredHeight: 1, maxWidth: 32, maxHeight: 2, resizeX: true, resizeY: false }),
  color: Object.freeze({ minWidth: 1, minHeight: 1, preferredWidth: 2, preferredHeight: 1, maxWidth: 8, maxHeight: 2, resizeX: true, resizeY: false }),
  text: Object.freeze({ minWidth: 2, minHeight: 1, preferredWidth: 4, preferredHeight: 1, maxWidth: 32, maxHeight: 8, resizeX: true, resizeY: true }),
  boolean: Object.freeze({ minWidth: 1, minHeight: 1, preferredWidth: 1, preferredHeight: 1, maxWidth: 16, maxHeight: 4, resizeX: true, resizeY: true }),
  vector2: Object.freeze({ minWidth: 3, minHeight: 1, preferredWidth: 5, preferredHeight: 1, maxWidth: 32, maxHeight: 4, resizeX: true, resizeY: true }),
  vector3: Object.freeze({ minWidth: 3, minHeight: 1, preferredWidth: 6, preferredHeight: 1, maxWidth: 32, maxHeight: 4, resizeX: true, resizeY: true }),
  label: Object.freeze({ minWidth: 1, minHeight: 1, preferredWidth: 2, preferredHeight: 1, maxWidth: 32, maxHeight: 4, resizeX: true, resizeY: true }),
  separator: Object.freeze({ minWidth: 1, minHeight: 1, preferredWidth: 1, preferredHeight: 1, maxWidth: 32, maxHeight: 1, resizeX: true, resizeY: false }),
  spacer: Object.freeze({ minWidth: 1, minHeight: 1, preferredWidth: 1, preferredHeight: 1, maxWidth: 32, maxHeight: 32, resizeX: true, resizeY: true }),
  menu: Object.freeze({ minWidth: 1, minHeight: 1, preferredWidth: 2, preferredHeight: 1, maxWidth: 16, maxHeight: 8, resizeX: true, resizeY: true }),
  composite: Object.freeze({ minWidth: 2, minHeight: 1, preferredWidth: 4, preferredHeight: 1, maxWidth: 64, maxHeight: 32, resizeX: true, resizeY: true }),
  "procedure-form": Object.freeze({ minWidth: 3, minHeight: 2, preferredWidth: 6, preferredHeight: 3, maxWidth: 64, maxHeight: 64, resizeX: true, resizeY: true })
});

export function normalizeHudComponentDescriptor(value = {}, path = "hudComponent") {
  const source = objectValue(value, path);
  const id = stableId(source.id, `${path}.id`);
  const kind = HUD_COMPONENT_KINDS.includes(source.kind)
    ? source.kind
    : "button";
  const category = stableId(source.category ?? source.family ?? "general", `${path}.category`);
  const label = nonEmptyText(source.label ?? id, `${path}.label`);
  const nativeIcon = optionalText(source.icon ?? source.nativeIcon);
  const sizing = normalizeSizing(source.sizing, kind, `${path}.sizing`);
  const action = normalizeAction(source.action ?? source.command, `${path}.action`);
  const state = normalizeStateBinding(source.state, `${path}.state`);
  const placement = normalizeDefaultPlacement(source.defaultPlacement ?? source.placement, {
    section: category,
    width: sizing.preferredWidth,
    height: sizing.preferredHeight
  }, `${path}.defaultPlacement`);
  const tags = uniqueTextList(source.tags ?? []);
  const capabilities = uniqueTextList(source.capabilities ?? source.requiredCapabilities ?? []);

  return deepFreeze({
    id,
    kind,
    category,
    label,
    description: optionalText(source.description),
    icon: nativeIcon,
    customizable: source.customizable !== false,
    sourceModule: optionalStableId(source.sourceModule ?? source.moduleId),
    sizing,
    action,
    state,
    defaultPlacement: placement,
    tags,
    capabilities,
    metadata: cloneObject(source.metadata)
  });
}

export function normalizeHudComponentRuntime(value = {}, path = "runtime") {
  const source = objectValue(value, path);
  return Object.freeze({
    element: source.element ?? null,
    render: typeof source.render === "function" ? source.render : null,
    dispose: typeof source.dispose === "function" ? source.dispose : null,
    nativeState: typeof source.nativeState === "function" ? source.nativeState : null
  });
}

export function inferHudComponentKind(element) {
  if (!element) return "button";
  if (element.matches?.("hr,[role=separator]")) return "separator";
  if (element.matches?.("small,output,[data-hud-label]")) return "label";
  if (element.matches?.("[data-hud-spacer]")) return "spacer";

  const selector = "button,input,select,textarea";
  const controls = element.matches?.(selector)
    ? [element]
    : [...(element.querySelectorAll?.(selector) ?? [])];

  // A group with more than one interactive descendant is one atomic composite.
  // Treating only its first button as the component was the main source of
  // controls that could not be moved coherently by the HUD editor.
  if (controls.length > 1) return "composite";
  const control = controls[0] ?? null;
  if (!control) return "composite";
  if (control.matches?.("button")) {
    return control.getAttribute?.("aria-pressed") !== null ||
      control.dataset?.active !== undefined ||
      control.dataset?.editTool !== undefined ||
      control.dataset?.editSubject !== undefined
      ? "toggle"
      : "button";
  }
  if (control.matches?.("select")) return "select";
  if (control.matches?.("textarea")) return "text";
  const type = String(control.type ?? "text").toLowerCase();
  if (type === "checkbox") return "boolean";
  if (type === "radio") return "radio";
  if (type === "range") return "range";
  if (type === "color") return "color";
  if (type === "number") {
    return String(control.step ?? "").toLowerCase() === "1" ? "integer" : "number";
  }
  return "text";
}

export function hudComponentSizing(kind) {
  return DEFAULT_SIZING[HUD_COMPONENT_KINDS.includes(kind) ? kind : "button"];
}

function normalizeSizing(value, kind, path) {
  const source = value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
  const defaults = hudComponentSizing(kind);
  const minWidth = boundedInteger(source.minWidth, defaults.minWidth, 1, 256, `${path}.minWidth`);
  const minHeight = boundedInteger(source.minHeight, defaults.minHeight, 1, 256, `${path}.minHeight`);
  const maxWidth = boundedInteger(source.maxWidth, defaults.maxWidth, minWidth, 256, `${path}.maxWidth`);
  const maxHeight = boundedInteger(source.maxHeight, defaults.maxHeight, minHeight, 256, `${path}.maxHeight`);
  return Object.freeze({
    minWidth,
    minHeight,
    preferredWidth: boundedInteger(source.preferredWidth, defaults.preferredWidth, minWidth, maxWidth, `${path}.preferredWidth`),
    preferredHeight: boundedInteger(source.preferredHeight, defaults.preferredHeight, minHeight, maxHeight, `${path}.preferredHeight`),
    maxWidth,
    maxHeight,
    resizeX: source.resizeX === undefined ? defaults.resizeX : Boolean(source.resizeX),
    resizeY: source.resizeY === undefined ? defaults.resizeY : Boolean(source.resizeY)
  });
}

function normalizeAction(value, path) {
  if (value == null || value === false || value === "") return null;
  if (typeof value === "string") {
    return Object.freeze({ command: stableId(value, path), arguments: Object.freeze({}) });
  }
  const source = objectValue(value, path);
  const command = stableId(source.command ?? source.id, `${path}.command`);
  return deepFreeze({
    command,
    arguments: cloneObject(source.arguments ?? source.args),
    event: optionalText(source.event) ?? "activate"
  });
}

function normalizeStateBinding(value, path) {
  if (value == null || value === false) return null;
  const source = objectValue(value, path);
  return deepFreeze({
    query: optionalStableId(source.query),
    channel: optionalStableId(source.channel),
    path: optionalText(source.path),
    activeWhen: cloneObject(source.activeWhen),
    enabledWhen: cloneObject(source.enabledWhen),
    visibleWhen: cloneObject(source.visibleWhen),
    valuePath: optionalText(source.valuePath)
  });
}

function normalizeDefaultPlacement(value, fallback, path) {
  const source = value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
  return Object.freeze({
    section: optionalStableId(source.section) ?? fallback.section,
    x: nullableInteger(source.x),
    y: nullableInteger(source.y),
    width: boundedInteger(source.width, fallback.width, 1, 256, `${path}.width`),
    height: boundedInteger(source.height, fallback.height, 1, 256, `${path}.height`),
    visibility: HUD_COMPONENT_VISIBILITY.includes(source.visibility)
      ? source.visibility
      : "auto"
  });
}

function stableId(value, path) {
  const text = nonEmptyText(value, path);
  if (!/^[a-z][a-z0-9]*(?:[._:-][a-z0-9]+)*$/i.test(text)) {
    throw new TypeError(`${path} inválido: ${text}.`);
  }
  return text;
}

function optionalStableId(value) {
  if (value == null || value === "") return null;
  return stableId(value, "id");
}

function nonEmptyText(value, path) {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError(`${path} deve ser texto não vazio.`);
  }
  return value.trim();
}

function optionalText(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text || null;
}

function objectValue(value, path) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${path} deve ser um objeto.`);
  }
  return value;
}

function boundedInteger(value, fallback, minimum, maximum, path) {
  const numeric = value == null ? fallback : Number(value);
  if (!Number.isFinite(numeric)) throw new TypeError(`${path} deve ser numérico.`);
  return Math.max(minimum, Math.min(maximum, Math.trunc(numeric)));
}

function nullableInteger(value) {
  if (value == null || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.trunc(numeric)) : null;
}

function uniqueTextList(value) {
  if (!Array.isArray(value)) throw new TypeError("A lista declarativa deve ser um array.");
  return Object.freeze([...new Set(value.map(item => String(item).trim()).filter(Boolean))]);
}

function cloneObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return Object.freeze({});
  try { return structuredClone(value); }
  catch { return {}; }
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
