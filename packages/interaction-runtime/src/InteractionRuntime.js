import {
  normalizeInteractionDocument,
  normalizeInteractionEventId,
  portableInteractionValue
} from "../../core/src/index.js";

export const INTERACTION_RUNTIME_VERSION = "interaction-runtime-v1";

export class InteractionRuntime {
  #sources = new Map();
  #bindings = new Map();
  #listeners = new Set();
  #activeBindings = new Set();
  #statistics = {
    emissions: 0,
    bindingVisits: 0,
    actionsExecuted: 0,
    cyclesPrevented: 0
  };

  constructor({ executeAction = async () => false } = {}) {
    if (typeof executeAction !== "function") {
      throw new TypeError(
        "InteractionRuntime exige executeAction(action, event, binding)."
      );
    }
    this.executeAction = executeAction;
  }

  configure({ bindings = [] } = {}) {
    this.#sources.clear();
    return this.configureSource("default", { bindings });
  }

  configureSource(source, { bindings = [] } = {}) {
    const sourceId = String(source ?? "").trim();
    if (!sourceId) throw new TypeError("Fonte de interações ausente.");
    if (!Array.isArray(bindings)) {
      throw new TypeError("bindings deve ser uma lista.");
    }
    const document = normalizeInteractionDocument(
      {
        bindings: bindings.map((binding, index) => binding?.id
          ? binding
          : { ...binding, id: `${sourceId}:${index + 1}` }
        )
      },
      { allowedActionTypes: null }
    );
    this.#sources.set(sourceId, document.bindings);
    this.#rebuild();
    return this.status();
  }

  removeSource(source) {
    const changed = this.#sources.delete(String(source));
    if (changed) this.#rebuild();
    return changed;
  }

  has(type) {
    return (this.#bindings.get(normalizeInteractionEventId(type)) ?? []).length > 0;
  }

  async emit(type, payload = {}) {
    const event = Object.freeze({
      type: normalizeInteractionEventId(type),
      objectId: payload?.objectId == null ? null : String(payload.objectId),
      payload: portableInteractionValue({ ...(payload ?? {}) }, "payload do evento")
    });
    const executions = [];
    this.#statistics.emissions += 1;
    for (const binding of this.#bindings.get(event.type) ?? []) {
      this.#statistics.bindingVisits += 1;
      if (!binding.enabled) continue;
      if (
        binding.objectId !== null &&
        event.objectId !== null &&
        binding.objectId !== event.objectId
      ) continue;
      if (this.#activeBindings.has(binding)) {
        this.#statistics.cyclesPrevented += 1;
        continue;
      }
      this.#activeBindings.add(binding);
      try {
        for (const action of binding.actions) {
          const resolved = resolveInteractionTemplates(action, { binding, event });
          executions.push(await this.executeAction(resolved, event, binding));
          this.#statistics.actionsExecuted += 1;
        }
      } finally {
        this.#activeBindings.delete(binding);
      }
    }
    for (const listener of this.#listeners) listener(event);
    return Object.freeze({
      event,
      executions: Object.freeze(executions)
    });
  }

  subscribe(listener) {
    if (typeof listener !== "function") {
      throw new TypeError("Listener de interação deve ser função.");
    }
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  bindings() {
    return Object.freeze([...this.#sources.entries()].flatMap(([source, bindings]) =>
      bindings.map(binding => Object.freeze({ source, ...binding }))
    ));
  }

  status() {
    return Object.freeze({
      version: INTERACTION_RUNTIME_VERSION,
      sources: Object.freeze([...this.#sources.keys()]),
      eventTypes: Object.freeze([...this.#bindings.keys()]),
      bindingCount: [...this.#bindings.values()].reduce(
        (count, list) => count + list.length,
        0
      ),
      ...this.#statistics
    });
  }

  #rebuild() {
    this.#bindings.clear();
    for (const bindings of this.#sources.values()) {
      for (const binding of bindings) {
        const bucket = this.#bindings.get(binding.event) ?? [];
        bucket.push(binding);
        this.#bindings.set(binding.event, bucket);
      }
    }
  }
}

function resolveInteractionTemplates(value, context) {
  if (typeof value === "string") {
    if (value === "$self") return context.binding.objectId;
    if (value === "$event.type") return context.event.type;
    if (value === "$event.objectId") return context.event.objectId;
    return value;
  }
  if (Array.isArray(value)) {
    return Object.freeze(value.map(entry =>
      resolveInteractionTemplates(entry, context)
    ));
  }
  if (!value || typeof value !== "object") return value;
  return Object.freeze(Object.fromEntries(Object.entries(value).map(
    ([key, entry]) => [key, resolveInteractionTemplates(entry, context)]
  )));
}
