import {
  createRuntimeLayerTests,
  runRuntimeTests
} from "./RuntimeLayerTests.js?build=20260727-0033a";

export const manifest = Object.freeze({
  id: "runtime-layer-tests",
  version: "0.9.0",
  apiVersion: "runtime-test-plugin-v1",
  capabilities: Object.freeze([
    "commands",
    "tests"
  ])
});

export function activateRuntimeTestPlugin({ commands }) {
  if (!commands || typeof commands.register !== "function") {
    throw new TypeError(
      "Registro de comandos incompatível."
    );
  }

  const suites = createRuntimeLayerTests();

  commands
    .register("runtime.test.help", () => ({
      plugin: manifest,
      commands: [
        "runtime test viewer",
        "runtime test viewer-coordination",
        "runtime test viewer-animation",
        "runtime test editor",
        "runtime test clock",
        "runtime test animation-runtime",
        "runtime test animation-commands",
        "runtime test animation-tracks",
        "runtime test simulation",
        "runtime test runtime-profile",
        "runtime test object-inspector",
        "runtime test program-planning",
        "runtime test program-evaluation",
        "runtime test program-session",
        "runtime test procedure-catalog",
        "runtime test procedure-editor",
        "runtime test spatial-planning",
        "runtime test spatial-plan-commit",
        "runtime test experiment-contract",
        "runtime test experiment-plugin",
        "runtime test experiment-panel",
        "runtime test property-contract",
        "runtime test placement-frame",
        "runtime test geometry-creation",
        "runtime test geometry-registry",
        "runtime test file-interop",
        "runtime test project-files",
        "runtime test project-recovery",
        "runtime test pwa-status",
        "runtime test ui-configuration",
        "runtime test ui-actions",
        "runtime test viewer-render-settings",
        "runtime test batch-material-cache",
        "runtime test mesh-edit-math",
        "runtime test all"
      ],
      suites: Object.fromEntries(
        Object.entries(suites).map(([name, tests]) => [
          name,
          Object.keys(tests)
        ])
      )
    }))
    .register(
      "runtime.test.run",
      ({ suite = "all" } = {}) =>
        runRuntimeTests(suites, suite)
    );

  return Object.freeze({ manifest });
}
