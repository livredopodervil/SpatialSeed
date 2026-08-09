import { MeshEditController } from "../packages/mesh-editor-core/src/MeshEditController.js";

const occurrenceId = "root:slot:5";
const object = {
  id: occurrenceId,
  kind: "mesh",
  name: "Occurrence",
  parentId: "root",
  position: [0,0,0],
  rotation: [0,0,0,1],
  scale: [1,1,1],
  geometry: { type: "tube", points: [[0,0,0],[1,0,0]], radius: 0.1 }
};
const identity = [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
const sandbox = {
  revision: 0,
  dispatch() { return true; },
  subscribe() { return () => {}; },
  getSnapshot() { return { objects: [] }; },
  getObject(id) { return id === occurrenceId ? object : null; },
  getObjectWorldMatrix(id) { return id === occurrenceId ? identity : null; },
  getInstanceOccurrence(id) { return id === occurrenceId ? { id, rootId: "root", path: ["slot:5"] } : null; }
};
const editor = {
  selection: {
    snapshot() { return { members: [{ objectId: occurrenceId }] }; }
  }
};
const calls = [];
const renderer = {
  canBeginMeshEdit(id) { return { ok: id === occurrenceId }; },
  beginMeshEdit(args) { calls.push(["begin", args.objectId]); },
  endMeshEdit() {},
  setTransformMode(mode) { calls.push(["mode", mode]); },
  updateMeshEditComponentSelection(args) { calls.push(["sync", args.selectedVertices.length]); },
  getMeshEditStatus() { return {}; }
};
const geometryRegistry = {
  supportsLegacyObject(candidate) { return candidate?.id === occurrenceId; },
  describeLegacyObject() { return { type: "tube", points: [[0,0,0],[1,0,0]], radius: 0.1 }; },
  normalize(value) { return value.type === "buffer" ? { ...value } : value; },
  key(value) { return JSON.stringify(value); },
  create() { throw new Error("create não deveria ser chamado para tube path source"); }
};
const controller = new MeshEditController({ sandbox, editor, renderer, geometryRegistry });
const status = controller.enter({ selectAll: true });
if (!status.active) throw new Error("Sessão não iniciou para ocorrência projetada.");
if (!calls.some(([kind,id]) => kind === "begin" && id === occurrenceId)) throw new Error("Renderer não recebeu ocorrência.");
if (!calls.some(([kind,mode]) => kind === "mode" && mode === "translate")) throw new Error("Translate inicial não foi ativado.");
if (!calls.some(([kind,count]) => kind === "sync" && count === 2)) throw new Error("Seleção inicial não foi resincronizada.");
console.log("Mesh occurrence enter 0052c: 4/4 testes aprovados.");
