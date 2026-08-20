import { Region } from "../../core/src/Region.js";
import { Sandbox } from "../../core/src/Sandbox.js";
import {
  normalizeInteractionDocument
} from "../../core/src/index.js?build=20260818-0054mx";
import { Selection } from "../../editor-core/src/Selection.js";
import {
  InteractionRuntime,
  SelectionInteractionService
} from "../../interaction-runtime/src/index.js?build=20260818-0054mx&revision=20260819-0054nb";
import { boxRegionReducer } from "../../region-box/src/index.js";
import { ProjectValidator } from "../../project-files/src/ProjectValidator.js";

export function createInteractionBindingTests() {
  return {
    "contrato rejeita eventos inválidos ciclos e IDs duplicados"() {
      assertThrowsMessage(() => normalizeInteractionDocument({
        bindings: [{
          id: "a",
          event: "evento com espaço",
          actions: [{ type: "command", command: "animation.stop" }]
        }]
      }), "Identificador de evento inválido");
      const cyclic = {};
      cyclic.self = cyclic;
      assertThrowsMessage(() => normalizeInteractionDocument({
        bindings: [{
          id: "a",
          event: "app.start",
          actions: [{ type: "command", command: "animation.stop", args: cyclic }]
        }]
      }), "não pode conter ciclos");
      assertThrowsMessage(() => normalizeInteractionDocument({
        bindings: ["a", "b"].map(() => ({
          id: "same",
          event: "app.start",
          actions: [{ type: "command", command: "animation.stop" }]
        }))
      }), "duplicado");
      assertThrowsMessage(() => normalizeInteractionDocument({
        bindings: [{
          id: "legacy-adapter",
          event: "app.start",
          actions: [{ type: "procedure", name: "unsafe-auto-commit" }]
        }]
      }), "não permitido no documento");
    },

    "serviço persiste evento comando e alvo por transação com undo"() {
      const fixture = serviceFixture();
      const added = fixture.service.add({
        event: "app.start",
        command: "animation.preset",
        args: { id: "spin" }
      });
      assertEqual(added.changed, true);
      assertEqual(added.binding.objectId, "object-a");
      assertDeepEqual(added.binding.actions[0].args, {
        targetIds: ["$self"],
        targetMode: "objects",
        id: "spin"
      });
      assertEqual(fixture.sandbox.getSnapshot().interactions.bindings.length, 1);
      assertEqual(fixture.sandbox.canUndo, true);
      fixture.sandbox.undo();
      assertEqual(fixture.service.document().bindings.length, 0);
    },

    "catálogo expõe somente comandos autorizados"() {
      const fixture = serviceFixture();
      const commands = fixture.service.describeCatalog().actions;
      assertDeepEqual(commands.map(item => item.command), [
        "animation.preset",
        "animation.stop"
      ]);
      assertThrowsMessage(() => fixture.service.add({
        event: "app.start",
        command: "project.open"
      }), "não autorizado");
    },

    "catálogo publica eventos de entrada e saída de sensor"() {
      const events = serviceFixture().service.describeCatalog().events;
      const ids = events.map(item => item.id);
      assertEqual(ids.includes("trigger.enter"), true);
      assertEqual(ids.includes("trigger.exit"), true);
    },

    "runtime combina fontes e resolve self sem conhecer editor ou DOM"() {
      const executions = [];
      const runtime = new InteractionRuntime({
        executeAction(action, event, binding) {
          executions.push({ action, event, binding });
          return action.args;
        }
      });
      runtime.configureSource("system", {
        bindings: [{
          id: "system",
          event: "app.start",
          actions: [{ type: "command", command: "animation.stop" }]
        }]
      });
      runtime.configureSource("document", {
        bindings: [{
          id: "authored",
          objectId: "object-a",
          event: "app.start",
          actions: [{
            type: "command",
            command: "animation.preset",
            args: { targetIds: ["$self"], event: "$event.type" }
          }]
        }]
      });
      return runtime.emit("app.start").then(result => {
        assertEqual(result.executions.length, 2);
        assertDeepEqual(executions[1].action.args, {
          targetIds: ["object-a"],
          event: "app.start"
        });
        assertDeepEqual(runtime.status().sources, ["system", "document"]);
      });
    },

    "evento de objeto filtra outros proprietários"() {
      const called = [];
      const runtime = new InteractionRuntime({
        executeAction(_action, _event, binding) {
          called.push(binding.objectId);
        }
      });
      runtime.configure({
        bindings: ["a", "b"].map(objectId => ({
          id: `binding-${objectId}`,
          objectId,
          event: "character.jump",
          actions: [{ type: "command", command: "animation.stop" }]
        }))
      });
      return runtime.emit("character.jump", { objectId: "a" }).then(() => {
        assertDeepEqual(called, ["a"]);
      });
    },

    "runtime interrompe reentrada imediata do mesmo binding"() {
      let runtime;
      let executions = 0;
      runtime = new InteractionRuntime({
        async executeAction() {
          executions += 1;
          await runtime.emit("custom.loop");
        }
      });
      runtime.configureSource("document", {
        bindings: [{
          id: "loop",
          event: "custom.loop",
          actions: [{ type: "command", command: "animation.stop" }]
        }]
      });
      return runtime.emit("custom.loop").then(() => {
        assertEqual(executions, 1);
        assertEqual(runtime.status().cyclesPrevented, 1);
      });
    },

    "arquivo de projeto normaliza documento opcional de interações"() {
      const project = new ProjectValidator().validate({
        format: "spatial-seed",
        schemaVersion: 1,
        scene: {
          objects: [{ id: "object-a" }],
          interactions: {
            version: "spatialseed-interactions-v1",
            bindings: [{
              id: "start-a",
              objectId: "object-a",
              event: "app.start",
              actions: [{ type: "command", command: "animation.stop" }]
            }]
          }
        }
      });
      assertEqual(project.scene.interactions.bindings[0].id, "start-a");
      assertEqual(Object.isFrozen(project.scene.interactions), true);
    }
  };
}

