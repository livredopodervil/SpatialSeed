import { EditToolRegistryAdapter } from "./EditToolRegistryAdapter.js";
import { ToolCapabilityFacade } from "./ToolCapabilityFacade.js";
import { TransformToolAdapter } from "./TransformToolAdapter.js";

export function createDefaultToolCapabilityFacade({
  editContext,
  registry,
  parameters,
  lifecycle,
  execute
}) {
  return new ToolCapabilityFacade({
    context: () => editContext.status(),
    adapters: [
      new TransformToolAdapter({ editContext, execute }),
      new EditToolRegistryAdapter({
        registry,
        parameters,
        lifecycle,
        execute
      })
    ]
  });
}

export function installToolCapabilityRuntime({
  commands,
  queries,
  facade
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
      ({ toolId, options = {}, context = null } = {}) =>
        facade.activate(toolId, options, context),
      canonicalMetadata("activate")
    )
    .register(
      "authoring.tool.execute",
      ({ toolId, input = {}, context = null } = {}) =>
        facade.execute(toolId, input, context),
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
      ({ toolId, patch = {} } = {}) =>
        facade.setParameters(toolId, patch),
      canonicalMetadata("parameters", { effect: "local-preference" })
    );

  queries
    .register("authoring.tools.list", args => facade.list(args))
    .register("authoring.tool.describe", ({ toolId } = {}) =>
      facade.describe(toolId))
    .register("authoring.tool.status", args => facade.status(args))
    .register("authoring.tool.parameters.get", ({ toolId } = {}) => ({
      toolId,
      values: facade.getParameters(toolId)
    }));

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
