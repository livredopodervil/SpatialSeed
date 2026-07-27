export class MeshEditPanel {
  static apiVersion = "mesh-edit-panel-v1";

  constructor({ root, query, execute, subscribe }) {
    if (!root) throw new TypeError("MeshEditPanel exige root.");
    this.root = root;
    this.query = query;
    this.execute = execute;
    this.unsubscribe = subscribe?.(snapshot => this.refresh(snapshot)) ?? null;
    this.#bind();
    this.refresh();
  }

  refresh(snapshot = null) {
    const state = snapshot ?? this.query("mesh.edit.status");
    const active = Boolean(state.active);
    this.root.dataset.active = active ? "true" : "false";
    this.#text("mesh-edit-status", active
      ? `${state.objectName} — ${state.selectedCount}/${state.vertexCount} vértices`
      : state.reason ?? "Selecione exatamente um objeto para editar.");
    this.#text("mesh-edit-details", active
      ? `Fonte: ${state.sourceType}; únicos: ${state.uniqueVertexCount}; frame: ${state.frameMode}; ${state.dirty ? "modificada" : "sem alterações"}${state.stale ? "; mundo alterado externamente — cancele" : ""}.`
      : "A malha será convertida em BufferGeometry somente ao aplicar uma alteração real.");
    for (const id of [
      "mesh-commit", "mesh-cancel", "mesh-select-all", "mesh-select-none",
      "mesh-select-invert", "mesh-frame-world", "mesh-frame-local",
      "mesh-frame-viewer", "mesh-affine-move", "mesh-affine-rotate",
      "mesh-affine-scale", "mesh-weld", "mesh-occlusion"
    ]) this.#element(id).disabled = !active;
    this.#element("mesh-enter").disabled = active || !state.canEnter;
    this.#element("mesh-commit").disabled = !active || Boolean(state.stale);
    this.#element("mesh-frame-viewer").dataset.active =
      state.viewerPlaneLocked ? "true" : "false";
    this.#element("mesh-frame-viewer").textContent =
      state.viewerPlaneLocked
        ? "Destravar plano do viewer"
        : "Travar plano do viewer";
    this.#element("mesh-frame-world").dataset.active =
      state.frameMode === "world" ? "true" : "false";
    this.#element("mesh-frame-local").dataset.active =
      state.frameMode === "local" ? "true" : "false";
    this.#element("mesh-weld").checked = state.weldCoincident ?? true;
    this.#element("mesh-occlusion").checked = state.occlusion ?? true;
  }

  dispose() { this.unsubscribe?.(); }

  #bind() {
    this.#click("mesh-enter", "mesh.edit.enter");
    this.#click("mesh-commit", "mesh.edit.commit");
    this.#click("mesh-cancel", "mesh.edit.cancel");
    this.#click("mesh-select-all", "mesh.vertices.select-all");
    this.#click("mesh-select-none", "mesh.vertices.clear");
    this.#click("mesh-select-invert", "mesh.vertices.invert");
    this.#click("mesh-frame-world", "mesh.frame.set", () => ({ mode: "world" }));
    this.#click("mesh-frame-local", "mesh.frame.set", () => ({ mode: "local" }));
    this.#click("mesh-frame-viewer", "mesh.frame.viewer.toggle");
    this.#click("mesh-affine-move", "selection.translate", () => ({
      delta: this.#vector("mesh-move")
    }));
    this.#click("mesh-affine-rotate", "selection.rotate", () => ({
      degrees: this.#vector("mesh-rotate")
    }));
    this.#click("mesh-affine-scale", "selection.scale", () => ({
      factors: this.#vector("mesh-scale")
    }));
    for (const id of ["mesh-weld", "mesh-occlusion"]) {
      this.#element(id).addEventListener("change", () => {
        try {
          this.execute("mesh.options.set", {
            weldCoincident: this.#element("mesh-weld").checked,
            occlusion: this.#element("mesh-occlusion").checked
          });
          this.#text("mesh-edit-error", "");
        } catch (error) {
          this.#text("mesh-edit-error", error.message);
        }
      });
    }
  }

  #click(id, command, args = () => ({})) {
    this.#element(id).addEventListener("click", () => {
      try {
        this.execute(command, args());
        this.#text("mesh-edit-error", "");
      } catch (error) {
        this.#text("mesh-edit-error", error.message);
      }
    });
  }

  #vector(prefix) {
    return ["x", "y", "z"].map(axis => {
      const value = Number(this.#element(`${prefix}-${axis}`).value);
      if (!Number.isFinite(value)) throw new Error(`Valor inválido em ${prefix}-${axis}.`);
      return value;
    });
  }

  #element(id) {
    const element = this.root.querySelector(`#${id}`);
    if (!element) throw new Error(`Controle ausente: ${id}.`);
    return element;
  }

  #text(id, value) { this.#element(id).textContent = value; }
}
