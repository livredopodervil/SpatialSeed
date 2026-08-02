export const MODULE_MANIFEST_VERSION = "spatial-seed-module-v2";

const MODULE_ID_PATTERN = /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/;
const CAPABILITY_ID_PATTERN =
  /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+\.v[1-9][0-9]*$/;
const CONTRIBUTION_KIND_PATTERN = /^[a-z][a-z0-9-]*$/;
const SEMANTIC_VERSION_PATTERN =
  /^(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)(?:-[0-9A-Za-z.-]+)?$/;

const MANIFEST_FIELDS = new Set([
  "manifestVersion",
  "id",
  "version",
  "description",
  "requires",
  "provides",
  "contributes",
  "permissions"
]);
const REQUIREMENT_FIELDS = new Set(["modules", "capabilities"]);
const PROVIDER_FIELDS = new Set(["capabilities"]);
const ACTIVATION_FIELDS = new Set([
  "capabilities",
  "contributions",
  "status"
]);

export class ModuleValidationError extends Error {
  constructor(message, { moduleId = null, code = "module-invalid" } = {}) {
    super(message);
    this.name = "ModuleValidationError";
    this.code = code;
    this.moduleId = moduleId;
  }
}

export class ModuleActivationError extends Error {
  constructor(moduleId, cause, rollbackErrors = []) {
    super(
      `Module activation failed: ${moduleId}: ${errorMessage(cause)}`
    );
    this.name = "ModuleActivationError";
    this.code = "module-activation-failed";
    this.moduleId = moduleId;
    this.cause = cause;
    this.rollbackErrors = Object.freeze([...rollbackErrors]);
  }
}

export class ModuleRegistry {
  #definitions = new Map();
  #activeRecords = [];
  #activeById = new Map();
  #activeContributions = new Map();
  #activeCapabilities = new Map();
  #lastFailures = new Map();
  #lastDisposalErrors = [];
  #activating = false;

  register(definition) {
    if (this.#activating) {
      throw new Error("Cannot register a module during activation.");
    }

    const normalized = normalizeModuleDefinition(definition);
    const { id } = normalized.manifest;

    if (this.#definitions.has(id)) {
      throw new ModuleValidationError(`Duplicate module: ${id}`, {
        moduleId: id,
        code: "module-duplicate"
      });
    }

    this.#definitions.set(id, normalized);
    return this;
  }

  validate(hostCapabilities = {}) {
    const host = normalizeHostCapabilities(hostCapabilities);
    const plan = buildActivationPlan(this.#definitions, host);

    return deepFreeze({
      manifestVersion: MODULE_MANIFEST_VERSION,
      order: plan.map(definition => definition.manifest.id),
      modules: plan.map(definition =>
        structuredClone(definition.manifest)
      )
    });
  }

  async activateAll(hostCapabilities = {}) {
    if (this.#activating) {
      throw new Error("Module activation is already in progress.");
    }

    this.#activating = true;
    let currentModuleId = "module-plan";
    const candidateRecords = [];

    try {
      const host = normalizeHostCapabilities(hostCapabilities);
      const plan = buildActivationPlan(this.#definitions, host);
      const availableCapabilities = new Map(Object.entries(host));
      const candidateCapabilities = new Map();
      const candidateContributions = new Map();

      for (const definition of plan) {
        currentModuleId = definition.manifest.id;
        const capabilities = selectCapabilitiesFromMap(
          definition.manifest.requires.capabilities,
          availableCapabilities,
          currentModuleId
        );
        const scope = Object.freeze({
          manifest: definition.manifest,
          capabilities
        });
        const instance = normalizeModuleInstance(
          await definition.createModule(scope),
          currentModuleId
        );
        const record = {
          definition,
          instance,
          activation: null
        };
        candidateRecords.push(record);

        const activation = normalizeActivationResult(
          await instance.activate(),
          definition.manifest
        );
        record.activation = activation;

        for (const [id, value] of activation.capabilities) {
          availableCapabilities.set(id, value);
          candidateCapabilities.set(id, Object.freeze({
            moduleId: currentModuleId,
            value
          }));
        }
        mergeContributionPayloads(
          candidateContributions,
          activation.contributions,
          definition.manifest
        );
      }

      const previousRecords = this.#activeRecords;
      this.#activeRecords = candidateRecords;
      this.#activeById = new Map(
        candidateRecords.map(record => [
          record.definition.manifest.id,
          record
        ])
      );
      this.#activeCapabilities = candidateCapabilities;
      this.#activeContributions = candidateContributions;
      this.#lastFailures.clear();

      this.#lastDisposalErrors = await disposeRecords(previousRecords);
      return this.describe();
    } catch (error) {
      const rollbackErrors = await disposeRecords(candidateRecords);
      if (currentModuleId !== "module-plan") {
        this.#lastFailures.set(currentModuleId, error);
      }
      if (error instanceof ModuleValidationError) throw error;
      throw new ModuleActivationError(
        currentModuleId,
        error,
        rollbackErrors
      );
    } finally {
      this.#activating = false;
    }
  }

  resolveContribution(kind, id) {
    const normalizedKind = contributionKind(kind);
    const normalizedId = qualifiedId(id, "contribution id");
    const contribution = this.#activeContributions
      .get(normalizedKind)
      ?.get(normalizedId);

    if (!contribution) {
      throw new Error(
        `Active contribution unavailable: ${normalizedKind}:${normalizedId}`
      );
    }

    return contribution.value;
  }

  listContributions(kind) {
    const normalizedKind = contributionKind(kind);
    const contributions = this.#activeContributions.get(normalizedKind);

    if (!contributions) return Object.freeze([]);
    return Object.freeze(
      [...contributions.values()].map(contribution => deepFreeze({
        moduleId: contribution.moduleId,
        ...structuredClone(contribution.descriptor)
      }))
    );
  }

  resolveCapability(id) {
    const normalizedId = capabilityId(id, "capability id");
    const capability = this.#activeCapabilities.get(normalizedId);

    if (!capability) {
      throw new Error(`Active capability unavailable: ${normalizedId}`);
    }
    return capability.value;
  }

  describe() {
    return [...this.#definitions.values()].map(definition => {
      const id = definition.manifest.id;
      const active = this.#activeById.get(id) ?? null;
      const failure = this.#lastFailures.get(id) ?? null;

      return deepFreeze({
        ...structuredClone(definition.manifest),
        state: active ? "active" : "registered",
        failed: !active && Boolean(failure),
        error: failure ? errorMessage(failure) : null,
        status: active?.activation?.status ?? null
      });
    });
  }

