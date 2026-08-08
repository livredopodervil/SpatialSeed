import { FloatingPanelManager, SelectionMarquee, UiActionRegistry, UiRefreshCoordinator, attachScrubbableFields, composeToolbar } from "../../../packages/ui-widgets/src/index.js?build=20260808-0053e";
import {
  BrowserProjectFileGateway
} from "../../../packages/platform-web/src/index.js?build=20260808-0053e";

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
    meshEditPanel,
    editHud,
    experimentPanel,
    viewerRenderPanel,
    sandboxRecovery,
    viewerCoordinator,
    viewerDirectory,
    projectLaunch,
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
  const projectWindowFiles = new BrowserProjectFileGateway({
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
  const recoveryDialog = $("recovery-dialog");
  const viewerSessionDialog = $("viewer-session-dialog");
  let resolveRecoveryReady = null;
  const recoveryDecision = new Promise(resolve => {
    resolveRecoveryReady = resolve;
  });

  const consoleLines = [];
  const consoleInputHistory = [];
  let consoleHistoryIndex = 0;
  let lastConsoleText = "";
  let statusTimer = null;
  let lastViewerOutcome = null;
  let latestSelection = runtime.query("selection.snapshot");
  let latestEditor = runtime.query("editor.snapshot");
  let latestMeshEdit = runtime.query("mesh.edit.status");
  let latestViewerInstances = runtime.query(
    "viewer.instances.status"
  );
  let latestViewerRole = latestViewerInstances.role;
  let latestSandboxId = latestViewerInstances.sandboxId;
  let pendingProjectWindowLaunch = null;
  if (browserWindow.location) {
    const cleanLaunchUrl = new URL(browserWindow.location.href);
    if (cleanLaunchUrl.searchParams.has("project")) {
      cleanLaunchUrl.searchParams.delete("project");
      cleanLaunchUrl.searchParams.delete("launch");
      if (latestViewerRole === "authority") {
        cleanLaunchUrl.searchParams.delete("viewer");
      }
      browserWindow.history.replaceState(
        browserWindow.history.state,
        "",
        cleanLaunchUrl
      );
    }
  }
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
    "#camera-panel",
    "#viewer-render-panel",
    "#developer-panel",
    "#console-panel",
    "#procedure-editor-panel",
    "#inspector-panel",
    "#mesh-edit-panel",
    "#geometry-create-panel",
    "#experiment-panel",
    "#animation-panel"
  ]) {
    panelManager.register(selector, {
      defaultLayout: uiConfiguration?.panels?.items?.[
        selector.replace(/^#/, "")
      ]
    });
  }
  const uiActions = new UiActionRegistry({
    root: documentRoot,
    configuration: uiConfiguration?.shortcuts
  });
  attachScrubbableFields(documentRoot);
  const marquee = new SelectionMarquee({
    canvas: $("world"),
    element: $("selection-marquee"),
    navigation: renderer,
    onComplete: gesture => execute("selection.gesture.apply", {
      ...gesture,
      operation: latestEditor.selectionOperation
    })
  });

  function showError(error, { fatal = false } = {}) {
    console.error(error);
    const persistent = fatal || error?.fatal === true ||
      error?.severity === "fatal";
    if (persistent) {
      $("error-box").hidden = false;
      $("error-box").textContent = error?.stack || String(error);
      $("status").textContent = "Falha fatal";
      return;
    }
    $("error-box").hidden = true;
    $("error-box").textContent = "";
    showNotice(error?.message || String(error), 5000);
  }

  function refreshUiNow() {
    const status = runtime.query("runtime.status");

    if (!$("outline").hidden) {
      const state = runtime.query("world.snapshot");
      outline.update(region, sandbox, modules.describe(), state);
    }

    $("undo").disabled = latestMeshEdit.active || !status.canUndo;
    $("redo").disabled = latestMeshEdit.active || !status.canRedo;
    $("review").disabled = !status.dirty;
    const replica = latestViewerInstances.role === "replica";
    $("project-open").disabled = replica;
    $("project-new").disabled = replica;
    $("confirm-proposal").disabled = replica;
    $("viewer-new").disabled = !latestViewerInstances.available;
    const selectionActions=runtime.query("selection.actions.describe");
    $("group-selection").disabled=latestMeshEdit.active||!selectionActions.canGroup;
    $("ungroup-selection").disabled=latestMeshEdit.active||!selectionActions.canUngroup;
    $("duplicate-selection").disabled=latestMeshEdit.active||latestSelection.members.length===0;
    $("repeat-duplicate").disabled=latestMeshEdit.active;
    $("delete-selection").disabled=latestMeshEdit.active||latestSelection.members.length===0;
    $("inspector").disabled=latestMeshEdit.active||latestSelection.members.length===0;
    $("geometry-create").disabled=latestMeshEdit.active;
    $("pivot-policy").disabled=latestMeshEdit.active;
    $("edit-pivot").disabled=latestMeshEdit.active||latestSelection.members.length===0;
    const count=latestSelection?.members?.length??0,active=latestSelection?.activeMember?.objectId??"∅",mode=latestEditor?.tool?.mode??"select",operation=latestEditor?.selectionOperation??"replace";
    const viewerRole = replica ? "viewer réplica" : "viewer autoritativo";
    $("status").textContent=latestMeshEdit.active
      ? `malha ${latestMeshEdit.objectId} · ${latestMeshEdit.selectedCount}/${latestMeshEdit.vertexCount} vértices · frame ${latestMeshEdit.frameMode} · ${mode} · ${viewerRole}`
      : `${count} selecionados · ativo ${active} · ${mode} · ${operation} · sandbox ${status.dirty?"alterado":"limpo"} · ${viewerRole}`;
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
    actions: uiActions.describe(),
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
      return { changed: false, reason: "recoverable-error" };
    }
  }

  const registerRuntimeAction = (id, command = id, args = value => value) => {
    uiActions.register(id, value => execute(command, args(value)), {
      metadata: { command }
    });
  };
  for (const mode of ["navigate", "select", "translate", "rotate", "scale"]) {
    registerRuntimeAction(
      `tool.${mode}`,
      "tool.set",
      () => ({ mode })
    );
  }
  registerRuntimeAction("history.undo");
  registerRuntimeAction("history.redo");
  registerRuntimeAction("selection.multi.toggle");
  registerRuntimeAction("selection.clear");
  registerRuntimeAction("selection.area.toggle");
  for (const mode of ["rectangle", "brush", "lasso", "eraser"]) {
    registerRuntimeAction(
      `selection.gesture.${mode}`,
      "selection.gesture.set",
      () => ({ mode, toggle: true })
    );
  }
  registerRuntimeAction("selection.duplicate");
  registerRuntimeAction("selection.group");
  registerRuntimeAction("selection.ungroup");
  registerRuntimeAction("selection.instances.fuse");
  registerRuntimeAction("selection.strokes.fuse");
  registerRuntimeAction("selection.repeat");
  registerRuntimeAction("selection.delete");
  registerRuntimeAction("pivot.edit.toggle");
  uiActions.register("space.toggle", () => {
    const result = execute("space.toggle");
    if (result?.space) {
      $("space").textContent = result.space === "world" ? "Mundo" : "Local";
    }
    return result;
  }, { metadata: { command: "space.toggle" } });
  for (const operation of ["replace", "add", "remove", "toggle"]) {
    registerRuntimeAction(
      `selection.operation.${operation}`,
      "selection.operation.set",
      () => ({ operation })
    );
  }
  uiActions
    .register("scene.toggle", () => setSceneOnly(!sceneOnly))
    .register("viewport.fullscreen", () => toggleViewportFullscreen())
    .register("viewer.instance.open", ({ sandboxId } = {}) => {
      const result = execute("viewer.instance.open", {
        href: browserWindow.location.href,
        sandboxId: sandboxId ?? latestSandboxId
      });
      if (!result?.url) return result;
      browserWindow.open(result.url, "_blank", "noopener");
      showNotice("Novo viewer solicitado para o projeto escolhido.");
      return result;
    })
    .register("viewer.instance.choose", () => {
      const directory = runtime.query("viewer.sessions.status");
      const sessions = directory.sessions ?? [];
      renderViewerSessions(sessions);
      if (typeof viewerSessionDialog.showModal === "function") {
        viewerSessionDialog.showModal();
      } else {
        viewerSessionDialog.setAttribute("open", "");
      }
      return directory;
    })
    .register("panel.animation.toggle", () => {
      const panel = $("animation-panel");
      return panel.hidden
        ? panelManager.show(panel)
        : panelManager.hide(panel);
    });

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
    payload => {
      uiRefresh.request("world.changed");
      const cameraAffected = (payload?.changes ?? []).some(change =>
        change?.object?.kind === "camera" ||
        change?.previousObject?.kind === "camera" ||
        ["sandbox-discard", "sandbox-rebased", "sandbox-replaced"]
          .includes(change?.type)
      );
      if (
        cameraAffected &&
        !$("camera-panel").hidden &&
        !$("camera-panel").contains(documentRoot.activeElement)
      ) {
        refreshCameraPanel();
      }
    }
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
      $("duplicate-selection").disabled = latestMeshEdit.active || empty;
      $("delete-selection").disabled = latestMeshEdit.active || empty;
      $("inspector").disabled = latestMeshEdit.active || empty;
      if (
        !$("camera-panel").hidden &&
        !$("camera-panel").contains(documentRoot.activeElement)
      ) {
        refreshCameraObjects();
      }
      if (!$("mesh-edit-panel").hidden) meshEditPanel.refresh();
      uiRefresh.request("selection.changed");
    }
  );

  const unsubscribeMeshEdit = runtime.subscribe(
    "mesh.edit.changed",
    snapshot => {
      latestMeshEdit = snapshot;
      $("space").textContent = snapshot.active
        ? snapshot.frameMode === "viewer"
          ? "Viewer"
          : snapshot.frameMode === "local"
            ? "Objeto"
            : "Mundo"
        : renderer.transform.space === "local" ? "Local" : "Mundo";
      marquee.setEnabled(
        latestEditor.tool.mode === "select" && latestEditor.areaSelection
      );
      uiRefresh.request("mesh.edit.changed");
    }
  );
  const renderMeasurement = snapshot => {
    const output = $("measurement-readout");
    const active = Boolean(snapshot?.active);
    output.hidden = !active;
    if (!active) {
      output.textContent = "";
      return;
    }
    const label = snapshot.mode === "protractor"
      ? "Transferidor"
      : "Régua";
    const instruction = snapshot.mode === "protractor"
      ? "marque centro e dois raios"
      : "arraste entre dois pontos";
    output.textContent = snapshot.readout
      ? `${label}: ${snapshot.readout}`
      : `${label}: ${instruction}`;
  };
  const unsubscribeMeasurement = runtime.subscribe(
    "measurement.changed",
    renderMeasurement
  );
  renderMeasurement(runtime.query("measurement.status"));

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
      documentRoot.querySelectorAll("[data-selection-gesture]").forEach(
        button => {
          button.dataset.active =
            snapshot.areaSelection &&
            button.dataset.selectionGesture === snapshot.selectionGestureMode
              ? "true"
              : "false";
        }
      );
      marquee.setMode(snapshot.selectionGestureMode, {
        radiusPixels: snapshot.selectionBrushRadius
      });
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

  documentRoot.querySelectorAll("[data-tool-mode]").forEach(button =>
    uiActions.bindControl(button, `tool.${button.dataset.toolMode}`)
  );
  documentRoot.querySelectorAll("[data-selection-op]").forEach(button =>
    uiActions.bindControl(
      button,
      `selection.operation.${button.dataset.selectionOp}`
    )
  );
  documentRoot.querySelectorAll("[data-selection-gesture]").forEach(button =>
    uiActions.bindControl(
      button,
      `selection.gesture.${button.dataset.selectionGesture}`
    )
  );
  uiActions.bindControl($("space"), "space.toggle");
  uiActions.bindControl($("multi-select"), "selection.multi.toggle");
  uiActions.bindControl($("clear-selection"), "selection.clear");

  $("pivot-policy").addEventListener("change", event =>
    execute("pivot.policy", { policy: event.target.value })
  );

  uiActions.bindControl($("edit-pivot"), "pivot.edit.toggle");

  $("add-box").addEventListener(
    "click",
    () => execute("object.create.box")
  );

  uiActions.bindControl($("undo"), "history.undo");
  uiActions.bindControl($("redo"), "history.redo");

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

  const cameraVector = (prefix, values) => {
    ["x", "y", "z"].forEach((axis, index) => {
      $(`camera-${prefix}-${axis}`).value = String(values[index]);
    });
  };
  const readCameraVector = prefix =>
    ["x", "y", "z"].map(axis =>
      $(`camera-${prefix}-${axis}`).value
    );
  const refreshCameraPanel = () => {
    const camera = runtime.query("viewer.camera.snapshot");
    cameraVector("position", camera.position);
    cameraVector("target", camera.target);
    $("camera-fov").value = String(camera.fov);
    $("camera-near").value = String(camera.near);
    $("camera-far").value = String(camera.far);
    $("camera-orbit-distance").placeholder =
      String(Number(camera.focusDistance.toFixed(6)));
    $("camera-summary").textContent =
      `quaternion [${camera.quaternion
        .map(value => Number(value.toFixed(6)))
        .join(", ")}] · foco ${Number(camera.focusDistance.toFixed(6))}`;
    refreshCameraObjects();
    return camera;
  };
  const selectedCameraObjectId = () =>
    $("camera-object-select").value || null;
  const refreshCameraObjects = () => {
    const snapshot = runtime.query("camera.objects.list");
    const selection = runtime.query("selection.snapshot");
    const selectedObjectId =
      selection.activeMember?.objectId ?? null;
    const select = $("camera-object-select");
    const previous = select.value;
    select.replaceChildren();
    for (const camera of snapshot.cameras) {
      const option = documentRoot.createElement("option");
      option.value = camera.id;
      option.textContent = [
        camera.name,
        camera.id === selectedObjectId ? "selecionada" : null,
        camera.active ? "ativa" : null,
        camera.default ? "padrão" : null
      ].filter(Boolean).join(" · ");
      select.append(option);
    }
    if (snapshot.cameras.some(camera => camera.id === previous)) {
      select.value = previous;
    } else if (snapshot.activeCameraId) {
      select.value = snapshot.activeCameraId;
    } else if (snapshot.defaultCameraId) {
      select.value = snapshot.defaultCameraId;
    }
    const selected = snapshot.cameras.find(
      camera => camera.id === select.value
    );
    $("camera-object-summary").textContent = selected
      ? `${snapshot.cameras.length} câmera(s) · id ${selected.id} · ` +
        `${selected.camera.fov}° · ${selected.camera.near}–${selected.camera.far}`
      : "Nenhuma câmera persistente.";
    for (const id of [
      "camera-object-activate",
      "camera-object-select-button",
      "camera-object-capture",
      "camera-object-default"
    ]) {
      $(id).disabled = !selected;
    }
    $("camera-object-default-clear").disabled =
      !snapshot.defaultCameraId;
    $("camera-object-deactivate").disabled =
      !snapshot.activeCameraId;
    const helperState = runtime.query("viewer.camera.helpers");
    $("camera-helper-policy").value = helperState.helperPolicy;
    const active = snapshot.cameras.find(
      camera => camera.id === snapshot.activeCameraId
    );
    $("active-camera-indicator").textContent = active
      ? `Vista: ${active.name} · ${active.id}`
      : "Vista: navegação livre";
    $("active-camera-indicator").dataset.cameraActive =
      active ? "true" : "false";
    return snapshot;
  };

  $("camera-settings").addEventListener("click", () => {
    refreshCameraPanel();
    panelManager.show("#camera-panel");
  });

  $("close-camera").addEventListener(
    "click",
    () => panelManager.hide("#camera-panel")
  );

  $("viewer-render-settings").addEventListener("click", () => {
    viewerRenderPanel.refresh();
    panelManager.show("#viewer-render-panel");
  });

  $("close-viewer-render").addEventListener(
    "click",
    () => panelManager.hide("#viewer-render-panel")
  );

  $("camera-projection-apply").addEventListener("click", () => {
    const result = execute("viewer.camera.projection.set", {
      fov: $("camera-fov").value,
      near: $("camera-near").value,
      far: $("camera-far").value
    });
    if (!result || result.reason) return;
    refreshCameraPanel();
    showNotice(
      `Projeção: ${result.fov}° · ${result.near} – ${result.far}`
    );
  });

  $("camera-view-apply").addEventListener("click", () => {
    const result = execute("viewer.camera.look-at", {
      position: readCameraVector("position"),
      target: readCameraVector("target"),
      fov: $("camera-fov").value,
      near: $("camera-near").value,
      far: $("camera-far").value
    });
    if (!result || result.reason) return;
    refreshCameraPanel();
    showNotice("Vista da câmera aplicada.");
  });

  $("camera-orbit-apply").addEventListener("click", () => {
    const distance = $("camera-orbit-distance").value.trim();
    const result = execute("viewer.camera.orbit", {
      yawDegrees: $("camera-orbit-yaw").value,
      pitchDegrees: $("camera-orbit-pitch").value,
      ...(distance ? { distance } : {})
    });
    if (!result || result.reason) return;
    refreshCameraPanel();
    showNotice("Órbita da câmera aplicada.");
  });

  $("camera-frame-selection").addEventListener("click", () => {
    const result = execute("viewer.camera.frame-selection");
    if (!result || result.reason) return;
    refreshCameraPanel();
    showNotice("Seleção enquadrada.");
  });

  $("camera-reset").addEventListener("click", () => {
    const result = execute("viewer.camera.reset");
    if (!result || result.reason) return;
    refreshCameraPanel();
    showNotice("Vista inicial restaurada.");
  });

  $("camera-object-create").addEventListener("click", () => {
    const snapshot = runtime.query("camera.objects.list");
    const name = browserWindow.prompt(
      "Nome da câmera persistente:",
      `Câmera ${snapshot.cameras.length + 1}`
    );
    if (name === null) return;
    const result = execute("camera.object.create", {
      name: name.trim() || null,
      camera: runtime.query("viewer.camera.snapshot"),
      activate: true
    });
    if (!result?.changed) return;
    refreshCameraPanel();
    $("camera-object-select").value = result.id;
    showNotice(result.activationPending
      ? "Câmera enviada à autoridade; ativação aguardando confirmação."
      : "Câmera persistente criada e ativada.");
  });

  $("camera-object-activate").addEventListener("click", () => {
    const id = selectedCameraObjectId();
    if (!id) return;
    execute("viewer.camera.object.activate", { id });
    refreshCameraPanel();
    showNotice("Câmera ativada somente neste viewer.");
  });

  $("camera-object-select-button").addEventListener("click", () => {
    const id = selectedCameraObjectId();
    if (!id) return;
    execute("selection.select-object", { id });
    refreshCameraObjects();
    showNotice("Objeto câmera selecionado no editor.");
  });

  $("camera-object-capture").addEventListener("click", () => {
    const id = selectedCameraObjectId();
    if (!id) return;
    const result = execute("camera.object.capture-viewer", { id });
    if (!result?.changed) return;
    refreshCameraPanel();
    showNotice("Câmera persistente atualizada pela vista atual.");
  });

  $("camera-object-default").addEventListener("click", () => {
    const id = selectedCameraObjectId();
    if (!id) return;
    execute("camera.object.default.set", { id });
    refreshCameraObjects();
    showNotice("Câmera padrão do documento atualizada.");
  });

  $("camera-object-default-clear").addEventListener("click", () => {
    execute("camera.object.default.set", { id: null });
    refreshCameraObjects();
    showNotice("O documento não possui câmera padrão.");
  });

  $("camera-object-deactivate").addEventListener("click", () => {
    execute("viewer.camera.object.deactivate");
    refreshCameraObjects();
    showNotice("Navegação livre neste viewer.");
  });

  $("camera-helper-policy").addEventListener("change", event => {
    execute("viewer.camera.helpers.set", {
      helperPolicy: event.currentTarget.value
    });
    refreshCameraObjects();
  });

  const unsubscribeViewer = runtime.subscribe(
    "viewer.changed",
    () => {
      if (
        $("camera-panel").hidden ||
        $("camera-panel").contains(documentRoot.activeElement)
      ) {
        return;
      }
      refreshCameraPanel();
    }
  );
  const unsubscribeCameraObjects = runtime.subscribe(
    "camera.objects.changed",
    () => {
      if (
        !$("camera-panel").hidden &&
        !$("camera-panel").contains(documentRoot.activeElement)
      ) {
        refreshCameraObjects();
        return;
      }
      const snapshot = runtime.query("camera.objects.list");
      const active = snapshot.cameras.find(
        camera => camera.id === snapshot.activeCameraId
      );
      $("active-camera-indicator").textContent = active
        ? `Vista: ${active.name} · ${active.id}`
        : "Vista: navegação livre";
      $("active-camera-indicator").dataset.cameraActive =
        active ? "true" : "false";
    }
  );
  const unsubscribeViewerInstances = runtime.subscribe(
    "viewer.instances.changed",
    snapshot => {
      latestViewerInstances = snapshot;
      if (
        latestViewerRole === "replica" &&
        snapshot.role === "authority"
      ) {
        sandboxRecovery.adoptCurrentSession(snapshot.sandboxId);
        showNotice(
          "Este viewer assumiu a autoridade do projeto ativo."
        );
      }
      latestViewerRole = snapshot.role;
      if (snapshot.sandboxId !== latestSandboxId) {
        const url = new URL(browserWindow.location.href);
        url.searchParams.set("sandbox", snapshot.sandboxId);
        if (snapshot.role === "replica") {
          url.searchParams.set("viewer", "join");
        } else {
          url.searchParams.delete("viewer");
        }
        browserWindow.history.replaceState(
          browserWindow.history.state,
          "",
          url
        );
      }
      latestSandboxId = snapshot.sandboxId;
      const outcome = snapshot.lastOutcome;
      if (
        outcome?.requestId &&
        outcome.requestId !== lastViewerOutcome
      ) {
        lastViewerOutcome = outcome.requestId;
        if (outcome.status === "accepted") {
          showNotice(
            `Edição aceita na revisão ${outcome.revision}.`
          );
        } else if (outcome.status === "rejected-stale") {
          showNotice(
            "A edição estava obsoleta e não foi aplicada; " +
            "o viewer foi sincronizado."
          );
        } else if (
          outcome.status === "rejected-error" ||
          outcome.status === "rejected-no-change"
        ) {
          showNotice(
            `Edição rejeitada: ${outcome.error ?? outcome.status}.`
          );
        } else if (
          outcome.status === "rejected-sandbox-replaced"
        ) {
          showNotice(
            "A edição pendente foi cancelada porque o projeto mudou."
          );
        }
      }
      uiRefresh.request("viewer.instances.changed");
    }
  );

  async function saveProjectPayload(project) {
    if (!project?.prepared) return null;
    try {
      let result = await projectFiles.save(project, { saveAs: true });
      if (result.fallbackRequired) {
        if (result.fallbackReason !== "native-unavailable") {
          const approved = browserWindow.confirm(
            "O Chrome deste aparelho oferece um seletor nativo, " +
            "mas não permite usá-lo neste contexto. " +
            "Deseja salvar por download compatível?"
          );
          if (!approved) return;
        }
        const requestedName = browserWindow.prompt(
          "Nome do arquivo para salvar:",
          project.filename
        );
        if (requestedName === null) return;
        const trimmedName = requestedName.trim();
        const filename = /\.(?:json|spatialseed)$/i.test(trimmedName)
          ? trimmedName
          : `${trimmedName || project.filename}.spatialseed`;
        result = projectFiles.saveFallback({
          ...project,
          filename
        }, {
          fallbackReason: result.fallbackReason
        });
      }
      if (result.saved) {
        const mode = result.fallbackReason
          ? " · download compatível"
          : "";
        showNotice(`Projeto salvo: ${result.filename}${mode}`);
      }
      return result;
    } catch (error) {
      showError(error);
      return null;
    } finally {
      refreshProjectFileCapabilities();
    }
  }

  $("project-save").addEventListener("click", async () => {
    await saveProjectPayload(execute("project.save"));
  });
  uiActions.bindControl(
    $("viewer-new"),
    "viewer.instance.choose"
  );
  $("viewer-session-open").addEventListener("click", () => {
    const selected = documentRoot.querySelector(
      'input[name="viewer-session"]:checked'
    );
    if (!selected) {
      showNotice("Escolha um projeto ativo.");
      return;
    }
    viewerSessionDialog.close();
    uiActions.execute("viewer.instance.open", {
      sandboxId: selected.value
    });
  });

  $("project-new-window").addEventListener("click", () => {
    const plan = execute("viewer.project.new-window", {
      href: browserWindow.location.href
    });
    if (!plan?.url) return;
    const opened = browserWindow.open(plan.url, "_blank");
    if (!opened) {
      showNotice("O navegador bloqueou a nova aba.");
      return;
    }
    opened.opener = null;
    viewerSessionDialog.close();
    showNotice("Novo projeto solicitado em outra aba.");
  });

  async function finishProjectWindowLaunch(text) {
    const pending = pendingProjectWindowLaunch;
    if (!pending) return;
    pendingProjectWindowLaunch = null;
    try {
      const accepted = await pending.sender.sendProject(text);
      showNotice(
        `Projeto aberto em nova aba: ${accepted.projectName ?? "Spatial Seed"}.`
      );
    } catch (error) {
      showError(error);
    } finally {
      pending.sender.dispose();
    }
  }

  $("project-open-window").addEventListener("click", async () => {
    const plan = execute("viewer.project.open-window.prepare", {
      href: browserWindow.location.href
    });
    if (!plan?.url) return;
    const sender = projectLaunch.createSender(plan.launchId);
    pendingProjectWindowLaunch = { plan, sender };
    const openedWindow = browserWindow.open(plan.url, "_blank");
    if (!openedWindow) {
      sender.dispose();
      pendingProjectWindowLaunch = null;
      showNotice("O navegador bloqueou a nova aba.");
      return;
    }
    openedWindow.opener = null;
    viewerSessionDialog.close();

    if (!projectWindowFiles.capabilities().nativeOpen) {
      $("project-file-input-new-window").click();
      return;
    }
    try {
      const opened = await projectWindowFiles.open();
      if (opened.opened) {
        await finishProjectWindowLaunch(opened.text);
      } else if (opened.fallbackRequired) {
        $("project-file-input-new-window").click();
      } else {
        sender.cancel("file-selection-cancelled");
        sender.dispose();
        pendingProjectWindowLaunch = null;
      }
    } catch (error) {
      sender.cancel(error?.message ?? "file-open-failed");
      sender.dispose();
      pendingProjectWindowLaunch = null;
      showError(error);
    }
  });

  $("project-file-input-new-window").addEventListener(
    "change",
    async event => {
      const file = event.target.files?.[0];
      if (!file) {
        pendingProjectWindowLaunch?.sender.cancel(
          "file-selection-cancelled"
        );
        pendingProjectWindowLaunch?.sender.dispose();
        pendingProjectWindowLaunch = null;
        return;
      }
      try {
        const opened = await projectWindowFiles.readFile(file);
        await finishProjectWindowLaunch(opened.text);
      } catch (error) {
        pendingProjectWindowLaunch?.sender.cancel(
          error?.message ?? "file-open-failed"
        );
        pendingProjectWindowLaunch?.sender.dispose();
        pendingProjectWindowLaunch = null;
        showError(error);
      } finally {
        event.target.value = "";
      }
    }
  );

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
          await loadProjectText(opened.text);
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
        await loadProjectText(opened.text);
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

  $("project-new").addEventListener("click", async () => {
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

  async function loadProjectText(text) {
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

  function closeRecoveryDialog() {
    if (typeof recoveryDialog.close === "function") {
      recoveryDialog.close();
    } else {
      recoveryDialog.removeAttribute("open");
    }
  }

  function finishRecoveryDecision(result) {
    closeRecoveryDialog();
    resolveRecoveryReady?.(result);
    resolveRecoveryReady = null;
  }

  recoveryDialog.addEventListener("cancel", event => {
    event.preventDefault();
  });

  $("recovery-continue").addEventListener("click", async () => {
    try {
      const result = await sandboxRecovery.continueRecovery();
      showNotice(
        `Rascunho recuperado: ${result.result?.commandCount ?? 0} comandos.`
      );
      finishRecoveryDecision(result);
    } catch (error) {
      showError(error);
    }
  });

  $("recovery-export").addEventListener("click", async () => {
    try {
      await saveProjectPayload(sandboxRecovery.prepareExport());
    } catch (error) {
      showError(error);
    }
  });

  $("recovery-discard").addEventListener("click", async () => {
    if (!browserWindow.confirm(
      "Descartar definitivamente este rascunho recuperável?"
    )) return;
    try {
      const result = await sandboxRecovery.discardRecovery();
      showNotice("Rascunho local descartado.");
      finishRecoveryDecision(result);
    } catch (error) {
      showError(error);
    }
  });

  const recoveryReady = (async () => {
    if (!viewerCoordinator.isAuthority) {
      const status = runtime.query("recovery.status");
      resolveRecoveryReady?.(status);
      resolveRecoveryReady = null;
      return status;
    }
    const status = await sandboxRecovery.initialize();
    if (status.mode === "draft") {
      const pending = status.pending;
      $("recovery-project-name").textContent = pending.projectName;
      $("recovery-details").textContent =
        `${pending.commandCount} comandos confirmados · ` +
        `revisão ${pending.revision} · ` +
        `última recuperação ${new Date(
          pending.updatedAt
        ).toLocaleString()}`;
      if (typeof recoveryDialog.showModal === "function") {
        recoveryDialog.showModal();
      } else {
        recoveryDialog.setAttribute("open", "");
      }
      return recoveryDecision;
    }
    if (status.mode === "restored-clean") {
      showNotice("Sandbox local reaberto.");
    } else if (status.mode === "unavailable") {
      showNotice("Recuperação automática indisponível neste navegador.");
    } else if (status.mode === "error") {
      showNotice(
        `A recuperação local falhou: ${status.lastError}`
      );
    }
    resolveRecoveryReady?.(status);
    resolveRecoveryReady = null;
    return status;
  })();
  const flushRecovery = () => {
    if (viewerCoordinator.isAuthority) {
      void sandboxRecovery.flush();
    }
  };
  const flushHiddenRecovery = () => {
    if (documentRoot.visibilityState === "hidden") {
      flushRecovery();
    }
  };
  browserWindow.addEventListener("pagehide", flushRecovery);
  const releaseViewerSession = event => {
    if (event.persisted) return;
    viewerDirectory.dispose();
    viewerCoordinator.dispose();
  };
  browserWindow.addEventListener("pagehide", releaseViewerSession);
  documentRoot.addEventListener(
    "visibilitychange",
    flushHiddenRecovery
  );

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

  uiActions.bindControl($("duplicate-selection"), "selection.duplicate");
  uiActions.bindControl($("group-selection"), "selection.group");
  uiActions.bindControl($("ungroup-selection"), "selection.ungroup");
  uiActions.bindControl(
    $("edit-hud-fuse-families"),
    "selection.instances.fuse"
  );
  uiActions.bindControl(
    $("edit-hud-fuse-strokes"),
    "selection.strokes.fuse"
  );
  uiActions.bindControl($("repeat-duplicate"), "selection.repeat");
  uiActions.bindControl($("delete-selection"), "selection.delete");

  const openEditWorkspace = () => {
    panelManager.show("#mesh-edit-panel");
    meshEditPanel.refresh();
  };
  $("mesh-editor").addEventListener("click", openEditWorkspace);
  $("edit-hud-open").addEventListener("click", openEditWorkspace);

  $("close-mesh-edit").addEventListener(
    "click",
    () => panelManager.hide("#mesh-edit-panel")
  );

  $("geometry-create").addEventListener("click", () => {
    panelManager.show("#geometry-create-panel");
  });
  $("edit-hud-create").addEventListener("click", () => {
    panelManager.show("#geometry-create-panel");
  });
  $("mesh-edit-panel").addEventListener(
    "spatialseed:open-geometry-create",
    () => panelManager.show("#geometry-create-panel")
  );

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

  uiActions.bindControl($("animation"), "panel.animation.toggle");
  $("close-animation-panel").addEventListener(
    "click",
    () => panelManager.hide("#animation-panel")
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

  uiActions.bindControl($("scene-only"), "scene.toggle");
  $("scene-exit-hotspot").addEventListener(
    "click",
    () => setSceneOnly(false)
  );
  $("scene-help").addEventListener(
    "click",
    () => showSceneHelp({ manual:true })
  );
  uiActions.bindControl($("viewport-fullscreen"), "viewport.fullscreen");
  document.addEventListener(
    "fullscreenchange",
    refreshFullscreenButton
  );

  documentRoot.addEventListener("keydown", event => {
    if (sceneHelpDialog.open) return;

    if (event.key === "Escape" && sceneOnly) {
      event.preventDefault();
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
    try {
      viewerCoordinator.requireAuthority(
        "publicar uma proposta"
      );
    } catch (error) {
      showError(error);
      return;
    }
    const proposal = sandbox.createProposal();
    const result = region.acceptProposal(proposal);

    $("review-content").textContent =
      JSON.stringify({ proposal, result }, null, 2);

    if (result.accepted) {
      sandbox.rebaseFromRegion();
      panelManager.hide("#review-panel");
    }
  });

  function renderViewerSessions(sessions) {
    const root = $("viewer-session-list");
    root.replaceChildren();
    for (const session of sessions) {
      const label = documentRoot.createElement("label");
      label.className = "viewer-session-choice";
      const input = documentRoot.createElement("input");
      input.type = "radio";
      input.name = "viewer-session";
      input.value = session.sandboxId;
      input.checked = Boolean(session.current);
      const name = documentRoot.createElement("strong");
      name.textContent =
        `${session.projectName}${session.current ? " · atual" : ""}`;
      const details = documentRoot.createElement("small");
      const authority = session.authorityAvailable
        ? "autoridade ativa"
        : "assumindo autoridade";
      details.textContent =
        `${session.viewerCount} viewer(s) · ${session.objectCount} objeto(s) · ` +
        `revisão ${session.revision} · ${authority} · ` +
        session.sandboxId;
      label.append(input, name, details);
      root.append(label);
    }
    if (!root.querySelector("input:checked")) {
      root.querySelector("input")?.click();
    }
  }

  uiRefresh.flushNow("initial");
  refreshCameraObjects();

  const initialSelection = runtime.query("selection.snapshot");
  runtime.emit("selection.changed", initialSelection);
  runtime.emit("editor.changed", runtime.query("editor.snapshot"));

  return Object.freeze({
    ready: recoveryReady,
    dispose() {
      clearInterval(developerTimer);
      clearTimeout(statusTimer);
      unsubscribeEditor();
      unsubscribeMeshEdit();
      unsubscribeMeasurement();
      unsubscribeSelection();
      unsubscribeWorld();
      unsubscribeViewer();
      unsubscribeCameraObjects();
      unsubscribeViewerInstances();
      unsubscribeInstall();
      disconnectUiDiagnostics();
      uiActions.dispose();
      uiRefresh.dispose();
      pwaInstallController?.dispose();
      marquee.dispose();
      document.removeEventListener(
        "fullscreenchange",
        refreshFullscreenButton
      );
      toolbarBinding.dispose();
      panelManager.dispose();
      sandboxRecovery.dispose();
      browserWindow.removeEventListener("pagehide", flushRecovery);
      browserWindow.removeEventListener(
        "pagehide",
        releaseViewerSession
      );
      documentRoot.removeEventListener(
        "visibilitychange",
        flushHiddenRecovery
      );
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
