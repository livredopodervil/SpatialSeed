export class ExperimentPanel {
  #controls = new Map();
  #dynamicListeners = [];
  #pendingPlan = null;
  #running = false;

  constructor({ root, query, execute }) {
    if (!root) throw new TypeError("ExperimentPanel exige root.");
    if (typeof query !== "function" || typeof execute !== "function") {
      throw new TypeError("ExperimentPanel exige query() e execute().");
    }

    this.root = root;
    this.query = query;
    this.execute = execute;
    this.catalog = root.querySelector("[data-experiment-catalog]");
    this.description = root.querySelector("[data-experiment-description]");
    this.tags = root.querySelector("[data-experiment-tags]");
    this.parameters = root.querySelector("[data-experiment-parameters]");
    this.source = root.querySelector("[data-experiment-source]");
    this.command = root.querySelector("[data-experiment-command]");
    this.status = root.querySelector("[data-experiment-status]");
    this.createButton = root.querySelector("[data-experiment-create]");
    this.planButton = root.querySelector("[data-experiment-plan]");
    this.applyButton = root.querySelector("[data-experiment-apply]");
    this.discardButton = root.querySelector("[data-experiment-discard]");

    for (const [name, element] of Object.entries({
      catalog: this.catalog,
      description: this.description,
      tags: this.tags,
      parameters: this.parameters,
      source: this.source,
      command: this.command,
      status: this.status,
      createButton: this.createButton,
      planButton: this.planButton,
      applyButton: this.applyButton,
      discardButton: this.discardButton
    })) {
      if (!element) throw new Error(`ExperimentPanel sem elemento ${name}.`);
    }

    this.onCatalogChange = () => this.select(this.catalog.value);
    this.onCreate = () => this.create();
    this.onPlan = () => this.plan();
    this.onApply = () => this.apply();
    this.onDiscard = () => this.discard();
    this.catalog.addEventListener("change", this.onCatalogChange);
    this.createButton.addEventListener("click", this.onCreate);
    this.planButton.addEventListener("click", this.onPlan);
    this.applyButton.addEventListener("click", this.onApply);
    this.discardButton.addEventListener("click", this.onDiscard);
    this.refresh();
  }

  refresh() {
    const previous = this.catalog.value;
    const descriptions = this.query("experiments.describe") ?? [];
    const document = this.root.ownerDocument;
    const options = descriptions.map(description => {
      const option = document.createElement("option");
      option.value = description.id;
      option.textContent = description.title;
      return option;
    });

    this.catalog.replaceChildren(...options);
    this.catalog.value = descriptions.some(item => item.id === previous)
      ? previous
      : descriptions[0]?.id ?? "";
    this.catalog.disabled = descriptions.length === 0;

    if (this.catalog.value) {
      this.select(this.catalog.value);
    } else {
      this.#clearDynamicListeners();
      this.definition = null;
      this.parameters.replaceChildren();
      this.description.textContent = "Nenhum experimento registrado.";
      this.tags.replaceChildren();
      this.source.textContent = "";
      this.command.textContent = "";
      this.#pendingPlan = null;
      this.#setStatus("Catálogo vazio.", true);
      this.#refreshButtons();
    }
  }

  select(id) {
    this.#clearDynamicListeners();
    this.#invalidatePlan("Ajuste os parâmetros e escolha Criar na cena.");
    this.definition = this.query("experiment.describe", { id });
    this.catalog.value = this.definition.id;
    this.description.textContent = this.definition.description ||
      this.definition.title;
    this.tags.replaceChildren(...this.definition.tags.map(tag => {
      const chip = this.root.ownerDocument.createElement("span");
      chip.textContent = tag;
      return chip;
    }));
    this.parameters.replaceChildren(
      ...this.definition.parameters.map(parameter =>
        this.#createParameterField(parameter)
      )
    );
    this.source.textContent = this.definition.program.source;
    this.command.textContent = formatExperimentCommand(
      this.definition,
      this.#readParameters()
    );
    this.#refreshButtons();
    return this.definition;
  }

  async create() {
    if (!this.definition || this.#running) return null;

    this.#invalidatePlan("Criando experimento…");
    this.#setRunning(true);
    try {
      const parameters = this.#readParameters();
      const result = await Promise.resolve(this.execute(
        "experiment.create",
        { id: this.definition.id, parameters }
      ));
      this.#setStatus(
        result?.commit?.changed
          ? `${result.plan.commandCount} objeto(s) criado(s) atomicamente.`
          : "O experimento não alterou a cena."
      );
      return result;
    } catch (error) {
      this.#setStatus(error?.message ?? String(error), true);
      return null;
    } finally {
      this.#setRunning(false);
    }
  }

  async plan() {
    if (!this.definition || this.#running) return null;

    this.#invalidatePlan("Gerando plano…");
    this.#setRunning(true);
    try {
      const parameters = this.#readParameters();
      const result = await Promise.resolve(this.execute(
        "experiment.plan",
        { id: this.definition.id, parameters }
      ));
      this.#pendingPlan = structuredClone(result.plan);
      const summary = summarizeExperimentPlan(result.plan);
      this.#setStatus(
        `Plano pronto: ${summary.commandCount} objeto(s), ` +
        `revisão ${summary.baseVersion}. A cena ainda não mudou.`
      );
      return result;
    } catch (error) {
      this.#setStatus(error?.message ?? String(error), true);
      return null;
    } finally {
      this.#setRunning(false);
    }
  }

  async apply() {
    if (!this.#pendingPlan || this.#running) {
      this.#setStatus("Gere um plano antes de aplicar.", true);
      return null;
    }

    this.#setRunning(true);
    try {
      const result = await Promise.resolve(this.execute(
        "program.plan.commit",
        { plan: this.#pendingPlan }
      ));
      this.#pendingPlan = null;
      this.#setStatus(
        result?.changed
          ? `${result.commandCount} objeto(s) aplicado(s) atomicamente.`
          : "O plano não alterou a cena."
      );
      return result;
    } catch (error) {
      this.#setStatus(error?.message ?? String(error), true);
      return null;
    } finally {
      this.#setRunning(false);
    }
  }

  discard() {
    const discarded = this.#pendingPlan !== null;
    this.#pendingPlan = null;
    this.#setStatus(
      discarded
        ? "Plano descartado; a cena não foi alterada."
        : "Nenhum plano pendente."
    );
    this.#refreshButtons();
    return discarded;
  }

  dispose() {
    this.#clearDynamicListeners();
    this.catalog.removeEventListener("change", this.onCatalogChange);
    this.createButton.removeEventListener("click", this.onCreate);
    this.planButton.removeEventListener("click", this.onPlan);
    this.applyButton.removeEventListener("click", this.onApply);
    this.discardButton.removeEventListener("click", this.onDiscard);
    this.#pendingPlan = null;
  }

  #createParameterField(parameter) {
    const document = this.root.ownerDocument;
    const label = document.createElement("label");
    label.className = "ss-experiment-field";
    const text = document.createElement("span");
    text.textContent = parameter.label;
    if (parameter.help) text.title = parameter.help;
    const editor = document.createElement("span");
    editor.className = "ss-experiment-editor";
    let input;

    if (parameter.control === "slider") {
      const range = this.#numberInput(parameter, "range");
      input = this.#numberInput(parameter, "number");
      const synchronizeRange = () => {
        input.value = range.value;
        this.#parametersChanged();
      };
      const synchronizeNumber = () => {
        range.value = input.value;
        this.#parametersChanged();
      };
      this.#listen(range, "input", synchronizeRange);
      this.#listen(input, "input", synchronizeNumber);
      editor.classList.add("ss-experiment-slider");
      editor.append(range, input);
    } else if (parameter.control === "number") {
      input = this.#numberInput(parameter, "number");
      this.#listen(input, "input", () => this.#parametersChanged());
      editor.append(input);
    } else if (parameter.control === "color") {
      const picker = document.createElement("input");
      picker.type = "color";
      picker.value = parameter.default;
      input = document.createElement("input");
      input.type = "text";
      input.value = parameter.default;
      input.autocomplete = "off";
      this.#listen(picker, "input", () => {
        input.value = picker.value;
        this.#parametersChanged();
      });
      this.#listen(input, "input", () => {
        if (/^#[0-9a-f]{6}$/i.test(input.value)) {
          picker.value = input.value;
        }
        this.#parametersChanged();
      });
      editor.classList.add("ss-experiment-color");
      editor.append(input, picker);
    } else if (parameter.control === "select") {
      input = document.createElement("select");
      input.replaceChildren(...parameter.options.map(option => {
        const element = document.createElement("option");
        element.value = option.value;
        element.textContent = option.label;
        return element;
      }));
      input.value = parameter.default;
      this.#listen(input, "change", () => this.#parametersChanged());
      editor.append(input);
    } else if (parameter.control === "toggle") {
      input = document.createElement("input");
      input.type = "checkbox";
      input.checked = parameter.default;
      this.#listen(input, "change", () => this.#parametersChanged());
      editor.append(input);
    } else {
      throw new Error(`Controle de experimento desconhecido: ${parameter.control}.`);
    }

    input.dataset.experimentParameter = parameter.id;
    input.setAttribute("aria-label", parameter.label);
    this.#controls.set(parameter.id, input);
    label.append(text, editor);
    return label;
  }

  #numberInput(parameter, type) {
    const input = this.root.ownerDocument.createElement("input");
    input.type = type;
    input.value = String(parameter.default);
    input.step = String(parameter.step ?? (parameter.type === "integer" ? 1 : "any"));
    if (parameter.min !== undefined) input.min = String(parameter.min);
    if (parameter.max !== undefined) input.max = String(parameter.max);
    return input;
  }

  #readParameters() {
    if (!this.definition) return {};

    return Object.fromEntries(this.definition.parameters.map(parameter => {
      const control = this.#controls.get(parameter.id);
      const raw = parameter.type === "boolean"
        ? control.checked
        : control.value;
      return [
        parameter.id,
        normalizeExperimentControlValue(parameter, raw)
      ];
    }));
  }

  #parametersChanged() {
    if (!this.definition) return;
    this.#pendingPlan = null;
    try {
      this.command.textContent = formatExperimentCommand(
        this.definition,
        this.#readParameters()
      );
      this.#setStatus("Parâmetros alterados; pronto para criar.");
    } catch (error) {
      this.#setStatus(error?.message ?? String(error), true);
    }
    this.#refreshButtons();
  }

  #invalidatePlan(message) {
    this.#pendingPlan = null;
    this.#setStatus(message);
    this.#refreshButtons();
  }

  #setRunning(value) {
    this.#running = Boolean(value);
    this.root.dataset.running = String(this.#running);
    this.#refreshButtons();
  }

  #refreshButtons() {
    this.createButton.disabled = this.#running || !this.definition;
    this.planButton.disabled = this.#running || !this.definition;
    this.applyButton.disabled = this.#running || !this.#pendingPlan;
    this.discardButton.disabled = this.#running || !this.#pendingPlan;
    this.catalog.disabled = this.#running || !this.definition;
  }

  #setStatus(message, error = false) {
    this.status.textContent = String(message ?? "");
    this.status.dataset.error = String(Boolean(error));
  }

  #listen(target, type, listener) {
    target.addEventListener(type, listener);
    this.#dynamicListeners.push({ target, type, listener });
  }

  #clearDynamicListeners() {
    for (const { target, type, listener } of this.#dynamicListeners.splice(0)) {
      target.removeEventListener(type, listener);
    }
    this.#controls.clear();
  }
}

