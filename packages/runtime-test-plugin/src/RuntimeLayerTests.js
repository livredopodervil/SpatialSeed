import * as THREE from "three";
import {
  ViewerState,
  EditorSession,
  SimulationClock,
  SimulationBridge
} from "../../runtime-layers/src/index.js";
import { AppearanceGraph } from "../../appearance-graph/src/index.js";
import { AppearanceRuntime } from "../../appearance-runtime/src/index.js";
import { Selection } from "../../editor-core/src/Selection.js";
import { classifyChanges } from "../../incremental-runtime/src/index.js";
import { ResourceAudit } from "../../resource-audit/src/index.js";
import { RefCountCache, textureKey } from "../../renderer-resource-cache/src/index.js";
import { BatchMaterialCache } from "../../batch-material-cache/src/index.js";
import { InstanceBatchIndex, InstanceBatchManager } from "../../instance-batches/src/index.js";
import { composeAffineOperations, affineCopies, composeTransform, decomposeTransform, eulerQuaternion } from "../../math-affine/src/index.js";
import { ProjectAppearanceAdapter } from "../../project-files/src/ProjectAppearanceAdapter.js";

export function createRuntimeLayerTests() {
  return {
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
      "gera dez mil transformações"() {
        const step=composeAffineOperations([
          {type:"move",value:[0.01,0,0]},
          {type:"rotate",value:[0,0,0.1]}
        ]);
        assertEqual(affineCopies({position:[0,0,0],rotation:[0,0,0,1],scale:[1,1,1]},10000,step).length,10000);
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

function round(value) {
  return Math.round(value * 1000) / 1000;
}
