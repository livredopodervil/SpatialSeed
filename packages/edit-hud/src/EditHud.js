const STORAGE_KEY = "spatialseed.edit.hud.v1";
const DEFAULT_PREFERENCES = Object.freeze({
  dock: "floating",
  orientation: "horizontal",
  size: "normal",
  opacity: 0.96,
  left: 12,
  top: 96,
  groups: {
    subject: true,
    tool: true,
    frame: true,
    axes: true,
    snap: true,
    navigation: true,
    history: true,
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
    this.#element("edit-hud-object").disabled = state.meshActive;
    this.#element("edit-hud-proportional").disabled = !state.meshActive;
    this.#element("edit-hud-status").textContent = describeState(state);
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
      "edit-hud-dock", "edit-hud-orientation", "edit-hud-size", "edit-hud-opacity"
    ]) {
      this.#element(id).addEventListener("change", () => {
        this.#preferences.dock = this.#element("edit-hud-dock").value;
        this.#preferences.orientation = this.#element("edit-hud-orientation").value;
        this.#preferences.size = this.#element("edit-hud-size").value;
        this.#preferences.opacity = Number(this.#element("edit-hud-opacity").value);
        this.#savePreferences();
        this.#applyPreferences();
      });
    }
    this.#element("edit-hud-reset").addEventListener("click", () => {
      this.#preferences = structuredClone(DEFAULT_PREFERENCES);
      this.#savePreferences();
      this.#applyPreferences();
    });
    this.#listeners(true);
  }

  #listeners(enabled) {
    const handle = this.#element("edit-hud-handle");
    const method = enabled ? "addEventListener" : "removeEventListener";
    handle[method]("pointerdown", this.#onPointerDown);
    globalThis[method]("pointermove", this.#onPointerMove);
    globalThis[method]("pointerup", this.#onPointerUp);
    globalThis[method]("pointercancel", this.#onPointerUp);
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
    const left = clamp(event.clientX - this.#drag.offsetX, 0, innerWidth - width);
    const top = clamp(event.clientY - this.#drag.offsetY, 0, innerHeight - height);
    this.#preferences.left = left;
    this.#preferences.top = top;
    this.root.style.left = `${left}px`;
    this.root.style.top = `${top}px`;
    event.preventDefault();
  };

  #onPointerUp = event => {
    if (!this.#drag || event.pointerId !== this.#drag.pointerId) return;
    this.#drag = null;
    this.#savePreferences();
  };

  #applyPreferences() {
    const p = this.#preferences;
    this.root.dataset.dock = p.dock;
    this.root.dataset.orientation = p.orientation;
    this.root.dataset.size = p.size;
    this.root.style.setProperty("--edit-hud-opacity", String(p.opacity));
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
      group.hidden = p.groups[group.dataset.editHudGroup] === false;
    }
    this.#element("edit-hud-dock").value = p.dock;
    this.#element("edit-hud-orientation").value = p.orientation;
    this.#element("edit-hud-size").value = p.size;
    this.#element("edit-hud-opacity").value = String(p.opacity);
  }

  #loadPreferences() {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
      this.#preferences = {
        ...structuredClone(DEFAULT_PREFERENCES),
        ...stored,
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
      this.refresh();
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
