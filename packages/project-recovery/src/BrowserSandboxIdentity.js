const DEFAULT_STORAGE_KEY = "spatial-seed.sandbox.current";

export class BrowserSandboxIdentity {
  static apiVersion = "browser-sandbox-identity-v1";

  constructor({
    storage = globalThis.localStorage,
    cryptoApi = globalThis.crypto,
    storageKey = DEFAULT_STORAGE_KEY,
    requestedId = null
  } = {}) {
    this.storage = storage;
    this.crypto = cryptoApi;
    this.storageKey = storageKey;
    this.requestedId = isSandboxId(requestedId)
      ? String(requestedId)
      : null;
    this.fallbackId = null;
  }

  current() {
    if (this.requestedId) return this.requestedId;
    const stored = this.#read();
    if (stored) return stored;
    return this.rotate();
  }

  rotate() {
    this.requestedId = null;
    const id = createSandboxId(this.crypto);
    this.fallbackId = id;
    try {
      this.storage?.setItem(this.storageKey, id);
    } catch {}
    return id;
  }

  #read() {
    try {
      const value = this.storage?.getItem(this.storageKey);
      if (isSandboxId(value)) return value;
    } catch {}
    return this.fallbackId;
  }
}

export function createSandboxId(cryptoApi = globalThis.crypto) {
  const suffix = typeof cryptoApi?.randomUUID === "function"
    ? cryptoApi.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `sandbox-${suffix}`;
}

export function isSandboxId(value) {
  return /^sandbox-[a-zA-Z0-9-]{8,}$/.test(String(value ?? ""));
}
