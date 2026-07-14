export class SelectionMarquee {
  #canvas;#element;#complete;#start=null;enabled=false;
  constructor({canvas,element,onComplete}){this.#canvas=canvas;this.#element=element;this.#complete=onComplete;canvas.addEventListener("pointerdown",this.#down,true)}
  setEnabled(v){this.enabled=Boolean(v);if(!this.enabled)this.cancel()}
  cancel(){this.#start=null;this.#element.hidden=true}
  dispose(){this.#canvas.removeEventListener("pointerdown",this.#down,true);this.cancel()}
  #down=e=>{if(!this.enabled||(e.pointerType==="mouse"&&e.button!==0))return;e.preventDefault();e.stopImmediatePropagation();const r=this.#canvas.getBoundingClientRect();this.#start={id:e.pointerId,x:e.clientX-r.left,y:e.clientY-r.top,r};this.#canvas.setPointerCapture?.(e.pointerId);this.#element.hidden=false;this.#draw(this.#start.x,this.#start.y);this.#canvas.addEventListener("pointermove",this.#move,true);this.#canvas.addEventListener("pointerup",this.#up,true);this.#canvas.addEventListener("pointercancel",this.#cancel,true)};
  #move=e=>{if(!this.#start||e.pointerId!==this.#start.id)return;e.preventDefault();e.stopImmediatePropagation();this.#draw(e.clientX-this.#start.r.left,e.clientY-this.#start.r.top)};
  #up=e=>{if(!this.#start||e.pointerId!==this.#start.id)return;e.preventDefault();e.stopImmediatePropagation();const q=rect(this.#start.x,this.#start.y,e.clientX-this.#start.r.left,e.clientY-this.#start.r.top);this.#clean(e.pointerId);if(q.width>=4&&q.height>=4)this.#complete(q)};
  #cancel=e=>{e.preventDefault();e.stopImmediatePropagation();this.#clean(e.pointerId)};
  #clean(id){this.#canvas.releasePointerCapture?.(id);this.#canvas.removeEventListener("pointermove",this.#move,true);this.#canvas.removeEventListener("pointerup",this.#up,true);this.#canvas.removeEventListener("pointercancel",this.#cancel,true);this.cancel()}
  #draw(x,y){const q=rect(this.#start.x,this.#start.y,x,y);Object.assign(this.#element.style,{left:`${q.left}px`,top:`${q.top}px`,width:`${q.width}px`,height:`${q.height}px`})}
}
function rect(x1,y1,x2,y2){const left=Math.min(x1,x2),top=Math.min(y1,y2),right=Math.max(x1,x2),bottom=Math.max(y1,y2);return{left,top,right,bottom,width:right-left,height:bottom-top}}
