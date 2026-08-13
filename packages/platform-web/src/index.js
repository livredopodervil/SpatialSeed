export {
  WEB_APPLICATION_DEFINITION_VERSION,
  WEB_RUNTIME_EXTENSION_API_VERSION,
  activateWebRuntimeExtensions,
  loadWebApplicationDefinition,
  loadWebRuntimeExtensions,
  normalizeWebApplicationDefinition,
  webApplicationName
} from "./ApplicationDefinition.js?build=20260813-0054mk";
export {
  BuildInfoError,
  formatBuildLabel,
  loadBuildInfo,
  normalizeBuildInfo
} from "./BuildInfo.js?build=20260813-0054mk";
export {
  BrowserProjectFileGateway,
  isPlatformBlock
} from "./BrowserProjectFileGateway.js?build=20260813-0054mk";
export { BrowserAssetFileGateway } from "./BrowserAssetFileGateway.js?build=20260813-0054mk";
export {
  BrowserProcedureCatalogStore,
  DEFAULT_PROCEDURE_CATALOG_STORAGE_KEY
} from "./BrowserProcedureCatalogStore.js?build=20260813-0054mk";
export {
  PwaInstallController,
  isStandalone
} from "./PwaInstallController.js?build=20260813-0054mk";
export {
  formatPwaBuildLabel,
  pwaUpdateAvailable,
  registerPwa,
  resolvePwaLocations,
  workerBuild
} from "./PwaRegistration.js?build=20260813-0054mk";
export {
  loadUiConfiguration
} from "./UiConfigurationLoader.js?build=20260813-0054mk";
