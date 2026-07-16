export class GeometryCreationPanel {
  constructor({ root, geometryRegistry, execute }) {
    if (!root) throw new TypeError("GeometryCreationPanel exige root.");
    if (!geometryRegistry?.describe) {
      throw new TypeError("GeometryCreationPanel exige registro descritivo.");
    }
    if (typeof execute !== "function") {
      throw new TypeError("GeometryCreationPanel exige execute().");
    }

    this.root = root;
    this.registry = geometryRegistry;
    this.execute = execute;
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
    this.type.addEventListener("change", this.onTypeChange);
    this.form.addEventListener("submit", this.onSubmit);
    this.refresh();
  }

  refresh() {
    const description = this.#description();
    this.parameters.replaceChildren(
      ...description.parameters.map(parameter =>
        this.#parameterField(parameter)
      )
    );
    const planar = ["plane", "polygon"].includes(description.type);
    const originY = this.form.elements.namedItem("origin-y");
    if (originY) originY.value = planar ? "0.02" : "1";
    this.form.elements.namedItem("plane").value = planar ? "xz" : "native";
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
      const origin = ["x", "y", "z"].map(axis =>
        finite(this.form.elements.namedItem(`origin-${axis}`).value, `origem ${axis}`)
      );
      const plane = this.form.elements.namedItem("plane").value;
      const placement = plane === "native" ? null : { origin, plane };
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

    if (parameter.type === "vector3") {
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
    input.step = parameter.type === "integer" ? "1" : "any";
    if (parameter.minimum != null) input.min = String(parameter.minimum);
    return input;
  }

  #readParameter(parameter) {
    if (parameter.type === "vector3") {
      return parameter.default.map((_, index) => finite(
        this.form.elements.namedItem(`parameter-${parameter.id}-${index}`).value,
        parameter.label
      ));
    }
    const input = this.form.elements.namedItem(`parameter-${parameter.id}`);
    if (parameter.type === "boolean") return input.checked;
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
