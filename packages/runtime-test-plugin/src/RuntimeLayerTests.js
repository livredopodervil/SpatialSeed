import { EditorState } from "../../editor-core/src/EditorState.js?build=20260714-0021a";
import * as THREE from "three";
import {
  SpatialSeedRuntime,
  RuntimeQueryRegistry,
  RuntimeEvents,
  RuntimeCapabilities
} from "../../runtime-api/src/index.js?build=20260714-0020b-a";
import {
  ViewerState,
  EditorSession,
  SimulationClock,
  SimulationBridge
} from "../../runtime-layers/src/index.js";
import { AppearanceGraph } from "../../appearance-graph/src/index.js";
import { AppearanceRuntime } from "../../appearance-runtime/src/index.js";
import { Selection } from "../../editor-core/src/Selection.js";
import { Region } from "../../core/src/Region.js";
import { Sandbox } from "../../core/src/Sandbox.js?build=20260716-0026g";
import { classifyChanges } from "../../incremental-runtime/src/index.js";
import { ResourceAudit } from "../../resource-audit/src/index.js";
import {
  RefCountCache,
  textureKey,
  ThreeResourceCache
} from "../../renderer-resource-cache/src/index.js";
import { BatchMaterialCache } from "../../batch-material-cache/src/index.js";
import {
  InstanceBatchIndex
} from "../../instance-batches/src/InstanceBatchIndex.js?build=20260713-0019g-c2";
import {
  InstanceBatch
} from "../../instance-batches/src/InstanceBatch.js?build=20260713-0019g-c2";
import {
  InstanceBatchManager
} from "../../instance-batches/src/InstanceBatchManager.js?build=20260713-0019g-c2";
import {
  aroundPivot,
  composeAffineOperations,
  affineCopies,
  composeTransform,
  decomposeTransform,
  decomposeTransformStrict,
  eulerQuaternion,
  identityMatrix,
  invertAffineMatrix,
  multiplyMatrices,
  resolvePlacementFrame
} from "../../math-affine/src/index.js";
import {
  compileAffineExpression,
  compileAffineProgram,
  evaluateAffineExpression,
  evaluateAffineProgram
} from "../../selection-operations/src/AffineProgram.js?build=20260714-0020b-d";
import {
  resolveAffineOperations,
  affineProgramCopies,
  composeAffineStep,
  affineCopies as affineRepeatCopies
} from "../../selection-operations/src/AffineRepeat.js?build=20260715-0021d";
import {
  SelectionOperations
} from "../../selection-operations/src/SelectionOperations.js?build=20260718-0027f";
import { ProjectAppearanceAdapter } from "../../project-files/src/ProjectAppearanceAdapter.js";
import {
  ProjectValidator
} from "../../project-files/src/ProjectValidator.js?build=20260716-0025d";
import {
  boxRegionReducer
} from "../../region-box/src/reducer.js?build=20260716-0024d";
import {
  GeometryRegistry,
  BoxGeometryProvider,
  SphereGeometryProvider,
  CylinderGeometryProvider,
  PlaneGeometryProvider,
  PolygonGeometryProvider,
  createDefaultGeometryRegistry
} from "../../geometry-registry/src/index.js?build=20260716-0024g";
import {
  normalizeHexColor,
  parsePropertyInput,
  createDefaultPropertyRegistry,
  SelectionPropertyService
} from "../../property-registry/src/index.js?build=20260716-0024d";
import {
  DevConsole
} from "../../devtools/src/DevConsole.js?build=20260718-0027f";
import {
  cloneHierarchySubtrees,
  hierarchySubtreeIds,
  HierarchyIndex,
  ungroupNodes
} from "../../scene-hierarchy/src/index.js";
import {
  affectedHierarchyIds,
  applyProjectedWorldMatrix,
  isRenderableSceneNode,
  projectedSelectionIds,
  projectedSubtreeIds,
  renderableSubtreeIds,
  selectionReferenceWorldPosition,
  selectionUnitId
} from "../../renderer-three/src/WorldTransformProjection.js?build=20260715-0023d";
import {
  SelectionOutlineBatch,
  benchmarkSelectionOutlines,
  selectionOutlineInstance
} from "../../renderer-three/src/SelectionOutlineBatch.js?build=20260718-0027f";
import {
  formatBuildLabel,
  normalizeBuildInfo
} from "../../../apps/web/BuildInfo.js";
import {
  BrowserProjectFileGateway,
  isPlatformBlock
} from "../../../apps/web/file-interop/BrowserProjectFileGateway.js";
import {
  BrowserProcedureCatalogStore
} from "../../../apps/web/procedures/BrowserProcedureCatalogStore.js";
import {
  clampEditorFontSize,
  highlightProcedureSource,
  logicalLineCount
} from "../../procedure-editor/src/index.js";
import {
  formatPwaBuildLabel,
  resolvePwaLocations,
  workerBuild
} from "../../../apps/web/pwa/registerPwa.js";
import {
  PwaInstallController
} from "../../../apps/web/pwa/PwaInstallController.js";
import {
  normalizeUiConfiguration
} from "../../ui-config/src/index.js?build=20260716-0024i";
import { fnv1a64 } from "../../asset-store/src/index.js";
import {
  DisposableProgramRun,
  PROGRAM_PLAN_VERSION,
  ProgramRunController,
  PROGRAM_WORKER_PROTOCOL_VERSION,
  PROCEDURE_LIBRARY_SCHEMA_VERSION,
  ProcedureCatalog,
  ProgramSessionController,
  ProgramSessionKernel,
  SpatialPlanCommitService,
  SPATIAL_CREATE_COMMAND,
  createBrowserProgramSessionWorker,
  createBrowserProgramWorker,
  createSeededRandom,
  executeProgramRequest
} from "../../script-runtime/src/index.js";
import {
  EXPERIMENT_DEFINITION_VERSION,
  ExperimentActionService,
  ExperimentRegistry,
  buildExperimentInvocation,
  normalizeExperimentDefinition
} from "../../experiment-runtime/src/index.js?build=20260718-0027f";
import {
  starterExperimentDefinitions,
  starterExperimentPlugin
} from "../../experiment-plugin/src/index.js?build=20260718-0027f";
import {
  formatExperimentCommand,
  normalizeExperimentControlValue,
  summarizeExperimentPlan
} from "../../experiment-panel/src/index.js?build=20260718-0027f";
import {
  ModuleRegistry,
  selectCapabilities
} from "../../plugin-api/src/ModuleRegistry.js";

