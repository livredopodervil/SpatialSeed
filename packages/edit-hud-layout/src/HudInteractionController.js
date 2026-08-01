import {
  itemAtPoint,
  sectionAtPoint
} from "./HudDomLayout.js?build=20260801-0046c";

const LONG_PRESS_MS = 460;
const MOVE_TOLERANCE = 7;
const RESIZE_HIT_SIZE = 13;

export class HudInteractionController {
  static apiVersion = "hud-interaction-controller-v2";

  #root;
  #store;
  #execute;
  #openItemEditor;
  #openSectionEditor;
  #descriptors;
  #pointer = null;
  #longPressTimer = null;
  #customActive = new Set();
  #suppressClickUntil = 0;
  #listeners = [];
  #organizing = false;
  #ghost = null;
  #doneButton = null;

  constructor({
    root,
    store,
    descriptors = [],
    execute = null,
    openItemEditor = null,
    openSectionEditor = null
  } = {}) {
    if (!root) throw new TypeError("HudInteractionController exige root.");
    if (!store) throw new TypeError("HudInteractionController exige store.");
    this.#root = root;
    this.#store = store;
    this.#execute = typeof execute === "function" ? execute : null;
    this.#openItemEditor = typeof openItemEditor === "function"
      ? openItemEditor
      : null;
    this.#openSectionEditor = typeof openSectionEditor === "function"
      ? openSectionEditor
      : null;
    this.#descriptors = new Map(descriptors.map(descriptor => [descriptor.id, descriptor]));
    this.#installDoneButton();
    this.#bind();
  }

  dispose() {
    this.#clearPointer();
    for (const [type, listener, options] of this.#listeners) {
      this.#root.removeEventListener(type, listener, options);
    }
    this.#listeners.length = 0;
    this.#doneButton?.remove?.();
  }

  organizing() {
    return this.#organizing;
  }

