import {
  shouldStartDefaultDemoAfterRecovery
} from "../../packages/platform-web/src/index.js?build=20260818-0054my";

const $ = id => document.getElementById(id);

export async function startApplication(
  buildInfo,
  uiConfiguration,
  {
    applicationDefinition,
    runtimeExtensions = [],
    pwaInstallController = null
  } = {}
) {
  const cacheKey=encodeURIComponent(buildInfo.build);
  const [runtimeModule,interfaceModule]=await Promise.all([
    import(`./bootstrap/createWebRuntime.js?build=${cacheKey}`),
    import(`./bootstrap/bindWebInterface.js?build=${cacheKey}`)
  ]);

  const application = await runtimeModule.createWebRuntime({
    canvas: $("world"),
    outlineRoot: $("outline-content"),
    geometryCreationRoot: $("geometry-create-panel"),
    experimentPanelRoot: $("experiment-panel"),
    animationPanelRoot: $("animation-panel"),
    viewerRenderPanelRoot: $("viewer-render-panel-root"),
    meshEditPanelRoot: $("mesh-edit-panel"),
    editHudRoot: $("edit-hud"),
    procedureEditorRoot: $("procedure-editor-root"),
    procedureCatalogUiRoot: $("procedure-catalog-ui-root"),
    inspectorRoot: $("inspector-panel"),
    buildInfo,
    uiConfiguration,
    runtimeExtensions
  });

  const interfaceBinding = interfaceModule.bindWebInterface({
    ...application,
    uiConfiguration,
    pwaInstallController
  });
  const recoveryStatus = await interfaceBinding.ready;

  try {
    await application.runtime.execute("interaction.event.emit", {
      type: "app.start"
    });
  } catch (error) {
    console.warn("Uma ação de inicialização da aplicação falhou.", error);
    application.runtime.emit("interaction.failed", {
      event: "app.start",
      error: String(error?.message ?? error)
    });
  }

  const defaultDemoLaunch = application.web?.defaultDemoLaunch ?? null;
  if (shouldStartDefaultDemoAfterRecovery(
    defaultDemoLaunch,
    recoveryStatus
  )) {
    try {
      await application.runtime.execute("game.start", {
        characterId: defaultDemoLaunch.characterId,
        config: defaultDemoLaunch.config ?? {},
        camera: defaultDemoLaunch.camera ?? {},
        controls: defaultDemoLaunch.controls ?? {}
      });
      application.runtime.emit("demo.started", {
        project: defaultDemoLaunch.project ?? null,
        characterId: defaultDemoLaunch.characterId
      });
    } catch (error) {
      console.warn("Projeto demo aberto, mas o modo jogo não pôde iniciar.", error);
      application.runtime.emit("demo.start.failed", {
        characterId: defaultDemoLaunch.characterId,
        error: String(error?.message ?? error)
      });
    }
  }

  application.runtime.onDispose(() =>
    interfaceBinding.dispose()
  );

  window.__SPATIAL_SEED__ = Object.freeze({
    build: buildInfo.build,
    version: buildInfo.version,
    channel: buildInfo.channel,
    application: applicationDefinition?.id ?? null,
    applicationRole: applicationDefinition?.role ?? null,
    apiVersion: application.runtime.constructor.apiVersion,
    execute: (id, args) =>
      application.runtime.execute(id, args),
    query: (id, args) =>
      application.runtime.query(id, args),
    subscribe: (type, listener) =>
      application.runtime.subscribe(type, listener),
    capabilities: () =>
      application.runtime.capabilities(),
    metrics: () =>
      application.runtime.metrics(),
    dispose: () =>
      application.runtime.dispose()
  });
  return application;
}
