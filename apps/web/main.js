import { EventBus } from "../../packages/core/src/EventBus.js?build=20260714-0020a-a";
import { Region } from "../../packages/core/src/Region.js?build=20260714-0020a-a";
import { Sandbox } from "../../packages/core/src/Sandbox.js?build=20260714-0020a-a";
import { ModuleRegistry } from "../../packages/plugin-api/src/ModuleRegistry.js?build=20260714-0020a-a";
import { EditorState } from "../../packages/editor-core/src/EditorState.js?build=20260714-0020a-a";
import { boxRegionReducer } from "../../packages/region-box/src/reducer.js?build=20260714-0020a-a";
import { ThreeRegionRenderer } from "../../packages/renderer-three/src/ThreeRegionRenderer.js?build=20260714-0020a-a";
import { OutlineRenderer } from "../../packages/renderer-outline/src/OutlineRenderer.js?build=20260714-0020a-a";
import { DevConsole } from "../../packages/devtools/src/DevConsole.js?build=20260714-0020a-a";
import { ObjectInspector } from "../../packages/object-inspector/src/ObjectInspector.js?build=20260714-0020a-a";
import { TransformToolPanel } from "../../packages/editor-transform-tools/src/TransformToolPanel.js?build=20260714-0020a-a";
import { SelectionOperations } from "../../packages/selection-operations/src/SelectionOperations.js?build=20260714-0020a-a";
import { createEditorCommands } from "../../packages/editor-commands/src/EditorCommands.js?build=20260714-0020a-a";
import { ProjectService } from "../../packages/project-files/src/ProjectService.js?build=20260714-0020a-a";
import { BenchmarkRunner } from "../../packages/benchmarks/src/BenchmarkRunner.js?build=20260714-0020a-a";
import { TestService } from "../../packages/tests/src/TestService.js?build=20260714-0020a-a";
import { activateRuntimeTestPlugin } from "../../packages/runtime-test-plugin/src/index.js?build=20260714-0020a-a";
import { AppearanceRuntime } from "../../packages/appearance-runtime/src/index.js?build=20260714-0020a-a";
import { classifyChanges } from "../../packages/incremental-runtime/src/index.js?build=20260714-0020a-a";
import { ResourceAudit } from "../../packages/resource-audit/src/index.js?build=20260714-0020a-a";

const BUILD = "20260714-0020a-a";
const EXPECTED_RENDERER_API = "renderer-three-selection-pivot-v2";
const EXPECTED_EDITOR_API = "editor-state-v2";
const $ = id => document.getElementById(id);

const diagnostics = {
  build: BUILD,
  location: location.href,
  userAgent: navigator.userAgent,
  rendererApi: ThreeRegionRenderer.apiVersion ?? "missing",
  editorApi: EditorState.apiVersion ?? "missing",
  modules: {}
};

function showError(error) {
  $("error-box").hidden = false;
  $("error-box").textContent = error?.stack || String(error);
  $("status").textContent = "Falha parcial";
  console.error(error);
}


let statusTimer = null;

function showNotice(message, duration = 2200) {
  clearTimeout(statusTimer);
  $("status").textContent = message;

  statusTimer = setTimeout(() => {
    refreshUi(sandbox.getSnapshot());
  }, duration);
}

function executeUiCommand(id, args = {}) {
  try {
    const result = editorCommands.execute(id, args);

    $("error-box").hidden = true;
    $("error-box").textContent = "";

    const notices = {
      "selection-empty":
        "Selecione ao menos um objeto.",
      "no-repeat-history":
        "Ainda não há uma duplicação transformada para repetir.",
      "stale-repeat-history":
        "O histórico de repetição ficou inválido e foi limpo."
    };

    if (result?.reason && notices[result.reason]) {
      showNotice(notices[result.reason]);
    }

    return result;
  } catch (error) {
    const message = error?.message ?? String(error);

    if (/seleção está vazia/i.test(message)) {
      showNotice("Selecione ao menos um objeto.");
      return { changed: false, reason: "selection-empty" };
    }

    showError(error);
    return { changed: false, reason: "internal-error" };
  }
}


addEventListener("error", event => showError(event.error || event.message));
addEventListener("unhandledrejection", event => showError(event.reason));

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

const modules = new ModuleRegistry();
modules.register({
  manifest: {
    id: "region.box",
    version: "0.5.0",
    apiVersion: "region-v1",
    optional: false
  },
  activate: async context => context.reducers.set("box-region", boxRegionReducer)
});

const reducers = new Map();
await modules.activateAll({ eventBus: new EventBus(), reducers });
const reducer = reducers.get("box-region");
if (!reducer) throw new Error("Reducer box-region unavailable");

const appearanceRuntime = new AppearanceRuntime();

