import {
  HUD_COLLISION_VALUES,
  HUD_SECTION_SCROLL_MODES,
  HUD_VISIBILITY_VALUES
} from "../../edit-hud-layout/src/HudLayoutPolicy.js?build=20260801-0046d";
import { descriptorLabels } from "../../edit-hud-layout/src/HudDomLayout.js?build=20260801-0046d";
import { resolveGridLayout } from "../../edit-hud-layout/src/HudGridEngine.js?build=20260801-0046d";

const SECTION_VISIBILITIES = HUD_VISIBILITY_VALUES.filter(value => value !== "inherit");
const TABS = Object.freeze([
  ["canvas", "Prévia"],
  ["structure", "Estrutura"],
  ["properties", "Propriedades"],
  ["library", "Biblioteca"],
  ["application", "Aplicação"]
]);

export class HudDesignerController {
  static apiVersion = "hud-designer-controller-v1";

  #root;
  #store;
  #descriptors;
  #descriptorById;
  #labels;
  #commands;
  #uiModules;
  #applicationStore;
  #unsubscribe;
  #unsubscribeApplications;
  #search = "";
  #tab = "canvas";
  #selection = null;
  #pointer = null;
  #listeners = [];
  #renderListeners = [];
  #suppressCanvasClickUntil = 0;

  constructor({
    root,
    store,
    descriptors = [],
    commands = [],
    uiModules = null,
    applicationStore = null
  } = {}) {
    if (!root) throw new TypeError("HudDesignerController exige root.");
    if (!store) throw new TypeError("HudDesignerController exige store.");
    this.#root = root;
    this.#store = store;
    this.#descriptors = [...descriptors];
    this.#descriptorById = new Map(this.#descriptors.map(descriptor => [descriptor.id, descriptor]));
    this.#labels = descriptorLabels(this.#descriptors);
    this.#commands = normalizeCommands(commands);
    this.#uiModules = uiModules;
    this.#applicationStore = applicationStore;
    this.#bindShell();
    this.#unsubscribe = this.#store.subscribe(() => this.render());
    this.#unsubscribeApplications = this.#applicationStore?.subscribe?.(() => this.render()) ?? null;
    this.render();
  }

  dispose() {
    this.#unsubscribe?.();
    this.#unsubscribeApplications?.();
    this.#clearRenderListeners();
    for (const [target, type, listener, options] of this.#listeners) {
      target.removeEventListener(type, listener, options);
    }
    this.#listeners.length = 0;
  }

  open() {
    this.#root.hidden = false;
    this.#root.dataset.open = "true";
    this.render();
  }

  close() {
    this.#root.hidden = true;
    this.#root.dataset.open = "false";
    this.#pointer = null;
  }

  setDescriptors(descriptors = []) {
    this.#descriptors = [...descriptors];
    this.#descriptorById = new Map(this.#descriptors.map(descriptor => [descriptor.id, descriptor]));
    this.#labels = descriptorLabels(this.#descriptors);
    if (this.#selection?.kind === "item" && !this.#descriptorById.has(this.#selection.id)) {
      this.#selection = null;
    }
    this.render();
  }

