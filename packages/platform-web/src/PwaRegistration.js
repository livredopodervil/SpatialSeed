import { formatBuildLabel } from "./BuildInfo.js?build=20260804-0048e1";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const UPDATE_TIMEOUT_MS = 15000;

export function registerPwa(buildInfo, {
  onStateChange = null,
  applicationUrl = globalThis.location?.href,
  serviceWorkers = globalThis.navigator?.serviceWorker,
  locationRef = globalThis.location
} = {}) {
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
  let registration = null;
  let disposed = false;
  const disposers = [];
  const publish = () => publishState(state, {
    serviceWorkers,
    onStateChange
  });
  publish();

  const ready = !state.supported || !isTrustedOrigin(locationRef)
    ? Promise.resolve(null)
    : startRegistration();

  const controller = Object.freeze({
    ready,
    snapshot: () => snapshot(state),
    checkForUpdate,
    updateNow,
    dispose
  });
  return controller;

  async function startRegistration() {
    const locations = resolvePwaLocations(applicationUrl);
    const workerUrl = new URL(locations.workerUrl);
    workerUrl.searchParams.set("build", buildInfo.build);
    const onControllerChange = () => publish();
    serviceWorkers.addEventListener("controllerchange", onControllerChange);
    disposers.push(() => serviceWorkers.removeEventListener(
      "controllerchange",
      onControllerChange
    ));

    try {
      registration = await serviceWorkers.register(workerUrl, {
        scope: locations.scopeUrl
      });
      if (disposed) return registration;
      state.registered = true;
      state.scope = registration.scope;
      disposers.push(observeRegistration(registration, state, publish));
      retireLegacyRegistration(serviceWorkers, registration, locations)
        .catch(error => console.warn(
          "Spatial Seed: registro PWA legado não pôde ser removido.",
          error
        ));
      publish();
      return registration;
    } catch (error) {
      state.error = error?.message || String(error);
      publish();
      console.warn("Spatial Seed: modo offline indisponível.", error);
      return null;
    }
  }

  async function checkForUpdate() {
    const current = await ready;
    if (!current || disposed) return snapshot(state);
    try {
      await current.update();
      state.error = null;
    } catch (error) {
      state.error = error?.message || String(error);
      console.warn("Spatial Seed: verificação de atualização falhou.", error);
    }
    refreshRegistrationState(current, state, publish);
    return snapshot(state);
  }

  async function updateNow() {
    const current = await ready;
    if (!current || disposed) return false;
    await checkForUpdate();

    if (workerBuild(serviceWorkers.controller) === buildInfo.build ||
        workerBuild(current.active) === buildInfo.build) {
      locationRef?.reload?.();
      return true;
    }

    const candidate = await updateCandidate(current, buildInfo.build);
    if (!candidate) {
      state.error = "A nova versão ainda não terminou de baixar.";
      publish();
      return false;
    }

    if (candidate.state === "installed") {
      candidate.postMessage({ type: "SKIP_WAITING" });
    }

    const changed = await waitForControllerBuild(
      serviceWorkers,
      buildInfo.build,
      UPDATE_TIMEOUT_MS
    );
    if (!changed) {
      state.error = "Feche e abra novamente para concluir a atualização.";
      refreshRegistrationState(current, state, publish);
      return false;
    }
    locationRef?.reload?.();
    return true;
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    while (disposers.length) disposers.pop()?.();
  }
}

