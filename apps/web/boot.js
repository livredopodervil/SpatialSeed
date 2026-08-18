import {
  PwaInstallController,
  formatPwaBuildLabel,
  formatBuildLabel,
  loadUiConfiguration,
  loadWebApplicationDefinition,
  loadWebRuntimeExtensions,
  pwaUpdateAvailable,
  registerPwa,
  resolvePwaLocations,
  webApplicationName
} from "../../packages/platform-web/src/index.js?build=20260818-0054mr";

const $ = id => document.getElementById(id);
const pwaInstallController = new PwaInstallController({ windowRef: window });

try {
  const buildInfo = await loadPublishedBuildInfo();
  exposeBuildInfo(buildInfo);
  const pwaRegistration = registerPwa(buildInfo, {
    applicationUrl: import.meta.url,
    onStateChange: state => exposePwaState(
      buildInfo,
      state,
      formatPwaBuildLabel
    )
  });
  bindPwaActions(buildInfo, pwaRegistration);
  bindPwaUpdateChecks(pwaRegistration);
  const pwaState = await pwaRegistration.checkForUpdate();

  if (requiresPwaHandoff(buildInfo, pwaState)) {
    showPwaUpdateRequired(buildInfo, pwaState);
  } else {
    await startRuntime(buildInfo, pwaInstallController);
  }
} catch (error) {
  showFatalError(error);
}


async function loadPublishedBuildInfo() {
  const url = new URL("./build-info.json", import.meta.url);
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Falha ao carregar build-info.json: ${response.status}`);
  }
  const buildInfo = await response.json();
  if (!buildInfo?.build) {
    throw new Error("build-info.json não informa build publicado.");
  }
  return Object.freeze(buildInfo);
}

async function startRuntime(buildInfo, pwaInstallController) {
  const [uiConfiguration, applicationDefinition] = await Promise.all([
    loadUiConfiguration(),
    loadWebApplicationDefinition({
      name: webApplicationName(location),
      applicationRootUrl: import.meta.url
    })
  ]);
  const runtimeExtensions = await loadWebRuntimeExtensions(
    applicationDefinition
  );
  exposeApplicationDefinition(applicationDefinition);
  await loadStylesheet(buildInfo);

  const cacheKey = encodeURIComponent(buildInfo.build);
  const { startApplication } = await import(`./main.js?build=${cacheKey}`);
  await startApplication(buildInfo, uiConfiguration, {
    applicationDefinition,
    runtimeExtensions,
    pwaInstallController
  });
}

function bindPwaActions(buildInfo, pwaRegistration) {
  const updateButton = $("pwa-update-button");
  const repairButton = $("pwa-repair-button");
  updateButton?.addEventListener("click", async () => {
    updateButton.dataset.busy = "true";
    updateButton.disabled = true;
    updateButton.textContent = "Atualizando…";
    try {
      const updated = await pwaRegistration.updateNow();
      if (updated) return;
    } finally {
      delete updateButton.dataset.busy;
      const state = pwaRegistration.snapshot();
      exposePwaState(buildInfo, state, formatPwaBuildLabel);
    }
  });
  repairButton?.addEventListener("click", () => {
    const locations = resolvePwaLocations(import.meta.url);
    const resetUrl = new URL(
      "../reset-spatialseed-cache.html",
      locations.applicationRoot
    );
    resetUrl.searchParams.set("return", "./web/");
    resetUrl.searchParams.set("build", buildInfo.build);
    location.assign(resetUrl);
  });
}

function exposePwaState(buildInfo, state, formatLabel) {
  const content = $("build-content");
  content.textContent = formatLabel(buildInfo, state);
  content.title = [
    `Publicado: ${state.publishedBuild}`,
    `Cache controlador: ${state.controllerBuild ?? "rede"}`,
    `Ativo: ${state.activeBuild ?? "ausente"}`,
    `Aguardando: ${state.waitingBuild ?? "ausente"}`,
    state.error ? `Falha: ${state.error}` : null
  ].filter(Boolean).join("\n");
  document.documentElement.dataset.controllerBuild =
    state.controllerBuild ?? "network";
  document.documentElement.dataset.updatePending =
    state.updatePending ? "true" : "false";

  const updateButton = $("pwa-update-button");
  const updateAvailable = pwaUpdateAvailable({
    publishedBuild: buildInfo.build,
    controllerBuild: state.controllerBuild,
    waitingBuild: state.waitingBuild,
    installingBuild: state.installingBuild
  });
  if (updateButton) {
    updateButton.hidden = !state.supported;
    if (updateButton.dataset.busy !== "true") {
      updateButton.disabled = !updateAvailable;
      updateButton.textContent = "Atualizar agora";
      updateButton.title = updateAvailable
        ? "Ativar a versão publicada e recarregar"
        : "Esta página já usa a versão publicada";
    }
  }
  const repairButton = $("pwa-repair-button");
  if (repairButton) repairButton.hidden = !state.error;
}

function requiresPwaHandoff(buildInfo, state) {
  return Boolean(
    state?.controllerBuild &&
    state.controllerBuild !== buildInfo.build
  );
}

function showPwaUpdateRequired(buildInfo, state) {
  const status = $("status");
  if (status) {
    status.textContent =
      "Atualização PWA necessária antes de iniciar esta versão.";
  }
  const content = $("build-content");
  if (content) {
    content.textContent =
      `build ${buildInfo.build} · controlador ${state.controllerBuild ?? "rede"}`;
  }
  const button = $("pwa-update-button");
  if (button) {
    button.hidden = false;
    button.disabled = false;
    button.textContent = "Atualizar agora";
    button.focus?.();
  }
}

function bindPwaUpdateChecks(pwaRegistration) {
  let lastCheckAt = 0;
  const check = () => {
    const now = Date.now();
    if (now - lastCheckAt < 30000) return;
    lastCheckAt = now;
    void pwaRegistration.checkForUpdate();
  };
  globalThis.addEventListener?.("online", check);
  globalThis.addEventListener?.("focus", check);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") check();
  });
}

function exposeBuildInfo(buildInfo) {
  let meta = document.querySelector('meta[name="spatial-seed-build"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "spatial-seed-build";
    document.head.append(meta);
  }
  meta.content = buildInfo.build;
  document.documentElement.dataset.build = buildInfo.build;
  $("build-content").textContent = formatBuildLabel(buildInfo);
}

function exposeApplicationDefinition(definition) {
  document.documentElement.dataset.application = definition.id;
  document.documentElement.dataset.applicationRole = definition.role;
}

function loadStylesheet(buildInfo) {
  return new Promise((resolve, reject) => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = `./style.css?build=${encodeURIComponent(buildInfo.build)}`;
    link.addEventListener("load", resolve, { once: true });
    link.addEventListener("error", () => reject(
      new Error("Falha ao carregar a folha de estilos.")
    ), { once: true });
    document.head.append(link);
  });
}

function showFatalError(error) {
  const box = $("error-box");
  if (box) {
    box.hidden = false;
    box.textContent = error?.stack || String(error);
  }
  const status = $("status");
  if (status) status.textContent = "Falha na inicialização";
  console.error(error);
}
