const STORAGE_KEY = "spatialseed.edit.hud.v1";
const CREATION_STORAGE_KEY = "spatialseed.edit.creation-material.v1";
const DEFAULT_PREFERENCES = Object.freeze({
  dock: "floating",
  orientation: "horizontal",
  size: "normal",
  opacity: 0.96,
  columns: 4,
  rows: 2,
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
    history: true,
    actions: true,
    session: true
  }
});

export class EditHud {
  static apiVersion = "edit-hud-v1";

  #unsubscribe = null;
  #preferences = structuredClone(DEFAULT_PREFERENCES);
  #drag = null;

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
    this.#bind();
    this.#applyPreferences();
    this.#unsubscribe = subscribe?.(snapshot => this.refresh(snapshot)) ?? null;
    this.refresh();
  }

  dispose() {
    this.#unsubscribe?.();
    this.#listeners(false);
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
    this.#element("edit-hud-point-lock").checked = Boolean(state.pointLock);
    this.#element("edit-hud-undo").disabled = !state.canUndo;
    this.#element("edit-hud-redo").disabled = !state.canRedo;
    this.#element("edit-hud-apply").disabled = !state.meshActive || state.stale;
    this.#element("edit-hud-cancel").disabled = !state.meshActive;
    for (const groupName of ["history", "session"]) {
      const group = this.root.querySelector(`[data-edit-hud-group="${groupName}"]`);
      if (group) group.dataset.contextHidden = state.meshActive ? "false" : "true";
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
    this.#element("edit-hud-undo").addEventListener("click", () =>
      this.#execute("mesh.edit.undo")
    );
    this.#element("edit-hud-redo").addEventListener("click", () =>
      this.#execute("mesh.edit.redo")
    );
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
      "edit-hud-default-extrude", "edit-hud-default-inset",
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

  #listeners(enabled) {
    const handle = this.#element("edit-hud-handle");
    const method = enabled ? "addEventListener" : "removeEventListener";
    handle[method]("pointerdown", this.#onPointerDown);
    globalThis[method]("pointermove", this.#onPointerMove);
    globalThis[method]("pointerup", this.#onPointerUp);
    globalThis[method]("pointercancel", this.#onPointerUp);
    globalThis[method]("resize", this.#onResize);
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

function describeState(state) {
  const subject = ({ object: "Objeto", vertex: "Vértice", edge: "Aresta", face: "Face" })[state.subjectLevel];
  const axes = ["x", "y", "z"].filter(axis => state.axes[axis]).join("").toUpperCase() || "bloqueado";
  const locks = [state.planeLock ? "plano" : null, state.pointLock ? "ponto" : null]
    .filter(Boolean)
    .join("+");
  return `${subject} · ${state.tool} · ${state.frameMode} · ${axes}${locks ? ` · ${locks}` : ""}`;
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
