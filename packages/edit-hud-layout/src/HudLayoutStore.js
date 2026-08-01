import {
  HUD_LAYOUT_SCHEMA_VERSION,
  HUD_LAYOUT_STORAGE_KEY,
  createDefaultHudLayoutDocument,
  normalizeHudLayoutDocument,
  normalizeFamilyPolicy,
  normalizeItemPolicy
} from "./HudLayoutPolicy.js?build=20260801-0046a";

export class HudLayoutStore {
  static apiVersion = "hud-layout-store-v1";

  #storage;
  #key;
  #document;
  #familyIds = [];
  #itemIds = [];
  #familyOrder = [];
  #itemFamilies = {};
  #legacyPreferences = null;
  #listeners = new Set();

  constructor({
    storage = globalThis.localStorage,
    key = HUD_LAYOUT_STORAGE_KEY,
    familyIds = [],
    itemIds = [],
    familyOrder = [],
    itemFamilies = {},
    legacyPreferences = null
  } = {}) {
    this.#storage = storage ?? null;
    this.#key = String(key || HUD_LAYOUT_STORAGE_KEY);
    this.#familyIds = uniqueStrings(familyIds);
    this.#itemIds = uniqueStrings(itemIds);
    this.#familyOrder = uniqueStrings(familyOrder);
    this.#itemFamilies = normalizeItemFamilies(itemFamilies);
    this.#legacyPreferences = legacyPreferences;
    this.#document = this.#load();
  }

  get apiVersion() {
    return HudLayoutStore.apiVersion;
  }