export function createRuntimeLayerTests() {
  return {
    "runtime-api": {
      "fachada executa comandos sem expor registro"() {
        const commands = {
          execute(id, args) {
            assertEqual(id, "sum");
            return args.left + args.right;
          },
          describe() {
            return [{ id: "sum", metadata: {} }];
          }
        };

        const runtime = new SpatialSeedRuntime({ commands });

        assertEqual(
          runtime.execute("sum", { left: 2, right: 3 }),
          5
        );

        assertEqual("commands" in runtime, false);
      },

      "queries e eventos permanecem separados"() {
        const commands = {
          execute() {
            return null;
          },
          describe() {
            return [];
          }
        };
        const queries = new RuntimeQueryRegistry()
          .register("answer", ({ value }) => value * 2);
        const events = new RuntimeEvents();
        const runtime = new SpatialSeedRuntime({
          commands,
          queries,
          events
        });

        let received = null;
        const unsubscribe = runtime.subscribe(
          "changed",
          value => { received = value; }
        );

        assertEqual(runtime.query("answer", { value: 21 }), 42);
        runtime.emit("changed", 7);
        assertEqual(received, 7);

        unsubscribe();
        runtime.emit("changed", 9);
        assertEqual(received, 7);
      },

      "capacidades descrevem fronteira pública"() {
        const commands = {
          execute() {
            return null;
          },
          describe() {
            return [{ id: "noop", metadata: {} }];
          }
        };
        const capabilities = new RuntimeCapabilities()
          .register("renderer", {
            apiVersion: "renderer-test-v1"
          });
        const runtime = new SpatialSeedRuntime({
          commands,
          capabilities
        });
        const description = runtime.capabilities();

        assertEqual(
          description.runtimeApi,
          "spatial-seed-runtime-v1"
        );
        assertEqual(
          description.modules.renderer.apiVersion,
          "renderer-test-v1"
        );
      },

      "benchmark mede sobrecarga real da fachada"() {
        const commands = {
          execute(id, args) {
            assertEqual(id, "runtime.api.noop");
            return args.value;
          },
          describe() {
            return [];
          }
        };
        const runtime = new SpatialSeedRuntime({ commands });
        const result = runtime.benchmark({
          iterations: 1000
        });

        assertEqual(result.iterations, 1000);
        assert(result.directMs >= 0);
        assert(result.facadeMs >= 0);
        assert(Number.isFinite(result.overheadPerCallUs));
      }
    },

    "program-planning": {
      "planejador acumula apenas intenções serializáveis"() {
        const run = new DisposableProgramRun({
          runId: "run-a",
          baseVersion: 7,
          seed: 42,
          allowedCommands: ["objects.create"]
        });
        const handle = run.createHandle("object");

        run.emit("objects.create", {
          handle,
          geometry: { type: "sphere", radius: 1 }
        });

        const plan = run.complete({ value: 3 });

        assertEqual(plan.planVersion, PROGRAM_PLAN_VERSION);
        assertEqual(plan.baseVersion, 7);
        assertEqual(plan.seed, 42);
        assertEqual(plan.commands.length, 1);
        assertEqual(
          plan.commands[0].args.handle.id,
          "run-a:object:1"
        );
        assertEqual(run.state, "completed");
        assertEqual(run.commandCount, 0);
        assert(Object.isFrozen(plan));
        assert(Object.isFrozen(plan.commands[0].args));
      },

      "handles são determinísticos pela execução e ordem"() {
        const first = new DisposableProgramRun({
          runId: "stable-run"
        });
        const second = new DisposableProgramRun({
          runId: "stable-run"
        });

        assertDeepEqual(
          [
            first.createHandle("object"),
            first.createHandle("group")
          ],
          [
            second.createHandle("object"),
            second.createHandle("group")
          ]
        );
      },

      "comandos fora das capacidades são rejeitados"() {
        const run = new DisposableProgramRun({
          runId: "restricted-run",
          allowedCommands: ["objects.create"]
        });

        assertThrowsMessage(
          () => run.emit("project.open", { text: "{}" }),
          "Comando não permitido"
        );
        assertEqual(run.commandCount, 0);
      },

      "cancelamento descarta o plano pendente"() {
        const run = new DisposableProgramRun({
          runId: "cancelled-run",
          allowedCommands: ["objects.create"]
        });
        run.emit("objects.create", { id: "planned-a" });

        const result = run.cancel("pedido-do-usuario");

        assertEqual(result.discarded, true);
        assertEqual(result.discardedCommands, 1);
        assertEqual(run.state, "cancelled");
        assertEqual(run.commandCount, 0);
        assertThrowsMessage(
          () => run.complete(),
          "não está ativa"
        );
      },

      "término e falha nunca produzem plano parcial"() {
        for (const action of [
          run => run.terminate("worker-terminated"),
          run => run.fail(new Error("boom"))
        ]) {
          const run = new DisposableProgramRun({
            runId: "discarded-run",
            allowedCommands: ["objects.create"]
          });
          run.emit("objects.create", { id: "planned-a" });

          const result = action(run);

          assertEqual(result.discarded, true);
          assertEqual(result.discardedCommands, 1);
          assertEqual(run.commandCount, 0);
        }
      },

      "orçamento interrompe emissão antes de exceder o limite"() {
        const run = new DisposableProgramRun({
          runId: "budget-run",
          allowedCommands: ["objects.create"],
          maxCommands: 2
        });
        run.emit("objects.create", { id: "a" });
        run.emit("objects.create", { id: "b" });

        assertThrowsMessage(
          () => run.emit("objects.create", { id: "c" }),
          "excedeu o limite"
        );
        assertEqual(run.commandCount, 2);
      },

      "controlador envia pedido sem receber acesso ao runtime"() {
        const harness = createProgramControllerHarness();

        const snapshot = harness.controller.start({
          runId: "worker-run",
          baseVersion: 9,
          seed: 12,
          source: "2 + 3",
          snapshot: { selection: ["object-a"] },
          allowedCommands: ["objects.create"]
        });

        assertEqual(snapshot.state, "running");
        assertEqual(harness.worker.messages.length, 1);
        assertEqual(
          harness.worker.messages[0].protocolVersion,
          PROGRAM_WORKER_PROTOCOL_VERSION
        );
        assertEqual(
          harness.worker.messages[0].request.source,
          "2 + 3"
        );
        assertEqual(
          "runtime" in harness.worker.messages[0].request,
          false
        );
      },

      "resposta válida encerra Worker e deixa plano pendente"() {
        const harness = createProgramControllerHarness();
        harness.controller.start({
          runId: "completed-run",
          baseVersion: 4
        });
        const envelope = programCompletedEnvelope({
          runId: "completed-run",
          baseVersion: 4,
          commands: [{
            sequence: 0,
            command: "objects.create",
            args: { id: "planned-a" }
          }]
        });

        harness.worker.emit("message", envelope);
        envelope.plan.commands[0].args.id = "tampered";

        assertEqual(harness.controller.state, "ready");
        assertEqual(harness.worker.terminations, 1);
        const plan = harness.controller.takePlan();
        assertEqual(plan.commands[0].args.id, "planned-a");
        assertEqual(harness.controller.state, "idle");
      },

      "cancelamento invalida respostas tardias"() {
        const harness = createProgramControllerHarness();
        harness.controller.start({
          runId: "cancel-worker",
          baseVersion: 2
        });

        const cancelled = harness.controller.cancel();
        harness.worker.emit(
          "message",
          programCompletedEnvelope({
            runId: "cancel-worker",
            baseVersion: 2
          })
        );

        assertEqual(cancelled.cancelled, true);
        assertEqual(harness.worker.terminations, 1);
        assertEqual(harness.controller.state, "cancelled");
        assertEqual(harness.controller.snapshot().hasPlan, false);
      },

      "timeout encerra execução sem produzir plano"() {
        const harness = createProgramControllerHarness();
        harness.controller.start({
          runId: "slow-run",
          baseVersion: 1
        });

        harness.fireTimeout();

        assertEqual(harness.controller.state, "timed-out");
        assertEqual(harness.worker.terminations, 1);
        assertEqual(harness.controller.snapshot().hasPlan, false);
        assert(
          harness.controller.snapshot().lastError.includes("5000 ms")
        );
      },

      "protocolo ou execução incompatível falha fechado"() {
        for (const envelope of [
          {
            ...programCompletedEnvelope({
              runId: "expected-run",
              baseVersion: 3
            }),
            protocolVersion: "unknown-protocol"
          },
          programCompletedEnvelope({
            runId: "other-run",
            baseVersion: 3
          })
        ]) {
          const harness = createProgramControllerHarness();
          harness.controller.start({
            runId: "expected-run",
            baseVersion: 3
          });

          harness.worker.emit("message", envelope);

          assertEqual(harness.controller.state, "failed");
          assertEqual(harness.worker.terminations, 1);
          assertEqual(harness.controller.snapshot().hasPlan, false);
        }
      }
    },

    "program-evaluation": {
      "expressão usa biblioteca matemática sem cena"() {
        const envelope = executeProgramRequest({
          runId: "expression-run",
          baseVersion: 3,
          source: "sqrt(3 ** 2 + 4 ** 2)",
          mode: "expression",
          allowedCommands: []
        }, {
          evaluate: evaluateTrustedFixture
        });

        assertEqual(envelope.type, "program.completed");
        assertEqual(envelope.plan.commands.length, 0);
        assertEqual(envelope.plan.result.value, 5);
      },

      "programa aceita funções objetos e controle de fluxo"() {
        const envelope = executeProgramRequest({
          runId: "language-run",
          source: [
            "const values = [];",
            "const square = value => value ** 2;",
            "for (let index = 0; index < 5; index += 1) {",
            "  values.push(square(index));",
            "}",
            "return { values, sum: values.reduce((a, b) => a + b, 0) };"
          ].join("\n"),
          mode: "program"
        }, {
          evaluate: evaluateTrustedFixture
        });

        assertEqual(envelope.type, "program.completed");
        assertDeepEqual(
          envelope.plan.result.value,
          { values: [0, 1, 4, 9, 16], sum: 30 }
        );
      },

      "aleatoriedade repete sequência para a mesma semente"() {
        const first = createSeededRandom("city-42");
        const second = createSeededRandom("city-42");

        assertDeepEqual(
          [
            first.random(),
            first.random(-10, 10),
            first.randomInt(4, 30)
          ],
          [
            second.random(),
            second.random(-10, 10),
            second.randomInt(4, 30)
          ]
        );
      },

      "snapshot é somente entrada e saída precisa ser clonável"() {
        const success = executeProgramRequest({
          runId: "snapshot-run",
          snapshot: { object: { position: [1, 2, 3] } },
          source: "({ position: [...snapshot.object.position] })"
        }, {
          evaluate: evaluateTrustedFixture
        });
        const failure = executeProgramRequest({
          runId: "function-result-run",
          source: "(() => 1)"
        }, {
          evaluate: evaluateTrustedFixture
        });

        assertDeepEqual(
          success.plan.result.value,
          { position: [1, 2, 3] }
        );
        assertEqual(failure.type, "program.failed");
        assert(
          failure.error.message.includes("structuredClone")
        );
      },

      "saída é limitada e acompanha o resultado"() {
        const success = executeProgramRequest({
          runId: "print-run",
          source: 'print("valor", 7)',
          maxOutput: 1
        }, {
          evaluate: evaluateTrustedFixture
        });
        const failure = executeProgramRequest({
          runId: "print-limit-run",
          source: 'print("a"); print("b"); return 2;',
          mode: "program",
          maxOutput: 1
        }, {
          evaluate: evaluateTrustedFixture
        });

        assertDeepEqual(
          success.plan.result.output,
          ["valor 7"]
        );
        assertEqual(failure.type, "program.failed");
        assert(failure.error.message.includes("linhas de saída"));
      },

      "fábrica solicita Worker modular dedicado"() {
        const created = [];
        class WorkerFixture {
          constructor(url, options) {
            created.push({ url: String(url), options });
          }
        }

        createBrowserProgramWorker({
          WorkerClass: WorkerFixture,
          workerUrl: new URL(
            "https://example.test/ProgramWorker.js"
          ),
          name: "program-test"
        });

        assertEqual(created.length, 1);
        assertEqual(created[0].options.type, "module");
        assertEqual(created[0].options.name, "program-test");
      }
    },

    "program-session": {
      "estado explícito persiste entre avaliações"() {
        const session = createTrustedProgramSession();
        const first = session.execute({
          runId: "session-state-1",
          source: "session.radius = 12",
          mode: "expression"
        });
        const second = session.execute({
          runId: "session-state-2",
          source: "session.radius * 2",
          mode: "expression"
        });

        assertEqual(first.type, "program.completed");
        assertEqual(second.plan.result.value, 24);
        assertDeepEqual(session.snapshot(), {
          state: "active",
          revision: 2,
          keys: ["radius"]
        });
      },

      "funções do usuário permanecem dentro da sessão"() {
        const session = createTrustedProgramSession();
        session.execute({
          runId: "session-function-1",
          source: [
            "session.polygon = n => n * (n - 3) / 2;",
            "return 'polygon';"
          ].join("\n"),
          mode: "program"
        });
        const result = session.execute({
          runId: "session-function-2",
          source: "session.polygon(8)",
          mode: "expression"
        });

        assertEqual(result.plan.result.value, 20);
      },

      "objetos abstratos podem ser mantidos sem atravessar o Worker"() {
        const session = createTrustedProgramSession();
        session.execute({
          runId: "session-object-1",
          source: [
            "session.city = {",
            "  blocks: [{ height: 3 }, { height: 8 }],",
            "  tallest() { return max(...this.blocks.map(x => x.height)); }",
            "};",
            "return 'city';"
          ].join("\n"),
          mode: "program"
        });
        const result = session.execute({
          runId: "session-object-2",
          source: "session.city.tallest()",
          mode: "expression"
        });

        assertEqual(result.plan.result.value, 8);
      },

      "falha invalida a sessão inteira"() {
        const session = createTrustedProgramSession();
        const failed = session.execute({
          runId: "session-failure",
          source: "throw new Error('broken')",
          mode: "program"
        });

        assertEqual(failed.type, "program.failed");
        assertEqual(session.snapshot().state, "invalid");
        assertThrowsMessage(
          () => session.execute({
            runId: "session-after-failure",
            source: "1 + 1"
          }),
          "Sessão de programa foi invalidada"
        );
      },

      "fábrica solicita Worker de sessão modular"() {
        const created = [];
        class WorkerFixture {
          constructor(url, options) {
            created.push({ url: String(url), options });
          }
        }

        createBrowserProgramSessionWorker({
          WorkerClass: WorkerFixture,
          workerUrl: new URL(
            "https://example.test/ProgramSessionWorker.js"
          ),
          name: "session-test"
        });

        assertEqual(created.length, 1);
        assertEqual(created[0].options.type, "module");
        assertEqual(created[0].options.name, "session-test");
      },

      "controlador reutiliza Worker após resultados válidos"() {
        const harness = createProgramSessionControllerHarness();

        harness.controller.run({
          runId: "persistent-run-1",
          source: "session.value = 4"
        }).catch(() => {});
        harness.worker.emit(
          "message",
          sessionCompletedEnvelope({
            runId: "persistent-run-1",
            revision: 1,
            keys: ["value"]
          })
        );
        harness.controller.run({
          runId: "persistent-run-2",
          source: "session.value * 2"
        }).catch(() => {});
        harness.worker.emit(
          "message",
          sessionCompletedEnvelope({
            runId: "persistent-run-2",
            revision: 2,
            keys: ["value"]
          })
        );

        assertEqual(harness.workerCreations(), 1);
        assertEqual(harness.worker.terminations, 0);
        assertEqual(harness.controller.snapshot().revision, 2);
        assertDeepEqual(harness.controller.snapshot().keys, ["value"]);
      },

      "timeout destrói a sessão sem tocar em plano algum"() {
        const harness = createProgramSessionControllerHarness();
        harness.controller.run({
          runId: "persistent-slow",
          source: "for (;;) {}",
          mode: "program"
        }).catch(() => {});

        harness.fireTimeout();

        assertEqual(harness.controller.snapshot().state, "timed-out");
        assertEqual(harness.controller.snapshot().sessionAlive, false);
        assertEqual(harness.worker.terminations, 1);
      },

      "controlador rejeita qualquer comando vindo da matemática"() {
        const harness = createProgramSessionControllerHarness();
        harness.controller.run({
          runId: "forbidden-command",
          source: "1"
        }).catch(() => {});

        harness.worker.emit(
          "message",
          sessionCompletedEnvelope({
            runId: "forbidden-command",
            revision: 1,
            commands: [{
              sequence: 0,
              command: "object.create.box",
              args: {}
            }]
          })
        );

        assertEqual(harness.controller.snapshot().state, "failed");
        assertEqual(harness.controller.snapshot().sessionAlive, false);
        assert(
          harness.controller.snapshot().lastError.includes(
            "não autorizado"
          )
        );
      },

      "console entrega programa completo sem separar ponto e vírgula"() {
        const calls = [];
        const console = createProgramConsole(calls);
        const source = "session.f = x => x ** 2; return 'f'";

        console.execute(`program ${source}`);

        assertEqual(calls.length, 1);
        assertEqual(calls[0].source, source);
        assertEqual(calls[0].mode, "program");
      }
    },

    "procedure-catalog": {
      "catálogo define atualiza lista e remove procedimentos"() {
        const catalog = new ProcedureCatalog();

        const first = catalog.define("city", "options => options.rows");
        const unchanged = catalog.define(
          "city",
          "options => options.rows",
          { replace: true }
        );
        const updated = catalog.define(
          "city",
          "options => options.cols",
          { replace: true }
        );

        assertEqual(first.changed, true);
        assertEqual(unchanged.changed, false);
        assertEqual(updated.revision, 2);
        assertDeepEqual(catalog.list(), [{
          name: "city",
          sourceLength: "options => options.cols".length
        }]);
        assertEqual(catalog.remove("city").changed, true);
        assertEqual(catalog.snapshot().count, 0);
      },

      "exportação e importação preservam fontes deterministicamente"() {
        const source = new ProcedureCatalog();
        source.define("tower", "({height=4}={}) => height");
        source.define("city", "({rows=2}={}) => rows ** 2");
        const document = source.exportDocument();
        const target = new ProcedureCatalog();

        const result = target.importDocument(document);

        assertEqual(
          document.schemaVersion,
          PROCEDURE_LIBRARY_SCHEMA_VERSION
        );
        assertEqual(result.changed, true);
        assertDeepEqual(target.exportDocument(), document);
        assertDeepEqual(
          target.list().map(entry => entry.name),
          ["city", "tower"]
        );
      },

      "importação conflitante é atômica"() {
        const catalog = new ProcedureCatalog();
        catalog.define("city", "() => 1");
        const before = catalog.exportDocument();

        assertThrowsMessage(
          () => catalog.importDocument({
            schemaVersion: PROCEDURE_LIBRARY_SCHEMA_VERSION,
            procedures: [
              { name: "tower", source: "() => 2" },
              { name: "city", source: "() => 3" }
            ]
          }),
          "conflita"
        );
        assertDeepEqual(catalog.exportDocument(), before);
      },

      "catálogo persiste e restaura fontes sem executar código"() {
        const values = new Map();
        const storage = {
          getItem: key => values.get(key) ?? null,
          setItem: (key, value) => values.set(key, value)
        };
        const store = new BrowserProcedureCatalogStore({
          storage,
          key: "procedure-test"
        });
        const first = new ProcedureCatalog({ storage: store });
        first.define("tower", "({height=8}={}) => height");

        const restored = new ProcedureCatalog({ storage: store });

        assertEqual(restored.snapshot().count, 1);
        assertEqual(restored.snapshot().persistence.restored, true);
        assertEqual(
          restored.get("tower").source,
          "({height=8}={}) => height"
        );
      },

      "falha de persistência não altera catálogo em memória"() {
        const catalog = new ProcedureCatalog({
          storage: {
            load: () => null,
            save() {
              throw new Error("quota unavailable");
            }
          }
        });

        assertThrowsMessage(
          () => catalog.define("tower", "() => 1"),
          "quota unavailable"
        );
        assertEqual(catalog.snapshot().count, 0);
        assert(
          catalog.snapshot().persistence.lastError.includes("quota")
        );
      },

      "documento textual faz roundtrip editável"() {
        const source = new ProcedureCatalog();
        source.define("city", "({rows=2}={}) => rows ** 2");
        const text = source.exportText();
        const target = new ProcedureCatalog();

        const result = target.importText(text, { mode: "replace" });

        assert(text.endsWith("\n"));
        assert(text.includes('"schemaVersion"'));
        assertEqual(result.count, 1);
        assertDeepEqual(target.exportDocument(), source.exportDocument());
      },

      "invocação executa fonte no ambiente espacial autorizado"() {
        const catalog = new ProcedureCatalog();
        catalog.define("row", [
          "({count=3}={}) => {",
          "  for (let i=0;i<count;i+=1) {",
          "    spatial.create('box',{position:[i,0,0]});",
          "  }",
          "  return {count, planned:spatial.stats().commandCount};",
          "}"
        ].join("\n"));

        const envelope = executeProgramRequest({
          runId: "procedure-row",
          allowedCommands: [SPATIAL_CREATE_COMMAND],
          geometryTypes: ["box"],
          source: catalog.invocationSource("row", { count: 4 }),
          mode: "program"
        }, {
          evaluate: evaluateTrustedFixture
        });

        assertEqual(envelope.type, "program.completed");
        assertEqual(envelope.plan.commands.length, 4);
        assertDeepEqual(envelope.plan.result.value, {
          count: 4,
          planned: 4
        });
      },

      "console define lista mostra executa e exporta por nome"() {
        const calls = [];
        const catalog = new ProcedureCatalog();
        const console = createProgramConsole(calls, {
          procedures: catalog
        });

        return console.execute(
          "procedure define tower ({height=8}={}) => height"
        ).then(() => console.execute([
          "procedure list",
          "procedure show tower",
          'procedure run tower {"height":12}'
        ].join("\n")))
          .then(entries => {
            assertEqual(entries.length, 3);
            assertEqual(entries[0].result.count, 1);
            assert(entries[1].result.source.includes("height=8"));
            assertEqual(calls.length, 1);
            assert(calls[0].source.includes('"height":12'));
            return console.execute("procedure export");
          })
          .then(exportEntries => {
            assertEqual(
              exportEntries[0].result.schemaVersion,
              PROCEDURE_LIBRARY_SCHEMA_VERSION
            );
          });
      },

      "comandos administrativos em linhas distintas são sequenciais"() {
        const calls = [];
        const commits = [];
        const console = createProgramConsole(calls, {
          procedures: new ProcedureCatalog(),
          plan: {
            planVersion: PROGRAM_PLAN_VERSION,
            runId: "multiline-plan",
            baseVersion: 0,
            seed: 0,
            commands: [{
              sequence: 0,
              command: SPATIAL_CREATE_COMMAND,
              args: {}
            }],
            result: null
          },
          execute(id, args) {
            commits.push({ id, args: structuredClone(args) });
            return { changed: true };
          }
        });

        return console.execute("program return 'planned'")
          .then(() => console.execute("plan status\nplan commit"))
          .then(entries => {
            assertEqual(entries.length, 2);
            assertEqual(entries[0].result.pending, true);
            assertEqual(entries[1].result.changed, true);
            assertEqual(commits.length, 1);
            assertEqual(commits[0].id, "program.plan.commit");
          });
      }
    },

    "procedure-editor": {
      "numeração conta linhas lógicas e ignora quebra visual"() {
        const longLine = "x".repeat(500);

        assertEqual(logicalLineCount(longLine), 1);
        assertEqual(logicalLineCount(`${longLine}\nreturn x`), 2);
        assertEqual(logicalLineCount(""), 1);
      },

      "tamanho da fonte permanece em faixa acessível"() {
        assertEqual(clampEditorFontSize(2), 10);
        assertEqual(clampEditorFontSize(17.4), 17);
        assertEqual(clampEditorFontSize(100), 28);
        assertEqual(clampEditorFontSize("invalid"), 14);
      },

      "realce léxico escapa conteúdo antes de produzir marcação"() {
        const html = highlightProcedureSource(
          'const value = "<box>"; // comment'
        );

        assert(html.includes("ss-token-keyword"));
        assert(html.includes("ss-token-string"));
        assert(html.includes("ss-token-comment"));
        assert(html.includes("&lt;box&gt;"));
        assertEqual(html.includes("<box>"), false);
      },

      "realce mantém uma faixa para cada linha vazia"() {
        const html = highlightProcedureSource("return 1\n\nreturn 2");
        const lines = html.match(/ss-code-line/g) ?? [];

        assertEqual(lines.length, 3);
        assert(html.includes("&#8203;"));
      }
    },

    "spatial-planning": {
      "create produz intenção serializável sem tocar na cena"() {
        const envelope = executeProgramRequest({
          runId: "spatial-create",
          baseVersion: 12,
          allowedCommands: [SPATIAL_CREATE_COMMAND],
          geometryTypes: ["box", "sphere"],
          source: [
            "const handle = spatial.create('box', {",
            "  size: [1, 2, 3],",
            "  position: [4, 5, 6],",
            "  color: '#336699'",
            "});",
            "return handle;"
          ].join("\n"),
          mode: "program"
        }, {
          evaluate: evaluateTrustedFixture
        });

        assertEqual(envelope.type, "program.completed");
        assertEqual(envelope.plan.baseVersion, 12);
        assertEqual(envelope.plan.commands.length, 1);
        assertEqual(
          envelope.plan.commands[0].command,
          SPATIAL_CREATE_COMMAND
        );
        assertDeepEqual(
          envelope.plan.commands[0].args.geometry,
          { size: [1, 2, 3], type: "box" }
        );
        assertDeepEqual(
          envelope.plan.commands[0].args.position,
          [4, 5, 6]
        );
        assertEqual(envelope.plan.commands[0].args.color, "#336699");
        assertDeepEqual(
          envelope.plan.result.value,
          envelope.plan.commands[0].args.handle
        );
        structuredClone(envelope.plan);
      },

      "handles repetem para mesma execução e ordem"() {
        const request = {
          runId: "deterministic-spatial",
          allowedCommands: [SPATIAL_CREATE_COMMAND],
          geometryTypes: ["box"],
          source: [
            "return [",
            "  spatial.create('box'),",
            "  spatial.create('box')",
            "];"
          ].join("\n"),
          mode: "program"
        };
        const first = executeProgramRequest(request, {
          evaluate: evaluateTrustedFixture
        });
        const second = executeProgramRequest(request, {
          evaluate: evaluateTrustedFixture
        });

        assertDeepEqual(
          first.plan.result.value,
          second.plan.result.value
        );
        assertEqual(first.plan.commands[0].args.handle.id,
          "deterministic-spatial:object:1");
        assertEqual(first.plan.commands[1].args.handle.id,
          "deterministic-spatial:object:2");
      },

      "geometria fora das capacidades falha fechado"() {
        const envelope = executeProgramRequest({
          runId: "unsupported-spatial",
          allowedCommands: [SPATIAL_CREATE_COMMAND],
          geometryTypes: ["box"],
          source: "spatial.create('mesh')"
        }, {
          evaluate: evaluateTrustedFixture
        });

        assertEqual(envelope.type, "program.failed");
        assert(envelope.error.message.includes("não permitida"));
      },

      "orçamento interrompe plano antes do comando excedente"() {
        const envelope = executeProgramRequest({
          runId: "budget-spatial",
          allowedCommands: [SPATIAL_CREATE_COMMAND],
          geometryTypes: ["box"],
          maxCommands: 2,
          source: [
            "spatial.create('box');",
            "spatial.create('box');",
            "spatial.create('box');"
          ].join("\n"),
          mode: "program"
        }, {
          evaluate: evaluateTrustedFixture
        });

        assertEqual(envelope.type, "program.failed");
        assert(envelope.error.message.includes("limite de 2 comandos"));
      },

      "sem capability spatial permanece ausente"() {
        const envelope = executeProgramRequest({
          runId: "no-spatial-capability",
          allowedCommands: [],
          geometryTypes: ["box"],
          source: "typeof spatial"
        }, {
          evaluate: evaluateTrustedFixture
        });

        assertEqual(envelope.plan.result.value, "undefined");
        assertEqual(envelope.plan.commands.length, 0);
      },

      "controlador aceita somente intenção autorizada"() {
        const harness = createProgramSessionControllerHarness({
          allowedCommands: [SPATIAL_CREATE_COMMAND],
          geometryTypes: ["box"]
        });
        harness.controller.run({
          runId: "authorized-spatial",
          source: "spatial.create('box')",
          mode: "program"
        }).catch(() => {});
        harness.worker.emit(
          "message",
          sessionCompletedEnvelope({
            runId: "authorized-spatial",
            revision: 1,
            commands: [{
              sequence: 0,
              command: SPATIAL_CREATE_COMMAND,
              args: {
                handle: {
                  kind: "object",
                  id: "authorized-spatial:object:1"
                },
                geometry: { type: "box" }
              }
            }]
          })
        );

        assertEqual(harness.controller.snapshot().state, "idle");
        assertEqual(harness.worker.terminations, 0);
      }
    },

    "spatial-plan-commit": {
      "validação compila sem alterar mundo recursos ou histórico"() {
        const fixture = createSpatialCommitFixture();
        const plan = spatialCreationPlan({
          baseVersion: fixture.sandbox.revision,
          creations: [{
            type: "box",
            options: {
              size: [2, 4, 2],
              position: [0, 2, 0],
              color: "#4488ff"
            }
          }]
        });
        const worldBefore = fixture.sandbox.getState();
        const assetsBefore = fixture.appearanceRuntime.exportAssets();

        const compiled = fixture.service.validate(plan);

        assertEqual(compiled.objects.length, 1);
        assertDeepEqual(fixture.sandbox.getState(), worldBefore);
        assertDeepEqual(
          fixture.appearanceRuntime.exportAssets(),
          assetsBefore
        );
        assertEqual(
          fixture.sandbox.getHistoryDiagnostics().commandCount,
          0
        );
      },

      "commit cria lote inteiro em um único item de undo"() {
        const fixture = createSpatialCommitFixture();
        const plan = spatialCreationPlan({
          baseVersion: fixture.sandbox.revision,
          creations: [
            {
              type: "box",
              options: {
                size: [1, 4, 1],
                position: [0, 2, 0],
                color: "#336699"
              }
            },
            {
              type: "sphere",
              options: {
                radius: 1.5,
                position: [3, 1.5, 0],
                color: "#336699"
              }
            }
          ]
        });

        const result = fixture.service.commit(plan);

        assertEqual(result.changed, true);
        assertEqual(result.createdIds.length, 2);
        assertEqual(fixture.sandbox.getState().objects.length, 2);
        assertEqual(
          fixture.sandbox.getHistoryDiagnostics().commandCount,
          1
        );
        assertEqual(
          fixture.editor.selection.snapshot().members.length,
          2
        );

        fixture.sandbox.undo();
        assertEqual(fixture.sandbox.getState().objects.length, 0);
      },

      "aparência idêntica é deduplicada com referências corretas"() {
        const fixture = createSpatialCommitFixture();
        fixture.service.commit(spatialCreationPlan({
          baseVersion: fixture.sandbox.revision,
          creations: Array.from({ length: 5 }, (_, index) => ({
            type: "box",
            options: {
              size: [1, 1, 1],
              position: [index, 0.5, 0],
              color: "#55aa77"
            }
          }))
        }));
        const objects = fixture.sandbox.getState().objects;
        const stats = fixture.appearanceRuntime.stats().assets;

        assertEqual(new Set(
          objects.map(object => object.appearanceId)
        ).size, 1);
        assertEqual(stats.byKind.appearance.assets, 1);
        assertEqual(stats.byKind.appearance.references, 5);
        assertEqual(stats.byKind.material.assets, 1);
        assertEqual(stats.byKind.material.references, 5);
      },

      "geometria inválida não deixa efeitos parciais"() {
        const fixture = createSpatialCommitFixture();
        const plan = spatialCreationPlan({
          baseVersion: fixture.sandbox.revision,
          creations: [
            { type: "box", options: { size: [1, 1, 1] } },
            { type: "sphere", options: { radius: -2 } }
          ]
        });

        assertThrowsMessage(
          () => fixture.service.commit(plan),
          "radius deve ser positivo"
        );
        assertEqual(fixture.sandbox.getState().objects.length, 0);
        assertEqual(
          fixture.sandbox.getHistoryDiagnostics().commandCount,
          0
        );
        assertEqual(
          fixture.appearanceRuntime.stats().assets.assets,
          0
        );
      },

      "revisão local impede commit de plano obsoleto"() {
        const fixture = createSpatialCommitFixture();
        const plan = spatialCreationPlan({
          baseVersion: fixture.sandbox.revision,
          creations: [{ type: "box", options: {} }]
        });
        fixture.sandbox.dispatch({
          type: "object.create",
          id: "external-object",
          color: "#ffffff"
        });

        assertThrowsMessage(
          () => fixture.service.commit(plan),
          "Plano obsoleto"
        );
        assertEqual(fixture.sandbox.getState().objects.length, 1);
        assertEqual(
          fixture.sandbox.getHistoryDiagnostics().commandCount,
          1
        );
      },

      "handles duplicados são rejeitados antes da transação"() {
        const fixture = createSpatialCommitFixture();
        const plan = spatialCreationPlan({
          baseVersion: fixture.sandbox.revision,
          creations: [
            { type: "box", handleId: "same-handle", options: {} },
            { type: "sphere", handleId: "same-handle", options: {} }
          ]
        });

        assertThrowsMessage(
          () => fixture.service.commit(plan),
          "Handle espacial duplicado"
        );
        assertEqual(fixture.sandbox.getState().objects.length, 0);
      }
    },

    viewer: {
      "viewer mantém apenas estado local"() {
        const viewer = new ViewerState({
          viewerId: "viewer-a",
          camera: { position: [1, 2, 3] },
          selection: ["instance-a"]
        });

        const snapshot = viewer.snapshot();

        assertEqual(snapshot.viewerId, "viewer-a");
        assertDeepEqual(snapshot.selection, ["instance-a"]);
        assertEqual("region" in snapshot, false);
        assertEqual("sandbox" in snapshot, false);
      },

      "viewer notifica atualização local"() {
        const viewer = new ViewerState({
          viewerId: "viewer-b"
        });
        const received = [];

        viewer.subscribe(snapshot => {
          received.push(snapshot);
        });

        viewer.update({ hover: "instance-b" });

        assertEqual(received.length, 2);
        assertEqual(received.at(-1).hover, "instance-b");
        assertEqual(received.at(-1).revision, 1);
      }
    },

    editor: {
      "preview não publica comando"() {
        const emitted = [];
        const session = new EditorSession({
          viewerId: "viewer-a",
          baseVersion: 10,
          emitCommand(command) {
            emitted.push(command);
          }
        });

        session.begin({
          type: "instance.transform",
          targets: ["instance-a"],
          initial: { position: [0, 0, 0] }
        });

        session.preview({ position: [3, 2, 1] });

        assertEqual(emitted.length, 0);
        assertEqual(session.active, true);
      },

      "commit publica um único comando final"() {
        const emitted = [];
        const session = new EditorSession({
          viewerId: "viewer-a",
          baseVersion: 10,
          emitCommand(command) {
            emitted.push(command);
          }
        });

        session.begin({
          type: "instance.transform",
          targets: ["instance-a"],
          initial: { position: [0, 0, 0] }
        });

        session.preview({ position: [1, 0, 0] });
        session.preview({ position: [2, 0, 0] });
        const command = session.commit();

        assertEqual(emitted.length, 1);
        assertEqual(emitted[0], command);
        assertEqual(command.baseVersion, 10);
        assertDeepEqual(command.payload.position, [2, 0, 0]);
        assertEqual(session.active, false);
      },

      "cancel descarta operação sem comando"() {
        const emitted = [];
        const session = new EditorSession({
          viewerId: "viewer-a",
          emitCommand(command) {
            emitted.push(command);
          }
        });

        session.begin({
          type: "vertex.preview",
          targets: ["vertex-1"]
        });

        const result = session.cancel();

        assertEqual(result.cancelled, true);
        assertEqual(emitted.length, 0);
        assertEqual(session.active, false);
      }
    },

    clock: {
      "clock executa passos fixos"() {
        const clock = new SimulationClock({
          stepSeconds: 0.1,
          maxCatchUpSteps: 5
        });
        const ticks = [];

        const result = clock.advance(0.35, context => {
          ticks.push(context);
        });

        assertEqual(result.executed, 3);
        assertEqual(result.tick, 3);
        assertEqual(ticks.length, 3);
        assertNear(result.simulationTime, 0.3);
        assertNear(result.interpolation, 0.5);
      },

      "clock limita catch-up"() {
        const clock = new SimulationClock({
          stepSeconds: 0.1,
          maxCatchUpSteps: 2
        });

        let count = 0;
        const result = clock.advance(1, () => {
          count += 1;
        });

        assertEqual(result.executed, 2);
        assertEqual(count, 2);
      }
    },

assets: {
  "hash FNV-1a preserva identificadores conhecidos"() {
    assertEqual(fnv1a64(""), "cbf29ce484222325");
    assertEqual(fnv1a64("hello"), "a430d84680aabd0b");
    assertEqual(fnv1a64("ação"), "74b2e70b31a1c349");
  },

  "textura idêntica é armazenada uma vez"() {
    const graph = new AppearanceGraph();

    const first = graph.internLegacyMaterial({
      color: "#ffffff",
      texture: {
        src: "data:image/png;base64,AAAA",
        repeat: [1, 1],
        offset: [0, 0],
        rotationDeg: 0,
        wrap: "repeat"
      }
    });

    const second = graph.internLegacyMaterial({
      color: "#ffffff",
      texture: {
        src: "data:image/png;base64,AAAA",
        repeat: [1, 1],
        offset: [0, 0],
        rotationDeg: 0,
        wrap: "repeat"
      }
    });

    assertEqual(first.texture.id, second.texture.id);
    assertEqual(
      graph.stats().byKind.texture.assets,
      1
    );
  },

  "aparência idêntica é compartilhada"() {
    const graph = new AppearanceGraph();

    const first = graph.internLegacyMaterial({
      color: "#abcdef"
    });

    const second = graph.internLegacyMaterial({
      color: "#abcdef"
    });

    assertEqual(
      first.appearanceId,
      second.appearanceId
    );
  },

  "transformações criam materiais distintos"() {
    const graph = new AppearanceGraph();

    const first = graph.internLegacyMaterial({
      color: "#ffffff",
      texture: {
        src: "data:image/png;base64,AAAA",
        repeat: [1, 1]
      }
    });

    const second = graph.internLegacyMaterial({
      color: "#ffffff",
      texture: {
        src: "data:image/png;base64,AAAA",
        repeat: [2, 2]
      }
    });

    assertEqual(first.texture.id, second.texture.id);
    assert(
      first.material.id !== second.material.id
    );
  },

  "objeto normalizado mantém appearanceId"() {
    const graph = new AppearanceGraph();

    const result = graph.internLegacyMaterial({
      color: "#ffffff"
    });

    const object = graph.attachToObject(
      {
        id: "box-1",
        material: {
          color: "#ffffff"
        }
      },
      result.appearanceId
    );

    assertEqual(
      object.appearanceId,
      result.appearanceId
    );

    assertEqual("material" in object, false);
  }
},

"project-assets": {
  "textura repetida aparece uma vez"() {
    const adapter =
      new ProjectAppearanceAdapter();

    const texture =
      "data:image/png;base64," +
      "A".repeat(4096);

    const normalized =
      adapter.normalizeScene({
        schemaVersion: 1,
        objects: [
          projectAssetObject("a", texture),
          projectAssetObject("b", texture)
        ]
      });

    const textures =
      Object.values(
        normalized.assets.assets
      ).filter(
        asset =>
          asset.kind === "texture"
      );

    assertEqual(textures.length, 1);

    assertEqual(
      normalized.scene.objects[0].appearanceId,
      normalized.scene.objects[1].appearanceId
    );
  },

  "formato deduplicado é menor"() {
    const adapter =
      new ProjectAppearanceAdapter();

    const texture =
      "data:image/png;base64," +
      "B".repeat(16384);

    const legacy = {
      schemaVersion: 1,
      objects: Array.from(
        { length: 10 },
        (_, index) =>
          projectAssetObject(
            `box-${index}`,
            texture
          )
      )
    };

    const normalized =
      adapter.normalizeScene(legacy);

    const legacyBytes =
      new Blob([
        JSON.stringify(legacy)
      ]).size;

    const normalizedBytes =
      new Blob([
        JSON.stringify(normalized)
      ]).size;

    assert(
      normalizedBytes <
      legacyBytes / 2
    );
  },

  "roundtrip restaura textura"() {
    const adapter =
      new ProjectAppearanceAdapter();

    const legacy = {
      schemaVersion: 1,
      objects: [
        projectAssetObject(
          "box-a",
          "data:image/png;base64,CCCC"
        )
      ]
    };

    const normalized =
      adapter.normalizeScene(legacy);

    const restored =
      adapter.denormalizeScene(
        normalized.scene,
        normalized.assets
      );

    assertEqual(
      restored.objects[0]
        .material.texture.src,
      legacy.objects[0]
        .material.texture.src
    );

    assertDeepEqual(
      restored.objects[0]
        .material.texture.repeat,
      [2, 3]
    );
  },

  "appearance ausente é rejeitada"() {
    const adapter =
      new ProjectAppearanceAdapter();

    let failed = false;

    try {
      adapter.denormalizeScene(
        {
          objects: [{
            id: "missing",
            appearanceId:
              "appearance:missing"
          }]
        },
        {
          schemaVersion: 1,
          assets: {}
        }
      );
    } catch {
      failed = true;
    }

    assertEqual(failed, true);
  }
},

"appearance-runtime": {
  "resolve reutiliza a mesma referência"() {
    const runtime =
      new AppearanceRuntime();

    const created =
      runtime.internLegacyMaterial({
        color: "#ffffff",
        texture: {
          src:
            "data:image/png;base64,AAAA"
        }
      });

    const first =
      runtime.resolve(
        created.appearanceId
      );

    const second =
      runtime.resolve(
        created.appearanceId
      );

    assertEqual(
      first,
      second
    );

    assertEqual(
      runtime.stats()
        .resolvedCache,
      1
    );
  },

  "import invalida cache de resolução"() {
    const source =
      new AppearanceRuntime();

    const created =
      source.internLegacyMaterial({
        color: "#abcdef"
      });

    const assets =
      source.exportAssets();

    const runtime =
      new AppearanceRuntime();

    runtime.importAssets(assets);

    const first =
      runtime.resolve(
        created.appearanceId
      );

    runtime.importAssets(
      assets
    );

    const second =
      runtime.resolve(
        created.appearanceId
      );

    assert(
      first !== second
    );

    assertEqual(
      runtime.revision,
      2
    );
  },

  "normalização remove material embutido"() {
    const runtime =
      new AppearanceRuntime();

    const scene =
      runtime.normalizeScene({
        schemaVersion: 1,
        objects: [{
          id: "box-a",
          material: {
            color: "#123456"
          }
        }]
      });

    assertEqual(
      "material" in
        scene.objects[0],
      false
    );

    assert(
      Boolean(
        scene.objects[0]
          .appearanceId
      )
    );
  },

  "grupo lógico atravessa normalização sem aparência"() {
    const runtime = new AppearanceRuntime();
    const group = {
      id: "group-a",
      kind: "group",
      parentId: null,
      position: [1, 2, 3],
      rotation: [0, 0, 0, 1],
      scale: [1, 1, 1],
      pivot: [0.5, 0, 0]
    };

    const scene = runtime.normalizeScene({
      schemaVersion: 1,
      objects: [group]
    });
    const projected = runtime.projectObject(scene.objects[0]);

    assertDeepEqual(projected, group);
    assertEqual("appearanceId" in projected, false);
    assertEqual("material" in projected, false);
    assertEqual(runtime.stats().assets.assets, 0);
  },

  "fluxo de agrupamento projeta grupo e filhos"() {
    const runtime = new AppearanceRuntime();
    const scene = runtime.normalizeScene({
      schemaVersion: 1,
      objects: [
        {
          ...propertyObject("box-a", "#ff0000"),
          position: [0, 0, 0]
        },
        {
          ...propertyObject("box-b", "#00ff00"),
          position: [2, 0, 0]
        }
      ]
    });
    const result = boxRegionReducer(scene, {
      type: "selection.group",
      groupId: "group-a",
      targetIds: ["box-a", "box-b"]
    });
    const projected = result.state.objects.map(object =>
      runtime.projectObject(object)
    );
    const group = projected.find(object => object.id === "group-a");
    const child = projected.find(object => object.id === "box-a");
    const hierarchy = new HierarchyIndex(result.state.objects);

    assertEqual(group.kind, "group");
    assertEqual("material" in group, false);
    assert(Boolean(child.material));
    assertEqual(hierarchy.parentOf("box-a"), "group-a");
    assertEqual(hierarchy.parentOf("box-b"), "group-a");
  },

  "stats distingue assets e cache"() {
    const runtime =
      new AppearanceRuntime();

    const created =
      runtime.internLegacyMaterial({
        color: "#ffffff"
      });

    const before =
      runtime.stats();

    runtime.resolve(
      created.appearanceId
    );

    const after =
      runtime.stats();

    assertEqual(
      before.resolvedCache,
      0
    );

    assertEqual(
      after.resolvedCache,
      1
    );

    assertEqual(
      after.assets.byKind
        .appearance.assets,
      1
    );
  }
},

    "normalized-runtime": {
      "projeção reutiliza material legado"() {
        const runtime = new AppearanceRuntime();
        const scene = runtime.normalizeScene({
          schemaVersion: 1,
          objects: [
            {
              id: "a",
              material: {
                color: "#ffffff",
                texture: {
                  src: "data:image/png;base64,AAAA"
                }
              }
            },
            {
              id: "b",
              material: {
                color: "#ffffff",
                texture: {
                  src: "data:image/png;base64,AAAA"
                }
              }
            }
          ]
        });

        const projected = runtime.projectScene(scene);

        assertEqual("material" in scene.objects[0], false);
        assertEqual(
          projected.objects[0].material,
          projected.objects[1].material
        );
      },

      "duplicação normalizada não contém Base64"() {
        const runtime = new AppearanceRuntime();
        const scene = runtime.normalizeScene({
          schemaVersion: 1,
          objects: [{
            id: "source",
            material: {
              color: "#ffffff",
              texture: {
                src:
                  "data:image/png;base64," +
                  "A".repeat(4096)
              }
            }
          }]
        });

        const duplicate = structuredClone(scene.objects[0]);
        duplicate.id = "duplicate";
        const text = JSON.stringify(duplicate);

        assertEqual(text.includes("data:image"), false);
        assert(Boolean(duplicate.appearanceId));
      }
    },

    "incremental-runtime": {
      "mudanças de objeto são incrementais"() {
        const result = classifyChanges([
          { type: "object-created", objectId: "a" },
          { type: "object-transform", objectId: "a" },
          { type: "object-deleted", objectId: "b" }
        ]);

        assertEqual(result.mode, "incremental");
        assertDeepEqual(result.objectIds, ["a", "b"]);
      },

      "undo exige reconstrução integral"() {
        const result = classifyChanges([{ type: "sandbox-undo" }]);
        assertEqual(result.mode, "full");
      },

      "mudança desconhecida usa fallback integral"() {
        const result = classifyChanges([{ type: "future-change" }]);
        assertEqual(result.mode, "full");
      }
    },

"batch-selection": {
  "replaceMany emite uma notificação"() {
    const selection = new Selection();
    let notifications = 0;
    selection.subscribe((_, event) => {
      if (event.type !== "initial") notifications += 1;
    });
    selection.replaceMany(
      Array.from({ length: 1000 }, (_, index) => ({
        kind: "object",
        regionId: "region-main",
        objectId: `object-${index}`
      })),
      { activeObjectId: "object-999" }
    );
    assertEqual(notifications, 1);
    assertEqual(selection.size, 1000);
    assertEqual(selection.activeMember.objectId, "object-999");
  },

  "replaceMany remove duplicatas"() {
    const selection = new Selection();
    selection.replaceMany([
      { kind: "object", regionId: "region-main", objectId: "a" },
      { kind: "object", regionId: "region-main", objectId: "a" },
      { kind: "object", regionId: "region-main", objectId: "b" }
    ]);
    assertEqual(selection.size, 2);
  }
},


    "affine-math": {
      "translação acumulada"() {
        const step=composeAffineOperations([{type:"move",value:[2,0,0]}]);
        const c=affineCopies({position:[1,0,0],rotation:[0,0,0,1],scale:[1,1,1]},3,step);
        assertDeepEqual(c.map(x=>x.position.map(roundAffine)),[[3,0,0],[5,0,0],[7,0,0]]);
      },
      "escala acumulada"() {
        const step=composeAffineOperations([{type:"scale",value:[2,2,2]}]);
        const c=affineCopies({position:[0,0,0],rotation:[0,0,0,1],scale:[1,1,1]},3,step);
        assertDeepEqual(c.map(x=>x.scale.map(roundAffine)),[[2,2,2],[4,4,4],[8,8,8]]);
      },
      "rotação fecha ciclo"() {
        const step=composeAffineOperations([{type:"rotate",value:[0,0,90]}]);
        const c=affineCopies({position:[1,0,0],rotation:[0,0,0,1],scale:[1,1,1]},4,step);
        assertDeepEqual(c.at(-1).position.map(roundAffine),[1,0,0]);
      },
      "pivô é preservado"() {
        const step=composeAffineOperations([
          {type:"pivot",value:[1,0,0]},
          {type:"rotate",value:[0,0,180]}
        ]);
        const c=affineCopies({position:[2,0,0],rotation:[0,0,0,1],scale:[1,1,1]},1,step);
        assertDeepEqual(c[0].position.map(roundAffine),[0,0,0]);
      },
      "roundtrip preserva posição e escala"() {
        const source={position:[3,-2,5],rotation:eulerQuaternion([20,30,40]),scale:[2,3,4]};
        const restored=decomposeTransform(composeTransform(source));
        assertDeepEqual(restored.position.map(roundAffine),source.position);
        assertDeepEqual(restored.scale.map(roundAffine),source.scale);
      },
      "inversa afim preserva identidade"() {
        const matrix=composeTransform({
          position:[3,-2,5],
          rotation:eulerQuaternion([20,30,40]),
          scale:[2,3,4]
        });
        const product=multiplyMatrices(matrix,invertAffineMatrix(matrix));
        assertDeepEqual(product.map(roundAffine),identityMatrix());
      },
      "decomposição estrita aceita TRS exato"() {
        const source={position:[3,-2,5],rotation:eulerQuaternion([20,30,40]),scale:[2,3,4]};
        const restored=decomposeTransformStrict(composeTransform(source));
        assertDeepEqual(restored.position.map(roundAffine),source.position);
        assertDeepEqual(restored.scale.map(roundAffine),source.scale);
      },
      "decomposição estrita rejeita cisalhamento"() {
        const shear=[1,0,0,0, 0.5,1,0,0, 0,0,1,0, 0,0,0,1];
        assertThrowsCode(
          () => decomposeTransformStrict(shear),
          "NON_TRS_TRANSFORM"
        );
      },
      "inversa afim rejeita escala nula"() {
        const singular=composeTransform({scale:[1,0,1]});
        assertThrowsCode(
          () => invertAffineMatrix(singular),
          "NON_INVERTIBLE_TRANSFORM"
        );
      },
      "gera dez mil transformações"() {
        const step=composeAffineOperations([
          {type:"move",value:[0.01,0,0]},
          {type:"rotate",value:[0,0,0.1]}
        ]);
        assertEqual(affineCopies({position:[0,0,0],rotation:[0,0,0,1],scale:[1,1,1]},10000,step).length,10000);
      }
    },

    "scene-hierarchy": {
      "indexa raízes pais e filhos em ordem determinística"() {
        const hierarchy=new HierarchyIndex(hierarchyFixture());
        assertDeepEqual(hierarchy.roots(),["root","loose"]);
        assertDeepEqual(hierarchy.childrenOf("root"),["group","sibling"]);
        assertEqual(hierarchy.parentOf("child"),"group");
      },
      "compõe transformação mundial pela cadeia de âncoras"() {
        const hierarchy=new HierarchyIndex(hierarchyFixture());
        const world=decomposeTransformStrict(hierarchy.worldMatrixOf("child"));
        assertDeepEqual(world.position.map(roundAffine),[11,4,3]);
      },
      "projeta pivô local no espaço mundial"() {
        const hierarchy=new HierarchyIndex([
          {id:"root",position:[10,0,0]},
          {
            id:"group",
            kind:"group",
            parentId:"root",
            position:[1,2,0],
            rotation:eulerQuaternion([0,0,90]),
            scale:[2,2,2],
            pivot:[1,0,0]
          }
        ]);
        assertDeepEqual(
          hierarchy.worldPivotOf("group").map(roundAffine),
          [11,4,0]
        );
      },
      "cache mundial reutiliza referência imutável"() {
        const hierarchy=new HierarchyIndex(hierarchyFixture());
        const first=hierarchy.worldMatrixOf("child");
        const second=hierarchy.worldMatrixOf("child");
        assertEqual(first,second);
        assertEqual(Object.isFrozen(first),true);
      },
      "seleção canônica remove descendentes redundantes"() {
        const hierarchy=new HierarchyIndex(hierarchyFixture());
        assertDeepEqual(
          hierarchy.canonicalizeSelection(["child","group","loose","child"]),
          ["group","loose"]
        );
      },
      "travessia de descendentes preserva ordem da cena"() {
        const hierarchy=new HierarchyIndex(hierarchyFixture());
        assertDeepEqual(
          hierarchy.descendantsOf("root"),
          ["group","child","sibling"]
        );
      },
      "rejeita pai inexistente"() {
        assertThrowsCode(
          () => new HierarchyIndex([{id:"child",parentId:"missing"}]),
          "UNKNOWN_PARENT"
        );
      },
      "rejeita identificador duplicado"() {
        assertThrowsCode(
          () => new HierarchyIndex([{id:"same"},{id:"same"}]),
          "DUPLICATE_NODE_ID"
        );
      },
      "rejeita ciclo direto ou por reparentamento"() {
        assertThrowsCode(
          () => new HierarchyIndex([
            {id:"a",parentId:"b"},
            {id:"b",parentId:"a"}
          ]),
          "HIERARCHY_CYCLE"
        );
        const hierarchy=new HierarchyIndex(hierarchyFixture());
        assertThrowsCode(
          () => hierarchy.assertCanReparent("root","child"),
          "HIERARCHY_CYCLE"
        );
      }
    },

    "hierarchy-reparent": {
      "preserva transform mundial ao trocar de pai"() {
        const sandbox=createHierarchySandbox();
        const before=new HierarchyIndex(sandbox.getSnapshot().objects)
          .worldMatrixOf("moving");

        assertEqual(sandbox.dispatch({
          type:"hierarchy.reparent",
          id:"moving",
          parentId:"target"
        }),true);

        const state=sandbox.getSnapshot();
        const after=new HierarchyIndex(state.objects).worldMatrixOf("moving");
        assertMatricesNear(after,before);
        assertEqual(findHierarchyNode(state,"moving").parentId,"target");
      },
      "preserva transform mundial de toda a subárvore"() {
        const sandbox=createHierarchySandbox();
        const beforeHierarchy=new HierarchyIndex(sandbox.getSnapshot().objects);
        const movingBefore=beforeHierarchy.worldMatrixOf("moving");
        const childBefore=beforeHierarchy.worldMatrixOf("nested");

        sandbox.dispatch({
          type:"hierarchy.reparent",
          id:"moving",
          parentId:"target"
        });

        const afterHierarchy=new HierarchyIndex(sandbox.getSnapshot().objects);
        assertMatricesNear(afterHierarchy.worldMatrixOf("moving"),movingBefore);
        assertMatricesNear(afterHierarchy.worldMatrixOf("nested"),childBefore);
      },
      "desfazer restaura pai e transform local"() {
        const sandbox=createHierarchySandbox();
        const before=sandbox.getState();
        sandbox.dispatch({
          type:"hierarchy.reparent",
          id:"moving",
          parentId:"target"
        });
        assertEqual(sandbox.getHistoryDiagnostics().commandCount,1);
        assertEqual(sandbox.undo(),true);
        assertDeepEqual(sandbox.getState(),before);
      },
      "mesmo pai não cria histórico"() {
        const sandbox=createHierarchySandbox();
        assertEqual(sandbox.dispatch({
          type:"hierarchy.reparent",
          id:"moving",
          parentId:"source"
        }),false);
        assertEqual(sandbox.getHistoryDiagnostics().commandCount,0);
      },
      "ciclo falha sem alterar estado ou histórico"() {
        const sandbox=createHierarchySandbox();
        const before=sandbox.getState();
        assertThrowsCode(
          () => sandbox.dispatch({
            type:"hierarchy.reparent",
            id:"source",
            parentId:"nested"
          }),
          "HIERARCHY_CYCLE"
        );
        assertDeepEqual(sandbox.getState(),before);
        assertEqual(sandbox.getHistoryDiagnostics().commandCount,0);
      },
      "cisalhamento falha sem aproximar o transform"() {
        const sandbox=createShearHierarchySandbox();
        const before=sandbox.getState();
        assertThrowsCode(
          () => sandbox.dispatch({
            type:"hierarchy.reparent",
            id:"rotated-child",
            parentId:null
          }),
          "NON_TRS_TRANSFORM"
        );
        assertDeepEqual(sandbox.getState(),before);
        assertEqual(sandbox.getHistoryDiagnostics().commandCount,0);
      }
    },

    "hierarchical-render-projection": {
      "projeta matriz mundial hierárquica no proxy"() {
        const hierarchy=new HierarchyIndex(hierarchyFixture());
        const matrix=hierarchy.worldMatrixOf("child");
        const proxy=applyProjectedWorldMatrix(new THREE.Object3D(),matrix);
        assertMatricesNear(proxy.matrix.toArray(),matrix);
        assertMatricesNear(proxy.matrixWorld.toArray(),matrix);
      },
      "preserva matriz com cisalhamento sem recomposição TRS"() {
        const shear=[1,0,0,0, 0.5,1,0,0, 0,0,1,0, 3,2,1,1];
        const proxy=applyProjectedWorldMatrix(new THREE.Object3D(),shear);
        assertEqual(proxy.matrixAutoUpdate,false);
        assertMatricesNear(proxy.matrix.toArray(),shear);
      },
      "alteração de ancestral invalida somente sua subárvore"() {
        const hierarchy=new HierarchyIndex(hierarchyFixture());
        assertDeepEqual(
          affectedHierarchyIds(hierarchy,[{
            type:"object-transform",
            objectId:"group"
          }]),
          ["group","child"]
        );
      }
    },

    "hierarchy-world-commit": {
      "converte transform mundial de filho para espaço local"() {
        const sandbox=createHierarchySandbox();
        const hierarchy=new HierarchyIndex(sandbox.getSnapshot().objects);
        const desired=multiplyMatrices(
          composeTransform({position:[3,-2,1]}),
          hierarchy.worldMatrixOf("moving")
        );

        sandbox.dispatch({
          type:"selection.transform-world",
          transforms:[{id:"moving",worldMatrix:desired}]
        });

        const after=new HierarchyIndex(sandbox.getSnapshot().objects);
        assertMatricesNear(after.worldMatrixOf("moving"),desired);
      },
      "transformar ancestral mantém locals dos descendentes"() {
        const sandbox=createHierarchySandbox();
        const before=findHierarchyNode(sandbox.getState(),"nested");
        const hierarchy=new HierarchyIndex(sandbox.getSnapshot().objects);
        const desired=multiplyMatrices(
          composeTransform({position:[2,0,0]}),
          hierarchy.worldMatrixOf("moving")
        );

        sandbox.dispatch({
          type:"selection.transform-world",
          transforms:[{id:"moving",worldMatrix:desired}]
        });

        const nested=findHierarchyNode(sandbox.getState(),"nested");
        assertDeepEqual(nested.position,before.position);
        assertDeepEqual(nested.rotation,before.rotation);
        assertDeepEqual(nested.scale,before.scale);
      },
      "ancestral e descendente explícitos usam o pai proposto"() {
        const sandbox=createHierarchySandbox();
        const before=new HierarchyIndex(sandbox.getSnapshot().objects);
        const delta=composeTransform({position:[4,1,-2]});
        const movingDesired=multiplyMatrices(delta,before.worldMatrixOf("moving"));
        const nestedDesired=multiplyMatrices(delta,before.worldMatrixOf("nested"));

        sandbox.dispatch({
          type:"selection.transform-world",
          transforms:[
            {id:"nested",worldMatrix:nestedDesired},
            {id:"moving",worldMatrix:movingDesired}
          ]
        });

        const after=new HierarchyIndex(sandbox.getSnapshot().objects);
        assertMatricesNear(after.worldMatrixOf("moving"),movingDesired);
        assertMatricesNear(after.worldMatrixOf("nested"),nestedDesired);
      },
      "commit mundial cria uma única entrada de undo"() {
        const sandbox=createHierarchySandbox();
        const before=sandbox.getState();
        const world=new HierarchyIndex(before.objects).worldMatrixOf("moving");
        sandbox.dispatch({
          type:"selection.transform-world",
          transforms:[{
            id:"moving",
            worldMatrix:multiplyMatrices(
              composeTransform({position:[1,0,0]}),
              world
            )
          }]
        });
        assertEqual(sandbox.getHistoryDiagnostics().commandCount,1);
        sandbox.undo();
        assertDeepEqual(sandbox.getState(),before);
      },
      "commit mundial sem mudança não cria histórico"() {
        const sandbox=createHierarchySandbox();
        const world=new HierarchyIndex(sandbox.getSnapshot().objects)
          .worldMatrixOf("moving");
        assertEqual(sandbox.dispatch({
          type:"selection.transform-world",
          transforms:[{id:"moving",worldMatrix:world}]
        }),false);
        assertEqual(sandbox.getHistoryDiagnostics().commandCount,0);
      },
      "alvo duplicado falha sem alterar estado"() {
        const sandbox=createHierarchySandbox();
        const before=sandbox.getState();
        const world=new HierarchyIndex(before.objects).worldMatrixOf("moving");
        assertThrowsCode(
          () => sandbox.dispatch({
            type:"selection.transform-world",
            transforms:[
              {id:"moving",worldMatrix:world},
              {id:"moving",worldMatrix:world}
            ]
          }),
          "DUPLICATE_TRANSFORM_TARGET"
        );
        assertDeepEqual(sandbox.getState(),before);
        assertEqual(sandbox.getHistoryDiagnostics().commandCount,0);
      },
      "local não representável falha atomicamente"() {
        const sandbox=createShearHierarchySandbox();
        const before=sandbox.getState();
        const hierarchy=new HierarchyIndex(before.objects);
        const shearLocal=[
          1,0,0,0,
          0.5,1,0,0,
          0,0,1,0,
          0,0,0,1
        ];
        const shearedWorld=multiplyMatrices(
          hierarchy.worldMatrixOf("scaled-parent"),
          shearLocal
        );
        assertThrowsCode(
          () => sandbox.dispatch({
            type:"selection.transform-world",
            transforms:[{
              id:"rotated-child",
              worldMatrix:shearedWorld
            }]
          }),
          "NON_TRS_TRANSFORM"
        );
        assertDeepEqual(sandbox.getState(),before);
        assertEqual(sandbox.getHistoryDiagnostics().commandCount,0);
      },
      "cadeia profunda não depende da pilha de execução"() {
        const objects=Array.from({length:2000},(_,index) => ({
          id:`deep-${index}`,
          parentId:index ? `deep-${index-1}` : null,
          position:[1,0,0],
          rotation:[0,0,0,1],
          scale:[1,1,1]
        }));
        const result=boxRegionReducer(
          {schemaVersion:1,objects},
          {
            type:"selection.transform-world",
            transforms:[{
              id:"deep-1999",
              worldMatrix:composeTransform({position:[2001,0,0]})
            }]
          }
        );
        const world=new HierarchyIndex(result.state.objects)
          .worldMatrixOf("deep-1999");
        assertDeepEqual(
          decomposeTransformStrict(world).position.map(roundAffine),
          [2001,0,0]
        );
      }
    },

    "hierarchy-group": {
      "cria grupo com âncora e pivô independentes"() {
        const sandbox=createHierarchySandbox();
        sandbox.dispatch({
          type:"selection.group",
          groupId:"new-group",
          targetIds:["moving","nested"],
          pivot:[1,2,3]
        });
        const state=sandbox.getSnapshot();
        const group=findHierarchyNode(state,"new-group");
        assertEqual(group.kind,"group");
        assertEqual(group.parentId,"source");
        assertDeepEqual(group.pivot,[1,2,3]);
        assertDeepEqual(group.rotation,[0,0,0,1]);
        assertDeepEqual(group.scale,[1,1,1]);
      },
      "seleção canônica não reparenta descendente duas vezes"() {
        const sandbox=createHierarchySandbox();
        sandbox.dispatch({
          type:"selection.group",
          groupId:"new-group",
          targetIds:["moving","nested"]
        });
        const hierarchy=new HierarchyIndex(sandbox.getSnapshot().objects);
        assertDeepEqual(hierarchy.childrenOf("new-group"),["moving"]);
        assertEqual(hierarchy.parentOf("nested"),"moving");
      },
      "agrupamento preserva toda a subárvore no mundo"() {
        const sandbox=createHierarchySandbox();
        const before=new HierarchyIndex(sandbox.getSnapshot().objects);
        const movingWorld=before.worldMatrixOf("moving");
        const nestedWorld=before.worldMatrixOf("nested");
        sandbox.dispatch({
          type:"selection.group",
          groupId:"new-group",
          targetIds:["moving"]
        });
        const after=new HierarchyIndex(sandbox.getSnapshot().objects);
        assertMatricesNear(after.worldMatrixOf("moving"),movingWorld);
        assertMatricesNear(after.worldMatrixOf("nested"),nestedWorld);
      },
      "alvos de pais diferentes usam ancestral comum"() {
        const sandbox=createHierarchySandbox();
        const before=new HierarchyIndex(sandbox.getSnapshot().objects);
        const movingWorld=before.worldMatrixOf("moving");
        const targetWorld=before.worldMatrixOf("target");
        sandbox.dispatch({
          type:"selection.group",
          groupId:"cross-group",
          targetIds:["moving","target"]
        });
        const after=new HierarchyIndex(sandbox.getSnapshot().objects);
        assertEqual(after.parentOf("cross-group"),null);
        assertEqual(after.parentOf("moving"),"cross-group");
        assertEqual(after.parentOf("target"),"cross-group");
        assertMatricesNear(after.worldMatrixOf("moving"),movingWorld);
        assertMatricesNear(after.worldMatrixOf("target"),targetWorld);
      },
      "grupo pode ser agrupado novamente"() {
        const sandbox=createHierarchySandbox();
        sandbox.dispatch({
          type:"selection.group",
          groupId:"inner",
          targetIds:["moving"]
        });
        sandbox.dispatch({
          type:"selection.group",
          groupId:"outer",
          targetIds:["inner"]
        });
        const hierarchy=new HierarchyIndex(sandbox.getSnapshot().objects);
        assertEqual(hierarchy.parentOf("inner"),"outer");
        assertEqual(hierarchy.parentOf("moving"),"inner");
        assertEqual(hierarchy.parentOf("nested"),"moving");
      },
      "grupo lógico não solicita geometria ao renderer"() {
        assertEqual(isRenderableSceneNode({kind:"group"}),false);
        assertEqual(isRenderableSceneNode({kind:"box"}),true);
      },
      "identificador duplicado falha atomicamente"() {
        const sandbox=createHierarchySandbox();
        const before=sandbox.getState();
        assertThrowsCode(
          () => sandbox.dispatch({
            type:"selection.group",
            groupId:"source",
            targetIds:["moving"]
          }),
          "DUPLICATE_NODE_ID"
        );
        assertDeepEqual(sandbox.getState(),before);
        assertEqual(sandbox.getHistoryDiagnostics().commandCount,0);
      },
      "cisalhamento entre ramos falha atomicamente"() {
        const sandbox=createShearHierarchySandbox();
        const before=sandbox.getState();
        assertThrowsCode(
          () => sandbox.dispatch({
            type:"selection.group",
            groupId:"invalid-group",
            targetIds:["rotated-child","loose"]
          }),
          "NON_TRS_TRANSFORM"
        );
        assertDeepEqual(sandbox.getState(),before);
        assertEqual(sandbox.getHistoryDiagnostics().commandCount,0);
      },
      "agrupamento e undo formam uma operação única"() {
        const sandbox=createHierarchySandbox();
        const before=sandbox.getState();
        sandbox.dispatch({
          type:"selection.group",
          groupId:"new-group",
          targetIds:["moving"]
        });
        assertEqual(sandbox.getHistoryDiagnostics().commandCount,1);
        sandbox.undo();
        assertDeepEqual(sandbox.getState(),before);
      }
    },

    "hierarchy-group-transform": {
      "translação move pivô e subárvore pelo mesmo delta"() {
        const sandbox=createGroupTransformSandbox();
        const before=new HierarchyIndex(sandbox.getSnapshot().objects);
        const pivotBefore=before.worldPivotOf("group");
        const childBefore=before.worldMatrixOf("child");
        const delta=composeTransform({position:[3,-1,2]});

        commitWorldDelta(sandbox,"group",delta);

        const after=new HierarchyIndex(sandbox.getSnapshot().objects);
        assertDeepEqual(
          after.worldPivotOf("group").map(roundAffine),
          transformPointForTest(delta,pivotBefore).map(roundAffine)
        );
        assertMatricesNear(
          after.worldMatrixOf("child"),
          multiplyMatrices(delta,childBefore)
        );
      },

      "rotação mantém o pivô e gira toda a subárvore"() {
        const sandbox=createGroupTransformSandbox();
        const before=new HierarchyIndex(sandbox.getSnapshot().objects);
        const pivot=before.worldPivotOf("group");
        const childBefore=before.worldMatrixOf("child");
        const delta=aroundPivot(
          composeTransform({rotation:eulerQuaternion([0,0,90])}),
          pivot
        );

        commitWorldDelta(sandbox,"group",delta);

        const after=new HierarchyIndex(sandbox.getSnapshot().objects);
        assertDeepEqual(
          after.worldPivotOf("group").map(roundAffine),
          pivot.map(roundAffine)
        );
        assertMatricesNear(
          after.worldMatrixOf("child"),
          multiplyMatrices(delta,childBefore)
        );
      },

      "escala mantém o pivô e escala toda a subárvore"() {
        const sandbox=createGroupTransformSandbox();
        const before=new HierarchyIndex(sandbox.getSnapshot().objects);
        const pivot=before.worldPivotOf("group");
        const childBefore=before.worldMatrixOf("child");
        const delta=aroundPivot(
          composeTransform({scale:[2,3,0.5]}),
          pivot
        );

        commitWorldDelta(sandbox,"group",delta);

        const after=new HierarchyIndex(sandbox.getSnapshot().objects);
        assertDeepEqual(after.worldPivotOf("group").map(roundAffine),pivot);
        assertMatricesNear(
          after.worldMatrixOf("child"),
          multiplyMatrices(delta,childBefore)
        );
      },

      "escala local de grupo rotacionado permanece TRS"() {
        const sandbox=createGroupTransformSandbox({
          groupRotation:eulerQuaternion([0,0,45])
        });
        const before=new HierarchyIndex(sandbox.getSnapshot().objects);
        const groupWorld=before.worldMatrixOf("group");
        const pivot=before.worldPivotOf("group");
        const orientation=decomposeTransform(groupWorld).rotation;
        const anchor=composeTransform({position:pivot,rotation:orientation});
        const delta=multiplyMatrices(
          anchor,
          multiplyMatrices(
            composeTransform({scale:[2,0.5,1.5]}),
            invertAffineMatrix(anchor)
          )
        );

        assertEqual(commitWorldDelta(sandbox,"group",delta),true);

        const after=new HierarchyIndex(sandbox.getSnapshot().objects);
        assertDeepEqual(
          after.worldPivotOf("group").map(roundAffine),
          pivot.map(roundAffine)
        );
        assertDeepEqual(
          decomposeTransformStrict(after.worldMatrixOf("group"))
            .scale.map(roundAffine),
          [2,0.5,1.5]
        );
      },

      "escala mundial com cisalhamento falha sem alterar estado"() {
        const sandbox=createGroupTransformSandbox({
          groupRotation:eulerQuaternion([0,0,45])
        });
        const stateBefore=sandbox.getState();
        const hierarchy=new HierarchyIndex(stateBefore.objects);
        const delta=aroundPivot(
          composeTransform({scale:[2,0.5,1]}),
          hierarchy.worldPivotOf("group")
        );

        assertThrowsCode(
          () => commitWorldDelta(sandbox,"group",delta),
          "NON_TRS_TRANSFORM"
        );
        assertDeepEqual(sandbox.getState(),stateBefore);
        assertEqual(sandbox.getHistoryDiagnostics().commandCount,0);
      },

      "sequência mover girar e escalar mantém resultado exato"() {
        const sandbox=createGroupTransformSandbox();
        const before=new HierarchyIndex(sandbox.getSnapshot().objects);
        const pivot=before.worldPivotOf("group");
        const childBefore=before.worldMatrixOf("child");
        const rotateAndScale=aroundPivot(
          composeTransform({
            rotation:eulerQuaternion([0,0,45]),
            scale:[1.5,1.5,1.5]
          }),
          pivot
        );
        const delta=multiplyMatrices(
          composeTransform({position:[-2,4,1]}),
          rotateAndScale
        );

        commitWorldDelta(sandbox,"group",delta);

        const after=new HierarchyIndex(sandbox.getSnapshot().objects);
        assertDeepEqual(
          after.worldPivotOf("group").map(roundAffine),
          transformPointForTest(delta,pivot).map(roundAffine)
        );
        assertMatricesNear(
          after.worldMatrixOf("child"),
          multiplyMatrices(delta,childBefore)
        );
      },

      "grupo aninhado preserva relações locais internas"() {
        const sandbox=createGroupTransformSandbox({nested:true});
        const stateBefore=sandbox.getSnapshot();
        const innerBefore=findHierarchyNode(stateBefore,"inner");
        const childBefore=findHierarchyNode(stateBefore,"child");
        const hierarchyBefore=new HierarchyIndex(stateBefore.objects);
        const childWorldBefore=hierarchyBefore.worldMatrixOf("child");
        const pivot=hierarchyBefore.worldPivotOf("group");
        const delta=aroundPivot(
          composeTransform({
            rotation:eulerQuaternion([0,45,0]),
            scale:[2,2,2]
          }),
          pivot
        );

        commitWorldDelta(sandbox,"group",delta);

        const stateAfter=sandbox.getSnapshot();
        const hierarchyAfter=new HierarchyIndex(stateAfter.objects);
        assertDeepEqual(findHierarchyNode(stateAfter,"inner"),innerBefore);
        assertDeepEqual(findHierarchyNode(stateAfter,"child"),childBefore);
        assertMatricesNear(
          hierarchyAfter.worldMatrixOf("child"),
          multiplyMatrices(delta,childWorldBefore)
        );
        assertDeepEqual(hierarchyAfter.worldPivotOf("group").map(roundAffine),pivot);
      },

      "undo e redo restauram transform e pivô exatamente"() {
        const sandbox=createGroupTransformSandbox();
        const before=sandbox.getState();
        const hierarchy=new HierarchyIndex(before.objects);
        const pivot=hierarchy.worldPivotOf("group");
        const delta=aroundPivot(
          composeTransform({scale:[2,2,2]}),
          pivot
        );

        commitWorldDelta(sandbox,"group",delta);
        const transformed=sandbox.getState();
        assertEqual(sandbox.undo(),true);
        assertDeepEqual(sandbox.getState(),before);
        assertEqual(sandbox.redo(),true);
        assertDeepEqual(sandbox.getState(),transformed);
      }
    },

    "hierarchy-subtree-lifecycle": {
      "clonagem profunda remapeia todos os parentIds internos"() {
        const nodes=[
          {id:"group",kind:"group",position:[4,2,1],pivot:[0,0,0]},
          {id:"inner",kind:"group",parentId:"group",position:[1,0,0]},
          {id:"box",kind:"box",parentId:"inner",position:[2,0,0]}
        ];
        const cloned=cloneHierarchySubtrees(nodes,{
          rootIds:["group"],
          copies:1,
          createId:({sourceId}) => `copy-${sourceId}`
        });
        const hierarchy=new HierarchyIndex([...nodes,...cloned.objects]);

        assertDeepEqual(cloned.duplicatedRootIds,["copy-group"]);
        assertEqual(hierarchy.parentOf("copy-group"),null);
        assertEqual(hierarchy.parentOf("copy-inner"),"copy-group");
        assertEqual(hierarchy.parentOf("copy-box"),"copy-inner");
        assertMatricesNear(
          hierarchy.worldMatrixOf("copy-box"),
          hierarchy.worldMatrixOf("box")
        );
      },

      "múltiplas cópias usam subárvores completamente independentes"() {
        const nodes=[
          {id:"group",kind:"group"},
          {id:"box",kind:"box",parentId:"group"}
        ];
        const cloned=cloneHierarchySubtrees(nodes,{
          rootIds:["group"],
          copies:3,
          createId:({sourceId,copyIndex}) => `${copyIndex}-${sourceId}`
        });
        const hierarchy=new HierarchyIndex([...nodes,...cloned.objects]);

        assertDeepEqual(
          cloned.duplicatedRootIds,
          ["1-group","2-group","3-group"]
        );
        assertEqual(hierarchy.parentOf("1-box"),"1-group");
        assertEqual(hierarchy.parentOf("2-box"),"2-group");
        assertEqual(hierarchy.parentOf("3-box"),"3-group");
      },

      "limite considera cópias vezes tamanho da subárvore"() {
        const nodes=[
          {id:"group",kind:"group"},
          {id:"box",kind:"box",parentId:"group"}
        ];
        assertThrowsCode(
          () => cloneHierarchySubtrees(nodes,{
            rootIds:["group"],
            copies:3,
            maxNodes:5,
            createId:({sourceId,copyIndex}) => `${copyIndex}-${sourceId}`
          }),
          "DUPLICATE_LIMIT_EXCEEDED"
        );
      },

      "expansão de exclusão inclui descendentes uma única vez"() {
        const nodes=[
          {id:"group",kind:"group"},
          {id:"inner",kind:"group",parentId:"group"},
          {id:"box",kind:"box",parentId:"inner"},
          {id:"loose",kind:"box"}
        ];
        assertDeepEqual(
          hierarchySubtreeIds(nodes,["group","inner","box"]),
          ["group","inner","box"]
        );
      },

      "duplicar grupo seleciona raízes e preserva filhos"() {
        const sandbox=createGroupTransformSandbox();
        const editor=new EditorState();
        editor.selection.replace({
          kind:"object",
          regionId:"region-main",
          objectId:"group"
        });
        const operations=new SelectionOperations({
          editor,
          sandbox,
          regionId:"region-main"
        });
        const result=operations.duplicateMany(2);
        const hierarchy=new HierarchyIndex(sandbox.getSnapshot().objects);

        assertEqual(result.createdCount,4);
        assertEqual(result.duplicateIds.length,2);
        assertDeepEqual(
          editor.selection.snapshot().members.map(member => member.objectId),
          result.duplicateIds
        );
        for (const rootId of result.duplicateIds) {
          assertEqual(hierarchy.childrenOf(rootId).length,1);
        }
      },

      "duplicate count afim transforma raízes e leva os filhos"() {
        const sandbox=createGroupTransformSandbox();
        const editor=new EditorState();
        editor.selection.replace({
          kind:"object",
          regionId:"region-main",
          objectId:"group"
        });
        const operations=new SelectionOperations({
          editor,
          sandbox,
          regionId:"region-main"
        });
        const before=new HierarchyIndex(sandbox.getSnapshot().objects);
        const childBefore=before.worldMatrixOf("child");
        const result=operations.duplicateAffine(3,[
          {type:"move",value:[2,0,0]}
        ]);
        const after=new HierarchyIndex(sandbox.getSnapshot().objects);

        assertEqual(result.createdCount,6);
        assertEqual(result.duplicateIds.length,3);
        for (const [index,rootId] of result.duplicateIds.entries()) {
          const childId=after.childrenOf(rootId)[0];
          const expected=multiplyMatrices(
            composeTransform({position:[2*(index+1),0,0]}),
            childBefore
          );
          assertMatricesNear(after.worldMatrixOf(childId),expected);
        }
      },

      "excluir grupo remove subárvore e undo restaura tudo"() {
        const sandbox=createGroupTransformSandbox();
        const before=sandbox.getState();
        const editor=new EditorState();
        editor.selection.replace({
          kind:"object",
          regionId:"region-main",
          objectId:"group"
        });
        const operations=new SelectionOperations({
          editor,
          sandbox,
          regionId:"region-main"
        });
        const result=operations.deleteSelection();

        assertDeepEqual(result.deletedIds,["group","child"]);
        assertEqual(sandbox.getSnapshot().objects.length,0);
        assertEqual(editor.selection.empty,true);
        assertEqual(sandbox.undo(),true);
        assertDeepEqual(sandbox.getState(),before);
      }
    },

    "hierarchy-ungroup": {
      "remove um nível e preserva transforms mundiais"() {
        const sandbox=createGroupTransformSandbox();
        const before=new HierarchyIndex(sandbox.getSnapshot().objects);
        const childWorld=before.worldMatrixOf("child");

        assertEqual(sandbox.dispatch({
          type:"selection.ungroup",
          groupIds:["group"]
        }),true);

        const after=new HierarchyIndex(sandbox.getSnapshot().objects);
        assertEqual(after.has("group"),false);
        assertEqual(after.parentOf("child"),null);
        assertMatricesNear(after.worldMatrixOf("child"),childWorld);
      },

      "grupo aninhado é promovido sem desagrupar dois níveis"() {
        const sandbox=createGroupTransformSandbox({nested:true});
        const before=new HierarchyIndex(sandbox.getSnapshot().objects);
        const innerWorld=before.worldMatrixOf("inner");
        const childWorld=before.worldMatrixOf("child");

        sandbox.dispatch({
          type:"selection.ungroup",
          groupIds:["group","inner"]
        });

        const after=new HierarchyIndex(sandbox.getSnapshot().objects);
        assertEqual(after.has("group"),false);
        assertEqual(after.has("inner"),true);
        assertEqual(after.parentOf("inner"),null);
        assertEqual(after.parentOf("child"),"inner");
        assertMatricesNear(after.worldMatrixOf("inner"),innerWorld);
        assertMatricesNear(after.worldMatrixOf("child"),childWorld);
      },

      "grupos irmãos são removidos na mesma operação"() {
        const nodes=[
          {id:"g1",kind:"group",position:[1,0,0]},
          {id:"a",kind:"box",parentId:"g1",position:[2,0,0]},
          {id:"g2",kind:"group",position:[-1,0,0]},
          {id:"b",kind:"box",parentId:"g2",position:[-2,0,0]}
        ];
        const before=new HierarchyIndex(nodes);
        const result=ungroupNodes(nodes,{groupIds:["g1","g2"]});
        const after=new HierarchyIndex(result.nodes);

        assertDeepEqual(result.groupIds,["g1","g2"]);
        assertDeepEqual(result.promotedIds,["a","b"]);
        assertMatricesNear(after.worldMatrixOf("a"),before.worldMatrixOf("a"));
        assertMatricesNear(after.worldMatrixOf("b"),before.worldMatrixOf("b"));
      },

      "grupo vazio é removido sem criar referências"() {
        const result=ungroupNodes([
          {id:"empty",kind:"group"},
          {id:"box",kind:"box"}
        ],{groupIds:["empty"]});
        assertDeepEqual(result.groupIds,["empty"]);
        assertDeepEqual(result.promotedIds,[]);
        assertDeepEqual(result.nodes.map(node => node.id),["box"]);
      },

      "cisalhamento impossível falha antes de alterar estado"() {
        const region=new Region(
          {id:"ungroup-shear",type:"box-region"},
          {schemaVersion:1,objects:[
            {
              id:"group",
              kind:"group",
              scale:[2,1,1]
            },
            {
              id:"child",
              kind:"box",
              parentId:"group",
              rotation:eulerQuaternion([0,0,45])
            }
          ]}
        );
        const sandbox=new Sandbox(region,boxRegionReducer);
        const before=sandbox.getState();
        assertThrowsCode(
          () => sandbox.dispatch({
            type:"selection.ungroup",
            groupIds:["group"]
          }),
          "NON_TRS_TRANSFORM"
        );
        assertDeepEqual(sandbox.getState(),before);
        assertEqual(sandbox.getHistoryDiagnostics().commandCount,0);
      },

      "superfície seleciona filhos promovidos"() {
        const sandbox=createGroupTransformSandbox();
        const editor=new EditorState();
        editor.selection.replace({
          kind:"object",
          regionId:"region-main",
          objectId:"group"
        });
        const operations=new SelectionOperations({
          editor,
          sandbox,
          regionId:"region-main"
        });
        assertEqual(operations.canUngroup(),true);
        const result=operations.ungroup();

        assertEqual(result.changed,true);
        assertDeepEqual(result.promotedIds,["child"]);
        assertDeepEqual(
          editor.selection.snapshot().members.map(member => member.objectId),
          ["child"]
        );
      },

      "seleção sem grupo é no-op explícito"() {
        const sandbox=createGroupTransformSandbox();
        const editor=new EditorState();
        editor.selection.replace({
          kind:"object",
          regionId:"region-main",
          objectId:"child"
        });
        const operations=new SelectionOperations({
          editor,
          sandbox,
          regionId:"region-main"
        });
        assertEqual(operations.canUngroup(),false);
        const result=operations.ungroup();

        assertEqual(result.changed,false);
        assertEqual(result.reason,"selection-has-no-groups");
        assertEqual(sandbox.getHistoryDiagnostics().commandCount,0);
      },

      "desagrupar e undo restauram uma operação única"() {
        const sandbox=createGroupTransformSandbox();
        const before=sandbox.getState();
        sandbox.dispatch({
          type:"selection.ungroup",
          groupIds:["group"]
        });
        assertEqual(sandbox.getHistoryDiagnostics().commandCount,1);
        assertEqual(sandbox.undo(),true);
        assertDeepEqual(sandbox.getState(),before);
      }
    },

    "build-info": {
      "normaliza e congela manifesto explícito"() {
        const info=normalizeBuildInfo({
          version:"0.1.0",
          build:"test-build",
          channel:"test"
        });
        assertDeepEqual(info,{
          version:"0.1.0",
          build:"test-build",
          channel:"test"
        });
        assertEqual(Object.isFrozen(info),true);
      },
      "formata versão e build para a interface"() {
        assertEqual(formatBuildLabel({
          version:"0.1.0",
          build:"test-build",
          channel:"test"
        }),"v0.1.0 · build test-build");
      },
      "rejeita manifesto incompleto"() {
        assertThrowsCode(
          () => normalizeBuildInfo({version:"0.1.0"}),
          "INVALID_BUILD_INFO"
        );
      }
    },

    "file-interop": {
      "capacidades distinguem API nativa e fallback"() {
        const fallback=createFileGatewayHarness();
        assertDeepEqual(fallback.gateway.capabilities(),{
          nativeOpen:false,
          nativeSave:false,
          fallbackOpen:true,
          fallbackSave:true
        });

        const native=createFileGatewayHarness({
          showOpenFilePicker() {},
          showSaveFilePicker() {}
        });
        assertEqual(native.gateway.capabilities().nativeOpen,true);
        assertEqual(native.gateway.capabilities().nativeSave,true);
      },

      "download compatível permanece disponível sem seletor nativo"() {
        const harness=createFileGatewayHarness();
        harness.gateway.saveFallback({
          prepared:true,
          filename:"teste.spatialseed",
          mediaType:"application/json",
          text:"{\"format\":\"spatial-seed\"}",
          bytes:25
        });

        assertDeepEqual(harness.calls,[
          "url:create",
          "dom:append",
          "link:click",
          "link:remove",
          "timer:1000",
          "url:revoke:blob:test"
        ]);
        assertEqual(harness.link.download,"teste.spatialseed");
      },

      "novo projeto descarta referência de arquivo anterior"() {
        const harness=createFileGatewayHarness();
        harness.gateway.fileHandle={name:"anterior.spatialseed"};
        harness.gateway.reset();
        assertEqual(harness.gateway.fileHandle,null);
      },

      "bloqueio da plataforma não é confundido com cancelamento"() {
        assertEqual(isPlatformBlock({name:"NotAllowedError"}),true);
        assertEqual(isPlatformBlock({name:"SecurityError"}),true);
        assertEqual(isPlatformBlock({name:"NotSupportedError"}),true);
        assertEqual(isPlatformBlock({name:"AbortError"}),false);
        assertEqual(isPlatformBlock(new TypeError("programação")),false);
      }
    },

    "project-files": {
      "schema 2 aceita grupo lógico sem aparência"() {
        const sourceRuntime=new AppearanceRuntime();
        const scene=sourceRuntime.normalizeScene({
          schemaVersion:1,
          objects:[
            {id:"group",kind:"group",position:[0,0,0]},
            {
              id:"box",
              kind:"box",
              parentId:"group",
              material:{color:"#336699"}
            }
          ]
        });
        const parsed=new ProjectValidator().validate({
          format:"spatial-seed",
          schemaVersion:2,
          assets:sourceRuntime.exportAssets(),
          scene
        });

        assertEqual("appearanceId" in parsed.scene.objects[0],false);
        assertEqual(Boolean(parsed.scene.objects[1].appearanceId),true);

        const restoredRuntime=new AppearanceRuntime();
        restoredRuntime.importAssets(parsed.assets,{replace:true});
        const restored=restoredRuntime.normalizeScene(parsed.scene);
        assertEqual(restored.objects[0].kind,"group");
        assertEqual(restored.objects[1].parentId,"group");
        assertEqual(
          restoredRuntime.legacyMaterial(
            restored.objects[1].appearanceId
          ).color,
          "#336699"
        );
      },

      "schema 2 ainda rejeita renderizável sem aparência"() {
        const assets=new AppearanceRuntime().exportAssets();
        let message="";
        try {
          new ProjectValidator().validate({
            format:"spatial-seed",
            schemaVersion:2,
            assets,
            scene:{
              schemaVersion:1,
              objects:[{id:"box",kind:"box"}]
            }
          });
        } catch (error) {
          message=error.message;
        }
        assertEqual(message,"Objeto sem appearanceId: box.");
      }
    },

    "pwa-status": {
      "escopo local permanece limitado à aplicação"() {
        const locations=resolvePwaLocations(
          "http://127.0.0.1:8082/apps/web/pwa/registerPwa.js"
        );
        assertEqual(locations.applicationRoot,"http://127.0.0.1:8082/apps/web/");
        assertEqual(locations.repositoryRoot,"http://127.0.0.1:8082/");
        assertEqual(
          locations.workerUrl,
          "http://127.0.0.1:8082/apps/web/service-worker.js"
        );
        assertEqual(locations.scope,"/apps/web/");
      },

      "prefixo do GitHub Pages é preservado nos caminhos PWA"() {
        const locations=resolvePwaLocations(
          "https://livredopodervil.github.io/SpatialSeed/apps/web/pwa/registerPwa.js"
        );
        assertEqual(
          locations.workerUrl,
          "https://livredopodervil.github.io/SpatialSeed/apps/web/service-worker.js"
        );
        assertEqual(locations.scope,"/SpatialSeed/apps/web/");
        assertEqual(
          locations.legacyWorkerUrl,
          "https://livredopodervil.github.io/SpatialSeed/service-worker.js"
        );
      },

      "controlador expõe prompt somente depois da elegibilidade"() {
        const windowRef=createPwaInstallWindow();
        const controller=new PwaInstallController({windowRef});
        let prevented=false;
        let prompted=false;
        assertEqual(controller.snapshot().mode,"manual");

        controller.onBeforeInstallPrompt({
          preventDefault() { prevented=true; },
          prompt() {
            prompted=true;
            return Promise.resolve({outcome:"accepted"});
          }
        });
        assertEqual(prevented,true);
        assertEqual(controller.snapshot().mode,"available");
        assertEqual(controller.snapshot().canPrompt,true);

        controller.requestInstall();
        assertEqual(prompted,true);
        assertEqual(controller.snapshot().mode,"installing");
        controller.dispose();
      },

      "modo standalone e evento de instalação atualizam o estado"() {
        const standalone=new PwaInstallController({
          windowRef:createPwaInstallWindow({standalone:true})
        });
        assertEqual(standalone.snapshot().mode,"installed");
        standalone.dispose();

        const controller=new PwaInstallController({
          windowRef:createPwaInstallWindow()
        });
        controller.onAppInstalled();
        assertEqual(controller.snapshot().installed,true);
        assertEqual(controller.snapshot().canPrompt,false);
        controller.dispose();
      },

      "extrai build do service worker controlador"() {
        assertEqual(
          workerBuild(
            "https://example.test/SpatialSeed/apps/web/service-worker.js?build=0025g"
          ),
          "0025g"
        );
        assertEqual(workerBuild("https://example.test/worker.js"),null);
        assertEqual(workerBuild(null),null);
      },

      "rótulo denuncia cache controlador anterior"() {
        const label=formatPwaBuildLabel({
          version:"0.1.0",
          build:"0025g",
          channel:"test"
        },{
          controllerBuild:"0025d",
          updatePending:true,
          waitingBuild:"0025g"
        });
        assertEqual(
          label,
          "v0.1.0 · build 0025g · cache 0025d · feche para atualizar"
        );
      },

      "rótulo permanece conciso quando cache e publicação coincidem"() {
        assertEqual(formatPwaBuildLabel({
          version:"0.1.0",
          build:"0025g",
          channel:"test"
        },{
          controllerBuild:"0025g",
          updatePending:false
        }),"v0.1.0 · build 0025g");
      }
    },

    "ui-configuration": {
      "normaliza composição sem conhecer comandos"() {
        const configuration=normalizeUiConfiguration({
          schemaVersion:1,
          profile:"test",
          toolbar:{
            primary:["tool-select"],
            menus:[{id:"edit",label:"Editar",items:["undo"]}]
          },
          panels:{items:{inspector:{anchor:"right",width:420}}},
          presentation:{transform:{size:0.8}}
        });
        assertDeepEqual(configuration.toolbar.primary,["tool-select"]);
        assertEqual(configuration.toolbar.layout,"horizontal");
        assertEqual(configuration.toolbar.menus[0].items[0],"undo");
        assertEqual(configuration.panels.items.inspector.anchor,"right");
        assertEqual(configuration.presentation.transform.size,0.8);
        assertEqual(configuration.presentation.sceneExit.corner,"top-left");
        assertEqual(
          configuration.presentation.sceneExit.helpStorageKey,
          "spatialseed.ui.scene-help.v1"
        );
        assertEqual(Object.isFrozen(configuration),true);
      },
      "rejeita controle repetido entre grupos"() {
        let failed=false;
        try {
          normalizeUiConfiguration({
            toolbar:{
              primary:["undo"],
              menus:[{id:"edit",label:"Editar",items:["undo"]}]
            }
          });
        } catch (error) {
          failed=/duplicado/.test(error.message);
        }
        assertEqual(failed,true);
      },
      "rejeita disposição desconhecida da barra"() {
        let failed=false;
        try {
          normalizeUiConfiguration({toolbar:{layout:"diagonal"}});
        } catch (error) {
          failed=/toolbar\.layout/.test(error.message);
        }
        assertEqual(failed,true);
      },
      "normaliza preferências visuais separadas da barra"() {
        const configuration=normalizeUiConfiguration({
          presentation:{transform:{size:0.6,showX:false,vertexSize:7}}
        });
        assertDeepEqual(configuration.presentation.transform,{
          size:0.6,
          showX:false,
          showY:true,
          showZ:true,
          showVertices:false,
          vertexSize:7
        });
      }
    },

    "hierarchy-group-visuals": {
      "referência do gizmo coincide com pivô mundial do grupo"() {
        const hierarchy=new HierarchyIndex([{
          id:"group",
          kind:"group",
          position:[4,2,1],
          rotation:eulerQuaternion([0,0,90]),
          scale:[2,2,2],
          pivot:[1,0,0]
        }]);
        assertDeepEqual(
          selectionReferenceWorldPosition(hierarchy,"group")
            .map(roundAffine),
          [4,4,1]
        );
      },
      "preview de grupo inclui toda a subárvore uma vez"() {
        const hierarchy=new HierarchyIndex([
          {id:"outer",kind:"group"},
          {id:"inner",kind:"group",parentId:"outer"},
          {id:"box-a",kind:"box",parentId:"inner"},
          {id:"box-b",kind:"box",parentId:"outer"}
        ]);
        assertDeepEqual(
          projectedSubtreeIds(hierarchy,"outer"),
          ["outer","inner","box-a","box-b"]
        );
      },
      "limites agregados consideram somente geometria renderizável"() {
        const hierarchy=new HierarchyIndex([
          {id:"outer",kind:"group"},
          {id:"inner",kind:"group",parentId:"outer"},
          {id:"box-a",kind:"box",parentId:"inner"},
          {id:"box-b",kind:"box",parentId:"outer"}
        ]);
        assertDeepEqual(
          renderableSubtreeIds(hierarchy,"outer"),
          ["box-a","box-b"]
        );
      },
      "objeto comum mantém preview unitário"() {
        const hierarchy=new HierarchyIndex([
          {id:"box",kind:"box"}
        ]);
        assertDeepEqual(
          projectedSubtreeIds(hierarchy,"box"),
          ["box"]
        );
        assertDeepEqual(
          renderableSubtreeIds(hierarchy,"box"),
          ["box"]
        );
      },
      "grupo e multisseleção percorrem a mesma geometria"() {
        const boxes=Array.from({length:1000},(_,index) => ({
          id:`box-${index}`,
          kind:"box",
          parentId:"group"
        }));
        const hierarchy=new HierarchyIndex([
          {id:"group",kind:"group"},
          ...boxes
        ]);
        const groupTargets=projectedSelectionIds(hierarchy,["group"]);
        const multiTargets=projectedSelectionIds(
          hierarchy,
          boxes.map(box => box.id)
        );

        assertEqual(groupTargets.length,1001);
        assertEqual(multiTargets.length,1000);
        assertEqual(
          groupTargets.filter(id => isRenderableSceneNode(hierarchy.node(id))).length,
          multiTargets.length
        );
      },
      "alvos de preview eliminam descendentes redundantes"() {
        const hierarchy=new HierarchyIndex([
          {id:"outer",kind:"group"},
          {id:"inner",kind:"group",parentId:"outer"},
          {id:"box",kind:"box",parentId:"inner"}
        ]);
        assertDeepEqual(
          projectedSelectionIds(hierarchy,["outer","inner","box"]),
          ["outer","inner","box"]
        );
      }
    },

    "hierarchy-group-surfaces": {
      "operação agrupa seleção e seleciona o novo grupo"() {
        const sandbox=createHierarchySandbox();
        const editor=new EditorState();
        editor.selection.replaceMany([
          {kind:"object",regionId:"region-main",objectId:"moving"},
          {kind:"object",regionId:"region-main",objectId:"nested"}
        ]);
        const operations=new SelectionOperations({
          editor,
          sandbox,
          regionId:"region-main"
        });
        const result=operations.group({
          groupId:"surface-group",
          name:"Grupo de superfície",
          anchorWorldPosition:[6,2,0]
        });
        const group=findHierarchyNode(
          sandbox.getSnapshot(),
          "surface-group"
        );
        assertEqual(result.changed,true);
        assertEqual(group.kind,"group");
        assertEqual(group.name,"Grupo de superfície");
        assertDeepEqual(
          editor.selection.snapshot().members.map(member => member.objectId),
          ["surface-group"]
        );
      },
      "âncora explícita coincide com o pivô mundial"() {
        const sandbox=createHierarchySandbox();
        const editor=new EditorState();
        editor.selection.replace({
          kind:"object",
          regionId:"region-main",
          objectId:"moving"
        });
        const operations=new SelectionOperations({
          editor,
          sandbox,
          regionId:"region-main"
        });
        operations.group({
          groupId:"pivot-group",
          anchorWorldPosition:[7,8,9]
        });
        const hierarchy=new HierarchyIndex(sandbox.getSnapshot().objects);
        const world=hierarchy.worldMatrixOf("pivot-group");
        assertDeepEqual(
          [world[12],world[13],world[14]].map(roundAffine),
          [7,8,9]
        );
      },
      "seleção vazia não cria grupo nem histórico"() {
        const sandbox=createHierarchySandbox();
        const editor=new EditorState();
        const operations=new SelectionOperations({
          editor,
          sandbox,
          regionId:"region-main"
        });
        const result=operations.group({groupId:"unused"});
        assertEqual(result.changed,false);
        assertEqual(result.reason,"selection-empty");
        assertEqual(sandbox.getHistoryDiagnostics().commandCount,0);
      },
      "console traduz group para a mesma entrada runtime"() {
        const calls=[];
        const console=new DevConsole({
          editor:{selection:new Selection()},
          sandbox:{},
          region:{},
          renderer:{},
          getDiagnostics:() => ({}),
          commands:{
            describe:() => [],
            execute(id,args) {
              calls.push({id,args});
              return {changed:true,groupId:"console-group"};
            }
          }
        });
        const entry=console.execute('group "Cidade Procedural"')[0];
        assertEqual(entry.ok,true);
        assertDeepEqual(calls,[{
          id:"selection.group",
          args:{name:"Cidade Procedural"}
        }]);
      },
      "clique em descendente resolve o grupo mais externo"() {
        const hierarchy=new HierarchyIndex([
          {id:"outer",kind:"group"},
          {id:"inner",kind:"group",parentId:"outer"},
          {id:"box",kind:"box",parentId:"inner"},
          {id:"loose",kind:"box"}
        ]);
        assertEqual(selectionUnitId(hierarchy,"box"),"outer");
        assertEqual(selectionUnitId(hierarchy,"inner"),"outer");
        assertEqual(selectionUnitId(hierarchy,"loose"),"loose");
      }
    },

"resource-audit": {
  "conta aparência compartilhada"() {
    const audit = new ResourceAudit({
      sandbox: {
        getSnapshot() {
          return {
            objects: [
              { id: "a", appearanceId: "x" },
              { id: "b", appearanceId: "x" }
            ]
          };
        },
        canUndo: false,
        canRedo: false
      },

      editor: {
        selection: {
          snapshot() {
            return {
              members: [],
              activeMember: null
            };
          }
        }
      },

      renderer: {
        getResourceDiagnostics() {
          return {
            meshes: 2,
            uniqueGeometries: 2,
            uniqueMaterials: 2,
            uniqueTextures: 0
          };
        }
      },

      appearanceRuntime: {
        stats() {
          return {
            assets: { total: 1 }
          };
        }
      },

      selectionOperations: {
        getState() {
          return {
            pendingDuplicate: null,
            lastDuplicate: null
          };
        }
      }
    });

    const report = audit.collect();

    assertEqual(report.logical.objects, 2);
    assertEqual(report.logical.appearances, 1);
    assertEqual(report.logical.embeddedMaterials, 0);
  },

  "detecta Base64 embutido"() {
    const audit = new ResourceAudit({
      sandbox: {
        getSnapshot() {
          return {
            objects: [{
              id: "a",
              material: {
                texture: {
                  src: "data:image/png;base64,AAAA"
                }
              }
            }]
          };
        },
        canUndo: true,
        canRedo: false
      },

      editor: {
        selection: {
          snapshot() {
            return {
              members: [],
              activeMember: null
            };
          }
        }
      },

      renderer: {},
      appearanceRuntime: null,
      selectionOperations: null
    });

    assertEqual(
      audit.collect().logical.embeddedDataUrls,
      1
    );
  }
},

    "render-resource-cache": {
      "cache reutiliza e libera recurso"() {
        let creates = 0;
        let disposes = 0;

        const cache = new RefCountCache({
          create() {
            creates += 1;
            return {
              dispose() {
                disposes += 1;
              }
            };
          }
        });

        const first = cache.acquire("a");
        const second = cache.acquire("a");

        assertEqual(creates, 1);
        assertEqual(first.value, second.value);

        cache.release("a");
        assertEqual(disposes, 0);

        cache.release("a");
        assertEqual(disposes, 1);
      },

      "chave de textura inclui transformação UV"() {
        const first = textureKey({
          src: "texture.png",
          repeat: [1, 1]
        });

        const second = textureKey({
          src: "texture.png",
          repeat: [2, 1]
        });

        assert(first !== second);
      },

      "cache genérico compartilha geometria registrada"() {
        const registry=createDefaultGeometryRegistry();
        const descriptor=registry.normalize({
          type:"polygon",
          sides:6,
          radius:2
        });
        const key=registry.key(descriptor);
        const cache=new ThreeResourceCache();
        let creates=0;
        const create=() => {
          creates+=1;
          return registry.create(descriptor);
        };
        const first=cache.acquireGeometry(key,create);
        const second=cache.acquireGeometry(key,create);

        assertEqual(creates,1);
        assertEqual(first.value,second.value);
        assertEqual(cache.stats().geometries.references,2);
        cache.releaseGeometry(first.key);
        cache.releaseGeometry(second.key);
        assertEqual(cache.stats().geometries.entries,0);
      },

      "descarte adiado permite troca transacional de textura"() {
        let creates = 0;
        let disposes = 0;
        const cache = new RefCountCache({
          deferDisposal: true,
          create() {
            creates += 1;
            return { dispose() { disposes += 1; } };
          }
        });

        const first = cache.acquire("texture-a");
        cache.release(first.key);
        const replacement = cache.acquire("texture-a");

        assertEqual(creates, 1);
        assertEqual(disposes, 0);
        assertEqual(first.value, replacement.value);
      }
    },

"instance-batches": {
  "índice reutiliza posição liberada"() {
    const index = new InstanceBatchIndex();
    const first = index.allocate("a");
    const second = index.allocate("b");
    index.release("a");
    const reused = index.allocate("c");
    assertEqual(first, 0);
    assertEqual(second, 1);
    assertEqual(reused, 0);
    assertEqual(index.objectAt(0), "c");
  },

  "manager resolve hit por instanceId"() {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshBasicMaterial();
    const manager = new InstanceBatchManager();
    const created = manager.add({
      objectId: "object-a",
      batchKey: "box:a",
      matrix: new THREE.Matrix4(),
      descriptor: { geometry, material, capacity: 4 }
    });
    assertEqual(manager.objectFromHit({ object: created.batch.mesh, instanceId: created.instanceIndex }), "object-a");
    manager.clear({ disposeGeometry: true, disposeMaterial: true });
  },

  "manager atualiza e remove objeto"() {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshBasicMaterial();
    const manager = new InstanceBatchManager();
    manager.add({ objectId: "object-a", batchKey: "box:a", matrix: new THREE.Matrix4(), descriptor: { geometry, material, capacity: 4 } });
    assertEqual(manager.update("object-a", new THREE.Matrix4().makeTranslation(2, 0, 0)), true);
    assertEqual(manager.remove("object-a").removed, true);
    assertEqual(manager.hasObject("object-a"), false);
    manager.clear({ disposeGeometry: true, disposeMaterial: true });
  }
,

  "lote armazena e atualiza cor por instância"() {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshBasicMaterial({
      color: 0xffffff
    });
    const batch = new InstanceBatch({
      key: "color",
      geometry,
      material,
      capacity: 4
    });

    batch.add(
      "a",
      new THREE.Matrix4(),
      { color: "#ff0000" }
    );

    assertNear(batch.colorAt("a").r, 1);
    assertNear(batch.colorAt("a").g, 0);

    batch.updateAttributes(
      "a",
      { color: "#00ff00" }
    );

    assertNear(batch.colorAt("a").r, 0);
    assertNear(batch.colorAt("a").g, 1);
    assertEqual(batch.stats().hasInstanceColor, true);
    assertEqual(batch.stats().colorBytes, 48);

    batch.dispose({
      disposeGeometry: true,
      disposeMaterial: true
    });
  },

  "manager atualiza cor sem trocar lote"() {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshBasicMaterial();
    const manager = new InstanceBatchManager();

    manager.add({
      objectId: "a",
      batchKey: "shared",
      matrix: new THREE.Matrix4(),
      attributes: { color: "#112233" },
      descriptor: {
        geometry,
        material,
        capacity: 4
      }
    });

    const before = manager.locationOf("a");
    assertEqual(
      manager.updateAttributes(
        "a",
        { color: "#abcdef" }
      ),
      true
    );
    const after = manager.locationOf("a");

    assertDeepEqual(after, before);
    assertEqual(manager.batchCount, 1);

    manager.clear({
      disposeGeometry: true,
      disposeMaterial: true
    });
  },

  "índice reutilizado recebe a nova cor"() {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshBasicMaterial();
    const batch = new InstanceBatch({
      key: "reuse-color",
      geometry,
      material,
      capacity: 2
    });

    const first = batch.add(
      "a",
      new THREE.Matrix4(),
      { color: "#ff0000" }
    );

    batch.remove("a");

    const reused = batch.add(
      "b",
      new THREE.Matrix4(),
      { color: "#0000ff" }
    );

    assertEqual(reused, first);
    assertNear(batch.colorAt("b").b, 1);
    assertNear(batch.colorAt("b").r, 0);

    batch.dispose({
      disposeGeometry: true,
      disposeMaterial: true
    });
  },

  "reducer cria e remove override de cor"() {
    const initial = Object.freeze({
      objects: Object.freeze([])
    });

    const created = boxRegionReducer(
      initial,
      {
        type: "object.create",
        id: "brick",
        instanceState: {
          color: "#CC6633"
        }
      }
    ).state;

    assertEqual(
      created.objects[0].instanceState.color,
      "#cc6633"
    );

    const updated = boxRegionReducer(
      created,
      {
        type: "object.update",
        id: "brick",
        patch: {
          instanceState: { color: null }
        }
      }
    ).state;

    assertEqual(
      "color" in updated.objects[0].instanceState,
      false
    );
  },

  "dez mil cores mantêm um único lote"() {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshBasicMaterial();
    const manager = new InstanceBatchManager();
    const startedAt = performance.now();

    for (let index = 0; index < 10000; index += 1) {
      manager.add({
        objectId: `color-${index}`,
        batchKey: "colors",
        matrix: new THREE.Matrix4(),
        attributes: {
          color: new THREE.Color().setHSL(
            index / 10000,
            0.7,
            0.5
          )
        },
        descriptor: {
          geometry,
          material,
          capacity: 10000
        }
      });
    }

    const elapsed = performance.now() - startedAt;
    const stats = manager.stats();

    assertEqual(stats.batches, 1);
    assertEqual(stats.objects, 10000);
    assertEqual(
      stats.byBatch[0].colorBytes,
      120000
    );
    assert(elapsed < 5000);

    manager.clear({
      disposeGeometry: true,
      disposeMaterial: true
    });
  }
},

    "batch-material-cache": {
      "aparência idêntica reutiliza material"() {
        const resourceCache = {
          acquireTexture() {
            return null;
          },
          releaseTexture() {
            return true;
          }
        };

        const cache = new BatchMaterialCache({ resourceCache });

        const first = cache.acquire({
          appearanceId: "appearance-a",
          material: { color: "#ffffff" }
        });

        const second = cache.acquire({
          appearanceId: "appearance-a",
          material: { color: "#ffffff" }
        });

        assertEqual(
          first.value.material,
          second.value.material
        );

        assertEqual(cache.stats().entries, 1);
        assertEqual(cache.stats().references, 2);

        cache.release("appearance-a");
        cache.release("appearance-a");
      },

      "aparências distintas criam materiais distintos"() {
        const resourceCache = {
          acquireTexture() {
            return null;
          },
          releaseTexture() {
            return true;
          }
        };

        const cache = new BatchMaterialCache({ resourceCache });

        const first = cache.acquire({
          appearanceId: "appearance-a",
          material: { color: "#ffffff" }
        });

        const second = cache.acquire({
          appearanceId: "appearance-b",
          material: { color: "#ffffff" }
        });

        assert(first.value.material !== second.value.material);

        cache.release("appearance-a");
        cache.release("appearance-b");
      },

      "mesma aparência separa sólido e superfície aberta"() {
        const resourceCache = {
          acquireTexture() {
            return null;
          },
          releaseTexture() {
            return true;
          }
        };
        const cache = new BatchMaterialCache({ resourceCache });

        const solid = cache.acquire({
          appearanceId: "appearance-shared",
          material: { color: "#ffffff" },
          renderProfile: {
            topology: "closed-solid",
            side: "front"
          }
        });
        const surface = cache.acquire({
          appearanceId: "appearance-shared",
          material: { color: "#ffffff" },
          renderProfile: {
            topology: "open-surface",
            side: "double"
          }
        });

        assert(solid.value.material !== surface.value.material);
        assertEqual(solid.value.material.side, THREE.FrontSide);
        assertEqual(surface.value.material.side, THREE.DoubleSide);
        assertEqual(cache.stats().entries, 2);

        cache.release(solid.key);
        cache.release(surface.key);
      }
    },

    "experiment-contract": {
      "definição declarativa é normalizada e congelada"() {
        const definition = normalizeExperimentDefinition(
          createExperimentDefinition()
        );

        assertEqual(
          definition.apiVersion,
          EXPERIMENT_DEFINITION_VERSION
        );
        assertEqual(definition.id, "math.test-curve");
        assertEqual(definition.parameters[0].control, "slider");
        assertEqual(Object.isFrozen(definition), true);
        assertEqual(Object.isFrozen(definition.parameters[0]), true);
      },

      "registro não aceita identidade nem parâmetro duplicado"() {
        const registry = new ExperimentRegistry();
        const definition = createExperimentDefinition();
        registry.register(definition);

        assertThrowsMessage(
          () => registry.register(definition),
          "Experimento duplicado"
        );
        assertThrowsMessage(
          () => normalizeExperimentDefinition({
            ...definition,
            parameters: [
              definition.parameters[0],
              definition.parameters[0]
            ]
          }),
          "Parâmetro duplicado"
        );
      },

      "registro rejeita controles e limites incompatíveis"() {
        const definition = createExperimentDefinition();

        assertThrowsMessage(
          () => normalizeExperimentDefinition({
            ...definition,
            parameters: [{
              id: "amount",
              label: "Quantidade",
              type: "integer",
              control: "color",
              default: 4
            }]
          }),
          "incompatível"
        );
        assertThrowsMessage(
          () => normalizeExperimentDefinition({
            ...definition,
            parameters: [{
              id: "amount",
              label: "Quantidade",
              type: "integer",
              min: 8,
              max: 2,
              default: 4
            }]
          }),
          "min não pode exceder max"
        );
      },

      "parâmetros resolvem defaults e valores de entrada"() {
        const registry = new ExperimentRegistry()
          .register(createExperimentDefinition());

        const defaults = registry.resolveParameters("math.test-curve");
        const custom = registry.resolveParameters("math.test-curve", {
          count: "12",
          color: "#0af",
          closed: "true",
          shape: "sphere"
        });

        assertDeepEqual(defaults, {
          count: 8,
          color: "#6699cc",
          closed: false,
          shape: "box"
        });
        assertDeepEqual(custom, {
          count: 12,
          color: "#00aaff",
          closed: true,
          shape: "sphere"
        });
      },

      "parâmetro desconhecido falha sem alterar o registro"() {
        const registry = new ExperimentRegistry()
          .register(createExperimentDefinition());
        const before = registry.list();

        assertThrowsMessage(
          () => registry.resolveParameters("math.test-curve", {
            unsafe: true
          }),
          "Parâmetro desconhecido"
        );
        assertDeepEqual(registry.list(), before);
      },

      "invocação liga parâmetros à função textual"() {
        const invocation = buildExperimentInvocation({
          program: {
            source: "({ count }) => count * 2"
          }
        }, { count: 6 });

        assertEqual(invocation, "(({ count }) => count * 2)({\"count\":6})");
        assertEqual(Function(`return ${invocation};`)(), 12);
      }
    },

    "experiment-plugin": {
      "capabilities entregam somente referências declaradas"() {
        const experiments = new ExperimentRegistry();
        const selected = selectCapabilities(
          ["experiments"],
          {
            experiments,
            renderer: { unsafe: true },
            dom: { unsafe: true }
          },
          "experiment.fixture"
        );

        assertEqual(selected.experiments, experiments);
        assertEqual(Object.hasOwn(selected, "renderer"), false);
        assertEqual(Object.hasOwn(selected, "dom"), false);
        assertEqual(Object.isFrozen(selected), true);
      },

      "capability ausente falha fechada"() {
        assertThrowsMessage(
          () => selectCapabilities(
            ["experiments"],
            { renderer: {} },
            "experiment.fixture"
          ),
          "requires unavailable capability: experiments"
        );
      },

      "manifesto de módulo é validado e descrito"() {
        const registry = new ModuleRegistry()
          .register(starterExperimentPlugin);
        const [description] = registry.describe();

        assertEqual(description.id, "experiments.starter");
        assertDeepEqual(description.capabilities, ["experiments"]);
        assertEqual(description.failed, false);
        assertEqual(description.error, null);
      },

      "plugin inicial registra catálogo sem receber host inteiro"() {
        const experiments = new ExperimentRegistry();
        const activated = starterExperimentPlugin.activate({ experiments });

        assertEqual(activated.registered, 3);
        assertDeepEqual(
          experiments.list().map(item => item.id).sort(),
          ["math.helix", "math.polar-flower", "math.sine-wave"]
        );
      },

      "fontes iniciais produzem planos determinísticos válidos"() {
        const registry = new ExperimentRegistry();
        starterExperimentPlugin.activate({ experiments: registry });
        const expectedCounts = {
          "math.helix": 96,
          "math.polar-flower": 240,
          "math.sine-wave": 121
        };

        for (const definition of starterExperimentDefinitions) {
          const parameters = registry.resolveParameters(definition.id);
          const envelope = executeProgramRequest({
            runId: `fixture-${definition.id}`,
            baseVersion: 7,
            seed: 0,
            allowedCommands: [SPATIAL_CREATE_COMMAND],
            geometryTypes: ["box", "sphere"],
            maxCommands: 10000,
            source: buildExperimentInvocation(definition, parameters),
            mode: "expression"
          }, {
            evaluate: evaluateTrustedFixture
          });

          assertEqual(envelope.type, "program.completed");
          assertEqual(envelope.plan.baseVersion, 7);
          assertEqual(
            envelope.plan.commands.length,
            expectedCounts[definition.id]
          );
          assertEqual(
            envelope.plan.result.value.experiment,
            definition.id
          );
        }
      },

      "hélice com caixa tolera invocação compatível sem pointRadius"() {
        const definition=starterExperimentDefinitions.find(
          item => item.id === "math.helix"
        );
        const parameters=Object.fromEntries(
          definition.parameters
            .filter(parameter => parameter.id !== "pointRadius")
            .map(parameter => [
              parameter.id,
              parameter.id === "shape" ? "box" : parameter.default
            ])
        );
        const envelope=executeProgramRequest({
          runId:"fixture-math.helix-box",
          baseVersion:0,
          seed:0,
          allowedCommands:[SPATIAL_CREATE_COMMAND],
          geometryTypes:["box","sphere"],
          maxCommands:10000,
          source:buildExperimentInvocation(definition,parameters),
          mode:"expression"
        },{evaluate:evaluateTrustedFixture});

        assertEqual(envelope.type,"program.completed");
        assertEqual(envelope.plan.commands.length,96);
        for(const command of envelope.plan.commands){
          assertDeepEqual(command.args.geometry.size,[0.28,0.28,0.28]);
        }
      },

      "bloco misto despacha comandos comuns e assíncronos em ordem"() {
        const console = createProgramConsole([], {
          experiments: {
            list: () => [],
            describe: id => ({ id }),
            plan: () => Promise.reject(new Error("não esperado"))
          }
        });

        return console.execute("help\nexperiment list")
          .then(entries => {
            assertEqual(entries.length, 2);
            assertEqual(entries[0].input, "help");
            assertEqual(entries[0].ok, true);
            assertEqual(entries[1].input, "experiment list");
            assertEqual(entries[1].ok, true);
            assertDeepEqual(entries[1].result, []);
          });
      },

      "forma semântica curta resolve alias parâmetros e commit atômico"() {
        const actions = [];
        const console = createProgramConsole([], {
          experiments: {
            list: () => [{ id: "math.helix" }],
            describe: id => ({ id }),
            plan: () => Promise.reject(new Error("não esperado"))
          },
          execute(id, args) {
            actions.push({ id, args: structuredClone(args) });
            return {
              plan: { commandCount: args.parameters.count },
              commit: { changed: true }
            };
          }
        });

        return console.execute(
          "experiment helix radius=4 turns=5 count=160"
        ).then(entries => {
          assertEqual(entries.length, 1);
          assertEqual(entries[0].ok, true);
          assertEqual(actions.length, 1);
          assertEqual(actions[0].id, "experiment.create");
          assertDeepEqual(actions[0].args, {
            id: "math.helix",
            parameters: { radius: 4, turns: 5, count: 160 }
          });
          assertEqual(entries[0].result.commit.changed, true);
        });
      },

      "runner aguarda asserções assíncronas antes de aprovar"() {
        let completed = false;
        return runRuntimeTests({
          fixture: {
            async "asserção assíncrona"() {
              await Promise.resolve();
              completed = true;
              assertEqual(completed, true);
            }
          }
        }, "fixture").then(result => {
          assertEqual(completed, true);
          assertEqual(result.passed, 1);
          assertEqual(result.failed, 0);
        });
      }
    },

    "experiment-panel": {
      async "ação comum planeja e confirma fora da visualização"() {
        const order = [];
        const sourcePlan = {
          runId: "panel-create",
          baseVersion: 12,
          commands: [{ sequence: 0 }, { sequence: 1 }],
          result: { value: { count: 2 }, output: ["ok"] }
        };
        const service = new ExperimentActionService({
          experiments: {
            async plan(id, parameters) {
              order.push("plan");
              return {
                experiment: { id },
                parameters,
                plan: sourcePlan
              };
            }
          },
          async commit(plan) {
            order.push("commit");
            assertEqual(plan, sourcePlan);
            return { changed: true };
          }
        });

        const result = await service.create("math.helix", { count: 2 });

        assertDeepEqual(order, ["plan", "commit"]);
        assertDeepEqual(result.plan, {
          runId: "panel-create",
          baseVersion: 12,
          commandCount: 2
        });
        assertEqual(result.commit.changed, true);
      },

      "controles convertem somente tipos declarados"() {
        assertEqual(
          normalizeExperimentControlValue(
            { id: "radius", type: "number" },
            "3.5"
          ),
          3.5
        );
        assertEqual(
          normalizeExperimentControlValue(
            { id: "count", type: "integer" },
            "12"
          ),
          12
        );
        assertEqual(
          normalizeExperimentControlValue(
            { id: "mirror", type: "boolean" },
            "false"
          ),
          false
        );
        assertEqual(
          normalizeExperimentControlValue(
            { id: "color", type: "color" },
            "#0af"
          ),
          "#0af"
        );
      },

      "controles recusam inteiros fracionários e tipos desconhecidos"() {
        assertThrowsMessage(
          () => normalizeExperimentControlValue(
            { id: "count", type: "integer" },
            "2.5"
          ),
          "use um inteiro"
        );
        assertThrowsMessage(
          () => normalizeExperimentControlValue(
            { id: "unsafe", type: "html" },
            "<button>"
          ),
          "Tipo de parâmetro desconhecido"
        );
      },

      "resumo de plano não expõe a lista volumosa de comandos"() {
        const summary = summarizeExperimentPlan({
          runId: "experiment-math.helix-1",
          baseVersion: 9,
          commands: [{ sequence: 0 }, { sequence: 1 }]
        });

        assertDeepEqual(summary, {
          runId: "experiment-math.helix-1",
          baseVersion: 9,
          commandCount: 2
        });
        assertEqual(Object.hasOwn(summary, "commands"), false);
      },

      "comando mostrado pelo painel usa intenção curta"() {
        assertEqual(
          formatExperimentCommand(
            { id: "math.helix" },
            { radius: 4, turns: 5, count: 160, color: "#5b8bd9" }
          ),
          "experiment helix radius=4 turns=5 count=160 color=#5b8bd9"
        );
      }
    },

    "property-contract": {
      "codec de cor normaliza formas curta e longa"() {
        assertEqual(normalizeHexColor("#AbC"), "#aabbcc");
        assertEqual(normalizeHexColor(" #12EF90 "), "#12ef90");
      },

      "registro descreve metadados sem expor implementação"() {
        const description = createDefaultPropertyRegistry().describe();
        const color = description.properties.find(
          property => property.id === "appearance.color"
        );

        assertEqual(description.apiVersion, "property-registry-v1");
        assertEqual(color.valueType, "color");
        assertEqual(color.editableMany, true);
        assertEqual("normalize" in color, false);
      },

      "codec de entrada interpreta tipos declarados"() {
        const properties = createDefaultPropertyRegistry()
          .describe()
          .properties;
        const descriptor = id => properties.find(
          property => property.id === id
        );

        assertDeepEqual(
          parsePropertyInput(
            descriptor("transform.position"),
            ["1", "2.5", "-3"]
          ),
          [1, 2.5, -3]
        );
        assertEqual(
          parsePropertyInput(
            descriptor("appearance.transparent"),
            ["sim"]
          ),
          true
        );
      },

      "inspeção diferencia valores uniformes e mistos"() {
        const fixture = createPropertyFixture();

        fixture.selection.replaceMany([
          { regionId: "region-properties", objectId: "a" },
          { regionId: "region-properties", objectId: "b" }
        ]);

        const inspection = fixture.service.inspectSelection();

        assertEqual(inspection.count, 2);
        assertEqual(
          inspection.properties["appearance.color"].status,
          "mixed"
        );
        assertEqual(
          inspection.properties["appearance.opacity"].status,
          "uniform"
        );
        assertEqual(
          inspection.properties["object.name"].editable,
          false
        );
      },

      "edição em lote é atômica e resolve alvos explícitos"() {
        const fixture = createPropertyFixture();
        fixture.selection.replaceMany([
          { regionId: "region-properties", objectId: "a" },
          { regionId: "region-properties", objectId: "b" }
        ]);

        const result = fixture.service.setSelection({
          "appearance.color": "#0af",
          "instance.color": "#fedcba"
        });
        const state = fixture.sandbox.getState();
        const proposal = fixture.sandbox.createProposal();

        assertEqual(result.changed, true);
        assertEqual(
          fixture.sandbox.getHistoryDiagnostics().commandCount,
          1
        );
        assertDeepEqual(
          proposal.commands[0].targetIds,
          ["a", "b"]
        );
        assertEqual(
          proposal.commands[0].propertyPatch["appearance.color"],
          "#00aaff"
        );
        assertEqual(state.objects[0].instanceState.color, "#fedcba");
        assertEqual(state.objects[1].instanceState.color, "#fedcba");
        assertEqual(
          fixture.appearanceRuntime.legacyMaterial(
            state.objects[0].appearanceId
          ).color,
          "#00aaff"
        );
        assertEqual(
          fixture.appearanceRuntime.legacyMaterial(
            state.objects[1].appearanceId
          ).opacity,
          1
        );
        assertEqual(
          state.objects[0].appearanceId,
          state.objects[1].appearanceId
        );
      },

      "textura e transformação compartilham a mesma via de propriedades"() {
        const fixture = createPropertyFixture();
        fixture.selection.replaceMany([
          { regionId: "region-properties", objectId: "a" },
          { regionId: "region-properties", objectId: "b" }
        ]);

        fixture.service.setSelection({
          "texture.src": "https://example.test/grid.png",
          "texture.repeat": [4, 2],
          "texture.offset": [0.25, 0.5],
          "texture.wrap": "mirror"
        });

        for (const object of fixture.sandbox.getState().objects) {
          const material = fixture.appearanceRuntime.legacyMaterial(
            object.appearanceId
          );
          assertEqual(
            material.texture.src,
            "https://example.test/grid.png"
          );
          assertDeepEqual(material.texture.repeat, [4, 2]);
          assertDeepEqual(material.texture.offset, [0.25, 0.5]);
          assertEqual(material.texture.wrap, "mirror");
        }
      },

      "textura em lote é internada uma vez por aparência de origem"() {
        const fixture = createPropertyFixture({ sameAppearance: true });
        fixture.selection.replaceMany([
          { regionId: "region-properties", objectId: "a" },
          { regionId: "region-properties", objectId: "b" }
        ]);
        const original = fixture.appearanceRuntime
          .internLegacyMaterial
          .bind(fixture.appearanceRuntime);
        let internCalls = 0;
        fixture.appearanceRuntime.internLegacyMaterial = (...args) => {
          internCalls += 1;
          return original(...args);
        };

        fixture.service.setSelection({
          "texture.src": "data:image/png;base64," + "A".repeat(4096)
        });
        const objects = fixture.sandbox.getState().objects;

        assertEqual(internCalls, 1);
        assertEqual(objects[0].appearanceId, objects[1].appearanceId);
        assertEqual(
          fixture.appearanceRuntime.graph.assets
            .get(objects[0].appearanceId).references,
          2
        );
      },

      "alterar cor preserva parâmetros da textura"() {
        const fixture = createPropertyFixture();
        fixture.selection.replace({
          regionId: "region-properties",
          objectId: "a"
        });

        fixture.service.setSelection({
          "texture.src": "data:image/png;base64,AAAA",
          "texture.repeat": [3, 4],
          "texture.offset": [0.2, 0.3],
          "texture.rotationDeg": 25,
          "texture.wrap": "mirror"
        });
        fixture.service.setSelection({
          "appearance.color": "#ff3300"
        });
        const object = fixture.sandbox.getState().objects[0];
        const material = fixture.appearanceRuntime
          .legacyMaterial(object.appearanceId);

        assertEqual(material.color, "#ff3300");
        assertDeepEqual(material.texture.repeat, [3, 4]);
        assertDeepEqual(material.texture.offset, [0.2, 0.3]);
        assertEqual(material.texture.rotationDeg, 25);
        assertEqual(material.texture.wrap, "mirror");
      },

      "remoção de cor de instância também é uma operação em lote"() {
        const fixture = createPropertyFixture({ instanceColor: "#112233" });
        fixture.selection.replaceMany([
          { regionId: "region-properties", objectId: "a" },
          { regionId: "region-properties", objectId: "b" }
        ]);

        fixture.service.unsetSelection(["instance.color"]);

        for (const object of fixture.sandbox.getState().objects) {
          assertEqual("color" in object.instanceState, false);
        }
      },

      "entrada inválida não altera estado nem histórico"() {
        const fixture = createPropertyFixture();
        fixture.selection.replaceMany([
          { regionId: "region-properties", objectId: "a" },
          { regionId: "region-properties", objectId: "b" }
        ]);
        const before = fixture.sandbox.getState();
        let rejected = false;

        try {
          fixture.service.setSelection({
            "appearance.color": "azul"
          });
        } catch {
          rejected = true;
        }

        assertEqual(rejected, true);
        assertDeepEqual(fixture.sandbox.getState(), before);
        assertEqual(
          fixture.sandbox.getHistoryDiagnostics().commandCount,
          0
        );
      },

      "valor já vigente não cria item de histórico"() {
        const fixture = createPropertyFixture();
        fixture.selection.replace({
          regionId: "region-properties",
          objectId: "a"
        });

        const result = fixture.service.setSelection({
          "appearance.color": "#112233",
          "appearance.opacity": 1
        });

        assertEqual(result.changed, false);
        assertEqual(
          fixture.sandbox.getHistoryDiagnostics().commandCount,
          0
        );
      },

      "transformação e geometria usam o mesmo contrato"() {
        const fixture = createPropertyFixture();
        fixture.selection.replace({
          regionId: "region-properties",
          objectId: "a"
        });

        fixture.service.setSelection({
          "transform.position": [4, 5, 6],
          "transform.rotationDeg": [0, 90, 0],
          "transform.scale": [2, 3, 4],
          "geometry.size": [6, 7, 8]
        });
        const object = fixture.sandbox.getState().objects[0];

        assertDeepEqual(object.position, [4, 5, 6]);
        assertDeepEqual(object.scale, [2, 3, 4]);
        assertDeepEqual(object.size, [6, 7, 8]);
        assertNear(object.rotation[1], Math.SQRT1_2);
        assertNear(object.rotation[3], Math.SQRT1_2);
        assertEqual(
          fixture.sandbox.getHistoryDiagnostics().commandCount,
          1
        );
      },

      "console traduz property set e inspect para a API comum"() {
        const fixture = createPropertyFixture();
        fixture.selection.replaceMany([
          { regionId: "region-properties", objectId: "a" },
          { regionId: "region-properties", objectId: "b" }
        ]);
        const console = createPropertyConsole(fixture);

        const setResult = console.execute(
          "property set appearance.color #3af"
        )[0];
        const inspectResult = console.execute(
          "property inspect appearance.color"
        )[0];

        assertEqual(setResult.ok, true);
        assertEqual(inspectResult.ok, true);
        assertEqual(inspectResult.result.status, "uniform");
        assertEqual(inspectResult.result.value, "#33aaff");
        assertEqual(
          fixture.sandbox.getHistoryDiagnostics().commandCount,
          1
        );
      },

      "console valida aridade vetorial antes da mutação"() {
        const fixture = createPropertyFixture();
        fixture.selection.replace({
          regionId: "region-properties",
          objectId: "a"
        });
        const console = createPropertyConsole(fixture);

        const result = console.execute(
          "property set transform.position 1 2"
        )[0];

        assertEqual(result.ok, false);
        assertEqual(
          fixture.sandbox.getHistoryDiagnostics().commandCount,
          0
        );
      },

      "console preserva ponto e vírgula dentro de URI citada"() {
        const fixture = createPropertyFixture();
        fixture.selection.replace({
          regionId: "region-properties",
          objectId: "a"
        });
        const console = createPropertyConsole(fixture);
        const uri = "data:image/png;base64,AA;BB";

        const result = console.execute(
          `property set texture.src "${uri}"`
        )[0];
        const object = fixture.sandbox.getState().objects[0];
        const material = fixture.appearanceRuntime.legacyMaterial(
          object.appearanceId
        );

        assertEqual(result.ok, true);
        assertEqual(material.texture.src, uri);
      }
    },

    "placement-frame": {
      "planos canônicos orientam a normal local"() {
        assertDeepEqual(resolvePlacementFrame({ plane: "xy" }).normal, [0, 0, 1]);
        assertDeepEqual(resolvePlacementFrame({ plane: "xz" }).normal, [0, 1, 0]);
        assertDeepEqual(resolvePlacementFrame({ plane: "yz" }).normal, [1, 0, 0]);
      },

      "normal sem tangente produz base ortonormal estável"() {
        const frame = resolvePlacementFrame({
          origin: [1, 2, 3],
          normal: [1, 1, 0]
        });

        assertDeepEqual(frame.origin, [1, 2, 3]);
        assertNear(dot3(frame.normal, frame.tangent), 0);
        assertNear(Math.hypot(...frame.normal), 1);
        assertNear(Math.hypot(...frame.tangent), 1);
        assertNear(Math.hypot(...frame.bitangent), 1);
      },

      "normal e tangente preservam a orientação solicitada"() {
        const frame = resolvePlacementFrame({
          normal: [0, 1, 0],
          tangent: [1, 1, 0]
        });

        assertDeepEqual(frame.normal.map(roundAffine), [0, 1, 0]);
        assertDeepEqual(frame.tangent.map(roundAffine), [1, 0, 0]);
        assertEqual(frame.mode, "normal-tangent");
      },

      "três pontos definem origem plano e direção"() {
        const frame = resolvePlacementFrame({
          points: [[2, 3, 4], [4, 3, 4], [2, 3, 7]]
        });

        assertDeepEqual(frame.origin, [2, 3, 4]);
        assertDeepEqual(frame.tangent.map(roundAffine), [1, 0, 0]);
        assertDeepEqual(frame.normal.map(roundAffine), [0, -1, 0]);
        assertEqual(frame.mode, "points");
      },

      "três pontos colineares são rejeitados"() {
        let rejected = false;
        try {
          resolvePlacementFrame({
            points: [[0, 0, 0], [1, 0, 0], [2, 0, 0]]
          });
        } catch {
          rejected = true;
        }
        assertEqual(rejected, true);
      }
    },

    "geometry-creation": {
      "help anuncia apenas famílias criáveis"() {
        const console = createGeometryConsole([]);
        const result = console.execute("help create")[0];
        const text = JSON.stringify(result.result);

        assertEqual(result.ok, true);
        for (const type of ["box", "sphere", "cylinder", "plane", "polygon"]) {
          assert(text.includes(type));
        }
      },

      "console compila polígono com plano origem e cor"() {
        const calls = [];
        const console = createGeometryConsole(calls);
        const result = console.execute(
          "create polygon 6 radius 2 plane xz origin 4 5 6 color #3af"
        )[0];

        assertEqual(result.ok, true);
        assertEqual(calls[0].id, "object.create.geometry");
        assertDeepEqual(calls[0].args.geometry, {
          type: "polygon",
          sides: 6,
          radius: 2,
          startAngleDeg: 0
        });
        assertDeepEqual(calls[0].args.placement, {
          origin:[4,5,6],
          plane:"xz",
          normal:null,
          tangent:null,
          points:null
        });
        assertEqual(calls[0].args.color, "#33aaff");
      },

      "console alcança todas as famílias registradas"() {
        const calls = [];
        const console = createGeometryConsole(calls);

        for (const source of [
          "create sphere radius 2",
          "create cylinder radius 1 height 3",
          "create plane size 4 5 plane yz",
          "create polygon sides 8 radius 2",
          "create box size 1 2 3 origin 0 1 0"
        ]) {
          assertEqual(console.execute(source)[0].ok, true);
        }

        assertDeepEqual(
          calls.map(call => call.args.geometry.type),
          ["sphere", "cylinder", "plane", "polygon", "box"]
        );
      },

      "console expõe a mesma série afim do painel"() {
        const calls=[];
        const console=createGeometryConsole(calls);
        const result=console.execute(
          "create box size 1 1 1 count 4 move 2 0 0 rotate 0 5 0"
        )[0];
        assertEqual(result.ok,true);
        assertEqual(calls[0].id,"object.create.geometrySeries");
        assertEqual(calls[0].args.count,4);
        assertDeepEqual(calls[0].args.operations,[
          {type:"move",value:[2,0,0]},
          {type:"rotate",value:[0,5,0]}
        ]);
      },

      "operação normaliza e persiste descritor genérico"() {
        const region = new Region(
          { id: "geometry-region", type: "box-region" },
          { schemaVersion: 1, objects: [] }
        );
        const sandbox = new Sandbox(region, boxRegionReducer);
        const editor = new EditorState();
        const appearanceRuntime = new AppearanceRuntime();
        const operations = new SelectionOperations({
          editor,
          sandbox,
          regionId: "geometry-region",
          geometryRegistry: createDefaultGeometryRegistry(),
          appearanceRuntime
        });

        const result = operations.createGeometry({
          geometry: { type: "polygon", sides: 7, radius: 2 },
          position: [1, 2, 3]
        });
        const object = sandbox.getSnapshot().objects[0];

        assertEqual(result.changed, true);
        assertEqual(object.kind, "polygon");
        assertEqual(Boolean(object.appearanceId), true);
        assertEqual("material" in object, false);
        assertDeepEqual(object.position, [1, 2, 3]);
        assertDeepEqual(object.geometry, {
          type: "polygon",
          sides: 7,
          radius: 2,
          startAngleDeg: 0
        });
        assertDeepEqual(
          editor.selection.snapshot().members.map(member => member.objectId),
          [object.id]
        );
      },

      "operação resolve o mesmo referencial do console e do painel"() {
        const region = new Region(
          { id: "geometry-placement", type: "box-region" },
          { schemaVersion: 1, objects: [] }
        );
        const sandbox = new Sandbox(region, boxRegionReducer);
        const operations = new SelectionOperations({
          editor:new EditorState(),
          sandbox,
          regionId:"geometry-placement",
          geometryRegistry:createDefaultGeometryRegistry(),
          appearanceRuntime:new AppearanceRuntime()
        });
        operations.createGeometry({
          geometry:{type:"polygon",sides:5},
          placement:{origin:[4,5,6],plane:"xz"}
        });
        const object=sandbox.getState().objects[0];
        assertDeepEqual(object.position,[4,5,6]);
        assertNear(Math.abs(object.rotation[0]),Math.SQRT1_2);
      },

      "série afim cria semente e cópias em uma operação atômica"() {
        const region=new Region(
          {id:"geometry-series",type:"box-region"},
          {schemaVersion:1,objects:[]}
        );
        const sandbox=new Sandbox(region,boxRegionReducer);
        const editor=new EditorState();
        const operations=new SelectionOperations({
          editor,
          sandbox,
          regionId:"geometry-series",
          geometryRegistry:createDefaultGeometryRegistry(),
          appearanceRuntime:new AppearanceRuntime()
        });
        const result=operations.createGeometrySeries({
          geometry:{type:"box",size:[1,1,1]},
          position:[0,0,0],
          count:4,
          operations:[{type:"move",value:[2,0,0]}]
        });
        assertEqual(result.count,4);
        assertDeepEqual(
          sandbox.getState().objects.map(object => object.position),
          [[0,0,0],[2,0,0],[4,0,0],[6,0,0]]
        );
        assertEqual(sandbox.getHistoryDiagnostics().commandCount,1);
        assertEqual(
          editor.selection.snapshot().activeMember.objectId,
          result.activeId
        );
      },

      "expressão afim inválida não insere a semente"() {
        const region=new Region(
          {id:"geometry-series-invalid",type:"box-region"},
          {schemaVersion:1,objects:[]}
        );
        const sandbox=new Sandbox(region,boxRegionReducer);
        const operations=new SelectionOperations({
          editor:new EditorState(),
          sandbox,
          regionId:"geometry-series-invalid",
          geometryRegistry:createDefaultGeometryRegistry(),
          appearanceRuntime:new AppearanceRuntime()
        });
        let rejected=false;
        try {
          operations.createGeometrySeries({
            geometry:{type:"sphere"},
            count:3,
            operations:[{type:"move",value:["unknown(",0,0]}]
          });
        } catch {
          rejected=true;
        }
        assertEqual(rejected,true);
        assertEqual(sandbox.getState().objects.length,0);
        assertEqual(sandbox.getHistoryDiagnostics().commandCount,0);
      }
    },

    "geometry-registry": {
      "descrição expõe famílias e parâmetros sem UI acoplada"() {
        const descriptions=createDefaultGeometryRegistry().describe();
        assertDeepEqual(
          descriptions.map(description => description.type),
          ["box","sphere","cylinder","plane","polygon"]
        );
        assertEqual(
          descriptions.find(description => description.type === "sphere")
            .parameters.some(parameter => parameter.id === "radius"),
          true
        );
      },
      "registro normaliza caixa legada"() {
        const registry = createDefaultGeometryRegistry();

        const descriptor = registry.describeLegacyObject({
          id: "legacy-box",
          kind: "box",
          size: [2, 3, 4]
        });

        assertDeepEqual(descriptor, {
          type: "box",
          size: [2, 3, 4]
        });
      },

      "descritores equivalentes geram mesma chave"() {
        const registry = createDefaultGeometryRegistry();

        assertEqual(
          registry.key({
            type: "sphere",
            radius: 2,
            widthSegments: 24,
            heightSegments: 16
          }),
          registry.key({
            heightSegments: 16,
            type: "sphere",
            widthSegments: 24,
            radius: 2
          })
        );
      },

      "providers criam BufferGeometry"() {
        const registry = createDefaultGeometryRegistry();

        for (const descriptor of [
          { type: "box", size: [1, 2, 3] },
          { type: "sphere", radius: 1 },
          { type: "cylinder", radius: 1, height: 2 },
          { type: "plane", width: 2, height: 3 },
          { type: "polygon", sides: 7, radius: 2 }
        ]) {
          const geometry = registry.create(descriptor);
          assert(geometry?.isBufferGeometry === true);
          geometry.dispose();
        }
      },

      "topologia distingue sólidos de superfícies abertas"() {
        const registry = createDefaultGeometryRegistry();

        for (const type of ["box", "sphere", "cylinder"]) {
          assertDeepEqual(registry.renderProfile({ type }), {
            topology: "closed-solid",
            side: "front"
          });
        }

        for (const type of ["plane", "polygon"]) {
          assertDeepEqual(registry.renderProfile({ type }), {
            topology: "open-surface",
            side: "double"
          });
        }
      },

      "registro rejeita provider duplicado"() {
        const registry = new GeometryRegistry()
          .register(BoxGeometryProvider);

        let rejected = false;

        try {
          registry.register(BoxGeometryProvider);
        } catch {
          rejected = true;
        }

        assertEqual(rejected, true);
      },

      "validação rejeita dimensões inválidas"() {
        const registry = createDefaultGeometryRegistry();

        for (const descriptor of [
          { type: "box", size: [1, 0, 1] },
          { type: "sphere", radius: -1 },
          { type: "cylinder", height: 0 },
          { type: "plane", width: 0 },
          { type: "polygon", sides: 2 },
          { type: "polygon", radius: 0 }
        ]) {
          let rejected = false;

          try {
            registry.normalize(descriptor);
          } catch {
            rejected = true;
          }

          assertEqual(rejected, true);
        }
      },

      "polígono regular normaliza ângulos equivalentes"() {
        const registry=createDefaultGeometryRegistry();
        assertDeepEqual(
          registry.normalize({
            type:"polygon",
            sides:5,
            radius:2,
            startAngleDeg:-90
          }),
          {
            type:"polygon",
            sides:5,
            radius:2,
            startAngleDeg:270
          }
        );
        assertEqual(
          registry.key({
            type:"polygon",
            sides:5,
            radius:2,
            startAngleDeg:0
          }),
          registry.key({
            type:"polygon",
            sides:5,
            radius:2,
            startAngleDeg:360
          })
        );
      },

      "polígono produz triangulação plana com UV"() {
        const descriptor=PolygonGeometryProvider.normalize({
          sides:5,
          radius:2,
          startAngleDeg:90
        });
        const geometry=PolygonGeometryProvider.create(descriptor);
        const position=geometry.getAttribute("position");

        assertEqual(geometry.index.count,15);
        assertEqual(Boolean(geometry.getAttribute("normal")),true);
        assertEqual(Boolean(geometry.getAttribute("uv")),true);
        let maximumRadius=0;
        for (let index=0; index<position.count; index+=1) {
          assertNear(position.getZ(index),0,1e-12);
          maximumRadius=Math.max(
            maximumRadius,
            Math.hypot(position.getX(index),position.getY(index))
          );
        }
        assertNear(maximumRadius,2,1e-6);
        geometry.dispose();
      },

      "objeto com descriptor explícito resolve polígono"() {
        const registry=createDefaultGeometryRegistry();
        assertDeepEqual(
          registry.describeLegacyObject({
            id:"polygon-a",
            kind:"polygon",
            geometry:{
              type:"polygon",
              sides:3,
              radius:4,
              startAngleDeg:30
            }
          }),
          {
            type:"polygon",
            sides:3,
            radius:4,
            startAngleDeg:30
          }
        );
      }
    },

    "instanced-renderer": {
      "seleção numerosa preserva contornos individuais em um draw call"() {
        const batch=new SelectionOutlineBatch({capacity:4});
        const instances=Array.from({length:500},(_,index) =>
          selectionOutlineInstance({
            id:`selected-${index}`,
            bounds:new THREE.Box3(
              new THREE.Vector3(index,0,0),
              new THREE.Vector3(index+1,2,3)
            ),
            active:index===499
          })
        );
        const diagnostics=batch.update(instances);

        assertEqual(batch.object.isLineSegments,true);
        assertEqual(batch.geometry.isInstancedBufferGeometry,true);
        assertEqual(batch.geometry.instanceCount,500);
        assertEqual(diagnostics.instanceCount,500);
        assertEqual(diagnostics.drawCalls,1);
        assertEqual(diagnostics.capacity,512);
        assertEqual(diagnostics.reallocations,1);
        const actualMatrix=batch.matrixAt(0).elements;
        const expectedMatrix=new THREE.Matrix4()
          .compose(
            new THREE.Vector3(0.5,1,1.5),
            new THREE.Quaternion(),
            new THREE.Vector3(1,2,3)
          )
          .elements;
        for(let index=0;index<16;index+=1){
          assertNear(actualMatrix[index],expectedMatrix[index],1e-6);
        }
        batch.dispose();
      },

      "lote atualiza cor ativa e evita upload quando nada mudou"() {
        const batch=new SelectionOutlineBatch({capacity:2});
        const instances=[
          selectionOutlineInstance({
            id:"inactive",
            bounds:new THREE.Box3(
              new THREE.Vector3(0,0,0),
              new THREE.Vector3(1,1,1)
            )
          }),
          selectionOutlineInstance({
            id:"active",
            bounds:new THREE.Box3(
              new THREE.Vector3(2,0,0),
              new THREE.Vector3(3,1,1)
            ),
            active:true
          })
        ];
        batch.update(instances);
        const inactive=batch.colorAt(0);
        const active=batch.colorAt(1);
        assertEqual(inactive.getHex(),0x8faaff);
        assertEqual(active.getHex(),0xffd166);
        const unchanged=batch.update(instances);
        assertEqual(unchanged.lastMatrixWrites,0);
        assertEqual(unchanged.lastColorWrites,0);
        assertEqual(unchanged.lastUploadedBytes,0);
        batch.dispose();
      },

      "benchmark compara helpers legados e lote instanciado"() {
        const result=benchmarkSelectionOutlines({
          objectCount:32,
          samples:2
        });
        assertEqual(result.resources.legacyHelpers.drawCalls,32);
        assertEqual(result.resources.instancedBatch.drawCalls,1);
        assertEqual(result.resources.instancedBatch.objects,1);
        assertEqual(result.cpuPreparationMs.instancedBatch.median >= 0,true);
      },

      "console expõe benchmark de seleção com parâmetros explícitos"() {
        const calls=[];
        const console=new DevConsole({
          editor:{selection:new Selection()},
          sandbox:{},
          region:{},
          renderer:{},
          getDiagnostics:()=>({}),
          commands:{
            describe:()=>[],
            execute(id,args){
              calls.push({id,args});
              return {ok:true};
            }
          }
        });
        const [entry]=console.execute("benchmark selection 250 3");
        assertEqual(entry.ok,true);
        assertDeepEqual(calls,[{
          id:"benchmark.selection",
          args:{objectCount:250,samples:3}
        }]);
      },
      "limites acompanham instância movida"() {
        const geometry = new THREE.BoxGeometry(1, 1, 1);
        const material = new THREE.MeshBasicMaterial();
        const batch = new InstanceBatch({
          key: "bounds",
          geometry,
          material,
          capacity: 4
        });

        batch.add(
          "object-a",
          new THREE.Matrix4().makeTranslation(100, 0, 0)
        );

        assertEqual(batch.boundsDirty, true);
        assertEqual(batch.flushBounds(), true);
        assertEqual(batch.boundsDirty, false);
        assert(batch.mesh.boundingSphere.center.x > 90);

        batch.update(
          "object-a",
          new THREE.Matrix4().makeTranslation(-100, 0, 0)
        );

        assertEqual(batch.flushBounds(), true);
        assert(batch.mesh.boundingSphere.center.x < -90);

        batch.dispose({
          disposeGeometry: true,
          disposeMaterial: true
        });
      },

      "flush sem mudança tem custo constante"() {
        const geometry = new THREE.BoxGeometry(1, 1, 1);
        const material = new THREE.MeshBasicMaterial();
        const batch = new InstanceBatch({
          key: "clean",
          geometry,
          material,
          capacity: 2
        });

        batch.add("object-a", new THREE.Matrix4());
        assertEqual(batch.flushBounds(), true);
        assertEqual(batch.flushBounds(), false);

        batch.dispose({
          disposeGeometry: true,
          disposeMaterial: true
        });
      },

      "manager remove lote vazio"() {
        const geometry = new THREE.BoxGeometry(1, 1, 1);
        const material = new THREE.MeshBasicMaterial();
        const manager = new InstanceBatchManager();
        manager.add({
          objectId: "object-a",
          batchKey: "batch-a",
          matrix: new THREE.Matrix4(),
          descriptor: { geometry, material, capacity: 4 }
        });
        manager.remove("object-a");
        assertEqual(manager.deleteBatch("batch-a"), true);
        assertEqual(manager.batchCount, 0);
        geometry.dispose();
        material.dispose();
      }
    },

    "affine-pivot": {
      "pivô median é resolvido explicitamente"() {
        const resolved = resolveAffineOperations(
          [
            { type: "move", value: [3, 0, 0] },
            { type: "pivot", mode: "median" },
            { type: "rotate", value: [0, 15, 0] }
          ],
          {
            defaultPivot: [100, 0, 0],
            medianPivot: [2, 3, 4],
            boundsPivot: [5, 6, 7],
            activePosition: [8, 9, 10]
          }
        );

        assertDeepEqual(
          resolved.operations[1],
          { type: "pivot", value: [2, 3, 4] }
        );
        assertDeepEqual(
          resolved.pivot.effective,
          [2, 3, 4]
        );
      },

      "pivô relativo usa objeto ativo"() {
        const resolved = resolveAffineOperations(
          [{
            type: "pivot",
            mode: "relative",
            offset: [1, -2, 3]
          }],
          {
            activePosition: [10, 20, 30]
          }
        );

        assertDeepEqual(
          resolved.pivot.effective,
          [11, 18, 33]
        );
      },

      "pivô absoluto preserva compatibilidade"() {
        const resolved = resolveAffineOperations(
          [{ type: "pivot", value: [7, 8, 9] }]
        );

        assertDeepEqual(
          resolved.pivot.effective,
          [7, 8, 9]
        );
      },

      "sem pivô explícito usa default determinístico"() {
        const resolved = resolveAffineOperations(
          [{ type: "rotate", value: [0, 30, 0] }],
          { defaultPivot: [4, 5, 6] }
        );

        assertEqual(resolved.pivot.explicit, false);
        assertDeepEqual(
          resolved.pivot.effective,
          [4, 5, 6]
        );
      }
    },

    "affine-contract": {
      "u percorre exatamente zero até um"() {
        const copies = affineProgramCopies(
          affineDiagnosticSeed(),
          5,
          [{ type: "move", value: ["u", 0, 0] }]
        );

        assertDeepEqual(
          copies.map(copy => roundAffine(copy.context.u)),
          [0, 0.25, 0.5, 0.75, 1]
        );
      },

      "move mundial independe da escala da semente"() {
        const copies = affineProgramCopies(
          affineDiagnosticSeed({ scale: [4, 4, 4] }),
          3,
          [{ type: "move", value: [0, 1, 0] }]
        );

        assertDeepEqual(
          copies.map(copy => copy.position.map(roundAffine)),
          [[0, 1, 0], [0, 2, 0], [0, 3, 0]]
        );
      },

      "move seguido de scale mantém passo unitário"() {
        const copies = affineProgramCopies(
          affineDiagnosticSeed(),
          4,
          [
            { type: "move", value: [0, 1, 0] },
            { type: "scale", value: [2, 2, 2] }
          ]
        );

        assertDeepEqual(
          copies.map(copy => roundAffine(copy.position[1])),
          [1, 2, 3, 4]
        );
      },

      "escala paramétrica descreve cada cópia sem acumulação"() {
        const copies = affineProgramCopies(
          affineDiagnosticSeed(),
          5,
          [{
            type: "scale",
            value: ["1+u", "1+u", "1+u"]
          }]
        );

        assertDeepEqual(
          copies.map(copy => roundAffine(copy.scale[0])),
          [1, 1.25, 1.5, 1.75, 2]
        );
      },

      "contas de colar crescem e diminuem simetricamente"() {
        const copies = affineProgramCopies(
          affineDiagnosticSeed(),
          9,
          [
            { type: "move", value: [1, 0, 0] },
            {
              type: "scale",
              value: [
                "0.2+0.8*abs(sin(u*pi))",
                "0.2+0.8*abs(sin(u*pi))",
                "0.2+0.8*abs(sin(u*pi))"
              ]
            }
          ]
        );

        const scales = copies.map(copy =>
          roundAffine(copy.scale[0])
        );

        assertNear(scales[0], 0.2);
        assertNear(scales[4], 1);
        assertNear(scales[8], 0.2);
      },

      "cem passos de uma unidade terminam em cem"() {
        const copies = affineProgramCopies(
          affineDiagnosticSeed(),
          100,
          [{ type: "move", value: [0, 1, 0] }]
        );

        assertNear(copies.at(-1).position[1], 100, 1e-9);
      },

      "duplicação consecutiva usa seleção recém-publicada"() {
        const sandbox = createAffineDiagnosticSandbox([
          {
            id: "seed",
            name: "seed",
            kind: "box",
            position: [0, 0, 0],
            rotation: [0, 0, 0, 1],
            scale: [1, 1, 1],
            size: [1, 1, 1],
            material: { color: "#ffffff" }
          }
        ]);
        const editor = new EditorState();

        editor.selection.replaceMany([{
          kind: "object",
          regionId: "region-main",
          objectId: "seed"
        }], { activeObjectId: "seed" });

        const operations = new SelectionOperations({
          editor,
          sandbox,
          regionId: "region-main"
        });

        const first = operations.duplicateAffine(
          3,
          [{ type: "move", value: ["i", 0, 0] }]
        );
        const second = operations.duplicateAffine(
          2,
          [{ type: "move", value: [0, "i", 0] }]
        );

        assertEqual(first.createdCount, 3);
        assertEqual(second.createdCount, 2);
        assertEqual(sandbox.getSnapshot().objects.length, 6);
      },

      "seleção nunca referencia objeto inexistente"() {
        const sandbox = createAffineDiagnosticSandbox([
          {
            id: "seed",
            name: "seed",
            kind: "box",
            position: [0, 0, 0],
            rotation: [0, 0, 0, 1],
            scale: [1, 1, 1],
            size: [1, 1, 1],
            material: { color: "#ffffff" }
          }
        ]);
        const editor = new EditorState();

        editor.selection.replaceMany([{
          kind: "object",
          regionId: "region-main",
          objectId: "seed"
        }], { activeObjectId: "seed" });

        const operations = new SelectionOperations({
          editor,
          sandbox,
          regionId: "region-main"
        });

        for (let cycle = 0; cycle < 10; cycle += 1) {
          operations.duplicateAffine(
            2,
            [{ type: "move", value: [1, 0, 0] }]
          );

          const ids = new Set(
            sandbox.getSnapshot().objects.map(object => object.id)
          );

          for (const member of editor.selection.snapshot().members) {
            assert(ids.has(member.objectId));
          }
        }
      },

      "mesmo programa produz resultado determinístico"() {
        const program = [
          { type: "move", value: ["cos(u*tau)", "u", "sin(u*tau)"] },
          { type: "rotate", value: [0, "u*360", 0] },
          { type: "scale", value: ["0.5+u", "0.5+u", "0.5+u"] }
        ];

        const first = affineProgramCopies(
          affineDiagnosticSeed(),
          32,
          program
        );
        const second = affineProgramCopies(
          affineDiagnosticSeed(),
          32,
          program
        );

        assertDeepEqual(
          first.map(affineDiagnosticSnapshot),
          second.map(affineDiagnosticSnapshot)
        );
      }
    },

    "affine-repeat": {
      "duplicação afim acumula translação"() {
        const step = composeAffineStep([
          { type: "move", value: [2, 0, 0] }
        ]);
        const copies = affineRepeatCopies({
          position: [1, 0, 0],
          rotation: [0, 0, 0, 1],
          scale: [1, 1, 1]
        }, 3, step);
        assertDeepEqual(
          copies.map(copy => copy.position.map(roundAffine)),
          [[3, 0, 0], [5, 0, 0], [7, 0, 0]]
        );
      },

      "matriz afim combina rotação e escala"() {
        const step = composeAffineStep([
          { type: "rotate", value: [0, 0, 90] },
          { type: "scale", value: [2, 2, 2] }
        ]);
        const copies = affineRepeatCopies({
          position: [1, 0, 0],
          rotation: [0, 0, 0, 1],
          scale: [1, 1, 1]
        }, 1, step);
        assertNear(copies[0].position[0], 0);
        assertNear(copies[0].position[1], 2);
        assertDeepEqual(copies[0].scale.map(roundAffine), [2, 2, 2]);
      },

      "expressões usam índice e variáveis"() {
        assertNear(
          evaluateAffineExpression(
            "radius*cosd(i*angle)",
            {
              radius: 2,
              i: 3,
              angle: 60
            }
          ),
          -2
        );
      },

      "graus radianos e voltas são equivalentes"() {
        const degree = evaluateAffineExpression("180 deg");
        const radian = evaluateAffineExpression("pi rad");
        const turn = evaluateAffineExpression("0.5 turn");

        assertNear(degree, 180);
        assertNear(radian, 180);
        assertNear(turn, 180);
      },

      "sufixos angulares são intuitivos"() {
        assertNear(
          evaluateAffineExpression("180d"),
          180
        );
        assertNear(
          evaluateAffineExpression("pi/4r"),
          45
        );
        assertNear(
          evaluateAffineExpression("0.5turn"),
          180
        );
      },

      "potência canônica usa dois asteriscos"() {
        assertNear(
          evaluateAffineExpression("2 ** 3"),
          8
        );
        assertNear(
          evaluateAffineExpression("2 ^ 3"),
          8
        );
      },

      "precedência de potência segue Python"() {
        assertNear(
          evaluateAffineExpression("-2 ** 2"),
          -4
        );
        assertNear(
          evaluateAffineExpression("2 ** -2"),
          0.25
        );
      },

      "trigonometria matemática usa radianos"() {
        assertNear(
          evaluateAffineExpression("sin(pi / 2)"),
          1
        );
        assertNear(
          evaluateAffineExpression("cosd(60)"),
          0.5
        );
      },

      "expressão guarda fonte normalizada e AST imutável"() {
        const expression = compileAffineExpression(
          "2 ^ 3"
        );

        assertEqual(expression.source, "2 ^ 3");
        assertEqual(expression.normalized, "2 ** 3");
        assert(Object.isFrozen(expression));
        assert(Object.isFrozen(expression.ast));
      },

      "backend matemático é substituível"() {
        const calls = [];
        const backend = {
          literal(value) {
            return value;
          },
          variable(value) {
            return value;
          },
          unary(operator, value) {
            calls.push(["unary", operator]);
            return operator === "-" ? -value : value;
          },
          binary(operator, left, right) {
            calls.push(["binary", operator]);
            if (operator === "+") return left + right;
            if (operator === "/") return left / right;
            if (operator === "**") return left ** right;
            throw new Error("operador inesperado");
          },
          call(name, args) {
            calls.push(["call", name]);
            return Math[name](...args);
          },
          toNumber(value) {
            return Number(value);
          }
        };

        assertNear(
          evaluateAffineExpression(
            "sin(pi / 2) + 2 ** 3",
            {},
            { backend }
          ),
          9
        );
        assert(
          calls.some(entry =>
            entry[0] === "binary" &&
            entry[1] === "**"
          )
        );
      },

      "acesso arbitrário a propriedades é rejeitado"() {
        let failed = false;

        try {
          evaluateAffineExpression("position.x");
        } catch (error) {
          failed = /(Caractere|Número) inválido/.test(
            error?.message ?? ""
          );
        }

        assert(failed);
      },

      "fragmento de expressão é reutilizável fora do repeat"() {
        const program = compileAffineProgram([
          {
            type: "move",
            value: ["i^2", "cosd(i*60)", "u"]
          }
        ]);

        const evaluated = evaluateAffineProgram(
          program,
          {
            i: 3,
            count: 5,
            u: 0.5,
            pi: Math.PI,
            e: Math.E,
            tau: 2 * Math.PI,
            deg: 1,
            rad: 180 / Math.PI,
            turn: 360
          }
        );

        assertDeepEqual(
          evaluated[0].value.map(roundAffine),
          [9, -1, 0.5]
        );
      },

      "programa é compilado uma única vez"() {
        const program = compileAffineProgram([
          {
            type: "move",
            value: ["i", "u", "amplitude*sin(i*pi/2)"]
          }
        ]);

        const first = evaluateAffineProgram(program, {
          i: 1,
          u: 0,
          amplitude: 2,
          pi: Math.PI,
          deg: 1,
          rad: 180 / Math.PI,
          turn: 360
        });

        const second = evaluateAffineProgram(program, {
          i: 2,
          u: 1,
          amplitude: 2,
          pi: Math.PI,
          deg: 1,
          rad: 180 / Math.PI,
          turn: 360
        });

        assertDeepEqual(
          first[0].value.map(roundAffine),
          [1, 0, 2]
        );
        assertDeepEqual(
          second[0].value.map(roundAffine),
          [2, 1, 0]
        );
      },

      "sequência paramétrica produz deslocamento não linear"() {
        const copies = affineProgramCopies(
          {
            position: [0, 0, 0],
            rotation: [0, 0, 0, 1],
            scale: [1, 1, 1]
          },
          4,
          [
            {
              type: "move",
              value: ["i^2", 0, 0]
            }
          ]
        );

        assertDeepEqual(
          copies.map(copy =>
            copy.position.map(roundAffine)
          ),
          [
            [1, 0, 0],
            [5, 0, 0],
            [14, 0, 0],
            [30, 0, 0]
          ]
        );
      },

      "expressão acessa posição e escala atuais"() {
        const copies = affineProgramCopies(
          {
            position: [1, 0, 0],
            rotation: [0, 0, 0, 1],
            scale: [2, 1, 1]
          },
          2,
          [{
            type: "move",
            value: ["x*sx", 0, 0]
          }]
        );

        assertDeepEqual(
          copies.map(copy =>
            copy.position.map(roundAffine)
          ),
          [[3, 0, 0], [9, 0, 0]]
        );
      },

      "mil transformações paramétricas são avaliadas"() {
        const startedAt = performance.now();
        const copies = affineProgramCopies(
          {
            position: [0, 0, 0],
            rotation: [0, 0, 0, 1],
            scale: [1, 1, 1]
          },
          1000,
          [{
            type: "move",
            value: [
              "0.01*cos(i*0.1)",
              "0.01*sin(i*0.1)",
              "u"
            ]
          }]
        );

        assertEqual(copies.length, 1000);
        assert(performance.now() - startedAt < 5000);
      }
    },

    "selection-ui": {
    "editor inicia em seleção"() { const e=new EditorState(); assertEqual(e.snapshot().tool.mode,"select"); assertEqual(e.snapshot().selectionOperation,"replace"); },
    "preserva transformação ao navegar"() { const e=new EditorState(); e.setToolMode("rotate"); e.setToolMode("navigate"); assertEqual(e.snapshot().tool.transformMode,"rotate"); },
    "operações são explícitas"() { const e=new EditorState(); e.setSelectionOperation("add"); e.setAreaSelection(true); assertEqual(e.snapshot().selectionOperation,"add"); assertEqual(e.snapshot().areaSelection,true); }
  },

  simulation: {
      "simulador aceita comando na versão correta"() {
        const bridge = createBridge();

        bridge.attachSnapshot(
          Object.freeze({ version: 4, value: 0 }),
          4
        );

        bridge.enqueue({
          commandId: "command-a",
          baseVersion: 4,
          type: "increment",
          amount: 3
        });

        const packet = bridge.step({ tick: 1 });

        assertEqual(packet.accepted.length, 1);
        assertEqual(packet.rejected.length, 0);
        assertEqual(packet.version, 5);
        assertEqual(packet.snapshot.value, 3);
      },

      "simulador rejeita conflito de versão"() {
        const bridge = createBridge();

        bridge.attachSnapshot(
          Object.freeze({ version: 4, value: 0 }),
          4
        );

        bridge.enqueue({
          commandId: "stale-command",
          baseVersion: 3,
          type: "increment",
          amount: 1
        });

        const packet = bridge.step({ tick: 1 });

        assertEqual(packet.accepted.length, 0);
        assertEqual(packet.rejected.length, 1);
        assertEqual(packet.rejected[0].reason, "version-conflict");
        assertEqual(packet.version, 4);
      },

      "simulador evolui mundo sem comando editorial"() {
        const bridge = new SimulationBridge({
          applyCommand({ snapshot, version }) {
            return {
              accepted: true,
              snapshot,
              version
            };
          },

          stepSimulation({ snapshot, version, context }) {
            return {
              changed: true,
              version: version + 1,
              snapshot: Object.freeze({
                ...snapshot,
                version: version + 1,
                time: snapshot.time + context.deltaSeconds
              }),
              delta: {
                type: "simulation-time",
                value: snapshot.time + context.deltaSeconds
              }
            };
          }
        });

        bridge.attachSnapshot(
          Object.freeze({ version: 0, time: 0 }),
          0
        );

        const packet = bridge.step({
          deltaSeconds: 0.25
        });

        assertEqual(packet.version, 1);
        assertNear(packet.snapshot.time, 0.25);
        assertEqual(packet.delta.type, "simulation-time");
      }
    }
  };
}

