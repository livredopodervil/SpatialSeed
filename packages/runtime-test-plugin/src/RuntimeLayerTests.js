import { EditorState } from "../../editor-core/src/EditorState.js?build=20260809-0053l";
import * as THREE from "three";
import {
  ObjectPickingService,
  PickingIdAllocator,
  decodePickingPixel,
  encodePickingId
} from "../../object-picking/src/index.js?build=20260805-0048l1";
import {
  SpatialSeedRuntime,
  RuntimeQueryRegistry,
  RuntimeEvents,
  RuntimeCapabilities,
  describeRuntimeProfiles,
  resolveRuntimeProfile
} from "../../runtime-api/src/index.js?build=20260718-0027h";
import {
  VIEWER_CAMERA_COMMANDS,
  CameraObjectService,
  ViewerCameraController,
  ViewerState,
  cameraSnapshot,
  normalizeNavigationCamera,
  normalizeCameraProjection,
  reduceNavigationCamera,
  EditorSession,
  SimulationClock,
  SimulationBridge
} from "../../runtime-layers/src/index.js?build=20260807-0051a";
import { AppearanceGraph } from "../../appearance-graph/src/index.js";
import { AppearanceRuntime } from "../../appearance-runtime/src/index.js";
import { Selection } from "../../editor-core/src/Selection.js";
import { Region } from "../../core/src/Region.js";
import { Sandbox } from "../../core/src/Sandbox.js?build=20260807-0052b";
import { classifyChanges } from "../../incremental-runtime/src/index.js";
import { ResourceAudit } from "../../resource-audit/src/index.js";
import {
  RefCountCache,
  textureKey,
  ThreeResourceCache
} from "../../renderer-resource-cache/src/index.js?build=20260731-0044b";
import {
  BatchMaterialCache,
  resolveViewerMaterial
} from "../../batch-material-cache/src/index.js";
import {
  normalizeViewerRenderSettings,
  viewerRenderPreset
} from "../../renderer-three/src/ViewerRenderSettings.js";
import {
  InstanceBatchIndex
} from "../../instance-batches/src/InstanceBatchIndex.js?build=20260713-0019g-c2";
import {
  InstanceBatch,
  updateAbsoluteInstanceColor
} from "../../instance-batches/src/InstanceBatch.js?build=20260729-0039g2";
import {
  InstanceBatchManager
} from "../../instance-batches/src/InstanceBatchManager.js?build=20260807-0051a";
import {
  HeterogeneousBatchManager
} from "../../renderer-three/src/HeterogeneousBatchManager.js?build=20260807-0051a";
import {
  createLocalBoundsScaleHandleSet,
  MeshEditVisibility,
  ReplicaRenderIndex,
  VisualCommitHandoff,
  matricesApproximatelyEqual,
  proportionalScaleFactor2D,
  resolveEditorOrbitEnabled,
  scaleFactorsForAxes,
  scaleWorldTrsWithoutShear,
  mirrorGeometryXInPlace,
  positiveInstanceMatrixForMirror
} from "../../renderer-three/src/index.js?build=20260810-0054f";
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
  translationMatrix,
  resolvePlacementFrame
} from "../../math-affine/src/index.js";
import {
  AnimationCommandService,
  AnimationRuntime,
  TemporalAnimationRuntime,
  compileAnimationProgram,
  compileAnimationTrackProgram,
  createAnimationEvaluator,
  createAnimationTrackEvaluator,
  resolveAnimationPreset
} from "../../animation-runtime/src/index.js?build=20260808-0053i";
import {
  composeAnimationOverlay,
  createAnimationTargetSnapshot,
  rebaseAnimationLayerInput
} from "../../renderer-three/src/index.js?build=20260808-0053i";
import {
  AnalyticTimeDomains,
  TemporalRuntime
} from "../../temporal-runtime/src/index.js?build=20260808-0053i";
import {
  compileAffineExpression,
  compileAffineProgram,
  evaluateAffineExpression,
  evaluateAffineProgram
} from "../../selection-operations/src/AffineProgram.js?build=20260729-0039g";
import {
  resolveAffineOperations,
  affineProgramCopies,
  composeAffineStep,
  affineCopies as affineRepeatCopies
} from "../../selection-operations/src/AffineRepeat.js?build=20260715-0021d";
import {
  SelectionOperations
} from "../../selection-operations/src/SelectionOperations.js?build=20260807-0052b";
import {
  explicitFamilyTransformAt,
  familyMemberResourcePath,
  normalizeExplicitInstanceFamily,
  packAnchoredExplicitInstanceFamily
} from "../../procedural-families/src/index.js?build=20260731-0044a";
import {
  appendStrokeToBundle,
  compactStrokeBundle,
  normalizeStrokeBundleDescriptor,
  replaceStrokePointInBundle,
  strokeBundleAnchorLocal,
  strokeBundleFromStroke,
  strokeBundleStrokes,
  StrokeCompactionScheduler,
  StrokeFusionService
} from "../../stroke-resources/src/index.js?build=20260802-0047g";
import {
  buildResourceTree,
  createVirtualResourceTree,
  parseResourcePath
} from "../../resource-tree/src/index.js?build=20260801-0045a1";
import { ProjectAppearanceAdapter } from "../../project-files/src/ProjectAppearanceAdapter.js";
import {
  ProjectValidator
} from "../../project-files/src/ProjectValidator.js?build=20260807-0052b";
import {
  ProjectSerializer
} from "../../project-files/src/ProjectSerializer.js?build=20260807-0052b";
import {
  ProjectService
} from "../../project-files/src/ProjectService.js?build=20260724-0029f";
import {
  BrowserSandboxIdentity,
  MemoryRecoveryStore,
  SandboxRecoveryController,
  createRecoveryRecord,
  validateRecoveryRecord
} from "../../project-recovery/src/index.js?build=20260725-0029f1";
import {
  CoordinatedSandbox,
  LocalProjectLaunchReceiver,
  LocalProjectLaunchSender,
  LocalAnimationCoordinator,
  LocalTransformPreviewCoordinator,
  LocalViewerCoordinator,
  LocalViewerSessionDirectory,
  createIndependentProjectUrl,
  createSharedViewerUrl
} from "../../local-viewers/src/index.js?build=20260729-0039g1";
import {
  boxRegionReducer
} from "../../region-box/src/index.js?build=20260809-0053m";
import {
  compactHierarchyRoots,
  instanceOccurrenceId,
  projectInstanceGraphScene,
  updateInstanceOccurrenceRoot
} from "../../instance-graph/src/index.js?build=20260809-0053k";
import {
  GeometryRegistry,
  classifyBufferRenderProfile,
  BoxGeometryProvider,
  SphereGeometryProvider,
  CylinderGeometryProvider,
  PlaneGeometryProvider,
  PolygonGeometryProvider,
  createDefaultGeometryRegistry
} from "../../geometry-registry/src/index.js?build=20260809-0053l";
import {
  normalizeHexColor,
  parsePropertyInput,
  createDefaultPropertyRegistry,
  resolveSelectionTargetIds,
  SelectionPropertyService
} from "../../property-registry/src/index.js?build=20260727-0037c";
import {
  DevConsole
} from "../../devtools/src/DevConsole.js?build=20260806-0050b";
import {
  ObjectInspector
} from "../../object-inspector/src/ObjectInspector.js?build=20260807-0051a";
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
} from "../../renderer-three/src/WorldTransformProjection.js?build=20260727-0037c";
import {
  SelectionOutlineBatch,
  benchmarkSelectionOutlines,
  selectionOutlineInstance
} from "../../renderer-three/src/SelectionOutlineBatch.js?build=20260718-0027g";
import {
  ScreenSelectionIndex,
  normalizeScreenSelectionGesture,
  screenSelectionGestureContains
} from "../../renderer-three/src/ScreenSelectionGesture.js?build=20260807-0052b";
import {
  ToolGestureNavigation
} from "../../renderer-three/src/ToolGestureNavigation.js?build=20260731-0043x1";
import {
  LocallyResolvedObjectHierarchy
} from "../../transform-hierarchy/src/index.js?build=20260809-0053l";
import {
  meshOperatorContract,
  prepareMeshPath
} from "../../mesh-operator-kernel/src/index.js?build=20260812-0054g";
import {
  MeshExchangeService,
  decodeStl,
  encodeAsciiStl,
  encodeBinaryStl
} from "../../mesh-exchange/src/index.js?build=20260812-0054md";
import {
  objectTriangleSoup
} from "../../mesh-exchange-three/src/index.js?build=20260812-0054md";
import {
  MeshEditController,
  MeshToolRegistry,
  applyMeshTopologyOperation,
  affineDeltaWorld,
  applyMeshDeformation,
  buildGeometricVertexIdentity,
  buildMeshTopology,
  createMeshInfluenceField,
  coincidentVertexGroups,
  constrainAffineValue,
  constrainWorldDeltaMatrix,
  composeRotationFrame,
  expandCoincidentSelection,
  geodesicVertexDistances,
  prepareMeshCommitDescriptor,
  recomputeLocalVertexNormals,
  recomputeVertexNormals,
  resolveTransformVertexSelection,
  selectedVertexPivotWorld,
  snapWorldPointToFrameGrid,
  transformLocalPositions,
  transformLocalPositionsInto,
  transformLocalPositionsWithInfluenceInto,
  topologyOf
} from "../../mesh-editor-core/src/index.js?build=20260809-0053l";
import {
  EditContextController,
  axesFromConstraint,
  constraintFromAxes,
  inclinePlanarFrame,
  planarFrameCoordinates,
  planarFrameFromPoints,
  planarFramePoint
} from "../../edit-context/src/index.js?build=20260809-0053l";
import {
  PlanarSketchController,
  createPlanarPrimitive
} from "../../planar-authoring/src/index.js?build=20260802-0047g";
import {
  ObjectPlacementController
} from "../../object-placement/src/index.js?build=20260809-0053m";
import {
  MeasurementController,
  formatMeasurementResult,
  measureAngle,
  measureDistance
} from "../../measurement-tools/src/index.js?build=20260730-0040e";
import {
  createEditorCommands
} from "../../editor-commands/src/EditorCommands.js?build=20260809-0053l";
import {
  LEGACY_TOOL_PREFERENCES_STORAGE_KEY,
  LEGACY_TOOL_PARAMETER_STORAGE_KEY,
  TOOL_PARAMETER_SCHEMA_VERSION,
  TOOL_PARAMETER_STORAGE_KEY,
  TOOL_PREFERENCES_SCHEMA_VERSION,
  TOOL_PREFERENCES_STORAGE_KEY,
  ToolLifecycleController,
  ToolParameterStore,
  createDefaultEditToolRegistry,
  createLegacyToolParameterMigration
} from "../../edit-tools/src/index.js?build=20260802-0047g";
import {
  deriveHudContext,
  geometryToolIcon,
  geometryToolPriority,
  normalizeHudDimensions
} from "../../edit-hud/src/index.js?build=20260809-0053l";
import {
  PathInstancePreviewCache,
  PathSketchController,
  PathToolService,
  SpatialReferenceResolver,
  compilePathBrushAffineModifier,
  compilePathBrushColorModifier,
  createSweepGeometryDescriptor,
  evaluatePathBrushAffineModifier,
  evaluatePathBrushColorModifier,
  invertHexColor,
  orderEdgeChain,
  rotationMinimizingFrames,
  samplePathFrames,
  samplePathFrameTailBySpacing,
  samplePathFramesBySpacing
} from "../../spatial-references/src/index.js?build=20260802-0047g";
import {
  WEB_APPLICATION_DEFINITION_VERSION,
  WEB_RUNTIME_EXTENSION_API_VERSION,
  activateWebRuntimeExtensions,
  BrowserProcedureCatalogStore,
  BrowserProjectFileGateway,
  PwaInstallController,
  formatBuildLabel,
  formatPwaBuildLabel,
  pwaUpdateAvailable,
  isPlatformBlock,
  loadWebApplicationDefinition,
  loadWebRuntimeExtensions,
  normalizeBuildInfo,
  normalizeWebApplicationDefinition,
  resolvePwaLocations,
  webApplicationName,
  workerBuild
} from "../../platform-web/src/index.js?build=20260809-0053l";
import {
  clampEditorFontSize,
  highlightProcedureSource,
  logicalLineCount
} from "../../procedure-editor/src/index.js";
import {
  SelectionMarquee,
  UiActionRegistry,
  UiRefreshCoordinator,
  createCommandPaletteEntries,
  formatConsoleEntry,
  formatRuntimeCommandForConsole,
  normalizeShortcutChord,
  rankCommandPaletteEntries
} from "../../ui-widgets/src/index.js?build=20260809-0053m";
import {
  normalizeUiConfiguration
} from "../../ui-config/src/index.js?build=20260720-0028c";
import { fnv1a64 } from "../../asset-store/src/index.js";
import {
  CAMERA_PLAN_COMMANDS,
  CameraPlanCommitService,
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
} from "../../experiment-runtime/src/index.js?build=20260802-0047b";
import {
  STARTER_EXPERIMENT_CATALOG_CONTRIBUTION_ID,
  starterExperimentDefinitions,
  starterExperimentModule
} from "../../experiment-plugin/src/index.js?build=20260802-0047b";
import {
  formatExperimentCommand,
  normalizeExperimentControlValue,
  summarizeExperimentPlan
} from "../../experiment-panel/src/index.js?build=20260718-0027f";
import {
  ModuleRegistry
} from "../../plugin-api/src/index.js?build=20260802-0047b";
import {
  createModuleRegistryTests
} from "./ModuleRegistryTests.js?build=20260802-0047b";
import {
  createToolCapabilityTests
} from "./ToolCapabilityTests.js?build=20260802-0047g";
import {
  BenchmarkRunner
} from "../../benchmarks/src/index.js?build=20260808-0053i";
import {
  createGameRuntimeTests
} from "./GameRuntimeTests.js?build=20260812-0054md";
import {
  createCharacterAnimationTests
} from "./CharacterAnimationTests.js?build=20260812-0054md";
import {
  createGameCollisionDebugOverlayTests
} from "./GameCollisionDebugOverlayTests.js?build=20260818-0054mr";

export function createRuntimeLayerTests() {
  return {
    "character-animation": createCharacterAnimationTests(),
    "game-collision-debug-overlay": createGameCollisionDebugOverlayTests(),
    "game-runtime": createGameRuntimeTests(),
    "module-v2": createModuleRegistryTests(),
    "tool-capabilities": createToolCapabilityTests(),
    "object-picking-contract": {
      "IDs são estáveis e o zero permanece reservado ao fundo"() {
        const allocator = new PickingIdAllocator();
        const first = allocator.idFor("object-a");
        assertEqual(first, allocator.idFor("object-a"));
        assertEqual(first > 0, true);
        assertEqual(allocator.objectFor(0), null);
        assertEqual(allocator.objectFor(first), "object-a");
      },

      "codificação RGB conserva os 24 bits do identificador"() {
        const id = 0x12ABEF;
        const color = encodePickingId(id);
        const pixel = color.map(value => Math.round(value * 255));
        assertEqual(decodePickingPixel(pixel), id);
      },

      "falha do backend solicita o raycast legado sem propagar exceção"() {
        const service = new ObjectPickingService({
          backend: {
            supported: true,
            pickAt() { throw new Error("context-lost"); }
          }
        });
        const result = service.pickAt({ clientX: 10, clientY: 20 });
        assertEqual(result.objectId, null);
        assertEqual(result.fallback, true);
        assertEqual(service.status().failures, 1);
      },

      "resultado público contém apenas identidade lógica"() {
        const service = new ObjectPickingService({
          backend: {
            supported: true,
            pickAt() {
              return { objectId: "logical-object", source: "gpu-id" };
            }
          }
        });
        const result = service.pickAt({ clientX: 1, clientY: 2 });
        assertEqual(result.objectId, "logical-object");
        assertEqual(result.source, "gpu-id");
        assertEqual(Object.hasOwn(result, "object3D"), false);
      },

      "miss de GPU permanece distinguível de falha"() {
        const service = new ObjectPickingService({
          backend: {
            supported: true,
            pickAt() {
              return {
                objectId: null,
                fallback: false,
                reason: "background",
                source: "gpu-id"
              };
            }
          }
        });
        const result = service.pickAt({ clientX: 1, clientY: 2 });
        assertEqual(result.objectId, null);
        assertEqual(result.fallback, false);
        assertEqual(result.reason, "background");
      }
    },

    "performance-baseline": {
      "benchmark compacto mede estrutura sem tocar a cena ativa"() {
        const runner = new BenchmarkRunner({
          reducer: boxRegionReducer,
          projectService: { validator: new ProjectValidator() }
        });
        const result = runner.runCompact({ samples: 1 });

        assertEqual(
          result.baselineVersion,
          "compact-runtime-baseline-v2-instance-graph"
        );
        assertEqual(result.structure.family.members, 10000);
        assertEqual(result.structure.instanceBatch.batches, 1);
        assertEqual(result.structure.instanceBatch.instances, 10000);
        assertEqual(result.structure.instanceBatch.matrixBytes, 640000);
        assertEqual(result.structure.strokes.strokes, 1000);
        assertEqual(result.structure.virtualPage.items, 25);
        assertEqual(result.structure.virtualPage.total, 10000);
        assertEqual(result.structure.virtualPage.descriptorsCreated, 25);
        assertEqual(result.structure.scene.objects, 10000);
        assertEqual(result.gates.applicable, true);
        assertEqual(result.gates.ok, true);
        assertEqual(result.gates.checks.every(check => check.ok), true);
        assertEqual(runner.list().length, 1);
      },

      "histórico compara somente medições compactas de escala idêntica"() {
        const runner = new BenchmarkRunner({
          reducer: boxRegionReducer,
          projectService: { validator: new ProjectValidator() }
        });
        const options = {
          instanceCount: 64,
          strokeCount: 16,
          sceneObjectCount: 64,
          transformCount: 8,
          pageSize: 8,
          samples: 1
        };
        runner.runCompact(options);
        runner.runCompact(options);
        const comparison = runner.compare();
        assertEqual(comparison.comparable, true);
        assertEqual(typeof comparison.gate.ok, "boolean");
        assertEqual(
          Object.values(comparison.metrics).every(metric =>
            Object.hasOwn(metric, "p95ChangePercent")
          ),
          true
        );
      },

      "console encaminha a mesma linha de base ao comando canônico"() {
        const calls = [];
        const console = new DevConsole({
          editor: { selection: new Selection() },
          sandbox: {},
          region: {},
          renderer: {},
          getDiagnostics: () => ({}),
          commands: {
            describe: () => [],
            execute(id, args) {
              calls.push({ id, args });
              return { ok: true };
            }
          }
        });
        const [entry] = console.execute("benchmark compact 10000 1000 5");

        assertEqual(entry.ok, true);
        assertDeepEqual(calls, [{
          id: "benchmark.compact",
          args: {
            instanceCount: 10000,
            strokeCount: 1000,
            sceneObjectCount: 10000,
            samples: 5
          }
        }]);
      }
    },

    "visual-commit-handoff": {
      "estado canônico anterior não substitui o preview confirmado"() {
        const handoff = new VisualCommitHandoff();
        const previous = identityMatrix();
        const expected = translationMatrix([4, -2, 1]);
        assertEqual(handoff.begin([{
          objectId: "moving",
          previousWorldMatrix: previous,
          expectedWorldMatrix: expected
        }]), 1);

        const stale = handoff.project("moving", previous);
        assertDeepEqual(stale, expected);
        assertEqual(handoff.status().staleSuppressed, 1);
        assertEqual(handoff.status().pending, 1);

        const acknowledged = handoff.project("moving", expected);
        assertDeepEqual(acknowledged, expected);
        assertEqual(handoff.status().acknowledged, 1);
        assertEqual(handoff.releaseAcknowledged(), 1);
        assertEqual(handoff.status().pending, 0);
      },

      "commits encadeados preservam somente o preview mais recente"() {
        const handoff = new VisualCommitHandoff();
        const initial = identityMatrix();
        const first = translationMatrix([1, 0, 0]);
        const second = translationMatrix([2, 0, 0]);
        handoff.begin([{
          objectId: "moving",
          previousWorldMatrix: initial,
          expectedWorldMatrix: first
        }]);
        handoff.begin([{
          objectId: "moving",
          previousWorldMatrix: first,
          expectedWorldMatrix: second
        }]);

        const firstAcknowledgement = handoff.project("moving", first);
        assertDeepEqual(firstAcknowledgement, second);
        assertEqual(handoff.status().staleSuppressed, 1);
        const secondAcknowledgement = handoff.project("moving", second);
        assertDeepEqual(secondAcknowledgement, second);
        assertEqual(handoff.status().acknowledged, 1);
        assertEqual(handoff.status().chained, 1);
      },

      "estado posterior conflitante prevalece sem bloquear sincronização"() {
        const handoff = new VisualCommitHandoff();
        const previous = identityMatrix();
        const expected = translationMatrix([1, 0, 0]);
        const newer = translationMatrix([3, 0, 0]);
        handoff.begin([{
          objectId: "moving",
          previousWorldMatrix: previous,
          expectedWorldMatrix: expected
        }]);

        const result = handoff.project("moving", newer);
        assertDeepEqual(result, newer);
        assertEqual(handoff.status().superseded, 1);
        assertEqual(handoff.status().pending, 0);
      },

      "rollback pré-dispatch preserva um handoff anterior encadeado"() {
        const handoff = new VisualCommitHandoff();
        const initial = identityMatrix();
        const first = translationMatrix([1, 0, 0]);
        const second = translationMatrix([2, 0, 0]);
        handoff.begin([{
          objectId: "moving",
          previousWorldMatrix: initial,
          expectedWorldMatrix: first
        }]);
        const transaction = handoff.beginTransaction([{
          objectId: "moving",
          previousWorldMatrix: first,
          expectedWorldMatrix: second
        }]);

        assertEqual(handoff.rollbackTransaction(transaction), 1);
        assertDeepEqual(handoff.project("moving", first), first);
        assertEqual(handoff.status().rolledBack, 1);
        assertEqual(handoff.status().acknowledged, 1);
      },

      "reconhecimento compara uma matriz por objeto sem percorrer vértices"() {
        const left = translationMatrix([2, 3, 4]);
        const right = [...left];
        right[12] += 1e-8;
        assertEqual(matricesApproximatelyEqual(left, right), true);
        right[12] += 1e-3;
        assertEqual(matricesApproximatelyEqual(left, right), false);
      }
    },

    "lights-materials": {
      "luz é criada como objeto persistente editável"() {
        const state = Object.freeze({ objects: Object.freeze([]) });
        const result = boxRegionReducer(state, {
          type: "light.create",
          id: "light-test",
          name: "Luz teste",
          position: [1, 2, 3],
          rotation: [0, 0, 0, 1],
          light: {
            type: "spot",
            color: "#88ccff",
            intensity: 4,
            distance: 20,
            decay: 2,
            angleDeg: 35,
            penumbra: 0.25,
            castShadow: true
          }
        });
        const light = result.state.objects[0];
        assertEqual(light.kind, "light");
        assertEqual(light.light.type, "spot");
        assertDeepEqual(light.position, [1, 2, 3]);
        assertEqual(light.light.color, "#88ccff");
      },

      "criação configurada interna material físico no mesmo objeto"() {
        const region = new Region(
          { id: "configured-material-region", type: "box-region" },
          { schemaVersion: 1, objects: [] }
        );
        const sandbox = new Sandbox(region, boxRegionReducer);
        const editor = new EditorState();
        const appearanceRuntime = new AppearanceRuntime();
        const operations = new SelectionOperations({
          editor,
          sandbox,
          regionId: region.id,
          geometryRegistry: createDefaultGeometryRegistry(),
          appearanceRuntime
        });
        const result = operations.createGeometry({
          geometry: { type: "box", size: [1, 1, 1], segments: [1, 1, 1] },
          material: {
            model: "physical",
            color: "#55aaff",
            opacity: 1,
            transparent: false,
            parameters: { roughness: 0.1, transmission: 0.8, ior: 1.45 }
          }
        });
        const object = sandbox.getSnapshot().objects.find(item => item.id === result.id);
        const material = appearanceRuntime.legacyMaterial(object.appearanceId);
        assertEqual(result.changed, true);
        assertEqual(material.model, "physical");
        assertEqual(material.color, "#55aaff");
        assertNear(material.parameters.transmission, 0.8);
        assertEqual(sandbox.getHistoryDiagnostics().commandCount, 1);
      },

      "registro expõe luzes e materiais físicos sem misturar escopos"() {
        const registry = createDefaultPropertyRegistry();
        const light = {
          id: "light-test",
          kind: "light",
          light: { type: "point", color: "#ffffff", intensity: 3 }
        };
        const mesh = { id: "mesh-test", kind: "box" };
        assertEqual(registry.require("light.intensity").supports(light), true);
        assertEqual(registry.require("light.intensity").supports(mesh), false);
        assertEqual(registry.require("appearance.roughness").supports(mesh), true);
        assertEqual(registry.require("appearance.roughness").supports(light), false);
        assertDeepEqual(resolveSelectionTargetIds({
          selection: { members: [{ objectId: mesh.id }, { objectId: light.id }] },
          state: { objects: [mesh, light] },
          targetScope: "renderables"
        }), [mesh.id]);
      }
    },

    "edit-context": {
      "pivô padrão acompanha o centro dos limites da seleção"() {
        const editor = new EditorState();
        assertEqual(editor.snapshot().pivot.policy, "bounds");
        assertEqual(editor.selection.snapshot().pivotPolicy, "bounds");
      },

      "checkboxes de eixo produzem restrições ortogonais"() {
        assertEqual(constraintFromAxes({ x: true, y: true, z: true }), "free");
        assertEqual(constraintFromAxes({ x: true, y: false, z: true }), "xz");
        assertEqual(constraintFromAxes({ x: false, y: false, z: false }), "none");
        assertDeepEqual(axesFromConstraint("yz"), { x: false, y: true, z: true });
      },

      "contexto alterna objeto e componentes pela mesma autoridade"() {
        const fixture = createEditContextFixture();
        const context = new EditContextController(fixture);
        assertEqual(context.status().subjectLevel, "object");
        context.setSubjectLevel("edge");
        assertEqual(fixture.meshEditor.active, true);
        assertEqual(fixture.meshEditor.status().componentMode, "edge");
        assertEqual(context.status().subjectLevel, "edge");
        assertThrowsMessage(
          () => context.setSubjectLevel("object"),
          "Aplique ou cancele a edição de malha antes de retornar ao modo objeto."
        );
        fixture.meshEditor.cancel();
        assertEqual(context.status().subjectLevel, "object");
        context.dispose();
      },

      "entrada em componentes reativa a última transformação"() {
        const fixture = createEditContextFixture();
        const context = new EditContextController(fixture);
        context.setTool("rotate");
        context.setTool("select");
        context.setSubjectLevel("vertex");
        assertEqual(context.status().tool, "rotate");
        assertEqual(fixture.editor.snapshot().tool.transformMode, "rotate");
        context.dispose();
      },

      "snap aceita combinação simultânea de vértice e face"() {
        const fixture = createEditContextFixture();
        const context = new EditContextController(fixture);
        context.setSubjectLevel("vertex");
        context.setSnap({
          enabled: true,
          auto: false,
          vertex: true,
          edge: false,
          face: true
        });
        assertDeepEqual(fixture.meshEditor.status().snap.modes, ["vertex", "face"]);
        assertEqual(fixture.meshEditor.status().snap.enabled, true);
        context.dispose();
      },

      "grade e ângulo compartilham passos explícitos em 2D e 3D"() {
        const fixture = createEditContextFixture();
        const context = new EditContextController(fixture);
        context.setSnap({
          enabled: true,
          grid: true,
          angle: true,
          gridStep: 0.25,
          angleStepDegrees: 15
        });
        const status = context.status();
        assertNear(status.snap.gridStep, 0.25);
        assertNear(status.snap.angleStepDegrees, 15);
        assertEqual(status.snap.angle, true);
        assertNear(fixture.renderer.transformConfig.translationSnap, 0.25);
        assertNear(fixture.renderer.transformConfig.rotationSnapDeg, 15);
        assertEqual(fixture.renderer.transformConfig.gridLock, true);
        context.dispose();
      },

      "travas de plano e ponto permanecem locais ao viewer"() {
        const fixture = createEditContextFixture();
        const context = new EditContextController(fixture);
        context.togglePlaneLock({ source: "world-xy" });
        context.togglePointLock({ point: [2, 3, 4], source: "explicit" });
        const status = context.status();
        assertDeepEqual(status.planeLock.normal, [0, 0, 1]);
        assertDeepEqual(status.pointLock.point, [2, 3, 4]);
        context.clearNavigationLocks();
        assertEqual(context.status().planeLock, null);
        assertEqual(context.status().pointLock, null);
        context.dispose();
      },

      "plano de edição permanece independente da visualização"() {
        const fixture = createEditContextFixture();
        const context = new EditContextController(fixture);
        context.togglePlaneLock({ source: "world-xy" });
        context.setEditPlane({ source: "world-yz" });
        const status = context.status();
        assertDeepEqual(status.planeLock.normal, [0, 0, 1]);
        assertDeepEqual(status.editPlane.normal, [1, 0, 0]);
        assertEqual(status.navigationMode, "plane-2d");
        context.clearEditPlane();
        assertEqual(context.status().editPlane, null);
        assertDeepEqual(context.status().planeLock.normal, [0, 0, 1]);
        context.dispose();
      },

      "edição e desenho compartilham um único plano ativo"() {
        const fixture = createEditContextFixture();
        const context = new EditContextController(fixture);
        context.togglePlaneLock({ source: "world-xy" });
        context.setEditPlane({ source: "world-yz" });
        let status = context.status();
        assertDeepEqual(status.editPlane.normal, [1, 0, 0]);
        assertDeepEqual(status.drawingPlane.normal, [1, 0, 0]);
        assertDeepEqual(status.authoringPlane.normal, [1, 0, 0]);
        context.setDrawingPlane({ source: "world-xz" });
        status = context.status();
        assertDeepEqual(status.editPlane.normal, [0, 1, 0]);
        assertDeepEqual(status.drawingPlane.normal, [0, 1, 0]);
        context.clearDrawingPlane();
        assertEqual(context.status().editPlane, null);
        assertEqual(context.status().drawingPlane, null);
        context.dispose();
      },

      "plano por três pontos produz base ortonormal e ida e volta"() {
        const frame = planarFrameFromPoints([
          [2, 3, 4],
          [4, 3, 4],
          [2, 6, 4]
        ]);
        assertVectorNear(frame.origin, [2, 3, 4]);
        assertVectorNear(frame.xAxis, [1, 0, 0]);
        assertVectorNear(frame.yAxis, [0, 1, 0]);
        assertVectorNear(frame.normal, [0, 0, 1]);
        const world = planarFramePoint(frame, [1.5, -2, 0]);
        assertVectorNear(world, [3.5, 1, 4]);
        assertVectorNear(
          planarFrameCoordinates(frame, world),
          [1.5, -2, 0]
        );
      },

      "inclinação preserva origem e aplica azimute no frame do objeto"() {
        const frame = inclinePlanarFrame({
          origin: [4, 5, 6],
          xAxis: [1, 0, 0],
          normal: [0, 0, 1]
        }, {
          inclinationDegrees: 30,
          azimuthDegrees: 0
        });
        assertVectorNear(frame.origin, [4, 5, 6]);
        assertVectorNear(
          frame.xAxis,
          [Math.cos(Math.PI / 6), 0, Math.sin(Math.PI / 6)]
        );
        assertVectorNear(
          frame.normal,
          [-Math.sin(Math.PI / 6), 0, Math.cos(Math.PI / 6)]
        );
        assertEqual(frame.source.type, "object-inclination");
      },

      "controlador resolve objeto inclinado e três seleções sem misturar planos"() {
        const fixture = createEditContextFixture();
        fixture.renderer.readSelectionReferenceFrame = () => ({
          origin: [3, 4, 5],
          xAxis: [1, 0, 0],
          normal: [0, 0, 1],
          source: { type: "object", objectId: "base" }
        });
        fixture.renderer.readSelectionReferencePoints = () => [
          [0, 0, 7],
          [2, 0, 7],
          [0, 3, 7]
        ];
        const context = new EditContextController(fixture);
        context.setEditPlane({
          source: "object-inclination",
          inclinationDegrees: 45,
          azimuthDegrees: 90
        });
        context.setDrawingPlane({ source: "three-points" });
        assertVectorNear(context.status().editPlane.normal, [0, 0, 1]);
        assertVectorNear(context.status().drawingPlane.normal, [0, 0, 1]);
        assertVectorNear(context.status().authoringPlane.origin, [0, 0, 7]);
        context.dispose();
      },

      "ciclo de ferramenta memoriza e repete comando normalizado"() {
        const fixture = createEditContextFixture();
        const calls = [];
        const lifecycle = new ToolLifecycleController({
          editor: fixture.editor,
          storage: createMemoryStorage()
        });
        lifecycle.attachExecute((id, args) => {
          calls.push({ id, args: structuredClone(args) });
          return { changed: true };
        });
        lifecycle.observeExecution({
          id: "selection.translate",
          args: { delta: [1, 2, 3] },
          result: { changed: true },
          metadata: { repeatable: true, label: "Mover seleção" }
        });
        assertEqual(lifecycle.status().canRepeat, true);
        assertEqual(lifecycle.status().lastRepeatable.label, "Mover seleção");
        const repeated = lifecycle.repeat();
        assertEqual(repeated.repeated, true);
        assertDeepEqual(calls, [{
          id: "selection.translate",
          args: { delta: [1, 2, 3] }
        }]);
        lifecycle.dispose();
      },

      "ciclo adia duplicate e prioriza a repetição matricial"() {
        const fixture = createEditContextFixture();
        const calls = [];
        const lifecycle = new ToolLifecycleController({
          editor: fixture.editor,
          storage: createMemoryStorage()
        });
        lifecycle.attachExecute((id, args) => {
          calls.push({ id, args: structuredClone(args) });
          return { changed: true };
        });
        lifecycle.observeExecution({
          id: "selection.duplicate",
          args: {},
          result: { changed: true, repeatDeferred: true },
          metadata: { repeatable: true, label: "Duplicar" }
        });
        assertEqual(lifecycle.status().canRepeat, false);

        lifecycle.observeExecution({
          id: "selection.translate",
          args: { delta: [1, 0, 0] },
          result: {
            changed: true,
            repeatCommand: {
              id: "selection.repeat",
              args: { count: 2 },
              label: "Repetir transformação"
            }
          },
          metadata: { repeatable: true, label: "Mover seleção" }
        });

        assertEqual(
          lifecycle.status().lastRepeatable.id,
          "selection.repeat"
        );
        lifecycle.repeat();
        assertDeepEqual(calls, [{
          id: "selection.repeat",
          args: { count: 2 }
        }]);
        lifecycle.dispose();
      },

      "continuidade é configurada separadamente por ferramenta"() {
        const fixture = createEditContextFixture();
        const lifecycle = new ToolLifecycleController({
          editor: fixture.editor,
          storage: createMemoryStorage()
        });
        lifecycle.activateAction("object.place");
        lifecycle.setKeepActive(false);
        assertEqual(lifecycle.keepActive("object.place"), false);
        assertEqual(lifecycle.keepActive("path.sketch"), true);
        lifecycle.completeAction("object.place");
        assertEqual(lifecycle.status().activeAction, null);
        lifecycle.activateAction("path.sketch");
        assertEqual(lifecycle.status().keepActive, true);
        lifecycle.completeAction("path.sketch");
        assertEqual(lifecycle.status().activeAction, "path.sketch");
        lifecycle.cancelAction();
        lifecycle.dispose();
      },

      "configuração sem alvo explícito segue a ferramenta corrente"() {
        const fixture = createEditContextFixture();
        const lifecycle = new ToolLifecycleController({
          editor: fixture.editor,
          storage: createMemoryStorage()
        });
        fixture.renderer.setTransformMode("rotate");
        lifecycle.setKeepActive(false);
        assertEqual(lifecycle.status().toolId, "rotate");
        assertEqual(lifecycle.status().keepActive, false);
        assertEqual(lifecycle.keepActive("object.place"), false);
        assertEqual(lifecycle.keepActive("path.sketch"), true);
        lifecycle.dispose();
      },

      "preferências de continuidade sobrevivem à recarga"() {
        const fixture = createEditContextFixture();
        const storage = createMemoryStorage();
        const first = new ToolLifecycleController({
          editor: fixture.editor,
          storage
        });
        first.setKeepActive(false, { toolId: "object.place" });
        first.setKeepActive(true, { toolId: "path.sketch" });
        first.dispose();

        const restored = new ToolLifecycleController({
          editor: fixture.editor,
          storage
        });
        assertEqual(restored.keepActive("object.place"), false);
        assertEqual(restored.keepActive("path.sketch"), true);
        const persisted = JSON.parse(
          storage.getItem(TOOL_PREFERENCES_STORAGE_KEY)
        );
        assertEqual(
          persisted.schemaVersion,
          TOOL_PREFERENCES_SCHEMA_VERSION
        );
        restored.dispose();
      },

      "preferências v1 migram sem apagar o registro legado"() {
        const fixture = createEditContextFixture();
        const legacyValue = JSON.stringify({
          defaultKeepActive: false,
          keepByTool: {
            "object.place": false,
            "path.sketch": true
          }
        });
        const storage = createMemoryStorage({
          [LEGACY_TOOL_PREFERENCES_STORAGE_KEY]: legacyValue
        });
        const migrated = new ToolLifecycleController({
          editor: fixture.editor,
          storage
        });
        assertEqual(migrated.keepActive("object.place"), false);
        assertEqual(migrated.keepActive("path.sketch"), true);
        assertEqual(
          JSON.parse(storage.getItem(TOOL_PREFERENCES_STORAGE_KEY)).schemaVersion,
          TOOL_PREFERENCES_SCHEMA_VERSION
        );
        assertEqual(
          storage.getItem(LEGACY_TOOL_PREFERENCES_STORAGE_KEY),
          legacyValue
        );
        migrated.dispose();

        storage.setItem(LEGACY_TOOL_PREFERENCES_STORAGE_KEY, JSON.stringify({
          defaultKeepActive: true,
          keepByTool: {
            "object.place": true,
            "path.sketch": false
          }
        }));
        const restored = new ToolLifecycleController({
          editor: fixture.editor,
          storage
        });
        assertEqual(restored.keepActive("object.place"), false);
        assertEqual(restored.keepActive("path.sketch"), true);
        restored.dispose();
      },

      "versão futura permanece intacta e não é interpretada"() {
        const fixture = createEditContextFixture();
        const futureValue = JSON.stringify({
          schemaVersion: TOOL_PREFERENCES_SCHEMA_VERSION + 1,
          defaultKeepActive: false,
          keepByTool: {
            "object.place": false,
            "path.sketch": false
          }
        });
        const storage = createMemoryStorage({
          [TOOL_PREFERENCES_STORAGE_KEY]: futureValue,
          [LEGACY_TOOL_PREFERENCES_STORAGE_KEY]: JSON.stringify({
            defaultKeepActive: false,
            keepByTool: {
              "object.place": false,
              "path.sketch": false
            }
          })
        });
        const lifecycle = new ToolLifecycleController({
          editor: fixture.editor,
          storage
        });
        assertEqual(lifecycle.keepActive("object.place"), false);
        assertEqual(lifecycle.keepActive("path.sketch"), true);
        assertEqual(
          storage.getItem(TOOL_PREFERENCES_STORAGE_KEY),
          futureValue
        );
        lifecycle.dispose();
      },

      "comando de continuidade atualiza somente a sessão alvo"() {
        const fixture = createEditContextFixture();
        const lifecycle = new ToolLifecycleController({
          editor: fixture.editor,
          storage: createMemoryStorage()
        });
        const placementValues = [];
        const sketchValues = [];
        const objectPlacement = {
          active: true,
          setContinuous(value) {
            placementValues.push(Boolean(value));
          }
        };
        const pathSketch = {
          status() {
            return { active: true };
          },
          setContinuous(value) {
            sketchValues.push(Boolean(value));
          }
        };
        const commands = createEditorCommands({
          editor: fixture.editor,
          renderer: fixture.renderer,
          selectionOperations: {},
          projectService: {},
          benchmarkRunner: {},
          resourceAudit: {},
          toolLifecycle: lifecycle,
          objectPlacement,
          pathSketch
        });

        lifecycle.activateAction("object.place");
        commands.execute("edit.tool.keep.set", { enabled: false });
        assertDeepEqual(placementValues, [false]);
        assertDeepEqual(sketchValues, []);
        assertEqual(lifecycle.keepActive("object.place"), false);
        assertEqual(lifecycle.keepActive("path.sketch"), true);

        commands.execute("edit.tool.keep.set", {
          enabled: false,
          toolId: "path.sketch"
        });
        assertDeepEqual(placementValues, [false]);
        assertDeepEqual(sketchValues, [false]);
        assertEqual(lifecycle.keepActive("object.place"), false);
        assertEqual(lifecycle.keepActive("path.sketch"), false);
        lifecycle.dispose();
      },

      "ferramentas interativas se excluem e o mesmo ícone desarma"() {
        const fixture = createEditContextFixture();
        const lifecycle = new ToolLifecycleController({
          editor: fixture.editor,
          storage: createMemoryStorage()
        });
        const calls = [];
        let placementActive = true;
        let placementGeometry = { type: "box", size: [1, 1, 1] };
        let pathActive = false;
        let planarActive = false;
        const objectPlacement = {
          get active() { return placementActive; },
          status() {
            return { active: placementActive, settings: { geometry: placementGeometry } };
          },
          cancel() { placementActive = false; calls.push("placement.cancel"); return {}; },
          begin(args) {
            placementActive = true;
            placementGeometry = args.geometry;
            calls.push("placement.begin");
            return { active: true };
          }
        };
        const pathSketch = {
          status() { return { active: pathActive }; },
          cancel() { pathActive = false; calls.push("path.cancel"); return {}; },
          begin() { pathActive = true; calls.push("path.begin"); return { active: true }; }
        };
        const planarSketch = {
          status() { return { active: planarActive, mode: "polyline" }; },
          cancel() { planarActive = false; calls.push("planar.cancel"); return {}; },
          begin() { planarActive = true; calls.push("planar.begin"); return { active: true }; }
        };
        const commands = createEditorCommands({
          editor: fixture.editor,
          renderer: fixture.renderer,
          selectionOperations: {},
          projectService: {},
          benchmarkRunner: {},
          resourceAudit: {},
          toolLifecycle: lifecycle,
          objectPlacement,
          pathSketch,
          planarSketch
        });

        commands.execute("path.sketch.begin", {});
        assertDeepEqual(calls, ["placement.cancel", "path.begin"]);
        assertEqual(pathActive, true);
        commands.execute("object.placement.begin", {
          geometry: { type: "sphere", radius: 1 }
        });
        assertDeepEqual(calls, [
          "placement.cancel", "path.begin", "path.cancel", "placement.begin"
        ]);
        const toggled = commands.execute("object.placement.begin", {
          geometry: { type: "sphere", radius: 1 }
        });
        assertEqual(toggled.toggledOff, true);
        assertEqual(placementActive, false);
        lifecycle.dispose();
      },

      "mudança da seleção atualiza imediatamente o contexto do HUD"() {
        const fixture = createEditContextFixture();
        const context = new EditContextController(fixture);
        let notifications = 0;
        const unsubscribe = context.subscribe(() => { notifications += 1; });
        const baseline = notifications;
        fixture.editor.selection.replace({
          kind: "object",
          regionId: "edit-context",
          objectId: "selected-object"
        });
        assertEqual(notifications > baseline, true);
        unsubscribe();
        context.dispose();
      },

      "mudança de ferramenta emite um único contexto observável"() {
        const fixture = createEditContextFixture();
        const lifecycle = new ToolLifecycleController({
          editor: fixture.editor,
          storage: createMemoryStorage()
        });
        const context = new EditContextController({
          ...fixture,
          toolLifecycle: lifecycle
        });
        let notifications = 0;
        const unsubscribe = context.subscribe(() => {
          notifications += 1;
        });
        context.setTool("rotate");
        assertEqual(notifications, 2);
        assertEqual(context.status().tool, "rotate");
        unsubscribe();
        context.dispose();
        lifecycle.dispose();
      }
    },

    "planar-authoring": {
      "primitivas 2D usam descritores registrados e o frame capturado"() {
        const frame = planarFrameFromPoints([
          [0, 0, 2],
          [1, 0, 2],
          [0, 1, 2]
        ]);
        const registry = createDefaultGeometryRegistry();
        const cases = [
          {
            mode: "point",
            points: [[1, 2, 2]],
            settings: { strokeWidth: 0.2 },
            type: "circle"
          },
          {
            mode: "line",
            points: [[0, 0, 2], [2, 0, 2]],
            settings: {},
            type: "tube"
          },
          {
            mode: "polyline",
            points: [[0, 0, 2], [1, 1, 2], [2, 0, 2]],
            settings: { closed: true },
            type: "tube"
          },
          {
            mode: "rectangle",
            points: [[0, 0, 2], [2, 1, 2]],
            settings: { style: "fill" },
            type: "plane"
          },
          {
            mode: "circle",
            points: [[0, 0, 2], [2, 0, 2]],
            settings: { style: "stroke" },
            type: "ring"
          },
          {
            mode: "arc",
            points: [[0, 0, 2], [2, 0, 2]],
            settings: { arcAngleDegrees: -120 },
            type: "ring"
          },
          {
            mode: "polygon",
            points: [[0, 0, 2], [2, 0, 2]],
            settings: { style: "fill", sides: 7 },
            type: "polygon"
          }
        ];
        const sketches = new Map();
        for (const entry of cases) {
          const plan = createPlanarPrimitive({
            frame,
            points: entry.points,
            settings: { mode: entry.mode, ...entry.settings }
          });
          assertEqual(plan.geometry.type, entry.type);
          assertEqual(registry.normalize(plan.geometry).type, entry.type);
          assertNear(plan.position[2], 2);
          assertVectorNear(plan.rotation, frame.quaternion);
          assertEqual(Boolean(plan.sketch?.descriptorVersion), true);
          sketches.set(entry.mode, plan.sketch);
        }
        assertEqual(sketches.get("circle").roles.includes("profile"), true);
        assertEqual(sketches.get("polygon").roles.includes("profile"), true);
        assertEqual(sketches.get("rectangle").roles.includes("boundary"), true);
        assertEqual(sketches.get("arc").roles.includes("profile"), false);
        assertEqual(sketches.get("line").roles.includes("path"), true);
      },

      "retângulo preserva centro e dimensões no plano local"() {
        const frame = planarFrameFromPoints([
          [10, 20, 30],
          [10, 21, 30],
          [9, 20, 30]
        ]);
        const plan = createPlanarPrimitive({
          frame,
          points: [
            planarFramePoint(frame, [-2, -1, 0]),
            planarFramePoint(frame, [4, 3, 0])
          ],
          settings: {
            mode: "rectangle",
            style: "fill"
          }
        });
        assertNear(plan.geometry.width, 6);
        assertNear(plan.geometry.height, 4);
        assertVectorNear(
          planarFrameCoordinates(frame, plan.position),
          [1, 1, 0]
        );
      },

      "retângulo contornado preserva o mesmo esboço do preenchido"() {
        const frame = planarFrameFromPoints([
          [10, 20, 30],
          [10, 21, 30],
          [9, 20, 30]
        ]);
        const plan = createPlanarPrimitive({
          frame,
          points: [
            planarFramePoint(frame, [-2, -1, 0]),
            planarFramePoint(frame, [4, 3, 0])
          ],
          settings: {
            mode: "rectangle",
            style: "stroke"
          }
        });

        assertEqual(plan.geometry.type, "tube");
        assertDeepEqual(plan.sketch.points, [
          [-3, -2],
          [3, -2],
          [3, 2],
          [-3, 2]
        ]);
        assertNear(plan.sketch.primitive.width, 6);
        assertNear(plan.sketch.primitive.height, 4);
        assertEqual(plan.sketch.roles.includes("profile"), true);
        assertEqual(plan.sketch.roles.includes("boundary"), true);
      },

      "gesto 2D publica uma vez e rearma sem varrer a cena"() {
        const renderer = createPathSketchRendererStub();
        const calls = [];
        const completed = [];
        const controller = new PlanarSketchController({
          renderer,
          geometryRegistry: createDefaultGeometryRegistry(),
          createObject(args) {
            calls.push(structuredClone(args));
            return { changed: true, id: `planar-${calls.length}` };
          },
          onCompleted(value) {
            completed.push(structuredClone(value));
          }
        });
        controller.begin({
          mode: "line",
          planeSource: "viewer",
          continuous: true
        });
        renderer.canvas.emit(
          "pointerdown",
          pathPointerEvent(12, 10, 20)
        );
        renderer.canvas.emit(
          "pointerup",
          pathPointerEvent(12, 40, 20)
        );
        assertEqual(calls.length, 1);
        assertEqual(calls[0].geometry.type, "tube");
        assertEqual(calls[0].sketch.roles.includes("path"), true);
        assertEqual(completed.length, 1);
        assertEqual(controller.status().active, true);
        assertEqual(controller.status().pointCount, 0);
        controller.dispose();
      },

      "segundo toque cancela o rascunho 2D sem publicar geometria"() {
        const renderer = createPathSketchRendererStub();
        const calls = [];
        const controller = new PlanarSketchController({
          renderer,
          geometryRegistry: createDefaultGeometryRegistry(),
          createObject(args) {
            calls.push(structuredClone(args));
            return { changed: true, id: `planar-${calls.length}` };
          }
        });
        controller.begin({
          mode: "line",
          planeSource: "viewer",
          continuous: true
        });
        renderer.canvas.emit(
          "pointerdown",
          pathPointerEvent(21, 10, 20, { pointerType: "touch" })
        );
        renderer.canvas.emit(
          "pointerdown",
          pathPointerEvent(22, 40, 30, { pointerType: "touch" })
        );
        renderer.canvas.emit(
          "pointerup",
          pathPointerEvent(21, 12, 22, { pointerType: "touch" })
        );
        renderer.canvas.emit(
          "pointerup",
          pathPointerEvent(22, 42, 32, { pointerType: "touch" })
        );
        assertEqual(calls.length, 0);
        assertEqual(controller.status().active, true);
        assertEqual(controller.status().pointCount, 0);
        controller.dispose();
      }
    },

    "object-placement": {
      "segundo toque navega sem criar o objeto apontado"() {
        const renderer = createPathSketchRendererStub();
        const calls = [];
        const controller = new ObjectPlacementController({
          renderer,
          geometryRegistry: createDefaultGeometryRegistry(),
          createObject(args) {
            calls.push(structuredClone(args));
            return { changed: true, id: `placed-${calls.length}` };
          }
        });
        controller.begin({
          geometry: {
            type: "box",
            size: [1, 1, 1],
            segments: [1, 1, 1]
          },
          continuous: true
        });
        renderer.canvas.emit(
          "pointerdown",
          pathPointerEvent(25, 10, 20, { pointerType: "touch" })
        );
        renderer.canvas.emit(
          "pointerdown",
          pathPointerEvent(26, 40, 30, { pointerType: "touch" })
        );
        renderer.canvas.emit(
          "pointerup",
          pathPointerEvent(25, 12, 22, { pointerType: "touch" })
        );
        renderer.canvas.emit(
          "pointerup",
          pathPointerEvent(26, 42, 32, { pointerType: "touch" })
        );
        assertEqual(calls.length, 0);
        renderer.canvas.emit(
          "pointerdown",
          pathPointerEvent(27, 20, 30)
        );
        renderer.canvas.emit(
          "pointerup",
          pathPointerEvent(27, 30, 40)
        );
        assertEqual(calls.length, 1);
        controller.dispose();
      },

      "arrasto escala a primitiva a partir do ponto inicial"() {
        const renderer = createPathSketchRendererStub();
        const calls = [];
        const controller = new ObjectPlacementController({
          renderer,
          geometryRegistry: createDefaultGeometryRegistry(),
          createObject(args) {
            calls.push(structuredClone(args));
            return { changed: true, id: `placed-${calls.length}` };
          }
        });
        controller.begin({
          geometry: {
            type: "box",
            size: [1, 1, 1],
            segments: [1, 1, 1]
          },
          continuous: true
        });
        renderer.canvas.emit("pointerdown", pathPointerEvent(1, 10, 10));
        renderer.canvas.emit("pointermove", pathPointerEvent(1, 30, 10));
        assertVectorNear(controller.status().placement.position, [1, 1, 0]);
        assertVectorNear(controller.status().placement.scale, [4, 4, 4]);
        renderer.canvas.emit("pointerup", pathPointerEvent(1, 30, 10));
        assertEqual(calls.length, 1);
        assertVectorNear(calls[0].position, [1, 1, 0]);
        assertVectorNear(calls[0].scale, [4, 4, 4]);

        renderer.canvas.emit("pointerdown", pathPointerEvent(2, 40, 20));
        renderer.canvas.emit("pointerup", pathPointerEvent(2, 40, 20));
        assertVectorNear(calls[1].scale, [1, 1, 1]);
        controller.dispose();
      },

      "escala da inserção atravessa comando e reducer"() {
        const region = new Region(
          { id: "placement-scale", name: "Placement", type: "box-region" },
          { schemaVersion: 1, objects: [] }
        );
        const sandbox = new Sandbox(region, boxRegionReducer);
        const operations = new SelectionOperations({
          editor: new EditorState(),
          sandbox,
          regionId: region.descriptor.id,
          geometryRegistry: createDefaultGeometryRegistry(),
          appearanceRuntime: new AppearanceRuntime()
        });
        const result = operations.createGeometry({
          geometry: {
            type: "box",
            size: [1, 1, 1],
            segments: [1, 1, 1]
          },
          scale: [3, 3, 3]
        });
        assertEqual(result.changed, true);
        assertVectorNear(sandbox.getObject(result.id).scale, [3, 3, 3]);
        operations.dispose();
      }
    },

    "measurement-tools": {
      "régua e transferidor calculam resultados locais determinísticos"() {
        const distance = measureDistance([0, 0, 0], [3, 4, 0]);
        const angle = measureAngle(
          [0, 0, 0],
          [2, 0, 0],
          [0, 3, 0]
        );
        assertNear(distance.distance, 5);
        assertDeepEqual(distance.delta, [3, 4, 0]);
        assertNear(angle.angleDegrees, 90);
        assertEqual(formatMeasurementResult(angle), "90°");
      },

      "régua permanece local ao viewer e segundo toque não confirma"() {
        const renderer = createPathSketchRendererStub();
        const controller = new MeasurementController({ renderer });
        controller.begin({ mode: "ruler" });
        renderer.canvas.emit(
          "pointerdown",
          pathPointerEvent(31, 0, 0)
        );
        renderer.canvas.emit(
          "pointerup",
          pathPointerEvent(31, 30, 40)
        );
        assertNear(controller.status().result.distance, 5);
        controller.clear();
        renderer.canvas.emit(
          "pointerdown",
          pathPointerEvent(32, 10, 10, { pointerType: "touch" })
        );
        renderer.canvas.emit(
          "pointerdown",
          pathPointerEvent(33, 30, 30, { pointerType: "touch" })
        );
        renderer.canvas.emit(
          "pointerup",
          pathPointerEvent(32, 10, 10, { pointerType: "touch" })
        );
        renderer.canvas.emit(
          "pointerup",
          pathPointerEvent(33, 30, 30, { pointerType: "touch" })
        );
        assertEqual(controller.status().result, null);
        assertEqual(controller.status().pointCount, 0);
        controller.dispose();
      },

      "dois dedos navegam e três orbitam o foco durante ferramenta"() {
        const canvas = createPointerCanvasFixture();
        const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 1000);
        camera.position.set(0, 0, 10);
        const orbit = {
          enabled: false,
          target: new THREE.Vector3(0, 0, 0),
          touches: {
            ONE: THREE.TOUCH.ROTATE,
            TWO: THREE.TOUCH.DOLLY_ROTATE
          },
          enableRotate: true,
          minPolarAngle: 0,
          maxPolarAngle: Math.PI,
          update() {}
        };
        const navigation = new ToolGestureNavigation({
          canvas,
          orbit,
          camera
        });
        const original = {
          enabled: orbit.enabled,
          one: orbit.touches.ONE,
          two: orbit.touches.TWO
        };
        const token = navigation.acquire("test");
        canvas.emit("pointerdown", touchPointer(1, 10, 10));
        assertEqual(navigation.status().mode, "tool");
        canvas.emit("pointerdown", touchPointer(2, 30, 10));
        assertEqual(navigation.status().mode, "pan-zoom");
        canvas.emit("pointerdown", touchPointer(3, 20, 30));
        const before = camera.position.toArray();
        canvas.emit("pointermove", touchPointer(3, 40, 40));
        assertEqual(navigation.status().mode, "orbit");
        assertEqual(
          before.some((value, index) =>
            Math.abs(value - camera.position.toArray()[index]) > 1e-8
          ),
          true
        );
        navigation.release(token);
        assertEqual(orbit.enabled, original.enabled);
        assertEqual(orbit.touches.ONE, original.one);
        assertEqual(orbit.touches.TWO, original.two);
        navigation.dispose();
      },

      "arraste do gizmo prevalece sobre navegação auxiliar de mouse e touch"() {
        assertEqual(resolveEditorOrbitEnabled({
          toolGestureNavigationActive: true,
          transformDragging: true
        }), false);
        assertEqual(resolveEditorOrbitEnabled({
          toolGestureNavigationActive: true,
          transformDragging: false
        }), true);
        assertEqual(resolveEditorOrbitEnabled({
          toolGestureNavigationActive: true,
          boundsScaleActive: true
        }), false);
      }
    },

    "tool-parameters": {
      "registro declara defaults, limites e campos condicionais"() {
        const registry = createDefaultEditToolRegistry();
        const sketch = registry.definition("path.sketch");
        const described = registry.describe("path.sketch");
        const radius = sketch.parameters.find(
          parameter => parameter.id === "radius"
        );
        const spacingWorld = sketch.parameters.find(
          parameter => parameter.id === "spacingWorld"
        );
        const geometryType = sketch.parameters.find(
          parameter => parameter.id === "geometryType"
        );
        const sourceGeometry = sketch.parameters.find(
          parameter => parameter.id === "sourceGeometry"
        );
        const orientationMode = sketch.parameters.find(
          parameter => parameter.id === "orientationMode"
        );
        const affineScale = sketch.parameters.find(
          parameter => parameter.id === "affineScale"
        );
        const affineULength = sketch.parameters.find(
          parameter => parameter.id === "affineULength"
        );
        const affineColor = sketch.parameters.find(
          parameter => parameter.id === "affineColor"
        );
        assertDeepEqual(radius.when, { mode: "tube" });
        assertDeepEqual(spacingWorld.when, {
          mode: "array",
          spacingMode: "world"
        });
        assertDeepEqual(geometryType.when, {
          mode: "array",
          sourceMode: "catalog"
        });
        assertEqual(sourceGeometry.type, "json");
        assertEqual(sourceGeometry.hidden, true);
        assertDeepEqual(sourceGeometry.when, {
          mode: "array",
          sourceMode: "catalog"
        });
        assertDeepEqual(orientationMode.when, { mode: "array" });
        assertDeepEqual(affineScale.when, { mode: "array" });
        assertDeepEqual(affineULength.when, { mode: "array" });
        assertDeepEqual(affineColor.when, { mode: "array" });
        assertEqual(Object.isFrozen(described.parameters), true);
        assertEqual(Object.isFrozen(described.parameters[0].options), true);
        assertEqual(registry.defaults("path.sketch").spacingMode, "auto");
        assertDeepEqual(registry.defaults("path.sketch").sourceGeometry, {});
        assertEqual(registry.defaults("path.sketch").orientationMode, "preserve");
        assertEqual(registry.defaults("path.sketch").affineScale, "1");
        assertEqual(registry.defaults("path.sketch").affineULength, 1);
        assertEqual(registry.defaults("path.sketch").affineColor, "source");
        assertEqual(registry.defaults("path.array").count, 8);
        assertEqual(registry.defaults("planar.sketch").mode, "line");
        assertEqual(
          registry.defaults("planar.sketch").planeSource,
          "drawing-or-edit"
        );
        assertDeepEqual(
          registry.definition("planar.sketch").parameters.find(
            parameter => parameter.id === "sides"
          ).when,
          { mode: "polygon" }
        );
        assertDeepEqual(
          registry.normalizePatch("path.sketch", {
            sourceGeometry: "{\"type\":\"sphere\",\"radius\":0.4}"
          }).sourceGeometry,
          { type: "sphere", radius: 0.4 }
        );
        assertThrowsMessage(
          () => registry.normalizePatch("path.sketch", {
            sourceGeometry: "{"
          }),
          "JSON válido"
        );
        assertThrowsMessage(
          () => registry.normalizePatch("path.array", { count: 1.5 }),
          "deve ser inteiro"
        );
        assertThrowsMessage(
          () => registry.normalizePatch("path.tube", { radius: 0 }),
          "maior ou igual"
        );
        assertThrowsMessage(
          () => registry.normalizePatch("path.tube", { raio: 1 }),
          "Parâmetro desconhecido"
        );
      },

      "última configuração permanece independente por ferramenta e recarga"() {
        const registry = createDefaultEditToolRegistry();
        const storage = createMemoryStorage();
        const first = new ToolParameterStore({ registry, storage });
        first.set("path.sketch", {
          mode: "array",
          sourceMode: "catalog",
          geometryType: "sphere",
          sourceGeometry: {
            type: "sphere",
            radius: 0.4,
            widthSegments: 18,
            heightSegments: 9
          },
          spacingMode: "world",
          spacingWorld: 0.75,
          align: false,
          orientationMode: "plane",
          affineRotateZ: "360*u",
          affineScale: "0.5+u",
          affineULength: 2.5,
          affineColor: "hsl(120*u,1,0.5)"
        });
        first.set("path.tube", {
          radius: 0.42,
          radialSegments: 11
        });
        first.dispose();

        const restored = new ToolParameterStore({ registry, storage });
        assertEqual(restored.values("path.sketch").mode, "array");
        assertEqual(restored.values("path.sketch").sourceMode, "catalog");
        assertEqual(restored.values("path.sketch").geometryType, "sphere");
        assertDeepEqual(restored.values("path.sketch").sourceGeometry, {
          type: "sphere",
          radius: 0.4,
          widthSegments: 18,
          heightSegments: 9
        });
        assertEqual(restored.values("path.sketch").spacingMode, "world");
        assertNear(restored.values("path.sketch").spacingWorld, 0.75);
        assertEqual(restored.values("path.sketch").align, false);
        assertEqual(restored.values("path.sketch").orientationMode, "plane");
        assertEqual(restored.values("path.sketch").affineRotateZ, "360*u");
        assertEqual(restored.values("path.sketch").affineScale, "0.5+u");
        assertNear(restored.values("path.sketch").affineULength, 2.5);
        assertEqual(
          restored.values("path.sketch").affineColor,
          "hsl(120*u,1,0.5)"
        );
        assertNear(restored.values("path.tube").radius, 0.42);
        assertEqual(restored.values("path.tube").radialSegments, 11);
        assertEqual(restored.values("path.array").count, 8);
        assertEqual(
          JSON.parse(storage.getItem(TOOL_PARAMETER_STORAGE_KEY)).schemaVersion,
          TOOL_PARAMETER_SCHEMA_VERSION
        );
        restored.dispose();
      },

      "registro v1 migra amostragem e preserva preferências anteriores"() {
        const legacyValue = JSON.stringify({
          schemaVersion: 1,
          tools: {
            "path.sketch": {
              mode: "tube",
              spacingPixels: 11,
              radius: 0.27,
              tubularSegments: 120,
              radialSegments: 9,
              color: "#123456",
              count: 23
            },
            "path.tube": {
              radius: 0.44
            }
          }
        });
        const storage = createMemoryStorage({
          [LEGACY_TOOL_PARAMETER_STORAGE_KEY]: legacyValue
        });
        const store = new ToolParameterStore({
          registry: createDefaultEditToolRegistry(),
          storage
        });
        assertEqual(store.values("path.sketch").inputSamplePixels, 11);
        assertNear(store.values("path.sketch").radius, 0.27);
        assertEqual(store.values("path.sketch").tubularSegments, 120);
        assertEqual(store.values("path.sketch").radialSegments, 9);
        assertEqual(store.values("path.sketch").color, "#123456");
        assertEqual(store.values("path.sketch").spacingMode, "auto");
        assertDeepEqual(store.values("path.sketch").sourceGeometry, {});
        assertEqual(
          store.values("path.sketch").orientationMode,
          "preserve"
        );
        assertEqual(store.values("path.sketch").affineScale, "1");
        assertNear(store.values("path.tube").radius, 0.44);
        assertEqual(
          store.status().migratedFrom,
          LEGACY_TOOL_PARAMETER_STORAGE_KEY
        );
        assertEqual(
          JSON.parse(storage.getItem(TOOL_PARAMETER_STORAGE_KEY)).schemaVersion,
          TOOL_PARAMETER_SCHEMA_VERSION
        );
        assertEqual(
          storage.getItem(LEGACY_TOOL_PARAMETER_STORAGE_KEY),
          legacyValue
        );
        store.dispose();
      },

      "migração recupera defaults antigos sem apagar suas chaves"() {
        const hudValue = JSON.stringify({
          defaults: {
            extrude: 2.5,
            inset: 0.35,
            pathRadius: 0.19
          }
        });
        const geometryValue = JSON.stringify({
          parameters: {
            tube: {
              "parameter-radius": 0.33,
              "parameter-tubularSegments": 72,
              "parameter-radialSegments": 9,
              "parameter-closed": true,
              "parameter-curveType": "polyline"
            }
          }
        });
        const storage = createMemoryStorage({
          "spatialseed.edit.hud.v1": hudValue,
          "spatialseed.geometry.creation.defaults.v1": geometryValue
        });
        const store = new ToolParameterStore({
          registry: createDefaultEditToolRegistry(),
          storage,
          migrate: createLegacyToolParameterMigration()
        });
        assertNear(store.values("path.sketch").radius, 0.19);
        assertNear(store.values("path.from-selection").radius, 0.19);
        assertNear(store.values("path.tube").radius, 0.33);
        assertEqual(store.values("path.tube").tubularSegments, 72);
        assertEqual(store.values("path.tube").radialSegments, 9);
        assertEqual(store.values("path.tube").closed, true);
        assertEqual(store.values("path.tube").curveType, "polyline");
        assertNear(store.values("mesh.extrude").distance, 2.5);
        assertNear(store.values("mesh.inset").amount, 0.35);
        assertEqual(storage.getItem("spatialseed.edit.hud.v1"), hudValue);
        assertEqual(
          storage.getItem("spatialseed.geometry.creation.defaults.v1"),
          geometryValue
        );
        store.dispose();

        const partial = new ToolParameterStore({
          registry: createDefaultEditToolRegistry(),
          storage: createMemoryStorage(),
          migrate: () => ({
            "path.tube": { radius: 0.44 },
            "path.array": { count: 0 }
          })
        });
        assertNear(partial.values("path.tube").radius, 0.44);
        assertEqual(partial.values("path.array").count, 8);
        partial.dispose();
      },

      "registro de versão futura permanece intacto e somente leitura"() {
        const futureValue = JSON.stringify({
          schemaVersion: TOOL_PARAMETER_SCHEMA_VERSION + 1,
          tools: {
            "path.tube": { radius: 9 }
          }
        });
        const storage = createMemoryStorage({
          [TOOL_PARAMETER_STORAGE_KEY]: futureValue
        });
        const store = new ToolParameterStore({
          registry: createDefaultEditToolRegistry(),
          storage
        });
        assertEqual(store.status().futureSchema, true);
        assertNear(store.values("path.tube").radius, 0.25);
        assertThrowsMessage(
          () => store.set("path.tube", { radius: 0.4 }),
          "somente leitura"
        );
        let invocation = null;
        const commands = createEditorCommands({
          editor: {},
          renderer: {},
          selectionOperations: {},
          projectService: {},
          benchmarkRunner: {},
          resourceAudit: {},
          toolParameters: store,
          pathTools: {
            createTube(args) {
              invocation = structuredClone(args);
              return { changed: true };
            }
          }
        });
        assertEqual(commands.execute("path.tube.create", {
          path: { objectId: "future-safe-path" },
          radius: 0.4
        }).changed, true);
        assertNear(invocation.radius, 0.4);
        assertEqual(storage.getItem(TOOL_PARAMETER_STORAGE_KEY), futureValue);
        store.dispose();
      },

      "comando usa valores lembrados quando a superfície os omite"() {
        const storage = createMemoryStorage();
        const toolParameters = new ToolParameterStore({
          registry: createDefaultEditToolRegistry(),
          storage
        });
        const calls = [];
        const commands = createEditorCommands({
          editor: {},
          renderer: {},
          selectionOperations: {},
          projectService: {},
          benchmarkRunner: {},
          resourceAudit: {},
          toolParameters,
          pathTools: {
            createTube(args) {
              calls.push(structuredClone(args));
              return { changed: true };
            }
          }
        });
        commands.execute("path.tube.create", {
          path: { objectId: "curve-a" },
          radius: 0.61,
          radialSegments: 12
        });
        commands.execute("path.tube.create", {
          path: { objectId: "curve-b" }
        });
        assertNear(calls[1].radius, 0.61);
        assertEqual(calls[1].radialSegments, 12);
        assertEqual(calls[1].path.objectId, "curve-b");
        assertEqual(Object.hasOwn(calls[1], "closed"), false);
        assertNear(toolParameters.values("path.tube").radius, 0.61);
        toolParameters.dispose();
      },

      "novo projeto permite ao serviço encerrar uma edição de malha ativa"() {
        const calls = [];
        const commands = createEditorCommands({
          editor: {},
          renderer: {},
          selectionOperations: {},
          meshEditor: { active: true },
          projectService: {
            newProject() {
              calls.push("newProject");
              return { changed: true };
            }
          },
          benchmarkRunner: {},
          resourceAudit: {}
        });

        const result = commands.execute("project.new");

        assertEqual(result.changed, true);
        assertDeepEqual(calls, ["newProject"]);
      },

      "ajuste de desenho ativo atualiza o preview sem comando de documento"() {
        const toolParameters = new ToolParameterStore({
          registry: createDefaultEditToolRegistry(),
          storage: createMemoryStorage()
        });
        const updates = [];
        const commands = createEditorCommands({
          editor: {},
          renderer: {},
          selectionOperations: {},
          projectService: {},
          benchmarkRunner: {},
          resourceAudit: {},
          toolParameters,
          pathSketch: {
            status() {
              return { active: true };
            },
            updateSettings(settings) {
              updates.push(structuredClone(settings));
            }
          }
        });
        commands.execute("edit.tool.parameters.set", {
          toolId: "path.sketch",
          patch: {
            mode: "array",
            spacingMode: "world",
            spacingWorld: 0.35,
            twistDegrees: 45,
            orientationMode: "path",
            affineMoveY: "0.2*i",
            affineRotateZ: "180*u",
            affineScale: "0.75-u",
            affineULength: 2,
            affineColor: "mix(source,#ffffff,fract(u))"
          }
        });
        assertEqual(updates.length, 1);
        assertEqual(updates[0].mode, "array");
        assertEqual(updates[0].spacingMode, "world");
        assertNear(updates[0].spacingWorld, 0.35);
        assertEqual(updates[0].twistDegrees, 45);
        assertEqual(updates[0].orientationMode, "path");
        assertEqual(updates[0].affineMoveY, "0.2*i");
        assertEqual(updates[0].affineRotateZ, "180*u");
        assertEqual(updates[0].affineScale, "0.75-u");
        assertNear(updates[0].affineULength, 2);
        assertEqual(
          updates[0].affineColor,
          "mix(source,#ffffff,fract(u))"
        );
        toolParameters.dispose();
      },

      "comando 2D combina modo do HUD com parâmetros lembrados"() {
        const fixture = createEditContextFixture();
        const registry = createDefaultEditToolRegistry();
        const toolParameters = new ToolParameterStore({
          registry,
          storage: createMemoryStorage()
        });
        toolParameters.set("planar.sketch", {
          style: "fill",
          color: "#22aa88",
          sides: 9
        });
        const lifecycle = new ToolLifecycleController({
          editor: fixture.editor,
          storage: createMemoryStorage()
        });
        const begins = [];
        let active = false;
        const planarSketch = {
          status() { return { active }; },
          begin(value) {
            active = true;
            begins.push(structuredClone(value));
            return { active: true, mode: value.mode };
          },
          cancel() {
            active = false;
            return { active: false };
          },
          setContinuous() {},
          updateSettings() {}
        };
        const commands = createEditorCommands({
          editor: fixture.editor,
          renderer: fixture.renderer,
          selectionOperations: {},
          projectService: {},
          benchmarkRunner: {},
          resourceAudit: {},
          toolLifecycle: lifecycle,
          toolParameters,
          planarSketch
        });
        commands.execute("planar.sketch.begin", { mode: "polygon" });
        assertEqual(begins.length, 1);
        assertEqual(begins[0].mode, "polygon");
        assertEqual(begins[0].style, "fill");
        assertEqual(begins[0].color, "#22aa88");
        assertEqual(begins[0].sides, 9);
        assertEqual(begins[0].continuous, true);
        assertEqual(lifecycle.status().activeAction, "planar.sketch");
        commands.execute("planar.sketch.cancel");
        lifecycle.dispose();
        toolParameters.dispose();
      },

      "console omite defaults locais e inicia desenho de tubo ou geometria"() {
        const calls = [];
        const console = createPathConsole(calls);
        console.execute("path tube object=curve-a");
        console.execute("path draw");
        console.execute(
          "path draw mode=array source=catalog geometry=sphere " +
          "params={\"radius\":0.4,\"widthSegments\":18,\"heightSegments\":9} " +
          "spacing=0.75 align=off twist=25 plane=world-xy " +
          "orientation=plane uLength=4 rotateZ=360*u scale=0.5-u " +
          "colorExpr=hsl(360*fract(u),0.8,0.55)"
        );
        console.execute(
          "path draw mode=sweep profile=profile-a segments=40 " +
          "twist=15 scaleStart=0.5 scaleEnd=1.5 caps=off"
        );
        console.execute(
          "path draw mode=extrude depth=2 steps=3 curveSegments=18 " +
          "bevel=off color=#123456"
        );
        console.execute(
          "path draw mode=revolve segments=48 phiStart=10 " +
          "phiLength=180 color=#654321"
        );
        assertEqual(Object.hasOwn(calls[0].args, "radius"), false);
        assertEqual(calls[1].id, "path.sketch.begin");
        assertDeepEqual(calls[1].args, {});
        assertEqual(calls[2].args.mode, "array");
        assertEqual(calls[2].args.sourceMode, "catalog");
        assertEqual(calls[2].args.geometryType, "sphere");
        assertDeepEqual(calls[2].args.sourceGeometry, {
          radius: 0.4,
          widthSegments: 18,
          heightSegments: 9,
          type: "sphere"
        });
        assertEqual(calls[2].args.spacingMode, "world");
        assertNear(calls[2].args.spacingWorld, 0.75);
        assertEqual(calls[2].args.align, false);
        assertEqual(calls[2].args.twistDegrees, 25);
        assertEqual(calls[2].args.planeSource, "world-xy");
        assertEqual(calls[2].args.orientationMode, "plane");
        assertEqual(calls[2].args.affineRotateZ, "360*u");
        assertEqual(calls[2].args.affineScale, "0.5-u");
        assertNear(calls[2].args.affineULength, 4);
        assertEqual(
          calls[2].args.affineColor,
          "hsl(360*fract(u),0.8,0.55)"
        );
        assertEqual(calls[3].args.mode, "sweep");
        assertEqual(calls[3].args.profileObjectId, "profile-a");
        assertEqual(calls[3].args.sweepSegments, 40);
        assertNear(calls[3].args.sweepTwistDegrees, 15);
        assertNear(calls[3].args.scaleStart, 0.5);
        assertNear(calls[3].args.scaleEnd, 1.5);
        assertEqual(calls[3].args.caps, false);
        assertEqual(calls[4].args.mode, "extrude");
        assertNear(calls[4].args.depth, 2);
        assertEqual(calls[4].args.extrudeSteps, 3);
        assertEqual(calls[4].args.curveSegments, 18);
        assertEqual(calls[4].args.bevelEnabled, false);
        assertEqual(calls[4].args.extrudeColor, "#123456");
        assertEqual(calls[5].args.mode, "revolve");
        assertEqual(calls[5].args.revolveSegments, 48);
        assertNear(calls[5].args.phiStartDeg, 10);
        assertNear(calls[5].args.phiLengthDeg, 180);
        assertEqual(calls[5].args.revolveColor, "#654321");
        const invalid = console.execute(
          "path draw mode=array params={\"radius\":0.4}"
        )[0];
        assertEqual(invalid.ok, false);
        assertEqual(invalid.error.includes("exige geometry"), true);
      }
    },

    "hud-context": {
      "dimensões do HUD não possuem teto artificial"() {
        assertDeepEqual(
          normalizeHudDimensions({ columns: 48, rows: 32 }),
          { columns: 48, rows: 32 }
        );
        assertDeepEqual(
          normalizeHudDimensions(
            { columns: 0, rows: "inválido" },
            { columns: 9, rows: 5 }
          ),
          { columns: 9, rows: 5 }
        );
      },

      "seleção de objetos promove ações de edição"() {
        const result = deriveHudContext({
          state: { meshActive: false },
          mesh: { active: false, canEnter: true },
          selection: {
            members: [{ objectId: "a" }, { objectId: "b" }],
            activeMember: { objectId: "a" }
          },
          selectionActions: { canGroup: true, canUngroup: false }
        });
        assertEqual(result.canDuplicate, true);
        assertEqual(result.canDelete, true);
        assertEqual(result.canGroup, true);
        assertEqual(result.groupOrder[0], "selection");
        assertEqual(result.actionOrder[0], "edit-hud-duplicate");
      },

      "ausência de seleção promove criação geométrica"() {
        const result = deriveHudContext({
          state: { meshActive: false },
          selection: { members: [] }
        });
        assertEqual(result.reason, "object-create");
        assertEqual(result.groupOrder[0], "creation");
        assertEqual(geometryToolIcon("lathe"), "↻");
        assertEqual(geometryToolPriority("extrude") < geometryToolPriority("torus"), true);
      },

      "modo face promove ferramentas topológicas"() {
        const result = deriveHudContext({
          state: { meshActive: true, subjectLevel: "face" },
          mesh: { active: true, componentMode: "face", selectedCount: 3 },
          selection: { members: [{ objectId: "mesh" }] }
        });
        assertEqual(result.mode, "face");
        assertEqual(result.selectedComponents, 3);
        assertEqual(result.actionOrder.includes("edit-hud-extrude"), true);
        assertEqual(result.actionOrder.includes("edit-hud-inset"), true);
      },

      "caminho e perfil selecionados habilitam varredura"() {
        const result = deriveHudContext({
          state: { meshActive: false },
          selection: {
            members: [{ objectId: "path" }, { objectId: "profile" }],
            activeMember: { objectId: "path" }
          },
          references: [
            { id: "path", pathExtractions: ["centerline"], profileExtractions: [] },
            { id: "profile", pathExtractions: [], profileExtractions: ["contour"] }
          ]
        });
        assertEqual(result.canTubeFromObject, true);
        assertEqual(result.canSweepFromObjects, true);
        assertEqual(result.canArrayAlongPath, true);
        assertEqual(result.pathReference.id, "path");
        assertEqual(result.profileReference.id, "profile");
        assertEqual(result.profileInputReference.id, "profile");
      },

      "um único esboço fechado continua disponível como perfil"() {
        const result = deriveHudContext({
          state: { meshActive: false },
          selection: {
            members: [{ objectId: "hexagon" }],
            activeMember: { objectId: "hexagon" }
          },
          references: [{
            id: "hexagon",
            pathExtractions: ["auto", "sketch"],
            profileExtractions: ["auto", "sketch"]
          }]
        });
        assertEqual(result.pathReference.id, "hexagon");
        assertEqual(result.profileReference, null);
        assertEqual(result.profileInputReference.id, "hexagon");
      }
    },

    "path-references": {
      "caminho automático prioriza plano de edição e publica a fonte efetiva"() {
        const previousAddEventListener = globalThis.addEventListener;
        const previousRemoveEventListener = globalThis.removeEventListener;
        globalThis.addEventListener = () => {};
        globalThis.removeEventListener = () => {};
        const fixture = createPathToolFixture();
        const editPlane = {
          origin: [3, 4, 5], normal: [0, 1, 0], xAxis: [1, 0, 0],
          source: "edit-plane"
        };
        const drawingPlane = {
          origin: [0, 0, 0], normal: [0, 0, 1], xAxis: [1, 0, 0],
          source: "viewer"
        };
        const controller = new PathSketchController({
          renderer: createPathSketchRendererStub({ editPlane, drawingPlane }),
          pathTools: fixture.service,
          geometryRegistry: createDefaultGeometryRegistry()
        });
        try {
          controller.begin({ mode: "tube", planeSource: "locked-or-viewer" });
          const status = controller.status();
          assertEqual(status.resolvedPlaneSource, "active-plane");
          assertDeepEqual(status.frame.origin, [3, 4, 5]);
          controller.cancel();
        } finally {
          controller.dispose();
          globalThis.addEventListener = previousAddEventListener;
          globalThis.removeEventListener = previousRemoveEventListener;
        }
      },

      "cadeias de arestas são ordenadas sem perder loops"() {
        const open = orderEdgeChain([[2, 3], [1, 2], [0, 1]]);
        assertDeepEqual(open.indices, [0, 1, 2, 3]);
        assertEqual(open.closed, false);
        const closed = orderEdgeChain([[0, 1], [2, 0], [1, 2]]);
        assertEqual(closed.closed, true);
        assertEqual(closed.indices[0], closed.indices.at(-1));
        assertThrowsMessage(
          () => rotationMinimizingFrames({
            points: [[0, 0, 0], [1, 0, 0]],
            segments: 8,
            closed: true
          }),
          "Um caminho fechado exige ao menos três pontos distintos."
        );
      },

      "frames de transporte permanecem ortonormais"() {
        const frames = rotationMinimizingFrames({
          points: [[0, 0, 0], [1, 0.5, 0], [2, 1, 1], [3, 0, 2]],
          segments: 12
        });
        frames.positions.forEach((_, index) => {
          const tangent = new THREE.Vector3().fromArray(frames.tangents[index]);
          const normal = new THREE.Vector3().fromArray(frames.normals[index]);
          const binormal = new THREE.Vector3().fromArray(frames.binormals[index]);
          assertNear(tangent.length(), 1, 1e-9);
          assertNear(normal.length(), 1, 1e-9);
          assertNear(binormal.length(), 1, 1e-9);
          assertNear(tangent.dot(normal), 0, 1e-9);
          assertNear(tangent.dot(binormal), 0, 1e-9);
          assertNear(normal.dot(binormal), 0, 1e-9);
        });
      },

      "amostragem por distância mantém posições anteriores ao ampliar o traço"() {
        const short = samplePathFramesBySpacing({
          points: [[0, 0, 0], [2.4, 0, 0]],
          spacing: 1,
          curveType: "polyline"
        });
        const extended = samplePathFramesBySpacing({
          points: [[0, 0, 0], [5.2, 0, 0]],
          spacing: 1,
          curveType: "polyline"
        });
        assertEqual(short.requestedCount, 3);
        assertEqual(extended.requestedCount, 6);
        assertDeepEqual(short.positions, extended.positions.slice(0, 3));
        assertVectorNear(extended.positions.at(-1), [5, 0, 0]);
        const tail = samplePathFrameTailBySpacing({
          points: [[0, 0, 0], [5.2, 0, 0]],
          spacing: 1,
          startIndex: 1,
          previousFrame: {
            tangent: short.tangents[0],
            normal: short.normals[0]
          },
          curveType: "polyline"
        });
        assertEqual(tail.startIndex, 1);
        assertEqual(tail.evaluatedCount, 5);
        assertDeepEqual(tail.positions, extended.positions.slice(1));
        assertDeepEqual(tail.quaternions, extended.quaternions.slice(1));
        assertThrowsMessage(
          () => samplePathFrameTailBySpacing({
            points: [[0, 0, 0], [5.2, 0, 0]],
            spacing: 1,
            startIndex: 1,
            previousFrame: {
              tangent: short.tangents[0],
              normal: short.normals[0]
            },
            curveType: "polyline",
            twistDegrees: 45
          }),
          "caminho aberto e sem torção"
        );
      },

      "frames aceitam polilinha e controles Bézier desenhados"() {
        const polyline = samplePathFrames({
          points: [[0, 0, 0], [2, 0, 0], [2, 3, 0]],
          count: 5,
          curveType: "polyline"
        });
        const fixture = createPathToolFixture();
        const bezierPoints = fixture.service.prepareSketchPoints({
          points: [[0, 0, 0], [1, 2, 0], [3, 0, 0]],
          curveType: "bezier",
          tension: 0.5
        });
        const bezier = samplePathFrames({
          points: bezierPoints,
          count: 7,
          curveType: "bezier"
        });
        assertEqual(polyline.positions.length, 5);
        assertVectorNear(polyline.positions[0], [0, 0, 0]);
        assertVectorNear(polyline.positions.at(-1), [2, 3, 0]);
        assertEqual((bezierPoints.length - 1) % 3, 0);
        assertEqual(bezier.positions.length, 7);
        assertVectorNear(bezier.positions[0], [0, 0, 0]);
        assertVectorNear(bezier.positions.at(-1), [3, 0, 0]);
      },

      "varredura produz malha triangular fechada nas extremidades"() {
        const result = createSweepGeometryDescriptor({
          pathPoints: [[0, 0, 0], [0, 0, 3]],
          profilePoints: [[-1, -1], [1, -1], [1, 1], [-1, 1]],
          segments: 3,
          caps: true
        });
        assertEqual(result.diagnostics.rings, 4);
        assertEqual(result.geometry.positions.length, 16);
        assertEqual(result.geometry.indices.length % 3, 0);
        assertEqual(result.diagnostics.triangles, 28);
        const [ia, ib, ic] = result.geometry.indices.slice(0, 3);
        const a = new THREE.Vector3().fromArray(result.geometry.positions[ia]);
        const b = new THREE.Vector3().fromArray(result.geometry.positions[ib]);
        const c = new THREE.Vector3().fromArray(result.geometry.positions[ic]);
        const normal = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
        const radial = a.clone().add(b).add(c).multiplyScalar(1 / 3);
        radial.z = 0;
        assertEqual(normal.dot(radial) > 0, true);
      },

      "mesma captura prepara caminho de varredura com perfil selecionável"() {
        const fixture = createPathToolFixture();
        const profile = fixture.service.resolveSketchProfile({
          profileObjectId: "profile-source",
          profileExtraction: "contour"
        });
        const plan = fixture.service.prepareSketchOutputPlan({
          mode: "sweep",
          points: [[0, 0, 0], [0, 1, 0], [1, 2, 0]],
          resolvedProfile: profile,
          curveType: "polyline",
          sweepSegments: 4,
          caps: true,
          color: "#7f9cff"
        });
        const before = fixture.sandbox.objectCount;
        const result = fixture.service.commitSketchOutputPlan({ plan });
        const object = fixture.sandbox.getObject(result.id);

        assertEqual(plan.mode, "sweep");
        assertEqual(plan.inputRole, "path");
        assertEqual(plan.profile.objectId, "profile-source");
        assertEqual(plan.geometry.type, "buffer");
        assertEqual(plan.diagnostics.rings, 5);
        assertEqual(result.changed, true);
        assertEqual(fixture.sandbox.objectCount, before + 1);
        assertEqual(object.geometry.type, "buffer");
        assertThrowsMessage(
          () => fixture.service.prepareSketchOutputPlan({
            mode: "sweep",
            points: [[0, 0, 0], [0, 1, 0]],
            resolvedProfile: structuredClone(profile)
          }),
          "não foi resolvido"
        );
      },

      "perfil desenhado produz extrusão no frame do desenho"() {
        const fixture = createPathToolFixture();
        const frame = Object.freeze({
          origin: [10, 2, -3],
          xAxis: [1, 0, 0],
          yAxis: [0, 0, -1],
          normal: [0, 1, 0],
          quaternion: [-Math.SQRT1_2, 0, 0, Math.SQRT1_2],
          source: "test-plane"
        });
        const plan = fixture.service.prepareSketchOutputPlan({
          mode: "extrude",
          points: [
            [9, 2, -2],
            [11, 2, -2],
            [11, 2, -4],
            [9, 2, -4]
          ],
          frame,
          depth: 2.5,
          bevelEnabled: false,
          color: "#66b5a3"
        });
        const result = fixture.service.commitSketchOutputPlan({ plan });
        const object = fixture.sandbox.getObject(result.id);

        assertEqual(plan.mode, "extrude");
        assertEqual(plan.inputRole, "profile");
        assertDeepEqual(plan.geometry.contour, [
          [-1, -1],
          [1, -1],
          [1, 1],
          [-1, 1]
        ]);
        assertNear(plan.geometry.depth, 2.5);
        assertDeepEqual(object.position, frame.origin);
        object.rotation.forEach((value, index) =>
          assertNear(value, frame.quaternion[index])
        );
        assertEqual(object.geometry.type, "extrude");
      },

      "perfil desenhado produz revolução e rejeita plano forjado"() {
        const fixture = createPathToolFixture();
        const frame = {
          origin: [0, 0, 0],
          xAxis: [1, 0, 0],
          yAxis: [0, 1, 0],
          normal: [0, 0, 1],
          quaternion: [0, 0, 0, 1]
        };
        const plan = fixture.service.prepareSketchOutputPlan({
          mode: "revolve",
          points: [[0, -1, 0], [1, -1, 0], [1, 1, 0], [0, 1, 0]],
          frame,
          revolveSegments: 24,
          phiLengthDeg: 180,
          color: "#d29b62"
        });

        assertEqual(plan.geometry.type, "lathe");
        assertEqual(plan.geometry.segments, 24);
        assertNear(plan.geometry.phiLengthDeg, 180);
        assertThrowsMessage(
          () => fixture.service.commitSketchOutputPlan({
            plan: Object.freeze({ ...plan })
          }),
          "não foi emitido"
        );
      },

      "perfil existente produz extrusão e revolução pelos mesmos descritores"() {
        const fixture = createPathToolFixture();
        const extrude = fixture.service.createExtrude({
          profile: { objectId: "profile-source", extraction: "contour" },
          depth: 2.25,
          bevelEnabled: false
        });
        const revolve = fixture.service.createRevolve({
          profile: { objectId: "profile-source", extraction: "contour" },
          revolveSegments: 24,
          phiLengthDeg: 180
        });
        const extruded = fixture.sandbox.getObject(extrude.id);
        const revolved = fixture.sandbox.getObject(revolve.id);

        assertEqual(extruded.geometry.type, "extrude");
        assertNear(extruded.geometry.depth, 2.25);
        assertEqual(extruded.geometry.bevelEnabled, false);
        assertEqual(revolved.geometry.type, "lathe");
        assertEqual(revolved.geometry.segments, 24);
        assertNear(revolved.geometry.phiLengthDeg, 180);
        assertEqual(extrude.profile.objectId, "profile-source");
        assertEqual(revolve.profile.objectId, "profile-source");
      },

      "resolver usa pontos declarados do tubo no espaço mundial"() {
        const region = new Region(
          { id: "path-reference-region", name: "Path", type: "box-region" },
          { schemaVersion: 1, objects: [{
            id: "tube-path",
            kind: "tube",
            name: "Caminho",
            position: [10, 2, -1],
            rotation: [0, 0, 0, 1],
            scale: [2, 1, 1],
            geometry: {
              type: "tube",
              points: [[0, 0, 0], [1, 0, 0], [2, 1, 0]],
              tubularSegments: 8,
              radius: 0.2,
              radialSegments: 6,
              closed: false,
              curveType: "centripetal",
              tension: 0.5
            }
          }] }
        );
        const sandbox = new Sandbox(region, boxRegionReducer);
        const editor = new EditorState();
        editor.selection.replace({
          kind: "object",
          regionId: "path-reference-region",
          objectId: "tube-path"
        });
        const resolver = new SpatialReferenceResolver({
          sandbox,
          editor,
          geometryRegistry: createDefaultGeometryRegistry()
        });
        const path = resolver.resolvePath({ objectId: "tube-path" });
        assertDeepEqual(path.points[0], [10, 2, -1]);
        assertDeepEqual(path.points[1], [12, 2, -1]);
        assertEqual(path.closed, false);
      },

      "esboço semântico e tubo fechado antigo fornecem perfis equivalentes"() {
        const frame = planarFrameFromPoints([
          [0, 0, 0],
          [1, 0, 0],
          [0, 1, 0]
        ]);
        const polygon = createPlanarPrimitive({
          frame,
          points: [[0, 0, 0], [2, 0, 0]],
          settings: { mode: "polygon", style: "stroke", sides: 6 }
        });
        const region = new Region(
          {
            id: "semantic-profile-region",
            name: "Semantic profiles",
            type: "box-region"
          },
          {
            schemaVersion: 1,
            objects: [
              {
                id: "semantic-hexagon",
                kind: polygon.geometry.type,
                name: "Hexágono semântico",
                position: polygon.position,
                rotation: polygon.rotation,
                scale: [1, 1, 1],
                geometry: polygon.geometry,
                sketch: polygon.sketch
              },
              {
                id: "legacy-hexagon",
                kind: "tube",
                name: "Hexágono antigo",
                position: [5, 0, 0],
                rotation: [0, 0, 0, 1],
                scale: [1, 1, 1],
                geometry: {
                  type: "tube",
                  points: polygon.sketch.points.map(([x, y]) => [x, y, 0]),
                  tubularSegments: 24,
                  radius: 0.05,
                  radialSegments: 6,
                  closed: true,
                  curveType: "polyline",
                  tension: 0.5
                }
              }
            ]
          }
        );
        const resolver = new SpatialReferenceResolver({
          sandbox: new Sandbox(region, boxRegionReducer),
          editor: new EditorState(),
          geometryRegistry: createDefaultGeometryRegistry()
        });
        const semantic = resolver.resolveProfile({
          objectId: "semantic-hexagon"
        });
        const legacy = resolver.resolveProfile({ objectId: "legacy-hexagon" });
        const references = new Map(
          resolver.listObjects().map(reference => [reference.id, reference])
        );

        assertEqual(semantic.extraction, "sketch");
        assertEqual(legacy.extraction, "centerline");
        assertEqual(semantic.points.length, 6);
        assertEqual(legacy.points.length, 6);
        assertEqual(
          references.get("semantic-hexagon").profileExtractions.includes("sketch"),
          true
        );
        assertEqual(
          references.get("legacy-hexagon").profileExtractions.includes("centerline"),
          true
        );
      },

      "aparência preenchida não promove arco semântico a perfil"() {
        const frame = planarFrameFromPoints([
          [0, 0, 0],
          [1, 0, 0],
          [0, 1, 0]
        ]);
        const arcs = ["stroke", "fill"].map(style => ({
          style,
          plan: createPlanarPrimitive({
            frame,
            points: [[0, 0, 0], [2, 0, 0]],
            settings: {
              mode: "arc",
              style,
              arcAngleDegrees: 120
            }
          })
        }));
        const region = new Region(
          {
            id: "semantic-arc-region",
            name: "Semantic arcs",
            type: "box-region"
          },
          {
            schemaVersion: 1,
            objects: arcs.map(({ style, plan }) => ({
              id: `semantic-arc-${style}`,
              kind: plan.geometry.type,
              name: `Arco ${style}`,
              position: plan.position,
              rotation: plan.rotation,
              scale: [1, 1, 1],
              geometry: plan.geometry,
              sketch: plan.sketch
            }))
          }
        );
        const resolver = new SpatialReferenceResolver({
          sandbox: new Sandbox(region, boxRegionReducer),
          editor: new EditorState(),
          geometryRegistry: createDefaultGeometryRegistry()
        });
        const references = resolver.listObjects();

        for (const reference of references) {
          assertEqual(reference.pathExtractions.includes("sketch"), true);
          assertDeepEqual(reference.profileExtractions, []);
          assertThrowsMessage(
            () => resolver.resolveProfile({ objectId: reference.id }),
            "não declara um perfil semântico"
          );
        }
      },

      "provider cria polilinhas e Bézier cúbicas como BufferGeometry"() {
        const registry = createDefaultGeometryRegistry();
        for (const descriptor of [
          {
            type: "tube",
            points: [[0,0,0], [1,1,0], [2,0,0]],
            tubularSegments: 12,
            radius: 0.1,
            radialSegments: 5,
            closed: false,
            curveType: "polyline",
            tension: 0.5
          },
          {
            type: "tube",
            points: [[0,0,0], [1,1,0], [2,1,0], [3,0,0]],
            tubularSegments: 12,
            radius: 0.1,
            radialSegments: 5,
            closed: false,
            curveType: "bezier",
            tension: 0.5
          }
        ]) {
          const normalized = registry.normalize(descriptor);
          const geometry = registry.create(normalized);
          assertEqual(geometry.isBufferGeometry, true);
          assertEqual(geometry.getAttribute("position").count > 0, true);
          geometry.dispose();
        }
      },

      "edição dos controles preserva o objeto caminho e sua interpolação"() {
        const region = new Region(
          { id: "path-control-region", name: "Path controls", type: "box-region" },
          { objects: [{
            id: "bezier-path",
            kind: "tube",
            name: "Bézier",
            position: [0,0,0],
            rotation: [0,0,0,1],
            scale: [1,1,1],
            geometry: {
              type: "tube",
              points: [[0,0,0], [1,1,0], [2,1,0], [3,0,0]],
              tubularSegments: 16,
              radius: 0.1,
              radialSegments: 6,
              closed: false,
              curveType: "bezier",
              tension: 0.5
            }
          }] }
        );
        const sandbox = new Sandbox(region, boxRegionReducer);
        const editor = new EditorState();
        editor.selection.replace({
          kind: "object",
          regionId: "path-control-region",
          objectId: "bezier-path"
        });
        const renderer = createMeshEditorRendererStub();
        const controller = new MeshEditController({
          sandbox, editor, renderer,
          geometryRegistry: createDefaultGeometryRegistry()
        });
        controller.enter({ selectAll: true });
        assertEqual(controller.status().pathControlMode, true);
        const reference = controller.selectedPathReference();
        assertEqual(reference.points.length, 4);
        controller.translate([1, 0, 0]);
        const result = controller.commit();
        const object = sandbox.getSnapshot().objects[0];
        assertEqual(result.vertexCount, 4);
        assertEqual(object.kind, "tube");
        assertEqual(object.geometry.type, "tube");
        assertEqual(object.geometry.curveType, "bezier");
        assertVectorNear(object.geometry.points[0], [1,0,0]);
        controller.dispose();
      },

      "lista de referências não oferece sólidos fechados como caminho"() {
        const region = new Region(
          { id: "reference-list-region", name: "References", type: "box-region" },
          { schemaVersion: 1, objects: [
            {
              id: "closed-box",
              kind: "box",
              name: "Sólido",
              position: [0, 0, 0],
              rotation: [0, 0, 0, 1],
              scale: [1, 1, 1],
              geometry: { type: "box", size: [1, 1, 1], segments: [1, 1, 1] }
            },
            {
              id: "declared-path",
              kind: "tube",
              name: "Caminho",
              position: [0, 0, 0],
              rotation: [0, 0, 0, 1],
              scale: [1, 1, 1],
              geometry: {
                type: "tube",
                points: [[0, 0, 0], [0, 1, 0], [1, 2, 0]],
                tubularSegments: 8,
                radius: 0.1,
                radialSegments: 6,
                closed: false,
                curveType: "centripetal",
                tension: 0.5
              }
            },
            {
              id: "declared-profile",
              kind: "shape",
              name: "Perfil",
              position: [0, 0, 0],
              rotation: [0, 0, 0, 1],
              scale: [1, 1, 1],
              geometry: {
                type: "shape",
                contour: [[-1, -1], [1, -1], [1, 1], [-1, 1]],
                holes: [],
                curveSegments: 1
              }
            }
          ] }
        );
        const resolver = new SpatialReferenceResolver({
          sandbox: new Sandbox(region, boxRegionReducer),
          editor: new EditorState(),
          geometryRegistry: createDefaultGeometryRegistry()
        });
        const references = new Map(
          resolver.listObjects().map(reference => [reference.id, reference])
        );
        assertDeepEqual(references.get("closed-box").pathExtractions, []);
        assertDeepEqual(references.get("closed-box").profileExtractions, []);
        assertEqual(
          references.get("declared-path").pathExtractions.includes("centerline"),
          true
        );
        assertEqual(
          references.get("declared-profile").profileExtractions.includes("contour"),
          true
        );
      },

      "catálogo de referências reutiliza cache em ferramentas e cresce incrementalmente"() {
        const objects = Array.from({ length: 256 }, (_, index) => ({
          id: `passive-${index}`,
          kind: "box",
          name: `Passivo ${index}`,
          position: [index, 0, 0],
          rotation: [0, 0, 0, 1],
          scale: [1, 1, 1],
          geometry: {
            type: "box",
            size: [1, 1, 1],
            segments: [1, 1, 1]
          }
        }));
        const region = new Region(
          {
            id: "reference-cache-region",
            name: "Reference cache",
            type: "box-region"
          },
          { schemaVersion: 1, objects }
        );
        const sandbox = new Sandbox(region, boxRegionReducer);
        const editor = new EditorState();
        const geometryRegistry = createDefaultGeometryRegistry();
        const describeLegacyObject =
          geometryRegistry.describeLegacyObject.bind(geometryRegistry);
        let descriptorReads = 0;
        geometryRegistry.describeLegacyObject = object => {
          descriptorReads += 1;
          return describeLegacyObject(object);
        };
        const resolver = new SpatialReferenceResolver({
          sandbox,
          editor,
          geometryRegistry
        });
        let latestState = null;
        let latestChanges = null;
        const unsubscribe = sandbox.subscribe((state, changes) => {
          latestState = state;
          latestChanges = changes;
        });
        try {
          const first = resolver.listObjects({
            includeSelection: false
          });
          const firstDescriptorReads = descriptorReads;
          editor.setToolMode("rotate");
          editor.selection.replace({
            kind: "object",
            regionId: region.descriptor.id,
            objectId: "passive-255"
          });
          const afterToolChange = resolver.listObjects({
            includeSelection: false
          });
          assertEqual(afterToolChange === first, true);
          assertEqual(descriptorReads, firstDescriptorReads);
          const selectedOnly = resolver.listObjects({
            includeSelection: false,
            ids: ["passive-255"]
          });
          assertEqual(selectedOnly.length, 1);
          assertEqual(selectedOnly[0] === first[255], true);

          sandbox.dispatch({
            type: "object.create",
            id: "new-path",
            kind: "tube",
            name: "Novo caminho",
            position: [0, 0, 0],
            rotation: [0, 0, 0, 1],
            geometry: {
              type: "tube",
              points: [[0, 0, 0], [1, 0, 0]],
              tubularSegments: 8,
              radius: 0.1,
              radialSegments: 6,
              closed: false,
              curveType: "polyline",
              tension: 0.5
            }
          });
          resolver.applyChanges(latestState, latestChanges);
          const extended = resolver.listObjects({
            includeSelection: false
          });
          assertEqual(extended.length, first.length + 1);
          assertEqual(extended[0] === first[0], true);
          assertEqual(
            extended.at(-1).pathExtractions.includes("centerline"),
            true
          );
          assertEqual(
            descriptorReads - firstDescriptorReads <= 1,
            true
          );
        } finally {
          unsubscribe();
        }
      },

      "serviço ajusta amostras livres para controles Bézier editáveis"() {
        const fixture = createPathToolFixture();
        const created = fixture.service.createPath({
          points: [[0,0,0], [1,1,0], [2,0,0]],
          curveType: "bezier",
          tubularSegments: 12
        });
        const object = fixture.sandbox.getSnapshot().objects.find(
          candidate => candidate.id === created.id
        );
        assertEqual(object.geometry.curveType, "bezier");
        assertEqual(object.geometry.points.length, 7);
        assertEqual((object.geometry.points.length - 1) % 3, 0);
      },

      "serviço cria tubo, varredura e distribuição como comandos atômicos"() {
        const fixture = createPathToolFixture();
        const tube = fixture.service.createTube({
          path: { objectId: "path-source" },
          tubularSegments: 8,
          radialSegments: 4
        });
        const sweep = fixture.service.createSweep({
          path: { objectId: "path-source" },
          profile: { objectId: "profile-source" },
          segments: 4
        });
        fixture.editor.selection.replace({
          kind: "object",
          regionId: "path-tool-region",
          objectId: "array-source"
        });
        const array = fixture.service.arraySelection({
          path: { objectId: "path-source" },
          count: 3
        });
        const state = fixture.sandbox.getSnapshot();
        assertEqual(tube.changed, true);
        assertEqual(sweep.changed, true);
        assertEqual(array.changed, true);
        assertEqual(array.createdIds.length, 3);
        assertEqual(state.objects.find(object => object.id === tube.id).kind, "tube");
        assertEqual(state.objects.find(object => object.id === sweep.id).kind, "buffer");
        assertEqual(fixture.sandbox.getHistoryDiagnostics().commandCount, 3);
        assertVectorNear(
          state.objects.find(object => object.id === array.createdIds[0]).position,
          [0, 0, 0]
        );
        assertVectorNear(
          state.objects.find(object => object.id === array.createdIds.at(-1)).position,
          [2, 4, 0]
        );
      },

      "traço distribui qualquer geometria ou grupo em uma ação atômica"() {
        const fixture = createPathToolFixture();
        fixture.editor.selection.replace({
          kind: "object",
          regionId: "path-tool-region",
          objectId: "array-group"
        });
        const sourceIds = fixture.service.captureArraySource();
        const points = [[0, 0, 0], [2, 1, 0], [4, 0, 0]];
        const preview = fixture.service.previewArraySelection({
          points,
          sourceIds,
          count: 4,
          curveType: "polyline"
        });
        assertDeepEqual(sourceIds, ["array-group"]);
        assertEqual(preview.previewCount, 4);
        assertEqual(preview.entries.length, 1);
        assertEqual(preview.entries[0].sourceId, "array-group-sphere");
        assertEqual(preview.entries[0].worldMatrices.length, 4);

        const result = fixture.service.arraySelectionAlongPoints({
          points,
          sourceIds,
          count: 4,
          curveType: "polyline"
        });
        assertEqual(result.changed, true);
        assertEqual(result.createdIds.length, 8);
        assertEqual(result.activeIds.length, 1);
        assertEqual(result.reference.extraction, "drawn-points");
        assertEqual(fixture.sandbox.getHistoryDiagnostics().commandCount, 1);
        assertEqual(fixture.sandbox.undo(), true);
        assertEqual(
          fixture.sandbox.getSnapshot().objects.some(
            object => result.createdIds.includes(object.id)
          ),
          false
        );
      },

      "pincel selecionado cresce por distância e preserva a hierarquia"() {
        const fixture = createPathToolFixture();
        fixture.editor.selection.replace({
          kind: "object",
          regionId: "path-tool-region",
          objectId: "array-group"
        });
        const brush = fixture.service.captureArrayBrush();
        const short = fixture.service.previewArrayBrush({
          points: [[0, 0, 0], [2.4, 0, 0]],
          brush,
          spacing: 1,
          curveType: "polyline",
          maximumCopies: 100
        });
        const extended = fixture.service.previewArrayBrush({
          points: [[0, 0, 0], [5.2, 0, 0]],
          brush,
          spacing: 1,
          curveType: "polyline",
          previousPlan: short,
          maximumCopies: 100
        });
        assertEqual(brush.renderableCount, 1);
        assertNear(brush.autoSpacing, 1);
        assertEqual(short.previewCount, 3);
        assertEqual(extended.previewCount, 6);
        assertDeepEqual(
          short.deltaMatrices,
          extended.deltaMatrices.slice(0, short.previewCount)
        );
        assertEqual(extended.diagnostics.reusedPreparedCopies, 1);
        assertEqual(extended.diagnostics.frameSampling, "tail");
        assertEqual(extended.diagnostics.reusedFrameSamples, 1);
        assertEqual(
          extended.draft.copies[0] === short.draft.copies[0],
          true
        );
        assertDeepEqual(
          short.draft.copies.map(copy =>
            copy.objects.map(object => object.id)
          ),
          extended.draft.copies
            .slice(0, short.previewCount)
            .map(copy => copy.objects.map(object => object.id))
        );
        assertEqual(
          fixture.sandbox.getHistoryDiagnostics().commandCount,
          0
        );
        assertEqual(fixture.sandbox.getSnapshot().objects.length, 5);
        const twistedShort = fixture.service.previewArrayBrush({
          points: [[0, 0, 0], [2.4, 0, 0]],
          brush,
          spacing: 1,
          curveType: "polyline",
          twistDegrees: 45,
          maximumCopies: 100
        });
        const twistedExtended = fixture.service.previewArrayBrush({
          points: [[0, 0, 0], [5.2, 0, 0]],
          brush,
          spacing: 1,
          curveType: "polyline",
          twistDegrees: 45,
          previousPlan: twistedShort,
          maximumCopies: 100
        });
        assertEqual(twistedExtended.diagnostics.frameSampling, "full");
        assertEqual(twistedExtended.diagnostics.reusedCopies, 1);
        const result = fixture.service.commitArrayBrushPlan({
          plan: extended,
          brush
        });
        assertEqual(result.count, 6);
        assertEqual(result.createdIds.length, 12);
        assertDeepEqual(
          result.createdIds,
          extended.draft.objects.map(object => object.id)
        );
        assertEqual(fixture.sandbox.getHistoryDiagnostics().commandCount, 1);
        assertEqual(fixture.sandbox.undo(), true);
      },

      "catálogo fornece qualquer geometria como pincel instanciado"() {
        const fixture = createPathToolFixture();
        for (const description of
          fixture.service.resolver.geometryRegistry.describe()) {
          const candidate = fixture.service.captureArrayBrush({
            sourceMode: "catalog",
            geometryType: description.type
          });
          assertEqual(candidate.entries.length, 1);
          assertEqual(candidate.sourceGeometry.type, description.type);
        }
        const brush = fixture.service.captureArrayBrush({
          sourceMode: "catalog",
          geometryType: "sphere",
          geometry: {
            type: "sphere",
            radius: 0.4,
            widthSegments: 18,
            heightSegments: 9
          },
          color: "#224466"
        });
        const result = fixture.service.arraySelectionAlongPoints({
          points: [[0, 0, 0], [2.2, 0, 0]],
          sourceMode: "catalog",
          geometryType: "sphere",
          sourceGeometry: brush.sourceGeometry,
          sourceColor: "#224466",
          spacingMode: "world",
          spacingWorld: 0.5,
          curveType: "polyline",
          initialNormal: [0, 0, 1],
          orientationMode: "plane",
          affineScale: "0.5+u",
          affineULength: 2
        });
        const created = fixture.sandbox.getObject(result.familyId);
        const family = normalizeExplicitInstanceFamily(created.family);
        const first = explicitFamilyTransformAt(family, 0, {});
        const last = explicitFamilyTransformAt(family, family.count - 1, {});
        assertEqual(brush.sourceMode, "catalog");
        assertNear(brush.sourceGeometry.radius, 0.4);
        assertEqual(brush.sourceGeometry.widthSegments, 18);
        assertEqual(brush.sourceGeometry.heightSegments, 9);
        assertEqual(result.count, 5);
        assertEqual(fixture.sandbox.getSnapshot().objects.length, 6);
        assertEqual(created.kind, "instance-family");
        assertEqual(created.geometry.type, "sphere");
        assertEqual(brush.sourceColor, "#224466");
        assertEqual(typeof created.appearanceId, "string");
        assertNear(first.scale[0], 0.5);
        assertNear(last.scale[0], 1.5);
        assertEqual(result.createdIds.length, 1);
        assertEqual(result.memberResources.length, 5);
        assertEqual(
          result.memberResources[0],
          familyMemberResourcePath(created.id, family.memberIds[0])
        );
        assertEqual(fixture.sandbox.getHistoryDiagnostics().commandCount, 1);
      },

      "cor paramétrica persiste em todas as famílias geométricas"() {
        const fixture = createPathToolFixture();
        const modifier =
          fixture.service.compileArrayBrushColorModifier({
            affineColor: "hsl(240-120*u,1,0.5)"
          });
        for (const geometry of geometryProviderSamples()) {
          const brush = fixture.service.captureArrayBrush({
            sourceMode: "catalog",
            geometryType: geometry.type,
            geometry,
            color: "#ff0000"
          });
          const plan = fixture.service.previewArrayBrush({
            points: [[0, 0, 0], [1, 0, 0]],
            brush,
            spacing: 1,
            curveType: "polyline",
            colorModifier: modifier,
            affineULength: 1,
            maximumCopies: 4
          });
          const result = fixture.service.commitArrayBrushPlan({
            plan,
            brush
          });
          const created = fixture.sandbox.getObject(result.familyId);
          const family = normalizeExplicitInstanceFamily(created.family);
          assertEqual(family.count, plan.previewCount);
          assertDeepEqual(
            Array.from({ length: family.count }, (_, index) =>
              packedColorHex(explicitFamilyTransformAt(family, index, {}).color)
            ),
            plan.colorsByEntry[0].colors
          );
          assertEqual(created.geometry.type, geometry.type);
          assertEqual(result.memberResources.length, plan.previewCount);
          assertEqual(fixture.sandbox.undo(), true);
        }
      },

      "modificador afim fixa u por distância e inverte cor na escala negativa"() {
        assertEqual(compilePathBrushAffineModifier().identity, true);
        const modifier = compilePathBrushAffineModifier({
          affineMoveX: "d+spacing",
          affineMoveY: "0.1*i",
          affineMoveZ: "k",
          affineRotateZ: "360*u",
          affineScale: "0.5+0.5*u"
        });
        assertEqual(modifier.identity, false);
        const evaluated = evaluatePathBrushAffineModifier(modifier, {
          index: 2,
          count: 3,
          progress: 1.25,
          position: [2, 3, 4],
          rotation: [0, 0, 0, 1],
          variables: {
            d: 1,
            spacing: 0.25,
            k: 0.125
          }
        });
        assertVectorNear(evaluated.move, [1.25, 0.2, 0.125]);
        assertVectorNear(evaluated.rotate, [0, 0, 450]);
        assertNear(evaluated.scale, 1.125);
        assertNear(evaluated.context.u, 1.25);
        assertThrowsMessage(
          () => compilePathBrushAffineModifier({
            affineScale: "variavel_inexistente"
          }),
          "Variável não disponível"
        );

        const fixture = createPathToolFixture();
        const brush = fixture.service.captureArrayBrush({
          sourceMode: "catalog",
          geometryType: "box",
          geometry: {
            type: "box",
            size: [0.5, 0.5, 0.5],
            segments: [1, 1, 1]
          }
        });
        const progressiveModifier =
          fixture.service.compileArrayBrushModifier({
            affineRotateZ: "90*u",
            affineScale: "0.5-u"
          });
        const progressiveColor =
          fixture.service.compileArrayBrushColorModifier({
            affineColor: "hsl(120*u,1,0.5)"
          });
        const short = fixture.service.previewArrayBrush({
          points: [[0, 0, 0], [3, 0, 0], [6.4, 1, 0]],
          brush,
          spacing: 1,
          curveType: "centripetal",
          affineModifier: progressiveModifier,
          colorModifier: progressiveColor,
          affineULength: 2,
          maximumCopies: 100
        });
        const extended = fixture.service.previewArrayBrush({
          points: [[0, 0, 0], [3, 0, 0], [6, 1, 0], [9.2, 3, 0]],
          brush,
          spacing: 1,
          curveType: "centripetal",
          affineModifier: progressiveModifier,
          colorModifier: progressiveColor,
          affineULength: 2,
          previousPlan: short,
          maximumCopies: 100
        });
        assertEqual(short.previewCount >= 7, true);
        assertEqual(extended.previewCount > short.previewCount, true);
        assertEqual(extended.diagnostics.incremental, true);
        assertEqual(extended.diagnostics.reusedCopies > 0, true);
        assertEqual(extended.diagnostics.frameSampling, "tail");
        assertEqual(
          extended.diagnostics.evaluatedFrameSamples,
          extended.previewCount - extended.diagnostics.reusedCopies
        );
        assertDeepEqual(
          short.draft.instances.map(instance => instance.id),
          extended.draft.instances
            .slice(0, short.previewCount)
            .map(instance => instance.id)
        );
        assertDeepEqual(
          short.deltaMatrices.slice(0, extended.diagnostics.reusedCopies),
          extended.deltaMatrices.slice(0, extended.diagnostics.reusedCopies)
        );
        assertDeepEqual(
          short.colorsByEntry[0].colors.slice(
            0,
            extended.diagnostics.reusedCopies
          ),
          extended.colorsByEntry[0].colors.slice(
            0,
            extended.diagnostics.reusedCopies
          )
        );
        assertNear(short.samples[2].u, 1);
        assertNear(extended.samples[2].u, 1);
        assertEqual(short.samples[2].invertColor, true);
        assertEqual(short.colorsByEntry[0].colors[2], "#ff00ff");
        assertEqual(invertHexColor("#224466"), "#ddbb99");
        assertEqual(
          evaluatePathBrushColorModifier(
            compilePathBrushColorModifier(
              "mix(#000000,#ffffff,0.5)"
            )
          ),
          "#808080"
        );
        assertEqual(
          evaluatePathBrushColorModifier(
            compilePathBrushColorModifier("invert(#000000)")
          ),
          "#ffffff"
        );

        const directNegative = evaluatePathBrushAffineModifier(
          compilePathBrushAffineModifier({ affineScale: "-2" }),
          {
            index: 1,
            count: 1,
            progress: 0,
            position: [0, 0, 0],
            rotation: [0, 0, 0, 1]
          }
        );
        assertNear(directNegative.scale, 2);
        assertNear(directNegative.signedScale, -2);
        assertEqual(directNegative.invertColor, true);
        assertEqual(
          evaluatePathBrushColorModifier(
            compilePathBrushColorModifier("source"),
            {
              sourceColor: "#224466",
              invert: directNegative.invertColor
            }
          ),
          "#ddbb99"
        );
        assertThrowsMessage(
          () => compilePathBrushColorModifier("rgb(u,desconhecida,0)"),
          "Variável não disponível"
        );
        assertThrowsMessage(
          () => fixture.service.commitArrayBrushPlan({
            plan: structuredClone(extended),
            brush
          }),
          "não foi emitido por este serviço"
        );
        const truncated = fixture.service.previewArrayBrush({
          points: [[0, 0, 0], [8, 0, 0]],
          brush,
          spacing: 1,
          curveType: "polyline",
          maximumCopies: 3
        });
        assertEqual(truncated.truncated, true);
        assertThrowsMessage(
          () => fixture.service.commitArrayBrushPlan({
            plan: truncated,
            brush
          }),
          "plano incremental está truncado"
        );

        const result = fixture.service.commitArrayBrushPlan({
          plan: extended,
          brush
        });
        const created = fixture.sandbox.getObject(result.familyId);
        const family = normalizeExplicitInstanceFamily(created.family);
        assertEqual(family.count, extended.previewCount);
        assertDeepEqual(
          result.memberIds,
          extended.draft.instances.map(instance => instance.id)
        );
        assertDeepEqual(
          Array.from({ length: family.count }, (_, index) =>
            packedColorHex(explicitFamilyTransformAt(family, index, {}).color)
          ),
          extended.colorsByEntry[0].colors
        );
        assertEqual(
          fixture.sandbox.getHistoryDiagnostics().commandCount,
          1
        );
        assertEqual(result.incrementalPlan, true);
        assertNear(
          new THREE.Vector3().setFromMatrixScale(
            new THREE.Matrix4().fromArray(extended.deltaMatrices[2])
          ).x,
          0.5
        );
      },

      "preview instanciado atualiza cores sem recriar seus recursos"() {
        const fixture = createPathToolFixture();
        const brush = fixture.service.captureArrayBrush({
          sourceMode: "catalog",
          geometryType: "box",
          color: "#224466"
        });
        const plan = fixture.service.previewArrayBrush({
          points: [[0, 0, 0], [3.2, 0, 0]],
          brush,
          spacing: 1,
          curveType: "polyline",
          affineULength: 1,
          colorModifier: fixture.service.compileArrayBrushColorModifier({
            affineColor: "rgb(32*i,64,128)"
          })
        });
        const group = new THREE.Group();
        const cache = new PathInstancePreviewCache({
          group,
          geometryRegistry: fixture.service.resolver.geometryRegistry
        });
        try {
          const configured = cache.configure(brush);
          cache.update(plan);
          const first = cache.status();
          cache.update(plan);
          const repeated = cache.status();
          assertDeepEqual(repeated.meshIds, configured.meshIds);
          assertEqual(first.diagnostics.colorWrites, plan.previewCount);
          assertEqual(
            repeated.diagnostics.colorSkips >= plan.previewCount,
            true
          );
          assertEqual(
            repeated.diagnostics.resourceBuilds,
            configured.diagnostics.resourceBuilds
          );
          assertEqual(group.children[0].instanceColor !== null, true);
        } finally {
          cache.dispose();
        }
      },

      "orientação do pincel explicita o plano ou a tangente do caminho"() {
        const fixture = createPathToolFixture();
        const brush = fixture.service.captureArrayBrush({
          sourceMode: "catalog",
          geometryType: "plane",
          geometry: {
            type: "plane",
            width: 1,
            height: 1,
            widthSegments: 1,
            heightSegments: 1
          }
        });
        const plane = fixture.service.previewArrayBrush({
          points: [[0, 0, 0], [3, 0, 0]],
          brush,
          spacing: 1,
          curveType: "polyline",
          initialNormal: [0, 1, 0],
          orientationMode: "plane",
          affineModifier: fixture.service.compileArrayBrushModifier({
            affineRotateZ: "90"
          })
        });
        const planeMatrix = new THREE.Matrix4().fromArray(
          plane.deltaMatrices[0]
        );
        const planeOrigin = new THREE.Vector3().applyMatrix4(planeMatrix);
        const planeX = new THREE.Vector3(1, 0, 0)
          .applyMatrix4(planeMatrix)
          .sub(planeOrigin)
          .normalize();
        const planeZ = new THREE.Vector3(0, 0, 1)
          .applyMatrix4(planeMatrix)
          .sub(planeOrigin)
          .normalize();
        assertVectorNear(planeX.toArray(), [0, 0, -1]);
        assertVectorNear(planeZ.toArray(), [0, 1, 0]);

        const path = fixture.service.previewArrayBrush({
          points: [[0, 0, 0], [3, 0, 0]],
          brush,
          spacing: 1,
          curveType: "polyline",
          initialNormal: [0, 1, 0],
          orientationMode: "path"
        });
        const pathMatrix = new THREE.Matrix4().fromArray(
          path.deltaMatrices[0]
        );
        const pathOrigin = new THREE.Vector3().applyMatrix4(pathMatrix);
        const pathZ = new THREE.Vector3(0, 0, 1)
          .applyMatrix4(pathMatrix)
          .sub(pathOrigin)
          .normalize();
        assertVectorNear(pathZ.toArray(), [1, 0, 0]);

        fixture.sandbox.dispatch({
          type: "object.transform",
          id: "array-source",
          position: [5, 0, 0],
          rotation: new THREE.Quaternion().setFromEuler(
            new THREE.Euler(0, 0, Math.PI / 2)
          ).toArray(),
          scale: [1, 1, 1]
        });
        fixture.editor.selection.replace({
          kind: "object",
          regionId: "path-tool-region",
          objectId: "array-source"
        });
        const selectedBrush = fixture.service.captureArrayBrush();
        const selectedPlan = fixture.service.previewArrayBrush({
          points: [[0, 0, 0], [3, 0, 0]],
          brush: selectedBrush,
          spacing: 1,
          curveType: "polyline",
          initialNormal: [0, 0, 1],
          orientationMode: "plane"
        });
        const selectedWorld = new THREE.Matrix4()
          .fromArray(selectedPlan.deltaMatrices[0])
          .multiply(new THREE.Matrix4().fromArray(
            selectedBrush.entries[0].sourceWorldMatrices[0]
          ));
        const selectedOrigin = new THREE.Vector3().applyMatrix4(selectedWorld);
        const selectedX = new THREE.Vector3(1, 0, 0)
          .applyMatrix4(selectedWorld)
          .sub(selectedOrigin)
          .normalize();
        assertVectorNear(selectedOrigin.toArray(), [0, 0, 0]);
        assertVectorNear(selectedX.toArray(), [1, 0, 0]);
      },

      "controlador acrescenta instâncias sem recriar o preview e confirma ao soltar"() {
        const previousAddEventListener = globalThis.addEventListener;
        const previousRemoveEventListener = globalThis.removeEventListener;
        const previousRequestAnimationFrame =
          globalThis.requestAnimationFrame;
        const previousCancelAnimationFrame =
          globalThis.cancelAnimationFrame;
        globalThis.addEventListener = () => {};
        globalThis.removeEventListener = () => {};
        /* O teste controla o relógio visual desde o primeiro pointermove.
           Em navegador, requestAnimationFrame já existe e o preview é
           deliberadamente coalescido; ler o estado antes do quadro tornava
           a asserção dependente do ambiente de execução. */
        const pendingFrames = new Map();
        let nextFrameId = 1;
        globalThis.requestAnimationFrame = callback => {
          const id = nextFrameId;
          nextFrameId += 1;
          pendingFrames.set(id, callback);
          return id;
        };
        globalThis.cancelAnimationFrame = id => {
          pendingFrames.delete(id);
        };
        const runNextFrame = () => {
          const entry = pendingFrames.entries().next().value;
          if (!entry) throw new Error("Frame visual esperado ausente.");
          const [id, callback] = entry;
          pendingFrames.delete(id);
          callback(0);
        };
        const fixture = createPathToolFixture();
        let previewCalls = 0;
        let commitCalls = 0;
        let lastPreviewPlan = null;
        let committedPlan = null;
        const previewArrayBrush =
          fixture.service.previewArrayBrush.bind(fixture.service);
        const commitArrayBrushPlan =
          fixture.service.commitArrayBrushPlan.bind(fixture.service);
        fixture.service.previewArrayBrush = options => {
          previewCalls += 1;
          lastPreviewPlan = previewArrayBrush(options);
          return lastPreviewPlan;
        };
        fixture.service.commitArrayBrushPlan = options => {
          commitCalls += 1;
          committedPlan = options.plan;
          return commitArrayBrushPlan(options);
        };
        fixture.editor.selection.replace({
          kind: "object",
          regionId: "path-tool-region",
          objectId: "array-group"
        });
        const renderer = createPathSketchRendererStub();
        let completed = null;
        let ended = null;
        let notifications = 0;
        let unsubscribe = () => {};
        const controller = new PathSketchController({
          renderer,
          pathTools: fixture.service,
          geometryRegistry: createDefaultGeometryRegistry(),
          onCompleted: value => { completed = value; },
          onEnded: value => { ended = value; }
        });
        try {
          controller.begin({
            mode: "tube",
            planeSource: "world-xy"
          });
          controller.updateSettings({
            mode: "array",
            sourceMode: "selection",
            spacingMode: "world",
            spacingWorld: 1
          });
          assertDeepEqual(controller.status().sourceIds, ["array-group"]);
          controller.cancel();
          controller.begin({
            mode: "array",
            planeSource: "world-xy",
            curveType: "polyline",
            inputSamplePixels: 1,
            simplify: 0,
            smoothIterations: 0,
            spacingMode: "world",
            spacingWorld: 1
          });
          unsubscribe = controller.subscribe(() => {
            notifications += 1;
          });
          const meshIds = controller.status().previewResources.meshIds;
          renderer.canvas.emit("pointerdown", pathPointerEvent(1, 20, 50));
          renderer.canvas.emit("pointermove", pathPointerEvent(1, 50, 50));
          runNextFrame();
          const firstPreviewCount = controller.status().previewCount;
          renderer.canvas.emit("pointermove", pathPointerEvent(1, 80, 50));
          runNextFrame();
          const secondStatus = controller.status();
          assertEqual(secondStatus.previewCount > firstPreviewCount, true);
          assertDeepEqual(secondStatus.previewResources.meshIds, meshIds);
          assertEqual(
            secondStatus.previewResources.diagnostics.meshBuilds,
            1
          );
          assertEqual(
            secondStatus.previewResources.diagnostics.matrixSkips > 0,
            true
          );
          assertEqual(notifications, 4);
          assertEqual(fixture.sandbox.getHistoryDiagnostics().commandCount, 0);
          const writesBefore =
            secondStatus.previewResources.diagnostics.matrixWrites;
          controller.updateSettings({
            orientationMode: "plane",
            affineRotateZ: "180*u",
            affineScale: "0.5-u",
            affineULength: 1,
            affineColor: "hsl(120*u,1,0.5)"
          });
          runNextFrame();
          const affineStatus = controller.status();
          assertDeepEqual(affineStatus.previewResources.meshIds, meshIds);
          assertEqual(
            affineStatus.previewResources.diagnostics.matrixWrites >
              writesBefore,
            true
          );
          assertEqual(affineStatus.settings.orientationMode, "plane");
          assertEqual(affineStatus.settings.affineRotateZ, "180*u");
          assertEqual(affineStatus.settings.affineColor, "hsl(120*u,1,0.5)");
          assertEqual(
            affineStatus.previewResources.diagnostics.colorWrites > 0,
            true
          );

          const previewCallsBeforeCommit = previewCalls;
          renderer.canvas.emit("pointerup", pathPointerEvent(1, 80, 50));
          const previewGroup = renderer.scene.getObjectByName(
            "path-sketch-array-preview"
          );
          assertEqual(controller.status().active, false);
          assertEqual(previewCalls, previewCallsBeforeCommit);
          assertEqual(commitCalls, 1);
          assertEqual(committedPlan === lastPreviewPlan, true);
          assertEqual(previewGroup.visible, true);
          runNextFrame();
          assertEqual(previewGroup.visible, true);
          runNextFrame();
          assertEqual(previewGroup.visible, false);
          assertEqual(
            completed.result.createdIds.length,
            completed.result.count * 2
          );
          assertEqual(completed.settings.mode, "array");
          assertEqual(completed.settings.orientationMode, "plane");
          assertEqual(completed.settings.affineScale, "0.5-u");
          assertEqual(completed.settings.affineULength, 1);
          assertEqual(
            completed.settings.affineColor,
            "hsl(120*u,1,0.5)"
          );
          assertEqual(
            fixture.sandbox.getSnapshot().objects
              .filter(object =>
                completed.result.createdIds.includes(object.id) &&
                object.kind === "sphere"
              )
              .every(object =>
                /^#[0-9a-f]{6}$/i.test(object.instanceState?.color)
              ),
            true
          );
          assertVectorNear(completed.frame.normal, [0, 0, 1]);
          assertEqual(ended.reason, "completed");
          assertEqual(fixture.sandbox.getHistoryDiagnostics().commandCount, 1);
        } finally {
          unsubscribe();
          controller.dispose();
          if (previousAddEventListener === undefined) {
            delete globalThis.addEventListener;
          } else {
            globalThis.addEventListener = previousAddEventListener;
          }
          if (previousRemoveEventListener === undefined) {
            delete globalThis.removeEventListener;
          } else {
            globalThis.removeEventListener = previousRemoveEventListener;
          }
          if (previousRequestAnimationFrame === undefined) {
            delete globalThis.requestAnimationFrame;
          } else {
            globalThis.requestAnimationFrame =
              previousRequestAnimationFrame;
          }
          if (previousCancelAnimationFrame === undefined) {
            delete globalThis.cancelAnimationFrame;
          } else {
            globalThis.cancelAnimationFrame =
              previousCancelAnimationFrame;
          }
        }
      },

      "controlador persistente confirma traços consecutivos sem recapturar o lote"() {
        const previousAddEventListener = globalThis.addEventListener;
        const previousRemoveEventListener = globalThis.removeEventListener;
        const previousRequestAnimationFrame =
          globalThis.requestAnimationFrame;
        const previousCancelAnimationFrame =
          globalThis.cancelAnimationFrame;
        globalThis.addEventListener = () => {};
        globalThis.removeEventListener = () => {};
        delete globalThis.requestAnimationFrame;
        delete globalThis.cancelAnimationFrame;
        const fixture = createPathToolFixture();
        const renderer = createPathSketchRendererStub();
        const completions = [];
        const controller = new PathSketchController({
          renderer,
          pathTools: fixture.service,
          geometryRegistry: createDefaultGeometryRegistry(),
          onCompleted: value => {
            completions.push(value);
            if (completions.length === 1) {
              throw new Error("falha de pós-commit simulada");
            }
          }
        });
        const draw = (pointerId, y) => {
          renderer.canvas.emit(
            "pointerdown",
            pathPointerEvent(pointerId, 20, y)
          );
          renderer.canvas.emit(
            "pointermove",
            pathPointerEvent(pointerId, 80, y)
          );
          renderer.canvas.emit(
            "pointerup",
            pathPointerEvent(pointerId, 80, y)
          );
        };
        try {
          controller.begin({
            mode: "array",
            sourceMode: "catalog",
            geometryType: "sphere",
            sourceGeometry: {
              type: "sphere",
              radius: 0.25,
              widthSegments: 12,
              heightSegments: 8
            },
            planeSource: "world-xy",
            curveType: "polyline",
            inputSamplePixels: 1,
            simplify: 0,
            smoothIterations: 0,
            spacingMode: "world",
            spacingWorld: 0.5,
            continuous: true
          });
          const meshIds = controller.status().previewResources.meshIds;

          draw(1, 45);
          const afterFirst = controller.status();
          assertEqual(afterFirst.active, true);
          assertEqual(afterFirst.drawing, false);
          assertEqual(afterFirst.committing, false);
          assertEqual(
            afterFirst.error.includes("falha ao registrar repetição"),
            true
          );
          assertEqual(completions.length, 1);
          assertEqual(
            fixture.sandbox.getHistoryDiagnostics().commandCount,
            1
          );

          draw(2, 55);
          const afterSecond = controller.status();
          assertEqual(afterSecond.active, true);
          assertEqual(afterSecond.drawing, false);
          assertEqual(afterSecond.committing, false);
          assertEqual(afterSecond.error, null);
          assertEqual(completions.length, 2);
          assertEqual(
            fixture.sandbox.getHistoryDiagnostics().commandCount,
            2
          );
          assertDeepEqual(
            afterSecond.previewResources.meshIds,
            meshIds
          );
          assertEqual(
            afterSecond.previewResources.diagnostics.meshBuilds,
            1
          );
        } finally {
          controller.dispose();
          if (previousAddEventListener === undefined) {
            delete globalThis.addEventListener;
          } else {
            globalThis.addEventListener = previousAddEventListener;
          }
          if (previousRemoveEventListener === undefined) {
            delete globalThis.removeEventListener;
          } else {
            globalThis.removeEventListener = previousRemoveEventListener;
          }
          if (previousRequestAnimationFrame === undefined) {
            delete globalThis.requestAnimationFrame;
          } else {
            globalThis.requestAnimationFrame =
              previousRequestAnimationFrame;
          }
          if (previousCancelAnimationFrame === undefined) {
            delete globalThis.cancelAnimationFrame;
          } else {
            globalThis.cancelAnimationFrame =
              previousCancelAnimationFrame;
          }
        }
      },

      "controlador persistente rearma o pincel após desfazer o traço anterior"() {
        const previousAddEventListener = globalThis.addEventListener;
        const previousRemoveEventListener = globalThis.removeEventListener;
        const previousRequestAnimationFrame =
          globalThis.requestAnimationFrame;
        const previousCancelAnimationFrame =
          globalThis.cancelAnimationFrame;
        globalThis.addEventListener = () => {};
        globalThis.removeEventListener = () => {};
        delete globalThis.requestAnimationFrame;
        delete globalThis.cancelAnimationFrame;
        const fixture = createPathToolFixture();
        const renderer = createPathSketchRendererStub();
        const completions = [];
        const controller = new PathSketchController({
          renderer,
          pathTools: fixture.service,
          geometryRegistry: createDefaultGeometryRegistry(),
          onCompleted: value => completions.push(value)
        });
        const draw = (pointerId, y) => {
          renderer.canvas.emit(
            "pointerdown",
            pathPointerEvent(pointerId, 20, y)
          );
          renderer.canvas.emit(
            "pointermove",
            pathPointerEvent(pointerId, 80, y)
          );
          renderer.canvas.emit(
            "pointerup",
            pathPointerEvent(pointerId, 80, y)
          );
        };
        try {
          controller.begin({
            mode: "array",
            sourceMode: "catalog",
            geometryType: "sphere",
            planeSource: "world-xy",
            curveType: "polyline",
            inputSamplePixels: 1,
            simplify: 0,
            smoothIterations: 0,
            spacingMode: "world",
            spacingWorld: 0.5,
            continuous: true
          });
          const meshIds = controller.status().previewResources.meshIds;

          draw(1, 45);
          assertEqual(completions.length, 1);
          assertEqual(fixture.sandbox.undo(), true);
          assertEqual(
            completions[0].result.createdIds.some(id =>
              fixture.sandbox.getObject(id)
            ),
            false
          );

          draw(2, 55);
          const status = controller.status();
          assertEqual(completions.length, 2);
          assertEqual(status.active, true);
          assertEqual(status.drawing, false);
          assertEqual(status.committing, false);
          assertEqual(status.error, null);
          assertDeepEqual(status.previewResources.meshIds, meshIds);
          assertEqual(
            completions[1].result.createdIds.every(id =>
              Boolean(fixture.sandbox.getObject(id))
            ),
            true
          );
        } finally {
          controller.dispose();
          if (previousAddEventListener === undefined) {
            delete globalThis.addEventListener;
          } else {
            globalThis.addEventListener = previousAddEventListener;
          }
          if (previousRemoveEventListener === undefined) {
            delete globalThis.removeEventListener;
          } else {
            globalThis.removeEventListener = previousRemoveEventListener;
          }
          if (previousRequestAnimationFrame === undefined) {
            delete globalThis.requestAnimationFrame;
          } else {
            globalThis.requestAnimationFrame =
              previousRequestAnimationFrame;
          }
          if (previousCancelAnimationFrame === undefined) {
            delete globalThis.cancelAnimationFrame;
          } else {
            globalThis.cancelAnimationFrame =
              previousCancelAnimationFrame;
          }
        }
      },

      "controlador observa a publicação de tubo pelo id criado"() {
        const previousAddEventListener = globalThis.addEventListener;
        const previousRemoveEventListener = globalThis.removeEventListener;
        const previousRequestAnimationFrame =
          globalThis.requestAnimationFrame;
        const previousCancelAnimationFrame =
          globalThis.cancelAnimationFrame;
        globalThis.addEventListener = () => {};
        globalThis.removeEventListener = () => {};
        delete globalThis.requestAnimationFrame;
        delete globalThis.cancelAnimationFrame;
        const fixture = createPathToolFixture();
        const renderer = createPathSketchRendererStub();
        const geometryRegistry = createDefaultGeometryRegistry();
        let sequence = 0;
        const fusion = new StrokeFusionService({
          sandbox: fixture.sandbox,
          editor: fixture.editor,
          regionId: "path-tool-region",
          geometryRegistry,
          createId: () => `path-stroke-${++sequence}`
        });
        let routedThroughFusion = 0;
        let completed = null;
        const controller = new PathSketchController({
          renderer,
          pathTools: fixture.service,
          geometryRegistry,
          createStroke: args => {
            routedThroughFusion += 1;
            return fusion.createStroke(args);
          },
          onCompleted: value => { completed = value; }
        });
        try {
          controller.begin({
            mode: "tube",
            planeSource: "world-xy",
            curveType: "polyline",
            inputSamplePixels: 1,
            simplify: 0,
            smoothIterations: 0
          });
          renderer.canvas.emit(
            "pointerdown",
            pathPointerEvent(1, 20, 50)
          );
          renderer.canvas.emit(
            "pointermove",
            pathPointerEvent(1, 80, 50)
          );
          renderer.canvas.emit(
            "pointerup",
            pathPointerEvent(1, 80, 50)
          );
          assert(completed);
          assertEqual(completed.result.changed, true);
          assertEqual(typeof completed.result.id, "string");
          assertEqual(routedThroughFusion, 1);
          assertEqual(
            fixture.sandbox.getObject(completed.result.id).kind,
            "stroke-bundle"
          );
          assertEqual(controller.status().active, false);
          assertEqual(
            controller.transientStatus().scene.handoffs,
            0
          );
          assertEqual(
            fixture.sandbox.getHistoryDiagnostics().commandCount,
            1
          );
        } finally {
          controller.dispose();
          if (previousAddEventListener === undefined) {
            delete globalThis.addEventListener;
          } else {
            globalThis.addEventListener = previousAddEventListener;
          }
          if (previousRemoveEventListener === undefined) {
            delete globalThis.removeEventListener;
          } else {
            globalThis.removeEventListener = previousRemoveEventListener;
          }
          if (previousRequestAnimationFrame === undefined) {
            delete globalThis.requestAnimationFrame;
          } else {
            globalThis.requestAnimationFrame =
              previousRequestAnimationFrame;
          }
          if (previousCancelAnimationFrame === undefined) {
            delete globalThis.cancelAnimationFrame;
          } else {
            globalThis.cancelAnimationFrame =
              previousCancelAnimationFrame;
          }
        }
      },

      "controlador desenha perfil de extrusão com preview e commit únicos"() {
        const previousAddEventListener = globalThis.addEventListener;
        const previousRemoveEventListener = globalThis.removeEventListener;
        const previousRequestAnimationFrame =
          globalThis.requestAnimationFrame;
        const previousCancelAnimationFrame =
          globalThis.cancelAnimationFrame;
        globalThis.addEventListener = () => {};
        globalThis.removeEventListener = () => {};
        delete globalThis.requestAnimationFrame;
        delete globalThis.cancelAnimationFrame;
        const fixture = createPathToolFixture();
        const renderer = createPathSketchRendererStub();
        let completed = null;
        const controller = new PathSketchController({
          renderer,
          pathTools: fixture.service,
          geometryRegistry: createDefaultGeometryRegistry(),
          onCompleted: value => { completed = value; }
        });
        try {
          controller.begin({
            mode: "extrude",
            planeSource: "world-xy",
            curveType: "polyline",
            inputSamplePixels: 1,
            simplify: 0,
            smoothIterations: 0,
            depth: 2,
            bevelEnabled: false
          });
          renderer.canvas.emit(
            "pointerdown",
            pathPointerEvent(1, 20, 20)
          );
          renderer.canvas.emit(
            "pointermove",
            pathPointerEvent(1, 80, 20)
          );
          assertEqual(controller.status().previewCount, 0);
          renderer.canvas.emit(
            "pointermove",
            pathPointerEvent(1, 80, 80)
          );
          assertEqual(controller.status().previewCount, 1);
          renderer.canvas.emit(
            "pointerup",
            pathPointerEvent(1, 20, 80)
          );

          assert(completed);
          assertEqual(completed.result.mode, "extrude");
          assertEqual(completed.preparedPlan.inputRole, "profile");
          assertEqual(completed.preparedPlan.geometry.type, "extrude");
          assertNear(completed.preparedPlan.geometry.depth, 2);
          assertEqual(
            fixture.sandbox.getObject(completed.result.id).geometry.type,
            "extrude"
          );
          assertEqual(controller.status().active, false);
          assertEqual(
            fixture.sandbox.getHistoryDiagnostics().commandCount,
            1
          );
        } finally {
          controller.dispose();
          if (previousAddEventListener === undefined) {
            delete globalThis.addEventListener;
          } else {
            globalThis.addEventListener = previousAddEventListener;
          }
          if (previousRemoveEventListener === undefined) {
            delete globalThis.removeEventListener;
          } else {
            globalThis.removeEventListener = previousRemoveEventListener;
          }
          if (previousRequestAnimationFrame === undefined) {
            delete globalThis.requestAnimationFrame;
          } else {
            globalThis.requestAnimationFrame =
              previousRequestAnimationFrame;
          }
          if (previousCancelAnimationFrame === undefined) {
            delete globalThis.cancelAnimationFrame;
          } else {
            globalThis.cancelAnimationFrame =
              previousCancelAnimationFrame;
          }
        }
      },

      "controlador envia ao pincel somente pontos causais aceitos"() {
        const previousAddEventListener = globalThis.addEventListener;
        const previousRemoveEventListener = globalThis.removeEventListener;
        const previousRequestAnimationFrame =
          globalThis.requestAnimationFrame;
        const previousCancelAnimationFrame =
          globalThis.cancelAnimationFrame;
        globalThis.addEventListener = () => {};
        globalThis.removeEventListener = () => {};
        delete globalThis.requestAnimationFrame;
        delete globalThis.cancelAnimationFrame;
        const fixture = createPathToolFixture();
        const previewInputs = [];
        const prepareSketchPoints =
          fixture.service.prepareSketchPoints.bind(fixture.service);
        fixture.service.prepareSketchPoints = options => {
          previewInputs.push(structuredClone(options.points));
          return prepareSketchPoints(options);
        };
        const renderer = createPathSketchRendererStub();
        const controller = new PathSketchController({
          renderer,
          pathTools: fixture.service,
          geometryRegistry: createDefaultGeometryRegistry()
        });
        try {
          controller.begin({
            mode: "array",
            sourceMode: "catalog",
            geometryType: "box",
            planeSource: "world-xy",
            curveType: "centripetal",
            inputSamplePixels: 1,
            spacingMode: "world",
            spacingWorld: 0.5
          });
          renderer.canvas.emit("pointerdown", pathPointerEvent(1, 20, 60));
          renderer.canvas.emit("pointermove", pathPointerEvent(1, 50, 40));
          const first = previewInputs.at(-1);
          renderer.canvas.emit("pointermove", pathPointerEvent(1, 80, 60));
          const extended = previewInputs.at(-1);

          assertEqual(first.length, 2);
          assertEqual(extended.length, 3);
          assertDeepEqual(extended.slice(0, first.length), first);
        } finally {
          controller.dispose();
          if (previousAddEventListener === undefined) {
            delete globalThis.addEventListener;
          } else {
            globalThis.addEventListener = previousAddEventListener;
          }
          if (previousRemoveEventListener === undefined) {
            delete globalThis.removeEventListener;
          } else {
            globalThis.removeEventListener = previousRemoveEventListener;
          }
          if (previousRequestAnimationFrame === undefined) {
            delete globalThis.requestAnimationFrame;
          } else {
            globalThis.requestAnimationFrame =
              previousRequestAnimationFrame;
          }
          if (previousCancelAnimationFrame === undefined) {
            delete globalThis.cancelAnimationFrame;
          } else {
            globalThis.cancelAnimationFrame =
              previousCancelAnimationFrame;
          }
        }
      },

      async "controlador mantém o preview até a réplica observar o commit"() {
        const previousAddEventListener = globalThis.addEventListener;
        const previousRemoveEventListener = globalThis.removeEventListener;
        const previousRequestAnimationFrame =
          globalThis.requestAnimationFrame;
        const previousCancelAnimationFrame =
          globalThis.cancelAnimationFrame;
        globalThis.addEventListener = () => {};
        globalThis.removeEventListener = () => {};
        const pendingFrames = new Map();
        let nextFrameId = 1;
        globalThis.requestAnimationFrame = callback => {
          const id = nextFrameId;
          nextFrameId += 1;
          pendingFrames.set(id, callback);
          return id;
        };
        globalThis.cancelAnimationFrame = id => {
          pendingFrames.delete(id);
        };
        const runNextFrame = () => {
          const entry = pendingFrames.entries().next().value;
          if (!entry) throw new Error("Frame visual esperado ausente.");
          const [id, callback] = entry;
          pendingFrames.delete(id);
          callback(0);
        };
        const network = createLocalViewerNetwork();
        const pair = await createLocalViewerPair({ network });
        const editor = new EditorState();
        const geometryRegistry = createDefaultGeometryRegistry();
        const appearanceRuntime = new AppearanceRuntime();
        const selectionOperations = new SelectionOperations({
          editor,
          sandbox: pair.replica.coordinated,
          regionId: pair.replica.region.id,
          geometryRegistry,
          appearanceRuntime
        });
        const resolver = new SpatialReferenceResolver({
          sandbox: pair.replica.coordinated,
          editor,
          geometryRegistry
        });
        const service = new PathToolService({
          resolver,
          selectionOperations,
          sandbox: pair.replica.coordinated,
          editor
        });
        let commitObservers = 0;
        const subscribe =
          pair.replica.coordinated.subscribe.bind(
            pair.replica.coordinated
          );
        const subscribeCoordination =
          pair.replica.coordinated.subscribeCoordination.bind(
            pair.replica.coordinated
          );
        pair.replica.coordinated.subscribe = listener => {
          commitObservers += 1;
          const unsubscribe = subscribe(listener);
          return () => {
            commitObservers -= 1;
            unsubscribe();
          };
        };
        pair.replica.coordinated.subscribeCoordination = listener => {
          commitObservers += 1;
          const unsubscribe = subscribeCoordination(listener);
          return () => {
            commitObservers -= 1;
            unsubscribe();
          };
        };
        const renderer = createPathSketchRendererStub();
        const completions = [];
        const controller = new PathSketchController({
          renderer,
          pathTools: service,
          geometryRegistry,
          onCompleted: value => completions.push(value)
        });
        const observedStatuses = [];
        const unsubscribeController = controller.subscribe(
          status => observedStatuses.push(status)
        );
        try {
          controller.begin({
            mode: "array",
            sourceMode: "catalog",
            geometryType: "sphere",
            sourceGeometry: {
              type: "sphere",
              radius: 0.25,
              widthSegments: 12,
              heightSegments: 8
            },
            planeSource: "world-xy",
            curveType: "polyline",
            inputSamplePixels: 1,
            simplify: 0,
            smoothIterations: 0,
            spacingMode: "world",
            spacingWorld: 0.5,
            continuous: true
          });
          renderer.canvas.emit("pointerdown", pathPointerEvent(1, 20, 50));
          renderer.canvas.emit("pointermove", pathPointerEvent(1, 80, 50));
          renderer.canvas.emit("pointerup", pathPointerEvent(1, 80, 50));
          const previewGroup = renderer.scene.getObjectByName(
            "path-sketch-array-preview"
          );
          assertEqual(completions.length, 0);
          assertEqual(pair.replica.sandbox.objectCount, 0);
          assertEqual(pendingFrames.size, 0);
          assertEqual(previewGroup.visible, true);
          assertEqual(commitObservers, 2);
          assertEqual(observedStatuses.at(-1).committing, true);

          await settleLocalViewers(20);

          assertEqual(completions.length, 1);
          assertEqual(commitObservers, 0);
          assertEqual(observedStatuses.at(-1).active, true);
          assertEqual(observedStatuses.at(-1).committing, false);
          assertEqual(
            pair.replica.sandbox.objectCount,
            completions[0].result.createdIds.length
          );
          runNextFrame();
          runNextFrame();
          assertEqual(previewGroup.visible, false);

          renderer.canvas.emit("pointerdown", pathPointerEvent(2, 20, 60));
          renderer.canvas.emit("pointermove", pathPointerEvent(2, 80, 60));
          renderer.canvas.emit("pointerup", pathPointerEvent(2, 80, 60));
          assertEqual(completions.length, 1);
          assertEqual(commitObservers, 2);
          assertEqual(previewGroup.visible, true);
          await settleLocalViewers(20);
          assertEqual(completions.length, 2);
          assertEqual(commitObservers, 0);
          assertEqual(observedStatuses.at(-1).active, true);
          assertEqual(observedStatuses.at(-1).committing, false);
          assertEqual(
            pair.replica.sandbox.objectCount,
            completions.reduce(
              (total, completion) =>
                total + completion.result.createdIds.length,
              0
            )
          );
          runNextFrame();
          runNextFrame();
          assertEqual(previewGroup.visible, false);
        } finally {
          unsubscribeController();
          controller.dispose();
          pair.dispose();
          if (previousAddEventListener === undefined) {
            delete globalThis.addEventListener;
          } else {
            globalThis.addEventListener = previousAddEventListener;
          }
          if (previousRemoveEventListener === undefined) {
            delete globalThis.removeEventListener;
          } else {
            globalThis.removeEventListener = previousRemoveEventListener;
          }
          if (previousRequestAnimationFrame === undefined) {
            delete globalThis.requestAnimationFrame;
          } else {
            globalThis.requestAnimationFrame =
              previousRequestAnimationFrame;
          }
          if (previousCancelAnimationFrame === undefined) {
            delete globalThis.cancelAnimationFrame;
          } else {
            globalThis.cancelAnimationFrame =
              previousCancelAnimationFrame;
          }
        }
      },

      "console converte objetos nomeados sem forçar caminho aberto"() {
        const calls = [];
        const console = createPathConsole(calls);
        const tube = console.execute(
          "path tube object=name:Caminho radius=0.4 segments=12 radial=6"
        )[0];
        const sweep = console.execute(
          "path sweep path=path-id profile=profile-id twist=30 caps=off"
        )[0];
        assertEqual(tube.ok, true);
        assertEqual(sweep.ok, true);
        assertEqual(calls[0].id, "path.tube.create");
        assertEqual(calls[0].args.path.objectName, "Caminho");
        assertEqual(calls[0].args.closed, undefined);
        assertEqual(calls[1].id, "path.sweep.create");
        assertEqual(calls[1].args.closedPath, undefined);
        assertEqual(calls[1].args.caps, false);
      },

      "perfil declarado respeita escala e permanece planar"() {
        const region = new Region(
          { id: "profile-reference-region", name: "Profile", type: "box-region" },
          { schemaVersion: 1, objects: [{
            id: "shape-profile",
            kind: "shape",
            name: "Perfil",
            position: [3, 4, 5],
            rotation: [0, 0, 0, 1],
            scale: [2, 3, 1],
            geometry: {
              type: "shape",
              contour: [[-1, -1], [1, -1], [1, 1], [-1, 1]],
              holes: [],
              curveSegments: 1
            }
          }] }
        );
        const sandbox = new Sandbox(region, boxRegionReducer);
        const editor = new EditorState();
        const resolver = new SpatialReferenceResolver({
          sandbox,
          editor,
          geometryRegistry: createDefaultGeometryRegistry()
        });
        const profile = resolver.resolveProfile({ objectId: "shape-profile" });
        const xs = profile.points.map(point => point[0]);
        const ys = profile.points.map(point => point[1]);
        assertNear(Math.max(...xs) - Math.min(...xs), 4, 1e-9);
        assertNear(Math.max(...ys) - Math.min(...ys), 6, 1e-9);
        assertNear(profile.maxDeviation, 0, 1e-9);
      }
    },

    "mesh-edit-math": {
      "espelho corrige winding, normal, tangente e matriz de instância"() {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.Float32BufferAttribute([
          0, 0, 0,
          1, 0, 0,
          0, 1, 0
        ], 3));
        geometry.setAttribute("normal", new THREE.Float32BufferAttribute([
          0, 0, 1,
          0, 0, 1,
          0, 0, 1
        ], 3));
        geometry.setAttribute("tangent", new THREE.Float32BufferAttribute([
          1, 0, 0, 1,
          1, 0, 0, 1,
          1, 0, 0, 1
        ], 4));
        geometry.setIndex([0, 1, 2]);
        mirrorGeometryXInPlace(geometry);
        assertDeepEqual([...geometry.index.array], [0, 2, 1]);
        assertNear(geometry.getAttribute("normal").getZ(0), 1);
        assertNear(geometry.getAttribute("tangent").getX(0), -1);
        assertNear(geometry.getAttribute("tangent").getW(0), -1);

        const position = geometry.getAttribute("position");
        const a = new THREE.Vector3().fromBufferAttribute(position, 0);
        const b = new THREE.Vector3().fromBufferAttribute(position, 2);
        const c = new THREE.Vector3().fromBufferAttribute(position, 1);
        const faceNormal = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
        assertNear(faceNormal.z, 1);

        const logical = new THREE.Matrix4().makeScale(-2, 3, 4);
        const instance = positiveInstanceMatrixForMirror(logical);
        assert(instance.determinant() > 0);
        const point = new THREE.Vector3(2, 3, 4);
        const mirroredPoint = point.clone().applyMatrix4(
          new THREE.Matrix4().makeScale(-1, 1, 1)
        ).applyMatrix4(instance);
        assertVectorNear(
          mirroredPoint.toArray(),
          point.clone().applyMatrix4(logical).toArray()
        );
      },

      "escala livre cruza o pivô e produz fator negativo"() {
        const factor = proportionalScaleFactor2D({
          fixed: [0, 0],
          initial: [100, 0],
          current: [-50, 0]
        });
        assertNear(factor, -0.5, 1e-12);
      },

      "escala negativa preserva TRS e representa espelho"() {
        const result = scaleWorldTrsWithoutShear({
          matrixWorld: new THREE.Matrix4()
            .makeTranslation(2, 0, 0)
            .toArray(),
          pivotWorld: [0, 0, 0],
          frameQuaternion: [0, 0, 0, 1],
          factors: [-1, 1, 1]
        });
        const matrix = new THREE.Matrix4().fromArray(result);
        assertNear(matrix.elements[12], -2, 1e-12);
        assert(matrix.determinant() < 0);
      },

      "escala livre expõe oito vértices diagonais locais"() {
        const set = createLocalBoundsScaleHandleSet({
          min: [-1, -2, -3],
          max: [1, 2, 3],
          axes: { x: true, y: true, z: true }
        });
        assertEqual(set.dimensions, 3);
        assertEqual(set.handles.length, 8);
        for (const handle of set.handles) {
          const opposite = set.handles[handle.oppositeIndex];
          assertVectorNear(
            opposite.signs,
            handle.signs.map(value => -value)
          );
        }
      },

      "eixo bloqueado reduz a escala proporcional ao plano restante"() {
        const set = createLocalBoundsScaleHandleSet({
          min: [-2, -4, -6],
          max: [2, 4, 6],
          axes: { x: true, y: true, z: false }
        });
        assertEqual(set.dimensions, 2);
        assertEqual(set.handles.length, 4);
        assertEqual(set.axes.z, false);
        for (const handle of set.handles) {
          assertNear(handle.point[2], 0);
        }
        assertVectorNear(
          scaleFactorsForAxes(1.5, set.axes),
          [1.5, 1.5, 1]
        );
      },

      "arrasto diagonal calcula escala proporcional por projeção"() {
        assertNear(
          proportionalScaleFactor2D({
            fixed: [10, 20],
            initial: [110, 120],
            current: [160, 170]
          }),
          1.5
        );
        assertNear(
          proportionalScaleFactor2D({
            fixed: [0, 0],
            initial: [100, 0],
            current: [153, 40],
            snap: 0.1
          }),
          1.5
        );
      },

      "diagonal projetada curta mantém arrasto selecionável"() {
        assertNear(
          proportionalScaleFactor2D({
            fixed: [50, 50],
            initial: [50, 50],
            current: [90, 50],
            fallbackDirection: [1, 0],
            fallbackLength: 80
          }),
          1.5
        );
      },

      "escala local recompõe TRS sem introduzir shear"() {
        const sourcePosition = new THREE.Vector3(4, 2, -1);
        const sourceOrientation = new THREE.Quaternion().setFromEuler(
          new THREE.Euler(0.2, 0.7, -0.3)
        );
        const sourceMatrix = new THREE.Matrix4()
          .compose(
            sourcePosition,
            sourceOrientation,
            new THREE.Vector3(2, 3, 4)
          )
          .toArray();
        const result = new THREE.Matrix4().fromArray(
          scaleWorldTrsWithoutShear({
            matrixWorld: sourceMatrix,
            pivotWorld: [0, 0, 0],
            frameQuaternion: [0, 0, 0, 1],
            factors: [2, 1, 0.5]
          })
        );
        const position = new THREE.Vector3();
        const orientation = new THREE.Quaternion();
        const scale = new THREE.Vector3();
        result.decompose(position, orientation, scale);
        assertVectorNear(position.toArray(), [8, 2, -0.5]);
        assertVectorNear(scale.toArray(), [4, 3, 2]);
        assertNear(Math.abs(orientation.dot(sourceOrientation)), 1, 1e-9);
      },

      "escala com pivô no centro preserva o centro do objeto"() {
        const center = [4, 2, -1];
        const source = new THREE.Matrix4()
          .compose(
            new THREE.Vector3(...center),
            new THREE.Quaternion().setFromEuler(
              new THREE.Euler(0.4, -0.2, 0.6)
            ),
            new THREE.Vector3(1, 2, 3)
          )
          .toArray();
        const result = new THREE.Matrix4().fromArray(
          scaleWorldTrsWithoutShear({
            matrixWorld: source,
            pivotWorld: center,
            frameQuaternion: [0, 0, 0, 1],
            factors: [1.5, 1.5, 1.5]
          })
        );
        const resultPosition = new THREE.Vector3();
        result.decompose(
          resultPosition,
          new THREE.Quaternion(),
          new THREE.Vector3()
        );
        assertVectorNear(resultPosition.toArray(), center);
      },

      "frame do viewer converte X e Y no plano congelado"() {
        const viewerQuaternion = new THREE.Quaternion()
          .setFromEuler(new THREE.Euler(0, Math.PI / 2, 0))
          .toArray();
        const delta = affineDeltaWorld({
          type: "move",
          value: [2, 3, 0],
          pivotWorld: [0, 0, 0],
          frameQuaternion: viewerQuaternion
        });
        const positions = transformLocalPositions({
          positions: [[0, 0, 0]],
          selectedIndices: [0],
          objectWorldMatrix: new THREE.Matrix4().toArray(),
          deltaWorldMatrix: delta
        });
        assertVectorNear(positions[0], [0, 3, -2]);
      },

      "frame local compõe quaternions da hierarquia sem herdar escala"() {
        const parent = new THREE.Quaternion()
          .setFromEuler(new THREE.Euler(0, Math.PI / 2, 0));
        const child = new THREE.Quaternion()
          .setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0));
        const frame = new THREE.Quaternion().fromArray(
          composeRotationFrame([parent.toArray(), child.toArray()])
        );
        const expected = parent.clone().multiply(child);
        assertVectorNear(
          new THREE.Vector3(0, 1, 0).applyQuaternion(frame).toArray(),
          new THREE.Vector3(0, 1, 0).applyQuaternion(expected).toArray()
        );
      },

      "delta mundial volta corretamente ao espaço local não uniforme"() {
        const world = new THREE.Matrix4().compose(
          new THREE.Vector3(10, 2, -4),
          new THREE.Quaternion().setFromEuler(
            new THREE.Euler(0, Math.PI / 2, 0)
          ),
          new THREE.Vector3(2, 3, 4)
        );
        const source = [[0, 0, 0], [1, 0, 0]];
        const pivot = selectedVertexPivotWorld({
          positions: source,
          selectedIndices: [0, 1],
          objectWorldMatrix: world.toArray()
        });
        const delta = affineDeltaWorld({
          type: "rotate",
          value: [0, 0, 180],
          pivotWorld: pivot,
          frameQuaternion: [0, 0, 0, 1]
        });
        const result = transformLocalPositions({
          positions: source,
          selectedIndices: [0, 1],
          objectWorldMatrix: world.toArray(),
          deltaWorldMatrix: delta
        });
        const after = selectedVertexPivotWorld({
          positions: result,
          selectedIndices: [0, 1],
          objectWorldMatrix: world.toArray()
        });
        assertVectorNear(after, pivot);
      },

      "prévia reutiliza buffer de posições sem alterar vértices não selecionados"() {
        const source = [[0, 0, 0], [1, 0, 0], [2, 0, 0]];
        const target = source.map(point => [...point]);
        const result = transformLocalPositionsInto({
          sourcePositions: source,
          targetPositions: target,
          selectedIndices: [1],
          objectWorldMatrix: new THREE.Matrix4().toArray(),
          deltaWorldMatrix: new THREE.Matrix4()
            .makeTranslation(0, 2, 0)
            .toArray()
        });
        assertEqual(result, target);
        assertDeepEqual(result, [[0, 0, 0], [1, 2, 0], [2, 0, 0]]);
      },

      "grade absoluta acompanha o frame congelado do viewer"() {
        const frame = new THREE.Quaternion()
          .setFromEuler(new THREE.Euler(0, Math.PI / 2, 0))
          .toArray();
        const snapped = snapWorldPointToFrameGrid({
          pointWorld: [0.1, 1.6, -2.4],
          frameQuaternion: frame,
          step: 1
        });
        assertVectorNear(snapped, [0, 2, -2]);
      },

      "seleção soldada inclui todos os registros coincidentes"() {
        const groups = coincidentVertexGroups([
          [0, 0, 0],
          [1, 0, 0],
          [0, 0, 0],
          [1 + 1e-8, 0, 0],
          [0.49e-6, 2, 0],
          [0.51e-6, 2, 0]
        ]);
        assertDeepEqual(
          expandCoincidentSelection([0, 1, 4], groups),
          [0, 1, 2, 3, 4, 5]
        );
      },

      "restrições de eixo e plano são comuns a move rotate e scale"() {
        assertDeepEqual(
          constrainAffineValue({ type: "move", value: [1, 2, 3], constraint: "xy" }),
          [1, 2, 0]
        );
        assertDeepEqual(
          constrainAffineValue({ type: "rotate", value: [10, 20, 30], constraint: "z" }),
          [0, 0, 30]
        );
        assertDeepEqual(
          constrainAffineValue({ type: "scale", value: [2, 3, 4], constraint: "xz" }),
          [2, 1, 4]
        );
        const constrained = constrainWorldDeltaMatrix({
          type: "move",
          deltaWorldMatrix: new THREE.Matrix4().makeTranslation(1, 2, 3).toArray(),
          constraint: "x"
        });
        assertVectorNear(
          new THREE.Vector3().setFromMatrixPosition(
            new THREE.Matrix4().fromArray(constrained)
          ).toArray(),
          [1, 0, 0]
        );
      },

      "topologia deriva arestas faces e distância geodésica"() {
        const positions = [
          [0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]
        ];
        const topology = buildMeshTopology({
          positions,
          indices: [0, 1, 2, 0, 2, 3]
        });
        assertEqual(topology.faceCount, 2);
        assertEqual(topology.edgeCount, 5);
        const distances = geodesicVertexDistances({
          positions,
          topology,
          seeds: [0]
        });
        assertNear(distances[1], 1);
        assertNear(distances[3], 1);
        assertNear(distances[2], Math.sqrt(2));
      },

      "deformação procedural usa campo geodésico sem alterar seleção"() {
        const result = applyMeshDeformation({
          descriptor: {
            positions: [[0, 0, 0], [1, 0, 0], [2, 0, 0]],
            indices: [0, 1, 2],
            normals: [],
            uvs: []
          },
          selectedIndices: [0],
          objectWorldMatrix: new THREE.Matrix4().toArray(),
          operation: "move",
          expressions: ["2*w", "0", "0"],
          radius: 2,
          metric: "geodesic",
          falloff: "smooth",
          constraint: "x"
        });
        assertVectorNear(result.positions[0], [2, 0, 0]);
        assertVectorNear(result.positions[1], [2, 0, 0]);
        assertVectorNear(result.positions[2], [2, 0, 0]);
        assertDeepEqual(result.affectedIndices, [0, 1, 2]);
      },

      "campo proporcional geodésico move vértices conectados em tempo real"() {
        const descriptor = {
          positions: [[0, 0, 0], [1, 0, 0], [2, 0, 0], [8, 0, 0]],
          indices: [0, 1, 2],
          normals: [],
          uvs: []
        };
        const field = createMeshInfluenceField({
          descriptor,
          selectedIndices: [0],
          objectWorldMatrix: new THREE.Matrix4().toArray(),
          radius: 2,
          metric: "geodesic",
          falloff: "linear"
        });
        assertDeepEqual(field.affectedIndices, [0, 1, 2]);
        assertNear(field.weights[0], 1);
        assertNear(field.weights[1], 0.5);
        assertNear(field.weights[2], 0);
        const target = descriptor.positions.map(point => [...point]);
        transformLocalPositionsWithInfluenceInto({
          sourcePositions: descriptor.positions,
          targetPositions: target,
          affectedIndices: field.affectedIndices,
          weights: field.weights,
          objectWorldMatrix: new THREE.Matrix4().toArray(),
          deltaWorldMatrix: new THREE.Matrix4()
            .makeTranslation(4, 0, 0)
            .toArray(),
          type: "translate",
          pivotWorld: field.pivotWorld
        });
        assertVectorNear(target[0], [4, 0, 0]);
        assertVectorNear(target[1], [3, 0, 0]);
        assertVectorNear(target[2], [2, 0, 0]);
        assertVectorNear(target[3], [8, 0, 0]);
      },

      "rotação ponderada usa arco proporcional em vez de interpolar matriz"() {
        const source = [[1, 0, 0], [1, 0, 0]];
        const target = source.map(point => [...point]);
        transformLocalPositionsWithInfluenceInto({
          sourcePositions: source,
          targetPositions: target,
          affectedIndices: [0, 1],
          weights: [1, 0.5],
          objectWorldMatrix: new THREE.Matrix4().toArray(),
          deltaWorldMatrix: affineDeltaWorld({
            type: "rotate",
            value: [0, 0, 90],
            pivotWorld: [0, 0, 0]
          }),
          type: "rotate",
          pivotWorld: [0, 0, 0]
        });
        assertVectorNear(target[0], [0, 1, 0]);
        assertVectorNear(target[1], [Math.SQRT1_2, Math.SQRT1_2, 0]);
      },

      "entrada de malha seleciona o primeiro vértice e preserva a transformação"() {
        const region = new Region(
          { id: "mesh-entry-region", name: "Mesh entry", type: "box-region" },
          { objects: [{
            id: "mesh-entry-triangle",
            kind: "buffer",
            name: "Triângulo",
            position: [0, 0, 0],
            rotation: [0, 0, 0, 1],
            scale: [1, 1, 1],
            geometry: {
              type: "buffer",
              positions: [[0, 0, 0], [1, 0, 0], [0, 1, 0]],
              indices: [0, 1, 2],
              normals: [],
              uvs: []
            },
            material: { color: "#ffffff" }
          }] }
        );
        const sandbox = new Sandbox(region, boxRegionReducer);
        const editor = new EditorState();
        editor.setToolMode("scale");
        editor.setToolMode("select");
        editor.selection.replace({
          kind: "object",
          regionId: "mesh-entry-region",
          objectId: "mesh-entry-triangle"
        });
        const modes = [];
        let visual = null;
        const renderer = {
          ...createMeshEditorRendererStub(),
          beginMeshEdit(args) { visual = args; },
          setTransformMode(mode) {
            modes.push(mode);
            editor.setToolMode(mode);
          }
        };
        const controller = new MeshEditController({
          sandbox,
          editor,
          renderer,
          geometryRegistry: createDefaultGeometryRegistry()
        });
        const status = controller.enter();
        assertEqual(status.selectedCount, 1);
        assertEqual(status.activeVertex, 0);
        assertDeepEqual(visual.selectedIndices, [0]);
        assertEqual(modes.at(-1), "scale");
        assertEqual(editor.snapshot().tool.mode, "scale");
        controller.cancel();
        controller.dispose();
      },

      "histórico interno desfaz e refaz sem tocar no sandbox"() {
        const region = new Region(
          { id: "mesh-history-region", name: "Mesh", type: "box-region" },
          { objects: [{
            id: "mesh-history-box",
            kind: "box",
            name: "Caixa",
            position: [0, 0, 0],
            rotation: [0, 0, 0, 1],
            scale: [1, 1, 1],
            geometry: { type: "box", size: [2, 2, 2] },
            material: { color: "#ffffff" }
          }] }
        );
        const sandbox = new Sandbox(region, boxRegionReducer);
        const editor = new EditorState();
        editor.selection.replace({
          kind: "object",
          regionId: "mesh-history-region",
          objectId: "mesh-history-box"
        });
        let visual = null;
        const renderer = {
          beginMeshEdit(args) { visual = args; },
          endMeshEdit() { visual = null; },
          updateMeshEditGeometry(geometry) { visual.geometry = geometry; },
          updateMeshEditSelection() {},
          updateMeshEditOptions() {},
          updateMeshEditInfluence() {},
          setMeshEditFrame() {},
          setMeshEditConstraint() {},
          updateMeshEditSnap() {},
          setTransformMode() {},
          readNavigationCamera() { return { quaternion: [0, 0, 0, 1] }; }
        };
        const controller = new MeshEditController({
          sandbox,
          editor,
          renderer,
          geometryRegistry: createDefaultGeometryRegistry()
        });
        const projectUndoDepth = sandbox.getHistoryDiagnostics().undoDepth;
        controller.enter({ selectAll: true });
        controller.translate([1, 0, 0]);
        controller.rotate([0, 0, 15]);
        assertEqual(controller.status().undoDepth, 2);
        controller.undo();
        assertEqual(controller.status().undoDepth, 1);
        controller.undo();
        assertEqual(controller.status().dirty, false);
        controller.redo();
        assertEqual(controller.status().dirty, true);
        assertEqual(sandbox.getHistoryDiagnostics().undoDepth, projectUndoDepth);
        controller.commit();
        assertEqual(sandbox.getHistoryDiagnostics().undoDepth, projectUndoDepth + 1);
      },

      "controller aplica uma única troca de geometria no commit"() {
        const region = new Region(
          { id: "mesh-region", name: "Mesh", type: "box-region" },
          { objects: [{
            id: "mesh-box",
            kind: "box",
            name: "Caixa",
            position: [0, 0, 0],
            rotation: [0, 0, 0, 1],
            scale: [1, 1, 1],
            geometry: { type: "box", size: [2, 2, 2] },
            material: { color: "#ffffff" }
          }, {
            id: "other-box",
            kind: "box",
            name: "Outra caixa",
            position: [5, 0, 0],
            rotation: [0, 0, 0, 1],
            scale: [1, 1, 1],
            geometry: { type: "box", size: [1, 1, 1] },
            material: { color: "#888888" }
          }] }
        );
        const sandbox = new Sandbox(region, boxRegionReducer);
        const editor = new EditorState();
        editor.selection.replace({
          kind: "object",
          regionId: "mesh-region",
          objectId: "mesh-box"
        });
        let visual = null;
        let deferredCommits = 0;
        let immediateEnds = 0;
        const commitEvents = [];
        const unsubscribeCommitOrder = sandbox.subscribe(() => {
          commitEvents.push("sandbox-change");
        });
        const renderer = {
          beginMeshEdit(args) { visual = args; },
          endMeshEdit() { immediateEnds += 1; visual = null; },
          deferMeshEditCommit() {
            deferredCommits += 1;
            commitEvents.push("defer");
            return true;
          },
          cancelDeferredMeshEditCommit() {
            commitEvents.push("cancel-defer");
            return true;
          },
          updateMeshEditGeometry(geometry) { visual.geometry = geometry; },
          updateMeshEditSelection() {},
          updateMeshEditOptions() {},
          setMeshEditFrame() {},
          setTransformMode() {},
          readNavigationCamera() { return { quaternion: [0, 0, 0, 1] }; }
        };
        const controller = new MeshEditController({
          sandbox,
          editor,
          renderer,
          geometryRegistry: createDefaultGeometryRegistry()
        });
        controller.enter();
        controller.translate([1, 0, 0]);
        sandbox.dispatch({
          type: "object.update",
          id: "other-box",
          patch: { name: "Outra caixa renomeada" }
        });
        assertEqual(controller.status().stale, false);
        const undoDepthBeforeCommit =
          sandbox.getHistoryDiagnostics().undoDepth;
        commitEvents.length = 0;
        const result = controller.commit();
        const object = sandbox.getSnapshot().objects[0];
        assertEqual(result.changed, true);
        assertDeepEqual(commitEvents.slice(0, 2), [
          "defer",
          "sandbox-change"
        ]);
        assertEqual(deferredCommits, 1);
        assertEqual(immediateEnds, 0);
        assertEqual(object.geometry.type, "buffer");
        assertEqual(object.kind, "buffer");
        assertEqual(
          sandbox.getHistoryDiagnostics().undoDepth,
          undoDepthBeforeCommit + 1
        );
        assertEqual(sandbox.undo(), true);
        assertEqual(
          sandbox.getSnapshot().objects[0].geometry.type,
          "box"
        );
        unsubscribeCommitOrder();
      },

      "frame do viewer permanece congelado após mover a câmera"() {
        const region = new Region(
          { id: "mesh-frame-region", name: "Mesh", type: "box-region" },
          { objects: [{
            id: "mesh-frame-box",
            kind: "box",
            name: "Caixa",
            position: [0, 0, 0],
            rotation: [0, 0, 0, 1],
            scale: [1, 1, 1],
            geometry: { type: "box", size: [1, 1, 1] },
            material: { color: "#ffffff" }
          }] }
        );
        const sandbox = new Sandbox(region, boxRegionReducer);
        const editor = new EditorState();
        editor.selection.replace({
          kind: "object",
          regionId: "mesh-frame-region",
          objectId: "mesh-frame-box"
        });
        let cameraQuaternion = new THREE.Quaternion()
          .setFromEuler(new THREE.Euler(0.2, 0.4, -0.1))
          .toArray();
        const renderer = {
          beginMeshEdit() {},
          endMeshEdit() {},
          updateMeshEditGeometry() {},
          updateMeshEditSelection() {},
          updateMeshEditOptions() {},
          setMeshEditFrame() {},
          setTransformMode() {},
          readNavigationCamera() { return { quaternion: cameraQuaternion }; }
        };
        const controller = new MeshEditController({
          sandbox,
          editor,
          renderer,
          geometryRegistry: createDefaultGeometryRegistry()
        });
        controller.enter();
        controller.setFrame("viewer");
        const frozen = controller.status().frameQuaternion;
        cameraQuaternion = new THREE.Quaternion()
          .setFromEuler(new THREE.Euler(-0.7, 1.1, 0.5))
          .toArray();
        assertVectorNear(controller.status().frameQuaternion, frozen);
        const undoDepth = sandbox.getHistoryDiagnostics().undoDepth;
        const result = controller.commit();
        assertEqual(result.changed, false);
        assertEqual(sandbox.getHistoryDiagnostics().undoDepth, undoDepth);
      },

      "status de seleção única não normaliza descritor buffer"() {
        let normalizeCalls = 0;
        const geometryRegistry = new GeometryRegistry().register({
          type: "buffer",
          normalize(input) {
            normalizeCalls += 1;
            return Object.freeze({ ...input, type: "buffer" });
          },
          create() {
            return new THREE.BufferGeometry();
          }
        });
        const object = {
          id: "dense-buffer",
          kind: "buffer",
          name: "Malha densa",
          position: [0, 0, 0],
          rotation: [0, 0, 0, 1],
          scale: [1, 1, 1],
          geometry: {
            type: "buffer",
            positions: Array.from({ length: 2000 }, (_, index) =>
              [index, 0, 0]
            ),
            indices: [],
            normals: [],
            uvs: [],
            edges: []
          }
        };
        const region = new Region(
          {
            id: "mesh-status-region",
            name: "Mesh",
            type: "box-region"
          },
          { objects: [object] }
        );
        const sandbox = new Sandbox(region, boxRegionReducer);
        const editor = new EditorState();
        editor.selection.replace({
          kind: "object",
          regionId: "mesh-status-region",
          objectId: object.id
        });
        const controller = new MeshEditController({
          sandbox,
          editor,
          renderer: {
            beginMeshEdit() {},
            endMeshEdit() {},
            canBeginMeshEdit() {
              return { ok: true };
            }
          },
          geometryRegistry
        });

        assertEqual(geometryRegistry.supportsLegacyObject(object), true);
        assertEqual(controller.status().canEnter, true);
        assertEqual(normalizeCalls, 0);
        controller.dispose?.();
      },

      "entrada é recusada enquanto a malha participa de animação"() {
        const region = new Region(
          { id: "mesh-block-region", name: "Mesh", type: "box-region" },
          { objects: [{
            id: "mesh-block-box",
            kind: "box",
            name: "Caixa",
            position: [0, 0, 0],
            rotation: [0, 0, 0, 1],
            scale: [1, 1, 1],
            geometry: { type: "box", size: [1, 1, 1] },
            material: { color: "#ffffff" }
          }] }
        );
        const sandbox = new Sandbox(region, boxRegionReducer);
        const editor = new EditorState();
        editor.selection.replace({
          kind: "object",
          regionId: "mesh-block-region",
          objectId: "mesh-block-box"
        });
        const renderer = {
          beginMeshEdit() {},
          endMeshEdit() {},
          updateMeshEditGeometry() {},
          updateMeshEditSelection() {},
          updateMeshEditOptions() {},
          setMeshEditFrame() {},
          setTransformMode() {},
          readNavigationCamera() { return { quaternion: [0, 0, 0, 1] }; },
          canBeginMeshEdit() {
            return { ok: false, reason: "animation-active" };
          }
        };
        const controller = new MeshEditController({
          sandbox,
          editor,
          renderer,
          geometryRegistry: createDefaultGeometryRegistry()
        });
        const status = controller.status();
        assertEqual(status.canEnter, false);
        assert(status.reason.includes("animação"));
        assertThrowsMessage(() => controller.enter(), "animação");
      }
    },
    "mesh-render-profile": {
      "recalcular normais preserva posições índices e UVs byte a byte"() {
        const descriptor = {
          type: "buffer",
          positions: [
            [0,0,0], [1,0,0], [0,1,0],
            [9,9,9]
          ],
          indices: [0,1,2],
          normals: [
            [0,0,1], [0,0,1], [0,0,1],
            [1,0,0]
          ],
          uvs: [[0,0], [1,0], [0,1], [0.5,0.5]],
          edges: []
        };
        const result = applyMeshTopologyOperation({
          descriptor,
          topology: topologyOf(descriptor),
          componentMode: "vertex",
          selectedIndices: [],
          operation: "recalculate-normals",
          options: { removeUnused: true, manifoldOnly: true }
        });
        assertDeepEqual(result.descriptor.positions, descriptor.positions);
        assertDeepEqual(result.descriptor.indices, descriptor.indices);
        assertDeepEqual(result.descriptor.uvs, descriptor.uvs);
        assertEqual(result.descriptor.normals.length, descriptor.positions.length);
      },

      "classificação fechada ignora duplicações de costura"() {
        const geometry = new THREE.SphereGeometry(1, 24, 16);
        const position = geometry.getAttribute("position");
        const positions = Array.from({ length: position.count }, (_, index) => [
          position.getX(index), position.getY(index), position.getZ(index)
        ]);
        const indices = Array.from(geometry.index.array);
        assertDeepEqual(
          classifyBufferRenderProfile({ positions, indices }),
          { topology: "closed-solid", side: "front" }
        );
        geometry.dispose();
      },

      "buffer normalizado conserva perfil fechado no renderer"() {
        const registry = createDefaultGeometryRegistry();
        const descriptor = registry.normalize({
          type: "buffer",
          positions: [
            [1,1,1], [-1,-1,1], [-1,1,-1], [1,-1,-1]
          ],
          indices: [0,2,1, 0,1,3, 0,3,2, 1,2,3],
          normals: [],
          uvs: [],
          edges: []
        });
        assertDeepEqual(descriptor.renderProfile, {
          topology: "closed-solid",
          side: "front"
        });
        assertDeepEqual(registry.renderProfile(descriptor), {
          topology: "closed-solid",
          side: "front"
        });
      },

      "superfície aberta continua dupla face"() {
        assertDeepEqual(classifyBufferRenderProfile({
          positions: [[0,0,0], [1,0,0], [0,1,0]],
          indices: [0,1,2]
        }), {
          topology: "open-surface",
          side: "double"
        });
      }
    },

    "mesh-attribute-policy": {
      "no-op numérico preserva índices UVs e normais importadas"() {
        const before = {
          type: "buffer",
          positions: [[0,0,0], [1,0,0], [0,1,0]],
          indices: [0,1,2],
          normals: [[0,0,1], [0,0,1], [0,0,1]],
          uvs: [[0,0], [1,0], [0,1]],
          edges: []
        };
        const after = structuredClone(before);
        after.positions[1][0] += 1e-10;
        const prepared = prepareMeshCommitDescriptor({
          before,
          after,
          autoNormals: true,
          normalPolicy: "recompute-local"
        });
        assertEqual(prepared.changed, false);
        assertDeepEqual(prepared.descriptor.indices, before.indices);
        assertDeepEqual(prepared.descriptor.uvs, before.uvs);
        assertDeepEqual(prepared.descriptor.normals, before.normals);
      },

      "recalculo local preserva normais fora da vizinhança alterada"() {
        const positions = [
          [0,0,0], [1,0,0], [0,1,0],
          [10,0,0], [11,0,0], [10,1,0]
        ];
        const sourceNormals = positions.map(() => [0,0,1]);
        const moved = positions.map(point => [...point]);
        moved[2] = [0,1,1];
        const normals = recomputeLocalVertexNormals({
          positions: moved,
          indices: [0,1,2, 3,4,5],
          sourceNormals,
          changedVertexIndices: [2]
        });
        assertEqual(normals.length, 6);
        assertEqual(Math.abs(normals[0][1]) > 0, true);
        assertDeepEqual(normals.slice(3), sourceNormals.slice(3));
      },

      "seleção de face inclui cópias coincidentes da costura"() {
        const descriptor = {
          type: "buffer",
          positions: [
            [0,0,0], [1,0,0], [0,1,0],
            [1,0,0], [1,1,0], [0,1,0]
          ],
          indices: [0,1,2, 3,4,5],
          normals: [],
          uvs: [[0,0], [0.5,0], [0,1], [0.5,0], [1,1], [0,1]],
          edges: []
        };
        const topology = topologyOf(descriptor);
        const groups = coincidentVertexGroups(descriptor.positions);
        const selected = resolveTransformVertexSelection({
          topology,
          componentMode: "face",
          selectedComponents: [0],
          coincidentGroups: groups,
          policy: "transform-together"
        });
        assertDeepEqual(selected, [0,1,2,3,5]);
      },

      "falloff geodésico usa identidade geométrica nas costuras"() {
        const descriptor = {
          type: "buffer",
          positions: [
            [0,0,0], [1,0,0], [2,0,0],
            [0,0,0], [0,1,0], [0,2,0]
          ],
          indices: [0,1,2, 3,4,5],
          normals: [],
          uvs: []
        };
        const identity = buildGeometricVertexIdentity({
          positions: descriptor.positions,
          indices: descriptor.indices
        });
        assertEqual(identity.renderVertexCount, 6);
        assertEqual(identity.geometricVertexCount, 5);
        const field = createMeshInfluenceField({
          descriptor,
          selectedIndices: [0],
          objectWorldMatrix: new THREE.Matrix4().toArray(),
          radius: 2,
          metric: "geodesic",
          falloff: "linear",
          geometricIdentity: identity
        });
        const weight = new Map(field.affectedIndices.map(
          (index, order) => [index, field.weights[order]]
        ));
        assertNear(weight.get(0), 1);
        assertNear(weight.get(3), 1);
        assertNear(weight.get(1), 0.5);
        assertNear(weight.get(4), 0.5);
        assertNear(weight.get(2), 0);
        assertNear(weight.get(5), 0);
      },

      "movimento posicional recalcula normais derivadas ao aplicar"() {
        const before = {
          type: "buffer",
          positions: [[0,0,0], [1,0,0], [0,1,0]],
          indices: [0,1,2],
          normals: [[0,0,1], [0,0,1], [0,0,1]],
          uvs: [[0,0], [1,0], [0,1]],
          edges: []
        };
        const after = structuredClone(before);
        after.positions[2] = [0,1,0.5];
        const prepared = prepareMeshCommitDescriptor({ before, after });
        assertEqual(prepared.changed, true);
        assertEqual(prepared.change.normalPolicy, "recompute-local");
        assertEqual(Math.abs(prepared.descriptor.normals[0][1]) > 0, true);
        assertDeepEqual(prepared.descriptor.uvs, before.uvs);
      },

      "recalcular normais produz atributo persistível após deformação"() {
        const initial = {
          type: "buffer",
          positions: [[0,0,0], [1,0,0], [0,1,0]],
          indices: [0,1,2],
          normals: [[0,0,1], [0,0,1], [0,0,1]],
          uvs: [[0,0], [1,0], [0,1]],
          edges: []
        };
        const deformed = structuredClone(initial);
        deformed.positions[2] = [0,1,0.5];
        const result = applyMeshTopologyOperation({
          descriptor: deformed,
          topology: topologyOf(deformed),
          componentMode: "vertex",
          selectedIndices: [],
          operation: "recalculate-normals",
          options: { manifoldOnly: true }
        });
        assertEqual(result.descriptor.normals.length, 3);
        assertEqual(Math.abs(result.descriptor.normals[0][1]) > 0, true);
        const prepared = prepareMeshCommitDescriptor({
          before: initial,
          after: result.descriptor,
          normalPolicy: "recompute-local",
          preferTargetNormals: true
        });
        assertDeepEqual(
          prepared.descriptor.normals,
          result.descriptor.normals
        );
      },



      "movimento posterior invalida normais explicitamente recalculadas"() {
        const initial = {
          type: "buffer",
          positions: [[0,0,0], [1,0,0], [0,1,0]],
          indices: [0,1,2],
          normals: [[0,0,1], [0,0,1], [0,0,1]],
          uvs: [],
          edges: []
        };
        const afterExplicit = structuredClone(initial);
        afterExplicit.positions[2] = [0,1,0.5];
        afterExplicit.normals = recomputeVertexNormals({
          positions: afterExplicit.positions,
          indices: afterExplicit.indices,
          sourceNormals: initial.normals
        });
        const movedAgain = structuredClone(afterExplicit);
        movedAgain.positions[2] = [0,1,1];
        const prepared = prepareMeshCommitDescriptor({
          before: initial,
          after: movedAgain,
          normalPolicy: "recompute-local",
          preferTargetNormals: false
        });
        assertEqual(
          Math.abs(prepared.descriptor.normals[0][1]) >
            Math.abs(afterExplicit.normals[0][1]),
          true
        );
      },

      "costura suave compartilha normal sem fundir aresta dura"() {
        const smooth = recomputeVertexNormals({
          positions: [
            [0,0,0], [1,0,0], [0,1,0],
            [0,0,0], [0,1,0], [-1,0,0.5]
          ],
          indices: [0,1,2, 3,4,5],
          sourceNormals: [
            [0,0,1], [0,0,1], [0,0,1],
            [0,0,1], [0,0,1], [0,0,1]
          ]
        });
        assertVectorNear(smooth[0], smooth[3]);
        assertVectorNear(smooth[2], smooth[4]);

        const hard = recomputeVertexNormals({
          positions: [
            [0,0,0], [1,0,0], [0,1,0],
            [0,0,0], [0,0,1], [1,0,0]
          ],
          indices: [0,1,2, 3,4,5],
          sourceNormals: [
            [0,0,1], [0,0,1], [0,0,1],
            [0,1,0], [0,1,0], [0,1,0]
          ]
        });
        assertEqual(Math.abs(hard[0][2]) > 0.9, true);
        assertEqual(Math.abs(hard[3][1]) > 0.9, true);
      },

      "sanitização remapeia e preserva normais e UVs"() {
        const descriptor = {
          type: "buffer",
          positions: [[0,0,0], [1,0,0], [0,1,0], [9,9,9]],
          indices: [0,1,2],
          normals: [[0,0,1], [0,0,1], [0,0,1], [1,0,0]],
          uvs: [[0,0], [1,0], [0,1], [0.5,0.5]],
          edges: []
        };
        const result = applyMeshTopologyOperation({
          descriptor,
          topology: topologyOf(descriptor),
          componentMode: "vertex",
          selectedIndices: [],
          operation: "cleanup",
          options: { removeUnused: true }
        });
        assertEqual(result.descriptor.positions.length, 3);
        assertDeepEqual(result.descriptor.normals, descriptor.normals.slice(0,3));
        assertDeepEqual(result.descriptor.uvs, descriptor.uvs.slice(0,3));
      },

      "visibilidade de edição oculta o recurso real do proprietário"() {
        const manager = new InstanceBatchManager();
        const geometry = new THREE.BoxGeometry(1, 1, 1);
        const material = new THREE.MeshBasicMaterial();
        manager.add({
          objectId: "owner",
          resourceId: "owner:resource:0",
          ownerId: "owner",
          batchKey: "mesh-visibility",
          matrix: new THREE.Matrix4().makeTranslation(4, 5, 6),
          descriptor: { geometry, material, capacity: 4 }
        });
        const dirty = [];
        const visibility = new MeshEditVisibility({
          batchManager: manager,
          markBatchDirty: key => dirty.push(key)
        });
        const hidden = visibility.setHidden(
          "owner",
          true,
          new THREE.Matrix4().makeTranslation(4, 5, 6)
        );
        assertEqual(hidden.standardResourceCount, 1);
        assertEqual(hidden.standardWrites, 1);
        const location = manager.locationOf("owner:resource:0");
        const batch = manager.getBatch(location.batchKey);
        const matrix = new THREE.Matrix4();
        batch.mesh.getMatrixAt(location.instanceIndex, matrix);
        assertNear(matrix.elements[0], 0);
        assertNear(matrix.elements[5], 0);
        assertNear(matrix.elements[10], 0);
        visibility.setHidden(
          "owner",
          false,
          new THREE.Matrix4().makeTranslation(4, 5, 6)
        );
        batch.mesh.getMatrixAt(location.instanceIndex, matrix);
        assertVectorNear(
          new THREE.Vector3().setFromMatrixPosition(matrix).toArray(),
          [4,5,6]
        );
        assert(dirty.length >= 2);
        manager.clear({ disposeGeometry: true, disposeMaterial: true });
      },

      "registro descreve ferramentas e mantém executor legado substituível"() {
        const calls = [];
        const registry = new MeshToolRegistry({
          tools: [{
            id: "mesh.topology.example",
            kind: "topology",
            operation: "example",
            label: "Exemplo",
            modes: ["face"],
            requiresSelection: true,
            implementation: "test-double"
          }],
          executors: {
            topology(context) {
              calls.push(context.operation);
              return { ok: true };
            }
          }
        });
        const listed = registry.list({ mode: "face", selectionCount: 1 });
        assertEqual(listed[0].available.ok, true);
        const executed = registry.execute("mesh.topology.example", {
          mode: "face",
          selectedIndices: [0]
        });
        assertDeepEqual(calls, ["example"]);
        assertEqual(executed.result.ok, true);
        assertEqual(executed.tool.implementation, "test-double");
      }
    },
    "mesh-exchange": {
      "STL ASCII entra como malha indexada editável"() {
        const ascii = [
          "solid square",
          "facet normal 0 0 1",
          "outer loop",
          "vertex 0 0 0",
          "vertex 1 0 0",
          "vertex 1 1 0",
          "endloop",
          "endfacet",
          "facet normal 0 0 1",
          "outer loop",
          "vertex 0 0 0",
          "vertex 1 1 0",
          "vertex 0 1 0",
          "endloop",
          "endfacet",
          "endsolid square"
        ].join("\n");
        const decoded = decodeStl(ascii);
        assertEqual(decoded.encoding, "ascii");
        assertEqual(decoded.triangleCount, 2);
        assertEqual(decoded.geometry.positions.length, 4);
        assertEqual(decoded.geometry.indices.length, 6);
      },

      "STL binário exportado faz round-trip"() {
        const triangles = [0,0,0, 1,0,0, 0,1,0];
        const binary = encodeBinaryStl([{ triangles }]);
        const decoded = decodeStl(binary, { mergeVertices: false });
        assertEqual(decoded.encoding, "binary");
        assertEqual(decoded.triangleCount, 1);
        assertDeepEqual(decoded.geometry.positions[1], [1,0,0]);
        const ascii = encodeAsciiStl([{ triangles }], { name: "tri" });
        assertEqual(ascii.includes("facet normal"), true);
      },

      "projeção STL aplica matriz mundial do objeto"() {
        const registry = createDefaultGeometryRegistry();
        const triangles = objectTriangleSoup({
          object: { id: "box", kind: "box", size: [2,2,2] },
          worldMatrix: [
            1,0,0,0,
            0,1,0,0,
            0,0,1,0,
            3,4,5,1
          ],
          geometryRegistry: registry
        });
        assertEqual(triangles.length > 0, true);
        assertEqual(Math.min(...triangles.filter((_, index) => index % 3 === 0)), 2);
        assertEqual(Math.max(...triangles.filter((_, index) => index % 3 === 0)), 4);
      },

      "serviço de intercâmbio cria objeto e exporta seleção"() {
        let created = null;
        const service = new MeshExchangeService({
          selection: () => ({
            members: [{ objectId: "obj" }],
            activeMember: { objectId: "obj" }
          }),
          readObject: id => ({ id, name: "Objeto", kind: "buffer", geometry: {
            type: "buffer", positions: [[0,0,0],[1,0,0],[0,1,0]], indices: [0,1,2], normals: [], uvs: [], edges: []
          } }),
          readWorldMatrix: () => [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1],
          triangulateObject: () => [0,0,0, 1,0,0, 0,1,0],
          createGeometry: args => { created = args; return { changed: true, id: "new" }; }
        });
        const imported = service.importStl({
          filename: "triangle.stl",
          data: encodeBinaryStl([{ triangles: [0,0,0, 1,0,0, 0,1,0] }])
        });
        assertEqual(imported.imported, true);
        assertEqual(created.name, "triangle");
        const exported = service.exportSelectionStl();
        assertEqual(exported.prepared, true);
        assertEqual(exported.objectCount, 1);
        assertEqual(exported.triangleCount, 1);
        assertEqual(exported.filename, "Objeto.stl");
      }
    },

    "mesh-topology": {
      "contrato de extrusão declara caminho local e reta por padrão"() {
        const contract = meshOperatorContract("extrude");
        assertEqual(contract.interaction.kind, "path");
        assertEqual(contract.interaction.defaultMode, "drag-line");
        assertEqual(contract.interaction.pathSpace, "mesh-local");
      },

      "álgebra de caminho distingue reta do arrasto e traço completo"() {
        const points = [[0,0,0], [1,1,0], [2,0,0]];
        const line = prepareMeshPath({ points, mode: "drag-line" });
        const drawn = prepareMeshPath({ points, mode: "drawn" });
        assertEqual(line.points.length, 2);
        assertEqual(drawn.points.length, 3);
        assertDeepEqual(line.points[1], [2,0,0]);
      },

      "extrusão por polilinha compõe extrusões sem depender da interface"() {
        const descriptor = cubeBufferDescriptor();
        const result = applyMeshTopologyOperation({
          descriptor,
          topology: topologyOf(descriptor),
          componentMode: "face",
          selectedIndices: [0],
          operation: "extrude",
          options: {
            path: [[0,0,0], [0.5,0,0], [0.5,0.5,0]],
            pathMode: "explicit",
            manifoldOnly: true
          }
        });
        assertEqual(result.diagnostics.path.segmentCount, 2);
        assertEqual(result.diagnostics.nonManifoldEdgeCount, 0);
        assertEqual(result.selection.mode, "face");
      },

      "meia-aresta reconstrói adjacência e manifold fechado"() {
        const descriptor = cubeBufferDescriptor();
        const topology = topologyOf(descriptor);
        assertEqual(topology.vertexCount, 8);
        assertEqual(topology.edgeCount, 18);
        assertEqual(topology.faceCount, 12);
        assertEqual(topology.halfEdges.length, 36);
        assertEqual(topology.boundaryEdges.length, 0);
        assertEqual(topology.nonManifoldEdges.length, 0);
        assert(topology.halfEdges.every(edge => edge.twin !== null));
      },

      "tensor de covariância cria e triangula face inclinada"() {
        const descriptor = {
          type: "buffer",
          positions: [[0,0,0], [2,0,2], [2,2,4], [0,2,2]],
          indices: [], normals: [], uvs: [], edges: []
        };
        const result = applyMeshTopologyOperation({
          descriptor,
          topology: topologyOf(descriptor),
          componentMode: "vertex",
          selectedIndices: [0, 1, 2, 3],
          operation: "create-face",
          options: { manifoldOnly: true }
        });
        assertEqual(result.diagnostics.faceCount, 2);
        assertEqual(result.diagnostics.boundaryEdgeCount, 4);
        assertEqual(result.selection.mode, "face");
        assertEqual(result.selection.indices.length, 2);
      },

      "extrusão de face mantém malha fechada e manifold"() {
        const descriptor = cubeBufferDescriptor();
        const result = applyMeshTopologyOperation({
          descriptor,
          topology: topologyOf(descriptor),
          componentMode: "face",
          selectedIndices: [0],
          operation: "extrude",
          options: { distance: 1, manifoldOnly: true }
        });
        assertEqual(result.diagnostics.vertexCount, 11);
        assertEqual(result.diagnostics.faceCount, 18);
        assertEqual(result.diagnostics.boundaryEdgeCount, 0);
        assertEqual(result.diagnostics.nonManifoldEdgeCount, 0);
      },

      "divisão e colapso de aresta preservam índices válidos"() {
        const descriptor = cubeBufferDescriptor();
        const topology = topologyOf(descriptor);
        const split = applyMeshTopologyOperation({
          descriptor,
          topology,
          componentMode: "edge",
          selectedIndices: [0],
          operation: "split",
          options: { parameter: 0.5, manifoldOnly: true }
        });
        assertEqual(split.diagnostics.vertexCount, 9);
        assertEqual(split.diagnostics.nonManifoldEdgeCount, 0);
        const collapse = applyMeshTopologyOperation({
          descriptor: split.descriptor,
          topology: split.topology,
          componentMode: "edge",
          selectedIndices: split.selection.indices.slice(0, 1),
          operation: "collapse",
          options: { manifoldOnly: true, preserveBoundary: false }
        });
        assertEqual(collapse.diagnostics.nonManifoldEdgeCount, 0);
        assert(collapse.descriptor.indices.every(index =>
          index >= 0 && index < collapse.descriptor.positions.length
        ));
      },

      "ponte une dois contornos completos"() {
        const descriptor = {
          type: "buffer",
          positions: [
            [-1,-1,0], [1,-1,0], [1,1,0], [-1,1,0],
            [-1,-1,2], [-1,1,2], [1,1,2], [1,-1,2]
          ],
          indices: [0,1,2, 0,2,3, 4,5,6, 4,6,7],
          normals: [], uvs: [], edges: []
        };
        const topology = topologyOf(descriptor);
        const selectedEdges = topology.edges
          .filter(edge => edge.faces.length === 1)
          .map(edge => edge.index);
        const result = applyMeshTopologyOperation({
          descriptor,
          topology,
          componentMode: "edge",
          selectedIndices: selectedEdges,
          operation: "bridge",
          options: { manifoldOnly: true }
        });
        assertEqual(result.diagnostics.boundaryEdgeCount, 0);
        assertEqual(result.diagnostics.nonManifoldEdgeCount, 0);
        assertEqual(result.diagnostics.faceCount, 12);
      },

      "normal de face é invertida trocando a orientação"() {
        const descriptor = {
          type: "buffer",
          positions: [[0,0,0], [1,0,0], [0,1,0]],
          indices: [0,1,2], normals: [], uvs: [], edges: []
        };
        const result = applyMeshTopologyOperation({
          descriptor,
          topology: topologyOf(descriptor),
          componentMode: "face",
          selectedIndices: [0],
          operation: "flip-normal"
        });
        assertDeepEqual(result.descriptor.indices, [0,2,1]);
      },

      "limpeza remove vértices sem uso"() {
        const descriptor = {
          type: "buffer",
          positions: [[0,0,0], [1,0,0], [0,1,0], [99,99,99]],
          indices: [0,1,2], normals: [], uvs: [], edges: []
        };
        const result = applyMeshTopologyOperation({
          descriptor,
          topology: topologyOf(descriptor),
          componentMode: "vertex",
          selectedIndices: [],
          operation: "cleanup",
          options: { removeUnused: true }
        });
        assertEqual(result.diagnostics.vertexCount, 3);
      },

      "undo interno restaura operação topológica completa"() {
        const region = new Region(
          { id: "mesh-topology-region", name: "Mesh", type: "box-region" },
          { objects: [{
            id: "mesh-topology-box",
            kind: "box",
            name: "Caixa",
            position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1],
            geometry: { type: "box", size: [1, 1, 1] },
            material: { color: "#ffffff" }
          }] }
        );
        const sandbox = new Sandbox(region, boxRegionReducer);
        const editor = new EditorState();
        editor.selection.replace({
          kind: "object", regionId: "mesh-topology-region", objectId: "mesh-topology-box"
        });
        const renderer = {
          beginMeshEdit(args) { this.onComponentPick = args.onComponentPick; },
          endMeshEdit() {}, updateMeshEditGeometry() {},
          updateMeshEditSelection() {}, updateMeshEditComponentSelection() {},
          updateMeshEditOptions() {}, updateMeshEditDisplay() {},
          setMeshEditFrame() {}, setMeshEditComponentMode() {}, setTransformMode() {},
          readNavigationCamera() { return { quaternion: [0, 0, 0, 1] }; }
        };
        const controller = new MeshEditController({
          sandbox, editor, renderer,
          geometryRegistry: createDefaultGeometryRegistry()
        });
        controller.enter();
        controller.setComponentMode("face");
        renderer.onComponentPick({ mode: "face", index: 0, operation: "replace" });
        const before = controller.status().vertexCount;
        controller.applyTopology({ operation: "extrude", options: { distance: 0.5 } });
        const after = controller.status().vertexCount;
        assert(after > before);
        controller.undo();
        assertEqual(controller.status().vertexCount, before);
        controller.redo();
        assertEqual(controller.status().vertexCount, after);
        controller.cancel();
      }
    },
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
      },

      "console executa consulta registrada por identificador canônico"() {
        const calls = [];
        const console = new DevConsole({
          editor: { selection: new Selection() },
          sandbox: {},
          region: {},
          renderer: {},
          getDiagnostics: () => ({}),
          commands: {
            execute() {
              throw new Error("Comando inesperado.");
            },
            describe() {
              return [];
            }
          },
          queries: {
            execute(id, args) {
              calls.push({ id, args });
              return { captured: true, label: args.label };
            },
            describe() {
              return [{ id: "mesh.audit.capture", metadata: {} }];
            }
          }
        });

        const [entry] = console.execute(
          'runtime query mesh.audit.capture {"label":"sphere-before"}'
        );

        assertEqual(entry.ok, true);
        assertEqual(entry.result.captured, true);
        assertDeepEqual(calls, [{
          id: "mesh.audit.capture",
          args: { label: "sphere-before" }
        }]);
      },

      "console executa comando registrado sem regra dedicada"() {
        const calls = [];
        const console = new DevConsole({
          editor: { selection: new Selection() },
          sandbox: {},
          region: {},
          renderer: {},
          getDiagnostics: () => ({}),
          commands: {
            execute(id, args) {
              calls.push({ id, args });
              return { changed: true };
            },
            describe() {
              return [{ id: "diagnostic.sample.run", metadata: {} }];
            }
          },
          queries: {
            execute() {
              throw new Error("Consulta inesperada.");
            },
            describe() {
              return [];
            }
          }
        });

        const [entry] = console.execute(
          'runtime command diagnostic.sample.run {"count":2}'
        );

        assertEqual(entry.ok, true);
        assertDeepEqual(calls, [{
          id: "diagnostic.sample.run",
          args: { count: 2 }
        }]);
      }
    },

    "runtime-profile": {
      "autoria permanece o perfil padrão"() {
        const profile = resolveRuntimeProfile();
        assertEqual(profile.id, "authoring");
        assertEqual(profile.capabilities.edit, true);
        assertEqual(profile.capabilities.inspect, true);
      },

      "apresentação e interop restringem capacidades"() {
        const presentation = resolveRuntimeProfile("presentation");
        const interop = resolveRuntimeProfile("interop");
        assertEqual(presentation.capabilities.render, true);
        assertEqual(presentation.capabilities.edit, false);
        assertEqual(interop.capabilities.interactive, false);
        assertEqual(interop.capabilities.interop, true);
        assertEqual(describeRuntimeProfiles().length, 3);
      },

      "atualizações de UI são consolidadas por quadro"() {
        let scheduled = null;
        let refreshes = 0;
        let reasons = [];
        const coordinator = new UiRefreshCoordinator({
          refresh(nextReasons) {
            refreshes += 1;
            reasons = [...nextReasons];
          },
          schedule(callback) {
            scheduled = callback;
            return 7;
          },
          cancel() {}
        });

        assertEqual(coordinator.request("world.changed"), true);
        assertEqual(coordinator.request("selection.changed"), false);
        assertEqual(coordinator.request("editor.changed"), false);
        assertEqual(refreshes, 0);
        scheduled();
        const snapshot = coordinator.snapshot();
        assertEqual(refreshes, 1);
        assertDeepEqual(reasons, [
          "world.changed",
          "selection.changed",
          "editor.changed"
        ]);
        assertEqual(snapshot.requests, 3);
        assertEqual(snapshot.coalesced, 2);
        assertEqual(snapshot.refreshes, 1);
        assertEqual(snapshot.pending, false);
      },

      "console expõe perfil e estatísticas da UI"() {
        const console = new DevConsole({
          editor: { selection: new Selection() },
          sandbox: {},
          region: {},
          renderer: {},
          getDiagnostics: () => ({}),
          commands: {
            execute() { return null; },
            describe() { return []; }
          },
          queries: {
            execute(id) {
              if (id === "runtime.profile") {
                return resolveRuntimeProfile();
              }
              if (id === "runtime.ui-stats") {
                return { connected: true, refreshes: 2 };
              }
              throw new Error(`Consulta inesperada: ${id}.`);
            }
          }
        });

        const profile = console.execute("runtime profile")[0];
        const statistics = console.execute("runtime ui-stats")[0];
        assertEqual(profile.ok, true);
        assertEqual(profile.result.id, "authoring");
        assertEqual(statistics.ok, true);
        assertEqual(statistics.result.connected, true);
      }
    },

    "object-inspector": {
      "painel fechado adia inspeção até ser aberto"() {
        const root = document.createElement("section");
        root.hidden = true;
        root.innerHTML =
          '<p id="inspector-empty"></p>' +
          '<form id="inspector-form" hidden>' +
          '<span id="inspector-summary"></span>' +
          '<div id="inspector-properties"></div>' +
          '<button id="inspector-apply" type="button"></button>' +
          '</form>';
        let selectionListener = null;
        let sandboxListener = null;
        let inspectionCalls = 0;
        let scheduledRefresh = null;
        const inspector = new ObjectInspector({
          root,
          editor: {
            selection: {
              subscribe(listener) {
                selectionListener = listener;
                listener();
                return () => { selectionListener = null; };
              }
            }
          },
          sandbox: {
            subscribe(listener) {
              sandboxListener = listener;
              listener();
              return () => { sandboxListener = null; };
            }
          },
          query(id) {
            if (id === "properties.describe") return { properties: [] };
            if (id === "selection.properties.inspect") {
              inspectionCalls += 1;
              return { count: 0, targetIds: [], properties: {} };
            }
            throw new Error(`Consulta inesperada: ${id}.`);
          },
          execute() { return null; },
          scheduleRefresh(callback) {
            scheduledRefresh = callback;
            return 1;
          },
          cancelRefresh() {
            scheduledRefresh = null;
          }
        });

        assertEqual(inspectionCalls, 0);
        sandboxListener();
        selectionListener();
        assertEqual(inspectionCalls, 0);
        assertEqual(inspector.diagnostics().pendingRefresh, true);
        inspector.setActive(true);
        assertEqual(inspectionCalls, 1);
        sandboxListener();
        selectionListener();
        assertEqual(inspectionCalls, 1);
        assertEqual(inspector.diagnostics().coalesced, 1);
        scheduledRefresh();
        assertEqual(inspectionCalls, 2);
        inspector.setActive(false);
        sandboxListener();
        assertEqual(inspectionCalls, 2);
        assertEqual(inspector.dispose(), true);
        assertEqual(selectionListener, null);
        assertEqual(sandboxListener, null);
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

      "capability de câmera produz intenções sem renderer"() {
        const envelope = executeProgramRequest({
          runId: "camera-plan",
          baseVersion: 6,
          allowedCommands: CAMERA_PLAN_COMMANDS,
          snapshot: {
            viewer: {
              camera: navigationCameraFixture({
                position: [3, 4, 5]
              })
            }
          },
          source: [
            "camera.orbit({yawDegrees:45});",
            "camera.frameSelection({padding:1.3});",
            "return camera.view.position;"
          ].join("\n"),
          mode: "program"
        }, {
          evaluate: evaluateTrustedFixture
        });

        assertEqual(envelope.type, "program.completed");
        assertEqual(envelope.plan.commands.length, 2);
        assertEqual(
          envelope.plan.commands[0].command,
          "viewer.camera.orbit"
        );
        assertDeepEqual(envelope.plan.result.value, [3, 4, 5]);
      },

      "camera permanece ausente sem capability explícita"() {
        const envelope = executeProgramRequest({
          runId: "no-camera-capability",
          allowedCommands: [],
          source: "typeof camera"
        }, {
          evaluate: evaluateTrustedFixture
        });

        assertEqual(envelope.plan.result.value, "undefined");
        assertEqual(envelope.plan.commands.length, 0);
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

      "metadados declarativos de UI são normalizados e preservados"() {
        const catalog = new ProcedureCatalog();
        const document = {
          schemaVersion: PROCEDURE_LIBRARY_SCHEMA_VERSION,
          procedures: [{
            name: "architecture.colonnade",
            source: "({count=8}={}) => count",
            ui: {
              label: "Colunata",
              group: "Arquitetura",
              icon: "|||",
              commit: "review",
              parameters: [{
                id: "count",
                type: "integer",
                label: "Colunas",
                default: 8,
                min: 1,
                max: 500
              }, {
                id: "color",
                type: "color",
                label: "Cor",
                default: "#D8C7A2"
              }]
            }
          }]
        };

        catalog.importDocument(document);
        const description = catalog.describeUi();

        assertEqual(description.groups.length, 1);
        assertEqual(description.groups[0].label, "Arquitetura");
        assertEqual(
          description.groups[0].procedures[0].parameters[0].step,
          1
        );
        assertEqual(
          description.groups[0].procedures[0].parameters[1].default,
          "#d8c7a2"
        );
        assertEqual(catalog.snapshot().uiProcedureCount, 1);

        catalog.define(
          "architecture.colonnade",
          "({count=8}={}) => count * 2",
          { replace: true }
        );
        assertEqual(
          catalog.get("architecture.colonnade").ui.label,
          "Colunata"
        );

        const roundtrip = new ProcedureCatalog();
        roundtrip.importDocument(catalog.exportDocument());
        assertDeepEqual(roundtrip.exportDocument(), catalog.exportDocument());
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
      },

      "projeção de câmera aceita apenas intervalo ordenado"() {
        assertDeepEqual(
          normalizeCameraProjection({ near: "0.25", far: "5000" }),
          { near: 0.25, far: 5000 }
        );
        assertThrowsMessage(
          () => normalizeCameraProjection({ near: 2, far: 2 }),
          "0 < near < far"
        );
        assertThrowsMessage(
          () => normalizeCameraProjection({ near: "x", far: 10 }),
          "números finitos"
        );
      },

      "snapshot deriva alvo sem armazenar segunda orientação"() {
        const camera = cameraSnapshot({
          position: [1, 2, 3],
          quaternion: [0, 0, 0, 1],
          focusDistance: 5,
          fov: 55,
          near: 0.1,
          far: 1000,
          aspect: 2
        });

        assertDeepEqual(camera.target, [1, 2, -2]);
        assertEqual("target" in normalizeNavigationCamera(camera), false);
      },

      "look-at calcula quaternion e distância de foco"() {
        const camera = reduceNavigationCamera(
          navigationCameraFixture(),
          "viewer.camera.look-at",
          { target: [0, 0, -5] }
        );
        const snapshot = cameraSnapshot(camera);

        assertVectorNear(snapshot.quaternion, [0, 0, 0, 1]);
        assertVectorNear(snapshot.target, [0, 0, -5]);
        assertNear(snapshot.focusDistance, 5);
      },

      "órbita preserva alvo e distância quando omitida"() {
        const current = navigationCameraFixture({
          position: [0, 0, 5],
          focusDistance: 5
        });
        const camera = reduceNavigationCamera(
          current,
          "viewer.camera.orbit",
          { yawDegrees: 90, pitchDegrees: 0 }
        );
        const snapshot = cameraSnapshot(camera);

        assertVectorNear(snapshot.position, [5, 0, 0], 1e-8);
        assertVectorNear(snapshot.target, [0, 0, 0], 1e-8);
        assertNear(snapshot.focusDistance, 5);
      },

      "movimento local segue orientação autoritativa"() {
        const oriented = reduceNavigationCamera(
          navigationCameraFixture(),
          "viewer.camera.look-at",
          { target: [1, 0, 0] }
        );
        const moved = reduceNavigationCamera(
          oriented,
          "viewer.camera.move",
          { delta: [0, 0, -2], space: "local" }
        );

        assertVectorNear(moved.position, [2, 0, 0], 1e-8);
      },

      "enquadramento usa limites e aspecto do viewer"() {
        const camera = reduceNavigationCamera(
          navigationCameraFixture({ position: [0, 0, 10] }),
          "viewer.camera.frame-selection",
          { padding: 1.2 },
          {
            selectionBounds: () => ({
              min: [-1, -1, -1],
              max: [1, 1, 1]
            })
          }
        );
        const snapshot = cameraSnapshot(camera);

        assertVectorNear(snapshot.target, [0, 0, 0], 1e-8);
        assert(snapshot.focusDistance > Math.sqrt(3));
      },

      "interpolação combina pose projeção e foco"() {
        const from = navigationCameraFixture();
        const to = navigationCameraFixture({
          position: [8, 4, 2],
          focusDistance: 9,
          fov: 75,
          near: 1,
          far: 2000
        });
        const camera = reduceNavigationCamera(
          from,
          "viewer.camera.interpolate",
          { from, to, alpha: 0.25 }
        );

        assertVectorNear(camera.position, [2, 1, 0.5]);
        assertNear(camera.focusDistance, 3);
        assertNear(camera.fov, 60);
        assertNear(camera.near, 0.325);
        assertNear(camera.far, 1250);
      },

      "controlador sincroniza navegação da superfície no viewer"() {
        const surface = createCameraSurfaceFixture();
        const viewer = new ViewerState({
          viewerId: "viewer-camera-sync",
          camera: navigationCameraFixture()
        });
        const controller = new ViewerCameraController({
          viewer,
          surface
        });

        surface.emit(navigationCameraFixture({
          position: [7, 8, 9],
          focusDistance: 4
        }));

        assertVectorNear(controller.snapshot().position, [7, 8, 9]);
        assertEqual("region" in viewer.snapshot(), false);
        controller.dispose();
      },

      "reset da câmera restaura exatamente o estado inicial do viewer"() {
        const surface = createCameraSurfaceFixture();
        const initial = navigationCameraFixture({
          position: [3, 4, 12],
          focusDistance: 7,
          fov: 63
        });
        const viewer = new ViewerState({ camera: initial });
        const controller = new ViewerCameraController({ viewer, surface });
        const expected = controller.snapshot();
        controller.execute("viewer.camera.move", {
          delta: [8, -3, 2]
        });
        controller.execute("viewer.camera.projection.set", { fov: 91 });
        const reset = controller.execute("viewer.camera.reset");
        assertDeepEqual(reset, expected);
        controller.dispose();
      },

      "sequência aplica uma única vista final na superfície"() {
        const surface = createCameraSurfaceFixture();
        const viewer = new ViewerState({
          camera: navigationCameraFixture()
        });
        const controller = new ViewerCameraController({ viewer, surface });
        const before = surface.applyCount;

        controller.applySequence([
          {
            sequence: 0,
            command: "viewer.camera.move",
            args: { delta: [1, 0, 0] }
          },
          {
            sequence: 1,
            command: "viewer.camera.look-at",
            args: { target: [0, 0, -5] }
          }
        ]);

        assertEqual(surface.applyCount, before + 1);
        assertVectorNear(controller.snapshot().position, [1, 0, 0]);
        controller.dispose();
      },

      "plano de procedimento altera só a câmera local"() {
        const surface = createCameraSurfaceFixture();
        const viewer = new ViewerState({
          camera: navigationCameraFixture()
        });
        const controller = new ViewerCameraController({ viewer, surface });
        const service = new CameraPlanCommitService({
          controller,
          currentBaseVersion: () => 4
        });
        const result = service.commit({
          planVersion: PROGRAM_PLAN_VERSION,
          runId: "camera-procedure",
          baseVersion: 4,
          commands: [{
            sequence: 0,
            command: "viewer.camera.orbit",
            args: { yawDegrees: 30 }
          }]
        });

        assertEqual(result.domain, "viewer-camera");
        assertEqual(result.commandCount, 1);
        assertEqual(viewer.snapshot().selection.length, 0);
        controller.dispose();
      },

      "plano de câmera obsoleto falha antes de aplicar"() {
        const surface = createCameraSurfaceFixture();
        const viewer = new ViewerState({
          camera: navigationCameraFixture()
        });
        const controller = new ViewerCameraController({ viewer, surface });
        const service = new CameraPlanCommitService({
          controller,
          currentBaseVersion: () => 2
        });
        const before = controller.snapshot();

        assertThrowsMessage(
          () => service.commit({
            planVersion: PROGRAM_PLAN_VERSION,
            runId: "stale-camera",
            baseVersion: 1,
            commands: [{
              sequence: 0,
              command: "viewer.camera.move",
              args: { delta: [9, 0, 0] }
            }]
          }),
          "Plano obsoleto"
        );
        assertDeepEqual(controller.snapshot(), before);
        controller.dispose();
      },

      "console encaminha câmera para os comandos públicos"() {
        const calls = [];
        const console = new DevConsole({
          editor: { selection: new Selection() },
          sandbox: {},
          region: {},
          renderer: {},
          getDiagnostics: () => ({}),
          commands: {
            describe: () => [],
            execute(id, args) {
              calls.push({ id, args });
              return navigationCameraFixture();
            }
          },
          queries: {
            execute: () => cameraSnapshot(navigationCameraFixture())
          }
        });

        const results = console.execute([
          "camera lookat 0 1 0",
          "camera orbit 30 -10",
          "camera frame 1.25",
          "camera reset"
        ].join("\n"));

        assert(results.every(result => result.ok));
        assertDeepEqual(
          calls.map(call => call.id),
          [
            "viewer.camera.look-at",
            "viewer.camera.orbit",
            "viewer.camera.frame-selection",
            "viewer.camera.reset"
          ]
        );
      },

      "objetos câmera persistem e a ativação continua local"() {
        const region = new Region(
          { id: "camera-object-region", type: "box-region" },
          { schemaVersion: 1, objects: [] }
        );
        const sandbox = new Sandbox(region, boxRegionReducer);
        const firstSurface = createCameraSurfaceFixture();
        const secondSurface = createCameraSurfaceFixture();
        const freeSurface = createCameraSurfaceFixture();
        const firstViewer = new ViewerState({
          viewerId: "camera-object-viewer-a",
          camera: navigationCameraFixture({ position: [1, 2, 3] })
        });
        const secondViewer = new ViewerState({
          viewerId: "camera-object-viewer-b",
          camera: navigationCameraFixture({ position: [8, 9, 10] })
        });
        const freeViewer = new ViewerState({
          viewerId: "camera-object-viewer-free",
          camera: navigationCameraFixture({ position: [12, 11, 10] })
        });
        const firstController = new ViewerCameraController({
          viewer: firstViewer,
          surface: firstSurface
        });
        const secondController = new ViewerCameraController({
          viewer: secondViewer,
          surface: secondSurface
        });
        const freeController = new ViewerCameraController({
          viewer: freeViewer,
          surface: freeSurface
        });
        const first = new CameraObjectService({
          sandbox,
          viewer: firstViewer,
          controller: firstController,
          createId: () => "camera-persistent-a"
        });
        const second = new CameraObjectService({
          sandbox,
          viewer: secondViewer,
          controller: secondController,
          createId: () => "camera-persistent-b"
        });
        const free = new CameraObjectService({
          sandbox,
          viewer: freeViewer,
          controller: freeController
        });

        first.create({
          name: "Câmera A",
          camera: navigationCameraFixture({ position: [3, 4, 5] }),
          activate: true
        });
        second.create({
          name: "Câmera B",
          camera: navigationCameraFixture({ position: [9, 8, 7] }),
          activate: true
        });

        assertEqual(sandbox.objectCount, 2);
        assertEqual(
          firstViewer.snapshot().activeCameraId,
          "camera-persistent-a"
        );
        assertEqual(
          secondViewer.snapshot().activeCameraId,
          "camera-persistent-b"
        );
        assertVectorNear(firstController.snapshot().position, [3, 4, 5]);
        assertVectorNear(secondController.snapshot().position, [9, 8, 7]);

        first.setDefault("camera-persistent-a");
        assertEqual(
          sandbox.getSnapshot().defaultCameraId,
          "camera-persistent-a"
        );
        assertEqual(freeViewer.snapshot().activeCameraId, null);
        assertVectorNear(
          freeController.snapshot().position,
          [12, 11, 10]
        );
        const adoptedSurface = createCameraSurfaceFixture();
        const adoptedViewer = new ViewerState({
          viewerId: "camera-object-viewer-default",
          camera: navigationCameraFixture()
        });
        const adoptedController = new ViewerCameraController({
          viewer: adoptedViewer,
          surface: adoptedSurface
        });
        const adopted = new CameraObjectService({
          sandbox,
          viewer: adoptedViewer,
          controller: adoptedController
        });
        assertEqual(
          adoptedViewer.snapshot().activeCameraId,
          "camera-persistent-a"
        );
        adopted.dispose();
        adoptedController.dispose();
        assertEqual(sandbox.undo(), true);
        assertEqual(
          sandbox.getSnapshot().defaultCameraId ?? null,
          null
        );
        first.dispose();
        second.dispose();
        free.dispose();
        firstController.dispose();
        secondController.dispose();
        freeController.dispose();
      },

      "câmera hierárquica combina posição e orientação dos ancestrais"() {
        const region = new Region(
          { id: "camera-hierarchy-region", type: "box-region" },
          {
            schemaVersion: 1,
            objects: [
              {
                id: "camera-parent",
                kind: "group",
                position: [10, 0, 0],
                rotation: eulerQuaternion([0, 90, 0]),
                scale: [2, 2, 2]
              },
              {
                id: "camera-child",
                kind: "camera",
                parentId: "camera-parent",
                position: [0, 0, -2],
                rotation: [0, 0, 0, 1],
                scale: [1, 1, 1],
                camera: {
                  projection: "perspective",
                  fov: 60,
                  near: 0.2,
                  far: 500,
                  focusDistance: 4
                }
              }
            ]
          }
        );
        const sandbox = new Sandbox(region, boxRegionReducer);
        const surface = createCameraSurfaceFixture();
        const viewer = new ViewerState({
          camera: navigationCameraFixture()
        });
        const controller = new ViewerCameraController({ viewer, surface });
        const service = new CameraObjectService({
          sandbox,
          viewer,
          controller
        });

        service.activate("camera-child");
        const camera = controller.snapshot();
        assertVectorNear(camera.position, [6, 0, 0], 1e-8);
        assertVectorNear(camera.target, [2, 0, 0], 1e-8);
        assertEqual(camera.fov, 60);
        assertEqual(camera.near, 0.2);
        assertEqual(camera.far, 500);

        sandbox.dispatch({
          type: "object.transform",
          id: "camera-parent",
          position: [20, 0, 0],
          rotation: eulerQuaternion([0, 90, 0]),
          scale: [2, 2, 2]
        });
        assertVectorNear(
          controller.snapshot().position,
          [16, 0, 0],
          1e-8
        );

        controller.execute("viewer.camera.restore", {
          camera: navigationCameraFixture({
            position: [30, 2, 1],
            quaternion: [0, 0, 0, 1]
          })
        });
        assertEqual(viewer.snapshot().activeCameraId, null);
        service.captureViewer("camera-child");
        assertEqual(
          viewer.snapshot().activeCameraId,
          "camera-child"
        );
        assertVectorNear(
          controller.snapshot().position,
          [30, 2, 1],
          1e-8
        );
        assertVectorNear(
          controller.snapshot().quaternion,
          [0, 0, 0, 1],
          1e-8
        );
        service.dispose();
        controller.dispose();
      },

      "câmera ativa acompanha preview mundial sem editar documento"() {
        const region = new Region(
          { id: "camera-preview-region", type: "box-region" },
          {
            schemaVersion: 1,
            objects: [{
              id: "camera-preview-active",
              kind: "camera",
              position: [1, 2, 3],
              rotation: [0, 0, 0, 1],
              scale: [1, 1, 1],
              camera: {
                projection: "perspective",
                fov: 55,
                near: 0.1,
                far: 1000,
                focusDistance: 10
              }
            }]
          }
        );
        const sandbox = new Sandbox(region, boxRegionReducer);
        const surface = createCameraSurfaceFixture();
        const viewer = new ViewerState({
          camera: navigationCameraFixture()
        });
        const controller = new ViewerCameraController({ viewer, surface });
        const service = new CameraObjectService({
          sandbox,
          viewer,
          controller
        });
        service.activate("camera-preview-active");
        const revision = sandbox.revision;

        assertEqual(service.applyTransformPreview([{
          id: "camera-preview-active",
          worldMatrix: translationMatrix([8, 9, 10])
        }]), true);
        assertVectorNear(controller.snapshot().position, [8, 9, 10]);
        assertEqual(sandbox.revision, revision);
        assertEqual(
          viewer.snapshot().activeCameraId,
          "camera-preview-active"
        );
        service.clearTransformPreview();
        assertVectorNear(controller.snapshot().position, [1, 2, 3]);
        assertEqual(sandbox.revision, revision);
        service.dispose();
        controller.dispose();
      }
    },

    "viewer-coordination": {
      "URL compartilhada preserva origem e identifica a réplica"() {
        const url = new URL(createSharedViewerUrl(
          "https://example.test/apps/web/?build=current#scene",
          { sandboxId: "sandbox-coordination-url" }
        ));

        assertEqual(url.searchParams.get("build"), "current");
        assertEqual(
          url.searchParams.get("sandbox"),
          "sandbox-coordination-url"
        );
        assertEqual(url.searchParams.get("viewer"), "join");
        assertEqual(url.hash, "#scene");
      },

      "URLs independentes distinguem projeto novo e arquivo recebido"() {
        const fresh = new URL(createIndependentProjectUrl(
          "https://example.test/apps/web/?build=current",
          {
            sandboxId: "sandbox-independent-new",
            mode: "new"
          }
        ));
        const opened = new URL(createIndependentProjectUrl(
          "https://example.test/apps/web/",
          {
            sandboxId: "sandbox-independent-open",
            mode: "open",
            launchId: "launch-independent-open"
          }
        ));
        assertEqual(fresh.searchParams.get("project"), "new");
        assertEqual(fresh.searchParams.get("viewer"), "auto");
        assertEqual(opened.searchParams.get("project"), "open");
        assertEqual(
          opened.searchParams.get("launch"),
          "launch-independent-open"
        );
      },

      async "arquivo atravessa lançamento transitório sem virar sessão"() {
        const network = createLocalViewerNetwork();
        const launchId = "launch-project-transfer";
        const sender = new LocalProjectLaunchSender({
          launchId,
          channelFactory: network.channelFactory
        });
        const receiver = new LocalProjectLaunchReceiver({
          launchId,
          channelFactory: network.channelFactory,
          setTimeoutFn: null,
          setIntervalFn: null
        });
        const receivedPromise = receiver.receive();
        const acceptedPromise = sender.sendProject(
          "{\"format\":\"spatial-seed\"}"
        );
        await settleLocalViewers(20);
        const received = await receivedPromise;
        assertEqual(
          received.text,
          "{\"format\":\"spatial-seed\"}"
        );
        receiver.accept({
          name: "Projeto transferido",
          objectCount: 4
        });
        await settleLocalViewers();
        const accepted = await acceptedPromise;
        assertEqual(accepted.accepted, true);
        assertEqual(accepted.projectName, "Projeto transferido");
        assertEqual(accepted.objectCount, 4);
        sender.dispose();
      },

      async "viewer em junção recebe snapshot antes de disputar autoridade"() {
        const network = createLocalViewerNetwork();
        const lockManager = createLocalViewerLockManager();
        const authority = createLocalViewerHarness({
          sandboxId: "sandbox-join-handshake",
          viewerId: "viewer-join-authority",
          role: "auto",
          network,
          lockManager
        });
        await authority.coordinator.start();
        authority.coordinated.dispatch({
          type: "object.create",
          id: "join-snapshot-object",
          position: [0, 1, 0],
          size: [1, 1, 1]
        });
        const joining = createLocalViewerHarness({
          sandboxId: "sandbox-join-handshake",
          viewerId: "viewer-joining",
          role: "auto",
          joinExisting: true,
          network,
          lockManager
        });
        await joining.coordinator.start();
        await settleLocalViewers(20);

        assertEqual(joining.coordinator.status().role, "replica");
        assertEqual(
          joining.coordinator.status().initialSynchronized,
          true
        );
        assertEqual(joining.sandbox.objectCount, 1);
        joining.coordinator.dispose();
        authority.coordinator.dispose();
      },

      async "réplica sem BroadcastChannel não finge aceitar edição"() {
        const network = {
          channelFactory() {
            throw new Error("BroadcastChannel indisponível.");
          }
        };
        const replica = createLocalViewerHarness({
          sandboxId: "sandbox-local-viewer-unavailable",
          viewerId: "viewer-unavailable",
          role: "replica",
          network
        });
        await replica.coordinator.start();

        assertEqual(replica.coordinator.status().available, false);
        assertThrowsMessage(
          () => replica.coordinated.dispatch({
            type: "object.create",
            id: "must-not-queue"
          }),
          "sem o canal de coordenação"
        );
        assertThrowsMessage(
          () => replica.coordinator.viewerUrl(
            "https://example.test/apps/web/"
          ),
          "BroadcastChannel indisponível"
        );
        replica.coordinator.dispose();
      },

      async "autoridade sincroniza revisão e estado com réplica"() {
        const pair = await createLocalViewerPair();
        pair.authority.coordinated.dispatch({
          type: "object.create",
          id: "shared-a",
          position: [0, 1, 0],
          size: [1, 1, 1]
        });
        await settleLocalViewers();

        assertEqual(pair.authority.sandbox.objectCount, 1);
        assertEqual(pair.replica.sandbox.objectCount, 1);
        assertDeepEqual(
          pair.replica.sandbox.getState(),
          pair.authority.sandbox.getState()
        );
        assertEqual(
          pair.replica.coordinator.status().sharedRevision,
          pair.authority.sandbox.revision
        );
        pair.dispose();
      },

      async "réplica serializa duas intenções pela revisão aceita"() {
        const pair = await createLocalViewerPair();
        pair.replica.coordinated.dispatch({
          type: "object.create",
          id: "queued-a",
          position: [0, 1, 0],
          size: [1, 1, 1]
        });
        pair.replica.coordinated.dispatch({
          type: "object.create",
          id: "queued-b",
          position: [2, 1, 0],
          size: [1, 1, 1]
        });
        await settleLocalViewers(20);

        assertEqual(pair.authority.sandbox.objectCount, 2);
        assertEqual(pair.replica.sandbox.objectCount, 2);
        assertEqual(
          pair.replica.coordinator.status().pendingIntents,
          0
        );
        assertEqual(
          pair.replica.coordinator.status().lastOutcome.status,
          "accepted"
        );
        pair.dispose();
      },

      async "câmera criada na réplica ativa somente após snapshot aceito"() {
        const pair = await createLocalViewerPair();
        const surface = createCameraSurfaceFixture();
        const viewer = new ViewerState({
          viewerId: "camera-pending-replica",
          camera: navigationCameraFixture()
        });
        const controller = new ViewerCameraController({
          viewer,
          surface
        });
        const service = new CameraObjectService({
          sandbox: pair.replica.coordinated,
          viewer,
          controller,
          createId: () => "camera-pending-shared"
        });

        const result = service.create({
          name: "Câmera pendente",
          activate: true
        });
        assertEqual(result.changed, true);
        assertEqual(result.activationPending, true);
        assertEqual(viewer.snapshot().activeCameraId, null);
        await settleLocalViewers(20);

        assertEqual(
          viewer.snapshot().activeCameraId,
          "camera-pending-shared"
        );
        assertEqual(service.list().pendingActivationId, null);
        assertEqual(
          service.diagnostics().pendingActivationsResolved,
          1
        );
        service.dispose();
        controller.dispose();
        pair.dispose();
      },

      async "ativação pendente é limpa quando autoridade rejeita criação"() {
        const network = createLocalViewerNetwork();
        const pair = await createLocalViewerPair({ network });
        const surface = createCameraSurfaceFixture();
        const viewer = new ViewerState({
          viewerId: "camera-pending-rejected",
          camera: navigationCameraFixture()
        });
        const controller = new ViewerCameraController({
          viewer,
          surface
        });
        const service = new CameraObjectService({
          sandbox: pair.replica.coordinated,
          viewer,
          controller,
          createId: () => "camera-pending-rejected"
        });
        network.pause("sync");
        // Operações compactas são outra forma de sincronização autoritativa.
        network.pause("operation");
        pair.authority.coordinated.dispatch({
          type: "object.create",
          id: "authority-before-camera",
          position: [0, 0, 0],
          size: [1, 1, 1]
        });
        await settleLocalViewers();

        const result = service.create({ activate: true });
        assertEqual(result.activationPending, true);
        await settleLocalViewers(20);

        assertEqual(service.list().pendingActivationId, null);
        assertEqual(viewer.snapshot().activeCameraId, null);
        assertEqual(
          service.diagnostics().pendingActivationsRejected,
          1
        );
        assertEqual(
          pair.replica.coordinator.status().lastOutcome.status,
          "rejected-stale"
        );
        service.dispose();
        controller.dispose();
        pair.dispose();
      },

      async "preview de transformação converge sem alterar revisão"() {
        const network = createLocalViewerNetwork();
        const pair = await createLocalViewerPair({ network });
        let now = 0;
        const authorityAdapter = createTransformPreviewAdapter();
        const replicaAdapter = createTransformPreviewAdapter();
        const authority = new LocalTransformPreviewCoordinator({
          sandbox: pair.authority.sandbox,
          sandboxId: pair.authority.coordinator.sandboxId,
          viewerId: pair.authority.coordinator.viewerId,
          adapter: authorityAdapter,
          channelFactory: network.channelFactory,
          now: () => now,
          setTimeoutFn: null
        });
        const replica = new LocalTransformPreviewCoordinator({
          sandbox: pair.replica.sandbox,
          sandboxId: pair.replica.coordinator.sandboxId,
          viewerId: pair.replica.coordinator.viewerId,
          adapter: replicaAdapter,
          channelFactory: network.channelFactory,
          now: () => now,
          setTimeoutFn: null
        });
        authority.start();
        replica.start();
        const revision = pair.authority.sandbox.revision;
        const moved = translationMatrix([4, 5, 6]);

        authority.begin({
          previewId: "preview-shared-transform",
          transforms: [{
            id: "camera-preview",
            worldMatrix: identityMatrix()
          }]
        });
        now += 40;
        authority.update({
          previewId: "preview-shared-transform",
          transforms: [{
            id: "camera-preview",
            worldMatrix: moved
          }]
        });
        await settleLocalViewers();

        assertEqual(pair.authority.sandbox.revision, revision);
        assertDeepEqual(
          replicaAdapter.applied.at(-1).transforms[0].worldMatrix,
          moved
        );
        assertEqual(replica.status().remotePreviewCount, 1);
        authority.end({
          previewId: "preview-shared-transform",
          transforms: [{
            id: "camera-preview",
            worldMatrix: moved
          }],
          committed: false
        });
        await settleLocalViewers();
        assertEqual(replica.status().remotePreviewCount, 0);
        assertEqual(replicaAdapter.cleared.length, 1);
        replica.dispose();
        authority.dispose();
        pair.dispose();
      },

      async "preview limita amostras e libera overlay após commit"() {
        const network = createLocalViewerNetwork();
        const pair = await createLocalViewerPair({ network });
        let now = 0;
        const releaseTimers = [];
        const scheduleRelease = callback => {
          releaseTimers.push(callback);
          return releaseTimers.length;
        };
        const authorityAdapter = createTransformPreviewAdapter();
        const replicaAdapter = createTransformPreviewAdapter();
        const authority = new LocalTransformPreviewCoordinator({
          sandbox: pair.authority.sandbox,
          sandboxId: pair.authority.coordinator.sandboxId,
          viewerId: pair.authority.coordinator.viewerId,
          adapter: authorityAdapter,
          channelFactory: network.channelFactory,
          now: () => now,
          setTimeoutFn: scheduleRelease,
          clearTimeoutFn: () => {},
          maximumHz: 30
        });
        const replica = new LocalTransformPreviewCoordinator({
          sandbox: pair.replica.sandbox,
          sandboxId: pair.replica.coordinator.sandboxId,
          viewerId: pair.replica.coordinator.viewerId,
          adapter: replicaAdapter,
          channelFactory: network.channelFactory,
          now: () => now,
          setTimeoutFn: scheduleRelease,
          clearTimeoutFn: () => {}
        });
        authority.start();
        replica.start();
        authority.begin({
          previewId: "preview-throttled",
          transforms: [{
            id: "preview-throttled-object",
            worldMatrix: identityMatrix()
          }]
        });
        for (let index = 1; index <= 5; index += 1) {
          now += 5;
          authority.update({
            previewId: "preview-throttled",
            transforms: [{
              id: "preview-throttled-object",
              worldMatrix: translationMatrix([index, 0, 0])
            }]
          });
        }
        authority.end({
          previewId: "preview-throttled",
          transforms: [{
            id: "preview-throttled-object",
            worldMatrix: translationMatrix([5, 0, 0])
          }],
          committed: true
        });
        await settleLocalViewers();

        assert(
          authority.status().diagnostics.updatesThrottled >= 4
        );
        assertEqual(replica.status().remotePreviewCount, 1);
        pair.authority.coordinated.dispatch({
          type: "object.create",
          id: "preview-commit-proof",
          position: [0, 0, 0],
          size: [1, 1, 1]
        });
        await settleLocalViewers(20);
        assertEqual(replica.status().remotePreviewCount, 1);
        assertEqual(replicaAdapter.cleared.length, 0);
        for (const release of [...releaseTimers]) release();
        assertEqual(replica.status().remotePreviewCount, 0);
        assert(replicaAdapter.cleared.length >= 1);
        replica.dispose();
        authority.dispose();
        pair.dispose();
      },

      async "intenção obsoleta é rejeitada e força convergência"() {
        const network = createLocalViewerNetwork();
        const pair = await createLocalViewerPair({ network });
        network.pause("sync");
        // Operações compactas são outra forma de sincronização autoritativa.
        network.pause("operation");
        pair.authority.coordinated.dispatch({
          type: "object.create",
          id: "authority-first",
          position: [0, 1, 0],
          size: [1, 1, 1]
        });
        await settleLocalViewers();

        pair.replica.coordinated.dispatch({
          type: "object.create",
          id: "stale-replica",
          position: [2, 1, 0],
          size: [1, 1, 1]
        });
        await settleLocalViewers(20);

        const status = pair.replica.coordinator.status();
        assertEqual(status.lastOutcome.status, "rejected-stale");
        assertEqual(pair.authority.sandbox.objectCount, 1);
        assertDeepEqual(
          pair.replica.sandbox.getState(),
          pair.authority.sandbox.getState()
        );
        pair.dispose();
      },

      async "undo solicitado pela réplica usa o histórico comum"() {
        const pair = await createLocalViewerPair();
        pair.authority.coordinated.dispatch({
          type: "object.create",
          id: "undo-shared",
          position: [0, 1, 0],
          size: [1, 1, 1]
        });
        await settleLocalViewers();
        assertEqual(pair.replica.coordinated.undo(), true);
        await settleLocalViewers(20);

        assertEqual(pair.authority.sandbox.objectCount, 0);
        assertEqual(pair.replica.sandbox.objectCount, 0);
        assertEqual(pair.authority.sandbox.canRedo, true);
        assertEqual(pair.replica.coordinated.canRedo, true);
        assertEqual(pair.replica.coordinated.redo(), true);
        await settleLocalViewers(20);
        assertEqual(pair.authority.sandbox.objectCount, 1);
        assertEqual(pair.replica.sandbox.objectCount, 1);
        pair.dispose();
      },

      async "câmera e seleção continuam locais por viewer"() {
        const pair = await createLocalViewerPair();
        const authorityViewer = new ViewerState({
          viewerId: "viewer-authority",
          camera: navigationCameraFixture({ position: [1, 2, 3] }),
          selection: ["a"]
        });
        const replicaViewer = new ViewerState({
          viewerId: "viewer-replica",
          camera: navigationCameraFixture({ position: [8, 9, 10] }),
          selection: ["b"]
        });
        pair.authority.coordinated.dispatch({
          type: "object.create",
          id: "shared-camera-proof",
          position: [0, 1, 0],
          size: [1, 1, 1]
        });
        await settleLocalViewers();

        assertVectorNear(
          authorityViewer.snapshot().camera.position,
          [1, 2, 3]
        );
        assertVectorNear(
          replicaViewer.snapshot().camera.position,
          [8, 9, 10]
        );
        assertDeepEqual(authorityViewer.snapshot().selection, ["a"]);
        assertDeepEqual(replicaViewer.snapshot().selection, ["b"]);
        pair.dispose();
      },

      async "réplica não substitui projeto por uma via local"() {
        const pair = await createLocalViewerPair();
        assertThrowsMessage(
          () => pair.replica.coordinated.replaceState({
            schemaVersion: 1,
            objects: []
          }),
          "Somente o viewer autoritativo"
        );
        pair.dispose();
      },

      async "troca de projeto migra todas as abas para nova identidade"() {
        const network = createLocalViewerNetwork();
        const pair = await createLocalViewerPair({ network });
        pair.authority.coordinated.dispatch({
          type: "object.create",
          id: "before-switch",
          position: [0, 1, 0],
          size: [1, 1, 1]
        });
        await settleLocalViewers();
        network.pause("intent");
        pair.replica.coordinated.dispatch({
          type: "object.create",
          id: "cancelled-by-switch",
          position: [2, 1, 0],
          size: [1, 1, 1]
        });

        pair.authority.coordinator.switchSandbox(
          "sandbox-local-viewer-switched"
        );
        await settleLocalViewers(20);

        assertEqual(
          pair.authority.coordinator.status().sandboxId,
          "sandbox-local-viewer-switched"
        );
        assertEqual(
          pair.replica.coordinator.status().sandboxId,
          "sandbox-local-viewer-switched"
        );
        assertEqual(pair.replica.sandbox.objectCount, 1);
        assertEqual(
          pair.replica.coordinator.status().pendingIntents,
          0
        );
        assertEqual(
          pair.replica.coordinator.status().lastOutcome.status,
          "rejected-sandbox-replaced"
        );
        pair.dispose();
      },

      async "réplica automática assume quando a autoridade fecha"() {
        const network = createLocalViewerNetwork();
        const lockManager = createLocalViewerLockManager();
        const authority = createLocalViewerHarness({
          sandboxId: "sandbox-viewer-failover",
          viewerId: "viewer-failover-a",
          role: "auto",
          network,
          lockManager
        });
        const replica = createLocalViewerHarness({
          sandboxId: "sandbox-viewer-failover",
          viewerId: "viewer-failover-b",
          role: "auto",
          network,
          lockManager
        });
        const observer = createLocalViewerHarness({
          sandboxId: "sandbox-viewer-failover",
          viewerId: "viewer-failover-c",
          role: "auto",
          network,
          lockManager
        });
        await authority.coordinator.start();
        await replica.coordinator.start();
        await observer.coordinator.start();
        authority.coordinated.dispatch({
          type: "object.create",
          id: "survives-authority-close",
          position: [0, 1, 0],
          size: [1, 1, 1]
        });
        await settleLocalViewers(20);

        assertEqual(authority.coordinator.status().role, "authority");
        assertEqual(replica.coordinator.status().role, "replica");
        assertEqual(observer.coordinator.status().role, "replica");
        authority.coordinator.dispose();
        await settleLocalViewers(30);

        const survivors = [replica, observer];
        const promoted = survivors.find(
          viewer => viewer.coordinator.status().role === "authority"
        );
        const remaining = survivors.find(
          viewer => viewer !== promoted
        );
        assert(Boolean(promoted));
        assertEqual(remaining.coordinator.status().role, "replica");
        assertEqual(promoted.sandbox.objectCount, 1);
        assertEqual(remaining.sandbox.objectCount, 1);

        promoted.coordinator.switchSandbox(
          "sandbox-viewer-failover-next"
        );
        await settleLocalViewers(20);
        assertEqual(
          remaining.coordinator.status().sandboxId,
          "sandbox-viewer-failover-next"
        );
        assertEqual(remaining.coordinator.status().role, "replica");
        remaining.coordinator.dispose();
        promoted.coordinator.dispose();
      },

      async "diretório agrupa viewers e separa projetos ativos"() {
        const network = createLocalViewerNetwork();
        const descriptors = [
          {
            sandboxId: "sandbox-directory-alpha",
            viewerId: "viewer-directory-alpha-a",
            role: "authority",
            projectName: "Projeto Alfa",
            revision: 4,
            dirty: true,
            objectCount: 3
          },
          {
            sandboxId: "sandbox-directory-alpha",
            viewerId: "viewer-directory-alpha-b",
            role: "replica",
            projectName: "Projeto Alfa",
            revision: 4,
            dirty: true,
            objectCount: 3
          },
          {
            sandboxId: "sandbox-directory-beta",
            viewerId: "viewer-directory-beta",
            role: "authority",
            projectName: "Projeto Beta",
            revision: 2,
            dirty: false,
            objectCount: 1
          }
        ];
        const directories = descriptors.map(descriptor =>
          new LocalViewerSessionDirectory({
            describe: () => descriptor,
            channelFactory: network.channelFactory,
            setIntervalFn: null,
            setTimeoutFn: null
          })
        );
        directories.forEach(directory => directory.start());
        await settleLocalViewers(20);

        const status = directories[0].status();
        assertEqual(status.sessions.length, 2);
        assertEqual(status.sessions[0].projectName, "Projeto Alfa");
        assertEqual(status.sessions[0].viewerCount, 2);
        assertEqual(status.sessions[0].current, true);
        assertEqual(status.sessions[1].projectName, "Projeto Beta");
        assertEqual(status.sessions[1].viewerCount, 1);
        directories.forEach(directory => directory.dispose());
      },

      async "diretório remove viewer fechado da sessão"() {
        const network = createLocalViewerNetwork();
        const first = new LocalViewerSessionDirectory({
          describe: () => ({
            sandboxId: "sandbox-directory-close",
            viewerId: "viewer-directory-close-a",
            role: "authority",
            projectName: "Projeto Fechável",
            revision: 1,
            objectCount: 2
          }),
          channelFactory: network.channelFactory,
          setIntervalFn: null,
          setTimeoutFn: null
        });
        const second = new LocalViewerSessionDirectory({
          describe: () => ({
            sandboxId: "sandbox-directory-close",
            viewerId: "viewer-directory-close-b",
            role: "replica",
            projectName: "Projeto Fechável",
            revision: 1,
            objectCount: 2
          }),
          channelFactory: network.channelFactory,
          setIntervalFn: null,
          setTimeoutFn: null
        });
        first.start();
        second.start();
        await settleLocalViewers();
        assertEqual(second.status().sessions[0].viewerCount, 2);

        first.dispose();
        await settleLocalViewers();
        assertEqual(second.status().sessions[0].viewerCount, 1);
        second.dispose();
      },

      "console encaminha diagnóstico e sincronização de viewers"() {
        const calls = [];
        const console = new DevConsole({
          editor: { selection: new Selection() },
          sandbox: {},
          region: {},
          renderer: {},
          getDiagnostics: () => ({}),
          commands: {
            describe: () => [],
            execute(id, args) {
              calls.push({ id, args });
              return { id };
            }
          },
          queries: {
            execute(id) {
              calls.push({ id });
              return { role: "authority" };
            }
          }
        });

        const results = console.execute(
          "viewers status; viewers sessions; " +
          "viewers open sandbox-selected; viewers sync"
        );

        assert(results.every(result => result.ok));
        assertDeepEqual(
          calls.map(call => call.id),
          [
            "viewer.instances.status",
            "viewer.sessions.status",
            "viewer.instance.open",
            "viewer.instance.sync"
          ]
        );
        assertDeepEqual(calls[2].args, {
          sandboxId: "sandbox-selected"
        });
      }
    },

    "viewer-animation": {
      async "autoridade distribui definição declarativa sem quadros"() {
        const pair = await createLocalAnimationPair();
        pair.authority.animation.play("preset", {
          id: "spin",
          targetIds: ["shared-a"],
          targetMode: "objects"
        });
        await settleLocalViewers();

        assertEqual(pair.authority.animation.status().state, "playing");
        assertEqual(pair.replica.animation.status().state, "playing");
        assertDeepEqual(
          pair.replica.adapter.applied.at(-1).descriptor,
          {
            kind: "preset",
            id: "spin",
            targetIds: ["shared-a"],
            targetMode: "objects"
          }
        );
        assertEqual(
          pair.network.messages.some(entry =>
            entry.message.type === "animation-frame"
          ),
          false
        );
        pair.dispose();
      },

      async "réplica inicia sessão com alvos já resolvidos"() {
        const pair = await createLocalAnimationPair();
        pair.replica.animation.play("program", {
          id: "from-replica",
          operations: [{ type: "move", value: ["t", 0, 0] }],
          targetIds: ["replica-target"]
        });
        await settleLocalViewers(20);

        const authority = pair.authority.animation.status();
        const replica = pair.replica.animation.status();
        assertEqual(authority.state, "playing");
        assertEqual(replica.state, "playing");
        assertDeepEqual(
          pair.authority.adapter.applied.at(-1).descriptor.targetIds,
          ["replica-target"]
        );
        assertEqual(replica.shared.lastOutcome.status, "accepted");
        pair.dispose();
      },

      async "viewer tardio alcança a sessão já ativa"() {
        const pair = await createLocalAnimationPair();
        pair.authority.animation.play("preset", {
          id: "orbit",
          targetIds: ["late-a"]
        });
        await settleLocalViewers();
        pair.clock.value += 4500;

        const lateViewer = createLocalViewerHarness({
          sandboxId: pair.sandboxId,
          viewerId: "viewer-late",
          role: "replica",
          network: pair.network
        });
        await lateViewer.coordinator.start();
        const late = attachLocalAnimation(lateViewer, {
          network: pair.network,
          clock: pair.clock
        });
        await settleLocalViewers(20);

        assertEqual(late.animation.status().state, "playing");
        assertNear(
          late.animation.status().shared.positionSeconds,
          4.5
        );
        late.dispose();
        lateViewer.coordinator.dispose();
        pair.dispose();
      },

      async "pausa e retomada preservam um tempo comum"() {
        const pair = await createLocalAnimationPair();
        pair.authority.animation.play("preset", {
          id: "float",
          targetIds: ["time-a"]
        });
        await settleLocalViewers();
        pair.clock.value += 2250;
        pair.replica.animation.pause();
        await settleLocalViewers(20);

        const paused = pair.authority.animation.status();
        assertEqual(paused.state, "paused");
        assertNear(paused.shared.positionSeconds, 2.25);
        pair.clock.value += 5000;
        assertNear(
          pair.replica.animation.status().shared.positionSeconds,
          2.25
        );

        pair.authority.animation.resume();
        await settleLocalViewers();
        pair.clock.value += 750;
        assertNear(
          pair.replica.animation.status().shared.positionSeconds,
          3
        );
        pair.dispose();
      },

      async "intenção temporal obsoleta é rejeitada explicitamente"() {
        const network = createLocalViewerNetwork();
        const pair = await createLocalAnimationPair({ network });
        pair.authority.animation.play("preset", {
          id: "wave",
          targetIds: ["stale-a"]
        });
        await settleLocalViewers();

        network.pause("session-sync");
        pair.authority.animation.pause();
        pair.replica.animation.stop();
        await settleLocalViewers(20);

        const replica = pair.replica.animation.status();
        assertEqual(replica.shared.lastOutcome.status, "rejected-stale");
        assertEqual(replica.state, "paused");
        assertEqual(pair.authority.animation.status().state, "paused");
        pair.dispose();
      },

      async "parada compartilhada restaura todos os viewers"() {
        const pair = await createLocalAnimationPair();
        pair.authority.animation.play("preset", {
          id: "pulse",
          targetIds: ["restore-a"]
        });
        await settleLocalViewers();
        pair.replica.animation.stop();
        await settleLocalViewers(20);

        assertEqual(pair.authority.animation.status().state, "idle");
        assertEqual(pair.replica.animation.status().state, "idle");
        assertEqual(
          pair.authority.adapter.applied.at(-1).reason,
          "user"
        );
        assertEqual(
          pair.replica.adapter.applied.at(-1).reason,
          "user"
        );
        pair.dispose();
      },

      async "adaptador legado encerra a sessão em todas as abas"() {
        const pair = await createLocalAnimationPair();
        pair.authority.animation.play("preset", {
          id: "spin",
          targetIds: ["edited-a"]
        });
        await settleLocalViewers();
        pair.authority.viewer.coordinated.dispatch({
          type: "object.create",
          id: "edited-a",
          position: [0, 1, 0],
          size: [1, 1, 1]
        });
        await settleLocalViewers(20);

        assertEqual(pair.authority.animation.status().state, "idle");
        assertEqual(pair.replica.animation.status().state, "idle");
        assertEqual(
          pair.authority.animation.status().shared.reason,
          "animated-object-changed"
        );
        pair.dispose();
      },

      async "troca de projeto migra o canal temporal e zera a sessão"() {
        const pair = await createLocalAnimationPair();
        pair.authority.animation.play("preset", {
          id: "rainbow",
          targetIds: ["switch-a"]
        });
        await settleLocalViewers();
        pair.authority.viewer.coordinator.switchSandbox(
          "sandbox-animation-switched"
        );
        await settleLocalViewers(20);

        assertEqual(
          pair.authority.animation.status().shared.sandboxId,
          "sandbox-animation-switched"
        );
        assertEqual(
          pair.replica.animation.status().shared.sandboxId,
          "sandbox-animation-switched"
        );
        assertEqual(pair.authority.animation.status().state, "idle");
        assertEqual(pair.replica.animation.status().state, "idle");
        pair.dispose();
      },

      async "integração real recompila e restaura em duas abas"() {
        const network = createLocalViewerNetwork();
        const clock = {
          value: Date.parse("2026-07-24T12:00:00.000Z")
        };
        const viewers = await createLocalViewerPair({ network });
        const authority = attachRealLocalAnimation(viewers.authority, {
          network,
          clock
        });
        const replica = attachRealLocalAnimation(viewers.replica, {
          network,
          clock
        });
        await settleLocalViewers();

        replica.animation.play("preset", {
          id: "spin",
          parameters: { speed: 90, axis: "y" },
          targetIds: ["group-a"]
        });
        await settleLocalViewers(20);
        clock.value += 3000;
        authority.fixture.emit({ deltaSeconds: 1 / 60 });
        replica.fixture.emit({ deltaSeconds: 1 / 60 });

        assertNear(
          authority.animation.status().time.simulationTime,
          3
        );
        assertNear(
          replica.animation.status().time.simulationTime,
          3
        );
        authority.animation.stop();
        await settleLocalViewers();
        assertEqual(authority.fixture.restored.length, 1);
        assertEqual(replica.fixture.restored.length, 1);

        replica.dispose();
        authority.dispose();
        viewers.dispose();
      },

      "réplica sem canal não finge controlar animação"() {
        const region = new Region(
          { id: "animation-no-channel", type: "box-region" },
          { schemaVersion: 1, objects: [] }
        );
        const sandbox = new Sandbox(region, boxRegionReducer);
        const adapter = createLocalAnimationAdapter();
        const animation = new LocalAnimationCoordinator({
          sandbox,
          sandboxId: "sandbox-animation-unavailable",
          viewerId: "viewer-animation-unavailable",
          isAuthority: () => false,
          adapter,
          channelFactory() {
            throw new Error("BroadcastChannel indisponível.");
          }
        });
        animation.start();

        assertEqual(animation.status().shared.available, false);
        assertThrowsMessage(
          () => animation.play("preset", {
            id: "spin",
            targetIds: ["a"]
          }),
          "sem o canal local"
        );
        animation.dispose();
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

    "animation-runtime": {
      "quadro visual aplica somente o último passo fixo"() {
        const fixture = createAnimationFixture();
        const runtime = new AnimationRuntime({
          surface: fixture.surface,
          now: monotonicNow()
        });
        const evaluations = [];
        runtime.start({
          id: "test.fixed-step",
          targetIds: ["group-a"],
          evaluate(context) {
            evaluations.push(context);
            return context.targets.units.map(unit => ({
              unitId: unit.unitId,
              matrix: identityMatrix()
            }));
          }
        });

        fixture.emit({ deltaSeconds: 1 / 30 });
        const status = runtime.status();
        assertEqual(evaluations.length, 1);
        assertEqual(evaluations[0].tick, 2);
        assertNear(evaluations[0].t, 2 / 60, 1e-12);
        assertEqual(fixture.applied.length, 1);
        assertEqual(status.statistics.steps, 2);
        assertEqual(status.statistics.frames, 1);
        assertEqual(status.clip.objectCount, 2);
        runtime.dispose();
      },

      "relógio absoluto salta diretamente após aba suspensa"() {
        const fixture = createAnimationFixture();
        let wallTime = 1000;
        const evaluations = [];
        const runtime = new AnimationRuntime({
          surface: fixture.surface,
          now: monotonicNow()
        });
        runtime.start({
          id: "test.absolute-time",
          targetIds: ["group-a"],
          timeSource: () => (wallTime - 1000) / 1000,
          evaluate(context) {
            evaluations.push(context);
            return identityAnimationFrame(context);
          }
        });

        wallTime = 13000;
        fixture.emit({ deltaSeconds: 1 / 60 });

        assertEqual(evaluations.length, 1);
        assertNear(evaluations[0].t, 12);
        assertNear(runtime.status().time.simulationTime, 12);
        assertEqual(runtime.status().statistics.droppedSteps, 0);
        runtime.dispose();
      },

      "pausa retomada e parada não alteram estado editorial"() {
        const fixture = createAnimationFixture();
        const region = new Region(
          { id: "animation-region", type: "box-region" },
          { objects: [propertyObject("a", "#112233", null)] }
        );
        const sandbox = new Sandbox(region, boxRegionReducer);
        const before = sandbox.getHistoryDiagnostics();
        const runtime = new AnimationRuntime({
          surface: fixture.surface,
          now: monotonicNow()
        });
        runtime.start({
          targetIds: ["group-a"],
          evaluate: identityAnimationFrame
        });
        runtime.pause();
        fixture.emit({ deltaSeconds: 1 });
        assertEqual(fixture.applied.length, 0);
        runtime.play();
        fixture.emit({ deltaSeconds: 1 / 60 });
        assertEqual(fixture.applied.length, 1);
        const stopped = runtime.stop();
        assertEqual(stopped.state, "idle");
        assertEqual(fixture.restored.length, 1);
        assertDeepEqual(sandbox.getHistoryDiagnostics(), before);
        runtime.dispose();
      },

      "mudança editorial interrompe e restaura a sobreposição"() {
        const fixture = createAnimationFixture();
        const runtime = new AnimationRuntime({
          surface: fixture.surface,
          now: monotonicNow()
        });
        runtime.start({
          targetIds: ["group-a"],
          evaluate: identityAnimationFrame
        });
        assertEqual(runtime.sceneChanged(), true);
        const status = runtime.status();
        assertEqual(status.state, "idle");
        assertEqual(status.statistics.lastStopReason, "scene-changed");
        assertEqual(fixture.restored.length, 1);
        runtime.dispose();
      },

      "runtime temporal rebasa edição e só encerra alvo removido"() {
        const fixture = createAnimationFixture();
        let nowSeconds = 0;
        const domains = new AnalyticTimeDomains({
          nowSeconds: () => nowSeconds
        });
        const temporal = new TemporalRuntime({ domains });
        const runtime = new TemporalAnimationRuntime({
          surface: fixture.surface,
          temporalRuntime: temporal,
          timeDomains: domains,
          now: monotonicNow()
        });
        runtime.start({
          targetIds: ["group-a"],
          evaluate: identityAnimationFrame
        });
        const instanceId = runtime.status().activeInstanceId;

        const rebased = runtime.sceneChanged([{
          type: "object-transform",
          objectId: "a"
        }]);
        assertDeepEqual(rebased.rebasedInstanceIds, [instanceId]);
        assertDeepEqual(rebased.stoppedInstanceIds, []);
        assertEqual(runtime.status().state, "playing");
        assertEqual(fixture.restored.length, 0);

        const removed = runtime.sceneChanged([{
          type: "object-deleted",
          objectId: "b"
        }]);
        assertDeepEqual(removed.stoppedInstanceIds, [instanceId]);
        assertEqual(runtime.status().state, "idle");
        assertEqual(fixture.restored.length, 1);
        runtime.dispose();
      },

      "falha de avaliação restaura sem escapar pelo main loop"() {
        const fixture = createAnimationFixture();
        const runtime = new AnimationRuntime({
          surface: fixture.surface,
          now: monotonicNow()
        });
        runtime.start({
          targetIds: ["group-a"],
          evaluate() { throw new Error("falha deliberada"); }
        });
        const result = runtime.advance({ deltaSeconds: 1 / 60 });
        assertEqual(result.advanced, false);
        assertEqual(runtime.status().state, "idle");
        assertEqual(fixture.restored.length, 1);
        assertEqual(
          runtime.status().statistics.lastError.message,
          "falha deliberada"
        );
        runtime.dispose();
      },

      "delta mundial preserva relações internas do grupo"() {
        const targets = createAnimationTargetSnapshot([{
          unitId: "group-a",
          pivot: [1, 2, 3],
          objects: [
            { objectId: "a", baseMatrix: translationMatrix([1, 0, 0]) },
            { objectId: "b", baseMatrix: translationMatrix([3, 0, 0]) }
          ]
        }]);
        const overlay = composeAnimationOverlay(targets, [{
          unitId: "group-a",
          matrix: translationMatrix([0, 5, 0])
        }]);
        assertDeepEqual(
          overlay.transforms.map(item => item.matrix.slice(12, 15)),
          [[1, 5, 0], [3, 5, 0]]
        );
        assertDeepEqual(overlay.pivots[0].position, [1, 7, 3]);
      },

      "rebase afim acompanha o novo pivô canônico"() {
        const targets = createAnimationTargetSnapshot([{
          unitId: "group-a",
          pivot: [0, 0, 0],
          objects: [{ objectId: "a", baseMatrix: identityMatrix() }]
        }]);
        const frame = [{
          unitId: "group-a",
          matrix: composeAffineOperations([
            { type: "pivot", value: [0, 0, 0] },
            { type: "rotate", value: [0, 0, 90] }
          ])
        }];
        const rebased = rebaseAnimationLayerInput(
          targets,
          frame,
          () => [10, 0, 0]
        );

        assertVectorNear(
          transformAnimationPoint(rebased.unitFrames[0].matrix, [10, 0, 0]),
          [10, 0, 0],
          1e-8
        );
        assertVectorNear(
          transformAnimationPoint(rebased.unitFrames[0].matrix, [11, 0, 0]),
          [10, 1, 0],
          1e-8
        );
        assertDeepEqual(rebased.targets.units[0].pivot, [10, 0, 0]);
      },

      "relógio contabiliza passos descartados"() {
        const clock = new SimulationClock({
          stepSeconds: 0.1,
          maxCatchUpSteps: 2
        });
        const result = clock.advance(0.55, () => {});
        assertEqual(result.executed, 2);
        assertEqual(result.dropped, 3);
      }
    },

    "animation-commands": {
      "programa seguro avalia a variável temporal t"() {
        const program = compileAnimationProgram([{
          type: "move",
          value: ["2 * sin(t)", 0, 0]
        }]);
        const evaluate = createAnimationEvaluator(program);
        const targets = createAnimationTargetSnapshot([{
          unitId: "unit-a",
          pivot: [0, 0, 0],
          objects: [{ objectId: "a", baseMatrix: identityMatrix() }]
        }]);
        const frame = evaluate({ t: Math.PI / 2, dt: 1 / 60, targets });

        assertEqual(program.unitDependent, false);
        assertDeepEqual(
          frame[0].matrix.slice(12, 15).map(roundAffine),
          [2, 0, 0]
        );
      },

      "i e u diferenciam unidades sem recompilar o programa"() {
        const program = compileAnimationProgram([{
          type: "move",
          value: ["i + u", 0, 0]
        }]);
        const evaluate = createAnimationEvaluator(program);
        const targets = createAnimationTargetSnapshot([
          {
            unitId: "unit-a",
            pivot: [0, 0, 0],
            objects: [{ objectId: "a", baseMatrix: identityMatrix() }]
          },
          {
            unitId: "unit-b",
            pivot: [0, 0, 0],
            objects: [{ objectId: "b", baseMatrix: identityMatrix() }]
          }
        ]);
        const frame = evaluate({ t: 0, dt: 1 / 60, targets });

        assertEqual(program.unitDependent, true);
        assertDeepEqual(
          frame.map(entry => roundAffine(entry.matrix[12])),
          [1, 3]
        );
      },

      "preset spin preserva o pivô próprio de cada unidade"() {
        const preset = resolveAnimationPreset("spin", {
          axis: "y",
          speed: 90
        });
        const evaluate = createAnimationEvaluator(
          compileAnimationProgram(preset.operations)
        );
        const targets = createAnimationTargetSnapshot([{
          unitId: "unit-a",
          pivot: [2, 3, 4],
          objects: [{ objectId: "a", baseMatrix: identityMatrix() }]
        }]);
        const frame = evaluate({ t: 1, dt: 1 / 60, targets });

        assertDeepEqual(
          transformAnimationPoint(frame[0].matrix, [2, 3, 4])
            .map(roundAffine),
          [2, 3, 4]
        );
      },

      "preset orbit começa na base e percorre um quarto de volta"() {
        const preset = resolveAnimationPreset("orbit", {
          axis: "y",
          radius: 4,
          speed: 90
        });
        const evaluate = createAnimationEvaluator(
          compileAnimationProgram(preset.operations)
        );
        const targets = createAnimationTargetSnapshot([{
          unitId: "unit-a",
          pivot: [0, 0, 0],
          objects: [{ objectId: "a", baseMatrix: identityMatrix() }]
        }]);
        const initial = evaluate({ t: 0, dt: 1 / 60, targets });
        const quarter = evaluate({ t: 1, dt: 1 / 60, targets });

        assertDeepEqual(
          initial[0].matrix.slice(12, 15).map(roundAffine),
          [0, 0, 0]
        );
        assertDeepEqual(
          quarter[0].matrix.slice(12, 15).map(roundAffine),
          [-4, 0, 4]
        );
      },

      "cor temporal é calculada por unidade sem mutar a cena"() {
        const preset = resolveAnimationPreset("rainbow", {
          speed: 0,
          saturation: 1,
          lightness: 0.5
        });
        const evaluate = createAnimationEvaluator(
          compileAnimationProgram(preset.operations)
        );
        const targets = createAnimationTargetSnapshot([
          {
            unitId: "a",
            pivot: [0, 0, 0],
            objects: [{ objectId: "a", baseMatrix: identityMatrix() }]
          },
          {
            unitId: "b",
            pivot: [0, 0, 0],
            objects: [{ objectId: "b", baseMatrix: identityMatrix() }]
          }
        ]);

        const frame = evaluate({ t: 2, dt: 1 / 60, targets });
        const overlay = composeAnimationOverlay(targets, frame);

        assertDeepEqual(frame.map(entry => entry.color), ["#ff0000", "#ff0000"]);
        assertDeepEqual(
          overlay.colors,
          [
            { objectId: "a", color: "#ff0000" },
            { objectId: "b", color: "#ff0000" }
          ]
        );
      },

      "serviço captura a seleção e controla o ciclo de vida"() {
        const fixture = createAnimationFixture();
        const runtime = new AnimationRuntime({
          surface: fixture.surface,
          now: monotonicNow()
        });
        const service = new AnimationCommandService({
          runtime,
          selection: () => ({
            members: [{ objectId: "group-a" }]
          })
        });

        const started = service.preset("float", {
          axis: "z",
          amplitude: 2,
          frequency: 1
        });
        assertEqual(started.state, "playing");
        assertEqual(started.preset.id, "float");
        assertDeepEqual(fixture.captures, [["group-a"]]);
        assertEqual(service.pause().state, "paused");
        assertEqual(service.resume().state, "playing");
        assertEqual(service.stop().state, "idle");
        assertEqual(fixture.restored.length, 1);
        runtime.dispose();
      },

      "serviço recompila descritor compartilhado e segue a época comum"() {
        const fixture = createAnimationFixture();
        let nowMs = 1000;
        const runtime = new AnimationRuntime({
          surface: fixture.surface,
          now: monotonicNow()
        });
        const service = new AnimationCommandService({
          runtime,
          selection: () => ({
            members: [{ objectId: "group-a" }]
          })
        });
        const descriptor = service.prepareShared("preset", {
          id: "spin",
          parameters: { speed: 90, axis: "y" }
        });
        const session = {
          sequence: 1,
          playbackId: "playback-shared-service",
          state: "playing",
          descriptor,
          positionSeconds: 0,
          changedAtMs: 1000,
          baseRevision: 0,
          reason: null
        };

        service.synchronizeShared(session, {
          now: () => nowMs
        });
        nowMs = 3500;
        fixture.emit({ deltaSeconds: 1 / 60 });

        assertDeepEqual(descriptor.targetIds, ["group-a"]);
        assertNear(service.status().time.simulationTime, 2.5);
        assertEqual(service.status().preset.id, "spin");
        assertEqual(structuredClone(descriptor).kind, "preset");
        runtime.dispose();
      },

      "seleção vazia é rejeitada antes de iniciar"() {
        const fixture = createAnimationFixture();
        const runtime = new AnimationRuntime({
          surface: fixture.surface,
          now: monotonicNow()
        });
        const service = new AnimationCommandService({
          runtime,
          selection: () => ({ members: [] })
        });

        assertThrowsMessage(
          () => service.preset("spin"),
          "Selecione ao menos um objeto para animar."
        );
        assertEqual(runtime.status().state, "idle");
        runtime.dispose();
      },

      "console traduz formas semânticas e expressões afins"() {
        const calls = [];
        const console = new DevConsole({
          editor: { selection: new Selection() },
          sandbox: {},
          region: {},
          renderer: {},
          getDiagnostics: () => ({}),
          commands: {
            describe: () => [],
            execute(id, args) {
              calls.push({ id, args });
              return { ok: true };
            }
          }
        });

        console.execute('animate rotate 0 "45 * sin(t)" 0');
        console.execute("animate spin speed=90 axis=z");
        console.execute(
          'animate color "hsl(60*t + 360*u,0.8,0.55)" mode=objects'
        );
        console.execute("animate pause\nanimate resume\nanimate stop");

        assertDeepEqual(calls, [
          {
            id: "animation.start",
            args: {
              id: "custom.rotate",
              operations: [{
                type: "rotate",
                value: [0, "45 * sin(t)", 0]
              }],
              targetMode: "selection",
              timeDomainId: "world"
            }
          },
          {
            id: "animation.preset",
            args: {
              id: "spin",
              parameters: { speed: 90, axis: "z" },
              targetMode: "selection",
              timeDomainId: "world"
            }
          },
          {
            id: "animation.start",
            args: {
              id: "custom.color",
              operations: [{
                type: "color",
                value: "hsl(60*t + 360*u,0.8,0.55)"
              }],
              targetMode: "objects",
              timeDomainId: "world"
            }
          },
          { id: "animation.pause", args: undefined },
          { id: "animation.resume", args: undefined },
          { id: "animation.stop", args: undefined }
        ]);
      },

      "catálogo rejeita parâmetros desconhecidos e eixos inválidos"() {
        assertThrowsMessage(
          () => resolveAnimationPreset("spin", { surprise: 1 }),
          "Parâmetro desconhecido em spin: surprise."
        );
        assertThrowsMessage(
          () => resolveAnimationPreset("spin", { axis: "q" }),
          "axis deve ser x, y ou z."
        );
      }
    },

    "animation-tracks": {
      "faixas aplicam programas distintos a objetos distintos"() {
        const composition = compileAnimationTrackProgram([
          {
            id: "left",
            targetIds: ["a"],
            operations: [{ type: "move", value: ["2 * t", 0, 0] }]
          },
          {
            id: "right",
            targetIds: ["b"],
            operations: [{ type: "move", value: [0, "4 * t", 0] }]
          }
        ]);
        const evaluate = createAnimationTrackEvaluator(composition);
        const targets = createAnimationTargetSnapshot([
          {
            unitId: "a",
            sourceId: "a",
            pivot: [0, 0, 0],
            objects: [{ objectId: "a", baseMatrix: identityMatrix() }]
          },
          {
            unitId: "b",
            sourceId: "b",
            pivot: [0, 0, 0],
            objects: [{ objectId: "b", baseMatrix: identityMatrix() }]
          }
        ]);

        const frame = evaluate({ t: 1, dt: 1 / 60, targets });

        assertDeepEqual(
          frame.map(entry => entry.matrix.slice(12, 15).map(roundAffine)),
          [[2, 0, 0], [0, 4, 0]]
        );
      },

      "faixa de grupo alcança cada descendente como unidade própria"() {
        const composition = compileAnimationTrackProgram([{
          id: "group-track",
          targetIds: ["group-a"],
          operations: [{ type: "move", value: ["i", 0, 0] }]
        }]);
        const evaluate = createAnimationTrackEvaluator(composition);
        const targets = createAnimationTargetSnapshot([
          {
            unitId: "a",
            sourceId: "group-a",
            pivot: [0, 0, 0],
            objects: [{ objectId: "a", baseMatrix: identityMatrix() }]
          },
          {
            unitId: "b",
            sourceId: "group-a",
            pivot: [2, 0, 0],
            objects: [{ objectId: "b", baseMatrix: identityMatrix() }]
          }
        ]);

        const frame = evaluate({ t: 0, dt: 1 / 60, targets });

        assertDeepEqual(
          frame.map(entry => roundAffine(entry.matrix[12])),
          [1, 2]
        );
      },

      "composição inicia uma única sobreposição em modo por objeto"() {
        const targets = createAnimationTargetSnapshot([
          {
            unitId: "a",
            sourceId: "a",
            pivot: [0, 0, 0],
            objects: [{ objectId: "a", baseMatrix: identityMatrix() }]
          },
          {
            unitId: "b",
            sourceId: "b",
            pivot: [0, 0, 0],
            objects: [{ objectId: "b", baseMatrix: identityMatrix() }]
          }
        ]);
        const fixture = createAnimationFixture({ targets });
        const runtime = new AnimationRuntime({
          surface: fixture.surface,
          now: monotonicNow()
        });
        const service = new AnimationCommandService({
          runtime,
          selection: () => ({ members: [] })
        });

        const status = service.compose({
          tracks: [
            { id: "a", targetIds: ["a"], presetId: "spin" },
            { id: "b", targetIds: ["b"], presetId: "float" }
          ]
        });

        assertEqual(status.state, "playing");
        assertEqual(status.clip.targetMode, "objects");
        assertEqual(status.composition.tracks.length, 2);
        assertDeepEqual(fixture.captureOptions, [{ targetMode: "objects" }]);
        runtime.dispose();
      },

      "sobreposição de alvos entre faixas é rejeitada"() {
        assertThrowsMessage(
          () => compileAnimationTrackProgram([
            {
              id: "a",
              targetIds: ["box"],
              operations: [{ type: "move", value: [0, 0, 0] }]
            },
            {
              id: "b",
              targetIds: ["box"],
              operations: [{ type: "move", value: [0, 0, 0] }]
            }
          ]),
          "Alvo box aparece em a e b."
        );
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
    const projected = projectInstanceGraphScene(result.state).objects.map(object =>
      runtime.projectObject(object)
    );
    const group = projected.find(object => object.id === "group-a");
    const child = projected.find(object => object.prototypeId === "box-a");
    const sibling = projected.find(object => object.prototypeId === "box-b");
    const hierarchy = new HierarchyIndex(projected);

    assertEqual(group.kind, "group");
    assertEqual("material" in group, false);
    assert(Boolean(child.material));
    assertEqual(hierarchy.parentOf(child.id), "group-a");
    assertEqual(hierarchy.parentOf(sibling.id), "group-a");
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
      },

      "índice do sandbox acompanha criação transformação e histórico"() {
        const region = new Region(
          {
            id: "sandbox-index-region",
            name: "Sandbox index",
            type: "box-region"
          },
          {
            schemaVersion: 1,
            objects: [{
              id: "indexed-a",
              kind: "box",
              name: "A",
              position: [0, 0, 0],
              rotation: [0, 0, 0, 1],
              scale: [1, 1, 1],
              size: [1, 1, 1]
            }]
          }
        );
        const sandbox = new Sandbox(region, boxRegionReducer);
        assertEqual(sandbox.getObject("indexed-a").name, "A");
        sandbox.dispatch({
          type: "object.create",
          id: "indexed-b",
          name: "B",
          position: [1, 0, 0],
          size: [1, 1, 1]
        });
        assertEqual(sandbox.getObject("indexed-b").name, "B");
        sandbox.dispatch({
          type: "object.transform",
          id: "indexed-b",
          position: [3, 4, 5],
          rotation: [0, 0, 0, 1],
          scale: [2, 2, 2]
        });
        assertDeepEqual(
          sandbox.getObject("indexed-b").position,
          [3, 4, 5]
        );
        sandbox.undo();
        assertDeepEqual(
          sandbox.getObject("indexed-b").position,
          [1, 0, 0]
        );
        sandbox.redo();
        assertDeepEqual(
          sandbox.getObject("indexed-b").position,
          [3, 4, 5]
        );
        sandbox.dispatch({
          type: "selection.delete",
          ids: ["indexed-b"]
        });
        assertEqual(sandbox.getObject("indexed-b"), null);
        sandbox.undo();
        assertEqual(sandbox.getObject("indexed-b").name, "B");
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
      "camada de raiz recompõe descendentes sob o pai efetivo"() {
        const resolved = new LocallyResolvedObjectHierarchy();
        const matrixX = x => new THREE.Matrix4()
          .makeTranslation(x, 0, 0)
          .toArray();
        resolved.replaceBase([
          {
            object: { id: "root", kind: "group", parentId: null },
            worldMatrix: matrixX(10)
          },
          {
            object: { id: "inner", kind: "group", parentId: "root" },
            worldMatrix: matrixX(12)
          },
          {
            object: { id: "leaf", kind: "box", parentId: "inner" },
            worldMatrix: matrixX(15)
          }
        ], { revision: 1 });
        resolved.setLayer("preview", [
          { id: "root", worldMatrix: matrixX(20) }
        ], { priority: 200, baseRevision: 1 });

        assertNear(resolved.worldMatrix("leaf")[12], 25, 1e-12);
      },

      "cache de preview enumera recursivamente a subárvore afetada"() {
        const matrixX = x => new THREE.Matrix4()
          .makeTranslation(x, 0, 0)
          .toArray();
        const resolved = new LocallyResolvedObjectHierarchy();
        resolved.replaceBase([
          {
            object: { id: "outer", kind: "group", parentId: null },
            worldMatrix: matrixX(2)
          },
          {
            object: { id: "inner", kind: "group", parentId: "outer" },
            worldMatrix: matrixX(5)
          },
          {
            object: { id: "leaf", kind: "box", parentId: "inner" },
            worldMatrix: matrixX(9)
          }
        ], { revision: 3 });
        const rootOverride = [{ id: "outer", worldMatrix: matrixX(12) }];
        resolved.setLayer("local-preview", rootOverride, {
          priority: 300,
          baseRevision: 3
        });
        const preview = resolved.resolveAffectedBy(rootOverride);
        assertDeepEqual(preview.map(entry => entry.id), ["outer", "inner", "leaf"]);
        assertDeepEqual(preview.map(entry => entry.worldMatrix[12]), [12, 15, 19]);
        assertDeepEqual(
          resolved.clearLayer("local-preview"),
          ["outer", "inner", "leaf"]
        );
      },

      "compactação de grupo de grupos preserva override descendente"() {
        const group = (id, parentId, x) => ({
          id,
          kind: "group",
          parentId,
          position: [x, 0, 0],
          rotation: [0, 0, 0, 1],
          scale: [1, 1, 1],
          pivot: [0, 0, 0]
        });
        const leaf = (id, parentId, x) => ({
          id,
          kind: "box",
          parentId,
          position: [x, 0, 0],
          rotation: [0, 0, 0, 1],
          scale: [1, 1, 1],
          size: [1, 1, 1],
          geometry: { type: "box", size: [1, 1, 1] }
        });
        const inner = compactHierarchyRoots({
          objects: [group("inner", null, 1), leaf("leaf", "inner", 2)]
        }, ["inner"]).scene;
        const innerRoot = updateInstanceOccurrenceRoot(
          inner.objects[0],
          ["slot:0"],
          {
            transform: {
              position: [9, 0, 0],
              rotation: [0, 0, 0, 1],
              scale: [1, 1, 1]
            }
          }
        );
        const outer = compactHierarchyRoots({
          objects: [
            group("outer", null, 5),
            { ...innerRoot, parentId: "outer" }
          ],
          instanceGraph: inner.instanceGraph
        }, ["outer"]).scene;
        const nestedLeafId = instanceOccurrenceId(
          "outer",
          ["slot:0", "slot:0"]
        );
        const projected = projectInstanceGraphScene(outer);
        const nestedLeaf = projected.objects.find(
          object => object.id === nestedLeafId
        );

        assert(Boolean(nestedLeaf));
        assertNear(nestedLeaf.position[0], 9, 1e-12);
        assert(Boolean(outer.objects[0].overrides["slot:0/slot:0"]));
      },

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
        const descendants=sandbox.getObjectDescendantIds(["new-group"]);
        assertEqual(descendants.length,2);
        assertEqual(sandbox.getObject(descendants[0]).parentId,"new-group");
        assertEqual(sandbox.getObject(descendants[1]).parentId,descendants[0]);
      },
      "agrupamento preserva toda a subárvore no mundo"() {
        const sandbox=createHierarchySandbox();
        const movingWorld=sandbox.getObjectWorldMatrix("moving");
        const nestedWorld=sandbox.getObjectWorldMatrix("nested");
        sandbox.dispatch({
          type:"selection.group",
          groupId:"new-group",
          targetIds:["moving"]
        });
        const descendants=sandbox.getObjectDescendantIds(["new-group"]);
        assertMatricesNear(sandbox.getObjectWorldMatrix(descendants[0]),movingWorld);
        assertMatricesNear(sandbox.getObjectWorldMatrix(descendants[1]),nestedWorld);
      },
      "alvos de pais diferentes usam ancestral comum"() {
        const sandbox=createHierarchySandbox();
        const movingWorld=sandbox.getObjectWorldMatrix("moving");
        const targetWorld=sandbox.getObjectWorldMatrix("target");
        sandbox.dispatch({
          type:"selection.group",
          groupId:"cross-group",
          targetIds:["moving","target"]
        });
        const descendants=sandbox.getObjectDescendantIds(["cross-group"]);
        const movingId=descendants.find(id =>
          sandbox.getObject(id)?.kind === "group"
        );
        const targetId=descendants.find(id =>
          sandbox.getObject(id)?.prototypeId === "target"
        );
        assertEqual(sandbox.getObject("cross-group").parentId,null);
        assertEqual(sandbox.getObject(movingId).parentId,"cross-group");
        assertEqual(sandbox.getObject(targetId).parentId,"cross-group");
        assertMatricesNear(sandbox.getObjectWorldMatrix(movingId),movingWorld);
        assertMatricesNear(sandbox.getObjectWorldMatrix(targetId),targetWorld);
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
        const descendants=sandbox.getObjectDescendantIds(["outer"]);
        assertEqual(descendants.length,3);
        assertEqual(sandbox.getObject(descendants[0]).parentId,"outer");
        assertEqual(sandbox.getObject(descendants[1]).parentId,descendants[0]);
        assertEqual(sandbox.getObject(descendants[2]).parentId,descendants[1]);
      },
      "grupo de grupos publica todos os alvos de preview no índice"() {
        const sandbox=createGroupTransformSandbox({nested:true});
        sandbox.dispatch({
          type:"selection.group",
          groupId:"outer",
          targetIds:["group"]
        });
        const scene=projectInstanceGraphScene(sandbox.getSnapshot());
        const hierarchy=new HierarchyIndex(scene.objects);
        const replicas=new ReplicaRenderIndex();
        for (const object of scene.objects) {
          replicas.register(object,hierarchy.worldMatrixOf(object.id));
        }
        const members=replicas.members("outer");
        const byId=new Map(scene.objects.map(object=>[object.id,object]));

        assertEqual(sandbox.listObjectChildren("outer").total,1);
        assertEqual(members.length,3);
        assertEqual(
          members.filter(id=>isRenderableSceneNode(byId.get(id))).length,
          1
        );
        assertEqual(replicas.status().diagnostics.sceneScans,0);
        assertEqual(replicas.status().diagnostics.definitionTraversals,0);
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
        assertEqual(result.createdCount,2);
        assertEqual(result.duplicateIds.length,2);
        assertDeepEqual(
          editor.selection.snapshot().members.map(member => member.objectId),
          result.duplicateIds
        );
        for (const rootId of result.duplicateIds) {
          assertEqual(sandbox.listObjectChildren(rootId).total,1);
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
        assertEqual(result.createdCount,3);
        assertEqual(result.duplicateIds.length,3);
        for (const [index,rootId] of result.duplicateIds.entries()) {
          const childId=sandbox.listObjectChildren(rootId).items[0];
          const expected=multiplyMatrices(
            composeTransform({position:[2*(index+1),0,0]}),
            childBefore
          );
          assertMatricesNear(sandbox.getObjectWorldMatrix(childId),expected);
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

      async "saveAs sempre solicita um novo nome ao seletor nativo"() {
        let pickerCalls=0;
        const writes=[];
        const handle={
          name:"novo-nome.spatialseed",
          async createWritable() {
            return {
              async write(value) { writes.push(value); },
              async close() { writes.push("closed"); }
            };
          }
        };
        const harness=createFileGatewayHarness({
          async showSaveFilePicker() {
            pickerCalls+=1;
            return handle;
          }
        });
        harness.gateway.fileHandle={
          name:"anterior.spatialseed",
          async createWritable() {
            throw new Error("handle anterior não deve ser reutilizado");
          }
        };

        const result=await harness.gateway.save({
          prepared:true,
          filename:"projeto.spatialseed",
          mediaType:"application/json",
          text:"{}",
          bytes:2
        },{saveAs:true});

        assertEqual(pickerCalls,1);
        assertEqual(result.filename,"novo-nome.spatialseed");
        assertDeepEqual(writes,["{}","closed"]);
      },

      async "saveAs móvel nunca baixa sem antes solicitar um nome"() {
        const harness=createFileGatewayHarness();
        const project={
          prepared:true,
          filename:"projeto.spatialseed",
          mediaType:"application/json",
          text:"{}",
          bytes:2
        };

        const first=await harness.gateway.save(project,{saveAs:true});
        assertDeepEqual(first,{
          saved:false,
          fallbackRequired:true,
          fallbackReason:"native-unavailable"
        });
        assertDeepEqual(harness.calls,[]);

        harness.gateway.saveFallback(project,{
          fallbackReason:first.fallbackReason
        });
        const callsAfterFirstDownload=harness.calls.length;
        const second=await harness.gateway.save(project,{saveAs:true});

        assertEqual(second.fallbackRequired,true);
        assertEqual(second.fallbackReason,"native-unavailable");
        assertEqual(harness.calls.length,callsAfterFirstDownload);
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
      "schema atual preserva câmera hierárquica e câmera padrão"() {
        const assets = new AppearanceRuntime().exportAssets();
        const project = new ProjectValidator().validate({
          format: "spatial-seed",
          schemaVersion: ProjectSerializer.schemaVersion,
          assets,
          scene: {
            schemaVersion: 1,
            defaultCameraId: "camera-main",
            objects: [
              {
                id: "camera-group",
                kind: "group",
                position: [0, 0, 0],
                rotation: [0, 0, 0, 1],
                scale: [1, 1, 1]
              },
              {
                id: "camera-main",
                kind: "camera",
                parentId: "camera-group",
                position: [1, 2, 3],
                rotation: [0, 0, 0, 1],
                scale: [1, 1, 1],
                camera: {
                  projection: "perspective",
                  fov: 50,
                  near: 0.1,
                  far: 2000,
                  focusDistance: 8
                }
              }
            ]
          }
        });

        assertEqual(project.schemaVersion, 4);
        assertEqual(project.scene.defaultCameraId, "camera-main");
        assertEqual(project.scene.objects[1].kind, "camera");
        assertEqual("appearanceId" in project.scene.objects[1], false);
        assertThrowsMessage(
          () => new ProjectValidator().validate({
            format: "spatial-seed",
            schemaVersion: 2,
            assets,
            scene: {
              schemaVersion: 1,
              objects: [project.scene.objects[1]]
            }
          }),
          "exige schema 3"
        );
      },

      "schema 3 preserva luz lógica sem aparência"() {
        const assets = new AppearanceRuntime().exportAssets();
        const project = new ProjectValidator().validate({
          format: "spatial-seed",
          schemaVersion: 3,
          assets,
          scene: {
            schemaVersion: 1,
            objects: [{
              id: "light-main",
              kind: "light",
              name: "Luz principal",
              position: [2, 4, 6],
              rotation: [0, 0, 0, 1],
              scale: [1, 1, 1],
              light: {
                type: "spot",
                color: "#88ccff",
                intensity: 5,
                distance: 30,
                decay: 2,
                angleDeg: 35,
                penumbra: 0.25,
                castShadow: true
              }
            }]
          }
        });
        const light = project.scene.objects[0];
        assertEqual(light.kind, "light");
        assertEqual(light.light.type, "spot");
        assertEqual("appearanceId" in light, false);
        assertThrowsMessage(
          () => new ProjectValidator().validate({
            format: "spatial-seed",
            schemaVersion: 2,
            assets,
            scene: { schemaVersion: 1, objects: [light] }
          }),
          "exige schema 3"
        );
      },

      "schema 3 rejeita câmera padrão inexistente"() {
        assertThrowsMessage(
          () => new ProjectValidator().validate({
            format: "spatial-seed",
            schemaVersion: 3,
            assets: new AppearanceRuntime().exportAssets(),
            scene: {
              schemaVersion: 1,
              defaultCameraId: "camera-missing",
              objects: []
            }
          }),
          "Câmera padrão inexistente"
        );
      },

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

    "project-recovery": {
      "registro versionado preserva checkpoint e comandos"() {
        const record = createRecoveryRecord({
          sandboxId: "sandbox-test-record",
          checkpoint: recoveryCheckpoint("Registro"),
          commands: [{
            type: "object.create",
            id: "recovered",
            position: [0, 1, 0],
            size: [1, 1, 1]
          }],
          baseVersion: 0,
          revision: 1,
          dirty: true,
          updatedAt: "2026-07-24T12:00:00.000Z"
        });

        assertEqual(record.format, "spatial-seed-recovery");
        assertEqual(record.schemaVersion, 1);
        assertEqual(record.commands.length, 1);
        assertEqual(Object.isFrozen(record), true);
        assertThrowsMessage(
          () => validateRecoveryRecord({
            ...record,
            schemaVersion: 99
          }),
          "Versão de recuperação incompatível"
        );
      },

      async "comandos confirmados sobrevivem recarga e mantêm undo"() {
        const store = new MemoryRecoveryStore();
        const source = createRecoveryHarness({
          sandboxId: "sandbox-test-reload",
          store
        });
        await source.controller.initialize();
        source.sandbox.dispatch({
          type: "object.create",
          id: "recovered",
          position: [0, 1, 0],
          size: [1, 1, 1]
        });
        await source.controller.flush();
        source.controller.dispose();

        const target = createRecoveryHarness({
          sandboxId: "sandbox-test-reload",
          store
        });
        const pending = await target.controller.initialize();
        assertEqual(pending.mode, "draft");
        assertEqual(pending.pending.commandCount, 1);

        const continued = await target.controller.continueRecovery();
        assertEqual(continued.result.commandCount, 1);
        assertEqual(target.sandbox.objectCount, 1);
        assertEqual(target.sandbox.canUndo, true);
        assertEqual(target.sandbox.undo(), true);
        assertEqual(target.sandbox.objectCount, 0);
        target.controller.dispose();
      },

      async "autoridade promovida adota o snapshot vivo sem restaurar o antigo"() {
        const sandboxId = "sandbox-test-promoted-authority";
        const store = new MemoryRecoveryStore([
          createRecoveryRecord({
            sandboxId,
            checkpoint: recoveryCheckpoint("Antigo"),
            commands: [{
              type: "object.create",
              id: "stale-recovery-object",
              position: [0, 1, 0],
              size: [1, 1, 1]
            }],
            baseVersion: 0,
            revision: 1,
            dirty: true,
            updatedAt: "2026-07-24T12:00:00.000Z"
          })
        ]);
        const harness = createRecoveryHarness({
          sandboxId,
          store
        });
        harness.sandbox.dispatch({
          type: "object.create",
          id: "live-replica-object",
          position: [3, 1, 0],
          size: [1, 1, 1]
        });

        const adopted = harness.controller.adoptCurrentSession(
          sandboxId
        );
        assertEqual(adopted.mode, "adopted-current");
        assertEqual(harness.projectService.restoreCalls, 0);
        assertEqual(harness.sandbox.objectCount, 1);
        assertEqual(
          harness.sandbox.getState().objects[0].id,
          "live-replica-object"
        );

        await harness.controller.flush();
        const persisted = await store.load(sandboxId);
        assertEqual(persisted.commands.length, 1);
        assertEqual(
          persisted.commands[0].id,
          "live-replica-object"
        );
        harness.controller.dispose();
      },

      async "serviço real continua rascunho e reabre cópia exportada"() {
        const sandboxId = "sandbox-test-real-project-service";
        const source = createProjectServiceRecoveryHarness({
          sandboxId,
          store: new MemoryRecoveryStore()
        });
        const appearance = source.appearanceRuntime.internLegacyMaterial({
          color: "#336699"
        });
        const record = createRecoveryRecord({
          sandboxId,
          checkpoint: source.projectService.createCheckpoint(),
          commands: [{
            type: "object.create",
            id: "recovered-real",
            position: [0, 1, 0],
            size: [1, 1, 1],
            appearanceId: appearance.appearanceId
          }],
          baseVersion: 0,
          revision: 1,
          dirty: true,
          updatedAt: "2026-07-24T12:00:00.000Z"
        });
        const store = new MemoryRecoveryStore([record]);
        const target = createProjectServiceRecoveryHarness({
          sandboxId,
          store
        });

        const pending = await target.controller.initialize();
        assertEqual(pending.mode, "draft");
        const prepared = target.controller.prepareExport();
        const continued = await target.controller.continueRecovery();

        assertEqual(continued.mode, "continued");
        assertEqual(continued.result.objectCount, 1);
        assertEqual(target.sandbox.objectCount, 1);
        assertEqual(target.sandbox.canUndo, true);

        const opened = createProjectServiceRecoveryHarness({
          sandboxId: `${sandboxId}-opened`,
          store: new MemoryRecoveryStore()
        });
        const loaded = opened.projectService.openText(prepared.text);

        assertEqual(loaded.loaded, true);
        assertEqual(loaded.objectCount, 1);
        assertEqual(opened.sandbox.objectCount, 1);
        assertEqual(opened.region.getState().objects.length, 1);
        target.controller.dispose();
        opened.controller.dispose();
      },

      async "checkpoint limpo reabre sem diálogo de rascunho"() {
        const sandboxId = "sandbox-test-clean";
        const store = new MemoryRecoveryStore([
          createRecoveryRecord({
            sandboxId,
            checkpoint: recoveryCheckpoint("Limpo"),
            commands: [],
            baseVersion: 0,
            revision: 0,
            dirty: false,
            updatedAt: "2026-07-24T12:00:00.000Z"
          })
        ]);
        const harness = createRecoveryHarness({ sandboxId, store });
        const status = await harness.controller.initialize();

        assertEqual(status.mode, "restored-clean");
        assertEqual(harness.projectService.restoreCalls, 1);
        assertEqual(harness.sandbox.dirty, false);
        harness.controller.dispose();
      },

      async "abrir projeto troca identidade sem sobrescrever o anterior"() {
        const store = new MemoryRecoveryStore();
        const identityChanges = [];
        const harness = createRecoveryHarness({
          sandboxId: "sandbox-test-before",
          rotatedId: "sandbox-test-after",
          store,
          onIdentityChanged: change =>
            identityChanges.push(change)
        });
        await harness.controller.initialize();
        await harness.controller.flush();
        assert(Boolean(await store.load("sandbox-test-before")));

        harness.projectService.emit({ type: "project-opened" });
        await harness.controller.flush();

        assertEqual(
          await store.load("sandbox-test-before"),
          null
        );
        assert(Boolean(await store.load("sandbox-test-after")));
        assertEqual(
          harness.controller.status().sandboxId,
          "sandbox-test-after"
        );
        assertDeepEqual(identityChanges, [{
          previousId: "sandbox-test-before",
          sandboxId: "sandbox-test-after"
        }]);
        harness.controller.dispose();
      },

      "identidade persiste no armazenamento local"() {
        const values = new Map();
        const identity = new BrowserSandboxIdentity({
          storage: {
            getItem(key) { return values.get(key) ?? null; },
            setItem(key, value) { values.set(key, value); }
          },
          cryptoApi: {
            randomUUID() {
              return "12345678-1234-1234-1234-123456789abc";
            }
          }
        });
        const first = identity.current();
        const second = identity.current();
        assertEqual(first, second);
        assertEqual(
          first,
          "sandbox-12345678-1234-1234-1234-123456789abc"
        );
      },

      "console consulta o controlador de recuperação"() {
        const console = new DevConsole({
          editor: { selection: new Selection() },
          sandbox: {},
          region: {},
          renderer: {},
          getDiagnostics: () => ({}),
          commands: {
            describe: () => [],
            execute() {
              throw new Error("Consulta não deve executar comando.");
            }
          },
          queries: {
            execute(id) {
              assertEqual(id, "recovery.status");
              return { mode: "active", sandboxId: "sandbox-console" };
            }
          }
        });

        const [entry] = console.execute("recovery status");
        assertEqual(entry.ok, true);
        assertEqual(entry.result.sandboxId, "sandbox-console");
      }
    },

    "web-application-profile": {
      "perfil padrão não importa extensões de diagnóstico"() {
        const definition=normalizeWebApplicationDefinition({
          definitionVersion:WEB_APPLICATION_DEFINITION_VERSION,
          id:"spatialseed.application.modeling",
          role:"production",
          extensions:[]
        },{
          sourceUrl:"https://example.test/apps/web/config/application.default.json"
        });
        let imports=0;
        return loadWebRuntimeExtensions(definition,{
          importModule() { imports+=1; }
        }).then(extensions => {
          assertEqual(extensions.length,0);
          assertEqual(imports,0);
        });
      },

      "perfil de produção rejeita extensão diagnóstica"() {
        assertThrowsMessage(() => normalizeWebApplicationDefinition({
          definitionVersion:WEB_APPLICATION_DEFINITION_VERSION,
          id:"spatialseed.application.invalid",
          role:"production",
          extensions:[{
            id:"spatialseed.diagnostics.runtime-tests",
            apiVersion:WEB_RUNTIME_EXTENSION_API_VERSION,
            role:"diagnostics",
            entry:"../../../packages/runtime-test-plugin/src/index.js"
          }]
        },{
          sourceUrl:"https://example.test/apps/web/config/application.invalid.json"
        }),"produção");
      },

      "registro editorial não contém comandos de desenvolvimento"() {
        const fixture=createEditContextFixture();
        const commands=createEditorCommands({
          editor:fixture.editor,
          renderer:fixture.renderer,
          selectionOperations:{},
          projectService:{}
        });
        const ids=new Set(commands.describe().map(command => command.id));
        for (const id of [
          "runtime.test.run",
          "test.run",
          "runtime.resources",
          "benchmark.compact"
        ]) {
          assertEqual(ids.has(id),false);
        }
        assertEqual(ids.has("selection.stats"),true);
      },

      async "perfil diagnóstico resolve definição e valida manifesto"() {
        let requested=null;
        const definition=await loadWebApplicationDefinition({
          name:webApplicationName({
            href:"https://example.test/apps/web/?application=diagnostics"
          }),
          applicationRootUrl:"https://example.test/apps/web/boot.js",
          fetchImpl:async url => {
            requested=url;
            return {
              ok:true,
              async json() {
                return {
                  definitionVersion:WEB_APPLICATION_DEFINITION_VERSION,
                  id:"spatialseed.application.diagnostics",
                  role:"diagnostics",
                  extensions:[{
                    id:"spatialseed.diagnostics.runtime-tests",
                    apiVersion:WEB_RUNTIME_EXTENSION_API_VERSION,
                    role:"diagnostics",
                    entry:"../../../packages/runtime-test-plugin/src/index.js"
                  }]
                };
              }
            };
          }
        });
        const loaded=await loadWebRuntimeExtensions(definition,{
          importModule:async entryUrl => ({
            webRuntimeExtension:{
              manifest:{
                id:"spatialseed.diagnostics.runtime-tests",
                apiVersion:WEB_RUNTIME_EXTENSION_API_VERSION,
                role:"diagnostics"
              },
              activate() {}
            },
            entryUrl
          })
        });
        assertEqual(
          requested,
          "https://example.test/apps/web/config/application.diagnostics.json"
        );
        assertEqual(loaded.length,1);
        assertEqual(
          loaded[0].manifest.id,
          "spatialseed.diagnostics.runtime-tests"
        );
      },

      async "ativação falha de forma atômica e descarta em ordem inversa"() {
        const events=[];
        let error=null;
        try {
          await activateWebRuntimeExtensions([{
            manifest:{id:"spatialseed.test.first"},
            activate() {
              events.push("first.activate");
              return {dispose:() => events.push("first.dispose")};
            }
          },{
            manifest:{id:"spatialseed.test.second"},
            activate() {
              events.push("second.activate");
              throw new Error("activation failed");
            }
          }],{});
        } catch (caught) {
          error=caught;
        }
        assertEqual(error?.message,"activation failed");
        assertDeepEqual(events,[
          "first.activate",
          "second.activate",
          "first.dispose"
        ]);
      },

      "ajuda do console não anuncia comandos ausentes na produção"() {
        const createConsole=ids => new DevConsole({
          editor:{selection:new Selection()},
          sandbox:{},
          region:{},
          renderer:{},
          getDiagnostics:() => ({}),
          commands:{
            execute() {},
            describe:() => ids.map(id => ({id}))
          }
        });
        const production=createConsole([]).execute("help")[0].result.commands;
        const diagnostics=createConsole([
          "runtime.test.run"
        ]).execute("help")[0].result.commands;
        assertEqual(
          production.some(command => command.startsWith("runtime test")),
          false
        );
        assertEqual(
          production.some(command => command.includes("?application=diagnostics")),
          true
        );
        assertEqual(
          diagnostics.some(command => command.startsWith("runtime test")),
          true
        );
      }
    },

    "pwa-status": {
      "escopo local permanece limitado à aplicação"() {
        const locations=resolvePwaLocations(
          "http://127.0.0.1:8082/apps/web/boot.js"
        );
        assertEqual(locations.applicationRoot,"http://127.0.0.1:8082/apps/web/");
        assertEqual(locations.repositoryRoot,"http://127.0.0.1:8082/");
        assertEqual(
          locations.workerUrl,
          "http://127.0.0.1:8082/apps/web/service-worker.js"
        );
        assertEqual(locations.scope,"/apps/web/");
        assertEqual(locations.scopeUrl,"http://127.0.0.1:8082/apps/web/");
      },

      "barra duplicada não transforma o escopo em outro host"() {
        const locations=resolvePwaLocations(
          "http://127.0.0.1:8082//apps/web/boot.js"
        );
        assertEqual(locations.applicationRoot,"http://127.0.0.1:8082/apps/web/");
        assertEqual(locations.workerUrl,
          "http://127.0.0.1:8082/apps/web/service-worker.js");
        assertEqual(locations.scope,"/apps/web/");
        assertEqual(locations.scopeUrl,"http://127.0.0.1:8082/apps/web/");
      },

      "prefixo do GitHub Pages é preservado nos caminhos PWA"() {
        const locations=resolvePwaLocations(
          "https://livredopodervil.github.io/SpatialSeed/apps/web/boot.js"
        );
        assertEqual(
          locations.workerUrl,
          "https://livredopodervil.github.io/SpatialSeed/apps/web/service-worker.js"
        );
        assertEqual(locations.scope,"/SpatialSeed/apps/web/");
        assertEqual(locations.scopeUrl,
          "https://livredopodervil.github.io/SpatialSeed/apps/web/");
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
      },

      "oferece atualização somente quando publicação e controlador divergem"() {
        assertEqual(pwaUpdateAvailable({
          publishedBuild:"0025g",
          controllerBuild:"0025d"
        }),true);
        assertEqual(pwaUpdateAvailable({
          publishedBuild:"0025g",
          controllerBuild:"0025g"
        }),false);
        assertEqual(pwaUpdateAvailable({
          publishedBuild:"0025g",
          controllerBuild:null
        }),false);
        assertEqual(pwaUpdateAvailable({
          publishedBuild:"0025g",
          controllerBuild:"0025g",
          waitingBuild:"0025g"
        }),true);
      },

      "erro de atualização aparece sem exigir reset automático"() {
        assertEqual(formatPwaBuildLabel({
          version:"0.1.0",
          build:"0025g",
          channel:"test"
        },{
          controllerBuild:"0025d",
          error:"Feche e abra novamente."
        }),"v0.1.0 · build 0025g · atualização requer atenção");
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
        assertEqual(configuration.shortcuts.profile,"spatialseed");
        assertDeepEqual(configuration.shortcuts.bindings,[]);
        assertEqual(configuration.presentation.transform.size,0.8);
        assertEqual(configuration.presentation.sceneExit.corner,"top-left");
        assertEqual(
          configuration.presentation.sceneExit.helpStorageKey,
          "spatialseed.ui.scene-help.v1"
        );
        assertEqual(
          configuration.presentation.viewerRender.storageKey,
          "spatialseed.viewer.render.v1"
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
      },
      "normaliza atalhos declarativos sem acoplar ações"() {
        const configuration=normalizeUiConfiguration({
          shortcuts:{
            profile:"test",
            storageKey:"test.shortcuts",
            bindings:[
              {action:"history.undo",chord:"primary+z"},
              {action:"tool.rotate",chord:"E",context:"viewport"}
            ]
          }
        });
        assertEqual(configuration.shortcuts.profile,"test");
        assertDeepEqual(configuration.shortcuts.bindings,[
          {action:"history.undo",chord:"Primary+Z",context:"global"},
          {action:"tool.rotate",chord:"E",context:"viewport"}
        ]);
      },
      "rejeita conflito de atalho dentro do mesmo contexto"() {
        let failed=false;
        try {
          normalizeUiConfiguration({shortcuts:{bindings:[
            {action:"history.undo",chord:"Primary+Z"},
            {action:"history.redo",chord:"Primary+Z"}
          ]}});
        } catch (error) {
          failed=/duplicado/.test(error.message);
        }
        assertEqual(failed,true);
      }
    },

    "ui-actions": {
      "paleta combina ações executáveis e comandos sem duplicar registro"() {
        const registry = new UiActionRegistry({
          root: null,
          configuration: { bindings: [{
            action: "history.undo",
            chord: "Primary+Z",
            context: "global"
          }] }
        });
        registry
          .register("history.undo", () => true, {
            label: "Desfazer",
            metadata: { command: "history.undo" }
          })
          .register("selection.quick", () => true, {
            label: "Seleção rápida",
            enabled: () => false
          });
        const entries = createCommandPaletteEntries({
          uiActions: registry.describe(),
          runtimeCommands: [
            { id: "history.undo", metadata: { category: "history" } },
            {
              id: "mesh.extrude.invoke",
              metadata: {
                category: "mesh-edit",
                label: "Iniciar extrusão por caminho"
              }
            }
          ]
        });
        assertEqual(
          entries.filter(entry => entry.command === "history.undo").length,
          1
        );
        assertEqual(
          entries.find(entry => entry.id === "selection.quick").enabled,
          false
        );
        assertEqual(
          rankCommandPaletteEntries(entries, "extr caminho")[0].id,
          "mesh.extrude.invoke"
        );
        assertEqual(
          rankCommandPaletteEntries(entries, "selec")[0].id,
          "selection.quick"
        );
        assertEqual(
          entries.find(entry => entry.id === "history.undo").shortcut,
          "Ctrl/Cmd+Z"
        );
        assertEqual(
          formatRuntimeCommandForConsole("mesh.extrude.invoke"),
          "runtime command mesh.extrude.invoke"
        );
        registry.dispose();
      },

      "paleta pode abrir dentro de campo textual sem liberar outros atalhos"() {
        let calls = 0;
        const registry = new UiActionRegistry({
          root: null,
          configuration: { bindings: [{
            action: "command.palette.toggle",
            chord: "Primary+P",
            context: "global"
          }] }
        });
        registry.register("command.palette.toggle", () => { calls += 1; }, {
          metadata: { allowInTextEditing: true }
        });
        assertEqual(registry.handleKeydown(createShortcutEvent({
          key: "p",
          ctrlKey: true,
          textEditing: true
        }), "viewport"), true);
        assertEqual(calls, 1);
        registry.dispose();
      },

      "console resume testes e mutações sem despejar o objeto inteiro"() {
        assertEqual(
          formatConsoleEntry({
            result: {
              scope: "runtime-layers",
              passed: 625,
              failed: 0,
              total: 625,
              durationMs: 1843,
              ok: true,
              results: Array.from({ length: 625 }, () => ({ ok: true }))
            }
          }),
          "Passou: 625/625 testes · 1.84 s"
        );
        assertEqual(
          formatConsoleEntry({ result: {
            changed: false,
            reason: "no-repeat-history",
            payload: { large: true }
          } }),
          "alterado false · motivo no-repeat-history"
        );
        assertEqual(
          formatConsoleEntry({ error: "comando inválido" }),
          "Erro: comando inválido"
        );
      },

      "normaliza acordes portáveis para Ctrl e Command"() {
        assertEqual(normalizeShortcutChord("primary + shift + z"),"Primary+Shift+Z");
        assertEqual(normalizeShortcutChord("delete"),"Delete");
      },
      "Ctrl+C duplica e Ctrl+D repete fora de campos de texto"() {
        const calls = [];
        const registry = new UiActionRegistry({
          root: null,
          configuration: { bindings: [
            {
              action: "selection.duplicate",
              chord: "Primary+C",
              context: "global"
            },
            {
              action: "selection.repeat",
              chord: "Primary+D",
              context: "global"
            }
          ] }
        });
        registry
          .register("selection.duplicate", () => calls.push("duplicate"))
          .register("selection.repeat", () => calls.push("repeat"));
        assertEqual(
          registry.handleKeydown(
            createShortcutEvent({ key: "c", ctrlKey: true }),
            "viewport"
          ),
          true
        );
        assertEqual(
          registry.handleKeydown(
            createShortcutEvent({ key: "d", ctrlKey: true }),
            "viewport"
          ),
          true
        );
        assertDeepEqual(calls, ["duplicate", "repeat"]);
        assertEqual(
          registry.handleKeydown(
            createShortcutEvent({
              key: "c",
              ctrlKey: true,
              textEditing: true
            }),
            "viewport"
          ),
          false
        );
        registry.dispose();
      },
      "atalho e ação visual compartilham o mesmo handler"() {
        let calls=0;
        const registry=new UiActionRegistry({
          root:null,
          configuration:{bindings:[
            {action:"history.undo",chord:"Primary+Z",context:"global"}
          ]}
        });
        registry.register("history.undo",() => { calls += 1; return calls; });
        assertEqual(registry.execute("history.undo"),1);
        const event=createShortcutEvent({key:"z",ctrlKey:true});
        assertEqual(registry.handleKeydown(event,"viewport"),true);
        assertEqual(calls,2);
        assertEqual(event.prevented,true);
        assertEqual(event.stopped,true);
        registry.dispose();
      },
      "campos de texto preservam o histórico do editor interno"() {
        let calls=0;
        const registry=new UiActionRegistry({
          root:null,
          configuration:{bindings:[
            {action:"history.undo",chord:"Primary+Z",context:"global"}
          ]}
        });
        registry.register("history.undo",() => { calls += 1; });
        const event=createShortcutEvent({
          key:"z",
          ctrlKey:true,
          textEditing:true
        });
        assertEqual(registry.handleKeydown(event,"viewport"),false);
        assertEqual(calls,0);
        assertEqual(event.prevented,false);
        assertEqual(registry.describe().statistics.ignoredTextEditing,1);
        registry.dispose();
      },
      "contexto específico prevalece sobre ação global"() {
        const calls=[];
        const registry=new UiActionRegistry({
          root:null,
          configuration:{bindings:[
            {action:"scene.global",chord:"F",context:"global"},
            {action:"viewport.frame",chord:"F",context:"viewport"}
          ]}
        });
        registry
          .register("scene.global",() => calls.push("global"))
          .register("viewport.frame",() => calls.push("viewport"));
        assertEqual(
          registry.handleKeydown(createShortcutEvent({key:"f"}),"viewport"),
          true
        );
        assertDeepEqual(calls,["viewport"]);
        registry.dispose();
      },
      "preferências persistidas substituem o perfil sem tocar no layout"() {
        const values=new Map();
        const storage={
          getItem:key => values.get(key) ?? null,
          setItem:(key,value) => values.set(key,value),
          removeItem:key => values.delete(key)
        };
        const configuration={
          profile:"test",
          storageKey:"test.shortcuts",
          bindings:[{action:"tool.rotate",chord:"E",context:"viewport"}]
        };
        const first=new UiActionRegistry({root:null,storage,configuration});
        first.setBindings([
          {action:"tool.rotate",chord:"R",context:"viewport"}
        ]);
        first.dispose();
        const restored=new UiActionRegistry({root:null,storage,configuration});
        assertDeepEqual(restored.describeBindings(),[
          {action:"tool.rotate",chord:"R",context:"viewport"}
        ]);
        assertEqual(restored.describe().profile,"test");
        restored.resetBindings();
        assertDeepEqual(restored.describeBindings(),[
          {action:"tool.rotate",chord:"E",context:"viewport"}
        ]);
        restored.dispose();
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

      "cache retém somente versões recentes de conjuntos de traços"() {
        let creates = 0;
        let disposes = 0;
        const cache = new RefCountCache({
          retainReleased: 2,
          retainWhen: key => key.startsWith("stroke-bundle:"),
          create(key) {
            creates += 1;
            return { key, dispose() { disposes += 1; } };
          }
        });
        const first = cache.acquire("stroke-bundle:a").value;
        cache.release("stroke-bundle:a");
        const restored = cache.acquire("stroke-bundle:a").value;
        assertEqual(first, restored);
        assertEqual(creates, 1);
        cache.release("stroke-bundle:a");
        cache.acquire("stroke-bundle:b");
        cache.release("stroke-bundle:b");
        cache.acquire("stroke-bundle:c");
        cache.release("stroke-bundle:c");
        assertEqual(cache.stats().retained, 2);
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

  "famílias lógicas diferentes compartilham o mesmo lote"() {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshBasicMaterial();
    const manager = new InstanceBatchManager();
    const first = manager.addSegmented({
      resourceId: "/objects/a/members/a1",
      ownerId: "family-a",
      memberId: "a1",
      batchBaseKey: "shared-box",
      matrix: new THREE.Matrix4(),
      descriptor: { geometry, material, capacity: 16 }
    });
    const second = manager.addSegmented({
      resourceId: "/objects/b/members/b1",
      ownerId: "family-b",
      memberId: "b1",
      batchBaseKey: "shared-box",
      matrix: new THREE.Matrix4().makeTranslation(2, 0, 0),
      descriptor: { geometry, material, capacity: 16 }
    });
    assertEqual(manager.batchCount, 1);
    assertEqual(first.batch, second.batch);
    assertEqual(manager.hasObject("family-a"), true);
    assertEqual(
      manager.referenceFromHit({
        object: second.batch.mesh,
        instanceId: second.instanceIndex
      }).ownerId,
      "family-b"
    );
    assertEqual(manager.removeOwner("family-a").removed, 1);
    assertEqual(manager.hasObject("family-b"), true);
    manager.clear({ disposeGeometry: true, disposeMaterial: true });
  },

  "tubos heterogêneos compatíveis compartilham BatchedMesh quando disponível"() {
    const manager = new HeterogeneousBatchManager({
      maximumInstances: 8,
      maximumVertices: 10000,
      maximumIndices: 30000
    });
    if (!manager.supported) {
      assertEqual(manager.status().supported, false);
      return;
    }
    const material = new THREE.MeshBasicMaterial();
    const first = manager.add({
      objectId: "tube-a",
      resourceId: "/objects/tube-a/@render/chunks/1",
      ownerId: "tube-a",
      batchBaseKey: "tube-shared",
      geometry: new THREE.BoxGeometry(1, 1, 1),
      matrix: new THREE.Matrix4(),
      materialFactory: () => ({ material })
    });
    const second = manager.add({
      objectId: "tube-b",
      resourceId: "/objects/tube-b/@render/chunks/1",
      ownerId: "tube-b",
      batchBaseKey: "tube-shared",
      geometry: new THREE.SphereGeometry(0.5, 8, 6),
      matrix: new THREE.Matrix4().makeTranslation(2, 0, 0),
      materialFactory: () => ({ material })
    });
    assertEqual(first.added, true);
    assertEqual(second.added, true);
    assertEqual(manager.status().batches, 1);
    assertEqual(manager.status().owners, 2);
    manager.clear();
    material.dispose();
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

  "cor absoluta por instância atravessa canais nulos do material"() {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshStandardMaterial({
      color: "#ff0000"
    });
    const batch = new InstanceBatch({
      key: "absolute-color",
      geometry,
      material,
      capacity: 2
    });
    batch.add("a", new THREE.Matrix4());

    const desired = new THREE.Color("#00ff80");
    assertEqual(
      updateAbsoluteInstanceColor(batch, "a", desired),
      true
    );
    const projected = batch.material.color
      .clone()
      .multiply(batch.colorAt("a"));
    assertNear(projected.r, desired.r, 1e-6);
    assertNear(projected.g, desired.g, 1e-6);
    assertNear(projected.b, desired.b, 1e-6);
    assertEqual(batch.material.color.g > 0, true);
    assertEqual(batch.material.color.b > 0, true);

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

    "viewer-render-settings": {
      "normaliza limites e mantém configuração congelada"() {
        const settings = normalizeViewerRenderSettings({
          quality: {
            pixelRatioCap: 99,
            transmissionResolutionScale: 0
          },
          shadows: {
            mapSize: 777,
            floorOpacity: 4
          },
          materials: {
            ior: 8,
            roughness: -1,
            dispersion: 12
          }
        });

        assertEqual(settings.quality.pixelRatioCap, 3);
        assertEqual(settings.quality.transmissionResolutionScale, 0.1);
        assertEqual(settings.shadows.mapSize, 1024);
        assertEqual(settings.shadows.floorOpacity, 1);
        assertEqual(settings.materials.ior, 2.333);
        assertEqual(settings.materials.roughness, 0);
        assertEqual(settings.materials.dispersion, 10);
        assertEqual(Object.isFrozen(settings.materials), true);
      },

      "preset cristal ativa transmissão e dispersão"() {
        const settings = viewerRenderPreset("crystal-blue");

        assertEqual(settings.materials.mode, "override");
        assertEqual(settings.materials.color, "#72cfff");
        assert(settings.materials.transmission > 0.9);
        assert(settings.materials.dispersion > 0);
        assertEqual(settings.environment.enabled, true);
        assertEqual(settings.shadows.enabled, true);
      },

      "modo projeto preserva parâmetros do documento"() {
        const material = resolveViewerMaterial({
          model: "physical",
          color: "#abcdef",
          parameters: {
            roughness: 0.44,
            transmission: 0.7,
            ior: 1.33
          }
        }, {
          mode: "project",
          colorMode: "override",
          color: "#112233",
          roughness: 0.1,
          transmission: 1,
          ior: 2
        });

        assertEqual(material.color, "#112233");
        assertEqual(material.parameters.roughness, 0.44);
        assertEqual(material.parameters.transmission, 0.7);
        assertEqual(material.parameters.ior, 1.33);
      },

      "modo sobrescrever produz material físico local"() {
        const resourceCache = {
          acquireTexture() { return null; },
          releaseTexture() { return true; }
        };
        const cache = new BatchMaterialCache({
          resourceCache,
          viewerMaterialSettings: {
            mode: "override",
            colorMode: "override",
            color: "#72cfff",
            roughness: 0.05,
            transmission: 0.95,
            ior: 1.46,
            thickness: 0.8,
            attenuationColor: "#38a8ff",
            attenuationDistance: 8,
            dispersion: 0.18,
            envMapIntensity: 1.4
          }
        });
        const acquired = cache.acquire({
          appearanceId: "crystal",
          material: { color: "#ffffff" }
        });
        const material = acquired.value.material;

        assertEqual(material.isMeshPhysicalMaterial, true);
        assertEqual(material.color.getHexString(), "72cfff");
        assertEqual(material.transmission, 0.95);
        assertEqual(material.ior, 1.46);
        assertEqual(material.dispersion, 0.18);
        assertEqual(material.envMapIntensity, 1.4);
        cache.release(acquired.key);
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

      "catálogo inválido não deixa definições parciais"() {
        const registry = new ExperimentRegistry();
        const definition = createExperimentDefinition();

        assertThrowsMessage(
          () => registry.registerCatalog([
            { ...definition, id: "math.catalog-entry" },
            { ...definition, id: "math.catalog-entry" }
          ]),
          "Experimento duplicado"
        );
        assertDeepEqual(registry.list(), []);
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
      "manifesto declara o catálogo sem carregar handlers": async () => {
        const registry = new ModuleRegistry()
          .register(starterExperimentModule);

        const [registered] = registry.describe();
        assertEqual(registered.state, "registered");
        assertDeepEqual(
          registered.contributes.catalogs.map(item => item.id),
          [STARTER_EXPERIMENT_CATALOG_CONTRIBUTION_ID]
        );

        await registry.activateAll();
        const [description] = registry.describe();

        assertEqual(
          description.id,
          "spatialseed.procedural.experiments.starter"
        );
        assertEqual(description.state, "active");
        assertEqual(description.failed, false);
        assertEqual(description.error, null);
        assertEqual(description.status.definitions, 3);
        await registry.dispose();
      },

      "catálogo inicial é materializado atomicamente": async () => {
        const experiments = await createStarterExperimentRegistry();

        assertDeepEqual(
          experiments.list().map(item => item.id).sort(),
          ["math.helix", "math.polar-flower", "math.sine-wave"]
        );
      },

      "fontes iniciais produzem planos determinísticos válidos": async () => {
        const registry = await createStarterExperimentRegistry();
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
        assertEqual(color.procedural, true);
        assertEqual("normalize" in color, false);
      },

      "providers geométricos ampliam o mesmo registro de propriedades"() {
        const registry = createDefaultPropertyRegistry({
          geometryRegistry: createDefaultGeometryRegistry()
        });
        const properties = registry.describe().properties;
        const depth = properties.find(property =>
          property.id === "geometry.extrude.depth"
        );
        const bevelSegments = properties.find(property =>
          property.id === "geometry.extrude.bevelSegments"
        );
        const contour = properties.find(property =>
          property.id === "geometry.extrude.contour"
        );
        const boxSizes = properties.filter(property =>
          property.id === "geometry.size" ||
          property.id === "geometry.box.size"
        );

        assertEqual(depth.valueType, "number");
        assertEqual(depth.minimum, 0.001);
        assertEqual(depth.integer, false);
        assertEqual(bevelSegments.integer, true);
        assertEqual(bevelSegments.minimum, 0);
        assertEqual(contour.valueType, "json");
        assertDeepEqual(boxSizes.map(property => property.id), ["geometry.size"]);
      },

      "parâmetro geométrico usa comando atômico undo redo e save open"() {
        const fixture = createGeometryPropertyFixture();
        fixture.editor.selection.replace({
          regionId: fixture.region.id,
          objectId: "extrude-a"
        });

        const changed = fixture.service.setSelection({
          "geometry.extrude.depth": 4,
          "geometry.extrude.bevelSegments": 5
        });
        assertEqual(changed.changed, true);
        assertEqual(fixture.sandbox.getObject("extrude-a").geometry.depth, 4);
        assertEqual(
          fixture.sandbox.getObject("extrude-a").geometry.bevelSegments,
          5
        );
        assertEqual(fixture.sandbox.getHistoryDiagnostics().commandCount, 1);

        assertEqual(fixture.sandbox.undo(), true);
        assertEqual(fixture.sandbox.getObject("extrude-a").geometry.depth, 1);
        assertEqual(fixture.sandbox.redo(), true);
        assertEqual(fixture.sandbox.getObject("extrude-a").geometry.depth, 4);

        const saved = fixture.projectService.save();
        fixture.service.setSelection({ "geometry.extrude.depth": 2 });
        fixture.projectService.openText(saved.text);
        assertEqual(fixture.sandbox.getObject("extrude-a").geometry.depth, 4);
      },

      "console edita parâmetro geométrico pela API comum"() {
        const fixture = createGeometryPropertyFixture();
        fixture.editor.selection.replace({
          regionId: fixture.region.id,
          objectId: "extrude-a"
        });
        const console = createPropertyConsole(fixture);
        const result = console.execute(
          "property set geometry.extrude.depth 3.5"
        )[0];

        assertEqual(result.ok, true);
        assertEqual(
          fixture.sandbox.getObject("extrude-a").geometry.depth,
          3.5
        );
      },

      "inteiro geométrico inválido não altera mundo nem histórico"() {
        const fixture = createGeometryPropertyFixture();
        fixture.editor.selection.replace({
          regionId: fixture.region.id,
          objectId: "extrude-a"
        });
        const before = fixture.sandbox.materializeState();

        assertThrowsMessage(
          () => fixture.service.setSelection({
            "geometry.extrude.bevelSegments": 1.5
          }),
          "deve ser inteiro"
        );
        assertDeepEqual(fixture.sandbox.materializeState(), before);
        assertEqual(fixture.sandbox.getHistoryDiagnostics().commandCount, 0);
      },

      "escopo renderizável abre grupos aninhados sem editar nós lógicos"() {
        const fixture = createPropertyFixture({ grouped: true });
        fixture.selection.replace({
          regionId: "region-properties",
          objectId: "outer"
        });

        assertDeepEqual(
          resolveSelectionTargetIds({
            selection: fixture.selection,
            state: fixture.sandbox.getState(),
            targetScope: "renderables"
          }),
          ["a", "b"]
        );
        const inspection = fixture.service.inspectSelection({
          targetScope: "renderables"
        });
        assertEqual(inspection.count, 2);
        assertDeepEqual(inspection.targetIds, ["a", "b"]);
      },

      "expressão procedural colore descendentes em um comando atômico"() {
        const fixture = createPropertyFixture({ grouped: true });
        fixture.selection.replace({
          regionId: "region-properties",
          objectId: "outer"
        });

        const result = fixture.service.setSelectionProcedural({
          propertyId: "instance.color",
          expression: "hsl(240*u, 1, 0.5)",
          targetScope: "renderables"
        });
        const byId = new Map(
          fixture.sandbox.getState().objects.map(object => [object.id, object])
        );

        assertEqual(result.changed, true);
        assertDeepEqual(result.targetIds, ["a", "b"]);
        assertEqual(byId.get("a").instanceState.color, "#ff0000");
        assertEqual(byId.get("b").instanceState.color, "#0000ff");
        assertEqual("color" in (byId.get("outer").instanceState ?? {}), false);
        assertEqual(fixture.sandbox.getHistoryDiagnostics().commandCount, 1);
      },

      "erro procedural não altera cena nem histórico"() {
        const fixture = createPropertyFixture();
        fixture.selection.replaceMany([
          { regionId: "region-properties", objectId: "a" },
          { regionId: "region-properties", objectId: "b" }
        ]);
        const before = fixture.sandbox.materializeState();

        assertThrowsMessage(
          () => fixture.service.setSelectionProcedural({
            propertyId: "transform.scale",
            expression: "1; 1; 1 / 0"
          }),
          "Valor numérico inválido"
        );
        assertDeepEqual(fixture.sandbox.materializeState(), before);
        assertEqual(fixture.sandbox.getHistoryDiagnostics().commandCount, 0);
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
        assertDeepEqual(
          parsePropertyInput(
            { id: "geometry.tube.points", valueType: "json" },
            ['[[0,0,0],[1,0,0]]']
          ),
          [[0,0,0],[1,0,0]]
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

      "console traduz lote procedural e escopo de grupo"() {
        const fixture = createPropertyFixture({ grouped: true });
        fixture.selection.replace({
          regionId: "region-properties",
          objectId: "outer"
        });
        const console = createPropertyConsole(fixture);

        const result = console.execute(
          'property batch instance.color "mix(#ff0000,#0000ff,u)" ' +
          "scope=renderables"
        )[0];
        const byId = new Map(
          fixture.sandbox.getState().objects.map(object => [object.id, object])
        );

        assertEqual(result.ok, true);
        assertEqual(byId.get("a").instanceState.color, "#ff0000");
        assertEqual(byId.get("b").instanceState.color, "#0000ff");
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

    "compact-resources": {
      "família compacta preserva identidades virtuais estáveis"() {
        const packed = packAnchoredExplicitInstanceFamily([
          {
            id: "glyph-a",
            position: [10, 2, 0],
            rotation: [0, 0, 0, 1],
            scale: [1, 1, 1]
          },
          {
            id: "glyph-b",
            position: [12, 2, 0],
            rotation: [0, 0, 0, 1],
            scale: [0.5, 0.5, 0.5]
          }
        ], { anchorPolicy: "first" });
        const family = normalizeExplicitInstanceFamily(packed.family);
        assertEqual(family.count, 2);
        assertDeepEqual(family.memberIds, ["glyph-a", "glyph-b"]);
        assertDeepEqual(packed.origin, [10, 2, 0]);
        assertDeepEqual(
          explicitFamilyTransformAt(family, 1, {}).position,
          [2, 0, 0]
        );
        assertEqual(
          familyMemberResourcePath("family-1", "glyph-b"),
          "/objects/family-1/members/glyph-b"
        );
      },

      "fusão de famílias reduz objetos sem perder membros"() {
        const region = new Region(
          { id: "family-fusion-region", type: "box-region" },
          { schemaVersion: 1, objects: [] }
        );
        const sandbox = new Sandbox(region, boxRegionReducer);
        const editor = new EditorState();
        const operations = new SelectionOperations({
          editor,
          sandbox,
          regionId: region.id,
          geometryRegistry: createDefaultGeometryRegistry(),
          appearanceRuntime: new AppearanceRuntime()
        });
        const first = operations.createGeometryInstances({
          name: "A",
          geometry: { type: "box", size: [1, 1, 1] },
          preparedInstances: [
            { id: "a1", position: [0, 0, 0], rotation: [0,0,0,1], scale: [1,1,1] },
            { id: "a2", position: [1, 0, 0], rotation: [0,0,0,1], scale: [1,1,1] }
          ]
        });
        const second = operations.createGeometryInstances({
          name: "B",
          geometry: { type: "box", size: [1, 1, 1] },
          preparedInstances: [
            { id: "b1", position: [2, 0, 0], rotation: [0,0,0,1], scale: [1,1,1] },
            { id: "b2", position: [3, 0, 0], rotation: [0,0,0,1], scale: [1,1,1] }
          ]
        });
        editor.selection.replaceMany([
          { kind: "object", regionId: region.id, objectId: first.familyId },
          { kind: "object", regionId: region.id, objectId: second.familyId }
        ], { activeObjectId: first.familyId });
        const fused = operations.fuseSelectedFamilies({ name: "Palavra" });
        assertEqual(fused.changed, true);
        assertEqual(fused.removedFamilyObjects, 2);
        assertEqual(fused.createdFamilyObjects, 1);
        assertEqual(fused.instanceCount, 4);
        assertEqual(sandbox.objectCount, 1);
        const object = sandbox.getObject(fused.familyIds[0]);
        assertEqual(object.name, "Palavra");
        const family = normalizeExplicitInstanceFamily(object.family);
        assertEqual(family.count, 4);
        assertEqual(
          family.memberIds.includes(`${first.familyId}:a1`),
          true
        );
        assertEqual(
          family.memberIds.includes(`${second.familyId}:b2`),
          true
        );
      },

      "traços tocantes fundem automaticamente e traços distantes podem formar uma palavra"() {
        const region = new Region(
          { id: "stroke-fusion-region", type: "box-region" },
          { schemaVersion: 1, objects: [] }
        );
        const sandbox = new Sandbox(region, boxRegionReducer);
        const editor = new EditorState();
        let sequence = 0;
        const service = new StrokeFusionService({
          sandbox,
          editor,
          regionId: region.id,
          geometryRegistry: createDefaultGeometryRegistry(),
          createId: () => `resource-${++sequence}`
        });
        const tube = {
          type: "tube",
          points: [[0, 0, 0], [1, 0, 0]],
          radius: 0.05,
          radialSegments: 6,
          tubularSegments: 2,
          curveType: "polyline"
        };
        const first = service.createStroke({ geometry: tube });
        const second = service.createStroke({
          geometry: tube,
          position: [1.11, 0, 0]
        });
        assertEqual(first.id, second.id);
        assertEqual(second.fused, true);
        assertEqual(second.fusionTolerance > 0, true);
        assertEqual(sandbox.objectCount, 1);
        assertEqual(
          normalizeStrokeBundleDescriptor(
            sandbox.getObject(first.id).geometry
          ).strokeCount,
          2
        );
        assertEqual(
          sandbox.getHistoryDiagnostics().performance.preparedDispatches,
          1
        );
        assertEqual(sandbox.undo(), true);
        assertEqual(
          normalizeStrokeBundleDescriptor(
            sandbox.getObject(first.id).geometry
          ).strokeCount,
          1
        );
        assertEqual(sandbox.redo(), true);
        assertEqual(
          normalizeStrokeBundleDescriptor(
            sandbox.getObject(first.id).geometry
          ).strokeCount,
          2
        );
        const third = service.createStroke({
          geometry: tube,
          position: [10, 0, 0]
        });
        assertEqual(third.fused, false);
        assertEqual(sandbox.objectCount, 2);
        editor.selection.replaceMany([
          { kind: "object", regionId: region.id, objectId: first.id },
          { kind: "object", regionId: region.id, objectId: third.id }
        ], { activeObjectId: first.id });
        const word = service.fuseSelected({ name: "Palavra" });
        assertEqual(word.changed, true);
        assertEqual(sandbox.objectCount, 1);
        assertEqual(word.strokeCount, 3);
        assertEqual(sandbox.getObject(word.id).name, "Palavra");
      },

      "traços tocantes de aparências distintas formam um grupo lógico sem cópia física"() {
        const region = new Region(
          { id: "stroke-logical-fusion", type: "box-region" },
          { schemaVersion: 1, objects: [] }
        );
        const sandbox = new Sandbox(region, boxRegionReducer);
        const editor = new EditorState();
        let sequence = 0;
        const service = new StrokeFusionService({
          sandbox,
          editor,
          regionId: region.id,
          geometryRegistry: createDefaultGeometryRegistry(),
          createId: () => `logical-${++sequence}`
        });
        const tube = {
          type: "tube",
          points: [[0, 0, 0], [1, 0, 0]],
          radius: 0.05,
          radialSegments: 6,
          tubularSegments: 2,
          curveType: "polyline"
        };
        const first = service.createStroke({
          geometry: tube,
          color: "#ff0000"
        });
        const second = service.createStroke({
          geometry: tube,
          position: [1.11, 0, 0],
          color: "#0000ff"
        });
        assertEqual(second.changed, true);
        assertEqual(second.fused, true);
        assertEqual(second.mode, "logical-group");
        assertEqual(second.logicalObjectId, second.id);
        assertEqual(sandbox.objectCount, 3);
        const group = sandbox.getObject(second.logicalObjectId);
        const firstObject = sandbox.getObject(first.objectId);
        const secondObject = sandbox.getObject(second.objectId);
        assertEqual(group.kind, "group");
        assertEqual(firstObject.parentId, group.id);
        assertEqual(secondObject.parentId, group.id);
        assertEqual(firstObject.geometry.strokeCount, 1);
        assertEqual(secondObject.geometry.strokeCount, 1);

        const third = service.createStroke({
          geometry: tube,
          position: [2.22, 0, 0],
          color: "#0000ff"
        });
        assertEqual(third.fused, true);
        assertEqual(third.logicalObjectId, group.id);
        assertEqual(third.id, group.id);
        assertEqual(sandbox.objectCount, 3);
        assertEqual(
          normalizeStrokeBundleDescriptor(
            sandbox.getObject(second.objectId).geometry
          ).strokeCount,
          2
        );
        assertEqual(
          sandbox.getSnapshot().objects.filter(object => object.kind === "group").length,
          1
        );
        assertEqual(sandbox.undo(), true);
        assertEqual(
          normalizeStrokeBundleDescriptor(
            sandbox.getObject(second.objectId).geometry
          ).strokeCount,
          1
        );
        assertEqual(sandbox.undo(), true);
        assertEqual(sandbox.objectCount, 1);
        assertEqual(sandbox.getObject(first.objectId).parentId, null);
      },

      "tubo legado pode ser unido manualmente a conjunto compacto"() {
        const region = new Region(
          { id: "legacy-tube-fusion", type: "box-region" },
          { schemaVersion: 1, objects: [] }
        );
        const sandbox = new Sandbox(region, boxRegionReducer);
        const editor = new EditorState();
        const geometryRegistry = createDefaultGeometryRegistry();
        const appearanceRuntime = new AppearanceRuntime();
        const operations = new SelectionOperations({
          editor,
          sandbox,
          regionId: region.id,
          geometryRegistry,
          appearanceRuntime
        });
        const tube = {
          type: "tube",
          points: [[0, 0, 0], [1, 0, 0]],
          radius: 0.05,
          radialSegments: 6,
          tubularSegments: 2,
          curveType: "polyline"
        };
        operations.createGeometry({ geometry: tube, color: "#6699cc" });
        const legacyId = sandbox.getSnapshot().objects[0].id;
        const service = new StrokeFusionService({
          sandbox,
          editor,
          regionId: region.id,
          geometryRegistry,
          appearanceRuntime,
          createId: (() => { let i = 0; return () => `manual-${++i}`; })()
        });
        const created = service.createStroke({
          geometry: tube,
          position: [2, 0, 0],
          autoFuse: false
        });
        editor.selection.replaceMany([
          { kind: "object", regionId: region.id, objectId: legacyId },
          { kind: "object", regionId: region.id, objectId: created.id }
        ], { activeObjectId: legacyId });
        const result = service.fuseSelected();
        const object = sandbox.getObject(legacyId);
        assertEqual(result.changed, true);
        assertEqual(result.id, legacyId);
        assertEqual(object.kind, "stroke-bundle");
        assertEqual(
          normalizeStrokeBundleDescriptor(object.geometry).strokeCount,
          2
        );
      },

      "fusão automática consulta somente os dois traços imediatamente anteriores"() {
        const region = new Region(
          { id: "stroke-recent-region", type: "box-region" },
          { schemaVersion: 1, objects: [] }
        );
        const sandbox = new Sandbox(region, boxRegionReducer);
        const editor = new EditorState();
        let sequence = 0;
        const service = new StrokeFusionService({
          sandbox,
          editor,
          regionId: region.id,
          geometryRegistry: createDefaultGeometryRegistry(),
          createId: () => `recent-${++sequence}`
        });
        const tube = {
          type: "tube",
          points: [[0, 0, 0], [0.5, 0, 0]],
          radius: 0.02,
          radialSegments: 4,
          tubularSegments: 2,
          curveType: "polyline"
        };
        for (let index = 0; index < 100; index += 1) {
          service.createStroke({
            geometry: tube,
            position: [index * 20, 0, 0],
            autoFuse: false
          });
        }
        const before = service.status().diagnostics;
        const result = service.createStroke({
          geometry: tube,
          position: [0.5, 0, 0],
          autoFuse: true
        });
        const after = service.status().diagnostics;
        assertEqual(result.fused, false);
        assertEqual(
          after.recentCandidatesVisited - before.recentCandidatesVisited <= 2,
          true
        );
        assertEqual(after.maximumCandidatesPerStroke, 2);
      },

      "chunks segmentados preservam referências e compactam fora do histórico"() {
        const stroke = index => ({
          id: `segment-${index}`,
          points: [[index, 0, 0], [index + 0.5, 0, 0]],
          radius: 0.02,
          radialSegments: 4,
          tubularSegments: 2,
          curveType: "polyline"
        });
        const appendPolicy = {
          targetChunkPoints: 64,
          maximumChunkPoints: 64,
          maximumChunkStrokes: 1,
          targetChunkBytes: 1024
        };
        let bundle = strokeBundleFromStroke(stroke(0), { policy: appendPolicy });
        bundle = appendStrokeToBundle(bundle, stroke(1), { policy: appendPolicy });
        bundle = appendStrokeToBundle(bundle, stroke(2), { policy: appendPolicy });
        const firstChunk = bundle.chunks[0];
        const appended = appendStrokeToBundle(bundle, stroke(3), {
          policy: appendPolicy
        });
        assertEqual(appended.chunks[0], firstChunk);
        assertEqual(appended.chunks.length, 4);

        const region = new Region(
          { id: "segmented-compaction", type: "box-region" },
          { schemaVersion: 1, objects: [] }
        );
        const sandbox = new Sandbox(region, boxRegionReducer);
        sandbox.dispatch({
          type: "object.create",
          id: "ink",
          kind: "stroke-bundle",
          name: "Tinta",
          position: [0,0,0],
          rotation: [0,0,0,1],
          scale: [1,1,1],
          geometry: appended
        });
        const before = sandbox.getHistoryDiagnostics();
        const scheduler = new StrokeCompactionScheduler({
          sandbox,
          policy: {
            schedule: "manual",
            compactAfterAppends: 1,
            targetChunkPoints: 1024,
            maximumChunkPoints: 2048,
            maximumChunkStrokes: 16,
            targetChunkBytes: 65536
          }
        });
        scheduler.runNow("ink");
        const after = sandbox.getHistoryDiagnostics();
        const compacted = normalizeStrokeBundleDescriptor(
          sandbox.getObject("ink").geometry
        );
        assertEqual(compacted.chunks.length, 1);
        assertEqual(after.commandCount, before.commandCount);
        assertEqual(after.performance.maintenanceDispatches > 0, true);
      },

      "âncora acompanha bounds e edição de vértice invalida apenas o chunk"() {
        const policy = {
          targetChunkPoints: 64,
          maximumChunkPoints: 64,
          maximumChunkStrokes: 1,
          targetChunkBytes: 1024
        };
        let bundle = strokeBundleFromStroke({
          id: "a",
          points: [[0,0,0],[2,0,0]],
          radius: 0.1
        }, { policy });
        bundle = appendStrokeToBundle(bundle, {
          id: "b",
          points: [[10,0,0],[12,0,0]],
          radius: 0.1
        }, { policy });
        const untouched = bundle.chunks[1];
        assertDeepEqual(strokeBundleAnchorLocal(bundle), [6,0,0]);
        const edited = replaceStrokePointInBundle(bundle, "a", 1, [4,2,0]);
        assertEqual(edited.changed, true);
        assertEqual(edited.bundle.chunks[1], untouched);
        assertDeepEqual(strokeBundleAnchorLocal(edited.bundle), [6,1,0]);
      },

      "árvore virtual consulta somente a página expandida sem copiar a hierarquia"() {
        const instances = Array.from({ length: 10000 }, (_, index) => ({
          id: `virtual-${index}`,
          position: [index,0,0],
          rotation: [0,0,0,1],
          scale: [1,1,1]
        }));
        const family = packAnchoredExplicitInstanceFamily(instances).family;
        const region = new Region(
          { id: "virtual-resource-region", type: "box-region" },
          {
            schemaVersion: 1,
            objects: [{
              id: "virtual-family",
              kind: "instance-family",
              name: "Família virtual",
              parentId: null,
              position: [0,0,0],
              rotation: [0,0,0,1],
              scale: [1,1,1],
              geometry: { type: "box", size: [1,1,1] },
              family
            }]
          }
        );
        const sandbox = new Sandbox(region, boxRegionReducer);
        const tree = createVirtualResourceTree({ sandbox, pageSize: 25 });
        const before = tree.status().diagnostics;
        const page = tree.listChildren(
          "/objects/virtual-family/members",
          { offset: 5000, limit: 25 }
        );
        const status = tree.status();
        assertEqual(status.mode, "authoritative-lazy-sandbox");
        assertEqual(page.items.length, 25);
        assertEqual(page.total, 10000);
        assertEqual(
          status.diagnostics.descriptorsCreated - before.descriptorsCreated,
          25
        );
        assertEqual(status.diagnostics.maximumPageItems, 25);
        assertEqual(status.diagnostics.objectsVisited, 0);
        assertEqual(status.diagnostics.indexBuilds, 0);
      },

      "árvore de recursos navega grupos objetos traços membros e vértices"() {
        const family = packAnchoredExplicitInstanceFamily([
          { id: "letter-a", position: [0,0,0], rotation: [0,0,0,1], scale: [1,1,1] },
          { id: "letter-b", position: [1,0,0], rotation: [0,0,0,1], scale: [1,1,1] }
        ]).family;
        const tree = buildResourceTree({
          objects: [
            {
              id: "word",
              kind: "group",
              name: "Palavra",
              parentId: null,
              position: [0,0,0],
              rotation: [0,0,0,1],
              scale: [1,1,1]
            },
            {
              id: "letters",
              kind: "instance-family",
              name: "Letras",
              parentId: "word",
              position: [0,0,0],
              rotation: [0,0,0,1],
              scale: [1,1,1],
              geometry: { type: "box", size: [1,1,1], segments: [1,1,1] },
              family
            },
            {
              id: "ink",
              kind: "stroke-bundle",
              name: "Tinta",
              parentId: "word",
              position: [0,0,0],
              rotation: [0,0,0,1],
              scale: [1,1,1],
              geometry: {
                type: "stroke-bundle",
                strokes: [{
                  id: "stroke-a",
                  points: [[0,0,0],[1,1,0],[2,0,0]],
                  radius: 0.05,
                  radialSegments: 6,
                  tubularSegments: 2,
                  curveType: "polyline"
                }]
              }
            }
          ]
        });
        const paths = flattenResourcePaths(tree);
        assertEqual(paths.includes("/objects/word"), true);
        assertEqual(
          paths.includes("/objects/letters/members/letter-b"),
          true
        );
        assertEqual(
          paths.includes("/objects/ink/strokes/stroke-a/vertices/2"),
          true
        );
        assertDeepEqual(
          parseResourcePath(
            "/objects/ink/strokes/stroke-a/vertices/2"
          ),
          {
            kind: "vertex",
            ownerObjectId: "ink",
            strokeId: "stroke-a",
            vertexIndex: 2,
            path: "/objects/ink/strokes/stroke-a/vertices/2"
          }
        );
      }
    },

    "geometry-creation": {
      "help anuncia apenas famílias criáveis"() {
        const console = createGeometryConsole([]);
        const result = console.execute("help create")[0];
        const text = JSON.stringify(result.result);

        assertEqual(result.ok, true);
        for (const type of createDefaultGeometryRegistry().list()) {
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
          "create box size 1 2 3 origin 0 1 0",
          "create sphere radius 2",
          "create cylinder radius 1 height 3",
          "create plane size 4 5 plane yz",
          "create polygon sides 8 radius 2",
          "create capsule radius 1 height 2",
          "create circle radius 2 segments 20",
          "create cone radius 1 height 3",
          "create dodecahedron radius 2 detail 0",
          "create icosahedron radius 2 detail 0",
          "create octahedron radius 2 detail 0",
          "create ring innerRadius 1 outerRadius 2",
          "create tetrahedron radius 2 detail 0",
          "create torus radius 3 tube 0.5",
          "create torus-knot radius 2 tube 0.3 p 2 q 3",
          "create lathe points '[[0,-1],[1,-1],[1,1],[0,1]]'",
          "create tube points '[[-2,0,0],[0,1,0],[2,0,0]]'",
          "create shape contour '[[-1,-1],[1,-1],[1,1],[-1,1]]'",
          "create extrude contour '[[-1,-1],[1,-1],[1,1],[-1,1]]' depth 2",
          "create polyhedron vertices '[[1,1,1],[-1,-1,1],[-1,1,-1],[1,-1,-1]]' indices '[2,1,0,0,3,2,1,3,0,2,3,1]'",
          "create buffer positions '[[-1,0,0],[1,0,0],[0,1,0]]' indices '[0,1,2]'",
          `create stroke-bundle strokes '[{"id":"s1","points":[[0,0,0],[1,0,0]],"radius":0.05}]'`
        ]) {
          assertEqual(console.execute(source)[0].ok, true);
        }

        assertDeepEqual(
          calls.map(call => call.args.geometry.type),
          createDefaultGeometryRegistry().list()
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
        const object = sandbox.getState().objects[0];
        const family = normalizeExplicitInstanceFamily(object.family);
        assertEqual(sandbox.getState().objects.length, 1);
        assertEqual(object.kind, "instance-family");
        assertDeepEqual(
          Array.from({ length: family.count }, (_, index) => {
            const transform = explicitFamilyTransformAt(family, index, {});
            return transform.position.map((value, axis) =>
              value + object.position[axis]
            );
          }),
          [[0,0,0],[2,0,0],[4,0,0],[6,0,0]]
        );
        assertEqual(result.memberResources.length, 4);
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
          [
            "box","sphere","cylinder","plane","polygon",
            "capsule","circle","cone","dodecahedron","icosahedron",
            "octahedron","ring","tetrahedron","torus","torus-knot",
            "lathe","tube","shape","extrude","polyhedron","buffer",
            "stroke-bundle"
          ]
        );
        assertEqual(
          descriptions.find(description => description.type === "sphere")
            .parameters.some(parameter => parameter.id === "radius"),
          true
        );
        assertEqual(
          descriptions.find(description => description.type === "tube")
            .parameters.some(parameter => parameter.type === "enum"),
          true
        );
        assertEqual(
          descriptions.find(description => description.type === "shape")
            .parameters.some(parameter => parameter.type === "json"),
          true
        );
        assertEqual(
          descriptions.find(description => description.type === "circle")
            .placement,
          "planar"
        );
        assertEqual(
          createDefaultGeometryRegistry().label("torus"),
          "Toro"
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
          size: [2, 3, 4],
          segments: [1, 1, 1]
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

        for (const descriptor of geometryProviderSamples()) {
          const geometry = registry.create(descriptor);
          assert(geometry?.isBufferGeometry === true);
          geometry.dispose();
        }
      },

      "topologia distingue sólidos de superfícies abertas"() {
        const registry = createDefaultGeometryRegistry();

        for (const type of [
          "box","sphere","cylinder","capsule","cone","dodecahedron",
          "icosahedron","octahedron","tetrahedron","torus","torus-knot",
          "extrude","polyhedron"
        ]) {
          assertDeepEqual(registry.renderProfile({ type }), {
            topology: "closed-solid",
            side: "front"
          });
        }

        for (const type of [
          "plane","polygon","circle","ring","lathe","tube","shape","buffer"
        ]) {
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
          { type: "polygon", radius: 0 },
          { type: "ring", innerRadius: 2, outerRadius: 1 },
          { type: "tube", points: [[0,0,0],[1,0,0]] },
          { type: "buffer", positions: [[0,0,0],[1,0,0],[0,1,0]], indices: [0,1,3] },
          { type: "buffer", positions: [[0,0,0],[1,0,0]], indices: [0,1] },
          { type: "buffer", positions: [[0,0,0]], indices: [], edges: [[0,2]] }
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

      "crescimento após submissão recria geometria sem limite obsoleto"() {
        const batch=new SelectionOutlineBatch({capacity:2});
        const instances=Array.from({length:5},(_,index) =>
          selectionOutlineInstance({
            id:`growth-${index}`,
            bounds:new THREE.Box3(
              new THREE.Vector3(index,0,0),
              new THREE.Vector3(index+1,1,1)
            )
          })
        );
        batch.update(instances.slice(0,2));
        const initialGeometry=batch.geometry;
        let disposed=0;
        initialGeometry.addEventListener("dispose",() => {
          disposed+=1;
        });

        // O WebGLRenderer registra este limite na primeira submissão.
        initialGeometry._maxInstanceCount=2;
        const diagnostics=batch.update(instances);

        assertEqual(batch.geometry===initialGeometry,false);
        assertEqual(batch.object.geometry===batch.geometry,true);
        assertEqual(disposed,1);
        assertEqual(diagnostics.capacity,8);
        assertEqual(diagnostics.reallocations,1);
        assertEqual(diagnostics.geometryReplacements,1);
        assertEqual(diagnostics.rendererInstanceLimit,null);
        assertEqual(diagnostics.submittedInstanceCount,5);
        assertEqual(diagnostics.submittedLineSegments,60);
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

      "console expõe diagnóstico conciso da seleção"() {
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
              return {complete:true};
            }
          }
        });
        const [entry]=console.execute("selection stats");
        assertEqual(entry.ok,true);
        assertDeepEqual(entry.result,{complete:true});
        assertDeepEqual(calls,[{
          id:"selection.stats",
          args:undefined
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

      "funções de campo suportam clamp mix steps e fração"() {
        assertNear(evaluateAffineExpression("clamp(3,0,2)"), 2);
        assertNear(evaluateAffineExpression("mix(2,6,0.25)"), 3);
        assertNear(evaluateAffineExpression("step(0.5,0.25)"), 0);
        assertNear(evaluateAffineExpression("step(0.5,0.75)"), 1);
        assertNear(evaluateAffineExpression("smoothstep(0,1,0.5)"), 0.5);
        assertNear(evaluateAffineExpression("smootherstep(0,1,0.5)"), 0.5);
        assertNear(evaluateAffineExpression("fract(2.75)"), 0.75);
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
      },

      "duplicate captura a matriz composta até repeat"() {
        const repeatable = [];
        const fixture = createSelectionRepeatFixture({
          onRepeatableChanged: descriptor =>
            repeatable.push(structuredClone(descriptor))
        });
        const duplicated = fixture.operations.duplicate();
        const duplicate = fixture.sandbox.getSnapshot().objects.find(
          object => object.id === duplicated.duplicateIds[0]
        );

        assertEqual(duplicate.name, "Semente #1");
        assertEqual(repeatable.at(-1), null);

        fixture.operations.translate([2, 0, 0]);
        fixture.operations.rotateEuler([0, 0, 30]);
        fixture.operations.scaleBy([1.5, 1.5, 1.5]);

        const source = fixture.sandbox.getSnapshot().objects.find(
          object => object.id === "seed"
        );
        const transformed = fixture.sandbox.getSnapshot().objects.find(
          object => object.id === duplicated.duplicateIds[0]
        );
        const expectedDelta = sceneObjectMatrix(transformed)
          .multiply(sceneObjectMatrix(source).invert())
          .toArray();
        const history = fixture.operations.getState();

        assertMatricesNear(
          history.lastDuplicate.deltaMatrix,
          expectedDelta
        );
        assert(history.pendingDuplicate);
        assertEqual(
          repeatable.at(-1).id,
          "selection.repeat"
        );
      },

      "duplicação coordenada seleciona somente após snapshot"() {
        const fixture = createSelectionRepeatFixture({ delayed: true });
        const duplicated = fixture.operations.duplicate();

        assertEqual(duplicated.publicationPending, true);
        assertDeepEqual(
          fixture.editor.selection.snapshot().members.map(
            member => member.objectId
          ),
          ["seed"]
        );

        fixture.flush();

        assertEqual(
          fixture.operations.getState().pendingPublication,
          null
        );
        assertDeepEqual(
          fixture.editor.selection.snapshot().members.map(
            member => member.objectId
          ),
          duplicated.duplicateIds
        );
        assert(
          duplicated.duplicateIds.every(id =>
            fixture.sandbox.getSnapshot().objects.some(
              object => object.id === id
            )
          )
        );
      },

      "transformação imediata após duplicate compõe o histórico de repeat"() {
        const fixture = createSelectionRepeatFixture({ delayed: true });
        const duplicated = fixture.operations.duplicate();
        const moved = fixture.operations.translate([2, 0, 0]);

        assertEqual(duplicated.publicationPending, true);
        assertEqual(moved.changed, true);
        assertEqual(moved.repeatDeferred, true);
        assertDeepEqual(
          moved.transforms.map(transform => transform.id),
          duplicated.duplicateIds
        );

        const repeated = fixture.operations.repeat(4);
        assertEqual(repeated.changed, true);
        assertEqual(repeated.repeatDeferred, true);
        assertEqual(repeated.reason, "awaiting-repeat-history");

        fixture.flush();
        assertEqual(
          fixture.operations.getState().pendingPublication,
          null
        );
        fixture.flush();

        const history = fixture.operations.getState();
        assert(history.lastDuplicate?.deltaMatrix);
        assertEqual(history.pendingPublication?.kind, "repeat");

        fixture.flush();
        assertEqual(
          fixture.operations.getState().pendingPublication,
          null
        );
        assertEqual(
          fixture.editor.selection.snapshot().members.length,
          1
        );
        assertEqual(
          fixture.sandbox.getSnapshot().objects.length,
          6
        );
      },

      "rejeição coordenada restaura o histórico anterior"() {
        const fixture = createSelectionRepeatFixture({ delayed: true });
        const duplicated = fixture.operations.duplicate();

        assertEqual(duplicated.publicationPending, true);
        fixture.reject();

        assertDeepEqual(
          fixture.operations.getState(),
          {
            pendingDuplicate: null,
            lastDuplicate: null,
            pendingPublication: null
          }
        );
        assertDeepEqual(
          fixture.editor.selection.snapshot().members.map(
            member => member.objectId
          ),
          ["seed"]
        );
        assertEqual(fixture.sandbox.getSnapshot().objects.length, 1);
      },

      "repeat count mantém delta e cria uma transação"() {
        const fixture = createSelectionRepeatFixture();
        const duplicated = fixture.operations.duplicate();
        fixture.operations.translate([2, 0, 0]);
        fixture.operations.rotateEuler([0, 0, 30]);
        fixture.operations.scaleBy([1.5, 1.5, 1.5]);

        const first = fixture.sandbox.getSnapshot().objects.find(
          object => object.id === duplicated.duplicateIds[0]
        );
        const deltaBefore = fixture.operations
          .getState()
          .lastDuplicate
          .deltaMatrix;
        const historyBefore = fixture.sandbox
          .getHistoryDiagnostics()
          .undoDepth;
        const repeated = fixture.operations.repeat(2);

        assertEqual(repeated.repeatCount, 2);
        assertEqual(repeated.duplicateIds.length, 2);
        assertEqual(repeated.selectedIds.length, 1);
        assertEqual(
          fixture.sandbox.getHistoryDiagnostics().undoDepth,
          historyBefore + 1
        );
        assertMatricesNear(
          fixture.operations.getState().lastDuplicate.deltaMatrix,
          deltaBefore
        );

        const finalObject = fixture.sandbox.getSnapshot().objects.find(
          object => object.id === repeated.selectedIds[0]
        );
        const delta = new THREE.Matrix4().fromArray(deltaBefore);
        const expectedFinal = delta.clone()
          .multiply(delta)
          .multiply(sceneObjectMatrix(first))
          .toArray();
        assertMatricesNear(
          sceneObjectMatrix(finalObject).toArray(),
          expectedFinal,
          1e-8
        );

        assertEqual(fixture.sandbox.undo(), true);
        assertEqual(fixture.sandbox.getSnapshot().objects.length, 2);
      },

      "repeat preserva delta mundial sob pai transformado"() {
        const sandbox = createGroupTransformSandbox({
          groupRotation: eulerQuaternion([0, 0, 35])
        });
        const editor = new EditorState();
        editor.selection.replace({
          kind: "object",
          regionId: "group-transform-test",
          objectId: "child"
        });
        const operations = new SelectionOperations({
          editor,
          sandbox,
          regionId: "group-transform-test"
        });
        const duplicated = operations.duplicate();
        const firstId = duplicated.duplicateIds[0];
        const hierarchy = new HierarchyIndex(
          sandbox.getSnapshot().objects
        );
        const worldDelta = composeTransform({
          position: [2, -1, 0],
          rotation: eulerQuaternion([0, 0, 20]),
          scale: [1, 1, 1]
        });
        sandbox.dispatch({
          type: "selection.transform-world",
          transforms: [{
            id: firstId,
            worldMatrix: multiplyMatrices(
              worldDelta,
              hierarchy.worldMatrixOf(firstId)
            )
          }]
        });

        assertMatricesNear(
          operations.getState().lastDuplicate.deltaMatrix,
          worldDelta,
          1e-8
        );
        const firstWorld = new HierarchyIndex(
          sandbox.getSnapshot().objects
        ).worldMatrixOf(firstId);
        const repeated = operations.repeat();
        const nextWorld = new HierarchyIndex(
          sandbox.getSnapshot().objects
        ).worldMatrixOf(repeated.selectedIds[0]);

        assertMatricesNear(
          nextWorld,
          multiplyMatrices(worldDelta,firstWorld),
          1e-8
        );
      },

      "repeat preserva matriz afim local sob pai transformado"() {
        const sandbox = createGroupTransformSandbox({
          groupRotation: eulerQuaternion([0, 0, 35])
        });
        const editor = new EditorState();
        editor.selection.replace({
          kind: "object",
          regionId: "group-transform-test",
          objectId: "child"
        });
        const operations = new SelectionOperations({
          editor,
          sandbox,
          regionId: "group-transform-test"
        });
        const delta = new THREE.Matrix4().makeTranslation(2, -1, 0);
        const duplicated = operations.duplicateAffine(1, [{
          type: "matrix",
          value: delta.toArray()
        }]);
        const first = sandbox.getSnapshot().objects.find(
          object => object.id === duplicated.selectedIds[0]
        );
        const repeated = operations.repeat();
        const next = sandbox.getSnapshot().objects.find(
          object => object.id === repeated.selectedIds[0]
        );

        assertEqual(
          operations.getState().lastDuplicate.matrixSpace,
          "local"
        );
        assertMatricesNear(
          sceneObjectMatrix(next).toArray(),
          delta.clone().multiply(sceneObjectMatrix(first)).toArray(),
          1e-8
        );
      },

      "console aceita duplicate count e repeat count"() {
        const calls = [];
        const console = createGeometryConsole(calls);

        console.execute("duplicate count 4");
        console.execute("duplicate count 3 move 1 0 0");
        console.execute("repeat");
        console.execute("repeat count 5");

        assertDeepEqual(calls, [
          {
            id: "selection.duplicateMany",
            args: { count: 4 }
          },
          {
            id: "selection.duplicateAffine",
            args: {
              count: 3,
              operations: [{
                type: "move",
                value: [1, 0, 0]
              }]
            }
          },
          {
            id: "selection.repeat",
            args: undefined
          },
          {
            id: "selection.repeat",
            args: { count: 5 }
          }
        ]);
      }
    },

    "selection-ui": {
      "editor inicia em seleção"() {
        const editor = new EditorState();
        assertEqual(editor.snapshot().tool.mode, "select");
        assertEqual(editor.snapshot().selectionOperation, "replace");
        assertEqual(editor.snapshot().selectionGestureMode, "rectangle");
        assertNear(editor.snapshot().selectionBrushRadius, 24);
      },

      "preserva transformação ao navegar"() {
        const editor = new EditorState();
        editor.setToolMode("rotate");
        editor.setToolMode("navigate");
        assertEqual(editor.snapshot().tool.transformMode, "rotate");
      },

      "troca de ferramenta é atômica e idempotente"() {
        const editor = new EditorState();
        let notifications = 0;
        const unsubscribe = editor.subscribe((snapshot, event) => {
          if (event.type !== "initial") notifications += 1;
        });
        editor.setPivotEditing(true);
        notifications = 0;
        assertEqual(editor.setToolMode("rotate"), true);
        assertEqual(editor.snapshot().pivot.editing, false);
        assertEqual(notifications, 1);
        assertEqual(editor.setToolMode("rotate"), false);
        assertEqual(notifications, 1);
        assertEqual(editor.setPivotEditing(false), false);
        unsubscribe();
      },

      "operações e gesto são explícitos"() {
        const editor = new EditorState();
        editor.setSelectionOperation("add");
        editor.setSelectionGesture({
          mode: "brush",
          radiusPixels: 31,
          enabled: true
        });
        assertEqual(editor.snapshot().selectionOperation, "add");
        assertEqual(editor.snapshot().areaSelection, true);
        assertEqual(editor.snapshot().selectionGestureMode, "brush");
        assertNear(editor.snapshot().selectionBrushRadius, 31);
      },

      "seleção em lote preserva semântica de adicionar remover e alternar"() {
        const selection = new Selection();
        const member = objectId => ({
          kind: "object",
          regionId: "region-main",
          objectId
        });
        selection.applyMany([member("a"), member("b")], {
          operation: "replace"
        });
        selection.applyMany([member("c")], { operation: "add" });
        selection.applyMany([member("b")], { operation: "remove" });
        selection.applyMany([member("a"), member("d")], {
          operation: "toggle"
        });
        assertDeepEqual(
          selection.snapshot().members.map(value => value.objectId),
          ["c", "d"]
        );
      },

      "retângulo pincel laço e borracha compartilham geometria determinística"() {
        const rectangle = normalizeScreenSelectionGesture({
          mode: "rectangle",
          points: [{ x: 0, y: 0 }, { x: 20, y: 20 }]
        });
        const brush = normalizeScreenSelectionGesture({
          mode: "brush",
          points: [{ x: 0, y: 10 }, { x: 30, y: 10 }],
          radiusPixels: 5
        });
        const lasso = normalizeScreenSelectionGesture({
          mode: "lasso",
          points: [
            { x: 0, y: 0 },
            { x: 20, y: 0 },
            { x: 10, y: 20 }
          ]
        });
        assertEqual(screenSelectionGestureContains(rectangle, { x: 8, y: 8 }), true);
        assertEqual(screenSelectionGestureContains(brush, { x: 16, y: 14 }), true);
        assertEqual(screenSelectionGestureContains(brush, { x: 16, y: 17 }), false);
        assertEqual(screenSelectionGestureContains(lasso, { x: 10, y: 8 }), true);
        assertEqual(screenSelectionGestureContains(lasso, { x: 19, y: 18 }), false);
      },

      "índice espacial testa apenas candidatos próximos no caminho quente"() {
        const index = new ScreenSelectionIndex({ cellSize: 64 });
        index.rebuild(Array.from({ length: 4096 }, (_, item) => ({
          x: (item % 64) * 16,
          y: Math.floor(item / 64) * 16,
          id: item
        })));
        const hits = index.query({
          mode: "brush",
          points: [{ x: 8, y: 8 }, { x: 40, y: 8 }],
          radiusPixels: 8
        });
        const diagnostics = index.diagnostics();
        assertEqual(hits.length > 0, true);
        assertEqual(diagnostics.testedEntries < 100, true);
      },

      "captura do pincel remove listeners temporários ao soltar"() {
        const listeners = new Map();
        const canvas = {
          addEventListener(type, listener) {
            const values = listeners.get(type) ?? new Set();
            values.add(listener);
            listeners.set(type, values);
          },
          removeEventListener(type, listener) {
            listeners.get(type)?.delete(listener);
          },
          getBoundingClientRect() {
            return { left: 10, top: 20, width: 200, height: 100 };
          },
          setPointerCapture() {},
          releasePointerCapture() {}
        };
        const path = {
          style: {},
          setAttribute() {}
        };
        const cursor = {
          hidden: true,
          setAttribute() {}
        };
        const svg = { setAttribute() {} };
        const element = {
          hidden: true,
          dataset: {},
          style: {},
          querySelector(selector) {
            if (selector === "svg") return svg;
            if (selector.includes("path")) return path;
            if (selector.includes("cursor")) return cursor;
            return null;
          }
        };
        const completed = [];
        const marquee = new SelectionMarquee({
          canvas,
          element,
          onComplete: value => completed.push(value)
        });
        const emit = (type, x, y) => {
          const event = {
            pointerId: 7,
            pointerType: "touch",
            button: 0,
            clientX: 10 + x,
            clientY: 20 + y,
            preventDefault() {},
            stopImmediatePropagation() {},
            getCoalescedEvents() { return [this]; }
          };
          for (const listener of [...(listeners.get(type) ?? [])]) {
            listener(event);
          }
        };
        marquee.setMode("brush", { radiusPixels: 18 });
        marquee.setEnabled(true);
        emit("pointerdown", 5, 5);
        emit("pointermove", 40, 20);
        assertEqual(completed.length, 0);
        emit("pointerup", 70, 30);
        assertEqual(completed.length, 1);
        assertEqual(completed[0].mode, "brush");
        assertNear(completed[0].radiusPixels, 18);
        assertEqual(listeners.get("pointermove").size, 0);
        assertEqual(listeners.get("pointerup").size, 0);
        assertEqual(listeners.get("pointercancel").size, 0);
        emit("pointerdown", 8, 8);
        assertEqual(listeners.get("pointermove").size, 1);
        marquee.setEnabled(false);
        assertEqual(listeners.get("pointermove").size, 0);
        assertEqual(listeners.get("pointerup").size, 0);
        assertEqual(listeners.get("pointercancel").size, 0);
        marquee.dispose();
        assertEqual(listeners.get("pointerdown").size, 0);
      },

      "segundo toque entrega o gesto à navegação e não conclui seleção"() {
        const listeners = new Map();
        const canvas = {
          addEventListener(type, listener) {
            const values = listeners.get(type) ?? new Set();
            values.add(listener);
            listeners.set(type, values);
          },
          removeEventListener(type, listener) {
            listeners.get(type)?.delete(listener);
          },
          getBoundingClientRect() {
            return { left: 0, top: 0, width: 200, height: 100 };
          },
          setPointerCapture() {},
          releasePointerCapture() {}
        };
        const element = {
          hidden: true,
          dataset: {},
          style: {},
          querySelector() { return null; }
        };
        const completed = [];
        const activeTouches = new Set();
        const navigation = {
          acquireToolGestureNavigation() { return "selection-token"; },
          releaseToolGestureNavigation() {},
          isToolNavigationGesture(event) {
            if (event.type === "pointerdown") {
              activeTouches.add(event.pointerId);
            }
            if (event.type === "pointerup" || event.type === "pointercancel") {
              activeTouches.delete(event.pointerId);
            }
            return activeTouches.size >= 2;
          }
        };
        const marquee = new SelectionMarquee({
          canvas,
          element,
          navigation,
          onComplete: value => completed.push(value)
        });
        const emit = (type, pointerId, x, y) => {
          const event = {
            type,
            pointerId,
            pointerType: "touch",
            button: 0,
            clientX: x,
            clientY: y,
            preventDefault() {},
            stopImmediatePropagation() {},
            getCoalescedEvents() { return [this]; }
          };
          for (const listener of [...(listeners.get(type) ?? [])]) {
            listener(event);
          }
        };
        marquee.setEnabled(true);
        emit("pointerdown", 1, 10, 10);
        emit("pointerdown", 2, 50, 30);
        emit("pointerup", 1, 12, 12);
        emit("pointerup", 2, 110, 80);
        assertEqual(completed.length, 0);
        marquee.dispose();
      },

      "borracha publica uma única exclusão para todos os atingidos"() {
        const editor = new EditorState();
        const calls = [];
        const commands = createEditorCommands({
          editor,
          renderer: {
            resolveScreenSelectionGesture() {
              return {
                subject: "object",
                mode: "eraser",
                members: [
                  { objectId: "a" },
                  { objectId: "b" }
                ]
              };
            }
          },
          selectionOperations: {
            deleteIds(ids, options) {
              calls.push({ ids, options });
              return { changed: true, deletedIds: ids };
            }
          },
          projectService: {},
          benchmarkRunner: {},
          resourceAudit: {}
        });
        const result = commands.execute("selection.gesture.apply", {
          mode: "eraser",
          points: [{ x: 1, y: 1 }]
        });
        assertEqual(result.changed, true);
        assertEqual(calls.length, 1);
        assertDeepEqual(calls[0].ids, ["a", "b"]);
        assertEqual(calls[0].options.source, "selection-eraser");
      },

      "console escolhe gesto e raio pela mesma superfície de comando"() {
        const calls = [];
        const console = createGeometryConsole(calls);
        const [entry] = console.execute("select gesture brush 36");
        assertEqual(entry.ok, true);
        assertDeepEqual(calls, [{
          id: "selection.gesture.set",
          args: {
            mode: "brush",
            radiusPixels: 36,
            enabled: true
          }
        }]);
      },

      "borracha de componentes produz uma operação topológica local"() {
        const editor = new EditorState();
        const calls = [];
        const meshEditor = {
          active: true,
          applyComponentSelection(value) {
            calls.push({ type: "select", value });
          },
          applyTopology(value) {
            calls.push({ type: "topology", value });
            return { changed: true };
          }
        };
        const commands = createEditorCommands({
          editor,
          renderer: {
            resolveScreenSelectionGesture() {
              return {
                subject: "component",
                mode: "eraser",
                component: "face",
                indices: [2, 4]
              };
            }
          },
          selectionOperations: {},
          meshEditor,
          projectService: {},
          benchmarkRunner: {},
          resourceAudit: {}
        });
        assertEqual(commands.execute("selection.gesture.apply", {
          mode: "eraser",
          points: [{ x: 4, y: 4 }]
        }).changed, true);
        assertEqual(calls.length, 2);
        assertDeepEqual(calls[0].value, {
          mode: "face",
          indices: [2, 4],
          operation: "replace"
        });
        assertDeepEqual(calls[1].value, { operation: "delete" });
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

function createAnimationFixture({ targets = null } = {}) {
  const listeners = new Set();
  const applied = [];
  const restored = [];
  const captures = [];
  const defaultTargets = createAnimationTargetSnapshot([{
    unitId: "group-a",
    pivot: [0, 0, 0],
    objects: [
      { objectId: "a", baseMatrix: identityMatrix() },
      { objectId: "b", baseMatrix: translationMatrix([2, 0, 0]) }
    ]
  }]);
  const resolvedTargets = targets ?? defaultTargets;
  const captureOptions = [];
  const surface = {
    subscribeFrame(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    captureAnimationTargets(targetIds, options = {}) {
      captures.push([...targetIds]);
      captureOptions.push(structuredClone(options));
      return resolvedTargets;
    },
    applyAnimationFrame(snapshot, frame) {
      const overlay = composeAnimationOverlay(snapshot, frame);
      applied.push(overlay);
      return { matrixWrites: overlay.transforms.length };
    },
    restoreAnimationTargets(snapshot) {
      restored.push(snapshot);
      return { restored: snapshot.units.length };
    }
  };
  return {
    surface,
    applied,
    restored,
    captures,
    captureOptions,
    emit(frame) {
      for (const listener of [...listeners]) listener(frame);
    }
  };
}

function transformAnimationPoint(matrix, [x, y, z]) {
  return [
    matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12],
    matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13],
    matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14]
  ];
}

function identityAnimationFrame({ targets }) {
  return targets.units.map(unit => ({
    unitId: unit.unitId,
    matrix: identityMatrix()
  }));
}

function monotonicNow() {
  let value = 0;
  return () => {
    value += 0.25;
    return value;
  };
}

function createPropertyFixture({
  instanceColor = null,
  sameAppearance = false,
  grouped = false
} = {}) {
  const appearanceRuntime = new AppearanceRuntime();
  const objects = [
    propertyObject("a", "#112233", instanceColor),
    propertyObject(
      "b",
      sameAppearance ? "#112233" : "#445566",
      instanceColor
    )
  ];
  if (grouped) {
    objects[0].parentId = "inner";
    objects[1].parentId = "outer";
    objects.unshift(
      {
        id: "outer",
        kind: "group",
        parentId: null,
        position: [0, 0, 0],
        rotation: [0, 0, 0, 1],
        scale: [1, 1, 1],
        pivot: [0, 0, 0],
        instanceState: {}
      },
      {
        id: "inner",
        kind: "group",
        parentId: "outer",
        position: [0, 0, 0],
        rotation: [0, 0, 0, 1],
        scale: [1, 1, 1],
        pivot: [0, 0, 0],
        instanceState: {}
      }
    );
  }
  const scene = appearanceRuntime.normalizeScene({
    schemaVersion: 1,
    objects
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
          return fixture.service.setSelection(args.patch, {
            targetScope: args.targetScope
          });
        }
        if (id === "selection.properties.unset") {
          return fixture.service.unsetSelection(args.properties, {
            targetScope: args.targetScope
          });
        }
        if (id === "selection.properties.applyExpression") {
          return fixture.service.setSelectionProcedural(args);
        }
        throw new Error(`Comando inesperado: ${id}.`);
      }
    },
    queries: {
      execute(id, args) {
        if (id === "properties.describe") {
          return fixture.registry.describe();
        }
        if (id === "selection.properties.inspect") {
          return fixture.service.inspectSelection(args);
        }
        throw new Error(`Consulta inesperada: ${id}.`);
      }
    }
  });
}

function createGeometryPropertyFixture() {
  const geometryRegistry = createDefaultGeometryRegistry();
  const appearanceRuntime = new AppearanceRuntime();
  const geometry = geometryRegistry.normalize({
    type: "extrude",
    contour: [[-1,-1],[1,-1],[1,1],[-1,1]],
    depth: 1
  });
  const scene = appearanceRuntime.normalizeScene({
    schemaVersion: 1,
    objects: [{
      id: "extrude-a",
      kind: "extrude",
      name: "Extrusão A",
      position: [0, 0, 0],
      rotation: [0, 0, 0, 1],
      scale: [1, 1, 1],
      geometry,
      material: { color: "#6699cc" },
      instanceState: {}
    }]
  });
  const region = new Region(
    { id: "region-geometry-properties", name: "Geometria", type: "box-region" },
    scene
  );
  const sandbox = new Sandbox(region, boxRegionReducer);
  const editor = new EditorState();
  const registry = createDefaultPropertyRegistry({ geometryRegistry });
  const service = new SelectionPropertyService({
    selection: editor.selection,
    sandbox,
    appearanceRuntime,
    registry
  });
  const renderer = {
    getTransformConfig: () => ({}),
    setTransformConfig() {}
  };
  const projectService = new ProjectService({
    sandbox,
    editor,
    renderer,
    region,
    appearanceRuntime
  });
  return {
    appearanceRuntime,
    editor,
    geometryRegistry,
    projectService,
    region,
    registry,
    sandbox,
    service
  };
}

function flattenResourcePaths(node) {
  return [
    ...(node.path ? [node.path] : []),
    ...(node.children ?? []).flatMap(flattenResourcePaths)
  ];
}

function packedColorHex(value) {
  if (value === null || value === undefined) return null;
  return `#${Number(value).toString(16).padStart(6, "0").slice(-6)}`;
}

function geometryProviderSamples() {
  const contour = [[-1,-1],[1,-1],[1,1],[-1,1]];
  const tetraVertices = [[1,1,1],[-1,-1,1],[-1,1,-1],[1,-1,-1]];
  const tetraIndices = [2,1,0,0,3,2,1,3,0,2,3,1];
  return [
    { type: "box", size: [1,2,3], segments: [1,1,1] },
    { type: "sphere", radius: 1 },
    { type: "cylinder", radius: 1, height: 2 },
    { type: "plane", width: 2, height: 3 },
    { type: "polygon", sides: 7, radius: 2 },
    { type: "capsule", radius: 1, height: 2 },
    { type: "circle", radius: 1, segments: 12 },
    { type: "cone", radius: 1, height: 2 },
    { type: "dodecahedron", radius: 1 },
    { type: "icosahedron", radius: 1 },
    { type: "octahedron", radius: 1 },
    { type: "ring", innerRadius: 0.5, outerRadius: 1 },
    { type: "tetrahedron", radius: 1 },
    { type: "torus", radius: 1, tube: 0.25 },
    { type: "torus-knot", radius: 1, tube: 0.2 },
    { type: "lathe", points: [[0,-1],[1,-1],[1,1],[0,1]] },
    { type: "tube", points: [[-2,0,0],[0,1,0],[2,0,0]] },
    { type: "shape", contour },
    { type: "extrude", contour, depth: 1 },
    { type: "polyhedron", vertices: tetraVertices, indices: tetraIndices },
    { type: "buffer", positions: [[-1,0,0],[1,0,0],[0,1,0]], indices: [0,1,2] }
  ];
}

function createMeshEditorRendererStub() {
  return {
    beginMeshEdit() {},
    endMeshEdit() {},
    updateMeshEditGeometry() {},
    updateMeshEditSelection() {},
    updateMeshEditOptions() {},
    updateMeshEditInfluence() {},
    updateMeshEditDisplay() {},
    setMeshEditFrame() {},
    setMeshEditConstraint() {},
    updateMeshEditSnap() {},
    setTransformMode() {},
    readNavigationCamera() { return { quaternion: [0,0,0,1] }; },
    meshEditStatus() { return {}; }
  };
}

function createPathToolFixture() {
  const objects = [
    {
      id: "path-source",
      kind: "tube",
      name: "Caminho",
      position: [0, 0, 0],
      rotation: [0, 0, 0, 1],
      scale: [1, 1, 1],
      geometry: {
        type: "tube",
        points: [[0, 0, 0], [0, 2, 0], [2, 4, 0]],
        tubularSegments: 8,
        radius: 0.1,
        radialSegments: 6,
        closed: false,
        curveType: "centripetal",
        tension: 0.5
      },
      instanceState: {}
    },
    {
      id: "profile-source",
      kind: "shape",
      name: "Perfil",
      position: [0, 0, 0],
      rotation: [0, 0, 0, 1],
      scale: [1, 1, 1],
      geometry: {
        type: "shape",
        contour: [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]],
        holes: [],
        curveSegments: 1
      },
      instanceState: {}
    },
    {
      id: "array-source",
      kind: "box",
      name: "Fonte",
      position: [5, 0, 0],
      rotation: [0, 0, 0, 1],
      scale: [1, 1, 1],
      geometry: { type: "box", size: [1, 1, 1], segments: [1, 1, 1] },
      instanceState: {}
    },
    {
      id: "array-group",
      kind: "group",
      name: "Grupo fonte",
      parentId: null,
      position: [3, 0, 0],
      rotation: [0, 0, 0, 1],
      scale: [1, 1, 1],
      pivot: [0, 0, 0],
      instanceState: {}
    },
    {
      id: "array-group-sphere",
      kind: "sphere",
      name: "Esfera do grupo",
      parentId: "array-group",
      position: [1, 0, 0],
      rotation: [0, 0, 0, 1],
      scale: [1, 1, 1],
      geometry: {
        type: "sphere",
        radius: 0.5,
        widthSegments: 12,
        heightSegments: 8
      },
      instanceState: {}
    }
  ];
  const region = new Region(
    { id: "path-tool-region", name: "Path tools", type: "box-region" },
    { schemaVersion: 1, objects }
  );
  const sandbox = new Sandbox(region, boxRegionReducer);
  const editor = new EditorState();
  const geometryRegistry = createDefaultGeometryRegistry();
  const selectionOperations = new SelectionOperations({
    editor,
    sandbox,
    regionId: "path-tool-region",
    geometryRegistry,
    appearanceRuntime: new AppearanceRuntime()
  });
  const resolver = new SpatialReferenceResolver({
    sandbox,
    editor,
    geometryRegistry
  });
  return {
    sandbox,
    editor,
    service: new PathToolService({
      resolver,
      selectionOperations,
      sandbox,
      editor
    })
  };
}

function createPathSketchRendererStub({ editPlane = null, drawingPlane = null, navigationPlane = null } = {}) {
  const listeners = new Map();
  const activeTouches = new Set();
  const canvas = {
    addEventListener(type, listener) {
      const entries = listeners.get(type) ?? new Set();
      entries.add(listener);
      listeners.set(type, entries);
    },
    removeEventListener(type, listener) {
      listeners.get(type)?.delete(listener);
    },
    emit(type, event) {
      event.type = type;
      for (const listener of listeners.get(type) ?? []) listener(event);
    },
    getBoundingClientRect() {
      return { left: 0, top: 0, width: 100, height: 100 };
    },
    setPointerCapture() {},
    releasePointerCapture() {}
  };
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
  camera.position.set(0, 0, 10);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  let mode = "select";
  return {
    canvas,
    camera,
    scene: new THREE.Scene(),
    orbit: { enabled: true },
    editorState: {
      snapshot() {
        return { tool: { mode } };
      }
    },
    setTransformMode(next) {
      mode = String(next);
    },
    acquireToolGestureNavigation() {
      return Object.freeze({ owner: "test-tool" });
    },
    releaseToolGestureNavigation() {
      activeTouches.clear();
      return true;
    },
    isToolNavigationGesture(event) {
      if (event.pointerType !== "touch") return false;
      if (event.type === "pointerdown") {
        activeTouches.add(event.pointerId);
      } else if (
        event.type === "pointerup" ||
        event.type === "pointercancel"
      ) {
        activeTouches.delete(event.pointerId);
      }
      return activeTouches.size >= 2;
    },
    getEditPlane() {
      return editPlane;
    },
    getDrawingPlane() {
      return drawingPlane;
    },
    getNavigationLocks() {
      return { plane: navigationPlane };
    },
    readViewerReferenceFrame() {
      return {
        origin: [0, 0, 0],
        normal: [0, 0, 1],
        xAxis: [1, 0, 0]
      };
    },
    resolvePointerPlacement({ clientX, clientY }) {
      return {
        point: [Number(clientX) / 10, Number(clientY) / 10, 0],
        normal: [0, 0, 1],
        source: "test-plane"
      };
    }
  };
}

function createPointerCanvasFixture() {
  const listeners = new Map();
  return {
    addEventListener(type, listener) {
      const values = listeners.get(type) ?? new Set();
      values.add(listener);
      listeners.set(type, values);
    },
    removeEventListener(type, listener) {
      listeners.get(type)?.delete(listener);
    },
    emit(type, event) {
      event.type = type;
      for (const listener of [...(listeners.get(type) ?? [])]) {
        listener(event);
      }
    },
    getBoundingClientRect() {
      return { left: 0, top: 0, width: 200, height: 100 };
    }
  };
}

function touchPointer(pointerId, clientX, clientY) {
  return {
    pointerId,
    pointerType: "touch",
    clientX,
    clientY,
    preventDefault() {},
    stopImmediatePropagation() {}
  };
}

function pathPointerEvent(
  pointerId,
  clientX,
  clientY,
  { pointerType = "mouse" } = {}
) {
  return {
    pointerId,
    pointerType,
    button: 0,
    clientX,
    clientY,
    preventDefault() {},
    stopImmediatePropagation() {}
  };
}

function createPathConsole(calls) {
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
    },
    queries: {
      execute(id) {
        if (id === "path.references.list") return [];
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
    geometryRegistry: createDefaultGeometryRegistry(),
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
  const region = new Region(
    { id: "affine-diagnostic", type: "box-region" },
    { schemaVersion: 1, objects: structuredClone(initialObjects) }
  );
  return new Sandbox(region, boxRegionReducer);
}

function createSelectionRepeatFixture({
  onRepeatableChanged = null,
  delayed = false
} = {}) {
  const region = new Region(
    {
      id: "repeat-region",
      name: "Repeat",
      type: "box-region"
    },
    {
      schemaVersion: 1,
      objects: [{
        id: "seed",
        name: "Semente",
        kind: "box",
        position: [1, 0, 0],
        rotation: [0, 0, 0, 1],
        scale: [1, 1, 1],
        size: [1, 1, 1],
        material: { color: "#ffffff" },
        instanceState: {}
      }]
    }
  );
  const baseSandbox = new Sandbox(region, boxRegionReducer);
  const delayedSandbox = delayed
    ? createDelayedSandbox(baseSandbox)
    : null;
  const sandbox = delayedSandbox ?? baseSandbox;
  const editor = new EditorState();
  editor.selection.replace({
    kind: "object",
    regionId: region.descriptor.id,
    objectId: "seed"
  });
  const operations = new SelectionOperations({
    editor,
    sandbox,
    regionId: region.descriptor.id,
    onRepeatableChanged
  });
  return {
    editor,
    operations,
    region,
    sandbox,
    flush: delayedSandbox?.flush ?? (() => false),
    reject: delayedSandbox?.reject ?? (() => false)
  };
}

function createDelayedSandbox(sandbox) {
  const queue = [];
  const coordinationListeners = new Set();
  return {
    region: sandbox.region,
    reducer: sandbox.reducer,
    getSnapshot: () => sandbox.getSnapshot(),
    getState: () => sandbox.getState(),
    getHistoryDiagnostics: () => sandbox.getHistoryDiagnostics(),
    subscribe: listener => sandbox.subscribe(listener),
    subscribeCoordination(listener) {
      coordinationListeners.add(listener);
      return () => coordinationListeners.delete(listener);
    },
    dispatch(command) {
      queue.push(structuredClone(command));
      return true;
    },
    flush() {
      const command = queue.shift();
      return command ? sandbox.dispatch(command) : false;
    },
    reject() {
      const command = queue.shift();
      if (!command) return false;
      const snapshot = {
        pendingIntents: queue.length,
        lastOutcome: {
          status: "rejected-test",
          commandType: command.type
        }
      };
      for (const listener of coordinationListeners) {
        listener(snapshot);
      }
      return true;
    }
  };
}

function sceneObjectMatrix(object) {
  return new THREE.Matrix4().compose(
    new THREE.Vector3().fromArray(object.position),
    new THREE.Quaternion().fromArray(object.rotation),
    new THREE.Vector3().fromArray(object.scale)
  );
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

function recoveryCheckpoint(name = "Projeto Spatial Seed") {
  return {
    format: "spatial-seed",
    schemaVersion: 1,
    metadata: {
      name,
      createdAt: "2026-07-24T12:00:00.000Z",
      savedAt: "2026-07-24T12:00:00.000Z"
    },
    region: {
      descriptor: {
        id: "region-main",
        name: "Região principal",
        type: "box-region"
      },
      version: 0
    },
    scene: {
      schemaVersion: 1,
      objects: []
    },
    editor: {},
    renderer: {}
  };
}

function createRecoveryHarness({
  sandboxId,
  rotatedId = `${sandboxId}-rotated`,
  store,
  onIdentityChanged = () => {}
}) {
  const region = new Region(
    { id: "region-main", name: "Principal", type: "box-region" },
    { schemaVersion: 1, objects: [] }
  );
  const sandbox = new Sandbox(region, boxRegionReducer);
  const listeners = new Set();
  const projectService = {
    restoreCalls: 0,
    createCheckpoint() {
      return recoveryCheckpoint();
    },
    restoreRecovery(record) {
      this.restoreCalls += 1;
      sandbox.restoreCommandSequence({
        baseState: record.checkpoint.scene,
        commands: record.commands,
        baseVersion: record.baseVersion,
        revision: record.revision
      });
      return {
        recovered: true,
        commandCount: record.commands.length
      };
    },
    prepareRecoveryExport(record) {
      const document = structuredClone(record.checkpoint);
      document.scene = sandbox.previewCommandSequence(
        document.scene,
        record.commands
      );
      return {
        prepared: true,
        filename: "recuperado.spatialseed",
        text: JSON.stringify(document),
        bytes: 1
      };
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    emit(event) {
      for (const listener of listeners) listener(event);
    }
  };
  const identity = {
    current: () => sandboxId,
    rotate: () => rotatedId
  };
  const controller = new SandboxRecoveryController({
    sandbox,
    projectService,
    store,
    identity,
    debounceMs: 100000,
    setTimer: () => 1,
    clearTimer: () => {},
    onIdentityChanged
  });
  return { controller, identity, projectService, region, sandbox };
}

function createProjectServiceRecoveryHarness({ sandboxId, store }) {
  const region = new Region(
    { id: "region-main", name: "Principal", type: "box-region" },
    { schemaVersion: 1, objects: [] }
  );
  const sandbox = new Sandbox(region, boxRegionReducer);
  const editor = new EditorState();
  const appearanceRuntime = new AppearanceRuntime();
  let transformConfig = {};
  const renderer = {
    getTransformConfig() {
      return structuredClone(transformConfig);
    },
    setTransformConfig(next) {
      transformConfig = structuredClone(next);
    }
  };
  const projectService = new ProjectService({
    sandbox,
    editor,
    renderer,
    region,
    appearanceRuntime
  });
  const controller = new SandboxRecoveryController({
    sandbox,
    projectService,
    store,
    identity: {
      current: () => sandboxId,
      rotate: () => `${sandboxId}-rotated`
    },
    debounceMs: 100000,
    setTimer: () => 1,
    clearTimer: () => {}
  });

  return {
    appearanceRuntime,
    controller,
    editor,
    projectService,
    region,
    renderer,
    sandbox
  };
}

async function createStarterExperimentRegistry() {
  const modules = new ModuleRegistry().register(starterExperimentModule);
  await modules.activateAll();
  const registry = new ExperimentRegistry().registerCatalog(
    modules.resolveContribution(
      "catalogs",
      STARTER_EXPERIMENT_CATALOG_CONTRIBUTION_ID
    )
  );
  await modules.dispose();
  return registry;
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

export async function runRuntimeTests(
  suites,
  requested = "all",
  { failuresOnly = false } = {}
) {
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
  const failed = results.length - passed;
  const reportedResults = failuresOnly
    ? results.filter(result => !result.ok)
    : results;

  return {
    scope: "runtime-layers",
    suite: requested,
    passed,
    failed,
    total: results.length,
    reported: reportedResults.length,
    resultMode: failuresOnly ? "failures-only" : "all",
    durationMs: round(performance.now() - startedAt),
    ok: passed === results.length,
    results: reportedResults
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

function navigationCameraFixture(patch = {}) {
  return normalizeNavigationCamera({
    position: [0, 0, 0],
    quaternion: [0, 0, 0, 1],
    focusDistance: 1,
    fov: 55,
    near: 0.1,
    far: 1000,
    aspect: 1,
    ...patch
  });
}

function createCameraSurfaceFixture() {
  let camera = navigationCameraFixture();
  const listeners = new Set();
  return {
    applyCount: 0,
    readNavigationCamera() {
      return structuredClone(camera);
    },
    applyNavigationCamera(next) {
      camera = normalizeNavigationCamera(next, camera);
      this.applyCount += 1;
      return structuredClone(camera);
    },
    subscribeNavigationCamera(listener) {
      listeners.add(listener);
      listener(structuredClone(camera));
      return () => listeners.delete(listener);
    },
    readSelectionBounds() {
      return {
        min: [-1, -1, -1],
        max: [1, 1, 1]
      };
    },
    emit(next) {
      camera = normalizeNavigationCamera(next, camera);
      for (const listener of listeners) {
        listener(structuredClone(camera));
      }
    }
  };
}

function createShortcutEvent({
  key,
  ctrlKey = false,
  metaKey = false,
  altKey = false,
  shiftKey = false,
  repeat = false,
  textEditing = false
} = {}) {
  return {
    key,
    ctrlKey,
    metaKey,
    altKey,
    shiftKey,
    repeat,
    defaultPrevented: false,
    prevented: false,
    stopped: false,
    target: {
      closest(selector) {
        return textEditing && selector.includes("input") ? {} : null;
      }
    },
    preventDefault() {
      this.defaultPrevented = true;
      this.prevented = true;
    },
    stopPropagation() {
      this.stopped = true;
    }
  };
}

function assert(condition, message = "Falha de asserção.") {
  if (!condition) throw new Error(message);
}

function createEditContextFixture() {
  const editor = new EditorState();
  const renderer = {
    transform: { space: "world" },
    objectFrame: { mode: "world", quaternion: [0, 0, 0, 1] },
    objectAxes: { x: true, y: true, z: true },
    locks: { plane: null, point: null },
    editPlane: null,
    drawingPlane: null,
    transformConfig: {},
    setTransformMode(mode) { editor.setToolMode(mode); },
    setSelectionOperation(operation) {
      editor.setSelectionOperation(operation);
      return operation;
    },
    readNavigationCamera() {
      return { quaternion: [0, 0, 0, 1], position: [0, 0, 10], focusDistance: 10 };
    },
    readViewerReferenceFrame() {
      return {
        origin: [0, 0, 0], xAxis: [1, 0, 0], yAxis: [0, 1, 0],
        normal: [0, 0, 1], quaternion: [0, 0, 0, 1], source: "viewer"
      };
    },
    readSelectionReferenceFrame() { return null; },
    getSelectionPivotPosition() { return [0, 0, 0]; },
    getObjectTransformFrame() { return structuredClone(this.objectFrame); },
    setObjectTransformFrame(frame) {
      this.objectFrame = {
        mode: frame.mode,
        quaternion: frame.quaternion ?? [0, 0, 0, 1]
      };
      return this.getObjectTransformFrame();
    },
    getObjectTransformAxes() { return { ...this.objectAxes }; },
    setObjectTransformAxes(axes) {
      this.objectAxes = { ...axes };
      return this.getObjectTransformAxes();
    },
    setTransformConfig(patch) { this.transformConfig = { ...this.transformConfig, ...patch }; },
    getNavigationLocks() {
      return {
        ...structuredClone(this.locks),
        mode: this.locks.plane
          ? (this.locks.point ? "plane-point" : "plane-2d")
          : (this.locks.point ? "orbit-point" : "free"),
        editPlane: this.editPlane ? structuredClone(this.editPlane) : null,
        drawingPlane: this.drawingPlane
          ? structuredClone(this.drawingPlane)
          : null
      };
    },
    getEditPlane() {
      return this.editPlane ? structuredClone(this.editPlane) : null;
    },
    setEditPlane(frame) {
      this.editPlane = frame ? structuredClone(frame) : null;
      return this.getEditPlane();
    },
    getDrawingPlane() {
      return this.drawingPlane
        ? structuredClone(this.drawingPlane)
        : null;
    },
    setDrawingPlane(frame) {
      this.drawingPlane = frame ? structuredClone(frame) : null;
      return this.getDrawingPlane();
    },
    setNavigationPlaneLock(frame) {
      this.locks.plane = frame ? structuredClone(frame) : null;
      return this.getNavigationLocks();
    },
    setNavigationPointLock(value) {
      this.locks.point = value ? structuredClone(value) : null;
      return this.getNavigationLocks();
    },
    clearNavigationLocks() {
      this.locks = { plane: null, point: null };
      return this.getNavigationLocks();
    }
  };
  const listeners = new Set();
  let state = {
    active: false,
    componentMode: "vertex",
    canEnter: true,
    constraint: "free",
    frameMode: null,
    snap: null,
    deformation: null,
    canUndo: false,
    canRedo: false
  };
  const emit = () => {
    const snapshot = meshEditor.status();
    for (const listener of listeners) listener(snapshot);
  };
  const meshEditor = {
    get active() { return state.active; },
    status() { return Object.freeze(structuredClone(state)); },
    subscribe(listener) { listeners.add(listener); listener(this.status()); return () => listeners.delete(listener); },
    enter() {
      state = {
        ...state,
        active: true,
        componentMode: "vertex",
        frameMode: "local",
        constraint: "free",
        snap: {
          enabled: false,
          mode: "auto",
          modes: ["vertex", "edge", "face"],
          scope: "active",
          anchor: "active",
          tolerancePixels: 18,
          self: false
        },
        deformation: { enabled: true }
      };
      emit();
      return this.status();
    },
    cancel() { state = { ...state, active: false, frameMode: null }; emit(); },
    setComponentMode(mode) { state = { ...state, componentMode: mode }; emit(); return this.status(); },
    setConstraint(constraint) { state = { ...state, constraint }; emit(); return this.status(); },
    setSnap(snap) { state = { ...state, snap: { ...state.snap, ...snap } }; emit(); return this.status(); },
    setDeformation(patch) { state = { ...state, deformation: { ...state.deformation, ...patch } }; emit(); return this.status(); },
    setFrame(mode) { state = { ...state, frameMode: mode }; emit(); return this.status(); },
    setCustomFrame({ mode }) { state = { ...state, frameMode: mode }; emit(); return this.status(); },
    referencePoint() { return [0, 0, 0]; },
    referenceFrame() { return null; }
  };
  return { editor, renderer, meshEditor };
}

function createMemoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return values.get(String(key)) ?? null;
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

function assertVectorNear(actual, expected, epsilon = 1e-9) {
  assertEqual(actual.length, expected.length);
  actual.forEach((value, index) =>
    assertNear(value, expected[index], epsilon)
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

async function createLocalViewerPair({
  network = createLocalViewerNetwork()
} = {}) {
  const sandboxId = "sandbox-local-viewer-tests";
  const authority = createLocalViewerHarness({
    sandboxId,
    viewerId: "viewer-authority",
    role: "authority",
    network
  });
  const replica = createLocalViewerHarness({
    sandboxId,
    viewerId: "viewer-replica",
    role: "replica",
    network
  });
  await authority.coordinator.start();
  await replica.coordinator.start();
  await settleLocalViewers();
  return {
    authority,
    replica,
    dispose() {
      replica.coordinator.dispose();
      authority.coordinator.dispose();
    }
  };
}

async function createLocalAnimationPair({
  network = createLocalViewerNetwork(),
  clock = { value: Date.parse("2026-07-24T12:00:00.000Z") }
} = {}) {
  const sandboxId = "sandbox-local-viewer-tests";
  const viewers = await createLocalViewerPair({ network });
  const authority = attachLocalAnimation(viewers.authority, {
    network,
    clock
  });
  const replica = attachLocalAnimation(viewers.replica, {
    network,
    clock
  });
  await settleLocalViewers();
  return {
    sandboxId,
    network,
    clock,
    authority: {
      viewer: viewers.authority,
      ...authority
    },
    replica: {
      viewer: viewers.replica,
      ...replica
    },
    dispose() {
      replica.dispose();
      authority.dispose();
      viewers.dispose();
    }
  };
}

function attachLocalAnimation(viewer, {
  network,
  clock
}) {
  const adapter = createLocalAnimationAdapter();
  const animation = new LocalAnimationCoordinator({
    sandbox: viewer.sandbox,
    sandboxId: viewer.coordinator.sandboxId,
    viewerId: viewer.coordinator.viewerId,
    isAuthority: () => viewer.coordinator.isAuthority,
    adapter,
    channelFactory: network.channelFactory,
    now: () => clock.value
  });
  animation.start();
  const unsubscribeViewer = viewer.coordinator.subscribe(status => {
    if (status.sandboxId !== animation.sandboxId) {
      animation.switchSandbox(status.sandboxId);
    }
  });
  return {
    animation,
    adapter,
    dispose() {
      unsubscribeViewer();
      animation.dispose();
    }
  };
}

function createLocalAnimationAdapter() {
  const applied = [];
  let session = {
    sequence: 0,
    state: "idle",
    positionSeconds: 0,
    changedAtMs: 0
  };
  return {
    applied,
    prepare(operation, args = {}) {
      const targetIds = [...new Set(
        (args.targetIds ?? []).map(String)
      )];
      if (!targetIds.length) {
        throw new Error("Descritor de teste exige alvos.");
      }
      return Object.freeze({
        kind: String(operation),
        id: String(args.id ?? "test"),
        ...(args.operations
          ? { operations: structuredClone(args.operations) }
          : {}),
        targetIds: Object.freeze(targetIds),
        targetMode: String(args.targetMode ?? "selection")
      });
    },
    apply(next) {
      session = structuredClone(next);
      applied.push(session);
      return this.status();
    },
    status() {
      return Object.freeze({
        state: session.state,
        time: Object.freeze({
          simulationTime: Number(session.positionSeconds ?? 0)
        }),
        statistics: Object.freeze({
          frames: 0,
          droppedSteps: 0
        })
      });
    }
  };
}

function createTransformPreviewAdapter() {
  const applied = [];
  const cleared = [];
  return {
    applied,
    cleared,
    apply(session) {
      applied.push(structuredClone(session));
      return true;
    },
    clear(session) {
      cleared.push(structuredClone(session));
      return true;
    }
  };
}

function attachRealLocalAnimation(viewer, {
  network,
  clock
}) {
  const fixture = createAnimationFixture();
  const runtime = new AnimationRuntime({
    surface: fixture.surface,
    now: monotonicNow()
  });
  const service = new AnimationCommandService({
    runtime,
    selection: () => ({
      members: [{ objectId: "group-a" }]
    })
  });
  const animation = new LocalAnimationCoordinator({
    sandbox: viewer.sandbox,
    sandboxId: viewer.coordinator.sandboxId,
    viewerId: viewer.coordinator.viewerId,
    isAuthority: () => viewer.coordinator.isAuthority,
    adapter: {
      prepare: (operation, args) =>
        service.prepareShared(operation, args),
      apply: (session, { now }) =>
        service.synchronizeShared(session, { now }),
      status: () => service.status()
    },
    channelFactory: network.channelFactory,
    now: () => clock.value
  });
  animation.start();
  return {
    animation,
    fixture,
    dispose() {
      animation.dispose();
      runtime.dispose();
    }
  };
}


function cubeBufferDescriptor() {
  return {
    type: "buffer",
    positions: [
      [-1,-1,-1], [1,-1,-1], [1,1,-1], [-1,1,-1],
      [-1,-1,1], [1,-1,1], [1,1,1], [-1,1,1]
    ],
    indices: [
      0,2,1, 0,3,2,
      4,5,6, 4,6,7,
      0,1,5, 0,5,4,
      3,7,6, 3,6,2,
      0,4,7, 0,7,3,
      1,2,6, 1,6,5
    ],
    normals: [],
    uvs: [],
    edges: []
  };
}

function createLocalViewerHarness({
  sandboxId,
  viewerId,
  role,
  joinExisting = false,
  network,
  lockManager = null
}) {
  const region = new Region(
    {
      id: `region-${viewerId}`,
      name: "Viewer local",
      type: "box-region"
    },
    { schemaVersion: 1, objects: [] }
  );
  const sandbox = new Sandbox(region, boxRegionReducer);
  const coordinator = new LocalViewerCoordinator({
    sandbox,
    sandboxId,
    viewerId,
    requestedRole: role,
    joinExisting,
    channelFactory: network.channelFactory,
    lockManager,
    now: () => Date.parse("2026-07-24T12:00:00.000Z")
  });
  coordinator.connectSnapshotAdapter({
    capture() {
      const proposal = sandbox.createProposal();
      return {
        revision: sandbox.revision,
        baseVersion: sandbox.baseVersion,
        baseState: sandbox.getBaseState(),
        commands: proposal.commands
      };
    },
    restore(snapshot) {
      return sandbox.restoreCommandSequence({
        baseState: snapshot.baseState,
        commands: snapshot.commands,
        baseVersion: snapshot.baseVersion,
        revision: snapshot.revision
      });
    },
    prepareIntent(command) {
      return { command };
    },
    applyIntent(intent) {
      return sandbox.dispatch(intent.command);
    }
  });
  return {
    region,
    sandbox,
    coordinator,
    coordinated: new CoordinatedSandbox({
      sandbox,
      coordinator
    })
  };
}

function createLocalViewerLockManager() {
  const locks = new Map();
  const stateFor = name => {
    const state = locks.get(name) ?? {
      held: false,
      queue: []
    };
    locks.set(name, state);
    return state;
  };
  const drain = name => {
    const state = stateFor(name);
    if (state.held || !state.queue.length) return;
    const request = state.queue.shift();
    if (request.aborted) {
      drain(name);
      return;
    }
    state.held = true;
    Promise.resolve(request.callback({ name })).then(
      value => {
        state.held = false;
        request.resolve(value);
        drain(name);
      },
      error => {
        state.held = false;
        request.reject(error);
        drain(name);
      }
    );
  };
  return {
    request(name, options = {}, callback) {
      const state = stateFor(name);
      if (options.ifAvailable && state.held) {
        return Promise.resolve(callback(null));
      }
      return new Promise((resolve, reject) => {
        const request = {
          callback,
          resolve,
          reject,
          aborted: false
        };
        const abort = () => {
          request.aborted = true;
          const index = state.queue.indexOf(request);
          if (index >= 0) state.queue.splice(index, 1);
          const error = new Error("Lock request aborted.");
          error.name = "AbortError";
          reject(error);
        };
        if (options.signal?.aborted) {
          abort();
          return;
        }
        options.signal?.addEventListener?.(
          "abort",
          abort,
          { once: true }
        );
        state.queue.push(request);
        drain(name);
      });
    }
  };
}

function createLocalViewerNetwork() {
  const groups = new Map();
  const paused = new Set();
  const messages = [];
  const channelFactory = name => {
    const listeners = new Set();
    const channel = {
      closed: false,
      addEventListener(type, listener) {
        if (type === "message") listeners.add(listener);
      },
      removeEventListener(type, listener) {
        if (type === "message") listeners.delete(listener);
      },
      postMessage(message) {
        messages.push({
          name,
          message: structuredClone(message)
        });
        if (channel.closed || paused.has(message.type)) return;
        for (const peer of groups.get(name) ?? []) {
          if (peer === channel || peer.closed) continue;
          const payload = structuredClone(message);
          queueMicrotask(() => {
            for (const listener of peer.listeners) {
              listener({ data: payload });
            }
          });
        }
      },
      close() {
        channel.closed = true;
        groups.get(name)?.delete(channel);
      },
      listeners
    };
    const group = groups.get(name) ?? new Set();
    group.add(channel);
    groups.set(name, group);
    return channel;
  };
  return {
    channelFactory,
    messages,
    pause(type) {
      paused.add(type);
    },
    resume(type) {
      paused.delete(type);
    }
  };
}

async function settleLocalViewers(turns = 8) {
  for (let index = 0; index < turns; index += 1) {
    await Promise.resolve();
  }
}
