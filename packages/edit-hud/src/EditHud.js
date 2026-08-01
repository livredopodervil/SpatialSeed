import {
  deriveHudContext,
  geometryToolIcon,
  geometryToolPriority
} from "./HudContextHeuristics.js?build=20260730-0041b";
import {
  HudCustomizationController,
  HudLayoutStore,
  applyHudLayoutPlan,
  discoverHudDescriptors,
  hudLayoutSignature,
  resolveHudLayoutPlan
} from "../../edit-hud-layout/src/index.js?build=20260801-0046a";

const STORAGE_KEY = "spatialseed.edit.hud.v1";
const CREATION_STORAGE_KEY = "spatialseed.edit.creation-material.v1";
const GEOMETRY_CREATION_STORAGE_KEY = "spatialseed.geometry.creation.defaults.v1";
const STATIC_GROUP_ORDER = Object.freeze([
  "subject", "tool", "quick", "selection", "frame", "axes",
  "snap", "navigation", "reference", "drawing-target", "appearance", "planar", "measure", "lifecycle",
  "creation", "actions", "session"
]);
const STATIC_ACTION_ORDER = Object.freeze([
  "edit-hud-create", "edit-hud-create-light", "edit-hud-material",
  "edit-hud-enter-mesh", "edit-hud-draw-path", "edit-hud-group",
  "edit-hud-ungroup", "edit-hud-fuse-families", "edit-hud-fuse-strokes",
  "edit-hud-duplicate", "edit-hud-delete",
  "edit-hud-select-all", "edit-hud-select-none", "edit-hud-select-invert",
  "edit-hud-select-grow", "edit-hud-select-shrink", "edit-hud-select-linked",
  "edit-hud-select-boundary", "edit-hud-create-vertex",
  "edit-hud-create-edge", "edit-hud-create-face", "edit-hud-fill",
  "edit-hud-weld", "edit-hud-extrude", "edit-hud-inset",
  "edit-hud-split", "edit-hud-collapse", "edit-hud-flip-edge",
  "edit-hud-bridge", "edit-hud-subdivide", "edit-hud-flip-normal",
  "edit-hud-path-from-selection", "edit-hud-recalculate-normals",
  "edit-hud-cleanup"
]);
const DEFAULT_PREFERENCES = Object.freeze({
  dock: "floating",
  orientation: "horizontal",
  size: "normal",
  opacity: 0.96,
  columns: 4,
  rows: 2,
  tapHints: true,
  adaptiveOrder: true,
  appearanceTarget: "selection",
  appearanceColorAction: "auto",
  drawingTargetSource: "viewer",
  drawingHelperSize: 12,
  drawingHelperOpacity: 0.18,
  surfaceFrontFacesOnly: true,
  surfaceLockObject: true,
  surfaceMaximumJump: 0,
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
    quick: true,
    selection: true,
    frame: true,
    axes: true,
    snap: true,
    navigation: true,
    reference: true,
    "drawing-target": true,
    appearance: true,
    planar: true,
    measure: true,
    lifecycle: true,
    creation: true,
    actions: true,
    session: true
  }
});

export class EditHud {
  static apiVersion = "edit-hud-v4";

  #unsubscribe = null;
  #unsubscribeHistory = null;
  #historyFrame = null;
  #preferences = structuredClone(DEFAULT_PREFERENCES);
  #drag = null;
  #resize = null;
  #heuristic = null;
  #geometryCatalog = [];
  #helpMode = false;
  #hintPointer = null;
  #hintTimer = null;
  #hintHideTimer = null;
  #suppressedClick = null;
  #fitFrame = null;
  #layoutStore = null;
  #layoutDescriptors = [];
  #layoutCustomizer = null;
  #unsubscribeLayout = null;
  #lastLayoutSignature = null;

