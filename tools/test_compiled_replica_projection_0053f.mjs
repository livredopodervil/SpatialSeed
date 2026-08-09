import {
  duplicateReferenceRoots,
  instanceGraphCompiledProjectionDiagnostics,
  projectInstanceGraphObject
} from "../packages/instance-graph/src/InstanceGraph.js?build=20260808-0053f";

const leaf = Object.freeze({
  id: "leaf",
  kind: "box",
  name: "Leaf",
  parentId: "group",
  position: [1,0,0], rotation: [0,0,0,1], scale: [1,1,1],
  geometry: Object.freeze({type:"box",size:[1,1,1]})
});
const group = Object.freeze({
  id:"group", kind:"group", name:"Group", parentId:null,
  position:[0,0,0], rotation:[0,0,0,1], scale:[1,1,1], pivot:[0,0,0]
});
let scene = Object.freeze({objects:Object.freeze([group,leaf])});
const specs = Array.from({length:50},(_,i)=>({
  sourceId:"group", id:`copy-${i}`, name:`copy-${i}`,
  parentId:null, position:[i*2,0,0], rotation:[0,0,0,1], scale:[1,1,1]
}));
const duplicated=duplicateReferenceRoots(scene,specs);
scene=duplicated.scene;
const roots=scene.objects.filter(o=>o.definitionId && o.kind==="group");
for (const root of roots) projectInstanceGraphObject(scene,root);
const d=instanceGraphCompiledProjectionDiagnostics();
if (d.definitionCompilations !== 1) throw new Error(`compilações=${d.definitionCompilations}`);
if (d.definitionCacheHits < 49) throw new Error(`hits=${d.definitionCacheHits}`);
if (scene.instanceGraph.definitions && Object.keys(scene.instanceGraph.definitions).length !== 2) {
  throw new Error("definições foram duplicadas");
}
console.log("Compiled replica projection 0053f: 3/3.");
