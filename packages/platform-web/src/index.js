export {
  WEB_APPLICATION_DEFINITION_VERSION,
  WEB_RUNTIME_EXTENSION_API_VERSION,
  activateWebRuntimeExtensions,
  loadWebApplicationDefinition,
  loadWebRuntimeExtensions,
  normalizeWebApplicationDefinition,
  webApplicationName
} from "./ApplicationDefinition.js?build=20260818-0054mx";
export {
  BuildInfoError,
  formatBuildLabel,
  loadBuildInfo,
  normalizeBuildInfo
} from "./BuildInfo.js?build=20260818-0054mx";
export {
  BrowserProjectFileGateway,
  isPlatformBlock
} from "./BrowserProjectFileGateway.js?build=20260818-0054mx";
export { BrowserAssetFileGateway } from "./BrowserAssetFileGateway.js?build=20260818-0054mx";
export {
  BrowserProcedureCatalogStore,
  DEFAULT_PROCEDURE_CATALOG_STORAGE_KEY
} from "./BrowserProcedureCatalogStore.js?build=20260818-0054mx";
export {
  PwaInstallController,
  isStandalone
} from "./PwaInstallController.js?build=20260818-0054mx";
export {
  formatPwaBuildLabel,
  pwaUpdateAvailable,
  registerPwa,
  resolvePwaLocations,
  workerBuild
} from "./PwaRegistration.js?build=20260818-0054mx";
export {
  loadUiConfiguration
} from "./UiConfigurationLoader.js?build=20260818-0054mx";
export {
  DEFAULT_DEMO_LAUNCH_POLICY_VERSION,
  shouldStartDefaultDemoAfterRecovery
} from "./DefaultDemoLaunchPolicy.js?build=20260818-0054mx";
