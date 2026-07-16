const DEFAULT_STORAGE_KEY = "spatialseed.ui.layout.v2";

export function normalizeUiConfiguration(source = {}) {
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    throw new TypeError("A configuração da UI deve ser um objeto.");
  }

  const schemaVersion = Number(source.schemaVersion ?? 1);
  if (schemaVersion !== 1) {
    throw new RangeError(`schemaVersion de UI não suportada: ${schemaVersion}.`);
  }

  const primary = normalizeIdList(source.toolbar?.primary, "toolbar.primary");
  const menus = (source.toolbar?.menus ?? []).map((menu, index) => {
    const path = `toolbar.menus[${index}]`;
    if (!menu || typeof menu !== "object" || Array.isArray(menu)) {
      throw new TypeError(`${path} deve ser um objeto.`);
    }
    return Object.freeze({
      id: requiredId(menu.id, `${path}.id`),
      label: requiredText(menu.label, `${path}.label`),
      items: normalizeIdList(menu.items, `${path}.items`)
    });
  });
  const hidden = normalizeIdList(source.toolbar?.hidden, "toolbar.hidden");
  const toolbarLayout = source.toolbar?.layout ?? "horizontal";
  if (!["horizontal", "vertical", "floating"].includes(toolbarLayout)) {
    throw new RangeError("toolbar.layout inválido.");
  }
  assertUnique([
    ...primary,
    ...menus.flatMap(menu => menu.items),
    ...hidden
  ], "controles da barra");
  assertUnique(menus.map(menu => menu.id), "menus da barra");

  const panelItems = {};
  for (const [id, layout] of Object.entries(source.panels?.items ?? {})) {
    panelItems[requiredId(id, "panels.items id")] = normalizePanelLayout(
      layout,
      `panels.items.${id}`
    );
  }

  const transform = source.presentation?.transform ?? {};
  const presentationTransform = Object.freeze({
    size: boundedNumber(transform.size, 0.2, 4, 0.8, "presentation.transform.size"),
    showX: transform.showX !== false,
    showY: transform.showY !== false,
    showZ: transform.showZ !== false,
    showVertices: transform.showVertices === true,
    vertexSize: boundedNumber(
      transform.vertexSize,
      1,
      24,
      5,
      "presentation.transform.vertexSize"
    )
  });
  const sceneExit = source.presentation?.sceneExit ?? {};
  const corner = sceneExit.corner ?? "top-left";
  if (!["top-left", "top-right", "bottom-left", "bottom-right"].includes(corner)) {
    throw new RangeError("presentation.sceneExit.corner inválido.");
  }

  return Object.freeze({
    schemaVersion,
    profile: requiredText(source.profile ?? "default", "profile"),
    toolbar: Object.freeze({
      layout: toolbarLayout,
      storageKey: requiredText(
        source.toolbar?.storageKey ?? "spatialseed.ui.toolbar.v1",
        "toolbar.storageKey"
      ),
      primary: Object.freeze(primary),
      menus: Object.freeze(menus),
      hidden: Object.freeze(hidden)
    }),
    panels: Object.freeze({
      storageKey: requiredText(
        source.panels?.storageKey ?? DEFAULT_STORAGE_KEY,
        "panels.storageKey"
      ),
      items: Object.freeze(panelItems)
    }),
    presentation: Object.freeze({
      transform: presentationTransform,
      sceneExit: Object.freeze({
        corner,
        size: boundedNumber(
          sceneExit.size,
          32,
          128,
          64,
          "presentation.sceneExit.size"
        ),
        helpStorageKey: requiredText(
          sceneExit.helpStorageKey ?? "spatialseed.ui.scene-help.v1",
          "presentation.sceneExit.helpStorageKey"
        )
      })
    })
  });
}

function normalizePanelLayout(value = {}, path) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${path} deve ser um objeto.`);
  }
  const anchor = value.anchor ?? "left";
  if (anchor !== "left" && anchor !== "right") {
    throw new RangeError(`${path}.anchor deve ser left ou right.`);
  }
  return Object.freeze({
    anchor,
    top: optionalTop(value.top, `${path}.top`),
    bottom: optionalNumber(value.bottom, `${path}.bottom`),
    width: optionalNumber(value.width, `${path}.width`),
    height: optionalNumber(value.height, `${path}.height`)
  });
}

function normalizeIdList(value = [], path) {
  if (!Array.isArray(value)) throw new TypeError(`${path} deve ser uma lista.`);
  return value.map((item, index) => requiredId(item, `${path}[${index}]`));
}

function requiredId(value, path) {
  const text = requiredText(value, path);
  if (!/^[a-z][a-z0-9-]*$/.test(text)) {
    throw new TypeError(`${path} contém um identificador inválido.`);
  }
  return text;
}

function requiredText(value, path) {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError(`${path} deve ser texto não vazio.`);
  }
  return value.trim();
}

function optionalNumber(value, path) {
  if (value == null) return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new RangeError(`${path} deve ser um número não negativo.`);
  }
  return number;
}

function optionalTop(value, path) {
  return value === "toolbar" ? value : optionalNumber(value, path);
}

function boundedNumber(value, minimum, maximum, fallback, path) {
  const number = value == null ? fallback : Number(value);
  if (!Number.isFinite(number) || number < minimum || number > maximum) {
    throw new RangeError(`${path} deve estar entre ${minimum} e ${maximum}.`);
  }
  return number;
}

function assertUnique(values, label) {
  const seen = new Set();
  for (const value of values) {
    if (seen.has(value)) throw new Error(`${label}: id duplicado ${value}.`);
    seen.add(value);
  }
}
