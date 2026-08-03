import { EditToolRegistryAdapter } from "./EditToolRegistryAdapter.js";
import { ToolCapabilityFacade } from "./ToolCapabilityFacade.js";
import { TransformToolAdapter } from "./TransformToolAdapter.js";

export function createDefaultToolCapabilityFacade({
  editContext,
  registry,
  parameters,
  lifecycle,
  drawingTarget = null,
  execute
}) {
  return new ToolCapabilityFacade({
    context: () => Object.freeze({
      ...editContext.status(),
      drawingTargetType: drawingTarget?.status?.().type ?? "plane"
    }),
    adapters: [
      new TransformToolAdapter({ editContext, execute }),
      new EditToolRegistryAdapter({
        registry,
        parameters,
        lifecycle,
        drawingTarget,
        execute
      })
    ]
  });
}

export function installToolCapabilityRuntime({
  commands,
  queries,
  facade,
  workspace = null
}) {
  if (!commands?.register || !queries?.register) {
    throw new TypeError(
      "Instalação de ferramentas canônicas exige comandos e consultas."
    );
  }
  if (!facade?.list || !facade?.execute) {
    throw new TypeError("Fachada canônica de ferramentas inválida.");
  }

  commands
    .register(
      "authoring.tool.activate",
      ({ toolId, options = {}, context = null } = {}) => {
        workspace?.focus(toolId);
        return facade.activate(
          toolId,
          workspace?.resolve(toolId, options) ?? options,
          context
        );
      },
      canonicalMetadata("activate")
    )
    .register(
      "authoring.tool.execute",
      ({ toolId, input = {}, context = null } = {}) => {
        workspace?.focus(toolId);
        return facade.execute(
          toolId,
          workspace?.resolve(toolId, input) ?? input,
          context
        );
      },
      canonicalMetadata("execute", {
        effect: "delegated",
        delegatesMutation: true
      })
    )
    .register(
      "authoring.tool.finish",
      ({ toolId, options = {}, context = null } = {}) =>
        facade.finish(toolId, options, context),
      canonicalMetadata("finish")
    )
    .register(
      "authoring.tool.cancel",
      ({ toolId, options = {}, context = null } = {}) =>
        facade.cancel(toolId, options, context),
      canonicalMetadata("cancel")
    )
    .register(
      "authoring.tool.parameters.set",
      ({ toolId, patch = {} } = {}) => {
        workspace?.focus(toolId);
        return facade.setParameters(toolId, patch);
      },
      canonicalMetadata("parameters", { effect: "local-preference" })
    )
    .register(
      "authoring.tool.parameters.reset",
      ({ toolId } = {}) => {
        workspace?.focus(toolId);
        return facade.resetParameters(toolId);
      },
      canonicalMetadata("parameters", { effect: "local-preference" })
    );

  if (workspace) {
    commands
      .register(
        "authoring.tool.focus",
        ({ toolId } = {}) => workspace.focus(toolId),
        canonicalMetadata("focus", { effect: "local-preference" })
      )
      .register(
        "authoring.tool.focus.clear",
        () => workspace.clearFocus(),
        canonicalMetadata("focus", { effect: "local-preference" })
      )
      .register(
        "authoring.tool.input.bind",
        args => workspace.bind(args),
        canonicalMetadata("input", { effect: "local-preference" })
      )
      .register(
        "authoring.tool.input.use-selection",
        args => workspace.useSelection(args),
        canonicalMetadata("input", { effect: "local-preference" })
      )
      .register(
        "authoring.tool.input.clear",
        args => workspace.clearInput(args),
        canonicalMetadata("input", { effect: "local-preference" })
      );
  }

  queries
    .register("authoring.tools.list", args => facade.list(args))
    .register("authoring.tool.describe", ({ toolId } = {}) =>
      facade.describe(toolId))
    .register("authoring.tool.status", args => facade.status(args))
    .register("authoring.tool.parameters.get", ({ toolId } = {}) => ({
      toolId,
      values: facade.getParameters(toolId)
    }));
  if (workspace) {
    queries.register("authoring.tool.workspace", args =>
      workspace.status(args));
  }

  return facade;
}

function canonicalMetadata(operation, extra = {}) {
  const metadata = {
    category: "authoring-tools",
    canonical: true,
    operation,
    ...extra
  };
  if (operation !== "execute") metadata.mutates = false;
  return Object.freeze(metadata);
}
