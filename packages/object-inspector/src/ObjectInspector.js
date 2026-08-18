import {
  formatPropertyValue,
  normalizeHexColor,
  parsePropertyInput,
  propertyComponentCount
} from "../../property-registry/src/index.js?build=20260807-0051a";
import { InteractionComposer } from "./InteractionComposer.js?build=20260818-0054mx";
export { InteractionComposer };

const GROUP_LABELS = Object.freeze({
  object: "Identificação",
  transform: "Transformação",
  geometry: "Geometria",
  appearance: "Aparência compartilhada",
  "appearance-binding": "Composição de cor",
  light: "Luz",
  instance: "Instância",
  texture: "Textura"
});

export class ObjectInspector {
  static apiVersion = "object-inspector-properties-v2-occurrence-resolver";

  constructor({
    root,
    editor,
    sandbox,
    occurrenceResolver = null,
    query,
    execute,
    scheduleRefresh = null,
    cancelRefresh = null
  }) {
    this.root = root;
    this.document = root.ownerDocument;
    this.editor = editor;
    this.sandbox = sandbox;
    this.occurrenceResolver = occurrenceResolver;
    this.query = query;
    this.execute = execute;
    this.controls = new Map();
    this.dirty = new Set();
    this.unset = new Set();
    this.pendingFiles = new Map();
    this.clipboardKey = "";
    this.transferPresetKey = "";
    this.targetScope = root.querySelector("#inspector-target-scope")?.value ??
      "selection";
    this.selectionKey = "";
    this.targetIds = new Set();
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
    this.transferDescription = this.query(
      "selection.properties.transfer.describe"
    );
    this.#buildPropertyFields();
    this.#buildTransferPresets();
    this.#buildProceduralEditor();
    const interactionHost = root.querySelector("#inspector-interactions-root");
    this.interactionComposer = interactionHost
      ? new InteractionComposer({
          host: interactionHost,
          query: this.query,
          execute: this.execute
        })
      : null;
    this.#bind();

    this.unsubscribeSelection = editor.selection.subscribe(() =>
      this.invalidate("selection")
    );
    this.unsubscribeSandbox = sandbox.subscribe((_snapshot, changes) => {
      if (this.#sandboxChangesAffectInspector(changes)) {
        this.invalidate("sandbox-target");
      } else {
        this.refreshStatistics.sources["sandbox-ignored"] =
          (this.refreshStatistics.sources["sandbox-ignored"] ?? 0) + 1;
      }
    });
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

    this.#buildTransferPresets();
    const inspection = this.query("selection.properties.inspect", {
      targetScope: this.targetScope
    });
    this.interactionComposer?.refresh();
    this.pendingRefresh = false;
    this.refreshStatistics.refreshes += 1;
    const empty = this.root.querySelector("#inspector-empty");
    const form = this.root.querySelector("#inspector-form");
    const summary = this.root.querySelector("#inspector-summary");
    const nextSelectionKey = inspection.targetIds.join("\u0000");
    this.targetIds = new Set(inspection.targetIds.map(String));

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
      : `${inspection.count} objetos no escopo`;

    for (const descriptor of this.description.properties) {
      const control = this.controls.get(descriptor.id);
      const property = inspection.properties[descriptor.id];
      if (!control || !property) continue;
      this.#renderControl(control, property);
    }

    this.#refreshClipboardPreview();

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

  #sandboxChangesAffectInspector(changes) {
    const list = Array.isArray(changes) ? changes : [];
    if (!list.length) return true;

    const selectedIds = new Set(
      this.editor.selection.snapshot().members
        .map(member => String(member.objectId))
    );

    for (const change of list) {
      if (!change || typeof change !== "object") return true;
      const id = String(change.objectId ?? change.object?.id ?? "");
      if (!id) return true;
      const affectedOccurrences = new Set(
        (change.affectedOccurrenceIds ?? []).map(String)
      );
      if ([...affectedOccurrences].some(occurrenceId =>
        this.targetIds.has(occurrenceId) || selectedIds.has(occurrenceId)
      )) return true;
      if (this.targetIds.has(id) || selectedIds.has(id)) return true;
      if (this.targetScope !== "renderables") continue;

      /*
       * Para escopo renderizável, uma criação/reparentização abaixo de uma
       * raiz selecionada altera o conjunto exibido. Percorremos somente a
       * cadeia de pais do objeto afetado, nunca state.objects inteiro.
       */
      let current = change.object ?? (this.occurrenceResolver
        ? this.occurrenceResolver.object(id)
        : this.sandbox.getObject(id));
      const visited = new Set([id]);
      while (current?.parentId != null) {
        const parentId = String(current.parentId);
        if (selectedIds.has(parentId) || this.targetIds.has(parentId)) {
          return true;
        }
        if (visited.has(parentId)) break;
        visited.add(parentId);
        current = this.occurrenceResolver
          ? this.occurrenceResolver.object(parentId)
          : this.sandbox.getObject(parentId);
      }

      const previousParent = change.previousObject?.parentId;
      if (previousParent != null &&
          (selectedIds.has(String(previousParent)) ||
           this.targetIds.has(String(previousParent)))) {
        return true;
      }
    }
    return false;
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
    this.interactionComposer?.dispose();
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
        { patch, targetScope: this.targetScope }
      );
      this.#clearPending();
      return result;
    } finally {
      this.applying = false;
      this.refresh();
    }
  }

  copyProperties() {
    const presetId = this.root.querySelector(
      "#inspector-property-copy-mode"
    )?.value ?? "safe";
    const result = this.execute("selection.properties.copyPreset", {
      presetId,
      targetScope: this.targetScope
    });
    this.clipboardKey = "";
    this.#refreshClipboardPreview(result);
    return result;
  }

  pasteProperties() {
    const properties = [...this.root.querySelectorAll(
      "#inspector-property-clipboard-entries input[type=checkbox]:checked"
    )].map(input => input.value);
    if (!properties.length) {
      throw new Error("Marque ao menos uma propriedade compatível.");
    }
    this.applying = true;
    try {
      const result = this.execute("selection.properties.paste", {
        properties,
        targetScope: this.targetScope
      });
      this.#refreshClipboardPreview(result);
      return result;
    } finally {
      this.applying = false;
      this.refresh();
    }
  }

  applyProcedural() {
    const property = this.root.querySelector(
      "#inspector-procedural-property"
    );
    const expression = this.root.querySelector(
      "#inspector-procedural-expression"
    );
    const source = expression.value.trim();
    if (!source) {
      const error = new Error("Informe uma expressão procedural.");
      this.#showValidation(error, { inputs: [expression] });
      throw error;
    }
    this.applying = true;
    try {
      return this.execute("selection.properties.applyExpression", {
        propertyId: property.value,
        expression: source,
        targetScope: this.targetScope
      });
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
        const details = this.document.createElement("details");
        details.className = "ins-property-group";
        details.dataset.propertyGroup = descriptor.group;
        const summary = this.document.createElement("summary");
        summary.textContent = GROUP_LABELS[descriptor.group] ?? descriptor.group;
        const content = this.document.createElement("div");
        content.className = "ins-property-group-content";
        details.append(summary, content);
        container.append(details);
        group = content;
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

  #buildTransferPresets() {
    const select = this.root.querySelector("#inspector-property-copy-mode");
    if (!select) return;
    const description = this.query("selection.properties.transfer.describe");
    const key = description.presets.map(preset =>
      `${preset.id}\u0000${preset.label}`
    ).join("\u0001");
    if (key === this.transferPresetKey) return;
    const previous = select.value;
    this.transferDescription = description;
    this.transferPresetKey = key;
    select.replaceChildren(...this.transferDescription.presets.map(preset =>
      option(this.document, preset.id, preset.label)
    ));
    if (this.transferDescription.presets.some(item => item.id === previous)) {
      select.value = previous;
    } else if (this.transferDescription.presets.some(item => item.id === "transform")) {
      select.value = "transform";
    }
  }

  #buildProceduralEditor() {
    const property = this.root.querySelector(
      "#inspector-procedural-property"
    );
    const expression = this.root.querySelector(
      "#inspector-procedural-expression"
    );
    const help = this.root.querySelector("#inspector-procedural-help");
    if (!property || !expression || !help) return;

    const descriptors = this.description.properties.filter(item =>
      item.writable && item.procedural
    );
    property.replaceChildren(...descriptors.map(descriptor =>
      option(this.document, descriptor.id, descriptor.label)
    ));
    if (descriptors.some(item => item.id === "instance.color")) {
      property.value = "instance.color";
    }
    const refreshHint = () => {
      const descriptor = descriptors.find(item => item.id === property.value);
      const hint = proceduralHint(descriptor);
      expression.placeholder = hint.example;
      help.textContent = hint.help;
    };
    property.addEventListener("change", refreshHint);
    refreshHint();
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
        const input = numberInput(this.document, descriptor);
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
        ? numberInput(this.document, descriptor)
        : descriptor.valueType === "json"
          ? this.document.createElement("textarea")
          : this.document.createElement("input");
      if (!["number", "json"].includes(descriptor.valueType)) input.type = "text";
      if (descriptor.valueType === "json") input.rows = 3;
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
    const row = this.controls.get(id)?.row;
    row?.classList.add("is-dirty");
    const group = row?.closest?.("details.ins-property-group");
    if (group) group.open = true;
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
      .querySelector("#inspector-target-scope")
      ?.addEventListener("change", event => {
        this.targetScope = event.target.value;
        this.selectionKey = "";
        this.#clearPending();
        this.refresh();
      });
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
    this.root
      .querySelector("#inspector-procedural-apply")
      ?.addEventListener("click", () => {
        try {
          this.applyProcedural();
        } catch (error) {
          if (!error?.fieldShown) this.#showValidation(error);
        }
      });
    this.root
      .querySelector("#inspector-properties-copy")
      ?.addEventListener("click", () => {
        try {
          this.copyProperties();
        } catch (error) {
          this.#showValidation(error);
        }
      });
    this.root
      .querySelector("#inspector-properties-paste")
      ?.addEventListener("click", () => {
        try {
          this.pasteProperties();
        } catch (error) {
          this.#showValidation(error);
        }
      });
    this.root
      .querySelector("#inspector-properties-clear")
      ?.addEventListener("click", () => {
        this.execute("selection.properties.clipboard.clear");
        this.clipboardKey = "";
        this.#refreshClipboardPreview();
      });
    this.#refreshClipboardPreview();
  }

  #refreshClipboardPreview(status = null) {
    const output = this.root.querySelector("#inspector-property-clipboard-status");
    const paste = this.root.querySelector("#inspector-properties-paste");
    const details = this.root.querySelector(
      "#inspector-property-clipboard-preview"
    );
    const container = this.root.querySelector(
      "#inspector-property-clipboard-entries"
    );
    if (!output && !paste && !details && !container) return null;
    const snapshot = this.query("selection.properties.clipboard.inspect");
    if (!snapshot.available) {
      if (paste) paste.disabled = true;
      if (details) details.hidden = true;
      if (container) container.replaceChildren();
      if (output) output.textContent = "Nenhuma propriedade copiada nesta sessão.";
      return snapshot;
    }

    const preview = this.query("selection.properties.clipboard.preview", {
      targetScope: this.targetScope
    });
    const key = `${snapshot.sourceId}\u0000${snapshot.presetId}\u0000${
      snapshot.propertyIds.join("\u0000")
    }\u0000${preview.targetIds.join("\u0000")}`;
    const preserveChoices = key === this.clipboardKey;
    const selected = preserveChoices
      ? new Set([...container.querySelectorAll("input:checked")].map(input => input.value))
      : null;
    this.clipboardKey = key;
    const descriptors = new Map(
      this.description.properties.map(descriptor => [descriptor.id, descriptor])
    );
    const rows = preview.entries.map(entry => {
      const row = this.document.createElement("label");
      row.className = "ins-property-transfer-entry";
      row.dataset.compatible = String(entry.compatible);
      row.dataset.changed = String(entry.changed);
      const checkbox = this.document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.value = entry.id;
      checkbox.disabled = !entry.compatible || !entry.changed;
      checkbox.checked = !checkbox.disabled && (
        selected ? selected.has(entry.id) : true
      );
      const name = this.document.createElement("span");
      name.className = "ins-property-transfer-name";
      name.textContent = entry.label;
      const values = this.document.createElement("span");
      values.className = "ins-property-transfer-values";
      const descriptor = descriptors.get(entry.id) ?? {};
      values.textContent = `origem: ${formatTransferValue(
        descriptor,
        entry.sourceValue
      )} · destino atual: ${entry.compatible ? formatTransferValue(
        descriptor,
        entry.targetValue
      ) : transferReason(entry.reason)}`;
      row.append(checkbox, name, values);
      return row;
    });
    container.replaceChildren(...rows);
    const updatePaste = () => {
      if (paste) paste.disabled = !container.querySelector(
        "input[type=checkbox]:checked:not(:disabled)"
      );
    };
    container.querySelectorAll("input[type=checkbox]").forEach(input =>
      input.addEventListener("change", updatePaste)
    );
    updatePaste();
    if (details) details.hidden = false;

    const preset = this.transferDescription.presets.find(item =>
      item.id === snapshot.presetId
    );
    const description = this.root.querySelector(
      "#inspector-property-clipboard-description"
    );
    if (description) {
      description.textContent = [preset?.description, preset?.warning]
        .filter(Boolean)
        .join(" ");
    }
    if (output) {
      output.textContent = Array.isArray(status?.appliedProperties)
        ? `${status.appliedProperties.length} aplicada(s): ${
            status.appliedProperties.join(", ") || "nenhuma"
          }; ${status.skipped?.length ?? 0} ignorada(s).`
        : `${snapshot.count} copiada(s) de ${snapshot.sourceId}: ${
            snapshot.entries.map(entry => entry.label).join(", ")
          }.`;
    }
    return preview;
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