function createPropertyFixture({
  instanceColor = null,
  sameAppearance = false
} = {}) {
  const appearanceRuntime = new AppearanceRuntime();
  const scene = appearanceRuntime.normalizeScene({
    schemaVersion: 1,
    objects: [
      propertyObject("a", "#112233", instanceColor),
      propertyObject(
        "b",
        sameAppearance ? "#112233" : "#445566",
        instanceColor
      )
    ]
  });
  const region = new Region(
    {
      id: "region-properties",
      name: "Propriedades",
      type: "box-region"
    },
    scene
  );
  const sandbox = new Sandbox(region, boxRegionReducer);
  const selection = new Selection();
  const registry = createDefaultPropertyRegistry();
  const service = new SelectionPropertyService({
    selection,
    sandbox,
    appearanceRuntime,
    registry
  });

  return {
    appearanceRuntime,
    sandbox,
    selection,
    registry,
    service
  };
}

function createPropertyConsole(fixture) {
  return new DevConsole({
    editor: { selection: fixture.selection },
    sandbox: fixture.sandbox,
    region: fixture.sandbox.region,
    renderer: {},
    getDiagnostics: () => ({}),
    commands: {
      describe: () => [],
      execute(id, args) {
        if (id === "selection.properties.set") {
          return fixture.service.setSelection(args.patch);
        }
        if (id === "selection.properties.unset") {
          return fixture.service.unsetSelection(args.properties);
        }
        throw new Error(`Comando inesperado: ${id}.`);
      }
    },
    queries: {
      execute(id) {
        if (id === "properties.describe") {
          return fixture.registry.describe();
        }
        if (id === "selection.properties.inspect") {
          return fixture.service.inspectSelection();
        }
        throw new Error(`Consulta inesperada: ${id}.`);
      }
    }
  });
}

