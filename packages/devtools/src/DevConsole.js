import {
  normalizeHexColor,
  parsePropertyInput
} from "../../property-registry/src/index.js?build=20260715-0022b";
export class DevConsole {
  static apiVersion = "dev-console-v4";

  constructor({
    editor,
    sandbox,
    region,
    renderer,
    getDiagnostics,
    onOutput,
    commands,
    queries = null,
    programs = null,
    procedures = null
  }) {
    this.editor = editor;
    this.sandbox = sandbox;
    this.region = region;
    this.renderer = renderer;
    this.getDiagnostics = getDiagnostics;
    this.onOutput = onOutput;
    this.commands = commands;
    this.queries = queries;
    this.programs = programs;
    this.procedures = procedures;
    this.programSequence = 0;
    this.pendingProgramPlan = null;
    this.history = [];
  }

  execute(source) {
    const input = String(source ?? "").trim();
    if (!input) return [];

    if (isProgramConsoleInput(input)) {
      return this.#executeProgramInputs(
        splitProgramConsoleInputs(input)
      );
    }

    const lines = splitStatements(input);

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

  async #executeProgramInputs(inputs) {
    const results = [];

    for (const input of inputs) {
      results.push(...await this.#executeProgramInput(input));
    }

    return results;
  }

  async #executeProgramInput(input) {
    try {
      const result = await this.#programCommand(input);
      const entry = {
        timestamp: new Date().toISOString(),
        input,
        ok: true,
        result
      };
      this.history.push(entry);
      this.onOutput?.({ type: "result", input, result });
      return [entry];
    } catch (error) {
      const entry = {
        timestamp: new Date().toISOString(),
        input,
        ok: false,
        error: error?.message ?? String(error)
      };
      this.history.push(entry);
      this.onOutput?.({
        type: "error",
        input,
        error: entry.error
      });
      return [entry];
    }
  }

  async #programCommand(input) {
    if (!this.programs) {
      throw new Error("Sessão de programas indisponível.");
    }

    const separator = input.search(/\s/);
    const command = (separator < 0 ? input : input.slice(0, separator))
      .toLowerCase();
    const source = separator < 0 ? "" : input.slice(separator).trim();

    if (command === "session") {
      const action = (source || "status").toLowerCase();

      if (action === "status") return this.programs.snapshot();
      if (action === "reset") return this.programs.reset();
      if (action === "cancel") return this.programs.cancel();
      if (action === "help") return this.#programHelp();

      throw new Error("Uso: session status|reset|cancel|help.");
    }

    if (command === "plan") {
      const action = (source || "status").toLowerCase();

      if (action === "help") return this.#programHelp();
      if (action === "status") {
        return this.#pendingPlanSnapshot();
      }
      if (action === "discard") {
        const discarded = this.#pendingPlanSnapshot();
        this.pendingProgramPlan = null;
        return {
          discarded: discarded.pending,
          plan: discarded.plan
        };
      }
      if (action === "commit") {
        if (!this.pendingProgramPlan) {
          throw new Error("Nenhum plano espacial está pendente.");
        }
        const result = this.commands.execute(
          "program.plan.commit",
          { plan: this.pendingProgramPlan }
        );
        this.pendingProgramPlan = null;
        return result;
      }

      throw new Error("Uso: plan status|commit|discard|help.");
    }

    if (command === "procedure") {
      return this.#procedureCommand(source);
    }

    if (!source) {
      throw new Error(
        command === "calc"
          ? "Uso: calc expressão JavaScript."
          : "Uso: program código JavaScript."
      );
    }

    if (this.pendingProgramPlan) {
      throw new Error(
        "Existe um plano espacial pendente. Use plan commit ou plan discard."
      );
    }

    return this.#runProgramSource({
      source,
      mode: command === "calc" ? "expression" : "program"
    });
  }

  async #procedureCommand(source) {
    if (!this.procedures) {
      throw new Error("Catálogo de procedimentos indisponível.");
    }

    const { head: action, tail } = takeHead(source);

    if (!action || action === "help") return this.#procedureHelp();
    if (action === "list") {
      expectEmpty(tail, "procedure list");
      return this.procedures.snapshot();
    }
    if (action === "export") {
      expectEmpty(tail, "procedure export");
      return this.procedures.exportDocument();
    }
    if (action === "show") {
      const { head: name, tail: extra } = takeHead(tail);
      if (!name || extra) throw new Error("Uso: procedure show nome.");
      return this.procedures.get(name);
    }
    if (action === "remove") {
      const { head: name, tail: extra } = takeHead(tail);
      if (!name || extra) throw new Error("Uso: procedure remove nome.");
      return this.procedures.remove(name);
    }
    if (action === "define") {
      const { head: name, tail: procedureSource } = takeHead(tail, {
        lowercase: false
      });
      if (!name || !procedureSource) {
        throw new Error(
          "Uso: procedure define nome expressão-de-função."
        );
      }
      return this.procedures.define(name, procedureSource, {
        replace: true
      });
    }
    if (action === "import") {
      let mode = "merge";
      let documentSource = tail;
      const candidate = takeHead(tail);

      if (["merge", "replace"].includes(candidate.head)) {
        mode = candidate.head;
        documentSource = candidate.tail;
      }
      if (!documentSource) {
        throw new Error(
          "Uso: procedure import [merge|replace] documento-JSON."
        );
      }

      return this.procedures.importDocument(
        parseJson(documentSource, "Biblioteca de procedimentos"),
        { mode }
      );
    }
    if (action === "run") {
      if (this.pendingProgramPlan) {
        throw new Error(
          "Existe um plano espacial pendente. " +
          "Use plan commit ou plan discard."
        );
      }

      const { head: name, tail: argumentSource } = takeHead(tail, {
        lowercase: false
      });
      if (!name) {
        throw new Error("Uso: procedure run nome [argumento-JSON].");
      }
      const argument = argumentSource
        ? parseJson(argumentSource, "Argumento do procedimento")
        : {};

      return this.#runProgramSource({
        source: this.procedures.invocationSource(name, argument),
        mode: "program"
      });
    }

    throw new Error(
      "Uso: procedure define|list|show|run|remove|export|import|help."
    );
  }

  async #runProgramSource({ source, mode }) {
    const plan = await this.programs.run({
      runId: `console-session-${++this.programSequence}`,
      baseVersion: Number(this.sandbox?.revision ?? 0),
      seed: 0,
      source,
      mode
    });

    if (plan.commands?.length) {
      this.pendingProgramPlan = structuredClone(plan);
    }

    return {
      value: plan.result?.value ?? null,
      output: plan.result?.output ?? [],
      plan: {
        runId: plan.runId,
        baseVersion: plan.baseVersion,
        commandCount: plan.commands?.length ?? 0,
        commands: plan.commands ?? []
      },
      session: this.programs.snapshot()
    };
  }

  #pendingPlanSnapshot() {
    const plan = this.pendingProgramPlan;
    return {
      pending: plan !== null,
      plan: plan === null
        ? null
        : {
            runId: plan.runId,
            baseVersion: plan.baseVersion,
            commandCount: plan.commands.length,
            commands: structuredClone(plan.commands)
          }
    };
  }

  #executeLine(line) {
    const tokens = this.#tokenize(line);
    const command = tokens.shift()?.toLowerCase();

    switch (command) {
      case "help":
        this.#expectMaximum(tokens, 1, "help [create]");
        return this.#help(tokens[0]);

      case "commands":
        this.#expectMaximum(tokens, 0, "commands");
        return this.commands.describe();

      case "inspect":
        this.#expectMaximum(tokens, 2, "inspect");
        return this.#inspect(tokens[0], tokens[1]);

      case "list":
        this.#expectExact(tokens, 1, "list objects");
        if (tokens[0] !== "objects") throw new Error("Uso: list objects");
        return this.sandbox.getState().objects;

      case "select":
        return this.#selectCommand(tokens);

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

      case "group":
        return this.#group(tokens);

      case "ungroup":
        this.#expectMaximum(tokens,0,"ungroup");
        return this.commands.execute("selection.ungroup");

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

      case "property":
        return this.#property(tokens);

      default:
        throw new Error(
          `Comando desconhecido: ${command || "(vazio)"}. Use help.`
        );
    }
  }

  #help(topic = null) {
    if (topic !== null) {
      if (String(topic).toLowerCase() === "create") {
        return this.#createHelp();
      }
      if (["calc", "program", "session", "plan"].includes(
        String(topic).toLowerCase()
      )) {
        return this.#programHelp();
      }
      if (String(topic).toLowerCase() === "procedure") {
        return this.#procedureHelp();
      }
      throw new Error(`Tópico de ajuda desconhecido: ${topic}.`);
    }

    return {
      syntax: "Separe comandos por ponto e vírgula ou por quebra de linha.",
      commands: [
        "commands",
        "benchmark help",
        "benchmark scene 1000 5 100",
        "benchmark compare|history|clear",
        "test help|all|sandbox|reducer|commands|project",
        "runtime test placement-frame|geometry-creation|geometry-registry|" +
        "file-interop|project-files|pwa-status|spatial-planning|" +
        "spatial-plan-commit|procedure-catalog|all",
        "calc expressão JavaScript",
        "program código JavaScript",
        "procedure define|list|show|run|remove|export|import|help",
        "session status|reset|cancel|help",
        "plan status|commit|discard|help",
        "help create",
        "create help",
        "create box|sphere|cylinder|plane|polygon ...",
        "position x y z",
        "move dx dy dz",
        "rotate xDeg yDeg zDeg",
        "scale sx sy sz",
        "duplicate",
        "group [nome]",
        "ungroup",
        "duplicate count N [move|rotate|scale|pivot|matrix ...]",
        '  expressões: duplicate count 24 move "3*cos(i*pi/12)" 0 "3*sin(i*pi/12)"',
        '  rotação: rotate 0 "i*pi/12 rad" 0',
        "  pivot median|bounds|active",
        "  pivot absolute x y z",
        "  pivot relative dx dy dz",
        "repeat",
        "delete",
        "pivot median|bounds|active",
        "pivot absolute x y z",
        "pivot relative dx dy dz",
        "vertices on|off",
        "snap move|rotate|scale valor",
        "snap grid on|off",
        "select object-id [object-id ...]",
        "select only|add|remove|toggle object-id [...]",
        "select clear",
        "clear",
        "list objects",
        "inspect selection|selected|selected all|input|editor|sandbox|region|objects",
        "property list|inspect [id]",
        "property set id valor [...]",
        "property unset id",
        "gizmo",
        "undo",
        "redo"
      ]
    };
  }

  #programHelp() {
    return {
      usage: [
        "calc expressão JavaScript",
        "program código JavaScript",
        "session status",
        "session reset",
        "session cancel",
        "procedure help",
        "plan status|commit|discard"
      ],
      notes: [
        "Use session.nome para valores, objetos e funções persistentes.",
        "calc avalia uma expressão; program aceita comandos e return.",
        "spatial cria um plano; plan commit aplica a transação atomicamente."
      ],
      examples: [
        "calc sqrt(3 ** 2 + 4 ** 2)",
        "calc session.radius = 12",
        "program session.area = r => pi * r ** 2",
        "calc session.area(session.radius)",
        "program spatial.create('box', {size:[1,2,1], position:[0,1,0]})",
        "plan status",
        "plan commit",
        "program for (let i=0;i<5;i+=1) print(i, random()); return 'ok'"
      ]
    };
  }

  #procedureHelp() {
    return {
      usage: [
        "procedure define nome expressão-de-função",
        "procedure list",
        "procedure show nome",
        "procedure run nome [argumento-JSON]",
        "procedure remove nome",
        "procedure export",
        "procedure import [merge|replace] documento-JSON"
      ],
      notes: [
        "O catálogo guarda fontes; a função só executa dentro do Worker SES.",
        "run aceita um valor JSON e pode produzir um plano espacial.",
        "merge rejeita conflitos; replace troca o catálogo atomicamente."
      ],
      examples: [
        "procedure define tower ({height=8}={}) => " +
          "spatial.create('box',{size:[2,height,2],position:[0,height/2,0]})",
        "procedure run tower {\"height\":12}",
        "plan commit"
      ]
    };
  }

  #create(tokens) {
    const type = tokens.shift()?.toLowerCase();

    if (!type || type === "help") {
      this.#expectMaximum(tokens, 0, "create help");
      return this.#createHelp();
    }

    if (type === "box" && tokens.length === 0) {
      return this.commands.execute("object.create.box");
    }

    if (
      type === "box" &&
      tokens.length === 3 &&
      tokens.every(value => Number.isFinite(Number(value)))
    ) {
      return this.commands.execute("object.create.box", {
        position: tokens.map(value => this.#number(value))
      });
    }

    const supported = ["box", "sphere", "cylinder", "plane", "polygon"];
    if (!supported.includes(type)) {
      throw new Error(
        `Geometria desconhecida: ${type ?? "(vazia)"}. Use create help.`
      );
    }

    const geometry = defaultGeometry(type);
    const placement = {
      origin: [0, type === "plane" || type === "polygon" ? 0.02 : 1, 0],
      plane: type === "plane" || type === "polygon" ? "xz" : "xy",
      normal: null,
      tangent: null,
      points: null
    };
    let color = "#6699cc";
    let planeWasSet = false;
    let count = 1;
    let seriesRequested = false;
    const affineOperations = [];

    if (type === "polygon" && tokens.length && isNumericToken(tokens[0])) {
      geometry.sides = this.#integerAtLeast(tokens.shift(), 3, "sides");
    }

    while (tokens.length) {
      const option = tokens.shift().toLowerCase();

      if (option === "origin") {
        placement.origin = this.#takeNumbers(tokens, 3, "origin x y z");
        continue;
      }
      if (option === "plane") {
        const plane = tokens.shift()?.toLowerCase();
        if (!plane) throw new Error("Uso: plane xy|xz|yz");
        placement.plane = plane;
        planeWasSet = true;
        continue;
      }
      if (option === "normal") {
        placement.normal = this.#takeNumbers(tokens, 3, "normal nx ny nz");
        continue;
      }
      if (option === "tangent") {
        placement.tangent = this.#takeNumbers(tokens, 3, "tangent tx ty tz");
        continue;
      }
      if (option === "points") {
        const values = this.#takeNumbers(
          tokens,
          9,
          "points x0 y0 z0 x1 y1 z1 x2 y2 z2"
        );
        placement.points = [values.slice(0, 3), values.slice(3, 6), values.slice(6, 9)];
        continue;
      }
      if (option === "color") {
        const value = tokens.shift();
        if (!value) throw new Error("Uso: color #rrggbb");
        color = normalizeHexColor(value);
        continue;
      }
      if (option === "count") {
        count = this.#positive(tokens.shift());
        if (!Number.isInteger(count) || count > 100000) {
          throw new Error("count deve ser inteiro entre 1 e 100000.");
        }
        seriesRequested = true;
        continue;
      }
      if (["move", "rotate", "scale"].includes(option)) {
        if (tokens.length < 3) throw new Error(`Uso: ${option} x y z`);
        affineOperations.push({
          type: option,
          value: [
            this.#affineValue(tokens.shift()),
            this.#affineValue(tokens.shift()),
            this.#affineValue(tokens.shift())
          ]
        });
        seriesRequested = true;
        continue;
      }

      this.#geometryOption(type, geometry, option, tokens);
    }

    if (planeWasSet && placement.normal !== null) {
      throw new Error("Use plane ou normal; não combine os dois referenciais.");
    }

    return this.commands.execute(
      seriesRequested
        ? "object.create.geometrySeries"
        : "object.create.geometry",
      {
        geometry,
        placement,
        color,
        ...(seriesRequested
          ? { count, operations:affineOperations }
          : {})
      }
    );
  }

  #geometryOption(type, geometry, option, tokens) {
    if (option === "size" && type === "box") {
      geometry.size = this.#takePositive(tokens, 3, "size x y z");
      return;
    }
    if (option === "size" && type === "plane") {
      [geometry.width, geometry.height] = this.#takePositive(
        tokens, 2, "size width height"
      );
      return;
    }
    if (option === "radius" && ["sphere", "cylinder", "polygon"].includes(type)) {
      const radius = this.#positive(tokens.shift());
      if (type === "cylinder") {
        geometry.radiusTop = radius;
        geometry.radiusBottom = radius;
      } else {
        geometry.radius = radius;
      }
      return;
    }
    if (option === "top" && type === "cylinder") {
      geometry.radiusTop = this.#nonNegative(tokens.shift(), "top");
      return;
    }
    if (option === "bottom" && type === "cylinder") {
      geometry.radiusBottom = this.#nonNegative(tokens.shift(), "bottom");
      return;
    }
    if (option === "height" && type === "cylinder") {
      geometry.height = this.#positive(tokens.shift());
      return;
    }
    if (option === "sides" && type === "polygon") {
      geometry.sides = this.#integerAtLeast(tokens.shift(), 3, "sides");
      return;
    }
    if (option === "angle" && type === "polygon") {
      geometry.startAngleDeg = this.#number(tokens.shift());
      return;
    }
    if (option === "segments" && type === "sphere") {
      geometry.widthSegments = this.#integerAtLeast(tokens.shift(), 3, "widthSegments");
      geometry.heightSegments = this.#integerAtLeast(tokens.shift(), 2, "heightSegments");
      return;
    }
    if (option === "segments" && type === "cylinder") {
      geometry.radialSegments = this.#integerAtLeast(tokens.shift(), 3, "radialSegments");
      return;
    }
    if (option === "segments" && type === "plane") {
      geometry.widthSegments = this.#integerAtLeast(tokens.shift(), 1, "widthSegments");
      geometry.heightSegments = this.#integerAtLeast(tokens.shift(), 1, "heightSegments");
      return;
    }

    throw new Error(`Opção inválida para ${type}: ${option}. Use create help.`);
  }

  #createHelp() {
    return {
      usage: [
        "create box [x y z]",
        "create box size sx sy sz [origin x y z] [color #rrggbb]",
        "create sphere [radius r] [segments largura altura] [origin x y z] [color #rrggbb]",
        "create cylinder [radius r|top r bottom r] [height h] [segments n] [origin x y z] [color #rrggbb]",
        "create plane [size largura altura] [segments x y] [referencial] [color #rrggbb]",
        "create polygon [n|sides n] [radius r] [angle graus] [referencial] [color #rrggbb]",
        "acrescente count N [move x y z] [rotate x y z] [scale x y z] para uma série afim"
      ],
      placement: [
        "plane xy|xz|yz [origin x y z]",
        "origin x y z normal nx ny nz [tangent tx ty tz]",
        "points x0 y0 z0 x1 y1 z1 x2 y2 z2"
      ],
      examples: [
        "create polygon 6 radius 2 plane xz origin 0 0 0 color #33aaff",
        "create polygon sides 5 radius 1.5 origin 0 2 0 normal 1 1 0 tangent 0 0 1",
        "create plane size 6 4 points 0 0 0 6 0 0 0 3 2",
        "create sphere radius 1.5 segments 32 20 origin 0 2 0",
        "create cylinder top 0 bottom 1.5 height 4 segments 32 origin 3 2 0",
        "create box size 1 1 1 count 20 move 2 0 0 rotate 0 5 0"
      ]
    };
  }

  #group(tokens) {
    const name=tokens.join(" ").trim();
    return this.commands.execute(
      "selection.group",
      name ? { name } : {}
    );
  }

  #property(tokens) {
    const action = (tokens.shift() ?? "help").toLowerCase();
    const description = this.#propertyDescription();

    if (action === "help" || action === "list") {
      this.#expectMaximum(tokens, 0, `property ${action}`);
      return {
        usage: [
          "property list",
          "property inspect [id]",
          "property set id valor [...]",
          "property unset id"
        ],
        ...description
      };
    }

    if (action === "inspect") {
      this.#expectMaximum(tokens, 1, "property inspect [id]");
      const inspection = this.#query(
        "selection.properties.inspect"
      );

      if (!tokens.length) return inspection;

      const id = tokens[0];
      this.#propertyDescriptor(description, id);
      return inspection.properties[id];
    }

    const id = tokens.shift();
    if (!id) {
      throw new Error(`Uso: property ${action} id.`);
    }
    const descriptor = this.#propertyDescriptor(description, id);

    if (action === "unset") {
      this.#expectMaximum(tokens, 0, `property unset ${id}`);
      return this.commands.execute(
        "selection.properties.unset",
        { properties: [id] }
      );
    }

    if (action !== "set") {
      throw new Error(
        "Uso: property list|inspect|set|unset."
      );
    }

    if (!tokens.length) {
      throw new Error(`Uso: property set ${id} valor [...].`);
    }

    const value = parsePropertyInput(descriptor, tokens);
    return this.commands.execute(
      "selection.properties.set",
      { patch: { [id]: value } }
    );
  }

  #propertyDescription() {
    return this.#query("properties.describe");
  }

  #propertyDescriptor(description, id) {
    const descriptor = description.properties.find(
      property => property.id === id
    );

    if (!descriptor) {
      throw new Error(`Propriedade desconhecida: ${id}.`);
    }

    return descriptor;
  }

  #query(id, args) {
    if (!this.queries?.execute) {
      throw new Error("Consultas do runtime indisponíveis.");
    }
    return this.queries.execute(id, args);
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

  #inspect(target = "all", qualifier = null) {
    switch (target) {
      case "selection": return this.editor.selection.snapshot();
      case "selected": {
        const q=this.editor.selection.snapshot(),ids=q.members.map(m=>m.objectId),objects=this.sandbox.getState().objects.filter(o=>ids.includes(o.id));
        if(qualifier==="all")return objects;
        return objects.find(o=>o.id===q.activeMember?.objectId)??null;
      }
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
          "Uso: inspect selection|selected|selected all|input|editor|sandbox|region|objects"
        );
    }
  }

  #selectCommand(tokens) {
    const action=(tokens[0]??"").toLowerCase();
    if(action==="clear"){this.editor.selection.clear();return this.editor.selection.snapshot()}
    if(["only","add","remove","toggle"].includes(action)){const ids=tokens.slice(1);if(!ids.length)throw new Error(`Uso: select ${action} object-id [...]`);return this.#modifySelection(action,ids)}
    return this.#select(tokens);
  }

  #modifySelection(action,ids){
    const known=new Set(this.sandbox.getState().objects.map(o=>o.id));for(const id of ids)if(!known.has(id))throw new Error(`Objeto inexistente: ${id}`);
    const q=this.editor.selection.snapshot(),byId=new Map(q.members.map(m=>[m.objectId,m])),member=id=>({kind:"object",regionId:this.region.descriptor.id,objectId:id});
    if(action==="only"){byId.clear();for(const id of ids)byId.set(id,member(id))}else if(action==="add")for(const id of ids)byId.set(id,member(id));else if(action==="remove")for(const id of ids)byId.delete(id);else for(const id of ids){if(byId.has(id))byId.delete(id);else byId.set(id,member(id))}
    const next=[...byId.values()];if(this.editor.selection.replaceMany)this.editor.selection.replaceMany(next);else{this.editor.selection.clear();if(next[0])this.editor.selection.replace(next[0]);for(const m of next.slice(1))this.editor.selection.toggle(m)}return this.editor.selection.snapshot();
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

    if (namespace === "benchmark") {
      const target =
        (tokens.shift() ?? "").toLowerCase();

      if (target !== "api") {
        throw new Error(
          "Uso: runtime benchmark api [iterações]"
        );
      }

      const iterations = tokens.length
        ? this.#integer(tokens.shift())
        : 10000;

      this.#expectMaximum(
        tokens,
        0,
        "runtime benchmark api [iterações]"
      );

      return this.commands.execute(
        "runtime.api.benchmark",
        { iterations }
      );
    }

    if (namespace === "resources") {
      this.#expectMaximum(
        tokens,
        0,
        "runtime benchmark api [iterações]",
        "runtime resources"
      );

      return this.commands.execute(
        "runtime.resources"
      );
    }

    if (namespace !== "test") {
      throw new Error(
        "Uso: runtime test help|placement-frame|geometry-creation|" +
        "geometry-registry|file-interop|project-files|pwa-status|" +
        "spatial-planning|spatial-plan-commit|all"
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
    if (mode !== "count" || !tokens.length) {
      throw new Error(
        "Uso: duplicate count N [move|rotate|scale|pivot|matrix ...]"
      );
    }

    const count = this.#positive(tokens.shift());
    if (!Number.isInteger(count)) {
      throw new Error("A quantidade deve ser inteira.");
    }

    if (!tokens.length) {
      return this.commands.execute("selection.duplicateMany", { count });
    }

    const operations = [];
    while (tokens.length) {
      const type = (tokens.shift() ?? "").toLowerCase();

      if (["move", "rotate", "scale"].includes(type)) {
        if (tokens.length < 3) {
          throw new Error(`Uso: ${type} x y z`);
        }
        operations.push({
          type,
          value: [
            this.#affineValue(tokens.shift()),
            this.#affineValue(tokens.shift()),
            this.#affineValue(tokens.shift())
          ]
        });
        continue;
      }

      if (type === "pivot") {
        const mode = (tokens.shift() ?? "").toLowerCase();

        if (["median", "bounds", "active"].includes(mode)) {
          operations.push({ type: "pivot", mode });
          continue;
        }

        if (
          ["absolute", "custom", "relative"].includes(mode)
        ) {
          if (tokens.length < 3) {
            throw new Error(
              `Uso: pivot ${mode} x y z`
            );
          }

          const value = [
            this.#number(tokens.shift()),
            this.#number(tokens.shift()),
            this.#number(tokens.shift())
          ];

          operations.push({
            type: "pivot",
            mode:
              mode === "custom"
                ? "absolute"
                : mode,
            ...(mode === "relative"
              ? { offset: value }
              : { position: value })
          });
          continue;
        }

        /*
         * Compatibilidade: "pivot x y z" continua sendo
         * interpretado como pivô absoluto.
         */
        if (mode !== "" && tokens.length >= 2) {
          operations.push({
            type: "pivot",
            mode: "absolute",
            position: [
              this.#number(mode),
              this.#number(tokens.shift()),
              this.#number(tokens.shift())
            ]
          });
          continue;
        }

        throw new Error(
          "Uso: pivot median|bounds|active|" +
          "absolute x y z|relative dx dy dz"
        );
      }

      if (type === "matrix") {
        if (tokens.length < 16) {
          throw new Error("Uso: matrix m00 ... m15");
        }
        operations.push({
          type,
          value: Array.from({ length: 16 }, () =>
            this.#affineValue(tokens.shift())
          )
        });
        continue;
      }

      throw new Error(`Operação afim desconhecida: ${type}.`);
    }

    return this.commands.execute("selection.duplicateAffine", {
      count,
      operations
    });
  }

  #tokenize(line) {
    return line.match(/"[^"]*"|'[^']*'|\S+/g)?.map(token =>
      token.replace(/^["']|["']$/g, "")
    ) ?? [];
  }

  #affineValue(value) {
    const source = String(value ?? "").trim();

    if (!source) {
      throw new Error("Expressão afim vazia.");
    }

    const number = Number(source);

    return Number.isFinite(number)
      ? number
      : source;
  }

  #number(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      throw new Error(`Número inválido: ${value}`);
    }
    return number;
  }

  #takeNumbers(tokens, count, usage) {
    if (tokens.length < count) throw new Error(`Uso: ${usage}`);
    return Array.from({ length: count }, () =>
      this.#number(tokens.shift())
    );
  }

  #takePositive(tokens, count, usage) {
    if (tokens.length < count) throw new Error(`Uso: ${usage}`);
    return Array.from({ length: count }, () =>
      this.#positive(tokens.shift())
    );
  }

  #integerAtLeast(value, minimum, name) {
    const number = this.#number(value);
    if (!Number.isInteger(number) || number < minimum) {
      throw new Error(`${name} deve ser inteiro maior ou igual a ${minimum}.`);
    }
    return number;
  }

  #nonNegative(value, name) {
    const number = this.#number(value);
    if (number < 0) throw new Error(`${name} não pode ser negativo.`);
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

