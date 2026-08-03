export const TOOL_CAPABILITY_DESCRIPTOR_VERSION =
  "spatial-seed-tool-capability-v2";

const TOOL_KINDS = new Set(["mode", "continuous", "operation"]);
const TOOL_LIFECYCLES = new Set(["sticky", "continuous", "single-shot"]);
const TOOL_OPERATIONS = Object.freeze([
  "activate",
  "execute",
  "finish",
  "cancel",
  "parameters"
]);
const TOOL_INPUT_ROLES = new Set([
  "path",
  "profile",
  "selection",
  "boundary",
  "point"
]);

export class ToolCapabilityFacade {
  static apiVersion = "tool-capability-facade-v2";

  #adapters = new Map();
  #entries = new Map();
  #listeners = new Set();
  #unsubscribeAdapters = new Map();
  #contextProvider;
  #disposed = false;

  constructor({ adapters = [], context = () => ({ subjectLevel: "object" }) } = {}) {
    if (typeof context !== "function") {
      throw new TypeError("ToolCapabilityFacade exige provedor de contexto.");
    }
    this.#contextProvider = context;
    for (const adapter of adapters) this.registerAdapter(adapter);
  }

  registerAdapter(adapter) {
    this.#assertActive();
    const adapterId = normalizeId(adapter?.id, "adapter");
    if (this.#adapters.has(adapterId)) {
      throw new Error(`Adapter de ferramentas já registrado: ${adapterId}.`);
    }
    if (typeof adapter.list !== "function") {
      throw new TypeError(`Adapter ${adapterId} deve implementar list().`);
    }

    const sources = adapter.list();
    if (!Array.isArray(sources)) {
      throw new TypeError(`Adapter ${adapterId} deve listar um array.`);
    }
    const candidate = sources.map(source =>
      normalizeDescriptor(source, adapterId)
    );
    const localIds = new Set();
    for (const descriptor of candidate) {
      if (localIds.has(descriptor.id) || this.#entries.has(descriptor.id)) {
        throw new Error(`Ferramenta canônica duplicada: ${descriptor.id}.`);
      }
      localIds.add(descriptor.id);
      assertAdapterOperations(adapter, descriptor);
    }

    this.#adapters.set(adapterId, adapter);
    for (const descriptor of candidate) {
      this.#entries.set(descriptor.id, Object.freeze({
        adapter,
        descriptor
      }));
    }
    if (typeof adapter.subscribe === "function") {
      const unsubscribe = adapter.subscribe(() => this.#notify());
      if (typeof unsubscribe === "function") {
        this.#unsubscribeAdapters.set(adapterId, unsubscribe);
      }
    }
    this.#notify();
    return this;
  }

  list({
    context = null,
    family = null,
    kind = null,
    includeUnavailable = true
  } = {}) {
    this.#assertActive();
    const resolvedContext = this.#resolveContext(context);
    const normalizedFamily = family === null ? null : String(family);
    const normalizedKind = kind === null ? null : String(kind);
    return deepFreeze([...this.#entries.values()]
      .map(entry => ({
        ...structuredClone(entry.descriptor),
        state: this.#state(entry, resolvedContext)
      }))
      .filter(item =>
        (normalizedFamily === null || item.family === normalizedFamily) &&
        (normalizedKind === null || item.kind === normalizedKind) &&
        (includeUnavailable || item.state.available)
      ));
  }

  describe(toolId) {
    this.#assertActive();
    return deepFreeze(structuredClone(this.#entry(toolId).descriptor));
  }

  status({ toolId = null, context = null } = {}) {
    this.#assertActive();
    const resolvedContext = this.#resolveContext(context);
    if (toolId !== null && toolId !== undefined) {
      const entry = this.#entry(toolId);
      return deepFreeze({
        apiVersion: ToolCapabilityFacade.apiVersion,
        context: resolvedContext,
        descriptor: structuredClone(entry.descriptor),
        state: this.#state(entry, resolvedContext)
      });
    }
    const tools = [...this.#entries.values()].map(entry => Object.freeze({
      id: entry.descriptor.id,
      ...this.#state(entry, resolvedContext)
    }));
    return deepFreeze({
      apiVersion: ToolCapabilityFacade.apiVersion,
      descriptorVersion: TOOL_CAPABILITY_DESCRIPTOR_VERSION,
      context: resolvedContext,
      adapters: Object.freeze([...this.#adapters.keys()]),
      activeToolIds: Object.freeze(
        tools.filter(tool => tool.active).map(tool => tool.id)
      ),
      tools: Object.freeze(tools)
    });
  }

  isAvailable(toolId, context = null) {
    const entry = this.#entry(toolId);
    return this.#state(entry, this.#resolveContext(context)).available;
  }

  activate(toolId, options = {}, context = null) {
    return this.#invoke("activate", toolId, options, context);
  }

  execute(toolId, input = {}, context = null) {
    return this.#invoke("execute", toolId, input, context);
  }

  finish(toolId, options = {}, context = null) {
    return this.#invoke("finish", toolId, options, context, {
      requireAvailable: false
    });
  }

  cancel(toolId, options = {}, context = null) {
    return this.#invoke("cancel", toolId, options, context, {
      requireAvailable: false
    });
  }

  getParameters(toolId) {
    this.#assertActive();
    const entry = this.#entry(toolId);
    if (!entry.descriptor.operations.parameters) return Object.freeze({});
    const values = entry.adapter.getParameters(entry.descriptor.id, {
      descriptor: entry.descriptor
    });
    return deepFreeze(structuredClone(values ?? {}));
  }

  setParameters(toolId, patch = {}) {
    this.#assertActive();
    const entry = this.#entry(toolId);
    if (!entry.descriptor.operations.parameters) {
      throw new Error(
        `Ferramenta ${entry.descriptor.id} não possui parâmetros.`
      );
    }
    const values = entry.adapter.setParameters(
      entry.descriptor.id,
      structuredClone(patch ?? {}),
      { descriptor: entry.descriptor }
    );
    return deepFreeze({
      toolId: entry.descriptor.id,
      values: structuredClone(values ?? {})
    });
  }

  resetParameters(toolId) {
    this.#assertActive();
    const entry = this.#entry(toolId);
    if (!entry.descriptor.operations.parameters ||
        typeof entry.adapter.resetParameters !== "function") {
      throw new Error(
        `Ferramenta ${entry.descriptor.id} não permite restaurar parâmetros.`
      );
    }
    const values = entry.adapter.resetParameters(
      entry.descriptor.id,
      { descriptor: entry.descriptor }
    );
    return deepFreeze({
      toolId: entry.descriptor.id,
      values: structuredClone(values ?? {})
    });
  }

  capabilities() {
    this.#assertActive();
    return deepFreeze({
      apiVersion: ToolCapabilityFacade.apiVersion,
      descriptorVersion: TOOL_CAPABILITY_DESCRIPTOR_VERSION,
      adapters: [...this.#adapters.keys()],
      tools: [...this.#entries.keys()],
      commands: {
        activate: "authoring.tool.activate",
        execute: "authoring.tool.execute",
        finish: "authoring.tool.finish",
        cancel: "authoring.tool.cancel",
        setParameters: "authoring.tool.parameters.set",
        resetParameters: "authoring.tool.parameters.reset"
      },
      queries: {
        list: "authoring.tools.list",
        describe: "authoring.tool.describe",
        status: "authoring.tool.status",
        getParameters: "authoring.tool.parameters.get"
      }
    });
  }

  subscribe(listener) {
    this.#assertActive();
    if (typeof listener !== "function") {
      throw new TypeError("Listener de ferramentas canônicas deve ser função.");
    }
    this.#listeners.add(listener);
    listener(this.status());
    return () => this.#listeners.delete(listener);
  }

  dispose() {
    if (this.#disposed) return false;
    this.#disposed = true;
    for (const unsubscribe of [...this.#unsubscribeAdapters.values()].reverse()) {
      unsubscribe();
    }
    this.#unsubscribeAdapters.clear();
    this.#listeners.clear();
    this.#entries.clear();
    this.#adapters.clear();
    return true;
  }

  #invoke(operation, toolId, input, context, {
    requireAvailable = true
  } = {}) {
    this.#assertActive();
    const entry = this.#entry(toolId);
    const descriptor = entry.descriptor;
    if (!descriptor.operations[operation]) {
      throw new Error(
        `Ferramenta ${descriptor.id} não suporta ${operation}.`
      );
    }
    const resolvedContext = this.#resolveContext(context);
    const state = this.#state(entry, resolvedContext);
    const explicitlyBoundExecution = operation === "execute" &&
      Array.isArray(input?.points) &&
      descriptor.inputs.some(item => item.sources.includes("points"));
    if (requireAvailable && !state.available && !explicitlyBoundExecution) {
      throw new Error(
        `Ferramenta ${descriptor.id} indisponível: ${
          state.reason ?? "contexto incompatível"
        }.`
      );
    }
    const result = entry.adapter[operation](
      descriptor.id,
      structuredClone(input ?? {}),
      { context: resolvedContext, descriptor }
    );
    if (result && typeof result.then === "function") {
      return result.then(value => invocationResult(
        descriptor,
        operation,
        value
      ));
    }
    return invocationResult(descriptor, operation, result);
  }

  #entry(toolId) {
    const id = normalizeId(toolId, "ferramenta");
    const entry = this.#entries.get(id);
    if (!entry) throw new Error(`Ferramenta canônica desconhecida: ${id}.`);
    return entry;
  }

  #state(entry, context) {
    const subjectLevel = String(context.subjectLevel ?? "object");
    const contextAllowed = entry.descriptor.contexts.includes("*") ||
      entry.descriptor.contexts.includes(subjectLevel);
    const adapterState = typeof entry.adapter.status === "function"
      ? entry.adapter.status(entry.descriptor.id, {
          context,
          descriptor: entry.descriptor
        }) ?? {}
      : {};
    const available = contextAllowed && adapterState.available !== false;
    return Object.freeze({
      active: Boolean(adapterState.active),
      available,
      reason: available
        ? null
        : String(
            adapterState.reason ??
            (contextAllowed
              ? "indisponível pela implementação atual"
              : `contexto ${subjectLevel} não suportado`)
          )
    });
  }

  #resolveContext(context) {
    const source = context ?? this.#contextProvider() ?? {};
    if (!source || typeof source !== "object" || Array.isArray(source)) {
      throw new TypeError("Contexto de ferramenta inválido.");
    }
    return deepFreeze({
      ...structuredClone(source),
      subjectLevel: String(source.subjectLevel ?? "object")
    });
  }

  #notify() {
    if (!this.#listeners.size || this.#disposed) return;
    const snapshot = this.status();
    for (const listener of [...this.#listeners]) {
      try {
        listener(snapshot);
      } catch (error) {
        console.error("ToolCapabilityFacade subscriber failed", error);
      }
    }
  }

  #assertActive() {
    if (this.#disposed) {
      throw new Error("ToolCapabilityFacade foi descartada.");
    }
  }
}

