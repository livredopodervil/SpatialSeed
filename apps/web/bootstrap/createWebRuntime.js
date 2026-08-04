import { Region } from "../../../packages/core/src/Region.js?build=20260724-0029d";
import { Sandbox } from "../../../packages/core/src/Sandbox.js?build=20260801-0045a1";
import {
  ModuleRegistry
} from "../../../packages/plugin-api/src/index.js?build=20260802-0047b";
import { EditorState } from "../../../packages/editor-core/src/EditorState.js?build=20260729-0039g2";
import {
  VIEWER_CAMERA_COMMANDS,
  CameraObjectService,
  ViewerCameraController,
  ViewerState,
} from "../../../packages/runtime-layers/src/index.js?build=20260730-0040e";
import {
  REGION_BOX_REDUCER_CONTRIBUTION_ID,
  regionBoxModule
} from "../../../packages/region-box/src/index.js?build=20260802-0047g";
import { ThreeRegionRenderer } from "../../../packages/renderer-three/src/ThreeRegionRenderer.js?build=20260804-0048i-audit1";
import { OutlineRenderer } from "../../../packages/renderer-outline/src/OutlineRenderer.js?build=20260801-0045a1";
import {
  createVirtualResourceTree,
  parseResourcePath
} from "../../../packages/resource-tree/src/index.js?build=20260801-0045a1";
import { DevConsole } from "../../../packages/devtools/src/DevConsole.js?build=20260804-0048i-audit2";
import { ObjectInspector } from "../../../packages/object-inspector/src/ObjectInspector.js?build=20260727-0037c";
import { GeometryCreationPanel } from "../../../packages/geometry-creation-panel/src/index.js?build=20260729-0039g1";
import { SelectionOperations } from "../../../packages/selection-operations/src/SelectionOperations.js?build=20260802-0047g";
import { createEditorCommands } from "../../../packages/editor-commands/src/EditorCommands.js?build=20260804-0048i-audit1";
import { ProjectService } from "../../../packages/project-files/src/ProjectService.js?build=20260727-0037c";
import {
  activateWebRuntimeExtensions,
  BrowserProcedureCatalogStore
} from "../../../packages/platform-web/src/index.js?build=20260804-0048i-audit3";
import { AppearanceRuntime } from "../../../packages/appearance-runtime/src/index.js?build=20260730-0041a";
import {
  AppearanceBindingService
} from "../../../packages/appearance-binding/src/index.js?build=20260730-0041b";
import {
  classifyChanges,
  SceneProjectionScheduler
} from "../../../packages/incremental-runtime/src/index.js?build=20260730-0040h";
import {
  createDefaultPropertyRegistry,
  SelectionPropertyService
} from "../../../packages/property-registry/src/index.js?build=20260727-0037c";
import {
  createDefaultGeometryRegistry
} from "../../../packages/geometry-registry/src/index.js?build=20260802-0047g";
import {
  SKETCH_DESCRIPTOR_VERSION
} from "../../../packages/sketch-descriptor/src/index.js?build=20260802-0047g";
import {
  SpatialSeedRuntime,
  RuntimeQueryRegistry,
  RuntimeEvents,
  RuntimeCapabilities,
  describeRuntimeProfiles,
  resolveRuntimeProfile
} from "../../../packages/runtime-api/src/index.js?build=20260718-0027h";
import {
  CAMERA_PLAN_COMMANDS,
  CameraPlanCommitService,
  ProcedureCatalog,
  ProgramSessionController,
  SpatialPlanCommitService,
  SPATIAL_CREATE_COMMAND,
  createBrowserProgramSessionWorker
} from "../../../packages/script-runtime/src/index.js?build=20260731-0043x";
import {
  ProcedureCatalogEditor
} from "../../../packages/procedure-editor/src/index.js?build=20260716-0026j";
import {
  ProcedureCatalogUiPanel
} from "../../../packages/catalog-ui/src/index.js?build=20260731-0043x";
import {
  ExperimentActionService,
  ExperimentRegistry,
  ExperimentService
} from "../../../packages/experiment-runtime/src/index.js?build=20260802-0047b";
import {
  STARTER_EXPERIMENT_CATALOG_CONTRIBUTION_ID,
  starterExperimentModule
} from "../../../packages/experiment-plugin/src/index.js?build=20260802-0047b";
import {
  ExperimentPanel
} from "../../../packages/experiment-panel/src/index.js?build=20260718-0027f";
import {
  ANIMATION_COMMAND_SERVICE_VERSION,
  ANIMATION_RUNTIME_VERSION,
  AnimationCommandService,
  AnimationRuntime
} from "../../../packages/animation-runtime/src/index.js?build=20260724-0029e1";
import {
  AnimationPanel
} from "../../../packages/animation-panel/src/index.js?build=20260720-0028d";
import {
  ViewerRenderPanel
} from "../../../packages/viewer-render-panel/src/index.js?build=20260726-0032a";
import {
  MeshEditController
} from "../../../packages/mesh-editor-core/src/index.js?build=20260804-0048i-audit1";
import {
  MeshGeometryAudit
} from "../../../packages/mesh-geometry-audit/src/index.js?build=20260804-0048i-audit3";
import {
  MeshEditPanel
} from "../../../packages/mesh-edit-panel/src/index.js?build=20260802-0047g";
import {
  EditContextController
} from "../../../packages/edit-context/src/index.js?build=20260730-0040e";
import {
  EditHud
} from "../../../packages/edit-hud/src/index.js?build=20260802-0047g";
import {
  ToolLifecycleController,
  ToolParameterStore,
  ToolWorkspaceController,
  createDefaultEditToolRegistry,
  createLegacyToolParameterMigration,
  createDefaultToolCapabilityFacade,
  installToolCapabilityRuntime
} from "../../../packages/edit-tools/src/index.js?build=20260802-0047g";
import {
  ObjectPlacementController
} from "../../../packages/object-placement/src/index.js?build=20260730-0040e";
import {
  DrawingTargetController
} from "../../../packages/drawing-target/src/index.js?build=20260730-0042c";
import {
  PlanarSketchController
} from "../../../packages/planar-authoring/src/index.js?build=20260802-0047g";
import {
  StrokeCompactionScheduler,
  StrokeFusionService,
  replaceStrokePointInBundle
} from "../../../packages/stroke-resources/src/index.js?build=20260802-0047g";
import {
  MeasurementController
} from "../../../packages/measurement-tools/src/index.js?build=20260730-0040e";
import {
  PATH_BRUSH_AFFINE_VARIABLES,
  PathSketchController,
  PathToolService,
  SpatialReferenceResolver
} from "../../../packages/spatial-references/src/index.js?build=20260802-0047g";
import {
  BrowserSandboxIdentity,
  createSandboxId,
  createRecoveryRecord,
  IndexedDbRecoveryStore,
  SandboxRecoveryController
} from "../../../packages/project-recovery/src/index.js?build=20260725-0029f1";
import {
  CoordinatedSandbox,
  LocalProjectLaunchReceiver,
  LocalProjectLaunchSender,
  LocalAnimationCoordinator,
  LocalTransformPreviewCoordinator,
  LocalViewerCoordinator,
  LocalViewerSessionDirectory,
  createIndependentProjectUrl
} from "../../../packages/local-viewers/src/index.js?build=20260730-0040f";