  diagnostics() {
    return deepFreeze({
      activeOrder: this.#activeRecords.map(
        record => record.definition.manifest.id
      ),
      lastDisposalErrors: this.#lastDisposalErrors.map(item => ({
        moduleId: item.moduleId,
        error: errorMessage(item.error)
      }))
    });
  }

  async dispose() {
    if (this.#activating) {
      throw new Error("Cannot dispose modules during activation.");
    }
    if (this.#activeRecords.length === 0) return false;

    const records = this.#activeRecords;
    this.#activeRecords = [];
    this.#activeById = new Map();
    this.#activeCapabilities = new Map();
    this.#activeContributions = new Map();
    const failures = await disposeRecords(records);
    this.#lastDisposalErrors = failures;

    if (failures.length) {
      const error = new AggregateError(
        failures.map(item => item.error),
        "One or more modules failed to dispose."
      );
      error.failures = Object.freeze([...failures]);
      throw error;
    }
    return true;
  }
}

export function selectCapabilities(requested, context, moduleId = "module") {
  const available = normalizeHostCapabilities(context);
  return selectCapabilitiesFromMap(
    normalizedStringList(requested, "requested capabilities", {
      normalize: value => capabilityId(value, "capability")
    }),
    new Map(Object.entries(available)),
    moduleId
  );
}

function normalizeModuleDefinition(definition) {
  const source = plainRecord(definition, "module definition");
  assertKnownFields(source, new Set(["manifest", "createModule"]), "module");
  if (typeof source.createModule !== "function") {
    throw new TypeError("module.createModule must be a function");
  }

  return Object.freeze({
    manifest: normalizeManifest(source.manifest),
    createModule: source.createModule
  });
}

function normalizeManifest(input) {
  const source = plainRecord(input, "module.manifest");
  assertKnownFields(source, MANIFEST_FIELDS, "module.manifest");
  const manifestVersion = String(source.manifestVersion ?? "");

  if (manifestVersion !== MODULE_MANIFEST_VERSION) {
    throw new ModuleValidationError(
      `Unsupported module manifest: ${manifestVersion || "missing"}`,
      { code: "manifest-version-unsupported" }
    );
  }

  const id = qualifiedId(source.id, "module.manifest.id");
  const version = nonEmptyString(source.version, "module.manifest.version");
  if (!SEMANTIC_VERSION_PATTERN.test(version)) {
    throw new ModuleValidationError(
      `Invalid module version for ${id}: ${version}`,
      { moduleId: id, code: "module-version-invalid" }
    );
  }

  const requires = normalizeRequires(source.requires ?? {}, id);
  const provides = normalizeProvides(source.provides ?? {}, id);
  const contributes = normalizeContributes(source.contributes ?? {}, id);
  const permissions = normalizedStringList(
    source.permissions ?? [],
    `${id}.permissions`,
    { normalize: value => qualifiedId(value, `${id}.permission`) }
  );
  const manifest = {
    manifestVersion,
    id,
    version,
    requires,
    provides,
    contributes,
    permissions
  };

  if (source.description !== undefined) {
    manifest.description = nonEmptyString(
      source.description,
      `${id}.description`
    );
  }
  return deepFreeze(manifest);
}

