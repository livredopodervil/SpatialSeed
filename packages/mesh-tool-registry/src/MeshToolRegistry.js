const TOOL_KINDS = Object.freeze(["selection", "topology"]);

export class MeshToolRegistry {
  #tools = new Map();
  #executors;

  constructor({ tools = DEFAULT_MESH_TOOLS, executors = {} } = {}) {
    this.#executors = Object.freeze({
      selection: executors.selection ?? null,
      topology: executors.topology ?? null
    });
    for (const tool of tools) this.register(tool);
  }

  register(tool) {
    const normalized = normalizeTool(tool);
    if (this.#tools.has(normalized.id)) {
      throw new Error(`Ferramenta de malha já registrada: ${normalized.id}.`);
    }
    this.#tools.set(normalized.id, normalized);
    return this;
  }

  describe(id) {
    const tool = this.#tools.get(String(id));
    if (!tool) throw new RangeError(`Ferramenta de malha desconhecida: ${id}.`);
    return tool;
  }

  list({ kind = null, mode = null, selectionCount = null } = {}) {
    const normalizedKind = kind === null ? null : normalizeKind(kind);
    const normalizedMode = mode === null ? null : String(mode);
    return Object.freeze([...this.#tools.values()]
      .filter(tool => !normalizedKind || tool.kind === normalizedKind)
      .map(tool => Object.freeze({
        ...tool,
        available: toolAvailable(tool, {
          mode: normalizedMode,
          selectionCount
        })
      })));
  }

  idForOperation(kind, operation) {
    const normalizedKind = normalizeKind(kind);
    const normalizedOperation = String(operation ?? "").trim().toLowerCase();
    const tool = [...this.#tools.values()].find(candidate =>
      candidate.kind === normalizedKind &&
      candidate.operation === normalizedOperation
    );
    if (!tool) {
      throw new RangeError(
        `Operação de malha não registrada: ${normalizedKind}/${operation}.`
      );
    }
    return tool.id;
  }

  execute(id, context = {}) {
    const tool = this.describe(id);
    const available = toolAvailable(tool, {
      mode: context.mode ?? context.componentMode ?? null,
      selectionCount: context.selectionCount ??
        Array.from(context.selectedIndices ?? []).length
    });
    if (!available.ok) {
      throw new Error(available.reason);
    }
    const executor = this.#executors[tool.kind];
    if (typeof executor !== "function") {
      throw new Error(`Executor ausente para ferramentas ${tool.kind}.`);
    }
    return Object.freeze({
      tool,
      result: executor({
        ...context,
        operation: tool.operation
      })
    });
  }
}

export function createDefaultMeshToolRegistry({
  topologyExecutor,
  selectionExecutor
} = {}) {
  return new MeshToolRegistry({
    executors: {
      topology: topologyExecutor,
      selection: selectionExecutor
    }
  });
}

