import { resolveGridLayout } from "./HudGridEngine.js?build=20260801-0046d";

export const HUD_LAYOUT_SCHEMA_VERSION = "spatial-seed-hud-layout-v5";
export const HUD_LAYOUT_STORAGE_KEY = "spatialseed.edit.hud.layout.v5";
export const HUD_VISIBILITY_VALUES = Object.freeze(["inherit", "auto", "always", "hidden"]);
export const HUD_ZONE_VALUES = Object.freeze(["inherit", "fixed-start", "adaptive", "fixed-end"]);
export const HUD_ACTIVATION_MODES = Object.freeze(["native", "momentary", "toggle"]);
export const HUD_SECTION_SCROLL_MODES = Object.freeze(["pages", "scroll", "expand", "clip", "rotate"]);
export const HUD_DOCK_VALUES = Object.freeze(["floating", "top", "bottom"]);
export const HUD_ORIENTATION_VALUES = Object.freeze(["horizontal", "vertical"]);
export const HUD_SIZE_VALUES = Object.freeze(["compact", "normal", "large"]);
export const HUD_COLLISION_VALUES = Object.freeze(["push", "swap", "reject"]);

const DEFAULT_VIEWPORT_POLICY = Object.freeze({
  dock: "floating",
  orientation: "horizontal",
  size: "normal",
  opacity: 0.96,
  columns: 12,
  rows: 6,
  left: 12,
  top: 96,
  collisionMode: "push"
});

const DEFAULT_SECTION_POLICY = Object.freeze({
  present: true,
  label: null,
  visibility: "auto",
  zone: "adaptive",
  order: null,
  color: "#528bff",
  x: null,
  y: null,
  width: 4,
  height: 2,
  columns: 4,
  rows: 1,
  scrollMode: "pages",
  showHeader: true,
  collisionMode: "push"
});

const DEFAULT_ITEM_POLICY = Object.freeze({
  present: true,
  label: null,
  icon: null,
  section: null,
  visibility: "inherit",
  zone: "inherit",
  order: null,
  x: null,
  y: null,
  width: 1,
  height: 1,
  cellWidth: 1,
  cellHeight: 1,
  command: null,
  activation: Object.freeze({
    mode: "native",
    group: null,
    activates: Object.freeze([]),
    deactivates: Object.freeze([]),
    activatesOnDeactivate: Object.freeze([]),
    deactivatesOnDeactivate: Object.freeze([]),
    onActivate: null,
    onDeactivate: null
  })
});

const ZONE_BASE = Object.freeze({
  "fixed-start": 0,
  adaptive: 1_000_000,
  "fixed-end": 2_000_000
});

