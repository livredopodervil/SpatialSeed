import {
  HUD_ACTIVATION_MODES,
  HUD_SECTION_SCROLL_MODES,
  HUD_VISIBILITY_VALUES,
  HUD_ZONE_VALUES
} from "./HudLayoutPolicy.js?build=20260801-0046c";
import { descriptorLabels } from "./HudDomLayout.js?build=20260801-0046c";

const SECTION_VISIBILITIES = HUD_VISIBILITY_VALUES.filter(value => value !== "inherit");
const SECTION_ZONES = HUD_ZONE_VALUES.filter(value => value !== "inherit");

export class HudCustomizationController {
  static apiVersion = "hud-customization-controller-v2";

  #root;
  #store;
  #descriptors;
  #labels;
  #unsubscribe;
  #search = "";
  #focusItem = null;
  #focusSection = null;

  constructor({ root, store, descriptors = [] } = {}) {
    if (!root) throw new TypeError("HudCustomizationController exige root.");
    if (!store) throw new TypeError("HudCustomizationController exige store.");
    this.#root = root;
    this.#store = store;
    this.#descriptors = [...descriptors];
    this.#labels = descriptorLabels(this.#descriptors);
    this.#unsubscribe = this.#store.subscribe(() => this.render());
    this.#bindShell();
    this.render();
  }

  dispose() {
    this.#unsubscribe?.();
  }

  open() {
    this.#root.hidden = false;
    this.#root.dataset.open = "true";
    this.render();
    this.#root.querySelector("input[type=search]")?.focus?.();
  }

  openSection(sectionId) {
    this.#focusSection = String(sectionId ?? "").trim() || null;
    this.open();
    queueMicrotask(() => {
      const row = this.#root.querySelector(`[data-family="${cssEscape(this.#focusSection)}"]`);
      row?.scrollIntoView?.({ block: "center", behavior: "smooth" });
      if (row) {
        row.open = true;
        row.dataset.focused = "true";
        globalThis.setTimeout?.(() => delete row.dataset.focused, 1200);
      }
    });
  }

  openItem(itemId) {
    this.#focusItem = String(itemId ?? "").trim() || null;
    this.open();
    queueMicrotask(() => {
      const row = this.#root.querySelector(`[data-item-editor="${cssEscape(this.#focusItem)}"]`);
      row?.scrollIntoView?.({ block: "center", behavior: "smooth" });
      if (row) {
        row.open = true;
        row.dataset.focused = "true";
        globalThis.setTimeout?.(() => delete row.dataset.focused, 1200);
      }
    });
  }

  close() {
    this.#root.hidden = true;
    this.#root.dataset.open = "false";
    this.#focusItem = null;
    this.#focusSection = null;
  }