function createGeometryConsole(calls) {
  return new DevConsole({
    editor: { selection: new Selection() },
    sandbox: {},
    region: {},
    renderer: {},
    getDiagnostics: () => ({}),
    commands: {
      describe: () => [],
      execute(id, args) {
        calls.push({ id, args });
        return { changed: true };
      }
    }
  });
}

function createProgramConsole(calls, {
  procedures = null,
  experiments = null,
  plan = null,
  execute = null
} = {}) {
  return new DevConsole({
    editor: { selection: new Selection() },
    sandbox: { revision: 0 },
    region: {},
    renderer: {},
    getDiagnostics: () => ({}),
    commands: {
      describe: () => [],
      execute(id, args) {
        if (execute) return execute(id, args);
        throw new Error("Sessão matemática não usa comandos de cena.");
      }
    },
    programs: {
      run(request) {
        calls.push(structuredClone(request));
        return Promise.resolve(plan ?? {
          commands: [],
          result: { value: "ok", output: [] }
        });
      },
      snapshot: () => ({ state: "idle" }),
      reset: () => ({ state: "idle" }),
      cancel: () => ({ cancelled: false })
    },
    procedures,
    experiments
  });
}

function propertyObject(id, color, instanceColor) {
  return {
    id,
    kind: "box",
    name: id,
    position: [0, 1, 0],
    rotation: [0, 0, 0, 1],
    scale: [1, 1, 1],
    size: [2, 2, 2],
    material: {
      color,
      opacity: 1,
      transparent: false
    },
    instanceState: instanceColor
      ? { color: instanceColor }
      : {}
  };
}

