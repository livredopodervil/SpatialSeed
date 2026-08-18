import {
  createDefaultPropertyTransferPresetCatalog
} from "./PropertyTransferPresetCatalog.js";

export const SELECTION_PROPERTY_CLIPBOARD_VERSION =
  "selection-property-clipboard-v2-explicit-preview";

export class SelectionPropertyClipboard {
  #payload = null;

  constructor({ propertyService, registry, presets = null } = {}) {
    if (!propertyService?.inspectSelection || !propertyService?.setSelection) {
      throw new TypeError("SelectionPropertyClipboard exige propertyService.");
    }
    if (!registry?.list || !registry?.get) {
      throw new TypeError("SelectionPropertyClipboard exige registry.");
    }
    this.propertyService = propertyService;
    this.registry = registry;
    this.presets = presets ?? createDefaultPropertyTransferPresetCatalog();
    if (!this.presets?.resolve || !this.presets?.describe) {
      throw new TypeError("Catálogo de presets de transferência inválido.");
    }
  }

  describe() {
    return this.presets.describe();
  }

  copy({
    properties = null,
    groups = null,
    presetId = null,
    targetScope = "selection"
  } = {}) {
    const explicitProperties = normalizeOptionalIds(properties);
    const explicitGroups = normalizeOptionalIds(groups);
    const selectedPreset = presetId ?? (
      explicitProperties || explicitGroups ? null : "safe"
    );
    const presetProperties = selectedPreset
      ? new Set(this.presets.resolve(selectedPreset, this.registry))
      : null;
    const inspection = this.propertyService.inspectSelection({ targetScope });
    if (inspection.count !== 1) {
      throw new Error("Copiar propriedades exige exatamente um objeto de origem.");
    }
    const entries = [];

    for (const descriptor of this.registry.list()) {
      if (!descriptor.writable) continue;
      if (presetProperties && !presetProperties.has(descriptor.id)) continue;
      if (explicitProperties && !explicitProperties.has(descriptor.id)) continue;
      if (explicitGroups && !explicitGroups.has(descriptor.group)) continue;
      const property = inspection.properties[descriptor.id];
      if (property?.status !== "uniform") continue;
      entries.push(Object.freeze({
        id: descriptor.id,
        label: descriptor.label,
        group: descriptor.group,
        valueType: descriptor.valueType,
        value: cloneValue(property.value)
      }));
    }
    if (!entries.length) {
      throw new Error("Nenhuma propriedade copiável no objeto de origem.");
    }

    this.#payload = Object.freeze({
      version: SELECTION_PROPERTY_CLIPBOARD_VERSION,
      sourceId: inspection.targetIds[0],
      sourceScope: targetScope,
      presetId: selectedPreset,
      entries: Object.freeze(entries)
    });
    return this.inspect();
  }

  copyPreset({ presetId = "safe", targetScope = "selection" } = {}) {
    return this.copy({ presetId, targetScope });
  }

  copyTransform({ targetScope = "selection" } = {}) {
    return this.copyPreset({ presetId: "transform", targetScope });
  }

  copyAppearance({ targetScope = "selection" } = {}) {
    return this.copyPreset({ presetId: "material", targetScope });
  }

  preview({ properties = null, targetScope = "selection" } = {}) {
    if (!this.#payload) return emptyPreview(targetScope);
    const requested = normalizeOptionalIds(properties);
    const inspection = this.propertyService.inspectSelection({ targetScope });
    const entries = this.#payload.entries
      .filter(entry => !requested || requested.has(entry.id))
      .map(entry => previewEntry(entry, inspection, this.registry));
    return Object.freeze({
      apiVersion: SELECTION_PROPERTY_CLIPBOARD_VERSION,
      available: true,
      sourceId: this.#payload.sourceId,
      presetId: this.#payload.presetId,
      targetScope,
      targetIds: inspection.targetIds,
      targetCount: inspection.count,
      entries: Object.freeze(entries),
      compatiblePropertyIds: Object.freeze(entries
        .filter(entry => entry.compatible && entry.changed)
        .map(entry => entry.id)),
      compatibleCount: entries.filter(entry => entry.compatible).length,
      changedCount: entries.filter(entry => entry.compatible && entry.changed).length
    });
  }

  paste({ properties = null, targetScope = "selection" } = {}) {
    if (!this.#payload) throw new Error("Clipboard de propriedades vazio.");
    const requested = normalizeOptionalIds(properties);
    if (!requested) {
      return Object.freeze({
        changed: false,
        reason: "explicit-properties-required",
        ...this.preview({ targetScope })
      });
    }
    const inspection = this.propertyService.inspectSelection({ targetScope });
    if (!inspection.count) throw new Error("Seleção vazia.");
    const patch = {};
    const skipped = [];

    for (const entry of this.#payload.entries) {
      if (!requested.has(entry.id)) continue;
      const preview = previewEntry(entry, inspection, this.registry);
      if (!preview.compatible || !preview.changed) {
        skipped.push(Object.freeze({
          id: entry.id,
          reason: preview.compatible ? "unchanged" : preview.reason
        }));
        continue;
      }
      patch[entry.id] = cloneValue(entry.value);
    }

    const appliedProperties = Object.keys(patch);
    if (!appliedProperties.length) {
      return Object.freeze({
        changed: false,
        reason: "no-compatible-changes",
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
        presetId: null,
        propertyIds: Object.freeze([]),
        groups: Object.freeze([]),
        entries: Object.freeze([]),
        count: 0
      });
    }
    return Object.freeze({
      apiVersion: SELECTION_PROPERTY_CLIPBOARD_VERSION,
      available: true,
      sourceId: this.#payload.sourceId,
      presetId: this.#payload.presetId,
      propertyIds: Object.freeze(this.#payload.entries.map(entry => entry.id)),
      groups: Object.freeze([...new Set(
        this.#payload.entries.map(entry => entry.group)
      )]),
      entries: Object.freeze(this.#payload.entries.map(entry => Object.freeze({
        ...entry,
        value: cloneValue(entry.value)
      }))),
      count: this.#payload.entries.length
    });
  }
}

