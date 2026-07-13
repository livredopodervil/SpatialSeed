import * as THREE from "three";
import { RefCountCache } from "../../renderer-resource-cache/src/RefCountCache.js";

export class BatchMaterialCache {
  constructor({ resourceCache }) {
    if (!resourceCache) {
      throw new TypeError("BatchMaterialCache exige resourceCache.");
    }

    this.resourceCache = resourceCache;

    this.materials = new RefCountCache({
      create: (_, descriptor) => this.#createMaterial(descriptor),

      dispose: record => {
        if (record.textureCacheKey) {
          this.resourceCache.releaseTexture(record.textureCacheKey);
        }

        record.material.map = null;
        record.material.dispose();
      }
    });
  }

  acquire({ appearanceId, material }) {
    const descriptor = {
      appearanceId: String(appearanceId),
      material: normalizeMaterial(material)
    };

    return this.materials.acquire(
      descriptor.appearanceId,
      descriptor
    );
  }

  release(appearanceId) {
    return this.materials.release(appearanceId);
  }

  stats() {
    return this.materials.stats();
  }

  #createMaterial({ material }) {
    const threeMaterial = new THREE.MeshStandardMaterial({
      color: material.color,
      opacity: material.opacity,
      transparent: material.transparent
    });

    const acquiredTexture =
      this.resourceCache.acquireTexture(material.texture);

    const record = {
      material: threeMaterial,
      textureCacheKey: acquiredTexture?.key ?? null
    };

    if (!acquiredTexture) {
      return record;
    }

    if (acquiredTexture.value) {
      threeMaterial.map = acquiredTexture.value;
      threeMaterial.needsUpdate = true;
      return record;
    }

    acquiredTexture.promise?.then(texture => {
      if (!texture) return;
      threeMaterial.map = texture;
      threeMaterial.needsUpdate = true;
    }).catch(error => {
      console.error(
        "Falha ao preparar material compartilhado",
        error
      );
    });

    return record;
  }
}

function normalizeMaterial(material = {}) {
  return {
    color: material.color ?? "#ffffff",
    opacity: Number(material.opacity ?? 1),
    transparent: Boolean(material.transparent),
    texture: material.texture ?? null
  };
}
