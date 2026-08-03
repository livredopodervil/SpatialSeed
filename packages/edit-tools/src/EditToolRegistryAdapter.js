const PATH_SKETCH_PRESETS = Object.freeze([
  Object.freeze({
    id: "draw.tube",
    label: "Desenhar tubo",
    description: "Captura um caminho livre e cria um tubo contínuo.",
    family: "draw",
    preset: Object.freeze({ mode: "tube" }),
    executeCommand: "path.stroke.create",
    inputs: Object.freeze([
      sketchInput(
        "path",
        "path",
        ["draw", "points"],
        "Traço no plano ou superfície"
      )
    ]),
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
    executeCommand: "path.array.points.create",
    inputs: Object.freeze([
      sketchInput(
        "path",
        "path",
        ["draw", "points"],
        "Traço de distribuição"
      ),
      sketchInput("source", "selection", ["selection", "catalog"], "Fonte do pincel")
    ]),
    presentation: Object.freeze({
      label: "Distribuir ao desenhar",
      icon: "⋯",
      group: "draw",
      order: 20
    })
  }),
  Object.freeze({
    id: "draw.sweep",
    label: "Extrudar pelo caminho desenhado",
    description:
      "Captura um caminho livre e varre por ele o perfil selecionado ou informado.",
    family: "draw",
    preset: Object.freeze({ mode: "sweep" }),
    executeCommand: "path.sweep.points.create",
    inputs: Object.freeze([
      sketchInput(
        "path",
        "path",
        ["draw", "points"],
        "Caminho longitudinal"
      ),
      sketchInput("profile", "profile", ["selection", "reference"], "Perfil transversal")
    ]),
    presentation: Object.freeze({
      label: "Extrudar pelo caminho desenhado",
      icon: "⇝",
      group: "draw",
      order: 30
    })
  }),
  Object.freeze({
    id: "draw.extrude",
    label: "Desenhar perfil e extrudar",
    description:
      "Captura um perfil fechado no plano e cria uma extrusão linear.",
    family: "draw",
    preset: Object.freeze({ mode: "extrude" }),
    excludeParameters: Object.freeze(["curveType", "tension", "closed"]),
    executeCommand: "profile.extrude.points.create",
    inputs: Object.freeze([
      sketchInput(
        "profile",
        "profile",
        ["draw", "points"],
        "Perfil fechado"
      )
    ]),
    presentation: Object.freeze({
      label: "Desenhar perfil e extrudar",
      icon: "⇧",
      group: "draw",
      order: 40
    })
  }),
  Object.freeze({
    id: "draw.revolve",
    label: "Desenhar perfil e revolucionar",
    description:
      "Captura um perfil no plano e o gira em torno do eixo Y desse plano.",
    family: "draw",
    preset: Object.freeze({ mode: "revolve" }),
    excludeParameters: Object.freeze(["curveType", "tension", "closed"]),
    executeCommand: "profile.revolve.points.create",
    inputs: Object.freeze([
      sketchInput(
        "profile",
        "profile",
        ["draw", "points"],
        "Perfil de revolução"
      )
    ]),
    presentation: Object.freeze({
      label: "Desenhar perfil e revolucionar",
      icon: "⟳",
      group: "draw",
      order: 50
    })
  }),
  Object.freeze({
    id: "feature.sweep",
    label: "Varredura por perfil e caminho",
    description:
      "Cria uma varredura usando perfil e caminho existentes explicitamente.",
    family: "feature",
    kind: "operation",
    preset: Object.freeze({ mode: "sweep" }),
    excludeParameters: Object.freeze([
      "planeSource",
      "inputSamplePixels",
      "simplify",
      "smoothIterations",
      "profileObjectId",
      "profileExtraction",
      "materialMode",
      "opacityMultiplier"
    ]),
    executeCommand: "path.sweep.create",
    inputs: Object.freeze([
      sketchInput("profile", "profile", ["selection", "reference"], "Perfil transversal"),
      sketchInput("path", "path", ["selection", "reference"], "Caminho longitudinal")
    ]),
    presentation: Object.freeze({
      label: "Varredura",
      icon: "⇝",
      group: "feature",
      order: 60
    })
  }),
  Object.freeze({
    id: "feature.extrude",
    label: "Extrusão linear de perfil",
    description:
      "Extruda linearmente um perfil existente, selecionado ou informado.",
    family: "feature",
    kind: "operation",
    preset: Object.freeze({ mode: "extrude" }),
    excludeParameters: Object.freeze([
      "planeSource",
      "inputSamplePixels",
      "simplify",
      "smoothIterations",
      "curveType",
      "tension",
      "closed",
      "materialMode",
      "opacityMultiplier"
    ]),
    executeCommand: "profile.extrude.create",
    inputs: Object.freeze([
      sketchInput("profile", "profile", ["selection", "reference"], "Perfil planar")
    ]),
    presentation: Object.freeze({
      label: "Extrusão",
      icon: "⇧",
      group: "feature",
      order: 70
    })
  }),
  Object.freeze({
    id: "feature.revolve",
    label: "Revolução de perfil",
    description:
      "Revoluciona um perfil existente em torno do eixo Y de seu plano.",
    family: "feature",
    kind: "operation",
    preset: Object.freeze({ mode: "revolve" }),
    excludeParameters: Object.freeze([
      "planeSource",
      "inputSamplePixels",
      "simplify",
      "smoothIterations",
      "curveType",
      "tension",
      "closed",
      "materialMode",
      "opacityMultiplier"
    ]),
    executeCommand: "profile.revolve.create",
    inputs: Object.freeze([
      sketchInput("profile", "profile", ["selection", "reference"], "Perfil de revolução")
    ]),
    presentation: Object.freeze({
      label: "Revolução",
      icon: "⟳",
      group: "feature",
      order: 80
    })
  })
]);