function normalizeRequires(input, moduleId) {
  const source = plainRecord(input, `${moduleId}.requires`);
  assertKnownFields(source, REQUIREMENT_FIELDS, `${moduleId}.requires`);
  return deepFreeze({
    modules: normalizedStringList(
      source.modules ?? [],
      `${moduleId}.requires.modules`,
      { normalize: value => qualifiedId(value, "required module id") }
    ),
    capabilities: normalizedStringList(
      source.capabilities ?? [],
      `${moduleId}.requires.capabilities`,
      { normalize: value => capabilityId(value, "required capability id") }
    )
  });
}

function normalizeProvides(input, moduleId) {
  const source = plainRecord(input, `${moduleId}.provides`);
  assertKnownFields(source, PROVIDER_FIELDS, `${moduleId}.provides`);
  return deepFreeze({
    capabilities: normalizedStringList(
      source.capabilities ?? [],
      `${moduleId}.provides.capabilities`,
      { normalize: value => capabilityId(value, "provided capability id") }
    )
  });
}

function normalizeContributes(input, moduleId) {
  const source = plainRecord(input, `${moduleId}.contributes`);
  const normalized = {};

  for (const [rawKind, values] of Object.entries(source)) {
    const kind = contributionKind(rawKind);
    if (!Array.isArray(values)) {
      throw new TypeError(`${moduleId}.contributes.${kind} must be an array`);
    }
    const ids = new Set();
    normalized[kind] = values.map((value, index) => {
      const descriptor = normalizeContributionDescriptor(
        value,
        `${moduleId}.contributes.${kind}[${index}]`
      );
      if (ids.has(descriptor.id)) {
        throw new ModuleValidationError(
          `Duplicate ${kind} contribution in ${moduleId}: ${descriptor.id}`,
          { moduleId, code: "contribution-duplicate" }
        );
      }
      ids.add(descriptor.id);
      return descriptor;
    });
  }
  return deepFreeze(normalized);
}

function normalizeContributionDescriptor(input, label) {
  const source = plainRecord(input, label);
  const clone = cloneSerializable(source, label);
  clone.id = qualifiedId(clone.id, `${label}.id`);
  if (clone.kind !== undefined) {
    clone.kind = contributionKind(clone.kind);
  }
  if (clone.apiVersion !== undefined) {
    clone.apiVersion = nonEmptyString(
      clone.apiVersion,
      `${label}.apiVersion`
    );
  }
  return deepFreeze(clone);
}

function buildActivationPlan(definitions, hostCapabilities) {
  const providers = new Map();
  const contributionOwners = new Map();

  for (const definition of definitions.values()) {
    const manifest = definition.manifest;
    for (const dependency of manifest.requires.modules) {
      if (dependency === manifest.id) {
        throw validationError(
          manifest.id,
          `Module cannot depend on itself: ${manifest.id}`,
          "module-self-dependency"
        );
      }
      if (!definitions.has(dependency)) {
        throw validationError(
          manifest.id,
          `Module ${manifest.id} requires unavailable module: ${dependency}`,
          "module-dependency-missing"
        );
      }
    }

    for (const capability of manifest.provides.capabilities) {
      if (Object.hasOwn(hostCapabilities, capability)) {
        throw validationError(
          manifest.id,
          `Capability conflicts with host capability: ${capability}`,
          "capability-conflict"
        );
      }
      if (providers.has(capability)) {
        throw validationError(
          manifest.id,
          `Capability has multiple providers: ${capability}`,
          "capability-provider-duplicate"
        );
      }
      providers.set(capability, manifest.id);
    }

    for (const [kind, descriptors] of Object.entries(manifest.contributes)) {
      for (const descriptor of descriptors) {
        const key = `${kind}:${descriptor.id}`;
        if (contributionOwners.has(key)) {
          throw validationError(
            manifest.id,
            `Contribution has multiple owners: ${key}`,
            "contribution-owner-duplicate"
          );
        }
        contributionOwners.set(key, manifest.id);
      }
    }
  }

  for (const definition of definitions.values()) {
    const manifest = definition.manifest;
    const dependencies = transitiveDependencies(manifest.id, definitions);

    for (const capability of manifest.requires.capabilities) {
      if (Object.hasOwn(hostCapabilities, capability)) continue;
      const provider = providers.get(capability);
      if (!provider) {
        throw validationError(
          manifest.id,
          `Module ${manifest.id} requires unavailable capability: ${capability}`,
          "capability-missing"
        );
      }
      if (!dependencies.has(provider)) {
        throw validationError(
          manifest.id,
          `Module ${manifest.id} must require provider ${provider} ` +
            `for capability ${capability}`,
          "capability-provider-not-required"
        );
      }
    }
  }

  return topologicalOrder(definitions);
}