function numberInput(documentRoot, descriptor = {}) {
  const input = documentRoot.createElement("input");
  input.type = "number";
  input.step = descriptor.step == null
    ? descriptor.integer ? "1" : "any"
    : String(descriptor.step);
  if (descriptor.minimum != null) input.min = String(descriptor.minimum);
  if (descriptor.maximum != null) input.max = String(descriptor.maximum);
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

function transferReason(reason) {
  return ({
    unknown: "propriedade desconhecida",
    "read-only": "somente leitura",
    "not-editable-many": "não aplicável em vários alvos",
    "not-editable": "não editável",
    unsupported: "não suportado pelo destino"
  })[reason] ?? "incompatível";
}

function embeddedTextureLabel(source) {
  const value = String(source);
  const payload = value.slice(value.indexOf(",") + 1);
  const bytes = Math.max(0, Math.floor(payload.length * 0.75) -
    (payload.endsWith("==") ? 2 : payload.endsWith("=") ? 1 : 0));
  const kibibytes = bytes / 1024;
  const size = kibibytes >= 1024
    ? `${(kibibytes / 1024).toFixed(1)} MiB`
    : `${Math.max(1, Math.round(kibibytes))} KiB`;
  const mimeType = value.match(/^data:([^;,]+)/i)?.[1] ?? "imagem";
  return `${mimeType} incorporada · ${size}`;
}

function formatTransferValue(descriptor, value) {
  if (typeof value === "string" && value.startsWith("data:")) {
    return embeddedTextureLabel(value);
  }
  return formatPropertyValue(descriptor, value);
}

function proceduralHint(descriptor) {
  if (descriptor?.valueType === "color") {
    return {
      example: "hsl(360*u, 0.75, 0.55)",
      help: descriptor.id === "appearance.color"
        ? "Cores: hsl, rgb ou mix. Em lotes grandes, prefira Cor da instância."
        : "Cores: hsl(h,s,l), rgb(r,g,b), mix(#cor,#cor,u)."
    };
  }
  if (descriptor?.valueType === "vector3") {
    return {
      example: "x + 2*u; y; z",
      help: "Separe componentes por ;. Use i, u, count, x, y, z, sx, sy, sz."
    };
  }
  if (descriptor?.valueType === "vector2") {
    return {
      example: "1 + u; 1",
      help: "Separe os dois componentes por ;."
    };
  }
  return {
    example: "0.25 + 0.75*u",
    help: "Use i, u, count e as funções matemáticas seguras."
  };
}
