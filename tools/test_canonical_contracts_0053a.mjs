import {
  createOccurrenceRef,
  childOccurrenceRef,
  occurrenceRefEquals,
  occurrenceRefKey
} from "../packages/occurrence-contracts/src/index.js";
import { createEditPatch } from "../packages/edit-contracts/src/index.js";
import { createPreviewDescriptor, assertPreviewIsolation } from "../packages/preview-contracts/src/index.js";
import { createRenderNode, createRenderDelta, renderDeltaWorkSize, assertRenderNodeIsolation } from "../packages/render-contracts/src/index.js";
import { ComplexityCounters, ComplexityScope, ComplexityReporter } from "../packages/complexity-audit/src/index.js";

let passed = 0;
const check = (condition, message) => {
  if (!condition) throw new Error(message);
  passed += 1;
};

const root = createOccurrenceRef({ rootInstanceId: "root-1" });
const child = childOccurrenceRef(root, "slot-a");
check(child.path.length === 1, "child path");
check(occurrenceRefEquals(child, { version: "occurrence-ref-v1", rootInstanceId: "root-1", path: ["slot-a"] }), "equality");
check(occurrenceRefKey(child).includes("slot-a"), "key");

const patch = createEditPatch({ operations: [{ type: "hide-occurrence", target: child, value: true }] });
check(patch.operations.length === 1, "edit patch");

const preview = createPreviewDescriptor({ id: "p1", owner: "tool:test", kind: "geometry", target: child, revision: 1 });
check(assertPreviewIsolation(preview) === preview, "preview isolation");

const node = createRenderNode({ renderNodeId: "r1", occurrenceRef: child, flags: {} });
check(assertRenderNodeIsolation(node) === node, "render isolation");
check(renderDeltaWorkSize(createRenderDelta({ changed: [node] })) === 1, "delta work size");

const counters = new ComplexityCounters();
const scope = new ComplexityScope({ id: "test", operation: "selection.translate.single", counters });
scope.count("instancesVisited", 1);
scope.count("renderNodesChanged", 1);
scope.count("shardsChanged", 1);
const reporter = new ComplexityReporter();
const record = reporter.record(scope.finish());
check(record.budget.ok === true, "complexity budget");
check(reporter.status().failureCount === 0, "reporter status");
check(root.version === "occurrence-ref-v1", "occurrence ref version");

console.log(`Canonical contracts 0053a: ${passed}/10 testes aprovados.`);
