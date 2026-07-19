export const MODULE_MANIFEST_VERSION = "spatial-seed-module-v1";

export class ModuleRegistry {
  #modules = new Map();
  #failures = new Map();

  register(module) {
    const normalized = normalizeModule(module);
    const { id } = normalized.manifest;

    if (this.#modules.has(id)) {
      throw new Error(`Duplicate module: ${id}`);
    }

    this.#modules.set(id, normalized);
    return this;
  }

  async activateAll(context = {}) {
    const available = normalizeContext(context);

    for (const [id, module] of this.#modules) {
      try {
        const capabilities = selectCapabilities(
          module.manifest.capabilities,
          available,
          id
        );
        await module.activate(capabilities);
        this.#failures.delete(id);
      } catch (error) {
        this.#failures.set(id, error);
        console.error(`Module disabled: ${id}`, error);
      }
    }

    return this.describe();
  }

  describe() {
    return [...this.#modules.values()].map(module => ({
      ...structuredClone(module.manifest),
      failed: this.#failures.has(module.manifest.id),
      error: this.#failures.get(module.manifest.id)?.message ?? null
    }));
  }
}

export function selectCapabilities(requested, context, moduleId = "module") {
  const result = Object.create(null);

  for (const capability of requested) {
    if (!Object.hasOwn(context, capability)) {
      throw new Error(
        `Module ${moduleId} requires unavailable capability: ${capability}`
      );
    }
    result[capability] = context[capability];
  }

  return Object.freeze(result);
}

function normalizeModule(module) {
  if (!module || typeof module !== "object") {
    throw new TypeError("module must be an object");
  }
  if (typeof module.activate !== "function") {
    throw new TypeError("module.activate must be a function");
  }

  const source = module.manifest;
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    throw new TypeError("module.manifest is required");
  }

  const id = nonEmptyString(source.id, "module.manifest.id");
  const capabilities = normalizedCapabilities(source.capabilities ?? []);
  const manifest = Object.freeze({
    manifestVersion: String(
      source.manifestVersion ?? MODULE_MANIFEST_VERSION
    ),
    id,
    version: nonEmptyString(source.version, "module.manifest.version"),
    apiVersion: nonEmptyString(
      source.apiVersion,
      "module.manifest.apiVersion"
    ),
    optional: source.optional !== false,
    capabilities: Object.freeze(capabilities)
  });

  if (manifest.manifestVersion !== MODULE_MANIFEST_VERSION) {
    throw new Error(
      `Unsupported module manifest: ${manifest.manifestVersion}`
    );
  }

  return Object.freeze({ manifest, activate: module.activate });
}

function normalizeContext(context) {
  if (!context || typeof context !== "object" || Array.isArray(context)) {
    throw new TypeError("module context must be an object");
  }

  return context;
}

function normalizedCapabilities(values) {
  if (!Array.isArray(values)) {
    throw new TypeError("module.manifest.capabilities must be an array");
  }

  const result = [];
  const seen = new Set();
  for (const value of values) {
    const capability = nonEmptyString(value, "capability");
    if (!/^[a-z][a-zA-Z0-9.:-]*$/.test(capability)) {
      throw new TypeError(`Invalid module capability: ${capability}`);
    }
    if (seen.has(capability)) continue;
    seen.add(capability);
    result.push(capability);
  }
  return result.sort();
}

function nonEmptyString(value, label) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new TypeError(`${label} is required`);
  return normalized;
}
