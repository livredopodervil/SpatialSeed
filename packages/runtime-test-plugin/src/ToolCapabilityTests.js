import {
  EditToolRegistryAdapter,
  ToolCapabilityFacade,
  ToolParameterStore,
  ToolWorkspaceController,
  TransformToolAdapter,
  createDefaultEditToolRegistry,
  createDefaultToolCapabilityFacade,
  installToolCapabilityRuntime
} from "../../edit-tools/src/index.js?build=20260802-0047g";
import {
  DevConsole
} from "../../devtools/src/DevConsole.js?build=20260806-0050a1";

export function createToolCapabilityTests() {
  return {
    "catálogo reúne fontes diferentes com descritores serializáveis"() {
      const fixture = createFacadeFixture();
      const descriptions = fixture.facade.list();
      const ids = descriptions.map(item => item.id);

      assertEqual(descriptions.length, 21);
      assertEqual(ids.includes("transform.translate"), true);
      assertEqual(ids.includes("transform.rotate"), true);
      assertEqual(ids.includes("transform.scale"), true);
      assertEqual(ids.includes("draw.tube"), true);
      assertEqual(ids.includes("draw.array"), true);
      assertEqual(ids.includes("draw.sweep"), true);
      assertEqual(ids.includes("draw.extrude"), true);
      assertEqual(ids.includes("draw.revolve"), true);
      assertEqual(ids.includes("feature.sweep"), true);
      assertEqual(ids.includes("feature.extrude"), true);
      assertEqual(ids.includes("feature.revolve"), true);
      assertEqual(ids.includes("path.sketch"), false);
      assertEqual(fixture.facade.describe("draw.tube").presentation.icon, "〰");
      assertEqual(fixture.facade.describe("draw.array").presentation.icon, "⋯");
      assertEqual(fixture.facade.describe("draw.extrude").presentation.icon, "⇧");
      assertEqual(fixture.facade.describe("draw.revolve").presentation.icon, "⟳");
      assertDeepEqual(
        fixture.facade.describe("draw.sweep").inputs.map(input => input.role),
        ["path", "profile"]
      );
      assertDeepEqual(
        fixture.facade.describe("draw.extrude").inputs.map(input => input.role),
        ["profile"]
      );
      assertEqual(
        fixture.facade.describe("draw.extrude").inputs[0].sources.includes(
          "points"
        ),
        true
      );
      assertEqual(
        fixture.facade.describe("draw.extrude").capabilities.procedural,
        true
      );
      assertEqual(fixture.facade.describe("feature.extrude").kind, "operation");
      assertEqual(
        fixture.facade.describe("feature.extrude").operations.activate,
        false
      );
      assertEqual(Object.isFrozen(fixture.facade.describe("draw.tube")), true);
      assertEqual(
        JSON.parse(JSON.stringify(fixture.facade.describe("draw.tube"))).id,
        "draw.tube"
      );
      assertDeepEqual(fixture.facade.status().adapters, [
        "transform-modes",
        "edit-tool-registry"
      ]);
      fixture.dispose();
    },

    "contexto filtra sem percorrer documento ou DOM"() {
      const fixture = createFacadeFixture();
      const face = fixture.facade.list({
        context: { subjectLevel: "face", meshActive: true },
        includeUnavailable: false
      }).map(item => item.id);
      const object = fixture.facade.list({
        context: { subjectLevel: "object", meshActive: false },
        includeUnavailable: false
      }).map(item => item.id);

      assertEqual(face.includes("mesh.extrude"), true);
      assertEqual(face.includes("mesh.inset"), true);
      assertEqual(face.includes("path.from-selection"), true);
      assertEqual(face.includes("draw.tube"), false);
      assertEqual(object.includes("draw.tube"), true);
      assertEqual(object.includes("mesh.inset"), false);
      assertEqual(object.includes("transform.rotate"), true);
      const profileOnSurface = fixture.facade.status({
        toolId: "draw.extrude",
        context: {
          subjectLevel: "object",
          meshActive: false,
          drawingTargetType: "surface"
        }
      });
      assertEqual(profileOnSurface.state.available, false);
      assertEqual(
        profileOnSurface.state.reason.includes("plano de desenho"),
        true
      );
      fixture.dispose();
    },

    "mover girar e escalar usam o mesmo adapter em objeto e malha"() {
      const fixture = createFacadeFixture();
      const first = fixture.facade.activate("transform.translate");
      const repeated = fixture.facade.activate("transform.translate");
      fixture.setContext({
        subjectLevel: "vertex",
        meshActive: true,
        tool: "translate"
      });

      assertEqual(first.result.tool, "translate");
      assertEqual(repeated.result.alreadyActive, true);
      assertEqual(
        fixture.calls.filter(call => call.id === "edit.context.tool.set").length,
        1
      );
      assertEqual(
        fixture.facade.status({ toolId: "transform.translate" }).state.active,
        true
      );
      assertEqual(
        fixture.facade.isAvailable("transform.translate"),
        true
      );
      assertThrowsMessage(
        () => fixture.facade.execute("transform.translate"),
        "não suporta execute"
      );
      fixture.dispose();
    },

    "presets de desenho são distintos e a ativação é idempotente"() {
      const fixture = createFacadeFixture();
      fixture.facade.activate("draw.tube", { radius: 0.2 });
      fixture.facade.activate("draw.tube");
      fixture.facade.activate("draw.array", { spacingMode: "world" });
      const pathCalls = fixture.calls.filter(call =>
        call.id.startsWith("path.sketch.")
      );

      assertDeepEqual(pathCalls.map(call => call.id), [
        "path.sketch.begin",
        "path.sketch.cancel",
        "path.sketch.begin"
      ]);
      assertEqual(pathCalls[0].args.mode, "tube");
      assertEqual(pathCalls[2].args.mode, "array");
      assertEqual(
        fixture.facade.status({ toolId: "draw.tube" }).state.active,
        false
      );
      assertEqual(
        fixture.facade.status({ toolId: "draw.array" }).state.active,
        true
      );
      fixture.dispose();
    },

    "ferramenta contínua ativa atualiza parâmetros sem alternar para inativa"() {
      const fixture = createFacadeFixture();
      fixture.facade.activate("draw.tube", { radius: 0.2 });
      const updated = fixture.facade.activate("draw.tube", { radius: 0.45 });
      fixture.facade.activate("planar.sketch", { mode: "line" });
      const planar = fixture.facade.activate("planar.sketch", {
        mode: "circle"
      });

      assertEqual(updated.result.alreadyActive, true);
      assertEqual(updated.result.parametersUpdated, true);
      assertNear(fixture.parameters.values("path.sketch").radius, 0.45);
      assertEqual(planar.result.alreadyActive, true);
      assertEqual(
        fixture.parameters.values("planar.sketch").mode,
        "circle"
      );
      assertDeepEqual(
        fixture.calls.filter(call => call.id === "planar.sketch.begin")
          .map(call => call.args.mode),
        ["line"]
      );
      fixture.dispose();
    },

    "execução procedural usa pontos sem simular gesto de ponteiro"() {
      const fixture = createFacadeFixture();
      const frame = {
        origin: [0, 0, 0],
        xAxis: [1, 0, 0],
        yAxis: [0, 1, 0],
        normal: [0, 0, 1]
      };
      const result = fixture.facade.execute(
        "draw.extrude",
        {
          points: [[0, 0, 0], [2, 0, 0], [2, 1, 0]],
          frame,
          depth: 2.25
        },
        {
          subjectLevel: "object",
          meshActive: false,
          drawingTargetType: "surface"
        }
      );
      const call = fixture.calls.at(-1);

      assertEqual(result.result.changed, true);
      assertEqual(call.id, "profile.extrude.points.create");
      assertNear(call.args.depth, 2.25);
      assertEqual(call.args.extrudeSteps, 1);
      assertDeepEqual(call.args.frame, frame);
      assertEqual(
        fixture.facade.status().activeToolIds.includes("draw.extrude"),
        false
      );
      assertEqual(
        fixture.calls.some(item => item.id === "path.sketch.begin"),
        false
      );
      fixture.dispose();
    },

    "cada preset expõe somente seus parâmetros e entradas pertinentes"() {
      const fixture = createFacadeFixture();
      const tube = fixture.facade.getParameters("draw.tube");
      const array = fixture.facade.getParameters("draw.array");
      const sweep = fixture.facade.getParameters("draw.sweep");
      const extrude = fixture.facade.getParameters("draw.extrude");
      const revolve = fixture.facade.getParameters("draw.revolve");

      assertEqual(Object.hasOwn(tube, "mode"), false);
      assertEqual(Object.hasOwn(tube, "radius"), true);
      assertEqual(Object.hasOwn(tube, "spacingWorld"), false);
      assertEqual(Object.hasOwn(array, "mode"), false);
      assertEqual(Object.hasOwn(array, "radius"), false);
      assertEqual(Object.hasOwn(array, "spacingWorld"), true);
      assertEqual(Object.hasOwn(sweep, "profileObjectId"), true);
      assertEqual(Object.hasOwn(sweep, "sweepSegments"), true);
      assertEqual(Object.hasOwn(sweep, "depth"), false);
      assertEqual(Object.hasOwn(extrude, "depth"), true);
      assertEqual(Object.hasOwn(extrude, "bevelEnabled"), true);
      assertEqual(Object.hasOwn(extrude, "profileObjectId"), false);
      assertEqual(Object.hasOwn(extrude, "curveType"), false);
      assertEqual(Object.hasOwn(extrude, "closed"), false);
      assertEqual(Object.hasOwn(revolve, "revolveSegments"), true);
      assertEqual(Object.hasOwn(revolve, "phiLengthDeg"), true);
      assertEqual(Object.hasOwn(revolve, "depth"), false);
      assertEqual(Object.hasOwn(revolve, "tension"), false);

      const changed = fixture.facade.setParameters("draw.array", {
        spacingMode: "world",
        spacingWorld: 0.35
      });
      assertNear(changed.values.spacingWorld, 0.35);
      assertEqual(
        fixture.parameters.values("path.sketch").mode,
        "tube"
      );
      assertThrowsMessage(
        () => fixture.facade.setParameters("draw.array", { radius: 2 }),
        "Parâmetro desconhecido"
      );
      fixture.dispose();
    },

    "features existentes usam slots explícitos e os mesmos parâmetros"() {
      const fixture = createFacadeFixture();
      fixture.facade.setParameters("feature.extrude", {
        depth: 2.75,
        bevelEnabled: false
      });
      fixture.facade.execute("feature.extrude", {
        profile: { objectId: "hexagono", extraction: "sketch" }
      });
      fixture.facade.setParameters("feature.sweep", {
        sweepSegments: 48,
        sweepTwistDegrees: 30,
        scaleEnd: 0.5
      });
      fixture.facade.execute("feature.sweep", {
        profile: { objectId: "hexagono" },
        path: { objectId: "curva" }
      });

      const extrude = fixture.calls.find(call =>
        call.id === "profile.extrude.create"
      );
      const sweep = fixture.calls.find(call => call.id === "path.sweep.create");
      assertNear(extrude.args.depth, 2.75);
      assertEqual(extrude.args.bevelEnabled, false);
      assertEqual(extrude.args.profile.objectId, "hexagono");
      assertEqual(extrude.args.profile.extraction, "sketch");
      assertEqual(sweep.args.profile.objectId, "hexagono");
      assertEqual(sweep.args.path.objectId, "curva");
      assertEqual(sweep.args.segments, 48);
      assertNear(sweep.args.twistDegrees, 30);
      assertNear(sweep.args.scaleEnd, 0.5);
      assertEqual(Object.hasOwn(extrude.args, "inputSamplePixels"), false);
      fixture.dispose();
    },

    "restaurar um preset não apaga parâmetros lembrados dos demais"() {
      const fixture = createFacadeFixture();
      fixture.facade.setParameters("draw.tube", { radius: 0.42 });
      fixture.facade.setParameters("draw.extrude", {
        depth: 3.5,
        bevelEnabled: false
      });

      const restored = fixture.facade.resetParameters("draw.extrude");

      assertNear(restored.values.depth, 1);
      assertEqual(restored.values.bevelEnabled, true);
      assertNear(fixture.facade.getParameters("draw.tube").radius, 0.42);
      assertDeepEqual(
        fixture.facade.describe("draw.revolve").actions,
        {
          activate: "authoring.tool.activate",
          execute: "authoring.tool.execute",
          finish: null,
          cancel: "authoring.tool.cancel",
          getParameters: "authoring.tool.parameters.get",
          setParameters: "authoring.tool.parameters.set",
          resetParameters: "authoring.tool.parameters.reset"
        }
      );
      fixture.dispose();
    },

    "assinatura invalida consumidores quando somente parâmetros mudam"() {
      const fixture = createFacadeFixture();
      let notifications = 0;
      const unsubscribe = fixture.facade.subscribe(() => {
        notifications += 1;
      });

      fixture.facade.setParameters("draw.tube", { radius: 0.31 });

      assertEqual(notifications, 2);
      unsubscribe();
      fixture.dispose();
    },

    "operação de malha conserva um único comando autoritativo"() {
      const fixture = createFacadeFixture({
        context: {
          subjectLevel: "face",
          meshActive: true,
          tool: "select"
        }
      });
      fixture.facade.setParameters("mesh.extrude", { distance: 2.5 });
      const result = fixture.facade.execute("mesh.extrude");
      const topology = fixture.calls.filter(call =>
        call.id === "mesh.topology.apply"
      );

      assertEqual(result.result.changed, true);
      assertEqual(topology.length, 1);
      assertEqual(topology[0].args.operation, "extrude");
      assertNear(topology[0].args.options.distance, 2.5);
      fixture.dispose();
    },

    "runtime publica uma única porta para UI console e agentes"() {
      const fixture = createFacadeFixture();
      const commands = new RegistryFixture();
      const queries = new RegistryFixture();
      installToolCapabilityRuntime({
        commands,
        queries,
        facade: fixture.facade
      });

      const list = queries.execute("authoring.tools.list", {
        context: { subjectLevel: "object" }
      });
      const activated = commands.execute("authoring.tool.activate", {
        toolId: "transform.rotate"
      });
      const parameters = queries.execute(
        "authoring.tool.parameters.get",
        { toolId: "draw.tube" }
      );
      commands.execute("authoring.tool.parameters.set", {
        toolId: "draw.revolve",
        patch: { revolveSegments: 48 }
      });
      const reset = commands.execute("authoring.tool.parameters.reset", {
        toolId: "draw.revolve"
      });

      assertEqual(list.some(item => item.id === "transform.rotate"), true);
      assertEqual(activated.toolId, "transform.rotate");
      assertEqual(activated.result.tool, "rotate");
      assertEqual(parameters.toolId, "draw.tube");
      assertEqual(Object.hasOwn(parameters.values, "radius"), true);
      assertEqual(reset.values.revolveSegments, 32);
      assertDeepEqual(
        fixture.facade.capabilities().commands.execute,
        "authoring.tool.execute"
      );
      fixture.dispose();
    },

    "workspace separa foco visual e resolve entradas pela seleção"() {
      const fixture = createFacadeFixture();
      const selection = {
        activeMember: { objectId: "hexagono" },
        members: [
          { objectId: "hexagono" },
          { objectId: "curva" }
        ]
      };
      const references = [
        {
          id: "hexagono",
          name: "Hexágono",
          pathExtractions: ["auto", "sketch"],
          profileExtractions: ["auto", "sketch"]
        },
        {
          id: "curva",
          name: "Curva",
          pathExtractions: ["auto", "centerline"],
          profileExtractions: []
        }
      ];
      const workspace = new ToolWorkspaceController({
        facade: fixture.facade,
        selection: () => selection,
        references: () => references
      });
      const commands = new RegistryFixture();
      const queries = new RegistryFixture();
      installToolCapabilityRuntime({
        commands,
        queries,
        facade: fixture.facade,
        workspace
      });

      commands.execute("authoring.tool.focus", {
        toolId: "feature.sweep"
      });
      const status = queries.execute("authoring.tool.workspace");
      commands.execute("authoring.tool.execute", {
        toolId: "feature.sweep"
      });
      const sweep = fixture.calls.find(call => call.id === "path.sweep.create");

      assertEqual(status.focusedToolId, "feature.sweep");
      assertEqual(status.ready, true);
      assertEqual(status.inputs[0].binding.objectId, "hexagono");
      assertEqual(status.inputs[1].binding.objectId, "curva");
      assertEqual(sweep.args.profile.objectId, "hexagono");
      assertEqual(sweep.args.path.objectId, "curva");

      references.push({
        id: "perfil-unico",
        name: "Perfil único",
        pathExtractions: [],
        profileExtractions: ["auto", "contour"]
      });
      selection.members = [
        { objectId: "hexagono" },
        { objectId: "perfil-unico" }
      ];
      commands.execute("authoring.tool.input.bind", {
        toolId: "feature.sweep",
        inputId: "path",
        binding: { objectId: "hexagono", extraction: "sketch" }
      });
      const reserved = queries.execute("authoring.tool.workspace", {
        toolId: "feature.sweep"
      });
      assertEqual(reserved.inputs[0].binding.objectId, "perfil-unico");
      assertEqual(reserved.inputs[1].binding.objectId, "hexagono");

      commands.execute("authoring.tool.input.bind", {
        toolId: "feature.extrude",
        inputId: "profile",
        binding: { objectId: "hexagono", extraction: "sketch" }
      });
      commands.execute("authoring.tool.execute", {
        toolId: "feature.extrude"
      });
      const extrude = fixture.calls.find(call =>
        call.id === "profile.extrude.create"
      );
      assertEqual(extrude.args.profile.extraction, "sketch");
      assertEqual(
        fixture.facade.status().activeToolIds.includes("feature.extrude"),
        false
      );
      workspace.dispose();
      fixture.dispose();
    },

    "console textual consome a porta canônica sem conhecer adapters"() {
      const fixture = createFacadeFixture();
      const commands = new RegistryFixture();
      const queries = new RegistryFixture();
      installToolCapabilityRuntime({ commands, queries, facade: fixture.facade });
      const devConsole = new DevConsole({
        editor: {},
        sandbox: {},
        region: {},
        renderer: {},
        commands,
        queries,
        onOutput() {}
      });

      const listed = devConsole.execute("tool list")[0];
      const activated = devConsole.execute(
        "tool activate draw.tube radius=0.14 radialSegments=8"
      )[0];
      const configured = devConsole.execute(
        "tool set draw.array spacingMode=world spacingWorld=0.5"
      )[0];
      const reset = devConsole.execute("tool reset draw.revolve")[0];
      const procedural = devConsole.execute(
        "tool run draw.extrude " +
        "points=[[0,0,0],[2,0,0],[2,1,0]] " +
        "frame={\"origin\":[0,0,0],\"xAxis\":[1,0,0]," +
        "\"yAxis\":[0,1,0],\"normal\":[0,0,1]} depth=2"
      )[0];
      const activeBeforeCancel = fixture.facade.status().activeToolIds;
      const cancelled = devConsole.execute("tool cancel")[0];

      assertEqual(listed.ok, true);
      assertEqual(
        listed.result.some(item => item.id === "transform.translate"),
        true
      );
      assertEqual(activated.ok, true);
      assertNear(
        fixture.parameters.values("path.sketch").radius,
        0.14
      );
      assertEqual(configured.ok, true);
      assertEqual(reset.ok, true);
      assertEqual(reset.result.values.revolveSegments, 32);
      assertEqual(procedural.ok, true);
      assertEqual(
        fixture.calls.some(call =>
          call.id === "profile.extrude.points.create" &&
          call.args.depth === 2
        ),
        true
      );
      assertNear(configured.result.values.spacingWorld, 0.5);
      assertEqual(activeBeforeCancel.includes("draw.tube"), true);
      assertEqual(activeBeforeCancel.includes("draw.array"), false);
      assertEqual(cancelled.ok, true);
      assertEqual(fixture.calls.at(-1).id, "path.sketch.cancel");
      fixture.dispose();
    },

    "colisões são rejeitadas antes de alterar o catálogo"() {
      const facade = new ToolCapabilityFacade({
        adapters: [minimalAdapter("adapter-a", "fixture.tool")]
      });
      assertThrowsMessage(
        () => facade.registerAdapter(
          minimalAdapter("adapter-b", "fixture.tool")
        ),
        "duplicada"
      );
      assertDeepEqual(facade.status().adapters, ["adapter-a"]);
      assertEqual(facade.list().length, 1);
      facade.dispose();

      assertThrowsMessage(
        () => new ToolCapabilityFacade({
          adapters: [{
            id: "invalid-inputs",
            list: () => [{
              id: "fixture.inputs",
              kind: "operation",
              contexts: ["object"],
              operations: { execute: true },
              inputs: [
                {
                  id: "path",
                  role: "path",
                  sources: ["points"]
                },
                {
                  id: "path",
                  role: "path",
                  sources: ["reference"]
                }
              ]
            }],
            execute: () => ({ changed: false })
          }]
        }),
        "Entrada canônica duplicada"
      );
    }
  };
}

