#!/usr/bin/env node
import { register } from "node:module";

register("./node_vendor_loader.mjs", import.meta.url);

const {
  createRuntimeLayerTests,
  runRuntimeTests
} = await import("../packages/runtime-test-plugin/src/RuntimeLayerTests.js");

const DOM_ONLY = Object.freeze([
  Object.freeze({
    suite: "object-inspector",
    test: "painel fechado adia inspeção até ser aberto",
    reason: "requires-browser-dom"
  }),
  Object.freeze({
    suite: "interaction-composer",
    test: "compositor mostra somente o comportamento do objeto selecionado",
    reason: "requires-browser-dom"
  }),
  Object.freeze({
    suite: "interaction-composer",
    test: "formulário deriva campos do catálogo e chama comando público",
    reason: "requires-browser-dom"
  })
]);

const requested = String(process.argv[2] ?? "all");
const suites = createRuntimeLayerTests();
const skipped = [];
for (const entry of DOM_ONLY) {
  if (requested !== "all" && requested !== entry.suite) continue;
  if (!suites[entry.suite]?.[entry.test]) continue;
  delete suites[entry.suite][entry.test];
  skipped.push(entry);
}

const result = await runRuntimeTests(suites, requested, {
  failuresOnly: true
});
const report = Object.freeze({
  scope: result.scope,
  suite: requested,
  passed: result.passed,
  failed: result.failed,
  total: result.total,
  skipped: Object.freeze(skipped),
  ok: result.ok,
  durationMs: result.durationMs,
  failures: Object.freeze(result.results)
});

console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exitCode = 1;
