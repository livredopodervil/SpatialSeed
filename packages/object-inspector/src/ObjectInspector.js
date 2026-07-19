import {
  formatPropertyValue,
  normalizeHexColor,
  parsePropertyInput,
  propertyComponentCount
} from "../../property-registry/src/index.js?build=20260716-0024d";

const GROUP_LABELS = Object.freeze({
  object: "Identificação",
  transform: "Transformação",
  geometry: "Geometria",
  appearance: "Aparência compartilhada",
  instance: "Instância",
  texture: "Textura"
});

export class ObjectInspector {
  static apiVersion = "object-inspector-properties-v1";

  constructor({
    root,
    editor,
    sandbox,
    query,
    execute,
    scheduleRefresh = null,
    cancelRefresh = null
  }) {
    this.root = root;
    this.document = root.ownerDocument;
    this.editor = editor;
    this.sandbox = sandbox;
    this.query = query;
    this.execute = execute;
    this.controls = new Map();
    this.dirty = new Set();
    this.unset = new Set();
    this.pendingFiles = new Map();
    this.selectionKey = "";
    this.applying = false;
    this.active = false;
    this.pendingRefresh = true;
    this.disposed = false;
    const view = this.document.defaultView;
    this.scheduleRefresh = scheduleRefresh ?? (callback =>
      typeof view?.requestAnimationFrame === "function"
        ? view.requestAnimationFrame(callback)
        : setTimeout(callback, 0)
    );
    this.cancelRefresh = cancelRefresh ?? (handle =>
      typeof view?.cancelAnimationFrame === "function"
        ? view.cancelAnimationFrame(handle)
        : clearTimeout(handle)
    );
    this.refreshHandle = null;
    this.refreshStatistics = {
      invalidations: 0,
      deferred: 0,
      scheduled: 0,
      coalesced: 0,
      refreshes: 0,
      skippedWhileApplying: 0,
      sources: {}
    };

    this.description = this.query("properties.describe");
    this.#buildPropertyFields();
    this.#bind();

    this.unsubscribeSelection = editor.selection.subscribe(() =>
      this.invalidate("selection")
    );
    this.unsubscribeSandbox = sandbox.subscribe(() =>
      this.invalidate("sandbox")
    );
    this.setActive(!root.hidden);
  }

  refresh() {
    if (this.disposed) return { refreshed: false, reason: "disposed" };
    if (this.refreshHandle !== null) {
      this.cancelRefresh(this.refreshHandle);
      this.refreshHandle = null;
    }
    if (!this.active) {
      this.pendingRefresh = true;
      this.refreshStatistics.deferred += 1;
      return { refreshed: false, reason: "inactive" };
    }
    if (this.applying) {
      this.pendingRefresh = true;
      this.refreshStatistics.skippedWhileApplying += 1;
      return { refreshed: false, reason: "applying" };
    }

    const inspection = this.query("selection.properties.inspect");
    this.pendingRefresh = false;
    this.refreshStatistics.refreshes += 1;
    const empty = this.root.querySelector("#inspector-empty");
    const form = this.root.querySelector("#inspector-form");
    const summary = this.root.querySelector("#inspector-summary");
    const nextSelectionKey = inspection.targetIds.join("\u0000");

    if (nextSelectionKey !== this.selectionKey) {
      this.selectionKey = nextSelectionKey;
      this.#clearPending();
    }

    if (!inspection.count) {
      empty.hidden = false;
      form.hidden = true;
      empty.textContent = "Selecione um ou mais objetos.";
      return { refreshed: true, count: 0 };
    }

    empty.hidden = true;
    form.hidden = false;
    summary.textContent = inspection.count === 1
      ? `1 objeto selecionado · ${inspection.targetIds[0]}`
      : `${inspection.count} objetos selecionados`;

    for (const descriptor of this.description.properties) {
      const control = this.controls.get(descriptor.id);
      const property = inspection.properties[descriptor.id];
      if (!control || !property) continue;
      this.#renderControl(control, property);
    }

    return { refreshed: true, count: inspection.count };
  }

