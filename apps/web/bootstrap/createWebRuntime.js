import { EventBus } from "../../../packages/core/src/EventBus.js?build=20260714-0020b-a";
import { Region } from "../../../packages/core/src/Region.js?build=20260724-0029d";
import { Sandbox } from "../../../packages/core/src/Sandbox.js?build=20260725-0029f1";
import { ModuleRegistry } from "../../../packages/plugin-api/src/ModuleRegistry.js?build=20260718-0027f";
import { EditorState } from "../../../packages/editor-core/src/EditorState.js?build=20260714-0020b-a";
import {
  VIEWER_CAMERA_COMMANDS,
  CameraObjectService,
  ViewerCameraController,
  ViewerState,
} from "../../../packages/runtime-layers/src/index.js?build=20260725-0029f1";
import { boxRegionReducer } from "../../../packages/region-box/src/reducer.js?build=20260727-0036c";
import { ThreeRegionRenderer } from "../../../packages/renderer-three/src/ThreeRegionRenderer.js?build=20260727-0036c";
import { OutlineRenderer } from "../../../packages/renderer-outline/src/OutlineRenderer.js?build=20260714-0020b-a";
import { DevConsole } from "../../../packages/devtools/src/DevConsole.js?build=20260727-0036c";
import { ObjectInspector } from "../../../packages/object-inspector/src/ObjectInspector.js?build=20260720-0028d";
import { TransformToolPanel } from "../../../packages/editor-transform-tools/src/TransformToolPanel.js?build=20260714-0020b-a";
import { GeometryCreationPanel } from "../../../packages/geometry-creation-panel/src/index.js?build=20260726-0031a";
import { SelectionOperations } from "../../../packages/selection-operations/src/SelectionOperations.js?build=20260726-0031a";
import { createEditorCommands } from "../../../packages/editor-commands/src/EditorCommands.js?build=20260727-0036c";
import { ProjectService } from "../../../packages/project-files/src/ProjectService.js?build=20260724-0029f";
import { BenchmarkRunner } from "../../../packages/benchmarks/src/BenchmarkRunner.js?build=20260718-0027f";
import { TestService } from "../../../packages/tests/src/TestService.js?build=20260716-0025b";
import { activateRuntimeTestPlugin } from "../../../packages/runtime-test-plugin/src/index.js?build=20260727-0036c";
import { AppearanceRuntime } from "../../../packages/appearance-runtime/src/index.js?build=20260724-0029f";
import { classifyChanges } from "../../../packages/incremental-runtime/src/index.js?build=20260714-0020b-a";
import { ResourceAudit } from "../../../packages/resource-audit/src/index.js?build=20260714-0020b-a";
import {
  createDefaultPropertyRegistry,
  SelectionPropertyService
} from "../../../packages/property-registry/src/index.js?build=20260724-0029f";
import {
  createDefaultGeometryRegistry
} from "../../../packages/geometry-registry/src/index.js?build=20260726-0031a";
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
} from "../../../packages/script-runtime/src/index.js?build=20260726-0031a";
import {
  BrowserProcedureCatalogStore
} from "../procedures/BrowserProcedureCatalogStore.js?build=20260716-0026i";
import {
  ProcedureCatalogEditor
} from "../../../packages/procedure-editor/src/index.js?build=20260716-0026j";
import {
  ExperimentActionService,
  ExperimentRegistry,
  ExperimentService
} from "../../../packages/experiment-runtime/src/index.js?build=20260718-0027f";
import {
  starterExperimentPlugin
} from "../../../packages/experiment-plugin/src/index.js?build=20260718-0027f";
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
} from "../../../packages/mesh-editor-core/src/index.js?build=20260727-0036c";
import {
  MeshEditPanel
} from "../../../packages/mesh-edit-panel/src/index.js?build=20260727-0036c";
import {
  EditContextController
} from "../../../packages/edit-context/src/index.js?build=20260727-0036c";
import {
  EditHud
} from "../../../packages/edit-hud/src/index.js?build=20260727-0036c";
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
} from "../../../packages/local-viewers/src/index.js?build=20260725-0029f1";

const EXPECTED_RENDERER_API = "renderer-three-navigation-camera-v4";
const EXPECTED_EDITOR_API = "editor-state-v2";

