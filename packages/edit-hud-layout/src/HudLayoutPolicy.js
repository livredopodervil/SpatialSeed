export const HUD_LAYOUT_SCHEMA_VERSION = "spatial-seed-hud-layout-v2";
export const HUD_LAYOUT_STORAGE_KEY = "spatialseed.edit.hud.layout.v2";

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

const DEFAULT_FAMILY_POLICY = Object.freeze({
  visibility: "auto",
  zone: "adaptive",
  order: null
});

const DEFAULT_ITEM_POLICY = Object.freeze({
  visibility: "inherit",
  zone: "inherit",
  order: null
});

const ZONE_BASE = Object.freeze({
  "fixed-start": 0,
  adaptive: 1_000_000,
  "fixed-end": 2_000_000
});

export function createDefaultHudLayoutDocument({
  familyIds = [],
  itemIds = [],
  legacyPreferences = null,
  familyOrder = []
} = {}) {
  const adaptive = legacyPreferences?.adaptiveOrder !== false;
  const groups = legacyPreferences?.groups ?? {};
  const orderByFamily = rankMap(familyOrder);
  const families = {};

  for (const [index, familyId] of uniqueStrings(familyIds).entries()) {
    families[familyId] = {
      visibility: groups[familyId] === false ? "hidden" : "auto",
      zone: adaptive ? "adaptive" : "fixed-start",
      order: adaptive ? null : orderByFamily.get(familyId) ?? index
    };
  }

  const items = {};
  for (const itemId of uniqueStrings(itemIds)) {
    items[itemId] = { ...DEFAULT_ITEM_POLICY };
  }

  return freezeDocument({
    schemaVersion: HUD_LAYOUT_SCHEMA_VERSION,
    activeProfile: "default",
    profiles: {
      default: {
        families,
        items
      }
    }
  });
}

