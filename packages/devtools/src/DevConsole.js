import {
  normalizeHexColor,
  parsePropertyInput
} from "../../property-registry/src/index.js?build=20260715-0022b";
export class DevConsole {
  static apiVersion = "dev-console-v11";

  constructor({
    editor,
    sandbox,
    region,
    renderer,
    getDiagnostics,
    onOutput,
    commands,
    geometryRegistry = null,
    queries = null,
    programs = null,
    procedures = null,
    experiments = null
  }) {
    this.editor = editor;
    this.sandbox = sandbox;
    this.region = region;
    this.renderer = renderer;
    this.getDiagnostics = getDiagnostics;
    this.onOutput = onOutput;
    this.commands = commands;
    this.geometryRegistry = geometryRegistry;
    this.queries = queries;
    this.programs = programs;
    this.procedures = procedures;
    this.experiments = experiments;
    this.programSequence = 0;
    this.pendingProgramPlan = null;
    this.history = [];
  }

  execute(source) {
    const input = String(source ?? "").trim();
    if (!input) return [];

    const asynchronousInputs = splitAsynchronousConsoleInputs(input);
    if (asynchronousInputs) {
      return this.#executeSequentialInputs(asynchronousInputs);
    }

    return this.#executeSynchronousInputs(splitStatements(input));
  }

  #executeSynchronousInputs(inputs) {
    const results = [];

    for (const input of inputs) {
      try {
        const result = this.#executeLine(input);
        const entry = {
          timestamp: new Date().toISOString(),
          input,
          ok: true,
          result
        };
        this.history.push(entry);
        results.push(entry);
        this.onOutput?.({ type: "result", input, result });
      } catch (error) {
        const entry = {
          timestamp: new Date().toISOString(),
          input,
          ok: false,
          error: error?.message ?? String(error)
        };
        this.history.push(entry);
        results.push(entry);
        this.onOutput?.({
          type: "error",
          input,
          error: entry.error
        });
      }
    }