export function resolvePwaLocations(moduleUrl) {
  if (!moduleUrl) {
    throw new TypeError("Localização da aplicação web é obrigatória.");
  }
  const moduleLocation = new URL(moduleUrl);
  moduleLocation.pathname = `/${moduleLocation.pathname.replace(/^\/+/, "")}`;
  const applicationRoot = new URL("./", moduleLocation);
  const repositoryRoot = new URL("../../", applicationRoot);
  return Object.freeze({
    applicationRoot: applicationRoot.href,
    repositoryRoot: repositoryRoot.href,
    workerUrl: new URL("service-worker.js", applicationRoot).href,
    legacyWorkerUrl: new URL("service-worker.js", repositoryRoot).href,
    scope: applicationRoot.pathname,
    scopeUrl: applicationRoot.href
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

export function pwaUpdateAvailable({
  publishedBuild,
  controllerBuild = null,
  waitingBuild = null,
  installingBuild = null
} = {}) {
  if (!publishedBuild) return false;
  if (waitingBuild === publishedBuild || installingBuild === publishedBuild) {
    return true;
  }
  return Boolean(controllerBuild && controllerBuild !== publishedBuild);
}

export function formatPwaBuildLabel(buildInfo, pwaState = {}) {
  const base = formatBuildLabel(buildInfo);
  if (pwaState.error) return `${base} · atualização requer atenção`;
  if (pwaUpdateAvailable({
    publishedBuild: buildInfo.build,
    controllerBuild: pwaState.controllerBuild,
    waitingBuild: pwaState.waitingBuild,
    installingBuild: pwaState.installingBuild
  })) {
    return `${base} · nova versão disponível`;
  }
  if (pwaState.updatePending) return `${base} · verificando atualização`;
  return base;
}

function observeRegistration(registration, state, publish) {
  const observed = new WeakSet();
  const refresh = () => refreshRegistrationState(
    registration,
    state,
    publish,
    observed
  );
  registration.addEventListener("updatefound", refresh);
  refresh();
  return () => registration.removeEventListener("updatefound", refresh);
}

function refreshRegistrationState(
  registration,
  state,
  publish,
  observed = new WeakSet()
) {
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
    worker.addEventListener("statechange", () => refreshRegistrationState(
      registration,
      state,
      publish,
      observed
    ));
  }
  publish();
}

async function updateCandidate(registration, expectedBuild) {
  const current = matchingWorker(registration, expectedBuild);
  if (!current) return null;
  if (current.state === "installed" || current.state === "activated") {
    return current;
  }
  if (current.state === "redundant") return null;
  return new Promise(resolve => {
    const onStateChange = () => {
      if (!["installed", "activated", "redundant"].includes(current.state)) {
        return;
      }
      current.removeEventListener("statechange", onStateChange);
      resolve(current.state === "redundant" ? null : current);
    };
    current.addEventListener("statechange", onStateChange);
    onStateChange();
  });
}

function matchingWorker(registration, expectedBuild) {
  return [
    registration.waiting,
    registration.installing,
    registration.active
  ].find(worker => workerBuild(worker) === expectedBuild) ?? null;
}

function waitForControllerBuild(serviceWorkers, expectedBuild, timeoutMs) {
  if (workerBuild(serviceWorkers.controller) === expectedBuild) {
    return Promise.resolve(true);
  }
  return new Promise(resolve => {
    let settled = false;
    const finish = value => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      serviceWorkers.removeEventListener("controllerchange", onChange);
      resolve(value);
    };
    const onChange = () => finish(
      workerBuild(serviceWorkers.controller) === expectedBuild
    );
    const timer = setTimeout(() => finish(false), timeoutMs);
    serviceWorkers.addEventListener("controllerchange", onChange);
  });
}

async function retireLegacyRegistration(
  serviceWorkers,
  currentRegistration,
  locations
) {
  if (locations.workerUrl === locations.legacyWorkerUrl) return false;
  await waitForActiveWorker(currentRegistration);
  const registrations = await serviceWorkers.getRegistrations();
  let retired = false;
  for (const registration of registrations) {
    if (registration === currentRegistration) continue;
    if (!registrationUsesScript(registration, locations.legacyWorkerUrl)) {
      continue;
    }
    retired = await registration.unregister() || retired;
  }
  return retired;
}

function waitForActiveWorker(registration) {
  if (registration.active) return Promise.resolve(registration.active);
  const worker = registration.installing ?? registration.waiting;
  if (!worker) return Promise.resolve(null);
  return new Promise(resolve => {
    const onStateChange = () => {
      if (worker.state !== "activated" && worker.state !== "redundant") return;
      worker.removeEventListener("statechange", onStateChange);
      resolve(worker.state === "activated" ? worker : null);
    };
    worker.addEventListener("statechange", onStateChange);
    onStateChange();
  });
}

function registrationUsesScript(registration, expectedUrl) {
  const expected = workerIdentity(expectedUrl);
  return [
    registration.active,
    registration.waiting,
    registration.installing
  ].some(worker => workerIdentity(worker?.scriptURL) === expected);
}

function workerIdentity(value) {
  if (!value) return null;
  const url = new URL(value);
  return `${url.origin}${url.pathname}`;
}

function publishState(state, { serviceWorkers, onStateChange }) {
  state.controllerBuild = workerBuild(serviceWorkers?.controller);
  const current = snapshot(state);
  globalThis.window && (window.__SPATIAL_SEED_PWA__ = current);
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

function isTrustedOrigin(locationRef) {
  return globalThis.window?.isSecureContext ||
    LOCAL_HOSTS.has(locationRef?.hostname);
}
