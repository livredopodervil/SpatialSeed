import { normalizeUiConfiguration } from "../../ui-config/src/index.js";
import { describeWorkspaceContext, resolveWorkspaceSection, workspaceSectionAvailable } from "../../ui-widgets/src/index.js";

const source = () => ({ workspace: {
  mode: "guided", defaultSection: "select", sections: [
    { id: "select", label: "Selecionar", groups: ["tool"] },
    { id: "transform", label: "Transformar", groups: ["frame"], when: "selection" },
    { id: "mesh", label: "Malha", groups: ["subject", "session"], when: "mesh" }
  ]
} });
const assert = (value, message) => { if (!value) throw new Error(message); };
const rejects = callback => { let threw = false; try { callback(); } catch { threw = true; } assert(threw, "Configuração inválida foi aceita."); };

export function createWorkspaceTests() {
  return {
    "manifestos anteriores conservam o modo livre sem migração destrutiva"() {
      const config = normalizeUiConfiguration({ toolbar: { storageKey: "custom" } });
      assert(config.workspace.mode === "free", "Modo legado alterado.");
      assert(config.toolbar.storageKey === "custom", "Preferências renomeadas.");
    },
    "manifesto guiado é normalizado sem modificar a fonte"() {
      const raw = source();
      const before = JSON.stringify(raw);
      const config = normalizeUiConfiguration(raw);
      assert(JSON.stringify(raw) === before, "Mutação na configuração de origem.");
      assert(Object.isFrozen(config.workspace.sections[0].groups), "Grupos mutáveis.");
    },
    "seções duplicadas e contextos desconhecidos são rejeitados"() {
      const raw = source();
      raw.workspace.sections.push(raw.workspace.sections[0]);
      rejects(() => normalizeUiConfiguration(raw));
      raw.workspace.sections = [{ id: "select", label: "Seleção", groups: ["tool"], when: "unknown" }];
      rejects(() => normalizeUiConfiguration(raw));
    },
    "uma configuração sem saída disponível é rejeitada"() {
      const raw = source();
      raw.workspace.sections = raw.workspace.sections.slice(1);
      raw.workspace.defaultSection = "transform";
      rejects(() => normalizeUiConfiguration(raw));
    },
    "limpar seleção sai de uma seção indisponível sem abrir Inspector"() {
      const layout = normalizeUiConfiguration(source()).workspace;
      assert(resolveWorkspaceSection(layout, "transform", { selectionCount: 1 }).id === "transform", "Transformação inacessível.");
      assert(resolveWorkspaceSection(layout, "transform", { selectionCount: 0 }).id === "select", "Seção vazia retida.");
    },
    "malha permanece disponível durante a sessão e oculta transformação de objeto"() {
      const layout = normalizeUiConfiguration(source()).workspace;
      const context = { selectionCount: 0, meshActive: true };
      assert(workspaceSectionAvailable(layout.sections[2], context), "Sessão de malha ficou inacessível.");
      assert(!workspaceSectionAvailable(layout.sections[1], context), "Transformação de objeto exposta na malha.");
    },
    "seção removida de um perfil cai na seção padrão"() {
      const layout = normalizeUiConfiguration(source()).workspace;
      assert(resolveWorkspaceSection(layout, "removed", {}).id === "select", "Preferência antiga quebrou o layout.");
    },
    "resumo não percorre entidades nem carrega descritores"() {
      const members = new Proxy({ length: 100000 }, { get(target, key) {
        if (key !== "length") throw new Error(`Acesso pesado inesperado: ${String(key)}`);
        return target.length;
      } });
      const result = describeWorkspaceContext({ selection: { members }, editor: { tool: { mode: "translate" }, pivot: { policy: "custom", editing: true } }, frame: "local" });
      assert(result.selectionCount === 100000 && result.toolLabel === "Mover · Objeto", "Resumo incorreto.");
      assert(result.pivotLabel === "Pivô: Personalizado (em edição)", "Pivô ambíguo.");
    },
    "resumo da malha usa seus componentes e referencial"() {
      const result = describeWorkspaceContext({ mesh: { active: true, selectedCount: 3, frameMode: "viewer" } });
      assert(result.label === "Malha · 3 componentes selecionados", "Contagem errada.");
      assert(result.toolLabel.endsWith("Vista"), "Referencial errado.");
    }
  };
}
