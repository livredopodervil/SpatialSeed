const PATH_SKETCH_PRESETS = Object.freeze([
  Object.freeze({
    id: "draw.tube",
    label: "Desenhar tubo",
    description: "Captura um caminho livre e cria um tubo contínuo.",
    family: "draw",
    preset: Object.freeze({ mode: "tube" }),
    presentation: Object.freeze({
      label: "Desenhar tubo",
      icon: "〰",
      group: "draw",
      order: 10
    })
  }),
  Object.freeze({
    id: "draw.array",
    label: "Distribuir ao desenhar",
    description:
      "Captura um caminho livre e distribui a seleção ou uma geometria.",
    family: "draw",
    preset: Object.freeze({ mode: "array" }),
    presentation: Object.freeze({
      label: "Distribuir ao desenhar",
      icon: "⋯",
      group: "draw",
      order: 20
    })
  })
]);

const PRESENTATION = Object.freeze({
  "planar.sketch": Object.freeze({ icon: "✎", group: "draw", order: 30 }),
  "path.tube": Object.freeze({ icon: "⌇", group: "path", order: 40 }),
  "path.sweep": Object.freeze({ icon: "⇝", group: "path", order: 50 }),
  "path.array": Object.freeze({ icon: "⋯", group: "path", order: 60 }),
  "path.from-selection": Object.freeze({ icon: "⌁", group: "path", order: 70 }),
  "mesh.extrude": Object.freeze({ icon: "⇧", group: "mesh", order: 80 }),
  "mesh.inset": Object.freeze({ icon: "▣", group: "mesh", order: 90 }),
  "mesh.split": Object.freeze({ icon: "÷", group: "mesh", order: 100 })
});

const CONTEXTS = Object.freeze({
  "path.sketch": Object.freeze(["object"]),
  "planar.sketch": Object.freeze(["object"]),
  "path.tube": Object.freeze(["object"]),
  "path.sweep": Object.freeze(["object"]),
  "path.array": Object.freeze(["object"]),
  "path.from-selection": Object.freeze(["vertex", "edge", "face"]),
  "mesh.extrude": Object.freeze(["vertex", "edge", "face"]),
  "mesh.inset": Object.freeze(["face"]),
  "mesh.split": Object.freeze(["edge"])
});

const FINISH_COMMANDS = Object.freeze({
  "planar.sketch": "planar.sketch.finish"
});

const CANCEL_COMMANDS = Object.freeze({
  "path.sketch": "path.sketch.cancel",
  "planar.sketch": "planar.sketch.cancel"
});

export class EditToolRegistryAdapter {
  static apiVersion = "edit-tool-registry-adapter-v1";

  id = "edit-tool-registry";
  #entries = new Map();
  #definitions;

