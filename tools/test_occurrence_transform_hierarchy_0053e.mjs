import { OccurrenceTransformHierarchy } from "../packages/transform-hierarchy/src/OccurrenceTransformHierarchy.js?build=20260808-0053e";

const objects = new Map([
  ["root", { id:"root", position:[10,0,0], rotation:[0,0,0,1], scale:[1,1,1] }],
  ["child", { id:"child", parentId:"root", position:[0,2,0], rotation:[0,0,0,1], scale:[1,1,1], anchorRef:{mode:"reference",target:"root",point:[1,0,0],offset:[0,0,0]} }]
]);
const identity=(x=0,y=0,z=0)=>[1,0,0,0,0,1,0,0,0,0,1,0,x,y,z,1];
const resolver={
  revision:1,
  toRef(v){ return typeof v === "string" ? {rootInstanceId:v,path:[]} : v; },
  id(v){ return typeof v === "string" ? v : v.rootInstanceId; },
  object(v){ return objects.get(this.id(v)) ?? null; },
  exists(v){ return !!this.object(v); },
  parent(v){ const o=this.object(v); return o?.parentId ? this.toRef(o.parentId) : null; },
  children(v){ const id=this.id(v); return [...objects.values()].filter(o=>o.parentId===id).map(o=>this.toRef(o.id)); },
  resolve(v){ const id=this.id(v); const o=this.object(id); if(!o)return null; return {transform:{world:id==="root"?identity(10,0,0):identity(10,2,0)}}; },
  status(){ return {revision:this.revision}; }
};
const h=new OccurrenceTransformHierarchy({occurrenceResolver:resolver});
let passed=0; const ok=(v,m)=>{if(!v)throw new Error(m); passed+=1};
ok(JSON.stringify(h.localTransform("child").position)==="[0,2,0]","local relative to parent");
ok(JSON.stringify(h.worldMatrix("child").slice(12,15))==="[10,2,0]","world resolved");
ok(JSON.stringify(h.anchor("child").world)==="[11,0,0]","referenced anchor");
const local=h.worldToLocalTransform("child",identity(12,5,0));
ok(JSON.stringify(local.position.map(v=>Math.round(v*1e6)/1e6))==="[2,5,0]","world to parent local");
h.worldMatrix("child");
ok(h.status().statistics.sceneScans===0,"no scene scan");
ok(h.status().statistics.cacheHits>0,"cache hit");
console.log(`Occurrence transform hierarchy 0053e: ${passed}/6`);