const PRESENTATION = Object.freeze({
  "planar.sketch": Object.freeze({ icon: "✎", group: "draw", order: 60 }),
  "path.tube": Object.freeze({ icon: "⌇", group: "path", order: 70 }),
  "path.sweep": Object.freeze({ icon: "⇝", group: "path", order: 80 }),
  "path.array": Object.freeze({ icon: "⋯", group: "path", order: 90 }),
  "path.from-selection": Object.freeze({ icon: "⌁", group: "path", order: 100 }),
  "mesh.extrude": Object.freeze({ icon: "⇧", group: "mesh", order: 110 }),
  "mesh.inset": Object.freeze({ icon: "▣", group: "mesh", order: 120 }),
  "mesh.split": Object.freeze({ icon: "÷", group: "mesh", order: 130 })
});

const TOOL_INPUTS = Object.freeze({
  "path.tube": Object.freeze([
    sketchInput("path", "path", ["selection", "reference"], "Caminho existente")
  ]),
  "path.sweep": Object.freeze([
    sketchInput("path", "path", ["selection", "reference"], "Caminho existente"),
    sketchInput("profile", "profile", ["selection", "reference"], "Perfil existente")
  ]),
  "path.array": Object.freeze([
    sketchInput("path", "path", ["selection", "reference"], "Caminho existente"),
    sketchInput("source", "selection", ["selection"], "Objetos distribuídos")
  ]),
  "path.from-selection": Object.freeze([
    sketchInput("selection", "selection", ["mesh-selection"], "Componentes ordenados")
  ]),
  "mesh.extrude": Object.freeze([
    sketchInput("selection", "selection", ["mesh-selection"], "Componentes de malha")
  ]),
  "mesh.inset": Object.freeze([
    sketchInput("selection", "selection", ["mesh-selection"], "Faces de malha")
  ]),
  "mesh.split": Object.freeze([
    sketchInput("selection", "selection", ["mesh-selection"], "Arestas de malha")
  ])
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
  static apiVersion = "edit-tool-registry-adapter-v3";

  id = "edit-tool-registry";
  #entries = new Map();
  #definitions;

  constructor({
    registry,
    parameters,
    lifecycle,
    drawingTarget = null,
    execute
  }) {
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
    this.drawingTarget = drawingTarget;
    this.executeCommand = execute;

    const definitions = [];
    for (const legacy of registry.describe()) {
      if (legacy.id === "path.sketch") {
        for (const preset of PATH_SKETCH_PRESETS) {
          const descriptor = presetDescriptor(legacy, preset);
          this.#entries.set(descriptor.id, Object.freeze({
            descriptor,
            native: legacy,
            preset: preset.preset,
            executeCommand: preset.executeCommand
          }));
          definitions.push(descriptor);
        }
        continue;
      }
      const descriptor = legacyDescriptor(legacy);
      this.#entries.set(descriptor.id, Object.freeze({
        descriptor,
        native: legacy,
        preset: null,
        executeCommand: null
      }));
      definitions.push(descriptor);
    }
    this.#definitions = Object.freeze(definitions);
  }

  list() {
    return this.#definitions;
  }

  status(toolId, { context = {} } = {}) {
    const entry = this.#entry(toolId);
    const lifecycle = this.lifecycle.status();
    let active = entry.descriptor.kind === "continuous" &&
      lifecycle.activeAction === entry.native.id;
    if (active && entry.preset) {
      active = presetMatches(
        this.parameters.values(entry.native.id),
        entry.preset
      );
    }
    const profileOnSurface = ["draw.extrude", "draw.revolve"].includes(
      entry.descriptor.id
    ) && (
      context.drawingTargetType ?? this.drawingTarget?.status?.().type
    ) === "surface";
    return Object.freeze({
      active,
      available: !profileOnSurface,
      reason: profileOnSurface
        ? "perfis exigem um plano de desenho"
        : null
    });
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
            ...activationParameters(entry, input),
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
        ...activationParameters(entry, input),
        ...(entry.preset ?? {})
      })
    );
  }

  execute(toolId, input = {}) {
    const entry = this.#entry(toolId);
    if (entry.descriptor.kind === "continuous" && !entry.executeCommand) {
      return this.activate(toolId, input);
    }
    const configuredInput = entry.descriptor.operations.parameters
      ? {
          ...this.getParameters(toolId),
          ...normalizePatch(input)
        }
      : normalizePatch(input);
    return this.executeCommand(
      entry.executeCommand ?? entry.native.command,
      operationArguments(entry, configuredInput)
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

  resetParameters(toolId) {
    const entry = this.#entry(toolId);
    if (entry.preset) {
      const defaults = this.registry.defaults(entry.native.id);
      const patch = Object.fromEntries(
        entry.descriptor.parameters.map(parameter => [
          parameter.id,
          structuredClone(defaults[parameter.id])
        ])
      );
      this.executeCommand("edit.tool.parameters.set", {
        toolId: entry.native.id,
        patch
      });
      return this.getParameters(toolId);
    }
    this.executeCommand("edit.tool.parameters.reset", {
      toolId: entry.native.id
    });
    return this.getParameters(toolId);
  }

  subscribe(listener) {
    const unsubscribers = [
      this.lifecycle.subscribe(() => listener()),
      this.parameters.subscribe(() => listener()),
      this.drawingTarget?.subscribe?.(() => listener())
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
  const parameters = parametersForPreset(legacy.parameters, preset);
  const continuous = preset.kind !== "operation";
  return Object.freeze({
    id: preset.id,
    label: preset.label,
    description: preset.description,
    family: preset.family,
    kind: continuous ? "continuous" : "operation",
    lifecycle: continuous ? "continuous" : "single-shot",
    contexts: CONTEXTS[legacy.id],
    inputs: preset.inputs,
    parameters,
    presentation: preset.presentation,
    operations: Object.freeze({
      activate: continuous,
      execute: true,
      finish: false,
      cancel: continuous,
      parameters: true
    }),
    capabilities: Object.freeze({
      preview: continuous,
      undo: true,
      repeat: true,
      procedural: true,
      agent: true,
      pointer: continuous
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
    inputs: TOOL_INPUTS[legacy.id] ?? Object.freeze([]),
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

function parametersForPreset(parameters, presetDefinition) {
  const preset = presetDefinition.preset;
  const excluded = new Set(presetDefinition.excludeParameters ?? []);
  return Object.freeze(parameters.flatMap(parameter => {
    if (parameter.id === "mode" || excluded.has(parameter.id)) return [];
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
  if (entry.descriptor.id === "feature.sweep") {
    const {
      sweepSegments,
      sweepTwistDegrees,
      sweepColor,
      closed,
      ...rest
    } = source;
    return {
      ...rest,
      segments: sweepSegments,
      twistDegrees: sweepTwistDegrees,
      color: sweepColor,
      closedPath: closed
    };
  }
  if (entry.descriptor.id === "feature.extrude") {
    const { extrudeColor, ...rest } = source;
    return { ...rest, color: extrudeColor };
  }
  if (entry.descriptor.id === "feature.revolve") {
    const { revolveColor, ...rest } = source;
    return { ...rest, color: revolveColor };
  }
  if (!entry.native.id.startsWith("mesh.")) {
    return source;
  }
  const providedOptions = source.options && typeof source.options === "object" &&
    !Array.isArray(source.options)
    ? structuredClone(source.options)
    : {};
  const args = { ...source };
  delete args.options;
  const declaredOptions = {};
  for (const parameter of entry.descriptor.parameters) {
    if (args[parameter.id] === undefined) continue;
    declaredOptions[parameter.id] = args[parameter.id];
    delete args[parameter.id];
  }
  return {
    ...args,
    operation: entry.native.id.slice("mesh.".length),
    options: {
      ...declaredOptions,
      ...providedOptions
    }
  };
}

function activationParameters(entry, input) {
  const source = normalizePatch(input ?? {});
  if (entry.descriptor.id !== "draw.sweep" || !source.profile) {
    return source;
  }
  const profile = normalizePatch(source.profile);
  delete source.profile;
  return {
    ...source,
    ...(profile.objectId !== undefined
      ? { profileObjectId: String(profile.objectId) }
      : {}),
    ...(profile.extraction !== undefined
      ? { profileExtraction: String(profile.extraction) }
      : {})
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

function sketchInput(id, role, sources, label) {
  return Object.freeze({
    id,
    role,
    sources: Object.freeze([...sources]),
    label,
    required: true
  });
}