  invalidate(source = "unknown") {
    if (this.disposed) return false;
    const key = String(source);
    this.pendingRefresh = true;
    this.refreshStatistics.invalidations += 1;
    this.refreshStatistics.sources[key] =
      (this.refreshStatistics.sources[key] ?? 0) + 1;

    if (!this.active) {
      this.refreshStatistics.deferred += 1;
      return false;
    }

    if (this.refreshHandle !== null) {
      this.refreshStatistics.coalesced += 1;
      return false;
    }

    this.refreshStatistics.scheduled += 1;
    this.refreshHandle = this.scheduleRefresh(() => {
      this.refreshHandle = null;
      this.refresh();
    });
    return true;
  }

  setActive(value) {
    if (this.disposed) return false;
    const next = Boolean(value);
    const changed = next !== this.active;
    this.active = next;
    if (!next && this.refreshHandle !== null) {
      this.cancelRefresh(this.refreshHandle);
      this.refreshHandle = null;
      this.pendingRefresh = true;
    }
    if (next && this.pendingRefresh) this.refresh();
    return changed;
  }

  diagnostics() {
    return Object.freeze({
      active: this.active,
      pendingRefresh: this.pendingRefresh,
      ...this.refreshStatistics,
      sources: Object.freeze({ ...this.refreshStatistics.sources })
    });
  }

  dispose() {
    if (this.disposed) return false;
    this.disposed = true;
    if (this.refreshHandle !== null) {
      this.cancelRefresh(this.refreshHandle);
      this.refreshHandle = null;
    }
    this.unsubscribeSelection?.();
    this.unsubscribeSandbox?.();
    return true;
  }

  apply() {
    if (!this.dirty.size) {
      return { changed: false, reason: "no-properties-changed" };
    }

    this.#clearValidation();
    const patch = {};

    for (const id of this.dirty) {
      const control = this.controls.get(id);
      if (!control) continue;

      try {
        patch[id] = this.unset.has(id)
          ? null
          : this.#readControl(control);
      } catch (error) {
        this.#showValidation(error, control);
        throw error;
      }
    }

    this.applying = true;

    try {
      const result = this.execute(
        "selection.properties.set",
        { patch }
      );
      this.#clearPending();
      return result;
    } finally {
      this.applying = false;
      this.refresh();
    }
  }

  #buildPropertyFields() {
    const container = this.root.querySelector("#inspector-properties");
    container.replaceChildren();
    const groups = new Map();

    for (const descriptor of this.description.properties) {
      let group = groups.get(descriptor.group);

      if (!group) {
        const fieldset = this.document.createElement("fieldset");
        const legend = this.document.createElement("legend");
        legend.textContent = GROUP_LABELS[descriptor.group] ?? descriptor.group;
        fieldset.append(legend);
        container.append(fieldset);
        group = fieldset;
        groups.set(descriptor.group, group);
      }

      const control = this.#createControl(descriptor);
      group.append(control.row);
      this.controls.set(descriptor.id, control);

      if (descriptor.id === "texture.src") {
        group.append(this.#createTextureFileControl(control));
      }
    }
  }

  #createControl(descriptor) {
    const row = this.document.createElement("div");
    row.className = "ins-property";
    row.dataset.propertyId = descriptor.id;

    const label = this.document.createElement("label");
    const title = this.document.createElement("span");
    title.className = "ins-property-label";
    title.textContent = descriptor.label;
    label.append(title);

    const editor = this.document.createElement("div");
    editor.className = "ins-property-editor";
    const inputs = [];