  openItem(itemId) {
    const id = String(itemId ?? "").trim();
    if (!this.#descriptorById.has(id)) return this.open();
    this.#selection = { kind: "item", id };
    this.#tab = "properties";
    this.open();
  }

  openSection(sectionId) {
    const id = String(sectionId ?? "").trim();
    if (!id) return this.open();
    this.#selection = { kind: "section", id };
    this.#tab = "properties";
    this.open();
  }

  render() {
    this.#clearRenderListeners();
    this.#renderProfileToolbar();
    const body = this.#root.querySelector("[data-hud-customizer-body]");
    if (!body) return;
    body.replaceChildren();
    body.classList.add("hud-designer-body");
    const document = body.ownerDocument;
    const nav = document.createElement("nav");
    nav.className = "hud-designer-tabs";
    for (const [id, label] of TABS) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.dataset.hudDesignerTab = id;
      button.dataset.active = this.#tab === id ? "true" : "false";
      button.addEventListener("click", () => {
        this.#tab = id;
        this.render();
      });
      nav.append(button);
    }
    body.append(nav);

    const panel = document.createElement("section");
    panel.className = `hud-designer-view hud-designer-${this.#tab}`;
    panel.dataset.hudDesignerView = this.#tab;
    if (this.#tab === "canvas") panel.append(this.#renderCanvas(document));
    if (this.#tab === "structure") panel.append(this.#renderStructure(document));
    if (this.#tab === "properties") panel.append(this.#renderProperties(document));
    if (this.#tab === "library") panel.append(this.#renderLibrary(document));
    if (this.#tab === "application") panel.append(this.#renderApplication(document));
    body.append(panel);
  }

  #renderCanvas(document) {
    const profile = this.#store.profile();
    const wrapper = document.createElement("div");
    wrapper.className = "hud-designer-canvas-wrap";
    const toolbar = document.createElement("div");
    toolbar.className = "hud-designer-canvas-toolbar";
    toolbar.append(
      numberField(document, "Colunas", profile.viewport.columns, 1, 1024, value => this.#store.updateViewport({ columns: value })),
      numberField(document, "Linhas", profile.viewport.rows, 1, 1024, value => this.#store.updateViewport({ rows: value })),
      selectField(document, "Colisão", HUD_COLLISION_VALUES, profile.viewport.collisionMode, value => this.#store.updateViewport({ collisionMode: value }))
    );
    wrapper.append(toolbar);

    const canvas = document.createElement("div");
    canvas.className = "hud-designer-canvas-grid";
    canvas.dataset.hudDesignerCanvas = "true";
    canvas.style.setProperty("--designer-columns", String(profile.viewport.columns));
    canvas.style.setProperty("--designer-rows", String(profile.viewport.rows));
    const sections = Object.entries(profile.sections).map(([id, policy]) => ({ id, ...policy }));
    const sectionLayout = resolveGridLayout({
      entries: sections.filter(section => section.present !== false),
      columns: profile.viewport.columns,
      minimumRows: profile.viewport.rows,
      collisionMode: profile.viewport.collisionMode
    });
    for (const section of sectionLayout.placements) {
      const card = document.createElement("article");
      card.className = "hud-designer-section-card";
      card.dataset.designerSection = section.id;
      card.dataset.selected = this.#selection?.kind === "section" && this.#selection.id === section.id ? "true" : "false";
      card.style.gridColumn = `${section.x + 1} / span ${section.width}`;
      card.style.gridRow = `${section.y + 1} / span ${section.height}`;
      card.style.setProperty("--designer-section-color", section.color);
      const header = document.createElement("header");
      header.dataset.designerSectionHandle = "true";
      header.innerHTML = `<strong></strong><small></small>`;
      header.querySelector("strong").textContent = section.label ?? this.#labels.families[section.id] ?? section.id;
      header.querySelector("small").textContent = `${section.columns}×${section.rows}`;
      header.addEventListener("click", event => {
        if (event.defaultPrevented || performanceNow() < this.#suppressCanvasClickUntil) return;
        this.#selection = { kind: "section", id: section.id };
        this.render();
      });
      const grid = document.createElement("div");
      grid.className = "hud-designer-section-grid";
      grid.dataset.designerSectionGrid = section.id;
      grid.style.setProperty("--designer-section-columns", String(section.columns));
      grid.style.setProperty("--designer-section-rows", String(section.rows));
      const itemPolicies = Object.entries(profile.items)
        .filter(([, policy]) => policy.present !== false && policy.section === section.id)
        .map(([id, policy]) => ({ id, ...policy }));
      const itemLayout = resolveGridLayout({
        entries: itemPolicies,
        columns: section.columns,
        minimumRows: section.rows,
        collisionMode: section.collisionMode
      });
      for (const item of itemLayout.placements) {
        const descriptor = this.#descriptorById.get(item.id);
        const tile = document.createElement("button");
        tile.type = "button";
        tile.className = "hud-designer-item-card";
        tile.dataset.designerItem = item.id;
        tile.dataset.kind = descriptor?.kind ?? "unknown";
        tile.dataset.selected = this.#selection?.kind === "item" && this.#selection.id === item.id ? "true" : "false";
        tile.style.gridColumn = `${item.x + 1} / span ${item.width}`;
        tile.style.gridRow = `${item.y + 1} / span ${item.height}`;
        const icon = document.createElement("span");
        icon.textContent = item.icon ?? descriptor?.nativeIcon ?? descriptor?.icon ?? kindGlyph(descriptor?.kind);
        const label = document.createElement("small");
        label.textContent = item.label ?? descriptor?.label ?? item.id;
        const itemResize = document.createElement("span");
        itemResize.className = "hud-designer-item-resize";
        itemResize.dataset.designerItemResize = "true";
        tile.append(icon, label, itemResize);
        tile.addEventListener("click", event => {
          if (event.defaultPrevented || performanceNow() < this.#suppressCanvasClickUntil) return;
          this.#selection = { kind: "item", id: item.id };
          this.render();
        });
        grid.append(tile);
      }
      const resize = document.createElement("span");
      resize.className = "hud-designer-section-resize";
      resize.dataset.designerSectionResize = "true";
      card.append(header, grid, resize);
      canvas.append(card);
    }
    if (sectionLayout.unplaced.length) {
      const warning = document.createElement("p");
      warning.className = "hud-designer-warning";
      warning.textContent = `${sectionLayout.unplaced.length} seção(ões) sem espaço; aumente a grade ou altere a política de colisão.`;
      wrapper.append(warning);
    }
    this.#bindCanvasPointers(canvas);
    wrapper.append(canvas);
    return wrapper;
  }

  #renderStructure(document) {
    const profile = this.#store.profile();
    const root = document.createElement("div");
    root.className = "hud-designer-structure-tree";
    for (const [sectionId, section] of orderedSections(profile)) {
      const details = document.createElement("details");
      details.open = true;
      details.dataset.present = section.present !== false ? "true" : "false";
      const summary = document.createElement("summary");
      const title = document.createElement("button");
      title.type = "button";
      title.textContent = section.label ?? this.#labels.families[sectionId] ?? sectionId;
      title.addEventListener("click", event => {
        event.preventDefault();
        this.#selection = { kind: "section", id: sectionId };
        this.#tab = "properties";
        this.render();
      });
      const status = document.createElement("small");
      status.textContent = section.present === false ? "removida" : `${section.x ?? "?"},${section.y ?? "?"}`;
      summary.append(title, status);
      details.append(summary);
      const list = document.createElement("ol");
      for (const [itemId, item] of orderedItems(profile, sectionId)) {
        const descriptor = this.#descriptorById.get(itemId);
        const row = document.createElement("li");
        row.dataset.present = item.present !== false ? "true" : "false";
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = item.label ?? descriptor?.label ?? itemId;
        button.addEventListener("click", () => {
          this.#selection = { kind: "item", id: itemId };
          this.#tab = "properties";
          this.render();
        });
        const meta = document.createElement("small");
        meta.textContent = `${descriptor?.kind ?? "?"} · ${item.x ?? "?"},${item.y ?? "?"} · ${item.width}×${item.height}`;
        row.append(button, meta);
        list.append(row);
      }
      details.append(list);
      root.append(details);
    }
    const unplaced = Object.entries(profile.items).filter(([, item]) => item.present !== false && !item.section);
    if (unplaced.length) {
      const details = document.createElement("details");
      details.open = true;
      const summary = document.createElement("summary");
      summary.textContent = `Não posicionados (${unplaced.length})`;
      details.append(summary);
      for (const [itemId] of unplaced) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = this.#descriptorById.get(itemId)?.label ?? itemId;
        button.addEventListener("click", () => {
          this.#selection = { kind: "item", id: itemId };
          this.#tab = "properties";
          this.render();
        });
        details.append(button);
      }
      root.append(details);
    }
    return root;
  }

  #renderProperties(document) {
    const profile = this.#store.profile();
    const root = document.createElement("div");
    root.className = "hud-designer-properties-panel";
    if (!this.#selection) {
      root.append(message(document, "Selecione uma seção ou componente na prévia ou na estrutura."));
      root.append(this.#viewportEditor(document, profile));
      return root;
    }
    if (this.#selection.kind === "section") {
      const id = this.#selection.id;
      const section = profile.sections[id];
      if (!section) return message(document, "Seção inexistente.");
      const title = document.createElement("h3");
      title.textContent = `Seção · ${section.label ?? id}`;
      root.append(title,
        textField(document, "Nome", section.label ?? id, value => this.#store.updateSection(id, { label: value || null })),
        colorField(document, "Cor", section.color, value => this.#store.updateSection(id, { color: value })),
        selectField(document, "Visibilidade", SECTION_VISIBILITIES, section.visibility, value => this.#store.updateSection(id, { visibility: value })),
        numberField(document, "X", section.x ?? 0, 0, 1024, value => this.#store.placeSectionAt(id, { x: value, y: section.y ?? 0 })),
        numberField(document, "Y", section.y ?? 0, 0, 4096, value => this.#store.placeSectionAt(id, { x: section.x ?? 0, y: value })),
        numberField(document, "Largura externa", section.width, 1, 256, value => this.#store.placeSectionAt(id, { x: section.x ?? 0, y: section.y ?? 0, width: value, height: section.height })),
        numberField(document, "Altura externa", section.height, 1, 256, value => this.#store.placeSectionAt(id, { x: section.x ?? 0, y: section.y ?? 0, width: section.width, height: value })),
        numberField(document, "Colunas internas", section.columns, 1, 256, value => this.#store.updateSection(id, { columns: value })),
        numberField(document, "Linhas internas", section.rows, 1, 256, value => this.#store.updateSection(id, { rows: value })),
        selectField(document, "Excesso", HUD_SECTION_SCROLL_MODES, section.scrollMode, value => this.#store.updateSection(id, { scrollMode: value })),
        selectField(document, "Colisão interna", HUD_COLLISION_VALUES, section.collisionMode, value => this.#store.updateSection(id, { collisionMode: value })),
        checkboxField(document, "Mostrar título", section.showHeader !== false, value => this.#store.updateSection(id, { showHeader: value }))
      );
      const actions = document.createElement("div");
      actions.className = "hud-designer-property-actions";
      const remove = actionButton(document, "Remover do perfil", () => {
        this.#store.deleteSection(id);
        this.#selection = null;
        this.#tab = "library";
      });
      const reset = actionButton(document, "Restaurar padrão", () => this.#store.resetSection(id));
      actions.append(remove, reset);
      root.append(actions);
      return root;
    }

    const id = this.#selection.id;
    const item = profile.items[id];
    const descriptor = this.#descriptorById.get(id);
    if (!item || !descriptor) return message(document, "Componente inexistente.");
    const title = document.createElement("h3");
    title.textContent = `Componente · ${item.label ?? descriptor.label}`;
    const kind = document.createElement("p");
    kind.className = "hud-designer-kind";
    kind.textContent = `Tipo: ${descriptor.kind} · módulo: ${descriptor.sourceModule ?? "legado"}`;
    root.append(title, kind,
      textField(document, "Nome", item.label ?? descriptor.label, value => this.#store.updateItem(id, { label: value || null })),
      textField(document, "Ícone", item.icon ?? descriptor.nativeIcon ?? "", value => this.#store.updateItem(id, { icon: value || null })),
      sectionSelect(document, profile, item.section, value => {
        if (!value) this.#store.updateItem(id, { section: null, x: null, y: null, present: true });
        else this.#store.placeItemAt(id, { section: value, x: null, y: null });
      }),
      selectField(document, "Visibilidade", HUD_VISIBILITY_VALUES, item.visibility, value => this.#store.updateItem(id, { visibility: value })),
      numberField(document, "X", item.x ?? 0, 0, 1024, value => item.section && this.#store.placeItemAt(id, { section: item.section, x: value, y: item.y ?? 0 })),
      numberField(document, "Y", item.y ?? 0, 0, 4096, value => item.section && this.#store.placeItemAt(id, { section: item.section, x: item.x ?? 0, y: value })),
      numberField(document, "Largura", item.width, descriptor.sizing?.minWidth ?? 1, descriptor.sizing?.maxWidth ?? 256, value => item.section && this.#store.placeItemAt(id, { section: item.section, x: item.x, y: item.y, width: value, height: item.height })),
      numberField(document, "Altura", item.height, descriptor.sizing?.minHeight ?? 1, descriptor.sizing?.maxHeight ?? 256, value => item.section && this.#store.placeItemAt(id, { section: item.section, x: item.x, y: item.y, width: item.width, height: value })),
      commandField(document, "Comando", item.command?.id ?? descriptor.action?.command ?? "", this.#commands, value => this.#updateCommand(id, value, item.command?.arguments ?? descriptor.action?.arguments ?? {})),
      jsonField(document, "Parâmetros", item.command?.arguments ?? descriptor.action?.arguments ?? {}, value => this.#updateCommand(id, item.command?.id ?? descriptor.action?.command ?? "", value)),
      selectField(document, "Ativação", ["native", "momentary", "toggle"], item.activation?.mode ?? "native", value => this.#store.updateItem(id, { activation: { ...item.activation, mode: value } })),
      textField(document, "Grupo de exclusão", item.activation?.group ?? "", value => this.#store.updateItem(id, { activation: { ...item.activation, group: value || null } })),
      textField(document, "Ativa ícones", (item.activation?.activates ?? []).join(", "), value => this.#updateActivationList(id, item.activation, "activates", value)),
      textField(document, "Desativa ícones", (item.activation?.deactivates ?? []).join(", "), value => this.#updateActivationList(id, item.activation, "deactivates", value)),
      textField(document, "Ao desligar, ativa", (item.activation?.activatesOnDeactivate ?? []).join(", "), value => this.#updateActivationList(id, item.activation, "activatesOnDeactivate", value)),
      textField(document, "Ao desligar, desativa", (item.activation?.deactivatesOnDeactivate ?? []).join(", "), value => this.#updateActivationList(id, item.activation, "deactivatesOnDeactivate", value)),
      commandField(document, "Comando ao ativar", item.activation?.onActivate?.id ?? "", this.#commands, value => this.#updateActivationCommand(id, item.activation, "onActivate", value)),
      commandField(document, "Comando ao desativar", item.activation?.onDeactivate?.id ?? "", this.#commands, value => this.#updateActivationCommand(id, item.activation, "onDeactivate", value))
    );
    if (item.command?.id && !this.#commands.has(item.command.id)) {
      const warning = message(document, `Comando não registrado no runtime atual: ${item.command.id}.`);
      warning.classList.add("hud-designer-warning");
      root.append(warning);
    }
    const actions = document.createElement("div");
    actions.className = "hud-designer-property-actions";
    actions.append(
      actionButton(document, "Remover do perfil", () => {
        this.#store.removeItem(id);
        this.#selection = null;
        this.#tab = "library";
      }),
      actionButton(document, "Restaurar padrão", () => this.#store.resetItem(id))
    );
    root.append(actions);
    return root;
  }

  #renderLibrary(document) {
    const profile = this.#store.profile();
    const root = document.createElement("div");
    root.className = "hud-designer-library";
    const search = document.createElement("input");
    search.type = "search";
    search.placeholder = "Filtrar componentes";
    search.value = this.#search;
    search.addEventListener("input", event => {
      this.#search = searchable(event.target.value);
      this.render();
    });
    root.append(search);

    const removedSections = Object.entries(profile.sections).filter(([, section]) => section.present === false);
    if (removedSections.length) {
      const group = document.createElement("section");
      group.innerHTML = "<h3>Seções removidas</h3>";
      for (const [sectionId, section] of removedSections) {
        const card = libraryCard(document, section.label ?? this.#labels.families[sectionId] ?? sectionId, "section", () => this.#store.restoreSection(sectionId));
        group.append(card);
      }
      root.append(group);
    }

    const available = this.#descriptors.filter(descriptor => {
      const item = profile.items[descriptor.id];
      const text = searchable(`${descriptor.label} ${descriptor.id} ${descriptor.kind} ${descriptor.category}`);
      return (!this.#search || text.includes(this.#search)) && (item?.present === false || !item?.section);
    });
    const group = document.createElement("section");
    group.innerHTML = `<h3>Componentes não posicionados (${available.length})</h3>`;
    for (const descriptor of available) {
      const card = libraryCard(document, descriptor.label, descriptor.kind, () => {
        this.#store.restoreItem(descriptor.id);
        this.#selection = { kind: "item", id: descriptor.id };
        this.#tab = "properties";
      });
      card.dataset.designerLibraryItem = descriptor.id;
      group.append(card);
    }
    if (!available.length) group.append(message(document, "Todos os componentes registrados estão posicionados."));
    root.append(group);
    return root;
  }

  #renderApplication(document) {
    const root = document.createElement("div");
    root.className = "hud-designer-application";
    if (!this.#uiModules || !this.#applicationStore) {
      root.append(message(document, "O compositor declarativo de aplicações não está disponível neste runtime."));
      return root;
    }
    const active = this.#applicationStore.activeApplication();
    const applicationBar = document.createElement("div");
    applicationBar.className = "hud-designer-application-toolbar";
    const selector = document.createElement("select");
    for (const application of this.#applicationStore.applications()) {
      const option = document.createElement("option");
      option.value = application.id;
      option.textContent = application.name;
      option.selected = application.id === this.#applicationStore.activeApplicationId();
      selector.append(option);
    }
    selector.addEventListener("change", () => this.#applicationStore.setActiveApplication(selector.value));
    const hudProfileSelector = document.createElement("select");
    const followCurrent = document.createElement("option");
    followCurrent.value = "";
    followCurrent.textContent = "HUD atual (sem vínculo)";
    hudProfileSelector.append(followCurrent);
    for (const profile of this.#store.profiles()) {
      const option = document.createElement("option");
      option.value = profile.id;
      option.textContent = `HUD · ${profile.label}`;
      option.selected = profile.id === active.hudProfileId;
      hudProfileSelector.append(option);
    }
    hudProfileSelector.title = "Perfil do HUD ativado junto com esta aplicação";
    hudProfileSelector.addEventListener("change", () =>
      this.#applicationStore.updateApplication(this.#applicationStore.activeApplicationId(), {
        hudProfileId: hudProfileSelector.value || null
      })
    );
    applicationBar.append(
      selector,
      hudProfileSelector,
      actionButton(document, "Nova", () => {
        const name = globalThis.prompt?.("Nome da aplicação:", "Nova aplicação");
        if (name) this.#applicationStore.createApplication({ name });
      }),
      actionButton(document, "Duplicar", () => this.#applicationStore.duplicateApplication()),
      actionButton(document, "Excluir", () => {
        const id = this.#applicationStore.activeApplicationId();
        if (id !== "default" && globalThis.confirm?.("Excluir a aplicação ativa?") !== false) this.#applicationStore.deleteApplication(id);
      })
    );
    const heading = document.createElement("h3");
    heading.textContent = active.name;
    const explanation = message(document, "Uma aplicação é uma composição de módulos declarativos. Desativar um módulo remove seus componentes da interface sem alterar o núcleo ou os perfis de layout.");
    root.append(applicationBar, heading, explanation);
    const modules = this.#uiModules.describe().modules;
    for (const module of modules) {
      const row = document.createElement("label");
      row.className = "hud-designer-module-row";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = this.#uiModules.isEnabled(module.id);
      input.addEventListener("change", () => {
        try {
          this.#applicationStore.setModuleEnabled(module.id, input.checked);
        } catch (error) {
          input.checked = !input.checked;
          globalThis.alert?.(error.message);
        }
      });
      const text = document.createElement("span");
      const title = document.createElement("strong");
      title.textContent = module.title;
      const meta = document.createElement("small");
      meta.textContent = `${module.id}${module.dependencies.length ? ` · depende de ${module.dependencies.join(", ")}` : ""}`;
      text.append(title, meta);
      row.append(input, text);
      root.append(row);
    }
    const actions = document.createElement("div");
    actions.className = "hud-designer-property-actions";
    actions.append(
      actionButton(document, "Renomear aplicação", () => {
        const name = globalThis.prompt?.("Nome da aplicação:", active.name);
        if (name) this.#applicationStore.renameApplication(this.#applicationStore.activeApplicationId(), name);
      }),
      actionButton(document, "Exportar aplicações", () => downloadJson(document, `spatialseed-applications.json`, this.#applicationStore.exportDocument())),
      fileAction(document, "Importar aplicações", async file => {
        this.#applicationStore.importText(await file.text());
      })
    );
    root.append(actions);
    return root;
  }

  #viewportEditor(document, profile) {
    const group = document.createElement("section");
    group.className = "hud-designer-viewport-editor";
    group.innerHTML = "<h3>Área do HUD</h3>";
    group.append(
      numberField(document, "Colunas", profile.viewport.columns, 1, 1024, value => this.#store.updateViewport({ columns: value })),
      numberField(document, "Linhas", profile.viewport.rows, 1, 1024, value => this.#store.updateViewport({ rows: value })),
      selectField(document, "Colisão", HUD_COLLISION_VALUES, profile.viewport.collisionMode, value => this.#store.updateViewport({ collisionMode: value }))
    );
    return group;
  }

  #updateCommand(itemId, command, args) {
    const id = String(command ?? "").trim();
    this.#store.updateItem(itemId, {
      command: id ? { id, arguments: args && typeof args === "object" ? args : {} } : null
    });
  }

  #updateActivationList(itemId, activation, key, value) {
    const values = [...new Set(String(value ?? "").split(/[,;\s]+/).map(item => item.trim()).filter(Boolean))];
    this.#store.updateItem(itemId, { activation: { ...activation, [key]: values } });
  }

  #updateActivationCommand(itemId, activation, key, value) {
    const id = String(value ?? "").trim();
    this.#store.updateItem(itemId, {
      activation: {
        ...activation,
        [key]: id ? { id, arguments: activation?.[key]?.arguments ?? {} } : null
      }
    });
  }

  #bindCanvasPointers(canvas) {
    const down = event => {
      if (event.button !== undefined && event.button !== 0) return;
      const item = event.target.closest?.("[data-designer-item]");
      const itemResize = event.target.closest?.("[data-designer-item-resize]");
      const sectionResize = event.target.closest?.("[data-designer-section-resize]");
      const sectionHandle = event.target.closest?.("[data-designer-section-handle]");
      const section = event.target.closest?.("[data-designer-section]");
      if (!item && !sectionHandle && !sectionResize) return;
      const profile = this.#store.profile();
      const cell = canvasPitch(canvas, profile.viewport.columns);
      if (item) {
        const id = item.dataset.designerItem;
        const policy = profile.items[id];
        const parent = item.closest("[data-designer-section]");
        const sectionId = parent?.dataset.designerSection;
        const sectionGrid = parent?.querySelector("[data-designer-section-grid]");
        if (!policy || !sectionId || !sectionGrid) return;
        this.#pointer = {
          kind: "item",
          id,
          sectionId,
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          lastX: event.clientX,
          lastY: event.clientY,
          x: policy.x ?? 0,
          y: policy.y ?? 0,
          width: policy.width,
          height: policy.height,
          gridRect: sectionGrid.getBoundingClientRect(),
          columns: profile.sections[sectionId].columns,
          rows: profile.sections[sectionId].rows,
          resize: Boolean(itemResize)
        };
      } else if (section) {
        const id = section.dataset.designerSection;
        const policy = profile.sections[id];
        if (!policy) return;
        this.#pointer = {
          kind: "section",
          id,
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          lastX: event.clientX,
          lastY: event.clientY,
          x: policy.x ?? 0,
          y: policy.y ?? 0,
          width: policy.width,
          height: policy.height,
          cell,
          resize: Boolean(sectionResize)
        };
      }
      if (this.#pointer) {
        canvas.setPointerCapture?.(event.pointerId);
        event.preventDefault();
      }
    };
    const move = event => {
      const pointer = this.#pointer;
      if (!pointer || pointer.pointerId !== event.pointerId) return;
      pointer.lastX = event.clientX;
      pointer.lastY = event.clientY;
      event.preventDefault();
    };
    const up = event => {
      const pointer = this.#pointer;
      if (!pointer || pointer.pointerId !== event.pointerId) return;
      canvas.releasePointerCapture?.(event.pointerId);
      const clientX = pointer.lastX ?? event.clientX;
      const clientY = pointer.lastY ?? event.clientY;
      const dx = clientX - pointer.startX;
      const dy = clientY - pointer.startY;
      const moved = Math.abs(dx) + Math.abs(dy) > 5;
      if (pointer.kind === "section") {
        const xDelta = Math.round(dx / pointer.cell);
        const yDelta = Math.round(dy / pointer.cell);
        if (pointer.resize) {
          this.#store.placeSectionAt(pointer.id, {
            x: pointer.x,
            y: pointer.y,
            width: Math.max(1, pointer.width + xDelta),
            height: Math.max(1, pointer.height + yDelta)
          });
        } else if (moved) {
          this.#store.placeSectionAt(pointer.id, {
            x: Math.max(0, pointer.x + xDelta),
            y: Math.max(0, pointer.y + yDelta)
          });
        }
      } else if (pointer.resize) {
        const pitchX = pointer.gridRect.width / Math.max(1, pointer.columns);
        const pitchY = pointer.gridRect.height / Math.max(1, pointer.rows);
        this.#store.placeItemAt(pointer.id, {
          section: pointer.sectionId,
          x: pointer.x,
          y: pointer.y,
          width: Math.max(1, pointer.width + Math.round(dx / Math.max(1, pitchX))),
          height: Math.max(1, pointer.height + Math.round(dy / Math.max(1, pitchY)))
        });
      } else if (moved) {
        const hit = canvas.ownerDocument.elementFromPoint?.(clientX, clientY);
        const targetSection = hit?.closest?.("[data-designer-section]");
        const targetGrid = targetSection?.querySelector?.("[data-designer-section-grid]");
        const targetSectionId = targetSection?.dataset?.designerSection;
        if (targetGrid && targetSectionId) {
          const targetPolicy = this.#store.profile().sections[targetSectionId];
          const targetRect = targetGrid.getBoundingClientRect();
          const computed = globalThis.getComputedStyle?.(targetGrid);
          const gapX = Number.parseFloat(computed?.columnGap ?? computed?.gap) || 0;
          const gapY = Number.parseFloat(computed?.rowGap ?? computed?.gap) || 0;
          const columns = Math.max(1, targetPolicy.columns);
          const rows = Math.max(1, targetPolicy.rows);
          const pitchX = Math.max(1, (targetRect.width - gapX * (columns - 1)) / columns + gapX);
          const pitchY = Math.max(1, (targetRect.height - gapY * (rows - 1)) / rows + gapY);
          const x = Math.max(0, Math.floor((clientX - targetRect.left + targetGrid.scrollLeft) / pitchX));
          const y = Math.max(0, Math.floor((clientY - targetRect.top + targetGrid.scrollTop) / pitchY));
          this.#store.placeItemAt(pointer.id, { section: targetSectionId, x, y });
        }
      }
      if (moved || pointer.resize) this.#suppressCanvasClickUntil = performanceNow() + 350;
      this.#pointer = null;
      event.preventDefault();
    };
    for (const [type, listener] of [["pointerdown", down], ["pointermove", move], ["pointerup", up], ["pointercancel", up]]) {
      canvas.addEventListener(type, listener);
      this.#renderListeners.push([canvas, type, listener, undefined]);
    }
  }

  #clearRenderListeners() {
    for (const [target, type, listener, options] of this.#renderListeners) {
      target.removeEventListener(type, listener, options);
    }
    this.#renderListeners.length = 0;
  }

  #bindShell() {
    const bind = (selector, type, listener) => {
      const target = this.#root.querySelector(selector);
      if (!target) return;
      target.addEventListener(type, listener);
      this.#listeners.push([target, type, listener, undefined]);
    };
    bind("[data-hud-customizer-close]", "click", () => this.close());
    bind("[data-hud-customizer-reset]", "click", () => {
      if (globalThis.confirm?.("Restaurar todos os perfis e o layout padrão?") !== false) this.#store.reset();
    });
    bind("[data-hud-profile-select]", "change", event => this.#store.setActiveProfile(event.target.value));
    bind("[data-hud-profile-new]", "click", () => {
      const label = globalThis.prompt?.("Nome do novo perfil:", "Novo perfil");
      if (label) this.#store.createProfile({ label });
    });
    bind("[data-hud-profile-copy]", "click", () => this.#store.duplicateProfile());
    bind("[data-hud-profile-rename]", "click", () => {
      const profile = this.#store.profile();
      const label = globalThis.prompt?.("Novo nome do perfil:", profile.label);
      if (label) this.#store.renameProfile(this.#store.activeProfileId(), label);
    });
    bind("[data-hud-profile-delete]", "click", () => {
      if (this.#store.activeProfileId() === "default") return;
      if (globalThis.confirm?.("Remover o perfil ativo?") !== false) this.#store.deleteProfile(this.#store.activeProfileId());
    });
    bind("[data-hud-section-new]", "click", () => {
      const label = globalThis.prompt?.("Nome da nova seção:", "Nova seção");
      if (label) {
        const id = this.#store.addSection({ label });
        this.#selection = { kind: "section", id };
        this.#tab = "properties";
      }
    });
    bind("[data-hud-profile-export]", "click", () => downloadJson(this.#root.ownerDocument, `spatialseed-hud-${this.#store.activeProfileId()}.json`, this.#store.exportDocument()));
    bind("[data-hud-profile-import]", "change", async event => {
      const file = event.target.files?.[0];
      if (!file) return;
      this.#store.importText(await file.text());
      event.target.value = "";
    });
    const backdrop = event => { if (event.target === this.#root) this.close(); };
    this.#root.addEventListener("click", backdrop);
    this.#listeners.push([this.#root, "click", backdrop, undefined]);
  }

  #renderProfileToolbar() {
    const select = this.#root.querySelector("[data-hud-profile-select]");
    if (!select) return;
    const profiles = this.#store.profiles();
    const active = this.#store.activeProfileId();
    select.replaceChildren();
    for (const profile of profiles) {
      const option = select.ownerDocument.createElement("option");
      option.value = profile.id;
      option.textContent = profile.label;
      option.selected = profile.id === active;
      select.append(option);
    }
    const deleteButton = this.#root.querySelector("[data-hud-profile-delete]");
    if (deleteButton) deleteButton.disabled = active === "default";
  }
}

function normalizeCommands(commands) {
  const map = new Map();
  for (const item of Array.isArray(commands) ? commands : []) {
    const id = typeof item === "string" ? item : item?.id;
    if (id) map.set(id, item);
  }
  return map;
}
function orderedSections(profile) {
  return Object.entries(profile.sections ?? {}).sort(([, left], [, right]) => (left.order ?? 0) - (right.order ?? 0));
}
function orderedItems(profile, sectionId) {
  return Object.entries(profile.items ?? {}).filter(([, item]) => item.section === sectionId).sort(([, left], [, right]) => (left.order ?? 0) - (right.order ?? 0));
}
function searchable(value) { return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); }
function kindGlyph(kind) { return ({ select: "▾", range: "━", number: "#", integer: "#", color: "◉", boolean: "✓", text: "T", composite: "▦" })[kind] ?? "•"; }
function canvasPitch(canvas, columns) { return Math.max(8, canvas.getBoundingClientRect().width / Math.max(1, columns)); }
function message(document, text) { const p = document.createElement("p"); p.textContent = text; return p; }
function actionButton(document, label, action) { const button = document.createElement("button"); button.type = "button"; button.textContent = label; button.addEventListener("click", action); return button; }
function libraryCard(document, label, kind, action) { const button = actionButton(document, label, action); button.className = "hud-designer-library-card"; const small = document.createElement("small"); small.textContent = kind; button.append(small); return button; }
function field(document, labelText, control) { const label = document.createElement("label"); const span = document.createElement("span"); span.textContent = labelText; label.append(span, control); return label; }
function textField(document, label, value, update) { const input = document.createElement("input"); input.type = "text"; input.value = value ?? ""; input.addEventListener("change", () => update(input.value)); return field(document, label, input); }
function numberField(document, label, value, min, max, update) { const input = document.createElement("input"); input.type = "number"; input.value = String(value ?? 0); input.min = String(min); input.max = String(max); input.step = "1"; input.addEventListener("change", () => update(Math.max(min, Math.min(max, Math.trunc(Number(input.value) || 0))))); return field(document, label, input); }
function colorField(document, label, value, update) { const input = document.createElement("input"); input.type = "color"; input.value = value; input.addEventListener("change", () => update(input.value)); return field(document, label, input); }
function checkboxField(document, label, value, update) { const input = document.createElement("input"); input.type = "checkbox"; input.checked = Boolean(value); input.addEventListener("change", () => update(input.checked)); return field(document, label, input); }
function selectField(document, label, values, value, update) { const select = document.createElement("select"); for (const optionValue of values) { const option = document.createElement("option"); option.value = optionValue; option.textContent = optionValue; option.selected = optionValue === value; select.append(option); } select.addEventListener("change", () => update(select.value)); return field(document, label, select); }
function sectionSelect(document, profile, value, update) { const select = document.createElement("select"); const none = document.createElement("option"); none.value = ""; none.textContent = "Não posicionado"; select.append(none); for (const [id, section] of orderedSections(profile)) { if (section.present === false) continue; const option = document.createElement("option"); option.value = id; option.textContent = section.label ?? id; option.selected = id === value; select.append(option); } select.addEventListener("change", () => update(select.value)); return field(document, "Seção", select); }
function commandField(document, label, value, commands, update) { const input = document.createElement("input"); input.type = "text"; input.value = value ?? ""; const datalistId = `hud-command-${Math.random().toString(36).slice(2)}`; const datalist = document.createElement("datalist"); datalist.id = datalistId; for (const id of commands.keys()) { const option = document.createElement("option"); option.value = id; datalist.append(option); } input.setAttribute("list", datalistId); input.addEventListener("change", () => update(input.value)); const wrapper = field(document, label, input); wrapper.append(datalist); return wrapper; }
function jsonField(document, label, value, update) { const textarea = document.createElement("textarea"); textarea.rows = 4; textarea.value = JSON.stringify(value ?? {}, null, 2); textarea.addEventListener("change", () => { try { const parsed = JSON.parse(textarea.value || "{}"); textarea.setCustomValidity(""); update(parsed); } catch (error) { textarea.setCustomValidity(error.message); textarea.reportValidity(); } }); return field(document, label, textarea); }
function fileAction(document, label, action) {
  const wrapper = document.createElement("label");
  wrapper.className = "hud-designer-file-action";
  wrapper.textContent = label;
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "application/json,.json";
  input.hidden = true;
  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    if (!file) return;
    try { await action(file); }
    finally { input.value = ""; }
  });
  wrapper.append(input);
  return wrapper;
}
function downloadJson(document, filename, text) { const blob = new Blob([String(text)], { type: "application/json" }); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = filename; document.body.append(link); link.click(); link.remove(); URL.revokeObjectURL(url); }
function performanceNow() { return globalThis.performance?.now?.() ?? Date.now(); }
