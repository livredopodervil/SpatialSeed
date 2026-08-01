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
      title: values[0]?.familyLabel ?? family,
      descriptors: values
    })
  ));
}

export function createLegacyHudModule({
  id = "ui.edit-hud.legacy",
  title = "HUD de edição",
  descriptors = []
} = {}) {
  const hudComponents = descriptors.map(descriptor =>
    normalizeHudComponentDescriptor({
      id: descriptor.id,
      kind: descriptor.kind,
      category: descriptor.family,
      label: descriptor.label,
      icon: descriptor.nativeIcon,
      description: descriptor.element?.title ?? descriptor.label,
      sourceModule: id,
      sizing: descriptor.sizing,
      action: descriptor.action,
      defaultPlacement: descriptor.defaultPlacement,
      metadata: {
        legacyElementId: descriptor.element?.id ?? null,
        adoptedDom: true,
        familyLabel: descriptor.familyLabel ?? descriptor.family
      }
    })
  );
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

function safeId(value) {
  return String(value ?? "general")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "general";
}
