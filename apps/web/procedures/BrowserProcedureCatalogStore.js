export const DEFAULT_PROCEDURE_CATALOG_STORAGE_KEY =
  "spatialseed.procedure-library.v1";

export class BrowserProcedureCatalogStore {
  constructor({
    storage = globalThis.localStorage,
    key = DEFAULT_PROCEDURE_CATALOG_STORAGE_KEY
  } = {}) {
    if (
      !storage ||
      typeof storage.getItem !== "function" ||
      typeof storage.setItem !== "function"
    ) {
      throw new TypeError("Armazenamento local incompatível.");
    }

    this.storage = storage;
    this.key = String(key);
  }

  load() {
    const text = this.storage.getItem(this.key);
    return text === null ? null : JSON.parse(text);
  }

  save(document) {
    this.storage.setItem(this.key, JSON.stringify(document));
    return true;
  }
}
