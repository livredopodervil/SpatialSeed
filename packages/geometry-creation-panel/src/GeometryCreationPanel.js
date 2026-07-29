const STORAGE_KEY = "spatialseed.geometry.creation.defaults.v1";

export class GeometryCreationPanel {
  constructor({ root, geometryRegistry, query = null, execute }) {
    if (!root) throw new TypeError("GeometryCreationPanel exige root.");
    if (!geometryRegistry?.describe) {
      throw new TypeError("GeometryCreationPanel exige registro descritivo.");
    }
    if (typeof execute !== "function") {
      throw new TypeError("GeometryCreationPanel exige execute().");
    }

    this.root = root;
    this.registry = geometryRegistry;
    this.query = typeof query === "function" ? query : null;
    this.execute = execute;
    this.defaults = this.#loadDefaults();
    this.descriptions = geometryRegistry.describe();
    this.form = root.querySelector("form");
    this.type = root.querySelector("[data-geometry-type]");
    this.parameters = root.querySelector("[data-geometry-parameters]");
    this.result = root.querySelector("[data-geometry-result]");

    this.type.replaceChildren(...this.descriptions.map(description => {
      const option = root.ownerDocument.createElement("option");
      option.value = description.type;
      option.textContent = description.label;
      return option;
    }));

    this.onTypeChange = () => this.refresh();
    this.onSubmit = event => this.create(event);
    this.onFormChange = () => this.#saveDefaults();
    this.onReferenceFocus = () => this.#refreshReferenceObjects();
    this.onGeometryDefaultChanged = event => {
      const type = event.detail?.type;
      if (!this.descriptions.some(item => item.type === type)) return;
      this.defaults = { ...this.defaults, type };
      this.type.value = type;
      this.refresh();
    };
    this.type.addEventListener("change", this.onTypeChange);
    this.form.addEventListener("submit", this.onSubmit);
    this.form.addEventListener("change", this.onFormChange);
    this.form.elements.namedItem("reference-object")?.addEventListener(
      "focus", this.onReferenceFocus
    );
    globalThis.addEventListener?.(
      "spatialseed:geometry-default-changed",
      this.onGeometryDefaultChanged
    );
    this.#restoreCommonDefaults();
    this.#refreshReferenceObjects();
    this.refresh();
  }

  refresh() {
    const description = this.#description();
    this.parameters.replaceChildren(
      ...description.parameters.map(parameter =>
        this.#parameterField(parameter)
      )
    );
    this.#restoreParameterDefaults(description.type);
    const planar = description.placement === "planar";
    const remembered = this.defaults.common ?? {};
    const originY = this.form.elements.namedItem("origin-y");
    if (originY && !("origin-y" in remembered)) {
      originY.value = planar ? "0.02" : "1";
    }
    if (!("plane" in remembered)) {
      this.form.elements.namedItem("plane").value = planar ? "xz" : "native";
    }
    this.result.textContent = `${description.label} · ${
      description.topology === "open-surface" ? "superfície aberta" : "sólido fechado"
    }`;
  }

