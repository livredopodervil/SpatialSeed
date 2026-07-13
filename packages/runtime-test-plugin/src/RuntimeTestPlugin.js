import {
  createRuntimeLayerTests,
  runRuntimeTests
} from "./RuntimeLayerTests.js";

export const manifest = Object.freeze({
  id: "runtime-layer-tests",
  version: "0.1.0",
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
