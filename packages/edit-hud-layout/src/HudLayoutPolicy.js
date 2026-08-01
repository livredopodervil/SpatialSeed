export const HUD_LAYOUT_SCHEMA_VERSION = "spatial-seed-hud-layout-v4";
export const HUD_LAYOUT_STORAGE_KEY = "spatialseed.edit.hud.layout.v4";

export const HUD_VISIBILITY_VALUES = Object.freeze([
  "inherit",
  "auto",
  "always",
  "hidden"
]);

export const HUD_ZONE_VALUES = Object.freeze([
  "inherit",
  "fixed-start",
  "adaptive",
  "fixed-end"
]);

export const HUD_ACTIVATION_MODES = Object.freeze([
  "native",
  "momentary",
  "toggle"
]);

export const HUD_SECTION_SCROLL_MODES = Object.freeze([
  "rotate",
  "scroll"
]);

export const HUD_DOCK_VALUES = Object.freeze(["floating", "top", "bottom"]);
export const HUD_ORIENTATION_VALUES = Object.freeze(["horizontal", "vertical"]);
export const HUD_SIZE_VALUES = Object.freeze(["compact", "normal", "large"]);

const DEFAULT_VIEWPORT_POLICY = Object.freeze({
  dock: "floating",
  orientation: "horizontal",
  size: "normal",
  opacity: 0.96,
  columns: 12,
  rows: 6,
  left: 12,
  top: 96
});

const DEFAULT_SECTION_POLICY = Object.freeze({
  label: null,
  visibility: "auto",
  zone: "adaptive",
  order: null,
  color: "#528bff",
  columns: 4,
  rows: 1,
  scrollMode: "rotate",
  showHeader: true
});

const DEFAULT_ITEM_POLICY = Object.freeze({
  label: null,
  icon: null,
  section: null,
  visibility: "inherit",
  zone: "inherit",
  order: null,
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
  legacyPreferences = null,
  familyOrder = [],
  sectionOrder = familyOrder
} = {}) {
  const adaptive = legacyPreferences?.adaptiveOrder !== false;
  const groups = legacyPreferences?.groups ?? {};
  const orderedSections = uniqueStrings([...sectionIds, ...familyIds]);
  const orderBySection = rankMap([...sectionOrder, ...familyOrder]);
  const sections = {};

  for (const [index, sectionId] of orderedSections.entries()) {
    sections[sectionId] = {
      ...DEFAULT_SECTION_POLICY,
      visibility: groups[sectionId] === false ? "hidden" : "auto",
      zone: adaptive ? "adaptive" : "fixed-start",
      order: adaptive ? null : orderBySection.get(sectionId) ?? index,
      color: defaultSectionColor(sectionId, index)
    };
  }

  const normalizedItemSections = normalizeItemSections(itemSections);
  const items = {};
  for (const itemId of uniqueStrings(itemIds)) {
    items[itemId] = {
      ...DEFAULT_ITEM_POLICY,
      activation: { ...DEFAULT_ITEM_POLICY.activation },
      section: normalizedItemSections[itemId] ?? null
    };
  }

  return freezeDocument({
    schemaVersion: HUD_LAYOUT_SCHEMA_VERSION,
    activeProfile: "default",
    profiles: {
      default: {
        label: "Padrão",
        viewport: viewportFromLegacyPreferences(legacyPreferences),
        sections,
        items
      }
    }
  });
}

