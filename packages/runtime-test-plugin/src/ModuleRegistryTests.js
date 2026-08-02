import {
  MODULE_MANIFEST_VERSION,
  ModuleActivationError,
  ModuleRegistry,
  ModuleValidationError,
  selectCapabilities
} from "../../plugin-api/src/index.js?build=20260802-0047b";
import {
  REGION_BOX_REDUCER_CONTRIBUTION_ID,
  boxRegionReducer,
  regionBoxModule
} from "../../region-box/src/index.js?build=20260802-0047b";

export function createModuleRegistryTests() {
  return {
    "manifesto v2 é serializável, estrito e inspecionável"() {
      const registry = new ModuleRegistry().register(
        moduleFixture("fixture.manifest")
      );
      const [description] = registry.describe();

      assertEqual(description.manifestVersion, MODULE_MANIFEST_VERSION);
      assertEqual(description.id, "fixture.manifest");
      assertEqual(description.state, "registered");
      assertEqual(description.failed, false);
      assertEqual(Object.isFrozen(description), true);
      assertThrowsMessage(
        () => registry.register({
          manifest: {
            manifestVersion: MODULE_MANIFEST_VERSION,
            id: "fixture.legacy",
            version: "1.0.0",
            apiVersion: "legacy-v1"
          },
          createModule() {}
        }),
        "Unknown field"
      );
    },

    "capabilities são mínimas e seguem dependências declaradas": async () => {
      const order = [];
      const service = Object.freeze({ name: "service" });
      const registry = new ModuleRegistry()
        .register(moduleFixture("fixture.provider", {
          providesCapabilities: ["fixture.service.v1"],
          activate() {
            order.push("provider");
            return {
              capabilities: {
                "fixture.service.v1": service
              }
            };
          }
        }))
        .register(moduleFixture("fixture.consumer", {
          requiresModules: ["fixture.provider"],
          requiresCapabilities: ["fixture.service.v1"],
          activate(scope) {
            order.push("consumer");
            assertEqual(
              scope.capabilities["fixture.service.v1"],
              service
            );
            assertDeepEqual(
              Object.keys(scope.capabilities),
              ["fixture.service.v1"]
            );
          }
        }));

      await registry.activateAll({
        "host.unused.v1": Object.freeze({ unsafe: true })
      });

      assertDeepEqual(order, ["provider", "consumer"]);
      assertEqual(registry.resolveCapability("fixture.service.v1"), service);
      await registry.dispose();
    },

    "seleção avulsa não vaza capabilities do host"() {
      const selected = selectCapabilities(
        ["fixture.experiments.v1"],
        {
          "fixture.experiments.v1": Object.freeze({ safe: true }),
          "fixture.renderer.v1": Object.freeze({ unsafe: true })
        },
        "fixture.selector"
      );

      assertEqual(selected["fixture.experiments.v1"].safe, true);
      assertEqual(
        Object.hasOwn(selected, "fixture.renderer.v1"),
        false
      );
      assertEqual(Object.isFrozen(selected), true);
      assertThrowsMessage(
        () => selectCapabilities(
          ["fixture.experiments.v1"],
          { "fixture.renderer.v1": {} },
          "fixture.selector"
        ),
        "requires unavailable capability: fixture.experiments.v1"
      );
    },

    "módulo regional publica o reducer canônico": async () => {
      const registry = new ModuleRegistry().register(regionBoxModule);
      await registry.activateAll();

      assertEqual(
        registry.resolveContribution(
          "reducers",
          REGION_BOX_REDUCER_CONTRIBUTION_ID
        ),
        boxRegionReducer
      );
      assertDeepEqual(registry.listContributions("reducers"), [{
        moduleId: "spatialseed.document.region-box",
        id: REGION_BOX_REDUCER_CONTRIBUTION_ID,
        apiVersion: "spatial-seed-region-reducer-v1"
      }]);
      await registry.dispose();
    },

    "dependência ausente falha antes de qualquer efeito": async () => {
      let activations = 0;
      const registry = new ModuleRegistry().register(
        moduleFixture("fixture.dependent", {
          requiresModules: ["fixture.missing"],
          activate() {
            activations += 1;
          }
        })
      );

      const error = await captureRejection(() => registry.activateAll());
      assert(error instanceof ModuleValidationError);
      assertEqual(error.code, "module-dependency-missing");
      assertEqual(activations, 0);
      assertEqual(registry.describe()[0].state, "registered");
    },

    "ciclo de dependências é rejeitado antes da ativação": async () => {
      let activations = 0;
      const registry = new ModuleRegistry()
        .register(moduleFixture("fixture.cycle-a", {
          requiresModules: ["fixture.cycle-b"],
          activate() {
            activations += 1;
          }
        }))
        .register(moduleFixture("fixture.cycle-b", {
          requiresModules: ["fixture.cycle-a"],
          activate() {
            activations += 1;
          }
        }));

      const error = await captureRejection(() => registry.activateAll());
      assert(error instanceof ModuleValidationError);
      assertEqual(error.code, "module-dependency-cycle");
      assertEqual(activations, 0);
    },

    "falha de ativação reverte candidato em ordem inversa": async () => {
      const lifecycle = [];
      const registry = new ModuleRegistry()
        .register(lifecycleModule("fixture.first", lifecycle))
        .register(lifecycleModule("fixture.second", lifecycle, {
          requiresModules: ["fixture.first"]
        }))
        .register(lifecycleModule("fixture.failing", lifecycle, {
          requiresModules: ["fixture.second"],
          fail: true
        }));

      const error = await captureRejection(() => registry.activateAll());

      assert(error instanceof ModuleActivationError);
      assertEqual(error.moduleId, "fixture.failing");
      assertDeepEqual(lifecycle, [
        "activate:first",
        "activate:second",
        "activate:failing",
        "dispose:failing",
        "dispose:second",
        "dispose:first"
      ]);
      assertDeepEqual(
        registry.describe().map(item => item.state),
        ["registered", "registered", "registered"]
      );
      assertEqual(registry.describe()[2].failed, true);
    },

    "payload não declarado aborta e descarta a instância": async () => {
      let disposed = false;
      const registry = new ModuleRegistry().register(
        moduleFixture("fixture.catalog", {
          contributes: {
            catalogs: [{ id: "fixture.catalog.valid" }]
          },
          activate() {
            return {
              contributions: {
                catalogs: {
                  "fixture.catalog.invalid": Object.freeze([])
                }
              }
            };
          },
          dispose() {
            disposed = true;
          }
        })
      );

      const error = await captureRejection(() => registry.activateAll());
      assert(error instanceof ModuleValidationError);
      assertEqual(error.code, "activation-reference-undeclared");
      assertEqual(disposed, true);
      assertThrowsMessage(
        () => registry.resolveContribution(
          "catalogs",
          "fixture.catalog.valid"
        ),
        "unavailable"
      );
    },

    "contribuições só ficam visíveis após commit completo": async () => {
      let generation = 0;
      const firstPayload = Object.freeze({ generation: 1 });
      const registry = new ModuleRegistry().register(
        moduleFixture("fixture.stable", {
          contributes: {
            catalogs: [{ id: "fixture.catalog.stable" }]
          },
          activate() {
            generation += 1;
            return {
              contributions: {
                catalogs: {
                  "fixture.catalog.stable": generation === 1
                    ? firstPayload
                    : Object.freeze({ generation })
                }
              }
            };
          }
        })
      );

      await registry.activateAll();
      registry.register(moduleFixture("fixture.late-failure", {
        requiresModules: ["fixture.stable"],
        activate() {
          throw new Error("candidate rejected");
        }
      }));

      await assertRejectsMessage(
        () => registry.activateAll(),
        "candidate rejected"
      );
      assertEqual(
        registry.resolveContribution(
          "catalogs",
          "fixture.catalog.stable"
        ),
        firstPayload
      );
      assertEqual(registry.describe()[0].state, "active");
      await registry.dispose();
    },

    "dispose percorre módulos ativos em ordem inversa": async () => {
      const lifecycle = [];
      const registry = new ModuleRegistry()
        .register(lifecycleModule("fixture.alpha", lifecycle))
        .register(lifecycleModule("fixture.beta", lifecycle, {
          requiresModules: ["fixture.alpha"]
        }))
        .register(lifecycleModule("fixture.gamma", lifecycle, {
          requiresModules: ["fixture.beta"]
        }));

      await registry.activateAll();
      const disposed = await registry.dispose();

      assertEqual(disposed, true);
      assertDeepEqual(lifecycle.slice(-3), [
        "dispose:gamma",
        "dispose:beta",
        "dispose:alpha"
      ]);
      assertEqual(await registry.dispose(), false);
    }
  };
}

