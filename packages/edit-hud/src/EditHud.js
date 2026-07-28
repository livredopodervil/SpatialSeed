const STORAGE_KEY = "spatialseed.edit.hud.v1";
const CREATION_STORAGE_KEY = "spatialseed.edit.creation-material.v1";
const DEFAULT_PREFERENCES = Object.freeze({
  dock: "floating",
  orientation: "horizontal",
  size: "normal",
  opacity: 0.96,
  columns: 4,
  rows: 2,
  tapHints: true,
  left: 12,
  defaults: {
    extrude: 1,
    inset: 0.2,
    pathRadius: 0.08
  },
  top: 96,
  groups: {
    subject: true,
    tool: true,
    frame: true,
    axes: true,
    snap: true,
    navigation: true,
    lifecycle: true,
    actions: true,
    session: true
  }
});

export class EditHud {
  static apiVersion = "edit-hud-v1";

  #unsubscribe = null;
  #preferences = structuredClone(DEFAULT_PREFERENCES);
  #drag = null;
  #helpMode = false;
  #hintPointer = null;
  #hintTimer = null;
  #hintHideTimer = null;
  #suppressedClick = null;

  constructor({ root, query, execute, subscribe, openWorkspace = null }) {
    if (!root) throw new TypeError("EditHud exige root.");
    if (typeof query !== "function" || typeof execute !== "function") {
      throw new TypeError("EditHud exige query e execute.");
    }
    this.root = root;
    this.query = query;
    this.execute = execute;
    this.openWorkspace = openWorkspace;
    this.#loadPreferences();
    this.#prepareHints();
    this.#bind();
    this.#applyPreferences();
    this.#unsubscribe = subscribe?.(snapshot => this.refresh(snapshot)) ?? null;
    this.refresh();
  }

  dispose() {
    this.#unsubscribe?.();
    this.#listeners(false);
    this.#clearHintTimer();
    this.#clearHintHideTimer();
  }

  refresh(snapshot = null) {
    const state = snapshot ?? this.query("edit.context.status");
    this.root.dataset.meshActive = state.meshActive ? "true" : "false";
    this.root.dataset.planeLocked = state.planeLock ? "true" : "false";
    this.root.dataset.pointLocked = state.pointLock ? "true" : "false";

    for (const button of this.root.querySelectorAll("[data-edit-subject]")) {
      button.dataset.active = button.dataset.editSubject === state.subjectLevel
        ? "true"
        : "false";
    }
    for (const button of this.root.querySelectorAll("[data-edit-tool]")) {
      button.dataset.active = button.dataset.editTool === state.tool
        ? "true"
        : "false";
    }
    this.#element("edit-hud-area-selection").dataset.active =
      state.areaSelection ? "true" : "false";
    for (const button of this.root.querySelectorAll("[data-edit-frame]")) {
      button.dataset.active = button.dataset.editFrame === state.frameMode
        ? "true"
        : "false";
    }
    for (const axis of ["x", "y", "z"]) {
      this.#element(`edit-hud-axis-${axis}`).checked = Boolean(state.axes[axis]);
    }
    const snap = state.snap ?? {};
    this.#element("edit-hud-snap-enabled").checked = Boolean(snap.enabled);
    this.#element("edit-hud-snap-auto").checked = Boolean(snap.auto);
    this.#element("edit-hud-snap-vertex").checked = Boolean(snap.vertex);
    this.#element("edit-hud-snap-edge").checked = Boolean(snap.edge);
    this.#element("edit-hud-snap-face").checked = Boolean(snap.face);
    this.#element("edit-hud-snap-grid").checked = Boolean(snap.grid);
    this.#element("edit-hud-proportional").checked = Boolean(state.proportional);
    this.#element("edit-hud-plane-lock").checked = Boolean(state.planeLock);
    this.#element("edit-hud-edit-plane").checked = Boolean(state.editPlane);
    this.#element("edit-hud-point-lock").checked = Boolean(state.pointLock);
    this.#element("edit-hud-keep-tool").checked = Boolean(state.keepToolActive);
    this.#element("edit-hud-repeat").disabled = !state.canRepeat;
    this.#element("edit-hud-repeat").dataset.active = state.canRepeat ? "true" : "false";
    const projectHistory = state.meshActive
      ? { canUndo: state.canUndo, canRedo: state.canRedo }
      : this.query("history.status");
    this.#element("edit-hud-undo").disabled = !projectHistory.canUndo;
    this.#element("edit-hud-redo").disabled = !projectHistory.canRedo;
    this.#element("edit-hud-apply").disabled = !state.meshActive || state.stale;
    this.#element("edit-hud-cancel").disabled = !state.meshActive;
    const sessionGroup = this.root.querySelector('[data-edit-hud-group="session"]');
    if (sessionGroup) {
      sessionGroup.dataset.contextHidden = state.meshActive ? "false" : "true";
    }
    this.#element("edit-hud-object").disabled = state.meshActive;
    this.#element("edit-hud-proportional").disabled = !state.meshActive;
    const description = describeState(state);
    this.#element("edit-hud-status").textContent = description;
    this.root.title = description;
    this.#refreshContextActions(state);
    this.#applyPreferences();
  }

