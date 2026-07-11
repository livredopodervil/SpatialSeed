import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import { CommandHistory } from "./engine/CommandHistory.js";
import { SpatialBox } from "./objects/SpatialBox.js";

const $=id=>document.getElementById(id);
const canvas=$("world");
const renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:"high-performance"});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setSize(innerWidth,innerHeight);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
const scene=new THREE.Scene();scene.background=new THREE.Color(0x08101a);scene.fog=new THREE.Fog(0x08101a,40,180);
const camera=new THREE.PerspectiveCamera(55,innerWidth/innerHeight,.1,1000);camera.position.set(10,8,14);
const orbit=new OrbitControls(camera,renderer.domElement);orbit.enableDamping=true;orbit.dampingFactor=.08;orbit.target.set(0,1,0);orbit.minDistance=1;orbit.maxDistance=250;orbit.zoomToCursor=true;
const transform=new TransformControls(camera,renderer.domElement);scene.add(transform.getHelper());transform.setMode("translate");transform.setSize(1.25);
scene.add(new THREE.HemisphereLight(0xaecbff,0x182012,2.2));
const sun=new THREE.DirectionalLight(0xffffff,3);sun.position.set(8,16,10);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-30;sun.shadow.camera.right=30;sun.shadow.camera.top=30;sun.shadow.camera.bottom=-30;sun.shadow.camera.near=.5;sun.shadow.camera.far=100;sun.shadow.bias=-.0005;sun.shadow.normalBias=.02;scene.add(sun);
const grid=new THREE.GridHelper(200,100,0x6688aa,0x243142);grid.position.y=.02;scene.add(grid);
const ground=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.MeshStandardMaterial({color:0x101722,roughness:1}));ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;scene.add(ground);

const objects=[],raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2(),history=new CommandHistory(100),textureLoader=new THREE.TextureLoader();
let selected=null,transformBefore=null,tap=null;

function addBox(position=new THREE.Vector3()){
 const box=new SpatialBox({name:`Caixa ${objects.length+1}`,color:new THREE.Color().setHSL(Math.random(),.45,.55)});box.position.copy(position);box.position.y=Math.max(1,box.position.y);scene.add(box);objects.push(box);select(box);return box;
}
addBox(new THREE.Vector3(-3,1,0));addBox(new THREE.Vector3(0,1,0));addBox(new THREE.Vector3(3,1,0));

function select(object){selected=object??null;if(selected){transform.attach(selected);$("name").textContent=selected.userData.name??"Objeto";$("selection-state").textContent="1";canvas.className="cursor-selected"}else{transform.detach();$("name").textContent="Nenhum objeto";$("selection-state").textContent="∅";canvas.className="cursor-none"}syncPanel()}
function syncPanel(){const controls=document.querySelectorAll("#panel input,#panel textarea,#panel button");for(const c of controls)c.disabled=!selected;if(!selected){for(const id of["px","py","pz"])$(id).value="";return}$("px").value=selected.position.x.toFixed(3);$("py").value=selected.position.y.toFixed(3);$("pz").value=selected.position.z.toFixed(3);$("color").value=`#${selected.material.color.getHexString()}`;$("opacity").value=selected.material.opacity;$("category").value=selected.userData.category??"";$("description").value=selected.userData.description??"";$("morphisms").value=(selected.userData.morphisms??[]).map(m=>`${m.type} -> ${m.target}`).join("\n");const t=selected.material.map;$("repeat-u").value=t?.repeat.x??1;$("repeat-v").value=t?.repeat.y??1;$("offset-u").value=t?.offset.x??0;$("offset-v").value=t?.offset.y??0;$("texture-rotation").value=t?THREE.MathUtils.radToDeg(t.rotation):0;$("texture-center").value=t?`${t.center.x},${t.center.y}`:"0.5,0.5"}
function snapT(o){return{position:o.position.clone(),quaternion:o.quaternion.clone(),scale:o.scale.clone()}}
function applyT(o,s){o.position.copy(s.position);o.quaternion.copy(s.quaternion);o.scale.copy(s.scale);syncPanel()}
transform.addEventListener("mouseDown",()=>{if(selected)transformBefore=snapT(selected)});transform.addEventListener("dragging-changed",e=>orbit.enabled=!e.value);transform.addEventListener("mouseUp",()=>{if(!selected||!transformBefore)return;const object=selected,before=transformBefore,after=snapT(object);transformBefore=null;history.pushExecuted({label:"transformar objeto",do:()=>applyT(object,after),undo:()=>applyT(object,before)})});transform.addEventListener("objectChange",syncPanel);

renderer.domElement.addEventListener("pointerdown",e=>{tap={id:e.pointerId,x:e.clientX,y:e.clientY,time:performance.now(),type:e.pointerType}},true);
renderer.domElement.addEventListener("pointerup",e=>{if(!tap||tap.id!==e.pointerId||transform.dragging)return;const tolerance=tap.type==="touch"?26:8,durationLimit=tap.type==="touch"?550:350,moved=Math.hypot(e.clientX-tap.x,e.clientY-tap.y),duration=performance.now()-tap.time;tap=null;if(moved>tolerance||duration>durationLimit)return;const rect=renderer.domElement.getBoundingClientRect();pointer.x=((e.clientX-rect.left)/rect.width)*2-1;pointer.y=-((e.clientY-rect.top)/rect.height)*2+1;raycaster.setFromCamera(pointer,camera);if(raycaster.intersectObject(transform.getHelper(),true).length)return;const hit=raycaster.intersectObjects(objects,false)[0];select(hit?.object??null)},true);

