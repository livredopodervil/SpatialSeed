export class OutlineRenderer {
  constructor(target, { maxObjects = 200 } = {}) {
    this.target = target;
    this.maxObjects = maxObjects;
  }

  update(region, sandbox, modules, state = sandbox.getSnapshot()) {
    const objects = state.objects ?? [];
    const visible = objects.slice(0, this.maxObjects);
    const remaining = Math.max(0, objects.length - visible.length);

    this.target.innerHTML = `
      <div class="region">
        <strong>${escapeHtml(region.descriptor.name)}</strong><br>
        versão autoritativa: ${region.version}<br>
        sandbox base: ${sandbox.baseVersion}<br>
        estado: ${sandbox.dirty ? "alterado" : "limpo"}
      </div>
      <div class="region">
        <strong>Objetos (${objects.length})</strong>
        ${visible.map(object => `
          <div class="object">
            ${escapeHtml(object.name)}<br>
            posição [${object.position.join(", ")}]<br>
            escala [${object.scale.join(", ")}]
          </div>
        `).join("")}
        ${remaining ? `<div class="object">… ${remaining} objeto(s) não exibido(s)</div>` : ""}
      </div>
      <div class="region">
        <strong>Módulos</strong>
        ${modules.map(module => `
          <div class="object">
            ${escapeHtml(module.id)} — ${module.failed ? "falhou" : "ativo"}
          </div>
        `).join("")}
      </div>`;
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
