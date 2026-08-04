
const HUD_LAYOUT_STORE_BRIDGE_EVENT = "spatialseed:hud-layout-store-document";
const HUD_LAYOUT_STORE_BRIDGE_STORAGE_KEY = "spatialseed.hud.layout.storeBridge.v1";

function cloneHudLayoutBridgeDocument(document) {
  if (!document || typeof document !== "object") return null;
  try {
    if (typeof structuredClone === "function") return structuredClone(document);
  } catch {
    // fall through to JSON clone
  }
  try {
    return JSON.parse(JSON.stringify(document));
  } catch {
    return null;
  }
}

function readHudLayoutBridgeDocument() {
  if (typeof window === "undefined" || !window.localStorage) return null;
  try {
    return JSON.parse(window.localStorage.getItem(HUD_LAYOUT_STORE_BRIDGE_STORAGE_KEY) || "null");
  } catch {
    return null;
  }
}

function writeHudLayoutBridgeDocument(document) {
  if (typeof window === "undefined" || !window.localStorage) return;
  const clone = cloneHudLayoutBridgeDocument(document);
  if (!clone) return;
  try {
    window.localStorage.setItem(HUD_LAYOUT_STORE_BRIDGE_STORAGE_KEY, JSON.stringify(clone));
  } catch {
    // storage may be unavailable
  }
}

function installHudLayoutStoreBridge(store, replaceDocument) {
  if (typeof window === "undefined" || !store || typeof replaceDocument !== "function") return;
  if (store.__spatialseedHudLayoutStoreBridgeInstalled) return;
  Object.defineProperty(store, "__spatialseedHudLayoutStoreBridgeInstalled", {
    value: true,
    enumerable: false,
    configurable: false
  });

  const applyDocument = document => {
    const clone = cloneHudLayoutBridgeDocument(document);
    if (!clone || window.__spatialseedHudLayoutStoreBridgeApplying) return;
    window.__spatialseedHudLayoutStoreBridgeApplying = true;
    try {
      replaceDocument(clone);
    } finally {
      window.__spatialseedHudLayoutStoreBridgeApplying = false;
    }
  };

  window.addEventListener(HUD_LAYOUT_STORE_BRIDGE_EVENT, event => {
    if (event.detail?.source === store) return;
    applyDocument(event.detail?.document);
  });

  const stored = readHudLayoutBridgeDocument();
  if (stored) queueMicrotask(() => applyDocument(stored));
}

function broadcastHudLayoutStoreDocument(store, document) {
  if (typeof window === "undefined" || window.__spatialseedHudLayoutStoreBridgeApplying) return;
  const clone = cloneHudLayoutBridgeDocument(document);
  if (!clone) return;
  writeHudLayoutBridgeDocument(clone);
  queueMicrotask(() => {
    window.dispatchEvent(new CustomEvent(HUD_LAYOUT_STORE_BRIDGE_EVENT, {
      detail: { source: store, document: clone }
    }));
  });
}

function normalizeHudVisibilityPatchAliases(patch = {}, { item = false } = {}) {
  if (!patch || typeof patch !== "object") return {};
  const next = { ...patch };

  if ("hidden" in next && !("visibility" in next)) {
    next.visibility = next.hidden ? "hidden" : item ? "inherit" : "always";
  }

  if ("visible" in next && !("visibility" in next)) {
    next.visibility = next.visible ? item ? "inherit" : "always" : "hidden";
    delete next.visible;
  }

  if (next.visibility === "hidden") {
    next.hidden = true;
  } else if (next.visibility === "always" || next.visibility === "auto") {
    next.hidden = false;
  } else if (item && next.visibility === "inherit") {
    delete next.hidden;
  }

  return next;
}

import {
  HUD_LAYOUT_SCHEMA_VERSION,
  HUD_LAYOUT_STORAGE_KEY,
  createDefaultHudLayoutDocument,
  normalizeHudLayoutDocument,
  normalizeItemPolicy,
  normalizeSectionPolicy,
  normalizeViewportPolicy
} from "./HudLayoutPolicy.js?build=20260801-0046d";
import {
  findGridPlacement,
  resolveGridMutation
} from "./HudGridEngine.js?build=20260801-0046d";

export class HudLayoutStore {
  static apiVersion = "hud-layout-store-v4";