  snapshot() {
    return structuredClone(this.#document);
  }

  profile(profileId = this.#document.activeProfile) {
    return structuredClone(
      this.#document.profiles[profileId] ??
      this.#document.profiles.default
    );
  }

  activeProfileId() {
    return this.#document.activeProfile;
  }

  register({
    familyIds = [],
    itemIds = [],
    familyOrder = [],
    itemFamilies = {}
  } = {}) {
    this.#familyIds = uniqueStrings([...this.#familyIds, ...familyIds]);
    this.#itemIds = uniqueStrings([...this.#itemIds, ...itemIds]);
    this.#familyOrder = uniqueStrings([
      ...familyOrder,
      ...this.#familyOrder,
      ...this.#familyIds
    ]);
    this.#itemFamilies = {
      ...this.#itemFamilies,
      ...normalizeItemFamilies(itemFamilies)
    };
    this.#replace(normalizeHudLayoutDocument(this.#document, {
      familyIds: this.#familyIds,
      itemIds: this.#itemIds,
      familyOrder: this.#familyOrder,
      legacyPreferences: this.#legacyPreferences
    }));
  }

  updateFamily(familyId, patch = {}) {
    const id = requiredId(familyId, "família");
    const document = this.snapshot();
    const profile = activeProfile(document);
    profile.families[id] = normalizeFamilyPolicy({
      ...(profile.families[id] ?? {}),
      ...patch
    });
    this.#replace(document);
    return this.profile();
  }

  updateItem(itemId, patch = {}) {
    const id = requiredId(itemId, "ferramenta");
    const document = this.snapshot();
    const profile = activeProfile(document);
    profile.items[id] = normalizeItemPolicy({
      ...(profile.items[id] ?? {}),
      ...patch
    });
    this.#replace(document);
    return this.profile();
  }

  resetFamily(familyId) {
    const id = requiredId(familyId, "família");
    const fallback = createDefaultHudLayoutDocument({
      familyIds: this.#familyIds,
      itemIds: this.#itemIds,
      familyOrder: this.#familyOrder,
      legacyPreferences: this.#legacyPreferences
    }).profiles.default.families[id];
    return this.updateFamily(id, fallback);
  }

  resetItem(itemId) {
    return this.updateItem(requiredId(itemId, "ferramenta"), {
      visibility: "inherit",
      zone: "inherit",
      order: null
    });
  }

  moveFamily(familyId, delta) {
    const id = requiredId(familyId, "família");
    const direction = signedDelta(delta);
    if (!direction) return this.profile();
    const profile = this.profile();
    const ordered = [...this.#familyIds].sort((left, right) =>
      familyOrderOf(profile, left, this.#familyIds) -
      familyOrderOf(profile, right, this.#familyIds)
    );
    const index = ordered.indexOf(id);
    const targetIndex = Math.max(0, Math.min(ordered.length - 1, index + direction));
    if (index < 0 || targetIndex === index) return profile;
    const targetId = ordered[targetIndex];
    const currentOrder = familyOrderOf(profile, id, this.#familyIds);
    const targetOrder = familyOrderOf(profile, targetId, this.#familyIds);
    const document = this.snapshot();
    const active = activeProfile(document);
    active.families[id] = normalizeFamilyPolicy({
      ...(active.families[id] ?? {}),
      order: targetOrder
    });
    active.families[targetId] = normalizeFamilyPolicy({
      ...(active.families[targetId] ?? {}),
      order: currentOrder
    });
    this.#replace(document);
    return this.profile();
  }

  moveItem(itemId, delta) {
    const id = requiredId(itemId, "ferramenta");
    const direction = signedDelta(delta);
    if (!direction) return this.profile();
    const profile = this.profile();
    const family = this.#itemFamilies[id] ?? null;
    const ordered = this.#itemIds
      .filter(item => !family || this.#itemFamilies[item] === family)
      .sort((left, right) =>
        itemOrderOf(profile, left, this.#itemIds) -
        itemOrderOf(profile, right, this.#itemIds)
      );
    const index = ordered.indexOf(id);
    const targetIndex = Math.max(0, Math.min(ordered.length - 1, index + direction));
    if (index < 0 || targetIndex === index) return profile;
    const targetId = ordered[targetIndex];
    const currentOrder = itemOrderOf(profile, id, this.#itemIds);
    const targetOrder = itemOrderOf(profile, targetId, this.#itemIds);
    const document = this.snapshot();
    const active = activeProfile(document);
    active.items[id] = normalizeItemPolicy({
      ...(active.items[id] ?? {}),
      order: targetOrder
    });
    active.items[targetId] = normalizeItemPolicy({
      ...(active.items[targetId] ?? {}),
      order: currentOrder
    });
    this.#replace(document);
    return this.profile();
  }

  reset() {
    this.#replace(createDefaultHudLayoutDocument({
      familyIds: this.#familyIds,
      itemIds: this.#itemIds,
      familyOrder: this.#familyOrder,
      legacyPreferences: this.#legacyPreferences
    }));
    return this.snapshot();
  }

  importDocument(document) {
    this.#replace(normalizeHudLayoutDocument(document, {
      familyIds: this.#familyIds,
      itemIds: this.#itemIds,
      familyOrder: this.#familyOrder,
      legacyPreferences: this.#legacyPreferences
    }));
    return this.snapshot();
  }

  subscribe(listener) {
    if (typeof listener !== "function") {
      throw new TypeError("HudLayoutStore.subscribe exige função.");
    }
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  #load() {
    let parsed = null;
    try {
      parsed = JSON.parse(this.#storage?.getItem?.(this.#key) ?? "null");
    } catch {
      parsed = null;
    }
    return normalizeHudLayoutDocument(
      parsed?.schemaVersion === HUD_LAYOUT_SCHEMA_VERSION ? parsed : {},
      {
        familyIds: this.#familyIds,
        itemIds: this.#itemIds,
        familyOrder: this.#familyOrder,
        legacyPreferences: this.#legacyPreferences
      }
    );
  }

  #replace(document) {
    this.#document = normalizeHudLayoutDocument(document, {
      familyIds: this.#familyIds,
      itemIds: this.#itemIds,
      familyOrder: this.#familyOrder,
      legacyPreferences: this.#legacyPreferences
    });
    try {
      this.#storage?.setItem?.(this.#key, JSON.stringify(this.#document));
    } catch {
      // A toolbar continua funcional mesmo se o armazenamento estiver indisponível.
    }
    for (const listener of this.#listeners) {
      listener(this.snapshot());
    }
  }
}

function activeProfile(document) {
  const id = document.activeProfile ?? "default";
  if (!document.profiles[id]) {
    document.profiles[id] = { families: {}, items: {} };
  }
  return document.profiles[id];
}

function uniqueStrings(values) {
  return [...new Set((values ?? [])
    .map(value => String(value ?? "").trim())
    .filter(Boolean))];
}

function requiredId(value, label) {
  const id = String(value ?? "").trim();
  if (!id) throw new TypeError(`Identificador de ${label} inválido.`);
  return id;
}

function integerOr(value, fallback) {
  if (value === null || value === undefined || value === "") {
    return Math.max(0, Number(fallback) || 0);
  }
  const number = Number(value);
  return Number.isInteger(number) ? number : Math.max(0, Number(fallback) || 0);
}


function familyOrderOf(profile, id, familyIds) {
  return integerOr(profile.families?.[id]?.order, familyIds.indexOf(id));
}

function itemOrderOf(profile, id, itemIds) {
  return integerOr(profile.items?.[id]?.order, itemIds.indexOf(id));
}

function normalizeItemFamilies(value) {
  const result = {};
  for (const [itemId, familyId] of Object.entries(value ?? {})) {
    const item = String(itemId ?? "").trim();
    const family = String(familyId ?? "").trim();
    if (item && family) result[item] = family;
  }
  return result;
}

function signedDelta(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number === 0) return 0;
  return number < 0 ? -1 : 1;
}