    return results;
  }

  async #executeSequentialInputs(inputs) {
    const results = [];

    for (const input of inputs) {
      if (isProgramConsoleInput(input)) {
        results.push(...await this.#executeProgramInput(input));
      } else {
        for (const statement of splitStatements(input)) {
          results.push(await this.#executeAsynchronousLine(statement));
        }
      }
    }

    return results;
  }

  async #executeAsynchronousLine(input) {
    try {
      const result = await this.#executeLine(input);
      const entry = {
        timestamp: new Date().toISOString(),
        input,
        ok: true,
        result
      };
      this.history.push(entry);
      this.onOutput?.({ type: "result", input, result });
      return entry;
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
      return entry;
    }
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
        return this.#commitPendingPlan();
      }

      throw new Error("Uso: plan status|commit|discard|help.");
    }

    if (command === "procedure") {
      return this.#procedureCommand(source);
    }

    if (command === "experiment") {
      return this.#experimentCommand(source);
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

  async #experimentCommand(source) {
    if (!this.experiments) {
      throw new Error("Catálogo de experimentos indisponível.");
    }

    const { head: action, tail } = takeHead(source);

    if (!action || action === "help") return this.#experimentHelp();
    if (action === "list") {
      expectEmpty(tail, "experiment list");
      return this.experiments.list();
    }
    if (action === "show") {
      const { head: id, tail: extra } = takeHead(tail);
      if (!id || extra) throw new Error("Uso: experiment show id.");
      return this.experiments.describe(this.#resolveExperimentId(id));
    }
    if (action === "plan" || action === "run") {
      if (this.pendingProgramPlan) {
        throw new Error(
          "Existe um plano espacial pendente. " +
          "Use plan commit ou plan discard."
        );
      }

      const { head: id, tail: parameterSource } = takeHead(tail);
      if (!id) {
        throw new Error(
          `Uso: experiment ${action} id [parâmetros].`
        );
      }
      return action === "run"
        ? this.#createExperiment(id, parameterSource)
        : this.#planExperiment(id, parameterSource);
    }

    /*
     * Forma semântica curta: `experiment helix turns=4 count=120`.
     * O ciclo plan/commit permanece disponível como mecanismo avançado.
     */
    return this.#createExperiment(action, tail);
  }

  async #createExperiment(id, parameterSource) {
    const resolvedId = this.#resolveExperimentId(id);
    const parameters = parseExperimentParameters(parameterSource);
    return this.commands.execute(
      "experiment.create",
      { id: resolvedId, parameters }
    );
  }

  async #planExperiment(id, parameterSource) {
    const resolvedId = this.#resolveExperimentId(id);
    const parameters = parseExperimentParameters(parameterSource);
    const result = await this.experiments.plan(resolvedId, parameters);
    const plan = result.plan;

    if (plan.commands?.length) {
      this.pendingProgramPlan = structuredClone(plan);
    }

    return {
      experiment: result.experiment,
      parameters: result.parameters,
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

  #resolveExperimentId(candidate) {
    const requested = String(candidate ?? "").trim().toLowerCase();
    const descriptions = this.experiments.list();
    const exact = descriptions.find(item =>
      String(item.id).toLowerCase() === requested
    );
    if (exact) return exact.id;

    const aliases = descriptions.filter(item =>
      String(item.id).toLowerCase().split(".").at(-1) === requested
    );
    if (aliases.length === 1) return aliases[0].id;
    if (aliases.length > 1) {
      throw new Error(
        `Experimento ambíguo: ${candidate}. Use o identificador completo.`
      );
    }
    throw new Error(`Experimento desconhecido: ${candidate}.`);
  }

  #commitPendingPlan() {
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

  async #runProgramSource({ source, mode }) {
    const camera = this.queries
      ? this.queries.execute("viewer.camera.snapshot")
      : null;
    const plan = await this.programs.run({
      runId: `console-session-${++this.programSequence}`,
      baseVersion: Number(this.sandbox?.revision ?? 0),
      seed: 0,
      source,
      mode,
      snapshot: {
        viewer: { camera }
      }
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
        this.#expectMaximum(tokens, 1, "help [topic]");
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
        return this.commands.execute("selection.clear");

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

      case "animate":
        return this.#animate(tokens);

      case "camera":
        return this.#camera(tokens);

      case "recovery":
        return this.#recovery(tokens);

      case "viewers":
        return this.#viewers(tokens);

      case "scale": {
        this.#expectExact(tokens, 3, "scale sx sy sz");
        const meshActive = Boolean(
          this.queries?.execute("mesh.edit.status")?.active
        );
        return this.commands.execute("selection.scale", {
          factors: tokens.map(value => meshActive
            ? this.#nonZero(value)
            : this.#positive(value))
        });
      }

      case "pivot":
        return this.#pivot(tokens);

      case "anchor":
      case "ancora":
        return this.#anchor(tokens);

      case "stroke-origin":
      case "origem-traco":
        return this.#strokeOrigin(tokens);

      case "duplicate":
        return this.#duplicate(tokens);

      case "group":
        return this.#group(tokens);

      case "ungroup":
        this.#expectMaximum(tokens,0,"ungroup");
        return this.commands.execute("selection.ungroup");

      case "fuse":
      case "fundir":
        return this.#fuse(tokens);

      case "repeat":
        return this.#repeat(tokens);

      case "delete":
        this.#expectMaximum(tokens, 0, "delete");
        return this.commands.execute("selection.delete");

      case "undo":
        this.#expectMaximum(tokens, 0, "undo");
        return this.commands.execute("history.undo");

      case "redo":
        this.#expectMaximum(tokens, 0, "redo");
        return this.commands.execute("history.redo");

      case "gizmo":
        this.#expectMaximum(tokens, 0, "gizmo");
        return this.commands.execute("gizmo.inspect");

      case "snap":
        return this.#snap(tokens);

      case "vertices":
        return this.#vertices(tokens);

      case "path":
        return this.#path(tokens);

      case "tool":
      case "tools":
        return this.#tool(tokens);

      case "mesh":
        return this.#mesh(tokens);

      case "benchmark":
        return this.#benchmark(tokens);

      case "selection":
        return this.#selection(tokens);

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
      if (String(topic).toLowerCase() === "experiment") {
        return this.#experimentHelp();
      }
      if (String(topic).toLowerCase() === "animate") {
        return this.#animationHelp();
      }
      if (String(topic).toLowerCase() === "camera") {
        return this.#cameraHelp();
      }
      if (String(topic).toLowerCase() === "recovery") {
        return this.#recoveryHelp();
      }
      if (String(topic).toLowerCase() === "viewers") {
        return this.#viewersHelp();
      }
      if (String(topic).toLowerCase() === "mesh") {
        return this.#meshHelp();
      }
      if (String(topic).toLowerCase() === "path") {
        return this.#pathHelp();
      }
      if (["tool", "tools"].includes(String(topic).toLowerCase())) {
        return this.#toolHelp();
      }
      throw new Error(`Tópico de ajuda desconhecido: ${topic}.`);
    }

    const diagnosticsAvailable = this.commands.describe().some(
      command => command.id === "runtime.test.run"
    );
    const diagnosticCommands = diagnosticsAvailable
      ? [
          "benchmark help",
          "benchmark compact 10000 1000 5",
          "benchmark scene 1000 5 100",
          "benchmark selection 1000 5",
          "benchmark compare|history|clear",
          "test help|all|sandbox|reducer|commands|project",
          "runtime test viewer-animation|animation-runtime|animation-commands|" +
          "affine-repeat|tool-parameters|tool-capabilities|performance-baseline|" +
          "experiment-contract|experiment-plugin|" +
          "experiment-panel|placement-frame|path-references|mesh-edit-math|" +
          "geometry-creation|geometry-registry|compact-resources|" +
          "file-interop|project-files|project-recovery|pwa-status|spatial-planning|" +
          "spatial-plan-commit|procedure-catalog|procedure-editor|all"
        ]
      : [
          "diagnóstico: reabra com ?application=diagnostics para testes e benchmarks"
        ];

    return {
      syntax: "Separe comandos por ponto e vírgula ou por quebra de linha.",
      commands: [
        "commands",
        ...diagnosticCommands,
        "selection stats",
        "runtime profile",
        "runtime ui-stats",
        "calc expressão JavaScript",
        "program código JavaScript",
        "procedure define|list|show|run|remove|export|import|help",
        "experiment id [parâmetro=valor ...]",
        "experiment list|show|run|plan|help",
        "animate spin|orbit|float|pulse|wave|rainbow [parâmetro=valor ...] [mode=selection|objects]",
        "animate move|rotate|scale expressão expressão expressão",
        "animate color \"hsl(...)|rgb(...)|mix(...)\" [mode=selection|objects]",
        "animate pause|resume|stop|status|list|help",
        "camera status|position|move|quaternion|lookat|orbit|frame|projection|restore|interpolate",
        "recovery status|help",
        "viewers status|open|sync|help",
        "session status|reset|cancel|help",
        "plan status|commit|discard|help",
        "help create",
        "help path",
        "help tool",
        "tool list|show|status|activate|run|get|set|finish|cancel|help",
        "path list|inspect|tube|sweep|array|help",
        "create help",
        "create tipo ... (consulte create help)",
        "position x y z",
        "move dx dy dz",
        "rotate xDeg yDeg zDeg",
        "scale sx sy sz",
        "duplicate",
        "group [nome]",
        "ungroup",
        "fuse families|strokes [nome]",
        "fundir familias|tracos [nome]",
        "duplicate count N [move|rotate|scale|pivot|matrix ...]",
        '  expressões: duplicate count 24 move "3*cos(i*pi/12)" 0 "3*sin(i*pi/12)"',
        '  rotação: rotate 0 "i*pi/12 rad" 0',
        "  pivot median|bounds|active",
        "  pivot absolute x y z",
        "  pivot relative dx dy dz",
        "repeat [count N]",
        "delete",
        "pivot median|bounds|active",
        "pivot absolute x y z",
        "pivot relative dx dy dz",
        "anchor status|bounds-center|origin|pivot|custom x y z",
        "ancora status|centro|origem|pivo|personalizada x y z",
        "stroke-origin rebase [x y z]",
        "origem-traco recalcular [x y z]",
        "vertices on|off",
        "mesh enter|status|apply|cancel|help",
        "mesh mode vertex|edge|face",
        "mesh select all|none|invert|grow|shrink|linked|boundary|normal [ângulo]",
        "mesh topology create-vertex position=x,y,z",
        "mesh topology create-edge",
        "mesh topology create-face",
        "mesh topology extrude distance=1",
        "mesh topology inset amount=0.2",
        "mesh topology subdivide|split|collapse|flip-edge|flip-normal|bridge|weld|delete|duplicate|fill|cleanup|recalculate-normals",
        "mesh frame world|local|viewer",
        "mesh constraint free|x|y|z|xy|xz|yz",
        "mesh snap on|off",
        "mesh snap mode auto|vertex|edge|face",
        "mesh snap scope active|scene",
        "mesh snap anchor active|pivot|nearest",
        "mesh snap tolerance px",
        "mesh influence on|off",
        "mesh influence set radius=5 metric=geodesic falloff=smooth axis=x",
        "mesh weld on|off",
        "mesh occlusion on|off",
        "mesh affine move|rotate|scale x y z",
        "snap move|rotate|scale valor",
        "snap grid on|off",
        "select object-id [object-id ...]",
        "select only|add|remove|toggle object-id [...]",
        "select gesture rectangle|brush|lasso|eraser [raio]",
        "select gesture off",
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

  #cameraHelp() {
    return {
      usage: [
        "camera status",
        "camera position x y z",
        "camera move dx dy dz [world|local]",
        "camera quaternion x y z w",
        "camera lookat x y z",
        "camera orbit yawDeg pitchDeg [distância]",
        "camera frame [margem]",
        "camera projection near far [fov]",
        "camera objects",
        "camera diagnostics",
        "camera helpers selected|all|none",
        "camera create [nome]",
        "camera activate id",
        "camera free",
        "camera capture id",
        "camera default id|none",
        "camera object-projection id near far [fov]",
        "camera restore câmera-JSON",
        "camera reset",
        "camera interpolate alpha câmera-JSON"
      ],
      notes: [
        "Quaternion é a orientação autoritativa; target é derivado.",
        "A navegação pertence ao viewer e não entra no undo.",
        "Objetos câmera e a câmera padrão pertencem ao documento e ao undo.",
        "Procedimentos podem usar camera.* e produzem plano revisável."
      ],
      examples: [
        "camera lookat 0 1 0",
        "camera orbit 30 -10",
        "camera frame 1.2",
        "program camera.orbit({yawDegrees:45}); return camera.view",
        "plan commit"
      ]
    };
  }

  #recoveryHelp() {
    return {
      commands: [
        "recovery status",
        "runtime test project-recovery"
      ],
      notes: [
        "A recuperação local usa IndexedDB e não substitui o arquivo .spatialseed.",
        "Somente checkpoints e comandos editoriais confirmados são persistidos.",
        "Seleção, câmera, painéis e animação não entram no registro."
      ]
    };
  }

  #recovery(tokens) {
    const action = (tokens.shift() ?? "status").toLowerCase();
    if (action === "help") {
      this.#expectMaximum(tokens, 0, "recovery help");
      return this.#recoveryHelp();
    }
    if (action === "status") {
      this.#expectMaximum(tokens, 0, "recovery status");
      return this.queries.execute("recovery.status");
    }
    throw new Error("Uso: recovery status|help.");
  }

  #viewersHelp() {
    return {
      commands: [
        "viewers status",
        "viewers sessions",
        "viewers open [sandboxId]",
        "viewers sync",
        "runtime test viewer-coordination"
      ],
      notes: [
        "Cada viewer conserva seleção e câmera próprias.",
        "O sandbox lógico é coordenado por revisão entre abas locais.",
        "Sessões listam os projetos que estão ativos neste navegador.",
        "Uma intenção obsoleta é rejeitada e o viewer recebe o estado atual."
      ]
    };
  }

  #viewers(tokens) {
    const action = (tokens.shift() ?? "status").toLowerCase();
    if (action === "help") {
      this.#expectMaximum(tokens, 0, "viewers help");
      return this.#viewersHelp();
    }
    if (action === "status") {
      this.#expectMaximum(tokens, 0, "viewers status");
      return this.queries.execute("viewer.instances.status");
    }
    if (action === "sessions") {
      this.#expectMaximum(tokens, 0, "viewers sessions");
      return this.queries.execute("viewer.sessions.status");
    }
    if (action === "open") {
      this.#expectMaximum(tokens, 1, "viewers open [sandboxId]");
      const sandboxId = tokens.shift();
      return this.commands.execute(
        "viewer.instance.open",
        sandboxId ? { sandboxId } : {}
      );
    }
    if (action === "sync") {
      this.#expectMaximum(tokens, 0, "viewers sync");
      return this.commands.execute("viewer.instance.sync");
    }
    throw new Error(
      "Uso: viewers status|sessions|open [sandboxId]|sync|help."
    );
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
        "O catálogo web persiste localmente entre reinicializações.",
        "Arquivos JSON podem ser exportados e importados pelo menu Projeto.",
        "run aceita JSON e pode produzir um plano espacial ou de câmera.",
        "Planos não misturam mutações espaciais com câmera local.",
        "merge rejeita conflitos; replace troca o catálogo atomicamente."
      ],
      examples: [
        "procedure define tower ({height=8}={}) => " +
          "spatial.create('box',{size:[2,height,2],position:[0,height/2,0]})",
        "procedure run tower {\"height\":12}",
        "procedure define orbit ({degrees=30}={}) => " +
          "camera.orbit({yawDegrees:degrees})",
        "procedure run orbit {\"degrees\":45}",
        "plan commit"
      ]
    };
  }

  #experimentHelp() {
    return {
      usage: [
        "experiment id [parâmetro=valor ...]",
        "experiment run id [parâmetro=valor ...]",
        "experiment plan id [parâmetro=valor ...]",
        "experiment list",
        "experiment show id",
        "plan status|commit|discard"
      ],
      notes: [
        "Experimentos descrevem parâmetros e uma função espacial.",
        "A forma curta e run criam o resultado atomicamente.",
        "plan prepara uma prévia; plan commit aplica e discard descarta.",
        "JSON continua aceito para automação e compatibilidade."
      ],
      examples: [
        "experiment list",
        "experiment show math.helix",
        "experiment helix turns=4 count=120 radius=3",
        "experiment plan helix {\"turns\":4,\"count\":120}",
        "plan commit"
      ]
    };
  }

  #animationHelp() {
    return {
      usage: [
        "animate spin|orbit|float|pulse|wave|rainbow [parâmetro=valor ...]",
        "animate move expressão-x expressão-y expressão-z",
        "animate rotate expressão-x expressão-y expressão-z",
        "animate scale expressão-x expressão-y expressão-z",
        "animate matrix m00 ... m15",
        "animate pause|resume|stop|status|list"
      ],
      variables: {
        t: "tempo da simulação em segundos",
        dt: "passo fixo em segundos",
        i: "índice do item, começando em 1",
        u: "posição normalizada entre 0 e 1",
        count: "quantidade de unidades animadas"
      },
      notes: [
        "A seleção atual é capturada quando a animação começa.",
        "mode=selection preserva grupos; mode=objects abre grupos em objetos.",
        "A sessão é reproduzida em todos os viewers locais do sandbox.",
        "A animação é visual e não altera histórico nem arquivo.",
        "Edições da cena encerram a sessão compartilhada.",
        "Expressões usam a linguagem matemática afim segura."
      ],
      examples: [
        "animate spin speed=45 axis=y",
        "animate orbit radius=4 speed=30 axis=y",
        "animate wave amplitude=1 frequency=0.5 phase=0.35 mode=objects",
        "animate rainbow speed=60 saturation=0.8 mode=objects",
        "animate color \"hsl(60*t + 360*u,0.8,0.55)\" mode=objects",
        "animate move \"2 * sin(t)\" 0 0",
        "animate rotate 0 \"90 * t + 20 * sin(tau * t)\" 0",
        "animate scale \"1 + 0.2 * sin(tau * t)\" " +
          "\"1 + 0.2 * sin(tau * t)\" " +
          "\"1 + 0.2 * sin(tau * t)\"",
        "animate pause",
        "animate resume",
        "animate stop"
      ]
    };
  }

  #camera(tokens) {
    const action = (tokens.shift() ?? "status").toLowerCase();

    if (action === "help") {
      this.#expectMaximum(tokens, 0, "camera help");
      return this.#cameraHelp();
    }
    if (action === "status") {
      this.#expectMaximum(tokens, 0, "camera status");
      return this.queries.execute("viewer.camera.snapshot");
    }
    if (action === "position") {
      this.#expectExact(tokens, 3, "camera position x y z");
      return this.commands.execute("viewer.camera.pose.set", {
        position: tokens.map(value => this.#number(value))
      });
    }
    if (action === "move") {
      if (![3, 4].includes(tokens.length)) {
        throw new Error("Uso: camera move dx dy dz [world|local].");
      }
      const delta = tokens.slice(0, 3).map(value => this.#number(value));
      const space = (tokens[3] ?? "world").toLowerCase();
      return this.commands.execute("viewer.camera.move", {
        delta,
        space
      });
    }
    if (action === "quaternion") {
      this.#expectExact(tokens, 4, "camera quaternion x y z w");
      return this.commands.execute("viewer.camera.pose.set", {
        quaternion: tokens.map(value => this.#number(value))
      });
    }
    if (action === "lookat") {
      this.#expectExact(tokens, 3, "camera lookat x y z");
      return this.commands.execute("viewer.camera.look-at", {
        target: tokens.map(value => this.#number(value))
      });
    }
    if (action === "orbit") {
      if (![2, 3].includes(tokens.length)) {
        throw new Error(
          "Uso: camera orbit yawDeg pitchDeg [distância]."
        );
      }
      return this.commands.execute("viewer.camera.orbit", {
        yawDegrees: this.#number(tokens[0]),
        pitchDegrees: this.#number(tokens[1]),
        ...(tokens[2] === undefined
          ? {}
          : { distance: this.#positive(tokens[2]) })
      });
    }
    if (action === "frame") {
      this.#expectMaximum(tokens, 1, "camera frame [margem]");
      return this.commands.execute("viewer.camera.frame-selection", {
        ...(tokens[0] === undefined
          ? {}
          : { padding: this.#positive(tokens[0]) })
      });
    }
    if (action === "projection") {
      if (![2, 3].includes(tokens.length)) {
        throw new Error("Uso: camera projection near far [fov].");
      }
      return this.commands.execute("viewer.camera.projection.set", {
        near: this.#positive(tokens[0]),
        far: this.#positive(tokens[1]),
        ...(tokens[2] === undefined
          ? {}
          : { fov: this.#positive(tokens[2]) })
      });
    }
    if (action === "objects") {
      this.#expectMaximum(tokens, 0, "camera objects");
      return this.queries.execute("camera.objects.list");
    }
    if (action === "diagnostics") {
      this.#expectMaximum(tokens, 0, "camera diagnostics");
      return this.queries.execute("camera.objects.diagnostics");
    }
    if (action === "helpers") {
      this.#expectExact(tokens, 1, "camera helpers selected|all|none");
      if (!["selected", "all", "none"].includes(tokens[0])) {
        throw new Error(
          "Auxiliares devem ser selected, all ou none."
        );
      }
      return this.commands.execute("viewer.camera.helpers.set", {
        helperPolicy: tokens[0]
      });
    }
    if (action === "create") {
      return this.commands.execute("camera.object.create", {
        ...(tokens.length ? { name: tokens.join(" ") } : {}),
        camera: this.queries.execute("viewer.camera.snapshot"),
        activate: true
      });
    }
    if (action === "activate") {
      this.#expectExact(tokens, 1, "camera activate id");
      return this.commands.execute(
        "viewer.camera.object.activate",
        { id: tokens[0] }
      );
    }
    if (action === "free") {
      this.#expectMaximum(tokens, 0, "camera free");
      return this.commands.execute(
        "viewer.camera.object.deactivate"
      );
    }
    if (action === "capture") {
      this.#expectExact(tokens, 1, "camera capture id");
      return this.commands.execute(
        "camera.object.capture-viewer",
        { id: tokens[0] }
      );
    }
    if (action === "default") {
      this.#expectExact(tokens, 1, "camera default id|none");
      return this.commands.execute(
        "camera.object.default.set",
        {
          id: tokens[0].toLowerCase() === "none"
            ? null
            : tokens[0]
        }
      );
    }
    if (action === "object-projection") {
      if (![3, 4].includes(tokens.length)) {
        throw new Error(
          "Uso: camera object-projection id near far [fov]."
        );
      }
      return this.commands.execute(
        "camera.object.projection.set",
        {
          id: tokens[0],
          near: this.#positive(tokens[1]),
          far: this.#positive(tokens[2]),
          ...(tokens[3] === undefined
            ? {}
            : { fov: this.#positive(tokens[3]) })
        }
      );
    }
    if (action === "restore") {
      if (!tokens.length) {
        throw new Error("Uso: camera restore câmera-JSON.");
      }
      return this.commands.execute("viewer.camera.restore", {
        camera: parseJson(tokens.join(" "), "Câmera")
      });
    }
    if (action === "reset") {
      this.#expectMaximum(tokens, 0, "camera reset");
      return this.commands.execute("viewer.camera.reset");
    }
    if (action === "interpolate") {
      if (tokens.length < 2) {
        throw new Error(
          "Uso: camera interpolate alpha câmera-JSON."
        );
      }
      const alpha = this.#number(tokens.shift());
      return this.commands.execute("viewer.camera.interpolate", {
        alpha,
        to: parseJson(tokens.join(" "), "Câmera")
      });
    }

    throw new Error(`Ação de câmera desconhecida: ${action}.`);
  }

  #animate(tokens) {
    const action = (tokens.shift() ?? "status").toLowerCase();

    if (action === "help") {
      this.#expectMaximum(tokens, 0, "animate help");
      return this.#animationHelp();
    }
    if (action === "status") {
      this.#expectMaximum(tokens, 0, "animate status");
      return this.commands.execute("animation.status");
    }
    if (action === "list") {
      this.#expectMaximum(tokens, 0, "animate list");
      return this.commands.execute("animation.presets.describe");
    }
    if (action === "pause") {
      this.#expectMaximum(tokens, 0, "animate pause");
      return this.commands.execute("animation.pause");
    }
    if (action === "resume" || action === "play") {
      this.#expectMaximum(tokens, 0, `animate ${action}`);
      return this.commands.execute("animation.resume");
    }
    if (action === "stop") {
      this.#expectMaximum(tokens, 0, "animate stop");
      return this.commands.execute("animation.stop");
    }

    if (["move", "rotate", "scale"].includes(action)) {
      this.#expectExact(
        tokens,
        3,
        `animate ${action} expressão-x expressão-y expressão-z`
      );
      return this.commands.execute("animation.start", {
        id: `custom.${action}`,
        operations: [{
          type: action,
          value: tokens.map(value => this.#affineValue(value))
        }]
      });
    }

    if (action === "matrix") {
      this.#expectExact(tokens, 16, "animate matrix m00 ... m15");
      return this.commands.execute("animation.start", {
        id: "custom.matrix",
        operations: [{
          type: "matrix",
          value: tokens.map(value => this.#affineValue(value))
        }]
      });
    }

    if (action === "color") {
      let targetMode = "selection";
      const modeIndex = tokens.findIndex(token => token.startsWith("mode="));
      if (modeIndex >= 0) {
        targetMode = tokens.splice(modeIndex, 1)[0].slice("mode=".length);
      }
      if (!["selection", "objects"].includes(targetMode) || tokens.length !== 1) {
        throw new Error(
          'Uso: animate color "hsl(...)|rgb(...)|mix(...)" [mode=selection|objects].'
        );
      }
      return this.commands.execute("animation.start", {
        id: "custom.color",
        operations: [{ type: "color", value: tokens[0] }],
        targetMode
      });
    }

    let presetId = action;
    if (action === "preset") {
      presetId = (tokens.shift() ?? "").toLowerCase();
      if (!presetId) {
        throw new Error("Uso: animate preset id [parâmetro=valor ...].");
      }
    }
    const parameters = parseExperimentParameters(tokens.join(" "));
    const targetMode = parameters.mode ?? "selection";
    delete parameters.mode;
    if (!["selection", "objects"].includes(targetMode)) {
      throw new Error("mode deve ser selection ou objects.");
    }
    return this.commands.execute("animation.preset", {
      id: presetId,
      parameters,
      targetMode
    });
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

    const supported = this.geometryRegistry?.list() ??
      ["box", "sphere", "cylinder", "plane", "polygon"];
    if (!supported.includes(type)) {
      throw new Error(
        `Geometria desconhecida: ${type ?? "(vazia)"}. Use create help.`
      );
    }

    const description = this.#geometryDescription(type);
    const geometry = description
      ? defaultGeometryFromDescription(description)
      : defaultGeometry(type);
    const planar = description?.placement === "planar" ||
      ["plane", "polygon"].includes(type);
    const placement = {
      origin: [0, planar ? 0.02 : 1, 0],
      plane: planar ? "xz" : "xy",
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
      if (
        option === "points" &&
        !this.#geometryParameter(type, "points")
      ) {
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

    const parameter = this.#geometryParameter(type, option);
    if (parameter) {
      geometry[parameter.id] = this.#readGeometryParameter(parameter, tokens);
      return;
    }

    throw new Error(`Opção inválida para ${type}: ${option}. Use create help.`);
  }

  #geometryDescription(type) {
    return this.geometryRegistry?.describe().find(description =>
      description.type === type
    ) ?? null;
  }

  #geometryParameter(type, option) {
    const normalized = String(option).toLowerCase();
    return this.#geometryDescription(type)?.parameters.find(parameter =>
      String(parameter.id).toLowerCase() === normalized
    ) ?? null;
  }

  #readGeometryParameter(parameter, tokens) {
    if (["vector3", "integer-vector3"].includes(parameter.type)) {
      if (tokens.length < 3) {
        throw new Error(`Uso: ${parameter.id} x y z`);
      }
      return Array.from({ length: 3 }, () => {
        const value = this.#number(tokens.shift());
        if (parameter.type === "integer-vector3" && !Number.isInteger(value)) {
          throw new Error(`${parameter.id} deve conter inteiros.`);
        }
        return value;
      });
    }

    const raw = tokens.shift();
    if (raw === undefined) {
      throw new Error(`Valor ausente para ${parameter.id}.`);
    }

    if (parameter.type === "boolean") {
      const value = String(raw).toLowerCase();
      if (["true", "1", "yes", "sim"].includes(value)) return true;
      if (["false", "0", "no", "nao", "não"].includes(value)) return false;
      throw new Error(`${parameter.id} deve ser true ou false.`);
    }

    if (parameter.type === "enum") {
      return String(raw);
    }

    if (parameter.type === "json") {
      try {
        return JSON.parse(raw);
      } catch (error) {
        throw new Error(`${parameter.id}: JSON inválido.`, { cause: error });
      }
    }

    const value = this.#number(raw);
    if (parameter.type === "integer" && !Number.isInteger(value)) {
      throw new Error(`${parameter.id} deve ser inteiro.`);
    }
    return value;
  }

  #createHelp() {
    return {
      families: this.geometryRegistry?.describe().map(description => ({
        type: description.type,
        label: description.label,
        parameters: description.parameters.map(parameter => parameter.id)
      })) ?? ["box", "sphere", "cylinder", "plane", "polygon"],
      usage: [
        "create tipo [parametro valor ...] [referencial] [color #rrggbb]",
        "parâmetros JSON devem ser um token JSON ou estar entre aspas simples",
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
        "create torus radius 3 tube 0.6 radialSegments 16 tubularSegments 64",
        "create lathe points '[[0,-1],[1,-1],[1,1],[0,1]]' segments 32",
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

  #fuse(tokens) {
    const target = String(tokens.shift() ?? "help").toLowerCase();
    if (["help", "ajuda"].includes(target)) {
      this.#expectMaximum(tokens, 0, "fuse help");
      return {
        usage: [
          "fuse families [nome]",
          "fuse strokes [nome]",
          "fundir familias [nome]",
          "fundir tracos [nome]"
        ],
        semantics: {
          families: "Funde famílias instanciadas compatíveis em famílias compactas.",
          strokes: "Funde conjuntos de traços selecionados em um objeto lógico."
        }
      };
    }
    const name = tokens.join(" ").trim();
    if (["family", "families", "familia", "familias", "instances"].includes(target)) {
      return this.commands.execute(
        "selection.instances.fuse",
        name ? { name } : {}
      );
    }
    if (["stroke", "strokes", "trace", "traces", "traco", "tracos", "traço", "traços"].includes(target)) {
      return this.commands.execute(
        "selection.strokes.fuse",
        name ? { name } : {}
      );
    }
    throw new Error(
      "Uso: fuse families|strokes [nome]."
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
          "property batch id \"expressão\" [scope=selection|renderables]",
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

    if (action === "batch") {
      let targetScope = "selection";
      const scopeIndex = tokens.findIndex(token => token.startsWith("scope="));
      if (scopeIndex >= 0) {
        targetScope = tokens.splice(scopeIndex, 1)[0].slice("scope=".length);
      }
      if (!["selection", "renderables"].includes(targetScope)) {
        throw new Error("scope deve ser selection ou renderables.");
      }
      const expression = tokens.join(" ").trim();
      if (!expression) {
        throw new Error(`Uso: property batch ${id} \"expressão\".`);
      }
      return this.commands.execute(
        "selection.properties.applyExpression",
        { propertyId: id, expression, targetScope }
      );
    }

    if (action === "unset") {
      this.#expectMaximum(tokens, 0, `property unset ${id}`);
      return this.commands.execute(
        "selection.properties.unset",
        { properties: [id] }
      );
    }

    if (action !== "set") {
      throw new Error(
        "Uso: property list|inspect|set|batch|unset."
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

  #path(tokens) {
    const action = String(tokens.shift() ?? "list").toLowerCase();
    if (["help", "?"].includes(action)) {
      this.#expectMaximum(tokens, 0, "path help");
      return this.#pathHelp();
    }
    if (action === "list") {
      this.#expectMaximum(tokens, 0, "path list");
      return this.queries?.execute("path.references.list") ?? [];
    }
    const options = parseNamedOptions(tokens);
    if (["draw", "sketch"].includes(action)) {
      if (options.count !== undefined) {
        throw new Error(
          "path draw não usa count; escolha spacing=auto ou spacing=<distância>."
        );
      }
      const spacing = pathDrawSpacingOptions(options, value =>
        this.#number(value)
      );
      const sourceGeometry = pathDrawGeometryOptions(options);
      return this.commands.execute("path.sketch.begin", {
        ...providedText(options, "mode", "mode"),
        ...providedText(options, "plane", "planeSource"),
        ...providedInteger(options, "sample", "inputSamplePixels"),
        ...providedNumber(options, "simplify", "simplify"),
        ...providedInteger(options, "smoothing", "smoothIterations"),
        ...providedNumber(options, "radius", "radius"),
        ...providedInteger(options, "segments", "tubularSegments"),
        ...providedInteger(options, "radial", "radialSegments"),
        ...providedText(options, "curve", "curveType"),
        ...providedNumber(options, "tension", "tension"),
        ...providedText(options, "color", "color"),
        ...providedBoolean(options, "closed", "closed"),
        ...providedText(options, "source", "sourceMode"),
        ...providedText(options, "geometry", "geometryType"),
        ...sourceGeometry,
        ...providedText(options, "brushColor", "sourceColor"),
        ...spacing,
        ...providedNumber(options, "spacingScale", "spacingScale"),
        ...providedBoolean(options, "align", "align"),
        ...providedNumber(options, "twist", "twistDegrees"),
        ...providedText(options, "orientation", "orientationMode"),
        ...providedText(options, "moveX", "affineMoveX"),
        ...providedText(options, "moveY", "affineMoveY"),
        ...providedText(options, "moveZ", "affineMoveZ"),
        ...providedText(options, "rotateX", "affineRotateX"),
        ...providedText(options, "rotateY", "affineRotateY"),
        ...providedText(options, "rotateZ", "affineRotateZ"),
        ...providedText(options, "scale", "affineScale"),
        ...providedNumber(options, "uLength", "affineULength"),
        ...providedText(options, "colorExpr", "affineColor"),
        ...providedText(options, "affineColor", "affineColor"),
        ...providedBoolean(options, "continuous", "continuous")
      });
    }
    const path = pathReferenceFromOptions(options, {
      objectKey: action === "sweep" ? "path" : "object",
      extractionKey: action === "sweep" ? "pathExtraction" : "extraction"
    });
    if (action === "inspect") {
      return this.commands.execute("path.reference.inspect", {
        kind: options.kind ?? "path",
        reference: path
      });
    }
    if (action === "tube") {
      return this.commands.execute("path.tube.create", {
        path,
        ...providedText(options, "name", "name"),
        ...providedNumber(options, "radius", "radius"),
        ...providedInteger(options, "segments", "tubularSegments"),
        ...providedInteger(options, "radial", "radialSegments"),
        ...providedBoolean(options, "closed", "closed"),
        ...providedText(options, "curve", "curveType"),
        ...providedNumber(options, "tension", "tension"),
        ...providedText(options, "color", "color")
      });
    }
    if (action === "sweep") {
      const profile = pathReferenceFromOptions(options, {
        objectKey: "profile",
        extractionKey: "profileExtraction"
      });
      return this.commands.execute("path.sweep.create", {
        path,
        profile,
        ...providedText(options, "name", "name"),
        ...providedInteger(options, "segments", "segments"),
        ...providedBoolean(options, "closed", "closedPath"),
        ...providedText(options, "curve", "curveType"),
        ...providedNumber(options, "tension", "tension"),
        ...providedNumber(options, "twist", "twistDegrees"),
        ...providedNumber(options, "scaleStart", "scaleStart"),
        ...providedNumber(options, "scaleEnd", "scaleEnd"),
        ...providedBoolean(options, "caps", "caps"),
        ...providedText(options, "color", "color")
      });
    }
    if (action === "array") {
      return this.commands.execute("path.array.create", {
        path,
        ...providedInteger(options, "count", "count"),
        ...providedBoolean(options, "align", "align"),
        ...providedBoolean(options, "closed", "closed"),
        ...providedText(options, "curve", "curveType"),
        ...providedNumber(options, "tension", "tension"),
        ...providedNumber(options, "twist", "twistDegrees"),
        ...providedBoolean(options, "includePath", "includePathObject")
      });
    }
    throw new Error("Uso: path list|inspect|draw|tube|sweep|array|help.");
  }

  #tool(tokens) {
    const action = String(tokens.shift() ?? "list").toLowerCase();
    if (["help", "?"].includes(action)) {
      this.#expectMaximum(tokens, 0, "tool help");
      return this.#toolHelp();
    }
    if (action === "list") {
      this.#expectMaximum(tokens, 1, "tool list [object|vertex|edge|face]");
      const subjectLevel = tokens.shift();
      return this.#query("authoring.tools.list", subjectLevel
        ? { context: { subjectLevel }, includeUnavailable: false }
        : {});
    }
    if (action === "show") {
      this.#expectExact(tokens, 1, "tool show id");
      return this.#query("authoring.tool.describe", {
        toolId: tokens[0]
      });
    }
    if (action === "status") {
      this.#expectMaximum(tokens, 1, "tool status [id]");
      return this.#query("authoring.tool.status", tokens.length
        ? { toolId: tokens[0] }
        : {});
    }
    if (action === "get") {
      this.#expectExact(tokens, 1, "tool get id");
      return this.#query("authoring.tool.parameters.get", {
        toolId: tokens[0]
      });
    }
    if (["activate", "run", "set"].includes(action)) {
      const toolId = tokens.shift();
      if (!toolId) {
        throw new Error(`Uso: tool ${action} id [parâmetro=valor ...].`);
      }
      const values = parseToolOptions(tokens);
      if (action === "activate") {
        return this.commands.execute("authoring.tool.activate", {
          toolId,
          options: values
        });
      }
      if (action === "run") {
        return this.commands.execute("authoring.tool.execute", {
          toolId,
          input: values
        });
      }
      return this.commands.execute("authoring.tool.parameters.set", {
        toolId,
        patch: values
      });
    }
    if (["finish", "cancel"].includes(action)) {
      this.#expectMaximum(tokens, 1, `tool ${action} [id]`);
      const toolId = tokens.shift() ?? this.#activeCanonicalToolId(action);
      return this.commands.execute(`authoring.tool.${action}`, { toolId });
    }
    throw new Error(
      "Uso: tool list|show|status|activate|run|get|set|finish|cancel|help."
    );
  }

  #activeCanonicalToolId(operation) {
    const active = this.#query("authoring.tools.list")
      .filter(tool => tool.state.active && tool.operations[operation]);
    const continuous = active.filter(tool => tool.kind === "continuous");
    const candidates = continuous.length ? continuous : active;
    if (candidates.length === 1) return candidates[0].id;
    if (!candidates.length) {
      throw new Error(
        `Nenhuma ferramenta ativa suporta ${operation}.`
      );
    }
    throw new Error(
      `Mais de uma ferramenta ativa suporta ${operation}: ` +
      `${candidates.map(tool => tool.id).join(", ")}. Informe o ID.`
    );
  }

  #toolHelp() {
    return {
      usage: [
        "tool list [object|vertex|edge|face]",
        "tool show id",
        "tool status [id]",
        "tool activate id [parâmetro=valor ...]",
        "tool run id [parâmetro=valor ...]",
        "tool get id",
        "tool set id parâmetro=valor [...]",
        "tool finish [id]",
        "tool cancel [id]"
      ],
      examples: [
        "tool activate transform.translate",
        "tool activate draw.tube radius=0.12 radialSegments=8",
        "tool activate draw.array sourceMode=catalog geometryType=sphere spacingMode=world spacingWorld=0.5",
        "tool run mesh.extrude distance=2",
        "tool set draw.array affineRotateZ=360*u affineScale=0.5+u"
      ],
      notes: [
        "Mover, girar e escalar usam os mesmos IDs nos contextos objeto e malha.",
        "draw.tube e draw.array são intenções distintas sobre o mesmo capturador de caminho.",
        "A fachada encaminha para os comandos existentes; não mantém documento ou histórico próprios."
      ]
    };
  }

  #pathHelp() {
    return {
      usage: [
        "path list",
        "path inspect object=id extraction=auto|centerline|boundary|loose-edges",
        "path draw mode=tube plane=locked-or-viewer radius=0.08 curve=centripetal",
        "path draw mode=array source=selection spacing=auto align=on twist=0",
        "path draw mode=array source=catalog geometry=sphere params={\"radius\":0.4} spacing=0.75",
        "path draw mode=array orientation=plane uLength=4 rotateZ=360*u scale=0.5+u colorExpr=hsl(360*u,0.8,0.55)",
        "path tube object=id radius=0.25 segments=64 radial=8 closed=off",
        "path sweep path=id profile=id pathExtraction=auto profileExtraction=auto segments=32 twist=0 scaleStart=1 scaleEnd=1 caps=on",
        "path array object=id count=8 align=on closed=off includePath=off",
        "path tube object=@selection-origins ..."
      ],
      notes: [
        "object, path e profile aceitam ID; use name:Nome para resolver um nome único.",
        "@selection-origins usa os pivôs dos objetos selecionados na ordem da seleção.",
        "Opções omitidas recuperam a última configuração válida da ferramenta.",
        "path draw mode=array acrescenta instâncias conforme o traço avança; não exige quantidade prévia.",
        "source=selection usa objeto/grupo selecionado; source=catalog aceita qualquer geometry do catálogo.",
        "params={...} configura o provider do catálogo; geometry deve ser informado na mesma execução.",
        "orientation=preserve|plane|path escolhe os eixos locais do modificador.",
        "moveX/Y/Z, rotateX/Y/Z, scale e colorExpr aceitam i, u, count, d, length, spacing, k, x, y e z.",
        "i começa em 1; u=d/uLength é estável quando o traço cresce. Use fract(u) para ciclos.",
        "Escala negativa usa seu módulo e inverte a cor da instância.",
        "As referências são snapshots: alterar depois o objeto de origem não altera o resultado criado.",
        "A varredura usa frames de transporte paralelo para reduzir torção artificial.",
        "Perfis com furos e referências vinculadas exigem um futuro grafo de modificadores."
      ]
    };
  }

  #mesh(tokens) {
    const action = String(tokens.shift() ?? "status").toLowerCase();

    if (action === "help") {
      this.#expectMaximum(tokens, 0, "mesh help");
      return this.#meshHelp();
    }
    if (action === "status") {
      this.#expectMaximum(tokens, 0, "mesh status");
      return this.queries?.execute("mesh.edit.status") ?? { active: false };
    }
    if (action === "enter") {
      this.#expectMaximum(tokens, 0, "mesh enter");
      return this.commands.execute("mesh.edit.enter");
    }
    if (["apply", "commit"].includes(action)) {
      this.#expectMaximum(tokens, 0, `mesh ${action}`);
      return this.commands.execute("mesh.edit.commit");
    }
    if (action === "cancel") {
      this.#expectMaximum(tokens, 0, "mesh cancel");
      return this.commands.execute("mesh.edit.cancel");
    }
    if (["undo", "redo"].includes(action)) {
      this.#expectMaximum(tokens, 0, `mesh ${action}`);
      return this.commands.execute(`mesh.edit.${action}`);
    }
    if (action === "mode") {
      this.#expectExact(tokens, 1, "mesh mode vertex|edge|face");
      const mode = String(tokens[0]).toLowerCase();
      if (!["vertex", "edge", "face"].includes(mode)) {
        throw new Error("Uso: mesh mode vertex|edge|face");
      }
      return this.commands.execute("mesh.component.mode.set", { mode });
    }
    if (action === "select") {
      if (!tokens.length || tokens.length > 2) {
        throw new Error("Uso: mesh select all|none|invert|grow|shrink|linked|boundary|normal [ângulo]");
      }
      const raw = String(tokens.shift()).toLowerCase();
      const aliases = { clear: "none", normal: "by-normal" };
      const operation = aliases[raw] ?? raw;
      const allowed = ["all", "none", "invert", "grow", "shrink", "linked", "boundary", "by-normal"];
      if (!allowed.includes(operation)) {
        throw new Error("Uso: mesh select all|none|invert|grow|shrink|linked|boundary|normal [ângulo]");
      }
      const options = operation === "by-normal"
        ? { angleDegrees: tokens.length ? this.#number(tokens[0]) : 15 }
        : {};
      return this.commands.execute("mesh.selection.apply", { operation, options });
    }
    if (action === "topology" || [
      "create-vertex", "create-edge", "create-face", "fill", "duplicate",
      "delete", "extrude", "inset", "subdivide", "split", "collapse",
      "flip-edge", "flip-normal", "bridge", "weld", "cleanup", "recalculate-normals"
    ].includes(action)) {
      const operation = action === "topology"
        ? String(tokens.shift() ?? "").toLowerCase()
        : action;
      if (!operation) {
        throw new Error("Uso: mesh topology operação [opção=valor]");
      }
      const options = {};
      for (const token of tokens) {
        const separator = token.indexOf("=");
        if (separator < 1) {
          if (operation === "extrude" && options.distance === undefined) {
            options.distance = this.#number(token);
            continue;
          }
          throw new Error(`Opção topológica inválida: ${token}.`);
        }
        const name = token.slice(0, separator);
        const raw = token.slice(separator + 1);
        if (["distance", "amount", "parameter"].includes(name)) {
          options[name] = this.#number(raw);
        } else if (["position", "offset", "vector"].includes(name)) {
          const values = raw.split(",").map(value => this.#number(value));
          if (values.length !== 3) throw new Error(`${name} exige x,y,z.`);
          options[name] = values;
        } else if (["target"].includes(name)) {
          options[name] = raw;
        } else if (["reverse", "preserveOrder", "manifoldOnly", "removeUnused"].includes(name)) {
          if (!["on", "off", "true", "false"].includes(raw)) {
            throw new Error(`${name} exige on|off.`);
          }
          options[name] = ["on", "true"].includes(raw);
        } else {
          throw new Error(`Opção topológica desconhecida: ${name}.`);
        }
      }
      return this.commands.execute("mesh.topology.apply", { operation, options });
    }
    if (action === "frame") {
      this.#expectExact(tokens, 1, "mesh frame world|local|viewer");
      const mode = String(tokens[0]).toLowerCase();
      if (!["world", "local", "viewer"].includes(mode)) {
        throw new Error("Uso: mesh frame world|local|viewer");
      }
      return this.commands.execute("mesh.frame.set", { mode });
    }
    if (action === "constraint") {
      this.#expectExact(tokens, 1, "mesh constraint free|x|y|z|xy|xz|yz");
      const mode = String(tokens[0]).toLowerCase();
      if (!["free", "x", "y", "z", "xy", "xz", "yz"].includes(mode)) {
        throw new Error("Uso: mesh constraint free|x|y|z|xy|xz|yz");
      }
      return this.commands.execute("mesh.constraint.set", { mode });
    }
    if (action === "snap") {
      const property = String(tokens.shift() ?? "").toLowerCase();
      const value = String(tokens.shift() ?? "").toLowerCase();
      this.#expectMaximum(tokens, 0, "mesh snap on|off|mode|scope|anchor|tolerance|self");
      if (["on", "off"].includes(property) && !value) {
        return this.commands.execute("mesh.snap.set", { enabled: property === "on" });
      }
      if (property === "mode" && ["auto", "vertex", "edge", "face"].includes(value)) {
        return this.commands.execute("mesh.snap.set", { mode: value });
      }
      if (property === "scope" && ["active", "scene"].includes(value)) {
        return this.commands.execute("mesh.snap.set", { scope: value });
      }
      if (property === "anchor" && ["active", "pivot", "nearest"].includes(value)) {
        return this.commands.execute("mesh.snap.set", { anchor: value });
      }
      if (property === "tolerance") {
        return this.commands.execute("mesh.snap.set", {
          tolerancePixels: this.#number(value)
        });
      }
      if (property === "self" && ["on", "off"].includes(value)) {
        return this.commands.execute("mesh.snap.set", { self: value === "on" });
      }
      throw new Error("Uso: mesh snap on|off | mode auto|vertex|edge|face | scope active|scene | anchor active|pivot|nearest | tolerance px | self on|off");
    }
    if (action === "influence") {
      const mode = String(tokens.shift() ?? "status").toLowerCase();
      if (mode === "status") {
        this.#expectMaximum(tokens, 0, "mesh influence status");
        return this.queries?.execute("mesh.edit.status")?.deformation ?? null;
      }
      if (["on", "off"].includes(mode)) {
        this.#expectMaximum(tokens, 0, "mesh influence on|off");
        return this.commands.execute("mesh.deform.settings.set", {
          enabled: mode === "on"
        });
      }
      if (mode !== "set") {
        throw new Error(
          "Uso: mesh influence on|off|status|set radius=n metric=... falloff=... axis=x damping=n frequency=n falloffExpr=... var.nome=n"
        );
      }
      const args = { variables: {}, elastic: {} };
      for (const token of tokens) {
        const separator = token.indexOf("=");
        if (separator < 1) {
          throw new Error(`Opção de influência inválida: ${token}.`);
        }
        const name = token.slice(0, separator);
        const raw = token.slice(separator + 1);
        if (name === "radius") args.radius = this.#number(raw);
        else if (name === "metric") args.metric = raw;
        else if (name === "falloff") args.falloff = raw;
        else if (name === "axis") args.axis = raw;
        else if (name === "damping") args.elastic.damping = this.#number(raw);
        else if (name === "frequency") args.elastic.frequency = this.#number(raw);
        else if (name === "falloffExpr") args.falloffExpression = raw;
        else if (name.startsWith("var.")) {
          args.variables[name.slice(4)] = this.#number(raw);
        } else throw new Error(`Opção de influência desconhecida: ${name}.`);
      }
      if (!Object.keys(args.variables).length) delete args.variables;
      if (!Object.keys(args.elastic).length) delete args.elastic;
      return this.commands.execute("mesh.deform.settings.set", args);
    }

    if (["weld", "occlusion"].includes(action)) {
      this.#expectExact(tokens, 1, `mesh ${action} on|off`);
      const value = String(tokens[0]).toLowerCase();
      if (!["on", "off"].includes(value)) {
        throw new Error(`Uso: mesh ${action} on|off`);
      }
      return this.commands.execute("mesh.options.set", {
        [action === "weld" ? "weldCoincident" : "occlusion"]:
          value === "on"
      });
    }
    if (action === "affine") {
      this.#expectExact(tokens, 4, "mesh affine move|rotate|scale x y z");
      const type = String(tokens.shift()).toLowerCase();
      if (!["move", "rotate", "scale"].includes(type)) {
        throw new Error("Uso: mesh affine move|rotate|scale x y z");
      }
      const value = tokens.map(token => type === "scale"
        ? this.#nonZero(token)
        : this.#number(token));
      return this.commands.execute("mesh.affine.apply", {
        operations: [{ type, value }]
      });
    }
    if (action === "deform") {
      if (tokens.length < 4) {
        throw new Error("Uso: mesh deform move|rotate|scale exprX exprY exprZ [radius=n metric=... falloff=... axis=x var.nome=n]");
      }
      const operation = String(tokens.shift()).toLowerCase();
      if (!["move", "rotate", "scale"].includes(operation)) {
        throw new Error("Operação procedural deve ser move, rotate ou scale.");
      }
      const expressions = tokens.splice(0, 3);
      const args = {
        operation,
        expressions,
        radius: 0,
        metric: "euclidean",
        falloff: "smooth",
        axis: "x",
        variables: {},
        elastic: { damping: 2.5, frequency: 3 }
      };
      for (const token of tokens) {
        const separator = token.indexOf("=");
        if (separator < 1) throw new Error(`Opção procedural inválida: ${token}.`);
        const name = token.slice(0, separator);
        const raw = token.slice(separator + 1);
        if (name === "radius") args.radius = this.#number(raw);
        else if (name === "metric") args.metric = raw;
        else if (name === "falloff") args.falloff = raw;
        else if (name === "axis") args.axis = raw;
        else if (name === "damping") args.elastic.damping = this.#number(raw);
        else if (name === "frequency") args.elastic.frequency = this.#number(raw);
        else if (name === "falloffExpr") args.falloffExpression = raw;
        else if (name.startsWith("var.")) {
          args.variables[name.slice(4)] = this.#number(raw);
        } else throw new Error(`Opção procedural desconhecida: ${name}.`);
      }
      return this.commands.execute("mesh.deform.apply", args);
    }

    throw new Error("Uso: mesh enter|status|apply|cancel|undo|redo|mode|select|topology|frame|constraint|snap|influence|weld|occlusion|affine|deform|help");
  }

  #meshHelp() {
    return {
      usage: [
        "mesh enter",
        "mesh status",
        "mesh mode vertex|edge|face",
        "mesh select all|none|invert|grow|shrink|linked|boundary|normal [ângulo]",
        "mesh topology create-vertex position=x,y,z",
        "mesh topology create-edge",
        "mesh topology create-face",
        "mesh topology extrude distance=1",
        "mesh topology inset amount=0.2",
        "mesh topology subdivide|split|collapse|flip-edge|flip-normal|bridge|weld|delete|duplicate|fill|cleanup|recalculate-normals",
        "mesh frame world|local|viewer",
        "mesh constraint free|x|y|z|xy|xz|yz",
        "mesh snap on|off",
        "mesh snap mode auto|vertex|edge|face",
        "mesh snap scope active|scene",
        "mesh snap anchor active|pivot|nearest",
        "mesh snap tolerance px",
        "mesh influence on|off",
        "mesh influence set radius=5 metric=geodesic falloff=smooth axis=x",
        "mesh weld on|off",
        "mesh occlusion on|off",
        "mesh affine move|rotate|scale x y z",
        "mesh deform move|rotate|scale exprX exprY exprZ radius=n metric=euclidean|geodesic|viewer|axis falloff=linear|smooth|smoother|gaussian|elastic|custom",
        "mesh undo",
        "mesh redo",
        "mesh apply",
        "mesh cancel"
      ],
      notes: [
        "Durante a sessão, somente vértices da malha ativa são selecionáveis.",
        "move, rotate, scale e position operam sobre os vértices selecionados.",
        "O frame viewer é capturado e permanece travado até a troca de frame.",
        "No frame viewer, X aponta para a direita da tela, Y para cima e Z é normal ao plano da tela.",
        "As restrições são compartilhadas pelo gizmo, comandos afins e deformações.",
        "Com a influência ativa, o gizmo e os comandos afins movem os vértices conectados em tempo real segundo o falloff.",
        "Snap em vértice, aresta e face pode usar a malha ativa ou a cena visível sem selecionar outros objetos.",
        "mesh undo e mesh redo operam no histórico interno; Aplicar produz uma única operação persistente."
      ],
      examples: [
        "mesh enter",
        "mesh frame viewer",
        "mesh constraint xy",
        "mesh snap on",
        "mesh snap mode auto",
        "mesh influence set radius=5 metric=geodesic falloff=elastic damping=2.5 frequency=3",
        "move 2 0 0",
        "rotate 0 0 15",
        "scale 1.2 1 1",
        'mesh deform move "2*w" 0 0 radius=5 metric=geodesic falloff=elastic',
        "mesh undo",
        "mesh redo",
        "mesh apply"
      ]
    };
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
    if(action==="clear") return this.commands.execute("selection.clear");
    if (action === "gesture") {
      const mode = String(tokens[1] ?? "").toLowerCase();
      if (mode === "off") {
        this.#expectExact(tokens.slice(1), 1, "select gesture off");
        return this.commands.execute("selection.gesture.set", {
          mode: this.editor.selectionGestureMode ?? "rectangle",
          radiusPixels: this.editor.selectionBrushRadius ?? 24,
          enabled: false
        });
      }
      if (!["rectangle", "brush", "lasso", "eraser"].includes(mode)) {
        throw new Error(
          "Uso: select gesture rectangle|brush|lasso|eraser [raio]."
        );
      }
      this.#expectMaximum(
        tokens.slice(1),
        2,
        "select gesture rectangle|brush|lasso|eraser [raio]"
      );
      return this.commands.execute("selection.gesture.set", {
        mode,
        radiusPixels: tokens[2] === undefined
          ? this.editor.selectionBrushRadius ?? 24
          : this.#number(tokens[2]),
        enabled: true
      });
    }
    if (this.queries?.execute("mesh.edit.status")?.active) {
      throw new Error(
        "Durante a edição de malha, use mesh select all|none|invert; a seleção de objetos está bloqueada."
      );
    }
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

    if (action === "compact") {
      const instanceCount = tokens.length
        ? this.#integer(tokens.shift())
        : 10000;
      const strokeCount = tokens.length
        ? this.#integer(tokens.shift())
        : 1000;
      const samples = tokens.length ? this.#integer(tokens.shift()) : 5;
      this.#expectMaximum(
        tokens,
        0,
        "benchmark compact [instâncias] [traços] [amostras]"
      );
      return this.commands.execute("benchmark.compact", {
        instanceCount,
        strokeCount,
        sceneObjectCount: instanceCount,
        samples
      });
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

    if (action === "selection") {
      const objectCount = tokens.length ? this.#integer(tokens.shift()) : 1000;
      const samples = tokens.length ? this.#integer(tokens.shift()) : 5;
      this.#expectMaximum(
        tokens,
        0,
        "benchmark selection [objetos] [amostras]"
      );
      return this.commands.execute("benchmark.selection", {
        objectCount,
        samples
      });
    }

    const id = {
      compare: "benchmark.compare",
      history: "benchmark.history",
      clear: "benchmark.clear"
    }[action];

    if (!id) {
      throw new Error(
        "Uso: benchmark help|compact|scene|selection|compare|history|clear"
      );
    }

    this.#expectMaximum(tokens, 0, `benchmark ${action}`);
    return this.commands.execute(id);
  }

  #selection(tokens) {
    const action = (tokens.shift() ?? "stats").toLowerCase();
    if (action !== "stats") {
      throw new Error("Uso: selection stats");
    }
    this.#expectMaximum(tokens, 0, "selection stats");
    return this.commands.execute("selection.stats");
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

    if (namespace === "profile") {
      this.#expectMaximum(tokens, 0, "runtime profile");
      return this.queries.execute("runtime.profile");
    }

    if (namespace === "ui-stats") {
      this.#expectMaximum(tokens, 0, "runtime ui-stats");
      return this.queries.execute("runtime.ui-stats");
    }

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

    if (namespace === "compaction") {
      const action = (tokens.shift() ?? "status").toLowerCase();
      if (action === "status") {
        this.#expectMaximum(tokens, 0, "runtime compaction status");
        return this.queries.execute("stroke.compaction.status");
      }
      if (action === "run") {
        this.#expectMaximum(tokens, 1, "runtime compaction run [objectId]");
        return this.commands.execute("stroke.compaction.run", {
          objectId: tokens[0] ?? null
        });
      }
      if (["set", "configure"].includes(action)) {
        if (!tokens.length) {
          throw new Error(
            "Uso: runtime compaction set {política-JSON}."
          );
        }
        const patch = parseJson(
          tokens.join(" "),
          "Política de compactação"
        );
        return this.commands.execute("stroke.compaction.configure", patch);
      }
      if (action === "help") {
        this.#expectMaximum(tokens, 0, "runtime compaction help");
        return {
          usage: [
            "runtime compaction status",
            "runtime compaction run [objectId]",
            "runtime compaction set {política-JSON}"
          ],
          schedules: [
            "off", "manual", "idle", "on-save",
            "on-approve", "on-export"
          ],
          example: "runtime compaction set {\"schedule\":\"idle\",\"idleBudgetMs\":2,\"targetChunkPoints\":8192,\"maximumChunkPoints\":16384,\"maximumChunkStrokes\":128}"
        };
      }
      throw new Error(
        "Uso: runtime compaction status|run [objectId]|set {JSON}|help."
      );
    }

    if (namespace !== "test") {
      throw new Error(
        "Uso: runtime profile|ui-stats|benchmark api [iterações]|" +
        "resources|compaction status|run|set|help|" +
        "test help|animation-runtime|animation-commands|" +
        "tool-parameters|selection-ui|instance-batches|performance-baseline|" +
        "experiment-contract|experiment-plugin|" +
        "experiment-panel|placement-frame|" +
        "geometry-creation|geometry-registry|file-interop|" +
        "project-files|project-recovery|pwa-status|spatial-planning|" +
        "spatial-plan-commit|all"
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

  #anchor(tokens) {
    const action = (tokens.shift() ?? "status").toLowerCase();
    if (action === "status") {
      this.#expectMaximum(tokens, 0, "anchor status");
      return this.queries.execute("selection.anchor.status");
    }
    if (["bounds", "bounds-center", "center", "centro"].includes(action)) {
      this.#expectMaximum(tokens, 0, "anchor bounds-center");
      return this.commands.execute("selection.anchor.set", {
        policy: "bounds-center"
      });
    }
    if (["origin", "origem"].includes(action)) {
      this.#expectMaximum(tokens, 0, "anchor origin");
      return this.commands.execute("selection.anchor.set", { policy: "origin" });
    }
    if (["pivot", "pivo", "pivô"].includes(action)) {
      this.#expectMaximum(tokens, 0, "anchor pivot");
      return this.commands.execute("selection.anchor.set", { policy: "pivot" });
    }
    if (["custom", "personalizada", "personalizado"].includes(action)) {
      this.#expectExact(tokens, 3, "anchor custom x y z");
      return this.commands.execute("selection.anchor.set", {
        policy: "custom",
        position: tokens.map(value => this.#number(value))
      });
    }
    if (action === "help" || action === "ajuda") {
      this.#expectMaximum(tokens, 0, "anchor help");
      return Object.freeze({
        usage: Object.freeze([
          "anchor status",
          "anchor bounds-center",
          "anchor origin",
          "anchor pivot",
          "anchor custom x y z"
        ]),
        note: "A política altera somente a referência de seleção; não move a geometria."
      });
    }
    throw new Error(
      "Uso: anchor status|bounds-center|origin|pivot|custom x y z."
    );
  }

  #strokeOrigin(tokens) {
    const action = (tokens.shift() ?? "rebase").toLowerCase();
    if (!["rebase", "recalcular"].includes(action)) {
      throw new Error("Uso: stroke-origin rebase [x y z].");
    }
    if (tokens.length !== 0 && tokens.length !== 3) {
      throw new Error("Uso: stroke-origin rebase [x y z].");
    }
    return this.commands.execute("stroke.origin.rebase", tokens.length
      ? { origin: tokens.map(value => this.#number(value)) }
      : {});
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

  #repeat(tokens) {
    if (!tokens.length) {
      return this.commands.execute("selection.repeat");
    }

    const mode = (tokens.shift() ?? "").toLowerCase();
    if (mode !== "count" || !tokens.length) {
      throw new Error("Uso: repeat [count N]");
    }

    const count = this.#positive(tokens.shift());
    if (!Number.isInteger(count)) {
      throw new Error("A quantidade deve ser inteira.");
    }
    this.#expectMaximum(tokens, 0, "repeat count N");

    return this.commands.execute("selection.repeat", { count });
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

  #nonZero(value) {
    const number = this.#number(value);
    if (Math.abs(number) <= 1e-12) {
      throw new Error(`Valor não pode ser nulo: ${value}`);
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

function defaultGeometryFromDescription(description) {
  return {
    type: description.type,
    ...Object.fromEntries(
      description.parameters.map(parameter => [
        parameter.id,
        parameter.default === undefined
          ? null
          : structuredClone(parameter.default)
      ])
    )
  };
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
  return /^(calc|program|session|plan|procedure|experiment)(?:\s|$)/i.test(
    String(source)
  );
}

function isAsynchronousConsoleInput(source) {
  return isProgramConsoleInput(source) ||
    /^runtime\s+test(?:\s|$)/i.test(String(source));
}

function splitAsynchronousConsoleInputs(source) {
  const input = String(source).trim();
  const lines = input
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);
  const preservesMultilineSource =
    /^(calc|program|procedure\s+(define|import))(?:\s|$)/i.test(input);

  if (preservesMultilineSource) return [input];
  if (lines.length > 1 && lines.some(isAsynchronousConsoleInput)) return lines;
  if (isAsynchronousConsoleInput(input)) return [input];
  return null;
}

function parseExperimentParameters(source) {
  const input = String(source ?? "").trim();
  if (!input) return {};
  if (input.startsWith("{")) {
    return parseJson(input, "Parâmetros do experimento");
  }

  const parameters = {};
  for (const token of input.split(/\s+/).filter(Boolean)) {
    const separator = token.indexOf("=");
    if (separator < 1 || separator === token.length - 1) {
      throw new Error(
        `Parâmetro inválido: ${token}. Use nome=valor ou um objeto JSON.`
      );
    }
    const name = token.slice(0, separator);
    const rawValue = token.slice(separator + 1);
    if (Object.hasOwn(parameters, name)) {
      throw new Error(`Parâmetro repetido: ${name}.`);
    }
    parameters[name] = parseExperimentParameterValue(rawValue);
  }
  return parameters;
}

function parseExperimentParameterValue(source) {
  if (source === "true") return true;
  if (source === "false") return false;
  if (source === "null") return null;
  const number = Number(source);
  return Number.isFinite(number) ? number : source;
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

function parseNamedOptions(tokens) {
  const options = {};
  for (const token of tokens) {
    const separator = token.indexOf("=");
    if (separator < 1) {
      if (options.object === undefined) options.object = token;
      else throw new Error(`Opção de caminho inválida: ${token}.`);
      continue;
    }
    options[token.slice(0, separator)] = token.slice(separator + 1);
  }
  return options;
}

function parseToolOptions(tokens) {
  const values = {};
  for (const token of tokens) {
    const separator = token.indexOf("=");
    if (separator < 1) {
      throw new Error(`Parâmetro de ferramenta inválido: ${token}.`);
    }
    const id = token.slice(0, separator);
    if (Object.hasOwn(values, id)) {
      throw new Error(`Parâmetro de ferramenta repetido: ${id}.`);
    }
    const source = token.slice(separator + 1);
    if (source === "true") values[id] = true;
    else if (source === "false") values[id] = false;
    else if (source === "null") values[id] = null;
    else if (/^[\[{]/.test(source)) values[id] = parseJson(source, id);
    else {
      const number = Number(source);
      values[id] = source !== "" && Number.isFinite(number)
        ? number
        : source;
    }
  }
  return values;
}

function pathDrawSpacingOptions(options, parseNumber) {
  const result = {};
  if (options.spacingMode !== undefined) {
    result.spacingMode = String(options.spacingMode);
  }
  if (options.spacingWorld !== undefined) {
    result.spacingWorld = parseNumber(options.spacingWorld);
  }
  if (options.spacing === undefined) return result;
  const value = String(options.spacing).toLowerCase();
  if (value === "auto") {
    result.spacingMode = "auto";
    return result;
  }
  result.spacingMode = "world";
  result.spacingWorld = parseNumber(options.spacing);
  return result;
}

function pathDrawGeometryOptions(options) {
  const source = options.params ?? options.geometryParams;
  if (source === undefined) return {};
  if (options.geometry === undefined) {
    throw new Error(
      "params exige geometry=<tipo> na mesma execução de path draw."
    );
  }
  const parameters = parseJson(source, "params");
  if (!parameters || typeof parameters !== "object" ||
      Array.isArray(parameters)) {
    throw new TypeError("params deve ser um objeto JSON.");
  }
  return {
    sourceGeometry: {
      ...parameters,
      type: String(options.geometry)
    }
  };
}

function pathReferenceFromOptions(options, { objectKey, extractionKey }) {
  const value = options[objectKey];
  if (!value) throw new Error(`Informe ${objectKey}=id.`);
  if (value === "@selection-origins") {
    return {
      source: "selection-origins",
      extraction: "auto",
      closed: optionOptionalBoolean(options, "closed")
    };
  }
  if (value.startsWith("name:")) {
    return {
      source: "object",
      objectName: value.slice(5),
      extraction: options[extractionKey] ?? "auto",
      closed: optionOptionalBoolean(options, "closed")
    };
  }
  return {
    source: "object",
    objectId: value,
    extraction: options[extractionKey] ?? "auto",
    closed: optionOptionalBoolean(options, "closed")
  };
}

function optionNumber(options, name, fallback) {
  if (options[name] === undefined) return fallback;
  const value = Number(options[name]);
  if (!Number.isFinite(value)) throw new Error(`${name} inválido.`);
  return value;
}

function optionInteger(options, name, fallback) {
  const value = optionNumber(options, name, fallback);
  if (!Number.isInteger(value)) throw new Error(`${name} deve ser inteiro.`);
  return value;
}

function optionOptionalBoolean(options, name) {
  if (options[name] === undefined) return undefined;
  return optionBoolean(options, name, false);
}

function optionBoolean(options, name, fallback) {
  if (options[name] === undefined) return fallback;
  const value = String(options[name]).toLowerCase();
  if (["on", "true", "1", "yes", "sim"].includes(value)) return true;
  if (["off", "false", "0", "no", "não", "nao"].includes(value)) return false;
  throw new Error(`${name} exige on|off.`);
}

function providedText(options, sourceName, targetName) {
  if (options[sourceName] === undefined) return {};
  return { [targetName]: String(options[sourceName]) };
}

function providedNumber(options, sourceName, targetName) {
  if (options[sourceName] === undefined) return {};
  return {
    [targetName]: optionNumber(options, sourceName, undefined)
  };
}

function providedInteger(options, sourceName, targetName) {
  if (options[sourceName] === undefined) return {};
  return {
    [targetName]: optionInteger(options, sourceName, undefined)
  };
}

function providedBoolean(options, sourceName, targetName) {
  if (options[sourceName] === undefined) return {};
  return {
    [targetName]: optionBoolean(options, sourceName, false)
  };
}