export function createDefaultHudLayoutDocument({
  familyIds = [],
  sectionIds = familyIds,
  itemIds = [],
  itemSections = {},
  itemDescriptors = {},
  legacyPreferences = null,
  familyOrder = [],
  sectionOrder = familyOrder
} = {}) {
  const adaptive = legacyPreferences?.adaptiveOrder !== false;
  const groups = legacyPreferences?.groups ?? {};
  const orderedSections = uniqueStrings([...sectionIds, ...familyIds]);
  const orderBySection = rankMap([...sectionOrder, ...familyOrder]);
  const sections = {};
  const viewport = viewportFromLegacyPreferences(legacyPreferences);
  const sectionEntries = orderedSections.map((sectionId, index) => {
    const internalColumns = 4;
    const internalRows = 1;
    return {
      id: sectionId,
      order: orderBySection.get(sectionId) ?? index,
      width: internalColumns,
      height: internalRows + 1
    };
  });
  const sectionLayout = resolveGridLayout({
    entries: sectionEntries,
    columns: viewport.columns,
    minimumRows: viewport.rows,
    collisionMode: "push"
  });
  const sectionPlacement = new Map(sectionLayout.placements.map(item => [item.id, item]));

  for (const [index, sectionId] of orderedSections.entries()) {
    const placement = sectionPlacement.get(sectionId);
    sections[sectionId] = {
      ...DEFAULT_SECTION_POLICY,
      visibility: groups[sectionId] === false ? "hidden" : "auto",
      zone: adaptive ? "adaptive" : "fixed-start",
      order: adaptive ? null : orderBySection.get(sectionId) ?? index,
      color: defaultSectionColor(sectionId, index),
      x: placement?.x ?? null,
      y: placement?.y ?? null,
      width: placement?.width ?? 4,
      height: placement?.height ?? 2
    };
  }

  const normalizedItemSections = normalizeItemSections(itemSections);
  const items = {};
  const sectionItemCounters = new Map();
  for (const itemId of uniqueStrings(itemIds)) {
    const descriptor = itemDescriptors[itemId] ?? {};
    const section = normalizedItemSections[itemId] ?? descriptor.defaultPlacement?.section ?? null;
    const sizing = descriptor.sizing ?? {};
    const width = boundedInteger(
      descriptor.defaultPlacement?.width,
      boundedInteger(sizing.preferredWidth, 1, 1, 256),
      boundedInteger(sizing.minWidth, 1, 1, 256),
      boundedInteger(sizing.maxWidth, 256, 1, 256)
    );
    const height = boundedInteger(
      descriptor.defaultPlacement?.height,
      boundedInteger(sizing.preferredHeight, 1, 1, 256),
      boundedInteger(sizing.minHeight, 1, 1, 256),
      boundedInteger(sizing.maxHeight, 256, 1, 256)
    );
    const index = sectionItemCounters.get(section) ?? 0;
    sectionItemCounters.set(section, index + 1);
    items[itemId] = {
      ...DEFAULT_ITEM_POLICY,
      activation: { ...DEFAULT_ITEM_POLICY.activation },
      section,
      order: index,
      x: descriptor.defaultPlacement?.x ?? null,
      y: descriptor.defaultPlacement?.y ?? null,
      width,
      height,
      cellWidth: width,
      cellHeight: height,
      command: descriptor.action
        ? { id: descriptor.action.command, arguments: descriptor.action.arguments ?? {} }
        : null
    };
  }

  // The default document is also deterministic for heterogeneous widgets.
  // A select or slider may span several cells; assigning x=index%columns would
  // overlap the following buttons before the first render.
  for (const sectionId of orderedSections) {
    const policy = sections[sectionId];
    const entries = Object.entries(items)
      .filter(([, item]) => item.section === sectionId)
      .map(([id, item]) => ({ id, ...item, present: true }));
    const layout = resolveGridLayout({
      entries,
      columns: policy.columns,
      minimumRows: policy.rows,
      collisionMode: policy.collisionMode
    });
    for (const placement of layout.placements) {
      Object.assign(items[placement.id], {
        x: placement.x,
        y: placement.y,
        width: placement.width,
        height: placement.height,
        cellWidth: placement.width,
        cellHeight: placement.height
      });
    }
  }

  return freezeDocument({
    schemaVersion: HUD_LAYOUT_SCHEMA_VERSION,
    activeProfile: "default",
    profiles: {
      default: {
        label: "Padrão",
        viewport,
        sections,
        items
      }
    }
  });
}

export function normalizeHudLayoutDocument(value = {}, options = {}) {
  const source = value && typeof value === "object" ? value : {};
  const migrated = migrateDocument(source, options);
  const fallback = createDefaultHudLayoutDocument(options);
  const activeProfile = nonEmptyString(migrated.activeProfile) ?? "default";
  const sourceProfiles = migrated.profiles && typeof migrated.profiles === "object"
    ? migrated.profiles
    : {};
  const profileIds = uniqueStrings([...Object.keys(sourceProfiles), activeProfile, "default"]);
  const profiles = {};
  for (const profileId of profileIds) {
    profiles[profileId] = normalizeHudLayoutProfile(sourceProfiles[profileId] ?? {}, {
      ...options,
      fallbackProfile: fallback.profiles.default,
      profileId
    });
  }
  return freezeDocument({
    schemaVersion: HUD_LAYOUT_SCHEMA_VERSION,
    activeProfile: profiles[activeProfile] ? activeProfile : "default",
    profiles
  });
}

