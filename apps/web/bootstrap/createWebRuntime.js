import { Region } from "../../../packages/core/src/Region.js?build=20260808-0053f";
import { Sandbox } from "../../../packages/core/src/Sandbox.js?build=20260819-0054na";
import {
  emptyDataObjectDocument
} from "../../../packages/core/src/index.js?build=20260819-0054na";
import {
  ModuleRegistry
} from "../../../packages/plugin-api/src/index.js?build=20260808-0053f";
import { EditorState } from "../../../packages/editor-core/src/EditorState.js?build=20260809-0053l";
import {
  VIEWER_CAMERA_COMMANDS,
  CameraObjectService,
  ViewerCameraController,
  ViewerState,
} from "../../../packages/runtime-layers/src/index.js?build=20260808-0053f";
import {
  REGION_BOX_REDUCER_CONTRIBUTION_ID,
  regionBoxModule
} from "../../../packages/region-box/src/index.js?build=20260819-0054na";
import { ThreeRegionRenderer } from "../../../packages/renderer-three/src/index.js?build=20260818-0054my";
import { OutlineRenderer } from "../../../packages/renderer-outline/src/OutlineRenderer.js?build=20260808-0053f";
import {
  createVirtualResourceTree,
  parseResourcePath,
  ResourceSearchIndex
} from "../../../packages/resource-tree/src/index.js?build=20260818-0054mx";
import { DevConsole } from "../../../packages/devtools/src/DevConsole.js?build=20260818-0054mx";
import { ObjectInspector } from "../../../packages/object-inspector/src/ObjectInspector.js?build=20260818-0054mx";
import { GeometryCreationPanel } from "../../../packages/geometry-creation-panel/src/index.js?build=20260808-0053f";
import { SelectionOperations } from "../../../packages/selection-operations/src/SelectionOperations.js?build=20260809-0053m";
import { createEditorCommands } from "../../../packages/editor-commands/src/EditorCommands.js?build=20260812-0054g";
import { ProjectService } from "../../../packages/project-files/src/ProjectService.js?build=20260819-0054na&revision=20260819-0054nc";
import {
  AssetStore,
  portableBinarySource,
  portableBinaryValue
} from "../../../packages/asset-store/src/index.js?revision=20260819-0054nc";
import {
  InstanceGraphProjectionCache,
  instanceGraphDiagnostics
} from "../../../packages/instance-graph/src/index.js?build=20260809-0053k";
import {
  OccurrenceResolver
} from "../../../packages/occurrence-runtime/src/index.js?build=20260808-0053f";
import { OccurrenceTransformHierarchy } from "../../../packages/transform-hierarchy/src/index.js?build=20260809-0053l";
import {
  ComplexityReporter
} from "../../../packages/complexity-audit/src/index.js?build=20260808-0053f";
import {
  activateWebRuntimeExtensions,
  BrowserProcedureCatalogStore
} from "../../../packages/platform-web/src/index.js?build=20260818-0054my";
import { AppearanceRuntime } from "../../../packages/appearance-runtime/src/index.js?build=20260818-0054mx";
import {
  AppearanceBindingService
} from "../../../packages/appearance-binding/src/index.js?build=20260808-0053f";
import {
  classifyChanges,
  SceneProjectionScheduler
} from "../../../packages/incremental-runtime/src/index.js?build=20260819-0054na";
import {
  createDefaultPropertyTransferPresetCatalog,
  createDefaultPropertyRegistry,
  SelectionPropertyClipboard,
  SelectionPropertyService
} from "../../../packages/property-registry/src/index.js?build=20260818-0054mx&revision=20260819-0054nb";
import {
  createDefaultGeometryRegistry
} from "../../../packages/geometry-registry/src/index.js?build=20260808-0053f";
import {
  SKETCH_DESCRIPTOR_VERSION
} from "../../../packages/sketch-descriptor/src/index.js?build=20260808-0053f";
import {
  SpatialSeedRuntime,
  RuntimeQueryRegistry,
  RuntimeEvents,
  RuntimeCapabilities,
  describeRuntimeProfiles,
  resolveRuntimeProfile
} from "../../../packages/runtime-api/src/index.js?build=20260808-0053f";
import {
  CAMERA_PLAN_COMMANDS,
  CameraPlanCommitService,
  ProcedureCatalog,
  ProgramSessionController,
  SpatialPlanCommitService,
  SPATIAL_CREATE_COMMAND,
  createBrowserProgramSessionWorker
} from "../../../packages/script-runtime/src/index.js?build=20260808-0053f";
import {
  ProcedureCatalogEditor
} from "../../../packages/procedure-editor/src/index.js?build=20260808-0053f";
import {
  ProcedureCatalogUiPanel
} from "../../../packages/catalog-ui/src/index.js?build=20260808-0053f";
import {
  ExperimentActionService,
  ExperimentRegistry,
  ExperimentService
} from "../../../packages/experiment-runtime/src/index.js?build=20260808-0053f";
import {
  STARTER_EXPERIMENT_CATALOG_CONTRIBUTION_ID,
  starterExperimentModule
} from "../../../packages/experiment-plugin/src/index.js?build=20260808-0053f";
import {
  ExperimentPanel
} from "../../../packages/experiment-panel/src/index.js?build=20260808-0053f";
import {
  AnalyticTimeDomains,
  DependencyVersions,
  TemporalExecutionController,
  TemporalRuntime
} from "../../../packages/temporal-runtime/src/index.js?build=20260808-0053f";
import {
  ANIMATION_COMMAND_SERVICE_VERSION,
  TEMPORAL_ANIMATION_RUNTIME_VERSION,
  AnimationCommandService,
  AnimationProcedureService,
  TemporalAnimationRuntime
} from "../../../packages/animation-runtime/src/index.js?build=20260808-0053i";
import {
  AnimationPanel
} from "../../../packages/animation-panel/src/index.js?build=20260808-0053f";
import {
  GAME_RUNTIME_VERSION,
  GameAudioRuntime,
  GameEventRuntime,
  GameRuntime,
  GameSessionState
} from "../../../packages/game-runtime/src/index.js?build=20260819-0054na&revision=20260819-0054nb";
import {
  SelectionInteractionService
} from "../../../packages/interaction-runtime/src/index.js?build=20260818-0054mx&revision=20260819-0054nb";
import {
  CHARACTER_ANIMATION_VERSION,
  CharacterAnimationSystem
} from "../../../packages/character-animation/src/index.js?build=20260818-0054mx";
import {
  ThreeCharacterAnimationBackend
} from "../../../packages/character-animation-three/src/index.js?build=20260818-0054mx";
import {
  ViewerRenderPanel
} from "../../../packages/viewer-render-panel/src/index.js?build=20260808-0053f";
import {
  MeshEditController
} from "../../../packages/mesh-editor-core/src/index.js?build=20260812-0054g";
import {
  MeshExchangeService
} from "../../../packages/mesh-exchange/src/index.js?build=20260818-0054mx";
import {
  createThreeMeshTriangulator
} from "../../../packages/mesh-exchange-three/src/index.js?build=20260818-0054mx";
import {
  MeshPathGestureController
} from "../../../packages/mesh-interaction/src/index.js?build=20260818-0054mx";
import {
  listMeshOperatorContracts
} from "../../../packages/mesh-operator-kernel/src/index.js?build=20260812-0054g";
import {
  MeshEditPanel
} from "../../../packages/mesh-edit-panel/src/index.js?build=20260812-0054g";
import {
  EditContextController
} from "../../../packages/edit-context/src/index.js?build=20260809-0053l";
import {
  EditHud
} from "../../../packages/edit-hud/src/index.js?build=20260818-0054mx";
import {
  ToolLifecycleController,
  ToolParameterStore,
  ToolWorkspaceController,
  createDefaultEditToolRegistry,
  createLegacyToolParameterMigration,
  createDefaultToolCapabilityFacade,
  installToolCapabilityRuntime
} from "../../../packages/edit-tools/src/index.js?build=20260818-0054mx";
import {
  ObjectPlacementController
} from "../../../packages/object-placement/src/index.js?build=20260818-0054mx";
import {
  DrawingTargetController
} from "../../../packages/drawing-target/src/index.js?build=20260808-0053f";
import {
  PlanarSketchController
} from "../../../packages/planar-authoring/src/index.js?build=20260808-0053f";
import {
  StrokeCompactionScheduler,
  StrokeFusionService,
  replaceStrokePointInBundle
} from "../../../packages/stroke-resources/src/index.js?build=20260808-0053f";
import {
  MeasurementController
} from "../../../packages/measurement-tools/src/index.js?build=20260808-0053f";
import {
  PATH_BRUSH_AFFINE_VARIABLES,
  PathSketchController,
  PathToolService,
  SpatialReferenceResolver
} from "../../../packages/spatial-references/src/index.js?build=20260808-0053f";
import {
  BrowserSandboxIdentity,
  createSandboxId,
  createRecoveryRecord,
  IndexedDbRecoveryStore,
  SandboxRecoveryController
} from "../../../packages/project-recovery/src/index.js?build=20260808-0053f";
import {
  CoordinatedSandbox,
  LocalProjectLaunchReceiver,
  LocalProjectLaunchSender,
  LocalAnimationCoordinator,
  LocalTransformPreviewCoordinator,
  LocalViewerCoordinator,
  LocalViewerSessionDirectory,
  createIndependentProjectUrl
} from "../../../packages/local-viewers/src/index.js?build=20260809-0053k";

const EXPECTED_RENDERER_API = "renderer-three-navigation-camera-v9";
const EXPECTED_EDITOR_API = "editor-state-v2";

