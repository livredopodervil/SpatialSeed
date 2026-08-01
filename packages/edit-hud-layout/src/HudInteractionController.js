import {
  itemAtPoint,
  sectionAtPoint
} from "./HudDomLayout.js?build=20260801-0046b";

const LONG_PRESS_MS = 560;
const MOVE_TOLERANCE = 9;

export class HudInteractionController {
  static apiVersion = "hud-interaction-controller-v1";

  #root;
  #store;
  #execute;
  #openItemEditor;
  #descriptors;
  #pointer = null;
  #longPressTimer = null;
  #customActive = new Set();
  #suppressClickUntil = 0;
  #listeners = [];

  constructor({
    root,
    store,
    descriptors = [],
    execute = null,
    openItemEditor = null
  } = {}) {
    if (!root) throw new TypeError("HudInteractionController exige root.");
    if (!store) throw new TypeError("HudInteractionController exige store.");
    this.#root = root;
    this.#store = store;
    this.#execute = typeof execute === "function" ? execute : null;
    this.#openItemEditor = typeof openItemEditor === "function"
      ? openItemEditor
      : null;
    this.#descriptors = new Map(descriptors.map(descriptor => [descriptor.id, descriptor]));
    this.#bind();
  }

  dispose() {
    this.#clearLongPress();
    for (const [type, listener, options] of this.#listeners) {
      this.#root.removeEventListener(type, listener, options);
    }
    this.#listeners.length = 0;
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
    const itemElement = event.target?.closest?.("[data-hud-item]");
    if (!itemElement || itemElement.closest(".hud-customizer")) return;
    const itemId = itemElement.dataset.hudItem;
    if (!this.#descriptors.has(itemId)) return;
    this.#clearLongPress();
    this.#pointer = {
      pointerId: event.pointerId,
      itemId,
      element: itemElement,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      longPressed: false,
      moved: false,
      targetSection: null,
      targetItem: null
    };
    this.#longPressTimer = globalThis.setTimeout?.(() => {
      if (!this.#pointer) return;
      this.#pointer.longPressed = true;
      itemElement.dataset.hudDirectCustomize = "true";
      itemElement.setPointerCapture?.(event.pointerId);
      globalThis.navigator?.vibrate?.(22);
    }, LONG_PRESS_MS) ?? null;
  };

  #onPointerMove = event => {
    const pointer = this.#pointer;
    if (!pointer || pointer.pointerId !== event.pointerId) return;
    pointer.lastX = event.clientX;
    pointer.lastY = event.clientY;
    const distance = Math.hypot(
      event.clientX - pointer.startX,
      event.clientY - pointer.startY
    );
    if (!pointer.longPressed) {
      if (distance > MOVE_TOLERANCE) {
        this.#clearLongPress();
        this.#pointer = null;
      }
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    pointer.moved ||= distance > MOVE_TOLERANCE;
    if (!pointer.moved) return;
    const section = sectionAtPoint(this.#root, event.clientX, event.clientY);
    const item = itemAtPoint(this.#root, event.clientX, event.clientY);
    pointer.targetSection = section;
    pointer.targetItem = item === pointer.itemId ? null : item;
    this.#root.dataset.hudDraggingItem = pointer.itemId;
    for (const group of this.#root.querySelectorAll("[data-edit-hud-group]")) {
      group.dataset.hudDropTarget = group.dataset.editHudGroup === section
        ? "true"
        : "false";
    }
  };

  #onPointerUp = event => {
    const pointer = this.#pointer;
    if (!pointer || pointer.pointerId !== event.pointerId) return;
    this.#clearLongPress();
    this.#clearDragMarkers();
    pointer.element.releasePointerCapture?.(event.pointerId);
    if (pointer.longPressed) {
      event.preventDefault();
      event.stopPropagation();
      this.#suppressClickUntil = performanceNow() + 750;
      if (pointer.moved && pointer.targetSection) {
        this.#store.placeItem(pointer.itemId, {
          section: pointer.targetSection,
          before: pointer.targetItem
        });
      } else {
        this.#openItemEditor?.(pointer.itemId);
      }
    }
    pointer.element.dataset.hudDirectCustomize = "false";
    this.#pointer = null;
  };

  #onPointerCancel = event => {
    if (!this.#pointer || this.#pointer.pointerId !== event.pointerId) return;
    this.#pointer.element.dataset.hudDirectCustomize = "false";
    this.#pointer = null;
    this.#clearLongPress();
    this.#clearDragMarkers();
  };

  #onClickCapture = event => {
    const itemElement = event.target?.closest?.("[data-hud-item]");
    if (!itemElement || itemElement.closest(".hud-customizer")) return;
    if (performanceNow() < this.#suppressClickUntil) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    const itemId = itemElement.dataset.hudItem;
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

  #applyActivation(itemId, policy, { nativeWasAllowed }) {
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

  #clearDragMarkers() {
    delete this.#root.dataset.hudDraggingItem;
    for (const group of this.#root.querySelectorAll("[data-hud-drop-target]")) {
      delete group.dataset.hudDropTarget;
    }
  }
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