export function normalizeHudLayoutProfile(value = {}, {
  familyIds = [],
  sectionIds = familyIds,
  itemIds = [],
  itemSections = {},
  itemDescriptors = {},
  fallbackProfile = null,
  profileId = "default"
} = {}) {
  const source = value && typeof value === "object" ? value : {};
  const sourceSections = source.sections ?? source.families ?? {};
  const fallback = fallbackProfile ?? { sections: {}, items: {} };
  const fallbackSections = fallback.sections ?? fallback.families ?? {};
  const sectionKeys = uniqueStrings([
    ...sectionIds,
    ...familyIds,
    ...Object.keys(fallbackSections),
    ...Object.keys(sourceSections)
  ]);
  const itemKeys = uniqueStrings([
    ...itemIds,
    ...Object.keys(fallback.items ?? {}),
    ...Object.keys(source.items ?? {})
  ]);
  const normalizedItemSections = normalizeItemSections(itemSections);
  const sections = {};
  const items = {};

  for (const [index, sectionId] of sectionKeys.entries()) {
    sections[sectionId] = normalizeSectionPolicy(
      sourceSections?.[sectionId],
      fallbackSections?.[sectionId] ?? {
        ...DEFAULT_SECTION_POLICY,
        color: defaultSectionColor(sectionId, index)
      }
    );
  }

  for (const itemId of itemKeys) {
    const descriptor = itemDescriptors[itemId] ?? {};
    const sizing = descriptor.sizing ?? {};
    const defaultItem = fallback.items?.[itemId] ?? {
      ...DEFAULT_ITEM_POLICY,
      section: normalizedItemSections[itemId] ?? descriptor.defaultPlacement?.section ?? null,
      width: descriptor.defaultPlacement?.width ?? sizing.preferredWidth ?? 1,
      height: descriptor.defaultPlacement?.height ?? sizing.preferredHeight ?? 1
    };
    items[itemId] = normalizeItemPolicy(source.items?.[itemId], defaultItem, { descriptor });
  }

  return Object.freeze({
    label: nonEmptyString(source.label) ?? nonEmptyString(fallback.label) ?? readableProfileId(profileId),
    viewport: normalizeViewportPolicy(source.viewport, fallback.viewport),
    sections: Object.freeze(sections),
    items: Object.freeze(items)
  });
}

export function normalizeViewportPolicy(value = {}, fallback = null) {
  const source = value && typeof value === "object" ? value : {};
  const base = fallback && typeof fallback === "object" ? fallback : DEFAULT_VIEWPORT_POLICY;
  return Object.freeze({
    dock: HUD_DOCK_VALUES.includes(source.dock) ? source.dock : allowedOr(base.dock, HUD_DOCK_VALUES, DEFAULT_VIEWPORT_POLICY.dock),
    orientation: HUD_ORIENTATION_VALUES.includes(source.orientation) ? source.orientation : allowedOr(base.orientation, HUD_ORIENTATION_VALUES, DEFAULT_VIEWPORT_POLICY.orientation),
    size: HUD_SIZE_VALUES.includes(source.size) ? source.size : allowedOr(base.size, HUD_SIZE_VALUES, DEFAULT_VIEWPORT_POLICY.size),
    opacity: boundedNumber(source.opacity, boundedNumber(base.opacity, 0.96, 0.2, 1), 0.2, 1),
    columns: boundedInteger(source.columns, boundedInteger(base.columns, 12, 1, 1024), 1, 1024),
    rows: boundedInteger(source.rows, boundedInteger(base.rows, 6, 1, 1024), 1, 1024),
    left: boundedNumber(source.left, boundedNumber(base.left, 12, 0, 100000), 0, 100000),
    top: boundedNumber(source.top, boundedNumber(base.top, 96, 0, 100000), 0, 100000),
    collisionMode: HUD_COLLISION_VALUES.includes(source.collisionMode)
      ? source.collisionMode
      : allowedOr(base.collisionMode, HUD_COLLISION_VALUES, "push")
  });
}

