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
import { Sandbox } from "../../core/src/Sandbox.js";
import { classifyChanges } from "../../incremental-runtime/src/index.js";
import { ResourceAudit } from "../../resource-audit/src/index.js";
import { RefCountCache, textureKey } from "../../renderer-resource-cache/src/index.js";
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
  composeAffineOperations,
  affineCopies,
  composeTransform,
  decomposeTransform,
  decomposeTransformStrict,
  eulerQuaternion,
  identityMatrix,
  invertAffineMatrix,
  multiplyMatrices
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
} from "../../selection-operations/src/SelectionOperations.js?build=20260714-0021c-diagnostics";
import { ProjectAppearanceAdapter } from "../../project-files/src/ProjectAppearanceAdapter.js";
import {
  boxRegionReducer
} from "../../region-box/src/reducer.js?build=20260715-0022a";
import {
  GeometryRegistry,
  BoxGeometryProvider,
  SphereGeometryProvider,
  CylinderGeometryProvider,
  PlaneGeometryProvider,
  createDefaultGeometryRegistry
} from "../../geometry-registry/src/index.js?build=20260714-0020b-a";
import {
  normalizeHexColor,
  parsePropertyInput,
  createDefaultPropertyRegistry,
  SelectionPropertyService
} from "../../property-registry/src/index.js?build=20260715-0022b";
import {
  DevConsole
} from "../../devtools/src/DevConsole.js?build=20260715-0022b";
import {
  HierarchyIndex
} from "../../scene-hierarchy/src/index.js";
import {
  affectedHierarchyIds,
  applyProjectedWorldMatrix,
  isRenderableSceneNode
} from "../../renderer-three/src/WorldTransformProjection.js?build=20260715-0023d";
import {
  formatBuildLabel,
  normalizeBuildInfo
} from "../../../apps/web/BuildInfo.js";

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

    "geometry-registry": {
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
          { type: "plane", width: 2, height: 3 }
        ]) {
          const geometry = registry.create(descriptor);
          assert(geometry?.isBufferGeometry === true);
          geometry.dispose();
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
          { type: "plane", width: 0 }
        ]) {
          let rejected = false;

          try {
            registry.normalize(descriptor);
          } catch {
            rejected = true;
          }

          assertEqual(rejected, true);
        }
      }
    },

    "instanced-renderer": {
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

function createPropertyFixture({ instanceColor = null } = {}) {
  const appearanceRuntime = new AppearanceRuntime();
  const scene = appearanceRuntime.normalizeScene({
    schemaVersion: 1,
    objects: [
      propertyObject("a", "#112233", instanceColor),
      propertyObject("b", "#445566", instanceColor)
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

export function runRuntimeTests(suites, requested = "all") {
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
        test();
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

function round(value) {
  return Math.round(value * 1000) / 1000;
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