export async function createWebRuntime({
  canvas,
  outlineRoot,
  geometryCreationRoot,
  experimentPanelRoot,
  animationPanelRoot,
  viewerRenderPanelRoot,
  meshEditPanelRoot,
  editHudRoot,
  procedureEditorRoot,
  procedureCatalogUiRoot,
  inspectorRoot,
  onConsoleOutput,
  buildInfo,
  uiConfiguration,
  runtimeProfile = "authoring",
  runtimeExtensions = []
}) {
  if (!buildInfo?.build || !buildInfo?.version) {
    throw new TypeError("createWebRuntime exige buildInfo válido.");
  }
  validateApis();
  const profile = resolveRuntimeProfile(runtimeProfile);

  const modules = new ModuleRegistry()
    .register(regionBoxModule)
    .register(starterExperimentModule);

  await modules.activateAll();

  const reducer = modules.resolveContribution(
    "reducers",
    REGION_BOX_REDUCER_CONTRIBUTION_ID
  );
  const experimentRegistry = new ExperimentRegistry().registerCatalog(
    modules.resolveContribution(
      "catalogs",
      STARTER_EXPERIMENT_CATALOG_CONTRIBUTION_ID
    )
  );

  const appearanceRuntime = new AppearanceRuntime();
  const portableAssetStore = new AssetStore();
  const geometryRegistry=createDefaultGeometryRegistry();
  const initialScene = appearanceRuntime.normalizeScene({
    schemaVersion: 1,
    objects: [
      {id:"box-1",kind:"box",name:"Caixa 1",position:[-3,1,0],rotation:[0,0,0,1],scale:[1,1,1],size:[2,2,2],material:{color:"#5b8bd9"}},
      {id:"box-2",kind:"box",name:"Caixa 2",position:[0,1,0],rotation:[0,0,0,1],scale:[1,1,1],size:[2,2,2],material:{color:"#d98067"}},
      {id:"box-3",kind:"box",name:"Caixa 3",position:[3,1,0],rotation:[0,0,0,1],scale:[1,1,1],size:[2,2,2],material:{color:"#72b883"}}
    ]
  });

  const region = new Region(
    {
      id: "region-main",
      name: "Região principal",
      type: "box-region"
    },
    initialScene
  );

  const baseSandbox = new Sandbox(region, reducer);
  const editor = new EditorState();
  let commandSandbox = baseSandbox;
  const preparedCommandMarker = "spatialseed-prepared-command-v1";

  function dispatchRuntimeCommand(command) {
    const prepared = Boolean(
      command &&
      typeof command === "object" &&
      command.preparedImmutable === preparedCommandMarker &&
      Object.isFrozen(command)
    );
    const requiresMaterialMigration = Boolean(
      command?.type === "object.update" && command.patch?.material
    );
    const next = prepared && !requiresMaterialMigration
      ? command
      : structuredClone(command);

    if (next.type === "object.update" && next.patch?.material) {
      const created = appearanceRuntime.internLegacyMaterial(
        next.patch.material
      );

      next.patch.appearanceId = created.appearanceId;
      delete next.patch.material;
    }

    return commandSandbox.dispatch(next);
  }

  const renderer = new ThreeRegionRenderer(canvas, {
    dispatch: dispatchRuntimeCommand,
    selection: editor.selection,
    editorState: editor,
    geometryRegistry,
    projectObject: object =>
      appearanceRuntime.projectObject(object)
  });
  renderer.setTransformConfig(
    uiConfiguration?.presentation?.transform ?? {}
  );
  const viewer = new ViewerState({
    viewerId: crypto.randomUUID(),
    camera: renderer.readNavigationCamera()
  });
  const cameraController = new ViewerCameraController({
    viewer,
    surface: renderer
  });
  const timeDomains = new AnalyticTimeDomains();
  const temporalDependencies = new DependencyVersions();
  const temporalRuntime = new TemporalRuntime({
    domains: timeDomains,
    dependencies: temporalDependencies
  });
  let temporalExecution = null;
  const rescheduleTemporalRuntime = changed => {
    if (!changed) return false;
    temporalRuntime.wakeAll();
    temporalExecution?.reconcile();
    return true;
  };
  const updateTemporalDomain = (id, update) => {
    const before = timeDomains.snapshot(id).revision;
    const domain = update();
    const changed = domain.revision !== before;
    rescheduleTemporalRuntime(changed);
    return Object.freeze({ changed, domain });
  };
  const animationRuntime = new TemporalAnimationRuntime({
    surface: renderer,
    temporalRuntime,
    timeDomains
  });
  const animationCommands = new AnimationCommandService({
    runtime: animationRuntime,
    selection: () => editor.selection.snapshot()
  });

  const resourceTree = createVirtualResourceTree({
    sandbox: baseSandbox,
    pageSize: 100
  });
  const resourceSearch = new ResourceSearchIndex({
    getObjects: () => baseSandbox.getSnapshot().objects,
    getAssets: () => appearanceRuntime.listAssetDescriptors(),
    getRevision: () => `${baseSandbox.revision}:${appearanceRuntime.revision}`
  });
  let resourceEditHandler = null;
  const outline = new OutlineRenderer(outlineRoot, {
    resourceTree,
    onActivate: ({ path, reference }) => {
      const objectId = reference?.ownerObjectId;
      if (!objectId || !baseSandbox.getObject(objectId)) return;
      editor.selection.replace({
        kind: reference.kind,
        regionId: region.descriptor.id,
        objectId,
        resourcePath: path,
        ...(reference.memberId ? { memberId: reference.memberId } : {}),
        ...(reference.strokeId ? { strokeId: reference.strokeId } : {}),
        ...(Number.isInteger(reference.vertexIndex)
          ? { vertexIndex: reference.vertexIndex }
          : {})
      });
    },
    onEdit: request => resourceEditHandler?.(request)
  });
  const locationParameters = new URLSearchParams(
    globalThis.location?.search ?? ""
  );
  const sandboxIdentity = new BrowserSandboxIdentity({
    requestedId: locationParameters.get("sandbox")
  });
  const sandboxId = sandboxIdentity.current();
  let projectService = new ProjectService({
    sandbox: baseSandbox,
    editor,
    renderer,
    region,
    appearanceRuntime,
    portableAssetStore
  });
  const projectLaunchMode = locationParameters.get("project");
  let incomingProject = null;
  let defaultDemoLaunch = null;
  if (projectLaunchMode === "new") {
    projectService.newProject();
  } else if (projectLaunchMode === "open") {
    const receiver = new LocalProjectLaunchReceiver({
      launchId: locationParameters.get("launch")
    });
    try {
      incomingProject = await receiver.receive();
      const opened = projectService.openText(incomingProject.text);
      receiver.accept(opened);
    } catch (error) {
      receiver.reject(error);
      throw error;
    }
  } else if (shouldOpenDefaultDemo(locationParameters)) {
    try {
      const demo = await loadDefaultDemoProject();
      projectService.openText(demo.text);
      defaultDemoLaunch = demo.launch;
    } catch (error) {
      globalThis.console?.warn?.(
        "Não foi possível abrir o projeto de demonstração padrão.",
        error
      );
    }
  }
  const viewerCoordinator = new LocalViewerCoordinator({
    sandbox: baseSandbox,
    sandboxId,
    viewerId: viewer.viewerId,
    requestedRole: locationParameters.get("viewer") === "authority"
      ? "authority"
      : locationParameters.get("viewer") === "fixed-replica"
        ? "replica"
        : "auto",
    joinExisting: locationParameters.get("viewer") === "join"
  });
  viewerCoordinator.connectSnapshotAdapter({
    capture: ({ sandboxId: snapshotSandboxId }) => {
      const proposal = baseSandbox.createProposal();
      return createRecoveryRecord({
        sandboxId: snapshotSandboxId,
        checkpoint: projectService.createCheckpoint(),
        commands: proposal.commands,
        baseVersion: proposal.baseVersion,
        revision: baseSandbox.revision,
        dirty: baseSandbox.dirty,
        updatedAt: new Date().toISOString()
      });
    },
    restore: snapshot =>
      projectService.restoreRecovery(snapshot, {
        restoreEditorState: false,
        restoreRendererState: false
      }),
    prepareIntent: command => ({
      command,
      assets: appearanceRuntime.exportAssets()
    }),
    applyIntent: intent => {
      /*
       * O sandbox local já é a autoridade do documento. O preflight anterior
       * clonava o estado completo e executava o redutor uma vez antes do
       * dispatch real. Comandos locais preparados são validados pelo produtor
       * e passam uma única vez pelo redutor autoritativo.
       */
      appearanceRuntime.importAssets(
        intent.assets,
        { replace: false }
      );
      return baseSandbox.dispatch(intent.command);
    }
  });
  await viewerCoordinator.start();
  const viewerDirectory = new LocalViewerSessionDirectory({
    describe: () => ({
      sandboxId: viewerCoordinator.sandboxId,
      viewerId: viewer.viewerId,
      role: viewerCoordinator.role,
      projectName: projectService.metadata.name,
      revision: baseSandbox.revision,
      dirty: baseSandbox.dirty,
      objectCount: baseSandbox.objectCount
    })
  });
  viewerDirectory.start();
  const unsubscribeProjectDirectory = projectService.subscribe(
    () => viewerDirectory.announce()
  );
  const sharedAnimations = new LocalAnimationCoordinator({
    sandbox: baseSandbox,
    sandboxId: viewerCoordinator.sandboxId,
    viewerId: viewer.viewerId,
    isAuthority: () => viewerCoordinator.isAuthority,
    adapter: {
      prepare: (operation, args) =>
        animationCommands.prepareShared(operation, args),
      apply: (session, { now }) =>
        animationCommands.synchronizeShared(session, { now }),
      status: () => animationCommands.status(),
      sceneChanged: (changes, session) =>
        animationCommands.sceneChanged(changes, session)
    }
  });
  sharedAnimations.start();
  const sandbox = new CoordinatedSandbox({
    sandbox: baseSandbox,
    coordinator: viewerCoordinator
  });
  commandSandbox = sandbox;
  const cameraObjects = new CameraObjectService({
    sandbox,
    viewer,
    controller: cameraController
  });
  renderer.setCameraVisualState({
    activeCameraId: cameraObjects.list().activeCameraId,
    defaultCameraId: cameraObjects.list().defaultCameraId
  });
  const transformPreviews = new LocalTransformPreviewCoordinator({
    sandbox: baseSandbox,
    sandboxId: viewerCoordinator.sandboxId,
    viewerId: viewer.viewerId,
    adapter: {
      apply: session => {
        renderer.applySharedTransformPreview(session);
        cameraObjects.applyTransformPreview(session.transforms);
      },
      clear: session => {
        renderer.clearSharedTransformPreview(session);
        cameraObjects.clearTransformPreview();
      }
    }
  });
  transformPreviews.start();
  const unsubscribeTransformPreviewSurface =
    renderer.subscribeTransformPreview(preview => {
      if (preview.phase === "begin") {
        transformPreviews.begin(preview);
      } else if (preview.phase === "update") {
        transformPreviews.update(preview);
      } else if (preview.phase === "commit") {
        transformPreviews.end({
          ...preview,
          committed: true
        });
      } else {
        transformPreviews.end({
          ...preview,
          committed: false
        });
      }
    });
  const toolRegistry = createDefaultEditToolRegistry({
    geometryCatalog: geometryRegistry.describe()
  });
  const toolParameters = new ToolParameterStore({
    registry: toolRegistry,
    migrate: createLegacyToolParameterMigration()
  });
  const toolLifecycle = new ToolLifecycleController({ editor });
  const spatialReferences = new SpatialReferenceResolver({
    sandbox,
    editor,
    geometryRegistry
  });
  /*
   * Este observador precisa preceder consumidores que possam selecionar
   * objetos durante a própria notificação do sandbox. Assim nenhum HUD cai
   * na reconstrução integral por ter observado o snapshot antes do cache.
   */
  const unsubscribeSpatialReferences = sandbox.subscribe(
    (state, changes) => spatialReferences.applyChanges(state, changes)
  );
  const complexityReporter = new ComplexityReporter({ limit: 512 });
  const occurrenceResolver = new OccurrenceResolver({ sandbox });
  const transformHierarchy = new OccurrenceTransformHierarchy({
    occurrenceResolver
  });
  const unsubscribeOccurrenceResolver = sandbox.subscribe((_state, changes) => {
    occurrenceResolver.invalidate(changes);
    transformHierarchy.invalidate(changes);
  });
  const selectionOperations = new SelectionOperations({
    editor,
    sandbox,
    regionId: region.descriptor.id,
    geometryRegistry,
    appearanceRuntime,
    occurrenceResolver,
    transformHierarchy,
    complexityReporter,
    onRepeatableChanged: repeatable => {
      if (repeatable) toolLifecycle.remember(repeatable);
      else toolLifecycle.clearRepeatable();
    }
  });
  const strokeCompaction = new StrokeCompactionScheduler({
    sandbox: baseSandbox
  });
  strokeCompaction.attachInputSource(globalThis);
  const strokeFusion = new StrokeFusionService({
    sandbox,
    editor,
    regionId: region.descriptor.id,
    geometryRegistry,
    appearanceRuntime,
    compactionScheduler: strokeCompaction
  });
  const meshEditor = new MeshEditController({
    sandbox,
    editor,
    renderer,
    geometryRegistry
  });
  const meshPathGesture = new MeshPathGestureController({
    renderer,
    meshEditor,
    onCompleted: ({ operation, path, options = {}, result }) => {
      if (!path?.localPoints?.length) return;
      toolLifecycle.remember({
        id: "mesh.topology.apply",
        args: {
          operation,
          options: {
            ...options,
            path: path.localPoints,
            pathMode: "explicit"
          }
        },
        label: result?.tool?.label ?? "Repetir operação por caminho"
      });
    }
  });
  const editContext = new EditContextController({
    editor,
    renderer,
    meshEditor,
    toolLifecycle
  });
  const drawingTarget = new DrawingTargetController({
    renderer,
    editContext
  });
  const pathTools = new PathToolService({
    resolver: spatialReferences,
    selectionOperations,
    sandbox,
    editor,
    meshEditor,
    requireObjectMode: action => {
      if (meshEditor.active) {
        throw new Error(
          `Finalize ou cancele a edição de malha antes de ${action}.`
        );
      }
    }
  });
  const pathSketch = new PathSketchController({
    renderer,
    pathTools,
    geometryRegistry,
    drawingTarget,
    createStroke: args => strokeFusion.createStroke(args),
    onCompleted: ({
      settings,
      points,
      sourceIds,
      frame,
      preparedPlan,
      targetType
    }) => {
      const effectiveCurveType = preparedPlan?.path?.curveType ??
        preparedPlan?.curveType ??
        (targetType === "surface" ? "polyline" : settings.curveType);
      let repeatable;
      if (settings.mode === "array") {
        repeatable = {
            id: "path.array.points.create",
            args: {
              points,
              sourceIds,
              sourceMode: settings.sourceMode,
              geometryType: settings.geometryType,
              sourceGeometry: settings.sourceGeometry,
              sourceColor: settings.sourceColor,
              materialMode: settings.materialMode,
              opacityMultiplier: settings.opacityMultiplier,
              spacingMode: settings.spacingMode,
              spacingWorld: settings.spacingWorld,
              spacingScale: settings.spacingScale,
              align: settings.align,
              closed: settings.closed,
              curveType: effectiveCurveType,
              tension: settings.tension,
              twistDegrees: settings.twistDegrees,
              initialNormal: frame.normal,
              orientationMode: settings.orientationMode,
              affineMoveX: settings.affineMoveX,
              affineMoveY: settings.affineMoveY,
              affineMoveZ: settings.affineMoveZ,
              affineRotateX: settings.affineRotateX,
              affineRotateY: settings.affineRotateY,
              affineRotateZ: settings.affineRotateZ,
              affineScale: settings.affineScale,
              affineULength: settings.affineULength,
              affineColor: settings.affineColor
            },
            label: "Distribuir no caminho desenhado"
          };
      } else if (settings.mode === "tube") {
        repeatable = {
            id: "path.stroke.create",
            args: {
              points,
              name: settings.name || "Tubo desenhado",
              radius: settings.radius,
              tubularSegments: Math.max(
                settings.tubularSegments,
                points.length * 4
              ),
              radialSegments: settings.radialSegments,
              closed: settings.closed,
              curveType: effectiveCurveType,
              tension: settings.tension,
              color: settings.color,
              materialMode: settings.materialMode,
              opacityMultiplier: settings.opacityMultiplier,
              autoFuse: settings.autoFuse,
              fusionTolerance: settings.fusionTolerance
            },
            label: "Criar tubo desenhado"
          };
      } else {
        const commandsByMode = {
          sweep: Object.freeze({
            id: "path.sweep.points.create",
            label: "Extrudar perfil no caminho desenhado"
          }),
          extrude: Object.freeze({
            id: "profile.extrude.points.create",
            label: "Extrudar perfil desenhado"
          }),
          revolve: Object.freeze({
            id: "profile.revolve.points.create",
            label: "Revolucionar perfil desenhado"
          })
        };
        const command = commandsByMode[settings.mode];
        repeatable = {
          id: command.id,
          args: {
            ...settings,
            points,
            frame,
            curveType: effectiveCurveType,
            mode: settings.mode,
            ...(settings.mode === "sweep"
              ? {
                  profileObjectId:
                    preparedPlan?.profile?.objectId ??
                    settings.profileObjectId,
                  profileExtraction:
                    preparedPlan?.profile?.extraction ??
                    settings.profileExtraction
                }
              : {}),
            continuous: false
          },
          label: command.label
        };
      }
      toolLifecycle.remember(repeatable);
      toolLifecycle.completeAction("path.sketch");
    },
    onEnded: () => toolLifecycle.cancelAction("path.sketch")
  });
  let commandsRef = null;
  const planarSketch = new PlanarSketchController({
    renderer,
    geometryRegistry,
    sandbox,
    drawingTarget,
    createObject: args =>
      commandsRef.execute("object.create.configured", args),
    createStroke: args => strokeFusion.createStroke(args),
    onCompleted: ({ mode, settings, frame, points }) => {
      toolLifecycle.remember({
        id: "planar.primitive.create",
        args: {
          ...settings,
          mode,
          frame,
          points
        },
        label: "Criar geometria 2D"
      });
      toolLifecycle.completeAction("planar.sketch");
    },
    onEnded: () => toolLifecycle.cancelAction("planar.sketch")
  });
  const objectPlacement = new ObjectPlacementController({
    renderer,
    geometryRegistry,
    createObject: args =>
      commandsRef.execute("object.create.configured", args),
    onCompleted: () => toolLifecycle.completeAction("object.place"),
    onEnded: () => toolLifecycle.cancelAction("object.place")
  });
  const measurement = new MeasurementController({ renderer });
  let drawingTargetFrameKey = null;
  const unsubscribeDrawingTargetTools = drawingTarget.subscribe(snapshot => {
    const frameKey = JSON.stringify({
      type: snapshot.type,
      frame: snapshot.frame ?? null,
      surface: snapshot.surfaceTarget
        ? {
            objectIds: snapshot.surfaceTarget.objectIds,
            frontFacesOnly: snapshot.surfaceTarget.frontFacesOnly,
            lockObject: snapshot.surfaceTarget.lockObject,
            maximumJump: snapshot.surfaceTarget.maximumJump,
            offset: snapshot.surfaceTarget.offset
          }
        : null
    });
    if (frameKey === drawingTargetFrameKey) return;
    drawingTargetFrameKey = frameKey;
    pathSketch.refreshDrawingFrame?.();
    planarSketch.refreshDrawingFrame?.();
  });

  let toolWorkspace = null;
  let gameRuntime = null;
  let resetCharacterVisualSources = () => {};
  const resetTransientAuthoring = ({ operation }) => {
    if (gameRuntime?.state === "running") {
      gameRuntime.stop(`transient-reset:${String(operation)}`);
    }
    if (meshPathGesture.active) meshPathGesture.cancel("project-reset");
    if (meshEditor.active) meshEditor.cancel();
    const path = pathSketch.resetForProjectChange({
      reason: `project:${String(operation)}`
    });
    for (const controller of [planarSketch, objectPlacement, measurement]) {
      const active = controller?.active ?? controller?.status?.().active;
      if (!active || typeof controller.cancel !== "function") continue;
      try {
        controller.cancel();
      } catch {
        // O reset do caminho já protege a cena transitória crítica.
      }
    }
    drawingTarget.resetForProjectChange();
    toolWorkspace?.clear();
    toolLifecycle.cancelAction();
    if (String(operation) !== "game.start") {
      resetCharacterVisualSources();
    }
    return path;
  };
  projectService = withProjectTransientReset(
    projectService,
    resetTransientAuthoring
  );

  const sandboxRecovery = new SandboxRecoveryController({
    sandbox: baseSandbox,
    projectService,
    store: new IndexedDbRecoveryStore(),
    identity: sandboxIdentity,
    onIdentityChanged: ({ sandboxId: nextSandboxId }) =>
      viewerCoordinator.switchSandbox(nextSandboxId)
  });
  const recoveryStatus = () => viewerCoordinator.isAuthority
    ? sandboxRecovery.status()
    : Object.freeze({
        mode: "viewer-replica",
        sandboxId: viewerCoordinator.sandboxId,
        available: false,
        pending: null,
        lastError: null
      });

  const propertyRegistry = createDefaultPropertyRegistry({ geometryRegistry });
  const propertyTransferPresets = createDefaultPropertyTransferPresetCatalog();
  const propertyService = new SelectionPropertyService({
    selection: editor.selection,
    sandbox,
    appearanceRuntime,
    registry: propertyRegistry,
    occurrenceResolver,
    complexityReporter
  });
  const propertyClipboard = new SelectionPropertyClipboard({
    propertyService,
    registry: propertyRegistry,
    presets: propertyTransferPresets
  });
  const appearanceBindings = new AppearanceBindingService({
    sandbox,
    selection: editor.selection,
    appearanceRuntime
  });

  const commands = createEditorCommands({
    editor,
    renderer,
    selectionOperations,
    projectService,
    propertyService,
    propertyClipboard,
    meshEditor,
    editContext,
    toolLifecycle,
    toolParameters,
    pathTools,
    pathSketch,
    meshPathGesture,
    planarSketch,
    objectPlacement,
    measurement,
    beforeProjectSave: () => strokeCompaction.checkpoint("save"),
    canMutateProject: action =>
      viewerCoordinator.requireAuthority(action)
  });
  const meshExchange = new MeshExchangeService({
    selection: () => editor.selection.snapshot(),
    readObject: id => sandbox.getObject(id),
    readWorldMatrix: id => sandbox.getObjectWorldMatrix(id),
    triangulateObject: createThreeMeshTriangulator({ geometryRegistry }),
    createGeometry: args => selectionOperations.createGeometry(args)
  });
  commands
    .register(
      "mesh.import.stl",
      args => {
        if (meshEditor.active) {
          throw new Error("Finalize ou cancele a edição de malha antes de importar STL.");
        }
        viewerCoordinator.requireAuthority("importar uma malha STL");
        return meshExchange.importStl(args);
      },
      { category: "mesh", mutates: true, label: "Importar STL" }
    )
    .register(
      "mesh.export.stl",
      args => {
        if (meshEditor.active) {
          throw new Error("Finalize ou cancele a edição de malha antes de exportar STL.");
        }
        return meshExchange.exportSelectionStl(args);
      },
      { category: "mesh", mutates: false, label: "Exportar STL" }
    );
  commandsRef = commands;
  const gameSessionState = new GameSessionState();
  const gameAudio = new GameAudioRuntime();
  gameAudio.configure({
    music: { src: "assets/audio/music.ogg", volume: 0.35, loop: true },
    effects: {
      jump: { src: "assets/audio/jump.mp3", volume: 0.8 },
      land: { src: "assets/audio/land.mp3", volume: 0.6 }
    }
  });
  const characterAnimation = new CharacterAnimationSystem({
    backend: new ThreeCharacterAnimationBackend({ surface: renderer })
  });
  const resolveCharacterId = characterId => {
    const explicit = String(characterId ?? "").trim();
    if (explicit) return explicit;
    const selection = editor.selection.snapshot();
    return selection.activeMember?.objectId ??
      selection.members?.[0]?.objectId ?? null;
  };
  const storedCharacterVisual = object =>
    object?.characterAnimation?.visual ?? null;
  const characterVisualMetadata = (object, visual) => Object.freeze({
    ...(object?.characterAnimation ?? {}),
    visual: Object.freeze(structuredClone(visual))
  });
  const CHARACTER_VISUAL_SOURCE_MODES = Object.freeze([
    "default",
    "custom",
    "original"
  ]);
  const DEFAULT_CHARACTER_VISUAL_ASSET = Object.freeze({
    src: "assets/characters/Fox.glb",
    filename: "Fox.glb"
  });
  const DEFAULT_CHARACTER_VISUAL_OPTIONS = Object.freeze({
    fit: "none",
    scale: 0.01,
    anchor: "feet",
    hover: 0,
    previewInEditor: false
  });
  // Policy truth is object.characterAnimation.sourceMode. These maps only cache
  // transient resources/provenance for the current browser session.
  const customCharacterSources = new Map();
  const loadedCharacterSourceModes = new Map();
  const sourceReconcileSuppressed = new Set();
  resetCharacterVisualSources = () => {
    customCharacterSources.clear();
    loadedCharacterSourceModes.clear();
    sourceReconcileSuppressed.clear();
  };
  const persistCharacterBinary = ({ data, filename = null } = {}) => {
    const value = portableBinaryValue(data, {
      mediaType: characterMediaType(filename)
    });
    return portableAssetStore.intern("binary", value, {
      retain: false,
      metadata: {
        filename: filename ? String(filename) : null,
        role: "character-model"
      }
    });
  };
  const resolvePortableCharacterSource = object => {
    const assetId = storedCharacterAssetId(object);
    if (!assetId) return null;
    const record = portableAssetStore.get(assetId);
    if (!record) {
      throw new Error(`Asset portátil inexistente: ${assetId}.`);
    }
    return portableBinarySource(record);
  };
  const normalizeCharacterVisualSourceMode = value => {
    const mode = String(value ?? "default").trim().toLowerCase();
    if (!CHARACTER_VISUAL_SOURCE_MODES.includes(mode)) {
      throw new RangeError(
        "characterAnimation.sourceMode deve ser default, custom ou original."
      );
    }
    return mode;
  };
  const storedCharacterSourceMode = object =>
    normalizeCharacterVisualSourceMode(
      object?.characterAnimation?.sourceMode ?? "default"
    );
  const characterSourceMetadata = (object, sourceMode, { assetId = null } = {}) => {
    const mode = normalizeCharacterVisualSourceMode(sourceMode);
    const next = {
      ...(object?.characterAnimation ?? {}),
      sourceMode: mode
    };
    const portableId = String(
      assetId ?? object?.characterAnimation?.assetId ?? ""
    ).trim();
    if (portableId) next.assetId = portableId;
    return Object.freeze(next);
  };
  const storedCharacterAssetId = object => {
    const value = String(object?.characterAnimation?.assetId ?? "").trim();
    return value || null;
  };
  const characterSourceStatus = characterId => {
    const id = String(characterId ?? "").trim();
    const object = id ? sandbox.getObject(id) : null;
    const animation = id ? characterAnimation.status(id) : null;
    return Object.freeze({
      characterId: id || null,
      mode: storedCharacterSourceMode(object),
      loadedMode: id ? loadedCharacterSourceModes.get(id) ?? null : null,
      loaded: Boolean(animation?.loaded),
      assetId: animation?.assetId ?? null,
      portableAssetId: storedCharacterAssetId(object),
      defaultAsset: DEFAULT_CHARACTER_VISUAL_ASSET.src
    });
  };
  const emitCharacterAnimationChanged = (characterId, reason, extra = {}) => {
    const sourceStatus = characterSourceStatus(characterId);
    runtime.emit("character.animation.changed", {
      characterId,
      status: characterAnimation.status(characterId),
      sourceStatus,
      reason,
      ...extra
    });
    return sourceStatus;
  };
  const loadCharacterVisualSource = async (characterId, source, mode) => {
    const id = String(characterId ?? "").trim();
    const object = sandbox.getObject(id);
    const persistedVisual = storedCharacterVisual(object) ?? {};
    const visualDefaults = mode === "default"
      ? DEFAULT_CHARACTER_VISUAL_OPTIONS
      : Object.freeze({ fit: "none", previewInEditor: false });
    const status = await characterAnimation.load(
      id,
      source,
      {
        visual: Object.freeze({ ...visualDefaults, ...persistedVisual }),
        rootMotion: "in-place-horizontal"
      }
    );
    loadedCharacterSourceModes.set(id, mode);
    return status;
  };
  const ensureCharacterVisual = async characterId => {
    const id = String(characterId ?? "").trim();
    if (!id) throw new TypeError("Personagem obrigatório.");
    const object = sandbox.getObject(id);
    if (!object) throw new Error(`Personagem inexistente: ${id}.`);
    const mode = storedCharacterSourceMode(object);
    const current = characterAnimation.status(id);
    const loadedMode = loadedCharacterSourceModes.get(id) ?? null;

    if (mode === "original") {
      if (current.loaded) await characterAnimation.unload(id);
      loadedCharacterSourceModes.delete(id);
      return emitCharacterAnimationChanged(id, "source-original");
    }

    if (mode === "custom") {
      if (current.loaded && loadedMode === "custom") {
        return characterSourceStatus(id);
      }
      let source = null;
      try {
        source = resolvePortableCharacterSource(object);
      } catch (error) {
        runtime.emit("character.animation.asset.missing", {
          characterId: id,
          assetId: storedCharacterAssetId(object),
          error: String(error?.message ?? error)
        });
      }
      source ??= customCharacterSources.get(id) ?? null;
      if (!source) {
        if (current.loaded) await characterAnimation.unload(id);
        loadedCharacterSourceModes.delete(id);
        return emitCharacterAnimationChanged(id, "custom-unavailable", {
          fallback: "original"
        });
      }
      if (current.loaded) await characterAnimation.unload(id);
      await loadCharacterVisualSource(id, source, "custom");
      return emitCharacterAnimationChanged(id, "custom-loaded");
    }

    if (current.loaded && loadedMode === "default") {
      return characterSourceStatus(id);
    }
    if (current.loaded) await characterAnimation.unload(id);
    loadedCharacterSourceModes.delete(id);
    try {
      await loadCharacterVisualSource(
        id,
        DEFAULT_CHARACTER_VISUAL_ASSET,
        "default"
      );
      return emitCharacterAnimationChanged(id, "default-loaded");
    } catch (error) {
      try {
        await characterAnimation.unload(id);
      } catch {}
      loadedCharacterSourceModes.delete(id);
      runtime.emit("character.animation.default.failed", {
        characterId: id,
        src: DEFAULT_CHARACTER_VISUAL_ASSET.src,
        error: String(error?.message ?? error)
      });
      return emitCharacterAnimationChanged(id, "default-fallback-original", {
        fallback: "original",
        error: String(error?.message ?? error)
      });
    }
  };
  const unloadCharacterVisual = async characterId => {
    const id = String(characterId ?? "").trim();
    if (!id || !characterAnimation.status(id).loaded) return false;
    await characterAnimation.unload(id);
    loadedCharacterSourceModes.delete(id);
    emitCharacterAnimationChanged(id, "session-unload");
    return true;
  };
  const retainOnlyCharacterVisual = async characterId => {
    const keepId = String(characterId ?? "").trim();
    const loaded = characterAnimation.status().characters ?? [];
    for (const id of loaded) {
      if (id !== keepId) await unloadCharacterVisual(id);
    }
    return true;
  };
  const gameEvents = new GameEventRuntime({
    executeAction: async (action, event, binding) => {
      switch (action.type) {
        case "audio.music":
          return action.clip
            ? gameAudio.playMusic(action.clip)
            : gameAudio.playMusic();
        case "audio.music.stop":
          return gameAudio.stopMusic();
        case "audio.effect":
          return gameAudio.playEffect(action.name, action.clip ?? null);
        case "character.animation": {
          const characterId = action.characterId ?? event.objectId;
          return characterAnimation.play(characterId, {
            state: action.state ?? null,
            clip: action.clip ?? null,
            loop: action.loop ?? null,
            fadeSeconds: action.fadeSeconds ?? null,
            speed: action.speed ?? 1,
            reset: action.reset !== false
          });
        }
        case "procedure": {
          const plan = await commandsRef.execute("procedure.plan.prepare", {
            name: action.name,
            parameters: action.parameters ?? {},
            seed: action.seed ?? 0
          });
          return action.commit === false
            ? plan
            : commandsRef.execute("program.plan.commit", { plan });
        }
        case "command":
          if (!commandsRef.describe().some(command =>
            command.id === action.command &&
            Boolean(command.metadata?.interactionAction)
          )) {
            throw new Error(
              `Comando não autorizado como ação: ${action.command}.`
            );
          }
          return commandsRef.execute(action.command, {
            ...(action.args ?? {}),
            interactionTargetId: binding?.objectId ?? null
          });
        default:
          throw new Error(`Unsupported game event action: ${action.type}`);
      }
    }
  });
  gameEvents.configureSource("system", {
    bindings: [
      { id: "system:game-start-music", event: "game.start", actions: [{ type: "audio.music" }] },
      { id: "system:game-stop-music", event: "game.stop", actions: [{ type: "audio.music.stop" }] },
      { id: "system:character-jump-audio", event: "character.jump", actions: [{ type: "audio.effect", name: "jump" }] },
      { id: "system:character-land-audio", event: "character.land", actions: [{ type: "audio.effect", name: "land" }] }
    ]
  });
  gameRuntime = new GameRuntime({
    surface: renderer,
    cameraController,
    events: gameEvents,
    characterAnimation,
    collisionModeForObject: objectId =>
      sandbox.getObject(objectId)?.game?.collisionMode ?? "solid"
  });
  commands
    .register(
      "character.animation.asset.load",
      async ({
        characterId = null,
        src = null,
        data = null,
        filename = null,
        bindings = {},
        visual = {},
        rootMotion = "in-place-horizontal"
      } = {}) => {
        const id = resolveCharacterId(characterId);
        if (!id) throw new Error("Selecione o objeto que receberá o personagem animado.");
        const object = sandbox.getObject(id);
        const persisted = storedCharacterVisual(object);
        const effectiveVisual = Object.freeze({
          ...(persisted ?? {}),
          ...(visual ?? {})
        });
        const source = Object.freeze({ src, data, filename });
        const status = await characterAnimation.load(
          id,
          source,
          { bindings, visual: effectiveVisual, rootMotion }
        );
        const portableAsset = data == null
          ? null
          : persistCharacterBinary({ data, filename });
        customCharacterSources.set(id, source);
        loadedCharacterSourceModes.set(id, "custom");
        sourceReconcileSuppressed.add(id);
        let changed;
        try {
          changed = sandbox.dispatch({
            type: "object.update",
            id,
            patch: {
              characterAnimation: characterSourceMetadata(
                sandbox.getObject(id),
                "custom",
                { assetId: portableAsset?.id ?? null }
              )
            },
            source: "character-animation.source"
          });
        } finally {
          sourceReconcileSuppressed.delete(id);
        }
        const sourceStatus = emitCharacterAnimationChanged(id, "asset-load", {
          changed
        });
        return Object.freeze({
          ...status,
          sourceStatus,
          changed,
          portableAssetId: portableAsset?.id ?? null,
          portable: Boolean(portableAsset)
        });
      },
      { category: "game", mutates: true, asynchronous: true, label: "Carregar personagem GLB" }
    )
    .register(
      "character.animation.configure",
      ({ characterId = null, ...config } = {}) => {
        const id = resolveCharacterId(characterId);
        if (!id) throw new Error("Selecione um personagem.");
        return characterAnimation.configure(id, config);
      },
      { category: "game", mutates: false, label: "Configurar animação do personagem" }
    )
    .register(
      "character.animation.source.status",
      ({ characterId = null } = {}) => {
        const id = resolveCharacterId(characterId);
        if (!id) throw new Error("Selecione um personagem.");
        return characterSourceStatus(id);
      },
      { category: "game", mutates: false, label: "Fonte visual do personagem" }
    )
    .register(
      "asset.portable.list",
      ({ kind = null } = {}) => portableAssetStore.listDescriptors({ kind }),
      { category: "project", mutates: false, label: "Listar assets portáteis" }
    )
    .register(
      "asset.portable.status",
      ({ assetId } = {}) => {
        const id = String(assetId ?? "").trim();
        if (!id) throw new TypeError("assetId obrigatório.");
        const record = portableAssetStore.get(id);
        if (!record) throw new Error(`Asset portátil inexistente: ${id}.`);
        return Object.freeze({
          id: record.id,
          kind: record.kind,
          metadata: Object.freeze(structuredClone(record.metadata)),
          bytes: Number(record.value?.bytes ?? record.canonicalBytes ?? 0)
        });
      },
      { category: "project", mutates: false, label: "Inspecionar asset portátil" }
    )
    .register(
      "character.animation.source.set",
      async ({ characterId = null, mode = "default" } = {}) => {
        const id = resolveCharacterId(characterId);
        if (!id) throw new Error("Selecione um personagem.");
        const normalizedMode = normalizeCharacterVisualSourceMode(mode);
        sourceReconcileSuppressed.add(id);
        let changed;
        try {
          changed = sandbox.dispatch({
            type: "object.update",
            id,
            patch: {
              characterAnimation: characterSourceMetadata(
                sandbox.getObject(id),
                normalizedMode
              )
            },
            source: "character-animation.source"
          });
        } finally {
          sourceReconcileSuppressed.delete(id);
        }
        await ensureCharacterVisual(id);
        return Object.freeze({ changed, ...characterSourceStatus(id) });
      },
      {
        category: "game",
        mutates: true,
        asynchronous: true,
        label: "Escolher fonte visual do personagem"
      }
    )
    .register(
      "character.animation.visual.configure",
      ({ characterId = null, ...visual } = {}) => {
        const id = resolveCharacterId(characterId);
        if (!id) throw new Error("Selecione um personagem.");
        const before = characterAnimation.status(id);
        if (!before.loaded) throw new Error("Carregue o visual animado do personagem primeiro.");
        const previousVisual = before.visual?.options ?? before.visualBaseline ?? {};
        let configured;
        try {
          configured = characterAnimation.configure(id, { visual });
          const canonicalVisual = configured.visual?.options ?? visual;
          const object = sandbox.getObject(id);
          const changed = sandbox.dispatch({
            type: "object.update",
            id,
            patch: {
              characterAnimation: characterVisualMetadata(object, canonicalVisual)
            },
            source: "character-animation.visual"
          });
          runtime.emit("character.animation.changed", {
            characterId: id,
            status: configured,
            reason: "visual-configure",
            changed
          });
          return Object.freeze({ ...configured, changed });
        } catch (error) {
          try {
            characterAnimation.configure(id, { visual: previousVisual });
          } catch {}
          throw error;
        }
      },
      { category: "game", mutates: true, label: "Ajustar visual do personagem" }
    )
    .register(
      "character.animation.play",
      ({ characterId = null, ...request } = {}) => {
        const id = resolveCharacterId(characterId);
        if (!id) throw new Error("Selecione um personagem.");
        return characterAnimation.play(id, request);
      },
      { category: "game", mutates: false, label: "Tocar animação do personagem" }
    )
    .register(
      "character.animation.unload",
      async ({ characterId = null } = {}) => {
        const id = resolveCharacterId(characterId);
        if (!id) throw new Error("Selecione um personagem.");
        sourceReconcileSuppressed.add(id);
        let changed;
        try {
          changed = sandbox.dispatch({
            type: "object.update",
            id,
            patch: {
              characterAnimation: characterSourceMetadata(
                sandbox.getObject(id),
                "original"
              )
            },
            source: "character-animation.source"
          });
        } finally {
          sourceReconcileSuppressed.delete(id);
        }
        const result = await characterAnimation.unload(id);
        loadedCharacterSourceModes.delete(id);
        emitCharacterAnimationChanged(id, "asset-unload", { changed });
        return Object.freeze({ ...result, changed });
      },
      { category: "game", mutates: true, asynchronous: true, label: "Remover personagem animado" }
    )
    .register(
      "character.animation.status",
      ({ characterId = null } = {}) => {
        const id = characterId == null ? resolveCharacterId(null) : characterId;
        return id ? characterAnimation.status(id) : characterAnimation.status();
      },
      { category: "game", mutates: false }
    )
    .register(
      "character.animation.clips",
      ({ characterId = null } = {}) => {
        const id = resolveCharacterId(characterId);
        if (!id) throw new Error("Selecione um personagem.");
        return characterAnimation.clips(id);
      },
      { category: "game", mutates: false }
    )
    .register(
      "data.object.create",
      ({ id = null, name = null, dataType = "record", value = {}, metadata = {} } = {}) => {
        const dataId = String(id ?? "").trim() ||
          `data-${globalThis.crypto?.randomUUID?.() ?? Date.now()}`;
        const changed = sandbox.dispatch({
          type: "data.object.create",
          id: dataId,
          name: name ?? dataId,
          dataType,
          value,
          metadata
        });
        const dataObject = sandbox.getSnapshot().dataObjects.items.find(
          item => item.id === dataId
        ) ?? null;
        return Object.freeze({ changed, dataObject });
      },
      { category: "data", mutates: true, label: "Criar DataObject" }
    )
    .register(
      "data.object.update",
      ({ id, patch = {} } = {}) => {
        const dataId = String(id ?? "").trim();
        const changed = sandbox.dispatch({
          type: "data.object.update",
          id: dataId,
          patch
        });
        const dataObject = sandbox.getSnapshot().dataObjects.items.find(
          item => item.id === dataId
        ) ?? null;
        return Object.freeze({ changed, dataObject });
      },
      { category: "data", mutates: true, label: "Atualizar DataObject" }
    )
    .register(
      "data.object.delete",
      ({ id } = {}) => Object.freeze({
        changed: sandbox.dispatch({ type: "data.object.delete", id: String(id ?? "").trim() })
      }),
      { category: "data", mutates: true, label: "Remover DataObject" }
    )
    .register(
      "data.object.list",
      () => sandbox.getSnapshot().dataObjects ?? emptyDataObjectDocument(),
      { category: "data", mutates: false, label: "Listar DataObjects" }
    )
    .register(
      "game.state.get",
      ({ dataId, path = null } = {}) => gameSessionState.get(dataId, path),
      { category: "game", mutates: false, label: "Ler estado do jogo" }
    )
    .register(
      "game.state.set",
      ({ dataId, path, value } = {}) => gameSessionState.set(dataId, path, value),
      {
        category: "game",
        mutates: false,
        label: "Definir estado do jogo",
        interactionAction: {
          label: "Definir valor do estado",
          parameters: [
            { id: "dataId", label: "DataObject", type: "text", required: true },
            { id: "path", label: "Caminho", type: "text", required: true },
            { id: "value", label: "Valor", type: "json", required: true }
          ]
        }
      }
    )
    .register(
      "game.state.increment",
      ({ dataId, path, amount = 1 } = {}) =>
        gameSessionState.increment(dataId, path, amount),
      {
        category: "game",
        mutates: false,
        label: "Incrementar estado do jogo",
        interactionAction: {
          label: "Incrementar valor do estado",
          parameters: [
            { id: "dataId", label: "DataObject", type: "text", required: true },
            { id: "path", label: "Caminho", type: "text", required: true },
            { id: "amount", label: "Incremento", type: "number", default: 1 }
          ]
        }
      }
    )
    .register(
      "game.state.toggle",
      ({ dataId, path } = {}) => gameSessionState.toggle(dataId, path),
      {
        category: "game",
        mutates: false,
        label: "Alternar estado do jogo",
        interactionAction: {
          label: "Alternar booleano do estado",
          parameters: [
            { id: "dataId", label: "DataObject", type: "text", required: true },
            { id: "path", label: "Caminho", type: "text", required: true }
          ]
        }
      }
    )
    .register(
      "game.state.reset",
      ({ dataId = null } = {}) => gameSessionState.reset(dataId),
      {
        category: "game",
        mutates: false,
        label: "Restaurar estado inicial do jogo",
        interactionAction: {
          label: "Restaurar estado inicial",
          parameters: [
            { id: "dataId", label: "DataObject (vazio = todos)", type: "text", required: false }
          ]
        }
      }
    )
    .register(
      "game.state.status",
      () => gameSessionState.snapshot(),
      { category: "game", mutates: false, label: "Estado lógico da sessão" }
    )
    .register(
      "game.start",
      async ({ characterId = null, config = {}, camera = {}, controls = {} } = {}) => {
        const selection = editor.selection.snapshot();
        const selectedId = characterId ??
          selection.activeMember?.objectId ??
          selection.members?.[0]?.objectId ??
          null;
        if (!selectedId) {
          throw new Error(
            "Selecione a geometria que será usada como personagem."
          );
        }
        await retainOnlyCharacterVisual(selectedId);
        await ensureCharacterVisual(selectedId);
        resetTransientAuthoring({ operation: "game.start" });
        commands.execute("tool.set", { mode: "navigate" });
        gameSessionState.start(sandbox.getSnapshot().dataObjects);
        try {
          return gameRuntime.start({
            characterId: selectedId,
            config,
            camera,
            controls
          });
        } catch (error) {
          gameSessionState.stop();
          throw error;
        }
      },
      {
        category: "game",
        mutates: false,
        asynchronous: true,
        label: "Iniciar modo jogo",
        interactionAction: {
          label: "Iniciar jogo com este objeto",
          defaults: { characterId: "$self" }
        }
      }
    )
    .register(
      "game.stop",
      async ({ reason = "user" } = {}) => {
        const activeId = gameRuntime.status().characterId;
        const stopped = gameRuntime.stop(reason);
        if (activeId) await unloadCharacterVisual(activeId);
        return stopped;
      },
      {
        category: "game",
        mutates: false,
        asynchronous: true,
        label: "Sair do modo jogo",
        interactionAction: { label: "Encerrar modo jogo" }
      }
    )
    .register(
      "game.input.set",
      args => gameRuntime.setInput(args),
      { category: "game", mutates: false, label: "Controlar personagem" }
    )
    .register(
      "game.respawn",
      () => gameRuntime.respawn(),
      {
        category: "game",
        mutates: false,
        label: "Reposicionar personagem",
        interactionAction: { label: "Reposicionar personagem" }
      }
    )
    .register(
      "game.config.set",
      args => gameRuntime.configure(args),
      { category: "game", mutates: false, label: "Configurar modo jogo" }
    )
    .register(
      "game.collision.debug.set",
      args => gameRuntime.setCollisionDebug(args),
      { category: "game", mutates: false, label: "Mostrar colisores" }
    )
    .register(
      "game.status",
      () => gameRuntime.status(),
      { category: "game", mutates: false, label: "Estado do modo jogo" }
    )
    .register(
      "game.audio.configure",
      args => gameAudio.configure(args),
      { category: "game", mutates: false, label: "Configurar áudio do jogo" }
    )
    .register(
      "game.audio.music.play",
      args => args && Object.keys(args).length
        ? gameAudio.playMusic(args)
        : gameAudio.playMusic(),
      {
        category: "game",
        mutates: false,
        asynchronous: true,
        interactionAction: { label: "Tocar música" }
      }
    )
    .register(
      "game.audio.music.stop",
      () => gameAudio.stopMusic(),
      {
        category: "game",
        mutates: false,
        interactionAction: { label: "Parar música" }
      }
    )
    .register(
      "game.audio.effect.play",
      ({ name, clip = null } = {}) => gameAudio.playEffect(name, clip),
      {
        category: "game",
        mutates: false,
        asynchronous: true,
        interactionAction: {
          label: "Tocar efeito sonoro",
          parameters: [{
            id: "name",
            label: "Efeito",
            type: "text",
            required: true,
            placeholder: "jump"
          }]
        }
      }
    )
    .register(
      "game.audio.status",
      () => gameAudio.status(),
      { category: "game", mutates: false }
    )
    .register(
      "game.events.configure",
      args => gameEvents.configureSource("session", args),
      { category: "game", mutates: false, label: "Configurar eventos do jogo" }
    )
    .register(
      "game.event.emit",
      ({ type, ...payload } = {}) => gameEvents.emit(type, payload),
      { category: "game", mutates: false, asynchronous: true }
    )
    .register(
      "game.events.status",
      () => gameEvents.status(),
      { category: "game", mutates: false }
    );
  commands.register(
    "path.stroke.create",
    ({
      autoFuse = true,
      fusionTolerance = null,
      ...args
    } = {}) => {
      const plan = pathTools.preparePathCreatePlan(args);
      return strokeFusion.createStroke({
        name: plan.name,
        geometry: plan.geometry,
        position: plan.position,
        color: plan.color,
        appearanceBinding: plan.appearanceBinding,
        autoFuse,
        fusionTolerance,
        source: "path-command"
      });
    },
    {
      category: "path-tools",
      mutates: true,
      repeatable: true,
      label: "Criar tubo desenhado"
    }
  );
  for (const [id, mode, label] of [
    [
      "path.sweep.points.create",
      "sweep",
      "Extrudar perfil no caminho desenhado"
    ],
    [
      "profile.extrude.points.create",
      "extrude",
      "Extrudar perfil desenhado"
    ],
    [
      "profile.revolve.points.create",
      "revolve",
      "Revolucionar perfil desenhado"
    ]
  ]) {
    commands.register(
      id,
      args => pathTools.createSketchGeometry({
        ...args,
        mode
      }),
      {
        category: "path-tools",
        mutates: true,
        repeatable: true,
        label
      }
    );
  }
  commands.register(
    "drawing.target.set",
    args => drawingTarget.set(args),
    { category: "drawing", mutates: false }
  );
  commands.register(
    "drawing.target.surface.capture",
    args => drawingTarget.set({
      ...args,
      source: "surface-selection"
    }),
    { category: "drawing", mutates: false }
  );
  commands.register(
    "drawing.target.clear",
    () => drawingTarget.clear(),
    { category: "drawing", mutates: false }
  );
  commands.register(
    "drawing.target.helper.set",
    args => drawingTarget.setHelper(args),
    { category: "drawing", mutates: false }
  );
  commands.register(
    "drawing.target.offset.set",
    ({ offset = 0 } = {}) => drawingTarget.setOffset(offset),
    { category: "drawing", mutates: false }
  );
  const setDrawingTargetEditing = enabled => {
    if (enabled) {
      if (pathSketch.active) pathSketch.cancel();
      if (planarSketch.active) planarSketch.cancel();
      toolLifecycle.cancelAction();
    }
    return drawingTarget.setEditing(enabled);
  };
  commands.register(
    "drawing.target.edit.set",
    ({ enabled = true } = {}) => setDrawingTargetEditing(Boolean(enabled)),
    { category: "drawing", mutates: false }
  );
  commands.register(
    "drawing.target.edit.toggle",
    () => setDrawingTargetEditing(!drawingTarget.status().editing),
    { category: "drawing", mutates: false }
  );
  commands.register(
    "drawing.target.gizmo.set",
    ({ mode = "translate" } = {}) => drawingTarget.setGizmoMode(mode),
    { category: "drawing", mutates: false }
  );
  commands.register(
    "selection.instances.compact",
    args => {
      viewerCoordinator.requireAuthority(
        "compactar instâncias selecionadas"
      );
      return selectionOperations.compactSelectedInstances(args);
    },
    { category: "selection", mutates: true }
  );
  commands.register(
    "selection.instances.fuse",
    args => {
      viewerCoordinator.requireAuthority(
        "fundir famílias de instâncias"
      );
      return selectionOperations.fuseSelectedFamilies(args);
    },
    { category: "selection", mutates: true }
  );
  commands.register(
    "selection.strokes.fuse",
    args => {
      viewerCoordinator.requireAuthority(
        "fundir conjuntos de traços"
      );
      return strokeFusion.fuseSelected(args);
    },
    { category: "selection", mutates: true }
  );
  commands.register(
    "stroke.compaction.configure",
    args => strokeCompaction.configure(args),
    { category: "storage", mutates: false }
  );
  commands.register(
    "stroke.compaction.run",
    ({ objectId = null } = {}) => strokeCompaction.runNow(objectId),
    { category: "storage", mutates: false }
  );
  commands.register(
    "stroke.origin.rebase",
    ({ objectId = null, targetIds = null, origin = null } = {}) => {
      viewerCoordinator.requireAuthority("recalcular origem geométrica");
      const ids = Array.isArray(targetIds) && targetIds.length
        ? [...new Set(targetIds.map(String))]
        : objectId
          ? [String(objectId)]
          : [...new Set(editor.selection.snapshot().members
              .map(member => String(member.objectId)))];
      let changed = 0;
      for (const id of ids) {
        const object = sandbox.getObject(id);
        if (!object || object.kind !== "stroke-bundle") continue;
        const geometry = object.geometry;
        const nextOrigin = Array.isArray(origin)
          ? origin
          : geometry.bounds.min.map((value, axis) =>
              value + (geometry.bounds.max[axis] - value) * 0.5
            );
        if (sandbox.dispatch({
          type: "stroke-bundle.rebase-origin",
          objectId: id,
          expectedGeometry: geometry,
          nextOrigin,
          source: "stroke.origin.rebase"
        })) changed += 1;
      }
      return Object.freeze({ changed: changed > 0, count: changed, targetIds: Object.freeze(ids) });
    },
    { category: "storage", mutates: true }
  );
  commands.register(
    "selection.anchor.set",
    ({ policy = "bounds-center", position = null, targetIds = null,
       referenceTargetId = null, referencePoint = [0, 0, 0], offset = [0, 0, 0] } = {}) => {
      viewerCoordinator.requireAuthority("alterar a política de âncora");
      const ids = Array.isArray(targetIds) && targetIds.length
        ? [...new Set(targetIds.map(String))]
        : [...new Set(editor.selection.snapshot().members
            .map(member => String(member.objectId)))];
      if (!ids.length) return Object.freeze({ changed: false, reason: "selection-empty" });
      const normalizedPolicy = String(policy).trim().toLowerCase();
      if (!["bounds-center", "origin", "custom", "pivot", "reference"].includes(normalizedPolicy)) {
        throw new RangeError(`Política de âncora desconhecida: ${normalizedPolicy}.`);
      }
      if (normalizedPolicy === "custom" &&
          (!Array.isArray(position) || position.length !== 3 ||
            !position.every(Number.isFinite))) {
        throw new TypeError("Âncora personalizada exige position [x,y,z].");
      }
      if (normalizedPolicy === "reference") {
        if (!referenceTargetId) throw new TypeError("Âncora de referência exige referenceTargetId.");
        for (const vector of [referencePoint, offset]) {
          if (!Array.isArray(vector) || vector.length !== 3 || !vector.every(Number.isFinite)) {
            throw new TypeError("Âncora de referência exige vetores 3D finitos.");
          }
        }
      }
      const changed = sandbox.dispatch({
        type: "selection.properties.set",
        targetIds: ids,
        updates: ids.map(id => ({
          id,
          patch: {
            selectionAnchorPolicy: normalizedPolicy,
            ...(normalizedPolicy === "custom"
              ? { selectionAnchorLocal: [...position], anchorRef: null }
              : normalizedPolicy === "reference"
                ? {
                    selectionAnchorLocal: null,
                    anchorRef: {
                      mode: "reference",
                      target: String(referenceTargetId),
                      point: [...referencePoint],
                      offset: [...offset]
                    }
                  }
                : { selectionAnchorLocal: null, anchorRef: null })
          }
        }))
      });
      return Object.freeze({ changed, targetIds: Object.freeze(ids), policy: normalizedPolicy });
    },
    { category: "selection", mutates: true }
  );
  commands.register(
    "appearance.selection.patch",
    args => {
      viewerCoordinator.requireAuthority("alterar a aparência da seleção");
      return appearanceBindings.patchSelection(args);
    },
    { category: "appearance", mutates: true }
  );
  commands.register(
    "appearance.object.patch",
    ({ targetIds, ...args } = {}) => {
      viewerCoordinator.requireAuthority("alterar a aparência de objetos");
      if (!Array.isArray(targetIds) || !targetIds.length) {
        throw new TypeError("appearance.object.patch exige targetIds.");
      }
      return appearanceBindings.patchSelection({ targetIds, ...args });
    },
    { category: "appearance", mutates: true }
  );
  commands.register(
    "appearance.family.color-mode.set",
    args => {
      viewerCoordinator.requireAuthority("alterar o modo de cor da família");
      return appearanceBindings.setFamilyColorMode(args);
    },
    { category: "appearance", mutates: true }
  );
  commands.register(
    "appearance.material.bind",
    ({ targetIds = null, appearanceId = undefined, materialPatch = null,
       binding = {} } = {}) => {
      viewerCoordinator.requireAuthority("vincular material à seleção");
      return appearanceBindings.patchSelection({
        targetIds,
        appearanceId,
        materialPatch,
        binding,
        source: "appearance.material.bind"
      });
    },
    { category: "appearance", mutates: true }
  );
  commands.register(
    "pivot.reference.set",
    ({ reference = "absolute" } = {}) => {
      const normalized = String(reference).toLowerCase();
      if (!["absolute", "active-relative"].includes(normalized)) {
        throw new RangeError(`Referência de pivô desconhecida: ${reference}.`);
      }
      const pivot = renderer.getSelectionPivotPosition?.();
      if (!pivot) throw new Error("Selecione um objeto para definir o pivô.");
      if (normalized === "absolute") {
        editor.setCustomPivot(pivot);
        return Object.freeze({ reference: normalized, position: [...pivot] });
      }
      const activeId = editor.selection.snapshot().activeMember?.objectId;
      const activePosition = renderer.getObjectReferencePosition?.(activeId);
      if (!activePosition) {
        throw new Error("A seleção ativa não possui origem de referência.");
      }
      const offset = pivot.map((value, index) => value - activePosition[index]);
      editor.setRelativePivot(offset);
      return Object.freeze({
        reference: normalized,
        position: [...pivot],
        offset: Object.freeze(offset)
      });
    },
    { category: "pivot", mutates: false }
  );
  toolLifecycle.attachExecute((id, args) => commands.execute(id, args));
  commands.setExecutionObserver(event => toolLifecycle.observeExecution(event));
  const requireNoMeshEdit = action => {
    if (meshEditor.active) {
      throw new Error(
        `Finalize ou cancele a edição de malha antes de ${action}.`
      );
    }
  };
  for (const command of VIEWER_CAMERA_COMMANDS) {
    commands.register(
      command,
      args => cameraController.execute(command, args),
      { category: "viewer", mutates: false }
    );
  }
  commands
    .register(
      "camera.object.create",
      args => {
        requireNoMeshEdit("criar uma câmera persistente");
        return cameraObjects.create(args);
      },
      { category: "camera-object", mutates: true }
    )
    .register(
      "camera.object.projection.set",
      ({ id, ...patch }) => {
        requireNoMeshEdit("alterar uma câmera persistente");
        return cameraObjects.updateProjection(id, patch);
      },
      { category: "camera-object", mutates: true }
    )
    .register(
      "camera.object.capture-viewer",
      ({ id }) => {
        requireNoMeshEdit("capturar o viewer em uma câmera persistente");
        return cameraObjects.captureViewer(id);
      },
      { category: "camera-object", mutates: true }
    )
    .register(
      "camera.object.default.set",
      ({ id = null } = {}) => {
        requireNoMeshEdit("alterar a câmera padrão");
        return cameraObjects.setDefault(id);
      },
      { category: "camera-object", mutates: true }
    )
    .register(
      "viewer.camera.object.activate",
      ({ id }) => cameraObjects.activate(id),
      { category: "viewer", mutates: false }
    )
    .register(
      "viewer.camera.object.deactivate",
      () => cameraObjects.deactivate(),
      { category: "viewer", mutates: false }
    )
    .register(
      "viewer.camera.helpers.set",
      args => renderer.setCameraVisualState(args),
      { category: "viewer", mutates: false }
    )
    .register(
      "animation.start",
      args => sharedAnimations.play("program", args),
      { category: "animation", mutates: false }
    )
    .register(
      "animation.preset",
      ({
        id,
        parameters = {},
        targetIds = null,
        targetMode = "selection",
        timeDomainId = "world"
      } = {}) =>
        sharedAnimations.play("preset", {
          id,
          parameters,
          targetIds,
          targetMode,
          timeDomainId
        }),
      {
        category: "animation",
        mutates: false,
        interactionAction: {
          label: "Animar este objeto com preset",
          defaults: { targetIds: ["$self"], targetMode: "objects" },
          parameters: [
            {
              id: "id",
              label: "Preset",
              type: "text",
              required: true,
              placeholder: "spin, float, pulse ou rainbow"
            },
            {
              id: "parameters",
              label: "Parâmetros opcionais",
              type: "json",
              placeholder: "{}"
            }
          ]
        }
      }
    )
    .register(
      "animation.tracks.start",
      args => sharedAnimations.play("composition", args),
      { category: "animation", mutates: false }
    )
    .register(
      "animation.pause",
      () => sharedAnimations.pause(),
      { category: "animation", mutates: false }
    )
    .register(
      "animation.resume",
      () => sharedAnimations.resume(),
      { category: "animation", mutates: false }
    )
    .register(
      "animation.stop",
      () => sharedAnimations.stop(),
      {
        category: "animation",
        mutates: false,
        interactionAction: { label: "Parar animação" }
      }
    )
    .register(
      "animation.instance.pause",
      ({ instanceId }) => animationCommands.pause({ instanceId }),
      { category: "animation", mutates: false }
    )
    .register(
      "animation.instance.resume",
      ({ instanceId }) => animationCommands.resume({ instanceId }),
      { category: "animation", mutates: false }
    )
    .register(
      "animation.instance.stop",
      ({ instanceId, reason = "user-instance" }) =>
        animationCommands.stop({ instanceId }, reason),
      { category: "animation", mutates: false }
    )
    .register(
      "animation.stop-all",
      ({ reason = "user-all" } = {}) =>
        animationCommands.stopAll(reason),
      { category: "animation", mutates: false }
    )
    .register(
      "animation.status",
      () => sharedAnimations.status(),
      { category: "animation", mutates: false }
    )
    .register(
      "animation.presets.describe",
      () => animationCommands.presets(),
      { category: "animation", mutates: false }
    )
    .register(
      "recovery.status",
      () => recoveryStatus(),
      { category: "recovery", mutates: false }
    )
    .register(
      "recovery.flush",
      () => sandboxRecovery.flush(),
      {
        category: "recovery",
        mutates: false,
        asynchronous: true
      }
    )
    .register(
      "viewer.instance.open",
      ({
        href = globalThis.location?.href,
        sandboxId: targetSandboxId = viewerCoordinator.sandboxId
      } = {}) => {
        const active = viewerDirectory.status().sessions.some(
          session => session.sandboxId === targetSandboxId
        );
        if (!active) {
          throw new Error(
            `O projeto ${targetSandboxId} não está ativo neste navegador.`
          );
        }
        return {
          changed: false,
          url: viewerCoordinator.viewerUrl(href, {
            sandboxId: targetSandboxId
          }),
          sandboxId: targetSandboxId
        };
      },
      { category: "viewer", mutates: false }
    )
    .register(
      "viewer.sessions.discover",
      ({ waitMs = 80 } = {}) =>
        viewerDirectory.discover({ waitMs }),
      {
        category: "viewer",
        mutates: false,
        asynchronous: true
      }
    )
    .register(
      "viewer.instance.sync",
      () => viewerCoordinator.requestSync(),
      { category: "viewer", mutates: false }
    )
    .register(
      "viewer.project.new-window",
      ({ href = globalThis.location?.href } = {}) => {
        const targetSandboxId = createSandboxId();
        return {
          changed: false,
          sandboxId: targetSandboxId,
          url: createIndependentProjectUrl(href, {
            sandboxId: targetSandboxId,
            mode: "new"
          })
        };
      },
      { category: "viewer", mutates: false }
    )
    .register(
      "viewer.project.open-window.prepare",
      ({ href = globalThis.location?.href } = {}) => {
        const targetSandboxId = createSandboxId();
        const launchId = `launch-${crypto.randomUUID()}`;
        return {
          changed: false,
          sandboxId: targetSandboxId,
          launchId,
          url: createIndependentProjectUrl(href, {
            sandboxId: targetSandboxId,
            mode: "open",
            launchId
          })
        };
      },
      { category: "viewer", mutates: false }
    )
    .register(
      "viewer.render.settings.set",
      settings => renderer.setViewerRenderSettings(settings),
      { category: "viewer-render", mutates: false }
    )
    .register(
      "viewer.render.settings.reset",
      () => renderer.resetViewerRenderSettings(),
      { category: "viewer-render", mutates: false }
    )
    .register(
      "viewer.render.preset.apply",
      ({ id }) => renderer.applyViewerRenderPreset(id),
      { category: "viewer-render", mutates: false }
    );

  const spatialPlanCommitService = new SpatialPlanCommitService({
    sandbox,
    editor,
    regionId: region.descriptor.id,
    geometryRegistry,
    appearanceRuntime
  });
  const cameraPlanCommitService = new CameraPlanCommitService({
    controller: cameraController,
    currentBaseVersion: () => sandbox.revision
  });
  commands.register("program.plan.commit", ({ plan }) => {
    requireNoMeshEdit("confirmar um plano");
    const planCommands = Array.isArray(plan?.commands)
      ? plan.commands
      : [];
    const hasCamera = planCommands.some(intent =>
      CAMERA_PLAN_COMMANDS.includes(intent?.command)
    );
    const hasSpatial = planCommands.some(intent =>
      intent?.command === SPATIAL_CREATE_COMMAND
    );
    if (hasCamera && hasSpatial) {
      throw new Error(
        "Um plano não pode misturar câmera local e mutações espaciais."
      );
    }
    if (hasSpatial) {
      viewerCoordinator.requireAuthority(
        "confirmar um plano espacial"
      );
    }
    const result = hasCamera
      ? cameraPlanCommitService.commit(plan)
      : spatialPlanCommitService.commit(plan);
    if (!hasCamera) strokeCompaction.checkpoint("approve");
    return result;
  });

  const programSession = new ProgramSessionController({
    workerFactory: () => createBrowserProgramSessionWorker(),
    timeoutMs: 5000,
    allowedCommands: [
      SPATIAL_CREATE_COMMAND,
      ...CAMERA_PLAN_COMMANDS
    ],
    geometryTypes: geometryRegistry.list(),
    maxCommands: 10000
  });
  const procedureCatalog = new ProcedureCatalog({
    storage: new BrowserProcedureCatalogStore()
  });
  const animationProcedurePrograms = new ProgramSessionController({
    workerFactory: () => createBrowserProgramSessionWorker(),
    timeoutMs: 5000,
    allowedCommands: [],
    geometryTypes: geometryRegistry.list(),
    maxCommands: 1
  });
  const animationProcedures = new AnimationProcedureService({
    catalog: procedureCatalog,
    programs: animationProcedurePrograms,
    selection: () => editor.selection.snapshot()
  });
  commands.register(
    "animation.procedure",
    async args => {
      const descriptor = await animationProcedures.resolve(args);
      return sharedAnimations.play(descriptor.kind, descriptor.args);
    },
    {
      category: "animation",
      mutates: false,
      asynchronous: true
    }
  );
  commands.register(
    "animation.procedures.describe",
    () => animationProcedures.describe(),
    { category: "animation", mutates: false }
  );
  commands.register(
    "procedure.plan.prepare",
    ({ name, parameters = {}, seed = 0 } = {}) =>
      programSession.run({
        runId: `procedure-ui-${crypto.randomUUID()}`,
        baseVersion: sandbox.revision,
        seed,
        source: procedureCatalog.invocationSource(name, parameters),
        mode: "program"
      }),
    {
      category: "procedures",
      mutates: false,
      asynchronous: true
    }
  );
  const experimentProgramSession = new ProgramSessionController({
    workerFactory: () => createBrowserProgramSessionWorker(),
    timeoutMs: 5000,
    allowedCommands: [SPATIAL_CREATE_COMMAND],
    geometryTypes: geometryRegistry.list(),
    maxCommands: 10000
  });
  const experimentService = new ExperimentService({
    registry: experimentRegistry,
    programs: experimentProgramSession,
    baseVersion: () => sandbox.revision
  });
  const experimentActionService = new ExperimentActionService({
    experiments: experimentService,
    commit: plan => spatialPlanCommitService.commit(plan)
  });
  commands.register(
    "experiment.create",
    ({ id, parameters = {} }) => {
      requireNoMeshEdit("confirmar um experimento espacial");
      viewerCoordinator.requireAuthority(
        "confirmar um experimento espacial"
      );
      return experimentActionService.create(id, parameters);
    },
    {
      category: "experiments",
      mutates: true,
      asynchronous: true
    }
  );
  commands.register(
    "experiment.plan",
    ({ id, parameters = {} }) =>
      experimentService.plan(id, parameters),
    {
      category: "experiments",
      mutates: false,
      asynchronous: true
    }
  );

  commands.register("runtime.api.noop", ({ value = null } = {}) => value);
  commands.register(
    "time.domain.create",
    args => {
      const domain = timeDomains.create(args);
      rescheduleTemporalRuntime(true);
      return Object.freeze({ changed: true, domain });
    },
    { category: "time", mutates: false }
  );
  commands.register(
    "time.domain.delete",
    ({ id }) => {
      const changed = timeDomains.delete(id);
      rescheduleTemporalRuntime(changed);
      return Object.freeze({ changed });
    },
    { category: "time", mutates: false }
  );
  commands.register(
    "time.domain.rate.set",
    ({ id = "world", rate }) =>
      updateTemporalDomain(id, () => timeDomains.setRate(id, rate)),
    { category: "time", mutates: false }
  );
  commands.register(
    "time.domain.pause",
    ({ id = "world" } = {}) =>
      updateTemporalDomain(id, () => timeDomains.pause(id)),
    { category: "time", mutates: false }
  );
  commands.register(
    "time.domain.resume",
    ({ id = "world" } = {}) =>
      updateTemporalDomain(id, () => timeDomains.resume(id)),
    { category: "time", mutates: false }
  );
  commands.register(
    "time.domain.seek",
    ({ id = "world", localTime }) =>
      updateTemporalDomain(id, () => timeDomains.seek(id, localTime)),
    { category: "time", mutates: false }
  );
  commands.register(
    "time.domain.parent.set",
    ({ id, parentId = "world" }) =>
      updateTemporalDomain(id, () => timeDomains.setParent(id, parentId)),
    { category: "time", mutates: false }
  );
  commands.register(
    "time.target.assign",
    ({ targetId, domainId = "world" }) => {
      const changed = timeDomains.assignTarget(targetId, domainId);
      rescheduleTemporalRuntime(changed);
      return Object.freeze({
        changed,
        targetId: String(targetId),
        domainId: timeDomains.domainForTarget(targetId)
      });
    },
    { category: "time", mutates: false }
  );
  commands.register(
    "time.dependency.bump",
    ({ id }) => Object.freeze({
      changed: true,
      dependencyId: String(id),
      version: temporalRuntime.bumpDependency(id)
    }),
    { category: "time", mutates: false }
  );
  commands.register(
    "time.operation.wake",
    ({ id }) => Object.freeze({
      changed: temporalRuntime.wake(id),
      operation: temporalRuntime.describe(id)
    }),
    { category: "time", mutates: false }
  );
  commands.register(
    "time.operation.enable",
    ({ id, enabled = true }) => Object.freeze({
      changed: temporalRuntime.enable(id, enabled),
      operation: temporalRuntime.describe(id)
    }),
    { category: "time", mutates: false }
  );
  commands.register(
    "time.operation.domain.set",
    ({ id, domainId = "world" }) => Object.freeze({
      changed: temporalRuntime.setTimeDomain(id, domainId),
      operation: temporalRuntime.describe(id)
    }),
    { category: "time", mutates: false }
  );
  commands.register(
    "time.execution.retry",
    () => Object.freeze({ changed: temporalExecution?.resetFault() ?? false }),
    { category: "time", mutates: false }
  );

  const interactionService = new SelectionInteractionService({
    selection: editor.selection,
    sandbox,
    occurrenceResolver,
    commands
  });
  const synchronizeDocumentInteractions = () =>
    gameEvents.configureSource("document", {
      bindings: interactionService.runtimeBindings()
    });
  synchronizeDocumentInteractions();
  const unsubscribeInteractions = sandbox.subscribe((_snapshot, changes) => {
    const list = Array.isArray(changes) ? changes : [];
    if (
      !list.length ||
      list.some(change =>
        change?.type === "interaction-bindings-changed" ||
        change?.type === "object-deleted" ||
        ![
          "object-created",
          "object-transform",
          "object-updated"
        ].includes(change?.type)
      )
    ) {
      synchronizeDocumentInteractions();
    }
  });
  commands
    .register(
      "selection.interactions.add",
      args => interactionService.add(args),
      {
        category: "interactions",
        mutates: true,
        label: "Adicionar evento e ação"
      }
    )
    .register(
      "selection.interactions.remove",
      args => interactionService.remove(args),
      {
        category: "interactions",
        mutates: true,
        label: "Remover evento e ação"
      }
    )
    .register(
      "selection.interactions.enabled.set",
      args => interactionService.setEnabled(args),
      {
        category: "interactions",
        mutates: true,
        label: "Ativar ou desativar comportamento"
      }
    )
    .register(
      "interaction.event.emit",
      ({ type, ...payload } = {}) => gameEvents.emit(type, payload),
      {
        category: "interactions",
        mutates: false,
        asynchronous: true,
        label: "Emitir evento de interação"
      }
    );

  const queries = new RuntimeQueryRegistry();
  queries
    .register("game.status", () => gameRuntime.status())
    .register("game.state.status", () => gameSessionState.snapshot())
    .register("interaction.catalog.describe", () =>
      interactionService.describeCatalog()
    )
    .register("selection.interactions.inspect", () =>
      interactionService.inspectSelection()
    )
    .register("interaction.status", () => gameEvents.status())
    .register("character.animation.status", () => characterAnimation.status())
    .register("character.animation.version", () => CHARACTER_ANIMATION_VERSION)
    .register("time.status", () => temporalRuntime.status())
    .register("instance.graph.status", () =>
      instanceGraphDiagnostics(sandbox.getSnapshot())
    )
    .register("instance.occurrence", ({ id } = {}) => {
      const resolved = occurrenceResolver.resolve(id);
      if (!resolved) return null;
      return Object.freeze({
        ...resolved,
        object: occurrenceResolver.object(id)
      });
    })
    .register("occurrence.runtime.status", () => occurrenceResolver.status())
    .register("transform.hierarchy.status", () => transformHierarchy.status())
    .register("render.replica.status", () => renderer.getReplicaDiagnostics())
    .register("complexity.status", () => complexityReporter.status())
    .register("time.domains", () => timeDomains.list())
    .register("time.domain", ({ id = "world" } = {}) =>
      timeDomains.snapshot(id)
    )
    .register("time.target.domain", ({ targetId }) => Object.freeze({
      targetId: String(targetId),
      domainId: timeDomains.domainForTarget(targetId)
    }))
    .register("time.operation", ({ id }) => temporalRuntime.describe(id))
    .register("time.execution", () => temporalExecution?.status() ?? null)
    .register("time.render-demand", () =>
      renderer.getRenderDemandDiagnostics()
    );
  const events = new RuntimeEvents();
  const capabilities = new RuntimeCapabilities();
  let uiDiagnosticsProvider = () => Object.freeze({
    connected: false,
    profile: profile.id
  });
  const connectUiDiagnostics = provider => {
    if (typeof provider !== "function") {
      throw new TypeError("Diagnóstico de UI exige um provedor.");
    }
    uiDiagnosticsProvider = provider;
    return () => {
      if (uiDiagnosticsProvider === provider) {
        uiDiagnosticsProvider = () => Object.freeze({
          connected: false,
          profile: profile.id
        });
      }
    };
  };

  const runtime = new SpatialSeedRuntime({
    commands,
    queries,
    events,
    capabilities
  });
  const unsubscribeGame = gameRuntime.subscribe(
    (snapshot, event) => {
      runtime.emit("game.changed", { snapshot, event });
      if (event?.type === "stopped") {
        globalThis.queueMicrotask?.(() => gameSessionState.stop()) ??
          gameSessionState.stop();
      }
    }
  );
  runtime
    .onDispose(unsubscribeGame)
    .onDispose(() => gameRuntime.dispose());
  temporalExecution = new TemporalExecutionController({
    runtime: temporalRuntime,
    surface: renderer,
    snapshot: () => commandSandbox.getSnapshot(),
    apply: cycle => {
      let applied = 0;
      for (const change of cycle.changes) {
        const command = change?.command ?? change;
        if (!command || typeof command !== "object" ||
            typeof command.type !== "string") {
          throw new TypeError(
            "Mudança temporal deve ser um comando ou { command }."
          );
        }
        if (dispatchRuntimeCommand(command)) applied += 1;
      }
      return Object.freeze({ changed: applied > 0, applied });
    },
    publishEvents: temporalEvents => {
      const animationOutcome = animationRuntime.consumeTemporalEvents(
        temporalEvents
      );
      for (const event of temporalEvents) {
        const type = String(event?.type ?? "time.event");
        if (type === "animation.overlay.frame") continue;
        runtime.emit(type, event?.payload ?? event);
      }
      return temporalEvents.length;
    },
    onError: error => animationRuntime.fault(error)
  });
  runtime.onDispose(() => temporalExecution.dispose());
  const toolCapabilities = createDefaultToolCapabilityFacade({
    editContext,
    registry: toolRegistry,
    parameters: toolParameters,
    lifecycle: toolLifecycle,
    drawingTarget,
    execute: (id, args) => commands.execute(id, args)
  });
  toolWorkspace = new ToolWorkspaceController({
    facade: toolCapabilities,
    selection: () => editor.selection.snapshot(),
    references: () => pathTools.listReferences({ includeSelection: true })
  });
  installToolCapabilityRuntime({
    commands,
    queries,
    facade: toolCapabilities,
    workspace: toolWorkspace
  });
  const unsubscribeToolCapabilities = toolCapabilities.subscribe(
    snapshot => runtime.emit("authoring.tools.changed", snapshot)
  );
  const unsubscribeToolWorkspace = toolWorkspace.subscribe(
    snapshot => runtime.emit("authoring.tool.workspace.changed", snapshot)
  );
  runtime
    .onDispose(() => toolCapabilities.dispose())
    .onDispose(() => toolWorkspace.dispose())
    .onDispose(unsubscribeToolCapabilities)
    .onDispose(unsubscribeToolWorkspace)
    .onDispose(() => sharedAnimations.dispose())
    .onDispose(() => animationProcedurePrograms.dispose())
    .onDispose(() => animationRuntime.dispose());

  // Painéis e HUDs podem consultar a seleção durante a própria construção.
  // Registre estas queries fundamentais antes de instanciar qualquer UI.
  commands.register(
    "resource.property.set",
    ({
      path,
      property = null,
      value,
      expectedRevision = null
    } = {}) => {
      viewerCoordinator.requireAuthority("editar recurso");
      const reference = parseResourcePath(path);
      if (!reference?.ownerObjectId) {
        throw new TypeError("Caminho de recurso inválido.");
      }
      if (expectedRevision !== null &&
          Number(expectedRevision) !== Number(sandbox.revision)) {
        return Object.freeze({
          changed: false,
          reason: "revision-conflict",
          expectedRevision: Number(expectedRevision),
          actualRevision: Number(sandbox.revision)
        });
      }
      const object = sandbox.getObject(reference.ownerObjectId);
      if (!object) {
        return Object.freeze({ changed: false, reason: "object-not-found" });
      }

      if (reference.kind === "object") {
        const key = String(property ?? "name").trim();
        if (key === "parentId") {
          const parentId = normalizeResourceParentId(value);
          const changed = sandbox.dispatch({
            type: "hierarchy.reparent",
            id: object.id,
            parentId
          });
          return Object.freeze({
            changed,
            path: reference.path,
            property: key,
            parentId
          });
        }
        const patch = resourceObjectPatch(key, value);
        const changed = sandbox.dispatch({
          type: "object.update",
          id: object.id,
          patch
        });
        return Object.freeze({ changed, path: reference.path, property: key });
      }

      if (reference.kind === "vertex" && reference.strokeId) {
        const key = String(property ?? "position").trim();
        if (key !== "position") {
          throw new RangeError("Vértices de traço aceitam apenas position.");
        }
        const replaced = replaceStrokePointInBundle(
          object.geometry,
          reference.strokeId,
          reference.vertexIndex,
          normalizedResourceVector(value, "posição do vértice")
        );
        if (!replaced.changed) {
          return Object.freeze({ changed: false, path: reference.path });
        }
        const changed = sandbox.dispatch({
          type: "object.update",
          id: object.id,
          patch: { geometry: replaced.bundle }
        });
        return Object.freeze({
          changed,
          path: reference.path,
          property: key
        });
      }

      return Object.freeze({
        changed: false,
        reason: "resource-read-only",
        path: reference.path,
        kind: reference.kind
      });
    },
    { category: "resources", mutates: true }
  );

  resourceEditHandler = ({ path, reference, readValue }) => {
    if (typeof globalThis.prompt !== "function") return false;
    if (reference?.kind === "object") {
      const current = readValue("name") ?? "";
      const value = globalThis.prompt("Nome do objeto", String(current));
      if (value === null) return false;
      return commands.execute("resource.property.set", {
        path,
        property: "name",
        value,
        expectedRevision: sandbox.revision
      });
    }
    if (reference?.kind === "vertex" && reference.strokeId) {
      const current = readValue(null);
      const value = globalThis.prompt(
        "Posição local do vértice [x,y,z]",
        JSON.stringify(current)
      );
      if (value === null) return false;
      return commands.execute("resource.property.set", {
        path,
        property: "position",
        value: JSON.parse(value),
        expectedRevision: sandbox.revision
      });
    }
    globalThis.alert?.("Este recurso é somente leitura nesta versão.");
    return false;
  };

  queries
    .register("selection.snapshot", () =>
      editor.selection.snapshot()
    )
    .register("history.status", () => Object.freeze({
      canUndo: Boolean(sandbox.canUndo),
      canRedo: Boolean(sandbox.canRedo)
    }))
    .register("procedure.catalog.ui.describe", () =>
      procedureCatalog.describeUi()
    )
    .register("properties.describe", () =>
      propertyRegistry.describe()
    )
    .register("selection.properties.inspect", ({
      targetScope = "selection"
    } = {}) =>
      propertyService.inspectSelection({ targetScope })
    )
    .register("selection.properties.clipboard.inspect", () =>
      propertyClipboard.inspect()
    )
    .register("selection.properties.clipboard.preview", ({
      properties = null,
      targetScope = "selection"
    } = {}) => propertyClipboard.preview({ properties, targetScope }))
    .register("selection.properties.transfer.describe", () =>
      propertyClipboard.describe()
    )
    .register("selection.appearance.inspect", ({
      targetIds = null
    } = {}) =>
      appearanceBindings.inspectSelection({ targetIds })
    )
    .register("selection.actions.describe", () => {
      const selected = editor.selection.snapshot().members
        .map(member => sandbox.getObject?.(member.objectId))
        .filter(Boolean);
      return Object.freeze({
        canGroup: selected.length > 0,
        canUngroup: selectionOperations.canUngroup(),
        canFuseFamilies:
          selected.filter(object => object.kind === "instance-family").length >= 2,
        canFuseStrokes:
          selected.filter(object => object.kind === "stroke-bundle").length >= 2
      });
    })
    .register("stroke.fusion.status", () =>
      strokeFusion.status()
    )
    .register("resource.tree.describe", ({ path = "/" } = {}) =>
      resourceTree.describe(path) ?? resourceTree.root()
    )
    .register("resource.tree.children", ({
      path = "/",
      offset = 0,
      cursor = null,
      limit = 100
    } = {}) => resourceTree.listChildren(path, { offset, cursor, limit }))
    .register("resource.tree.value", ({ path, property = null } = {}) =>
      resourceTree.readValue(path, property)
    )
    .register("resource.tree.status", () => resourceTree.status())
    .register("resource.search", ({ query = "", limit = 80 } = {}) =>
      resourceSearch.search(query, { limit })
    )
    .register("resource.search.status", () => resourceSearch.status())
    .register("stroke.compaction.status", () => strokeCompaction.status())
    .register("selection.anchor.status", () => {
      const members = editor.selection.snapshot().members;
      return Object.freeze({
        members: Object.freeze(members.map(member => {
          const object = sandbox.getObject(member.objectId);
          return Object.freeze({
            objectId: String(member.objectId),
            policy: String(
              object?.selectionAnchorPolicy ??
              object?.geometry?.selectionAnchorPolicy ??
              ((object?.kind === "instance-family" ||
                object?.kind === "stroke-bundle" ||
                object?.geometry?.type === "stroke-bundle")
                ? "bounds-center"
                : "pivot")
            ),
            position: object?.selectionAnchorLocal ??
              object?.geometry?.selectionAnchorLocal ?? null,
            reference: object?.anchorRef ?? object?.geometry?.anchorRef ?? null
          });
        }))
      });
    })
    .register("experiments.describe", () =>
      experimentService.list()
    )
    .register("experiment.describe", ({ id }) =>
      experimentService.describe(id)
    )
    .register("animation.status", () =>
      sharedAnimations.status()
    )
    .register("animation.presets.describe", () =>
      animationCommands.presets()
    )
    .register("animation.procedures.describe", () =>
      animationProcedures.describe()
    )
    .register("runtime.profile", () => profile)
    .register("viewer.camera.snapshot", () =>
      cameraController.snapshot()
    )
    .register("camera.objects.list", () =>
      cameraObjects.list()
    )
    .register("camera.objects.diagnostics", () => ({
      service: cameraObjects.diagnostics(),
      visual: renderer.getCameraVisualState(),
      transformPreview: transformPreviews.status(),
      sandbox: sandbox.getHistoryDiagnostics().performance,
      coordination: viewerCoordinator.status().performance,
      recovery: recoveryStatus().performance ?? null
    }))
    .register("viewer.camera.helpers", () =>
      renderer.getCameraVisualState()
    )
    .register("viewer.render.settings", () =>
      renderer.getViewerRenderSettings()
    )
    .register("viewer.render.presets", () =>
      renderer.getViewerRenderPresets()
    )
    .register("mesh.edit.status", () =>
      meshEditor.status()
    )
    .register("mesh.path.status", () =>
      meshPathGesture.status()
    )
    .register("mesh.operators.contracts", () =>
      listMeshOperatorContracts()
    )
    .register("mesh.exchange.formats", () =>
      meshExchange.formats()
    )
    .register("scene.objects.list", () =>
      sandbox.getSnapshot().objects
    )
    .register("scene.object.get", ({ id } = {}) =>
      id === undefined || id === null
        ? null
        : sandbox.getObject?.(id) ??
          sandbox.getSnapshot().objects.find(
            object => String(object.id) === String(id)
          ) ??
          null
    )
    .register("geometry.catalog", () =>
      geometryRegistry.describe()
    )
    .register("geometry.descriptor.normalize", ({ geometry } = {}) =>
      geometryRegistry.normalize(geometry)
    )
    .register("path.references.list", args =>
      pathTools.listReferences(args)
    )
    .register("path.reference.inspect", args =>
      pathTools.inspect(args)
    )
    .register("path.sketch.status", () =>
      pathSketch.status()
    )
    .register("path.sketch.transients", ({ scanScene = true } = {}) =>
      pathSketch.transientStatus({ scanScene })
    )
    .register("drawing.target.status", () =>
      drawingTarget.status()
    )
    .register("planar.sketch.status", () =>
      planarSketch.status()
    )
    .register("object.placement.status", () =>
      objectPlacement.status()
    )
    .register("measurement.status", () =>
      measurement.status()
    )
    .register("edit.tool.status", () =>
      toolLifecycle.status()
    )
    .register("edit.tools.describe", ({ toolId = null } = {}) =>
      toolRegistry.describe(toolId)
    )
    .register("edit.tool.parameters.get", ({ toolId = null } = {}) => {
      const resolvedToolId =
        toolId ??
        toolParameters.status().activeToolId ??
        "path.sketch";
      return Object.freeze({
        toolId: resolvedToolId,
        values: toolParameters.values(resolvedToolId)
      });
    })
    .register("edit.tool.parameters.status", () =>
      toolParameters.status()
    )
    .register("viewer.transform.settings", () =>
      renderer.getTransformConfig()
    )
    .register("viewer.transform.diagnostics", () =>
      renderer.getTransformDiagnostics()
    )
    .register("edit.context.status", () =>
      editContext.status()
    )
    .register("viewer.instances.status", () =>
      viewerCoordinator.status()
    )
    .register("performance.locality.diagnostics", () => {
      const state = baseSandbox.getSnapshot();
      let familyObjects = 0;
      let familyInstances = 0;
      let packedTransformBytes = 0;
      for (const object of state.objects) {
        if (object.kind !== "instance-family") continue;
        familyObjects += 1;
        familyInstances += Number(object.family?.count ?? 0);
        packedTransformBytes +=
          (object.family?.positions?.length ?? 0) * 4 +
          (object.family?.rotations?.length ?? 0) * 4 +
          (object.family?.scales?.length ?? 0) * 4 +
          (object.family?.colors?.length ?? 0) * 4;
      }
      return Object.freeze({
        revision: baseSandbox.revision,
        logicalObjects: state.objects.length,
        familyObjects,
        familyInstances,
        packedTransformBytes,
        sandbox: baseSandbox.getHistoryDiagnostics(),
        coordination: viewerCoordinator.status().performance,
        renderer: renderer.getIncrementalDiagnostics(),
        sceneProjection: sceneProjection.status(),
        pathSketch: pathSketch.status(),
        pathTools: pathTools.getLocalityDiagnostics?.() ?? null,
        selectionOperations:
          selectionOperations.getLocalityDiagnostics?.() ?? null,
        occurrenceRuntime: occurrenceResolver.status(),
        complexity: complexityReporter.status(),
        sets: Object.freeze({
          sceneObjects: state.objects.length,
          sandboxSubscribers:
            baseSandbox.getHistoryDiagnostics().subscriberCount,
          rendererLogicalProxies:
            renderer.getResourceDiagnostics?.().logicalProxies ?? null,
          rendererBatches:
            renderer.getResourceDiagnostics?.().batches?.batches ?? null,
          queuedStrokes: pathSketch.status().queuedCommits,
          pendingStrokePublications:
            pathSketch.status().pendingPublications,
          familyBuildQueue:
            renderer.getIncrementalDiagnostics().familyBuildQueue
        }),
        accounting: Object.freeze({
          gestureEnd: "O pointerup sela o capsule; preparação e despacho são fases separadas e continuam com orçamento durante gestos subsequentes.",
          undoRedo: "Deltas inversos são compactados antes da projeção; create+delete pendentes são eliminados sem construir recursos visuais.",
          toolChange: "Captura de fonte selecionada ainda constrói HierarchyIndex uma vez por revisão; previews posteriores usam cápsula S, não a cena N.",
          selection: "Clique consulta o índice espacial e faz raycast exato apenas nos candidatos; seleção em área reconstrói o índice de tela somente quando câmera ou cena invalidam o cache."
        })
      });
    })
    .register("viewer.sessions.status", () =>
      viewerDirectory.status()
    )
    .register("runtime.ui-stats", () => uiDiagnosticsProvider());

  const objectInspector = new ObjectInspector({
    root: inspectorRoot,
    editor,
    sandbox,
    occurrenceResolver,
    query: (id, args) => runtime.query(id, args),
    execute: (id, args) => runtime.execute(id, args)
  });
  runtime.onDispose(() => objectInspector.dispose());
  const geometryCreationPanel = new GeometryCreationPanel({
    root: geometryCreationRoot,
    geometryRegistry,
    query: (id, args) => runtime.query(id, args),
    execute: (id, args) => runtime.execute(id, args)
  });
  runtime.onDispose(() => geometryCreationPanel.dispose());
  const experimentPanel = new ExperimentPanel({
    root: experimentPanelRoot,
    query: (id, args) => runtime.query(id, args),
    execute: (id, args) => runtime.execute(id, args)
  });
  runtime.onDispose(() => experimentPanel.dispose());
  const animationPanel = new AnimationPanel({
    root: animationPanelRoot,
    query: (id, args) => runtime.query(id, args),
    execute: (id, args) => runtime.execute(id, args),
    subscribe: listener => sharedAnimations.subscribe(listener)
  });
  runtime.onDispose(() => animationPanel.dispose());
  const viewerRenderPanel = new ViewerRenderPanel({
    root: viewerRenderPanelRoot,
    query: (id, args) => runtime.query(id, args),
    execute: (id, args) => runtime.execute(id, args),
    storageKey:
      uiConfiguration?.presentation?.viewerRender?.storageKey ??
      "spatialseed.viewer.render.v1"
  });
  runtime.onDispose(() => viewerRenderPanel.dispose());
  const meshEditPanel = new MeshEditPanel({
    root: meshEditPanelRoot,
    query: (id, args) => runtime.query(id, args),
    execute: (id, args) => runtime.execute(id, args),
    subscribe: listener => meshEditor.subscribe(listener),
    subscribeContext: listener => editContext.subscribe(listener),
    subscribeSketch: listener => pathSketch.subscribe(listener),
    subscribePlanarSketch: listener => planarSketch.subscribe(listener),
    subscribeToolParameters: listener => toolParameters.subscribe(listener),
    subscribeToolWorkspace: listener => toolWorkspace.subscribe(listener)
  });
  const editHud = new EditHud({
    root: editHudRoot,
    query: (id, args) => runtime.query(id, args),
    execute: (id, args) => runtime.execute(id, args),
    subscribe: listener => {
      const unsubscribeContext = editContext.subscribe(listener);
      const unsubscribeToolParameters = toolParameters.subscribe(() =>
        listener(editContext.status())
      );
      const unsubscribeDrawingTarget = drawingTarget.subscribe(() =>
        listener(editContext.status())
      );
      return () => {
        unsubscribeContext();
        unsubscribeToolParameters();
        unsubscribeDrawingTarget();
      };
    },
    subscribeHistory: listener => sandbox.subscribe(() => listener()),
    subscribeTools: listener => toolCapabilities.subscribe(listener)
  });
  runtime.onDispose(() => renderer.disposeToolGestureNavigation());
  runtime.onDispose(() => renderer.disposeGameCollisionDebug());
  runtime.onDispose(() => editHud.dispose());
  runtime.onDispose(unsubscribeDrawingTargetTools);
  runtime.onDispose(() => drawingTarget.dispose());
  runtime.onDispose(() => objectPlacement.dispose());
  runtime.onDispose(() => selectionOperations.dispose());
  runtime.onDispose(() => toolParameters.dispose());
  runtime.onDispose(() => toolLifecycle.dispose());
  runtime.onDispose(() => pathSketch.dispose());
  runtime.onDispose(() => planarSketch.dispose());
  runtime.onDispose(() => measurement.dispose());
  runtime.onDispose(() => meshEditPanel.dispose());
  runtime.onDispose(() => meshPathGesture.dispose());
  runtime.onDispose(() => editContext.dispose());
  runtime.onDispose(() => meshEditor.dispose());

  const procedureCatalogEditor = new ProcedureCatalogEditor({
    root: procedureEditorRoot,
    catalog: procedureCatalog
  });
  const procedureCatalogUiPanel = new ProcedureCatalogUiPanel({
    root: procedureCatalogUiRoot,
    catalog: procedureCatalog,
    query: (id, args) => runtime.query(id, args),
    execute: (id, args) => runtime.execute(id, args)
  });
  runtime.onDispose(() => procedureCatalogEditor.dispose());
  runtime.onDispose(() => procedureCatalogUiPanel.dispose());
  runtime.onDispose(() => programSession.dispose());
  runtime.onDispose(() => experimentProgramSession.dispose());
  runtime.onDispose(() => cameraController.dispose());
  runtime.onDispose(() => cameraObjects.dispose());

  const devConsole = new DevConsole({
    editor,
    sandbox,
    region,
    renderer,
    getDiagnostics: () =>
      runtime.query("developer.state"),
    onOutput: onConsoleOutput,
    commands: {
      execute: (id, args) => runtime.execute(id, args),
      describe: () => runtime.capabilities().commands
    },
    geometryRegistry,
    queries: {
      execute: (id, args) => runtime.query(id, args)
    },
    programs: programSession,
    procedures: procedureCatalog,
    experiments: experimentService
  });

  queries
    .register("world.snapshot", () =>
      sandbox.getState()
    )
    .register("editor.snapshot", () =>
      editor.snapshot()
    )
    .register("runtime.status", () => ({
      build: buildInfo.build,
      version: buildInfo.version,
      channel: buildInfo.channel,
      regionVersion: region.version,
      baseVersion: sandbox.baseVersion,
      sandboxRevision: sandbox.revision,
      dirty: sandbox.dirty,
      canUndo: sandbox.canUndo,
      canRedo: sandbox.canRedo,
      objectCount: sandbox.objectCount
    }))
    .register("recovery.status", () =>
      recoveryStatus()
    )
    .register("developer.state", () => ({
      build: buildInfo.build,
      version: buildInfo.version,
      channel: buildInfo.channel,
      selection: editor.selection.snapshot(),
      editor: editor.snapshot(),
      viewer: viewer.snapshot(),
      camera: cameraController.snapshot(),
      game: gameRuntime.status(),
      input: renderer.getInputDiagnostics(),
      transform: {
        mode: renderer.transform?.mode ?? null,
        space: renderer.transform?.space ?? null,
        axis: renderer.transform?.axis ?? null,
        dragging: renderer.transform?.dragging ?? false
      },
      sandbox: {
        baseVersion: sandbox.baseVersion,
        dirty: sandbox.dirty,
        canUndo: sandbox.canUndo,
        canRedo: sandbox.canRedo,
        objectCount: sandbox.objectCount
      },
      recovery: recoveryStatus(),
      viewers: viewerCoordinator.status(),
      viewerSessions: viewerDirectory.status(),
      transformPreview: transformPreviews.status(),
      renderer: {
        render: renderer.renderer?.info?.render ?? null,
        viewerSettings: renderer.getViewerRenderSettings()
      },
      appearance: appearanceRuntime.stats(),
      incremental: renderer.getIncrementalDiagnostics(),
      runtimeApi: {
        version: SpatialSeedRuntime.apiVersion,
        metrics: runtime.metrics()
      }
    }))
    .register("runtime.performance", () => runtime.metrics());

  capabilities
    .register("game", () => ({
      apiVersion: GAME_RUNTIME_VERSION,
      scope: "local-viewer",
      persistence: "ephemeral",
      characterSource: "selected-scene-object",
      characterBody: "oriented-local-box-conservative-world-aabb",
      collisionShape: "static-world-colliders",
      collisionWorld: "static-renderable-objects",
      gravity: true,
      jumping: true,
      characterAnimationStates: ["idle", "walk", "jump", "fall"],
      camera: "third-person-damped-follow"
    }))
    .register("authoringTools", () => ({
      ...toolCapabilities.capabilities(),
      workspaceApiVersion: ToolWorkspaceController.apiVersion,
      focus: "authoring.tool.focus",
      inputBindings: [
        "authoring.tool.input.bind",
        "authoring.tool.input.use-selection",
        "authoring.tool.input.clear"
      ],
      workspaceQuery: "authoring.tool.workspace"
    }))
    .register("recovery", () => ({
      apiVersion: SandboxRecoveryController.apiVersion,
      storeApiVersion: IndexedDbRecoveryStore.apiVersion,
      identityApiVersion: BrowserSandboxIdentity.apiVersion,
      mode: "indexeddb-command-journal",
      portable: false
    }))
    .register("viewerRendering", () => ({
      apiVersion: "viewer-render-settings-v1",
      scope: "local-viewer",
      shadows: true,
      environment: "pmrem-procedural",
      materialModels: ["standard", "physical"],
      opticalEffects: ["transmission", "dispersion", "iridescence"]
    }))
    .register("appearanceBinding", () => ({
      apiVersion: AppearanceBindingService.apiVersion,
      colorModes: ["inherit", "uniform", "per-instance"],
      materialModes: ["inherit", "unlit", "standard", "physical"],
      uniformFamilyEdit: "constant-time",
      perInstanceTint: "constant-time",
      persistence: "scene-object"
    }))
    .register("pathReferences", () => ({
      apiVersion: SpatialReferenceResolver.apiVersion,
      toolApiVersion: PathToolService.apiVersion,
      parameterStoreApiVersion: ToolParameterStore.apiVersion,
      referenceKinds: ["path", "profile", "point"],
      tools: [
        "tube", "sweep", "extrude", "revolve", "array",
        "draw-tube", "draw-array", "draw-sweep", "draw-extrude",
        "draw-revolve"
      ],
      semanticSketchVersion: SKETCH_DESCRIPTOR_VERSION,
      sketchRoles: ["point", "path", "profile", "boundary"],
      preview: "local-ephemeral",
      brushOrientation: ["preserve", "plane", "path"],
      affineBrushVariables: PATH_BRUSH_AFFINE_VARIABLES,
      persistence: "snapshot"
    }))
    .register("drawingTarget", () => ({
      apiVersion: DrawingTargetController.apiVersion,
      sources: drawingTarget.status().supportedSources,
      helper: "transparent-editable",
      gizmoModes: ["translate", "rotate"],
      targetTypes: ["plane", "surface"],
      surfaceProjection: {
        mode: "filtered-screen-ray",
        frontFacesOnly: true,
        continuityLock: true,
        barycentricMetadata: true,
        consumers: ["path-sketch", "array-brush"]
      },
      consumers: ["path-sketch", "planar-sketch", "measurement"],
      persistence: "local-ephemeral"
    }))
    .register("measurement", () => ({
      apiVersion: MeasurementController.apiVersion,
      tools: ["ruler", "protractor"],
      scope: "local-viewer",
      persistence: "ephemeral",
      planarConstraints: true
    }))
    .register("animation", () => ({
      apiVersion: TEMPORAL_ANIMATION_RUNTIME_VERSION,
      commandApiVersion: ANIMATION_COMMAND_SERVICE_VERSION,
      coordinatorApiVersion: LocalAnimationCoordinator.apiVersion,
      mode: "shared-ephemeral-render-overlay",
      multipleLocalViewers: true,
      safeMath: true,
      persistent: false
    }))
    .register("runtimeProfiles", () => ({
      active: profile,
      available: describeRuntimeProfiles()
    }))
    .register("viewer", () => ({
      apiVersion: ViewerState.apiVersion,
      cameraControllerApiVersion: ViewerCameraController.apiVersion,
      coordinatorApiVersion: LocalViewerCoordinator.apiVersion,
      sessionDirectoryApiVersion:
        LocalViewerSessionDirectory.apiVersion,
      projectLaunchApiVersion:
        LocalProjectLaunchSender.apiVersion,
      coordinatedSandboxApiVersion: CoordinatedSandbox.apiVersion,
      cameraObjectApiVersion: CameraObjectService.apiVersion,
      transformPreviewApiVersion:
        LocalTransformPreviewCoordinator.apiVersion,
      multipleLocalViewers: true,
      activeProjectSelection: true,
      independentLocalProjects: true,
      joinHandshake: true,
      authorityFailover: true,
      sharedSandbox: viewerCoordinator.sandboxId,
      persistentCameraObjects: true,
      localActiveCamera: true,
      documentDefaultCamera: true,
      sharedTransformPreview: true,
      sharedTransformPreviewMaximumHz: 30,
      cameraProjection: true,
      cameraPose: true,
      cameraOrbit: true,
      cameraFrameSelection: true,
      cameraInterpolation: true,
      cameraProcedures: true
    }))
    .register("modules", () => modules.describe())
    .register("renderer", () => ({
      apiVersion: ThreeRegionRenderer.apiVersion
    }))
    .register("editor", () => ({
      apiVersion: EditorState.apiVersion
    }))
    .register("properties", () =>
      propertyRegistry.describe()
    )
    .register("geometries", () =>
      geometryRegistry.list()
    )
    .register("experiments", () =>
      experimentService.list()
    );

  commands.register(
    "runtime.api.benchmark",
    ({ iterations = 10000 } = {}) =>
      runtime.benchmark({ iterations })
  );

  const instanceGraphProjection = new InstanceGraphProjectionCache();
  queries.register(
    "instance.graph.projection",
    () => instanceGraphProjection.status()
  );
  const sceneProjection = new SceneProjectionScheduler({
    applyIncremental: (state, changes, { revision = 0 } = {}) => {
      const projection = instanceGraphProjection.update(state, changes);
      if (projection.full) {
        renderer.update(projection.scene);
      } else if (projection.changes.length) {
        renderer.applyChanges(projection.scene, projection.changes);
      }
      transformPreviews.projectionApplied(revision);
    },
    applyFull: (state, { revision = 0 } = {}) => {
      const projection = instanceGraphProjection.reset(state);
      renderer.update(projection.scene);
      transformPreviews.projectionApplied(revision);
    },
    interactionActive: () => Boolean(pathSketch.status().drawing)
  });
  let initialSceneProjected = false;
  const unsubscribeSandbox = sandbox.subscribe(
    (state, changes) => {
      temporalRuntime.bumpDependencies(
        temporalDependencyIdsForChanges(changes)
      );
      const classification = classifyChanges(changes);
      if (!initialSceneProjected &&
          changes.some(change => change?.type === "initial")) {
        initialSceneProjected = true;
        sceneProjection.applyInitial(state, {
          revision: baseSandbox.revision
        });
      } else if (classification.mode !== "none") {
        sceneProjection.enqueue(state, {
          ...classification,
          revision: baseSandbox.revision
        });
      }

      runtime.emit("world.changed", {
        state,
        changes,
        classification
      });
      const characterProjectionChanges = (changes ?? []).filter(
        change => [
          "character-animation.visual",
          "character-animation.source"
        ].includes(change?.source)
      );
      for (const change of characterProjectionChanges) {
        const id = String(change.objectId ?? "");
        if (!id) continue;
        if (change?.source === "character-animation.source") {
          if (sourceReconcileSuppressed.has(id)) continue;
          Promise.resolve(ensureCharacterVisual(id)).catch(error => {
            runtime.emit("character.animation.source.failed", {
              characterId: id,
              error: String(error?.message ?? error)
            });
          });
          continue;
        }
        const current = characterAnimation.status(id);
        if (!current.loaded) continue;
        const object = sandbox.getObject(id);
        const visual = storedCharacterVisual(object) ?? current.visualBaseline ?? {};
        const status = characterAnimation.configure(id, { visual });
        emitCharacterAnimationChanged(id, "history-sync", { status });
      }
      const gameplayChanges = (changes ?? []).filter(
        change =>
          ![
            "character-animation.visual",
            "character-animation.source"
          ].includes(change?.source) &&
          ![
            "data-object-created",
            "data-object-deleted",
            "data-object-updated",
            "interaction-bindings-changed"
          ].includes(change?.type)
      );
      if (gameRuntime.state === "running" && gameplayChanges.length) {
        gameRuntime.sceneChanged(gameplayChanges);
        if (gameRuntime.state === "running" && gameplayChanges.length) {
          const refreshGameWorld = () => {
            if (gameRuntime.state === "running") {
              gameRuntime.refreshCollisionWorld();
            }
          };
          if (typeof globalThis.requestAnimationFrame === "function") {
            globalThis.requestAnimationFrame(refreshGameWorld);
          } else {
            globalThis.setTimeout(refreshGameWorld, 0);
          }
        }
      }
      viewerDirectory.announce();
    }
  );
  runtime.onDispose(() => sceneProjection.dispose());

  const unsubscribeSelection = editor.selection.subscribe(
    snapshot => {
      temporalRuntime.bumpDependency("selection");
      runtime.emit("selection.changed", snapshot);
    }
  );
  const unsubscribeMeshEdit = meshEditor.subscribe(
    snapshot => runtime.emit("mesh.edit.changed", snapshot)
  );
  const unsubscribeEditContext = editContext.subscribe(
    snapshot => runtime.emit("edit.context.changed", snapshot)
  );
  const unsubscribeMeasurement = measurement.subscribe(
    snapshot => runtime.emit("measurement.changed", snapshot)
  );

  const unsubscribeEditor = editor.subscribe(
    snapshot => {
      temporalRuntime.bumpDependency("editor");
      runtime.emit("editor.changed", snapshot);
    }
  );
  const unsubscribeViewer = viewer.subscribe(
    snapshot => runtime.emit("viewer.changed", snapshot)
  );
  const unsubscribeCameraObjects = cameraObjects.subscribe(
    snapshot => {
      renderer.setCameraVisualState({
        activeCameraId: snapshot.activeCameraId,
        defaultCameraId: snapshot.defaultCameraId
      });
      runtime.emit("camera.objects.changed", snapshot);
    }
  );
  const unsubscribeViewerInstances = viewerCoordinator.subscribe(
    snapshot => {
      if (sharedAnimations.sandboxId !== snapshot.sandboxId) {
        sharedAnimations.switchSandbox(snapshot.sandboxId);
      }
      if (transformPreviews.sandboxId !== snapshot.sandboxId) {
        transformPreviews.switchSandbox(snapshot.sandboxId);
      }
      viewerDirectory.announce();
      runtime.emit("viewer.instances.changed", snapshot);
    }
  );
  const unsubscribeViewerSessions = viewerDirectory.subscribe(
    snapshot => runtime.emit("viewer.sessions.changed", snapshot)
  );
  const unsubscribeSharedAnimations = sharedAnimations.subscribe(
    snapshot => runtime.emit("animation.shared.changed", snapshot)
  );

  runtime
    .onDispose(() => viewerCoordinator.dispose())
    .onDispose(() => viewerDirectory.dispose())
    .onDispose(() => transformPreviews.dispose())
    .onDispose(unsubscribeTransformPreviewSurface)
    .onDispose(unsubscribeProjectDirectory)
    .onDispose(unsubscribeSharedAnimations)
    .onDispose(unsubscribeViewerSessions)
    .onDispose(unsubscribeViewerInstances)
    .onDispose(unsubscribeCameraObjects)
    .onDispose(unsubscribeViewer)
    .onDispose(unsubscribeEditor)
    .onDispose(unsubscribeEditContext)
    .onDispose(unsubscribeMeasurement)
    .onDispose(() => {
      strokeCompaction.detachInputSource();
      strokeCompaction.cancelAll();
    })
    .onDispose(() => resourceTree.dispose?.())
    .onDispose(unsubscribeMeshEdit)
    .onDispose(unsubscribeSelection)
    .onDispose(unsubscribeOccurrenceResolver)
    .onDispose(unsubscribeSpatialReferences)
    .onDispose(unsubscribeInteractions)
    .onDispose(unsubscribeSandbox);

  let activeWebExtensions;
  try {
    activeWebExtensions = await activateWebRuntimeExtensions(
      runtimeExtensions,
      {
        commands,
        reducer,
        projectService,
        sandbox,
        editor,
        renderer,
        appearanceRuntime,
        propertyTransferPresets,
        selectionOperations,
        timeDomains,
        temporalDependencies,
        temporalRuntime,
        temporalExecution
      }
    );
  } catch (error) {
    runtime.dispose();
    throw error;
  }
  runtime.onDispose(() => activeWebExtensions.dispose());

  if (defaultDemoLaunch?.mode === "game") {
    const characterId = String(defaultDemoLaunch.characterId ?? "").trim();
    if (characterId && sandbox.getObject(characterId)) {
      editor.selection.replace({
        kind: "object",
        regionId: region.descriptor.id,
        objectId: characterId
      });
      defaultDemoLaunch = Object.freeze({
        ...defaultDemoLaunch,
        characterId
      });
    } else {
      globalThis.console?.warn?.(
        "Projeto demo aberto sem personagem de inicialização válido.",
        characterId
      );
      defaultDemoLaunch = null;
    }
  }

  return Object.freeze({
    buildInfo,
    runtime,
    web: Object.freeze({
      region,
      sandbox,
      editor,
      viewer,
      viewerCoordinator,
      viewerDirectory,
      cameraController,
      cameraObjects,
      renderer,
      defaultDemoLaunch,
      outline,
      modules,
      runtimeExtensions: activeWebExtensions.manifests,
      devConsole,
      procedureCatalog,
      procedureCatalogEditor,
      procedureCatalogUiPanel,
      objectInspector,
      geometryCreationPanel,
      experimentPanel,
      animationPanel,
      viewerRenderPanel,
      meshEditor,
      meshEditPanel,
      editContext,
      drawingTarget,
      pathTools,
      pathSketch,
      meshPathGesture,
      planarSketch,
      strokeFusion,
      strokeCompaction,
      resourceTree,
      measurement,
      toolRegistry,
      toolParameters,
      toolCapabilities,
      editHud,
      geometryRegistry,
      propertyRegistry,
      propertyService,
      interactionService,
      propertyClipboard,
      appearanceBindings,
      experimentRegistry,
      experimentService,
      experimentActionService,
      programSession,
      experimentProgramSession,
      spatialPlanCommitService,
      cameraPlanCommitService,
      timeDomains,
      temporalDependencies,
      temporalRuntime,
      temporalExecution,
      animationRuntime,
      animationCommands,
      characterAnimation,
      gameRuntime,
      gameSessionState,
      sharedAnimations,
      transformPreviews,
      sandboxRecovery,
      projectLaunch: Object.freeze({
        createSender: launchId =>
          new LocalProjectLaunchSender({ launchId }),
        incoming: incomingProject
      }),
      connectUiDiagnostics
    })
  });
}

