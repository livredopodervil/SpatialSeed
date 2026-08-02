const DEFINITIONS = Object.freeze([
  modeDefinition({
    id: "interaction.navigate",
    mode: "navigate",
    label: "Navegar",
    icon: "☝",
    family: "navigation",
    order: 10,
    undo: false
  }),
  modeDefinition({
    id: "selection.select",
    mode: "select",
    label: "Selecionar",
    icon: "⌖",
    family: "selection",
    order: 20,
    undo: false
  }),
  modeDefinition({
    id: "transform.translate",
    mode: "translate",
    label: "Mover",
    icon: "↔",
    family: "transform",
    order: 30
  }),
  modeDefinition({
    id: "transform.rotate",
    mode: "rotate",
    label: "Girar",
    icon: "↻",
    family: "transform",
    order: 40
  }),
  modeDefinition({
    id: "transform.scale",
    mode: "scale",
    label: "Escalar",
    icon: "⤢",
    family: "transform",
    order: 50
  })
]);

export class TransformToolAdapter {
  static apiVersion = "transform-tool-adapter-v1";

  id = "transform-modes";

  constructor({ editContext, execute }) {
    if (!editContext?.status || !editContext?.subscribe) {
      throw new TypeError("TransformToolAdapter exige EditContextController.");
    }
    if (typeof execute !== "function") {
      throw new TypeError("TransformToolAdapter exige executor de comandos.");
    }
    this.editContext = editContext;
    this.executeCommand = execute;
  }

  list() {
    return DEFINITIONS;
  }

  status(toolId) {
    const definition = definitionOf(toolId);
    return Object.freeze({
      active: this.editContext.status().tool === definition.source.nativeId,
      available: true
    });
  }

  activate(toolId) {
    const definition = definitionOf(toolId);
    if (this.editContext.status().tool === definition.source.nativeId) {
      return Object.freeze({
        active: true,
        alreadyActive: true,
        mode: definition.source.nativeId
      });
    }
    return this.executeCommand("edit.context.tool.set", {
      mode: definition.source.nativeId
    });
  }

  cancel(toolId) {
    const definition = definitionOf(toolId);
    if (this.editContext.status().tool !== definition.source.nativeId) {
      return Object.freeze({
        active: false,
        changed: false,
        reason: "tool-not-active"
      });
    }
    return this.executeCommand("edit.interaction.cancel", {});
  }

  subscribe(listener) {
    return this.editContext.subscribe(() => listener());
  }
}

function modeDefinition({
  id,
  mode,
  label,
  icon,
  family,
  order,
  undo = true
}) {
  return Object.freeze({
    id,
    label,
    description: `${label} no contexto ativo de objeto ou malha.`,
    family,
    kind: "mode",
    lifecycle: "sticky",
    contexts: Object.freeze(["object", "vertex", "edge", "face"]),
    parameters: Object.freeze([]),
    presentation: Object.freeze({ label, icon, group: family, order }),
    operations: Object.freeze({
      activate: true,
      execute: false,
      finish: false,
      cancel: true,
      parameters: false
    }),
    capabilities: Object.freeze({
      preview: undo,
      undo,
      repeat: false,
      procedural: false,
      agent: true,
      pointer: true
    }),
    source: Object.freeze({
      nativeId: mode,
      temporary: true
    })
  });
}

function definitionOf(toolId) {
  const id = String(toolId ?? "").trim();
  const definition = DEFINITIONS.find(item => item.id === id);
  if (!definition) {
    throw new Error(`Modo de transformação desconhecido: ${id}.`);
  }
  return definition;
}
