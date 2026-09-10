import { describeWorkspaceContext, resolveWorkspaceSection, workspaceSectionAvailable } from "./WorkspaceContext.js";

/** Arranges existing surfaces. Never owns or mutates document state. */
export class WorkspaceShell {
  constructor({ root, configuration, panelManager, storage = null, onPanelVisibility = () => {} }) {
    this.root = root;
    this.view = root.defaultView;
    this.configuration = configuration;
    this.layout = configuration.workspace;
    this.panelManager = panelManager;
    this.storageKey = configuration.toolbar.storageKey;
    this.storage = storage;
    this.listeners = [];
    this.context = {};
    this.section = this.readState().section ?? this.layout.defaultSection;
    this.hud = root.getElementById("edit-hud");
    this.strip = this.hud.querySelector(".edit-hud-strip");
    this.modeControl = root.getElementById("workspace-layout");
    this.toolsToggle = root.getElementById("workspace-tools-toggle");
    this.collapsed = this.readState().collapsed ?? (this.view.innerWidth <= 760 || this.view.innerHeight <= 500);
    this.nav = root.createElement("nav");
    this.nav.className = "ss-workspace-sections";
    this.nav.setAttribute("aria-label", "Grupos de ferramentas");
    this.sectionButtons = new Map();
    for (const section of this.layout.sections) {
      const button = root.createElement("button");
      button.type = "button";
      button.textContent = section.label;
      button.dataset.workspaceSection = section.id;
      button.setAttribute("aria-controls", "workspace-tool-content");
      this.listen(button, "click", () => this.selectSection(section.id));
      this.nav.append(button);
      this.sectionButtons.set(section.id, button);
    }
    this.hint = root.createElement("p");
    this.hint.className = "ss-workspace-hint";
    this.hud.insertBefore(this.nav, this.strip);
    this.hud.insertBefore(this.hint, this.strip);
    this.strip.id = "workspace-tool-content";

    // Labels come from the HUD's existing semantic descriptions, including providers.
    this.decorateControls();
    this.observer = new this.view.MutationObserver(() => {
      this.decorateControls();
      this.syncGroups();
    });
    this.observer.observe(this.strip, {
      subtree: true, childList: true, attributes: true,
      attributeFilter: ["hidden", "data-active", "data-hud-hint-title"]
    });
    this.listen(this.modeControl, "change", () => this.setMode(this.modeControl.value));
    this.listen(root.getElementById("workspace-hud-compact"), "click", () => {
      this.setMode("free");
      panelManager.hideAll();
      const size = root.getElementById("edit-hud-size");
      size.value = "compact";
      size.dispatchEvent(new this.view.Event("change", { bubbles: true }));
      root.getElementById("edit-hud-open").focus({ preventScroll: true });
    });
    this.listen(this.toolsToggle, "click", () => {
      this.collapsed = !this.collapsed;
      this.syncCollapsed();
      this.saveState({ collapsed: this.collapsed });
    });
    this.listen(root.getElementById("workspace-status"), "click", () => panelManager.show("#selection-panel"));
    this.listen(root.getElementById("close-selection-panel"), "click", () => panelManager.hide("#selection-panel"));
    this.listen(root, "spatialseed:panel-visibility", event => {
      const { panelId, visible } = event.detail;
      onPanelVisibility(panelId, visible);
      this.syncPanelButtons();
    });
    this.listen(root.getElementById("workspace-help"), "click", () => {
      this.helpOpener = root.activeElement;
      root.getElementById("workspace-help-dialog").showModal();
    });
    this.listen(root.getElementById("workspace-help-dialog"), "close", () => {
      this.helpOpener?.focus?.();
    });
    this.setMode(this.readState().mode ?? this.layout.mode, false);
    this.selectSection(this.section, false);
  }

  listen(target, name, listener) {
    target?.addEventListener(name, listener);
    this.listeners.push(() => target?.removeEventListener(name, listener));
  }

  readState() {
    try {
      const state = JSON.parse(this.storage?.getItem(this.storageKey) || "{}");
      return state?.workspace ?? {};
    } catch { return {}; }
  }

  saveState(patch) {
    try {
      const stored = JSON.parse(this.storage?.getItem(this.storageKey) || "{}");
      const state = stored && typeof stored === "object" && !Array.isArray(stored) ? stored : {};
      this.storage?.setItem(this.storageKey, JSON.stringify({
        ...state, workspace: { ...this.readState(), ...patch }
      }));
    } catch { /* Session remains usable when storage is unavailable. */ }
  }