  setOrganizing(enabled, { focusItem = null } = {}) {
    this.#organizing = Boolean(enabled);
    this.#root.dataset.hudOrganizing = this.#organizing ? "true" : "false";
    if (this.#doneButton) this.#doneButton.hidden = !this.#organizing;
    if (focusItem) {
      for (const element of this.#root.querySelectorAll("[data-hud-organize-focus]")) {
        delete element.dataset.hudOrganizeFocus;
      }
      const descriptor = this.#descriptors.get(focusItem);
      if (descriptor?.element) descriptor.element.dataset.hudOrganizeFocus = "true";
    }
    if (!this.#organizing) {
      for (const element of this.#root.querySelectorAll("[data-hud-organize-focus]")) {
        delete element.dataset.hudOrganizeFocus;
      }
    }
  }

  synchronizeNativeState() {
    const profile = this.#store.profile();
    for (const [itemId, descriptor] of this.#descriptors) {
      const nativeActive = readNativeActive(descriptor.element);
      if (nativeActive) this.#customActive.add(itemId);
      else if (profile.items[itemId]?.activation?.mode === "native") {
        this.#customActive.delete(itemId);
      }
      this.#applyVisualActive(itemId);
    }
  }

  #installDoneButton() {
    const handle = this.#root.querySelector(".edit-hud-handle");
    if (!handle) return;
    const button = handle.ownerDocument.createElement("button");
    button.type = "button";
    button.className = "hud-organize-done";
    button.textContent = "✓";
    button.title = "Concluir organização do HUD";
    button.hidden = true;
    button.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      this.setOrganizing(false);
    });
    handle.insertBefore(button, handle.querySelector(".edit-hud-config") ?? null);
    this.#doneButton = button;
  }

  #bind() {
    this.#listen("pointerdown", this.#onPointerDown, { capture: true });
    this.#listen("pointermove", this.#onPointerMove, { capture: true });
    this.#listen("pointerup", this.#onPointerUp, { capture: true });
    this.#listen("pointercancel", this.#onPointerCancel, { capture: true });
    this.#listen("click", this.#onClickCapture, { capture: true });
  }

  #listen(type, listener, options) {
    this.#root.addEventListener(type, listener, options);
    this.#listeners.push([type, listener, options]);
  }

  #onPointerDown = event => {
    if (event.button !== undefined && event.button !== 0) return;
    if (event.target?.closest?.(".hud-customizer")) return;

    const sectionResize = event.target?.closest?.("[data-hud-section-resize]");
    if (sectionResize) {
      const group = sectionResize.closest("[data-edit-hud-group]");
      if (group) this.#beginSectionResize(event, group);
      return;
    }

    const sectionHandle = event.target?.closest?.("[data-hud-section-drag-handle]");
    if (sectionHandle) {
      const group = sectionHandle.closest("[data-edit-hud-group]");
      if (group) this.#beginSectionDrag(event, group);
      return;
    }

    const itemElement = event.target?.closest?.("[data-hud-item]");
    if (!itemElement) return;
    const itemId = itemElement.dataset.hudItem;
    if (!this.#descriptors.has(itemId)) return;

    const rect = itemElement.getBoundingClientRect();
    const resizeHit = this.#organizing &&
      event.clientX >= rect.right - RESIZE_HIT_SIZE &&
      event.clientY >= rect.bottom - RESIZE_HIT_SIZE;
    if (resizeHit) {
      this.#beginItemResize(event, itemElement, itemId);
      return;
    }

    this.#clearPointer();
    this.#pointer = {
      kind: "item-drag",
      pointerId: event.pointerId,
      itemId,
      element: itemElement,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      armed: this.#organizing,
      moved: false,
      targetSection: null,
      targetItem: null
    };
    if (this.#organizing) {
      itemElement.setPointerCapture?.(event.pointerId);
      event.preventDefault();
      return;
    }
    this.#longPressTimer = globalThis.setTimeout?.(() => {
      const pointer = this.#pointer;
      if (!pointer || pointer.pointerId !== event.pointerId) return;
      pointer.armed = true;
      this.setOrganizing(true, { focusItem: itemId });
      itemElement.setPointerCapture?.(event.pointerId);
      globalThis.navigator?.vibrate?.(22);
    }, LONG_PRESS_MS) ?? null;
  };

  #beginSectionDrag(event, group) {
    this.#clearPointer();
    this.setOrganizing(true);
    this.#pointer = {
      kind: "section-drag",
      pointerId: event.pointerId,
      sectionId: group.dataset.editHudGroup,
      element: group,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      armed: true,
      moved: false,
      targetSection: null
    };
    group.setPointerCapture?.(event.pointerId);
    event.preventDefault();
    event.stopPropagation();
  }

  #beginSectionResize(event, group) {
    this.#clearPointer();
    this.setOrganizing(true);
    const sectionId = group.dataset.editHudGroup;
    const policy = this.#store.profile().sections[sectionId] ?? {};
    this.#pointer = {
      kind: "section-resize",
      pointerId: event.pointerId,
      sectionId,
      element: group,
      startX: event.clientX,
      startY: event.clientY,
      startColumns: Math.max(1, Number(policy.columns) || 1),
      startRows: Math.max(1, Number(policy.rows) || 1),
      columns: Math.max(1, Number(policy.columns) || 1),
      rows: Math.max(1, Number(policy.rows) || 1),
      pitch: hudCellPitch(this.#root)
    };
    group.setPointerCapture?.(event.pointerId);
    event.preventDefault();
    event.stopPropagation();
  }

  #beginItemResize(event, element, itemId) {
    this.#clearPointer();
    const policy = this.#store.profile().items[itemId] ?? {};
    this.#pointer = {
      kind: "item-resize",
      pointerId: event.pointerId,
      itemId,
      element,
      startX: event.clientX,
      startY: event.clientY,
      startWidth: Math.max(1, Number(policy.cellWidth) || 1),
      startHeight: Math.max(1, Number(policy.cellHeight) || 1),
      width: Math.max(1, Number(policy.cellWidth) || 1),
      height: Math.max(1, Number(policy.cellHeight) || 1),
      pitch: hudCellPitch(this.#root)
    };
    element.setPointerCapture?.(event.pointerId);
    event.preventDefault();
    event.stopPropagation();
  }

  #onPointerMove = event => {
    const pointer = this.#pointer;
    if (!pointer || pointer.pointerId !== event.pointerId) return;
    pointer.lastX = event.clientX;
    pointer.lastY = event.clientY;

    if (pointer.kind === "section-resize") {
      pointer.columns = Math.max(1, pointer.startColumns + Math.round(
        (event.clientX - pointer.startX) / pointer.pitch
      ));
      pointer.rows = Math.max(1, pointer.startRows + Math.round(
        (event.clientY - pointer.startY) / pointer.pitch
      ));
      previewSectionSize(pointer.element, pointer.columns, pointer.rows);
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (pointer.kind === "item-resize") {
      pointer.width = Math.max(1, pointer.startWidth + Math.round(
        (event.clientX - pointer.startX) / pointer.pitch
      ));
      pointer.height = Math.max(1, pointer.startHeight + Math.round(
        (event.clientY - pointer.startY) / pointer.pitch
      ));
      pointer.element.style.gridColumn = `span ${pointer.width}`;
      pointer.element.style.gridRow = `span ${pointer.height}`;
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    const distance = Math.hypot(
      event.clientX - pointer.startX,
      event.clientY - pointer.startY
    );
    if (!pointer.armed) {
      if (distance > MOVE_TOLERANCE) {
        this.#clearLongPress();
        this.#pointer = null;
      }
      return;
    }
    if (distance <= MOVE_TOLERANCE && !pointer.moved) return;
    pointer.moved = true;
    this.#ensureGhost(pointer);
    this.#moveGhost(event.clientX, event.clientY);
    pointer.element.dataset.hudDragSource = "true";
    event.preventDefault();
    event.stopPropagation();

    if (pointer.kind === "item-drag") {
      pointer.targetSection = sectionAtPoint(this.#root, event.clientX, event.clientY);
      const targetItem = itemAtPoint(this.#root, event.clientX, event.clientY);
      pointer.targetItem = targetItem === pointer.itemId ? null : targetItem;
      this.#markDropTargets(pointer.targetSection, pointer.targetItem);
    } else if (pointer.kind === "section-drag") {
      const target = sectionAtPoint(this.#root, event.clientX, event.clientY);
      pointer.targetSection = target === pointer.sectionId ? null : target;
      this.#markDropTargets(pointer.targetSection, null);
    }
  };

  #onPointerUp = event => {
    const pointer = this.#pointer;
    if (!pointer || pointer.pointerId !== event.pointerId) return;
    this.#clearLongPress();
    pointer.element.releasePointerCapture?.(event.pointerId);

    if (pointer.kind === "section-resize") {
      this.#store.updateSection(pointer.sectionId, {
        columns: pointer.columns,
        rows: pointer.rows
      });
    } else if (pointer.kind === "item-resize") {
      this.#store.updateItem(pointer.itemId, {
        cellWidth: pointer.width,
        cellHeight: pointer.height
      });
    } else if (pointer.kind === "item-drag" && pointer.armed) {
      this.#suppressClickUntil = performanceNow() + 750;
      if (pointer.moved && pointer.targetSection) {
        this.#store.placeItem(pointer.itemId, {
          section: pointer.targetSection,
          before: pointer.targetItem
        });
      } else {
        this.#openItemEditor?.(pointer.itemId);
      }
    } else if (pointer.kind === "section-drag") {
      this.#suppressClickUntil = performanceNow() + 500;
      if (pointer.moved && pointer.targetSection) {
        this.#store.placeSection(pointer.sectionId, {
          before: pointer.targetSection
        });
      } else {
        this.#openSectionEditor?.(pointer.sectionId);
      }
    }

    if (pointer.armed || pointer.kind !== "item-drag") {
      event.preventDefault();
      event.stopPropagation();
    }
    this.#clearPointer();
  };

  #onPointerCancel = event => {
    if (!this.#pointer || this.#pointer.pointerId !== event.pointerId) return;
    this.#clearPointer();
  };

  #onClickCapture = event => {
    if (event.target?.closest?.(".hud-organize-done")) return;
    const itemElement = event.target?.closest?.("[data-hud-item]");
    if (!itemElement || itemElement.closest(".hud-customizer")) return;
    if (performanceNow() < this.#suppressClickUntil) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    const itemId = itemElement.dataset.hudItem;
    if (this.#organizing) {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.setOrganizing(true, { focusItem: itemId });
      this.#openItemEditor?.(itemId);
      return;
    }
    const policy = this.#store.profile().items[itemId];
    if (!policy) return;
    const hasOverride = Boolean(policy.command?.id);
    if (hasOverride) {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.#runCommand(policy.command);
      if (policy.activation?.mode === "native") {
        queueMicrotask(() => this.#applyActivation(itemId, policy, {
          nativeWasAllowed: true
        }));
      } else {
        this.#applyActivation(itemId, policy, { nativeWasAllowed: false });
      }
      return;
    }
    if (policy.activation?.mode !== "native" ||
        policy.activation?.activates?.length ||
        policy.activation?.deactivates?.length ||
        policy.activation?.onActivate ||
        policy.activation?.onDeactivate) {
      queueMicrotask(() => this.#applyActivation(itemId, policy, {
        nativeWasAllowed: true
      }));
    }
  };

  #ensureGhost(pointer) {
    if (this.#ghost) return;
    const rect = pointer.element.getBoundingClientRect();
    const ghost = pointer.element.cloneNode(true);
    ghost.removeAttribute?.("id");
    ghost.classList.add("hud-drag-ghost");
    ghost.style.width = `${rect.width}px`;
    ghost.style.height = `${rect.height}px`;
    ghost.style.left = `${rect.left}px`;
    ghost.style.top = `${rect.top}px`;
    ghost.style.setProperty("--hud-drag-offset-x", `${pointer.startX - rect.left}px`);
    ghost.style.setProperty("--hud-drag-offset-y", `${pointer.startY - rect.top}px`);
    this.#root.ownerDocument.body.append(ghost);
    this.#ghost = ghost;
  }

  #moveGhost(x, y) {
    if (!this.#ghost) return;
    this.#ghost.style.left = `calc(${x}px - var(--hud-drag-offset-x))`;
    this.#ghost.style.top = `calc(${y}px - var(--hud-drag-offset-y))`;
  }

  #markDropTargets(sectionId, itemId) {
    for (const group of this.#root.querySelectorAll("[data-edit-hud-group]")) {
      group.dataset.hudDropTarget = group.dataset.editHudGroup === sectionId
        ? "true"
        : "false";
    }
    for (const item of this.#root.querySelectorAll("[data-hud-drop-before]")) {
      delete item.dataset.hudDropBefore;
    }
    if (itemId) {
      const target = this.#descriptors.get(itemId)?.element;
      if (target) target.dataset.hudDropBefore = "true";
    }
  }

  #clearPointer() {
    this.#clearLongPress();
    if (this.#pointer?.element) {
      delete this.#pointer.element.dataset.hudDragSource;
      this.#pointer.element.style.removeProperty("grid-column");
      this.#pointer.element.style.removeProperty("grid-row");
      this.#pointer.element.style.removeProperty("--hud-section-columns");
      this.#pointer.element.style.removeProperty("--hud-section-rows");
    }
    this.#pointer = null;
    this.#ghost?.remove?.();
    this.#ghost = null;
    for (const group of this.#root.querySelectorAll("[data-hud-drop-target]")) {
      delete group.dataset.hudDropTarget;
    }
    for (const item of this.#root.querySelectorAll("[data-hud-drop-before]")) {
      delete item.dataset.hudDropBefore;
    }
  }

  #applyActivation(itemId, policy, { nativeWasAllowed }) {
    void nativeWasAllowed;
    const activation = policy.activation ?? {};
    let active;
    if (activation.mode === "momentary") {
      active = false;
    } else if (activation.mode === "toggle") {
      active = !this.#customActive.has(itemId);
    } else {
      active = readNativeActive(this.#descriptors.get(itemId)?.element);
    }

    if (active) {
      this.#activateItem(itemId, policy);
      const profile = this.#store.profile();
      if (activation.group) {
        for (const [candidateId, candidatePolicy] of Object.entries(profile.items)) {
          if (candidateId !== itemId &&
              candidatePolicy.activation?.group === activation.group) {
            this.#deactivateItem(candidateId, candidatePolicy);
          }
        }
      }
      for (const targetId of activation.deactivates ?? []) {
        this.#deactivateItem(targetId, profile.items[targetId]);
      }
      for (const targetId of activation.activates ?? []) {
        this.#activateItem(targetId, profile.items[targetId]);
      }
    } else {
      const profile = this.#store.profile();
      this.#deactivateItem(itemId, policy);
      for (const targetId of activation.deactivatesOnDeactivate ?? []) {
        this.#deactivateItem(targetId, profile.items[targetId]);
      }
      for (const targetId of activation.activatesOnDeactivate ?? []) {
        this.#activateItem(targetId, profile.items[targetId]);
      }
    }
  }

  #activateItem(itemId, policy) {
    if (!itemId || !policy) return;
    const wasActive = this.#customActive.has(itemId);
    this.#customActive.add(itemId);
    this.#applyVisualActive(itemId);
    if (!wasActive) this.#runCommand(policy.activation?.onActivate);
  }

  #deactivateItem(itemId, policy) {
    if (!itemId || !policy) return;
    const wasActive = this.#customActive.delete(itemId);
    this.#applyVisualActive(itemId);
    if (wasActive) this.#runCommand(policy.activation?.onDeactivate);
  }

  #applyVisualActive(itemId) {
    const element = this.#descriptors.get(itemId)?.element;
    if (!element) return;
    element.dataset.hudProfileActive = this.#customActive.has(itemId)
      ? "true"
      : "false";
  }

  #runCommand(spec) {
    if (!spec?.id || !this.#execute) return null;
    try {
      return this.#execute(spec.id, structuredClone(spec.arguments ?? {}));
    } catch (error) {
      this.#root.dispatchEvent?.(new CustomEvent("spatialseed:hud-command-error", {
        detail: {
          command: spec.id,
          message: error?.message ?? String(error)
        }
      }));
      return null;
    }
  }

  #clearLongPress() {
    if (this.#longPressTimer !== null) {
      globalThis.clearTimeout?.(this.#longPressTimer);
      this.#longPressTimer = null;
    }
  }
}

function previewSectionSize(group, columns, rows) {
  group.style.setProperty("--hud-section-columns", String(columns));
  group.style.setProperty("--hud-section-rows", String(rows));
}

function hudCellPitch(root) {
  const style = globalThis.getComputedStyle?.(root);
  const cell = Number.parseFloat(style?.getPropertyValue("--edit-hud-cell")) || 32;
  return cell + 3;
}

function readNativeActive(element) {
  if (!element) return false;
  if (element.dataset?.active === "true") return true;
  const control = element.matches?.("button, input")
    ? element
    : element.querySelector?.("button, input");
  return control?.dataset?.active === "true" || Boolean(control?.checked);
}

function performanceNow() {
  return globalThis.performance?.now?.() ?? Date.now();
}