  constructor({
    root,
    query,
    execute,
    subscribe,
    subscribeHistory = null,
    openWorkspace = null
  }) {
    if (!root) throw new TypeError("EditHud exige root.");
    if (typeof query !== "function" || typeof execute !== "function") {
      throw new TypeError("EditHud exige query e execute.");
    }
    this.root = root;
    this.query = query;
    this.execute = execute;
    this.openWorkspace = openWorkspace;
    this.#loadPreferences();
    this.#buildGeometryTools();
    this.#prepareLayoutSystem();
    this.#prepareHints();
    this.#bind();
    this.#applyPreferences();
    this.#unsubscribe = subscribe?.(snapshot => this.refresh(snapshot)) ?? null;
    this.#unsubscribeHistory = subscribeHistory?.(() =>
      this.#scheduleHistoryRefresh()
    ) ?? null;
    this.refresh();
  }

  dispose() {
    this.#unsubscribe?.();
    this.#unsubscribeHistory?.();
    this.#unsubscribeLayout?.();
    this.#layoutCustomizer?.dispose?.();
    if (this.#historyFrame !== null) {
      if (typeof globalThis.cancelAnimationFrame === "function") {
        globalThis.cancelAnimationFrame(this.#historyFrame);
      } else {
        globalThis.clearTimeout?.(this.#historyFrame);
      }
      this.#historyFrame = null;
    }
    this.#listeners(false);
    this.#clearHintTimer();
    this.#clearHintHideTimer();
    if (this.#fitFrame !== null) {
      if (typeof globalThis.cancelAnimationFrame === "function") {
        globalThis.cancelAnimationFrame(this.#fitFrame);
      } else {
        globalThis.clearTimeout?.(this.#fitFrame);
      }
      this.#fitFrame = null;
    }
  }

  refresh(snapshot = null) {
    const state = snapshot ?? this.query("edit.context.status");
    this.root.dataset.meshActive = state.meshActive ? "true" : "false";
    this.root.dataset.planeLocked = state.planeLock ? "true" : "false";
    this.root.dataset.pointLocked = state.pointLock ? "true" : "false";
    this.root.dataset.editPlane = state.editPlane ? "true" : "false";
    this.root.dataset.drawingPlane =
      state.drawingPlane ? "true" : "false";
    this.root.dataset.pivotEditing =
      state.pivotEditing ? "true" : "false";

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
    for (const button of this.root.querySelectorAll("[data-edit-selection-operation]")) {
      button.dataset.active = button.dataset.editSelectionOperation === state.selectionOperation
        ? "true"
        : "false";
    }
    for (const button of this.root.querySelectorAll("[data-edit-selection-gesture]")) {
      button.dataset.active =
        state.areaSelection &&
        button.dataset.editSelectionGesture === state.selectionGestureMode
          ? "true"
          : "false";
    }
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
    this.#element("edit-hud-snap-angle").checked = Boolean(snap.angle);
    for (const [id, value] of [
      ["edit-hud-grid-step", snap.gridStep ?? 1],
      ["edit-hud-angle-step", snap.angleStepDegrees ?? 15]
    ]) {
      const control = this.#element(id);
      if (this.root.ownerDocument.activeElement !== control) {
        control.value = String(value);
      }
    }
    this.#element("edit-hud-proportional").checked = Boolean(state.proportional);
    this.#element("edit-hud-plane-lock").checked = Boolean(state.planeLock);
    this.#element("edit-hud-edit-plane").checked = Boolean(state.editPlane);
    this.#element("edit-hud-drawing-plane").checked =
      Boolean(state.drawingPlane);
    const drawingTarget = this.query("drawing.target.status") ?? {};
    this.root.dataset.drawingTargetActive = drawingTarget.active
      ? "true"
      : "false";
    this.root.dataset.drawingTargetEditing = drawingTarget.editing
      ? "true"
      : "false";
    const sourceControl = this.#element("edit-hud-drawing-target-source");
    const sourceValue = drawingTarget.active
      ? drawingTarget.source
      : this.#preferences.drawingTargetSource;
    if ([...sourceControl.options].some(option => option.value === sourceValue)) {
      sourceControl.value = sourceValue;
    }
    this.#element("edit-hud-drawing-target-helper").checked =
      drawingTarget.helperVisible !== false;
    this.#element("edit-hud-drawing-target-edit").dataset.active =
      drawingTarget.editing ? "true" : "false";
    const surfaceTargetActive = drawingTarget.type === "surface";
    this.root.dataset.drawingTargetType = surfaceTargetActive
      ? "surface"
      : "plane";
    this.#element("edit-hud-drawing-target-edit").disabled =
      !drawingTarget.active || surfaceTargetActive;
    this.#element("edit-hud-drawing-target-translate").dataset.active =
      drawingTarget.gizmoMode === "translate" ? "true" : "false";
    this.#element("edit-hud-drawing-target-rotate").dataset.active =
      drawingTarget.gizmoMode === "rotate" ? "true" : "false";
    this.#element("edit-hud-drawing-target-translate").disabled =
      !drawingTarget.active || surfaceTargetActive;
    this.#element("edit-hud-drawing-target-rotate").disabled =
      !drawingTarget.active || surfaceTargetActive;
    this.#element("edit-hud-drawing-target-clear").disabled =
      !drawingTarget.active;
    const offsetControl = this.#element("edit-hud-drawing-target-offset");
    if (this.root.ownerDocument.activeElement !== offsetControl) {
      offsetControl.value = String(drawingTarget.offset ?? 0);
    }
    const surface = drawingTarget.surfaceTarget ?? {};
    this.#element("edit-hud-surface-front-faces").checked =
      surfaceTargetActive
        ? surface.frontFacesOnly !== false
        : this.#preferences.surfaceFrontFacesOnly !== false;
    this.#element("edit-hud-surface-lock-object").checked =
      surfaceTargetActive
        ? surface.lockObject !== false
        : this.#preferences.surfaceLockObject !== false;
    const jumpControl = this.#element("edit-hud-surface-maximum-jump");
    if (this.root.ownerDocument.activeElement !== jumpControl) {
      jumpControl.value = String(
        surfaceTargetActive && !surface.automaticMaximumJump
          ? surface.maximumJump ?? 0
          : this.#preferences.surfaceMaximumJump ?? 0
      );
    }
    const surfaceState = this.#element("edit-hud-surface-state");
    surfaceState.textContent = surfaceTargetActive
      ? `${surface.objectIds?.length ?? 0} alvo(s) · ${
          surface.automaticMaximumJump ? "salto auto" : "salto fixo"
        }`
      : "Plano";
    this.#element("edit-hud-point-lock").checked = Boolean(state.pointLock);
    this.#element("edit-hud-pivot-edit").dataset.active =
      state.pivotEditing ? "true" : "false";
    this.#element("edit-hud-pivot-policy").value =
      state.pivot?.policy ?? "median";
    this.#element("edit-hud-pivot-reference").value =
      state.pivot?.reference ?? "absolute";
    this.#element("edit-hud-keep-tool").checked = Boolean(state.keepToolActive);
    this.#element("edit-hud-repeat").disabled = !state.canRepeat;
    this.#element("edit-hud-repeat").dataset.active = state.canRepeat ? "true" : "false";
    this.refreshHistory(state);
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
    const mesh = this.query("mesh.edit.status");
    const selection = this.query("selection.snapshot");
    this.#refreshAppearanceControls(selection);
    const planar = this.query("planar.sketch.status") ?? {};
    const measurement = this.query("measurement.status") ?? {};
    const selectedObjectIds = selection.members?.map(
      member => member.objectId
    ) ?? [];
    const selectionActions =
      this.query("selection.actions.describe") ?? {};
    const fuseFamilies = this.root.querySelector("#edit-hud-fuse-families");
    const fuseStrokes = this.root.querySelector("#edit-hud-fuse-strokes");
    if (fuseFamilies) {
      fuseFamilies.disabled = !selectionActions.canFuseFamilies;
    }
    if (fuseStrokes) {
      fuseStrokes.disabled = !selectionActions.canFuseStrokes;
    }
    this.#heuristic = deriveHudContext({
      state,
      mesh,
      selection,
      selectionActions,
      references: this.query("path.references.list", {
        includeSelection: false,
        ids: selectedObjectIds
      }) ?? [],
      placement: this.query("object.placement.status") ?? {},
      sketch: this.query("path.sketch.status") ?? {}
    });
    this.root.dataset.heuristicContext = this.#heuristic.reason;
    this.#refreshContextActions(state, this.#heuristic);
    this.#refreshGeometryTools();
    this.#applyAdaptiveLayout(this.#heuristic);
    this.#applyPreferences();
    this.#refreshParameterAliases();
    for (const button of this.root.querySelectorAll("[data-planar-tool]")) {
      button.dataset.active =
        planar.active && button.dataset.planarTool === planar.mode
          ? "true"
          : "false";
      button.disabled = Boolean(state.meshActive || planar.committing);
    }
    this.#element("edit-hud-planar-finish").disabled =
      !planar.active || !planar.canFinish || planar.committing;
    this.#element("edit-hud-planar-back").disabled =
      !planar.active || planar.mode !== "polyline" ||
      planar.pointCount < 1 || planar.committing;
    this.#element("edit-hud-planar-cancel").disabled = !planar.active;
    this.#element("edit-hud-planar-edit").disabled =
      Boolean(planar.active || state.meshActive ||
        !(selection.members?.length));
    this.#element("edit-hud-pivot-edit").disabled =
      Boolean(state.meshActive || !(selection.members?.length));
    this.#element("edit-hud-ruler").dataset.active =
      measurement.active && measurement.mode === "ruler"
        ? "true"
        : "false";
    this.#element("edit-hud-protractor").dataset.active =
      measurement.active && measurement.mode === "protractor"
        ? "true"
        : "false";
    this.#element("edit-hud-measure-clear").disabled =
      !measurement.active && !measurement.result;
  }

  refreshHistory(snapshot = null) {
    const state = snapshot ?? this.query("edit.context.status");
    const projectHistory = state?.meshActive
      ? { canUndo: state.canUndo, canRedo: state.canRedo }
      : this.query("history.status");
    this.#element("edit-hud-undo").disabled = !projectHistory?.canUndo;
    this.#element("edit-hud-redo").disabled = !projectHistory?.canRedo;
  }

  #scheduleHistoryRefresh() {
    if (this.#historyFrame !== null) return;
    const run = () => {
      this.#historyFrame = null;
      this.refreshHistory();
    };
    this.#historyFrame = typeof globalThis.requestAnimationFrame === "function"
      ? globalThis.requestAnimationFrame(run)
      : globalThis.setTimeout(run, 16);
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
    for (const button of this.root.querySelectorAll("[data-edit-selection-operation]")) {
      button.addEventListener("click", () => this.#execute(
        "edit.context.selection-operation.set",
        { operation: button.dataset.editSelectionOperation }
      ));
    }
    for (const button of this.root.querySelectorAll("[data-edit-selection-gesture]")) {
      button.addEventListener("click", () => this.#execute(
        "selection.gesture.set",
        {
          mode: button.dataset.editSelectionGesture,
          toggle: true
        }
      ));
    }
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
      "edit-hud-snap-grid",
      "edit-hud-snap-angle",
      "edit-hud-grid-step",
      "edit-hud-angle-step"
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
    this.#element("edit-hud-view-reset").addEventListener("click", () =>
      this.#execute("viewer.camera.reset")
    );
    this.#element("edit-hud-edit-plane").addEventListener("change", event => {
      this.#execute(
        event.target.checked ? "edit.plane.set" : "edit.plane.clear",
        event.target.checked ? { source: this.#quickPlaneSource() } : {}
      );
    });
    this.#element("edit-hud-drawing-plane").addEventListener(
      "change",
      event => {
        this.#execute(
          event.target.checked
            ? "drawing.target.set"
            : "drawing.target.clear",
          event.target.checked
            ? this.#drawingTargetArguments({
                source: this.#quickPlaneSource()
              })
            : {}
        );
      }
    );
    this.#element("edit-hud-drawing-target-source").addEventListener(
      "change",
      event => {
        this.#preferences.drawingTargetSource = event.target.value;
        this.#savePreferences();
      }
    );
    this.#element("edit-hud-drawing-target-set").addEventListener(
      "click",
      () => this.#execute(
        "drawing.target.set",
        this.#drawingTargetArguments()
      )
    );
    this.#element("edit-hud-surface-front-faces").addEventListener(
      "change",
      event => {
        this.#preferences.surfaceFrontFacesOnly = event.target.checked;
        this.#savePreferences();
        this.#refreshSurfaceTargetIfActive();
      }
    );
    this.#element("edit-hud-surface-lock-object").addEventListener(
      "change",
      event => {
        this.#preferences.surfaceLockObject = event.target.checked;
        this.#savePreferences();
        this.#refreshSurfaceTargetIfActive();
      }
    );
    this.#element("edit-hud-surface-maximum-jump").addEventListener(
      "change",
      event => {
        this.#preferences.surfaceMaximumJump = Math.max(
          0,
          Number(event.target.value) || 0
        );
        this.#savePreferences();
        this.#refreshSurfaceTargetIfActive();
      }
    );
    this.#element("edit-hud-drawing-target-helper").addEventListener(
      "change",
      event => {
        const status = this.query("drawing.target.status") ?? {};
        if (!status.active && event.target.checked) {
          this.#execute("drawing.target.set", this.#drawingTargetArguments());
          return;
        }
        this.#execute("drawing.target.helper.set", {
          visible: event.target.checked,
          size: this.#preferences.drawingHelperSize,
          opacity: this.#preferences.drawingHelperOpacity
        });
      }
    );
    this.#element("edit-hud-drawing-target-edit").addEventListener(
      "click",
      () => this.#execute("drawing.target.edit.toggle")
    );
    this.#element("edit-hud-drawing-target-translate").addEventListener(
      "click",
      () => this.#execute("drawing.target.gizmo.set", {
        mode: "translate"
      })
    );
    this.#element("edit-hud-drawing-target-rotate").addEventListener(
      "click",
      () => this.#execute("drawing.target.gizmo.set", {
        mode: "rotate"
      })
    );
    this.#element("edit-hud-drawing-target-offset").addEventListener(
      "change",
      event => this.#execute("drawing.target.offset.set", {
        offset: Number(event.target.value)
      })
    );
    this.#element("edit-hud-drawing-target-clear").addEventListener(
      "click",
      () => this.#execute("drawing.target.clear")
    );
    this.#element("edit-hud-drawing-helper-size").addEventListener(
      "change",
      event => {
        this.#preferences.drawingHelperSize = Math.max(
          0.1,
          Number(event.target.value) || 12
        );
        this.#savePreferences();
        const status = this.query("drawing.target.status") ?? {};
        if (status.active) {
          this.#execute("drawing.target.helper.set", {
            visible: status.helperVisible,
            size: this.#preferences.drawingHelperSize,
            opacity: this.#preferences.drawingHelperOpacity
          });
        }
      }
    );
    this.#element("edit-hud-drawing-helper-opacity").addEventListener(
      "input",
      event => {
        this.#preferences.drawingHelperOpacity = Math.min(
          0.9,
          Math.max(0.02, Number(event.target.value) || 0.18)
        );
        this.#savePreferences();
        const status = this.query("drawing.target.status") ?? {};
        if (status.active) {
          this.#execute("drawing.target.helper.set", {
            visible: status.helperVisible,
            size: this.#preferences.drawingHelperSize,
            opacity: this.#preferences.drawingHelperOpacity
          });
        }
      }
    );
    this.#element("edit-hud-pivot-edit").addEventListener("click", () =>
      this.#execute("pivot.edit.toggle")
    );
    this.#element("edit-hud-pivot-policy").addEventListener("change", event =>
      this.#execute("pivot.policy", { policy: event.target.value })
    );
    this.#element("edit-hud-pivot-reference").addEventListener("change", event =>
      this.#execute("pivot.reference.set", { reference: event.target.value })
    );
    this.#element("edit-hud-anchor-policy").addEventListener("change", event =>
      this.#execute("edit.tool.parameters.set", {
        toolId: "path.sketch",
        patch: { anchorPolicy: event.target.value }
      })
    );
    this.#element("edit-hud-appearance-target").addEventListener(
      "change",
      event => {
        this.#preferences.appearanceTarget = event.target.value;
        this.#savePreferences();
        this.#refreshAppearanceControls(
          this.query("selection.snapshot")
        );
      }
    );
    this.#element("edit-hud-appearance-color-action").addEventListener(
      "change",
      event => {
        this.#preferences.appearanceColorAction = event.target.value;
        this.#savePreferences();
        this.#refreshAppearanceControls(
          this.query("selection.snapshot")
        );
      }
    );
    this.#element("edit-hud-appearance-color").addEventListener(
      "change",
      event => this.#applyAppearanceColor(event.target.value)
    );
    this.#element("edit-hud-appearance-material").addEventListener(
      "change",
      event => this.#applyAppearanceMaterial(event.target.value)
    );
    this.#element("edit-hud-appearance-opacity").addEventListener(
      "input",
      event => this.#updateAppearanceOpacityLabel(event.target.value)
    );
    this.#element("edit-hud-appearance-opacity").addEventListener(
      "change",
      event => this.#applyAppearanceOpacity(event.target.value)
    );
    for (const button of this.root.querySelectorAll("[data-planar-tool]")) {
      button.addEventListener("click", () => this.#execute(
        "planar.sketch.begin",
        { mode: button.dataset.planarTool }
      ));
    }
    this.#element("edit-hud-planar-finish").addEventListener("click", () =>
      this.#execute("planar.sketch.finish")
    );
    this.#element("edit-hud-planar-back").addEventListener("click", () =>
      this.#execute("planar.sketch.point.remove")
    );
    this.#element("edit-hud-planar-cancel").addEventListener("click", () =>
      this.#execute("planar.sketch.cancel")
    );
    this.#element("edit-hud-planar-edit").addEventListener("click", () =>
      this.#execute("planar.edit.begin")
    );
    this.#element("edit-hud-ruler").addEventListener("click", () =>
      this.#execute("measurement.begin", { mode: "ruler" })
    );
    this.#element("edit-hud-protractor").addEventListener("click", () =>
      this.#execute("measurement.begin", { mode: "protractor" })
    );
    this.#element("edit-hud-measure-clear").addEventListener("click", () =>
      this.#execute("measurement.clear")
    );
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
    this.#element("edit-hud-drawing-helper-size").value = String(
      this.#preferences.drawingHelperSize
    );
    this.#element("edit-hud-drawing-helper-opacity").value = String(
      this.#preferences.drawingHelperOpacity
    );
    this.#element("edit-hud-rows").value = String(this.#preferences.rows);
    this.#element("edit-hud-tap-hints").checked = this.#preferences.tapHints !== false;
    this.#element("edit-hud-adaptive-order").checked = this.#preferences.adaptiveOrder !== false;
    this.#element("edit-hud-default-extrude").value = String(this.#preferences.defaults.extrude);
    this.#element("edit-hud-default-inset").value = String(this.#preferences.defaults.inset);
    this.#element("edit-hud-default-path-radius").value = String(this.#preferences.defaults.pathRadius);
    for (const checkbox of this.root.querySelectorAll("[data-edit-hud-group-toggle]")) {
      const group = checkbox.dataset.editHudGroupToggle;
      checkbox.checked = this.#familyVisibleByPreference(group);
      checkbox.addEventListener("change", () => {
        this.#preferences.groups[group] = checkbox.checked;
        this.#layoutStore?.updateFamily(group, {
          visibility: checkbox.checked ? "auto" : "hidden"
        });
        this.#savePreferences();
        this.#applyPreferences();
      });
    }
    for (const id of [
      "edit-hud-dock", "edit-hud-orientation", "edit-hud-size",
      "edit-hud-opacity", "edit-hud-columns", "edit-hud-rows",
      "edit-hud-tap-hints", "edit-hud-adaptive-order", "edit-hud-default-extrude", "edit-hud-default-inset",
      "edit-hud-default-path-radius"
    ]) {
      this.#element(id).addEventListener("change", () => {
        this.#preferences.dock = this.#element("edit-hud-dock").value;
        this.#preferences.orientation = this.#element("edit-hud-orientation").value;
        this.#preferences.size = this.#element("edit-hud-size").value;
        this.#preferences.opacity = Number(this.#element("edit-hud-opacity").value);
        const dimensions = normalizeHudDimensions({
          columns: this.#element("edit-hud-columns").value,
          rows: this.#element("edit-hud-rows").value
        }, this.#preferences);
        this.#preferences.columns = dimensions.columns;
        this.#preferences.rows = dimensions.rows;
        this.#preferences.tapHints = this.#element("edit-hud-tap-hints").checked;
        this.#preferences.adaptiveOrder = this.#element("edit-hud-adaptive-order").checked;
        this.#preferences.defaults = {
          extrude: finiteOr(this.#element("edit-hud-default-extrude").value, 1),
          inset: clamp(finiteOr(this.#element("edit-hud-default-inset").value, 0.2), 0.001, 0.999),
          pathRadius: Math.max(0.001, finiteOr(this.#element("edit-hud-default-path-radius").value, 0.08))
        };
        this.#savePreferences();
        const parameter = {
          "edit-hud-default-extrude": [
            "mesh.extrude",
            { distance: this.#preferences.defaults.extrude }
          ],
          "edit-hud-default-inset": [
            "mesh.inset",
            { amount: this.#preferences.defaults.inset }
          ],
          "edit-hud-default-path-radius": [
            "path.sketch",
            { radius: this.#preferences.defaults.pathRadius }
          ]
        }[id];
        if (parameter) {
          this.#execute("edit.tool.parameters.set", {
            toolId: parameter[0],
            patch: parameter[1]
          });
          if (id === "edit-hud-default-path-radius") {
            this.#execute("edit.tool.parameters.set", {
              toolId: "path.from-selection",
              patch: parameter[1]
            });
          }
        }
        this.#applyPreferences();
      });
    }
    this.#element("edit-hud-reset").addEventListener("click", () => {
      this.#preferences = structuredClone(DEFAULT_PREFERENCES);
      this.#layoutStore?.reset();
      this.#savePreferences();
      this.#applyPreferences();
      this.#refreshParameterAliases();
    });
    this.#element("edit-hud-customize").addEventListener("click", () =>
      this.#layoutCustomizer?.open()
    );
    const action = (id, command, args = () => ({})) => {
      this.#element(id).addEventListener("click", () => this.#execute(command, args()));
    };
    this.#element("edit-hud-create").addEventListener("click", () =>
      this.#beginRememberedObjectPlacement()
    );
    action("edit-hud-enter-mesh", "mesh.edit.enter");
    action("edit-hud-draw-path", "path.sketch.begin");
    this.#element("edit-hud-create-light").addEventListener("click", () =>
      this.#createRememberedLight()
    );
    this.#element("edit-hud-tube-from-object").addEventListener("click", () =>
      this.#createTubeFromHeuristic()
    );
    this.#element("edit-hud-sweep-from-objects").addEventListener("click", () =>
      this.#createSweepFromHeuristic()
    );
    this.#element("edit-hud-array-along-path").addEventListener("click", () =>
      this.#arrayAlongHeuristicPath()
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
      const result = this.#execute(
        active ? "mesh.topology.apply" : "selection.duplicate",
        active ? { operation: "duplicate" } : {}
      );
      if (!active && result?.changed) {
        this.#execute("edit.context.tool.set", { mode: "translate" });
      }
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
      operation: "extrude"
    }));
    action("edit-hud-inset", "mesh.topology.apply", () => ({
      operation: "inset"
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
    action("edit-hud-path-from-selection", "path.from-mesh-selection.create");
    action("edit-hud-recalculate-normals", "mesh.topology.apply", () => ({
      operation: "recalculate-normals"
    }));
    action("edit-hud-cleanup", "mesh.topology.apply", () => ({ operation: "cleanup" }));
    this.#listeners(true);
  }

  #prepareHints() {
    const controls = this.root.querySelectorAll(
      ".edit-hud-strip button, .edit-hud-strip label, #edit-hud-open, #edit-hud-help, #edit-hud-resize, .edit-hud-config > summary"
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
      ? this.query("scene.object.get", { id: objectId })
      : null;
    return this.#execute("light.create", {
      type: defaults.lightType ?? "point",
      position: reference
        ? [...(reference.position ?? [0, 0, 0])]
        : [0, 3, 0],
      rotation: reference
        ? [...(reference.rotation ?? [0, 0, 0, 1])]
        : [0, 0, 0, 1],
      color: normalizeRememberedColor(defaults.color),
      intensity: finiteOr(defaults.lightIntensity, 3),
      distance: Math.max(0, finiteOr(defaults.lightDistance, 0)),
      decay: Math.max(0, finiteOr(defaults.lightDecay, 2)),
      angleDeg: clamp(finiteOr(defaults.lightAngleDeg, 45), 1, 179),
      penumbra: clamp(finiteOr(defaults.lightPenumbra, 0.2), 0, 1),
      castShadow: defaults.lightCastShadow !== false
    });
  }

  #beginRememberedObjectPlacement(type = null) {
    try {
      const defaults = readStorageObject(CREATION_STORAGE_KEY);
      const catalog = this.#geometryCatalog.length
        ? this.#geometryCatalog
        : (this.query("geometry.catalog") ?? []);
      const requestedType = type ?? defaults.geometryType ?? this.#rememberedGeometryType();
      const description = catalog.find(item => item.type === requestedType) ?? catalog[0];
      if (!description) throw new Error("Catálogo de geometrias vazio.");
      this.#selectGeometryType(description.type);
      const geometry = rememberedGeometryDescriptor(description);
      const selection = this.query("selection.snapshot");
      const objectId = selection?.activeMember?.objectId ?? null;
      const reference = objectId
        ? this.query("scene.object.get", { id: objectId })
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
    this.#element("edit-hud-resize")[method]("pointerdown", this.#onResizePointerDown);
    this.root[method]("pointerdown", this.#onHintPointerDown, true);
    this.root[method]("click", this.#onHintClickCapture, true);
    this.root[method]("click", this.#onHintClickFeedback);
    this.root[method]("pointerover", this.#onHintPointerOver);
    this.root[method]("pointerout", this.#onHintPointerOut);
    this.root[method]("focusin", this.#onHintFocusIn);
    this.root[method]("focusout", this.#onHintFocusOut);
    globalThis[method]("pointermove", this.#onPointerMove);
    globalThis[method]("pointermove", this.#onResizePointerMove);
    globalThis[method]("pointermove", this.#onHintPointerMove);
    globalThis[method]("pointerup", this.#onPointerUp);
    globalThis[method]("pointerup", this.#onResizePointerUp);
    globalThis[method]("pointerup", this.#onHintPointerUp);
    globalThis[method]("pointercancel", this.#onPointerUp);
    globalThis[method]("pointercancel", this.#onResizePointerUp);
    globalThis[method]("pointercancel", this.#onHintPointerUp);
    globalThis[method]("resize", this.#onResize);
    globalThis.document?.[method]("pointerdown", this.#onHintDocumentPointerDown, true);
    globalThis.document?.[method]("keydown", this.#onHintKeyDown);
  }

  #onResizePointerDown = event => {
    const cell = ({ compact: 26, normal: 32, large: 42 })[this.#preferences.size] ?? 32;
    this.#resize = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      columns: this.#preferences.columns,
      rows: this.#preferences.rows,
      cell: cell + 3
    };
    this.root.dataset.resizing = "true";
    event.currentTarget.setPointerCapture?.(event.pointerId);
    event.stopPropagation();
    event.preventDefault();
  };

  #onResizePointerMove = event => {
    if (!this.#resize || event.pointerId !== this.#resize.pointerId) return;
    const columns = positiveInteger(
      this.#resize.columns + Math.round((event.clientX - this.#resize.x) / this.#resize.cell),
      this.#resize.columns
    );
    const rows = positiveInteger(
      this.#resize.rows + Math.round((event.clientY - this.#resize.y) / this.#resize.cell),
      this.#resize.rows
    );
    this.#preferences.columns = columns;
    this.#preferences.rows = rows;
    this.#applyPreferences();
    event.preventDefault();
  };

  #onResizePointerUp = event => {
    if (!this.#resize || event.pointerId !== this.#resize.pointerId) return;
    this.#resize = null;
    this.root.dataset.resizing = "false";
    this.#fitToViewport();
    this.#savePreferences();
    event.preventDefault();
  };

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
    const cellSize = ({ compact: 26, normal: 32, large: 42 })[p.size] ?? 32;
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
    this.#applyAdaptiveLayout(this.#heuristic);
    const visibleCells = visibleHudCellCount(this.root);
    const layout = resolveHudLayout({
      preferences: p,
      visibleCells,
      cellSize,
      viewportWidth: globalThis.innerWidth,
      viewportHeight: globalThis.innerHeight
    });
    this.root.style.setProperty(
      "--edit-hud-columns",
      String(layout.columns)
    );
    this.root.style.setProperty(
      "--edit-hud-rows",
      String(layout.rows)
    );
    this.root.style.setProperty(
      "--edit-hud-window-height",
      `${layout.rows * cellSize + Math.max(0, layout.rows - 1) * 3 + 10}px`
    );
    this.root.style.setProperty(
      "--edit-hud-window-width",
      `${layout.columns * cellSize + Math.max(0, layout.columns - 1) * 3 + 10}px`
    );
    for (const checkbox of this.root.querySelectorAll("[data-edit-hud-group-toggle]")) {
      checkbox.checked = this.#familyVisibleByPreference(
        checkbox.dataset.editHudGroupToggle
      );
    }
    this.#element("edit-hud-dock").value = p.dock;
    this.#element("edit-hud-orientation").value = p.orientation;
    this.#element("edit-hud-size").value = p.size;
    this.#element("edit-hud-opacity").value = String(p.opacity);
    this.#element("edit-hud-columns").value = String(p.columns);
    this.#element("edit-hud-rows").value = String(p.rows);
    this.#element("edit-hud-drawing-helper-size").value = String(
      p.drawingHelperSize
    );
    this.#element("edit-hud-drawing-helper-opacity").value = String(
      p.drawingHelperOpacity
    );
    this.#element("edit-hud-tap-hints").checked = p.tapHints !== false;
    this.#element("edit-hud-adaptive-order").checked = p.adaptiveOrder !== false;
    this.#element("edit-hud-appearance-target").value =
      normalizeAppearanceTarget(p.appearanceTarget);
    this.#element("edit-hud-appearance-color-action").value =
      normalizeAppearanceColorAction(p.appearanceColorAction);
    this.#element("edit-hud-default-extrude").value = String(p.defaults.extrude);
    this.#element("edit-hud-default-inset").value = String(p.defaults.inset);
    this.#element("edit-hud-default-path-radius").value = String(p.defaults.pathRadius);
    this.#scheduleFitToViewport();
  }

  #scheduleFitToViewport() {
    if (this.#fitFrame !== null) return;
    const callback = () => {
      this.#fitFrame = null;
      this.#fitToViewport();
    };
    this.#fitFrame =
      typeof globalThis.requestAnimationFrame === "function"
        ? globalThis.requestAnimationFrame(callback)
        : globalThis.setTimeout?.(callback, 0) ?? null;
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

  #refreshContextActions(state, heuristic) {
    const mode = heuristic.mode;
    const tokens = new Set(heuristic.meshActive ? ["mesh", mode] : ["object"]);
    const selectedComponents = heuristic.selectedComponents;
    const availability = {
      "edit-hud-enter-mesh": heuristic.canEnterMesh,
      "edit-hud-group": heuristic.canGroup,
      "edit-hud-ungroup": heuristic.canUngroup,
      "edit-hud-duplicate": heuristic.canDuplicate,
      "edit-hud-delete": heuristic.canDelete,
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
      button.dataset.contextManaged = "true";
      button.dataset.contextVisible = inContext ? "true" : "false";
      button.dataset.contextAvailable = enabled ? "true" : "false";
      button.disabled = !enabled;
      button.dataset.available = enabled ? "true" : "false";
      if (inContext) visible += 1;
    }
    const group = this.root.querySelector('[data-edit-hud-group="actions"]');
    if (group) group.dataset.contextHidden = visible ? "false" : "true";
    const creation = this.root.querySelector('[data-edit-hud-group="creation"]');
    if (creation) creation.dataset.contextHidden = heuristic.meshActive ? "true" : "false";
    this.#element("edit-hud-tube-from-object").disabled = !heuristic.canTubeFromObject;
    this.#element("edit-hud-sweep-from-objects").disabled = !heuristic.canSweepFromObjects;
    this.#element("edit-hud-array-along-path").disabled = !heuristic.canArrayAlongPath;
    this.#element("edit-hud-create").dataset.active =
      state.activeAction === "object.place" ? "true" : "false";
    this.#element("edit-hud-draw-path").dataset.active =
      state.activeAction === "path.sketch" ? "true" : "false";
  }

  #prepareLayoutSystem() {
    this.#layoutDescriptors = [...discoverHudDescriptors(this.root, {
      familyOrder: STATIC_GROUP_ORDER
    })];
    this.#layoutStore = new HudLayoutStore({
      familyIds: this.#layoutDescriptors.map(descriptor => descriptor.family),
      itemIds: this.#layoutDescriptors.map(descriptor => descriptor.id),
      familyOrder: STATIC_GROUP_ORDER,
      itemFamilies: Object.fromEntries(
        this.#layoutDescriptors.map(descriptor => [descriptor.id, descriptor.family])
      ),
      legacyPreferences: this.#preferences
    });
    this.#layoutCustomizer = new HudCustomizationController({
      root: this.#element("edit-hud-customizer"),
      store: this.#layoutStore,
      descriptors: this.#layoutDescriptors
    });
    this.#unsubscribeLayout = this.#layoutStore.subscribe(() => {
      this.#lastLayoutSignature = null;
      this.#syncLegacyGroupPreferences();
      this.#applyAdaptiveLayout(this.#heuristic);
      this.#scheduleFitToViewport();
    });
    this.#syncLegacyGroupPreferences();
  }

  #syncLegacyGroupPreferences() {
    const profile = this.#layoutStore?.profile?.();
    if (!profile) return;
    for (const group of STATIC_GROUP_ORDER) {
      this.#preferences.groups[group] =
        profile.families?.[group]?.visibility !== "hidden";
    }
  }

  #familyVisibleByPreference(group) {
    const profile = this.#layoutStore?.profile?.();
    return profile?.families?.[group]?.visibility !== "hidden";
  }

  #layoutContext() {
    const familyContext = {};
    const itemContext = {};
    for (const group of this.root.querySelectorAll("[data-edit-hud-group]")) {
      familyContext[group.dataset.editHudGroup] = {
        visible: group.dataset.contextHidden !== "true",
        available: true
      };
    }
    for (const descriptor of this.#layoutDescriptors) {
      const element = descriptor.element;
      const control = element.matches?.("button, input, select")
        ? element
        : element.querySelector?.("button, input, select");
      itemContext[descriptor.id] = {
        visible: element.dataset.contextVisible == null
          ? familyContext[descriptor.family]?.visible !== false
          : element.dataset.contextVisible === "true",
        available: element.dataset.contextAvailable == null
          ? !Boolean(control?.disabled)
          : element.dataset.contextAvailable === "true"
      };
    }
    return { familyContext, itemContext };
  }

  #buildGeometryTools() {
    const group = this.#element("edit-hud-creation-tools");
    const anchor = this.#element("edit-hud-tube-from-object");
    this.#geometryCatalog = [...(this.query("geometry.catalog") ?? [])]
      .sort((left, right) =>
        geometryToolPriority(left.type) - geometryToolPriority(right.type) ||
        left.label.localeCompare(right.label)
      );
    for (const description of this.#geometryCatalog) {
      const button = this.root.ownerDocument.createElement("button");
      button.type = "button";
      button.id = `edit-hud-geometry-${safeId(description.type)}`;
      button.dataset.geometryType = description.type;
      button.dataset.geometryLabel = description.label;
      button.textContent = geometryToolIcon(description.type);
      button.title = `Criar ${description.label}`;
      button.addEventListener("click", () => {
        this.#selectGeometryType(description.type);
        this.#beginRememberedObjectPlacement(description.type);
      });
      group.insertBefore(button, anchor);
    }
  }

  #refreshGeometryTools() {
    const selectedType = this.#rememberedGeometryType();
    for (const button of this.root.querySelectorAll("[data-geometry-type]")) {
      button.dataset.active = button.dataset.geometryType === selectedType
        ? "true"
        : "false";
      button.disabled = Boolean(this.#heuristic?.meshActive);
    }
  }

  #applyAdaptiveLayout(heuristic) {
    if (!this.#layoutStore || !this.#layoutDescriptors.length) return;
    const adaptive = this.#preferences.adaptiveOrder !== false;
    const groupOrder = heuristic && adaptive
      ? heuristic.groupOrder
      : STATIC_GROUP_ORDER;
    const actionOrder = heuristic && adaptive
      ? heuristic.actionOrder
      : STATIC_ACTION_ORDER;
    const adaptiveItemOrder = [
      ...actionOrder,
      ...this.#creationLayoutOrder(heuristic)
    ];
    const { familyContext, itemContext } = this.#layoutContext();
    const plan = resolveHudLayoutPlan({
      descriptors: this.#layoutDescriptors,
      profile: this.#layoutStore.profile(),
      adaptiveGroupOrder: groupOrder,
      adaptiveItemOrder,
      familyContext,
      itemContext
    });
    const signature = hudLayoutSignature(plan);
    if (signature === this.#lastLayoutSignature) return;
    applyHudLayoutPlan(plan);
    this.#lastLayoutSignature = signature;
  }

  #creationLayoutOrder(heuristic) {
    const group = this.root.querySelector('[data-edit-hud-group="creation"]');
    if (!group) return [];
    const geometryButtons = [...group.querySelectorAll("[data-geometry-type]")];
    const selectedType = this.#rememberedGeometryType();
    geometryButtons.sort((left, right) => {
      const leftSelected = left.dataset.geometryType === selectedType ? 0 : 1;
      const rightSelected = right.dataset.geometryType === selectedType ? 0 : 1;
      if (leftSelected !== rightSelected) return leftSelected - rightSelected;
      return geometryToolPriority(left.dataset.geometryType) -
        geometryToolPriority(right.dataset.geometryType);
    });
    const tube = this.#element("edit-hud-tube-from-object");
    const sweep = this.#element("edit-hud-sweep-from-objects");
    const array = this.#element("edit-hud-array-along-path");
    const referenceTools = heuristic?.canSweepFromObjects
      ? [sweep, tube, array]
      : heuristic?.canTubeFromObject
        ? [tube, array, sweep]
        : [tube, sweep, array];
    const order = heuristic?.pathReference
      ? [...referenceTools, ...geometryButtons]
      : [...geometryButtons, ...referenceTools];
    return order.map(element => element.id);
  }

  #selectGeometryType(type) {
    const description = this.#geometryCatalog.find(item => item.type === type);
    if (!description) throw new Error(`Geometria desconhecida: ${type}.`);
    const creation = readStorageObject(CREATION_STORAGE_KEY);
    localStorage.setItem(CREATION_STORAGE_KEY, JSON.stringify({
      ...creation,
      geometryType: type
    }));
    const geometry = readStorageObject(GEOMETRY_CREATION_STORAGE_KEY);
    localStorage.setItem(GEOMETRY_CREATION_STORAGE_KEY, JSON.stringify({
      ...geometry,
      type
    }));
    globalThis.dispatchEvent?.(new CustomEvent("spatialseed:geometry-default-changed", {
      detail: { type }
    }));
    this.#refreshGeometryTools();
  }

  #rememberedGeometryType() {
    const defaults = readStorageObject(CREATION_STORAGE_KEY);
    const advanced = readStorageObject(GEOMETRY_CREATION_STORAGE_KEY);
    const candidate = defaults.geometryType ?? advanced.type;
    return this.#geometryCatalog.some(item => item.type === candidate)
      ? candidate
      : this.#geometryCatalog[0]?.type ?? null;
  }

  #createTubeFromHeuristic() {
    const reference = this.#heuristic?.pathReference;
    if (!reference) return this.#reportError(
      "Selecione um objeto que possa fornecer um caminho."
    );
    return this.#execute("path.tube.create", {
      path: { source: "object", objectId: reference.id, extraction: "auto" }
    });
  }

  #createSweepFromHeuristic() {
    const path = this.#heuristic?.pathReference;
    const profile = this.#heuristic?.profileReference;
    if (!path || !profile) {
      return this.#reportError(
        "Selecione um objeto-caminho e um objeto-perfil compatível."
      );
    }
    return this.#execute("path.sweep.create", {
      path: { source: "object", objectId: path.id, extraction: "auto" },
      profile: { source: "object", objectId: profile.id, extraction: "auto" }
    });
  }

  #arrayAlongHeuristicPath() {
    const path = this.#heuristic?.pathReference;
    if (!path) return this.#reportError(
      "Selecione um caminho e os objetos que serão distribuídos."
    );
    return this.#execute("path.array.create", {
      path: { source: "object", objectId: path.id, extraction: "auto" }
    });
  }

  #refreshParameterAliases() {
    for (const [toolId, parameterId, controlId] of [
      ["mesh.extrude", "distance", "edit-hud-default-extrude"],
      ["mesh.inset", "amount", "edit-hud-default-inset"],
      ["path.sketch", "radius", "edit-hud-default-path-radius"],
      ["path.sketch", "anchorPolicy", "edit-hud-anchor-policy"]
    ]) {
      const result = this.query("edit.tool.parameters.get", { toolId });
      const control = this.#element(controlId);
      if (this.root.ownerDocument.activeElement !== control &&
          result?.values?.[parameterId] !== undefined) {
        control.value = String(result.values[parameterId]);
      }
    }
  }

  #refreshAppearanceControls(selection = null) {
    const target = normalizeAppearanceTarget(
      this.#preferences.appearanceTarget
    );
    const colorAction = normalizeAppearanceColorAction(
      this.#preferences.appearanceColorAction
    );
    const selectedCount = selection?.members?.length ?? 0;
    const selectionAppearance = this.query(
      "selection.appearance.inspect"
    ) ?? { count: 0 };
    const tool = this.query("edit.tool.parameters.get", {
      toolId: "path.sketch"
    })?.values ?? {};
    const toolColor = tool.mode === "array" && tool.sourceMode === "catalog"
      ? tool.sourceColor ?? "#6699cc"
      : tool.color ?? "#70c8ff";
    const toolMaterial = normalizeMaterialMode(tool.materialMode ?? "inherit");
    const toolOpacity = finiteRangeValue(
      tool.opacityMultiplier ?? 1,
      0,
      1,
      1
    );
    const selectionColor = selectionAppearance.colorMode?.value === "per-instance"
      ? selectionAppearance.tint?.value ?? "#ffffff"
      : selectionAppearance.effectiveColor?.value ?? null;
    const selectionMaterial = selectionAppearance.materialMode?.mixed
      ? "mixed"
      : normalizeMaterialMode(
          selectionAppearance.materialMode?.value ??
          selectionAppearance.effectiveMaterialMode?.value ??
          "inherit"
        );
    const selectionEffectiveMaterial = selectionAppearance.effectiveMaterialMode?.mixed
      ? "mixed"
      : normalizeMaterialMode(
          selectionAppearance.effectiveMaterialMode?.value ?? selectionMaterial
        );
    const toolEffectiveMaterial = toolMaterial === "inherit"
      ? tool.mode === "array" && tool.sourceMode === "catalog"
        ? "unlit"
        : "standard"
      : toolMaterial;
    const selectionOpacity = selectionAppearance.opacityMultiplier?.mixed
      ? null
      : selectionAppearance.opacityMultiplier?.value;

    const values = [];
    if (target === "tool" || target === "both") {
      values.push({
        source: "tool",
        color: toolColor,
        material: toolMaterial,
        opacity: toolOpacity
      });
    }
    if ((target === "selection" || target === "both") && selectedCount) {
      values.push({
        source: "selection",
        color: selectionColor,
        material: selectionMaterial,
        opacity: selectionOpacity
      });
    }

    const colorState = aggregateHudValues(
      values.map(value => value.color).filter(Boolean)
    );
    const materialState = aggregateHudValues(
      values.map(value => value.material).filter(Boolean)
    );
    const opacityState = aggregateHudValues(
      values.map(value => value.opacity).filter(value => value !== null && value !== undefined),
      { numeric: true }
    );

    const colorControl = this.#element("edit-hud-appearance-color");
    const materialControl = this.#element("edit-hud-appearance-material");
    const opacityControl = this.#element("edit-hud-appearance-opacity");
    const unavailable = target === "selection" && !selectedCount;
    colorControl.disabled = unavailable;
    materialControl.disabled = unavailable;
    opacityControl.disabled = unavailable;
    this.#element("edit-hud-appearance-color-action").disabled = unavailable;

    if (this.root.ownerDocument.activeElement !== colorControl &&
        colorState.value && /^#[0-9a-f]{6}$/i.test(colorState.value)) {
      colorControl.value = colorState.value;
    }
    colorControl.dataset.mixed = colorState.mixed ? "true" : "false";

    if (this.root.ownerDocument.activeElement !== materialControl) {
      materialControl.value = materialState.mixed
        ? "mixed"
        : normalizeMaterialMode(materialState.value ?? "inherit");
    }
    materialControl.dataset.mixed = materialState.mixed ? "true" : "false";

    if (this.root.ownerDocument.activeElement !== opacityControl &&
        opacityState.value !== null) {
      opacityControl.value = String(opacityState.value);
    }
    opacityControl.dataset.mixed = opacityState.mixed ? "true" : "false";
    this.#updateAppearanceOpacityLabel(
      opacityState.value ?? opacityControl.value,
      opacityState.mixed
    );

    this.#element("edit-hud-appearance-target").value = target;
    this.#element("edit-hud-appearance-color-action").value = colorAction;
    const stateLabel = this.#element("edit-hud-appearance-state");
    if (unavailable) {
      stateLabel.textContent = "Seleção vazia";
    } else if (values.length > 1 &&
        (colorState.mixed || materialState.mixed || opacityState.mixed)) {
      stateLabel.textContent = "Ferramenta e seleção diferem";
    } else if (selectionAppearance.colorMode?.mixed) {
      stateLabel.textContent = `${selectedCount} objetos · cores mistas · ${
        materialModeLabel(selectionEffectiveMaterial)
      }`;
    } else if (selectionAppearance.colorMode?.value === "per-instance") {
      stateLabel.textContent = `${selectedCount} objetos · cor por instância · ${
        materialModeLabel(selectionEffectiveMaterial)
      }`;
    } else if (target === "tool") {
      stateLabel.textContent = `Próximos traços · ${
        materialModeLabel(toolEffectiveMaterial)
      }`;
    } else {
      stateLabel.textContent = `${selectedCount} objeto${
        selectedCount === 1 ? "" : "s"
      } · ${materialModeLabel(selectionEffectiveMaterial)}`;
    }
  }

  #applyAppearanceColor(value) {
    const color = normalizeHudColor(value);
    const target = normalizeAppearanceTarget(
      this.#preferences.appearanceTarget
    );
    if (target === "tool" || target === "both") {
      this.#execute("edit.tool.parameters.set", {
        toolId: "path.sketch",
        patch: { color, sourceColor: color }
      });
    }
    if (target === "selection" || target === "both") {
      const appearance = this.query("selection.appearance.inspect") ?? {};
      if (Number(appearance.count ?? 0) > 0) {
        const action = normalizeAppearanceColorAction(
          this.#preferences.appearanceColorAction
        );
        const useTint = action === "tint" ||
          (action === "auto" && appearance.colorMode?.value === "per-instance");
        this.#execute("appearance.selection.patch", {
          binding: useTint ? { tint: color } : { color }
        });
      }
    }
    this.#refreshAppearanceControls(this.query("selection.snapshot"));
  }

  #applyAppearanceMaterial(value) {
    const materialMode = normalizeMaterialMode(value);
    const target = normalizeAppearanceTarget(
      this.#preferences.appearanceTarget
    );
    if (target === "tool" || target === "both") {
      this.#execute("edit.tool.parameters.set", {
        toolId: "path.sketch",
        patch: { materialMode }
      });
    }
    if ((target === "selection" || target === "both") &&
        (this.query("selection.snapshot")?.members?.length ?? 0) > 0) {
      this.#execute("appearance.material.bind", {
        binding: { materialMode }
      });
    }
    this.#refreshAppearanceControls(this.query("selection.snapshot"));
  }

  #applyAppearanceOpacity(value) {
    const opacityMultiplier = finiteRangeValue(value, 0, 1, 1);
    const target = normalizeAppearanceTarget(
      this.#preferences.appearanceTarget
    );
    if (target === "tool" || target === "both") {
      this.#execute("edit.tool.parameters.set", {
        toolId: "path.sketch",
        patch: { opacityMultiplier }
      });
    }
    if ((target === "selection" || target === "both") &&
        (this.query("selection.snapshot")?.members?.length ?? 0) > 0) {
      this.#execute("appearance.selection.patch", {
        binding: { opacityMultiplier }
      });
    }
    this.#refreshAppearanceControls(this.query("selection.snapshot"));
  }

  #updateAppearanceOpacityLabel(value, mixed = false) {
    const output = this.#element("edit-hud-appearance-opacity-value");
    output.textContent = mixed
      ? "misto"
      : `${Math.round(finiteRangeValue(value, 0, 1, 1) * 100)}%`;
  }

  #reportError(message) {
    this.#element("edit-hud-status").textContent = String(message);
    this.root.dataset.error = "true";
    globalThis.setTimeout?.(() => {
      this.root.dataset.error = "false";
      this.refresh();
    }, 1800);
    return null;
  }

  #loadPreferences() {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
      this.#preferences = {
        ...structuredClone(DEFAULT_PREFERENCES),
        ...stored,
        ...normalizeHudDimensions(stored, DEFAULT_PREFERENCES),
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

  #drawingTargetArguments({ source = null } = {}) {
    return {
      source: source ?? this.#element("edit-hud-drawing-target-source").value,
      offset: Number(this.#element("edit-hud-drawing-target-offset").value) || 0,
      helperVisible: this.#element("edit-hud-drawing-target-helper").checked,
      helperSize: this.#preferences.drawingHelperSize,
      helperOpacity: this.#preferences.drawingHelperOpacity,
      helperGrid: true,
      frontFacesOnly: this.#element(
        "edit-hud-surface-front-faces"
      ).checked,
      lockObject: this.#element(
        "edit-hud-surface-lock-object"
      ).checked,
      maximumJump: Math.max(
        0,
        Number(this.#element("edit-hud-surface-maximum-jump").value) || 0
      )
    };
  }

  #refreshSurfaceTargetIfActive() {
    const status = this.query("drawing.target.status") ?? {};
    if (status.type !== "surface") return;
    this.#execute("drawing.target.set", {
      ...this.#drawingTargetArguments({ source: "surface-selection" }),
      objectIds: status.surfaceTarget?.objectIds ?? null
    });
  }

  #quickPlaneSource() {
    const mesh = this.query("mesh.edit.status") ?? {};
    if (mesh.active && mesh.componentMode === "face" &&
        mesh.selectedCount > 0) {
      return "face";
    }
    if (mesh.active && mesh.componentMode === "vertex" &&
        mesh.selectedCount === 3) {
      return "three-points";
    }
    const selection = this.query("selection.snapshot") ?? {};
    if (selection.members?.length === 3) return "three-points";
    if (selection.members?.length) return "object";
    return "viewer";
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
      grid: this.#element("edit-hud-snap-grid").checked,
      angle: this.#element("edit-hud-snap-angle").checked,
      gridStep: finiteOr(this.#element("edit-hud-grid-step").value, 1),
      angleStepDegrees: finiteOr(
        this.#element("edit-hud-angle-step").value,
        15
      )
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
  "edit-hud-resize": ["Redimensionar HUD", "Arraste para ajustar rapidamente o número de colunas e linhas da grade de ferramentas."],
  "edit-hud-appearance-target": ["Alvo da aparência", "Escolhe se cor, material e opacidade alteram a seleção, os próximos traços ou ambos."],
  "edit-hud-appearance-color": ["Cor", "Aplica uma cor uniforme ou uma matização conforme o modo escolhido."],
  "edit-hud-appearance-color-action": ["Modo da cor", "Automático preserva variações por instância; Uniformizar substitui a variação; Matizar preserva a variação."],
  "edit-hud-appearance-material": ["Material", "Escolhe material automático, não iluminado, padrão ou físico sem reconstruir a geometria."],
  "edit-hud-appearance-opacity": ["Opacidade", "Altera a opacidade em uma única entrada de histórico ao soltar o controle."],
  "edit-hud-pivot-edit": ["Editar pivô", "Ativa o manipulador do pivô sem deslocar a geometria do objeto selecionado."],
  "edit-hud-edit-plane": ["Plano de edição", "Captura um referencial independente para transformações e edição de componentes."],
  "edit-hud-drawing-plane": ["Plano de desenho", "Captura o plano onde pontos e formas 2D serão criados; não altera a câmera nem o plano de edição."],
  "edit-hud-drawing-target-source": ["Fonte do alvo", "Escolhe vista, plano mundial, objeto, face, três pontos ou plano de edição."],
  "edit-hud-drawing-target-set": ["Definir alvo", "Cria e trava o plano de desenho usando a fonte escolhida."],
  "edit-hud-drawing-target-helper": ["Mostrar helper", "Mostra ou oculta o plano transparente, grade e normal."],
  "edit-hud-drawing-target-edit": ["Editar helper", "Ativa o gizmo local do plano sem selecionar um objeto da cena."],
  "edit-hud-drawing-target-translate": ["Mover plano", "Configura o gizmo do helper para translação."],
  "edit-hud-drawing-target-rotate": ["Girar plano", "Configura o gizmo do helper para rotação local."],
  "edit-hud-drawing-target-offset": ["Offset do plano", "Desloca o plano ao longo de sua normal sem alterar a orientação."],
  "edit-hud-drawing-target-clear": ["Liberar alvo", "Remove o plano travado e retorna o desenho ao plano implícito do viewer."],
  "edit-hud-planar-finish": ["Concluir polilinha", "Publica todos os pontos da polilinha como uma única geometria e uma única etapa de undo."],
  "edit-hud-planar-back": ["Remover último ponto", "Retira somente o último ponto ainda não publicado da polilinha 2D."],
  "edit-hud-planar-edit": ["Editar 2D", "Entra na edição de vértices do objeto selecionado usando o plano de edição quando definido."],
  "edit-hud-planar-cancel": ["Cancelar desenho 2D", "Descarta o rascunho local sem alterar o documento."],
  "edit-hud-selection-replace": ["Substituir seleção", "A próxima seleção substitui todos os objetos ou componentes atualmente selecionados."],
  "edit-hud-selection-add": ["Adicionar à seleção", "A próxima seleção acrescenta objetos, vértices, arestas ou faces ao conjunto atual."],
  "edit-hud-selection-remove": ["Remover da seleção", "A próxima seleção remove os componentes atingidos do conjunto atual."],
  "edit-hud-selection-toggle": ["Alternar seleção", "Cada componente atingido alterna entre selecionado e não selecionado."],
  "edit-hud-tube-from-object": ["Tubo por caminho", "Cria um tubo usando o objeto-caminho selecionado e o raio memorizado."],
  "edit-hud-sweep-from-objects": ["Varredura de perfil", "Cria uma malha varrendo um objeto-perfil ao longo de um objeto-caminho selecionado."],
  "edit-hud-array-along-path": ["Distribuir no caminho", "Distribui os objetos selecionados ao longo do caminho selecionado e alinha cada cópia à tangente."],
  "edit-hud-open": ["Painel Editar", "Abre o workspace completo com parâmetros numéricos, criação, materiais, luzes, caminhos e operações de malha."],
  "edit-hud-help": ["Ajuda dos ícones", "Ativa o modo de consulta. Nesse modo, tocar numa ferramenta mostra sua explicação sem executá-la."],
  "edit-hud-object": ["Modo objeto", "Seleciona e transforma objetos inteiros. Encerre ou aplique a sessão de malha antes de retornar a este modo."],
  "edit-hud-area-selection": ["Seleção retangular", "Arraste um retângulo e aplique a operação de seleção atual ao soltar."],
  "edit-hud-brush-selection": ["Seleção em pincel", "Pinte objetos ou componentes; a cena é consultada uma única vez ao soltar."],
  "edit-hud-lasso-selection": ["Seleção em laço", "Contorne objetos ou componentes com um laço livre e conclua ao soltar."],
  "edit-hud-eraser": ["Borracha", "Pinte objetos ou componentes para excluí-los em uma única operação reversível."],
  "edit-hud-axis-x": ["Eixo X", "Permite ou bloqueia o componente X da transformação no frame ativo."],
  "edit-hud-axis-y": ["Eixo Y", "Permite ou bloqueia o componente Y da transformação no frame ativo."],
  "edit-hud-axis-z": ["Eixo Z", "Permite ou bloqueia o componente Z da transformação no frame ativo."],
  "edit-hud-snap-enabled": ["Snap", "Liga ou desliga todas as modalidades de encaixe configuradas."],
  "edit-hud-snap-auto": ["Snap automático", "Escolhe adaptativamente entre vértice, aresta, face e grade conforme proximidade e contexto."],
  "edit-hud-snap-vertex": ["Snap em vértice", "Atrai a âncora da transformação para vértices compatíveis."],
  "edit-hud-snap-edge": ["Snap em aresta", "Atrai a âncora para o ponto mais próximo de uma aresta compatível."],
  "edit-hud-snap-face": ["Snap em face", "Atrai a transformação para a superfície de uma face compatível."],
  "edit-hud-snap-grid": ["Snap em grade", "Quantiza a transformação segundo o espaçamento da grade."],
  "edit-hud-snap-angle": ["Trava angular", "Quantiza segmentos 2D e rotações 3D segundo o passo angular configurado."],
  "edit-hud-proportional": ["Influência proporcional", "Move também vértices conectados segundo raio, métrica e função de atenuação configurados."],
  "edit-hud-plane-lock": ["Visualização 2D", "Fixa a câmera perpendicular ao plano capturado, desativa a órbita e mantém o pan dentro desse plano."],
  "edit-hud-edit-plane": ["Plano de edição", "Captura um plano independente para criação, desenho, snap e frame personalizado."],
  "edit-hud-point-lock": ["Travar ponto", "Mantém o alvo do viewer fixo e orbita ao redor desse ponto."],
  "edit-hud-view-reset": ["Restaurar viewer", "Retorna posição, orientação, foco e projeção da câmera ao estado inicial deste viewer."],
  "edit-hud-ruler": ["Régua", "Mede a distância entre dois pontos no plano de desenho, respeitando grade, eixos e trava angular."],
  "edit-hud-protractor": ["Transferidor", "Mede o ângulo entre dois raios definidos no plano de desenho."],
  "edit-hud-measure-clear": ["Limpar medição", "Remove os pontos e o resultado do overlay local de medição."],
  "edit-hud-keep-tool": ["Manter ferramenta", "Mantém desenho e criação ativos após cada operação para executar várias vezes sem reabrir a ferramenta."],
  "edit-hud-repeat": ["Repetir", "Reaplica a última operação repetível, com os mesmos parâmetros, sobre a seleção atual."],
  "edit-hud-create": ["Criar objeto", "Inicia uma inserção de disparo único. Toque novamente para desarmar; marque manter ferramenta ativa apenas quando desejar inserção contínua."],
  "edit-hud-create-light": ["Criar luz", "Cria uma luz com tipo, cor, intensidade e sombras memorizados."],
  "edit-hud-material": ["Materiais e luzes", "Abre no painel Editar os parâmetros do material ou da luz selecionada."],
  "edit-hud-enter-mesh": ["Editar malha", "Isola a malha do objeto selecionado e inicia uma sessão local de edição de componentes."],
  "edit-hud-draw-path": ["Desenhar spline", "Desenha à mão livre e une automaticamente tubos que se tocam. Toque novamente no ícone para desarmar."],
  "edit-hud-group": ["Agrupar", "Cria um grupo contendo os objetos selecionados."],
  "edit-hud-ungroup": ["Desagrupar", "Remove o grupo selecionado e preserva seus filhos na cena."],
  "edit-hud-fuse-families": ["Compactar instâncias", "Combina famílias instanciadas compatíveis sem criar um objeto completo para cada membro. Use para distribuições, repetições e pincéis geométricos."],
  "edit-hud-fuse-strokes": ["Unir traços", "Reúne tubos e traços selecionados no mesmo objeto lógico, inclusive partes descontínuas de letras ou palavras."],
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
  const geometryType = control.dataset.geometryType;
  if (geometryType) {
    const label = control.dataset.geometryLabel ?? geometryType;
    return {
      title: `Criar ${label}`,
      description: `Memoriza ${label} como geometria ativa e inicia a colocação por clique usando seus últimos parâmetros.`
    };
  }
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
  const planarTool = control.dataset.planarTool;
  if (planarTool) {
    const label = ({
      point: "Ponto 2D",
      line: "Segmento 2D",
      polyline: "Polilinha 2D",
      rectangle: "Retângulo 2D",
      circle: "Círculo 2D",
      arc: "Arco 2D",
      polygon: "Polígono 2D"
    })[planarTool] ?? "Ferramenta 2D";
    return {
      title: label,
      description:
        `Desenha ${label.toLowerCase()} no plano de desenho, com preview local e uma única operação de undo.`
    };
  }
  const title = control.getAttribute("title") || control.getAttribute("aria-label") || "Ferramenta";
  return { title, description: title };
}