function normalizeDescriptor(source, adapterId) {
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    throw new TypeError(`Descritor inválido no adapter ${adapterId}.`);
  }
  const id = normalizeId(source.id, "ferramenta");
  const kind = String(source.kind ?? "operation");
  if (!TOOL_KINDS.has(kind)) {
    throw new TypeError(`Tipo canônico inválido em ${id}: ${kind}.`);
  }
  const lifecycle = String(source.lifecycle ?? (
    kind === "mode" ? "sticky" :
      kind === "continuous" ? "continuous" : "single-shot"
  ));
  if (!TOOL_LIFECYCLES.has(lifecycle)) {
    throw new TypeError(`Lifecycle canônico inválido em ${id}: ${lifecycle}.`);
  }
  const contexts = [...new Set((source.contexts ?? ["object"])
    .map(value => String(value ?? "").trim())
    .filter(Boolean))];
  if (!contexts.length) {
    throw new TypeError(`Ferramenta ${id} deve declarar contextos.`);
  }
  const operations = Object.freeze(Object.fromEntries(
    TOOL_OPERATIONS.map(operation => [
      operation,
      Boolean(source.operations?.[operation])
    ])
  ));
  if (!operations.activate && !operations.execute) {
    throw new TypeError(
      `Ferramenta ${id} deve suportar activate ou execute.`
    );
  }
  const presentation = source.presentation ?? {};
  const capabilities = source.capabilities ?? {};
  const inputs = Object.freeze((source.inputs ?? []).map((input, index) =>
    normalizeToolInput(input, id, index)
  ));
  if (new Set(inputs.map(input => input.id)).size !== inputs.length) {
    throw new TypeError(`Entrada canônica duplicada na ferramenta ${id}.`);
  }
  const nativeId = String(source.source?.nativeId ?? id);
  const descriptor = {
    descriptorVersion: TOOL_CAPABILITY_DESCRIPTOR_VERSION,
    id,
    label: String(source.label ?? presentation.label ?? id),
    description: source.description === undefined
      ? null
      : String(source.description),
    family: String(source.family ?? "general"),
    kind,
    lifecycle,
    contexts: Object.freeze(contexts),
    inputs,
    parameters: deepFreeze(structuredClone(source.parameters ?? [])),
    presentation: Object.freeze({
      label: String(presentation.label ?? source.label ?? id),
      icon: String(presentation.icon ?? "?"),
      group: String(presentation.group ?? source.family ?? "general"),
      order: finiteOr(presentation.order, 0)
    }),
    operations,
    capabilities: Object.freeze({
      preview: Boolean(capabilities.preview),
      undo: Boolean(capabilities.undo),
      repeat: Boolean(capabilities.repeat),
      procedural: Boolean(capabilities.procedural),
      agent: capabilities.agent !== false,
      pointer: Boolean(capabilities.pointer)
    }),
    source: Object.freeze({
      adapterId,
      nativeId,
      temporary: source.source?.temporary !== false,
      preset: source.source?.preset === undefined
        ? null
        : deepFreeze(structuredClone(source.source.preset))
    }),
    actions: Object.freeze({
      activate: operations.activate ? "authoring.tool.activate" : null,
      execute: operations.execute ? "authoring.tool.execute" : null,
      finish: operations.finish ? "authoring.tool.finish" : null,
      cancel: operations.cancel ? "authoring.tool.cancel" : null,
      getParameters: operations.parameters
        ? "authoring.tool.parameters.get"
        : null,
      setParameters: operations.parameters
        ? "authoring.tool.parameters.set"
        : null,
      resetParameters: operations.parameters
        ? "authoring.tool.parameters.reset"
        : null
    })
  };
  structuredClone(descriptor);
  return deepFreeze(descriptor);
}

