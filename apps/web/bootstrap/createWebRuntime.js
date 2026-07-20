import { EventBus } from "../../../packages/core/src/EventBus.js?build=20260714-0020b-a";
import { Region } from "../../../packages/core/src/Region.js?build=20260714-0020b-a";
import { Sandbox } from "../../../packages/core/src/Sandbox.js?build=20260718-0027h";
import { ModuleRegistry } from "../../../packages/plugin-api/src/ModuleRegistry.js?build=20260718-0027f";
import { EditorState } from "../../../packages/editor-core/src/EditorState.js?build=20260714-0020b-a";
import { boxRegionReducer } from "../../../packages/region-box/src/reducer.js?build=20260716-0024d";
import { ThreeRegionRenderer } from "../../../packages/renderer-three/src/ThreeRegionRenderer.js?build=20260719-0028a";
import { OutlineRenderer } from "../../../packages/renderer-outline/src/OutlineRenderer.js?build=20260714-0020b-a";
import { DevConsole } from "../../../packages/devtools/src/DevConsole.js?build=20260719-0028b";
import { ObjectInspector } from "../../../packages/object-inspector/src/ObjectInspector.js?build=20260718-0027h";
import { TransformToolPanel } from "../../../packages/editor-transform-tools/src/TransformToolPanel.js?build=20260714-0020b-a";
import { GeometryCreationPanel } from "../../../packages/geometry-creation-panel/src/index.js?build=20260716-0024i";
import { SelectionOperations } from "../../../packages/selection-operations/src/SelectionOperations.js?build=20260718-0027h";
import { createEditorCommands } from "../../../packages/editor-commands/src/EditorCommands.js?build=20260720-0028c";
import { ProjectService } from "../../../packages/project-files/src/ProjectService.js?build=20260716-0025d";
import { BenchmarkRunner } from "../../../packages/benchmarks/src/BenchmarkRunner.js?build=20260718-0027f";
import { TestService } from "../../../packages/tests/src/TestService.js?build=20260716-0025b";
import { activateRuntimeTestPlugin } from "../../../packages/runtime-test-plugin/src/index.js?build=20260720-0028c";
import { AppearanceRuntime } from "../../../packages/appearance-runtime/src/index.js?build=20260716-0024d";
import { classifyChanges } from "../../../packages/incremental-runtime/src/index.js?build=20260714-0020b-a";
import { ResourceAudit } from "../../../packages/resource-audit/src/index.js?build=20260714-0020b-a";
import {
  createDefaultPropertyRegistry,
  SelectionPropertyService
} from "../../../packages/property-registry/src/index.js?build=20260716-0024d";
import {
  createDefaultGeometryRegistry
} from "../../../packages/geometry-registry/src/index.js?build=20260716-0024g";
import {
  SpatialSeedRuntime,
  RuntimeQueryRegistry,
  RuntimeEvents,
  RuntimeCapabilities,
  describeRuntimeProfiles,
  resolveRuntimeProfile
} from "../../../packages/runtime-api/src/index.js?build=20260718-0027h";
import {
  ProcedureCatalog,
  ProgramSessionController,
  SpatialPlanCommitService,
  SPATIAL_CREATE_COMMAND,
  createBrowserProgramSessionWorker
} from "../../../packages/script-runtime/src/index.js?build=20260716-0026i";
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
} from "../../../packages/animation-runtime/src/index.js?build=20260719-0028b";

const EXPECTED_RENDERER_API = "renderer-three-selection-pivot-v2";
const EXPECTED_EDITOR_API = "editor-state-v2";

