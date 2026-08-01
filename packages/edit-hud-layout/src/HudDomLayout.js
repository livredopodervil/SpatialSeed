import { resolveHudSectionPlan } from "./HudLayoutPolicy.js?build=20260801-0046b";

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
    const itemContainer = ensureSectionShell(group);
    const children = [...itemContainer.children].filter(
      element => !element.matches?.("[data-hud-section-control]")
    );
    for (const [defaultItemIndex, element] of children.entries()) {
      const descriptor = descriptorFromElement({
        element,
        family,
        defaultFamilyIndex: familyRanks.get(family) ?? fallbackFamilyIndex,
        defaultItemIndex,
        groupElement: group,
        itemContainer
      });
      if (!descriptor || seen.has(descriptor.id)) continue;
      seen.add(descriptor.id);
      descriptors.push(descriptor);
    }
  }
  return Object.freeze(descriptors);
}

export function applyHudLayoutPlan(plan = [], {
  root = plan[0]?.element?.closest?.("#edit-hud") ?? null,
  profile = {}
} = {}) {
  if (!root) return;
  const strip = root.querySelector(".edit-hud-strip");
  if (!strip) return;
  const sectionPlan = resolveHudSectionPlan(plan, profile);
  const sectionElements = new Map();

  for (const section of sectionPlan) {
    const group = ensureSectionElement(strip, section.id, section.label ?? section.id);
    sectionElements.set(section.id, group);
    applySectionPolicy(group, section);
  }

  for (const item of plan) {
    const element = item.element;
    if (!element) continue;
    const section = sectionElements.get(item.section) ??
      ensureSectionElement(strip, item.section, item.section);
    const itemContainer = ensureSectionShell(section);
    if (element.parentElement !== itemContainer) itemContainer.append(element);
    element.hidden = Boolean(item.hidden);
    element.style.order = String(item.order);
    element.style.gridColumn = `span ${item.cellWidth}`;
    element.style.gridRow = `span ${item.cellHeight}`;
    element.dataset.hudZone = item.zone;
    element.dataset.hudPinned = item.pinned ? "true" : "false";
    element.dataset.hudLayoutReason = item.reason;
    element.dataset.hudLayoutDisabled = item.disabled ? "true" : "false";
    element.dataset.hudSection = item.section;
    element.dataset.hudCellWidth = String(item.cellWidth);
    element.dataset.hudCellHeight = String(item.cellHeight);
    applyItemPresentation(item);
    if (item.disabled && !element.matches?.("small")) {
      const control = element.matches?.("button, input, select")
        ? element
        : element.querySelector?.("button, input, select");
      if (control && control.dataset.contextManaged === "true") {
        control.disabled = true;
      }
    }
  }

  for (const group of strip.querySelectorAll("[data-edit-hud-group]")) {
    const sectionId = group.dataset.editHudGroup;
    const policy = sectionPlan.find(section => section.id === sectionId);
    if (!policy) {
      const hasVisible = [...ensureSectionShell(group).children].some(item => !item.hidden);
      group.hidden = !hasVisible;
    }
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

export function sectionAtPoint(root, x, y) {
  const document = root?.ownerDocument;
  const hit = document?.elementFromPoint?.(x, y);
  return hit?.closest?.("[data-edit-hud-group]")?.dataset?.editHudGroup ?? null;
}

export function itemAtPoint(root, x, y) {
  const document = root?.ownerDocument;
  const hit = document?.elementFromPoint?.(x, y);
  return hit?.closest?.("[data-hud-item]")?.dataset?.hudItem ?? null;
}

export function scrollHudSection(group, direction = 1) {
  const viewport = group?.querySelector?.("[data-hud-section-viewport]");
  if (!viewport) return;
  const horizontal = viewport.scrollWidth > viewport.clientWidth + 2;
  const amount = horizontal
    ? Math.max(1, viewport.clientWidth)
    : Math.max(1, viewport.clientHeight);
  viewport.scrollBy?.({
    left: horizontal ? amount * Math.sign(direction || 1) : 0,
    top: horizontal ? 0 : amount * Math.sign(direction || 1),
    behavior: "smooth"
  });
}

function ensureSectionElement(strip, sectionId, label) {
  const escaped = cssEscape(sectionId);
  let group = strip.querySelector(`[data-edit-hud-group="${escaped}"]`);
  if (!group) {
    group = strip.ownerDocument.createElement("div");
    group.className = "edit-hud-group hud-custom-section";
    group.dataset.editHudGroup = sectionId;
    group.dataset.hudCustomSection = "true";
    group.setAttribute("aria-label", label ?? sectionId);
    strip.append(group);
  }
  ensureSectionShell(group);
  return group;
}

function ensureSectionShell(group) {
  let viewport = group.querySelector(":scope > [data-hud-section-viewport]");
  let grid = viewport?.querySelector(":scope > [data-hud-section-grid]");
  if (viewport && grid) return grid;

  const document = group.ownerDocument;
  const originalChildren = [...group.children];
  const header = document.createElement("header");
  header.className = "hud-section-header";
  header.dataset.hudSectionControl = "true";
  const label = document.createElement("span");
  label.dataset.hudSectionLabel = "true";
  label.textContent = group.getAttribute("aria-label") ?? group.dataset.editHudGroup;
  const previous = document.createElement("button");
  previous.type = "button";
  previous.textContent = "‹";
  previous.title = "Ícones anteriores";
  previous.dataset.hudSectionControl = "true";
  previous.dataset.hudSectionPrevious = "true";
  const next = document.createElement("button");
  next.type = "button";
  next.textContent = "›";
  next.title = "Próximos ícones";
  next.dataset.hudSectionControl = "true";
  next.dataset.hudSectionNext = "true";
  header.append(label, previous, next);

  viewport = document.createElement("div");
  viewport.className = "hud-section-viewport";
  viewport.dataset.hudSectionViewport = "true";
  grid = document.createElement("div");
  grid.className = "hud-section-grid";
  grid.dataset.hudSectionGrid = "true";
  viewport.append(grid);
  group.replaceChildren(header, viewport);
  for (const child of originalChildren) grid.append(child);
  previous.addEventListener("click", event => {
    event.stopPropagation();
    scrollHudSection(group, -1);
  });
  next.addEventListener("click", event => {
    event.stopPropagation();
    scrollHudSection(group, 1);
  });
  return grid;
}

function applySectionPolicy(group, section) {
  group.hidden = Boolean(section.hidden);
  group.style.order = String(section.order);
  group.style.setProperty("--hud-section-columns", String(section.columns));
  group.style.setProperty("--hud-section-rows", String(section.rows));
  group.style.setProperty("--hud-section-color", section.color);
  group.style.setProperty("--hud-sector-rgb", hexToRgb(section.color).join(","));
  group.style.gridColumn = `span ${section.columns}`;
  group.style.gridRow = `span ${section.rows + (section.showHeader ? 1 : 0)}`;
  group.dataset.hudSectionColumns = String(section.columns);
  group.dataset.hudSectionRows = String(section.rows);
  group.dataset.hudSectionScroll = section.scrollMode;
  group.dataset.hudSectionHeader = section.showHeader ? "true" : "false";
  group.dataset.hudSectionZone = section.zone;
  const label = group.querySelector("[data-hud-section-label]");
  if (label) label.textContent = section.label ?? group.getAttribute("aria-label") ?? section.id;
  const viewport = group.querySelector("[data-hud-section-viewport]");
  if (viewport) {
    viewport.dataset.hudSectionScroll = section.scrollMode;
  }
  const controls = group.querySelectorAll("[data-hud-section-previous], [data-hud-section-next]");
  for (const control of controls) control.hidden = section.scrollMode !== "rotate";
}

function applyItemPresentation(item) {
  const element = item.element;
  const control = element.matches?.("button")
    ? element
    : element.querySelector?.("button");
  const iconTarget = control ?? element.querySelector?.("span") ?? null;
  if (item.icon !== null && iconTarget) {
    iconTarget.textContent = item.icon;
  }
  if (item.label) {
    element.dataset.hudLabel = item.label;
    const hintTarget = control ?? element;
    hintTarget.dataset.hudHintTitle = item.label;
    hintTarget.setAttribute?.("aria-label", item.label);
    if (!hintTarget.dataset.hudHint) hintTarget.title = item.label;
  }
}

function descriptorFromElement({
  element,
  family,
  defaultFamilyIndex,
  defaultItemIndex,
  groupElement,
  itemContainer
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
  const familyLabel = groupElement?.getAttribute?.("aria-label") ?? family;
  const label = element.dataset.hudLabel ??
    element.getAttribute?.("title") ??
    control?.getAttribute?.("aria-label") ??
    control?.getAttribute?.("title") ??
    readableId(id);
  const nativeIcon = readNativeIcon(element, control);
  return Object.freeze({
    id,
    family,
    nativeSection: family,
    label,
    nativeIcon,
    familyLabel,
    element,
    groupElement,
    itemContainer,
    customizable: Boolean(control || element.matches?.("button, label")),
    defaultFamilyIndex,
    defaultItemIndex
  });
}

function readNativeIcon(element, control) {
  if (element.matches?.("button")) return element.textContent?.trim() ?? null;
  const span = element.querySelector?.("span");
  if (span) return span.textContent?.trim() ?? null;
  if (control?.matches?.("button")) return control.textContent?.trim() ?? null;
  return null;
}

function hexToRgb(value) {
  const hex = String(value ?? "#528bff").replace("#", "");
  const normalized = hex.length === 6 ? hex : "528bff";
  return [0, 2, 4].map(offset => parseInt(normalized.slice(offset, offset + 2), 16));
}

function cssEscape(value) {
  if (globalThis.CSS?.escape) return globalThis.CSS.escape(String(value));
  return String(value).replace(/["\\]/g, "\\$&");
}

function readableId(value) {
  return String(value)
    .replace(/^edit-hud-/, "")
    .replace(/^hud-static:/, "")
    .replace(/[-_:]+/g, " ")
    .trim();
}