function createFacadeFixture({
  context = { subjectLevel: "object", meshActive: false, tool: "select" }
} = {}) {
  let currentContext = { ...context };
  let activeAction = null;
  const contextListeners = new Set();
  const lifecycleListeners = new Set();
  const calls = [];
  const registry = createDefaultEditToolRegistry();
  const parameters = new ToolParameterStore({
    registry,
    storage: createMemoryStorage()
  });
  const editContext = {
    status: () => Object.freeze({ ...currentContext }),
    subscribe(listener) {
      contextListeners.add(listener);
      listener(this.status());
      return () => contextListeners.delete(listener);
    }
  };
  const lifecycle = {
    status: () => Object.freeze({ activeAction }),
    subscribe(listener) {
      lifecycleListeners.add(listener);
      listener(this.status());
      return () => lifecycleListeners.delete(listener);
    }
  };
  const notifyContext = () => {
    for (const listener of [...contextListeners]) listener(editContext.status());
  };
  const notifyLifecycle = () => {
    for (const listener of [...lifecycleListeners]) listener(lifecycle.status());
  };
  const execute = (id, args = {}) => {
    calls.push({ id, args: structuredClone(args) });
    if (id === "edit.context.tool.set") {
      currentContext = { ...currentContext, tool: args.mode };
      notifyContext();
      return Object.freeze({ ...currentContext });
    }
    if (id === "edit.interaction.cancel") {
      currentContext = { ...currentContext, tool: "select" };
      notifyContext();
      return Object.freeze({ active: false, mode: "select" });
    }
    if (id === "edit.tool.parameters.set") {
      return parameters.set(args.toolId, args.patch);
    }
    if (id === "edit.tool.parameters.reset") {
      return parameters.reset(args.toolId);
    }
    if (id === "path.sketch.begin" || id === "planar.sketch.begin") {
      const nativeId = id.slice(0, -".begin".length);
      activeAction = nativeId;
      parameters.set(nativeId, args);
      notifyLifecycle();
      return Object.freeze({ active: true, mode: args.mode ?? null });
    }
    if (id === "path.sketch.cancel" || id === "planar.sketch.cancel") {
      activeAction = null;
      notifyLifecycle();
      return Object.freeze({ active: false });
    }
    if (id === "planar.sketch.finish") {
      return Object.freeze({ active: true, completed: true });
    }
    return Object.freeze({ changed: true, command: id });
  };
  const facade = createDefaultToolCapabilityFacade({
    editContext,
    registry,
    parameters,
    lifecycle,
    execute
  });
  return {
    facade,
    parameters,
    calls,
    setContext(next) {
      currentContext = { ...currentContext, ...next };
      notifyContext();
    },
    dispose() {
      facade.dispose();
      parameters.dispose();
    }
  };
}