  setMode(requested, persist = true) {
    this.mode = requested === "guided" && this.layout.sections.length ? "guided" : "free";
    this.root.documentElement.dataset.workspace = this.mode;
    this.modeControl.value = this.mode;
    this.panelManager.setCompactExclusive(true);
    if (this.mode === "guided") this.panelManager.hide("#selection-panel");
    this.syncCollapsed();
    if (persist) this.saveState({ mode: this.mode });
  }

  syncCollapsed() {
    this.hud.dataset.workspaceCollapsed = String(this.collapsed);
    this.toolsToggle.setAttribute("aria-expanded", String(!this.collapsed));
    this.toolsToggle.textContent = this.collapsed ? "Ferramentas ▸" : "Ferramentas ▾";
  }

  selectSection(id, persist = true) {
    const section = resolveWorkspaceSection(this.layout, id, this.context);
    if (!section) return;
    this.section = section.id;
    this.hint.textContent = section.hint;
    for (const description of this.layout.sections) {
      const button = this.sectionButtons.get(description.id);
      button.hidden = !workspaceSectionAvailable(description, this.context);
      button.setAttribute("aria-pressed", String(description.id === this.section));
    }
    this.syncGroups();
    if (persist) this.saveState({ section: this.section });
  }

  syncGroups() {
    const section = this.layout.sections.find(item => item.id === this.section);
    const known = new Set(this.layout.sections.flatMap(item => item.groups));
    for (const group of this.strip.querySelectorAll("[data-edit-hud-group]")) {
      const id = group.dataset.editHudGroup;
      // Unmapped extension components remain reachable in the default section.
      const belongs = section?.groups.includes(id) ||
        (!known.has(id) && this.section === this.layout.defaultSection);
      group.dataset.workspaceHidden = String(!belongs);
      group.style.setProperty("--workspace-group-order", String(section?.groups.indexOf(id) ?? 0));
    }
  }

  decorateControls() {
    for (const control of this.strip.querySelectorAll("button, label")) {
      const label = control.dataset.hudHintTitle || control.getAttribute("aria-label") || control.title;
      if (label) control.dataset.workspaceLabel = label;
      if (control.tagName === "BUTTON" && control.dataset.active != null) {
        control.setAttribute("aria-pressed", control.dataset.active === "true" ? "true" : "false");
      }
    }
  }

  syncPanelButtons() {
    const pairs = {
      "geometry-create": "geometry-create-panel", "inspector": "inspector-panel",
      "mesh-editor": "mesh-edit-panel", "animation": "animation-panel", "structure": "outline",
      "console": "console-panel", "diagnostics": "diagnostic-panel", "developer": "developer-panel",
      "camera-settings": "camera-panel", "viewer-render-settings": "viewer-render-panel",
      "procedure-editor": "procedure-editor-panel", "experiment-lab": "experiment-panel"
    };
    for (const [controlId, panelId] of Object.entries(pairs)) {
      const control = this.root.getElementById(controlId);
      const panel = this.root.getElementById(panelId);
      control?.setAttribute("aria-controls", panelId);
      control?.setAttribute("aria-expanded", String(!panel?.hidden));
    }
  }

  update(snapshot) {
    const previous = this.context;
    this.context = describeWorkspaceContext(snapshot);
    const output = this.root.getElementById("workspace-context");
    const text = `${this.context.label} · ${this.context.toolLabel}${this.context.selectionCount && !this.context.meshActive ? ` · ${this.context.pivotLabel}` : ""}`;
    if (output.textContent !== text) output.textContent = text;
    let requested = this.section;
    if (this.context.meshActive && !previous.meshActive) requested = "mesh";
    else if (!this.context.meshActive && previous.meshActive) requested = this.layout.defaultSection;
    else if (!this.context.meshActive && previous.toolLabel !== this.context.toolLabel && /^(Mover|Girar|Escalar)/.test(this.context.toolLabel)) requested = "transform";
    this.selectSection(requested, false);
    this.syncPanelButtons();
  }

  dispose() {
    this.observer.disconnect();
    this.listeners.forEach(dispose => dispose());
    this.nav.remove();
    this.hint.remove();
    this.panelManager.setCompactExclusive(false);
    delete this.root.documentElement.dataset.workspace;
  }
}