export function normalizeHudLayoutDocument(value = {}, {
  familyIds = [],
  itemIds = [],
  legacyPreferences = null,
  familyOrder = []
} = {}) {
  const fallback = createDefaultHudLayoutDocument({
    familyIds,
    itemIds,
    legacyPreferences,
    familyOrder
  });
  const source = value && typeof value === "object" ? value : {};
  const activeProfile = nonEmptyString(source.activeProfile) ?? "default";
  const sourceProfiles = source.profiles && typeof source.profiles === "object"
    ? source.profiles
    : {};
  const profileIds = uniqueStrings([
    ...Object.keys(sourceProfiles),
    activeProfile,
    "default"
  ]);
  const profiles = {};

  for (const profileId of profileIds) {
    const sourceProfile = sourceProfiles[profileId] ?? {};
    const fallbackProfile = fallback.profiles.default;
    profiles[profileId] = normalizeHudLayoutProfile(sourceProfile, {
      familyIds,
      itemIds,
      fallbackProfile
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
  itemIds = [],
  fallbackProfile = null
} = {}) {
  const source = value && typeof value === "object" ? value : {};
  const fallback = fallbackProfile ?? { families: {}, items: {} };
  const familyKeys = uniqueStrings([
    ...familyIds,
    ...Object.keys(fallback.families ?? {}),
    ...Object.keys(source.families ?? {})
  ]);
  const itemKeys = uniqueStrings([
    ...itemIds,
    ...Object.keys(fallback.items ?? {}),
    ...Object.keys(source.items ?? {})
  ]);
  const families = {};
  const items = {};

  for (const familyId of familyKeys) {
    families[familyId] = normalizeFamilyPolicy(
      source.families?.[familyId],
      fallback.families?.[familyId]
    );
  }

  for (const itemId of itemKeys) {
    items[itemId] = normalizeItemPolicy(
      source.items?.[itemId],
      fallback.items?.[itemId]
    );
  }

  return Object.freeze({
    families: Object.freeze(families),
    items: Object.freeze(items)
  });
}

export function normalizeFamilyPolicy(value = {}, fallback = null) {
  const source = value && typeof value === "object" ? value : {};
  const base = fallback && typeof fallback === "object"
    ? fallback
    : DEFAULT_FAMILY_POLICY;
  return Object.freeze({
    visibility: normalizeVisibility(
      source.visibility,
      normalizeVisibility(base.visibility, DEFAULT_FAMILY_POLICY.visibility, false),
      false
    ),
    zone: normalizeZone(
      source.zone,
      normalizeZone(base.zone, DEFAULT_FAMILY_POLICY.zone, false),
      false
    ),
    order: nullableInteger(source.order, nullableInteger(base.order, null))
  });
}

export function normalizeItemPolicy(value = {}, fallback = null) {
  const source = value && typeof value === "object" ? value : {};
  const base = fallback && typeof fallback === "object"
    ? fallback
    : DEFAULT_ITEM_POLICY;
  return Object.freeze({
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
    order: nullableInteger(source.order, nullableInteger(base.order, null))
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
  const normalizedProfile = normalizeHudLayoutProfile(profile, {
    familyIds: descriptors.map(descriptor => descriptor.family),
    itemIds: descriptors.map(descriptor => descriptor.id)
  });
  const groupRanks = rankMap(adaptiveGroupOrder);
  const itemRanks = rankMap(adaptiveItemOrder);
  const familyFallbackRanks = fallbackFamilyRanks(descriptors);

  return Object.freeze(descriptors.map(descriptor => {
    const familyPolicy = normalizedProfile.families[descriptor.family] ??
      DEFAULT_FAMILY_POLICY;
    const itemPolicy = normalizedProfile.items[descriptor.id] ??
      DEFAULT_ITEM_POLICY;
    const visibility = itemPolicy.visibility === "inherit"
      ? familyPolicy.visibility
      : itemPolicy.visibility;
    const zone = itemPolicy.zone === "inherit"
      ? familyPolicy.zone
      : itemPolicy.zone;
    const familyState = familyContext[descriptor.family] ?? {};
    const itemState = itemContext[descriptor.id] ?? {};
    const contextVisible = itemState.visible ?? familyState.visible ?? true;
    const contextAvailable = itemState.available ?? familyState.available ?? true;
    const pinned = zone !== "adaptive";
    const hidden = visibility === "hidden" ||
      (visibility === "auto" && !contextVisible && !pinned);
    const familyRank = finiteInteger(familyPolicy.order) ??
      (zone === "adaptive" ? groupRanks.get(descriptor.family) : null) ??
      familyFallbackRanks.get(descriptor.family) ??
      0;
    const itemRank = finiteInteger(itemPolicy.order) ??
      (zone === "adaptive" ? itemRanks.get(descriptor.id) : null) ??
      finiteInteger(descriptor.defaultItemIndex) ??
      0;
    const order = (ZONE_BASE[zone] ?? ZONE_BASE.adaptive) +
      Math.max(0, familyRank) * 10_000 +
      Math.max(0, itemRank);

    return Object.freeze({
      ...descriptor,
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

export function hudLayoutSignature(plan = []) {
  return JSON.stringify(plan.map(item => [
    item.id,
    item.zone,
    item.order,
    item.hidden,
    item.disabled,
    item.pinned
  ]));
}

export function familyPolicyDefaults() {
  return DEFAULT_FAMILY_POLICY;
}

export function itemPolicyDefaults() {
  return DEFAULT_ITEM_POLICY;
}

function freezeDocument(document) {
  const profiles = {};
  for (const [profileId, profile] of Object.entries(document.profiles ?? {})) {
    profiles[profileId] = normalizeHudLayoutProfile(profile);
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

function rankMap(values) {
  return new Map(uniqueStrings(values).map((value, index) => [value, index]));
}

function uniqueStrings(values) {
  return [...new Set((values ?? [])
    .map(value => nonEmptyString(value))
    .filter(Boolean))];
}

function nonEmptyString(value) {
  const result = String(value ?? "").trim();
  return result || null;
}

function nullableInteger(value, fallback) {
  if (value === null || value === undefined || value === "") return fallback;
  const number = Number(value);
  return Number.isInteger(number) ? number : fallback;
}

function finiteInteger(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isInteger(number) ? number : null;
}
