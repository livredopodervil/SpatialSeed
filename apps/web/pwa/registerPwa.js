import { formatBuildLabel } from "../BuildInfo.js";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function registerPwa(buildInfo, { onStateChange = null } = {}) {
  const serviceWorkers = navigator.serviceWorker;
  const state = {
    supported: Boolean(serviceWorkers),
    registered: false,
    build: buildInfo.build,
    publishedBuild: buildInfo.build,
    controllerBuild: workerBuild(serviceWorkers?.controller),
    activeBuild: null,
    waitingBuild: null,
    installingBuild: null,
    updatePending: false,
    scope: null,
    error: null
  };
  const publish = () => publishState(state, {
    serviceWorkers,
    onStateChange
  });
  publish();

  if (!state.supported || !isTrustedOrigin()) {
    return Promise.resolve(snapshot(state));
  }

  const applicationRoot = new URL("../", import.meta.url);
  const repositoryRoot = new URL("../../", applicationRoot);
  const workerUrl = new URL("service-worker.js", repositoryRoot);
  workerUrl.searchParams.set("build", buildInfo.build);

  serviceWorkers.addEventListener("controllerchange", publish);

  return serviceWorkers.register(workerUrl, {
    scope: repositoryRoot.pathname
  }).then(registration => {
    state.registered = true;
    state.scope = registration.scope;
    observeRegistration(registration, state, publish);
    publish();
    return snapshot(state);
  }).catch(error => {
    state.error = error?.message || String(error);
    publish();
    console.warn("Spatial Seed: modo offline indisponível.", error);
    return snapshot(state);
  });
}

export function workerBuild(workerOrUrl) {
  const value = typeof workerOrUrl === "string"
    ? workerOrUrl
    : workerOrUrl?.scriptURL;
  if (!value) return null;
  try {
    return new URL(value, "https://spatialseed.invalid/")
      .searchParams.get("build");
  } catch {
    return null;
  }
}

export function formatPwaBuildLabel(buildInfo, pwaState = {}) {
  const base = formatBuildLabel(buildInfo);
  const controllerBuild = pwaState.controllerBuild ?? null;
  if (controllerBuild && controllerBuild !== buildInfo.build) {
    return `${base} · cache ${controllerBuild} · feche para atualizar`;
  }
  if (pwaState.updatePending) {
    const pending = pwaState.waitingBuild ?? pwaState.installingBuild;
    return pending
      ? `${base} · atualização ${pending} pendente`
      : `${base} · atualização pendente`;
  }
  return base;
}

function observeRegistration(registration, state, publish) {
  const observed = new WeakSet();
  const refresh = () => {
    state.activeBuild = workerBuild(registration.active);
    state.waitingBuild = workerBuild(registration.waiting);
    state.installingBuild = workerBuild(registration.installing);
    state.updatePending = Boolean(
      registration.waiting || registration.installing
    );
    for (const worker of [
      registration.active,
      registration.waiting,
      registration.installing
    ]) {
      if (!worker || observed.has(worker)) continue;
      observed.add(worker);
      worker.addEventListener("statechange", refresh);
    }
    publish();
  };
  registration.addEventListener("updatefound", refresh);
  refresh();
}

function publishState(state, { serviceWorkers, onStateChange }) {
  state.controllerBuild = workerBuild(serviceWorkers?.controller);
  const current = snapshot(state);
  window.__SPATIAL_SEED_PWA__ = current;
  try {
    onStateChange?.(current);
  } catch (error) {
    console.warn("Spatial Seed: diagnóstico PWA falhou.", error);
  }
  return current;
}

function snapshot(state) {
  return Object.freeze({ ...state });
}

function isTrustedOrigin() {
  return window.isSecureContext || LOCAL_HOSTS.has(location.hostname);
}
