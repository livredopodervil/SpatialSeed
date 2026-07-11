export class CommandHistory {
  constructor(limit = 100) {
    this.limit = limit;
    this.undoStack = [];
    this.redoStack = [];
    this.listeners = new Set();
  }
  execute(command) {
    command.do();
    this.undoStack.push(command);
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack.length = 0;
    this.emit();
  }
  pushExecuted(command) {
    this.undoStack.push(command);
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack.length = 0;
    this.emit();
  }
  undo() {
    const command = this.undoStack.pop();
    if (!command) return;
    command.undo();
    this.redoStack.push(command);
    this.emit();
  }
  redo() {
    const command = this.redoStack.pop();
    if (!command) return;
    command.do();
    this.undoStack.push(command);
    this.emit();
  }
  onChange(listener) {
    this.listeners.add(listener);
    listener(this);
  }
  emit() {
    for (const listener of this.listeners) listener(this);
  }
}