export function normalizeSectionPolicy(value = {}, fallback = null) {
  const source = value && typeof value === "object" ? value : {};
  const base = fallback && typeof fallback === "object" ? fallback : DEFAULT_SECTION_POLICY;
  const columns = boundedInteger(source.columns, boundedInteger(base.columns, 4, 1, 256), 1, 256);
  const rows = boundedInteger(source.rows, boundedInteger(base.rows, 1, 1, 256), 1, 256);
  return Object.freeze({
    present: source.present === undefined ? base.present !== false : Boolean(source.present),
    label: Object.hasOwn(source, "label") ? nullableString(source.label, null) : nullableString(base.label, null),
    visibility: normalizeVisibility(source.visibility, normalizeVisibility(base.visibility, DEFAULT_SECTION_POLICY.visibility, false), false),

    hidden: source.visibility === "hidden" || source.hidden === true,    zone: normalizeZone(source.zone, normalizeZone(base.zone, DEFAULT_SECTION_POLICY.zone, false), false),
    order: Object.hasOwn(source, "order") ? nullableInteger(source.order, null) : nullableInteger(base.order, null),
    color: normalizeColor(source.color, normalizeColor(base.color, DEFAULT_SECTION_POLICY.color)),
    x: Object.hasOwn(source, "x") ? nullableNonNegativeInteger(source.x, null) : nullableNonNegativeInteger(base.x, null),
    y: Object.hasOwn(source, "y") ? nullableNonNegativeInteger(source.y, null) : nullableNonNegativeInteger(base.y, null),
    width: boundedInteger(source.width, boundedInteger(base.width, columns, 1, 256), 1, 256),
    height: boundedInteger(source.height, boundedInteger(base.height, rows + 1, 1, 256), 1, 256),
    columns,
    rows,
    scrollMode: HUD_SECTION_SCROLL_MODES.includes(source.scrollMode)
      ? source.scrollMode
      : allowedOr(base.scrollMode, HUD_SECTION_SCROLL_MODES, DEFAULT_SECTION_POLICY.scrollMode),
    showHeader: source.showHeader === undefined ? base.showHeader !== false : Boolean(source.showHeader),
    collisionMode: HUD_COLLISION_VALUES.includes(source.collisionMode)
      ? source.collisionMode
      : allowedOr(base.collisionMode, HUD_COLLISION_VALUES, "push")
  });
}

export const normalizeFamilyPolicy = normalizeSectionPolicy;

export function normalizeItemPolicy(value = {}, fallback = null, { descriptor = null } = {}) {
  const source = value && typeof value === "object" ? value : {};
  const base = fallback && typeof fallback === "object" ? fallback : DEFAULT_ITEM_POLICY;
  const sizing = descriptor?.sizing ?? {};
  const minWidth = boundedInteger(sizing.minWidth, 1, 1, 256);
  const minHeight = boundedInteger(sizing.minHeight, 1, 1, 256);
  const maxWidth = boundedInteger(sizing.maxWidth, 256, minWidth, 256);
  const maxHeight = boundedInteger(sizing.maxHeight, 256, minHeight, 256);
  const requestedWidth = source.width ?? source.cellWidth;
  const requestedHeight = source.height ?? source.cellHeight;
  const baseWidth = base.width ?? base.cellWidth ?? sizing.preferredWidth ?? 1;
  const baseHeight = base.height ?? base.cellHeight ?? sizing.preferredHeight ?? 1;
  const width = boundedInteger(requestedWidth, boundedInteger(baseWidth, 1, minWidth, maxWidth), minWidth, maxWidth);
  const height = boundedInteger(requestedHeight, boundedInteger(baseHeight, 1, minHeight, maxHeight), minHeight, maxHeight);
  return Object.freeze({
    present: source.present === undefined ? base.present !== false : Boolean(source.present),
    label: Object.hasOwn(source, "label") ? nullableString(source.label, null) : nullableString(base.label, null),
    icon: Object.hasOwn(source, "icon") ? nullableString(source.icon, null) : nullableString(base.icon, null),
    section: Object.hasOwn(source, "section") ? nullableString(source.section, null) : nullableString(base.section, null),
    visibility: normalizeVisibility(source.visibility, normalizeVisibility(base.visibility, DEFAULT_ITEM_POLICY.visibility, true), true),

    hidden: source.visibility === "hidden" || source.hidden === true,    zone: normalizeZone(source.zone, normalizeZone(base.zone, DEFAULT_ITEM_POLICY.zone, true), true),
    order: Object.hasOwn(source, "order") ? nullableInteger(source.order, null) : nullableInteger(base.order, null),
    x: Object.hasOwn(source, "x") ? nullableNonNegativeInteger(source.x, null) : nullableNonNegativeInteger(base.x, null),
    y: Object.hasOwn(source, "y") ? nullableNonNegativeInteger(source.y, null) : nullableNonNegativeInteger(base.y, null),
    width,
    height,
    cellWidth: width,
    cellHeight: height,
    command: normalizeCommandSpec(source.command, base.command),
    activation: normalizeActivationPolicy(source.activation, base.activation)
  });
}