  render() {
    this.#renderProfileToolbar();
    const profile = this.#store.profile();
    const body = this.#root.querySelector("[data-hud-customizer-body]");
    if (!body) return;
    body.replaceChildren();
    const document = body.ownerDocument;
    const sectionIds = orderedSectionIds(profile, this.#descriptors);

    for (const sectionId of sectionIds) {
      const sectionDescriptors = this.#descriptors.filter(descriptor => {
        const policy = profile.items[descriptor.id] ?? {};
        return (policy.section ?? descriptor.family) === sectionId && descriptor.customizable;
      });
      const sectionLabel = profile.sections[sectionId]?.label ??
        this.#labels.families[sectionId] ??
        sectionId;
      const matches = !this.#search ||
        searchable(sectionLabel).includes(this.#search) ||
        sectionDescriptors.some(descriptor =>
          searchable(profile.items[descriptor.id]?.label ?? this.#labels.items[descriptor.id])
            .includes(this.#search)
        );
      if (!matches) continue;

      const details = document.createElement("details");
      details.className = "hud-customizer-family";
      details.dataset.family = sectionId;
      details.open = Boolean(
        this.#search ||
        this.#focusSection === sectionId ||
        this.#focusItem && sectionDescriptors.some(descriptor => descriptor.id === this.#focusItem)
      );
      const summary = document.createElement("summary");
      const color = document.createElement("i");
      color.className = "hud-customizer-section-color";
      color.style.background = profile.sections[sectionId]?.color ?? "#528bff";
      const text = document.createElement("span");
      text.textContent = sectionLabel;
      const count = document.createElement("small");
      count.textContent = `${sectionDescriptors.length} itens`;
      summary.append(color, text, count);
      details.append(summary);
      details.append(this.#sectionEditor(document, sectionId, profile));

      const items = document.createElement("div");
      items.className = "hud-customizer-items";
      for (const descriptor of sectionDescriptors) {
        const itemLabel = profile.items[descriptor.id]?.label ?? this.#labels.items[descriptor.id];
        if (this.#search &&
            !searchable(itemLabel).includes(this.#search) &&
            !searchable(sectionLabel).includes(this.#search)) {
          continue;
        }
        items.append(this.#itemEditor(document, descriptor, profile));
      }
      details.append(items);
      body.append(details);
    }
  }

  #bindShell() {
    this.#root.querySelector("[data-hud-customizer-close]")
      ?.addEventListener("click", () => this.close());
    this.#root.querySelector("[data-hud-customizer-reset]")
      ?.addEventListener("click", () => {
        if (globalThis.confirm?.("Restaurar todos os perfis e o layout padrão?") !== false) {
          this.#store.reset();
        }
      });
    this.#root.querySelector("[data-hud-customizer-search]")
      ?.addEventListener("input", event => {
        this.#search = searchable(event.target.value);
        this.render();
      });
    this.#root.querySelector("[data-hud-profile-select]")
      ?.addEventListener("change", event => this.#store.setActiveProfile(event.target.value));
    this.#root.querySelector("[data-hud-profile-new]")
      ?.addEventListener("click", () => {
        const label = globalThis.prompt?.("Nome do novo perfil:", "Novo perfil");
        if (label) this.#store.createProfile({ label });
      });
    this.#root.querySelector("[data-hud-profile-copy]")
      ?.addEventListener("click", () => this.#store.duplicateProfile());
    this.#root.querySelector("[data-hud-profile-rename]")
      ?.addEventListener("click", () => {
        const profile = this.#store.profile();
        const label = globalThis.prompt?.("Novo nome do perfil:", profile.label);
        if (label) this.#store.renameProfile(this.#store.activeProfileId(), label);
      });
    this.#root.querySelector("[data-hud-profile-delete]")
      ?.addEventListener("click", () => {
        if (this.#store.activeProfileId() === "default") return;
        if (globalThis.confirm?.("Remover o perfil ativo?") !== false) {
          this.#store.deleteProfile(this.#store.activeProfileId());
        }
      });
    this.#root.querySelector("[data-hud-section-new]")
      ?.addEventListener("click", () => {
        const label = globalThis.prompt?.("Nome da nova seção:", "Nova seção");
        if (label) this.#store.addSection({ label });
      });
    this.#root.querySelector("[data-hud-profile-export]")
      ?.addEventListener("click", () => downloadJson(
        this.#root.ownerDocument,
        `spatialseed-hud-${this.#store.activeProfileId()}.json`,
        this.#store.exportDocument()
      ));
    this.#root.querySelector("[data-hud-profile-import]")
      ?.addEventListener("change", async event => {
        const file = event.target.files?.[0];
        if (!file) return;
        this.#store.importText(await file.text());
        event.target.value = "";
      });
    this.#root.addEventListener("click", event => {
      if (event.target === this.#root) this.close();
    });
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

  #sectionEditor(document, sectionId, profile) {
    const policy = profile.sections[sectionId] ?? {};
    const panel = document.createElement("div");
    panel.className = "hud-customizer-policy hud-customizer-section-editor";
    panel.append(
      textField(document, "Nome", policy.label ?? this.#labels.families[sectionId] ?? sectionId, value =>
        this.#store.updateSection(sectionId, { label: value || null })
      ),
      colorField(document, "Cor", policy.color ?? "#528bff", value =>
        this.#store.updateSection(sectionId, { color: value })
      ),
      selectField(document, "Visibilidade", SECTION_VISIBILITIES, policy.visibility, value =>
        this.#store.updateSection(sectionId, { visibility: value })
      ),
      selectField(document, "Zona", SECTION_ZONES, policy.zone, value =>
        this.#store.updateSection(sectionId, { zone: value })
      ),
      numberField(document, "Colunas", policy.columns ?? 4, 1, 256, 1, value =>
        this.#store.updateSection(sectionId, { columns: value })
      ),
      numberField(document, "Linhas", policy.rows ?? 1, 1, 256, 1, value =>
        this.#store.updateSection(sectionId, { rows: value })
      ),
      selectField(document, "Excesso", HUD_SECTION_SCROLL_MODES, policy.scrollMode, value =>
        this.#store.updateSection(sectionId, { scrollMode: value })
      ),
      checkboxField(document, "Mostrar título", policy.showHeader !== false, value =>
        this.#store.updateSection(sectionId, { showHeader: value })
      ),
      moveButtons(document,
        () => this.#store.moveSection(sectionId, -1),
        () => this.#store.moveSection(sectionId, 1)
      ),
      actionButton(document, "Restaurar seção", "↺", () =>
        this.#store.resetSection(sectionId)
      )
    );
    if (!this.#descriptors.some(descriptor => descriptor.family === sectionId)) {
      panel.append(actionButton(document, "Remover seção", "🗑", () => {
        if (globalThis.confirm?.(`Remover a seção “${policy.label ?? sectionId}”?`) !== false) {
          this.#store.deleteSection(sectionId);
        }
      }));
    }
    return panel;
  }

  #itemEditor(document, descriptor, profile) {
    const policy = profile.items[descriptor.id] ?? {};
    const details = document.createElement("details");
    details.className = "hud-customizer-item hud-customizer-item-detail";
    details.dataset.item = descriptor.id;
    details.dataset.itemEditor = descriptor.id;
    details.open = descriptor.id === this.#focusItem;
    const summary = document.createElement("summary");
    const preview = document.createElement("span");
    preview.className = "hud-customizer-icon-preview";
    preview.textContent = policy.icon ?? descriptor.nativeIcon ?? "·";
    const name = document.createElement("span");
    name.className = "hud-customizer-item-name";
    name.textContent = policy.label ?? this.#labels.items[descriptor.id] ?? descriptor.id;
    const id = document.createElement("code");
    id.textContent = descriptor.id;
    summary.append(preview, name, id);
    details.append(summary);

    const controls = document.createElement("div");
    controls.className = "hud-customizer-item-controls hud-customizer-item-grid";
    const sectionIds = Object.keys(profile.sections);
    controls.append(
      textField(document, "Nome", policy.label ?? "", value =>
        this.#store.updateItem(descriptor.id, { label: value || null })
      ),
      textField(document, "Ícone", policy.icon ?? "", value =>
        this.#store.updateItem(descriptor.id, { icon: value || null })
      ),
      selectField(document, "Seção", sectionIds, policy.section ?? descriptor.family, value =>
        this.#store.placeItem(descriptor.id, { section: value })
      ),
      selectField(document, "Visibilidade", HUD_VISIBILITY_VALUES, policy.visibility, value =>
        this.#store.updateItem(descriptor.id, { visibility: value })
      ),
      selectField(document, "Zona", HUD_ZONE_VALUES, policy.zone, value =>
        this.#store.updateItem(descriptor.id, { zone: value })
      ),
      numberField(document, "Largura em células", policy.cellWidth ?? 1, 1, 256, 1, value =>
        this.#store.updateItem(descriptor.id, { cellWidth: value })
      ),
      numberField(document, "Altura em células", policy.cellHeight ?? 1, 1, 256, 1, value =>
        this.#store.updateItem(descriptor.id, { cellHeight: value })
      ),
      moveButtons(document,
        () => this.#store.moveItem(descriptor.id, -1),
        () => this.#store.moveItem(descriptor.id, 1)
      )
    );
    controls.append(this.#commandEditor(document, descriptor.id, policy));
    controls.append(this.#activationEditor(document, descriptor.id, policy));
    controls.append(actionButton(document, "Restaurar ferramenta", "↺ Restaurar", () =>
      this.#store.resetItem(descriptor.id)
    ));
    details.append(controls);
    return details;
  }

  #commandEditor(document, itemId, policy) {
    const fieldset = document.createElement("fieldset");
    fieldset.className = "hud-customizer-command";
    const legend = document.createElement("legend");
    legend.textContent = "Comando ao tocar";
    const command = textField(document, "ID do comando; vazio usa ação nativa", policy.command?.id ?? "", value => {
      this.#store.updateItem(itemId, {
        command: value ? {
          id: value,
          arguments: policy.command?.arguments ?? {}
        } : null
      });
    });
    const args = jsonField(document, "Parâmetros JSON", policy.command?.arguments ?? {}, value => {
      const current = this.#store.profile().items[itemId]?.command;
      if (!current?.id) return;
      this.#store.updateItem(itemId, {
        command: { id: current.id, arguments: value }
      });
    });
    fieldset.append(legend, command, args);
    return fieldset;
  }

  #activationEditor(document, itemId, policy) {
    const activation = policy.activation ?? {};
    const fieldset = document.createElement("fieldset");
    fieldset.className = "hud-customizer-activation";
    const legend = document.createElement("legend");
    legend.textContent = "Ativação e exclusão";
    fieldset.append(
      legend,
      selectField(document, "Modo", HUD_ACTIVATION_MODES, activation.mode ?? "native", value =>
        updateActivation(this.#store, itemId, { mode: value })
      ),
      textField(document, "Grupo exclusivo", activation.group ?? "", value =>
        updateActivation(this.#store, itemId, { group: value || null })
      ),
      textField(document, "Ao ativar: ativa IDs", (activation.activates ?? []).join(", "), value =>
        updateActivation(this.#store, itemId, { activates: csv(value) })
      ),
      textField(document, "Ao ativar: desativa IDs", (activation.deactivates ?? []).join(", "), value =>
        updateActivation(this.#store, itemId, { deactivates: csv(value) })
      ),
      textField(document, "Ao desativar: ativa IDs", (activation.activatesOnDeactivate ?? []).join(", "), value =>
        updateActivation(this.#store, itemId, { activatesOnDeactivate: csv(value) })
      ),
      textField(document, "Ao desativar: desativa IDs", (activation.deactivatesOnDeactivate ?? []).join(", "), value =>
        updateActivation(this.#store, itemId, { deactivatesOnDeactivate: csv(value) })
      ),
      commandPairEditor(document, "Ao ativar", activation.onActivate, value =>
        updateActivation(this.#store, itemId, { onActivate: value })
      ),
      commandPairEditor(document, "Ao desativar", activation.onDeactivate, value =>
        updateActivation(this.#store, itemId, { onDeactivate: value })
      )
    );
    return fieldset;
  }
}

function updateActivation(store, itemId, patch) {
  const current = store.profile().items[itemId]?.activation ?? {};
  store.updateItem(itemId, {
    activation: { ...current, ...patch }
  });
}

function commandPairEditor(document, labelText, spec, onChange) {
  const wrapper = document.createElement("div");
  wrapper.className = "hud-customizer-command-pair";
  const title = document.createElement("strong");
  title.textContent = labelText;
  const id = textField(document, "Comando", spec?.id ?? "", value => {
    onChange(value ? { id: value, arguments: spec?.arguments ?? {} } : null);
  });
  const args = jsonField(document, "Parâmetros", spec?.arguments ?? {}, value => {
    if (spec?.id) onChange({ id: spec.id, arguments: value });
  });
  wrapper.append(title, id, args);
  return wrapper;
}

function selectField(document, labelText, values, selected, onChange) {
  const label = baseField(document, labelText, "hud-customizer-select");
  const select = document.createElement("select");
  for (const value of values) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = optionLabel(value);
    option.selected = value === selected;
    select.append(option);
  }
  select.addEventListener("change", () => onChange(select.value));
  label.append(select);
  return label;
}

function textField(document, labelText, value, onChange) {
  const label = baseField(document, labelText, "hud-customizer-text");
  const input = document.createElement("input");
  input.type = "text";
  input.value = String(value ?? "");
  input.addEventListener("change", () => onChange(input.value.trim()));
  label.append(input);
  return label;
}

function colorField(document, labelText, value, onChange) {
  const label = baseField(document, labelText, "hud-customizer-color");
  const input = document.createElement("input");
  input.type = "color";
  input.value = value;
  input.addEventListener("change", () => onChange(input.value));
  label.append(input);
  return label;
}

function numberField(document, labelText, value, min, max, step, onChange) {
  const label = baseField(document, labelText, "hud-customizer-number");
  const input = document.createElement("input");
  input.type = "number";
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(value);
  input.addEventListener("change", () => onChange(Number(input.value)));
  label.append(input);
  return label;
}

function checkboxField(document, labelText, value, onChange) {
  const label = document.createElement("label");
  label.className = "hud-customizer-checkbox";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = Boolean(value);
  const span = document.createElement("span");
  span.textContent = labelText;
  input.addEventListener("change", () => onChange(input.checked));
  label.append(input, span);
  return label;
}

function jsonField(document, labelText, value, onChange) {
  const label = baseField(document, labelText, "hud-customizer-json");
  const textarea = document.createElement("textarea");
  textarea.rows = 3;
  textarea.spellcheck = false;
  textarea.value = JSON.stringify(value ?? {}, null, 2);
  textarea.addEventListener("change", () => {
    try {
      const parsed = JSON.parse(textarea.value || "{}");
      textarea.dataset.invalid = "false";
      onChange(parsed);
    } catch (error) {
      textarea.dataset.invalid = "true";
      textarea.title = error.message;
    }
  });
  label.append(textarea);
  return label;
}

function baseField(document, labelText, className) {
  const label = document.createElement("label");
  label.className = `hud-customizer-field ${className}`;
  const caption = document.createElement("span");
  caption.textContent = labelText;
  label.append(caption);
  return label;
}

function moveButtons(document, moveBefore, moveAfter) {
  const wrapper = document.createElement("span");
  wrapper.className = "hud-customizer-move";
  wrapper.append(
    actionButton(document, "Mover antes", "←", moveBefore),
    actionButton(document, "Mover depois", "→", moveAfter)
  );
  return wrapper;
}

function actionButton(document, title, text, action) {
  const button = document.createElement("button");
  button.type = "button";
  button.title = title;
  button.textContent = text;
  button.addEventListener("click", action);
  return button;
}

function orderedSectionIds(profile, descriptors) {
  const ids = [...new Set([
    ...Object.keys(profile.sections ?? {}),
    ...descriptors.map(descriptor => profile.items[descriptor.id]?.section ?? descriptor.family)
  ])];
  return ids.sort((left, right) => {
    const aValue = profile.sections[left]?.order;
    const bValue = profile.sections[right]?.order;
    const a = aValue === null || aValue === undefined || aValue === ""
      ? null
      : Number(aValue);
    const b = bValue === null || bValue === undefined || bValue === ""
      ? null
      : Number(bValue);
    return (Number.isFinite(a) ? a : ids.indexOf(left)) -
      (Number.isFinite(b) ? b : ids.indexOf(right));
  });
}

function csv(value) {
  return [...new Set(String(value ?? "").split(",").map(item => item.trim()).filter(Boolean))];
}

function searchable(value) {
  return String(value ?? "").trim().toLocaleLowerCase("pt-BR");
}

function optionLabel(value) {
  return ({
    inherit: "Herdar",
    auto: "Automática",
    always: "Sempre visível",
    hidden: "Oculta",
    "fixed-start": "Fixada no início",
    adaptive: "Adaptativa",
    "fixed-end": "Fixada no fim",
    native: "Estado nativo",
    momentary: "Momentâneo",
    toggle: "Alternável",
    rotate: "Rotação por páginas",
    scroll: "Rolagem livre"
  })[value] ?? value;
}

function downloadJson(document, filename, text) {
  const blob = new Blob([text], { type: "application/json" });
  const anchor = document.createElement("a");
  anchor.href = URL.createObjectURL(blob);
  anchor.download = filename;
  anchor.click();
  globalThis.setTimeout?.(() => URL.revokeObjectURL(anchor.href), 0);
}

function cssEscape(value) {
  if (globalThis.CSS?.escape) return globalThis.CSS.escape(String(value));
  return String(value).replace(/["\\]/g, "\\$&");
}
