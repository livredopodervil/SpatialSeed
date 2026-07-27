export class MeshEditPanel {
  static apiVersion = "mesh-edit-panel-v4";

  constructor({ root, query, execute, subscribe }) {
    if (!root) throw new TypeError("MeshEditPanel exige root.");
    this.root = root;
    this.query = query;
    this.execute = execute;
    this.latest = null;
    this.unsubscribe = subscribe?.(snapshot => this.refresh(snapshot)) ?? null;
    this.onKeyDown = event => this.#handleShortcut(event);
    document.addEventListener("keydown", this.onKeyDown, true);
    this.#bind();
    this.#bindSectionConfiguration();
    this.refresh();
  }

  refresh(snapshot = null) {
    const state = snapshot ?? this.query("mesh.edit.status");
    this.latest = state;
    const active = Boolean(state.active);
    this.root.dataset.active = active ? "true" : "false";
    const modeLabels = { vertex: "vértices", edge: "arestas", face: "faces" };
    this.#text("mesh-edit-status", active
      ? `${state.objectName} — ${state.selectedCount}/${
          state.componentMode === "vertex"
            ? state.vertexCount
            : state.componentMode === "edge"
              ? state.edgeCount
              : state.faceCount
        } ${modeLabels[state.componentMode]}`
      : state.reason ?? "Selecione exatamente um objeto para editar.");
    this.#text("mesh-edit-details", active
      ? `Fonte: ${state.sourceType}; vértices: ${state.vertexCount}; únicos: ${state.uniqueVertexCount}; arestas: ${state.edgeCount}; faces: ${state.faceCount}; contorno: ${state.boundaryEdgeCount ?? 0}; soltas: ${state.looseEdgeCount ?? 0}; não manifold: ${state.nonManifoldEdgeCount ?? 0}; frame: ${state.frameMode}; restrição: ${state.constraint}; influência: ${state.affectedCount ?? state.selectedVertexCount} vértices; histórico interno: ${state.undoDepth}/${state.redoDepth}; ${state.dirty ? "modificada" : "sem alterações"}${state.stale ? "; mundo alterado externamente — cancele" : ""}.`
      : "A malha é isolada no viewer e só se torna BufferGeometry persistente quando uma alteração é aplicada.");

    for (const id of this.#activeControlIds()) {
      this.#element(id).disabled = !active;
    }
    this.#element("mesh-enter").disabled = active || !state.canEnter;
    this.#element("mesh-commit").disabled = !active || Boolean(state.stale);
    this.#element("mesh-undo").disabled = !active || !state.canUndo;
    this.#element("mesh-redo").disabled = !active || !state.canRedo;

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

    for (const button of this.root.querySelectorAll("[data-mesh-constraint]")) {
      button.dataset.active = button.dataset.meshConstraint === state.constraint
        ? "true"
        : "false";
    }

    for (const button of this.root.querySelectorAll("[data-mesh-mode]")) {
      button.dataset.active = button.dataset.meshMode === state.componentMode
        ? "true"
        : "false";
    }
    const display = state.display ?? {};
    this.#element("mesh-show-vertices").checked = display.vertices ?? true;
    this.#element("mesh-show-edges").checked = display.edges ?? true;
    this.#element("mesh-show-faces").checked = display.faces ?? true;
    this.#element("mesh-xray").checked = display.xray ?? true;
    const topologyOptions = state.topologyOptions ?? {};
    this.#element("mesh-topology-manifold").checked = topologyOptions.manifoldOnly ?? true;
    this.#element("mesh-topology-cleanup").checked = topologyOptions.removeUnused ?? true;
    this.#element("mesh-topology-auto-normals").checked = topologyOptions.autoNormals ?? true;
    this.#element("mesh-topology-boundary").checked = topologyOptions.preserveBoundary ?? true;

    this.#element("mesh-weld").checked = state.weldCoincident ?? true;
    this.#element("mesh-occlusion").checked = state.occlusion ?? true;
    const snap = state.snap ?? {};
    this.#element("mesh-snap-enabled").checked = Boolean(snap.enabled);
    this.#value("mesh-snap-mode", snap.mode ?? "auto");
    this.#value("mesh-snap-scope", snap.scope ?? "active");
    this.#value("mesh-snap-anchor", snap.anchor ?? "active");
    this.#value("mesh-snap-tolerance", snap.tolerancePixels ?? 18);
    this.#element("mesh-snap-self").checked = Boolean(snap.self);
    this.#text("mesh-snap-diagnostic", state.snapCandidate
      ? `Alvo: ${state.snapCandidate.type}; objeto: ${state.snapCandidate.objectId}; score: ${Number(state.snapCandidate.score).toFixed(3)}.`
      : "Sem alvo de snap.");
    const deformation = state.deformation ?? {};
    this.#element("mesh-deform-live").checked = deformation.enabled ?? true;
    this.#value("mesh-deform-radius", deformation.radius ?? 5);
    this.#value("mesh-deform-metric", deformation.metric ?? "geodesic");
    this.#value("mesh-deform-axis", deformation.axis ?? "x");
    this.#value("mesh-deform-falloff", deformation.falloff ?? "smooth");
    this.#value(
      "mesh-deform-damping",
      deformation.elastic?.damping ?? 2.5
    );
    this.#value(
      "mesh-deform-frequency",
      deformation.elastic?.frequency ?? 3
    );
    this.#value(
      "mesh-deform-falloff-expression",
      deformation.falloffExpression ?? "1-smoothstep(0,1,q)"
    );
    if (state.active) {
      this.#element("mesh-deform-variables").value = JSON.stringify(
        deformation.variables ?? {}
      );
    }
  }

  activateSelection() {
    const state = this.query("mesh.edit.status");
    this.refresh(state);
    if (state.active || !state.canEnter) return state;
    try {
      const result = this.execute("mesh.edit.enter", { selectAll: true });
      this.#text("mesh-edit-error", "");
      return result;
    } catch (error) {
      this.#text("mesh-edit-error", error.message);
      return this.query("mesh.edit.status");
    }
  }

  dispose() {
    this.unsubscribe?.();
    document.removeEventListener("keydown", this.onKeyDown, true);
  }

  #bind() {
    this.#click("mesh-enter", "mesh.edit.enter");
    this.#click("mesh-commit", "mesh.edit.commit");
    this.#click("mesh-cancel", "mesh.edit.cancel");
    this.#click("mesh-undo", "mesh.edit.undo");
    this.#click("mesh-redo", "mesh.edit.redo");
    this.#click("mesh-select-all", "mesh.selection.apply", () => ({ operation: "all" }));
    this.#click("mesh-select-none", "mesh.selection.apply", () => ({ operation: "none" }));
    this.#click("mesh-select-invert", "mesh.selection.apply", () => ({ operation: "invert" }));
    this.#click("mesh-select-grow", "mesh.selection.apply", () => ({ operation: "grow" }));
    this.#click("mesh-select-shrink", "mesh.selection.apply", () => ({ operation: "shrink" }));
    this.#click("mesh-select-linked", "mesh.selection.apply", () => ({ operation: "linked" }));
    this.#click("mesh-select-boundary", "mesh.selection.apply", () => ({ operation: "boundary" }));
    this.#click("mesh-select-by-normal", "mesh.selection.apply", () => ({
      operation: "by-normal",
      options: { angleDegrees: this.#number("mesh-select-normal-angle") }
    }));
    for (const button of this.root.querySelectorAll("[data-mesh-mode]")) {
      button.addEventListener("click", () => this.#execute(
        "mesh.component.mode.set",
        { mode: button.dataset.meshMode }
      ));
    }
    this.#click("mesh-frame-world", "mesh.frame.set", () => ({ mode: "world" }));
    this.#click("mesh-frame-local", "mesh.frame.set", () => ({ mode: "local" }));
    this.#click("mesh-frame-viewer", "mesh.frame.viewer.toggle");
    for (const button of this.root.querySelectorAll("[data-mesh-constraint]")) {
      button.addEventListener("click", () => this.#execute(
        "mesh.constraint.set",
        { mode: button.dataset.meshConstraint }
      ));
    }
    this.#click("mesh-affine-move", "selection.translate", () => ({
      delta: this.#numericVector("mesh-move")
    }));
    this.#click("mesh-affine-rotate", "selection.rotate", () => ({
      degrees: this.#numericVector("mesh-rotate")
    }));
    this.#click("mesh-affine-scale", "selection.scale", () => ({
      factors: this.#numericVector("mesh-scale")
    }));
    this.#click("mesh-deform-apply", "mesh.deform.apply", () =>
      this.#deformationArguments()
    );

    this.#click("mesh-create-vertex", "mesh.topology.apply", () => ({
      operation: "create-vertex",
      options: { position: this.#numericVector("mesh-create") }
    }));
    for (const [id, operation] of [
      ["mesh-create-edge", "create-edge"],
      ["mesh-create-face", "create-face"],
      ["mesh-duplicate-component", "duplicate"],
      ["mesh-delete-component", "delete"],
      ["mesh-fill", "fill"],
      ["mesh-subdivide", "subdivide"],
      ["mesh-collapse", "collapse"],
      ["mesh-flip-edge", "flip-edge"],
      ["mesh-weld-vertices", "weld"],
      ["mesh-flip-normal", "flip-normal"],
      ["mesh-bridge", "bridge"],
      ["mesh-cleanup", "cleanup"],
      ["mesh-recalculate-normals", "recalculate-normals"]
    ]) {
      this.#click(id, "mesh.topology.apply", () => ({ operation }));
    }
    this.#click("mesh-extrude", "mesh.topology.apply", () => ({
      operation: "extrude",
      options: { distance: this.#number("mesh-extrude-distance") }
    }));
    this.#click("mesh-inset", "mesh.topology.apply", () => ({
      operation: "inset",
      options: { amount: this.#number("mesh-inset-amount") }
    }));
    this.#click("mesh-split", "mesh.topology.apply", () => ({
      operation: "split",
      options: { parameter: this.#number("mesh-split-parameter") }
    }));
    this.#element("mesh-deform-operation").addEventListener("change", () => {
      const presets = {
        move: ["2*w", "0", "0"],
        rotate: ["0", "0", "30*w"],
        scale: ["1+w", "1", "1"]
      };
      const values = presets[this.#element("mesh-deform-operation").value];
      ["x", "y", "z"].forEach((axis, index) => {
        this.#element(`mesh-deform-${axis}`).value = values[index];
      });
    });

    for (const id of [
      "mesh-deform-live", "mesh-deform-radius", "mesh-deform-metric",
      "mesh-deform-axis", "mesh-deform-falloff", "mesh-deform-damping",
      "mesh-deform-frequency", "mesh-deform-falloff-expression",
      "mesh-deform-variables"
    ]) {
      this.#element(id).addEventListener("change", () => this.#execute(
        "mesh.deform.settings.set",
        this.#deformationSettingsArguments()
      ));
    }

    for (const id of ["mesh-weld", "mesh-occlusion"]) {
      this.#element(id).addEventListener("change", () => this.#execute(
        "mesh.options.set",
        {
          weldCoincident: this.#element("mesh-weld").checked,
          occlusion: this.#element("mesh-occlusion").checked
        }
      ));
    }
    for (const id of [
      "mesh-show-vertices", "mesh-show-edges", "mesh-show-faces", "mesh-xray"
    ]) {
      this.#element(id).addEventListener("change", () => this.#execute(
        "mesh.display.set",
        this.#displayArguments()
      ));
    }
    for (const id of [
      "mesh-topology-manifold", "mesh-topology-cleanup",
      "mesh-topology-auto-normals", "mesh-topology-boundary"
    ]) {
      this.#element(id).addEventListener("change", () => this.#execute(
        "mesh.topology.options.set",
        this.#topologyOptionsArguments()
      ));
    }

    for (const id of [
      "mesh-snap-enabled", "mesh-snap-mode", "mesh-snap-scope",
      "mesh-snap-anchor", "mesh-snap-tolerance", "mesh-snap-self"
    ]) {
      this.#element(id).addEventListener("change", () => this.#execute(
        "mesh.snap.set",
        this.#snapArguments()
      ));
    }
  }

  #handleShortcut(event) {
    if (!this.latest?.active) return;
    if (["INPUT", "TEXTAREA", "SELECT"].includes(event.target?.tagName)) return;
    const key = String(event.key).toLowerCase();
    if (["1", "2", "3"].includes(key) && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      this.#execute("mesh.component.mode.set", {
        mode: ({ "1": "vertex", "2": "edge", "3": "face" })[key]
      });
      return;
    }
    if ((event.ctrlKey || event.metaKey) && key === "z") {
      event.preventDefault();
      this.#execute(event.shiftKey ? "mesh.edit.redo" : "mesh.edit.undo");
      return;
    }
    if ((event.ctrlKey || event.metaKey) && key === "y") {
      event.preventDefault();
      this.#execute("mesh.edit.redo");
      return;
    }
    if (["x", "y", "z"].includes(key) && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      const mode = event.shiftKey
        ? ({ x: "yz", y: "xz", z: "xy" })[key]
        : key;
      this.#execute("mesh.constraint.set", { mode });
      return;
    }
    if (event.key === "Backspace" && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      this.#execute("mesh.constraint.set", { mode: "free" });
    }
  }

  #bindSectionConfiguration() {
    const storageKey = "spatialseed.mesh.panel.sections.v1";
    let stored = {};
    try { stored = JSON.parse(localStorage.getItem(storageKey) ?? "{}"); }
    catch { stored = {}; }
    const apply = () => {
      const state = {};
      for (const checkbox of this.root.querySelectorAll("[data-mesh-section-toggle]")) {
        const section = checkbox.dataset.meshSectionToggle;
        if (stored[section] !== undefined) checkbox.checked = Boolean(stored[section]);
        state[section] = checkbox.checked;
        for (const element of this.root.querySelectorAll(`[data-mesh-section="${section}"]`)) {
          element.hidden = !checkbox.checked;
        }
      }
      return state;
    };
    apply();
    for (const checkbox of this.root.querySelectorAll("[data-mesh-section-toggle]")) {
      checkbox.addEventListener("change", () => {
        stored = {};
        for (const item of this.root.querySelectorAll("[data-mesh-section-toggle]")) {
          stored[item.dataset.meshSectionToggle] = item.checked;
        }
        localStorage.setItem(storageKey, JSON.stringify(stored));
        apply();
      });
    }
  }

  #displayArguments() {
    return {
      vertices: this.#element("mesh-show-vertices").checked,
      edges: this.#element("mesh-show-edges").checked,
      faces: this.#element("mesh-show-faces").checked,
      xray: this.#element("mesh-xray").checked
    };
  }

  #topologyOptionsArguments() {
    return {
      manifoldOnly: this.#element("mesh-topology-manifold").checked,
      removeUnused: this.#element("mesh-topology-cleanup").checked,
      autoNormals: this.#element("mesh-topology-auto-normals").checked,
      preserveBoundary: this.#element("mesh-topology-boundary").checked
    };
  }

  #snapArguments() {
    return {
      enabled: this.#element("mesh-snap-enabled").checked,
      mode: this.#element("mesh-snap-mode").value,
      scope: this.#element("mesh-snap-scope").value,
      anchor: this.#element("mesh-snap-anchor").value,
      tolerancePixels: this.#number("mesh-snap-tolerance"),
      self: this.#element("mesh-snap-self").checked
    };
  }

  #deformationSettingsArguments() {
    let variables = {};
    const source = this.#element("mesh-deform-variables").value.trim();
    if (source) {
      variables = JSON.parse(source);
      if (!variables || Array.isArray(variables) || typeof variables !== "object") {
        throw new Error("Variáveis devem formar um objeto JSON.");
      }
    }
    return {
      enabled: this.#element("mesh-deform-live").checked,
      radius: this.#number("mesh-deform-radius"),
      metric: this.#element("mesh-deform-metric").value,
      axis: this.#element("mesh-deform-axis").value,
      falloff: this.#element("mesh-deform-falloff").value,
      falloffExpression:
        this.#element("mesh-deform-falloff-expression").value.trim(),
      variables,
      elastic: {
        damping: this.#number("mesh-deform-damping"),
        frequency: this.#number("mesh-deform-frequency")
      }
    };
  }

  #deformationArguments() {
    return {
      operation: this.#element("mesh-deform-operation").value,
      expressions: ["x", "y", "z"].map(axis =>
        this.#element(`mesh-deform-${axis}`).value.trim() || "0"
      ),
      ...this.#deformationSettingsArguments(),
      enabled: true
    };
  }

  #activeControlIds() {
    return [
      "mesh-commit", "mesh-cancel", "mesh-undo", "mesh-redo",
      "mesh-select-all", "mesh-select-none", "mesh-select-invert",
      "mesh-select-grow", "mesh-select-shrink", "mesh-select-linked",
      "mesh-select-boundary", "mesh-select-by-normal",
      "mesh-select-normal-angle",
      "mesh-mode-vertex", "mesh-mode-edge", "mesh-mode-face",
      "mesh-show-vertices", "mesh-show-edges", "mesh-show-faces", "mesh-xray",
      "mesh-topology-manifold", "mesh-topology-cleanup",
      "mesh-topology-auto-normals", "mesh-topology-boundary",
      "mesh-create-x", "mesh-create-y", "mesh-create-z", "mesh-create-vertex",
      "mesh-create-edge", "mesh-create-face", "mesh-duplicate-component",
      "mesh-delete-component", "mesh-fill", "mesh-recalculate-normals",
      "mesh-extrude-distance", "mesh-extrude", "mesh-inset-amount",
      "mesh-inset", "mesh-split-parameter", "mesh-split",
      "mesh-subdivide", "mesh-collapse", "mesh-flip-edge",
      "mesh-weld-vertices", "mesh-flip-normal", "mesh-bridge", "mesh-cleanup",
      "mesh-frame-world", "mesh-frame-local", "mesh-frame-viewer",
      "mesh-affine-move", "mesh-affine-rotate", "mesh-affine-scale",
      "mesh-weld", "mesh-occlusion", "mesh-snap-enabled",
      "mesh-snap-mode", "mesh-snap-scope", "mesh-snap-anchor",
      "mesh-snap-tolerance", "mesh-snap-self", "mesh-deform-live",
      "mesh-deform-operation",
      "mesh-deform-radius", "mesh-deform-metric", "mesh-deform-axis",
      "mesh-deform-falloff", "mesh-deform-damping",
      "mesh-deform-frequency", "mesh-deform-x", "mesh-deform-y",
      "mesh-deform-z", "mesh-deform-falloff-expression",
      "mesh-deform-variables", "mesh-deform-apply",
      ...[...this.root.querySelectorAll("[data-mesh-constraint]")]
        .map(button => button.id)
    ];
  }

  #click(id, command, args = () => ({})) {
    this.#element(id).addEventListener("click", () =>
      this.#execute(command, args())
    );
  }

  #execute(command, args = {}) {
    try {
      const result = this.execute(command, args);
      this.#text("mesh-edit-error", "");
      return result;
    } catch (error) {
      this.#text("mesh-edit-error", error.message);
      return null;
    }
  }

  #numericVector(prefix) {
    return ["x", "y", "z"].map(axis =>
      this.#number(`${prefix}-${axis}`)
    );
  }

  #number(id) {
    const value = Number(this.#element(id).value);
    if (!Number.isFinite(value)) throw new Error(`Valor inválido em ${id}.`);
    return value;
  }

  #value(id, value) {
    const element = this.#element(id);
    if (document.activeElement !== element) element.value = String(value);
  }

  #element(id) {
    const element = this.root.querySelector(`#${id}`);
    if (!element) throw new Error(`Controle ausente: ${id}.`);
    return element;
  }

  #text(id, value) { this.#element(id).textContent = value; }
}