  constructor({ registry, parameters, lifecycle, execute }) {
    if (!registry?.describe || !registry?.definition) {
      throw new TypeError("EditToolRegistryAdapter exige EditToolRegistry.");
    }
    if (!parameters?.values || !parameters?.subscribe) {
      throw new TypeError("EditToolRegistryAdapter exige ToolParameterStore.");
    }
    if (!lifecycle?.status || !lifecycle?.subscribe) {
      throw new TypeError("EditToolRegistryAdapter exige ToolLifecycleController.");
    }
    if (typeof execute !== "function") {
      throw new TypeError("EditToolRegistryAdapter exige executor de comandos.");
    }
    this.registry = registry;
    this.parameters = parameters;
    this.lifecycle = lifecycle;
    this.executeCommand = execute;

    const definitions = [];
    for (const legacy of registry.describe()) {
      if (legacy.id === "path.sketch") {
        for (const preset of PATH_SKETCH_PRESETS) {
          const descriptor = presetDescriptor(legacy, preset);
          this.#entries.set(descriptor.id, Object.freeze({
            descriptor,
            native: legacy,
            preset: preset.preset
          }));
          definitions.push(descriptor);
        }
        continue;
      }
      const descriptor = legacyDescriptor(legacy);
      this.#entries.set(descriptor.id, Object.freeze({
        descriptor,
        native: legacy,
        preset: null
      }));
      definitions.push(descriptor);
    }
    this.#definitions = Object.freeze(definitions);
  }

  list() {
    return this.#definitions;
  }

  status(toolId) {
    const entry = this.#entry(toolId);
    const lifecycle = this.lifecycle.status();
    let active = lifecycle.activeAction === entry.native.id;
    if (active && entry.preset) {
      active = presetMatches(
        this.parameters.values(entry.native.id),
        entry.preset
      );
    }
    return Object.freeze({ active, available: true });
  }

  activate(toolId, input = {}) {
    const entry = this.#entry(toolId);
    if (entry.descriptor.kind !== "continuous") {
      throw new Error(
        `Ferramenta ${entry.descriptor.id} é uma operação imediata.`
      );
    }
    const current = this.status(entry.descriptor.id);
    const nativeActive = this.lifecycle.status().activeAction === entry.native.id;

    if (current.active) {
      if (Object.keys(input ?? {}).length) {
        this.executeCommand("edit.tool.parameters.set", {
          toolId: entry.native.id,
          patch: {
            ...structuredClone(input),
            ...(entry.preset ?? {})
          }
        });
      }
      return Object.freeze({
        active: true,
        alreadyActive: true,
        parametersUpdated: Object.keys(input ?? {}).length > 0,
        toolId: entry.descriptor.id
      });
    }
    if (nativeActive && !current.active) {
      const cancelCommand = CANCEL_COMMANDS[entry.native.id];
      if (cancelCommand) this.executeCommand(cancelCommand, {});
    }
    return this.executeCommand(
      entry.native.command,
      Object.freeze({
        ...structuredClone(input ?? {}),
        ...(entry.preset ?? {})
      })
    );
  }

  execute(toolId, input = {}) {
    const entry = this.#entry(toolId);
    if (entry.descriptor.kind === "continuous") {
      return this.activate(toolId, input);
    }
    return this.executeCommand(
      entry.native.command,
      operationArguments(entry, input)
    );
  }

  finish(toolId) {
    const entry = this.#entry(toolId);
    if (!this.status(toolId).active) {
      return Object.freeze({
        active: false,
        changed: false,
        reason: "tool-not-active"
      });
    }
    const command = FINISH_COMMANDS[entry.native.id];
    if (!command) {
      throw new Error(`Ferramenta ${toolId} não possui finalização explícita.`);
    }
    return this.executeCommand(command, {});
  }

  cancel(toolId) {
    const entry = this.#entry(toolId);
    if (!this.status(toolId).active) {
      return Object.freeze({
        active: false,
        changed: false,
        reason: "tool-not-active"
      });
    }
    const command = CANCEL_COMMANDS[entry.native.id];
    if (!command) {
      throw new Error(`Ferramenta ${toolId} não possui cancelamento explícito.`);
    }
    return this.executeCommand(command, {});
  }

  getParameters(toolId) {
    const entry = this.#entry(toolId);
    return publicParameterValues(
      entry.descriptor,
      this.parameters.values(entry.native.id)
    );
  }

  setParameters(toolId, patch = {}) {
    const entry = this.#entry(toolId);
    const source = normalizePatch(patch);
    const known = new Set(
      entry.descriptor.parameters.map(parameter => parameter.id)
    );
    const unknown = Object.keys(source).filter(id => !known.has(id));
    if (unknown.length) {
      throw new Error(
        `Parâmetro desconhecido em ${toolId}: ${unknown.join(", ")}.`
      );
    }
    this.executeCommand("edit.tool.parameters.set", {
      toolId: entry.native.id,
      patch: source
    });
    return this.getParameters(toolId);
  }

  subscribe(listener) {
    const unsubscribers = [
      this.lifecycle.subscribe(() => listener()),
      this.parameters.subscribe(() => listener())
    ];
    return () => {
      for (const unsubscribe of unsubscribers.reverse()) unsubscribe?.();
    };
  }

  #entry(toolId) {
    const id = String(toolId ?? "").trim();
    const entry = this.#entries.get(id);
    if (!entry) throw new Error(`Ferramenta adaptada desconhecida: ${id}.`);
    return entry;
  }
}