  #storage;
  #key;
  #document;
  #sectionIds = [];
  #itemIds = [];
  #sectionOrder = [];
  #itemSections = {};
  #itemDescriptors = {};
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
    itemDescriptors = {},
    legacyPreferences = null
  } = {}) {
    installHudLayoutStoreBridge(this, document => this.#replace(document));
    this.#storage = storage ?? null;
    this.#key = String(key || HUD_LAYOUT_STORAGE_KEY);
    this.#sectionIds = uniqueStrings([...sectionIds, ...familyIds]);
    this.#itemIds = uniqueStrings(itemIds);
    this.#sectionOrder = uniqueStrings([...sectionOrder, ...familyOrder, ...this.#sectionIds]);
    this.#itemSections = normalizeItemSections(itemSections);
    this.#itemDescriptors = normalizeDescriptorMap(itemDescriptors);
    this.#legacyPreferences = legacyPreferences;
    this.#document = this.#load();
  }

  updateCatalog({
    familyIds = [],
    sectionIds = familyIds,
    itemIds = [],
    familyOrder = [],
    sectionOrder = familyOrder,
    itemFamilies = {},
    itemSections = itemFamilies,
    itemDescriptors = {}
  } = {}) {
    this.#sectionIds = uniqueStrings([...this.#sectionIds, ...sectionIds, ...familyIds]);
    this.#itemIds = uniqueStrings([...this.#itemIds, ...itemIds]);
    this.#sectionOrder = uniqueStrings([...this.#sectionOrder, ...sectionOrder, ...familyOrder, ...this.#sectionIds]);
    this.#itemSections = { ...this.#itemSections, ...normalizeItemSections(itemSections) };
    this.#itemDescriptors = { ...this.#itemDescriptors, ...normalizeDescriptorMap(itemDescriptors) };
    this.#replace(this.#document);
    return this.snapshot();
  }

  get apiVersion() { return HudLayoutStore.apiVersion; }
  snapshot() { return structuredClone(this.#document); }
  profile(profileId = this.#document.activeProfile) {
    return structuredClone(this.#document.profiles[profileId] ?? this.#document.profiles.default);
  }
  activeProfileId() { return this.#document.activeProfile; }
  profiles() {
    return Object.entries(this.#document.profiles).map(([id, profile]) => ({ id, label: profile.label }));
  }

  register({
    familyIds = [],
    sectionIds = familyIds,
    itemIds = [],
    familyOrder = [],
    sectionOrder = familyOrder,
    itemFamilies = {},
    itemSections = itemFamilies,
    itemDescriptors = {}
  } = {}) {
    this.#sectionIds = uniqueStrings([...this.#sectionIds, ...sectionIds, ...familyIds]);
    this.#itemIds = uniqueStrings([...this.#itemIds, ...itemIds]);
    this.#sectionOrder = uniqueStrings([...sectionOrder, ...familyOrder, ...this.#sectionOrder, ...this.#sectionIds]);
    this.#itemSections = { ...this.#itemSections, ...normalizeItemSections(itemSections) };
    this.#itemDescriptors = { ...this.#itemDescriptors, ...normalizeDescriptorMap(itemDescriptors) };
    this.#replace(this.#document);
  }

  setActiveProfile(profileId) {
    const id = requiredId(profileId, "perfil");
    if (!this.#document.profiles[id]) throw new Error(`Perfil inexistente: ${id}.`);
    const document = this.snapshot();
    document.activeProfile = id;
    this.#replace(document);
    return this.profile();
  }

  createProfile({ id = null, label = null, from = this.activeProfileId() } = {}) {
    const sourceId = this.#document.profiles[from] ? from : this.activeProfileId();
    const profileId = uniqueProfileId(id ?? label ?? "perfil", Object.keys(this.#document.profiles));
    const document = this.snapshot();
    document.profiles[profileId] = structuredClone(document.profiles[sourceId]);
    document.profiles[profileId].label = String(label ?? `Perfil ${Object.keys(document.profiles).length}`).trim() || profileId;
    document.activeProfile = profileId;
    this.#replace(document);
    return profileId;
  }

  duplicateProfile(profileId = this.activeProfileId(), label = null) {
    const source = requiredId(profileId, "perfil");
    if (!this.#document.profiles[source]) throw new Error(`Perfil inexistente: ${source}.`);
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
    profile.viewport = normalizeViewportPolicy({ ...(profile.viewport ?? {}), ...patch });
    this.#replace(document);
    return this.profile();
  }

  addSection({ id = null, label = "Nova seção", color = "#528bff", x = null, y = null } = {}) {
    const profile = this.profile();
    const sectionId = uniqueSectionId(id ?? label, Object.keys(profile.sections));
    const placement = findGridPlacement({
      entries: sectionEntries(profile),
      movingId: sectionId,
      proposed: { id: sectionId, x, y, width: 4, height: 2 },
      columns: profile.viewport.columns,
      minimumRows: profile.viewport.rows,
      collisionMode: profile.viewport.collisionMode
    });
    this.#sectionIds = uniqueStrings([...this.#sectionIds, sectionId]);
    this.#sectionOrder = uniqueStrings([...this.#sectionOrder, sectionId]);
    this.updateSection(sectionId, {
      present: true,
      label,
      color,
      visibility: "always",
      zone: "adaptive",
      x: placement?.x ?? x,
      y: placement?.y ?? y,
      width: 4,
      height: 2,
      columns: 4,
      rows: 1,
      order: Object.keys(profile.sections).length
    });
    return sectionId;
  }

  deleteSection(sectionId) {
    const id = requiredId(sectionId, "seção");
    const document = this.snapshot();
    const profile = activeProfile(document);
    if (!profile.sections[id]) return this.profile();
    profile.sections[id] = normalizeSectionPolicy({ ...profile.sections[id], present: false });
    for (const [itemId, policy] of Object.entries(profile.items)) {
      if (policy.section === id) {
        profile.items[itemId] = normalizeItemPolicy({
          ...policy,
          section: null,
          x: null,
          y: null,
          present: true
        }, null, { descriptor: this.#itemDescriptors[itemId] });
      }
    }
    this.#replace(document);
    return this.profile();
  }

  restoreSection(sectionId, { x = null, y = null } = {}) {
    const id = requiredId(sectionId, "seção");
    const fallback = this.#defaults().profiles.default.sections[id] ?? {
      label: id,
      color: "#528bff",
      width: 4,
      height: 2,
      columns: 4,
      rows: 1
    };
    const profile = this.profile();
    const placement = findGridPlacement({
      entries: sectionEntries(profile).filter(item => item.id !== id),
      movingId: id,
      proposed: { id, x: x ?? fallback.x, y: y ?? fallback.y, width: fallback.width, height: fallback.height },
      columns: profile.viewport.columns,
      minimumRows: profile.viewport.rows,
      collisionMode: profile.viewport.collisionMode
    });
    return this.updateSection(id, {
      ...fallback,
      present: true,
      x: placement?.x ?? x ?? fallback.x,
      y: placement?.y ?? y ?? fallback.y
    });
  }

  updateSection(sectionId, patch = {}) {
    const id = requiredId(sectionId, "seção");
    const document = this.snapshot();
    const profile = activeProfile(document);
    const visibilityPatch = normalizeHudVisibilityPatchAliases(patch);
    profile.sections[id] = normalizeSectionPolicy({ ...(profile.sections[id] ?? {}), ...visibilityPatch });
    this.#replace(document);
    return this.profile();
  }

  updateFamily(familyId, patch = {}) { return this.updateSection(familyId, patch); }

  updateItem(itemId, patch = {}) {
    const id = requiredId(itemId, "ferramenta");
    const visibilityPatch = normalizeHudVisibilityPatchAliases(patch, { item: true });
    const document = this.snapshot();
    const profile = activeProfile(document);
    const canonicalPatch = {
      ...patch,
      ...(patch.width == null && patch.cellWidth != null ? { width: patch.cellWidth } : {}),
      ...(patch.height == null && patch.cellHeight != null ? { height: patch.cellHeight } : {})
    };
    profile.items[id] = normalizeItemPolicy(
      { ...(profile.items[id] ?? {}), ...canonicalPatch },
      null,
      { descriptor: this.#itemDescriptors[id] }
    );
    this.#replace(document);
    return this.profile();
  }

  removeItem(itemId) {
    return this.updateItem(itemId, { present: false, section: null, x: null, y: null });
  }

  restoreItem(itemId, { section = null, x = null, y = null } = {}) {
    const id = requiredId(itemId, "ferramenta");
    const descriptor = this.#itemDescriptors[id];
    const targetSection = section ?? this.#itemSections[id] ?? descriptor?.defaultPlacement?.section ?? firstPresentSection(this.profile());
    return this.placeItemAt(id, { section: targetSection, x, y, present: true });
  }

  resetSection(sectionId) {
    const id = requiredId(sectionId, "seção");
    const fallback = this.#defaults().profiles.default.sections[id];
    if (!fallback) return this.profile();
    return this.updateSection(id, fallback);
  }
  resetFamily(familyId) { return this.resetSection(familyId); }

  resetItem(itemId) {
    const id = requiredId(itemId, "ferramenta");
    const fallback = this.#defaults().profiles.default.items[id];
    return this.updateItem(id, fallback ?? {
      present: true,
      label: null,
      icon: null,
      section: this.#itemSections[id] ?? null,
      visibility: "inherit",
      zone: "inherit",
      order: null,
      x: null,
      y: null,
      width: 1,
      height: 1,
      command: null,
      activation: { mode: "native" }
    });
  }

  moveSection(sectionId, delta) {
    const id = requiredId(sectionId, "seção");
    const direction = signedDelta(delta);
    if (!direction) return this.profile();
    const profile = this.profile();
    const ordered = Object.keys(profile.sections)
      .filter(section => profile.sections[section].present !== false)
      .sort((left, right) => sectionOrderOf(profile, left, this.#sectionOrder) - sectionOrderOf(profile, right, this.#sectionOrder));
    return this.#swapOrder({ ids: ordered, id, direction, kind: "section" });
  }

  placeSection(sectionId, { before = null, after = null } = {}) {
    const id = requiredId(sectionId, "seção");
    const profile = this.profile();
    const ordered = Object.keys(profile.sections)
      .filter(candidate => candidate !== id && profile.sections[candidate].present !== false)
      .sort((left, right) => sectionOrderOf(profile, left, this.#sectionOrder) - sectionOrderOf(profile, right, this.#sectionOrder));
    let insertion = ordered.length;
    if (before && ordered.includes(before)) insertion = ordered.indexOf(before);
    if (after && ordered.includes(after)) insertion = ordered.indexOf(after) + 1;
    ordered.splice(insertion, 0, id);
    const document = this.snapshot();
    const active = activeProfile(document);
    for (const [order, candidate] of ordered.entries()) {
      active.sections[candidate] = normalizeSectionPolicy({ ...(active.sections[candidate] ?? {}), order, present: true });
    }
    this.#replace(document);
    return this.profile();
  }

  placeSectionAt(sectionId, { x, y, width = null, height = null } = {}) {
    const id = requiredId(sectionId, "seção");
    const document = this.snapshot();
    const profile = activeProfile(document);
    const current = profile.sections[id] ?? {};
    const candidate = normalizeSectionPolicy({
      ...current,
      present: true,
      x,
      y,
      width: width ?? current.width ?? 4,
      height: height ?? current.height ?? 2
    });
    const mutation = resolveGridMutation({
      entries: sectionEntries(profile),
      movingId: id,
      proposed: { id, ...candidate },
      columns: profile.viewport.columns,
      minimumRows: profile.viewport.rows,
      collisionMode: profile.viewport.collisionMode
    });
    if (!mutation.accepted) {
      return Object.freeze({ accepted: false, reason: mutation.reason, profile: this.profile() });
    }
    for (const placement of mutation.placements) {
      const previous = profile.sections[placement.id] ?? {};
      profile.sections[placement.id] = normalizeSectionPolicy({
        ...previous,
        present: true,
        x: placement.x,
        y: placement.y,
        width: placement.width,
        height: placement.height
      });
    }
    this.#replace(document);
    return Object.freeze({
      accepted: true,
      placement: mutation.placements.find(entry => entry.id === id) ?? null,
      profile: this.profile()
    });
  }

  moveFamily(familyId, delta) { return this.moveSection(familyId, delta); }

  moveItem(itemId, delta) {
    const id = requiredId(itemId, "ferramenta");
    const direction = signedDelta(delta);
    if (!direction) return this.profile();
    const profile = this.profile();
    const section = profile.items[id]?.section ?? this.#itemSections[id] ?? null;
    const ordered = Object.keys(profile.items)
      .filter(item => profile.items[item].present !== false)
      .filter(item => (profile.items[item]?.section ?? this.#itemSections[item] ?? null) === section)
      .sort((left, right) => itemOrderOf(profile, left, this.#itemIds) - itemOrderOf(profile, right, this.#itemIds));
    return this.#swapOrder({ ids: ordered, id, direction, kind: "item" });
  }

  placeItem(itemId, { section, before = null, after = null } = {}) {
    const id = requiredId(itemId, "ferramenta");
    const targetSection = requiredId(section, "seção");
    const profile = this.profile();
    const siblings = Object.keys(profile.items)
      .filter(candidate => candidate !== id && profile.items[candidate].present !== false)
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
        order,
        present: true,
        x: null,
        y: null
      }, null, { descriptor: this.#itemDescriptors[candidate] });
    }
    this.#replace(document);
    return this.profile();
  }

  placeItemAt(itemId, { section, x = null, y = null, width = null, height = null, present = true } = {}) {
    const id = requiredId(itemId, "ferramenta");
    const targetSection = requiredId(section, "seção");
    const document = this.snapshot();
    const profile = activeProfile(document);
    const sectionPolicy = profile.sections[targetSection];
    if (!sectionPolicy || sectionPolicy.present === false) {
      return Object.freeze({ accepted: false, reason: "section-unavailable", profile: this.profile() });
    }
    const current = profile.items[id] ?? {};
    const descriptor = this.#itemDescriptors[id] ?? {};
    const candidate = normalizeItemPolicy({
      ...current,
      section: targetSection,
      present,
      x,
      y,
      width: width ?? current.width ?? descriptor.sizing?.preferredWidth ?? 1,
      height: height ?? current.height ?? descriptor.sizing?.preferredHeight ?? 1
    }, current, { descriptor });
    const mutation = resolveGridMutation({
      entries: itemEntries(profile, targetSection),
      movingId: id,
      proposed: { id, ...candidate },
      columns: sectionPolicy.columns,
      minimumRows: sectionPolicy.rows,
      collisionMode: sectionPolicy.collisionMode
    });
    if (!mutation.accepted) {
      return Object.freeze({ accepted: false, reason: mutation.reason, profile: this.profile() });
    }
    // Moving between sections must remove the old physical placement first.
    profile.items[id] = normalizeItemPolicy({
      ...current,
      ...candidate,
      section: targetSection,
      present: true
    }, current, { descriptor });
    for (const placement of mutation.placements) {
      const previous = profile.items[placement.id] ?? {};
      const placementDescriptor = this.#itemDescriptors[placement.id] ?? {};
      profile.items[placement.id] = normalizeItemPolicy({
        ...previous,
        section: targetSection,
        present: previous.present !== false,
        x: placement.x,
        y: placement.y,
        width: placement.width,
        height: placement.height
      }, previous, { descriptor: placementDescriptor });
    }
    this.#replace(document);
    return Object.freeze({
      accepted: true,
      placement: mutation.placements.find(entry => entry.id === id) ?? null,
      profile: this.profile()
    });
  }

  reset() { this.#replace(this.#defaults()); return this.snapshot(); }
  exportDocument() { return JSON.stringify(this.#document, null, 2); }
  importText(text) { return this.importDocument(JSON.parse(String(text))); }
  importDocument(document) { this.#replace(document); return this.snapshot(); }

  subscribe(listener) {
    if (typeof listener !== "function") throw new TypeError("HudLayoutStore.subscribe exige função.");
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  #swapOrder({ ids, id, direction, kind }) {
    const index = ids.indexOf(id);
    const targetIndex = Math.max(0, Math.min(ids.length - 1, index + direction));
    if (index < 0 || targetIndex === index) return this.profile();
    const targetId = ids[targetIndex];
    const profile = this.profile();
    const currentOrder = kind === "section" ? sectionOrderOf(profile, id, this.#sectionOrder) : itemOrderOf(profile, id, this.#itemIds);
    const targetOrder = kind === "section" ? sectionOrderOf(profile, targetId, this.#sectionOrder) : itemOrderOf(profile, targetId, this.#itemIds);
    const document = this.snapshot();
    const active = activeProfile(document);
    if (kind === "section") {
      active.sections[id] = normalizeSectionPolicy({ ...active.sections[id], order: targetOrder });
      active.sections[targetId] = normalizeSectionPolicy({ ...active.sections[targetId], order: currentOrder });
    } else {
      active.items[id] = normalizeItemPolicy({ ...active.items[id], order: targetOrder }, null, { descriptor: this.#itemDescriptors[id] });
      active.items[targetId] = normalizeItemPolicy({ ...active.items[targetId], order: currentOrder }, null, { descriptor: this.#itemDescriptors[targetId] });
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
      itemDescriptors: this.#itemDescriptors,
      legacyPreferences: this.#legacyPreferences
    });
  }

  #load() {
    let parsed = null;
    try {
      const keys = [
        this.#key,
        "spatialseed.edit.hud.layout.v4",
        "spatialseed.edit.hud.layout.v3",
        "spatialseed.edit.hud.layout.v2"
      ];
      const text = keys.map(key => this.#storage?.getItem?.(key)).find(Boolean);
      parsed = JSON.parse(text ?? "null");
    } catch { parsed = null; }
    return normalizeHudLayoutDocument(parsed ?? {}, this.#normalizationOptions());
  }

  #replace(document) {
    broadcastHudLayoutStoreDocument(this, document);
    this.#document = normalizeHudLayoutDocument(document, this.#normalizationOptions());
    try { this.#storage?.setItem?.(this.#key, JSON.stringify(this.#document)); }
    catch {}
    for (const listener of this.#listeners) listener(this.snapshot());
  }

  #normalizationOptions() {
    return {
      sectionIds: this.#sectionIds,
      itemIds: this.#itemIds,
      sectionOrder: this.#sectionOrder,
      itemSections: this.#itemSections,
      itemDescriptors: this.#itemDescriptors,
      legacyPreferences: this.#legacyPreferences
    };
  }
}

function activeProfile(document) {
  const id = document.activeProfile ?? "default";
  if (!document.profiles[id]) document.profiles[id] = { label: id, viewport: {}, sections: {}, items: {} };
  return document.profiles[id];
}

function sectionEntries(profile) {
  return Object.entries(profile.sections ?? {}).map(([id, policy]) => ({ id, ...policy }));
}
function itemEntries(profile, section) {
  return Object.entries(profile.items ?? {})
    .filter(([, policy]) => policy.section === section)
    .map(([id, policy]) => ({ id, ...policy }));
}
function firstPresentSection(profile) {
  return Object.entries(profile.sections ?? {}).find(([, policy]) => policy.present !== false)?.[0] ?? null;
}
function sectionOrderOf(profile, id, fallbackIds) { return finiteOrder(profile.sections?.[id]?.order) ?? Math.max(0, fallbackIds.indexOf(id)); }
function itemOrderOf(profile, id, fallbackIds) { return finiteOrder(profile.items?.[id]?.order) ?? Math.max(0, fallbackIds.indexOf(id)); }
function finiteOrder(value) { if (value === null || value === undefined || value === "") return null; const numeric = Number(value); return Number.isFinite(numeric) ? Math.trunc(numeric) : null; }
function signedDelta(value) { const numeric = Number(value); return numeric < 0 ? -1 : numeric > 0 ? 1 : 0; }
function requiredId(value, label) { const id = String(value ?? "").trim(); if (!id) throw new TypeError(`Identificador de ${label} ausente.`); return id; }
function uniqueProfileId(value, existing) { return uniqueId(slug(value) || "perfil", existing); }
function uniqueSectionId(value, existing) { return uniqueId(slug(value) || "secao", existing); }
function uniqueId(base, existing) { const used = new Set(existing); if (!used.has(base)) return base; let index = 2; while (used.has(`${base}-${index}`)) index += 1; return `${base}-${index}`; }
function slug(value) { return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""); }
function normalizeItemSections(value) { const result = {}; for (const [itemId, sectionId] of Object.entries(value ?? {})) { const item = String(itemId ?? "").trim(); const section = String(sectionId ?? "").trim(); if (item && section) result[item] = section; } return result; }
function normalizeDescriptorMap(value) { if (Array.isArray(value)) return Object.fromEntries(value.map(descriptor => [descriptor.id, descriptor])); return value && typeof value === "object" ? { ...value } : {}; }
function uniqueStrings(values) { return [...new Set((Array.isArray(values) ? values : []).map(value => String(value ?? "").trim()).filter(Boolean))]; }
