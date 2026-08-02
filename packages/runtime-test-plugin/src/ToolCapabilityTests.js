import {
  EditToolRegistryAdapter,
  ToolCapabilityFacade,
  ToolParameterStore,
  TransformToolAdapter,
  createDefaultEditToolRegistry,
  createDefaultToolCapabilityFacade,
  installToolCapabilityRuntime
} from "../../edit-tools/src/index.js?build=20260802-0047e";
import {
  DevConsole
} from "../../devtools/src/DevConsole.js?build=20260802-0047e";

export function createToolCapabilityTests() {
  return {
    "catálogo reúne fontes diferentes com descritores serializáveis"() {
      const fixture = createFacadeFixture();
      const descriptions = fixture.facade.list();
      const ids = descriptions.map(item => item.id);

      assertEqual(descriptions.length, 15);
      assertEqual(ids.includes("transform.translate"), true);
      assertEqual(ids.includes("transform.rotate"), true);
      assertEqual(ids.includes("transform.scale"), true);
      assertEqual(ids.includes("draw.tube"), true);
      assertEqual(ids.includes("draw.array"), true);
      assertEqual(ids.includes("path.sketch"), false);
      assertEqual(fixture.facade.describe("draw.tube").presentation.icon, "〰");
      assertEqual(fixture.facade.describe("draw.array").presentation.icon, "⋯");
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

    "cada preset expõe somente os parâmetros pertinentes"() {
      const fixture = createFacadeFixture();
      const tube = fixture.facade.getParameters("draw.tube");
      const array = fixture.facade.getParameters("draw.array");

      assertEqual(Object.hasOwn(tube, "mode"), false);
      assertEqual(Object.hasOwn(tube, "radius"), true);
      assertEqual(Object.hasOwn(tube, "spacingWorld"), false);
      assertEqual(Object.hasOwn(array, "mode"), false);
      assertEqual(Object.hasOwn(array, "radius"), false);
      assertEqual(Object.hasOwn(array, "spacingWorld"), true);

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
      const result = fixture.facade.execute("mesh.extrude", {
        distance: 2.5
      });
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

      assertEqual(list.some(item => item.id === "transform.rotate"), true);
      assertEqual(activated.toolId, "transform.rotate");
      assertEqual(activated.result.tool, "rotate");
      assertEqual(parameters.toolId, "draw.tube");
      assertEqual(Object.hasOwn(parameters.values, "radius"), true);
      assertDeepEqual(
        fixture.facade.capabilities().commands.execute,
        "authoring.tool.execute"
      );
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