export const DEFAULT_MESH_TOOLS = Object.freeze([
  selectionTool("all", "Selecionar tudo"),
  selectionTool("none", "Limpar seleção", { requiresSelection: false }),
  selectionTool("invert", "Inverter seleção", { requiresSelection: false }),
  selectionTool("grow", "Expandir seleção"),
  selectionTool("shrink", "Contrair seleção"),
  selectionTool("linked", "Selecionar componente conectado"),
  selectionTool("boundary", "Selecionar contorno", { requiresSelection: false }),
  selectionTool("by-normal", "Selecionar por normal", {
    modes: ["vertex", "edge", "face"],
    parameterSchema: {
      angleDegrees: { type: "number", default: 15, minimum: 0, maximum: 180 }
    }
  }),

  topologyTool("create-vertex", "Criar vértice", {
    modes: ["vertex"], requiresSelection: false
  }),
  topologyTool("create-edge", "Criar aresta", { modes: ["vertex"] }),
  topologyTool("create-face", "Criar face", { modes: ["vertex", "edge"] }),
  topologyTool("fill", "Preencher contorno", { modes: ["vertex", "edge"] }),
  topologyTool("duplicate", "Duplicar componentes"),
  topologyTool("delete", "Excluir componentes"),
  topologyTool("extrude", "Extrudar", {
    parameterSchema: {
      distance: { type: "number", default: 1 },
      vector: { type: "vec3", optional: true }
    }
  }),
  topologyTool("inset", "Inset", {
    modes: ["face"],
    parameterSchema: {
      amount: { type: "number", default: 0.2, minimumExclusive: 0, maximumExclusive: 1 }
    }
  }),
  topologyTool("subdivide", "Subdividir"),
  topologyTool("split", "Dividir arestas", {
    modes: ["edge"],
    parameterSchema: {
      parameter: { type: "number", default: 0.5, minimumExclusive: 0, maximumExclusive: 1 }
    }
  }),
  topologyTool("collapse", "Colapsar arestas", { modes: ["edge"] }),
  topologyTool("flip-edge", "Inverter diagonal", { modes: ["edge"] }),
  topologyTool("flip-normal", "Inverter normais", { modes: ["face"] }),
  topologyTool("bridge", "Criar ponte", { modes: ["edge"] }),
  topologyTool("cleanup", "Limpar malha", { requiresSelection: false }),
  topologyTool("weld", "Soldar vértices"),
  topologyTool("recalculate-normals", "Recalcular normais", {
    requiresSelection: false
  })
]);

function selectionTool(operation, label, options = {}) {
  return toolDefinition("selection", operation, label, {
    modes: ["vertex", "edge", "face"],
    requiresSelection: operation !== "all" && operation !== "none" &&
      operation !== "invert" && operation !== "boundary",
    ...options
  });
}

function topologyTool(operation, label, options = {}) {
  return toolDefinition("topology", operation, label, {
    modes: ["vertex", "edge", "face"],
    requiresSelection: true,
    implementation: "legacy-topology-v1",
    ...options
  });
}

function toolDefinition(kind, operation, label, options) {
  return Object.freeze({
    id: `mesh.${kind}.${operation}`,
    kind,
    operation,
    label,
    modes: Object.freeze([...(options.modes ?? [])]),
    requiresSelection: Boolean(options.requiresSelection),
    parameterSchema: Object.freeze(structuredClone(options.parameterSchema ?? {})),
    implementation: options.implementation ?? `${kind}-query-v1`
  });
}

function normalizeTool(tool = {}) {
  const kind = normalizeKind(tool.kind);
  const id = String(tool.id ?? "").trim();
  const operation = String(tool.operation ?? "").trim().toLowerCase();
  if (!id || !operation) {
    throw new TypeError("Ferramenta de malha exige id e operation.");
  }
  const modes = Array.from(tool.modes ?? ["vertex", "edge", "face"], String);
  return Object.freeze({
    id,
    kind,
    operation,
    label: String(tool.label ?? id),
    modes: Object.freeze(modes),
    requiresSelection: Boolean(tool.requiresSelection),
    parameterSchema: Object.freeze(structuredClone(tool.parameterSchema ?? {})),
    implementation: String(tool.implementation ?? "unspecified")
  });
}

function normalizeKind(value) {
  const kind = String(value ?? "").trim().toLowerCase();
  if (!TOOL_KINDS.includes(kind)) {
    throw new RangeError(`Tipo de ferramenta de malha desconhecido: ${value}.`);
  }
  return kind;
}

function toolAvailable(tool, { mode, selectionCount }) {
  if (mode && !tool.modes.includes(mode)) {
    return Object.freeze({
      ok: false,
      reason: `${tool.label} não está disponível no modo ${mode}.`
    });
  }
  if (tool.requiresSelection && Number(selectionCount ?? 0) < 1) {
    return Object.freeze({
      ok: false,
      reason: `${tool.label} exige componentes selecionados.`
    });
  }
  return Object.freeze({ ok: true, reason: null });
}
