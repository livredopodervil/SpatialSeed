export class InteractionComposer {
  static apiVersion = "interaction-composer-v1";

  constructor({ host, query, execute } = {}) {
    if (!host || typeof query !== "function" || typeof execute !== "function") {
      throw new TypeError(
        "InteractionComposer exige host, query e execute."
      );
    }
    this.host = host;
    this.dom = host.ownerDocument;
    this.query = query;
    this.execute = execute;
    this.catalog = this.query("interaction.catalog.describe");
    this.disposers = [];
    this.#build();
  }

  refresh() {
    const inspection = this.query("selection.interactions.inspect");
    this.details.hidden = inspection.count !== 1;
    this.addButton.disabled = !inspection.editable;
    this.summaryCount.textContent = inspection.bindings.length
      ? String(inspection.bindings.length)
      : "";
    this.empty.hidden = inspection.bindings.length > 0;
    this.list.replaceChildren(...inspection.bindings.map(binding =>
      this.#bindingRow(binding)
    ));
    this.currentObjectId = inspection.objectId;
    return inspection;
  }

  dispose() {
    for (const dispose of this.disposers.splice(0).reverse()) dispose();
    if (this.dialog.open) this.dialog.close?.();
    this.host.replaceChildren();
  }

  #build() {
    this.details = element(this.dom, "details", "ins-interactions");
    const summary = element(this.dom, "summary");
    summary.append(
      this.dom.createTextNode("Comportamento"),
      this.summaryCount = element(this.dom, "span", "ins-summary-count")
    );
    this.empty = element(this.dom, "p", "ins-interaction-empty");
    this.empty.textContent = "Nenhum evento configurado para este objeto.";
    this.list = element(this.dom, "div", "ins-interaction-list");
    this.addButton = button(this.dom, "+ Evento → ação");
    this.addButton.className = "ins-interaction-add";
    this.details.append(summary, this.empty, this.list, this.addButton);
    this.host.replaceChildren(this.details);

    this.dialog = element(this.dom, "dialog", "ins-interaction-dialog");
    const form = element(this.dom, "div", "ins-interaction-dialog-content");
    const title = element(this.dom, "h3");
    title.textContent = "Adicionar comportamento";
    this.eventSelect = this.dom.createElement("select");
    this.eventSelect.replaceChildren(...this.catalog.events.map(descriptor =>
      option(this.dom, descriptor.id, descriptor.label)
    ));
    this.actionSelect = this.dom.createElement("select");
    this.actionSelect.replaceChildren(...this.catalog.actions.map(descriptor =>
      option(this.dom, descriptor.command, descriptor.label)
    ));
    this.parameters = element(this.dom, "div", "ins-interaction-parameters");
    this.message = element(this.dom, "small", "ins-interaction-message");
    this.message.setAttribute("aria-live", "polite");
    const actions = element(this.dom, "div", "actions");
    const cancel = button(this.dom, "Cancelar");
    const save = button(this.dom, "Adicionar");
    save.className = "primary";
    actions.append(cancel, save);
    form.append(
      title,
      labelled(this.dom, "Quando", this.eventSelect),
      labelled(this.dom, "Fazer", this.actionSelect),
      this.parameters,
      this.message,
      actions
    );
    this.dialog.append(form);
    this.host.append(this.dialog);

    this.#listen(this.addButton, "click", () => this.#open());
    this.#listen(this.actionSelect, "change", () => this.#renderParameters());
    this.#listen(cancel, "click", event => {
      event.preventDefault();
      this.dialog.close?.();
    });
    this.#listen(save, "click", event => {
      event.preventDefault();
      this.#submit();
    });
    this.#listen(this.list, "click", event => {
      const remove = event.target.closest?.("button[data-remove-binding]");
      if (!remove) return;
      this.execute("selection.interactions.remove", {
        id: remove.dataset.removeBinding
      });
      this.refresh();
    });
    this.#listen(this.list, "change", event => {
      const toggle = event.target.closest?.("input[data-toggle-binding]");
      if (!toggle) return;
      this.execute("selection.interactions.enabled.set", {
        id: toggle.dataset.toggleBinding,
        enabled: toggle.checked
      });
      this.refresh();
    });
    this.#renderParameters();
  }

  #open() {
    this.message.textContent = "";
    this.#reloadCatalog();
    this.#renderParameters();
    if (typeof this.dialog.showModal === "function") {
      if (!this.dialog.open) this.dialog.showModal();
    } else {
      this.dialog.setAttribute("open", "");
    }
    this.eventSelect.focus();
  }

  #reloadCatalog() {
    const eventId = this.eventSelect.value;
    const commandId = this.actionSelect.value;
    this.catalog = this.query("interaction.catalog.describe");
    this.eventSelect.replaceChildren(...this.catalog.events.map(descriptor =>
      option(this.dom, descriptor.id, descriptor.label)
    ));
    this.actionSelect.replaceChildren(...this.catalog.actions.map(descriptor =>
      option(this.dom, descriptor.command, descriptor.label)
    ));
    if (this.catalog.events.some(item => item.id === eventId)) {
      this.eventSelect.value = eventId;
    }
    if (this.catalog.actions.some(item => item.command === commandId)) {
      this.actionSelect.value = commandId;
    }
  }

  #renderParameters() {
    const action = this.#selectedAction();
    this.parameterInputs = new Map();
    const controls = (action?.parameters ?? []).map(parameter => {
      const input = this.#parameterInput(parameter);
      this.parameterInputs.set(parameter.id, { input, parameter });
      return labelled(
        this.dom,
        parameter.required ? `${parameter.label} *` : parameter.label,
        input
      );
    });
    this.parameters.replaceChildren(...controls);
    this.parameters.hidden = controls.length === 0;
  }

  #parameterInput(parameter) {
    if (parameter.type === "select") {
      const select = this.dom.createElement("select");
      select.replaceChildren(...parameter.values.map(value =>
        option(this.dom, value, value)
      ));
      if (parameter.default !== undefined) select.value = String(parameter.default);
      return select;
    }
    if (parameter.type === "boolean") {
      const input = this.dom.createElement("input");
      input.type = "checkbox";
      input.checked = parameter.default === true;
      return input;
    }
    const input = parameter.type === "json"
      ? this.dom.createElement("textarea")
      : this.dom.createElement("input");
    if (parameter.type === "number") {
      input.type = "number";
      input.step = "any";
    } else if (input.tagName === "INPUT") {
      input.type = "text";
    }
    input.spellcheck = false;
    input.placeholder = parameter.placeholder ?? "";
    if (parameter.default !== undefined) {
      input.value = parameter.type === "json"
        ? JSON.stringify(parameter.default)
        : String(parameter.default);
    }
    return input;
  }

  #submit() {
    try {
      const action = this.#selectedAction();
      if (!action) throw new Error("Escolha uma ação.");
      const args = {};
      for (const [id, { input, parameter }] of this.parameterInputs) {
        const value = parameter.type === "boolean" ? input.checked : input.value.trim();
        if (value !== "" || parameter.type === "boolean") args[id] = value;
      }
      this.execute("selection.interactions.add", {
        event: this.eventSelect.value,
        command: action.command,
        args
      });
      this.dialog.close?.();
      this.details.open = true;
      this.refresh();
    } catch (error) {
      this.message.textContent = error?.message ?? String(error);
    }
  }

  #bindingRow(binding) {
    const row = element(this.dom, "article", "ins-interaction-binding");
    const eventDescriptor = this.catalog.events.find(item =>
      item.id === binding.event
    );
    const action = binding.actions[0];
    const actionDescriptor = this.catalog.actions.find(item =>
      item.command === action?.command
    );
    const description = element(this.dom, "div");
    const when = element(this.dom, "strong");
    when.textContent = eventDescriptor?.label ?? binding.event;
    const then = element(this.dom, "span");
    then.textContent = actionDescriptor?.label ?? action?.command ?? "Ação";
    const parameters = compactArgs(action?.args, actionDescriptor?.defaults);
    description.append(when, then);
    if (parameters) {
      const small = this.dom.createElement("small");
      small.textContent = parameters;
      description.append(small);
    }
    const controls = element(this.dom, "div", "ins-interaction-controls");
    const enabled = this.dom.createElement("input");
    enabled.type = "checkbox";
    enabled.checked = binding.enabled !== false;
    enabled.dataset.toggleBinding = binding.id;
    enabled.setAttribute("aria-label", "Ativar comportamento");
    const remove = button(this.dom, "Remover");
    remove.dataset.removeBinding = binding.id;
    controls.append(enabled, remove);
    row.append(description, controls);
    return row;
  }

  #selectedAction() {
    return this.catalog.actions.find(action =>
      action.command === this.actionSelect.value
    ) ?? null;
  }

  #listen(target, type, listener) {
    target.addEventListener(type, listener);
    this.disposers.push(() => target.removeEventListener(type, listener));
  }
}

function compactArgs(args = {}, defaults = {}) {
  const entries = Object.entries(args).filter(([key, value]) =>
    JSON.stringify(value) !== JSON.stringify(defaults?.[key]) &&
    !String(value).startsWith("$")
  );
  return entries.map(([key, value]) =>
    `${key}: ${typeof value === "string" ? value : JSON.stringify(value)}`
  ).join(" · ");
}

function element(documentRoot, tag, className = "") {
  const result = documentRoot.createElement(tag);
  if (className) result.className = className;
  return result;
}

function labelled(documentRoot, text, control) {
  const label = documentRoot.createElement("label");
  const title = documentRoot.createElement("span");
  title.textContent = text;
  label.append(title, control);
  return label;
}

function button(documentRoot, text) {
  const result = documentRoot.createElement("button");
  result.type = "button";
  result.textContent = text;
  return result;
}

function option(documentRoot, value, label) {
  const result = documentRoot.createElement("option");
  result.value = value;
  result.textContent = label;
  return result;
}
