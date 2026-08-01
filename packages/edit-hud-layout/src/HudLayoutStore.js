import {
  HUD_LAYOUT_SCHEMA_VERSION,
  HUD_LAYOUT_STORAGE_KEY,
  createDefaultHudLayoutDocument,
  normalizeHudLayoutDocument,
  normalizeItemPolicy,
  normalizeSectionPolicy,
  normalizeViewportPolicy
} from "./HudLayoutPolicy.js?build=20260801-0046c";

export class HudLayoutStore {
  static apiVersion = "hud-layout-store-v3";

  #storage;
  #key;
  #document;
  #sectionIds = [];
  #itemIds = [];
  #sectionOrder = [];
  #itemSections = {};
  #legacyPreferences = null;
  #listeners = new Set();

  constructor({
    storage = globalThis.localStorage,
    key = HUD_LAYOUT_STORAGE_KEY,
    familyIds = [],
    sectionIds = familyIds,
    itemIds = [],
    familyOrder = [],
    sectionOrder = familyOrder,
    itemFamilies = {},
    itemSections = itemFamilies,
    legacyPreferences = null
  } = {}) {
    this.#storage = storage ?? null;
    this.#key = String(key || HUD_LAYOUT_STORAGE_KEY);
    this.#sectionIds = uniqueStrings([...sectionIds, ...familyIds]);
    this.#itemIds = uniqueStrings(itemIds);
    this.#sectionOrder = uniqueStrings([
      ...sectionOrder,
      ...familyOrder,
      ...this.#sectionIds
    ]);
    this.#itemSections = normalizeItemSections(itemSections);
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

  profiles() {
    return Object.entries(this.#document.profiles).map(([id, profile]) => ({
      id,
      label: profile.label
    }));
  }

  register({
    familyIds = [],
    sectionIds = familyIds,
    itemIds = [],
    familyOrder = [],
    sectionOrder = familyOrder,
    itemFamilies = {},
    itemSections = itemFamilies
  } = {}) {
    this.#sectionIds = uniqueStrings([
      ...this.#sectionIds,
      ...sectionIds,
      ...familyIds
    ]);
    this.#itemIds = uniqueStrings([...this.#itemIds, ...itemIds]);
    this.#sectionOrder = uniqueStrings([
      ...sectionOrder,
      ...familyOrder,
      ...this.#sectionOrder,
      ...this.#sectionIds
    ]);
    this.#itemSections = {
      ...this.#itemSections,
      ...normalizeItemSections(itemSections)
    };
    this.#replace(this.#document);
  }

  setActiveProfile(profileId) {
    const id = requiredId(profileId, "perfil");
    if (!this.#document.profiles[id]) {
      throw new Error(`Perfil inexistente: ${id}.`);
    }
    const document = this.snapshot();
    document.activeProfile = id;
    this.#replace(document);
    return this.profile();
  }

  createProfile({ id = null, label = null, from = this.activeProfileId() } = {}) {
    const sourceId = this.#document.profiles[from] ? from : this.activeProfileId();
    const profileId = uniqueProfileId(
      id ?? label ?? "perfil",
      Object.keys(this.#document.profiles)
    );
    const document = this.snapshot();
    document.profiles[profileId] = structuredClone(document.profiles[sourceId]);
    document.profiles[profileId].label = String(label ?? `Perfil ${Object.keys(document.profiles).length}`).trim() || profileId;
    document.activeProfile = profileId;
    this.#replace(document);
    return profileId;
  }

  duplicateProfile(profileId = this.activeProfileId(), label = null) {
    const source = requiredId(profileId, "perfil");
    if (!this.#document.profiles[source]) {
      throw new Error(`Perfil inexistente: ${source}.`);
    }
    return this.createProfile({
      id: `${source}-copia`,
      label: label ?? `${this.#document.profiles[source].label} — cópia`,
      from: source
    });
  }

  renameProfile(profileId, label) {
    const id = requiredId(profileId, "perfil");
    const nextLabel = requiredId(label, "nome do perfil");
    if (!this.#document.profiles[id]) throw new Error(`Perfil inexistente: ${id}.`);
    const document = this.snapshot();
    document.profiles[id].label = nextLabel;
    this.#replace(document);
    return this.profile(id);
  }

  deleteProfile(profileId) {
    const id = requiredId(profileId, "perfil");
    if (id === "default") throw new Error("O perfil padrão não pode ser removido.");
    if (!this.#document.profiles[id]) return this.snapshot();
    const document = this.snapshot();
    delete document.profiles[id];
    if (document.activeProfile === id) document.activeProfile = "default";
    this.#replace(document);
    return this.snapshot();
  }

  updateViewport(patch = {}) {
    const document = this.snapshot();
    const profile = activeProfile(document);
    profile.viewport = normalizeViewportPolicy({
      ...(profile.viewport ?? {}),
      ...patch
    });
    this.#replace(document);
    return this.profile();
  }

  addSection({ id = null, label = "Nova seção", color = "#528bff" } = {}) {
    const profile = this.profile();
    const sectionId = uniqueSectionId(
      id ?? label,
      Object.keys(profile.sections)
    );
    return this.updateSection(sectionId, {
      label,
      color,
      visibility: "always",
      zone: "adaptive",
      columns: 4,
      rows: 1,
      order: Object.keys(profile.sections).length
    });
  }

  deleteSection(sectionId, { moveItemsTo = null } = {}) {
    const id = requiredId(sectionId, "seção");
    const document = this.snapshot();
    const profile = activeProfile(document);
    if (!profile.sections[id]) return this.profile();
    const fallback = moveItemsTo ?? this.#sectionIds.find(candidate => candidate !== id) ?? "quick";
    delete profile.sections[id];
    for (const [itemId, policy] of Object.entries(profile.items)) {
      if (policy.section === id) {
        profile.items[itemId] = normalizeItemPolicy({
          ...policy,
          section: fallback
        });
      }
    }
    this.#replace(document);
    return this.profile();
  }

  updateSection(sectionId, patch = {}) {
    const id = requiredId(sectionId, "seção");
    const document = this.snapshot();
    const profile = activeProfile(document);
    profile.sections[id] = normalizeSectionPolicy({
      ...(profile.sections[id] ?? {}),
      ...patch
    });
    this.#replace(document);
    return this.profile();
  }

  updateFamily(familyId, patch = {}) {
    return this.updateSection(familyId, patch);
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

  resetSection(sectionId) {
    const id = requiredId(sectionId, "seção");
    const fallback = this.#defaults().profiles.default.sections[id];
    if (!fallback) return this.profile();
    return this.updateSection(id, fallback);
  }

  resetFamily(familyId) {
    return this.resetSection(familyId);
  }

  resetItem(itemId) {
    const id = requiredId(itemId, "ferramenta");
    const fallback = this.#defaults().profiles.default.items[id];
    return this.updateItem(id, fallback ?? {
      label: null,
      icon: null,
      section: this.#itemSections[id] ?? null,
      visibility: "inherit",
      zone: "inherit",
      order: null,
      cellWidth: 1,
      cellHeight: 1,
      command: null,
      activation: { mode: "native" }
    });
  }

  moveSection(sectionId, delta) {
    const id = requiredId(sectionId, "seção");
    const direction = signedDelta(delta);
    if (!direction) return this.profile();
    const profile = this.profile();
    const ordered = Object.keys(profile.sections).sort((left, right) =>
      sectionOrderOf(profile, left, this.#sectionOrder) -
      sectionOrderOf(profile, right, this.#sectionOrder)
    );
    return this.#swapOrder({
      ids: ordered,
      id,
      direction,
      kind: "section"
    });
  }

  placeSection(sectionId, { before = null, after = null } = {}) {
    const id = requiredId(sectionId, "seção");
    const profile = this.profile();
    const ordered = Object.keys(profile.sections)
      .filter(candidate => candidate !== id)
      .sort((left, right) =>
        sectionOrderOf(profile, left, this.#sectionOrder) -
        sectionOrderOf(profile, right, this.#sectionOrder)
      );
    let insertion = ordered.length;
    if (before && ordered.includes(before)) insertion = ordered.indexOf(before);
    if (after && ordered.includes(after)) insertion = ordered.indexOf(after) + 1;
    ordered.splice(insertion, 0, id);
    const document = this.snapshot();
    const active = activeProfile(document);
    for (const [order, candidate] of ordered.entries()) {
      active.sections[candidate] = normalizeSectionPolicy({
        ...(active.sections[candidate] ?? {}),
        order
      });
    }
    this.#replace(document);
    return this.profile();
  }

  moveFamily(familyId, delta) {
    return this.moveSection(familyId, delta);
  }

  moveItem(itemId, delta) {
    const id = requiredId(itemId, "ferramenta");
    const direction = signedDelta(delta);
    if (!direction) return this.profile();
    const profile = this.profile();
    const section = profile.items[id]?.section ?? this.#itemSections[id] ?? null;
    const ordered = Object.keys(profile.items)
      .filter(item => (profile.items[item]?.section ?? this.#itemSections[item] ?? null) === section)
      .sort((left, right) =>
        itemOrderOf(profile, left, this.#itemIds) -
        itemOrderOf(profile, right, this.#itemIds)
      );
    return this.#swapOrder({ ids: ordered, id, direction, kind: "item" });
  }

  placeItem(itemId, { section, before = null, after = null } = {}) {
    const id = requiredId(itemId, "ferramenta");
    const targetSection = requiredId(section, "seção");
    const profile = this.profile();
    const siblings = Object.keys(profile.items)
      .filter(candidate => candidate !== id)
      .filter(candidate => (profile.items[candidate]?.section ?? this.#itemSections[candidate]) === targetSection)
      .sort((left, right) => itemOrderOf(profile, left, this.#itemIds) - itemOrderOf(profile, right, this.#itemIds));
    let insertion = siblings.length;
    if (before && siblings.includes(before)) insertion = siblings.indexOf(before);
    if (after && siblings.includes(after)) insertion = siblings.indexOf(after) + 1;
    siblings.splice(insertion, 0, id);
    const document = this.snapshot();
    const active = activeProfile(document);
    for (const [order, candidate] of siblings.entries()) {
      active.items[candidate] = normalizeItemPolicy({
        ...(active.items[candidate] ?? {}),
        section: targetSection,
        order
      });
    }
    this.#replace(document);
    return this.profile();
  }

  reset() {
    this.#replace(this.#defaults());
    return this.snapshot();
  }

  exportDocument() {
    return JSON.stringify(this.#document, null, 2);
  }

  importText(text) {
    const parsed = JSON.parse(String(text));
    return this.importDocument(parsed);
  }

  importDocument(document) {
    this.#replace(document);
    return this.snapshot();
  }

  subscribe(listener) {
    if (typeof listener !== "function") {
      throw new TypeError("HudLayoutStore.subscribe exige função.");
    }
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  #swapOrder({ ids, id, direction, kind }) {
    const index = ids.indexOf(id);
    const targetIndex = Math.max(0, Math.min(ids.length - 1, index + direction));
    if (index < 0 || targetIndex === index) return this.profile();
    const targetId = ids[targetIndex];
    const profile = this.profile();
    const currentOrder = kind === "section"
      ? sectionOrderOf(profile, id, this.#sectionOrder)
      : itemOrderOf(profile, id, this.#itemIds);
    const targetOrder = kind === "section"
      ? sectionOrderOf(profile, targetId, this.#sectionOrder)
      : itemOrderOf(profile, targetId, this.#itemIds);
    const document = this.snapshot();
    const active = activeProfile(document);
    if (kind === "section") {
      active.sections[id] = normalizeSectionPolicy({ ...active.sections[id], order: targetOrder });
      active.sections[targetId] = normalizeSectionPolicy({ ...active.sections[targetId], order: currentOrder });
    } else {
      active.items[id] = normalizeItemPolicy({ ...active.items[id], order: targetOrder });
      active.items[targetId] = normalizeItemPolicy({ ...active.items[targetId], order: currentOrder });
    }
    this.#replace(document);
    return this.profile();
  }

  #defaults() {
    return createDefaultHudLayoutDocument({
      sectionIds: this.#sectionIds,
      itemIds: this.#itemIds,
      sectionOrder: this.#sectionOrder,
      itemSections: this.#itemSections,
      legacyPreferences: this.#legacyPreferences
    });
  }

  #load() {
    let parsed = null;
    try {
      const current = this.#storage?.getItem?.(this.#key);
      const legacyV3 = this.#storage?.getItem?.("spatialseed.edit.hud.layout.v3");
      const legacyV2 = this.#storage?.getItem?.("spatialseed.edit.hud.layout.v2");
      parsed = JSON.parse(current ?? legacyV3 ?? legacyV2 ?? "null");
    } catch {
      parsed = null;
    }
    return normalizeHudLayoutDocument(parsed ?? {}, this.#normalizationOptions());
  }

  #replace(document) {
    this.#document = normalizeHudLayoutDocument(document, this.#normalizationOptions());
    try {
      this.#storage?.setItem?.(this.#key, JSON.stringify(this.#document));
    } catch {
      // A toolbar continua funcional mesmo sem armazenamento local.
    }
    for (const listener of this.#listeners) listener(this.snapshot());
  }

  #normalizationOptions() {
    return {
      sectionIds: this.#sectionIds,
      itemIds: this.#itemIds,
      sectionOrder: this.#sectionOrder,
      itemSections: this.#itemSections,
      legacyPreferences: this.#legacyPreferences
    };
  }
}

function activeProfile(document) {
  const id = document.activeProfile ?? "default";
  if (!document.profiles[id]) {
    document.profiles[id] = { label: id, viewport: {}, sections: {}, items: {} };
  }
  return document.profiles[id];
}

function sectionOrderOf(profile, id, fallbackIds) {
  return finiteOrder(profile.sections?.[id]?.order) ??
    Math.max(0, fallbackIds.indexOf(id));
}

function itemOrderOf(profile, id, fallbackIds) {
  return finiteOrder(profile.items?.[id]?.order) ??
    Math.max(0, fallbackIds.indexOf(id));
}

function finiteOrder(value) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.trunc(numeric) : null;
}

function signedDelta(value) {
  const numeric = Number(value);
  return numeric < 0 ? -1 : numeric > 0 ? 1 : 0;
}

function requiredId(value, label) {
  const id = String(value ?? "").trim();
  if (!id) throw new TypeError(`Identificador de ${label} ausente.`);
  return id;
}

function uniqueProfileId(value, existing) {
  return uniqueId(slug(value) || "perfil", existing);
}

function uniqueSectionId(value, existing) {
  return uniqueId(slug(value) || "secao", existing);
}

function uniqueId(base, existing) {
  const used = new Set(existing);
  if (!used.has(base)) return base;
  let index = 2;
  while (used.has(`${base}-${index}`)) index += 1;
  return `${base}-${index}`;
}

function slug(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeItemSections(value) {
  const result = {};
  for (const [itemId, sectionId] of Object.entries(value ?? {})) {
    const item = String(itemId ?? "").trim();
    const section = String(sectionId ?? "").trim();
    if (item && section) result[item] = section;
  }
  return result;
}

function uniqueStrings(values) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map(value => String(value ?? "").trim())
    .filter(Boolean))];
}
