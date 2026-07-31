const STYLE_ID = "spatial-seed-procedure-catalog-ui-style";

export class ProcedureCatalogUiPanel {
  #catalog;
  #disposed = false;
  #execute;
  #forms = new Map();
  #query;
  #root;
  #status;
  #unsubscribe = null;

  constructor({
    root,
    catalog,
    query,
    execute
  } = {}) {
    if (!root || typeof root.replaceChildren !== "function") {
      throw new TypeError("ProcedureCatalogUiPanel exige um elemento raiz.");
    }
    if (!catalog || typeof catalog.describeUi !== "function") {
      throw new TypeError("ProcedureCatalogUiPanel exige ProcedureCatalog.");
    }
    if (typeof query !== "function" || typeof execute !== "function") {
      throw new TypeError("ProcedureCatalogUiPanel exige query e execute.");
    }

    this.#root = root;
    this.#catalog = catalog;
    this.#query = query;
    this.#execute = execute;
    ensureStyle(root.ownerDocument ?? globalThis.document);
    this.#unsubscribe = catalog.subscribe(() => this.refresh());
  }

  refresh() {
    if (this.#disposed) return false;
    const description = this.#query("procedure.catalog.ui.describe");
    this.#forms.clear();
    this.#root.replaceChildren();
    this.#root.classList.add("procedure-catalog-ui");

    const header = element(this.#root, "header", "procedure-catalog-ui__header");
    const title = element(header, "strong");
    title.textContent = "Interface do catálogo";
    const summary = element(header, "span", "procedure-catalog-ui__summary");
    const total = description.groups.reduce(
      (count, group) => count + group.procedures.length,
      0
    );
    summary.textContent = `${total} ação${total === 1 ? "" : "ões"}`;

    this.#status = element(
      this.#root,
      "output",
      "procedure-catalog-ui__status"
    );
    this.#status.textContent = total
      ? "Escolha uma ação do catálogo."
      : "Nenhuma procedure contém metadados de UI.";

    for (const group of description.groups) {
      this.#root.append(this.#renderGroup(group));
    }
    return true;
  }

  dispose() {
    if (this.#disposed) return false;
    this.#disposed = true;
    this.#unsubscribe?.();
    this.#unsubscribe = null;
    this.#forms.clear();
    this.#root.replaceChildren();
    return true;
  }

  #renderGroup(group) {
    const details = element(null, "details", "procedure-catalog-ui__group");
    details.open = true;
    const summary = element(details, "summary");
    summary.textContent = group.label;
    const actions = element(details, "div", "procedure-catalog-ui__actions");
    for (const procedure of group.procedures) {
      actions.append(this.#renderProcedure(procedure));
    }
    return details;
  }

  #renderProcedure(procedure) {
    const form = element(null, "form", "procedure-catalog-ui__action");
    form.noValidate = true;
    form.dataset.procedure = procedure.name;

    const heading = element(form, "div", "procedure-catalog-ui__action-heading");
    const icon = element(heading, "span", "procedure-catalog-ui__icon");
    icon.textContent = procedure.icon;
    const copy = element(heading, "div");
    const label = element(copy, "strong");
    label.textContent = procedure.label;
    if (procedure.description) {
      const description = element(copy, "small");
      description.textContent = procedure.description;
    }

    const fields = element(form, "div", "procedure-catalog-ui__fields");
    const controls = new Map();
    for (const parameter of procedure.parameters) {
      const rendered = renderParameter(parameter);
      fields.append(rendered.root);
      controls.set(parameter.id, rendered.read);
    }

    const buttons = element(form, "div", "procedure-catalog-ui__buttons");
    const prepare = button(
      buttons,
      procedure.commit === "immediate" ? "Executar" : "Preparar"
    );
    prepare.type = "submit";
    const commit = button(buttons, "Confirmar");
    commit.type = "button";
    commit.hidden = procedure.commit === "immediate";
    commit.disabled = true;

    const state = {
      procedure,
      controls,
      plan: null,
      prepare,
      commit,
      busy: false
    };
    this.#forms.set(procedure.name, state);

    form.addEventListener("input", () => this.#invalidate(state));
    form.addEventListener("change", () => this.#invalidate(state));
    form.addEventListener("submit", event => {
      event.preventDefault();
      void this.#prepare(state);
    });
    commit.addEventListener("click", () => void this.#commit(state));
    return form;
  }

  #invalidate(state) {
    state.plan = null;
    state.commit.disabled = true;
    if (!state.busy) {
      this.#setStatus(
        `${state.procedure.label}: parâmetros alterados; prepare novamente.`
      );
    }
  }

  async #prepare(state) {
    if (state.busy) return;
    state.busy = true;
    state.prepare.disabled = true;
    state.commit.disabled = true;
    this.#setStatus(`${state.procedure.label}: calculando plano…`);

    try {
      const parameters = {};
      for (const [id, read] of state.controls) parameters[id] = read();
      const result = await this.#execute("procedure.plan.prepare", {
        name: state.procedure.name,
        parameters
      });
      const plan = result?.plan ?? result;
      if (!plan || !Array.isArray(plan.commands)) {
        throw new Error("A procedure não devolveu um plano válido.");
      }
      state.plan = plan;
      const commandCount = plan.commands.length;
      this.#setStatus(
        `${state.procedure.label}: ${commandCount} operação` +
        `${commandCount === 1 ? "" : "ões"} preparada` +
        `${commandCount === 1 ? "" : "s"}.`
      );
      if (state.procedure.commit === "immediate") {
        await this.#commit(state, { keepBusy: true });
      } else {
        state.commit.disabled = false;
      }
    } catch (error) {
      state.plan = null;
      this.#setStatus(
        `${state.procedure.label}: ${error?.message ?? String(error)}`,
        true
      );
    } finally {
      state.busy = false;
      state.prepare.disabled = false;
      if (state.procedure.commit !== "immediate") {
        state.commit.disabled = !state.plan;
      }
    }
  }

  async #commit(state, { keepBusy = false } = {}) {
    if (!state.plan || (state.busy && !keepBusy)) return;
    if (!keepBusy) state.busy = true;
    state.prepare.disabled = true;
    state.commit.disabled = true;
    this.#setStatus(`${state.procedure.label}: confirmando plano…`);

    try {
      const result = await this.#execute("program.plan.commit", {
        plan: state.plan
      });
      state.plan = null;
      this.#setStatus(
        `${state.procedure.label}: ${result?.changed === false
          ? "plano processado sem alterações"
          : "plano confirmado"}.`
      );
    } catch (error) {
      this.#setStatus(
        `${state.procedure.label}: ${error?.message ?? String(error)}`,
        true
      );
      if (state.procedure.commit !== "immediate") {
        state.commit.disabled = false;
      }
    } finally {
      if (!keepBusy) state.busy = false;
      state.prepare.disabled = false;
    }
  }

  #setStatus(message, error = false) {
    if (!this.#status) return;
    this.#status.textContent = message;
    this.#status.dataset.state = error ? "error" : "normal";
  }
}

