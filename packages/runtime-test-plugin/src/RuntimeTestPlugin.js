import {
  createRuntimeLayerTests,
  runRuntimeTests
} from "./RuntimeLayerTests.js?build=20260718-0027h";

export const manifest = Object.freeze({
  id: "runtime-layer-tests",
  version: "0.5.3",
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
        "runtime test editor",
        "runtime test clock",
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
        "runtime test pwa-status",
        "runtime test ui-configuration",
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