const DEFAULT_DEMO_MANIFEST_URL = new URL(
  "../assets/demo/default-game.manifest.json",
  import.meta.url
);

function shouldOpenDefaultDemo(locationParameters) {
  return !locationParameters.get("project") &&
    !locationParameters.get("viewer") &&
    !locationParameters.get("sandbox");
}

async function loadDefaultDemoProject() {
  if (typeof globalThis.fetch !== "function") {
    throw new Error("fetch indisponível para carregar o projeto demo.");
  }
  const manifestResponse = await globalThis.fetch(DEFAULT_DEMO_MANIFEST_URL);
  if (!manifestResponse.ok) {
    throw new Error(
      `Manifesto demo indisponível: ${manifestResponse.status}.`
    );
  }
  const manifest = await manifestResponse.json();
  if (manifest?.version !== "spatialseed-default-demo-v1") {
    throw new Error(`Versão de manifesto demo inválida: ${manifest?.version}.`);
  }
  const projectName = String(manifest.project ?? "").trim();
  if (!projectName) throw new Error("Manifesto demo sem projeto.");
  const projectUrl = new URL(projectName, DEFAULT_DEMO_MANIFEST_URL);
  if (projectUrl.origin !== DEFAULT_DEMO_MANIFEST_URL.origin) {
    throw new Error("O projeto demo deve permanecer na mesma origem.");
  }
  const projectResponse = await globalThis.fetch(projectUrl);
  if (!projectResponse.ok) {
    throw new Error(`Projeto demo indisponível: ${projectResponse.status}.`);
  }
  const launch = manifest.launch && typeof manifest.launch === "object"
    ? structuredClone(manifest.launch)
    : {};
  return Object.freeze({
    text: await projectResponse.text(),
    launch: Object.freeze({
      ...launch,
      project: projectName
    })
  });
}

