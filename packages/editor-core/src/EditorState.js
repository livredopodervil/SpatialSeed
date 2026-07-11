import { Selection } from "./Selection.js";

export class EditorState {
  #listeners = new Set();

  constructor() {
    this.selection = new Selection();
    this.tool = {
      type: "transform",
      mode: "translate"
    };
    this.multiSelect = false;
    this.pivot = {
      policy: "median",
      editing: false,
      customPosition: [0, 0, 0]
    };
  }

  setToolMode(mode) {
    this.tool = {
      ...this.tool,
      mode
    };
    this.#emit("tool");
  }

  setMultiSelect(enabled) {
    this.multiSelect = Boolean(enabled);
    this.#emit("multi-select");
  }

  setPivotPolicy(policy) {
    const allowed = new Set([
      "median",
      "bounds",
      "active",
      "custom"
    ]);
    if (!allowed.has(policy)) {
      throw new RangeError(`Unknown pivot policy: ${policy}`);
    }
    this.pivot = {
      ...this.pivot,
      policy
    };
    this.selection.pivotPolicy = policy;
    this.selection.notifyContextChanged();
    this.#emit("pivot-policy");
  }

  setPivotEditing(enabled) {
    this.pivot = {
      ...this.pivot,
      editing: Boolean(enabled)
    };
    this.#emit("pivot-editing");
  }

  setCustomPivot(position) {
    this.pivot = {
      ...this.pivot,
      customPosition: [...position]
    };
    this.#emit("pivot-position");
  }

  subscribe(listener) {
    this.#listeners.add(listener);
    listener(this.snapshot(), { type: "initial" });
    return () => this.#listeners.delete(listener);
  }

  snapshot() {
    return Object.freeze({
      tool: { ...this.tool },
      multiSelect: this.multiSelect,
      pivot: {
        ...this.pivot,
        customPosition: [...this.pivot.customPosition]
      }
    });
  }

  #emit(type) {
    const snapshot = this.snapshot();
    for (const listener of this.#listeners) {
      try {
        listener(snapshot, { type });
      } catch (error) {
        console.error("EditorState subscriber failed", error);
      }
    }
  }
}
