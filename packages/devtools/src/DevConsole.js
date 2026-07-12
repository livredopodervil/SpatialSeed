export class DevConsole {
  static apiVersion = "dev-console-v3";

  static commandNames = new Set([
    "help", "inspect", "list", "select", "clear",
    "pivot", "move", "position", "rotate", "scale",
    "create", "undo", "redo", "gizmo", "snap",
    "vertices", "duplicate", "repeat", "delete"
  ]);

  constructor({
    editor,
    sandbox,
    region,
    renderer,
    getDiagnostics,
    onOutput,
    selectionOperations
  }) {
    this.editor = editor;
    this.sandbox = sandbox;
    this.region = region;
    this.renderer = renderer;
    this.getDiagnostics = getDiagnostics;
    this.onOutput = onOutput;
    this.selectionOperations = selectionOperations;
    this.history = [];
  }

  execute(source) {
    const input = String(source ?? "").trim();
    if (!input) return [];

    const lines = input
      .split(/[;\n]+/)
      .map(line => line.trim())
      .filter(Boolean);

    const results = [];

    for (const line of lines) {
      try {
        const result = this.#executeLine(line);
        const entry = {
          timestamp: new Date().toISOString(),
          input: line,
          ok: true,
          result
        };

        this.history.push(entry);
        results.push(entry);
        this.onOutput?.({ type: "result", input: line, result });
      } catch (error) {
        const entry = {
          timestamp: new Date().toISOString(),
          input: line,
          ok: false,
          error: error?.message ?? String(error)
        };

        this.history.push(entry);
        results.push(entry);
        this.onOutput?.({
          type: "error",
          input: line,
          error: entry.error
        });
      }
    }

    return results;
  }

  #executeLine(line) {
    const tokens = this.#tokenize(line);
    const command = tokens.shift()?.toLowerCase();

    switch (command) {
      case "help":
        this.#expectMaximum(tokens, 0, "help");
        return this.#help();

      case "inspect":
        this.#expectMaximum(tokens, 1, "inspect");
        return this.#inspect(tokens[0]);

      case "list":
        this.#expectExact(tokens, 1, "list objects");
        if (tokens[0] !== "objects") throw new Error("Uso: list objects");
        return this.sandbox.getState().objects;

      case "select":
        return this.#select(tokens);

      case "clear":
        this.#expectMaximum(tokens, 0, "clear");
        this.editor.selection.clear();
        return { selection: [] };

      case "create":
        return this.#create(tokens);

      case "position":
        this.#expectExact(tokens, 3, "position x y z");
        return this.selectionOperations.setSelectionPosition(
          tokens.map(value => this.#number(value))
        );

      case "move":
        this.#expectExact(tokens, 3, "move dx dy dz");
        return this.selectionOperations.translate(
          tokens.map(value => this.#number(value))
        );

      case "rotate":
        this.#expectExact(tokens, 3, "rotate xDeg yDeg zDeg");
        return this.selectionOperations.rotateEuler(
          tokens.map(value => this.#number(value))
        );

      case "scale":
        this.#expectExact(tokens, 3, "scale sx sy sz");
        return this.selectionOperations.scaleBy(
          tokens.map(value => this.#positive(value))
        );

      case "pivot":
        return this.#pivot(tokens);

      case "duplicate":
        this.#expectMaximum(tokens, 0, "duplicate");
        return this.selectionOperations.duplicate();

      case "repeat":
        this.#expectMaximum(tokens, 0, "repeat");
        return this.selectionOperations.repeat();

      case "delete":
        this.#expectMaximum(tokens, 0, "delete");
        return this.selectionOperations.deleteSelection();

      case "undo":
        this.#expectMaximum(tokens, 0, "undo");
        return { changed: this.sandbox.undo() };

      case "redo":
        this.#expectMaximum(tokens, 0, "redo");
        return { changed: this.sandbox.redo() };

      case "gizmo":
        this.#expectMaximum(tokens, 0, "gizmo");
        return this.renderer.getTransformDiagnostics();

      case "snap":
        return this.#snap(tokens);

      case "vertices":
        return this.#vertices(tokens);

      default:
        throw new Error(
          `Comando desconhecido: ${command || "(vazio)"}. Use help.`
        );
    }
  }

  #help() {
    return {
      syntax:
        "Separe comandos por ponto e vírgula ou por quebra de linha.",
      commands: [
        "create box",
        "create box x y z",
        "position x y z",
        "move dx dy dz",
        "rotate xDeg yDeg zDeg",
        "scale sx sy sz",
        "duplicate",
        "repeat",
        "delete",
        "pivot median",
        "pivot bounds",
        "pivot active",
        "pivot absolute x y z",
        "pivot relative dx dy dz",
        "select object-id [object-id ...]",
        "clear",
        "list objects",
        "inspect selection|input|editor|sandbox|region|objects",
        "snap move|rotate|scale valor",
        "snap grid on|off",
        "vertices on|off",
        "gizmo",
        "undo",
        "redo"
      ]
    };
  }

  #create(tokens) {
    if (tokens.shift()?.toLowerCase() !== "box") {
      throw new Error("Uso: create box [x y z]");
    }

    if (tokens.length === 0) {
      return this.selectionOperations.createBox();
    }

    this.#expectExact(tokens, 3, "create box x y z");

    return this.selectionOperations.createBox({
      position: tokens.map(value => this.#number(value))
    });
  }

  #pivot(tokens) {
    const mode = tokens.shift();

    if (!mode) return this.editor.snapshot().pivot;

    if (["median", "bounds", "active"].includes(mode)) {
      this.#expectMaximum(tokens, 0, `pivot ${mode}`);
      this.editor.setPivotEditing(false);
      this.editor.setPivotPolicy(mode);
      return this.editor.snapshot().pivot;
    }

    if (mode === "absolute" || mode === "custom") {
      this.#expectExact(tokens, 3, `pivot ${mode} x y z`);
      return this.selectionOperations.setPivotAbsolute(
        tokens.map(value => this.#number(value))
      );
    }

    if (mode === "relative") {
      this.#expectExact(tokens, 3, "pivot relative dx dy dz");
      return this.selectionOperations.setPivotRelative(
        tokens.map(value => this.#number(value))
      );
    }

    throw new Error(
      "Uso: pivot median|bounds|active|absolute|relative"
    );
  }

  #inspect(target = "all") {
    switch (target) {
      case "selection":
        return this.editor.selection.snapshot();
      case "input":
        return this.renderer.getInputDiagnostics();
      case "editor":
        return this.editor.snapshot();
      case "sandbox":
        return {
          baseVersion: this.sandbox.baseVersion,
          dirty: this.sandbox.dirty,
          canUndo: this.sandbox.canUndo,
          canRedo: this.sandbox.canRedo,
          state: this.sandbox.getState()
        };
      case "region":
        return {
          descriptor: this.region.descriptor,
          version: this.region.version,
          state: this.region.getState()
        };
      case "objects":
        return this.sandbox.getState().objects;
      case "all":
      case undefined:
        return this.getDiagnostics();
      default:
        throw new Error(
          "Uso: inspect selection|input|editor|sandbox|region|objects"
        );
    }
  }

  #select(ids) {
    if (!ids.length) {
      throw new Error("Uso: select object-id [object-id ...]");
    }

    const known = new Set(
      this.sandbox.getState().objects.map(object => object.id)
    );

    for (const id of ids) {
      if (!known.has(id)) throw new Error(`Objeto inexistente: ${id}`);
    }

    this.editor.selection.replace({
      kind: "object",
      regionId: this.region.descriptor.id,
      objectId: ids[0]
    });

    for (const id of ids.slice(1)) {
      this.editor.selection.toggle({
        kind: "object",
        regionId: this.region.descriptor.id,
        objectId: id
      });
    }

    return this.editor.selection.snapshot();
  }

  #snap(tokens) {
    this.#expectExact(tokens, 2, "snap move|rotate|scale|grid valor");

    const [kind, value] = tokens;

    if (kind === "grid") {
      if (!["on", "off"].includes(value)) {
        throw new Error("Uso: snap grid on|off");
      }

      return this.renderer.setTransformConfig({
        gridLock: value === "on"
      });
    }

    const number = this.#number(value);

    if (number < 0) {
      throw new Error("O snapping não pode ser negativo.");
    }

    const patch = {};

    if (kind === "move") patch.translationSnap = number || null;
    else if (kind === "rotate") patch.rotationSnapDeg = number || null;
    else if (kind === "scale") patch.scaleSnap = number || null;
    else throw new Error("Uso: snap move|rotate|scale|grid valor");

    return this.renderer.setTransformConfig(patch);
  }

  #vertices(tokens) {
    this.#expectExact(tokens, 1, "vertices on|off");

    if (!["on", "off"].includes(tokens[0])) {
      throw new Error("Uso: vertices on|off");
    }

    return this.renderer.setTransformConfig({
      showVertices: tokens[0] === "on"
    });
  }

  #tokenize(line) {
    return line.match(/"[^"]*"|'[^']*'|\S+/g)?.map(token =>
      token.replace(/^["']|["']$/g, "")
    ) ?? [];
  }

  #number(value) {
    const number = Number(value);

    if (!Number.isFinite(number)) {
      throw new Error(`Número inválido: ${value}`);
    }

    return number;
  }

  #positive(value) {
    const number = this.#number(value);

    if (number <= 0) {
      throw new Error(`Valor deve ser positivo: ${value}`);
    }

    return number;
  }

  #expectExact(tokens, length, usage) {
    if (tokens.length !== length) throw new Error(`Uso: ${usage}`);
  }

  #expectMaximum(tokens, length, usage) {
    if (tokens.length > length) {
      throw new Error(`Argumentos inesperados. Uso: ${usage}.`);
    }
  }
}