function temporalDependencyIdsForChanges(changes = []) {
  const ids = new Set(["world", "world:revision"]);
  for (const change of changes ?? []) {
    if (!change || typeof change !== "object") continue;
    const objectId = String(
      change.objectId ??
      change.object?.id ??
      change.previousObject?.id ??
      ""
    ).trim();
    if (!objectId) continue;

    ids.add(`object:${objectId}`);
    const type = String(change.type ?? "");
    if (type === "object-created" || type === "object-deleted") {
      ids.add(`object:${objectId}:exists`);
    }
    if (type === "object-transform") {
      ids.add(`object:${objectId}:transform`);
      ids.add(`object:${objectId}:position`);
      ids.add(`object:${objectId}:rotation`);
      ids.add(`object:${objectId}:scale`);
    }

    const before = change.previousObject ?? null;
    const after = change.object ?? null;
    if (!before && !after) continue;
    const keys = new Set([
      ...Object.keys(before ?? {}),
      ...Object.keys(after ?? {})
    ]);
    for (const key of keys) {
      if (!Object.is(before?.[key], after?.[key])) {
        ids.add(`object:${objectId}:${key}`);
      }
    }
  }
  return Object.freeze([...ids].sort());
}

function resourceObjectPatch(property, value) {
  const key = String(property ?? "").trim();
  const allowed = new Set([
    "name",
    "parentId",
    "visible",
    "position",
    "rotation",
    "scale",
    "selectionAnchorPolicy",
    "selectionAnchorLocal"
  ]);
  if (!allowed.has(key)) {
    throw new RangeError(`Propriedade de recurso não editável: ${key}.`);
  }
  if (key === "name") {
    const name = String(value ?? "").trim();
    if (!name) throw new TypeError("Nome não pode ser vazio.");
    return { name };
  }
  if (key === "parentId") {
    throw new RangeError(
      "parentId deve ser alterado pelo comando hierarchy.reparent."
    );
  }
  if (key === "visible") return { visible: Boolean(value) };
  if (["position", "scale", "selectionAnchorLocal"].includes(key)) {
    return { [key]: value === null && key === "selectionAnchorLocal"
      ? null
      : normalizedResourceVector(value, key) };
  }
  if (key === "rotation") {
    if (!Array.isArray(value) || value.length !== 4 ||
        !value.every(Number.isFinite)) {
      throw new TypeError("rotation exige [x,y,z,w].");
    }
    return { rotation: value.map(Number) };
  }
  const policy = String(value ?? "bounds-center").trim().toLowerCase();
  if (!["bounds-center", "origin", "custom", "pivot"].includes(policy)) {
    throw new RangeError(`Política de âncora desconhecida: ${policy}.`);
  }
  return { selectionAnchorPolicy: policy };
}