export function normalizeCommandSpec(value, fallback = null) {
  if (value === null || value === false || value === "") return null;
  const source = value && typeof value === "object" ? value : null;
  if (!source) return normalizeCommandSpec(fallback, null);
  const id = nonEmptyString(source.id ?? source.command);
  if (!id) return null;
  return Object.freeze({ id, arguments: freezeJsonObject(source.arguments ?? source.args ?? {}) });
}

export function normalizeActivationPolicy(value = {}, fallback = null) {
  const source = value && typeof value === "object" ? value : {};
  const base = fallback && typeof fallback === "object" ? fallback : DEFAULT_ITEM_POLICY.activation;
  return Object.freeze({
    mode: HUD_ACTIVATION_MODES.includes(source.mode) ? source.mode : allowedOr(base.mode, HUD_ACTIVATION_MODES, "native"),
    group: nullableString(source.group, nullableString(base.group, null)),
    activates: Object.freeze(uniqueStrings(source.activates ?? base.activates ?? [])),
    deactivates: Object.freeze(uniqueStrings(source.deactivates ?? base.deactivates ?? [])),
    activatesOnDeactivate: Object.freeze(uniqueStrings(source.activatesOnDeactivate ?? base.activatesOnDeactivate ?? [])),
    deactivatesOnDeactivate: Object.freeze(uniqueStrings(source.deactivatesOnDeactivate ?? base.deactivatesOnDeactivate ?? [])),
    onActivate: normalizeCommandSpec(source.onActivate, base.onActivate),
    onDeactivate: normalizeCommandSpec(source.onDeactivate, base.onDeactivate)
  });
}