function moduleFixture(id, {
  requiresModules = [],
  requiresCapabilities = [],
  providesCapabilities = [],
  contributes = {},
  activate = () => undefined,
  dispose = () => undefined
} = {}) {
  return {
    manifest: {
      manifestVersion: MODULE_MANIFEST_VERSION,
      id,
      version: "1.0.0",
      requires: {
        modules: requiresModules,
        capabilities: requiresCapabilities
      },
      provides: {
        capabilities: providesCapabilities
      },
      contributes,
      permissions: []
    },
    createModule(scope) {
      return {
        activate: () => activate(scope),
        dispose: () => dispose(scope)
      };
    }
  };
}

function lifecycleModule(id, lifecycle, {
  requiresModules = [],
  fail = false
} = {}) {
  const shortId = id.split(".").at(-1);
  return moduleFixture(id, {
    requiresModules,
    activate() {
      lifecycle.push(`activate:${shortId}`);
      if (fail) throw new Error(`${shortId} failed`);
    },
    dispose() {
      lifecycle.push(`dispose:${shortId}`);
    }
  });
}

async function captureRejection(callback) {
  try {
    await callback();
  } catch (error) {
    return error;
  }
  throw new Error("Esperava rejeição, mas a operação foi concluída.");
}

async function assertRejectsMessage(callback, expectedMessage) {
  const error = await captureRejection(callback);
  assert(
    String(error.message).includes(expectedMessage),
    `Erro não contém ${expectedMessage}: ${error.message}`
  );
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
    throw new Error(`Esperado ${right}, recebido ${left}.`);
  }
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
