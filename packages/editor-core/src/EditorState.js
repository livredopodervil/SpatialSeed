import { Selection } from "./Selection.js";

export class EditorState {
  constructor() {
    this.selection = new Selection();
    this.tool = {
      type: "transform",
      mode: "translate"
    };
    this.multiSelect = false;
  }

  setToolMode(mode) {
    this.tool = {
      ...this.tool,
      mode
    };
  }

  setMultiSelect(enabled) {
    this.multiSelect = Boolean(enabled);
  }
}