function renderParameter(parameter) {
  const root = element(null, "label", "procedure-catalog-ui__field");
  const label = element(root, "span");
  label.textContent = parameter.label;
  let read;

  if (parameter.type === "boolean") {
    const input = element(root, "input");
    input.type = "checkbox";
    input.checked = parameter.default;
    read = () => input.checked;
  } else if (parameter.type === "select") {
    const select = element(root, "select");
    const encoded = new Map();
    parameter.options.forEach((option, index) => {
      const key = String(index);
      encoded.set(key, option.value);
      const item = element(select, "option");
      item.value = key;
      item.textContent = option.label;
      if (sameValue(option.value, parameter.default)) item.selected = true;
    });
    read = () => encoded.get(select.value);
  } else if (parameter.type === "vector3") {
    const vector = element(root, "span", "procedure-catalog-ui__vector");
    const inputs = parameter.default.map((value, index) => {
      const input = element(vector, "input");
      input.type = "number";
      input.value = String(value);
      input.step = String(parameter.step ?? "any");
      input.setAttribute("aria-label", `${parameter.label} ${"XYZ"[index]}`);
      return input;
    });
    read = () => inputs.map(input => finiteInput(input, parameter.label));
  } else {
    const input = element(root, "input");
    input.type = inputType(parameter.type);
    input.value = String(parameter.default ?? "");
    if (parameter.min !== undefined) input.min = String(parameter.min);
    if (parameter.max !== undefined) input.max = String(parameter.max);
    if (parameter.step !== undefined) input.step = String(parameter.step);
    read = parameter.type === "number" || parameter.type === "integer"
      ? () => {
        const value = finiteInput(input, parameter.label);
        return parameter.type === "integer" ? Math.round(value) : value;
      }
      : () => input.value;
  }

  if (parameter.description) {
    const help = element(root, "small");
    help.textContent = parameter.description;
  }
  return { root, read };
}

