export const SELECTION_PROPERTY_CLIPBOARD_VERSION =
  "selection-property-clipboard-v1-session-local";

const DEFAULT_EXCLUDED_GROUPS = new Set(["object"]);
const APPEARANCE_GROUPS = Object.freeze(["appearance", "texture", "instance"]);

export class SelectionPropertyClipboard {
  #payload = null;

  constructor({ propertyService, registry } = {}) {
    if (!propertyService?.inspectSelection || !propertyService?.setSelection) {
      throw new TypeError("SelectionPropertyClipboard exige propertyService.");
    }
    if (!registry?.list || !registry?.get) {
      throw new TypeError("SelectionPropertyClipboard exige registry.");
    }
    this.propertyService = propertyService;
    this.registry = registry;
  }

  copy({ properties = null, groups = null, targetScope = "selection" } = {}) {
    const inspection = this.propertyService.inspectSelection({ targetScope });
    if (inspection.count !== 1) {
      throw new Error("Copiar propriedades exige exatamente um objeto de origem.");
    }
    const requestedProperties = normalizeOptionalIds(properties);
    const requestedGroups = normalizeOptionalIds(groups);
    const entries = [];

    for (const descriptor of this.registry.list()) {
      if (!descriptor.writable) continue;
      if (requestedProperties && !requestedProperties.has(descriptor.id)) continue;
      if (requestedGroups && !requestedGroups.has(descriptor.group)) continue;
      if (!requestedProperties && !requestedGroups &&
          DEFAULT_EXCLUDED_GROUPS.has(descriptor.group)) continue;
      const property = inspection.properties[descriptor.id];
      if (property?.status !== "uniform") continue;
      entries.push(Object.freeze({
        id: descriptor.id,
        group: descriptor.group,
        value: cloneValue(property.value)
      }));
    }
    if (!entries.length) {
      throw new Error("Nenhuma propriedade copiável no objeto de origem.");
    }

    this.#payload = Object.freeze({
      version: SELECTION_PROPERTY_CLIPBOARD_VERSION,
      sourceId: inspection.targetIds[0],
      targetScope,
      entries: Object.freeze(entries)
    });
    return this.inspect();
  }

  copyTransform({ targetScope = "selection" } = {}) {
    return this.copy({ groups: ["transform"], targetScope });
  }

  copyAppearance({ targetScope = "selection" } = {}) {
    return this.copy({ groups: APPEARANCE_GROUPS, targetScope });
  }

  paste({ properties = null, targetScope = "selection" } = {}) {
    if (!this.#payload) throw new Error("Clipboard de propriedades vazio.");
    const inspection = this.propertyService.inspectSelection({ targetScope });
    if (!inspection.count) throw new Error("Seleção vazia.");
    const requested = normalizeOptionalIds(properties);
    const patch = {};
    const skipped = [];

    for (const entry of this.#payload.entries) {
      if (requested && !requested.has(entry.id)) continue;
      const descriptor = this.registry.get(entry.id);
      const property = inspection.properties[entry.id];
      let reason = null;
      if (!descriptor) reason = "unknown";
      else if (!descriptor.writable) reason = "read-only";
      else if (inspection.count > 1 && !descriptor.editableMany) {
        reason = "not-editable-many";
      } else if (property?.status === "unsupported" || !property) {
        reason = "unsupported";
      }
      if (reason) {
        skipped.push(Object.freeze({ id: entry.id, reason }));
        continue;
      }
      patch[entry.id] = cloneValue(entry.value);
    }

    const appliedProperties = Object.keys(patch);
    if (!appliedProperties.length) {
      return Object.freeze({
        changed: false,
        reason: "no-compatible-properties",
        targetIds: inspection.targetIds,
        appliedProperties: Object.freeze([]),
        skipped: Object.freeze(skipped)
      });
    }
    const result = this.propertyService.setSelection(patch, { targetScope });
    return Object.freeze({
      ...result,
      appliedProperties: Object.freeze(appliedProperties),
      skipped: Object.freeze(skipped)
    });
  }

  clear() {
    const changed = Boolean(this.#payload);
    this.#payload = null;
    return Object.freeze({ changed, ...this.inspect() });
  }

  inspect() {
    if (!this.#payload) {
      return Object.freeze({
        apiVersion: SELECTION_PROPERTY_CLIPBOARD_VERSION,
        available: false,
        sourceId: null,
        propertyIds: Object.freeze([]),
        groups: Object.freeze([]),
        count: 0
      });
    }
    return Object.freeze({
      apiVersion: SELECTION_PROPERTY_CLIPBOARD_VERSION,
      available: true,
      sourceId: this.#payload.sourceId,
      propertyIds: Object.freeze(this.#payload.entries.map(entry => entry.id)),
      groups: Object.freeze([...new Set(
        this.#payload.entries.map(entry => entry.group)
      )]),
      count: this.#payload.entries.length
    });
  }
}

function normalizeOptionalIds(value) {
  if (value === null || value === undefined) return null;
  const values = Array.isArray(value) ? value : [value];
  const ids = new Set(values.map(item => String(item ?? "").trim()).filter(Boolean));
  return ids.size ? ids : null;
}

function cloneValue(value) {
  return value === null || typeof value !== "object"
    ? value
    : structuredClone(value);
}
