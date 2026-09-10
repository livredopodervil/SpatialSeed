// Cheap presentation projections: no geometry, world snapshot or property query.
export function workspaceSectionAvailable(section, { selectionCount = 0, meshActive = false } = {}) {
  if (section.when === "mesh") return meshActive || selectionCount > 0;
  if (section.when === "selection") return selectionCount > 0 && !meshActive;
  return true;
}

export function resolveWorkspaceSection(configuration, requested, context) {
  const available = configuration.sections.filter(section => workspaceSectionAvailable(section, context));
  return available.find(section => section.id === requested) ??
    available.find(section => section.id === configuration.defaultSection) ?? available[0] ?? null;
}

export function describeWorkspaceContext({ selection, editor, mesh, frame = "world", dirty = false } = {}) {
  const count = selection?.members?.length ?? 0;
  const mode = editor?.tool?.mode ?? "select";
  const tool = ({ navigate: "Navegar", select: "Selecionar", translate: "Mover", rotate: "Girar", scale: "Escalar" })[mode] ?? mode;
  const activeFrame = mesh?.active ? mesh.frameMode : frame;
  const frameLabel = ({ world: "Mundo", local: "Objeto", viewer: "Vista", "custom-plane": "Plano" })[activeFrame] ?? activeFrame;
  const pivot = editor?.pivot?.policy ?? "bounds";
  const pivotLabel = ({ bounds: "Centro dos limites", median: "Mediana", active: "Objeto ativo", custom: "Personalizado", anchor: "Âncora" })[pivot] ?? pivot;
  const selectionLabel = count === 0 ? "Nenhum objeto selecionado" : `${count} objeto${count === 1 ? "" : "s"} selecionado${count === 1 ? "" : "s"}`;
  return Object.freeze({
    selectionCount: count, meshActive: Boolean(mesh?.active),
    label: mesh?.active ? `Malha · ${mesh.selectedCount ?? 0} componentes selecionados` : selectionLabel,
    toolLabel: `${tool} · ${frameLabel}`,
    pivotLabel: `Pivô: ${pivotLabel}${editor?.pivot?.editing ? " (em edição)" : ""}`,
    projectLabel: dirty ? "Alterações locais" : "Sem alterações locais"
  });
}
