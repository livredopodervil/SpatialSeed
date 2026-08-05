import {
  PwaInstallController,
  formatPwaBuildLabel,
  formatBuildLabel,
  loadBuildInfo,
  loadUiConfiguration,
  loadWebApplicationDefinition,
  loadWebRuntimeExtensions,
  pwaUpdateAvailable,
  registerPwa,
  resolvePwaLocations,
  webApplicationName
} from "../../packages/platform-web/src/index.js?build=20260805-0048l1";

const $ = id => document.getElementById(id);
const pwaInstallController = new PwaInstallController({ windowRef: window });

try {
  const buildInfo = await loadBuildInfo();
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
  void pwaRegistration.checkForUpdate();

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
} catch (error) {
  showFatalError(error);
}

function bindPwaActions(buildInfo, pwaRegistration) {
  const updateButton = $("pwa-update-button");
  const repairButton = $("pwa-repair-button");
  updateButton?.addEventListener("click", async () => {
    updateButton.disabled = true;
    updateButton.textContent = "Atualizando…";
    const updated = await pwaRegistration.updateNow();
    if (updated) return;
    updateButton.disabled = false;
    updateButton.textContent = "Atualizar agora";
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
    updateButton.hidden = !updateAvailable;
    if (!updateButton.disabled) updateButton.textContent = "Atualizar agora";
  }
  const repairButton = $("pwa-repair-button");
  if (repairButton) repairButton.hidden = !(state.error && updateAvailable);
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
