import { FloatingPanelManager, SelectionMarquee, attachScrubbableFields } from "../../../packages/ui-widgets/src/index.js?build=20260714-0021b";

const BUILD = "20260715-0022b";

export function bindWebInterface({
  runtime,
  web,
  documentRoot = document
}) {
  const $ = id => documentRoot.getElementById(id);
  const {
    region,
    sandbox,
    editor,
    renderer,
    outline,
    modules,
    devConsole,
    objectInspector,
    transformToolPanel
  } = web;

  const diagnostics = {
    build: BUILD,
    location: location.href,
    userAgent: navigator.userAgent
  };

  const consoleLines = [];
  const consoleInputHistory = [];
  let consoleHistoryIndex = 0;
  let lastConsoleText = "";
  let statusTimer = null;
  let latestSelection = runtime.query("selection.snapshot");
  let latestEditor = runtime.query("editor.snapshot");
  const panelManager = new FloatingPanelManager({
    root: documentRoot
  });
  for (const selector of [
    "#outline",
    "#review-panel",
    "#diagnostic-panel",
    "#developer-panel",
    "#console-panel",
    "#inspector-panel",
    "#transform-tools-panel"
  ]) {
    panelManager.register(selector);
  }
  attachScrubbableFields(documentRoot);
  const marquee=new SelectionMarquee({canvas:$("world"),element:$("selection-marquee"),onComplete:r=>renderer.selectScreenRect(r,latestEditor.selectionOperation)});

  function showError(error) {
    $("error-box").hidden = false;
    $("error-box").textContent = error?.stack || String(error);
    $("status").textContent = "Falha parcial";
    console.error(error);
  }

  function refreshUi() {
    const state = runtime.query("world.snapshot");
    const status = runtime.query("runtime.status");

    if (!$("outline").hidden) {
      outline.update(region, sandbox, modules.describe(), state);
    }

    $("undo").disabled = !status.canUndo;
    $("redo").disabled = !status.canRedo;
    $("review").disabled = !status.dirty;
    const count=latestSelection?.members?.length??0,active=latestSelection?.activeMember?.objectId??"∅",mode=latestEditor?.tool?.mode??"select",operation=latestEditor?.selectionOperation??"replace";
    $("status").textContent=`${count} selecionados · ativo ${active} · ${mode} · ${operation} · sandbox ${status.dirty?"alterado":"limpo"}`;
  }

  function showNotice(message, duration = 2200) {
    clearTimeout(statusTimer);
    $("status").textContent = message;
    statusTimer = setTimeout(refreshUi, duration);
  }

  function execute(id, args = {}) {
    try {
      const result = runtime.execute(id, args);
      $("error-box").hidden = true;
      $("error-box").textContent = "";

      const notices = {
        "selection-empty": "Selecione ao menos um objeto.",
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
      if (/seleção está vazia/i.test(error?.message ?? "")) {
        showNotice("Selecione ao menos um objeto.");
        return { changed: false, reason: "selection-empty" };
      }

      showError(error);
      return { changed: false, reason: "internal-error" };
    }
  }

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

    if (!output) return;

    output.value = consoleLines
      .map(item =>
        `[${item.time}] ${item.input ?? item.type}\n` +
        `${JSON.stringify(item.result ?? item.error, null, 2)}`
      )
      .join("\n\n");

    lastConsoleText = consoleLines.length
      ? `[${consoleLines.at(-1).time}] ` +
        `${consoleLines.at(-1).input ?? consoleLines.at(-1).type}\n` +
        `${JSON.stringify(
          consoleLines.at(-1).result ??
          consoleLines.at(-1).error,
          null,
          2
        )}`
      : "";

    output.scrollTop = output.scrollHeight;
  }

  devConsole.onOutput = appendConsole;

  function refreshDeveloperPanel() {
    if ($("developer-panel").hidden) return;

    const state = runtime.query("developer.state");

    $("developer-live").innerHTML = Object.entries(state)
      .map(([name, value]) =>
        `<div class="dev-card"><strong>${name}</strong>\n` +
        `${escapeHtml(JSON.stringify(value, null, 2))}</div>`
      )
      .join("");
  }

  const developerTimer = setInterval(
    refreshDeveloperPanel,
    400
  );

  const unsubscribeWorld = runtime.subscribe(
    "world.changed",
    refreshUi
  );

  const unsubscribeSelection = runtime.subscribe(
    "selection.changed",
    snapshot => {
      latestSelection=snapshot;
      const active = snapshot.activeMember?.objectId;
      $("selection-summary").textContent=`${snapshot.members.length} selecionado${snapshot.members.length===1?"":"s"}`;

      $("selection-content").textContent =
        snapshot.members.length
          ? snapshot.members.length <= 20
            ? snapshot.members
                .map(member =>
                  member.objectId === active
                    ? `${member.objectId} (ativo)`
                    : member.objectId
                )
                .join(", ")
            : `${snapshot.members.length} objetos · ativo ${active}`
          : "∅";

      const empty = snapshot.members.length === 0;

      $("clear-selection").disabled = empty;
      $("edit-pivot").disabled = empty;
      $("duplicate-selection").disabled = empty;
      $("delete-selection").disabled = empty;
      $("inspector").disabled = empty;
      refreshUi();
    }
  );

  const unsubscribeEditor = runtime.subscribe(
    "editor.changed",
    snapshot => {
      latestEditor=snapshot;
      $("multi-select").textContent = snapshot.multiSelect
        ? "Seleção: múltipla"
        : "Seleção: única";

      $("edit-pivot").textContent = snapshot.pivot.editing
        ? "Concluir pivô"
        : "Editar pivô";

      $("pivot-policy").value = snapshot.pivot.policy;

      documentRoot.querySelectorAll("[data-tool-mode]").forEach(button=>{button.dataset.active=button.dataset.toolMode===snapshot.tool.mode?"true":"false"});
      documentRoot.querySelectorAll("[data-selection-op]").forEach(button=>{button.dataset.active=button.dataset.selectionOp===snapshot.selectionOperation?"true":"false"});
      $("area-selection").dataset.active=snapshot.areaSelection?"true":"false";
      marquee.setEnabled(snapshot.tool.mode==="select"&&snapshot.areaSelection);
      refreshUi();

      $("pivot-content").textContent =
        snapshot.pivot.policy === "custom"
          ? `Pivô personalizado: ${
              snapshot.pivot.customPosition
                .map(value => value.toFixed(2))
                .join(", ")
            }`
          : `Pivô: ${snapshot.pivot.policy}`;
    }
  );

  documentRoot.querySelectorAll("[data-tool-mode]").forEach(button=>button.addEventListener("click",()=>renderer.setTransformMode(button.dataset.toolMode)));
  documentRoot.querySelectorAll("[data-selection-op]").forEach(button=>button.addEventListener("click",()=>renderer.setSelectionOperation(button.dataset.selectionOp)));
  $("area-selection").addEventListener("click",()=>editor.setAreaSelection(!editor.areaSelection));

  $("space").addEventListener("click", event => {
    const result = execute("space.toggle");

    if (result?.space) {
      event.currentTarget.textContent =
        result.space === "world" ? "Mundo" : "Local";
    }
  });

  $("multi-select").addEventListener(
    "click",
    () => execute("selection.multi.toggle")
  );

  $("clear-selection").addEventListener(
    "click",
    () => execute("selection.clear")
  );

  $("pivot-policy").addEventListener("change", event =>
    execute("pivot.policy", { policy: event.target.value })
  );

  $("edit-pivot").addEventListener(
    "click",
    () => execute("pivot.edit.toggle")
  );

  $("add-box").addEventListener(
    "click",
    () => execute("object.create.box")
  );

  $("undo").addEventListener(
    "click",
    () => execute("history.undo")
  );

  $("redo").addEventListener(
    "click",
    () => execute("history.redo")
  );

  $("structure").addEventListener("click", () => {
    $("outline").hidden = !$("outline").hidden;
  });

  $("close-outline").addEventListener(
    "click",
    () => { $("outline").hidden = true; }
  );

  $("project-save").addEventListener("click", () => {
    const result = execute("project.save");
    if (result?.downloaded) {
      showNotice(`Projeto salvo: ${result.filename}`);
    }
  });

  $("project-open").addEventListener(
    "click",
    () => $("project-file-input").click()
  );

  $("project-file-input").addEventListener(
    "change",
    async event => {
      const file = event.target.files?.[0];
      if (!file) return;

      try {
        const text = await file.text();
        const result = execute("project.open", { text });

        if (result?.loaded) {
          showNotice(
            `Projeto aberto: ${result.name} ` +
            `(${result.objectCount} objetos)`
          );
        }
      } finally {
        event.target.value = "";
      }
    }
  );

  $("project-new").addEventListener("click", () => {
    if (!confirm(
      "Criar um projeto vazio? Alterações não salvas serão descartadas."
    )) return;

    const result = execute("project.new");
    if (result?.created) showNotice("Novo projeto criado.");
  });

  $("diagnostics").addEventListener("click", () => {
    Object.assign(
      diagnostics,
      runtime.query("developer.state")
    );

    $("diagnostic-content").value =
      JSON.stringify(diagnostics, null, 2);

    $("diagnostic-panel").hidden = false;
  });

  $("close-diagnostics").addEventListener(
    "click",
    () => { $("diagnostic-panel").hidden = true; }
  );

  $("duplicate-selection").addEventListener(
    "click",
    () => execute("selection.duplicate")
  );

  $("repeat-duplicate").addEventListener(
    "click",
    () => execute("selection.repeat")
  );

  $("delete-selection").addEventListener(
    "click",
    () => execute("selection.delete")
  );

  $("transform-tools").addEventListener("click", () => {
    $("transform-tools-panel").hidden = false;
    transformToolPanel.refresh();
  });

  $("close-transform-tools").addEventListener(
    "click",
    () => { $("transform-tools-panel").hidden = true; }
  );

  $("inspector").addEventListener("click", () => {
    $("inspector-panel").hidden = false;
    objectInspector.refresh();
  });

  $("close-inspector").addEventListener(
    "click",
    () => { $("inspector-panel").hidden = true; }
  );

  $("developer").addEventListener("click", () => {
    panelManager.show("#developer-panel");
    refreshDeveloperPanel();
  });

  $("console").addEventListener("click", () => {
    panelManager.show("#console-panel");
    $("console-input").focus();
  });

  $("close-developer").addEventListener(
    "click",
    () => panelManager.hide("#developer-panel")
  );

  $("close-console").addEventListener(
    "click",
    () => panelManager.hide("#console-panel")
  );

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

  $("console-copy-all").addEventListener(
    "click",
    async () => copyText(
      $("console-output").value,
      $("console-copy-all")
    )
  );

  $("console-copy-last").addEventListener(
    "click",
    async () => copyText(
      lastConsoleText,
      $("console-copy-last")
    )
  );

  $("copy-diagnostics").addEventListener(
    "click",
    async () => copyText(
      $("diagnostic-content").value,
      $("copy-diagnostics")
    )
  );

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

  let sceneOnly = false;

  function isTextEditingTarget(target) {
    return Boolean(
      target?.closest?.(
        "input,textarea,select,[contenteditable='true']"
      )
    );
  }

  function setSceneOnly(enabled) {
    sceneOnly = Boolean(enabled);
    documentRoot.body.classList.toggle("ss-scene-only", sceneOnly);
    $("scene-only").dataset.active = sceneOnly ? "true" : "false";
    $("scene-only").setAttribute(
      "aria-pressed",
      sceneOnly ? "true" : "false"
    );
    return sceneOnly;
  }

  async function toggleViewportFullscreen() {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await documentRoot.documentElement.requestFullscreen({
          navigationUI: "hide"
        });
      }
    } catch (error) {
      showNotice(
        `Tela cheia indisponível: ${error?.message ?? error}`
      );
    }
  }

  function refreshFullscreenButton() {
    const active = Boolean(document.fullscreenElement);
    $("viewport-fullscreen").dataset.active =
      active ? "true" : "false";
    $("viewport-fullscreen").setAttribute(
      "aria-pressed",
      active ? "true" : "false"
    );
    $("viewport-fullscreen").title = active
      ? "Sair da tela cheia (F)"
      : "Alternar tela cheia do viewport (F)";
  }

  $("scene-only").addEventListener(
    "click",
    () => setSceneOnly(!sceneOnly)
  );
  $("viewport-fullscreen").addEventListener(
    "click",
    toggleViewportFullscreen
  );
  document.addEventListener(
    "fullscreenchange",
    refreshFullscreenButton
  );

  documentRoot.addEventListener("keydown", event => {
    if (isTextEditingTarget(event.target)) return;

    if (event.key === "Tab") {
      event.preventDefault();
      setSceneOnly(!sceneOnly);
      return;
    }

    if (event.key.toLowerCase() === "f") {
      event.preventDefault();
      toggleViewportFullscreen();
      return;
    }

    if (event.key === "Escape" && sceneOnly) {
      setSceneOnly(false);
    }
  });

  refreshFullscreenButton();

  $("review").addEventListener("click", () => {
    $("review-content").textContent =
      JSON.stringify(sandbox.createProposal(), null, 2);
    $("review-panel").hidden = false;
  });

  $("close-review").addEventListener(
    "click",
    () => { $("review-panel").hidden = true; }
  );

  $("cancel-proposal").addEventListener(
    "click",
    () => { $("review-panel").hidden = true; }
  );

  $("confirm-proposal").addEventListener("click", () => {
    const proposal = sandbox.createProposal();
    const result = region.acceptProposal(proposal);

    $("review-content").textContent =
      JSON.stringify({ proposal, result }, null, 2);

    if (result.accepted) {
      sandbox.rebaseFromRegion();
      $("review-panel").hidden = true;
    }
  });

  refreshUi();

  const initialSelection = runtime.query("selection.snapshot");
  runtime.emit("selection.changed", initialSelection);
  runtime.emit("editor.changed", runtime.query("editor.snapshot"));

  return Object.freeze({
    dispose() {
      clearInterval(developerTimer);
      clearTimeout(statusTimer);
      unsubscribeEditor();
      unsubscribeSelection();
      unsubscribeWorld();
      marquee.dispose();
      document.removeEventListener(
        "fullscreenchange",
        refreshFullscreenButton
      );
      panelManager.dispose();
    }
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

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
