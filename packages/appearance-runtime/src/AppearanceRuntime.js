import {
  AppearanceGraph
} from "../../appearance-graph/src/index.js";

export class AppearanceRuntime {
  #resolved = new Map();
  #legacyMaterials = new Map();
  #listeners = new Set();
  #revision = 0;

  constructor({ graph = new AppearanceGraph() } = {}) {
    this.graph = graph;
  }

  get revision() {
    return this.#revision;
  }

  reset() {
    this.graph = new AppearanceGraph();
    this.#invalidate();
    this.#revision += 1;
    this.#notify("reset", null);
    return { reset: true, revision: this.#revision };
  }

  importAssets(document, { replace = true } = {}) {
    const result = this.graph.import(document, { replace });
    this.#invalidate();
    this.#revision += 1;
    this.#notify("assets-imported", result);
    return { ...result, revision: this.#revision };
  }

  exportAssets() {
    return this.graph.export();
  }

  internLegacyMaterial(material, options = {}) {
    const result = this.graph.internLegacyMaterial(material, options);
    this.#resolved.delete(result.appearanceId);
    this.#legacyMaterials.delete(result.appearanceId);
    this.#revision += 1;
    this.#notify("appearance-interned", {
      appearanceId: result.appearanceId
    });
    return result;
  }

  resolve(appearanceId) {
    const id = String(appearanceId);
    if (this.#resolved.has(id)) return this.#resolved.get(id);

    const resolved = this.graph.resolveAppearance(id);
    if (!resolved) return null;

    const snapshot = Object.freeze({
      appearanceId: id,
      appearance: resolved.appearance,
      material: resolved.material,
      texture: resolved.texture,
      shaderId: resolved.shaderId
    });

    this.#resolved.set(id, snapshot);
    return snapshot;
  }

  legacyMaterial(appearanceId) {
    const id = String(appearanceId);
    if (this.#legacyMaterials.has(id)) {
      return this.#legacyMaterials.get(id);
    }

    const resolved = this.resolve(id);
    if (!resolved) {
      throw new Error(`Aparência inexistente: ${id}.`);
    }

    const material = toLegacyMaterial(
      resolved.material.value,
      resolved.texture?.value ?? null
    );

    this.#legacyMaterials.set(id, material);
    return material;
  }

  attachLegacyObject(object, options = {}) {
    if (object.material) {
      const created = this.internLegacyMaterial(
        object.material,
        options
      );

      const result = {
        ...structuredClone(object),
        appearanceId: created.appearanceId
      };

      delete result.material;
      return Object.freeze(result);
    }

    if (object.appearanceId) {
      return Object.freeze(structuredClone(object));
    }

    throw new Error(`Objeto sem material: ${object.id}.`);
  }

  normalizeScene(scene, options = {}) {
    const objects = (scene.objects ?? []).map(object =>
      this.attachLegacyObject(object, options)
    );

    return Object.freeze({
      ...structuredClone(scene),
      objects: Object.freeze(objects)
    });
  }

  projectObject(object) {
    if (object.material) return object;

    return {
      ...object,
      material: this.legacyMaterial(object.appearanceId)
    };
  }

  projectScene(scene) {
    return {
      ...scene,
      objects: (scene.objects ?? []).map(object => {
        if (object.material) return object;

        return {
          ...object,
          material: this.legacyMaterial(object.appearanceId)
        };
      })
    };
  }

  clearResolvedCache() {
    const cleared = this.#resolved.size + this.#legacyMaterials.size;
    this.#invalidate();
    return { cleared };
  }

  stats() {
    return Object.freeze({
      revision: this.#revision,
      resolvedCache: this.#resolved.size,
      legacyMaterialCache: this.#legacyMaterials.size,
      assets: this.graph.stats()
    });
  }

  subscribe(listener) {
    this.#listeners.add(listener);
    listener(this.stats(), { type: "initial", payload: null });
    return () => this.#listeners.delete(listener);
  }

  #invalidate() {
    this.#resolved.clear();
    this.#legacyMaterials.clear();
  }

  #notify(type, payload) {
    const snapshot = this.stats();
    for (const listener of this.#listeners) {
      try {
        listener(snapshot, { type, payload });
      } catch (error) {
        console.error("AppearanceRuntime subscriber failed", error);
      }
    }
  }
}

function toLegacyMaterial(material, texture) {
  const transform = material.textureTransform ?? {};
  const result = {
    model: material.model ?? "standard",
    color: material.color ?? "#ffffff",
    opacity: material.opacity ?? 1,
    transparent: Boolean(material.transparent),
    parameters: structuredClone(material.parameters ?? {})
  };

  if (texture) {
    result.texture = {
      src: texture.src ?? "",
      mimeType: texture.mimeType ?? "",
      colorSpace: texture.colorSpace ?? "srgb",
      flipY: Boolean(texture.flipY ?? true),
      metadata: structuredClone(texture.metadata ?? {}),
      repeat: [...(transform.repeat ?? [1, 1])],
      offset: [...(transform.offset ?? [0, 0])],
      rotationDeg: Number(transform.rotationDeg ?? 0),
      wrap: transform.wrap ?? "repeat"
    };
  }

  return Object.freeze(result);
}
