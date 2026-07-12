export class ObjectInspector {
  constructor({ root, editor, sandbox, dispatch }) {
    this.root=root; this.editor=editor; this.sandbox=sandbox; this.dispatch=dispatch;
    this.selectedId=null; this.pendingTextureDataUrl=null;
    this.#bind();
    editor.selection.subscribe(()=>this.refresh());
    sandbox.subscribe(()=>this.refresh());
    this.refresh();
  }
  refresh() {
    const members=this.editor.selection.snapshot().members;
    const empty=this.root.querySelector("#inspector-empty");
    const form=this.root.querySelector("#inspector-form");
    if (members.length!==1) {
      this.selectedId=null; empty.hidden=false; form.hidden=true;
      empty.textContent=members.length?"O Inspector edita um objeto por vez.":"Selecione um objeto.";
      return;
    }
    const o=this.sandbox.getState().objects.find(x=>x.id===members[0].objectId);
    if(!o)return;
    this.selectedId=o.id; empty.hidden=true; form.hidden=false;
    const m=o.material??{}, t=m.texture??{};
    this.#set("ins-name",o.name??"");
    this.#vec("ins-position",o.position??[0,0,0]);
    this.#vec("ins-rotation",quatToEuler(o.rotation??[0,0,0,1]));
    this.#vec("ins-scale",o.scale??[1,1,1]);
    this.#vec("ins-size",o.size??[1,1,1]);
    this.#set("ins-color",m.color??"#ffffff");
    this.#set("ins-texture-src",t.src??"");
    this.#vec("ins-repeat",t.repeat??[1,1]);
    this.#vec("ins-offset",t.offset??[0,0]);
    this.#set("ins-texture-rotation",t.rotationDeg??0);
    this.#set("ins-wrap",t.wrap??"repeat");
  }
  apply() {
    if(!this.selectedId)throw new Error("Nenhum objeto selecionado.");
    const cur=this.sandbox.getState().objects.find(x=>x.id===this.selectedId);
    if(!cur)throw new Error("Objeto não encontrado.");
    const shown=this.#read("ins-texture-src");
    const src=this.pendingTextureDataUrl!==null?this.pendingTextureDataUrl:(shown.startsWith("[arquivo] ")?"":shown);
    const patch={
      name:this.#read("ins-name"),
      position:this.#readVec("ins-position",3),
      rotation:eulerToQuat(this.#readVec("ins-rotation",3)),
      scale:this.#readVec("ins-scale",3,0.0001),
      size:this.#readVec("ins-size",3,0.0001),
      material:{...(cur.material??{}),color:this.#read("ins-color"),texture:{
        src,repeat:this.#readVec("ins-repeat",2,0.0001),
        offset:this.#readVec("ins-offset",2),
        rotationDeg:this.#num("ins-texture-rotation"),
        wrap:this.#read("ins-wrap")
      }}
    };
    const changed=this.dispatch({type:"object.update",id:this.selectedId,patch});
    this.pendingTextureDataUrl=null;
    return {changed,id:this.selectedId};
  }
  #bind(){
    this.root
      .querySelector("#inspector-apply")
      .addEventListener("click", () => {
        this.#clearValidation();

        try {
          const result = this.apply();
          this.#clearValidation();
          return result;
        } catch (error) {
          this.#showValidation(error);

          return {
            changed: false,
            reason: "validation"
          };
        }
      });
    this.root.querySelector("#inspector-remove-texture").addEventListener("click",()=>{this.pendingTextureDataUrl="";this.#set("ins-texture-src","");});
    this.root.querySelector("#ins-texture-file").addEventListener("change",e=>{
      const f=e.target.files?.[0]; if(!f)return;
      const r=new FileReader(); r.addEventListener("load",()=>{this.pendingTextureDataUrl=String(r.result);this.#set("ins-texture-src",`[arquivo] ${f.name}`);}); r.readAsDataURL(f);
    });
  }
  #set(id,v){const e=this.root.querySelector(`#${id}`);if(e)e.value=v}
  #vec(p,v){v.forEach((x,i)=>this.#set(`${p}-${i}`,Number(x)))}
  #read(id){return this.root.querySelector(`#${id}`)?.value??""}
  #num(id, min = null) {
    const value = Number(this.#read(id));

    if (!Number.isFinite(value)) {
      const error = new Error(`Valor inválido: ${id}`);
      error.fieldId = id;
      throw error;
    }

    if (min !== null && value < min) {
      const error = new Error(`${id} deve ser ≥ ${min}`);
      error.fieldId = id;
      throw error;
    }

    return value;
  }

  #clearValidation() {
    this.root
      .querySelectorAll("input, select")
      .forEach(element => {
        element.setCustomValidity("");
        element.removeAttribute("aria-invalid");
      });
  }

  #showValidation(error) {
    const field = error?.fieldId
      ? this.root.querySelector(`#${error.fieldId}`)
      : null;

    if (field) {
      field.setCustomValidity(error.message);
      field.setAttribute("aria-invalid", "true");
      field.focus();
      field.reportValidity();
      return;
    }

    const message =
      this.root.querySelector("#inspector-empty");

    message.hidden = false;
    message.textContent =
      error?.message ?? String(error);
  }
  #readVec(p,n,min=null){return Array.from({length:n},(_,i)=>this.#num(`${p}-${i}`,min))}
}
function eulerToQuat([xd,yd,zd]){const x=xd*Math.PI/180,y=yd*Math.PI/180,z=zd*Math.PI/180,c1=Math.cos(x/2),c2=Math.cos(y/2),c3=Math.cos(z/2),s1=Math.sin(x/2),s2=Math.sin(y/2),s3=Math.sin(z/2);return[s1*c2*c3+c1*s2*s3,c1*s2*c3-s1*c2*s3,c1*c2*s3+s1*s2*c3,c1*c2*c3-s1*s2*s3]}
function quatToEuler([x,y,z,w]){const r=Math.atan2(2*(w*x+y*z),1-2*(x*x+y*y)),sp=2*(w*y-z*x),p=Math.abs(sp)>=1?Math.sign(sp)*Math.PI/2:Math.asin(sp),ya=Math.atan2(2*(w*z+x*y),1-2*(y*y+z*z));return[r,p,ya].map(v=>v*180/Math.PI)}
