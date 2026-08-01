import { normalizeHudComponentDescriptor } from "./HudComponentDescriptor.js?build=20260801-0046d";

export function normalizeUiModuleDescriptor(value = {}, path = "uiModule") {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${path} deve ser um objeto.`);
  }
  const id = moduleId(value.id, `${path}.id`);
  const hudComponents = (value.hudComponents ?? []).map((descriptor, index) =>
    normalizeHudComponentDescriptor({
      ...descriptor,
      sourceModule: descriptor.sourceModule ?? id
    }, `${path}.hudComponents[${index}]`)
  );
  return deepFreeze({
    id,
    version: nonEmptyText(value.version ?? "1", `${path}.version`),
    title: nonEmptyText(value.title ?? id, `${path}.title`),
    description: optionalText(value.description),
    dependencies: uniqueIds(value.dependencies ?? []),
    optionalDependencies: uniqueIds(value.optionalDependencies ?? []),
    capabilities: uniqueIds(value.capabilities ?? []),
    commands: normalizeReferences(value.commands ?? []),
    queries: normalizeReferences(value.queries ?? []),
    hudComponents,
    panels: normalizeNamedDescriptors(value.panels ?? [], "panel", id),
    overlays: normalizeNamedDescriptors(value.overlays ?? [], "overlay", id),
    metadata: cloneObject(value.metadata)
  });
}

export function normalizePanelDescriptor(value = {}, path = "panel") {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${path} deve ser um objeto.`);
  }
  return deepFreeze({
    id: moduleId(value.id, `${path}.id`),
    title: nonEmptyText(value.title ?? value.id, `${path}.title`),
    icon: optionalText(value.icon),
    placement: ["left", "right", "bottom", "floating"].includes(value.placement)
      ? value.placement
      : "floating",
    capabilities: uniqueIds(value.capabilities ?? []),
    sourceModule: optionalStableId(value.sourceModule ?? value.moduleId),
    metadata: cloneObject(value.metadata)
  });
}

export function normalizeOverlayDescriptor(value = {}, path = "overlay") {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${path} deve ser um objeto.`);
  }
  return deepFreeze({
    id: moduleId(value.id, `${path}.id`),
    title: nonEmptyText(value.title ?? value.id, `${path}.title`),
    layer: moduleId(value.layer ?? "ui", `${path}.layer`),
    capabilities: uniqueIds(value.capabilities ?? []),
    sourceModule: optionalStableId(value.sourceModule ?? value.moduleId),
    metadata: cloneObject(value.metadata)
  });
}

function normalizeNamedDescriptors(values, kind, sourceModule) {
  if (!Array.isArray(values)) throw new TypeError(`${kind}s deve ser uma lista.`);
  return values.map((item, index) => kind === "panel"
    ? normalizePanelDescriptor({ ...item, sourceModule: item.sourceModule ?? sourceModule }, `${kind}s[${index}]`)
    : normalizeOverlayDescriptor({ ...item, sourceModule: item.sourceModule ?? sourceModule }, `${kind}s[${index}]`));
}

function normalizeReferences(values) {
  if (!Array.isArray(values)) throw new TypeError("Referências devem ser uma lista.");
  return Object.freeze(values.map((value, index) => {
    if (typeof value === "string") return Object.freeze({ id: moduleId(value, `references[${index}]`), metadata: Object.freeze({}) });
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new TypeError(`references[${index}] inválida.`);
    }
    return Object.freeze({
      id: moduleId(value.id, `references[${index}].id`),
      metadata: cloneObject(value.metadata)
    });
  }));
}

function uniqueIds(values) {
  if (!Array.isArray(values)) throw new TypeError("A lista de IDs deve ser um array.");
  return Object.freeze([...new Set(values.map((value, index) => moduleId(value, `ids[${index}]`)))]);
}

function moduleId(value, path) {
  const text = nonEmptyText(value, path);
  if (!/^[a-z][a-z0-9]*(?:[._:-][a-z0-9]+)*$/i.test(text)) {
    throw new TypeError(`${path} inválido: ${text}.`);
  }
  return text;
}

function optionalStableId(value) {
  if (value == null || value === "") return null;
  return moduleId(value, "sourceModule");
}

function nonEmptyText(value, path) {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${path} deve ser texto não vazio.`);
  return value.trim();
}

function optionalText(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text || null;
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