function projectAssetObject(id, src) {
  return {
    id,
    kind: "box",
    name: id,
    position: [0, 1, 0],
    rotation: [0, 0, 0, 1],
    scale: [1, 1, 1],
    size: [2, 2, 2],
    material: {
      color: "#ffffff",
      texture: {
        src,
        repeat: [2, 3],
        offset: [0.1, 0.2],
        rotationDeg: 15,
        wrap: "repeat"
      }
    }
  };
}

function affineDiagnosticSeed(overrides = {}) {
  return {
    position: [0, 0, 0],
    rotation: [0, 0, 0, 1],
    scale: [1, 1, 1],
    ...structuredClone(overrides)
  };
}

function affineDiagnosticSnapshot(copy) {
  return {
    index: copy.index,
    position: copy.position.map(roundAffine),
    rotation: copy.rotation.map(roundAffine),
    scale: copy.scale.map(roundAffine)
  };
}

function createAffineDiagnosticSandbox(initialObjects = []) {
  let state = Object.freeze({
    objects: Object.freeze(structuredClone(initialObjects))
  });
  const listeners = new Set();

  return {
    getSnapshot() {
      return state;
    },

    getState() {
      return state;
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    dispatch(command) {
      if (command.type !== "selection.duplicate") {
        return false;
      }

      state = Object.freeze({
        ...state,
        objects: Object.freeze([
          ...state.objects,
          ...structuredClone(command.objects)
        ])
      });

      const changes = command.objects.map(object => ({
        type: "object-created",
        objectId: object.id
      }));

      for (const listener of listeners) {
        listener(state, changes);
      }

      return true;
    }
  };
}

function roundAffine(value) {
  const result=Math.round(Number(value)*1e9)/1e9;
  return Object.is(result,-0)?0:result;
}

function createBridge() {
  return new SimulationBridge({
    applyCommand({ snapshot, version, command }) {
      if (command.type !== "increment") {
        return {
          accepted: false,
          reason: "unsupported-command"
        };
      }

      const nextVersion = version + 1;

      return {
        accepted: true,
        version: nextVersion,
        snapshot: Object.freeze({
          ...snapshot,
          version: nextVersion,
          value: snapshot.value + Number(command.amount ?? 0)
        })
      };
    },

    stepSimulation({ snapshot, version }) {
      return {
        changed: false,
        snapshot,
        version,
        delta: null
      };
    }
  });
}

function createFileGatewayHarness(windowOverrides={}) {
  const calls=[];
  const link={
    href:"",
    download:"",
    click() { calls.push("link:click"); },
    remove() { calls.push("link:remove"); }
  };
  const windowRef={
    setTimeout(callback,delay) {
      calls.push(`timer:${delay}`);
      callback();
    },
    ...windowOverrides
  };
  const documentRef={
    body:{
      appendChild(value) {
        assertEqual(value,link);
        calls.push("dom:append");
      }
    },
    createElement(tag) {
      assertEqual(tag,"a");
      return link;
    }
  };
  const urlApi={
    createObjectURL() {
      calls.push("url:create");
      return "blob:test";
    },
    revokeObjectURL(url) {
      calls.push(`url:revoke:${url}`);
    }
  };
  class TestBlob {
    constructor(parts) {
      this.size=parts.join("").length;
    }
  }
  const gateway=new BrowserProjectFileGateway({
    windowRef,
    documentRef,
    urlApi,
    BlobCtor:TestBlob
  });
  return {gateway,calls,link};
}

function createExperimentDefinition() {
  return {
    apiVersion: EXPERIMENT_DEFINITION_VERSION,
    id: "math.test-curve",
    title: "Curva de teste",
    description: "Contrato declarativo usado pela suíte.",
    tags: ["Matemática", "teste", "matemática"],
    parameters: [
      {
        id: "count",
        label: "Quantidade",
        type: "integer",
        control: "slider",
        min: 2,
        max: 64,
        step: 1,
        default: 8
      },
      {
        id: "color",
        label: "Cor",
        type: "color",
        default: "#6699cc"
      },
      {
        id: "closed",
        label: "Fechada",
        type: "boolean",
        default: false
      },
      {
        id: "shape",
        label: "Forma",
        type: "select",
        options: ["box", { value: "sphere", label: "Esfera" }],
        default: "box"
      }
    ],
    program: {
      mode: "expression",
      source: "({ count }) => count"
    }
  };
}

export async function runRuntimeTests(suites, requested = "all") {
  const selected =
    requested === "all"
      ? Object.entries(suites)
      : [[requested, suites[requested]]];

  if (selected.some(([, tests]) => !tests)) {
    throw new Error(
      `Suíte runtime desconhecida: ${requested}.`
    );
  }

  const startedAt = performance.now();
  const results = [];

  for (const [suite, tests] of selected) {
    for (const [name, test] of Object.entries(tests)) {
      const started = performance.now();

      try {
        await test();
        results.push({
          suite,
          test: name,
          ok: true,
          durationMs: round(performance.now() - started)
        });
      } catch (error) {
        results.push({
          suite,
          test: name,
          ok: false,
          durationMs: round(performance.now() - started),
          error: error?.message ?? String(error)
        });
      }
    }
  }

  const passed = results.filter(result => result.ok).length;

  return {
    scope: "runtime-layers",
    suite: requested,
    passed,
    failed: results.length - passed,
    total: results.length,
    durationMs: round(performance.now() - startedAt),
    ok: passed === results.length,
    results
  };
}

function createProgramControllerHarness() {
  const worker = new FakeProgramWorker();
  let timeoutCallback = null;
  const clearedTimers = [];
  const controller = new ProgramRunController({
    workerFactory: () => worker,
    timeoutMs: 5000,
    setTimer(callback) {
      timeoutCallback = callback;
      return 17;
    },
    clearTimer(timerId) {
      clearedTimers.push(timerId);
    }
  });

  return {
    controller,
    worker,
    clearedTimers,
    fireTimeout() {
      if (!timeoutCallback) {
        throw new Error("Timeout não foi registrado.");
      }
      timeoutCallback();
    }
  };
}

function createProgramSessionControllerHarness(options = {}) {
  const worker = new FakeProgramWorker();
  let timeoutCallback = null;
  let creations = 0;
  const controller = new ProgramSessionController({
    workerFactory() {
      creations += 1;
      return worker;
    },
    timeoutMs: 5000,
    setTimer(callback) {
      timeoutCallback = callback;
      return 23;
    },
    clearTimer() {},
    ...options
  });

  return {
    controller,
    worker,
    workerCreations: () => creations,
    fireTimeout() {
      if (!timeoutCallback) {
        throw new Error("Timeout de sessão não foi registrado.");
      }
      timeoutCallback();
    }
  };
}

class FakeProgramWorker {
  constructor() {
    this.listeners = new Map();
    this.messages = [];
    this.terminations = 0;
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type, listener) {
    this.listeners.get(type)?.delete(listener);
  }

  postMessage(message) {
    this.messages.push(structuredClone(message));
  }

  terminate() {
    this.terminations += 1;
  }

  emit(type, data) {
    for (const listener of this.listeners.get(type) ?? []) {
      listener({ data: structuredClone(data) });
    }
  }
}

function programCompletedEnvelope({
  runId,
  baseVersion,
  commands = []
}) {
  return {
    protocolVersion: PROGRAM_WORKER_PROTOCOL_VERSION,
    type: "program.completed",
    runId,
    plan: {
      planVersion: PROGRAM_PLAN_VERSION,
      runId,
      baseVersion,
      seed: 0,
      commands: structuredClone(commands),
      result: null
    }
  };
}

function sessionCompletedEnvelope({
  runId,
  baseVersion = 0,
  revision,
  keys = [],
  commands = []
}) {
  return {
    ...programCompletedEnvelope({
      runId,
      baseVersion,
      commands
    }),
    session: {
      state: "active",
      revision,
      keys: structuredClone(keys)
    }
  };
}

function evaluateTrustedFixture(source, endowments) {
  const names = Object.keys(endowments);
  const values = names.map(name => endowments[name]);
  const evaluator = new Function(
    ...names,
    `"use strict"; return ${source};`
  );

  return evaluator(...values);
}

function createTrustedProgramSession() {
  return new ProgramSessionKernel({
    evaluate: evaluateTrustedFixture
  });
}

function createSpatialCommitFixture() {
  const region = new Region(
    {
      id: "region-spatial-commit",
      name: "Spatial commit",
      type: "box-region"
    },
    { schemaVersion: 1, objects: [] }
  );
  const sandbox = new Sandbox(region, boxRegionReducer);
  const editor = { selection: new Selection() };
  const appearanceRuntime = new AppearanceRuntime();
  let idSequence = 0;
  const service = new SpatialPlanCommitService({
    sandbox,
    editor,
    regionId: region.descriptor.id,
    geometryRegistry: createDefaultGeometryRegistry(),
    appearanceRuntime,
    createId: () => `program-object-${++idSequence}`
  });

  return {
    region,
    sandbox,
    editor,
    appearanceRuntime,
    service
  };
}

function spatialCreationPlan({
  baseVersion = 0,
  runId = "spatial-commit-run",
  creations = []
} = {}) {
  return {
    planVersion: PROGRAM_PLAN_VERSION,
    runId,
    baseVersion,
    seed: 0,
    commands: creations.map((creation, index) => ({
      sequence: index,
      command: SPATIAL_CREATE_COMMAND,
      args: {
        handle: {
          kind: "object",
          id: creation.handleId ?? `${runId}:object:${index + 1}`
        },
        geometry: {
          ...(creation.options?.geometry ?? {}),
          ...Object.fromEntries(
            Object.entries(creation.options ?? {}).filter(([name]) =>
              ![
                "geometry",
                "name",
                "position",
                "rotation",
                "placement",
                "color"
              ].includes(name)
            )
          ),
          type: creation.type
        },
        ...Object.fromEntries(
          Object.entries(creation.options ?? {}).filter(([name]) =>
            [
              "name",
              "position",
              "rotation",
              "placement",
              "color"
            ].includes(name)
          )
        )
      }
    })),
    result: null
  };
}

function assert(condition, message = "Falha de asserção.") {
  if (!condition) throw new Error(message);
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
  const left = JSON.stringify(actual);
  const right = JSON.stringify(expected);

  if (left !== right) {
    throw new Error(
      `Esperado ${right}, recebido ${left}.`
    );
  }
}

function assertNear(actual, expected, epsilon = 1e-9) {
  assert(
    Math.abs(actual - expected) <= epsilon,
    `Esperado aproximadamente ${expected}, recebido ${actual}.`
  );
}

function createPwaInstallWindow({ standalone=false }={}) {
  const listeners=new Map();
  return {
    navigator:{standalone:false},
    matchMedia() { return {matches:standalone}; },
    addEventListener(type,listener) {
      const current=listeners.get(type) ?? new Set();
      current.add(listener);
      listeners.set(type,current);
    },
    removeEventListener(type,listener) {
      listeners.get(type)?.delete(listener);
    }
  };
}

function dot3(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function assertThrowsCode(callback, expectedCode) {
  let captured=null;
  try {
    callback();
  } catch (error) {
    captured=error;
  }
  assert(captured,`Esperava erro ${expectedCode}, mas nenhuma exceção foi lançada.`);
  assertEqual(captured.code,expectedCode);
}

function assertThrowsMessage(callback, expectedMessage) {
  let captured = null;

  try {
    callback();
  } catch (error) {
    captured = error;
  }

  assert(
    captured,
    `Esperava erro contendo ${expectedMessage}, mas nenhuma exceção foi lançada.`
  );
  assert(
    String(captured.message).includes(expectedMessage),
    `Erro não contém ${expectedMessage}: ${captured.message}`
  );
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}

function createGroupTransformSandbox({
  nested=false,
  groupRotation=[0,0,0,1]
}={}) {
  const group={
    id:"group",
    kind:"group",
    position:[4,2,1],
    rotation:[...groupRotation],
    scale:[1,1,1],
    pivot:[1,0,0]
  };
  const child={
    id:"child",
    kind:"box",
    parentId:nested ? "inner" : "group",
    position:[3,1,0],
    rotation:eulerQuaternion([0,0,15]),
    scale:[1,1,1],
    size:[2,2,2]
  };
  const objects=nested
    ? [
        group,
        {
          id:"inner",
          kind:"group",
          parentId:"group",
          position:[1,0,2],
          rotation:eulerQuaternion([0,0,30]),
          scale:[1,1,1],
          pivot:[0,0,0]
        },
        child
      ]
    : [group,child];
  const region=new Region(
    {id:"group-transform-test",type:"box-region"},
    {schemaVersion:1,objects}
  );
  return new Sandbox(region,boxRegionReducer);
}

function commitWorldDelta(sandbox, objectId, delta) {
  const hierarchy=new HierarchyIndex(sandbox.getSnapshot().objects);
  return sandbox.dispatch({
    type:"selection.transform-world",
    transforms:[{
      id:objectId,
      worldMatrix:multiplyMatrices(delta,hierarchy.worldMatrixOf(objectId))
    }]
  });
}

function transformPointForTest(matrix, [x,y,z]) {
  return [
    matrix[0]*x+matrix[4]*y+matrix[8]*z+matrix[12],
    matrix[1]*x+matrix[5]*y+matrix[9]*z+matrix[13],
    matrix[2]*x+matrix[6]*y+matrix[10]*z+matrix[14]
  ];
}

function hierarchyFixture() {
  return [
    {id:"root",position:[10,0,0]},
    {
      id:"group",
      parentId:"root",
      position:[1,2,0],
      rotation:eulerQuaternion([0,0,90])
    },
    {id:"child",parentId:"group",position:[2,0,3]},
    {id:"sibling",parentId:"root",position:[-1,0,0]},
    {id:"loose",position:[0,5,0]}
  ];
}

function createHierarchySandbox() {
  const objects=[
    {
      id:"source",
      position:[5,0,0],
      rotation:eulerQuaternion([0,0,30]),
      scale:[1,1,1]
    },
    {
      id:"target",
      position:[-2,3,1],
      rotation:eulerQuaternion([0,0,-20]),
      scale:[2,2,2]
    },
    {
      id:"moving",
      parentId:"source",
      position:[1,2,0],
      rotation:eulerQuaternion([10,0,15]),
      scale:[0.5,0.5,0.5]
    },
    {
      id:"nested",
      parentId:"moving",
      position:[0,0,4],
      rotation:[0,0,0,1],
      scale:[1,1,1]
    }
  ];
  const region=new Region(
    {id:"hierarchy-test",type:"box-region"},
    {schemaVersion:1,objects}
  );
  return new Sandbox(region,boxRegionReducer);
}

function createShearHierarchySandbox() {
  const region=new Region(
    {id:"hierarchy-shear-test",type:"box-region"},
    {
      schemaVersion:1,
      objects:[
        {
          id:"scaled-parent",
          position:[0,0,0],
          rotation:[0,0,0,1],
          scale:[2,1,1]
        },
        {
          id:"rotated-child",
          parentId:"scaled-parent",
          position:[0,0,0],
          rotation:eulerQuaternion([0,0,45]),
          scale:[1,1,1]
        },
        {
          id:"loose",
          position:[5,0,0],
          rotation:[0,0,0,1],
          scale:[1,1,1]
        }
      ]
    }
  );
  return new Sandbox(region,boxRegionReducer);
}

function findHierarchyNode(state, id) {
  return state.objects.find(object => object.id === id);
}

function assertMatricesNear(actual, expected, epsilon = 1e-9) {
  assertEqual(actual.length,expected.length);
  for (let index=0; index<actual.length; index+=1) {
    assertNear(actual[index],expected[index],epsilon);
  }
}
