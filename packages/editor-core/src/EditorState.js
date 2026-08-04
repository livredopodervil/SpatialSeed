import { Selection } from "./Selection.js?build=20260729-0039g2";

export class EditorState {
  static apiVersion = "editor-state-v2";
  #listeners = new Set();

  constructor() {
    this.selection = new Selection();
    this.tool = { type: "interaction", mode: "select", transformMode: "translate" };
    this.selectionOperation = "replace";
    this.areaSelection = false;
    this.selectionGestureMode = "rectangle";
    this.selectionBrushRadius = 24;
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
    const nextTool = {
      type: ["navigate", "select"].includes(mode) ? "interaction" : "transform",
      mode,
      transformMode
    };
    const unchanged =
      this.tool.type === nextTool.type &&
      this.tool.mode === nextTool.mode &&
      this.tool.transformMode === nextTool.transformMode &&
      this.pivot.editing === false;
    if (unchanged) return false;
    this.tool = nextTool;
    if (this.pivot.editing) {
      this.pivot = { ...this.pivot, editing: false };
    }
    this.#emit("tool");
    return true;
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

  setSelectionGesture({
    mode = this.selectionGestureMode,
    radiusPixels = this.selectionBrushRadius,
    enabled = true
  } = {}) {
    const normalizedMode = String(mode ?? "").trim().toLowerCase();
    const allowed = new Set(["rectangle", "brush", "lasso", "eraser"]);
    if (!allowed.has(normalizedMode)) {
      throw new RangeError(`Unknown selection gesture: ${mode}`);
    }
    const radius = Number(radiusPixels);
    if (!Number.isFinite(radius) || radius < 2 || radius > 128) {
      throw new RangeError("Selection brush radius must be between 2 and 128 pixels.");
    }
    this.selectionGestureMode = normalizedMode;
    this.selectionBrushRadius = radius;
    this.areaSelection = Boolean(enabled);
    this.#emit("selection-gesture");
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
    const editing = Boolean(enabled);
    if (this.pivot.editing === editing) return false;
    this.pivot = { ...this.pivot, editing };
    this.#emit("pivot-editing");
    return true;
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
      selectionGestureMode: this.selectionGestureMode,
      selectionBrushRadius: this.selectionBrushRadius,
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
