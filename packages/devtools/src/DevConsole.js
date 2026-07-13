export class DevConsole {
  static apiVersion = "dev-console-v4";

  constructor({
    editor,
    sandbox,
    region,
    renderer,
    getDiagnostics,
    onOutput,
    commands
  }) {
    this.editor = editor;
    this.sandbox = sandbox;
    this.region = region;
    this.renderer = renderer;
    this.getDiagnostics = getDiagnostics;
    this.onOutput = onOutput;
    this.commands = commands;
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

      case "commands":
        this.#expectMaximum(tokens, 0, "commands");
        return this.commands.describe();

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
        return this.commands.execute("selection.position", {
          position: tokens.map(value => this.#number(value))
        });

      case "move":
        this.#expectExact(tokens, 3, "move dx dy dz");
        return this.commands.execute("selection.translate", {
          delta: tokens.map(value => this.#number(value))
        });

      case "rotate":
        this.#expectExact(tokens, 3, "rotate xDeg yDeg zDeg");
        return this.commands.execute("selection.rotate", {
          degrees: tokens.map(value => this.#number(value))
        });

      case "scale":
        this.#expectExact(tokens, 3, "scale sx sy sz");
        return this.commands.execute("selection.scale", {
          factors: tokens.map(value => this.#positive(value))
        });

      case "pivot":
        return this.#pivot(tokens);

      case "duplicate":
        return this.#duplicate(tokens);

      case "repeat":
        this.#expectMaximum(tokens, 0, "repeat");
        return this.commands.execute("selection.repeat");

      case "delete":
        this.#expectMaximum(tokens, 0, "delete");
        return this.commands.execute("selection.delete");

      case "undo":
        this.#expectMaximum(tokens, 0, "undo");
        return { changed: this.sandbox.undo() };

      case "redo":
        this.#expectMaximum(tokens, 0, "redo");
        return { changed: this.sandbox.redo() };

      case "gizmo":
        this.#expectMaximum(tokens, 0, "gizmo");
        return this.commands.execute("gizmo.inspect");

      case "snap":
        return this.#snap(tokens);

      case "vertices":
        return this.#vertices(tokens);

      case "benchmark":
        return this.#benchmark(tokens);

      case "test":
        return this.#test(tokens);

      case "runtime":
        return this.#runtime(tokens);

      default:
        throw new Error(
          `Comando desconhecido: ${command || "(vazio)"}. Use help.`
        );
    }
  }

  #help() {
    return {
      syntax: "Separe comandos por ponto e vírgula ou por quebra de linha.",
      commands: [
        "commands",
        "benchmark help",
        "benchmark scene 1000 5 100",
        "benchmark compare|history|clear",
        "test help|all|sandbox|reducer|commands|project",
        "create box [x y z]",
        "position x y z",
        "move dx dy dz",
        "rotate xDeg yDeg zDeg",
        "scale sx sy sz",
        "duplicate",
        "duplicate count N",
        "repeat",
        "delete",
        "pivot median|bounds|active",
        "pivot absolute x y z",
        "pivot relative dx dy dz",
        "vertices on|off",
        "snap move|rotate|scale valor",
        "snap grid on|off",
        "select object-id [object-id ...]",
        "clear",
        "list objects",
        "inspect selection|input|editor|sandbox|region|objects",
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
      return this.commands.execute("object.create.box");
    }
    this.#expectExact(tokens, 3, "create box x y z");
    return this.commands.execute("object.create.box", {
      position: tokens.map(value => this.#number(value))
    });
  }

  #pivot(tokens) {
    const mode = tokens.shift();
    if (!mode) return this.editor.snapshot().pivot;

    if (["median", "bounds", "active"].includes(mode)) {
      this.#expectMaximum(tokens, 0, `pivot ${mode}`);
      return this.commands.execute("pivot.policy", { policy: mode });
    }

    if (mode === "absolute" || mode === "custom") {
      this.#expectExact(tokens, 3, `pivot ${mode} x y z`);
      return this.commands.execute("pivot.absolute", {
        position: tokens.map(value => this.#number(value))
      });
    }

    if (mode === "relative") {
      this.#expectExact(tokens, 3, "pivot relative dx dy dz");
      return this.commands.execute("pivot.relative", {
        offset: tokens.map(value => this.#number(value))
      });
    }

    throw new Error("Uso: pivot median|bounds|active|absolute|relative");
  }

  #snap(tokens) {
    this.#expectExact(tokens, 2, "snap move|rotate|scale|grid valor");
    const [kind, rawValue] = tokens;

    if (kind === "grid") {
      if (!["on", "off"].includes(rawValue)) {
        throw new Error("Uso: snap grid on|off");
      }
      return this.commands.execute("snap.set", {
        kind: "grid",
        value: rawValue === "on"
      });
    }

    const value = this.#number(rawValue);
    if (value < 0) throw new Error("O snapping não pode ser negativo.");

    return this.commands.execute("snap.set", { kind, value });
  }

  #vertices(tokens) {
    this.#expectExact(tokens, 1, "vertices on|off");
    if (!["on", "off"].includes(tokens[0])) {
      throw new Error("Uso: vertices on|off");
    }
    return this.commands.execute("vertices.set", {
      enabled: tokens[0] === "on"
    });
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

  #benchmark(tokens) {
    const action = (tokens.shift() ?? "help").toLowerCase();

    if (action === "help") {
      this.#expectMaximum(tokens, 0, "benchmark help");
      return this.commands.execute("benchmark.help");
    }

    if (action === "scene") {
      const objectCount = tokens.length ? this.#integer(tokens.shift()) : 1000;
      const samples = tokens.length ? this.#integer(tokens.shift()) : 5;
      const transformCount = tokens.length
        ? this.#integer(tokens.shift())
        : Math.min(100, objectCount);

      this.#expectMaximum(
        tokens,
        0,
        "benchmark scene [objetos] [amostras] [transformados]"
      );

      return this.commands.execute("benchmark.scene", {
        objectCount,
        samples,
        transformCount
      });
    }

    const id = {
      compare: "benchmark.compare",
      history: "benchmark.history",
      clear: "benchmark.clear"
    }[action];

    if (!id) {
      throw new Error("Uso: benchmark help|scene|compare|history|clear");
    }

    this.#expectMaximum(tokens, 0, `benchmark ${action}`);
    return this.commands.execute(id);
  }

  #test(tokens) {
    const action = (tokens.shift() ?? "help").toLowerCase();

    if (action === "help") {
      this.#expectMaximum(tokens, 0, "test help");
      return this.commands.execute("test.help");
    }

    this.#expectMaximum(tokens, 0, `test ${action}`);
    return this.commands.execute("test.run", { suite: action });
  }

  #integer(value) {
    const number = Number(value);
    if (!Number.isInteger(number)) {
      throw new Error(`Inteiro inválido: ${value}`);
    }
    return number;
  }

  #runtime(tokens) {
    const namespace =
      (tokens.shift() ?? "").toLowerCase();

    if (namespace !== "test") {
      throw new Error(
        "Uso: runtime test help|viewer|editor|clock|simulation|assets|project-assets|appearance-runtime|normalized-runtime|incremental-runtime|batch-selection|all"
      );
    }

    const suite =
      (tokens.shift() ?? "help").toLowerCase();

    this.#expectMaximum(
      tokens,
      0,
      `runtime test ${suite}`
    );

    if (suite === "help") {
      return this.commands.execute(
        "runtime.test.help"
      );
    }

    if (
      ![
        "viewer",
        "editor",
        "clock",
        "simulation",
        "assets",
        "project-assets",
        "appearance-runtime",
        "normalized-runtime",
        "incremental-runtime",
        "batch-selection",
        "all"
      ].includes(suite)
    ) {
      throw new Error(
        "Uso: runtime test help|viewer|editor|clock|simulation|assets|project-assets|appearance-runtime|normalized-runtime|incremental-runtime|batch-selection|all"
      );
    }

    return this.commands.execute(
      "runtime.test.run",
      { suite }
    );
  }

  #duplicate(tokens) {
    if (!tokens.length) {
      return this.commands.execute("selection.duplicate");
    }

    const mode = (tokens.shift() ?? "").toLowerCase();
    if (mode !== "count") {
      throw new Error("Uso: duplicate [count N]");
    }

    this.#expectExact(tokens, 1, "duplicate count N");
    const count = this.#positive(tokens[0]);
    if (!Number.isInteger(count)) {
      throw new Error("A quantidade deve ser inteira.");
    }

    return this.commands.execute(
      "selection.duplicateMany",
      { count }
    );
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
