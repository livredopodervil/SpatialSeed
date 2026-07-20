const $ = id => document.getElementById(id);

export async function startApplication(
  buildInfo,
  uiConfiguration,
  { pwaInstallController = null } = {}
) {
  const cacheKey=encodeURIComponent(buildInfo.build);
  const [runtimeModule,interfaceModule]=await Promise.all([
    import(`./bootstrap/createWebRuntime.js?build=${cacheKey}`),
    import(`./bootstrap/bindWebInterface.js?build=${cacheKey}`)
  ]);

  const application = await runtimeModule.createWebRuntime({
    canvas: $("world"),
    outlineRoot: $("outline-content"),
    transformToolsRoot: $("transform-tools-panel"),
    geometryCreationRoot: $("geometry-create-panel"),
    experimentPanelRoot: $("experiment-panel"),
    animationPanelRoot: $("animation-panel"),
    procedureEditorRoot: $("procedure-editor-root"),
    inspectorRoot: $("inspector-panel"),
    buildInfo,
    uiConfiguration
  });

  const interfaceBinding = interfaceModule.bindWebInterface({
    ...application,
    uiConfiguration,
    pwaInstallController
  });

  application.runtime.onDispose(() =>
    interfaceBinding.dispose()
  );

  window.__SPATIAL_SEED__ = Object.freeze({
    build: buildInfo.build,
    version: buildInfo.version,
    channel: buildInfo.channel,
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
