import {
  TransformHierarchyKernel,
  groupWithTransformKernel,
  ungroupWithTransformKernel,
  TransformOverlay
} from "../packages/transform-hierarchy/src/index.js";

const tests=[];
function test(name,fn){tests.push([name,fn]);}
function near(a,b,eps=1e-7){return Math.abs(a-b)<=eps;}
function vecNear(a,b){if(a.length!==b.length||a.some((x,i)=>!near(x,b[i])))throw new Error(`Esperado ${JSON.stringify(b)}, recebido ${JSON.stringify(a)}`);}

const base=[
 {id:"parent",kind:"group",position:[10,0,0],rotation:[0,0,0,1],scale:[1,1,1],anchor:[0,0,0],pivot:[0,0,0]},
 {id:"child",kind:"box",parentId:"parent",position:[0,2,0],rotation:[0,0,0,1],scale:[1,1,1],pivot:[1,0,0]},
 {id:"other",kind:"box",position:[20,0,0],rotation:[0,0,0,1],scale:[1,1,1]}
];

test("filho deriva world do pai sem alterar local",()=>{
 const k=new TransformHierarchyKernel(base);
 vecNear(k.worldPointOf("child"),[10,2,0]);
 vecNear(k.worldPivotOf("child"),[11,2,0]);
 vecNear(k.node("child").position,[0,2,0]);
});

test("seleção individual prefere pivô do próprio objeto",()=>{
 const k=new TransformHierarchyKernel(base);
 vecNear(k.selectionPivotWorld(["child"]),[11,2,0]);
});

test("reparent preserve world produz local relativo ao novo pai",()=>{
 const nodes=[...base,{id:"new-parent",kind:"group",position:[5,0,0],rotation:[0,0,0,1],scale:[1,1,1]}];
 const k=new TransformHierarchyKernel(nodes);
 const local=k.reparentLocalTransform("child","new-parent");
 vecNear(local.position,[5,2,0]);
});

test("group preserva world de todos os alvos",()=>{
 const source=[
   {id:"a",kind:"box",position:[1,2,0],rotation:[0,0,0,1],scale:[1,1,1]},
   {id:"b",kind:"box",position:[5,2,0],rotation:[0,0,0,1],scale:[1,1,1]}
 ];
 const before=new TransformHierarchyKernel(source);
 const aw=before.worldMatrixOf("a"), bw=before.worldMatrixOf("b");
 const grouped=groupWithTransformKernel(source,{groupId:"g",targetIds:["a","b"]});
 const after=new TransformHierarchyKernel(grouped.nodes);
 vecNear(after.worldMatrixOf("a"),aw);
 vecNear(after.worldMatrixOf("b"),bw);
 vecNear(after.worldPivotOf("g"),[3,2,0]);
});

test("ungroup preserva world dos filhos",()=>{
 const source=[
   {id:"g",kind:"group",position:[3,2,0],rotation:[0,0,0,1],scale:[1,1,1],anchor:[0,0,0],pivot:[0,0,0]},
   {id:"a",kind:"box",parentId:"g",position:[-2,0,0],rotation:[0,0,0,1],scale:[1,1,1]},
   {id:"b",kind:"box",parentId:"g",position:[2,0,0],rotation:[0,0,0,1],scale:[1,1,1]}
 ];
 const before=new TransformHierarchyKernel(source);
 const aw=before.worldMatrixOf("a"), bw=before.worldMatrixOf("b");
 const result=ungroupWithTransformKernel(source,{groupIds:["g"]});
 const after=new TransformHierarchyKernel(result.nodes);
 vecNear(after.worldMatrixOf("a"),aw);
 vecNear(after.worldMatrixOf("b"),bw);
});

test("overlay é transitório e separado do transform base",()=>{
 const overlay=new TransformOverlay();
 overlay.set("child",{position:[1,0,0]},{owner:"drag"});
 if(overlay.snapshot().length!==1)throw new Error("overlay ausente");
 if(overlay.clearOwner("drag")!==1)throw new Error("overlay não removido");
 if(overlay.snapshot().length!==0)throw new Error("overlay persistiu");
});

let passed=0;
for(const [name,fn] of tests){try{fn();passed++;}catch(e){console.error(`FALHOU: ${name}: ${e.message}`);process.exitCode=1;}}
console.log(`Transform hierarchy 0053d: ${passed}/${tests.length}`);