export function resolveHudLayoutPlan({
  descriptors = [],
  profile = {},
  adaptiveGroupOrder = [],
  adaptiveItemOrder = [],
  familyContext = {},
  itemContext = {}
} = {}) {
  const itemSections = Object.fromEntries(descriptors.map(descriptor => [descriptor.id, descriptor.family]));
  const itemDescriptors = Object.fromEntries(descriptors.map(descriptor => [descriptor.id, descriptor]));
  const normalizedProfile = normalizeHudLayoutProfile(profile, {
    sectionIds: descriptors.map(descriptor => descriptor.family),
    itemIds: descriptors.map(descriptor => descriptor.id),
    itemSections,
    itemDescriptors
  });
  const groupRanks = rankMap(adaptiveGroupOrder);
  const itemRanks = rankMap(adaptiveItemOrder);
  const familyFallbackRanks = fallbackFamilyRanks(descriptors);
  const raw = descriptors.map(descriptor => {
    const itemPolicy = normalizedProfile.items[descriptor.id] ?? normalizeItemPolicy({}, {}, { descriptor });
    const sectionId = itemPolicy.section ?? descriptor.family;
    const sectionPolicy = normalizedProfile.sections[sectionId] ?? normalizedProfile.sections[descriptor.family] ?? DEFAULT_SECTION_POLICY;
    const visibility = itemPolicy.visibility === "inherit" ? sectionPolicy.visibility : itemPolicy.visibility;
    const zone = itemPolicy.zone === "inherit" ? sectionPolicy.zone : itemPolicy.zone;
    const familyState = familyContext[descriptor.family] ?? {};
    const sectionState = familyContext[sectionId] ?? familyState;
    const itemState = itemContext[descriptor.id] ?? {};
    const moduleEnabled = itemState.moduleEnabled !== false;
    const contextVisible = itemState.visible ?? sectionState.visible ?? true;
    const contextAvailable = itemState.available ?? sectionState.available ?? true;
    const pinned = zone !== "adaptive";
    const hidden = !moduleEnabled || !itemPolicy.present || !sectionPolicy.present || !sectionId || visibility === "hidden" ||
      (visibility === "auto" && !contextVisible && !pinned);
    const sectionRank = finiteInteger(sectionPolicy.order) ??
      (zone === "adaptive" ? groupRanks.get(sectionId) : null) ??
      familyFallbackRanks.get(descriptor.family) ?? 0;
    const itemRank = finiteInteger(itemPolicy.order) ??
      (zone === "adaptive" ? itemRanks.get(descriptor.id) : null) ??
      finiteInteger(descriptor.defaultItemIndex) ?? 0;
    const order = (ZONE_BASE[zone] ?? ZONE_BASE.adaptive) + Math.max(0, sectionRank) * 10_000 + Math.max(0, itemRank);
    return {
      ...descriptor,
      section: sectionId,
      sectionPolicy,
      itemPolicy,
      label: itemPolicy.label ?? descriptor.label,
      icon: itemPolicy.icon ?? descriptor.nativeIcon ?? descriptor.icon ?? null,
      command: itemPolicy.command,
      activation: itemPolicy.activation,
      width: itemPolicy.width,
      height: itemPolicy.height,
      cellWidth: itemPolicy.width,
      cellHeight: itemPolicy.height,
      x: itemPolicy.x,
      y: itemPolicy.y,
      visibility,
      zone,
      pinned,
      hidden,
      disabled: !contextAvailable,
      contextVisible: Boolean(contextVisible),
      contextAvailable: Boolean(contextAvailable),
      moduleEnabled,
      order,
      reason: !moduleEnabled ? "module-disabled"
        : !itemPolicy.present ? "removed-from-profile"
        : !sectionPolicy.present ? "section-removed"
          : !sectionId ? "unplaced"
            : hidden ? visibility === "hidden" ? "user-hidden" : "context-hidden"
              : pinned && !contextVisible ? "pinned-out-of-context"
                : visibility === "always" ? "always-visible" : "context-visible"
    };
  });

  const bySection = new Map();
  for (const item of raw) {
    if (!item.section) continue;
    const items = bySection.get(item.section) ?? [];
    items.push(item);
    bySection.set(item.section, items);
  }
  const resolvedById = new Map();
  for (const [sectionId, items] of bySection) {
    const sectionPolicy = normalizedProfile.sections[sectionId] ?? DEFAULT_SECTION_POLICY;
    const layout = resolveGridLayout({
      entries: items.filter(item => !item.hidden).map(item => ({
        ...item,
        present: true,
        defaultIndex: item.defaultItemIndex
      })),
      columns: sectionPolicy.columns,
      minimumRows: sectionPolicy.rows,
      collisionMode: sectionPolicy.collisionMode
    });
    for (const placement of layout.placements) resolvedById.set(placement.id, placement);
  }

  return Object.freeze(raw.map(item => {
    const placement = resolvedById.get(item.id);
    return Object.freeze({
      ...item,
      x: placement?.x ?? item.x,
      y: placement?.y ?? item.y,
      layoutAutoPlaced: placement?.autoPlaced ?? false
    });
  }));
}