    if (descriptor.valueType.startsWith("vector")) {
      editor.classList.add("ins-property-vector");
      const componentCount = propertyComponentCount(descriptor);
      editor.dataset.components = String(componentCount);
      for (let index = 0; index < componentCount; index += 1) {
        const input = numberInput(this.document);
        input.setAttribute("aria-label", `${descriptor.label} ${index + 1}`);
        editor.append(input);
        inputs.push(input);
      }
    } else if (descriptor.valueType === "boolean") {
      const select = this.document.createElement("select");
      select.append(
        option(this.document, "true", "Sim"),
        option(this.document, "false", "Não")
      );
      editor.append(select);
      inputs.push(select);
    } else if (descriptor.valueType === "enum") {
      const select = this.document.createElement("select");
      for (const value of descriptor.values ?? []) {
        select.append(option(this.document, value, value));
      }
      editor.append(select);
      inputs.push(select);
    } else if (descriptor.valueType === "color") {
      editor.classList.add("ins-color-editor");
      const text = this.document.createElement("input");
      text.type = "text";
      text.spellcheck = false;
      text.placeholder = "#rgb ou #rrggbb";
      const picker = this.document.createElement("input");
      picker.type = "color";
      picker.setAttribute("aria-label", `${descriptor.label}: seletor visual`);
      editor.append(text, picker);
      inputs.push(text, picker);
      picker.addEventListener("input", () => {
        text.value = picker.value;
        this.#markDirty(descriptor.id);
      });
      text.addEventListener("input", () => {
        try {
          picker.value = normalizeHexColor(text.value);
        } catch {
          // O campo textual permanece livre para edição parcial.
        }
      });
    } else {
      const input = descriptor.valueType === "number"
        ? numberInput(this.document)
        : this.document.createElement("input");
      if (descriptor.valueType !== "number") input.type = "text";
      input.spellcheck = false;
      editor.append(input);
      inputs.push(input);
    }

    for (const input of inputs) {
      input.addEventListener("input", () =>
        this.#markDirty(descriptor.id)
      );
      input.addEventListener("change", () =>
        this.#markDirty(descriptor.id)
      );
    }

    label.append(editor);
    row.append(label);

    const footer = this.document.createElement("div");
    footer.className = "ins-property-footer";
    const status = this.document.createElement("small");
    status.className = "ins-property-status";
    footer.append(status);

