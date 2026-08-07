import { OccurrenceResolver } from "../packages/occurrence-runtime/src/index.js";
import { instanceOccurrenceId } from "../packages/instance-graph/src/index.js";
import { SelectionOperations } from "../packages/selection-operations/src/SelectionOperations.js";
import { SelectionPropertyService } from "../packages/property-registry/src/SelectionPropertyService.js";
import { ComplexityReporter } from "../packages/complexity-audit/src/index.js";

let passed = 0;
function check(condition, label) {
  if (!condition) throw new Error(label);
  passed += 1;
}

const root = Object.freeze({
  id: "root-1",
  kind: "instance",
  definitionId: "assembly-1",
  position: [10, 0, 0],
  rotation: [0, 0, 0, 1],
  scale: [1, 1, 1]
});
const childId = instanceOccurrenceId("root-1", ["slot-a"]);
const child = Object.freeze({
  id: childId,
  kind: "box",
  parentId: "root-1",
  position: [1, 0, 0],
  rotation: [0, 0, 0, 1],
  scale: [1, 1, 1],
  appearanceId: "appearance-1",
  projectedInstance: true
});
const occurrence = Object.freeze({
  id: childId,
  rootId: "root-1",
  path: Object.freeze(["slot-a"]),
  definition: Object.freeze({ id: "object-box", type: "object" }),
  override: null,
  object: child,
  rootInstance: root
});
const dispatched = [];
const fakeSandbox = {
  revision: 7,
  getSnapshot: () => ({ objects: [root] }),
  getRawObject: id => id === "root-1" ? root : null,
  getObject: id => id === "root-1" ? root : id === childId ? child : null,
  getInstanceOccurrence: id => id === childId ? occurrence : null,
  getObjectWorldMatrix: id => id === childId
    ? [1,0,0,0, 0,1,0,0, 0,0,1,0, 11,0,0,1]
    : [1,0,0,0, 0,1,0,0, 0,0,1,0, 10,0,0,1],
  getObjectDescendantIds: (ids, { includeRoots } = {}) => Object.freeze(
    ids.includes(childId)
      ? includeRoots ? [childId] : []
      : includeRoots ? ["root-1", childId] : [childId]
  ),
  listObjectChildren: id => ({ items: id === "root-1" ? [childId] : [], total: id === "root-1" ? 1 : 0 }),
  subscribe: () => () => {},
  dispatch(command) { dispatched.push(command); return true; }
};
const resolver = new OccurrenceResolver({ sandbox: fakeSandbox });
const reporter = new ComplexityReporter();

const ref = resolver.toRef(childId);
check(ref.rootInstanceId === "root-1" && ref.path[0] === "slot-a", "canonical occurrence ref");
check(resolver.id(ref) === childId, "occurrence id roundtrip");
check(resolver.object(ref) === child, "resolve projected object");
const resolved = resolver.resolve(ref);
check(resolved.definitionId === "object-box", "resolved definition");
check(resolved.transform.world[12] === 11, "resolved world transform");
check(resolver.descendantIds([childId], { includeRoots: true }).length === 1, "local descendants");

const selectionState = {
  id: "selection-local",
  members: [{ objectId: childId }],
  snapshot() { return { members: [...this.members], activeMember: this.members.at(-1) ?? null }; },
  replaceMany(next) { this.members = [...next]; }
};
const editor = {
  selection: selectionState,
  snapshot: () => ({ pivot: { policy: "median" } }),
  pivot: { policy: "median", reference: null, position: [0,0,0] }
};
const ops = new SelectionOperations({
  editor,
  sandbox: fakeSandbox,
  regionId: "region-main",
  occurrenceResolver: resolver,
  complexityReporter: reporter
});
const deletion = ops.deleteIds([childId]);
check(deletion.changed && dispatched.at(-1).ids[0] === childId, "delete uses occurrence id");
selectionState.members = [{ objectId: childId }];
const move = ops.translate([2, 0, 0]);
check(move.changed && dispatched.at(-1).type === "selection.transform", "transform dispatch");
check(dispatched.at(-1).transforms[0].id === childId, "transform keeps occurrence identity");

const propertyResolver = {
  exists: id => id === childId,
  object: id => id === childId ? child : null,
  descendantIds: ids => Object.freeze([...ids]),
  withScope: (_scope, fn) => fn()
};
const propertySandbox = {
  getObject() { throw new Error("SelectionPropertyService não deve depender de sandbox.getObject com resolver."); },
  getObjectDescendantIds() { throw new Error("não deve usar descendentes do Sandbox"); },
  dispatch: () => true
};
const registry = {
  inspect: targets => ({ test: { value: targets[0]?.id ?? null } }),
  describe: () => ({ properties: [{ id: "test" }] }),
  require: () => ({ id: "test", writable: true, nullable: true, normalize: value => value, read: () => null, scope: "object", path: ["test"] })
};
const propertyService = new SelectionPropertyService({
  selection: selectionState,
  sandbox: propertySandbox,
  appearanceRuntime: {},
  registry,
  occurrenceResolver: propertyResolver,
  complexityReporter: reporter
});
const inspection = propertyService.inspectSelection();
check(inspection.count === 1 && inspection.targetIds[0] === childId, "Inspector property service uses resolver");

const status = reporter.status();
check(status.recordCount >= 3, "complexity records emitted");
check(resolver.status().resolveCalls >= 1, "resolver diagnostics");

ops.dispose?.();
console.log(`Occurrence migration 0053b: ${passed}/12 testes aprovados.`);
