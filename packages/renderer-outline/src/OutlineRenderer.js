export class OutlineRenderer {
  constructor(target){ this.target=target; }

  update(region,sandbox,modules){
    const state=sandbox.getState();
    this.target.innerHTML=`
      <div class="region">
        <strong>${escapeHtml(region.descriptor.name)}</strong><br>
        versão autoritativa: ${region.version}<br>
        sandbox base: ${sandbox.baseVersion}<br>
        estado: ${sandbox.dirty?"alterado":"limpo"}
      </div>
      <div class="region">
        <strong>Objetos</strong>
        ${state.objects.map(o=>`
          <div class="object">
            ${escapeHtml(o.name)}<br>
            posição [${o.position.join(", ")}]<br>
            escala [${o.scale.join(", ")}]
          </div>`).join("")}
      </div>
      <div class="region">
        <strong>Módulos</strong>
        ${modules.map(m=>`<div class="object">${escapeHtml(m.id)} — ${m.failed?"falhou":"ativo"}</div>`).join("")}
      </div>`;
  }
}
function escapeHtml(value){
  return String(value).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");
}