function normalizeAppearanceTarget(value) {
  const target = String(value ?? "selection").trim().toLowerCase();
  return ["selection", "tool", "both"].includes(target)
    ? target
    : "selection";
}

function normalizeAppearanceColorAction(value) {
  const action = String(value ?? "auto").trim().toLowerCase();
  return ["auto", "uniform", "tint"].includes(action)
    ? action
    : "auto";
}

function normalizeMaterialMode(value) {
  const mode = String(value ?? "inherit").trim().toLowerCase();
  return ["inherit", "unlit", "standard", "physical"].includes(mode)
    ? mode
    : "inherit";
}

function materialModeLabel(value) {
  return ({
    inherit: "Automático",
    unlit: "Não iluminado",
    standard: "Padrão",
    physical: "Físico",
    mixed: "Materiais mistos"
  })[value] ?? "Material";
}

function normalizeHudColor(value) {
  const color = String(value ?? "").trim().toLowerCase();
  if (!/^#[0-9a-f]{6}$/.test(color)) {
    throw new TypeError(`Cor inválida: ${value}.`);
  }
  return color;
}

function finiteRangeValue(value, minimum, maximum, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return clamp(number, minimum, maximum);
}

function aggregateHudValues(values, { numeric = false } = {}) {
  if (!values.length) return { mixed: false, value: null };
  const first = values[0];
  const equal = numeric
    ? value => Math.abs(Number(value) - Number(first)) <= 1e-9
    : value => String(value) === String(first);
  const mixed = values.some(value => !equal(value));
  return { mixed, value: mixed ? null : first };
}

