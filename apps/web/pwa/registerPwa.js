const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function registerPwa(buildInfo) {
  const state = {
    supported: "serviceWorker" in navigator,
    registered: false,
    build: buildInfo.build,
    error: null
  };
  window.__SPATIAL_SEED_PWA__ = state;

  if (!state.supported || !isTrustedOrigin()) return Promise.resolve(state);

  const applicationRoot = new URL("../", import.meta.url);
  const repositoryRoot = new URL("../../", applicationRoot);
  const workerUrl = new URL("service-worker.js", repositoryRoot);
  workerUrl.searchParams.set("build", buildInfo.build);

  return navigator.serviceWorker.register(workerUrl, {
    scope: repositoryRoot.pathname
  }).then(registration => {
    state.registered = true;
    state.scope = registration.scope;
    return state;
  }).catch(error => {
    state.error = error?.message || String(error);
    console.warn("Spatial Seed: modo offline indisponível.", error);
    return state;
  });
}

function isTrustedOrigin() {
  return window.isSecureContext || LOCAL_HOSTS.has(location.hostname);
}
