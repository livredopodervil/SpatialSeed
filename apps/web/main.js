import { EventBus } from "../../packages/core/src/EventBus.js";
import { Region } from "../../packages/core/src/Region.js";
import { Sandbox } from "../../packages/core/src/Sandbox.js";
import { ModuleRegistry } from "../../packages/plugin-api/src/ModuleRegistry.js";
import { EditorState } from "../../packages/editor-core/src/EditorState.js";
import { boxRegionReducer } from "../../packages/region-box/src/reducer.js";
import { ThreeRegionRenderer } from "../../packages/renderer-three/src/ThreeRegionRenderer.js";
import { OutlineRenderer } from "../../packages/renderer-outline/src/OutlineRenderer.js";

const $ = id => document.getElementById(id);

const showError = error => {
  $("error-box").hidden = false;
  $("error-box").textContent = error?.stack || String(error);
  $("status").textContent = "Falha parcial";
  console.error(error);
};

addEventListener("error", event =>
  showError(event.error || event.message)
);
addEventListener("unhandledrejection", event =>
  showError(event.reason)
);

const modules = new ModuleRegistry();

modules.register({
  manifest: {
    id: "region.box",
    version: "0.4.0",
    apiVersion: "region-v1",
    optional: false
  },
  activate: async context => {
    context.reducers.set("box-region", boxRegionReducer);
  }
});

const reducers = new Map();

await modules.activateAll({
  eventBus: new EventBus(),
  reducers
});

const reducer = reducers.get("box-region");

if (!reducer) {
  throw new Error("Reducer box-region unavailable");
}

const region = new Region(
  {
    id: "region-main",
    name: "Região principal",
    type: "box-region"
  },
  {
    schemaVersion: 1,
    objects: [
      {
        id: "box-1",
        kind: "box",
        name: "Caixa 1",
        position: [-3, 1, 0],
        rotation: [0, 0, 0, 1],
        scale: [1, 1, 1],
        size: [2, 2, 2],
        material: { color: "#5b8bd9" }
      },
      {
        id: "box-2",
        kind: "box",
        name: "Caixa 2",
        position: [0, 1, 0],
        rotation: [0, 0, 0, 1],
        scale: [1, 1, 1],
        size: [2, 2, 2],
        material: { color: "#d98067" }
      },
      {
        id: "box-3",
        kind: "box",
        name: "Caixa 3",
        position: [3, 1, 0],
        rotation: [0, 0, 0, 1],
        scale: [1, 1, 1],
        size: [2, 2, 2],
        material: { color: "#72b883" }
      }
    ]
  }
);

const sandbox = new Sandbox(region, reducer);
const editor = new EditorState();

let renderer3d = null;

try {
  renderer3d = new ThreeRegionRenderer(
    $("world"),
    {
      dispatch: command => sandbox.dispatch(command),
      selection: editor.selection,
      editorState: editor
    }
  );
} catch (error) {
  showError(error);
}

const outline = new OutlineRenderer(
  $("outline-content")
);

function refresh(state = sandbox.getState()) {
  try {
    renderer3d?.update(state);
  } catch (error) {
    showError(error);
  }

  try {
    outline.update(
      region,
      sandbox,
      modules.describe()
    );
  } catch (error) {
    showError(error);
  }

  $("undo").disabled = !sandbox.canUndo;
  $("redo").disabled = !sandbox.canRedo;
  $("review").disabled = !sandbox.dirty;
  $("status").textContent =
    `região ${region.version} · sandbox ${
      sandbox.dirty ? "alterado" : "limpo"
    }`;
}

sandbox.subscribe(state => refresh(state));

editor.selection.subscribe(snapshot => {
  const active = snapshot.activeMember?.objectId;

  $("selection-content").textContent =
    snapshot.members.length
      ? snapshot.members
          .map(member =>
            member.objectId === active
              ? `${member.objectId} (ativo)`
              : member.objectId
          )
          .join(", ")
      : "∅";
});

editor.subscribe(snapshot => {
  $("multi-select").textContent =
    snapshot.multiSelect
      ? "Seleção: múltipla"
      : "Seleção: única";

  $("edit-pivot").textContent =
    snapshot.pivot.editing
      ? "Concluir pivô"
      : "Editar pivô";

  $("pivot-policy").value =
    snapshot.pivot.policy;

  $("pivot-content").textContent =
    snapshot.pivot.policy === "custom"
      ? `Pivô personalizado: ${snapshot.pivot.customPosition
          .map(value => value.toFixed(2))
          .join(", ")}`
      : `Pivô: ${snapshot.pivot.policy}`;
});

document
  .querySelectorAll("[data-transform]")
  .forEach(button => {
    button.addEventListener("click", () =>
      renderer3d?.setTransformMode(
        button.dataset.transform
      )
    );
  });

$("space").addEventListener("click", event => {
  const next = renderer3d?.toggleSpace();
  if (next) {
    event.currentTarget.textContent =
      next === "world" ? "Mundo" : "Local";
  }
});

$("multi-select").addEventListener("click", () => {
  editor.setMultiSelect(!editor.multiSelect);
});

$("clear-selection").addEventListener("click", () => {
  editor.selection.clear();
});

$("pivot-policy").addEventListener("change", event => {
  editor.setPivotEditing(false);
  editor.setPivotPolicy(event.target.value);
});

$("edit-pivot").addEventListener("click", () => {
  const enabled = !editor.pivot.editing;

  if (!renderer3d?.setPivotEditing(enabled)) {
    $("status").textContent =
      "Selecione ao menos um objeto para editar o pivô";
  }
});

$("add-box").addEventListener("click", () => {
  const i = sandbox.getState().objects.length + 1;

  sandbox.dispatch({
    type: "object.create",
    id: crypto.randomUUID(),
    name: `Caixa ${i}`,
    position: [0, 1, -i],
    color: "#8a78d1"
  });
});

$("undo").addEventListener("click", () => sandbox.undo());
$("redo").addEventListener("click", () => sandbox.redo());

$("structure").addEventListener("click", () => {
  $("outline").hidden = !$("outline").hidden;
});

$("close-outline").addEventListener("click", () => {
  $("outline").hidden = true;
});

$("review").addEventListener("click", () => {
  const proposal = sandbox.createProposal();
  $("review-content").textContent =
    JSON.stringify(proposal, null, 2);
  $("review-panel").hidden = false;
});

$("close-review").addEventListener("click", () => {
  $("review-panel").hidden = true;
});

$("cancel-proposal").addEventListener("click", () => {
  $("review-panel").hidden = true;
});

$("confirm-proposal").addEventListener("click", () => {
  const proposal = sandbox.createProposal();
  const result = region.acceptProposal(proposal);

  $("review-content").textContent =
    JSON.stringify({ proposal, result }, null, 2);

  if (result.accepted) {
    sandbox.rebaseFromRegion();
    $("status").textContent =
      `proposta aceita · região ${region.version}`;
    $("review-panel").hidden = true;
  }
});