function topologicalOrder(definitions) {
  const order = [];
  const states = new Map();
  const path = [];

  const visit = id => {
    const state = states.get(id);
    if (state === "visited") return;
    if (state === "visiting") {
      const start = path.indexOf(id);
      const cycle = [...path.slice(start), id];
      throw validationError(
        id,
        `Module dependency cycle: ${cycle.join(" -> ")}`,
        "module-dependency-cycle"
      );
    }

    states.set(id, "visiting");
    path.push(id);
    const definition = definitions.get(id);
    for (const dependency of definition.manifest.requires.modules) {
      visit(dependency);
    }
    path.pop();
    states.set(id, "visited");
    order.push(definition);
  };

  for (const id of definitions.keys()) visit(id);
  return order;
}

function transitiveDependencies(moduleId, definitions) {
  const result = new Set();
  const pending = [
    ...definitions.get(moduleId).manifest.requires.modules
  ];

  while (pending.length) {
    const id = pending.pop();
    if (result.has(id)) continue;
    result.add(id);
    pending.push(...definitions.get(id).manifest.requires.modules);
  }
  return result;
}

function normalizeModuleInstance(instance, moduleId) {
  const source = plainRecord(instance, `${moduleId} instance`);
  assertKnownFields(source, new Set(["activate", "dispose"]), `${moduleId} instance`);
  if (typeof source.activate !== "function") {
    throw new TypeError(`${moduleId} instance.activate must be a function`);
  }
  if (typeof source.dispose !== "function") {
    throw new TypeError(`${moduleId} instance.dispose must be a function`);
  }
  return Object.freeze({
    activate: source.activate,
    dispose: source.dispose
  });
}

function normalizeActivationResult(input, manifest) {
  const source = input === undefined
    ? {}
    : plainRecord(input, `${manifest.id} activation result`);
  assertKnownFields(
    source,
    ACTIVATION_FIELDS,
    `${manifest.id} activation result`
  );

  const capabilities = normalizeCapabilityPayloads(
    source.capabilities ?? {},
    manifest
  );
  const contributions = normalizeContributionPayloads(
    source.contributions ?? {},
    manifest
  );
  const status = source.status === undefined
    ? null
    : deepFreeze(cloneSerializable(
      source.status,
      `${manifest.id} activation status`
    ));

  return Object.freeze({ capabilities, contributions, status });
}

function normalizeCapabilityPayloads(input, manifest) {
  const source = plainRecord(input, `${manifest.id} capabilities`);
  const declared = new Set(manifest.provides.capabilities);
  assertExactKeys(
    source,
    declared,
    `${manifest.id} provided capability`
  );
  return new Map(Object.entries(source));
}

function normalizeContributionPayloads(input, manifest) {
  const source = plainRecord(input, `${manifest.id} contributions`);
  const declaredKinds = new Set(Object.keys(manifest.contributes));
  assertExactKeys(
    source,
    declaredKinds,
    `${manifest.id} contribution kind`
  );
  const result = new Map();

  for (const [kind, descriptors] of Object.entries(manifest.contributes)) {
    const payloads = plainRecord(
      source[kind],
      `${manifest.id} contributions.${kind}`
    );
    const declaredIds = new Set(descriptors.map(item => item.id));
    assertExactKeys(
      payloads,
      declaredIds,
      `${manifest.id} ${kind} contribution`
    );
    for (const [id, value] of Object.entries(payloads)) {
      if (value === undefined) {
        throw validationError(
          manifest.id,
          `Contribution payload is undefined: ${kind}:${id}`,
          "contribution-payload-missing"
        );
      }
    }
    result.set(kind, new Map(Object.entries(payloads)));
  }
  return result;
}

