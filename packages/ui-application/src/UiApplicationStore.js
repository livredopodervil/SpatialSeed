import {
  APPLICATION_DEFINITION_SCHEMA,
  normalizeApplicationDefinition
} from "../../ui-contracts/src/index.js?build=20260801-0046d";

export const UI_APPLICATION_DOCUMENT_SCHEMA = "spatial-seed-ui-applications-v1";
export const UI_APPLICATION_STORAGE_KEY = "spatialseed.ui.applications.v1";

export class UiApplicationStore {
  static apiVersion = "ui-application-store-v1";

  #storage;
  #key;
  #installedModules = [];
  #document;
  #listeners = new Set();

  constructor({
    storage = globalThis.localStorage,
    key = UI_APPLICATION_STORAGE_KEY,
    installedModules = []
  } = {}) {
    this.#storage = storage ?? null;
    this.#key = String(key || UI_APPLICATION_STORAGE_KEY);
    this.#installedModules = uniqueStrings(installedModules);
    this.#document = this.#load();
  }

  snapshot() { return structuredClone(this.#document); }
  activeApplicationId() { return this.#document.activeApplication; }
  activeApplication() { return structuredClone(this.#document.applications[this.#document.activeApplication]); }
  applications() {
    return Object.entries(this.#document.applications).map(([id, definition]) => ({ id, ...structuredClone(definition) }));
  }

  updateInstalledModules(moduleIds = []) {
    const previous = new Set(this.#installedModules);
    const next = uniqueStrings(moduleIds);
    const nextSet = new Set(next);
    const added = next.filter(id => !previous.has(id));
    this.#installedModules = next;
    const document = this.snapshot();
    for (const definition of Object.values(document.applications)) {
      const disabled = new Set(definition.disabledModules.filter(id => nextSet.has(id)));
      const enabled = new Set(definition.enabledModules.filter(id => nextSet.has(id)));
      for (const id of added) if (!disabled.has(id)) enabled.add(id);
      // An empty initial registry means "all modules that become installed".
      if (!previous.size && !enabled.size) {
        for (const id of next) if (!disabled.has(id)) enabled.add(id);
      }
      definition.enabledModules = [...enabled];
      definition.disabledModules = [...disabled];
    }
    this.#replace(document);
    return this.snapshot();
  }

  setActiveApplication(applicationId) {
    const id = requiredId(applicationId, "aplicação");
    if (!this.#document.applications[id]) throw new Error(`Aplicação inexistente: ${id}.`);
    const document = this.snapshot();
    document.activeApplication = id;
    this.#replace(document);
    return this.activeApplication();
  }

  createApplication({ id = null, name = "Nova aplicação", from = this.#document.activeApplication } = {}) {
    const source = this.#document.applications[from] ?? this.#defaultDefinition();
    const applicationId = uniqueId(slug(id ?? name) || "application", Object.keys(this.#document.applications));
    const document = this.snapshot();
    document.applications[applicationId] = {
      ...structuredClone(source),
      id: applicationId,
      name
    };
    document.activeApplication = applicationId;
    this.#replace(document);
    return applicationId;
  }

  duplicateApplication(applicationId = this.#document.activeApplication, name = null) {
    const source = this.#document.applications[applicationId];
    if (!source) throw new Error(`Aplicação inexistente: ${applicationId}.`);
    return this.createApplication({ name: name ?? `${source.name} — cópia`, from: applicationId });
  }

  renameApplication(applicationId, name) {
    return this.updateApplication(applicationId, { name: requiredText(name, "nome") });
  }

  deleteApplication(applicationId) {
    const id = requiredId(applicationId, "aplicação");
    if (id === "default") throw new Error("A aplicação padrão não pode ser removida.");
    const document = this.snapshot();
    if (!document.applications[id]) return this.snapshot();
    delete document.applications[id];
    if (document.activeApplication === id) document.activeApplication = "default";
    this.#replace(document);
    return this.snapshot();
  }

  updateApplication(applicationId, patch = {}) {
    const id = requiredId(applicationId, "aplicação");
    const current = this.#document.applications[id];
    if (!current) throw new Error(`Aplicação inexistente: ${id}.`);
    const document = this.snapshot();
    document.applications[id] = { ...current, ...structuredClone(patch), id };
    this.#replace(document);
    return structuredClone(this.#document.applications[id]);
  }

  setModuleEnabled(moduleId, enabled, applicationId = this.#document.activeApplication) {
    const id = requiredId(moduleId, "módulo");
    const current = this.#document.applications[applicationId];
    if (!current) throw new Error(`Aplicação inexistente: ${applicationId}.`);
    const enabledSet = new Set(current.enabledModules);
    const disabledSet = new Set(current.disabledModules);
    if (enabled) {
      enabledSet.add(id);
      disabledSet.delete(id);
    } else {
      enabledSet.delete(id);
      disabledSet.add(id);
    }
    return this.updateApplication(applicationId, {
      enabledModules: [...enabledSet],
      disabledModules: [...disabledSet]
    });
  }

  exportDocument() { return JSON.stringify(this.#document, null, 2); }
  importText(text) { return this.importDocument(JSON.parse(String(text))); }
  importDocument(document) { this.#replace(document); return this.snapshot(); }

  subscribe(listener) {
    if (typeof listener !== "function") throw new TypeError("Listener de aplicação inválido.");
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  #load() {
    let value = null;
    try { value = JSON.parse(this.#storage?.getItem?.(this.#key) ?? "null"); }
    catch { value = null; }
    return normalizeDocument(value, this.#defaultDefinition());
  }

  #replace(value) {
    this.#document = normalizeDocument(value, this.#defaultDefinition());
    try { this.#storage?.setItem?.(this.#key, JSON.stringify(this.#document)); }
    catch {}
    for (const listener of this.#listeners) listener(this.snapshot());
  }

  #defaultDefinition() {
    return normalizeApplicationDefinition({
      id: "default",
      name: "SpatialSeed completo",
      enabledModules: this.#installedModules,
      disabledModules: [],
      safeModeModules: this.#installedModules.filter(id => id.includes("shell") || id.includes("diagnostic"))
    });
  }
}

function normalizeDocument(value, fallbackDefinition) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const sourceApplications = source.applications && typeof source.applications === "object"
    ? source.applications
    : {};
  const applications = {};
  for (const [id, definition] of Object.entries(sourceApplications)) {
    try { applications[id] = normalizeApplicationDefinition({ ...definition, id }); }
    catch {}
  }
  applications.default ??= fallbackDefinition;
  const activeApplication = applications[source.activeApplication]
    ? source.activeApplication
    : "default";
  return deepFreeze({
    schemaVersion: UI_APPLICATION_DOCUMENT_SCHEMA,
    activeApplication,
    applications
  });
}

function uniqueStrings(values) { return [...new Set((Array.isArray(values) ? values : []).map(value => String(value ?? "").trim()).filter(Boolean))]; }
function requiredId(value, label) { const id = String(value ?? "").trim(); if (!id) throw new TypeError(`Identificador de ${label} ausente.`); return id; }
function requiredText(value, label) { const text = String(value ?? "").trim(); if (!text) throw new TypeError(`${label} ausente.`); return text; }
function slug(value) { return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""); }
function uniqueId(base, existing) { const used = new Set(existing); if (!used.has(base)) return base; let index = 2; while (used.has(`${base}-${index}`)) index += 1; return `${base}-${index}`; }
function deepFreeze(value) { if (!value || typeof value !== "object" || Object.isFrozen(value)) return value; for (const child of Object.values(value)) deepFreeze(child); return Object.freeze(value); }