function describeState(state) {
  const subject = ({ object: "Objeto", vertex: "Vértice", edge: "Aresta", face: "Face" })[state.subjectLevel];
  const axes = ["x", "y", "z"].filter(axis => state.axes[axis]).join("").toUpperCase() || "bloqueado";
  const locks = [
    state.planeLock ? "vista-2D" : null,
    state.editPlane ? "plano-edição" : null,
    state.drawingPlane ? "plano-desenho" : null,
    state.pivotEditing ? "pivô" : null,
    state.pointLock ? "ponto" : null
  ]
    .filter(Boolean)
    .join("+");
  return `${subject} · ${state.tool} · ${state.frameMode} · ${axes}${locks ? ` · ${locks}` : ""}`;
}

function safeId(value) {
  return String(value ?? "geometry")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "geometry";
}

function readStorageObject(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? "{}");
    return value && typeof value === "object" && !Array.isArray(value)
      ? value
      : {};
  } catch {
    return {};
  }
}

function rememberedGeometryDescriptor(description) {
  const stored = readStorageObject(GEOMETRY_CREATION_STORAGE_KEY);
  const values = stored.parameters?.[description.type] ?? {};
  const descriptor = { type: description.type };
  for (const parameter of description.parameters ?? []) {
    descriptor[parameter.id] = readRememberedGeometryParameter(parameter, values);
  }
  return descriptor;
}