export async function createWebRuntime({
  canvas,
  outlineRoot,
  transformToolsRoot,
  geometryCreationRoot,
  experimentPanelRoot,
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

  const sandbox = new Sandbox(region, reducer);
  const editor = new EditorState();

  function dispatchRuntimeCommand(command) {
    const next = structuredClone(command);

    if (next.type === "object.update" && next.patch?.material) {
      const created = appearanceRuntime.internLegacyMaterial(
        next.patch.material
      );

      next.patch.appearanceId = created.appearanceId;
      delete next.patch.material;
    }

    return sandbox.dispatch(next);
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
  const animationRuntime = new AnimationRuntime({ surface: renderer });

  const outline = new OutlineRenderer(outlineRoot);
  const selectionOperations = new SelectionOperations({
    editor,
    sandbox,
    regionId: region.descriptor.id,
    geometryRegistry,
    appearanceRuntime
  });

  const projectService = new ProjectService({
    sandbox,
    editor,
    renderer,
    region,
    appearanceRuntime
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
    propertyService
  });
  const animationCommands = new AnimationCommandService({
    runtime: animationRuntime,
    selection: () => editor.selection.snapshot()
  });
  commands
    .register(
      "animation.start",
      args => animationCommands.start(args),
      { category: "animation", mutates: false }
    )
    .register(
      "animation.preset",
      ({ id, parameters = {} } = {}) =>
        animationCommands.preset(id, parameters),
      { category: "animation", mutates: false }
    )
    .register(
      "animation.pause",
      () => animationCommands.pause(),
      { category: "animation", mutates: false }
    )
    .register(
      "animation.resume",
      () => animationCommands.resume(),
      { category: "animation", mutates: false }
    )
    .register(
      "animation.stop",
      () => animationCommands.stop(),
      { category: "animation", mutates: false }
    )
    .register(
      "animation.status",
      () => animationCommands.status(),
      { category: "animation", mutates: false }
    )
    .register(
      "animation.presets.describe",
      () => animationCommands.presets(),
      { category: "animation", mutates: false }
    );

  const spatialPlanCommitService = new SpatialPlanCommitService({
    sandbox,
    editor,
    regionId: region.descriptor.id,
    geometryRegistry,
    appearanceRuntime
  });
  commands.register("program.plan.commit", ({ plan }) =>
    spatialPlanCommitService.commit(plan)
  );

  const programSession = new ProgramSessionController({
    workerFactory: () => createBrowserProgramSessionWorker(),
    timeoutMs: 5000,
    allowedCommands: [SPATIAL_CREATE_COMMAND],
    geometryTypes: geometryRegistry.list(),
    maxCommands: 10000
  });
  const experimentService = new ExperimentService({
    registry: experimentRegistry,
    programs: programSession,
    baseVersion: () => sandbox.revision
  });
  const experimentActionService = new ExperimentActionService({
    experiments: experimentService,
    commit: plan => spatialPlanCommitService.commit(plan)
  });
  commands.register(
    "experiment.create",
    ({ id, parameters = {} }) =>
      experimentActionService.create(id, parameters),
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
  runtime.onDispose(() => animationRuntime.dispose());

  // O Inspector consulta estas propriedades durante sua construção.
  queries
    .register("properties.describe", () =>
      propertyRegistry.describe()
    )
    .register("selection.properties.inspect", () =>
      propertyService.inspectSelection()
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
      animationCommands.status()
    )
    .register("animation.presets.describe", () =>
      animationCommands.presets()
    )
    .register("runtime.profile", () => profile)
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

  const procedureCatalog = new ProcedureCatalog({
    storage: new BrowserProcedureCatalogStore()
  });
  const procedureCatalogEditor = new ProcedureCatalogEditor({
    root: procedureEditorRoot,
    catalog: procedureCatalog
  });
  runtime.onDispose(() => procedureCatalogEditor.dispose());
  runtime.onDispose(() => programSession.dispose());

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
    .register("developer.state", () => ({
      build: buildInfo.build,
      version: buildInfo.version,
      channel: buildInfo.channel,
      selection: editor.selection.snapshot(),
      editor: editor.snapshot(),
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
      renderer: renderer.renderer?.info?.render ?? null,
      appearance: appearanceRuntime.stats(),
      incremental: renderer.getIncrementalDiagnostics(),
      runtimeApi: {
        version: SpatialSeedRuntime.apiVersion,
        metrics: runtime.metrics()
      }
    }))
    .register("runtime.performance", () => runtime.metrics());

  capabilities
    .register("animation", () => ({
      apiVersion: ANIMATION_RUNTIME_VERSION,
      commandApiVersion: ANIMATION_COMMAND_SERVICE_VERSION,
      mode: "ephemeral-render-overlay",
      safeMath: true,
      persistent: false
    }))
    .register("runtimeProfiles", () => ({
      active: profile,
      available: describeRuntimeProfiles()
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
      animationRuntime.sceneChanged();
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
    }
  );

  const unsubscribeSelection = editor.selection.subscribe(
    snapshot => runtime.emit("selection.changed", snapshot)
  );

  const unsubscribeEditor = editor.subscribe(
    snapshot => runtime.emit("editor.changed", snapshot)
  );

  runtime
    .onDispose(unsubscribeEditor)
    .onDispose(unsubscribeSelection)
    .onDispose(unsubscribeSandbox);

  return Object.freeze({
    buildInfo,
    runtime,
    web: Object.freeze({
      region,
      sandbox,
      editor,
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
      geometryRegistry,
      propertyRegistry,
      propertyService,
      experimentRegistry,
      experimentService,
      experimentActionService,
      programSession,
      spatialPlanCommitService,
      animationRuntime,
      animationCommands,
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
