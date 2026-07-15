export class SelectionPropertyService {
  static apiVersion = "selection-properties-v1";

  constructor({ selection, sandbox, appearanceRuntime, registry }) {
    this.selection = selection;
    this.sandbox = sandbox;
    this.appearanceRuntime = appearanceRuntime;
    this.registry = registry;
  }

  inspectSelection() {
    const targets = this.#selectionTargets();

    return Object.freeze({
      apiVersion: SelectionPropertyService.apiVersion,
      selectionId: this.selection.id,
      targetIds: Object.freeze(targets.map(object => object.id)),
      count: targets.length,
      properties: this.registry.inspect(targets, this.#context())
    });
  }

  setSelection(patch) {
    return this.set({
      targetIds: this.#selectionTargetIds(),
      patch
    });
  }

  unsetSelection(propertyIds) {
    const patch = {};

    for (const id of propertyIds ?? []) {
      const descriptor = this.registry.require(id);
      if (!descriptor.nullable) {
        throw new Error(`Propriedade não pode ser removida: ${id}.`);
      }
      patch[id] = null;
    }

    return this.setSelection(patch);
  }

  set({ targetIds, patch }) {
    const ids = uniqueIds(targetIds);
    const entries = Object.entries(patch ?? {});

    if (!ids.length) throw new Error("Seleção vazia.");
    if (!entries.length) throw new Error("Nenhuma propriedade informada.");

    const state = this.sandbox.getState();
    const byId = new Map(state.objects.map(object => [object.id, object]));
    const objects = ids.map(id => {
      const object = byId.get(id);
      if (!object) throw new Error(`Objeto inexistente: ${id}.`);
      return object;
    });
    const normalizedPatch = {};

    for (const [id, value] of entries) {
      const descriptor = this.registry.require(id);
      if (!descriptor.writable) {
        throw new Error(`Propriedade somente leitura: ${id}.`);
      }
      if (objects.length > 1 && !descriptor.editableMany) {
        throw new Error(`Propriedade não editável em lote: ${id}.`);
      }
      if (value === null && !descriptor.nullable) {
        throw new Error(`Propriedade não aceita nulo: ${id}.`);
      }
      if (objects.some(object => !descriptor.supports(object, this.#context()))) {
        throw new Error(`Propriedade não suportada pelos alvos: ${id}.`);
      }
      normalizedPatch[id] = descriptor.normalize(value);
    }

    const context = this.#context();
    const updates = objects.flatMap(object => {
      const changedProperties = Object.fromEntries(
        Object.entries(normalizedPatch).filter(([id, value]) => {
          const descriptor = this.registry.require(id);
          return !equalValue(descriptor.read(object, context), value);
        })
      );

      return Object.keys(changedProperties).length
        ? [{
            id: object.id,
            patch: this.#buildObjectPatch(object, changedProperties)
          }]
        : [];
    });

    if (!updates.length) {
      return Object.freeze({
        changed: false,
        targetIds: Object.freeze([]),
        propertyPatch: Object.freeze(structuredClone(normalizedPatch))
      });
    }

    const changedTargetIds = updates.map(update => update.id);
    const command = {
      type: "selection.properties.set",
      schemaVersion: 1,
      targetIds: changedTargetIds,
      propertyPatch: normalizedPatch,
      updates
    };
    const changed = this.sandbox.dispatch(command);

    return Object.freeze({
      changed,
      targetIds: Object.freeze([...changedTargetIds]),
      propertyPatch: Object.freeze(structuredClone(normalizedPatch))
    });
  }

  #buildObjectPatch(object, propertyPatch) {
    const patch = {};
    let material = null;

    for (const [id, value] of Object.entries(propertyPatch)) {
      const descriptor = this.registry.require(id);

      if (descriptor.scope === "object") {
        if (descriptor.write) {
          descriptor.write(patch, value, { object });
        } else {
          setPath(patch, descriptor.path, value);
        }
      } else if (descriptor.scope === "instance") {
        patch.instanceState ??= {};
        setPath(patch.instanceState, descriptor.path, value);
      } else if (descriptor.scope === "appearance") {
        material ??= this.#editableMaterial(object);
        applyAppearanceValue(material, descriptor.path, value);
      }
    }

    if (material) {
      const created = this.appearanceRuntime.internLegacyMaterial(material);
      patch.appearanceId = created.appearanceId;
    }

    return patch;
  }

  #editableMaterial(object) {
    const material = structuredClone(
      object.appearanceId
        ? this.appearanceRuntime.legacyMaterial(object.appearanceId)
        : object.material
    );
    const transform = this.#textureTransform(object);

    material.texture ??= {
      src: "",
      repeat: [...transform.repeat],
      offset: [...transform.offset],
      rotationDeg: transform.rotationDeg,
      wrap: transform.wrap
    };

    return material;
  }

  #context() {
    return {
      material: object => object.appearanceId
        ? this.appearanceRuntime.legacyMaterial(object.appearanceId)
        : object.material,
      textureTransform: object => this.#textureTransform(object)
    };
  }

  #textureTransform(object) {
    const resolved = object.appearanceId
      ? this.appearanceRuntime.resolve(object.appearanceId)
      : null;
    const transform = resolved?.material?.value?.textureTransform ?? {};

    return {
      repeat: [...(transform.repeat ?? [1, 1])],
      offset: [...(transform.offset ?? [0, 0])],
      rotationDeg: Number(transform.rotationDeg ?? 0),
      wrap: String(transform.wrap ?? "repeat")
    };
  }

  #selectionTargetIds() {
    return this.selection.members.map(member => member.objectId);
  }

  #selectionTargets() {
    const state = this.sandbox.getState();
    const byId = new Map(state.objects.map(object => [object.id, object]));
    return this.#selectionTargetIds()
      .map(id => byId.get(id))
      .filter(Boolean);
  }
}

function applyAppearanceValue(material, path, value) {
  if (path[0] === "texture" && path[1] === "src" && value === null) {
    delete material.texture;
    return;
  }

  setPath(material, path, value);
}

function setPath(target, path, value) {
  let current = target;

  for (let index = 0; index < path.length - 1; index += 1) {
    current[path[index]] ??= {};
    current = current[path[index]];
  }

  current[path.at(-1)] = structuredClone(value);
}

function uniqueIds(values) {
  const seen = new Set();
  const result = [];

  for (const value of values ?? []) {
    const id = String(value ?? "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    result.push(id);
  }

  return result;
}

function equalValue(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}