export function resolveHudSectionPlan(plan = [], profile = {}) {
  const itemDescriptors = Object.fromEntries(plan.map(item => [item.id, item]));
  const normalized = normalizeHudLayoutProfile(profile, {
    sectionIds: plan.map(item => item.section).filter(Boolean),
    itemIds: plan.map(item => item.id),
    itemSections: Object.fromEntries(plan.map(item => [item.id, item.section]).filter(([, section]) => section)),
    itemDescriptors
  });
  const sectionIds = uniqueStrings([...Object.keys(normalized.sections), ...plan.map(item => item.section).filter(Boolean)]);
  const entries = sectionIds.map((sectionId, fallbackIndex) => {
    const policy = normalized.sections[sectionId] ?? DEFAULT_SECTION_POLICY;
    const items = plan.filter(item => item.section === sectionId && !item.hidden);
    return {
      id: sectionId,
      ...policy,
      present: policy.present && policy.visibility !== "hidden" && items.length > 0,
      order: (ZONE_BASE[policy.zone] ?? ZONE_BASE.adaptive) + (finiteInteger(policy.order) ?? fallbackIndex),
      itemCount: items.length,
      capacity: policy.columns * policy.rows
    };
  });
  const layout = resolveGridLayout({
    entries,
    columns: normalized.viewport.columns,
    minimumRows: normalized.viewport.rows,
    collisionMode: normalized.viewport.collisionMode
  });
  const placements = new Map(layout.placements.map(item => [item.id, item]));
  return Object.freeze(entries.map(section => {
    const placement = placements.get(section.id);
    return Object.freeze({
      ...section,
      hidden: !section.present,
      x: placement?.x ?? section.x,
      y: placement?.y ?? section.y,
      width: placement?.width ?? section.width,
      height: placement?.height ?? section.height,
      layoutAutoPlaced: placement?.autoPlaced ?? false
    });
  }));
}

export function hudLayoutSignature(plan = [], profile = {}) {
  const sections = resolveHudSectionPlan(plan, profile);
  return JSON.stringify({
    viewport: profile.viewport,
    sections: sections.map(section => [
      section.id, section.present, section.label, section.visibility, section.zone,
      section.order, section.color, section.x, section.y, section.width, section.height,
      section.columns, section.rows, section.scrollMode, section.showHeader, section.hidden
    ]),
    items: plan.map(item => [
      item.id, item.itemPolicy?.present, item.section, item.icon, item.label,
      item.zone, item.order, item.x, item.y, item.hidden, item.disabled,
      item.pinned, item.width, item.height, item.command?.id ?? null,
      item.command?.arguments ?? null, item.activation
    ])
  });
}

export function familyPolicyDefaults() { return DEFAULT_SECTION_POLICY; }
export const sectionPolicyDefaults = familyPolicyDefaults;
export function itemPolicyDefaults() { return DEFAULT_ITEM_POLICY; }

function migrateDocument(source, options) {
  if (source.schemaVersion === HUD_LAYOUT_SCHEMA_VERSION) return source;
  if (!source.profiles || typeof source.profiles !== "object") return source;
  const defaults = createDefaultHudLayoutDocument(options);
  const profiles = {};
  for (const [profileId, profile] of Object.entries(source.profiles)) {
    const fallback = defaults.profiles.default;
    const sections = {};
    const sourceSections = profile.sections ?? profile.families ?? {};
    for (const [sectionId, policy] of Object.entries(sourceSections)) {
      sections[sectionId] = {
        ...policy,
        present: policy.present !== false,
        width: policy.width ?? policy.columns ?? 4,
        height: policy.height ?? Math.max(2, (policy.rows ?? 1) + 1),
        scrollMode: policy.scrollMode === "rotate" ? "pages" : policy.scrollMode
      };
    }
    const items = {};
    for (const [itemId, policy] of Object.entries(profile.items ?? {})) {
      items[itemId] = {
        ...policy,
        present: policy.present !== false,
        width: policy.width ?? policy.cellWidth ?? 1,
        height: policy.height ?? policy.cellHeight ?? 1
      };
    }
    profiles[profileId] = {
      ...profile,
      label: profile.label ?? readableProfileId(profileId),
      viewport: profile.viewport ?? fallback.viewport,
      sections,
      items
    };
  }
  return { ...source, schemaVersion: HUD_LAYOUT_SCHEMA_VERSION, profiles };
}

function viewportFromLegacyPreferences(value = null) {
  const source = value && typeof value === "object" ? value : {};
  return normalizeViewportPolicy({
    dock: source.dock,
    orientation: source.orientation,
    size: source.size,
    opacity: source.opacity,
    columns: source.columns,
    rows: source.rows,
    left: source.left,
    top: source.top
  });
}

function freezeDocument(document) {
  const profiles = {};
  for (const [profileId, profile] of Object.entries(document.profiles ?? {})) {
    profiles[profileId] = deepFreeze(profile);
  }
  return Object.freeze({
    schemaVersion: HUD_LAYOUT_SCHEMA_VERSION,
    activeProfile: document.activeProfile ?? "default",
    profiles: Object.freeze(profiles)
  });
}