const initialScene = appearanceRuntime.normalizeScene({
  schemaVersion: 1,
  objects: [
    {id:"box-1",kind:"box",name:"Caixa 1",position:[-3,1,0],rotation:[0,0,0,1],scale:[1,1,1],size:[2,2,2],material:{color:"#5b8bd9"}},
    {id:"box-2",kind:"box",name:"Caixa 2",position:[0,1,0],rotation:[0,0,0,1],scale:[1,1,1],size:[2,2,2],material:{color:"#d98067"}},
    {id:"box-3",kind:"box",name:"Caixa 3",position:[3,1,0],rotation:[0,0,0,1],scale:[1,1,1],size:[2,2,2],material:{color:"#72b883"}}
  ]
});

const region = new Region(
  { id: "region-main", name: "Região principal", type: "box-region" },
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

const renderer3d = new ThreeRegionRenderer($("world"), {
  dispatch: dispatchRuntimeCommand,
  selection: editor.selection,
  editorState: editor,
  projectObject: object => appearanceRuntime.projectObject(object)
});

const outline = new OutlineRenderer($("outline-content"));

const consoleLines = [];
const consoleInputHistory = [];
let consoleHistoryIndex = 0;
let lastConsoleText = "";

function appendConsole(entry) {
  const line = {
    time: new Date().toLocaleTimeString(),
    ...entry
  };

  consoleLines.push(line);

  if (consoleLines.length > 100) {
    consoleLines.splice(0, consoleLines.length - 100);
  }

  const output = $("console-output");

  if (output) {
    output.value = consoleLines
      .map(item =>
        `[${item.time}] ${item.input ?? item.type}\n` +
        `${JSON.stringify(item.result ?? item.error, null, 2)}`
      )
      .join("\n\n");

    lastConsoleText = consoleLines.length
      ? `[${consoleLines.at(-1).time}] ${consoleLines.at(-1).input ?? consoleLines.at(-1).type}\n` +
        `${JSON.stringify(consoleLines.at(-1).result ?? consoleLines.at(-1).error, null, 2)}`
      : "";

    output.scrollTop = output.scrollHeight;
  }
}

function collectDeveloperState() {
  return {
    build: BUILD,
    selection: editor.selection.snapshot(),
    editor: editor.snapshot(),
    input: renderer3d.getInputDiagnostics(),
    transform: {
      mode: renderer3d.transform?.mode ?? null,
      space: renderer3d.transform?.space ?? null,
      axis: renderer3d.transform?.axis ?? null,
      dragging: renderer3d.transform?.dragging ?? false
    },
    sandbox: {
      baseVersion: sandbox.baseVersion,
      dirty: sandbox.dirty,
      canUndo: sandbox.canUndo,
      canRedo: sandbox.canRedo,
      objectCount: sandbox.getState().objects.length
    },
    renderer: renderer3d.renderer?.info?.render ?? null,
    appearance: appearanceRuntime.stats(),
    incremental: renderer3d.getIncrementalDiagnostics()
  };
}

const selectionOperations = new SelectionOperations({
  editor,
  sandbox,
  regionId: region.descriptor.id
});

const projectService = new ProjectService({
  sandbox,
  editor,
  renderer: renderer3d,
  region,
  appearanceRuntime
});

const benchmarkRunner = new BenchmarkRunner({
  reducer,
  projectService
});

const resourceAudit =
  new ResourceAudit({
    sandbox,
    editor,
    renderer: renderer3d,
    appearanceRuntime,
    selectionOperations
  });

const editorCommands = createEditorCommands({
  editor,
  renderer: renderer3d,
  selectionOperations,
  projectService,
  benchmarkRunner,
  resourceAudit
});

const runtimeTestPlugin = activateRuntimeTestPlugin({
  commands: editorCommands
});

const testService = new TestService({
  reducer,
  commands: editorCommands,
  projectService
});

editorCommands
  .register("test.help", () =>
    testService.help()
  )
  .register("test.run", ({ suite }) =>
    testService.run(suite)
  );


const transformToolPanel = new TransformToolPanel({
  root: $("transform-tools-panel"),
  renderer: renderer3d
});

const objectInspector = new ObjectInspector({
  root: $("inspector-panel"),
  editor,
  sandbox,
  appearanceRuntime,
  dispatch: dispatchRuntimeCommand
});

const devConsole = new DevConsole({
  editor,
  sandbox,
  region,
  renderer: renderer3d,
  getDiagnostics: collectDeveloperState,
  onOutput: appendConsole,
  commands: editorCommands
});

function refreshDeveloperPanel() {
  if ($("developer-panel").hidden) return;

  const state = collectDeveloperState();

  $("developer-live").innerHTML = Object.entries(state)
    .map(([name, value]) =>
      `<div class="dev-card"><strong>${name}</strong>\n` +
      `${escapeHtml(JSON.stringify(value, null, 2))}</div>`
    )
    .join("");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

setInterval(refreshDeveloperPanel, 400);

function refreshUi(state) {
  if (!$("outline").hidden) {
    outline.update(region, sandbox, modules.describe(), state);
  }

  $("undo").disabled = !sandbox.canUndo;
  $("redo").disabled = !sandbox.canRedo;
  $("review").disabled = !sandbox.dirty;
  $("status").textContent =
    `build ${BUILD} · região ${region.version} · sandbox ${sandbox.dirty ? "alterado" : "limpo"}`;
}

sandbox.subscribe((state, changes) => {
  const classification = classifyChanges(changes);

  if (classification.mode === "incremental") {
    renderer3d.applyChanges(state, classification.changes);
  } else {
    renderer3d.update(state);
  }

  refreshUi(state);
});

editor.selection.subscribe(snapshot => {
  const active = snapshot.activeMember?.objectId;
  $("selection-content").textContent =
    snapshot.members.length
      ? snapshot.members.length <= 20
        ? snapshot.members.map(member =>
            member.objectId === active
              ? `${member.objectId} (ativo)`
              : member.objectId
          ).join(", ")
        : `${snapshot.members.length} objetos · ativo ${active}`
      : "∅";
  diagnostics.selection = snapshot;

  const empty = snapshot.members.length === 0;

  $("clear-selection").disabled = empty;
  $("edit-pivot").disabled = empty;
  $("duplicate-selection").disabled = empty;
  $("delete-selection").disabled = empty;
  $("inspector").disabled = empty;
});

editor.subscribe(snapshot => {
  $("multi-select").textContent = snapshot.multiSelect ? "Seleção: múltipla" : "Seleção: única";
  $("edit-pivot").textContent = snapshot.pivot.editing ? "Concluir pivô" : "Editar pivô";
  $("pivot-policy").value = snapshot.pivot.policy;

  document.querySelectorAll("[data-transform]").forEach(button => {
    button.dataset.active =
      button.dataset.transform === snapshot.tool.mode
        ? "true"
        : "false";
  });
  $("pivot-content").textContent = snapshot.pivot.policy === "custom"
    ? `Pivô personalizado: ${snapshot.pivot.customPosition.map(v => v.toFixed(2)).join(", ")}`
    : `Pivô: ${snapshot.pivot.policy}`;
  diagnostics.editor = snapshot;
});

document.querySelectorAll("[data-transform]").forEach(button => {
  button.addEventListener("click", () =>
    executeUiCommand("tool.set", {
      mode: button.dataset.transform
    })
  );
});

$("space").addEventListener("click", event => {
  const result = executeUiCommand("space.toggle");

  if (result?.space) {
    event.currentTarget.textContent =
      result.space === "world" ? "Mundo" : "Local";
  }
});

$("multi-select").addEventListener("click", () =>
  executeUiCommand("selection.multi.toggle")
);
$("clear-selection").addEventListener("click", () =>
  executeUiCommand("selection.clear")
);
$("pivot-policy").addEventListener("change", event => {
  executeUiCommand("pivot.policy", {
    policy: event.target.value
  });
});
$("edit-pivot").addEventListener("click", () => {
  executeUiCommand("pivot.edit.toggle");
});

$("add-box").addEventListener("click", () => {
  executeUiCommand("object.create.box");
});

$("undo").addEventListener("click", () => executeUiCommand("history.undo"));
$("redo").addEventListener("click", () => executeUiCommand("history.redo"));
$("structure").addEventListener("click", () => $("outline").hidden = !$("outline").hidden);
$("close-outline").addEventListener("click", () => $("outline").hidden = true);

$("project-save").addEventListener("click", () => {
  const result = executeUiCommand("project.save");
  if (result?.downloaded) {
    showNotice(`Projeto salvo: ${result.filename}`);
  }
});

$("project-open").addEventListener("click", () => {
  $("project-file-input").click();
});

$("project-file-input").addEventListener("change", async event => {
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    const text = await file.text();
    const result = executeUiCommand("project.open", { text });
    if (result?.loaded) {
      showNotice(
        `Projeto aberto: ${result.name} ` +
        `(${result.objectCount} objetos)`
      );
    }
  } finally {
    event.target.value = "";
  }
});

$("project-new").addEventListener("click", () => {
  const confirmed = confirm(
    "Criar um projeto vazio? Alterações não salvas serão descartadas."
  );
  if (!confirmed) return;

  const result = executeUiCommand("project.new");
  if (result?.created) showNotice("Novo projeto criado.");
});

$("diagnostics").addEventListener("click", () => {
  diagnostics.regionVersion = region.version;
  diagnostics.sandbox = {
    baseVersion: sandbox.baseVersion,
    dirty: sandbox.dirty,
    canUndo: sandbox.canUndo,
    canRedo: sandbox.canRedo
  };
  diagnostics.input = renderer3d.getInputDiagnostics();
  $("diagnostic-content").value = JSON.stringify(diagnostics, null, 2);
  $("diagnostic-panel").hidden = false;
});
$("close-diagnostics").addEventListener("click", () => $("diagnostic-panel").hidden = true);

$("duplicate-selection").addEventListener("click", () => {
  executeUiCommand("selection.duplicate");
});

$("repeat-duplicate").addEventListener("click", () => {
  executeUiCommand("selection.repeat");
});

$("delete-selection").addEventListener("click", () => {
  executeUiCommand("selection.delete");
});

$("transform-tools").addEventListener("click", () => {
  $("transform-tools-panel").hidden = false;
  transformToolPanel.refresh();
});

$("close-transform-tools").addEventListener("click", () => {
  $("transform-tools-panel").hidden = true;
});

$("inspector").addEventListener("click", () => {
  $("inspector-panel").hidden = false;
  objectInspector.refresh();
});
$("close-inspector").addEventListener("click", () => { $("inspector-panel").hidden = true; });

$("developer").addEventListener("click", () => {
  $("developer-panel").hidden = false;
  refreshDeveloperPanel();
});

$("close-developer").addEventListener("click", () => {
  $("developer-panel").hidden = true;
});

$("console-run").addEventListener("click", () => {
  const input = $("console-input").value.trim();

  if (!input) return;

  if (consoleInputHistory.at(-1) !== input) {
    consoleInputHistory.push(input);
  }

  consoleHistoryIndex = consoleInputHistory.length;
  devConsole.execute(input);
  refreshDeveloperPanel();
});

$("console-help").addEventListener("click", () => {
  $("console-input").value = "help";
  $("console-run").click();
});

$("console-clear").addEventListener("click", () => {
  consoleLines.length = 0;
  lastConsoleText = "";
  $("console-output").value = "";
});

$("console-clear-input").addEventListener("click", () => {
  $("console-input").value = "";
  $("console-input").focus();
});

$("console-copy-all").addEventListener("click", async () => {
  await copyText($("console-output").value, $("console-copy-all"));
});

$("console-copy-last").addEventListener("click", async () => {
  await copyText(lastConsoleText, $("console-copy-last"));
});

$("copy-diagnostics").addEventListener("click", async () => {
  await copyText($("diagnostic-content").value, $("copy-diagnostics"));
});

$("console-input").addEventListener("keydown", event => {
  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
    event.preventDefault();
    $("console-run").click();
    return;
  }

  if (event.key === "ArrowUp" && consoleInputHistory.length) {
    event.preventDefault();
    consoleHistoryIndex = Math.max(0, consoleHistoryIndex - 1);
    $("console-input").value =
      consoleInputHistory[consoleHistoryIndex] ?? "";
    return;
  }

  if (event.key === "ArrowDown" && consoleInputHistory.length) {
    event.preventDefault();
    consoleHistoryIndex = Math.min(
      consoleInputHistory.length,
      consoleHistoryIndex + 1
    );
    $("console-input").value =
      consoleInputHistory[consoleHistoryIndex] ?? "";
  }
});

