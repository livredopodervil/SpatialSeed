export class FloatingPanelManager {
  #root; #key; #z = 40; #panels = new Map();
  constructor({ root = document, storageKey = "spatialseed.ui.layout.v1" } = {}) {
    this.#root = root; this.#key = storageKey;
  }
  register(selector) {
    const panel = typeof selector === "string" ? this.#root.querySelector(selector) : selector;
    if (!panel || this.#panels.has(panel.id)) return panel;
    const handle = panel.querySelector(":scope > header");
    if (!handle) return panel;
    panel.classList.add("ss-floating-panel"); handle.classList.add("ss-panel-handle");
    panel.style.resize = "both";
    handle.addEventListener("pointerdown", e => this.#drag(panel,e));
    panel.addEventListener("pointerdown",()=>this.bringToFront(panel));
    this.#panels.set(panel.id,panel); this.#restore(panel); this.bringToFront(panel);
    const ro=new ResizeObserver(()=>this.#save(panel)); ro.observe(panel); panel.__ssRO=ro;
    return panel;
  }
  bringToFront(panel){panel.style.zIndex=String(++this.#z)}
  dispose(){for(const p of this.#panels.values())p.__ssRO?.disconnect();this.#panels.clear()}
  #drag(panel,e){
    if(e.target.closest("button,input,select,textarea"))return;
    if(e.pointerType==="mouse"&&e.button!==0)return;
    e.preventDefault();this.bringToFront(panel);
    const r=panel.getBoundingClientRect(),o={x:e.clientX,y:e.clientY,l:r.left,t:r.top};
    panel.style.right="auto";panel.style.bottom="auto";panel.style.left=`${r.left}px`;panel.style.top=`${r.top}px`;
    panel.setPointerCapture?.(e.pointerId);
    const move=c=>{const l=Math.max(0,Math.min(innerWidth-panel.offsetWidth,o.l+c.clientX-o.x));const t=Math.max(0,Math.min(innerHeight-panel.offsetHeight,o.t+c.clientY-o.y));panel.style.left=`${l}px`;panel.style.top=`${t}px`};
    const end=c=>{panel.releasePointerCapture?.(c.pointerId);panel.removeEventListener("pointermove",move);panel.removeEventListener("pointerup",end);panel.removeEventListener("pointercancel",end);this.#save(panel)};
    panel.addEventListener("pointermove",move);panel.addEventListener("pointerup",end);panel.addEventListener("pointercancel",end);
  }
  #layout(){try{return JSON.parse(localStorage.getItem(this.#key)||"{}")}catch{return {}}}
  #save(panel){const x=this.#layout(),r=panel.getBoundingClientRect();x[panel.id]={left:r.left,top:r.top,width:r.width,height:r.height};try{localStorage.setItem(this.#key,JSON.stringify(x))}catch{}}
  #restore(panel){const x=this.#layout()[panel.id];if(!x)return;panel.style.right="auto";panel.style.bottom="auto";panel.style.left=`${Math.max(0,x.left)}px`;panel.style.top=`${Math.max(0,x.top)}px`;panel.style.width=`${Math.max(220,x.width)}px`;panel.style.height=`${Math.max(120,x.height)}px`}
}
