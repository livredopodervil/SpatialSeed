import {
  appearanceBindingForObject,
  appearanceMaterialReference,
  effectiveAppearanceColor,
  mergeAppearanceMaterial,
  normalizeAppearanceBinding,
  patchAppearanceBinding
} from "./AppearanceBinding.js?build=20260730-0041a";

const PREPARED_COMMAND_MARKER = "spatialseed-prepared-command-v1";

export class AppearanceBindingService {
  static apiVersion = "appearance-binding-service-v2";

  constructor({ sandbox, selection, appearanceRuntime } = {}) {
    if (!sandbox?.dispatch || !sandbox?.getObject) {
      throw new TypeError("AppearanceBindingService exige Sandbox indexado.");
    }
    if (!selection?.snapshot) {
      throw new TypeError("AppearanceBindingService exige Selection.");
    }
    if (!appearanceRuntime?.internLegacyMaterial || !appearanceRuntime?.legacyMaterial) {
      throw new TypeError("AppearanceBindingService exige AppearanceRuntime.");
    }
    this.sandbox = sandbox;
    this.selection = selection;
    this.appearanceRuntime = appearanceRuntime;
  }

  inspectSelection({ targetIds = null } = {}) {
    const ids = this.#targetIds(targetIds);
    const objects = ids.map(id => this.sandbox.getObject(id)).filter(Boolean);
    const bindings = objects.map(object => appearanceBindingForObject(object));
    const materials = objects.map(object =>
      object.appearanceId
        ? this.appearanceRuntime.legacyMaterial(object.appearanceId)
        : object.material ?? { color: "#ffffff" }
    );
    return Object.freeze({
      targetIds: Object.freeze(ids),
      count: objects.length,
      colorMode: aggregate(bindings.map(value => value.colorMode)),
      uniformColor: aggregate(bindings.map(value => value.uniformColor ?? null)),
      tint: aggregate(bindings.map(value => value.tint)),
      opacityMultiplier: aggregate(bindings.map(value => value.opacityMultiplier)),
      materialMode: aggregate(bindings.map(value => value.materialMode)),
      effectiveMaterialMode: aggregate(objects.map((object, index) =>
        effectiveMaterialMode(object, bindings[index], materials[index])
      )),
      effectiveColor: aggregate(objects.map((object, index) =>
        effectiveAppearanceColor(bindings[index], {
          baseColor: materials[index]?.color ?? "#ffffff",
          instanceColor: object.instanceState?.color ?? null
        })
      )),
      materialReference: aggregate(objects.map(object =>
        appearanceMaterialReference(object)
      ), { structural: true }),
      material: aggregate(materials, { structural: true })
    });
  }

  patchSelection({
    targetIds = null,
    binding = {},
    materialPatch = null,
    appearanceId = undefined,
    source = "appearance.selection.patch"
  } = {}) {
    const ids = this.#targetIds(targetIds);
    if (!ids.length) {
      return Object.freeze({ changed: false, targetIds: Object.freeze([]) });
    }
    const materialCache = new Map();
    const bindingPatch = { ...binding };
    const assetMaterialPatch = materialPatch
      ? structuredClone(materialPatch)
      : null;
    if (materialPatch?.model !== undefined && bindingPatch.materialMode === undefined) {
      const model = String(materialPatch.model).trim().toLowerCase();
      bindingPatch.materialMode = model === "basic" ? "unlit" : model;
      if (["basic", "unlit"].includes(model) && assetMaterialPatch) {
        delete assetMaterialPatch.model;
      }
    }
    const hasAssetMaterialPatch = Boolean(
      assetMaterialPatch && Object.keys(assetMaterialPatch).length
    );
    const updates = ids.map(id => {
      const object = this.sandbox.getObject(id);
      if (!object) throw new Error(`Objeto inexistente: ${id}.`);
      const current = appearanceBindingForObject(object);
      const nextBinding = patchAppearanceBinding(current, bindingPatch, {
        family: object.family,
        fallbackColor: object.material?.color ?? "#ffffff",
        instanceColor: object.instanceState?.color ?? null
      });
      if (nextBinding.colorMode === "per-instance" && !object.family?.colors) {
        throw new Error(
          `O objeto ${id} não possui cores por instância para esse modo.`
        );
      }
      const patch = { appearanceBinding: nextBinding };
      if (appearanceId !== undefined) {
        const resolvedId = String(appearanceId ?? "").trim();
        if (!resolvedId || !this.appearanceRuntime.resolve(resolvedId)) {
          throw new Error(`Aparência inexistente: ${appearanceId}.`);
        }
        patch.appearanceId = resolvedId;
      } else if (hasAssetMaterialPatch) {
        const currentMaterial = object.appearanceId
          ? this.appearanceRuntime.legacyMaterial(object.appearanceId)
          : object.material ?? { color: "#ffffff" };
        const merged = mergeAppearanceMaterial(
          currentMaterial,
          assetMaterialPatch
        );
        const cacheKey = JSON.stringify(merged);
        let created = materialCache.get(cacheKey);
        if (!created) {
          created = this.appearanceRuntime.internLegacyMaterial(merged);
          materialCache.set(cacheKey, created);
        }
        patch.appearanceId = created.appearanceId;
      }
      return deepFreeze({ id, patch });
    });
    const command = deepFreeze({
      type: "selection.properties.set",
      preparedImmutable: PREPARED_COMMAND_MARKER,
      targetIds: ids,
      updates,
      source: String(source)
    });
    const changed = this.sandbox.dispatch(command);
    return Object.freeze({
      changed,
      targetIds: Object.freeze(ids),
      binding: updates[0]?.patch?.appearanceBinding ??
        normalizeAppearanceBinding(null),
      materialChanged: Boolean(
        hasAssetMaterialPatch ||
        appearanceId !== undefined ||
        bindingPatch.materialMode !== undefined
      )
    });
  }

  setFamilyColorMode({
    targetIds = null,
    colorMode,
    uniformColor = undefined,
    tint = undefined
  } = {}) {
    return this.patchSelection({
      targetIds,
      binding: {
        colorMode,
        ...(uniformColor !== undefined ? { uniformColor } : {}),
        ...(tint !== undefined ? { tint } : {})
      },
      source: "appearance.family.color-mode"
    });
  }

  #targetIds(targetIds) {
    const values = targetIds === null || targetIds === undefined
      ? this.selection.snapshot().members.map(member => member.objectId)
      : targetIds;
    if (!Array.isArray(values)) {
      throw new TypeError("targetIds deve ser um array.");
    }
    const result = [];
    const seen = new Set();
    for (const value of values) {
      const id = String(value ?? "").trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      result.push(id);
    }
    return result;
  }
}

function effectiveMaterialMode(object, binding, material) {
  if (binding.materialMode !== "inherit") return binding.materialMode;
  const model = String(material?.model ?? "").trim().toLowerCase();
  if (["basic", "unlit"].includes(model)) return "unlit";
  if (model === "physical") return "physical";
  if (model === "standard") return "standard";
  if (object?.family?.generator?.shading === "unlit") return "unlit";
  return "standard";
}

function aggregate(values, { structural = false } = {}) {
  if (!values.length) {
    return Object.freeze({ mixed: false, value: null });
  }
  const key = value => structural ? JSON.stringify(value) : String(value);
  const first = values[0];
  const firstKey = key(first);
  const mixed = values.some(value => key(value) !== firstKey);
  return Object.freeze({
    mixed,
    value: mixed ? null : first
  });
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}