export function normalizeHudLayoutDocument(value = {}, options = {}) {
  const source = value && typeof value === "object" ? value : {};
  const migrated = migrateDocument(source);
  const fallback = createDefaultHudLayoutDocument(options);
  const activeProfile = nonEmptyString(migrated.activeProfile) ?? "default";
  const sourceProfiles = migrated.profiles && typeof migrated.profiles === "object"
    ? migrated.profiles
    : {};
  const profileIds = uniqueStrings([
    ...Object.keys(sourceProfiles),
    activeProfile,
    "default"
  ]);
  const profiles = {};

  for (const profileId of profileIds) {
    profiles[profileId] = normalizeHudLayoutProfile(
      sourceProfiles[profileId] ?? {},
      {
        ...options,
        fallbackProfile: fallback.profiles.default,
        profileId
      }
    );
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
    const defaultItem = fallback.items?.[itemId] ?? {
      ...DEFAULT_ITEM_POLICY,
      section: normalizedItemSections[itemId] ?? null
    };
    items[itemId] = normalizeItemPolicy(
      source.items?.[itemId],
      defaultItem
    );
  }

  return Object.freeze({
    label: nonEmptyString(source.label) ??
      nonEmptyString(fallback.label) ??
      readableProfileId(profileId),
    viewport: normalizeViewportPolicy(source.viewport, fallback.viewport),
    sections: Object.freeze(sections),
    items: Object.freeze(items)
  });
}

export function normalizeViewportPolicy(value = {}, fallback = null) {
  const source = value && typeof value === "object" ? value : {};
  const base = fallback && typeof fallback === "object"
    ? fallback
    : DEFAULT_VIEWPORT_POLICY;
  return Object.freeze({
    dock: HUD_DOCK_VALUES.includes(source.dock)
      ? source.dock
      : HUD_DOCK_VALUES.includes(base.dock) ? base.dock : DEFAULT_VIEWPORT_POLICY.dock,
    orientation: HUD_ORIENTATION_VALUES.includes(source.orientation)
      ? source.orientation
      : HUD_ORIENTATION_VALUES.includes(base.orientation)
        ? base.orientation
        : DEFAULT_VIEWPORT_POLICY.orientation,
    size: HUD_SIZE_VALUES.includes(source.size)
      ? source.size
      : HUD_SIZE_VALUES.includes(base.size) ? base.size : DEFAULT_VIEWPORT_POLICY.size,
    opacity: boundedNumber(source.opacity, boundedNumber(base.opacity, 0.96, 0.2, 1), 0.2, 1),
    columns: boundedInteger(source.columns, boundedInteger(base.columns, 12, 1, 512), 1, 512),
    rows: boundedInteger(source.rows, boundedInteger(base.rows, 6, 1, 512), 1, 512),
    left: boundedNumber(source.left, boundedNumber(base.left, 12, 0, 100000), 0, 100000),
    top: boundedNumber(source.top, boundedNumber(base.top, 96, 0, 100000), 0, 100000)
  });
}

export function normalizeSectionPolicy(value = {}, fallback = null) {
  const source = value && typeof value === "object" ? value : {};
  const base = fallback && typeof fallback === "object"
    ? fallback
    : DEFAULT_SECTION_POLICY;
  return Object.freeze({
    label: nullableString(source.label, nullableString(base.label, null)),
    visibility: normalizeVisibility(
      source.visibility,
      normalizeVisibility(base.visibility, DEFAULT_SECTION_POLICY.visibility, false),
      false
    ),
    zone: normalizeZone(
      source.zone,
      normalizeZone(base.zone, DEFAULT_SECTION_POLICY.zone, false),
      false
    ),
    order: nullableInteger(source.order, nullableInteger(base.order, null)),
    color: normalizeColor(source.color, normalizeColor(base.color, DEFAULT_SECTION_POLICY.color)),
    columns: boundedInteger(source.columns, boundedInteger(base.columns, 4, 1, 256), 1, 256),
    rows: boundedInteger(source.rows, boundedInteger(base.rows, 1, 1, 256), 1, 256),
    scrollMode: HUD_SECTION_SCROLL_MODES.includes(source.scrollMode)
      ? source.scrollMode
      : HUD_SECTION_SCROLL_MODES.includes(base.scrollMode)
        ? base.scrollMode
        : DEFAULT_SECTION_POLICY.scrollMode,
    showHeader: source.showHeader === undefined
      ? base.showHeader !== false
      : Boolean(source.showHeader)
  });
}

export const normalizeFamilyPolicy = normalizeSectionPolicy;