  create(event) {
    event.preventDefault();
    try {
      const description = this.#description();
      const geometry = { type: description.type };
      for (const parameter of description.parameters) {
        geometry[parameter.id] = this.#readParameter(parameter);
      }

      const name = String(this.form.elements.namedItem("name").value).trim();
      const color = String(this.form.elements.namedItem("color").value).trim();
      let origin = ["x", "y", "z"].map(axis =>
        finite(this.form.elements.namedItem(`origin-${axis}`).value, `origem ${axis}`)
      );
      let rotation = [0, 0, 0, 1];
      const referenceId = this.form.elements.namedItem("reference-object")?.value ?? "";
      const referenceMode = this.form.elements.namedItem("reference-mode")?.value ?? "position-rotation";
      const reference = this.#referenceObject(referenceId);
      if (reference && ["position", "position-rotation"].includes(referenceMode)) {
        origin = [...(reference.position ?? [0, 0, 0])];
      }
      if (reference && ["rotation", "position-rotation"].includes(referenceMode)) {
        rotation = [...(reference.rotation ?? [0, 0, 0, 1])];
      }
      const plane = this.form.elements.namedItem("plane").value;
      const placement = plane === "native" || reference
        ? null
        : { origin, plane };
      const count = integer(
        finite(this.form.elements.namedItem("series-count").value, "Quantidade"),
        "Quantidade"
      );
      if (count < 1 || count > 100000) {
        throw new RangeError("Quantidade deve estar entre 1 e 100000.");
      }
      const operations = [
        this.#affineOperation("move", 0),
        this.#affineOperation("rotate", 0),
        this.#affineOperation("scale", 1)
      ].filter(Boolean);
      const result = this.execute("object.create.geometrySeries", {
        name: name || null,
        geometry,
        position: placement ? undefined : origin,
        rotation,
        placement,
        color,
        count,
        operations
      });
      this.result.textContent = result?.changed
        ? `${result.count} objeto${result.count === 1 ? "" : "s"} ` +
          `criado${result.count === 1 ? "" : "s"} · ${description.label}`
        : "A criação não alterou a cena.";
      this.result.dataset.status = "ok";
      return result;
    } catch (error) {
      this.result.textContent = error?.message ?? String(error);
      this.result.dataset.status = "error";
      return null;
    }
  }

  dispose() {
    this.type.removeEventListener("change", this.onTypeChange);
    this.form.removeEventListener("submit", this.onSubmit);
    this.form.removeEventListener("change", this.onFormChange);
    this.form.elements.namedItem("reference-object")?.removeEventListener(
      "focus", this.onReferenceFocus
    );
    globalThis.removeEventListener?.(
      "spatialseed:geometry-default-changed",
      this.onGeometryDefaultChanged
    );
  }