function fallbackFamilyRanks(descriptors) {
  const ranks = new Map();
  for (const descriptor of descriptors) {
    if (!ranks.has(descriptor.family)) ranks.set(descriptor.family, finiteInteger(descriptor.defaultFamilyIndex) ?? ranks.size);
  }
  return ranks;
}

function normalizeVisibility(value, fallback, allowInherit) {
  const allowed = allowInherit ? HUD_VISIBILITY_VALUES : HUD_VISIBILITY_VALUES.filter(item => item !== "inherit");
  return allowed.includes(value) ? value : fallback;
}

function normalizeZone(value, fallback, allowInherit) {
  const allowed = allowInherit ? HUD_ZONE_VALUES : HUD_ZONE_VALUES.filter(item => item !== "inherit");
  return allowed.includes(value) ? value : fallback;
}

function normalizeColor(value, fallback) {
  const candidate = String(value ?? "").trim();
  return /^#[0-9a-f]{6}$/i.test(candidate) ? candidate.toLowerCase() : fallback;
}

function freezeJsonObject(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  try { return deepFreeze(structuredClone(source)); }
  catch { return Object.freeze({}); }
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function defaultSectionColor(sectionId, index) {
  const known = {
    subject: "#4cc9f0", tool: "#528bff", quick: "#9a6eff", selection: "#e75db5",
    frame: "#7e7bff", axes: "#ff994a", snap: "#eec249", navigation: "#3ac4b5",
    reference: "#ff6984", "drawing-target": "#4fc3a1", appearance: "#c47cff",
    planar: "#41d28f", measure: "#27b9d6", lifecycle: "#9bcd52",
    creation: "#bc71eb", actions: "#f4705c", session: "#68c4dc"
  };
  if (known[sectionId]) return known[sectionId];
  const hue = Math.abs(hashString(sectionId) + index * 47) % 360;
  return hslToHex(hue, 68, 58);
}

function hashString(value) {
  let hash = 0;
  for (const char of String(value)) hash = (hash * 31 + char.codePointAt(0)) | 0;
  return hash;
}

function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return `#${[r, g, b].map(channel => Math.round((channel + m) * 255).toString(16).padStart(2, "0")).join("")}`;
}

function readableProfileId(value) {
  return String(value ?? "default").replace(/[-_:]+/g, " ").trim().replace(/^./, character => character.toUpperCase()) || "Padrão";
}

function normalizeItemSections(value) {
  const result = {};
  for (const [itemId, sectionId] of Object.entries(value ?? {})) {
    const item = nonEmptyString(itemId); const section = nonEmptyString(sectionId);
    if (item && section) result[item] = section;
  }
  return result;
}

function rankMap(values) { return new Map(uniqueStrings(values).map((value, index) => [value, index])); }
function uniqueStrings(values) { return [...new Set((Array.isArray(values) ? values : []).map(value => nonEmptyString(value)).filter(Boolean))]; }
function nonEmptyString(value) { const text = String(value ?? "").trim(); return text || null; }
function nullableString(value, fallback = null) { if (value === null || value === undefined || value === "") return fallback; return nonEmptyString(value) ?? fallback; }
function finiteInteger(value) { const numeric = Number(value); return Number.isFinite(numeric) ? Math.trunc(numeric) : null; }
function nullableInteger(value, fallback) { if (value === null || value === undefined || value === "") return fallback; return finiteInteger(value) ?? fallback; }
function nullableNonNegativeInteger(value, fallback) { const result = nullableInteger(value, fallback); return result === null ? null : Math.max(0, result); }
function boundedInteger(value, fallback, minimum, maximum) { const numeric = finiteInteger(value); return Math.max(minimum, Math.min(maximum, numeric ?? fallback)); }
function boundedNumber(value, fallback, minimum, maximum) { const numeric = Number(value); return Number.isFinite(numeric) ? Math.min(maximum, Math.max(minimum, numeric)) : fallback; }
function allowedOr(value, allowed, fallback) { return allowed.includes(value) ? value : fallback; }