function normalizeToolInput(source, toolId, index) {
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    throw new TypeError(
      `Entrada ${index + 1} inválida na ferramenta ${toolId}.`
    );
  }
  const id = normalizeId(source.id, "entrada");
  const role = String(source.role ?? "").trim().toLowerCase();
  if (!TOOL_INPUT_ROLES.has(role)) {
    throw new TypeError(
      `Papel de entrada inválido em ${toolId}.${id}: ${role}.`
    );
  }
  const sources = [...new Set((source.sources ?? [])
    .map(value => String(value ?? "").trim().toLowerCase())
    .filter(Boolean))];
  if (!sources.length) {
    throw new TypeError(
      `Entrada ${toolId}.${id} deve declarar ao menos uma fonte.`
    );
  }
  return Object.freeze({
    id,
    role,
    label: String(source.label ?? id),
    required: source.required !== false,
    sources: Object.freeze(sources)
  });
}

function assertAdapterOperations(adapter, descriptor) {
  for (const operation of TOOL_OPERATIONS) {
    if (!descriptor.operations[operation]) continue;
    const method = operation === "parameters" ? "getParameters" : operation;
    if (typeof adapter[method] !== "function") {
      throw new TypeError(
        `Adapter ${adapter.id} não implementa ${method} para ${descriptor.id}.`
      );
    }
    if (operation === "parameters" &&
        (typeof adapter.setParameters !== "function" ||
         typeof adapter.resetParameters !== "function")) {
      throw new TypeError(
        `Adapter ${adapter.id} não implementa set/resetParameters para ${descriptor.id}.`
      );
    }
  }
}

function invocationResult(descriptor, operation, result) {
  return Object.freeze({
    toolId: descriptor.id,
    operation,
    adapterId: descriptor.source.adapterId,
    result
  });
}

function normalizeId(value, label) {
  const id = String(value ?? "").trim();
  if (!id) throw new TypeError(`Identificador de ${label} ausente.`);
  if (!/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(id)) {
    throw new TypeError(`Identificador de ${label} inválido: ${id}.`);
  }
  return id;
}

function finiteOr(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  for (const item of Object.values(value)) deepFreeze(item);
  return Object.freeze(value);
}
