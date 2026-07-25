import { validateRecoveryRecord } from "./RecoveryRecord.js";

const DATABASE_NAME = "spatial-seed";
const DATABASE_VERSION = 1;
const STORE_NAME = "sandbox-recoveries";

export class IndexedDbRecoveryStore {
  static apiVersion = "indexeddb-recovery-store-v1";

  constructor({
    indexedDB = globalThis.indexedDB,
    databaseName = DATABASE_NAME
  } = {}) {
    this.indexedDB = indexedDB;
    this.databaseName = databaseName;
    this.database = null;
  }

  get available() {
    return Boolean(this.indexedDB?.open);
  }

  async load(sandboxId) {
    if (!this.available) return null;
    const database = await this.#open();
    const value = await requestResult(
      database
        .transaction(STORE_NAME, "readonly")
        .objectStore(STORE_NAME)
        .get(String(sandboxId))
    );
    return value ? validateRecoveryRecord(value) : null;
  }

  async save(record) {
    if (!this.available) return false;
    const normalized = validateRecoveryRecord(record);
    const database = await this.#open();
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(
      structuredClone(normalized)
    );
    await transactionDone(transaction);
    return true;
  }

  async delete(sandboxId) {
    if (!this.available) return false;
    const database = await this.#open();
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).delete(String(sandboxId));
    await transactionDone(transaction);
    return true;
  }

  async #open() {
    if (this.database) return this.database;
    if (!this.available) {
      throw new Error("IndexedDB indisponível.");
    }

    const request = this.indexedDB.open(
      this.databaseName,
      DATABASE_VERSION
    );
    request.addEventListener("upgradeneeded", () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, {
          keyPath: "sandboxId"
        });
      }
    }, { once: true });
    this.database = await requestResult(request);
    return this.database;
  }
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.addEventListener(
      "success",
      () => resolve(request.result),
      { once: true }
    );
    request.addEventListener(
      "error",
      () => reject(request.error ?? new Error("Falha no IndexedDB.")),
      { once: true }
    );
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.addEventListener("complete", () => resolve(), {
      once: true
    });
    transaction.addEventListener(
      "abort",
      () => reject(
        transaction.error ?? new Error("Transação IndexedDB cancelada.")
      ),
      { once: true }
    );
    transaction.addEventListener(
      "error",
      () => reject(
        transaction.error ?? new Error("Falha na transação IndexedDB.")
      ),
      { once: true }
    );
  });
}