  #bind() {
    this.#element("edit-hud-open").addEventListener("click", () => {
      this.openWorkspace?.();
    });
    this.#element("edit-hud-help").addEventListener("click", () => {
      this.#helpMode = !this.#helpMode;
      this.root.dataset.helpMode = this.#helpMode ? "true" : "false";
      this.#element("edit-hud-help").dataset.active = this.#helpMode ? "true" : "false";
      if (this.#helpMode) {
        this.#showHint(this.#element("edit-hud-help"), {
          sticky: true,
          title: "Modo ajuda ativado",
          description: "Toque em qualquer ícone para consultar sua função sem executar a ferramenta. Toque em ? novamente para sair."
        });
      } else {
        this.#hideHint();
      }
    });
    for (const button of this.root.querySelectorAll("[data-edit-subject]")) {
      button.addEventListener("click", () => this.#execute(
        "edit.context.subject.set",
        { level: button.dataset.editSubject }
      ));
    }
    for (const button of this.root.querySelectorAll("[data-edit-tool]")) {
      button.addEventListener("click", () => this.#execute(
        "edit.context.tool.set",
        { mode: button.dataset.editTool }
      ));
    }
    this.#element("edit-hud-area-selection").addEventListener("click", () => {
      const status = this.query("edit.context.status");
      if (status.tool === "select" && status.areaSelection) {
        this.#execute("selection.area.toggle");
        return;
      }
      this.#execute("edit.context.tool.set", { mode: "select" });
      if (!status.areaSelection) this.#execute("selection.area.toggle");
    });
    for (const button of this.root.querySelectorAll("[data-edit-frame]")) {
      button.addEventListener("click", () => this.#execute(
        "edit.context.frame.set",
        { mode: button.dataset.editFrame }
      ));
    }
    for (const axis of ["x", "y", "z"]) {
      this.#element(`edit-hud-axis-${axis}`).addEventListener("change", () =>
        this.#execute("edit.context.axes.set", this.#axisArguments())
      );
    }
    for (const id of [
      "edit-hud-snap-enabled",
      "edit-hud-snap-auto",
      "edit-hud-snap-vertex",
      "edit-hud-snap-edge",
      "edit-hud-snap-face",
      "edit-hud-snap-grid"
    ]) {
      this.#element(id).addEventListener("change", () =>
        this.#execute("edit.context.snap.set", this.#snapArguments())
      );
    }
    this.#element("edit-hud-proportional").addEventListener("change", event =>
      this.#execute("edit.context.proportional.set", {
        enabled: event.target.checked
      })
    );
    this.#element("edit-hud-plane-lock").addEventListener("change", event => {
      if (!event.target.checked) {
        this.#execute("edit.navigation.plane.clear");
      } else {
        this.#execute("edit.navigation.plane.toggle", { source: "viewer" });
      }
    });
    this.#element("edit-hud-point-lock").addEventListener("change", event => {
      if (!event.target.checked) {
        this.#execute("edit.navigation.point.clear");
      } else {
        this.#execute("edit.navigation.point.toggle", {
          source: this.query("mesh.edit.status").active
            ? "component"
            : "selection"
        });
      }
    });
    this.#element("edit-hud-edit-plane").addEventListener("change", event => {
      this.#execute(
        event.target.checked ? "edit.plane.set" : "edit.plane.clear",
        event.target.checked ? { source: "viewer" } : {}
      );
    });
    this.#element("edit-hud-keep-tool").addEventListener("change", event =>
      this.#execute("edit.tool.keep.set", { enabled: event.target.checked })
    );
    this.#element("edit-hud-repeat").addEventListener("click", () =>
      this.#execute("edit.command.repeat")
    );
    this.#element("edit-hud-undo").addEventListener("click", () => {
      const active = Boolean(this.query("mesh.edit.status").active);
      this.#execute(active ? "mesh.edit.undo" : "history.undo");
    });
    this.#element("edit-hud-redo").addEventListener("click", () => {
      const active = Boolean(this.query("mesh.edit.status").active);
      this.#execute(active ? "mesh.edit.redo" : "history.redo");
    });
    this.#element("edit-hud-apply").addEventListener("click", () =>
      this.#execute("mesh.edit.commit")
    );
    this.#element("edit-hud-cancel").addEventListener("click", () =>
      this.#execute("mesh.edit.cancel")
    );

    this.#element("edit-hud-dock").value = this.#preferences.dock;
    this.#element("edit-hud-orientation").value = this.#preferences.orientation;
    this.#element("edit-hud-size").value = this.#preferences.size;
    this.#element("edit-hud-opacity").value = String(this.#preferences.opacity);
    this.#element("edit-hud-columns").value = String(this.#preferences.columns);
    this.#element("edit-hud-rows").value = String(this.#preferences.rows);
    this.#element("edit-hud-tap-hints").checked = this.#preferences.tapHints !== false;
    this.#element("edit-hud-default-extrude").value = String(this.#preferences.defaults.extrude);
    this.#element("edit-hud-default-inset").value = String(this.#preferences.defaults.inset);
    this.#element("edit-hud-default-path-radius").value = String(this.#preferences.defaults.pathRadius);
    for (const checkbox of this.root.querySelectorAll("[data-edit-hud-group-toggle]")) {
      const group = checkbox.dataset.editHudGroupToggle;
      checkbox.checked = this.#preferences.groups[group] !== false;
      checkbox.addEventListener("change", () => {
        this.#preferences.groups[group] = checkbox.checked;
        this.#savePreferences();
        this.#applyPreferences();
      });
    }
    for (const id of [
      "edit-hud-dock", "edit-hud-orientation", "edit-hud-size",
      "edit-hud-opacity", "edit-hud-columns", "edit-hud-rows",
      "edit-hud-tap-hints", "edit-hud-default-extrude", "edit-hud-default-inset",
      "edit-hud-default-path-radius"
    ]) {
      this.#element(id).addEventListener("change", () => {
        this.#preferences.dock = this.#element("edit-hud-dock").value;
        this.#preferences.orientation = this.#element("edit-hud-orientation").value;
        this.#preferences.size = this.#element("edit-hud-size").value;
        this.#preferences.opacity = Number(this.#element("edit-hud-opacity").value);
        this.#preferences.columns = integerBetween(
          this.#element("edit-hud-columns").value, 1, 12, 4
        );
        this.#preferences.rows = integerBetween(
          this.#element("edit-hud-rows").value, 1, 8, 2
        );
        this.#preferences.tapHints = this.#element("edit-hud-tap-hints").checked;
        this.#preferences.defaults = {
          extrude: finiteOr(this.#element("edit-hud-default-extrude").value, 1),
          inset: clamp(finiteOr(this.#element("edit-hud-default-inset").value, 0.2), 0.001, 0.999),
          pathRadius: Math.max(0.001, finiteOr(this.#element("edit-hud-default-path-radius").value, 0.08))
        };
        this.#savePreferences();
        this.#applyPreferences();
      });
    }
    this.#element("edit-hud-reset").addEventListener("click", () => {
      this.#preferences = structuredClone(DEFAULT_PREFERENCES);
      this.#savePreferences();
      this.#applyPreferences();
    });
    const action = (id, command, args = () => ({})) => {
      this.#element(id).addEventListener("click", () => this.#execute(command, args()));
    };
    this.#element("edit-hud-create").addEventListener("click", () =>
      this.#beginRememberedObjectPlacement()
    );
    action("edit-hud-enter-mesh", "mesh.edit.enter");
    action("edit-hud-draw-path", "path.sketch.begin", () => ({
      planeSource: "locked-or-viewer",
      spacingPixels: 6,
      simplify: 0.004,
      smoothIterations: 1,
      radius: this.#preferences.defaults.pathRadius,
      curveType: "centripetal"
    }));
    this.#element("edit-hud-create-light").addEventListener("click", () =>
      this.#createRememberedLight()
    );
    this.#element("edit-hud-material").addEventListener("click", () => {
      this.openWorkspace?.();
      requestAnimationFrame(() => document.querySelector(
        '#mesh-edit-panel [data-mesh-section="create"]'
      )?.scrollIntoView({ block: "start", behavior: "smooth" }));
    });
    action("edit-hud-group", "selection.group");
    action("edit-hud-ungroup", "selection.ungroup");
    this.#element("edit-hud-duplicate").addEventListener("click", () => {
      const active = Boolean(this.query("mesh.edit.status").active);
      this.#execute(active ? "mesh.topology.apply" : "selection.duplicate",
        active ? { operation: "duplicate" } : {});
    });
    this.#element("edit-hud-delete").addEventListener("click", () => {
      const active = Boolean(this.query("mesh.edit.status").active);
      this.#execute(active ? "mesh.topology.apply" : "selection.delete",
        active ? { operation: "delete" } : {});
    });
    for (const [id, operation] of [
      ["edit-hud-select-all", "all"],
      ["edit-hud-select-none", "none"],
      ["edit-hud-select-invert", "invert"],
      ["edit-hud-select-grow", "grow"],
      ["edit-hud-select-shrink", "shrink"],
      ["edit-hud-select-linked", "linked"],
      ["edit-hud-select-boundary", "boundary"]
    ]) action(id, "mesh.selection.apply", () => ({ operation }));
    action("edit-hud-create-vertex", "mesh.topology.apply", () => ({
      operation: "create-vertex",
      options: { position: [0, 0, 0] }
    }));
    action("edit-hud-create-edge", "mesh.topology.apply", () => ({ operation: "create-edge" }));
    action("edit-hud-create-face", "mesh.topology.apply", () => ({ operation: "create-face" }));
    action("edit-hud-fill", "mesh.topology.apply", () => ({ operation: "fill" }));
    action("edit-hud-weld", "mesh.topology.apply", () => ({ operation: "weld" }));
    action("edit-hud-extrude", "mesh.topology.apply", () => ({
      operation: "extrude",
      options: { distance: this.#preferences.defaults.extrude }
    }));
    action("edit-hud-inset", "mesh.topology.apply", () => ({
      operation: "inset",
      options: { amount: this.#preferences.defaults.inset }
    }));
    action("edit-hud-split", "mesh.topology.apply", () => ({
      operation: "split",
      options: { parameter: 0.5 }
    }));
    action("edit-hud-collapse", "mesh.topology.apply", () => ({ operation: "collapse" }));
    action("edit-hud-flip-edge", "mesh.topology.apply", () => ({ operation: "flip-edge" }));
    action("edit-hud-bridge", "mesh.topology.apply", () => ({ operation: "bridge" }));
    action("edit-hud-subdivide", "mesh.topology.apply", () => ({ operation: "subdivide" }));
    action("edit-hud-flip-normal", "mesh.topology.apply", () => ({ operation: "flip-normal" }));
    action("edit-hud-path-from-selection", "path.from-mesh-selection.create", () => ({
      curveType: "centripetal",
      radius: this.#preferences.defaults.pathRadius
    }));
    action("edit-hud-recalculate-normals", "mesh.topology.apply", () => ({
      operation: "recalculate-normals"
    }));
    action("edit-hud-cleanup", "mesh.topology.apply", () => ({ operation: "cleanup" }));
    this.#listeners(true);
  }

  #prepareHints() {
    const controls = this.root.querySelectorAll(
      ".edit-hud-strip button, .edit-hud-strip label, #edit-hud-open, #edit-hud-help, .edit-hud-config > summary"
    );
    for (const control of controls) {
      const hint = resolveHudHint(control);
      control.dataset.hudHint = "true";
      control.dataset.hudHintTitle = hint.title;
      control.dataset.hudHintDescription = hint.description;
      control.setAttribute("aria-label", hint.title);
      control.setAttribute("aria-describedby", "edit-hud-tooltip-description");
      if (control.tagName === "LABEL" && !control.hasAttribute("tabindex")) {
        control.tabIndex = 0;
      }
      control.removeAttribute("title");
    }
  }

  #hintTarget(target) {
    const control = target?.closest?.('[data-hud-hint="true"]');
    return control && this.root.contains(control) ? control : null;
  }

  #showHint(control, { sticky = false, duration = 0, title = null, description = null } = {}) {
    if (!control) return;
    this.#clearHintHideTimer();
    const tooltip = this.#element("edit-hud-tooltip");
    this.#element("edit-hud-tooltip-title").textContent =
      title ?? control.dataset.hudHintTitle ?? "Ferramenta";
    this.#element("edit-hud-tooltip-description").textContent =
      description ?? control.dataset.hudHintDescription ?? "";
    tooltip.hidden = false;
    tooltip.dataset.sticky = sticky ? "true" : "false";
    tooltip.dataset.visible = "true";
    requestAnimationFrame(() => this.#positionHint(control));
    if (duration > 0 && !sticky) {
      this.#hintHideTimer = setTimeout(() => this.#hideHint(), duration);
    }
  }

  #positionHint(control) {
    const tooltip = this.#element("edit-hud-tooltip");
    if (tooltip.hidden) return;
    const anchor = control.getBoundingClientRect();
    const rect = tooltip.getBoundingClientRect();
    const margin = 8;
    let left = anchor.left + anchor.width / 2 - rect.width / 2;
    let top = anchor.bottom + 8;
    if (top + rect.height > globalThis.innerHeight - margin) {
      top = anchor.top - rect.height - 8;
    }
    left = clamp(left, margin, Math.max(margin, globalThis.innerWidth - rect.width - margin));
    top = clamp(top, margin, Math.max(margin, globalThis.innerHeight - rect.height - margin));
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
  }

  #hideHint({ force = false } = {}) {
    const tooltip = this.#element("edit-hud-tooltip");
    if (!force && tooltip.dataset.sticky === "true" && this.#helpMode) return;
    this.#clearHintHideTimer();
    tooltip.dataset.visible = "false";
    tooltip.dataset.sticky = "false";
    tooltip.hidden = true;
  }

  #clearHintTimer() {
    if (this.#hintTimer !== null) clearTimeout(this.#hintTimer);
    this.#hintTimer = null;
  }

  #clearHintHideTimer() {
    if (this.#hintHideTimer !== null) clearTimeout(this.#hintHideTimer);
    this.#hintHideTimer = null;
  }

  #onHintPointerDown = event => {
    const control = this.#hintTarget(event.target);
    if (!control || event.pointerType === "mouse") return;
    if (this.#helpMode && control.id !== "edit-hud-help") {
      this.#suppressedClick = { control, until: performance.now() + 800 };
      this.#showHint(control, { sticky: true });
      return;
    }
    this.#clearHintTimer();
    this.#hintPointer = {
      pointerId: event.pointerId,
      control,
      x: event.clientX,
      y: event.clientY,
      longPress: false
    };
    this.#hintTimer = setTimeout(() => {
      if (!this.#hintPointer || this.#hintPointer.pointerId !== event.pointerId) return;
      this.#hintPointer.longPress = true;
      this.#suppressedClick = { control, until: performance.now() + 800 };
      this.#showHint(control, { sticky: true });
      globalThis.navigator?.vibrate?.(12);
    }, 480);
  };

  #onHintPointerMove = event => {
    if (!this.#hintPointer || event.pointerId !== this.#hintPointer.pointerId) return;
    const distance = Math.hypot(
      event.clientX - this.#hintPointer.x,
      event.clientY - this.#hintPointer.y
    );
    if (distance > 10) {
      this.#clearHintTimer();
      this.#hintPointer = null;
    }
  };

  #onHintPointerUp = event => {
    if (!this.#hintPointer || event.pointerId !== this.#hintPointer.pointerId) return;
    const longPress = this.#hintPointer.longPress;
    this.#clearHintTimer();
    this.#hintPointer = null;
    if (longPress && event.cancelable) event.preventDefault();
  };

  #onHintClickCapture = event => {
    const control = this.#hintTarget(event.target);
    if (!control) return;
    const suppressed = this.#suppressedClick;
    if (suppressed?.control === control && performance.now() <= suppressed.until) {
      this.#suppressedClick = null;
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    if (this.#helpMode && control.id !== "edit-hud-help") {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.#showHint(control, { sticky: true });
    }
  };

  #onHintClickFeedback = event => {
    const control = this.#hintTarget(event.target);
    if (!control || control.id === "edit-hud-help" || this.#helpMode ||
      this.#preferences.tapHints === false) return;
    this.#showHint(control, { duration: 1300 });
  };

  #onHintPointerOver = event => {
    if (event.pointerType !== "mouse") return;
    const control = this.#hintTarget(event.target);
    if (!control || control.contains(event.relatedTarget)) return;
    this.#showHint(control);
  };

  #onHintPointerOut = event => {
    if (event.pointerType !== "mouse") return;
    const control = this.#hintTarget(event.target);
    if (!control || control.contains(event.relatedTarget)) return;
    this.#hideHint();
  };

  #onHintFocusIn = event => {
    const control = this.#hintTarget(event.target);
    if (control) this.#showHint(control);
  };

  #onHintFocusOut = event => {
    const control = this.#hintTarget(event.target);
    if (control && !control.contains(event.relatedTarget)) this.#hideHint();
  };

  #onHintDocumentPointerDown = event => {
    if (this.root.contains(event.target)) return;
    this.#hideHint({ force: !this.#helpMode });
  };

  #onHintKeyDown = event => {
    if (event.key === "Escape") {
      this.#helpMode = false;
      this.root.dataset.helpMode = "false";
      this.#element("edit-hud-help").dataset.active = "false";
      this.#hideHint({ force: true });
    }
  };

  #createRememberedLight() {
    let defaults = {};
    try {
      defaults = JSON.parse(localStorage.getItem(CREATION_STORAGE_KEY) ?? "{}");
    } catch {
      defaults = {};
    }
    const selection = this.query("selection.snapshot");
    const objectId = selection?.activeMember?.objectId ?? null;
    const reference = objectId
      ? (this.query("scene.objects.list") ?? []).find(object => object.id === objectId)
      : null;
    return this.#execute("light.create", {
      type: defaults.lightType ?? "point",
      position: reference ? [...reference.position] : [0, 3, 0],
      rotation: reference ? [...reference.rotation] : [0, 0, 0, 1],
      color: normalizeRememberedColor(defaults.color),
      intensity: finiteOr(defaults.lightIntensity, 3),
      distance: Math.max(0, finiteOr(defaults.lightDistance, 0)),
      decay: Math.max(0, finiteOr(defaults.lightDecay, 2)),
      angleDeg: clamp(finiteOr(defaults.lightAngleDeg, 45), 1, 179),
      penumbra: clamp(finiteOr(defaults.lightPenumbra, 0.2), 0, 1),
      castShadow: defaults.lightCastShadow !== false
    });
  }

  #beginRememberedObjectPlacement() {
    try {
      let defaults = {};
      defaults = JSON.parse(localStorage.getItem(CREATION_STORAGE_KEY) ?? "{}");
      const catalog = this.query("geometry.catalog") ?? [];
      const description = catalog.find(item => item.type === defaults.geometryType) ?? catalog[0];
      if (!description) throw new Error("Catálogo de geometrias vazio.");
      const geometry = Object.fromEntries([
        ["type", description.type],
        ...(description.parameters ?? []).map(parameter => [
          parameter.id,
          structuredClone(parameter.default)
        ])
      ]);
      const selection = this.query("selection.snapshot");
      const objectId = selection?.activeMember?.objectId ?? null;
      const reference = objectId
        ? (this.query("scene.objects.list") ?? []).find(object => object.id === objectId)
        : null;
      return this.#execute("object.placement.begin", {
        geometry,
        color: normalizeRememberedColor(defaults.color),
        surface: true,
        orientationMode: reference ? "reference" : "frame",
        positionMode: "pointer",
        rotation: reference?.rotation ?? [0, 0, 0, 1],
        referencePosition: reference?.position ?? [0, 0, 0],
        materialPatch: rememberedMaterialPatch(defaults)
      });
    } catch (error) {
      this.#element("edit-hud-status").textContent = error.message;
      return null;
    }
  }

  #listeners(enabled) {
    const handle = this.#element("edit-hud-handle");
    const method = enabled ? "addEventListener" : "removeEventListener";
    handle[method]("pointerdown", this.#onPointerDown);
    this.root[method]("pointerdown", this.#onHintPointerDown, true);
    this.root[method]("click", this.#onHintClickCapture, true);
    this.root[method]("click", this.#onHintClickFeedback);
    this.root[method]("pointerover", this.#onHintPointerOver);
    this.root[method]("pointerout", this.#onHintPointerOut);
    this.root[method]("focusin", this.#onHintFocusIn);
    this.root[method]("focusout", this.#onHintFocusOut);
    globalThis[method]("pointermove", this.#onPointerMove);
    globalThis[method]("pointermove", this.#onHintPointerMove);
    globalThis[method]("pointerup", this.#onPointerUp);
    globalThis[method]("pointerup", this.#onHintPointerUp);
    globalThis[method]("pointercancel", this.#onPointerUp);
    globalThis[method]("pointercancel", this.#onHintPointerUp);
    globalThis[method]("resize", this.#onResize);
    globalThis.document?.[method]("pointerdown", this.#onHintDocumentPointerDown, true);
    globalThis.document?.[method]("keydown", this.#onHintKeyDown);
  }

  #onPointerDown = event => {
    if (this.#preferences.dock !== "floating") return;
    if (event.target.closest("button, input, select, summary, details")) return;
    const rect = this.root.getBoundingClientRect();
    this.#drag = {
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  };

  #onPointerMove = event => {
    if (!this.#drag || event.pointerId !== this.#drag.pointerId) return;
    const width = this.root.offsetWidth;
    const height = this.root.offsetHeight;
    const left = clamp(
      event.clientX - this.#drag.offsetX,
      0,
      Math.max(0, innerWidth - width)
    );
    const top = clamp(
      event.clientY - this.#drag.offsetY,
      0,
      Math.max(0, innerHeight - height)
    );
    this.#preferences.left = left;
    this.#preferences.top = top;
    this.root.style.left = `${left}px`;
    this.root.style.top = `${top}px`;
    event.preventDefault();
  };

  #onPointerUp = event => {
    if (!this.#drag || event.pointerId !== this.#drag.pointerId) return;
    this.#drag = null;
    this.#fitToViewport();
    this.#savePreferences();
  };

  #onResize = () => {
    this.#fitToViewport();
  };

  #applyPreferences() {
    const p = this.#preferences;
    this.root.dataset.dock = p.dock;
    this.root.dataset.orientation = p.orientation;
    this.root.dataset.size = p.size;
    this.root.style.setProperty("--edit-hud-opacity", String(p.opacity));
    this.root.style.setProperty("--edit-hud-columns", String(p.columns));
    this.root.style.setProperty("--edit-hud-rows", String(p.rows));
    const cellSize = ({ compact: 26, normal: 32, large: 42 })[p.size] ?? 32;
    this.root.style.setProperty(
      "--edit-hud-window-height",
      `${p.rows * cellSize + Math.max(0, p.rows - 1) * 3 + 10}px`
    );
    this.root.style.setProperty(
      "--edit-hud-window-width",
      `${p.columns * cellSize + Math.max(0, p.columns - 1) * 3 + 10}px`
    );
    if (p.dock === "floating") {
      this.root.style.left = `${p.left}px`;
      this.root.style.top = `${p.top}px`;
      this.root.style.right = "auto";
      this.root.style.bottom = "auto";
    } else {
      this.root.style.left = "0";
      this.root.style.right = "0";
      this.root.style.top = p.dock === "top"
        ? "var(--ss-toolbar-clearance, 4rem)"
        : "auto";
      this.root.style.bottom = p.dock === "bottom" ? "0" : "auto";
    }
    for (const group of this.root.querySelectorAll("[data-edit-hud-group]")) {
      group.hidden = p.groups[group.dataset.editHudGroup] === false ||
        group.dataset.contextHidden === "true";
    }
    for (const checkbox of this.root.querySelectorAll("[data-edit-hud-group-toggle]")) {
      checkbox.checked = p.groups[checkbox.dataset.editHudGroupToggle] !== false;
    }
    this.#element("edit-hud-dock").value = p.dock;
    this.#element("edit-hud-orientation").value = p.orientation;
    this.#element("edit-hud-size").value = p.size;
    this.#element("edit-hud-opacity").value = String(p.opacity);
    this.#element("edit-hud-columns").value = String(p.columns);
    this.#element("edit-hud-rows").value = String(p.rows);
    this.#element("edit-hud-tap-hints").checked = p.tapHints !== false;
    this.#element("edit-hud-default-extrude").value = String(p.defaults.extrude);
    this.#element("edit-hud-default-inset").value = String(p.defaults.inset);
    this.#element("edit-hud-default-path-radius").value = String(p.defaults.pathRadius);
    requestAnimationFrame(() => this.#fitToViewport());
  }

  #fitToViewport() {
    if (this.#preferences.dock !== "floating") return;
    const rect = this.root.getBoundingClientRect();
    const maxLeft = Math.max(0, globalThis.innerWidth - Math.min(rect.width, globalThis.innerWidth));
    const maxTop = Math.max(0, globalThis.innerHeight - Math.min(rect.height, globalThis.innerHeight));
    const left = clamp(Number.isFinite(rect.left) ? rect.left : this.#preferences.left, 0, maxLeft);
    const top = clamp(Number.isFinite(rect.top) ? rect.top : this.#preferences.top, 0, maxTop);
    this.#preferences.left = left;
    this.#preferences.top = top;
    this.root.style.left = `${left}px`;
    this.root.style.top = `${top}px`;
  }

  #refreshContextActions(state) {
    const mode = state.meshActive ? state.subjectLevel : "object";
    const tokens = new Set(state.meshActive ? ["mesh", mode] : ["object"]);
    const mesh = this.query("mesh.edit.status");
    const selection = this.query("selection.snapshot");
    const selectedObjects = selection?.members?.length ?? 0;
    const selectedComponents = mesh?.selectedCount ?? 0;
    const canUngroup = Boolean(this.query("selection.actions.describe")?.canUngroup);
    const availability = {
      "edit-hud-enter-mesh": Boolean(mesh?.canEnter),
      "edit-hud-group": selectedObjects > 0,
      "edit-hud-ungroup": canUngroup,
      "edit-hud-duplicate": state.meshActive ? selectedComponents > 0 : selectedObjects > 0,
      "edit-hud-delete": state.meshActive ? selectedComponents > 0 : selectedObjects > 0,
      "edit-hud-select-none": selectedComponents > 0,
      "edit-hud-select-grow": selectedComponents > 0,
      "edit-hud-select-shrink": selectedComponents > 0,
      "edit-hud-select-linked": selectedComponents > 0,
      "edit-hud-select-boundary": selectedComponents > 0,
      "edit-hud-create-edge": selectedComponents >= 2,
      "edit-hud-create-face": mode === "vertex"
        ? selectedComponents >= 3
        : selectedComponents > 0,
      "edit-hud-fill": selectedComponents > 0,
      "edit-hud-weld": selectedComponents >= 2,
      "edit-hud-extrude": selectedComponents > 0,
      "edit-hud-inset": selectedComponents > 0,
      "edit-hud-split": selectedComponents > 0,
      "edit-hud-collapse": selectedComponents > 0,
      "edit-hud-flip-edge": selectedComponents > 0,
      "edit-hud-bridge": selectedComponents >= 2,
      "edit-hud-subdivide": selectedComponents > 0,
      "edit-hud-flip-normal": selectedComponents > 0,
      "edit-hud-path-from-selection": selectedComponents > 0
    };
    let visible = 0;
    for (const button of this.root.querySelectorAll("[data-hud-context]")) {
      const contexts = button.dataset.hudContext.split(/\s+/).filter(Boolean);
      const inContext = contexts.some(context => tokens.has(context));
      const enabled = inContext && availability[button.id] !== false;
      button.hidden = !inContext;
      button.disabled = !enabled;
      button.dataset.active = enabled ? "true" : "false";
      if (inContext) visible += 1;
    }
    const group = this.root.querySelector('[data-edit-hud-group="actions"]');
    if (group) group.dataset.contextHidden = visible ? "false" : "true";
    this.#element("edit-hud-create").dataset.active =
      state.activeAction === "object.place" ? "true" : "false";
    this.#element("edit-hud-draw-path").dataset.active =
      state.activeAction === "path.sketch" ? "true" : "false";
  }

  #loadPreferences() {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
      this.#preferences = {
        ...structuredClone(DEFAULT_PREFERENCES),
        ...stored,
        columns: integerBetween(stored.columns, 1, 12, DEFAULT_PREFERENCES.columns),
        rows: integerBetween(stored.rows, 1, 8, DEFAULT_PREFERENCES.rows),
        defaults: {
          ...DEFAULT_PREFERENCES.defaults,
          ...(stored.defaults ?? {})
        },
        groups: {
          ...DEFAULT_PREFERENCES.groups,
          ...(stored.groups ?? {})
        }
      };
    } catch {
      this.#preferences = structuredClone(DEFAULT_PREFERENCES);
    }
  }

  #savePreferences() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.#preferences));
  }

  #axisArguments() {
    return Object.fromEntries(["x", "y", "z"].map(axis => [
      axis,
      this.#element(`edit-hud-axis-${axis}`).checked
    ]));
  }

  #snapArguments() {
    return {
      enabled: this.#element("edit-hud-snap-enabled").checked,
      auto: this.#element("edit-hud-snap-auto").checked,
      vertex: this.#element("edit-hud-snap-vertex").checked,
      edge: this.#element("edit-hud-snap-edge").checked,
      face: this.#element("edit-hud-snap-face").checked,
      grid: this.#element("edit-hud-snap-grid").checked
    };
  }

  #execute(command, args = {}) {
    try {
      return this.execute(command, args);
    } catch (error) {
      this.#element("edit-hud-status").textContent = error.message;
      this.root.title = error.message;
      return null;
    }
  }

  #element(id) {
    const element = this.root.querySelector(`#${id}`);
    if (!element) throw new Error(`Controle do HUD ausente: ${id}.`);
    return element;
  }
}

const HUD_HINT_DETAILS = Object.freeze({
  "edit-hud-open": ["Painel Editar", "Abre o workspace completo com parâmetros numéricos, criação, materiais, luzes, caminhos e operações de malha."],
  "edit-hud-help": ["Ajuda dos ícones", "Ativa o modo de consulta. Nesse modo, tocar numa ferramenta mostra sua explicação sem executá-la."],
  "edit-hud-object": ["Modo objeto", "Seleciona e transforma objetos inteiros. Encerre ou aplique a sessão de malha antes de retornar a este modo."],
  "edit-hud-area-selection": ["Selecionar por área", "Ativa a ferramenta de seleção e permite arrastar um retângulo no viewer para selecionar objetos ou componentes do modo atual."],
  "edit-hud-axis-x": ["Eixo X", "Permite ou bloqueia o componente X da transformação no frame ativo."],
  "edit-hud-axis-y": ["Eixo Y", "Permite ou bloqueia o componente Y da transformação no frame ativo."],
  "edit-hud-axis-z": ["Eixo Z", "Permite ou bloqueia o componente Z da transformação no frame ativo."],
  "edit-hud-snap-enabled": ["Snap", "Liga ou desliga todas as modalidades de encaixe configuradas."],
  "edit-hud-snap-auto": ["Snap automático", "Escolhe adaptativamente entre vértice, aresta, face e grade conforme proximidade e contexto."],
  "edit-hud-snap-vertex": ["Snap em vértice", "Atrai a âncora da transformação para vértices compatíveis."],
  "edit-hud-snap-edge": ["Snap em aresta", "Atrai a âncora para o ponto mais próximo de uma aresta compatível."],
  "edit-hud-snap-face": ["Snap em face", "Atrai a transformação para a superfície de uma face compatível."],
  "edit-hud-snap-grid": ["Snap em grade", "Quantiza a transformação segundo o espaçamento da grade."],
  "edit-hud-proportional": ["Influência proporcional", "Move também vértices conectados segundo raio, métrica e função de atenuação configurados."],
  "edit-hud-plane-lock": ["Visualização 2D", "Fixa a câmera perpendicular ao plano capturado, desativa a órbita e mantém o pan dentro desse plano."],
  "edit-hud-edit-plane": ["Plano de edição", "Captura um plano independente para criação, desenho, snap e frame personalizado."],
  "edit-hud-point-lock": ["Travar ponto", "Mantém o alvo do viewer fixo e orbita ao redor desse ponto."],
  "edit-hud-keep-tool": ["Manter ferramenta", "Mantém desenho e criação ativos após cada operação para executar várias vezes sem reabrir a ferramenta."],
  "edit-hud-repeat": ["Repetir", "Reaplica a última operação repetível, com os mesmos parâmetros, sobre a seleção atual."],
  "edit-hud-create": ["Criar objeto", "Abre a criação de geometria usando os parâmetros memorizados e, opcionalmente, outro objeto como referência."],
  "edit-hud-create-light": ["Criar luz", "Cria uma luz com tipo, cor, intensidade e sombras memorizados."],
  "edit-hud-material": ["Materiais e luzes", "Abre no painel Editar os parâmetros do material ou da luz selecionada."],
  "edit-hud-enter-mesh": ["Editar malha", "Isola a malha do objeto selecionado e inicia uma sessão local de edição de componentes."],
  "edit-hud-draw-path": ["Desenhar spline", "Desenha à mão livre no plano travado ou no plano atual do viewer e cria um caminho suavizado."],
  "edit-hud-group": ["Agrupar", "Cria um grupo contendo os objetos selecionados."],
  "edit-hud-ungroup": ["Desagrupar", "Remove o grupo selecionado e preserva seus filhos na cena."],
  "edit-hud-duplicate": ["Duplicar", "Duplica objetos ou os componentes selecionados da malha."],
  "edit-hud-delete": ["Excluir", "Exclui objetos ou componentes selecionados. A operação participa do undo correspondente."],
  "edit-hud-select-all": ["Selecionar tudo", "Seleciona todos os componentes do modo atual na malha ativa."],
  "edit-hud-select-none": ["Limpar seleção", "Remove todos os componentes da seleção interna da malha."],
  "edit-hud-select-invert": ["Inverter seleção", "Troca componentes selecionados por não selecionados no modo atual."],
  "edit-hud-select-grow": ["Expandir seleção", "Inclui componentes topologicamente vizinhos à seleção atual."],
  "edit-hud-select-shrink": ["Contrair seleção", "Remove a camada externa de componentes da seleção atual."],
  "edit-hud-select-linked": ["Selecionar conectados", "Seleciona todo o componente conexo que contém a seleção atual."],
  "edit-hud-select-boundary": ["Selecionar contorno", "Seleciona arestas ou faces pertencentes ao contorno da região atual."],
  "edit-hud-create-vertex": ["Criar vértice", "Adiciona um vértice à malha editável na origem local atual."],
  "edit-hud-create-edge": ["Criar aresta", "Liga dois vértices selecionados quando a topologia permite."],
  "edit-hud-create-face": ["Criar face", "Cria e triangula uma face a partir dos vértices ou arestas selecionados."],
  "edit-hud-fill": ["Preencher", "Preenche um contorno selecionado com faces trianguladas."],
  "edit-hud-weld": ["Soldar vértices", "Substitui vértices selecionados por uma posição comum e reconstrói as adjacências."],
  "edit-hud-extrude": ["Extrudar", "Duplica a região selecionada, cria as faces laterais e desloca pela distância memorizada."],
  "edit-hud-inset": ["Inset", "Cria uma região interna nas faces selecionadas usando o valor memorizado."],
  "edit-hud-split": ["Dividir aresta", "Insere um vértice no meio da aresta e subdivide as faces adjacentes."],
  "edit-hud-collapse": ["Colapsar aresta", "Funde as extremidades da aresta e remove faces degeneradas compatíveis."],
  "edit-hud-flip-edge": ["Inverter diagonal", "Troca a diagonal compartilhada por duas faces triangulares adjacentes."],
  "edit-hud-bridge": ["Criar ponte", "Conecta dois contornos compatíveis com uma faixa de faces."],
  "edit-hud-subdivide": ["Subdividir faces", "Divide as faces selecionadas em faces menores."],
  "edit-hud-flip-normal": ["Inverter normal", "Inverte a ordem dos vértices das faces e, portanto, a orientação de suas normais."],
  "edit-hud-path-from-selection": ["Criar caminho", "Cria um novo objeto-caminho a partir de vértices, arestas ou contornos de faces selecionados."],
  "edit-hud-recalculate-normals": ["Recalcular normais", "Reconstrói as normais da malha a partir da orientação atual das faces."],
  "edit-hud-cleanup": ["Sanitizar malha", "Remove vértices órfãos e elementos degenerados básicos, compacta índices e recalcula normais."],
  "edit-hud-undo": ["Desfazer", "Durante a edição de malha desfaz uma etapa interna; no modo objeto desfaz a última alteração local do projeto."],
  "edit-hud-redo": ["Refazer", "Durante a edição de malha refaz uma etapa interna; no modo objeto refaz a última alteração local do projeto."],
  "edit-hud-apply": ["Aplicar", "Confirma toda a sessão de malha como uma única alteração no histórico do projeto."],
  "edit-hud-cancel": ["Cancelar", "Descarta todas as alterações da sessão de malha e restaura o objeto original."]
});

const SUBJECT_HINTS = Object.freeze({
  vertex: ["Modo vértice", "Seleciona e edita vértices reais da malha ativa."],
  edge: ["Modo aresta", "Seleciona e edita arestas topológicas da malha ativa."],
  face: ["Modo face", "Seleciona e edita faces da malha ativa."]
});

const TOOL_HINTS = Object.freeze({
  navigate: ["Navegar", "Usa os gestos do viewer para orbitar, deslocar e aproximar a câmera."],
  select: ["Selecionar", "Toca ou arrasta no viewer para selecionar objetos ou componentes do modo atual."],
  translate: ["Mover", "Ativa o gizmo de translação e respeita frame, eixos, snap e influência proporcional."],
  rotate: ["Girar", "Ativa o gizmo de rotação no frame e eixos configurados."],
  scale: ["Escalar", "Ativa o gizmo de escala no frame e eixos configurados."]
});

const FRAME_HINTS = Object.freeze({
  world: ["Frame mundial", "Usa os eixos globais X, Y e Z da cena."],
  local: ["Frame do objeto", "Usa a orientação local do objeto ou da malha em edição."],
  viewer: ["Frame do viewer", "Usa direita, alto e profundidade da vista capturada."],
  "custom-plane": ["Plano personalizado", "Usa a base ortonormal do plano arbitrário travado."]
});

function resolveHudHint(control) {
  const idHint = HUD_HINT_DETAILS[control.id];
  if (idHint) return { title: idHint[0], description: idHint[1] };
  const subject = control.dataset.editSubject;
  if (subject && SUBJECT_HINTS[subject]) {
    return { title: SUBJECT_HINTS[subject][0], description: SUBJECT_HINTS[subject][1] };
  }
  const tool = control.dataset.editTool;
  if (tool && TOOL_HINTS[tool]) {
    return { title: TOOL_HINTS[tool][0], description: TOOL_HINTS[tool][1] };
  }
  const frame = control.dataset.editFrame;
  if (frame && FRAME_HINTS[frame]) {
    return { title: FRAME_HINTS[frame][0], description: FRAME_HINTS[frame][1] };
  }
  const title = control.getAttribute("title") || control.getAttribute("aria-label") || "Ferramenta";
  return { title, description: title };
}

function describeState(state) {
  const subject = ({ object: "Objeto", vertex: "Vértice", edge: "Aresta", face: "Face" })[state.subjectLevel];
  const axes = ["x", "y", "z"].filter(axis => state.axes[axis]).join("").toUpperCase() || "bloqueado";
  const locks = [
    state.planeLock ? "vista-2D" : null,
    state.editPlane ? "plano-edição" : null,
    state.pointLock ? "ponto" : null
  ]
    .filter(Boolean)
    .join("+");
  return `${subject} · ${state.tool} · ${state.frameMode} · ${axes}${locks ? ` · ${locks}` : ""}`;
}

function rememberedMaterialPatch(defaults = {}) {
  return {
    "appearance.model": defaults.model ?? "standard",
    "appearance.color": normalizeRememberedColor(defaults.color),
    "appearance.opacity": clamp(finiteOr(defaults.opacity, 1), 0, 1),
    "appearance.transparent": clamp(finiteOr(defaults.opacity, 1), 0, 1) < 1,
    "appearance.roughness": clamp(finiteOr(defaults.roughness, 0.55), 0, 1),
    "appearance.metalness": clamp(finiteOr(defaults.metalness, 0), 0, 1),
    "appearance.transmission": clamp(finiteOr(defaults.transmission, 0), 0, 1),
    "appearance.ior": clamp(finiteOr(defaults.ior, 1.5), 1, 2.333),
    "appearance.thickness": Math.max(0, finiteOr(defaults.thickness, 0.5)),
    "appearance.dispersion": Math.max(0, finiteOr(defaults.dispersion, 0)),
    "appearance.clearcoat": clamp(finiteOr(defaults.clearcoat, 0), 0, 1),
    "appearance.envMapIntensity": Math.max(0, finiteOr(defaults.envMapIntensity, 1))
  };
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function integerBetween(value, minimum, maximum, fallback) {
  const number = Number(value);
  if (!Number.isInteger(number)) return fallback;
  return clamp(number, minimum, maximum);
}

function finiteOr(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeRememberedColor(value) {
  const source = String(value ?? "#ffffff").trim();
  return /^#[0-9a-f]{6}$/i.test(source) ? source.toLowerCase() : "#ffffff";
}
