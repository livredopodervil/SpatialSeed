const CREATION_STORAGE_KEY = "spatialseed.edit.creation-material.v1";

export class MeshEditPanel {
  static apiVersion = "mesh-edit-panel-v6";

  constructor({
    root,
    query,
    execute,
    subscribe,
    subscribeContext = null,
    subscribeSketch = null
  }) {
    if (!root) throw new TypeError("MeshEditPanel exige root.");
    this.root = root;
    this.query = query;
    this.execute = execute;
    this.latest = null;
    this.creationDefaults = loadCreationDefaults();
    this.unsubscribe = subscribe?.(snapshot => this.refresh(snapshot)) ?? null;
    this.unsubscribeContext = subscribeContext?.(() => this.refresh()) ?? null;
    this.unsubscribeSketch = subscribeSketch?.(() => this.refresh()) ?? null;
    this.onKeyDown = event => this.#handleShortcut(event);
    document.addEventListener("keydown", this.onKeyDown, true);
    this.#bind();
    this.#bindCreationMaterial();
    this.#bindSectionConfiguration();
    this.refresh();
  }

  refresh(snapshot = null) {
    const state = snapshot ?? this.query("mesh.edit.status");
    const context = this.query("edit.context.status");
    const references = this.query("path.references.list") ?? [];
    const sketch = this.query("path.sketch.status");
    const placement = this.query("object.placement.status");
    const transform = this.query("viewer.transform.settings");
    this.latest = state;
    this.latestContext = context;
    this.latestReferences = references;
    this.latestSketch = sketch;
    this.#refreshCreationReferences();
    const active = Boolean(state.active);
    this.#refreshReferenceSelects(references);
    this.root.dataset.active = active ? "true" : "false";
    this.root.dataset.subjectLevel = context.subjectLevel;
    for (const button of this.root.querySelectorAll("[data-edit-workspace-subject]")) {
      button.dataset.active = button.dataset.editWorkspaceSubject === context.subjectLevel
        ? "true"
        : "false";
    }
    for (const button of this.root.querySelectorAll("[data-edit-workspace-tool]")) {
      button.dataset.active = button.dataset.editWorkspaceTool === context.tool
        ? "true"
        : "false";
    }
    for (const button of this.root.querySelectorAll("[data-edit-workspace-selection]")) {
      button.dataset.active = button.dataset.editWorkspaceSelection === context.selectionOperation
        ? "true"
        : "false";
    }
    this.#element("edit-workspace-area").checked = Boolean(context.areaSelection);
    this.#element("edit-workspace-multi").checked = Boolean(context.multiSelect);
    this.#element("edit-workspace-keep-tool").checked = Boolean(context.keepToolActive);
    this.#element("edit-workspace-object").disabled = active;
    for (const id of [
      "edit-workspace-duplicate",
      "edit-workspace-group", "edit-workspace-ungroup",
      "edit-workspace-pivot", "edit-workspace-undo-global",
      "edit-workspace-redo-global"
    ]) {
      this.#element(id).disabled = active;
    }
    this.#element("edit-workspace-repeat").disabled = !context.canRepeat;
    this.#element("edit-workspace-delete").disabled = false;
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
    for (const id of this.#objectPathControlIds()) {
      this.#element(id).disabled = active || Boolean(sketch.active);
    }
    this.#element("path-from-selection-create").disabled = !active;
    this.#element("path-sketch-begin").disabled = active || Boolean(sketch.active);
    this.#element("path-sketch-cancel").disabled = !sketch.active;
    this.#element("mesh-enter").disabled = active || !state.canEnter;
    this.#element("mesh-commit").disabled = !active || Boolean(state.stale);
    this.#element("mesh-undo").disabled = !active || !state.canUndo;
    this.#element("mesh-redo").disabled = !active || !state.canRedo;

    this.#element("mesh-frame-viewer").dataset.active =
      context.frameMode === "viewer" ? "true" : "false";
    this.#element("mesh-frame-world").dataset.active =
      context.frameMode === "world" ? "true" : "false";
    this.#element("mesh-frame-local").dataset.active =
      context.frameMode === "local" ? "true" : "false";
    this.#element("edit-plane-lock").dataset.active =
      context.planeLock ? "true" : "false";
    this.#element("edit-work-plane-lock").dataset.active =
      context.editPlane ? "true" : "false";
    this.#element("edit-point-lock").dataset.active =
      context.pointLock ? "true" : "false";

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
    this.#refreshTransformSettings(transform);
    this.#text(
      "path-sketch-status",
      sketch.active
        ? `Desenho ativo: ${sketch.pointCount} pontos; arraste sobre o viewer e solte para criar. Esc cancela.`
        : sketch.error
          ? sketch.error
          : "Desenho inativo."
    );
    this.#element("edit-create-object").dataset.active = placement.active ? "true" : "false";
    this.#element("edit-cancel-placement").disabled = !placement.active;
    const selectedReference = references.find(reference => reference.selected);
    const selectedPath = selectedReference?.geometryType === "tube";
    this.#element("path-convert-bezier").disabled =
      active || !selectedPath || selectedReference?.curveType === "bezier";
    this.#element("path-edit-controls").disabled = active || !selectedPath;
    this.#applyAdaptiveVisibility(state, context);
  }

  #bindCreationMaterial() {
    const catalog = this.query("geometry.catalog") ?? [];
    const geometrySelect = this.#element("edit-create-geometry");
    geometrySelect.replaceChildren(...catalog.map(description => {
      const option = document.createElement("option");
      option.value = description.type;
      option.textContent = description.label;
      return option;
    }));
    if (catalog.some(item => item.type === this.creationDefaults.geometryType)) {
      geometrySelect.value = this.creationDefaults.geometryType;
    }

    const map = {
      color: "edit-material-color-text",
      model: "edit-material-model",
      opacity: "edit-material-opacity",
      roughness: "edit-material-roughness",
      metalness: "edit-material-metalness",
      transmission: "edit-material-transmission",
      ior: "edit-material-ior",
      thickness: "edit-material-thickness",
      dispersion: "edit-material-dispersion",
      clearcoat: "edit-material-clearcoat",
      envMapIntensity: "edit-material-env",
      lightType: "edit-light-type",
      lightIntensity: "edit-light-intensity",
      lightDistance: "edit-light-distance",
      lightDecay: "edit-light-decay",
      lightAngleDeg: "edit-light-angle",
      lightPenumbra: "edit-light-penumbra"
    };
    for (const [key, id] of Object.entries(map)) {
      const value = this.creationDefaults[key];
      if (value !== undefined) this.#element(id).value = String(value);
    }
    this.#element("edit-light-shadow").checked =
      this.creationDefaults.lightCastShadow !== false;
    this.#syncMaterialColor(this.#element("edit-material-color-text").value);
    this.#refreshLightParameterVisibility();

    const save = () => {
      this.creationDefaults = {
        ...this.creationDefaults,
        geometryType: geometrySelect.value,
        color: this.#element("edit-material-color-text").value,
        model: this.#element("edit-material-model").value,
        opacity: this.#number("edit-material-opacity"),
        roughness: this.#number("edit-material-roughness"),
        metalness: this.#number("edit-material-metalness"),
        transmission: this.#number("edit-material-transmission"),
        ior: this.#number("edit-material-ior"),
        thickness: this.#number("edit-material-thickness"),
        dispersion: this.#number("edit-material-dispersion"),
        clearcoat: this.#number("edit-material-clearcoat"),
        envMapIntensity: this.#number("edit-material-env"),
        lightType: this.#element("edit-light-type").value,
        lightIntensity: this.#number("edit-light-intensity"),
        lightDistance: this.#number("edit-light-distance"),
        lightDecay: this.#number("edit-light-decay"),
        lightAngleDeg: this.#number("edit-light-angle"),
        lightPenumbra: this.#number("edit-light-penumbra"),
        lightCastShadow: this.#element("edit-light-shadow").checked,
        placementOrientation: this.#element("edit-create-orientation").value,
        placementSurface: this.#element("edit-create-surface").checked
      };
      localStorage.setItem(CREATION_STORAGE_KEY, JSON.stringify(this.creationDefaults));
    };
    for (const id of Object.values(map).filter(id =>
      !["edit-material-color-text", "edit-light-type"].includes(id)
    )) {
      this.#element(id).addEventListener("change", save);
    }
    geometrySelect.addEventListener("change", save);
    this.#element("edit-create-orientation").value =
      this.creationDefaults.placementOrientation ?? "frame";
    this.#element("edit-create-surface").checked =
      this.creationDefaults.placementSurface !== false;
    this.#element("edit-create-orientation").addEventListener("change", save);
    this.#element("edit-create-surface").addEventListener("change", save);
    this.#element("edit-light-type").addEventListener("change", () => {
      this.#refreshLightParameterVisibility();
      save();
    });
    this.#element("edit-light-shadow").addEventListener("change", save);
    this.#element("edit-material-color").addEventListener("input", event => {
      this.#syncMaterialColor(event.target.value);
      save();
    });
    this.#element("edit-material-color-text").addEventListener("change", event => {
      try {
        this.#syncMaterialColor(event.target.value);
        save();
        this.#text("mesh-edit-error", "");
      } catch (error) {
        this.#text("mesh-edit-error", error.message);
        this.#syncMaterialColor(this.creationDefaults.color ?? "#6699cc");
      }
    });

    this.#element("edit-create-object").addEventListener("click", () => {
      const description = catalog.find(item => item.type === geometrySelect.value);
      if (!description) return;
      const reference = this.#creationReference();
      const mode = this.#element("edit-create-reference-mode").value;
      const orientation = this.#element("edit-create-orientation").value;
      this.#execute("object.placement.begin", {
        geometry: Object.fromEntries([
          ["type", description.type],
          ...description.parameters.map(parameter => [parameter.id, structuredClone(parameter.default)])
        ]),
        positionMode: reference && ["position", "position-rotation"].includes(mode)
          ? "reference"
          : "pointer",
        referencePosition: reference?.position ?? [0, 0, 0],
        orientationMode: reference && ["rotation", "position-rotation"].includes(mode)
          ? "reference"
          : (orientation === "reference" ? "frame" : orientation),
        rotation: reference && ["rotation", "position-rotation"].includes(mode)
          ? [...reference.rotation]
          : [0, 0, 0, 1],
        color: this.#element("edit-material-color-text").value,
        surface: this.#element("edit-create-surface").checked,
        materialPatch: this.#materialPatch()
      });
      save();
    });
    this.#click("edit-cancel-placement", "object.placement.cancel");
    this.#element("edit-create-light").addEventListener("click", () => {
      const reference = this.#creationReference();
      const mode = this.#element("edit-create-reference-mode").value;
      this.#execute("light.create", {
        type: this.#element("edit-light-type").value,
        position: reference && ["position", "position-rotation"].includes(mode)
          ? [...reference.position]
          : [0, 3, 0],
        rotation: reference && ["rotation", "position-rotation"].includes(mode)
          ? [...reference.rotation]
          : [0, 0, 0, 1],
        color: this.#element("edit-material-color-text").value,
        intensity: this.#number("edit-light-intensity"),
        distance: this.#number("edit-light-distance"),
        decay: this.#number("edit-light-decay"),
        angleDeg: this.#number("edit-light-angle"),
        penumbra: this.#number("edit-light-penumbra"),
        castShadow: this.#element("edit-light-shadow").checked
      });
      save();
    });
    this.#element("edit-light-apply").addEventListener("click", () => {
      this.#applyLightDefaults();
      save();
    });
    this.#element("edit-light-read").addEventListener("click", () => {
      try {
        this.#readLightFromSelection();
        save();
        this.#text("mesh-edit-error", "");
      } catch (error) {
        this.#text("mesh-edit-error", error.message);
      }
    });
    this.#element("edit-material-apply").addEventListener("click", () => {
      this.#applyMaterialDefaults();
      save();
    });
    this.#element("edit-material-read").addEventListener("click", () => {
      try {
        this.#readMaterialFromSelection();
        save();
        this.#text("mesh-edit-error", "");
      } catch (error) {
        this.#text("mesh-edit-error", error.message);
      }
    });
    this.#element("edit-open-advanced-create").addEventListener("click", () => {
      this.root.dispatchEvent(new CustomEvent("spatialseed:open-geometry-create", {
        bubbles: true
      }));
    });
  }

  #refreshCreationReferences() {
    const select = this.#element("edit-create-reference");
    const previous = select.value;
    const objects = this.query("scene.objects.list") ?? [];
    select.replaceChildren(...[
      { id: "", name: "Nenhum; usar valores padrão", kind: "" },
      ...objects
    ].map(object => {
      const option = document.createElement("option");
      option.value = object.id;
      option.textContent = object.id
        ? `${object.name} · ${object.kind}`
        : object.name;
      return option;
    }));
    if ([...select.options].some(option => option.value === previous)) {
      select.value = previous;
    }
  }

  #creationReference() {
    const id = this.#element("edit-create-reference").value;
    if (!id) return null;
    return (this.query("scene.objects.list") ?? []).find(object => object.id === id) ?? null;
  }

  #syncMaterialColor(value) {
    const color = normalizeColor(value);
    this.#element("edit-material-color").value = color;
    this.#element("edit-material-color-text").value = color;
  }

  #materialPatch() {
    return {
      "appearance.model": this.#element("edit-material-model").value,
      "appearance.color": normalizeColor(this.#element("edit-material-color-text").value),
      "appearance.opacity": this.#number("edit-material-opacity"),
      "appearance.transparent": this.#number("edit-material-opacity") < 1,
      "appearance.roughness": this.#number("edit-material-roughness"),
      "appearance.metalness": this.#number("edit-material-metalness"),
      "appearance.transmission": this.#number("edit-material-transmission"),
      "appearance.ior": this.#number("edit-material-ior"),
      "appearance.thickness": this.#number("edit-material-thickness"),
      "appearance.dispersion": this.#number("edit-material-dispersion"),
      "appearance.clearcoat": this.#number("edit-material-clearcoat"),
      "appearance.envMapIntensity": this.#number("edit-material-env")
    };
  }

  #applyMaterialDefaults() {
    return this.#execute("selection.properties.set", {
      patch: this.#materialPatch(),
      targetScope: "renderables"
    });
  }

  #lightPatch() {
    return {
      "light.type": this.#element("edit-light-type").value,
      "light.color": normalizeColor(this.#element("edit-material-color-text").value),
      "light.intensity": this.#number("edit-light-intensity"),
      "light.distance": this.#number("edit-light-distance"),
      "light.decay": this.#number("edit-light-decay"),
      "light.angleDeg": this.#number("edit-light-angle"),
      "light.penumbra": this.#number("edit-light-penumbra"),
      "light.castShadow": this.#element("edit-light-shadow").checked
    };
  }

  #applyLightDefaults() {
    return this.#execute("selection.properties.set", {
      patch: this.#lightPatch(),
      targetScope: "selection"
    });
  }

  #readLightFromSelection() {
    const inspection = this.query("selection.properties.inspect", {
      targetScope: "selection"
    });
    if (!inspection?.count) throw new Error("Seleção vazia.");
    const fields = {
      "light.type": "edit-light-type",
      "light.color": "edit-material-color-text",
      "light.intensity": "edit-light-intensity",
      "light.distance": "edit-light-distance",
      "light.decay": "edit-light-decay",
      "light.angleDeg": "edit-light-angle",
      "light.penumbra": "edit-light-penumbra",
      "light.castShadow": "edit-light-shadow"
    };
    for (const [propertyId, controlId] of Object.entries(fields)) {
      const property = inspection.properties[propertyId];
      if (property?.status !== "uniform") continue;
      const control = this.#element(controlId);
      if (control.type === "checkbox") control.checked = Boolean(property.value);
      else control.value = String(property.value);
    }
    this.#syncMaterialColor(this.#element("edit-material-color-text").value);
    this.#refreshLightParameterVisibility();
  }

  #refreshLightParameterVisibility() {
    const type = this.#element("edit-light-type").value;
    const visibility = {
      "edit-light-distance": ["point", "spot"].includes(type),
      "edit-light-decay": ["point", "spot"].includes(type),
      "edit-light-angle": type === "spot",
      "edit-light-penumbra": type === "spot",
      "edit-light-shadow": type !== "ambient"
    };
    for (const [id, visible] of Object.entries(visibility)) {
      const control = this.#element(id);
      const container = control.closest("label") ?? control;
      container.hidden = !visible;
      control.disabled = !visible;
    }
  }

  #readMaterialFromSelection() {
    const inspection = this.query("selection.properties.inspect", {
      targetScope: "renderables"
    });
    if (!inspection?.count) throw new Error("Seleção vazia.");
    const fields = {
      "appearance.model": "edit-material-model",
      "appearance.color": "edit-material-color-text",
      "appearance.opacity": "edit-material-opacity",
      "appearance.roughness": "edit-material-roughness",
      "appearance.metalness": "edit-material-metalness",
      "appearance.transmission": "edit-material-transmission",
      "appearance.ior": "edit-material-ior",
      "appearance.thickness": "edit-material-thickness",
      "appearance.dispersion": "edit-material-dispersion",
      "appearance.clearcoat": "edit-material-clearcoat",
      "appearance.envMapIntensity": "edit-material-env"
    };
    for (const [propertyId, controlId] of Object.entries(fields)) {
      const property = inspection.properties[propertyId];
      if (property?.status === "uniform") this.#element(controlId).value = String(property.value);
    }
    this.#syncMaterialColor(this.#element("edit-material-color-text").value);
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
    this.unsubscribeContext?.();
    this.unsubscribeSketch?.();
    document.removeEventListener("keydown", this.onKeyDown, true);
  }

  #bind() {
    for (const button of this.root.querySelectorAll("[data-edit-workspace-subject]")) {
      button.addEventListener("click", () => this.#execute(
        "edit.context.subject.set",
        { level: button.dataset.editWorkspaceSubject }
      ));
    }
    for (const button of this.root.querySelectorAll("[data-edit-workspace-tool]")) {
      button.addEventListener("click", () => this.#execute(
        "edit.context.tool.set",
        { mode: button.dataset.editWorkspaceTool }
      ));
    }
    for (const button of this.root.querySelectorAll("[data-edit-workspace-selection]")) {
      button.addEventListener("click", () => this.#execute(
        "edit.context.selection-operation.set",
        { operation: button.dataset.editWorkspaceSelection }
      ));
    }
    this.#element("edit-workspace-area").addEventListener("change", () =>
      this.#execute("selection.area.toggle")
    );
    this.#element("edit-workspace-multi").addEventListener("change", () =>
      this.#execute("selection.multi.toggle")
    );
    this.#element("edit-workspace-keep-tool").addEventListener("change", event =>
      this.#execute("edit.tool.keep.set", { enabled: event.target.checked })
    );
    this.#click("edit-workspace-duplicate", "selection.duplicate");
    this.#click("edit-workspace-repeat", "edit.command.repeat");
    this.#click("edit-workspace-delete", "selection.delete");
    this.#click("edit-workspace-clear", "selection.clear");
    this.#click("edit-workspace-undo-global", "history.undo");
    this.#click("edit-workspace-redo-global", "history.redo");
    this.#click("edit-workspace-group", "selection.group");
    this.#click("edit-workspace-ungroup", "selection.ungroup");
    this.#click("edit-workspace-pivot", "pivot.edit.toggle");
    this.#click("edit-plane-lock", "edit.navigation.plane.toggle", () => ({
      source: this.#element("edit-plane-source").value
    }));
    this.#element("edit-work-plane-lock").addEventListener("click", () => {
      const context = this.query("edit.context.status");
      this.#execute(
        context.editPlane ? "edit.plane.clear" : "edit.plane.set",
        context.editPlane
          ? {}
          : { source: this.#element("edit-work-plane-source").value }
      );
    });
    this.#click("edit-point-lock", "edit.navigation.point.toggle", () => ({
      source: this.#element("edit-point-source").value
    }));
    this.#click("edit-navigation-clear", "edit.navigation.locks.clear");

    this.#click("path-sketch-begin", "path.sketch.begin", () => ({
      planeSource: this.#element("path-sketch-plane").value,
      spacingPixels: this.#integer("path-sketch-spacing"),
      simplify: this.#number("path-sketch-simplify"),
      smoothIterations: this.#integer("path-sketch-smoothing"),
      radius: this.#number("path-sketch-radius"),
      curveType: this.#element("path-sketch-curve").value
    }));
    this.#click("path-sketch-cancel", "path.sketch.cancel");
    this.#click("path-from-selection-create", "path.from-mesh-selection.create", () => ({
      curveType: this.#element("path-from-selection-curve").value,
      radius: this.#number("path-from-selection-radius")
    }));
    this.#click("path-convert-bezier", "path.bezier.convert", () => ({
      tension: 0.5
    }));
    this.#element("path-edit-controls").addEventListener("click", () => {
      const result = this.#execute("edit.context.subject.set", {
        level: "vertex",
        selectAll: true
      });
      if (result) this.#execute("edit.context.tool.set", { mode: "translate" });
    });

    this.#element("path-reference-object").addEventListener("change", () =>
      this.#refreshExtractionSelects()
    );
    this.#element("path-profile-object").addEventListener("change", () =>
      this.#refreshExtractionSelects()
    );
    this.#click("path-create-tube", "path.tube.create", () => ({
      path: this.#pathReference(),
      radius: this.#number("path-tube-radius"),
      tubularSegments: this.#integer("path-segments"),
      radialSegments: this.#integer("path-radial-segments"),
      closed: this.#element("path-closed").checked
    }));
    this.#click("path-create-sweep", "path.sweep.create", () => ({
      path: this.#pathReference(),
      profile: this.#profileReference(),
      segments: this.#integer("path-segments"),
      closedPath: this.#element("path-closed").checked,
      twistDegrees: this.#number("path-sweep-twist"),
      scaleStart: this.#number("path-sweep-scale-start"),
      scaleEnd: this.#number("path-sweep-scale-end"),
      caps: this.#element("path-caps").checked
    }));
    this.#click("path-create-array", "path.array.create", () => ({
      path: this.#pathReference(),
      count: this.#integer("path-array-count"),
      align: this.#element("path-array-align").checked,
      closed: this.#element("path-closed").checked,
      includePathObject: this.#element("path-array-include-reference").checked
    }));
    this.#element("path-inspect-reference").addEventListener("click", () => {
      try {
        const result = this.query("path.reference.inspect", {
          kind: "path",
          reference: this.#pathReference()
        });
        this.#text(
          "path-reference-status",
          `${result.objectName}: ${result.points.length} pontos; ${result.closed ? "fechado" : "aberto"}; extração ${result.extraction}.`
        );
        this.#text("mesh-edit-error", "");
      } catch (error) {
        this.#text("mesh-edit-error", error.message);
      }
    });

    this.#element("tt-apply").addEventListener("click", () =>
      this.#applyTransformSettings()
    );
    for (const id of [
      "tt-grid-lock", "tt-show-x", "tt-show-y", "tt-show-z",
      "tt-show-vertices", "tt-vertex-size"
    ]) {
      this.#element(id).addEventListener("change", () =>
        this.#applyTransformSettings()
      );
    }

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
    this.#click("mesh-frame-world", "edit.context.frame.set", () => ({
      mode: "world"
    }));
    this.#click("mesh-frame-local", "edit.context.frame.set", () => ({
      mode: "local"
    }));
    this.#click("mesh-frame-viewer", "edit.context.frame.set", () => ({
      mode: "viewer"
    }));
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
    const storageKey = "spatialseed.edit.workspace.sections.v3";
    let stored = {};
    try { stored = JSON.parse(localStorage.getItem(storageKey) ?? "{}"); }
    catch { stored = {}; }
    this.#element("mesh-panel-adaptive").checked = stored.adaptive === true;
    const apply = () => {
      for (const checkbox of this.root.querySelectorAll("[data-mesh-section-toggle]")) {
        const section = checkbox.dataset.meshSectionToggle;
        if (stored[section] !== undefined) checkbox.checked = Boolean(stored[section]);
        for (const element of this.root.querySelectorAll(`[data-mesh-section="${section}"]`)) {
          element.dataset.userVisible = checkbox.checked ? "true" : "false";
        }
      }
      this.#applyAdaptiveVisibility(
        this.latest ?? this.query("mesh.edit.status"),
        this.latestContext ?? this.query("edit.context.status")
      );
    };
    apply();
    for (const checkbox of this.root.querySelectorAll("[data-mesh-section-toggle]")) {
      checkbox.addEventListener("change", () => {
        stored = {};
        for (const item of this.root.querySelectorAll("[data-mesh-section-toggle]")) {
          stored[item.dataset.meshSectionToggle] = item.checked;
        }
        stored.adaptive = this.#element("mesh-panel-adaptive").checked;
        localStorage.setItem(storageKey, JSON.stringify(stored));
        apply();
      });
    }
    this.#element("mesh-panel-adaptive").addEventListener("change", () => {
      stored.adaptive = this.#element("mesh-panel-adaptive").checked;
      localStorage.setItem(storageKey, JSON.stringify(stored));
      apply();
    });
  }

  #refreshReferenceSelects(references) {
    const pathSelect = this.#element("path-reference-object");
    const profileSelect = this.#element("path-profile-object");
    const previousPath = pathSelect.value;
    const previousProfile = profileSelect.value;
    const pathOptions = [
      { value: "@selection-origins", label: "Origens dos objetos selecionados" },
      ...references
        .filter(reference => reference.pathExtractions?.length)
        .map(reference => ({
          value: reference.id,
          label: `${reference.name} · ${reference.kind}`
        }))
    ];
    const profileOptions = references
      .filter(reference => reference.profileExtractions?.length)
      .map(reference => ({
        value: reference.id,
        label: `${reference.name} · ${reference.kind}`
      }));
    fillSelect(pathSelect, pathOptions, previousPath);
    fillSelect(profileSelect, profileOptions, previousProfile);
    const activeReference = references.find(reference => reference.selected);
    if (!previousPath && activeReference?.pathExtractions?.length) {
      pathSelect.value = activeReference.id;
    }
    if (!previousProfile && activeReference?.profileExtractions?.length) {
      profileSelect.value = activeReference.id;
    }
    this.#refreshExtractionSelects();
  }

  #refreshExtractionSelects() {
    const references = this.latestReferences ?? [];
    const pathValue = this.#element("path-reference-object").value;
    const profileValue = this.#element("path-profile-object").value;
    const pathReference = references.find(reference => reference.id === pathValue);
    const profileReference = references.find(reference => reference.id === profileValue);
    fillSelect(
      this.#element("path-reference-extraction"),
      (pathValue === "@selection-origins"
        ? ["auto"]
        : pathReference?.pathExtractions ?? ["auto"]
      ).map(value => ({ value, label: extractionLabel(value) })),
      this.#element("path-reference-extraction").value
    );
    fillSelect(
      this.#element("path-profile-extraction"),
      (profileReference?.profileExtractions ?? ["auto"])
        .map(value => ({ value, label: extractionLabel(value) })),
      this.#element("path-profile-extraction").value
    );
  }

  #pathReference() {
    const value = this.#element("path-reference-object").value;
    if (!value) throw new Error("Escolha um objeto de caminho.");
    if (value === "@selection-origins") {
      return {
        source: "selection-origins",
        extraction: "auto",
        closed: this.#element("path-closed").checked
      };
    }
    return {
      source: "object",
      objectId: value,
      extraction: this.#element("path-reference-extraction").value,
      closed: this.#element("path-closed").checked
    };
  }

  #profileReference() {
    const objectId = this.#element("path-profile-object").value;
    if (!objectId) throw new Error("Escolha um objeto de perfil.");
    return {
      source: "object",
      objectId,
      extraction: this.#element("path-profile-extraction").value
    };
  }

  #objectPathControlIds() {
    return [
      "path-reference-object", "path-reference-extraction",
      "path-profile-object", "path-profile-extraction",
      "path-closed", "path-caps", "path-array-align",
      "path-array-include-reference", "path-tube-radius",
      "path-segments", "path-radial-segments", "path-create-tube",
      "path-sweep-twist", "path-sweep-scale-start",
      "path-sweep-scale-end", "path-create-sweep",
      "path-array-count", "path-create-array", "path-inspect-reference",
      "path-convert-bezier", "path-edit-controls"
    ];
  }

  #refreshTransformSettings(config = {}) {
    this.#value("tt-size", config.size ?? 1.25);
    this.#value("tt-translate-snap", config.translationSnap ?? 0);
    this.#value("tt-rotate-snap", config.rotationSnapDeg ?? 0);
    this.#value("tt-scale-snap", config.scaleSnap ?? 0);
    this.#element("tt-grid-lock").checked = Boolean(config.gridLock);
    this.#element("tt-show-x").checked = config.showX !== false;
    this.#element("tt-show-y").checked = config.showY !== false;
    this.#element("tt-show-z").checked = config.showZ !== false;
    this.#element("tt-show-vertices").checked = Boolean(config.showVertices);
    this.#value("tt-vertex-size", config.vertexSize ?? 5);
    this.#element("tt-diagnostics").value = JSON.stringify(
      this.query("viewer.transform.diagnostics"),
      null,
      2
    );
  }

  #applyTransformSettings() {
    return this.#execute("viewer.transform.settings.set", {
      size: this.#number("tt-size"),
      translationSnap: this.#optionalPositive("tt-translate-snap"),
      rotationSnapDeg: this.#optionalPositive("tt-rotate-snap"),
      scaleSnap: this.#optionalPositive("tt-scale-snap"),
      gridLock: this.#element("tt-grid-lock").checked,
      showX: this.#element("tt-show-x").checked,
      showY: this.#element("tt-show-y").checked,
      showZ: this.#element("tt-show-z").checked,
      showVertices: this.#element("tt-show-vertices").checked,
      vertexSize: this.#number("tt-vertex-size")
    });
  }

  #applyAdaptiveVisibility(state, context) {
    const mesh = Boolean(state?.active);
    const adaptive = this.#element("mesh-panel-adaptive").checked;
    const tool = context?.tool ?? "select";
    const transforming = ["translate", "rotate", "scale"].includes(tool);
    for (const element of this.root.querySelectorAll("[data-mesh-section]")) {
      const userVisible = element.dataset.userVisible !== "false";
      const requirement = element.dataset.editContext ?? "any";
      const contextVisible = !adaptive || requirement === "any" ||
        (requirement === "mesh" && mesh) ||
        (requirement === "object" && !mesh);
      const section = element.dataset.meshSection;
      const adaptiveVisible = !adaptive || ({
        session: true,
        context: true,
        selection: mesh,
        topology: mesh && !transforming,
        paths: mesh ? tool === "select" : !transforming,
        gizmo: transforming,
        transform: transforming,
        snap: transforming || tool === "select",
        influence: mesh && transforming,
        diagnostics: true
      }[section] ?? true);
      element.hidden = !(userVisible && contextVisible && adaptiveVisible);
    }
    for (const group of this.root.querySelectorAll("[data-path-context]")) {
      group.hidden = adaptive && (group.dataset.pathContext === "mesh" ? !mesh : mesh);
    }
    const mode = state?.componentMode ?? "vertex";
    for (const control of this.root.querySelectorAll("[data-component-modes]")) {
      const compatible = control.dataset.componentModes.split(/\s+/).includes(mode);
      control.hidden = adaptive && !compatible;
      control.disabled = !state?.active || !compatible;
    }
    if (state?.pathControlMode && adaptive) {
      this.#element("mesh-mode-face").hidden = true;
      for (const section of this.root.querySelectorAll('[data-mesh-section="topology"]')) {
        section.hidden = true;
      }
    } else {
      this.#element("mesh-mode-face").hidden = false;
    }
    this.root.dataset.contextTool = context?.tool ?? "select";
    this.root.dataset.componentMode = mode;
  }

  #optionalPositive(id) {
    const value = this.#number(id);
    return value > 0 ? value : null;
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
      "path-from-selection-curve", "path-from-selection-radius",
      "path-from-selection-create",
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

  #integer(id) {
    const value = this.#number(id);
    if (!Number.isInteger(value)) throw new Error(`Valor inteiro exigido em ${id}.`);
    return value;
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

