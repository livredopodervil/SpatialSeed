import {
  PwaInstallController,
  formatPwaBuildLabel,
  formatBuildLabel,
  loadBuildInfo,
  loadUiConfiguration,
  loadWebApplicationDefinition,
  loadWebRuntimeExtensions,
  registerPwa,
  resolvePwaLocations,
  webApplicationName,
  workerBuild
} from "../../packages/platform-web/src/index.js?build=20260802-0047d";

const $=id => document.getElementById(id);
const pwaInstallController=new PwaInstallController({windowRef:window});

try {
  const buildInfo=await loadBuildInfo();
  exposeBuildInfo(buildInfo);
  await ensureCurrentServiceWorker(buildInfo);
  const [uiConfiguration,applicationDefinition]=await Promise.all([
    loadUiConfiguration(),
    loadWebApplicationDefinition({
      name:webApplicationName(location),
      applicationRootUrl:import.meta.url
    })
  ]);
  const runtimeExtensions=await loadWebRuntimeExtensions(
    applicationDefinition
  );
  exposeApplicationDefinition(applicationDefinition);
  await loadStylesheet(buildInfo);

  const cacheKey=encodeURIComponent(buildInfo.build);
  const { startApplication }=await import(`./main.js?build=${cacheKey}`);
  await startApplication(buildInfo,uiConfiguration,{
    applicationDefinition,
    runtimeExtensions,
    pwaInstallController
  });
  registerPwa(buildInfo,{
    applicationUrl:import.meta.url,
    onStateChange: state => exposePwaState(
      buildInfo,
      state,
      formatPwaBuildLabel
    )
  });
} catch (error) {
  showFatalError(error);
}

async function ensureCurrentServiceWorker(buildInfo) {
  const serviceWorkers=navigator.serviceWorker;
  if (!serviceWorkers || !isTrustedOrigin()) return;

  const controllerBuild=workerBuild(serviceWorkers.controller);
  if (controllerBuild === buildInfo.build) return;

  const locations=resolvePwaLocations(import.meta.url);
  const workerUrl=new URL(locations.workerUrl);
  workerUrl.searchParams.set("build",buildInfo.build);
  const registration=await serviceWorkers.register(workerUrl,{
    scope:locations.scopeUrl
  });
  await registration.update().catch(() => {});

  if (workerBuild(serviceWorkers.controller) === buildInfo.build) return;
  const updated=await waitForControllerBuild(
    serviceWorkers,
    buildInfo.build,
    5000
  );
  if (updated) {
    location.reload();
    await never();
  }

  if (controllerBuild && controllerBuild !== buildInfo.build) {
    const resetUrl=new URL(
      "../reset-spatialseed-cache.html",
      locations.applicationRoot
    );
    resetUrl.searchParams.set("return","./web/");
    resetUrl.searchParams.set("build",buildInfo.build);
    location.replace(resetUrl);
    await never();
  }
}

function waitForControllerBuild(serviceWorkers,expectedBuild,timeoutMs) {
  if (workerBuild(serviceWorkers.controller) === expectedBuild) {
    return Promise.resolve(true);
  }
  return new Promise(resolve => {
    let settled=false;
    const finish=value => {
      if (settled) return;
      settled=true;
      clearTimeout(timer);
      serviceWorkers.removeEventListener("controllerchange",onChange);
      resolve(value);
    };
    const onChange=() => finish(
      workerBuild(serviceWorkers.controller) === expectedBuild
    );
    const timer=setTimeout(() => finish(false),timeoutMs);
    serviceWorkers.addEventListener("controllerchange",onChange);
  });
}

function isTrustedOrigin() {
  return window.isSecureContext || [
    "localhost",
    "127.0.0.1",
    "[::1]"
  ].includes(location.hostname);
}

function never() {
  return new Promise(() => {});
}

function exposePwaState(buildInfo,state,formatLabel) {
  const content=$("build-content");
  content.textContent=formatLabel(buildInfo,state);
  content.title=[
    `Publicado: ${state.publishedBuild}`,
    `Cache controlador: ${state.controllerBuild ?? "rede"}`,
    `Ativo: ${state.activeBuild ?? "ausente"}`,
    `Aguardando: ${state.waitingBuild ?? "ausente"}`
  ].join("\n");
  document.documentElement.dataset.controllerBuild =
    state.controllerBuild ?? "network";
  document.documentElement.dataset.updatePending =
    state.updatePending ? "true" : "false";
}

function exposeBuildInfo(buildInfo) {
  let meta=document.querySelector('meta[name="spatial-seed-build"]');
  if (!meta) {
    meta=document.createElement("meta");
    meta.name="spatial-seed-build";
    document.head.append(meta);
  }
  meta.content=buildInfo.build;
  document.documentElement.dataset.build=buildInfo.build;
  $("build-content").textContent=formatBuildLabel(buildInfo);
}

function exposeApplicationDefinition(definition) {
  document.documentElement.dataset.application=definition.id;
  document.documentElement.dataset.applicationRole=definition.role;
}

function loadStylesheet(buildInfo) {
  return new Promise((resolve,reject) => {
    const link=document.createElement("link");
    link.rel="stylesheet";
    link.href=`./style.css?build=${encodeURIComponent(buildInfo.build)}`;
    link.addEventListener("load",resolve,{once:true});
    link.addEventListener("error",() => reject(
      new Error("Falha ao carregar a folha de estilos.")
    ),{once:true});
    document.head.append(link);
  });
}

function showFatalError(error) {
  const box=$("error-box");
  if (box) {
    box.hidden=false;
    box.textContent=error?.stack || String(error);
  }
  const status=$("status");
  if (status) status.textContent="Falha na inicialização";
  console.error(error);
}