function serviceFixture() {
  const state = Object.freeze({
    schemaVersion: 1,
    objects: Object.freeze([Object.freeze({
      id: "object-a",
      kind: "box",
      name: "A",
      position: Object.freeze([0, 0, 0]),
      rotation: Object.freeze([0, 0, 0, 1]),
      scale: Object.freeze([1, 1, 1])
    })])
  });
  const region = new Region({ id: "region-a", name: "A" }, state);
  const sandbox = new Sandbox(region, boxRegionReducer);
  const selection = new Selection();
  selection.replace({
    kind: "object",
    regionId: "region-a",
    objectId: "object-a"
  });
  const commands = {
    describe() {
      return [
        {
          id: "project.open",
          metadata: { category: "project" }
        },
        {
          id: "animation.stop",
          metadata: {
            category: "animation",
            interactionAction: { label: "Parar animação" }
          }
        },
        {
          id: "animation.preset",
          metadata: {
            category: "animation",
            interactionAction: {
              label: "Animar",
              defaults: { targetIds: ["$self"], targetMode: "objects" },
              parameters: [{
                id: "id",
                label: "Preset",
                required: true
              }]
            }
          }
        }
      ];
    }
  };
  let sequence = 0;
  const service = new SelectionInteractionService({
    selection,
    sandbox,
    commands,
    createId: () => `binding-${++sequence}`
  });
  return { sandbox, selection, commands, service };
}

function assertEqual(actual, expected) {
  if (!Object.is(actual, expected)) {
    throw new Error(`Esperado ${JSON.stringify(expected)}, recebido ${JSON.stringify(actual)}.`);
  }
}

function assertDeepEqual(actual, expected) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Esperado ${JSON.stringify(expected)}, recebido ${JSON.stringify(actual)}.`);
  }
}

function assertThrowsMessage(callback, expected) {
  try {
    callback();
  } catch (error) {
    if (String(error?.message ?? error).includes(expected)) return;
    throw new Error(`Erro não contém ${expected}: ${error?.message ?? error}.`);
  }
  throw new Error(`Era esperada falha contendo: ${expected}.`);
}
