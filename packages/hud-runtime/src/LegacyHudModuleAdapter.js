import {
  normalizeHudComponentDescriptor
} from "../../ui-contracts/src/index.js?build=20260801-0046d";

export function createLegacyHudModules({
  idPrefix = "ui.edit-hud",
  descriptors = []
} = {}) {
  const byFamily = new Map();
  for (const descriptor of descriptors) {
    const family = String(descriptor.family ?? descriptor.category ?? "general").trim() || "general";
    const values = byFamily.get(family) ?? [];
    values.push(descriptor);
    byFamily.set(family, values);
  }
  return Object.freeze([...byFamily.entries()].map(([family, values]) =>
    createLegacyHudModule({
      id: `${idPrefix}.${safeId(family)}`,
      title: firstNonEmptyText([values[0]?.familyLabel, family]) ?? "HUD",
      descriptors: values
    })
  ));
}

export function createLegacyHudModule({
  id = "ui.edit-hud.legacy",
  title = "HUD de edição",
  descriptors = []
} = {}) {
  const hudComponents = descriptors.map((descriptor, index) => {
    const componentId = safeComponentId(
      descriptor.id ?? descriptor.element?.id,
      `${safeId(id)}.legacy-${index + 1}`
    );
    const label = legacyComponentLabel(descriptor, componentId);
    return normalizeHudComponentDescriptor({
      id: componentId,
      kind: descriptor.kind,
      category: safeComponentId(descriptor.family, "general"),
      label,
      icon: firstNonEmptyText([descriptor.nativeIcon, descriptor.icon]),
      description: firstNonEmptyText([
        descriptor.element?.title,
        descriptor.element?.getAttribute?.("aria-description"),
        descriptor.description,
        label
      ]),
      sourceModule: id,
      sizing: descriptor.sizing,
      action: descriptor.action,
      defaultPlacement: descriptor.defaultPlacement,
      metadata: {
        legacyElementId: descriptor.element?.id ?? null,
        adoptedDom: true,
        familyLabel: firstNonEmptyText([
          descriptor.familyLabel,
          descriptor.family
        ]) ?? "Geral",
        labelFallback: !firstNonEmptyText([descriptor.label])
      }
    });
  });
  const runtimes = {
    hudComponents: Object.fromEntries(descriptors.map(descriptor => [
      descriptor.id,
      {
        element: descriptor.element,
        nativeState: () => ({
          active: descriptor.element?.dataset?.active === "true",
          hidden: Boolean(descriptor.element?.hidden)
        })
      }
    ]))
  };
  return Object.freeze({
    descriptor: Object.freeze({
      id,
      version: "1",
      title,
      capabilities: [`ui.hud.${safeId(descriptors[0]?.family ?? "general")}`],
      hudComponents,
      panels: [],
      overlays: []
    }),
    runtimes
  });
}

function legacyComponentLabel(descriptor, fallbackId) {
  const element = descriptor?.element ?? null;
  const control = element?.matches?.("button,input,select,textarea")
    ? element
    : element?.querySelector?.("button,input,select,textarea");
  return firstNonEmptyText([
    descriptor?.label,
    element?.dataset?.hudLabel,
    control?.getAttribute?.("aria-label"),
    control?.title,
    element?.getAttribute?.("aria-label"),
    element?.title,
    control?.labels?.[0]?.textContent,
    control?.name,
    control?.textContent,
    element?.textContent,
    humanizeId(fallbackId),
    fallbackId
  ]) ?? "Controle";
}

function safeComponentId(value, fallback = "legacy-control") {
  const candidate = firstNonEmptyText([value, fallback]) ?? "legacy-control";
  const normalized = candidate
    .replace(/[^a-z0-9._:-]+/gi, "-")
    .replace(/^[^a-z]+/i, "legacy-")
    .replace(/[-._:]+$/g, "") || "legacy-control";
  return normalized;
}

function firstNonEmptyText(values) {
  for (const value of values) {
    if (value == null) continue;
    const text = String(value).replace(/\s+/g, " ").trim();
    if (text) return text;
  }
  return null;
}

function humanizeId(value) {
  const text = String(value ?? "")
    .replace(/^edit-hud[-:_]?/i, "")
    .replace(/^hud-static[:._-]?/i, "")
    .replace(/[._:-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text
    ? text.replace(/(^|\s)\S/g, match => match.toUpperCase())
    : null;
}

function safeId(value) {
  return String(value ?? "general")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "general";
}
