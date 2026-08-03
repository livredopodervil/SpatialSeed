export class ToolWorkspaceController {
  static apiVersion = "tool-workspace-controller-v1";

  #facade;
  #selection;
  #references;
  #focusedToolId = null;
  #bindings = new Map();
  #listeners = new Set();
  #disposed = false;

  constructor({
    facade,
    selection = () => ({ members: [], activeMember: null }),
    references = () => []
  } = {}) {
    if (!facade?.describe || !facade?.execute) {
      throw new TypeError("Workspace de ferramentas exige fachada canônica.");
    }
    if (typeof selection !== "function" || typeof references !== "function") {
      throw new TypeError(
        "Workspace de ferramentas exige provedores de seleção e referências."
      );
    }
    this.#facade = facade;
    this.#selection = selection;
    this.#references = references;
  }

  focus(toolId) {
    this.#assertActive();
    const id = normalizeId(toolId, "ferramenta");
    this.#facade.describe(id);
    if (this.#focusedToolId === id) return this.status();
    this.#focusedToolId = id;
    this.#notify();
    return this.status();
  }

  clearFocus() {
    this.#assertActive();
    if (this.#focusedToolId === null) return this.status();
    this.#focusedToolId = null;
    this.#notify();
    return this.status();
  }

  bind({ toolId = null, inputId, binding } = {}) {
    this.#assertActive();
    const descriptor = this.#descriptor(toolId);
    const input = descriptor.inputs.find(item => item.id === String(inputId));
    if (!input) {
      throw new Error(
        `Entrada desconhecida em ${descriptor.id}: ${String(inputId)}.`
      );
    }
    const normalized = normalizeBinding(binding);
    const reference = this.#referenceById(normalized.objectId);
    if (!reference) {
      throw new Error(`Objeto de referência inexistente: ${normalized.objectId}.`);
    }
    if (!referenceSupportsRole(reference, input.role)) {
      throw new Error(
        `${reference.name ?? reference.id} não pode fornecer ${input.label}.`
      );
    }
    const extraction = normalized.extraction === "auto"
      ? "auto"
      : normalized.extraction;
    const allowed = extractionsForRole(reference, input.role);
    if (extraction !== "auto" && !allowed.includes(extraction)) {
      throw new Error(
        `Extração ${extraction} não é válida para ${input.label}.`
      );
    }
    const bindings = this.#bindings.get(descriptor.id) ?? new Map();
    bindings.set(input.id, Object.freeze({
      ...normalized,
      objectName: reference.name ?? reference.id,
      extraction
    }));
    this.#bindings.set(descriptor.id, bindings);
    this.#focusedToolId = descriptor.id;
    this.#notify();
    return this.status({ toolId: descriptor.id });
  }

  useSelection({ toolId = null, inputId } = {}) {
    this.#assertActive();
    const descriptor = this.#descriptor(toolId);
    const input = descriptor.inputs.find(item => item.id === String(inputId));
    if (!input) {
      throw new Error(
        `Entrada desconhecida em ${descriptor.id}: ${String(inputId)}.`
      );
    }
    const used = new Set(
      [...(this.#bindings.get(descriptor.id)?.entries() ?? [])]
        .filter(([id]) => id !== input.id)
        .map(([, binding]) => binding.objectId)
    );
    const candidate = this.#selectedCandidates(input.role, used)[0];
    if (!candidate) {
      throw new Error(
        `A seleção atual não fornece ${input.label.toLowerCase()}.`
      );
    }
    return this.bind({
      toolId: descriptor.id,
      inputId: input.id,
      binding: {
        source: "selection",
        objectId: candidate.id,
        extraction: "auto"
      }
    });
  }

  clearInput({ toolId = null, inputId } = {}) {
    this.#assertActive();
    const descriptor = this.#descriptor(toolId);
    const bindings = this.#bindings.get(descriptor.id);
    if (!bindings?.delete(String(inputId))) {
      return this.status({ toolId: descriptor.id });
    }
    if (!bindings.size) this.#bindings.delete(descriptor.id);
    this.#notify();
    return this.status({ toolId: descriptor.id });
  }

  clear() {
    this.#assertActive();
    const changed = this.#focusedToolId !== null || this.#bindings.size > 0;
    this.#focusedToolId = null;
    this.#bindings.clear();
    if (changed) this.#notify();
    return this.status();
  }

  resolve(toolId, invocation = {}) {
    this.#assertActive();
    const descriptor = this.#descriptor(toolId);
    const result = normalizeInvocation(invocation);
    const used = new Set([
      ...descriptor.inputs.flatMap(input => {
        const objectId = String(result[input.id]?.objectId ?? "").trim();
        return objectId ? [objectId] : [];
      }),
      ...[...(this.#bindings.get(descriptor.id)?.entries() ?? [])]
        .flatMap(([inputId, binding]) =>
          result[inputId] === undefined || result[inputId] === null
            ? [binding.objectId]
            : []
        )
    ]);
    for (const input of descriptor.inputs) {
      if (result[input.id] !== undefined && result[input.id] !== null) {
        const objectId = String(result[input.id]?.objectId ?? "").trim();
        if (objectId) used.add(objectId);
        continue;
      }
      if (inputSatisfiedByGesture(input)) continue;
      if (input.role === "selection") {
        if (selectionIds(this.#selection()).length || !input.required) continue;
        throw new Error(`${descriptor.label} exige ${input.label.toLowerCase()}.`);
      }
      const binding = this.#bindingFor(descriptor.id, input, used);
      if (!binding) {
        if (!input.required) continue;
        throw new Error(`${descriptor.label} exige ${input.label.toLowerCase()}.`);
      }
      used.add(binding.objectId);
      result[input.id] = {
        source: "object",
        objectId: binding.objectId,
        extraction: binding.extraction
      };
    }
    return Object.freeze(result);
  }

  status({ toolId = null } = {}) {
    this.#assertActive();
    const id = toolId === null || toolId === undefined
      ? this.#focusedToolId
      : normalizeId(toolId, "ferramenta");
    if (!id) {
      return Object.freeze({
        apiVersion: ToolWorkspaceController.apiVersion,
        focusedToolId: null,
        tool: null,
        inputs: Object.freeze([]),
        ready: false,
        reason: "Nenhuma ferramenta em foco."
      });
    }
    const descriptor = this.#facade.describe(id);
    const used = new Set(
      [...(this.#bindings.get(id)?.values() ?? [])]
        .map(binding => binding.objectId)
    );
    const inputs = descriptor.inputs.map(input => {
      if (inputSatisfiedByGesture(input)) {
        return Object.freeze({
          ...structuredClone(input),
          resolved: true,
          binding: Object.freeze({ source: "gesture" }),
          compatibleReferences: Object.freeze([])
        });
      }
      if (input.role === "selection") {
        const count = selectionIds(this.#selection()).length;
        return Object.freeze({
          ...structuredClone(input),
          resolved: count > 0 || !input.required,
          binding: count ? Object.freeze({ source: "selection", count }) : null,
          compatibleReferences: Object.freeze([])
        });
      }
      const candidates = this.#compatibleReferences(input.role);
      const binding = this.#bindingFor(id, input, used);
      if (binding) used.add(binding.objectId);
      return Object.freeze({
        ...structuredClone(input),
        resolved: Boolean(binding) || !input.required,
        binding: binding ? Object.freeze({ ...binding }) : null,
        compatibleReferences: Object.freeze(candidates.map(reference =>
          Object.freeze({
            id: reference.id,
            name: reference.name,
            selected: Boolean(reference.selected),
            extractions: Object.freeze(extractionsForRole(reference, input.role))
          })
        ))
      });
    });
    const missing = inputs.filter(input => !input.resolved);
    return deepFreeze({
      apiVersion: ToolWorkspaceController.apiVersion,
      focusedToolId: this.#focusedToolId,
      tool: {
        id: descriptor.id,
        label: descriptor.label,
        kind: descriptor.kind,
        operations: descriptor.operations
      },
      inputs,
      ready: missing.length === 0,
      reason: missing.length
        ? `Falta ${missing.map(input => input.label.toLowerCase()).join(" e ")}.`
        : null
    });
  }

  subscribe(listener) {
    this.#assertActive();
    if (typeof listener !== "function") {
      throw new TypeError("Observador do workspace deve ser função.");
    }
    this.#listeners.add(listener);
    listener(this.status());
    return () => this.#listeners.delete(listener);
  }

  dispose() {
    if (this.#disposed) return false;
    this.#disposed = true;
    this.#listeners.clear();
    this.#bindings.clear();
    return true;
  }

  #descriptor(toolId) {
    const id = toolId === null || toolId === undefined
      ? this.#focusedToolId
      : normalizeId(toolId, "ferramenta");
    if (!id) throw new Error("Nenhuma ferramenta está em foco.");
    return this.#facade.describe(id);
  }

  #bindingFor(toolId, input, used) {
    const explicit = this.#bindings.get(toolId)?.get(input.id);
    const reference = explicit
      ? this.#referenceById(explicit.objectId)
      : null;
    if (
      explicit &&
      reference &&
      referenceSupportsRole(reference, input.role) &&
      (
        explicit.extraction === "auto" ||
        extractionsForRole(reference, input.role).includes(explicit.extraction)
      )
    ) {
      return Object.freeze({
        ...explicit,
        objectName: reference.name ?? reference.id
      });
    }
    const candidate = this.#selectedCandidates(input.role, used)[0];
    return candidate
      ? Object.freeze({
          source: "selection",
          objectId: candidate.id,
          objectName: candidate.name ?? candidate.id,
          extraction: "auto"
        })
      : null;
  }

  #selectedCandidates(role, used = new Set()) {
    const compatible = new Map(
      this.#compatibleReferences(role).map(reference => [String(reference.id), reference])
    );
    return selectionIds(this.#selection())
      .filter(id => !used.has(id))
      .map(id => compatible.get(id))
      .filter(Boolean);
  }

  #compatibleReferences(role) {
    const references = this.#references() ?? [];
    return references.filter(reference => referenceSupportsRole(reference, role));
  }

  #referenceById(objectId) {
    const id = String(objectId ?? "");
    return (this.#references() ?? []).find(reference => String(reference.id) === id) ?? null;
  }

  #notify() {
    if (this.#disposed) return;
    const snapshot = this.status();
    for (const listener of [...this.#listeners]) listener(snapshot);
  }

  #assertActive() {
    if (this.#disposed) throw new Error("Workspace de ferramentas descartado.");
  }
}

function inputSatisfiedByGesture(input) {
  const sources = new Set(input.sources ?? []);
  return sources.has("draw") || sources.has("points") ||
    sources.has("mesh-selection") || sources.has("catalog");
}

function referenceSupportsRole(reference, role) {
  if (role === "path") return (reference.pathExtractions?.length ?? 0) > 0;
  if (role === "profile" || role === "boundary") {
    return (reference.profileExtractions?.length ?? 0) > 0;
  }
  if (role === "point") return Boolean(reference.id);
  return false;
}

function extractionsForRole(reference, role) {
  if (role === "path") return [...(reference.pathExtractions ?? [])];
  if (role === "profile" || role === "boundary") {
    return [...(reference.profileExtractions ?? [])];
  }
  if (role === "point") return ["auto", "pivot", "origin"];
  return [];
}

function selectionIds(selection = {}) {
  const members = Array.isArray(selection.members) ? selection.members : [];
  const active = String(selection.activeMember?.objectId ?? "").trim();
  return [...new Set([
    ...(active ? [active] : []),
    ...members.map(member => String(member?.objectId ?? "").trim()).filter(Boolean)
  ])];
}

function normalizeBinding(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Vínculo de entrada inválido.");
  }
  return Object.freeze({
    source: String(value.source ?? "reference").trim().toLowerCase(),
    objectId: normalizeId(value.objectId, "objeto de referência"),
    extraction: String(value.extraction ?? "auto").trim().toLowerCase()
  });
}

function normalizeInvocation(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Argumentos da ferramenta devem formar um objeto.");
  }
  return structuredClone(value);
}

function normalizeId(value, label) {
  const id = String(value ?? "").trim();
  if (!id) throw new TypeError(`${label} exige id.`);
  return id;
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  for (const item of Object.values(value)) deepFreeze(item);
  return Object.freeze(value);
}