const EXPECTED_RENDERER_API = "renderer-three-navigation-camera-v7";
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
  const animationRuntime = new AnimationRuntime({ surface: renderer });
  const animationCommands = new AnimationCommandService({
    runtime: animationRuntime,
    selection: () => editor.selection.snapshot()
  });

  const resourceTree = createVirtualResourceTree({
    sandbox: baseSandbox,
    pageSize: 100
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
    appearanceRuntime
  });
  const projectLaunchMode = locationParameters.get("project");
  let incomingProject = null;
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
      status: () => animationCommands.status()
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
      } else {
        transformPreviews.end({
          ...preview,
          committed: preview.phase === "end"
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
  const selectionOperations = new SelectionOperations({
    editor,
    sandbox,
    regionId: region.descriptor.id,
    geometryRegistry,
    appearanceRuntime,
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
  const meshGeometryAudit = new MeshGeometryAudit({
    captureSource: ({ objectId = null } = {}) => {
      const meshStatus = meshEditor.status();
      const selection = editor.selection.snapshot();
      const resolvedId = objectId ?? meshStatus.objectId ??
        selection.members.at(-1)?.objectId ?? null;
      if (resolvedId === null || resolvedId === undefined) {
        throw new Error("Selecione um objeto ou mantenha uma edição de malha ativa.");
      }
      const id = String(resolvedId);
      const object = sandbox.getObject?.(id) ??
        sandbox.getSnapshot().objects.find(candidate =>
          String(candidate.id) === id
        ) ?? null;
      if (!object) throw new Error(`Objeto não encontrado: ${id}.`);
      let canonicalDescriptor = null;
      try {
        canonicalDescriptor = geometryRegistry.normalize(
          geometryRegistry.describeLegacyObject(object)
        );
      } catch {
        canonicalDescriptor = null;
      }
      return {
        objectId: id,
        sandboxRevision: sandbox.revision,
        object: structuredClone(object),
        canonical: Object.freeze({
          descriptor: canonicalDescriptor
            ? structuredClone(canonicalDescriptor)
            : null,
          geometryKey: canonicalDescriptor
            ? geometryRegistry.key(canonicalDescriptor)
            : null,
          renderProfile: canonicalDescriptor
            ? geometryRegistry.renderProfile(canonicalDescriptor)
            : null
        }),
        edit: meshEditor.geometryAuditSnapshot(),
        renderer: renderer.getMeshGeometryAudit(id)
      };
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
  const resetTransientAuthoring = ({ operation }) => {
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

  const propertyRegistry = createDefaultPropertyRegistry();
  const propertyService = new SelectionPropertyService({
    selection: editor.selection,
    sandbox,
    appearanceRuntime,
    registry: propertyRegistry
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
    meshEditor,
    editContext,
    toolLifecycle,
    toolParameters,
    pathTools,
    pathSketch,
    planarSketch,
    objectPlacement,
    measurement,
    beforeProjectSave: () => strokeCompaction.checkpoint("save"),
    canMutateProject: action =>
      viewerCoordinator.requireAuthority(action)
  });
  commandsRef = commands;
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
    ({ policy = "bounds-center", position = null, targetIds = null } = {}) => {
      viewerCoordinator.requireAuthority("alterar a política de âncora");
      const ids = Array.isArray(targetIds) && targetIds.length
        ? [...new Set(targetIds.map(String))]
        : [...new Set(editor.selection.snapshot().members
            .map(member => String(member.objectId)))];
      if (!ids.length) return Object.freeze({ changed: false, reason: "selection-empty" });
      const normalizedPolicy = String(policy).trim().toLowerCase();
      if (!["bounds-center", "origin", "custom", "pivot"].includes(normalizedPolicy)) {
        throw new RangeError(`Política de âncora desconhecida: ${normalizedPolicy}.`);
      }
      if (normalizedPolicy === "custom" &&
          (!Array.isArray(position) || position.length !== 3 ||
            !position.every(Number.isFinite))) {
        throw new TypeError("Âncora personalizada exige position [x,y,z].");
      }
      const changed = sandbox.dispatch({
        type: "selection.properties.set",
        targetIds: ids,
        updates: ids.map(id => ({
          id,
          patch: {
            selectionAnchorPolicy: normalizedPolicy,
            ...(normalizedPolicy === "custom"
              ? { selectionAnchorLocal: [...position] }
              : { selectionAnchorLocal: null })
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
        targetMode = "selection"
      } = {}) =>
        sharedAnimations.play("preset", {
          id,
          parameters,
          targetIds,
          targetMode
        }),
      { category: "animation", mutates: false }
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

  const queries = new RuntimeQueryRegistry();
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
              object?.geometry?.selectionAnchorLocal ?? null
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
    .register("mesh.audit.clear", () =>
      meshGeometryAudit.clear()
    )
    .register("mesh.audit.capture", args =>
      meshGeometryAudit.capture(args ?? {})
    )
    .register("mesh.audit.list", () =>
      meshGeometryAudit.list()
    )
    .register("mesh.audit.compare", args =>
      meshGeometryAudit.compare(args ?? {})
    )
    .register("mesh.audit.diagnose", args =>
      meshGeometryAudit.diagnose(args ?? {})
    )
    .register("mesh.audit.report", args =>
      meshGeometryAudit.report(args ?? {})
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
          selection: "Clique percorre lotes e famílias renderizadas; seleção em área reconstrói o índice de tela quando câmera ou cena invalidam o cache."
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
    execute: (id, args) => runtime.execute(id, args)
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
      execute: (id, args) => runtime.query(id, args),
      describe: () => runtime.capabilities().queries
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
      apiVersion: ANIMATION_RUNTIME_VERSION,
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

  const sceneProjection = new SceneProjectionScheduler({
    applyIncremental: (state, changes) =>
      renderer.applyChanges(state, changes),
    applyFull: state => renderer.update(state),
    interactionActive: () => Boolean(pathSketch.status().drawing)
  });
  let initialSceneProjected = false;
  const unsubscribeSandbox = sandbox.subscribe(
    (state, changes) => {
      const classification = classifyChanges(changes);
      if (!initialSceneProjected &&
          changes.some(change => change?.type === "initial")) {
        initialSceneProjected = true;
        sceneProjection.applyInitial(state);
      } else {
        sceneProjection.enqueue(state, classification);
      }

      runtime.emit("world.changed", {
        state,
        changes,
        classification
      });
      viewerDirectory.announce();
    }
  );
  runtime.onDispose(() => sceneProjection.dispose());

  const unsubscribeSelection = editor.selection.subscribe(
    snapshot => runtime.emit("selection.changed", snapshot)
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
    snapshot => runtime.emit("editor.changed", snapshot)
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
    .onDispose(unsubscribeSpatialReferences)
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
        selectionOperations
      }
    );
  } catch (error) {
    runtime.dispose();
    throw error;
  }
  runtime.onDispose(() => activeWebExtensions.dispose());

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
      appearanceBindings,
      experimentRegistry,
      experimentService,
      experimentActionService,
      programSession,
      experimentProgramSession,
      spatialPlanCommitService,
      cameraPlanCommitService,
      animationRuntime,
      animationCommands,
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