export function normalizeItemPolicy(value = {}, fallback = null) {
  const source = value && typeof value === "object" ? value : {};
  const base = fallback && typeof fallback === "object"
    ? fallback
    : DEFAULT_ITEM_POLICY;
  return Object.freeze({
    label: nullableString(source.label, nullableString(base.label, null)),
    icon: nullableString(source.icon, nullableString(base.icon, null)),
    section: nullableString(source.section, nullableString(base.section, null)),
    visibility: normalizeVisibility(
      source.visibility,
      normalizeVisibility(base.visibility, DEFAULT_ITEM_POLICY.visibility, true),
      true
    ),
    zone: normalizeZone(
      source.zone,
      normalizeZone(base.zone, DEFAULT_ITEM_POLICY.zone, true),
      true
    ),
    order: nullableInteger(source.order, nullableInteger(base.order, null)),
    cellWidth: boundedInteger(source.cellWidth, boundedInteger(base.cellWidth, 1, 1, 256), 1, 256),
    cellHeight: boundedInteger(source.cellHeight, boundedInteger(base.cellHeight, 1, 1, 256), 1, 256),
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
  return Object.freeze({
    id,
    arguments: freezeJsonObject(source.arguments ?? source.args ?? {})
  });
}

export function normalizeActivationPolicy(value = {}, fallback = null) {
  const source = value && typeof value === "object" ? value : {};
  const base = fallback && typeof fallback === "object"
    ? fallback
    : DEFAULT_ITEM_POLICY.activation;
  return Object.freeze({
    mode: HUD_ACTIVATION_MODES.includes(source.mode)
      ? source.mode
      : HUD_ACTIVATION_MODES.includes(base.mode)
        ? base.mode
        : "native",
    group: nullableString(source.group, nullableString(base.group, null)),
    activates: Object.freeze(uniqueStrings(source.activates ?? base.activates ?? [])),
    deactivates: Object.freeze(uniqueStrings(source.deactivates ?? base.deactivates ?? [])),
    activatesOnDeactivate: Object.freeze(uniqueStrings(
      source.activatesOnDeactivate ?? base.activatesOnDeactivate ?? []
    )),
    deactivatesOnDeactivate: Object.freeze(uniqueStrings(
      source.deactivatesOnDeactivate ?? base.deactivatesOnDeactivate ?? []
    )),
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
  const itemSections = Object.fromEntries(
    descriptors.map(descriptor => [descriptor.id, descriptor.family])
  );
  const normalizedProfile = normalizeHudLayoutProfile(profile, {
    sectionIds: descriptors.map(descriptor => descriptor.family),
    itemIds: descriptors.map(descriptor => descriptor.id),
    itemSections
  });
  const groupRanks = rankMap(adaptiveGroupOrder);
  const itemRanks = rankMap(adaptiveItemOrder);
  const familyFallbackRanks = fallbackFamilyRanks(descriptors);

  return Object.freeze(descriptors.map(descriptor => {
    const itemPolicy = normalizedProfile.items[descriptor.id] ?? DEFAULT_ITEM_POLICY;
    const sectionId = itemPolicy.section ?? descriptor.family;
    const sectionPolicy = normalizedProfile.sections[sectionId] ??
      normalizedProfile.sections[descriptor.family] ??
      DEFAULT_SECTION_POLICY;
    const visibility = itemPolicy.visibility === "inherit"
      ? sectionPolicy.visibility
      : itemPolicy.visibility;
    const zone = itemPolicy.zone === "inherit"
      ? sectionPolicy.zone
      : itemPolicy.zone;
    const familyState = familyContext[descriptor.family] ?? {};
    const sectionState = familyContext[sectionId] ?? familyState;
    const itemState = itemContext[descriptor.id] ?? {};
    const contextVisible = itemState.visible ?? sectionState.visible ?? true;
    const contextAvailable = itemState.available ?? sectionState.available ?? true;
    const pinned = zone !== "adaptive";
    const hidden = visibility === "hidden" ||
      (visibility === "auto" && !contextVisible && !pinned);
    const sectionRank = finiteInteger(sectionPolicy.order) ??
      (zone === "adaptive" ? groupRanks.get(sectionId) : null) ??
      familyFallbackRanks.get(descriptor.family) ??
      0;
    const itemRank = finiteInteger(itemPolicy.order) ??
      (zone === "adaptive" ? itemRanks.get(descriptor.id) : null) ??
      finiteInteger(descriptor.defaultItemIndex) ??
      0;
    const order = (ZONE_BASE[zone] ?? ZONE_BASE.adaptive) +
      Math.max(0, sectionRank) * 10_000 +
      Math.max(0, itemRank);

    return Object.freeze({
      ...descriptor,
      section: sectionId,
      sectionPolicy,
      itemPolicy,
      label: itemPolicy.label ?? descriptor.label,
      icon: itemPolicy.icon ?? descriptor.nativeIcon ?? null,
      command: itemPolicy.command,
      activation: itemPolicy.activation,
      cellWidth: itemPolicy.cellWidth,
      cellHeight: itemPolicy.cellHeight,
      visibility,
      zone,
      pinned,
      hidden,
      disabled: !contextAvailable,
      contextVisible: Boolean(contextVisible),
      contextAvailable: Boolean(contextAvailable),
      order,
      reason: hidden
        ? visibility === "hidden" ? "user-hidden" : "context-hidden"
        : pinned && !contextVisible
          ? "pinned-out-of-context"
          : visibility === "always"
            ? "always-visible"
            : "context-visible"
    });
  }));
}

export function resolveHudSectionPlan(plan = [], profile = {}) {
  const normalized = normalizeHudLayoutProfile(profile, {
    sectionIds: plan.map(item => item.section),
    itemIds: plan.map(item => item.id),
    itemSections: Object.fromEntries(plan.map(item => [item.id, item.section]))
  });
  const sectionIds = uniqueStrings([
    ...Object.keys(normalized.sections),
    ...plan.map(item => item.section)
  ]);
  return Object.freeze(sectionIds.map((sectionId, fallbackIndex) => {
    const policy = normalized.sections[sectionId] ?? DEFAULT_SECTION_POLICY;
    const items = plan.filter(item => item.section === sectionId && !item.hidden);
    return Object.freeze({
      id: sectionId,
      ...policy,
      hidden: policy.visibility === "hidden" || items.length === 0,
      order: (ZONE_BASE[policy.zone] ?? ZONE_BASE.adaptive) +
        (finiteInteger(policy.order) ?? fallbackIndex),
      itemCount: items.length,
      capacity: policy.columns * policy.rows
    });
  }));
}

export function hudLayoutSignature(plan = [], profile = {}) {
  const sections = resolveHudSectionPlan(plan, profile);
  return JSON.stringify({
    sections: sections.map(section => [
      section.id,
      section.label,
      section.visibility,
      section.zone,
      section.order,
      section.color,
      section.columns,
      section.rows,
      section.scrollMode,
      section.showHeader,
      section.hidden
    ]),
    items: plan.map(item => [
      item.id,
      item.section,
      item.icon,
      item.label,
      item.zone,
      item.order,
      item.hidden,
      item.disabled,
      item.pinned,
      item.cellWidth,
      item.cellHeight,
      item.command?.id ?? null,
      item.command?.arguments ?? null,
      item.activation
    ])
  });
}

export function familyPolicyDefaults() {
  return DEFAULT_SECTION_POLICY;
}

export const sectionPolicyDefaults = familyPolicyDefaults;

export function itemPolicyDefaults() {
  return DEFAULT_ITEM_POLICY;
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

function boundedNumber(value, fallback, minimum, maximum) {
  const numeric = Number(value);
  return Number.isFinite(numeric)
    ? Math.min(maximum, Math.max(minimum, numeric))
    : fallback;
}

function migrateDocument(source) {
  if (source.schemaVersion === HUD_LAYOUT_SCHEMA_VERSION) return source;
  if (!source.profiles || typeof source.profiles !== "object") return source;
  const profiles = {};
  for (const [profileId, profile] of Object.entries(source.profiles)) {
    profiles[profileId] = {
      ...profile,
      label: profile.label ?? readableProfileId(profileId),
      viewport: profile.viewport ?? null,
      sections: profile.sections ?? profile.families ?? {},
      items: profile.items ?? {}
    };
  }
  return {
    ...source,
    schemaVersion: HUD_LAYOUT_SCHEMA_VERSION,
    profiles
  };
}

function freezeDocument(document) {
  const profiles = {};
  for (const [profileId, profile] of Object.entries(document.profiles ?? {})) {
    profiles[profileId] = normalizeHudLayoutProfile(profile, { profileId });
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
    if (!ranks.has(descriptor.family)) {
      ranks.set(
        descriptor.family,
        finiteInteger(descriptor.defaultFamilyIndex) ?? ranks.size
      );
    }
  }
  return ranks;
}

function normalizeVisibility(value, fallback, allowInherit) {
  const allowed = allowInherit
    ? HUD_VISIBILITY_VALUES
    : HUD_VISIBILITY_VALUES.filter(item => item !== "inherit");
  return allowed.includes(value) ? value : fallback;
}

function normalizeZone(value, fallback, allowInherit) {
  const allowed = allowInherit
    ? HUD_ZONE_VALUES
    : HUD_ZONE_VALUES.filter(item => item !== "inherit");
  return allowed.includes(value) ? value : fallback;
}

function normalizeColor(value, fallback) {
  const candidate = String(value ?? "").trim();
  return /^#[0-9a-f]{6}$/i.test(candidate) ? candidate.toLowerCase() : fallback;
}

function freezeJsonObject(value) {
  const source = value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
  try {
    return deepFreeze(structuredClone(source));
  } catch {
    return Object.freeze({});
  }
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function defaultSectionColor(sectionId, index) {
  const known = {
    subject: "#4cc9f0",
    tool: "#528bff",
    quick: "#9a6eff",
    selection: "#e75db5",
    frame: "#7e7bff",
    axes: "#ff994a",
    snap: "#eec249",
    navigation: "#3ac4b5",
    reference: "#ff6984",
    "drawing-target": "#4fc3a1",
    appearance: "#c47cff",
    planar: "#41d28f",
    measure: "#27b9d6",
    lifecycle: "#9bcd52",
    creation: "#bc71eb",
    actions: "#f4705c",
    session: "#68c4dc"
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
  s /= 100;
  l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0]
    : h < 120 ? [x, c, 0]
      : h < 180 ? [0, c, x]
        : h < 240 ? [0, x, c]
          : h < 300 ? [x, 0, c]
            : [c, 0, x];
  return `#${[r, g, b].map(channel => Math.round((channel + m) * 255)
    .toString(16).padStart(2, "0")).join("")}`;
}

function readableProfileId(value) {
  return String(value ?? "default")
    .replace(/[-_:]+/g, " ")
    .trim()
    .replace(/^./, character => character.toUpperCase()) || "Padrão";
}

function normalizeItemSections(value) {
  const result = {};
  for (const [itemId, sectionId] of Object.entries(value ?? {})) {
    const item = nonEmptyString(itemId);
    const section = nonEmptyString(sectionId);
    if (item && section) result[item] = section;
  }
  return result;
}

function rankMap(values) {
  return new Map(uniqueStrings(values).map((value, index) => [value, index]));
}

function uniqueStrings(values) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map(value => nonEmptyString(value))
    .filter(Boolean))];
}

function nonEmptyString(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

function nullableString(value, fallback = null) {
  if (value === null || value === undefined || value === "") return fallback;
  return nonEmptyString(value) ?? fallback;
}

function finiteInteger(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.trunc(numeric) : null;
}

function nullableInteger(value, fallback) {
  if (value === null || value === undefined || value === "") return fallback;
  return finiteInteger(value) ?? fallback;
}

function boundedInteger(value, fallback, minimum, maximum) {
  const numeric = finiteInteger(value);
  return Math.max(minimum, Math.min(maximum, numeric ?? fallback));
}