document.querySelectorAll("[data-mode]").forEach(b=>b.onclick=()=>transform.setMode(b.dataset.mode));
$("space").onclick=e=>{const next=transform.space==="world"?"local":"world";transform.setSpace(next);e.currentTarget.textContent=next==="world"?"Mundo":"Local"};
$("add-box").onclick=()=>{const d=new THREE.Vector3();camera.getWorldDirection(d);const pos=camera.position.clone().add(d.multiplyScalar(6));let box;history.execute({label:"criar caixa",do:()=>{if(!box){box=new SpatialBox({name:`Caixa ${objects.length+1}`,color:new THREE.Color().setHSL(Math.random(),.45,.55)});box.position.copy(pos)}scene.add(box);if(!objects.includes(box))objects.push(box);select(box)},undo:()=>{scene.remove(box);const i=objects.indexOf(box);if(i>=0)objects.splice(i,1);select(null)}})};
$("reset").onclick=()=>{camera.position.set(10,8,14);orbit.target.set(0,1,0);orbit.update()};
$("apply-position").onclick=()=>{if(!selected)return;const o=selected,before=o.position.clone(),after=new THREE.Vector3(Number($("px").value)||0,Number($("py").value)||0,Number($("pz").value)||0);history.execute({label:"mudar posição",do:()=>{o.position.copy(after);syncPanel()},undo:()=>{o.position.copy(before);syncPanel()}})};

document.querySelectorAll("[data-face]").forEach(b=>b.onclick=()=>{if(!(selected instanceof SpatialBox))return;const face=b.dataset.face,step=Math.max(.01,Number($("face-step").value)||.5),before=selected.snapshot(),o=selected,axis=face[1],sign=face[0]==="p"?1:-1,size=o.size.clone(),shift=new THREE.Vector3();size[axis]+=step;shift[axis]=sign*step/2;shift.applyQuaternion(o.quaternion);const afterPos=o.position.clone().add(shift),afterSize=size.clone();history.execute({label:`escalar face ${face}`,do:()=>{o.setSize(afterSize);o.position.copy(afterPos);syncPanel()},undo:()=>{o.restore(before);syncPanel()}})});

$("texture-file").onchange=e=>{if(!selected)return;const file=e.target.files?.[0];if(!file)return;const o=selected,before=o.snapshot(),url=URL.createObjectURL(file);textureLoader.load(url,t=>{t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.center.set(.5,.5);o.material.map=t;o.material.needsUpdate=true;const after=o.snapshot();history.pushExecuted({label:"aplicar textura",do:()=>{o.restore(after);syncPanel()},undo:()=>{o.restore(before);syncPanel()}});URL.revokeObjectURL(url);syncPanel()},undefined,err=>{$("status").textContent="Falha ao carregar textura";console.error(err);URL.revokeObjectURL(url)})};
$("apply-material").onclick=()=>{if(!selected)return;const o=selected,before=o.snapshot();o.material.color.set($("color").value);o.material.opacity=THREE.MathUtils.clamp(Number($("opacity").value),0,1);o.material.transparent=o.material.opacity<1;const t=o.material.map;if(t){t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(Number($("repeat-u").value)||1,Number($("repeat-v").value)||1);t.offset.set(Number($("offset-u").value)||0,Number($("offset-v").value)||0);t.rotation=THREE.MathUtils.degToRad(Number($("texture-rotation").value)||0);const[cx,cy]=$("texture-center").value.split(",").map(Number);t.center.set(Number.isFinite(cx)?cx:.5,Number.isFinite(cy)?cy:.5);t.needsUpdate=true}o.material.needsUpdate=true;const after=o.snapshot();history.pushExecuted({label:"alterar material",do:()=>{o.restore(after);syncPanel()},undo:()=>{o.restore(before);syncPanel()}});syncPanel()};
$("clear-texture").onclick=()=>{if(!selected)return;const o=selected,before=o.snapshot();history.execute({label:"remover textura",do:()=>{o.material.map=null;o.material.needsUpdate=true;syncPanel()},undo:()=>{o.restore(before);syncPanel()}})};
$("apply-semantics").onclick=()=>{if(!selected)return;const o=selected,before=o.snapshot(),morphisms=$("morphisms").value.split("\n").map(s=>s.trim()).filter(Boolean).map(line=>{const[type,target]=line.split("->").map(x=>x.trim());return{type:type||"relaciona-se",target:target||""}});history.execute({label:"alterar semântica",do:()=>{o.userData.category=$("category").value.trim();o.userData.description=$("description").value.trim();o.userData.morphisms=morphisms;syncPanel()},undo:()=>{o.restore(before);syncPanel()}})};

$("undo").onclick=()=>history.undo();$("redo").onclick=()=>history.redo();history.onChange(h=>{$("undo").disabled=!h.undoStack.length;$("redo").disabled=!h.redoStack.length;$("undo").title=h.undoStack.at(-1)?.label??"";$("redo").title=h.redoStack.at(-1)?.label??""});
addEventListener("keydown",e=>{const mod=e.ctrlKey||e.metaKey;if(mod&&e.key.toLowerCase()==="z"){e.preventDefault();e.shiftKey?history.redo():history.undo()}if(mod&&e.key.toLowerCase()==="y"){e.preventDefault();history.redo()}});
addEventListener("resize",()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight)});
function animate(){requestAnimationFrame(animate);orbit.update();renderer.render(scene,camera)}select(null);animate();$("status").textContent="WebGL ativo · histórico 100";