function normalizeResourceParentId(value) {
  return value === null || String(value ?? "").trim() === ""
    ? null
    : String(value).trim();
}

function normalizedResourceVector(value, label) {
  if (!Array.isArray(value) || value.length !== 3 ||
      !value.every(Number.isFinite)) {
    throw new TypeError(`${label} exige [x,y,z].`);
  }
  return value.map(Number);
}

function withProjectTransientReset(projectService, beforeReplace) {
  const replacementMethods = new Set([
    "newProject",
    "openText",
    "restoreRecovery"
  ]);
  const methods = new Map();
  return new Proxy(projectService, {
    get(target, property) {
      const value = Reflect.get(target, property, target);
      if (typeof value !== "function") return value;
      if (methods.has(property)) return methods.get(property);
      const bound = replacementMethods.has(property)
        ? (...args) => {
            beforeReplace({ operation: String(property), args });
            return value.apply(target, args);
          }
        : value.bind(target);
      methods.set(property, bound);
      return bound;
    }
  });
}

function characterMediaType(filename) {
  const lower = String(filename ?? "").trim().toLowerCase();
  if (lower.endsWith(".glb")) return "model/gltf-binary";
  if (lower.endsWith(".gltf")) return "model/gltf+json";
  return "application/octet-stream";
}

function validateApis() {
  if (ThreeRegionRenderer.apiVersion !== EXPECTED_RENDERER_API) {
    throw new Error(
      `Renderer incompatível. Esperado ${EXPECTED_RENDERER_API}, recebido ` +
      `${ThreeRegionRenderer.apiVersion ?? "sem apiVersion"}.`
    );
  }

  if (EditorState.apiVersion !== EXPECTED_EDITOR_API) {
    throw new Error(
      `EditorState incompatível. Esperado ${EXPECTED_EDITOR_API}, recebido ` +
      `${EditorState.apiVersion ?? "sem apiVersion"}.`
    );
  }
}