function extractionLabel(value) {
  return ({
    auto: "Automática",
    centerline: "Linha central declarada",
    boundary: "Maior contorno",
    "loose-edges": "Arestas soltas",
    contour: "Contorno declarado"
  })[value] ?? value;
}

function fillSelect(select, options, preferred) {
  const available = new Set(options.map(option => option.value));
  select.replaceChildren(...options.map(option => {
    const element = document.createElement("option");
    element.value = option.value;
    element.textContent = option.label;
    return element;
  }));
  if (preferred && available.has(preferred)) select.value = preferred;
}

function loadCreationDefaults() {
  const fallback = {
    geometryType: "box",
    color: "#6699cc",
    model: "standard",
    opacity: 1,
    roughness: 0.55,
    metalness: 0,
    transmission: 0,
    ior: 1.5,
    thickness: 0.5,
    dispersion: 0,
    clearcoat: 0,
    envMapIntensity: 1,
    lightType: "point",
    lightIntensity: 3,
    lightDistance: 0,
    lightDecay: 2,
    lightAngleDeg: 45,
    lightPenumbra: 0.2,
    lightCastShadow: true,
    placementOrientation: "frame",
    placementSurface: true
  };
  try {
    return { ...fallback, ...JSON.parse(localStorage.getItem(CREATION_STORAGE_KEY) ?? "{}") };
  } catch {
    return fallback;
  }
}

function normalizeColor(value) {
  const source = String(value ?? "").trim();
  const short = /^#([0-9a-f]{3})$/i.exec(source);
  if (short) return `#${[...short[1]].map(char => char + char).join("")}`.toLowerCase();
  if (!/^#[0-9a-f]{6}$/i.test(source)) throw new Error(`Cor inválida: ${value}.`);
  return source.toLowerCase();
}