function mergeContributionPayloads(target, payloads, manifest) {
  for (const [kind, values] of payloads) {
    const byId = target.get(kind) ?? new Map();
    const descriptors = new Map(
      manifest.contributes[kind].map(item => [item.id, item])
    );
    for (const [id, value] of values) {
      byId.set(id, Object.freeze({
        moduleId: manifest.id,
        descriptor: descriptors.get(id),
        value
      }));
    }
    target.set(kind, byId);
  }
}

async function disposeRecords(records) {
  const errors = [];
  for (const record of [...records].reverse()) {
    try {
      await record.instance.dispose();
    } catch (error) {
      errors.push(Object.freeze({
        moduleId: record.definition.manifest.id,
        error
      }));
    }
  }
  return errors;
}

function selectCapabilitiesFromMap(requested, available, moduleId) {
  const result = Object.create(null);

  for (const capability of requested) {
    if (!available.has(capability)) {
      throw new Error(
        `Module ${moduleId} requires unavailable capability: ${capability}`
      );
    }
    result[capability] = available.get(capability);
  }
  return Object.freeze(result);
}

function normalizeHostCapabilities(context) {
  const source = plainRecord(context, "module host capabilities");
  const result = Object.create(null);
  for (const [id, value] of Object.entries(source)) {
    const normalizedId = capabilityId(id, "host capability id");
    if (value === undefined) {
      throw new TypeError(`Host capability is undefined: ${normalizedId}`);
    }
    result[normalizedId] = value;
  }
  return Object.freeze(result);
}

function normalizedStringList(values, label, { normalize }) {
  if (!Array.isArray(values)) {
    throw new TypeError(`${label} must be an array`);
  }
  const result = [];
  const seen = new Set();
  for (const value of values) {
    const normalized = normalize(value);
    if (seen.has(normalized)) {
      throw new ModuleValidationError(
        `Duplicate value in ${label}: ${normalized}`,
        { code: "manifest-value-duplicate" }
      );
    }
    seen.add(normalized);
    result.push(normalized);
  }
  return Object.freeze(result);
}

function assertExactKeys(source, expected, label) {
  for (const key of Object.keys(source)) {
    if (!expected.has(key)) {
      throw new ModuleValidationError(
        `Undeclared ${label}: ${key}`,
        { code: "activation-reference-undeclared" }
      );
    }
  }
  for (const key of expected) {
    if (!Object.hasOwn(source, key)) {
      throw new ModuleValidationError(
        `Missing ${label}: ${key}`,
        { code: "activation-reference-missing" }
      );
    }
  }
}

function assertKnownFields(source, allowed, label) {
  const unknown = Object.keys(source).filter(key => !allowed.has(key));
  if (unknown.length) {
    throw new ModuleValidationError(
      `Unknown field in ${label}: ${unknown.join(", ")}`,
      { code: "manifest-field-unknown" }
    );
  }
}

function plainRecord(value, label) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    (Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null)
  ) {
    throw new TypeError(`${label} must be an object`);
  }
  return value;
}

function qualifiedId(value, label) {
  const normalized = nonEmptyString(value, label);
  if (!MODULE_ID_PATTERN.test(normalized)) {
    throw new ModuleValidationError(`Invalid ${label}: ${normalized}`, {
      code: "qualified-id-invalid"
    });
  }
  return normalized;
}

function capabilityId(value, label) {
  const normalized = nonEmptyString(value, label);
  if (!CAPABILITY_ID_PATTERN.test(normalized)) {
    throw new ModuleValidationError(`Invalid ${label}: ${normalized}`, {
      code: "capability-id-invalid"
    });
  }
  return normalized;
}

function contributionKind(value) {
  const normalized = nonEmptyString(value, "contribution kind");
  if (!CONTRIBUTION_KIND_PATTERN.test(normalized)) {
    throw new ModuleValidationError(
      `Invalid contribution kind: ${normalized}`,
      { code: "contribution-kind-invalid" }
    );
  }
  return normalized;
}

function cloneSerializable(value, label) {
  try {
    return structuredClone(value);
  } catch (error) {
    throw new ModuleValidationError(`${label} must be serializable`, {
      code: "manifest-not-serializable"
    });
  }
}

function validationError(moduleId, message, code) {
  return new ModuleValidationError(message, { moduleId, code });
}

function nonEmptyString(value, label) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new TypeError(`${label} is required`);
  return normalized;
}

function errorMessage(error) {
  return error?.message ?? String(error);
}

function deepFreeze(value, visited = new WeakSet()) {
  if (
    value === null ||
    (typeof value !== "object" && typeof value !== "function") ||
    visited.has(value)
  ) {
    return value;
  }
  visited.add(value);
  for (const child of Object.values(value)) deepFreeze(child, visited);
  return Object.freeze(value);
}
