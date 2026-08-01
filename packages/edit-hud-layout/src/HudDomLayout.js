export function discoverHudDescriptors(root, {
  familyOrder = []
} = {}) {
  if (!root?.querySelectorAll) {
    throw new TypeError("discoverHudDescriptors exige um elemento raiz.");
  }
  const familyRanks = new Map(
    familyOrder.map((family, index) => [String(family), index])
  );
  const descriptors = [];
  const seen = new Set();

  for (const [fallbackFamilyIndex, group] of [
    ...root.querySelectorAll("[data-edit-hud-group]")
  ].entries()) {
    const family = String(group.dataset.editHudGroup ?? "").trim();
    if (!family) continue;
    const children = [...group.children];
    for (const [defaultItemIndex, element] of children.entries()) {
      const descriptor = descriptorFromElement({
        element,
        family,
        defaultFamilyIndex: familyRanks.get(family) ?? fallbackFamilyIndex,
        defaultItemIndex
      });
      if (!descriptor || seen.has(descriptor.id)) continue;
      seen.add(descriptor.id);
      descriptors.push(descriptor);
    }
  }
  return Object.freeze(descriptors);
}

export function applyHudLayoutPlan(plan = []) {
  const familyVisibility = new Map();
  for (const item of plan) {
    const element = item.element;
    if (!element) continue;
    element.hidden = Boolean(item.hidden);
    element.style.order = String(item.order);
    element.dataset.hudZone = item.zone;
    element.dataset.hudPinned = item.pinned ? "true" : "false";
    element.dataset.hudLayoutReason = item.reason;
    element.dataset.hudLayoutDisabled = item.disabled ? "true" : "false";
    if (item.disabled && !element.matches?.("small")) {
      const control = element.matches?.("button, input, select")
        ? element
        : element.querySelector?.("button, input, select");
      if (control && control.dataset.contextManaged === "true") {
        control.disabled = true;
      }
    }
    familyVisibility.set(
      item.family,
      Boolean(familyVisibility.get(item.family)) || !item.hidden
    );
  }

  const groups = new Set(plan.map(item => item.groupElement).filter(Boolean));
  for (const group of groups) {
    const family = String(group.dataset.editHudGroup ?? "");
    group.hidden = !familyVisibility.get(family);
  }
}

export function descriptorLabels(descriptors = []) {
  const families = {};
  const items = {};
  for (const descriptor of descriptors) {
    families[descriptor.family] ??= descriptor.familyLabel ?? descriptor.family;
    items[descriptor.id] = descriptor.label ?? descriptor.id;
  }
  return Object.freeze({
    families: Object.freeze(families),
    items: Object.freeze(items)
  });
}

function descriptorFromElement({
  element,
  family,
  defaultFamilyIndex,
  defaultItemIndex
}) {
  const control = element.matches?.("button, input, select")
    ? element
    : element.querySelector?.("button, input, select");
  const id = String(
    element.dataset?.hudItem ??
    element.id ??
    control?.id ??
    `hud-static:${family}:${defaultItemIndex}`
  ).trim();
  if (!id) return null;
  element.dataset.hudItem = id;
  element.dataset.hudFamily = family;
  const groupElement = element.parentElement;
  const familyLabel = groupElement?.getAttribute?.("aria-label") ?? family;
  const label = element.dataset.hudLabel ??
    element.getAttribute?.("title") ??
    control?.getAttribute?.("aria-label") ??
    control?.getAttribute?.("title") ??
    readableId(id);
  return Object.freeze({
    id,
    family,
    label,
    familyLabel,
    element,
    groupElement,
    customizable: Boolean(control || element.matches?.("button, label")),
    defaultFamilyIndex,
    defaultItemIndex
  });
}

function readableId(value) {
  return String(value)
    .replace(/^edit-hud-/, "")
    .replace(/^hud-static:/, "")
    .replace(/[-_:]+/g, " ")
    .trim();
}
