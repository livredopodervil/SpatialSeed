import { createWebRuntime } from "./bootstrap/createWebRuntime.js?build=20260715-0022a";
import { bindWebInterface } from "./bootstrap/bindWebInterface.js?build=20260715-0022a";

const BUILD = "20260715-0022a";
const $ = id => document.getElementById(id);

function showFatalError(error) {
  $("error-box").hidden = false;
  $("error-box").textContent = error?.stack || String(error);
  $("status").textContent = "Falha na inicialização";
  console.error(error);
}

try {
  const application = await createWebRuntime({
    canvas: $("world"),
    outlineRoot: $("outline-content"),
    transformToolsRoot: $("transform-tools-panel"),
    inspectorRoot: $("inspector-panel")
  });

  const interfaceBinding = bindWebInterface(application);

  application.runtime.onDispose(() =>
    interfaceBinding.dispose()
  );

  window.__SPATIAL_SEED__ = Object.freeze({
    build: BUILD,
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
} catch (error) {
  showFatalError(error);
}