function readRememberedGeometryParameter(parameter, values) {
  const baseName = `parameter-${parameter.id}`;
  const fallback = structuredClone(parameter.default);
  if (["vector2", "vector3", "integer-vector3"].includes(parameter.type)) {
    const length = parameter.type === "vector2" ? 2 : 3;
    const result = [];
    for (let index = 0; index < length; index += 1) {
      const raw = values[`${baseName}-${index}`];
      const parsed = parameter.type === "integer-vector3"
        ? Number.parseInt(raw, 10)
        : Number(raw);
      const defaultValue = Array.isArray(fallback) ? fallback[index] : 0;
      result.push(Number.isFinite(parsed) ? parsed : defaultValue);
    }
    return result;
  }
  if (!(baseName in values)) return fallback;
  const raw = values[baseName];
  if (parameter.type === "boolean") return Boolean(raw);
  if (parameter.type === "integer") {
    const value = Number.parseInt(raw, 10);
    return Number.isFinite(value) ? value : fallback;
  }
  if (parameter.type === "number") {
    const value = Number(raw);
    return Number.isFinite(value) ? value : fallback;
  }
  if (parameter.type === "json") {
    try { return typeof raw === "string" ? JSON.parse(raw) : structuredClone(raw); }
    catch { return fallback; }
  }
  return raw ?? fallback;
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

export function normalizeHudDimensions(value = {}, fallback = {}) {
  return Object.freeze({
    columns: positiveInteger(
      value.columns,
      positiveInteger(fallback.columns, DEFAULT_PREFERENCES.columns)
    ),
    rows: positiveInteger(
      value.rows,
      positiveInteger(fallback.rows, DEFAULT_PREFERENCES.rows)
    )
  });
}

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 ? number : fallback;
}