$("review").addEventListener("click", () => {
  $("review-content").textContent = JSON.stringify(sandbox.createProposal(), null, 2);
  $("review-panel").hidden = false;
});
$("close-review").addEventListener("click", () => $("review-panel").hidden = true);
$("cancel-proposal").addEventListener("click", () => $("review-panel").hidden = true);
$("confirm-proposal").addEventListener("click", () => {
  const proposal = sandbox.createProposal();
  const result = region.acceptProposal(proposal);
  $("review-content").textContent = JSON.stringify({ proposal, result }, null, 2);
  if (result.accepted) {
    sandbox.rebaseFromRegion();
    $("review-panel").hidden = true;
  }
});


async function copyText(text, button) {
  const value = String(text ?? "");

  if (!value) return false;

  try {
    await navigator.clipboard.writeText(value);
  } catch {
    const temporary = document.createElement("textarea");
    temporary.value = value;
    temporary.style.position = "fixed";
    temporary.style.opacity = "0";
    document.body.appendChild(temporary);
    temporary.select();
    document.execCommand("copy");
    temporary.remove();
  }

  const original = button.textContent;
  button.textContent = "Copiado";
  setTimeout(() => { button.textContent = original; }, 900);
  return true;
}

window.__SPATIAL_SEED__ = {
  build: BUILD,
  diagnostics,
  region,
  sandbox,
  editor,
  renderer3d,
  devConsole,
  collectDeveloperState,
  objectInspector,
  transformToolPanel,
  selectionOperations,
  editorCommands,
  appearanceRuntime
};
