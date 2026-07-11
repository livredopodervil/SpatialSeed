export class DevConsole {
  static apiVersion = "dev-console-v2";

  static commandNames = new Set([
    "help", "inspect", "list", "select", "clear",
    "pivot", "move", "undo", "redo", "gizmo", "snap", "vertices"
  ]);

  constructor({ editor, sandbox, region, renderer, getDiagnostics, onOutput }) {
    this.editor = editor;
    this.sandbox = sandbox;
    this.region = region;
    this.renderer = renderer;
    this.getDiagnostics = getDiagnostics;
    this.onOutput = onOutput;
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
        return this.sandbox.getState().objects.map(object => ({
          id: object.id,
          kind: object.kind,
          name: object.name,
          position: object.position,
          rotation: object.rotation,
          scale: object.scale
        }));

      case "select":
        return this.#select(tokens);

      case "clear":
        this.#expectMaximum(tokens, 0, "clear");
        this.editor.selection.clear();
        return { selection: [] };

      case "pivot":
        return this.#pivot(tokens);

      case "move":
        return this.#move(tokens);

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
      syntax: "Separe comandos por ponto e vírgula ou por quebra de linha.",
      commands: [
        "help",
        "inspect selection",
        "inspect input",
        "inspect editor",
        "inspect sandbox",
        "inspect region",
        "inspect objects",
        "list objects",
        "select box-1",
        "select box-1 box-2",
        "clear",
        "pivot median",
        "pivot bounds",
        "pivot active",
        "pivot custom x y z",
        "move dx dy dz",
        "undo",
        "redo"
      ],
      examples: [
        "select box-1; inspect selection",
        "select box-1 box-2\npivot bounds\nmove 1 0 0"
      ]
    };
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

    const accidentalCommand = ids.find(
      id => DevConsole.commandNames.has(id.toLowerCase())
    );

    if (accidentalCommand) {
      throw new Error(
        `O comando "select" recebeu "${accidentalCommand}" como argumento. ` +
        "Separe comandos por ponto e vírgula ou por quebra de linha."
      );
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

  #pivot(tokens) {
    const policy = tokens.shift();

    if (!policy) return this.editor.snapshot().pivot;

    if (policy === "custom") {
      this.#expectExact(tokens, 3, "pivot custom x y z");
      const position = tokens.map(value => this.#number(value));
      this.editor.setCustomPivot(position);
      this.editor.setPivotPolicy("custom");
      return { policy: "custom", position };
    }

    this.#expectMaximum(tokens, 0, `pivot ${policy}`);
    this.editor.setPivotEditing(false);
    this.editor.setPivotPolicy(policy);
    return this.editor.snapshot().pivot;
  }

  #move(tokens) {
    this.#expectExact(tokens, 3, "move dx dy dz");

    const delta = tokens.map(value => this.#number(value));
    const selection = this.editor.selection.snapshot();

    if (!selection.members.length) {
      throw new Error("A seleção está vazia.");
    }

    const objects = new Map(
      this.sandbox.getState().objects.map(object => [object.id, object])
    );

    const transforms = selection.members.map(member => {
      const object = objects.get(member.objectId);

      if (!object) {
        throw new Error(
          `Objeto selecionado não resolvido: ${member.objectId}`
        );
      }

      return {
        id: object.id,
        position: object.position.map(
          (value, index) => value + delta[index]
        ),
        rotation: [...object.rotation],
        scale: [...object.scale]
      };
    });

    const changed = this.sandbox.dispatch({
      type: "selection.transform",
      source: "dev-console",
      selection,
      pivot: this.editor.snapshot().pivot,
      transforms
    });

    return {
      changed,
      delta,
      objects: transforms.map(transform => transform.id)
    };
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
      token.replace(/^[\"']|[\"']$/g, "")
    ) ?? [];
  }

  #number(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      throw new Error(`Número inválido: ${value}`);
    }
    return number;
  }

  #expectExact(tokens, length, usage) {
    if (tokens.length !== length) throw new Error(`Uso: ${usage}`);
  }

  #expectMaximum(tokens, length, usage) {
    if (tokens.length > length) {
      throw new Error(
        `Argumentos inesperados. Uso: ${usage}. ` +
        "Separe comandos por ponto e vírgula ou por quebra de linha."
      );
    }
  }
}