function visibleHudCellCount(root) {
  let count = 0;
  for (const group of root.querySelectorAll("[data-edit-hud-group]")) {
    if (group.hidden) continue;
    for (const control of group.querySelectorAll("button, label")) {
      if (!control.hidden) count += 1;
    }
  }
  return Math.max(1, count);
}

function resolveHudLayout({
  preferences,
  visibleCells,
  cellSize,
  viewportWidth,
  viewportHeight
}) {
  const gap = 3;
  const columnsInViewport = Math.max(
    1,
    Math.floor((positiveFiniteOr(viewportWidth, 1) - 22) / (cellSize + gap))
  );
  const rowsInViewport = Math.max(
    1,
    Math.floor((positiveFiniteOr(viewportHeight, 1) - 54) / (cellSize + gap))
  );
  const docked = preferences.dock !== "floating";
  if (preferences.orientation === "vertical") {
    const requestedRows = docked
      ? Math.max(preferences.rows, rowsInViewport)
      : preferences.rows;
    const rows = Math.min(visibleCells, requestedRows);
    const columns = Math.min(
      preferences.columns,
      Math.max(1, Math.ceil(visibleCells / rows))
    );
    return { columns, rows };
  }
  const requestedColumns = docked
    ? Math.max(preferences.columns, columnsInViewport)
    : preferences.columns;
  const columns = Math.min(visibleCells, requestedColumns);
  const rows = Math.min(
    preferences.rows,
    Math.max(1, Math.ceil(visibleCells / columns))
  );
  return { columns, rows };
}

function positiveFiniteOr(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function finiteOr(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeRememberedColor(value) {
  const source = String(value ?? "#ffffff").trim();
  return /^#[0-9a-f]{6}$/i.test(source) ? source.toLowerCase() : "#ffffff";
}
