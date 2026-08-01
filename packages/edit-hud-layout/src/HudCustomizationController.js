import {
  HUD_VISIBILITY_VALUES,
  HUD_ZONE_VALUES
} from "./HudLayoutPolicy.js?build=20260801-0046a";
import { descriptorLabels } from "./HudDomLayout.js?build=20260801-0046a";

const FAMILY_VISIBILITIES = HUD_VISIBILITY_VALUES.filter(value => value !== "inherit");
const FAMILY_ZONES = HUD_ZONE_VALUES.filter(value => value !== "inherit");

export class HudCustomizationController {
  static apiVersion = "hud-customization-controller-v1";

  #root;
  #store;
  #descriptors;
  #labels;
  #unsubscribe;
  #search = "";

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
    this.#root.querySelector("input[type=search]")?.focus?.();
  }

  close() {
    this.#root.hidden = true;
    this.#root.dataset.open = "false";
  }

  render() {
    const profile = this.#store.profile();
    const body = this.#root.querySelector("[data-hud-customizer-body]");
    if (!body) return;
    body.replaceChildren();
    const document = body.ownerDocument;
    const familyIds = uniqueFamilies(this.#descriptors);

    for (const familyId of familyIds) {
      const familyDescriptors = this.#descriptors.filter(
        descriptor => descriptor.family === familyId && descriptor.customizable
      );
      const matches = !this.#search ||
        searchable(this.#labels.families[familyId]).includes(this.#search) ||
        familyDescriptors.some(descriptor =>
          searchable(this.#labels.items[descriptor.id]).includes(this.#search)
        );
      if (!matches) continue;

      const details = document.createElement("details");
      details.className = "hud-customizer-family";
      details.dataset.family = familyId;
      details.open = Boolean(this.#search);
      const summary = document.createElement("summary");
      summary.textContent = this.#labels.families[familyId] ?? familyId;
      details.append(summary);
      details.append(this.#familyEditor(document, familyId, profile));

      const items = document.createElement("div");
      items.className = "hud-customizer-items";
      for (const descriptor of familyDescriptors) {
        if (this.#search &&
            !searchable(this.#labels.items[descriptor.id]).includes(this.#search) &&
            !searchable(this.#labels.families[familyId]).includes(this.#search)) {
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
      ?.addEventListener("click", () => this.#store.reset());
    this.#root.querySelector("[data-hud-customizer-search]")
      ?.addEventListener("input", event => {
        this.#search = searchable(event.target.value);
        this.render();
      });
    this.#root.addEventListener("click", event => {
      if (event.target === this.#root) this.close();
    });
  }

  #familyEditor(document, familyId, profile) {
    const policy = profile.families[familyId] ?? {};
    const row = document.createElement("div");
    row.className = "hud-customizer-policy";
    row.append(
      selectField(document, "Visibilidade", FAMILY_VISIBILITIES, policy.visibility, value =>
        this.#store.updateFamily(familyId, { visibility: value })
      ),
      selectField(document, "Zona", FAMILY_ZONES, policy.zone, value =>
        this.#store.updateFamily(familyId, { zone: value })
      ),
      moveButtons(document,
        () => this.#store.moveFamily(familyId, -1),
        () => this.#store.moveFamily(familyId, 1)
      ),
      actionButton(document, "Restaurar família", "↺", () =>
        this.#store.resetFamily(familyId)
      )
    );
    return row;
  }

  #itemEditor(document, descriptor, profile) {
    const policy = profile.items[descriptor.id] ?? {};
    const row = document.createElement("div");
    row.className = "hud-customizer-item";
    row.dataset.item = descriptor.id;
    const name = document.createElement("span");
    name.className = "hud-customizer-item-name";
    name.textContent = this.#labels.items[descriptor.id] ?? descriptor.id;
    const controls = document.createElement("div");
    controls.className = "hud-customizer-item-controls";
    controls.append(
      selectField(document, "Visibilidade", HUD_VISIBILITY_VALUES, policy.visibility, value =>
        this.#store.updateItem(descriptor.id, { visibility: value })
      ),
      selectField(document, "Zona", HUD_ZONE_VALUES, policy.zone, value =>
        this.#store.updateItem(descriptor.id, { zone: value })
      ),
      moveButtons(document,
        () => this.#store.moveItem(descriptor.id, -1),
        () => this.#store.moveItem(descriptor.id, 1)
      ),
      actionButton(document, "Herdar família", "↺", () =>
        this.#store.resetItem(descriptor.id)
      )
    );
    row.append(name, controls);
    return row;
  }
}

function selectField(document, labelText, values, selected, onChange) {
  const label = document.createElement("label");
  label.className = "hud-customizer-select";
  const caption = document.createElement("span");
  caption.textContent = labelText;
  const select = document.createElement("select");
  for (const value of values) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = optionLabel(value);
    option.selected = value === selected;
    select.append(option);
  }
  select.addEventListener("change", () => onChange(select.value));
  label.append(caption, select);
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

function uniqueFamilies(descriptors) {
  return [...new Set(descriptors.map(descriptor => descriptor.family))];
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
    "fixed-end": "Fixada no fim"
  })[value] ?? value;
}
