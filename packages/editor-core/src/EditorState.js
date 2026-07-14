import { Selection } from "./Selection.js?build=20260711-0014";

export class EditorState {
  static apiVersion = "editor-state-v2";
  #listeners = new Set();

  constructor() {
    this.selection = new Selection();
    this.tool = { type: "interaction", mode: "select", transformMode: "translate" };
    this.selectionOperation = "replace";
    this.areaSelection = false;
    this.multiSelect = false;
    this.pivot = {
      policy: "median",
      editing: false,
      reference: "absolute",
      customPosition: [0, 0, 0],
      relativeOffset: [0, 0, 0]
    };
  }

  setToolMode(mode) {
    const allowed = new Set(["navigate", "select", "translate", "rotate", "scale"]);
    if (!allowed.has(mode)) throw new RangeError(`Unknown tool mode: ${mode}`);
    const transformMode = ["translate", "rotate", "scale"].includes(mode)
      ? mode : this.tool.transformMode;
    this.tool = {
      type: ["navigate", "select"].includes(mode) ? "interaction" : "transform",
      mode,
      transformMode
    };
    this.#emit("tool");
  }

  setSelectionOperation(operation) {
    const allowed = new Set(["replace", "add", "remove", "toggle"]);
    if (!allowed.has(operation)) throw new RangeError(`Unknown selection operation: ${operation}`);
    this.selectionOperation = operation;
    this.#emit("selection-operation");
  }

  setAreaSelection(enabled) {
    this.areaSelection = Boolean(enabled);
    this.#emit("area-selection");
  }

  setMultiSelect(enabled) {
    this.multiSelect = Boolean(enabled);
    this.#emit("multi-select");
  }

  setPivotPolicy(policy) {
    const allowed = new Set(["median", "bounds", "active", "custom"]);
    if (!allowed.has(policy)) throw new RangeError(`Unknown pivot policy: ${policy}`);
    this.pivot = {
      ...this.pivot,
      policy,
      editing: false
    };
    this.selection.pivotPolicy = policy;
    this.selection.notifyContextChanged();
    this.#emit("pivot-policy");
  }

  setPivotEditing(enabled) {
    this.pivot = { ...this.pivot, editing: Boolean(enabled) };
    this.#emit("pivot-editing");
  }

  setCustomPivot(position) {
    this.pivot = {
      ...this.pivot,
      policy: "custom",
      reference: "absolute",
      customPosition: [...position],
      relativeOffset: [0, 0, 0]
    };
    this.selection.pivotPolicy = "custom";
    this.selection.notifyContextChanged();
    this.#emit("pivot-position");
  }

  setRelativePivot(offset) {
    this.pivot = {
      ...this.pivot,
      policy: "custom",
      reference: "active-relative",
      relativeOffset: [...offset]
    };
    this.selection.pivotPolicy = "custom";
    this.selection.notifyContextChanged();
    this.#emit("pivot-relative");
  }

  subscribe(listener) {
    this.#listeners.add(listener);
    listener(this.snapshot(), { type: "initial" });
    return () => this.#listeners.delete(listener);
  }

  snapshot() {
    return Object.freeze({
      tool: { ...this.tool },
      selectionOperation: this.selectionOperation,
      areaSelection: this.areaSelection,
      multiSelect: this.multiSelect,
      pivot: {
        ...this.pivot,
        customPosition: [...this.pivot.customPosition],
        relativeOffset: [...this.pivot.relativeOffset]
      }
    });
  }

  #emit(type) {
    const snapshot = this.snapshot();
    for (const listener of this.#listeners) {
      try { listener(snapshot, { type }); }
      catch (error) { console.error("EditorState subscriber failed", error); }
    }
  }
}