export function formatExperimentCommand(definition, parameters) {
  const id = String(definition?.id ?? "").trim();
  if (!id) throw new TypeError("Experimento sem identificador.");
  const alias = id.split(".").at(-1);
  const assignments = Object.entries(parameters ?? {}).map(([name, value]) =>
    `${name}=${formatCommandValue(value)}`
  );
  return ["experiment", alias, ...assignments].join(" ");
}

function formatCommandValue(value) {
  if (["number", "boolean"].includes(typeof value) || value === null) {
    return String(value);
  }
  const text = String(value);
  return /\s/.test(text) ? JSON.stringify(text) : text;
}

export function normalizeExperimentControlValue(parameter, raw) {
  if (parameter?.type === "number" || parameter?.type === "integer") {
    const value = Number(raw);
    if (!Number.isFinite(value)) {
      throw new TypeError(`${parameter.id}: use um número finito.`);
    }
    if (parameter.type === "integer" && !Number.isInteger(value)) {
      throw new TypeError(`${parameter.id}: use um inteiro.`);
    }
    return value;
  }
  if (parameter?.type === "boolean") {
    if (raw === true || raw === "true") return true;
    if (raw === false || raw === "false") return false;
    throw new TypeError(`${parameter.id}: use true ou false.`);
  }
  if (["color", "select"].includes(parameter?.type)) return String(raw);
  throw new Error(`Tipo de parâmetro desconhecido: ${parameter?.type}.`);
}

export function summarizeExperimentPlan(plan) {
  if (!plan || typeof plan !== "object" || !Array.isArray(plan.commands)) {
    throw new TypeError("Plano de experimento inválido.");
  }
  return Object.freeze({
    runId: String(plan.runId ?? ""),
    baseVersion: Number(plan.baseVersion ?? 0),
    commandCount: plan.commands.length
  });
}