function inputType(type) {
  if (type === "color") return "color";
  if (type === "number" || type === "integer") return "number";
  return "text";
}

function finiteInput(input, label) {
  const value = Number(input.value);
  if (!Number.isFinite(value)) {
    throw new TypeError(`${label} deve ser numérico.`);
  }
  return value;
}

function sameValue(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function button(parent, text) {
  const result = element(parent, "button");
  result.textContent = text;
  return result;
}

function element(parent, tag, className = "") {
  const documentRef = parent?.ownerDocument ?? globalThis.document;
  const result = documentRef.createElement(tag);
  if (className) result.className = className;
  parent?.append(result);
  return result;
}

function ensureStyle(documentRef) {
  if (!documentRef || documentRef.getElementById(STYLE_ID)) return;
  const style = documentRef.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
.procedure-catalog-ui{display:grid;gap:.65rem;margin-top:.75rem}
.procedure-catalog-ui__header{display:flex;justify-content:space-between;align-items:center;gap:.5rem}
.procedure-catalog-ui__summary,.procedure-catalog-ui__status{font-size:.82rem;opacity:.8}
.procedure-catalog-ui__status{display:block;min-height:1.2rem}
.procedure-catalog-ui__status[data-state="error"]{font-weight:700}
.procedure-catalog-ui__group{border:1px solid currentColor;border-radius:.5rem;padding:.35rem;opacity:.94}
.procedure-catalog-ui__group>summary{cursor:pointer;font-weight:700;padding:.25rem}
.procedure-catalog-ui__actions{display:grid;gap:.6rem;padding:.35rem}
.procedure-catalog-ui__action{display:grid;gap:.5rem;border-top:1px solid currentColor;padding-top:.55rem}
.procedure-catalog-ui__action:first-child{border-top:0;padding-top:0}
.procedure-catalog-ui__action-heading{display:flex;gap:.5rem;align-items:flex-start}
.procedure-catalog-ui__action-heading small{display:block;opacity:.75}
.procedure-catalog-ui__icon{min-width:1.6rem;text-align:center;font-size:1.15rem}
.procedure-catalog-ui__fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(9rem,1fr));gap:.45rem}
.procedure-catalog-ui__field{display:grid;gap:.2rem;font-size:.82rem}
.procedure-catalog-ui__field input,.procedure-catalog-ui__field select{min-width:0;width:100%;box-sizing:border-box}
.procedure-catalog-ui__field small{opacity:.7}
.procedure-catalog-ui__vector{display:grid;grid-template-columns:repeat(3,1fr);gap:.25rem}
.procedure-catalog-ui__buttons{display:flex;gap:.45rem;flex-wrap:wrap}
`;
  (documentRef.head ?? documentRef.documentElement).append(style);
}
