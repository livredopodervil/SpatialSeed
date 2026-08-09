import { CoordinatedSandbox } from "../packages/local-viewers/src/CoordinatedSandbox.js";

const calls = [];
const base = {
  region: {},
  reducer: () => {},
  baseVersion: 1,
  revision: 2,
  dirty: false,
  objectCount: 1,
  dispatch(command) { calls.push(["dispatch", command]); return true; },
  subscribe() { return () => {}; },
  getSnapshot() { return { objects: [{ id: "root" }] }; },
  getState() { return { objects: [{ id: "root" }] }; },
  getBaseState() { return { objects: [] }; },
  materializeState() { return { materialized: true }; },
  getObjectPosition(id) { return id === "root" ? 0 : -1; },
  getObjectDescendantIds(ids, options) {
    calls.push(["desc", ids, options]);
    return Object.freeze(["root", "root:slot:1"]);
  },
  getRawObject(id) { return id === "root" ? { id: "root", raw: true } : null; },
  getInstanceOccurrence(id) {
    return id === "root:slot:1" ? { id, rootId: "root", path: ["slot:1"] } : null;
  },
  getObject(id) { return { id }; },
  getObjectWorldMatrix() { return Array(16).fill(0).map((_, i) => i % 5 === 0 ? 1 : 0); },
  getObjectParentWorldMatrix() { return Array(16).fill(0).map((_, i) => i % 5 === 0 ? 1 : 0); },
  getObjects(ids) { return ids.map(id => ({ id })); },
  listObjectChildren() { return { items: ["root:slot:1"], offset: 0, limit: 1, total: 1, nextOffset: null }; },
  getObjectChildCount() { return 1; },
  getHistoryDiagnostics() { return {}; },
  createProposal() { return {}; },
  previewCommandSequence() { return {}; },
  undo() { return false; },
  redo() { return false; },
  discard() {},
  rebaseFromRegion() {},
  replaceState() {},
  restoreCommandSequence() {}
};
const coordinator = {
  dispatch(command) { return base.dispatch(command); },
  status() { return { canUndo: false, canRedo: false }; },
  subscribe() { return () => {}; },
  requireAuthority() {}
};

const sandbox = new CoordinatedSandbox({ sandbox: base, coordinator });
const descendants = sandbox.getObjectDescendantIds(["root"], { includeRoots: true });
if (descendants.length !== 2 || descendants[1] !== "root:slot:1") {
  throw new Error("getObjectDescendantIds não foi encaminhado.");
}
if (sandbox.getInstanceOccurrence("root:slot:1")?.rootId !== "root") {
  throw new Error("getInstanceOccurrence não foi encaminhado.");
}
if (!sandbox.getRawObject("root")?.raw) {
  throw new Error("getRawObject não foi encaminhado.");
}
if (sandbox.getObjectChildCount("root") !== 1) {
  throw new Error("getObjectChildCount não foi encaminhado.");
}
if (!sandbox.materializeState().materialized) {
  throw new Error("materializeState não foi encaminhado.");
}
console.log("CoordinatedSandbox 0052c: 5/5 testes aprovados.");
