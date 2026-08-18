export const PROPERTY_TRANSFER_PRESET_CATALOG_VERSION =
  "property-transfer-preset-catalog-v1";

const ID_PATTERN = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/;

export class PropertyTransferPresetCatalog {
  #presets = new Map();

  register(input) {
    const preset = normalizePreset(input);
    if (this.#presets.has(preset.id)) {
      throw new Error(`Preset de transferência já registrado: ${preset.id}.`);
    }
    this.#presets.set(preset.id, preset);
    return this;
  }

  get(id) {
    return this.#presets.get(String(id ?? "")) ?? null;
  }

  require(id) {
    const preset = this.get(id);
    if (!preset) {
      throw new Error(`Preset de transferência desconhecido: ${id}.`);
    }
    return preset;
  }

  list() {
    return [...this.#presets.values()];
  }

  resolve(id, propertyRegistry) {
    const preset = this.require(id);
    const requestedProperties = new Set(preset.properties);
    const requestedGroups = new Set(preset.groups);
    const excluded = new Set(preset.excludeProperties);
    return Object.freeze(propertyRegistry.list()
      .filter(descriptor => descriptor.writable)
      .filter(descriptor => !excluded.has(descriptor.id))
      .filter(descriptor =>
        requestedProperties.has(descriptor.id) ||
        requestedGroups.has(descriptor.group)
      )
      .map(descriptor => descriptor.id));
  }

  describe() {
    return Object.freeze({
      apiVersion: PROPERTY_TRANSFER_PRESET_CATALOG_VERSION,
      presets: Object.freeze(this.list().map(preset => Object.freeze({
        id: preset.id,
        label: preset.label,
        description: preset.description,
        warning: preset.warning,
        properties: preset.properties,
        groups: preset.groups,
        excludeProperties: preset.excludeProperties
      })))
    });
  }
}

export function createDefaultPropertyTransferPresetCatalog() {
  return new PropertyTransferPresetCatalog()
    .register({
      id: "safe",
      label: "Propriedades seguras",
      description: "Copia rotação, escala, geometria e material; não move o destino.",
      properties: ["transform.rotationDeg", "transform.scale"],
      groups: ["geometry", "appearance"]
    })
    .register({
      id: "transform",
      label: "Rotação e escala",
      description: "Iguala rotação e escala sem substituir a posição.",
      properties: ["transform.rotationDeg", "transform.scale"]
    })
    .register({
      id: "position",
      label: "Posição absoluta",
      description: "Move o destino para as coordenadas exatas da origem.",
      warning: "Objetos podem ficar coincidentes.",
      properties: ["transform.position"]
    })
    .register({
      id: "material",
      label: "Material e cor-base",
      description: "Copia o material compartilhável, sem textura ou cor da instância.",
      warning: "Uma regra de cor do destino pode continuar prevalecendo sobre a cor-base.",
      groups: ["appearance"]
    })
    .register({
      id: "texture",
      label: "Textura",
      description: "Copia a fonte e a transformação da textura.",
      groups: ["texture"]
    })
    .register({
      id: "color-binding",
      label: "Regra e matiz de cor",
      description: "Copia o modo de cor, a cor uniforme e o matiz final.",
      groups: ["appearance-binding"]
    })
    .register({
      id: "instance-color",
      label: "Cor própria da instância",
      description: "Copia somente a cor armazenada na instância.",
      groups: ["instance"]
    })
    .register({
      id: "appearance-complete",
      label: "Aparência completa",
      description: "Copia material, textura, regra de cor e cor da instância.",
      groups: ["appearance", "texture", "appearance-binding", "instance"]
    });
}

function normalizePreset(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError("Preset de transferência deve ser um objeto.");
  }
  const id = String(input.id ?? "").trim();
  if (!ID_PATTERN.test(id)) {
    throw new TypeError(`ID de preset de transferência inválido: ${id || "(vazio)"}.`);
  }
  const properties = normalizeIds(input.properties);
  const groups = normalizeIds(input.groups);
  if (!properties.length && !groups.length) {
    throw new TypeError(`Preset ${id} não seleciona propriedades ou grupos.`);
  }
  return Object.freeze({
    id,
    label: requiredText(input.label ?? id, "label"),
    description: String(input.description ?? "").trim(),
    warning: input.warning == null ? null : String(input.warning).trim(),
    properties,
    groups,
    excludeProperties: normalizeIds(input.excludeProperties)
  });
}

function normalizeIds(value) {
  const values = value == null ? [] : Array.isArray(value) ? value : [value];
  return Object.freeze([...new Set(
    values.map(item => String(item ?? "").trim()).filter(Boolean)
  )]);
}

function requiredText(value, label) {
  const text = String(value ?? "").trim();
  if (!text) throw new TypeError(`${label} é obrigatório.`);
  return text;
}