export async function createWebRuntime({
  canvas,
  outlineRoot,
  transformToolsRoot,
  geometryCreationRoot,
  experimentPanelRoot,
  animationPanelRoot,
  viewerRenderPanelRoot,
  meshEditPanelRoot,
  editHudRoot,
  procedureEditorRoot,
  inspectorRoot,
  onConsoleOutput,
  buildInfo,
  uiConfiguration,
  runtimeProfile = "authoring"
}) {
  if (!buildInfo?.build || !buildInfo?.version) {
    throw new TypeError("createWebRuntime exige buildInfo válido.");
  }
  validateApis();
  const profile = resolveRuntimeProfile(runtimeProfile);

  const modules = new ModuleRegistry();
  const reducers = new Map();
  const experimentRegistry = new ExperimentRegistry();

  modules.register({
    manifest: {
      id: "region.box",
      version: "0.5.0",
      apiVersion: "region-v1",
      optional: false,
      capabilities: ["reducers"]
    },
    activate: async context =>
      context.reducers.set("box-region", boxRegionReducer)
  });
  modules.register(starterExperimentPlugin);

  await modules.activateAll({
    eventBus: new EventBus(),
    reducers,
    experiments: experimentRegistry
  });

  const reducer = reducers.get("box-region");

  if (!reducer) {
    throw new Error("Reducer box-region unavailable");
  }

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

  function dispatchRuntimeCommand(command) {
    const next = structuredClone(command);

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

  const outline = new OutlineRenderer(outlineRoot);
  const locationParameters = new URLSearchParams(
    globalThis.location?.search ?? ""
  );
  const sandboxIdentity = new BrowserSandboxIdentity({
    requestedId: locationParameters.get("sandbox")
  });
  const sandboxId = sandboxIdentity.current();
  const projectService = new ProjectService({
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
      baseSandbox.previewCommandSequence(
        baseSandbox.getState(),
        [intent.command]
      );
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
  const selectionOperations = new SelectionOperations({
    editor,
    sandbox,
    regionId: region.descriptor.id,
    geometryRegistry,
    appearanceRuntime
  });
  const meshEditor = new MeshEditController({
    sandbox,
    editor,
    renderer,
    geometryRegistry
  });
  const editContext = new EditContextController({
    editor,
    renderer,
    meshEditor
  });

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

  const benchmarkRunner = new BenchmarkRunner({
    reducer,
    projectService
  });

  const resourceAudit = new ResourceAudit({
    sandbox,
    editor,
    renderer,
    appearanceRuntime,
    selectionOperations
  });

  const propertyRegistry = createDefaultPropertyRegistry();
  const propertyService = new SelectionPropertyService({
    selection: editor.selection,
    sandbox,
    appearanceRuntime,
    registry: propertyRegistry
  });

  const commands = createEditorCommands({
    editor,
    renderer,
    selectionOperations,
    projectService,
    benchmarkRunner,
    resourceAudit,
    propertyService,
    meshEditor,
    editContext,
    canMutateProject: action =>
      viewerCoordinator.requireAuthority(action)
  });
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
    return hasCamera
      ? cameraPlanCommitService.commit(plan)
      : spatialPlanCommitService.commit(plan);
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

  activateRuntimeTestPlugin({ commands });

  const testService = new TestService({
    reducer,
    commands,
    projectService
  });

  commands
    .register("test.help", () => testService.help())
    .register("test.run", ({ suite }) =>
      testService.run(suite)
    )
    .register("runtime.api.noop", ({ value = null } = {}) =>
      value
    );

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
  runtime
    .onDispose(() => sharedAnimations.dispose())
    .onDispose(() => animationRuntime.dispose());

  // O Inspector consulta estas propriedades durante sua construção.
  queries
    .register("properties.describe", () =>
      propertyRegistry.describe()
    )
    .register("selection.properties.inspect", ({
      targetScope = "selection"
    } = {}) =>
      propertyService.inspectSelection({ targetScope })
    )
    .register("selection.actions.describe", () => ({
      canGroup: !editor.selection.empty,
      canUngroup: selectionOperations.canUngroup()
    }))
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
    .register("edit.context.status", () =>
      editContext.status()
    )
    .register("viewer.instances.status", () =>
      viewerCoordinator.status()
    )
    .register("viewer.sessions.status", () =>
      viewerDirectory.status()
    )
    .register("runtime.ui-stats", () => uiDiagnosticsProvider());

  const transformToolPanel = new TransformToolPanel({
    root: transformToolsRoot,
    renderer
  });

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
    subscribeContext: listener => editContext.subscribe(listener)
  });
  const editHud = new EditHud({
    root: editHudRoot,
    query: (id, args) => runtime.query(id, args),
    execute: (id, args) => runtime.execute(id, args),
    subscribe: listener => editContext.subscribe(listener)
  });
  runtime.onDispose(() => editHud.dispose());
  runtime.onDispose(() => meshEditPanel.dispose());
  runtime.onDispose(() => editContext.dispose());
  runtime.onDispose(() => meshEditor.dispose());

  const procedureCatalog = new ProcedureCatalog({
    storage: new BrowserProcedureCatalogStore()
  });
  const procedureCatalogEditor = new ProcedureCatalogEditor({
    root: procedureEditorRoot,
    catalog: procedureCatalog
  });
  runtime.onDispose(() => procedureCatalogEditor.dispose());
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
    .register("selection.snapshot", () =>
      editor.selection.snapshot()
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

  const unsubscribeSandbox = sandbox.subscribe(
    (state, changes) => {
      const classification = classifyChanges(changes);

      if (classification.mode === "incremental") {
        renderer.applyChanges(state, classification.changes);
      } else {
        renderer.update(state);
      }

      runtime.emit("world.changed", {
        state,
        changes,
        classification
      });
      viewerDirectory.announce();
    }
  );

  const unsubscribeSelection = editor.selection.subscribe(
    snapshot => runtime.emit("selection.changed", snapshot)
  );
  const unsubscribeMeshEdit = meshEditor.subscribe(
    snapshot => runtime.emit("mesh.edit.changed", snapshot)
  );
  const unsubscribeEditContext = editContext.subscribe(
    snapshot => runtime.emit("edit.context.changed", snapshot)
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
    .onDispose(unsubscribeMeshEdit)
    .onDispose(unsubscribeSelection)
    .onDispose(unsubscribeSandbox);

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
      devConsole,
      procedureCatalog,
      procedureCatalogEditor,
      objectInspector,
      transformToolPanel,
      geometryCreationPanel,
      experimentPanel,
      animationPanel,
      viewerRenderPanel,
      meshEditor,
      meshEditPanel,
      editContext,
      editHud,
      geometryRegistry,
      propertyRegistry,
      propertyService,
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
