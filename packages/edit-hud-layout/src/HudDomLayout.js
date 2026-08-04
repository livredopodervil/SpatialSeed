import { inferHudComponentKind, hudComponentSizing } from "../../ui-contracts/src/index.js?build=20260801-0046d";
import { resolveHudSectionPlan } from "./HudLayoutPolicy.js?build=20260801-0046d";

export function discoverHudDescriptors(root, { familyOrder = [] } = {}) {
  if (!root?.querySelectorAll) throw new TypeError("discoverHudDescriptors exige um elemento raiz.");
  const familyRanks = new Map(familyOrder.map((family, index) => [String(family), index]));
  const descriptors = [];
  const seen = new Set();
  for (const [fallbackFamilyIndex, group] of [...root.querySelectorAll("[data-edit-hud-group]")].entries()) {
    const family = String(group.dataset.editHudGroup ?? "").trim();
    if (!family) continue;
    const itemContainer = ensureSectionShell(group);
    const children = [...itemContainer.children].filter(element => !element.matches?.("[data-hud-section-control]"));
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

export function applyHudLayoutPlan(plan = [], { root = plan[0]?.element?.closest?.("#edit-hud") ?? null, profile = {} } = {}) {
  if (!root) return;
  const strip = root.querySelector(".edit-hud-strip");
  if (!strip) return;
  const sectionPlan = resolveHudSectionPlan(plan, profile);
  const sectionElements = new Map();
  root.style.setProperty("--hud-canvas-columns", String(profile.viewport?.columns ?? 12));
  root.style.setProperty("--hud-canvas-rows", String(profile.viewport?.rows ?? 6));
  strip.dataset.hudDeclarativeGrid = "true";

  for (const section of sectionPlan) {
    const group = ensureSectionElement(strip, section.id, section.label ?? section.id);
    sectionElements.set(section.id, group);
    applySectionPolicy(group, section);
  }

  for (const item of plan) {
    const element = item.element;
    if (!element) continue;
    if (!item.section || item.itemPolicy?.present === false) {
      element.hidden = true;
      element.dataset.hudUnplaced = "true";
      continue;
    }
    delete element.dataset.hudUnplaced;
    const section = sectionElements.get(item.section) ?? ensureSectionElement(strip, item.section, item.section);
    const itemContainer = ensureSectionShell(section);
    if (element.parentElement !== itemContainer) itemContainer.append(element);
    element.hidden = Boolean(item.hidden) || item.visibility === "hidden" || item.present === false;
    element.style.order = String(item.order);
    element.style.gridColumn = `${Math.max(0, item.x ?? 0) + 1} / span ${item.width ?? item.cellWidth ?? 1}`;
    element.style.gridRow = `${Math.max(0, item.y ?? 0) + 1} / span ${item.height ?? item.cellHeight ?? 1}`;
    element.dataset.hudZone = item.zone;
    element.dataset.hudPinned = item.pinned ? "true" : "false";
    element.dataset.hudLayoutReason = item.reason;
    element.dataset.hudLayoutDisabled = item.disabled ? "true" : "false";
    element.dataset.hudSection = item.section;
    element.dataset.hudCellX = String(item.x ?? 0);
    element.dataset.hudCellY = String(item.y ?? 0);
    element.dataset.hudCellWidth = String(item.width ?? item.cellWidth ?? 1);
    element.dataset.hudCellHeight = String(item.height ?? item.cellHeight ?? 1);
    element.dataset.hudComponentKind = item.kind ?? "button";
    element.dataset.hudLayoutAutoPlaced = item.layoutAutoPlaced ? "true" : "false";
    applyItemPresentation(item);
    if (item.disabled && !element.matches?.("small")) {
      const control = element.matches?.("button,input,select,textarea")
        ? element
        : element.querySelector?.("button,input,select,textarea");
      if (control && control.dataset.contextManaged === "true") control.disabled = true;
    }
  }

  const validSections = new Set(sectionPlan.map(section => section.id));
  for (const group of strip.querySelectorAll("[data-edit-hud-group]")) {
    const sectionId = group.dataset.editHudGroup;
    const policy = sectionPlan.find(section => section.id === sectionId);
    if (!policy) {
      group.hidden = true;
      if (!validSections.has(sectionId)) group.dataset.hudOrphanSection = "true";
    } else {
      delete group.dataset.hudOrphanSection;
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
  return Object.freeze({ families: Object.freeze(families), items: Object.freeze(items) });
}

export function sectionAtPoint(root, x, y) {
  const hit = root?.ownerDocument?.elementFromPoint?.(x, y);
  return hit?.closest?.("[data-edit-hud-group]")?.dataset?.editHudGroup ?? null;
}

export function itemAtPoint(root, x, y) {
  const hit = root?.ownerDocument?.elementFromPoint?.(x, y);
  return hit?.closest?.("[data-hud-item]")?.dataset?.hudItem ?? null;
}

export function sectionCellAtPoint(group, clientX, clientY) {
  const grid = group?.querySelector?.("[data-hud-section-grid]");
  if (!grid) return null;
  const rect = grid.getBoundingClientRect();
  const style = globalThis.getComputedStyle?.(grid);
  const columns = Math.max(1, Number(group.dataset.hudSectionColumns) || 1);
  const rows = Math.max(1, Number(group.dataset.hudSectionRows) || 1);
  const gap = Number.parseFloat(style?.columnGap ?? style?.gap) || 0;
  const cellWidth = Math.max(1, (rect.width - gap * (columns - 1)) / columns);
  const cellHeight = Math.max(1, (rect.height - gap * (rows - 1)) / rows);
  return Object.freeze({
    x: Math.max(0, Math.floor((clientX - rect.left) / (cellWidth + gap))),
    y: Math.max(0, Math.floor((clientY - rect.top + grid.parentElement.scrollTop) / (cellHeight + gap)))
  });
}

export function hudCanvasCellAtPoint(root, clientX, clientY) {
  const strip = root?.querySelector?.(".edit-hud-strip");
  if (!strip) return null;
  const rect = strip.getBoundingClientRect();
  const style = globalThis.getComputedStyle?.(root);
  const pitch = (Number.parseFloat(style?.getPropertyValue("--edit-hud-cell")) || 32) +
    (Number.parseFloat(style?.getPropertyValue("--edit-hud-gap")) || 3);
  return Object.freeze({
    x: Math.max(0, Math.floor((clientX - rect.left + strip.scrollLeft) / pitch)),
    y: Math.max(0, Math.floor((clientY - rect.top + strip.scrollTop) / pitch))
  });
}

export function scrollHudSection(group, direction = 1) {
  const viewport = group?.querySelector?.("[data-hud-section-viewport]");
  if (!viewport) return;
  const horizontal = viewport.scrollWidth > viewport.clientWidth + 2;
  const amount = horizontal ? Math.max(1, viewport.clientWidth) : Math.max(1, viewport.clientHeight);
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
  label.dataset.hudSectionDragHandle = "true";
  label.title = "Arraste para mover a seção; toque para editar.";
  label.textContent = group.getAttribute("aria-label") ?? group.dataset.editHudGroup;
  const previous = document.createElement("button");
  previous.type = "button";
  previous.textContent = "‹";
  previous.title = "Página anterior";
  previous.dataset.hudSectionControl = "true";
  previous.dataset.hudSectionPrevious = "true";
  const next = document.createElement("button");
  next.type = "button";
  next.textContent = "›";
  next.title = "Próxima página";
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
  const resize = document.createElement("span");
  resize.className = "hud-section-resize";
  resize.dataset.hudSectionResize = "true";
  resize.dataset.hudSectionControl = "true";
  resize.setAttribute("role", "button");
  resize.setAttribute("aria-label", "Redimensionar seção");
  group.replaceChildren(header, viewport, resize);
  for (const child of originalChildren) grid.append(child);
  previous.addEventListener("click", event => { event.stopPropagation(); scrollHudSection(group, -1); });
  next.addEventListener("click", event => { event.stopPropagation(); scrollHudSection(group, 1); });
  return grid;
}

function applySectionPolicy(group, section) {
  group.hidden = Boolean(section.hidden) || section.visibility === "hidden" || section.present === false;
  group.style.order = String(section.order);
  group.style.gridColumn = `${Math.max(0, section.x ?? 0) + 1} / span ${section.width ?? 4}`;
  group.style.gridRow = `${Math.max(0, section.y ?? 0) + 1} / span ${section.height ?? 2}`;
  group.style.setProperty("--hud-section-columns", String(section.columns));
  group.style.setProperty("--hud-section-rows", String(section.rows));
  group.style.setProperty("--hud-section-color", section.color);
  group.style.setProperty("--hud-sector-rgb", hexToRgb(section.color).join(","));
  group.dataset.hudSectionX = String(section.x ?? 0);
  group.dataset.hudSectionY = String(section.y ?? 0);
  group.dataset.hudSectionWidth = String(section.width ?? 4);
  group.dataset.hudSectionHeight = String(section.height ?? 2);
  group.dataset.hudSectionColumns = String(section.columns);
  group.dataset.hudSectionRows = String(section.rows);
  group.dataset.hudSectionScroll = section.scrollMode;
  group.dataset.hudSectionHeader = section.showHeader ? "true" : "false";
  group.dataset.hudSectionCompact = section.columns < 2 ? "true" : "false";
  group.dataset.hudSectionZone = section.zone;
  group.dataset.hudLayoutAutoPlaced = section.layoutAutoPlaced ? "true" : "false";
  const label = group.querySelector("[data-hud-section-label]");
  if (label) label.textContent = section.label ?? group.getAttribute("aria-label") ?? section.id;
  const viewport = group.querySelector("[data-hud-section-viewport]");
  if (viewport) viewport.dataset.hudSectionScroll = section.scrollMode;
  const controls = group.querySelectorAll("[data-hud-section-previous],[data-hud-section-next]");
  for (const control of controls) control.hidden = !["pages", "rotate"].includes(section.scrollMode);
}

function applyItemPresentation(item) {
  const element = item.element;
  const control = element.matches?.("button") ? element : element.querySelector?.("button");
  const iconTarget = control ?? element.querySelector?.("span") ?? null;
  if (item.icon !== null && iconTarget) iconTarget.textContent = item.icon;
  if (item.label) {
    element.dataset.hudLabel = item.label;
    const hintTarget = control ?? element;
    hintTarget.dataset.hudHintTitle = item.label;
    hintTarget.setAttribute?.("aria-label", item.label);
    if (!hintTarget.dataset.hudHint) hintTarget.title = item.label;
  }
}

function descriptorFromElement({ element, family, defaultFamilyIndex, defaultItemIndex, groupElement, itemContainer }) {
  const control = element.matches?.("button,input,select,textarea")
    ? element
    : element.querySelector?.("button,input,select,textarea");
  const id = String(element.dataset?.hudItem ?? element.id ?? control?.id ?? `hud-static:${family}:${defaultItemIndex}`).trim();
  if (!id) return null;
  element.dataset.hudItem = id;
  element.dataset.hudFamily = family;
  const kind = inferHudComponentKind(element);
  const sizing = hudComponentSizing(kind);
  const label = labelFromElement(element, control, id);
  const nativeIcon = iconFromElement(element, control);
  return Object.freeze({
    id,
    family,
    category: family,
    kind,
    sizing,
    label,
    familyLabel: groupElement.getAttribute("aria-label") ?? family,
    nativeIcon,
    icon: nativeIcon,
    action: actionFromElement(element, control),
    defaultFamilyIndex,
    defaultItemIndex,
    defaultPlacement: Object.freeze({
      section: family,
      x: null,
      y: null,
      width: sizing.preferredWidth,
      height: sizing.preferredHeight
    }),
    element,
    groupElement,
    itemContainer,
    customizable: !element.matches?.("small,[data-hud-static]")
  });
}


function actionFromElement(element, control) {
  const dataset = control?.dataset ?? element?.dataset ?? {};
  if (dataset.editSubject) return Object.freeze({ command: "edit.context.subject.set", arguments: Object.freeze({ level: dataset.editSubject }) });
  if (dataset.editTool) return Object.freeze({ command: "edit.context.tool.set", arguments: Object.freeze({ mode: dataset.editTool }) });
  if (dataset.editSelectionOperation) return Object.freeze({ command: "edit.context.selection-operation.set", arguments: Object.freeze({ operation: dataset.editSelectionOperation }) });
  if (dataset.editSelectionGesture) return Object.freeze({ command: "selection.gesture.set", arguments: Object.freeze({ mode: dataset.editSelectionGesture, toggle: true }) });
  if (dataset.editFrame) return Object.freeze({ command: "edit.context.frame.set", arguments: Object.freeze({ mode: dataset.editFrame }) });
  if (dataset.planarTool) return Object.freeze({ command: "planar.sketch.begin", arguments: Object.freeze({ mode: dataset.planarTool }) });
  const known = {
    "edit-hud-planar-finish": ["planar.sketch.finish", {}],
    "edit-hud-planar-back": ["planar.sketch.point.remove", {}],
    "edit-hud-planar-cancel": ["planar.sketch.cancel", {}],
    "edit-hud-planar-edit": ["planar.edit.begin", {}],
    "edit-hud-ruler": ["measurement.begin", { mode: "ruler" }],
    "edit-hud-protractor": ["measurement.begin", { mode: "protractor" }],
    "edit-hud-measure-clear": ["measurement.clear", {}],
    "edit-hud-view-reset": ["viewer.camera.reset", {}],
    "edit-hud-repeat": ["selection.repeat", {}]
  };
  const entry = known[element?.id ?? control?.id];
  return entry ? Object.freeze({ command: entry[0], arguments: Object.freeze(entry[1]) }) : null;
}

function labelFromElement(element, control, fallback) {
  return firstNonEmptyText([
    element?.dataset?.hudLabel,
    control?.getAttribute?.("aria-label"),
    control?.title,
    ariaLabelledByText(control),
    element?.getAttribute?.("aria-label"),
    element?.title,
    element?.dataset?.geometryLabel,
    control?.labels?.[0]?.textContent,
    element?.matches?.("label") ? element.textContent : null,
    control?.name,
    control?.textContent,
    element?.textContent,
    humanizeHudId(fallback),
    fallback
  ]) ?? "Controle";
}

function ariaLabelledByText(element) {
  const ids = String(element?.getAttribute?.("aria-labelledby") ?? "")
    .split(/\s+/)
    .filter(Boolean);
  if (!ids.length) return null;
  return ids
    .map(id => element?.ownerDocument?.getElementById?.(id)?.textContent)
    .filter(value => typeof value === "string" && value.trim())
    .join(" ");
}

function firstNonEmptyText(values) {
  for (const value of values) {
    if (value == null) continue;
    const text = String(value).replace(/\s+/g, " ").trim();
    if (text) return text;
  }
  return null;
}

function humanizeHudId(value) {
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
function iconFromElement(element, control) {
  const candidate = control ?? element;
  const text = String(candidate?.textContent ?? "").trim();
  return text && text.length <= 8 ? text : null;
}
function hexToRgb(value) {
  const normalized = /^#[0-9a-f]{6}$/i.test(String(value)) ? String(value).slice(1) : "528bff";
  return [0, 2, 4].map(offset => Number.parseInt(normalized.slice(offset, offset + 2), 16));
}
function cssEscape(value) {
  return globalThis.CSS?.escape ? globalThis.CSS.escape(value) : String(value).replace(/["\\]/g, "\\$&");
}
