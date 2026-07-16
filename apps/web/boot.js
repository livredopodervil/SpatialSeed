import {
  formatBuildLabel,
  loadBuildInfo
} from "./BuildInfo.js";
import { loadUiConfiguration } from "./UiConfiguration.js";

const $=id => document.getElementById(id);

try {
  const [buildInfo,uiConfiguration]=await Promise.all([
    loadBuildInfo(),
    loadUiConfiguration()
  ]);
  exposeBuildInfo(buildInfo);
  await loadStylesheet(buildInfo);

  const cacheKey=encodeURIComponent(buildInfo.build);
  const [{ startApplication },pwaModule]=await Promise.all([
    import(`./main.js?build=${cacheKey}`),
    import(`./pwa/registerPwa.js?build=${cacheKey}`)
  ]);
  await startApplication(buildInfo,uiConfiguration);
  pwaModule.registerPwa(buildInfo,{
    onStateChange: state => exposePwaState(
      buildInfo,
      state,
      pwaModule.formatPwaBuildLabel
    )
  });
} catch (error) {
  showFatalError(error);
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
