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
  const { startApplication }=await import(
    `./main.js?build=${cacheKey}`
  );
  await startApplication(buildInfo,uiConfiguration);
} catch (error) {
  showFatalError(error);
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
