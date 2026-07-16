import { Region } from "../../core/src/Region.js";
import { Sandbox } from "../../core/src/Sandbox.js";
import { TestRunner } from "./TestRunner.js";
import {
  assert,
  assertEqual,
  assertDeepEqual,
  assertThrows
} from "./Assertions.js";

export class TestService {
  constructor({ reducer, commands, projectService }) {
    this.reducer = reducer;
    this.commands = commands;
    this.projectService = projectService;
    this.runner = new TestRunner();
    this.#register();
  }

  run(name = "all") {
    return this.runner.run(name);
  }

  help() {
    return {
      commands: [
        "test all",
        "test sandbox",
        "test reducer",
        "test commands",
        "test project"
      ],
      suites: this.runner.describe()
    };
  }

  #register() {
    this.runner
      .register("sandbox", {
        "replaceState limpa histórico": () => {
          const sandbox = this.#sandbox();
          sandbox.dispatch({
            type: "object.create",
            id: "a",
            position: [0, 1, 0],
            size: [2, 2, 2]
          });
          assert(sandbox.canUndo);
          sandbox.replaceState({ schemaVersion: 1, objects: [] });
          assertEqual(sandbox.canUndo, false);
          assertEqual(sandbox.canRedo, false);
        },

        "dispatch undo redo": () => {
          const sandbox = this.#sandbox();
          assert(sandbox.dispatch({
            type: "object.create",
            id: "a",
            position: [0, 1, 0],
            size: [2, 2, 2]
          }));
          assertEqual(sandbox.getState().objects.length, 1);
          assert(sandbox.undo());
          assertEqual(sandbox.getState().objects.length, 0);
          assert(sandbox.redo());
          assertEqual(sandbox.getState().objects.length, 1);
        }
      })
      .register("reducer", {
        "criação não altera entrada": () => {
          const before = Object.freeze({
            schemaVersion: 1,
            objects: Object.freeze([])
          });
          const result = this.reducer(before, {
            type: "object.create",
            id: "a",
            position: [0, 1, 0],
            size: [2, 2, 2]
          });
          assertEqual(before.objects.length, 0);
          assertEqual(result.state.objects.length, 1);
          assert(result.state !== before);
        },

        "comando desconhecido preserva referência": () => {
          const state = Object.freeze({
            schemaVersion: 1,
            objects: Object.freeze([])
          });
          const result = this.reducer(state, { type: "unknown" });
          assertEqual(result.state, state);
        }
      })
      .register("commands", {
        "registro contém project.inspect": () => {
          assert(
            this.commands.describe().some(item => item.id === "project.inspect")
          );
        },

        "comando desconhecido lança exceção": () => {
          assertThrows(() => this.commands.execute("unknown.test.command"));
        }
      })
      .register("project", {
        "salvar prepara documento sem transporte web": () => {
          const saved = this.projectService.save();
          assertEqual(saved.prepared, true);
          assertEqual(saved.filename.endsWith(".spatialseed"), true);
          assertEqual(saved.mediaType.includes("application/json"), true);
          assertEqual(saved.bytes > 0, true);
          assertDeepEqual(
            this.projectService.validator.parse(saved.text).scene,
            this.projectService.inspect().scene
          );
        },

        "serialização valida em roundtrip": () => {
          const original = this.projectService.inspect();
          const parsed = this.projectService.validator.parse(
            JSON.stringify(original)
          );
          assertDeepEqual(parsed.scene, original.scene);
        },

        "formato inválido é rejeitado": () => {
          assertThrows(() => this.projectService.validator.validate({
            format: "invalid",
            schemaVersion: 1,
            scene: { objects: [] }
          }));
        }
      });
  }

  #sandbox() {
    const region = new Region(
      { id: `test-${crypto.randomUUID()}`, name: "Test", type: "box-region" },
      { schemaVersion: 1, objects: [] }
    );
    return new Sandbox(region, this.reducer);
  }
}
