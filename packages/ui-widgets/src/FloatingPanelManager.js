export class FloatingPanelManager {
  #root;
  #key;
  #z = 40;
  #panels = new Map();
  #restoreStyles = new Map();
  #toolbarLayoutListener;

  constructor({
    root = document,
    storageKey = "spatialseed.ui.layout.v2"
  } = {}) {
    this.#root = root;
    this.#key = storageKey;
    this.#toolbarLayoutListener = event =>
      this.#applyToolbarClearance(
        event.detail?.clearance,
        event.detail?.leftClearance
      );
    this.#root.addEventListener(
      "spatialseed:toolbar-layout",
      this.#toolbarLayoutListener
    );
  }

  register(selector, options = {}) {
    const panel = typeof selector === "string"
      ? this.#root.querySelector(selector)
      : selector;

    if (!panel || this.#panels.has(panel.id)) return panel;

    const handle = panel.querySelector(":scope > header");
    if (!handle) return panel;

    panel.classList.add("ss-floating-panel");
    handle.classList.add("ss-panel-handle");
    panel.style.resize = options.resizable === false ? "none" : "both";
    panel.style.maxHeight =
      "calc(100dvh - var(--ss-toolbar-clearance, 4rem) - .55rem)";
    panel.style.maxWidth =
      "calc(100vw - var(--ss-toolbar-left-clearance, .55rem) - .55rem)";

    if (options.maximizable !== false) {
      const maximize = document.createElement("button");
      maximize.type = "button";
      maximize.className = "ss-panel-maximize";
      maximize.textContent = "⛶";
      maximize.title = "Maximizar painel";
      maximize.setAttribute("aria-label", "Maximizar painel");
      maximize.addEventListener("pointerdown", event => {
        event.stopPropagation();
      });
      maximize.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        this.toggleMaximize(panel);
      });

      const close = handle.querySelector(":scope > button:last-of-type");
      handle.insertBefore(maximize, close ?? null);
    }

    handle.addEventListener(
      "pointerdown",
      event => this.#drag(panel, event)
    );
    panel.addEventListener(
      "pointerdown",
      () => this.bringToFront(panel)
    );

    this.#panels.set(panel.id, panel);
    this.#restore(panel, options.defaultLayout);
    this.bringToFront(panel);

    const observer = new ResizeObserver(() => this.#save(panel));
    observer.observe(panel);
    panel.__ssResizeObserver = observer;
    return panel;
  }

  show(selector) {
    const panel = this.#resolve(selector);
    if (!panel) return null;
    panel.hidden = false;
    this.bringToFront(panel);
    return panel;
  }

  hide(selector) {
    const panel = this.#resolve(selector);
    if (!panel) return false;
    panel.hidden = true;
    return true;
  }

  bringToFront(panel) {
    panel.style.zIndex = String(++this.#z);
  }

  toggleMaximize(selector, forced = null) {
    const panel = this.#resolve(selector);
    if (!panel) return false;

    const maximize =
      forced ?? !panel.classList.contains("ss-panel-maximized");

    if (maximize) {
      if (panel.classList.contains("ss-panel-maximized")) return true;

      this.#restoreStyles.set(panel.id, {
        left: panel.style.left,
        top: panel.style.top,
        right: panel.style.right,
        bottom: panel.style.bottom,
        width: panel.style.width,
        height: panel.style.height,
        resize: panel.style.resize
      });

      panel.classList.add("ss-panel-maximized");
      panel.style.left = "0";
      panel.style.top = "0";
      panel.style.right = "auto";
      panel.style.bottom = "auto";
      panel.style.width = "100vw";
      panel.style.height = "100dvh";
      panel.style.resize = "none";
      this.bringToFront(panel);
    } else {
      const previous = this.#restoreStyles.get(panel.id) ?? {};
      panel.classList.remove("ss-panel-maximized");

      for (const property of [
        "left", "top", "right", "bottom",
        "width", "height", "resize"
      ]) {
        panel.style[property] = previous[property] ?? "";
      }

      this.#restoreStyles.delete(panel.id);
      this.#save(panel);
    }

    const button = panel.querySelector(".ss-panel-maximize");
    if (button) {
      button.textContent = maximize ? "🗗" : "⛶";
      button.title = maximize ? "Restaurar painel" : "Maximizar painel";
      button.setAttribute(
        "aria-label",
        maximize ? "Restaurar painel" : "Maximizar painel"
      );
    }

    panel.dispatchEvent(new CustomEvent(
      "spatialseed:panel-maximize",
      { detail: { maximized: maximize } }
    ));
    return maximize;
  }

  dispose() {
    this.#root.removeEventListener(
      "spatialseed:toolbar-layout",
      this.#toolbarLayoutListener
    );
    for (const panel of this.#panels.values()) {
      panel.__ssResizeObserver?.disconnect();
    }
    this.#panels.clear();
    this.#restoreStyles.clear();
  }

  #resolve(selector) {
    if (!selector) return null;
    if (typeof selector !== "string") return selector;

    return this.#panels.get(selector.replace(/^#/, "")) ??
      this.#root.querySelector(selector);
  }

  #drag(panel, event) {
    if (panel.classList.contains("ss-panel-maximized")) return;
    if (event.target.closest(
      "button,input,select,textarea,label"
    )) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;

    event.preventDefault();
    this.bringToFront(panel);

    const rectangle = panel.getBoundingClientRect();
    const origin = {
      x: event.clientX,
      y: event.clientY,
      left: rectangle.left,
      top: rectangle.top
    };

    panel.style.right = "auto";
    panel.style.bottom = "auto";
    panel.style.left = `${rectangle.left}px`;
    panel.style.top = `${rectangle.top}px`;
    panel.setPointerCapture?.(event.pointerId);

    const move = current => {
      const left = clamp(
        origin.left + current.clientX - origin.x,
        0,
        Math.max(0, innerWidth - panel.offsetWidth)
      );
      const top = clamp(
        origin.top + current.clientY - origin.y,
        0,
        Math.max(0, innerHeight - panel.offsetHeight)
      );
      panel.style.left = `${left}px`;
      panel.style.top = `${top}px`;
    };

    const end = current => {
      panel.releasePointerCapture?.(current.pointerId);
      panel.removeEventListener("pointermove", move);
      panel.removeEventListener("pointerup", end);
      panel.removeEventListener("pointercancel", end);
      this.#save(panel);
    };

    panel.addEventListener("pointermove", move);
    panel.addEventListener("pointerup", end);
    panel.addEventListener("pointercancel", end);
  }

  #layout() {
    try {
      return JSON.parse(localStorage.getItem(this.#key) || "{}");
    } catch {
      return {};
    }
  }

  #save(panel) {
    if (
      panel.hidden ||
      panel.classList.contains("ss-panel-maximized")
    ) return;

    const rectangle = panel.getBoundingClientRect();
    if (rectangle.width < 1 || rectangle.height < 1) return;

    const layout = this.#layout();
    layout[panel.id] = {
      left: Math.round(rectangle.left),
      top: Math.round(rectangle.top),
      width: Math.round(rectangle.width),
      height: Math.round(rectangle.height)
    };

    try {
      localStorage.setItem(this.#key, JSON.stringify(layout));
    } catch {}
  }

  #restore(panel, defaultLayout = null) {
    const saved = this.#layout()[panel.id];
    if (!saved && !defaultLayout) return;

    if (!saved) {
      this.#applyDefaultLayout(panel, defaultLayout);
      return;
    }

    panel.style.right = "auto";
    panel.style.bottom = "auto";
    const savedLeft = `${clamp(
      saved.left,
      0,
      Math.max(0, innerWidth - 80)
    )}px`;
    panel.style.left =
      `max(var(--ss-toolbar-left-clearance, .55rem), ${savedLeft})`;
    const savedTop = `${clamp(
      saved.top,
      0,
      Math.max(0, innerHeight - 48)
    )}px`;
    panel.style.top = `max(var(--ss-toolbar-clearance, 4rem), ${savedTop})`;
    panel.style.width = `${Math.max(220, saved.width)}px`;
    panel.style.height = `${Math.max(120, saved.height)}px`;
  }

  #applyDefaultLayout(panel, layout) {
    const anchor = layout.anchor === "right" ? "right" : "left";
    const opposite = anchor === "right" ? "left" : "right";
    panel.style[opposite] = "auto";
    panel.style[anchor] = anchor === "left"
      ? "var(--ss-toolbar-left-clearance, .55rem)"
      : ".55rem";

    if (layout.top != null) {
      panel.style.top = layout.top === "toolbar"
        ? "var(--ss-toolbar-clearance, 4rem)"
        : `${layout.top}px`;
      panel.style.bottom = "auto";
    } else if (layout.bottom != null) {
      panel.style.bottom = `${layout.bottom}px`;
      panel.style.top = "auto";
    }

    if (layout.width != null) {
      panel.style.width = `min(${layout.width}px, calc(100vw - 1.1rem))`;
    }
    if (layout.height != null) {
      panel.style.height = `min(${layout.height}px, calc(100dvh - 1.1rem))`;
    }
  }

  #applyToolbarClearance(value, leftValue) {
    const clearance = Number(value);
    const leftClearance = Number(leftValue);
    if (!Number.isFinite(clearance) || !Number.isFinite(leftClearance)) return;

    for (const panel of this.#panels.values()) {
      if (panel.hidden || panel.classList.contains("ss-panel-maximized")) {
        continue;
      }
      const rectangle = panel.getBoundingClientRect();
      if (rectangle.top + 1 < clearance) {
        panel.style.bottom = "auto";
        panel.style.top =
          `max(var(--ss-toolbar-clearance, 0px), ${rectangle.top}px)`;
      }

      if (rectangle.left + 1 < leftClearance) {
        panel.style.right = "auto";
        panel.style.left =
          `max(var(--ss-toolbar-left-clearance, 0px), ${rectangle.left}px)`;
      }
    }
  }
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}