class RegistryFixture {
  #items = new Map();

  register(id, handler, metadata = {}) {
    if (this.#items.has(id)) throw new Error(`Registro duplicado: ${id}.`);
    this.#items.set(id, { handler, metadata });
    return this;
  }

  execute(id, args = {}) {
    const item = this.#items.get(id);
    if (!item) throw new Error(`Registro ausente: ${id}.`);
    return item.handler(structuredClone(args));
  }

  describe() {
    return [...this.#items].map(([id, item]) => ({
      id,
      metadata: { ...item.metadata }
    }));
  }
}

function minimalAdapter(id, toolId) {
  return {
    id,
    list: () => [{
      id: toolId,
      kind: "operation",
      lifecycle: "single-shot",
      contexts: ["object"],
      operations: { execute: true }
    }],
    execute: () => ({ changed: false })
  };
}

function createMemoryStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.has(String(key)) ? values.get(String(key)) : null;
    },
    setItem(key, value) {
      values.set(String(key), String(value));
    },
    removeItem(key) {
      values.delete(String(key));
    }
  };
}

function assertEqual(actual, expected) {
  if (!Object.is(actual, expected)) {
    throw new Error(
      `Esperado ${JSON.stringify(expected)}, ` +
      `recebido ${JSON.stringify(actual)}.`
    );
  }
}

function assertDeepEqual(actual, expected) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Esperado ${JSON.stringify(expected)}, ` +
      `recebido ${JSON.stringify(actual)}.`
    );
  }
}

function assertNear(actual, expected, epsilon = 1e-9) {
  if (Math.abs(Number(actual) - Number(expected)) > epsilon) {
    throw new Error(`Esperado ${expected}, recebido ${actual}.`);
  }
}

function assertThrowsMessage(callback, expected) {
  try {
    callback();
  } catch (error) {
    if (String(error?.message).includes(expected)) return;
    throw new Error(
      `Erro não contém ${expected}: ${error?.message ?? error}`
    );
  }
  throw new Error(`Esperava erro contendo ${expected}.`);
}