function defaultGeometry(type) {
  switch (type) {
    case "box":
      return { type, size: [2, 2, 2] };
    case "sphere":
      return { type, radius: 1, widthSegments: 24, heightSegments: 16 };
    case "cylinder":
      return {
        type,
        radiusTop: 1,
        radiusBottom: 1,
        height: 2,
        radialSegments: 24
      };
    case "plane":
      return { type, width: 2, height: 2 };
    case "polygon":
      return { type, sides: 6, radius: 1, startAngleDeg: 0 };
    default:
      throw new Error(`Geometria desconhecida: ${type}.`);
  }
}

function isNumericToken(value) {
  return String(value ?? "").trim() !== "" && Number.isFinite(Number(value));
}

function isProgramConsoleInput(source) {
  return /^(calc|program|session|plan|procedure)(?:\s|$)/i.test(
    String(source)
  );
}

function splitProgramConsoleInputs(source) {
  const input = String(source).trim();
  const lines = input
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

  if (
    lines.length > 1 &&
    lines.every(line => /^(plan|session)(?:\s|$)/i.test(line))
  ) {
    return lines;
  }

  return [input];
}

function takeHead(source, { lowercase = true } = {}) {
  const input = String(source ?? "").trim();
  const separator = input.search(/\s/);
  const rawHead = separator < 0 ? input : input.slice(0, separator);

  return {
    head: lowercase ? rawHead.toLowerCase() : rawHead,
    tail: separator < 0 ? "" : input.slice(separator).trim()
  };
}

function expectEmpty(value, usage) {
  if (String(value ?? "").trim()) {
    throw new Error(`Uso: ${usage}.`);
  }
}

function parseJson(source, label) {
  try {
    return JSON.parse(String(source));
  } catch (error) {
    throw new TypeError(`${label} deve ser JSON válido.`, {
      cause: error
    });
  }
}

function splitStatements(source) {
  const statements = [];
  let current = "";
  let quote = null;

  for (const character of String(source)) {
    if (quote) {
      current += character;
      if (character === quote) quote = null;
      continue;
    }

    if (character === '"' || character === "'") {
      quote = character;
      current += character;
      continue;
    }

    if (character === ";" || character === "\n") {
      if (current.trim()) statements.push(current.trim());
      current = "";
      continue;
    }

    current += character;
  }

  if (quote) throw new Error("Texto entre aspas não foi encerrado.");
  if (current.trim()) statements.push(current.trim());
  return statements;
}
