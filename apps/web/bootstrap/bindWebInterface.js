import { FloatingPanelManager, SelectionMarquee, UiRefreshCoordinator, attachScrubbableFields, composeToolbar } from "../../../packages/ui-widgets/src/index.js?build=20260718-0027h";
import {
  BrowserProjectFileGateway
} from "../file-interop/BrowserProjectFileGateway.js?build=20260716-0026i";

export function bindWebInterface({
  runtime,
  web,
  buildInfo,
  uiConfiguration,
  pwaInstallController = null,
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
    procedureCatalog,
    procedureCatalogEditor,
    objectInspector,
    transformToolPanel,
    experimentPanel,
    connectUiDiagnostics
  } = web;

  const diagnostics = {
    build: buildInfo.build,
    version: buildInfo.version,
    channel: buildInfo.channel,
    location: location.href,
    userAgent: navigator.userAgent
  };
  const browserWindow = documentRoot.defaultView ?? window;
  const projectFiles = new BrowserProjectFileGateway({
    windowRef: browserWindow,
    documentRef: documentRoot
  });
  const procedureFiles = new BrowserProjectFileGateway({
    windowRef: browserWindow,
    documentRef: documentRoot,
    fileType: {
      description: "Biblioteca de procedimentos Spatial Seed",
      accept: {
        "application/json": [".ssproc.json", ".json"]
      }
    }
  });
  const refreshProjectFileCapabilities = () => {
    browserWindow.__SPATIAL_SEED_FILE_INTEROP__ =
      projectFiles.capabilities();
  };
  refreshProjectFileCapabilities();

  const consoleLines = [];
  const consoleInputHistory = [];
  let consoleHistoryIndex = 0;
  let lastConsoleText = "";
  let statusTimer = null;
  let latestSelection = runtime.query("selection.snapshot");
  let latestEditor = runtime.query("editor.snapshot");
  const toolbarBinding = composeToolbar({
    root: documentRoot,
    configuration: uiConfiguration?.toolbar
  });
  const installButton = $("pwa-install");
  const installLabels = {
    available: "Instalar aplicativo",
    installing: "Finalizando instalação…",
    installed: "Aplicativo instalado",
    manual: "Como instalar"
  };
  const refreshInstallButton = state => {
    const mode = state?.mode ?? "manual";
    installButton.textContent = installLabels[mode] ?? installLabels.manual;
    installButton.disabled = mode === "installing" || mode === "installed";
    installButton.dataset.installMode = mode;
  };
  const unsubscribeInstall = pwaInstallController?.subscribe(
    refreshInstallButton
  ) ?? (() => {});
  refreshInstallButton(pwaInstallController?.snapshot());
  const sceneExit = uiConfiguration?.presentation?.sceneExit ?? {
    corner: "top-left",
    size: 64
  };
  $("scene-exit-hotspot").dataset.corner = sceneExit.corner;
  $("scene-exit-hotspot").style.setProperty(
    "--ss-scene-exit-size",
    `${sceneExit.size}px`
  );
  const sceneHelpDialog = $("scene-help-dialog");
  const sceneHelpSuppress = $("scene-help-suppress");
  const sceneHelpStorageKey = sceneExit.helpStorageKey;
  const cornerLabels = {
    "top-left":"superior esquerdo",
    "top-right":"superior direito",
    "bottom-left":"inferior esquerdo",
    "bottom-right":"inferior direito"
  };
  $("scene-help-message").textContent =
    `Para restaurar a interface, toque no canto ${
      cornerLabels[sceneExit.corner]
    } da cena.`;
  const isSceneHelpSuppressed = () => {
    try {
      return localStorage.getItem(sceneHelpStorageKey) === "suppressed";
    } catch {
      return false;
    }
  };
  const showSceneHelp = ({ manual = false } = {}) => {
    const suppressed = isSceneHelpSuppressed();
    if (suppressed && !manual) return false;
    sceneHelpSuppress.checked = suppressed;
    if (typeof sceneHelpDialog.showModal === "function") {
      if (!sceneHelpDialog.open) sceneHelpDialog.showModal();
    } else {
      sceneHelpDialog.setAttribute("open", "");
    }
    return true;
  };
  sceneHelpDialog.addEventListener("close", () => {
    try {
      if (sceneHelpSuppress.checked) {
        localStorage.setItem(sceneHelpStorageKey, "suppressed");
      } else {
        localStorage.removeItem(sceneHelpStorageKey);
      }
    } catch {}
  });
  sceneHelpDialog.addEventListener("cancel", event => {
    event.preventDefault();
    sceneHelpDialog.close();
    if (sceneOnly) setSceneOnly(false);
  });
  const panelManager = new FloatingPanelManager({
    root: documentRoot,
    storageKey: uiConfiguration?.panels?.storageKey
  });
  for (const selector of [
    "#outline",
    "#review-panel",
    "#diagnostic-panel",
    "#developer-panel",
    "#console-panel",
    "#procedure-editor-panel",
    "#inspector-panel",
    "#transform-tools-panel",
    "#geometry-create-panel",
    "#experiment-panel"
  ]) {
    panelManager.register(selector, {
      defaultLayout: uiConfiguration?.panels?.items?.[
        selector.replace(/^#/, "")
      ]
    });
  }
  attachScrubbableFields(documentRoot);
  const marquee=new SelectionMarquee({canvas:$("world"),element:$("selection-marquee"),onComplete:r=>renderer.selectScreenRect(r,latestEditor.selectionOperation)});

  function showError(error) {
    $("error-box").hidden = false;
    $("error-box").textContent = error?.stack || String(error);
    $("status").textContent = "Falha parcial";
    console.error(error);
  }

  function refreshUiNow() {
    const status = runtime.query("runtime.status");

    if (!$("outline").hidden) {
      const state = runtime.query("world.snapshot");
      outline.update(region, sandbox, modules.describe(), state);
    }

    $("undo").disabled = !status.canUndo;
    $("redo").disabled = !status.canRedo;
    $("review").disabled = !status.dirty;
    const selectionActions=runtime.query("selection.actions.describe");
    $("group-selection").disabled=!selectionActions.canGroup;
    $("ungroup-selection").disabled=!selectionActions.canUngroup;
    const count=latestSelection?.members?.length??0,active=latestSelection?.activeMember?.objectId??"∅",mode=latestEditor?.tool?.mode??"select",operation=latestEditor?.selectionOperation??"replace";
    $("status").textContent=`${count} selecionados · ativo ${active} · ${mode} · ${operation} · sandbox ${status.dirty?"alterado":"limpo"}`;
  }

  const scheduleUiFrame = callback =>
    typeof browserWindow.requestAnimationFrame === "function"
      ? browserWindow.requestAnimationFrame(callback)
      : browserWindow.setTimeout(callback, 0);
  const cancelUiFrame = handle =>
    typeof browserWindow.cancelAnimationFrame === "function"
      ? browserWindow.cancelAnimationFrame(handle)
      : browserWindow.clearTimeout(handle);
  const uiRefresh = new UiRefreshCoordinator({
    refresh: refreshUiNow,
    schedule: scheduleUiFrame,
    cancel: cancelUiFrame
  });
  const disconnectUiDiagnostics = connectUiDiagnostics(() => ({
    connected: true,
    profile: runtime.query("runtime.profile").id,
    refresh: uiRefresh.snapshot(),
    inspector: objectInspector.diagnostics(),
    outlineVisible: !$("outline").hidden
  }));

  function showNotice(message, duration = 2200) {
    clearTimeout(statusTimer);
    $("status").textContent = message;
    statusTimer = setTimeout(
      () => uiRefresh.request("notice-expired"),
      duration
    );
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
    () => uiRefresh.request("world.changed")
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
      uiRefresh.request("selection.changed");
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
      uiRefresh.request("editor.changed");

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
    if ($("outline").hidden) {
      panelManager.show("#outline");
      uiRefresh.request("outline.opened");
    } else {
      panelManager.hide("#outline");
    }
  });

  $("close-outline").addEventListener(
    "click",
    () => panelManager.hide("#outline")
  );

  $("project-save").addEventListener("click", async () => {
    const project = execute("project.save");
    if (!project?.prepared) return;

    try {
      let result = await projectFiles.save(project);
      if (result.fallbackRequired) {
        const approved = browserWindow.confirm(
          "O Chrome deste aparelho oferece um seletor nativo, " +
          "mas não permite usá-lo neste contexto. " +
          "Deseja salvar por download compatível?"
        );
        if (!approved) return;
        result = projectFiles.saveFallback(project, {
          fallbackReason: result.fallbackReason
        });
      }
      if (result.saved) {
        const mode = result.fallbackReason
          ? " · download compatível"
          : "";
        showNotice(`Projeto salvo: ${result.filename}${mode}`);
      }
    } catch (error) {
      showError(error);
    } finally {
      refreshProjectFileCapabilities();
    }
  });

  $("project-open").addEventListener(
    "click",
    async () => {
      if (!projectFiles.capabilities().nativeOpen) {
        $("project-file-input").click();
        return;
      }

      try {
        const opened = await projectFiles.open();
        if (opened.opened) {
          loadProjectText(opened.text);
        } else if (opened.fallbackRequired) {
          showNotice("Usando seletor de arquivos compatível.");
          $("project-file-input").click();
        }
      } catch (error) {
        showError(error);
      } finally {
        refreshProjectFileCapabilities();
      }
    }
  );

  $("project-file-input").addEventListener(
    "change",
    async event => {
      const file = event.target.files?.[0];
      if (!file) return;

      try {
        projectFiles.reset();
        const opened = await projectFiles.readFile(file);
        loadProjectText(opened.text);
      } catch (error) {
        showError(error);
      } finally {
        event.target.value = "";
      }
    }
  );

  $("procedure-library-save").addEventListener("click", async () => {
    const text = procedureCatalog.exportText();
    const payload = {
      prepared: true,
      filename: "spatialseed-procedures.json",
      mediaType: "application/json;charset=utf-8",
      text,
      bytes: new TextEncoder().encode(text).byteLength
    };

    try {
      let result = await procedureFiles.save(payload, { saveAs: true });
      if (result.fallbackRequired) {
        const approved = browserWindow.confirm(
          "O seletor nativo não está disponível neste contexto. " +
          "Deseja exportar a biblioteca por download compatível?"
        );
        if (!approved) return;
        result = procedureFiles.saveFallback(payload, {
          fallbackReason: result.fallbackReason
        });
      }
      if (result.saved) {
        showNotice(
          `Procedimentos exportados: ${result.filename}`
        );
      }
    } catch (error) {
      showError(error);
    }
  });

  $("procedure-library-open").addEventListener("click", async () => {
    if (!procedureFiles.capabilities().nativeOpen) {
      $("procedure-library-file-input").click();
      return;
    }

    try {
      const opened = await procedureFiles.open();
      if (opened.opened) {
        loadProcedureLibraryText(opened.text);
      } else if (opened.fallbackRequired) {
        $("procedure-library-file-input").click();
      }
    } catch (error) {
      showError(error);
    }
  });

  $("procedure-library-file-input").addEventListener(
    "change",
    async event => {
      const file = event.target.files?.[0];
      if (!file) return;

      try {
        procedureFiles.reset();
        const opened = await procedureFiles.readFile(file);
        loadProcedureLibraryText(opened.text);
      } catch (error) {
        showError(error);
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
    if (result?.created) {
      projectFiles.reset();
      showNotice("Novo projeto criado.");
    }
  });

  installButton.addEventListener("click", async () => {
    try {
      const result = await pwaInstallController?.requestInstall() ?? {
        outcome: "manual"
      };
      if (result.outcome === "manual") {
        browserWindow.alert(
          "Abra o menu do navegador e escolha “Instalar aplicativo” ou " +
          "“Adicionar à tela inicial”. No Safari, use o menu Compartilhar."
        );
      } else if (result.outcome === "accepted") {
        showNotice("Instalação autorizada pelo usuário.");
      } else if (result.outcome === "dismissed") {
        showNotice("Instalação cancelada.");
      }
    } catch (error) {
      showError(error);
    }
  });

  function loadProjectText(text) {
    const result = execute("project.open", { text });
    if (result?.loaded) {
      showNotice(
        `Projeto aberto: ${result.name} ` +
        `(${result.objectCount} objetos)`
      );
    } else {
      projectFiles.reset();
    }
    return result;
  }

  function loadProcedureLibraryText(text) {
    if (
      procedureCatalogEditor.snapshot().dirty &&
      !browserWindow.confirm(
        "O editor contém alterações não salvas. Descartá-las e importar?"
      )
    ) {
      return { changed: false, cancelled: true };
    }

    let result;
    try {
      result = procedureCatalog.importText(text, { mode: "merge" });
    } catch (error) {
      if (!/conflita/i.test(error?.message ?? "")) throw error;

      const replace = browserWindow.confirm(
        "A biblioteca contém nomes com fontes diferentes. " +
        "Deseja substituir o catálogo local inteiro?"
      );
      if (!replace) return { changed: false, cancelled: true };
      result = procedureCatalog.importText(text, { mode: "replace" });
    }

    showNotice(
      `Biblioteca importada: ${result.count} procedimentos.`
    );
    procedureCatalogEditor.refresh({ preserveSelection: false });
    return result;
  }

  $("diagnostics").addEventListener("click", () => {
    Object.assign(
      diagnostics,
      runtime.query("developer.state")
    );

    $("diagnostic-content").value =
      JSON.stringify(diagnostics, null, 2);

    panelManager.show("#diagnostic-panel");
  });

  $("close-diagnostics").addEventListener(
    "click",
    () => panelManager.hide("#diagnostic-panel")
  );

  $("duplicate-selection").addEventListener(
    "click",
    () => execute("selection.duplicate")
  );

  $("group-selection").addEventListener(
    "click",
    () => execute("selection.group")
  );

  $("ungroup-selection").addEventListener(
    "click",
    () => execute("selection.ungroup")
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
    panelManager.show("#transform-tools-panel");
    transformToolPanel.refresh();
  });

  $("close-transform-tools").addEventListener(
    "click",
    () => panelManager.hide("#transform-tools-panel")
  );

  $("geometry-create").addEventListener("click", () => {
    panelManager.show("#geometry-create-panel");
  });

  $("close-geometry-create").addEventListener(
    "click",
    () => panelManager.hide("#geometry-create-panel")
  );

  $("experiment-lab").addEventListener("click", () => {
    panelManager.show("#experiment-panel");
    experimentPanel.refresh();
  });

  $("close-experiment-panel").addEventListener(
    "click",
    () => panelManager.hide("#experiment-panel")
  );

  $("inspector").addEventListener("click", () => {
    panelManager.show("#inspector-panel");
    objectInspector.setActive(true);
  });

  $("close-inspector").addEventListener(
    "click",
    () => {
      panelManager.hide("#inspector-panel");
      objectInspector.setActive(false);
    }
  );

  $("developer").addEventListener("click", () => {
    panelManager.show("#developer-panel");
    refreshDeveloperPanel();
  });

  $("console").addEventListener("click", () => {
    panelManager.show("#console-panel");
    $("console-input").focus();
  });

  $("procedure-editor").addEventListener("click", () => {
    panelManager.show("#procedure-editor-panel");
    procedureCatalogEditor.refresh();
  });

  $("close-developer").addEventListener(
    "click",
    () => panelManager.hide("#developer-panel")
  );

  $("close-console").addEventListener(
    "click",
    () => panelManager.hide("#console-panel")
  );

  $("close-procedure-editor").addEventListener(
    "click",
    () => panelManager.hide("#procedure-editor-panel")
  );

  $("console-run").addEventListener("click", () => {
    const input = $("console-input").value.trim();
    if (!input) return;

    if (consoleInputHistory.at(-1) !== input) {
      consoleInputHistory.push(input);
    }

    consoleHistoryIndex = consoleInputHistory.length;
    Promise.resolve(devConsole.execute(input))
      .finally(refreshDeveloperPanel);
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
    const entering = Boolean(enabled) && !sceneOnly;
    sceneOnly = Boolean(enabled);
    documentRoot.body.classList.toggle("ss-scene-only", sceneOnly);
    $("scene-only").dataset.active = sceneOnly ? "true" : "false";
    $("scene-only").setAttribute(
      "aria-pressed",
      sceneOnly ? "true" : "false"
    );
    if (entering) showSceneHelp();
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
  $("scene-exit-hotspot").addEventListener(
    "click",
    () => setSceneOnly(false)
  );
  $("scene-help").addEventListener(
    "click",
    () => showSceneHelp({ manual:true })
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
    if (sceneHelpDialog.open) return;
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
    panelManager.show("#review-panel");
  });

  $("close-review").addEventListener(
    "click",
    () => panelManager.hide("#review-panel")
  );

  $("cancel-proposal").addEventListener(
    "click",
    () => panelManager.hide("#review-panel")
  );

  $("confirm-proposal").addEventListener("click", () => {
    const proposal = sandbox.createProposal();
    const result = region.acceptProposal(proposal);

    $("review-content").textContent =
      JSON.stringify({ proposal, result }, null, 2);

    if (result.accepted) {
      sandbox.rebaseFromRegion();
      panelManager.hide("#review-panel");
    }
  });

  uiRefresh.flushNow("initial");

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
      unsubscribeInstall();
      disconnectUiDiagnostics();
      uiRefresh.dispose();
      pwaInstallController?.dispose();
      marquee.dispose();
      document.removeEventListener(
        "fullscreenchange",
        refreshFullscreenButton
      );
      toolbarBinding.dispose();
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
