import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";

const canvas=document.querySelector("#world");
const renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:"high-performance"});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.setSize(innerWidth,innerHeight);
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.shadowMap.enabled=true;

const scene=new THREE.Scene();
scene.background=new THREE.Color(0x08101a);
scene.fog=new THREE.Fog(0x08101a,40,180);

const camera=new THREE.PerspectiveCamera(55,innerWidth/innerHeight,.1,1000);
camera.position.set(10,8,14);

const orbit=new OrbitControls(camera,renderer.domElement);
orbit.enableDamping=true;
orbit.dampingFactor=.08;
orbit.target.set(0,1,0);
orbit.minDistance=1;
orbit.maxDistance=250;
orbit.zoomToCursor=true;

const transform=new TransformControls(camera,renderer.domElement);
scene.add(transform.getHelper());
transform.setMode("translate");
transform.setSize(1.2);
transform.addEventListener("dragging-changed",e=>orbit.enabled=!e.value);
transform.addEventListener("objectChange",syncPanel);

scene.add(new THREE.HemisphereLight(0xaecbff,0x182012,2.2));
const sun=new THREE.DirectionalLight(0xffffff,3);
sun.position.set(8,16,10);
sun.castShadow=true;
scene.add(sun);

scene.add(new THREE.GridHelper(200,100,0x6688aa,0x243142));
const ground=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.MeshStandardMaterial({color:0x101722,roughness:1}));
ground.rotation.x=-Math.PI/2;
ground.receiveShadow=true;
scene.add(ground);

const objects=[];
let selected=null;
const raycaster=new THREE.Raycaster();
const pointer=new THREE.Vector2();

function createBox(position=new THREE.Vector3()){
  const mesh=new THREE.Mesh(
    new THREE.BoxGeometry(2,2,2),
    new THREE.MeshStandardMaterial({color:new THREE.Color().setHSL(Math.random(),.45,.55)})
  );
  mesh.position.copy(position);
  mesh.position.y=Math.max(1,mesh.position.y);
  mesh.castShadow=true;
  mesh.receiveShadow=true;
  mesh.userData.name=`Caixa ${objects.length+1}`;
  scene.add(mesh);
  objects.push(mesh);
  select(mesh);
  return mesh;
}

createBox(new THREE.Vector3(-3,1,0));
createBox(new THREE.Vector3(0,1,0));
createBox(new THREE.Vector3(3,1,0));

function select(object){
  selected=object;
  if(selected){
    transform.attach(selected);
    document.querySelector("#name").textContent=selected.userData.name||"Objeto";
  }else{
    transform.detach();
    document.querySelector("#name").textContent="Nenhum objeto";
  }
  syncPanel();
}

function syncPanel(){
  if(!selected)return;
  document.querySelector("#px").value=selected.position.x.toFixed(2);
  document.querySelector("#py").value=selected.position.y.toFixed(2);
  document.querySelector("#pz").value=selected.position.z.toFixed(2);
}

let pointerDownX = 0;
let pointerDownY = 0;
let pointerMoved = false;

renderer.domElement.addEventListener("pointerup", event => {
  if (transform.dragging) return;

  // Não tratar órbita ou pan como clique.
  if (pointerMoved) return;

  const rect = renderer.domElement.getBoundingClientRect();

  pointer.x =
    ((event.clientX - rect.left) / rect.width) * 2 - 1;

  pointer.y =
    -((event.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(pointer, camera);

  const hits = raycaster.intersectObjects(objects, false);

  if (hits.length > 0) {
    select(hits[0].object);
  } else {
    select(null);
  }
});
document.querySelectorAll("[data-mode]").forEach(button=>{
  button.addEventListener("click",()=>transform.setMode(button.dataset.mode));
});
document.querySelector("#space").addEventListener("click",event=>{
  const next=transform.space==="world"?"local":"world";
  transform.setSpace(next);
  event.currentTarget.textContent=next==="world"?"Mundo":"Local";
});
document.querySelector("#add-box").addEventListener("click",()=>{
  const direction=new THREE.Vector3();
  camera.getWorldDirection(direction);
  createBox(camera.position.clone().add(direction.multiplyScalar(6)));
});
document.querySelector("#reset").addEventListener("click",()=>{
  camera.position.set(10,8,14);
  orbit.target.set(0,1,0);
  orbit.update();
});
document.querySelector("#apply").addEventListener("click",()=>{
  if(!selected)return;
  selected.position.set(
    Number(document.querySelector("#px").value)||0,
    Number(document.querySelector("#py").value)||0,
    Number(document.querySelector("#pz").value)||0
  );
});
addEventListener("resize",()=>{
  camera.aspect=innerWidth/innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth,innerHeight);
});
function animate(){
  requestAnimationFrame(animate);
  orbit.update();
  renderer.render(scene,camera);
}
animate();
document.querySelector("#status").textContent="WebGL ativo";
