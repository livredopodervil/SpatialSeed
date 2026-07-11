import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";

export class ThreeRegionRenderer {
  #meshes = new Map();
  #selectedId = null;
  #before = null;
  #tap = null;

  constructor(canvas, dispatch) {
    this.canvas = canvas;
    this.dispatch = dispatch;

    this.renderer = new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:"high-performance"});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,2));
    this.renderer.setSize(innerWidth,innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x08101a);

    this.camera = new THREE.PerspectiveCamera(55,innerWidth/innerHeight,.1,1000);
    this.camera.position.set(10,8,14);

    this.orbit = new OrbitControls(this.camera,canvas);
    this.orbit.enableDamping = true;
    this.orbit.target.set(0,1,0);

    this.transform = new TransformControls(this.camera,canvas);
    this.transform.setMode("translate");
    this.transform.setSize(1.2);
    this.scene.add(this.transform.getHelper());

    this.scene.add(new THREE.HemisphereLight(0xaecbff,0x182012,2.2));
    const light = new THREE.DirectionalLight(0xffffff,2.5);
    light.position.set(8,16,10);
    this.scene.add(light);

    const grid = new THREE.GridHelper(200,100,0x6688aa,0x243142);
    grid.position.y=.01;
    this.scene.add(grid);

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();

    this.transform.addEventListener("dragging-changed",event=>{
      this.orbit.enabled=!event.value;
    });

    this.transform.addEventListener("mouseDown",()=>{
      const mesh=this.#meshes.get(this.#selectedId);
      if(mesh) this.#before=this.#snapshot(mesh);
    });

    this.transform.addEventListener("mouseUp",()=>{
      const mesh=this.#meshes.get(this.#selectedId);
      if(!mesh||!this.#before)return;
      const after=this.#snapshot(mesh);
      const changed=JSON.stringify(this.#before)!==JSON.stringify(after);
      this.#before=null;
      if(changed){
        this.dispatch({
          type:"object.transform",
          id:this.#selectedId,
          ...after
        });
      }
    });

    canvas.addEventListener("pointerdown",event=>{
      this.#tap={id:event.pointerId,x:event.clientX,y:event.clientY,time:performance.now(),type:event.pointerType};
    },true);

    canvas.addEventListener("pointerup",event=>this.#selectAt(event),true);
    addEventListener("resize",()=>this.resize());

    this.animate();
  }

  setTransformMode(mode){ this.transform.setMode(mode); }
  toggleSpace(){
    const next=this.transform.space==="world"?"local":"world";
    this.transform.setSpace(next);
    return next;
  }

  update(state){
    const seen=new Set();
    for(const object of state.objects){
      seen.add(object.id);
      let mesh=this.#meshes.get(object.id);
      if(!mesh){
        mesh=new THREE.Mesh(
          new THREE.BoxGeometry(...object.size),
          new THREE.MeshStandardMaterial({color:object.material.color})
        );
        mesh.userData.objectId=object.id;
        this.#meshes.set(object.id,mesh);
        this.scene.add(mesh);
      }
      mesh.position.fromArray(object.position);
      mesh.quaternion.fromArray(object.rotation);
      mesh.scale.fromArray(object.scale);
      mesh.material.color.set(object.material.color);
    }

    for(const [id,mesh] of this.#meshes){
      if(!seen.has(id)){
        this.scene.remove(mesh);
        mesh.geometry.dispose();
        mesh.material.dispose();
        this.#meshes.delete(id);
      }
    }

    if(this.#selectedId&&!this.#meshes.has(this.#selectedId)){
      this.#selectedId=null;
      this.transform.detach();
    }
  }

  #snapshot(mesh){
    return {
      position:mesh.position.toArray(),
      rotation:mesh.quaternion.toArray(),
      scale:mesh.scale.toArray()
    };
  }

  #selectAt(event){
    if(!this.#tap||this.#tap.id!==event.pointerId||this.transform.dragging)return;
    const tolerance=this.#tap.type==="touch"?26:8;
    const distance=Math.hypot(event.clientX-this.#tap.x,event.clientY-this.#tap.y);
    const duration=performance.now()-this.#tap.time;
    this.#tap=null;
    if(distance>tolerance||duration>600)return;

    const rect=this.canvas.getBoundingClientRect();
    this.pointer.x=((event.clientX-rect.left)/rect.width)*2-1;
    this.pointer.y=-((event.clientY-rect.top)/rect.height)*2+1;
    this.raycaster.setFromCamera(this.pointer,this.camera);
    const hit=this.raycaster.intersectObjects([...this.#meshes.values()],false)[0];
    this.#selectedId=hit?.object?.userData?.objectId??null;
    if(this.#selectedId)this.transform.attach(this.#meshes.get(this.#selectedId));
    else this.transform.detach();
  }

  resize(){
    this.camera.aspect=innerWidth/innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth,innerHeight);
  }

  animate=()=>{
    requestAnimationFrame(this.animate);
    this.orbit.update();
    this.renderer.render(this.scene,this.camera);
  };
}
