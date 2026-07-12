export class TransformToolPanel {
  static apiVersion = "transform-tools-v1";

  constructor({ root, renderer }) {
    this.root = root;
    this.renderer = renderer;
    this.#bind();
    this.refresh();
  }

  refresh() {
    const config = this.renderer.getTransformConfig();

    this.#value("tt-size", config.size);
    this.#value("tt-translate-snap", config.translationSnap ?? 0);
    this.#value("tt-rotate-snap", config.rotationSnapDeg ?? 0);
    this.#value("tt-scale-snap", config.scaleSnap ?? 0);

    this.#checked("tt-grid-lock", config.gridLock);
    this.#checked("tt-show-x", config.showX);
    this.#checked("tt-show-y", config.showY);
    this.#checked("tt-show-z", config.showZ);
    this.#checked("tt-show-vertices", config.showVertices);
    this.#value("tt-vertex-size", config.vertexSize);

    this.root.querySelector("#tt-diagnostics").value =
      JSON.stringify(this.renderer.getTransformDiagnostics(), null, 2);
  }

  apply() {
    const config = {
      size: this.#number("tt-size", 0.2),
      translationSnap: this.#optionalPositive("tt-translate-snap"),
      rotationSnapDeg: this.#optionalPositive("tt-rotate-snap"),
      scaleSnap: this.#optionalPositive("tt-scale-snap"),
      gridLock: this.#isChecked("tt-grid-lock"),
      showX: this.#isChecked("tt-show-x"),
      showY: this.#isChecked("tt-show-y"),
      showZ: this.#isChecked("tt-show-z"),
      showVertices: this.#isChecked("tt-show-vertices"),
      vertexSize: this.#number("tt-vertex-size", 1)
    };

    this.renderer.setTransformConfig(config);
    this.refresh();
    return config;
  }

  #bind() {
    this.root.querySelector("#tt-apply")
      .addEventListener("click", () => this.apply());

    this.root.querySelector("#tt-refresh")
      .addEventListener("click", () => this.refresh());

    for (const id of [
      "tt-grid-lock",
      "tt-show-x",
      "tt-show-y",
      "tt-show-z",
      "tt-show-vertices",
      "tt-vertex-size"
    ]) {
      this.root.querySelector(`#${id}`)
        .addEventListener("change", () => this.apply());
    }
  }

  #value(id, value) {
    const element = this.root.querySelector(`#${id}`);
    if (element) element.value = value;
  }

  #checked(id, value) {
    const element = this.root.querySelector(`#${id}`);
    if (element) element.checked = Boolean(value);
  }

  #isChecked(id) {
    return Boolean(this.root.querySelector(`#${id}`)?.checked);
  }

  #number(id, minimum = null) {
    const value = Number(this.root.querySelector(`#${id}`)?.value);

    if (!Number.isFinite(value)) {
      throw new Error(`Valor inválido em ${id}.`);
    }

    if (minimum !== null && value < minimum) {
      throw new Error(`${id} deve ser ≥ ${minimum}.`);
    }

    return value;
  }

  #optionalPositive(id) {
    const value = this.#number(id, 0);
    return value > 0 ? value : null;
  }
}
