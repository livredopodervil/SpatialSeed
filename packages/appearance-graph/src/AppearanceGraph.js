import { AssetStore } from "../../asset-store/src/index.js";
import { TextureStore } from "./TextureStore.js";
import { MaterialStore } from "./MaterialStore.js";
import { AppearanceStore } from "./AppearanceStore.js";

export class AppearanceGraph {
  constructor({ assets = new AssetStore() } = {}) {
    this.assets = assets;
    this.textures = new TextureStore({ assets });
    this.materials = new MaterialStore({
      assets,
      textures: this.textures
    });
    this.appearances = new AppearanceStore({
      assets,
      materials: this.materials
    });
  }

  internLegacyMaterial(material = {}, options = {}) {
    const appearance = this.appearances.intern(
      { material },
      options
    );

    const materialAsset = this.materials.get(
      appearance.value.materialId
    );

    const texture = materialAsset?.value.textureId
      ? this.textures.get(materialAsset.value.textureId)
      : null;

    return {
      appearanceId: appearance.id,
      appearance,
      material: materialAsset,
      texture
    };
  }

  resolveAppearance(appearanceId) {
    const appearance = this.appearances.get(appearanceId);
    if (!appearance) return null;

    const material = this.materials.get(
      appearance.value.materialId
    );

    if (!material) {
      throw new Error(
        `Material ausente: ${appearance.value.materialId}.`
      );
    }

    const texture = material.value.textureId
      ? this.textures.get(material.value.textureId)
      : null;

    return Object.freeze({
      appearance,
      material,
      texture,
      shaderId: appearance.value.shaderId
    });
  }

  attachToObject(object, appearanceId) {
    if (!this.appearances.get(appearanceId)) {
      throw new Error(
        `Aparência inexistente: ${appearanceId}.`
      );
    }

    const result = {
      ...structuredClone(object),
      appearanceId: String(appearanceId)
    };

    delete result.material;

    return Object.freeze(result);
  }

  stats() {
    return this.assets.stats();
  }

  export() {
    return this.assets.export();
  }

  import(document, options = {}) {
    return this.assets.import(document, options);
  }
}