    let removeButton = null;
    if (descriptor.nullable) {
      removeButton = this.document.createElement("button");
      removeButton.type = "button";
      removeButton.textContent = "Remover";
      removeButton.addEventListener("click", () => {
        this.unset.add(descriptor.id);
        this.pendingFiles.delete(descriptor.id);
        this.#markDirty(descriptor.id, { preserveUnset: true });
        this.#setControlValue(
          { descriptor, inputs },
          null,
          "uniform"
        );
      });
      footer.append(removeButton);
    }

    row.append(footer);

    return {
      descriptor,
      row,
      inputs,
      status,
      removeButton
    };
  }

  #createTextureFileControl(control) {
    const label = this.document.createElement("label");
    label.className = "ins-property ins-file-property";
    const title = this.document.createElement("span");
    title.className = "ins-property-label";
    title.textContent = "Arquivo de imagem";
    const input = this.document.createElement("input");
    input.type = "file";
    input.accept = "image/*";

    input.addEventListener("change", event => {
      const file = event.target.files?.[0];
      if (!file) return;
      const reader = new this.document.defaultView.FileReader();
      reader.addEventListener("load", () => {
        this.pendingFiles.set(
          control.descriptor.id,
          String(reader.result)
        );
        control.inputs[0].value = `[arquivo] ${file.name}`;
        this.#markDirty(control.descriptor.id);
      });
      reader.readAsDataURL(file);
    });

    label.append(title, input);
    return label;
  }

  #renderControl(control, property) {
    const { descriptor, row, inputs, status, removeButton } = control;
    const editable = Boolean(property.editable);

    row.hidden = property.status === "unsupported";
    row.dataset.status = property.status;
    row.classList.toggle("is-dirty", this.dirty.has(descriptor.id));

    for (const input of inputs) input.disabled = !editable;
    if (removeButton) removeButton.disabled = !editable;

    status.textContent = statusText(property, descriptor);

    if (!this.dirty.has(descriptor.id)) {
      this.#setControlValue(control, property.value, property.status);
    }
  }

  #setControlValue(control, value, status) {
    const { descriptor, inputs } = control;
    const mixed = status === "mixed";

    if (descriptor.valueType.startsWith("vector")) {
      inputs.forEach((input, index) => {
        input.value = mixed || value === null ? "" : value[index];
        input.placeholder = mixed ? "misto" : "";
      });
      return;
    }

    const input = inputs[0];
    const embeddedTexture =
      descriptor.id === "texture.src" &&
      typeof value === "string" &&
      value.startsWith("data:");

    input.value = mixed || embeddedTexture
      ? ""
      : formatPropertyValue(descriptor, value);
    input.placeholder = mixed
      ? "valores diferentes"
      : embeddedTexture
        ? embeddedTextureLabel(value)
        : "";

    if (descriptor.valueType === "color" && inputs[1]) {
      inputs[1].value = mixed || value === null
        ? "#000000"
        : normalizeHexColor(value);
    }
  }

  #readControl(control) {
    const { descriptor, inputs } = control;

    if (this.pendingFiles.has(descriptor.id)) {
      return this.pendingFiles.get(descriptor.id);
    }

    const raw = descriptor.valueType.startsWith("vector")
      ? inputs.map(input => input.value)
      : [inputs[0].value];

    return parsePropertyInput(descriptor, raw);
  }

  #markDirty(id, { preserveUnset = false } = {}) {
    this.dirty.add(id);
    if (!preserveUnset) this.unset.delete(id);
    this.controls.get(id)?.row.classList.add("is-dirty");
  }

  #clearPending() {
    this.dirty.clear();
    this.unset.clear();
    this.pendingFiles.clear();
    for (const control of this.controls.values()) {
      control.row.classList.remove("is-dirty");
    }
  }

  #bind() {
    this.root
      .querySelector("#inspector-apply")
      .addEventListener("click", () => {
        try {
          this.apply();
        } catch (error) {
          if (!error?.fieldShown) {
            this.#showValidation(error);
          }
        }
      });
  }

  #clearValidation() {
    this.root
      .querySelectorAll("input, select")
      .forEach(element => {
        element.setCustomValidity("");
        element.removeAttribute("aria-invalid");
      });
  }

  #showValidation(error, control = null) {
    const input = control?.inputs?.[0] ?? null;
    if (input) {
      input.setCustomValidity(error?.message ?? String(error));
      input.setAttribute("aria-invalid", "true");
      input.focus();
      input.reportValidity();
      error.fieldShown = true;
      return;
    }

    const message = this.root.querySelector("#inspector-empty");
    message.hidden = false;
    message.textContent = error?.message ?? String(error);
  }
}

function numberInput(documentRoot) {
  const input = documentRoot.createElement("input");
  input.type = "number";
  input.step = "any";
  return input;
}

function option(documentRoot, value, label) {
  const result = documentRoot.createElement("option");
  result.value = value;
  result.textContent = label;
  return result;
}

function statusText(property, descriptor) {
  if (property.status === "mixed") return "Valores diferentes";
  if (property.status === "unsupported") return "Não suportado";
  if (!property.editable && descriptor.editableMany === false) {
    return "Editável apenas com um objeto selecionado";
  }
  if (property.value === null) return "Sem valor próprio";
  return property.editable ? "" : "Somente leitura";
}

function embeddedTextureLabel(source) {
  const bytes = Math.ceil(String(source).length * 0.75);
  const kibibytes = bytes / 1024;
  const size = kibibytes >= 1024
    ? `${(kibibytes / 1024).toFixed(1)} MiB`
    : `${Math.max(1, Math.round(kibibytes))} KiB`;
  return `imagem incorporada · ${size}`;
}
