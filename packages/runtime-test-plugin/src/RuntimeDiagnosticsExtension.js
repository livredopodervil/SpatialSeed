import {
  WEB_RUNTIME_EXTENSION_API_VERSION
} from "../../platform-web/src/index.js?build=20260802-0047d";
import {
  BenchmarkRunner
} from "../../benchmarks/src/index.js?build=20260802-0047a";
import {
  ResourceAudit
} from "../../resource-audit/src/index.js?build=20260714-0020b-a";
import {
  TestService
} from "../../tests/src/index.js?build=20260802-0047d";
import {
  activateRuntimeTestPlugin
} from "./RuntimeTestPlugin.js?build=20260802-0047e";

export const runtimeDiagnosticsManifest = Object.freeze({
  id: "spatialseed.diagnostics.runtime-tests",
  apiVersion: WEB_RUNTIME_EXTENSION_API_VERSION,
  role: "diagnostics"
});

const DIAGNOSTIC_COMMAND_IDS = Object.freeze([
  "runtime.test.help",
  "runtime.test.run",
  "test.help",
  "test.run",
  "runtime.resources",
  "benchmark.help",
  "benchmark.compact",
  "benchmark.scene",
  "benchmark.selection",
  "benchmark.compare",
  "benchmark.history",
  "benchmark.clear"
]);

export function activateRuntimeDiagnostics(host) {
  const {
    commands,
    reducer,
    projectService,
    sandbox,
    editor,
    renderer,
    appearanceRuntime,
    selectionOperations
  } = validateHost(host);
  assertCommandsAvailable(commands, DIAGNOSTIC_COMMAND_IDS);

  const benchmarkRunner = new BenchmarkRunner({ reducer, projectService });
  const resourceAudit = new ResourceAudit({
    sandbox,
    editor,
    renderer,
    appearanceRuntime,
    selectionOperations
  });
  const testService = new TestService({
    reducer,
    commands,
    projectService
  });
  const runtimeTests = activateRuntimeTestPlugin({ commands });

  commands
    .register("test.help", () => testService.help())
    .register("test.run", ({ suite }) => testService.run(suite))
    .register("runtime.resources", () => resourceAudit.collect())
    .register("benchmark.help", () => benchmarkRunner.help())
    .register("benchmark.compact", args => benchmarkRunner.runCompact(args))
    .register("benchmark.scene", args => benchmarkRunner.runScene(args))
    .register("benchmark.selection", args =>
      renderer.benchmarkSelectionOutlines(args))
    .register("benchmark.compare", () => benchmarkRunner.compare())
    .register("benchmark.history", () => benchmarkRunner.list())
    .register("benchmark.clear", () => benchmarkRunner.clear());

  return Object.freeze({
    manifest: runtimeDiagnosticsManifest,
    runtimeTests: runtimeTests.manifest,
    dispose() {}
  });
}

export const webRuntimeExtension = Object.freeze({
  manifest: runtimeDiagnosticsManifest,
  activate: activateRuntimeDiagnostics
});

function validateHost(host) {
  if (!host || typeof host !== "object") {
    throw new TypeError("Host de diagnóstico é obrigatório.");
  }
  if (
    !host.commands ||
    typeof host.commands.register !== "function" ||
    typeof host.commands.describe !== "function"
  ) {
    throw new TypeError("Registro de comandos de diagnóstico incompatível.");
  }
  for (const key of [
    "reducer",
    "projectService",
    "sandbox",
    "editor",
    "renderer"
  ]) {
    if (!host[key]) {
      throw new TypeError(`Capability de diagnóstico ausente: ${key}.`);
    }
  }
  return host;
}

function assertCommandsAvailable(commands, ids) {
  const existing = new Set(commands.describe().map(command => command.id));
  const conflicts = ids.filter(id => existing.has(id));
  if (conflicts.length) {
    throw new Error(
      `Comandos de diagnóstico já registrados: ${conflicts.join(", ")}.`
    );
  }
}