function presetDescriptor(legacy, preset) {
  const parameters = parametersForPreset(legacy.parameters, preset.preset);
  return Object.freeze({
    id: preset.id,
    label: preset.label,
    description: preset.description,
    family: preset.family,
    kind: "continuous",
    lifecycle: "continuous",
    contexts: CONTEXTS[legacy.id],
    parameters,
    presentation: preset.presentation,
    operations: Object.freeze({
      activate: true,
      execute: true,
      finish: false,
      cancel: true,
      parameters: true
    }),
    capabilities: Object.freeze({
      preview: true,
      undo: true,
      repeat: true,
      procedural: false,
      agent: true,
      pointer: true
    }),
    source: Object.freeze({
      nativeId: legacy.id,
      preset: preset.preset,
      temporary: true
    })
  });
}

function legacyDescriptor(legacy) {
  const continuous = legacy.lifecycle === "continuous";
  const presentation = PRESENTATION[legacy.id] ?? Object.freeze({
    icon: "?",
    group: legacy.family,
    order: 1000
  });
  return Object.freeze({
    id: legacy.id,
    label: legacy.label,
    description: `${legacy.label} pela implementação atual de autoria.`,
    family: legacy.family,
    kind: continuous ? "continuous" : "operation",
    lifecycle: continuous ? "continuous" : "single-shot",
    contexts: CONTEXTS[legacy.id] ?? Object.freeze(["object"]),
    parameters: legacy.parameters,
    presentation: Object.freeze({
      label: legacy.label,
      ...presentation
    }),
    operations: Object.freeze({
      activate: continuous,
      execute: true,
      finish: Boolean(FINISH_COMMANDS[legacy.id]),
      cancel: Boolean(CANCEL_COMMANDS[legacy.id]),
      parameters: legacy.parameters.length > 0
    }),
    capabilities: Object.freeze({
      preview: continuous,
      undo: true,
      repeat: true,
      procedural: !continuous,
      agent: true,
      pointer: continuous
    }),
    source: Object.freeze({
      nativeId: legacy.id,
      temporary: true
    })
  });
}

function parametersForPreset(parameters, preset) {
  return Object.freeze(parameters.flatMap(parameter => {
    if (parameter.id === "mode") return [];
    if (parameter.when?.mode !== undefined &&
        parameter.when.mode !== preset.mode) {
      return [];
    }
    const whenEntries = Object.entries(parameter.when ?? {})
      .filter(([id]) => id !== "mode");
    const clone = structuredClone(parameter);
    clone.when = whenEntries.length
      ? Object.fromEntries(whenEntries)
      : null;
    return [Object.freeze(clone)];
  }));
}

function operationArguments(entry, input) {
  const source = normalizePatch(input);
  if (!entry.native.id.startsWith("mesh.")) {
    return source;
  }
  const options = source.options && typeof source.options === "object" &&
    !Array.isArray(source.options)
    ? structuredClone(source.options)
    : {};
  const args = { ...source };
  delete args.options;
  for (const parameter of entry.descriptor.parameters) {
    if (args[parameter.id] === undefined) continue;
    options[parameter.id] = args[parameter.id];
    delete args[parameter.id];
  }
  return {
    ...args,
    operation: entry.native.id.slice("mesh.".length),
    options
  };
}

function publicParameterValues(descriptor, values) {
  return Object.freeze(Object.fromEntries(
    descriptor.parameters.map(parameter => [
      parameter.id,
      structuredClone(values[parameter.id])
    ])
  ));
}

function presetMatches(values, preset) {
  return Object.entries(preset).every(([id, expected]) =>
    Object.is(values[id], expected)
  );
}

function normalizePatch(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Argumentos da ferramenta devem formar um objeto.");
  }
  return structuredClone(value);
}