  #loadDefaults() {
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
      return value && typeof value === "object" ? value : {};
    } catch {
      return {};
    }
  }

  #restoreCommonDefaults() {
    for (const [name, value] of Object.entries(this.defaults.common ?? {})) {
      const control = this.form.elements.namedItem(name);
      if (!control) continue;
      if (control.type === "checkbox") control.checked = Boolean(value);
      else control.value = String(value);
    }
    if (this.defaults.type && this.descriptions.some(item => item.type === this.defaults.type)) {
      this.type.value = this.defaults.type;
    }
  }

  #saveDefaults() {
    const commonNames = [
      "name", "color", "origin-x", "origin-y", "origin-z", "plane",
      "series-count", "series-move-x", "series-move-y", "series-move-z",
      "series-rotate-x", "series-rotate-y", "series-rotate-z",
      "series-scale-x", "series-scale-y", "series-scale-z",
      "reference-object", "reference-mode"
    ];
    const common = {};
    for (const name of commonNames) {
      const control = this.form.elements.namedItem(name);
      if (control) common[name] = control.type === "checkbox" ? control.checked : control.value;
    }
    const parameters = {};
    for (const control of this.parameters.querySelectorAll("input, select, textarea")) {
      parameters[control.name] = control.type === "checkbox" ? control.checked : control.value;
    }
    this.defaults = {
      ...this.defaults,
      type: this.type.value,
      common,
      parameters: {
        ...(this.defaults.parameters ?? {}),
        [this.type.value]: parameters
      }
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.defaults));
  }

  #restoreParameterDefaults(type) {
    const values = this.defaults.parameters?.[type] ?? {};
    for (const control of this.parameters.querySelectorAll("input, select, textarea")) {
      if (!(control.name in values)) continue;
      if (control.type === "checkbox") control.checked = Boolean(values[control.name]);
      else control.value = String(values[control.name]);
    }
  }

  #refreshReferenceObjects() {
    const select = this.form.elements.namedItem("reference-object");
    if (!select || !this.query) return;
    const previous = select.value || this.defaults.common?.["reference-object"] || "";
    const objects = this.query("scene.objects.list") ?? [];
    select.replaceChildren(...[
      { value: "", label: "Nenhum" },
      ...objects.map(object => ({
        value: object.id,
        label: `${object.name ?? object.id} · ${object.kind}`
      }))
    ].map(item => {
      const option = this.root.ownerDocument.createElement("option");
      option.value = item.value;
      option.textContent = item.label;
      return option;
    }));
    if ([...select.options].some(option => option.value === previous)) {
      select.value = previous;
    }
  }

  #referenceObject(id) {
    if (!id || !this.query) return null;
    return this.query("scene.object.get", { id }) ?? null;
  }

  #description() {
    return this.descriptions.find(item => item.type === this.type.value) ??
      this.descriptions[0];
  }

  #parameterField(parameter) {
    const document = this.root.ownerDocument;
    const label = document.createElement("label");
    label.className = "geometry-field";
    const text = document.createElement("span");
    text.textContent = parameter.label;
    const editor = document.createElement("span");
    editor.className = "geometry-field-editor";

    if (["vector3", "integer-vector3"].includes(parameter.type)) {
      editor.classList.add("geometry-vector");
      parameter.default.forEach((value, index) => {
        editor.append(this.#numberInput(parameter, value, index));
      });
    } else if (parameter.type === "boolean") {
      const input = document.createElement("input");
      input.type = "checkbox";
      input.name = `parameter-${parameter.id}`;
      input.checked = Boolean(parameter.default);
      editor.append(input);
    } else if (parameter.type === "enum") {
      const select = document.createElement("select");
      select.name = `parameter-${parameter.id}`;
      for (const value of parameter.options ?? []) {
        const option = document.createElement("option");
        option.value = String(value);
        option.textContent = String(value);
        option.selected = value === parameter.default;
        select.append(option);
      }
      editor.append(select);
    } else if (parameter.type === "json") {
      const textarea = document.createElement("textarea");
      textarea.name = `parameter-${parameter.id}`;
      textarea.rows = Math.min(
        8,
        Math.max(3, Math.ceil(JSON.stringify(parameter.default).length / 48))
      );
      textarea.value = JSON.stringify(parameter.default);
      textarea.spellcheck = false;
      editor.append(textarea);
    } else {
      editor.append(this.#numberInput(parameter, parameter.default));
    }

    label.append(text, editor);
    return label;
  }

  #numberInput(parameter, value, component = null) {
    const input = this.root.ownerDocument.createElement("input");
    input.type = "number";
    input.name = component === null
      ? `parameter-${parameter.id}`
      : `parameter-${parameter.id}-${component}`;
    input.value = String(value);
    input.step = ["integer", "integer-vector3"].includes(parameter.type)
      ? "1"
      : "any";
    if (parameter.minimum != null) input.min = String(parameter.minimum);
    if (parameter.maximum != null) input.max = String(parameter.maximum);
    return input;
  }

  #readParameter(parameter) {
    if (["vector3", "integer-vector3"].includes(parameter.type)) {
      return parameter.default.map((_, index) => {
        const value = finite(
          this.form.elements.namedItem(`parameter-${parameter.id}-${index}`).value,
          parameter.label
        );
        return parameter.type === "integer-vector3"
          ? integer(value, parameter.label)
          : value;
      });
    }
    const input = this.form.elements.namedItem(`parameter-${parameter.id}`);
    if (parameter.type === "boolean") return input.checked;
    if (parameter.type === "enum") return input.value;
    if (parameter.type === "json") {
      try {
        return JSON.parse(input.value);
      } catch (error) {
        throw new TypeError(`${parameter.label}: JSON inválido.`, { cause: error });
      }
    }
    const value = finite(input.value, parameter.label);
    return parameter.type === "integer" ? integer(value, parameter.label) : value;
  }

  #affineOperation(type, neutral) {
    const value = ["x", "y", "z"].map(axis => affineValue(
      this.form.elements.namedItem(`series-${type}-${axis}`).value,
      `${type} ${axis}`
    ));
    return value.every(component =>
      typeof component === "number" && component === neutral
    ) ? null : { type, value };
  }
}

function finite(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new TypeError(`${label}: número inválido.`);
  return number;
}

function integer(value, label) {
  if (!Number.isInteger(value)) throw new TypeError(`${label}: use um inteiro.`);
  return value;
}

function affineValue(value, label) {
  const source = String(value ?? "").trim();
  if (!source) throw new TypeError(`${label}: valor ou expressão ausente.`);
  const number = Number(source);
  return Number.isFinite(number) ? number : source;
}