function previewEntry(entry, inspection, registry) {
  const descriptor = registry.get(entry.id);
  const property = inspection.properties[entry.id];
  let reason = null;
  if (!descriptor) reason = "unknown";
  else if (!descriptor.writable) reason = "read-only";
  else if (inspection.count > 1 && !descriptor.editableMany) {
    reason = "not-editable-many";
  } else if (property?.status === "unsupported" || !property) {
    reason = "unsupported";
  } else if (!property.editable && property.editable !== undefined) {
    reason = "not-editable";
  }
  const compatible = reason === null;
  return Object.freeze({
    id: entry.id,
    label: entry.label,
    group: entry.group,
    valueType: entry.valueType,
    sourceValue: cloneValue(entry.value),
    targetStatus: property?.status ?? "unsupported",
    targetValue: cloneValue(property?.value ?? null),
    compatible,
    changed: compatible && !equalValue(entry.value, property?.value),
    reason
  });
}

function emptyPreview(targetScope) {
  return Object.freeze({
    apiVersion: SELECTION_PROPERTY_CLIPBOARD_VERSION,
    available: false,
    sourceId: null,
    presetId: null,
    targetScope,
    targetIds: Object.freeze([]),
    targetCount: 0,
    entries: Object.freeze([]),
    compatiblePropertyIds: Object.freeze([]),
    compatibleCount: 0,
    changedCount: 0
  });
}

function normalizeOptionalIds(value) {
  if (value === null || value === undefined) return null;
  const values = Array.isArray(value) ? value : [value];
  const ids = new Set(values.map(item => String(item ?? "").trim()).filter(Boolean));
  return ids.size ? ids : null;
}

function equalValue(left, right) {
  if (Object.is(left, right)) return true;
  if (
    left === null || right === null ||
    typeof left !== "object" || typeof right !== "object"
  ) return false;
  return JSON.stringify(left) === JSON.stringify(right);
}

function cloneValue(value) {
  return value === null || typeof value !== "object"
    ? value
    : structuredClone(value);
}
