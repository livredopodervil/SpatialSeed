export class AppearanceStore {
  constructor({ assets, materials }) {
    this.assets = assets;
    this.materials = materials;
  }

  intern(appearance = {}, options = {}) {
    let materialId = appearance.materialId ?? null;

    if (!materialId && appearance.material) {
      materialId = this.materials
        .intern(appearance.material, options)
        .id;
    }

    if (!materialId) {
      throw new Error(
        "Appearance exige materialId ou material."
      );
    }

    return this.assets.intern(
      "appearance",
      {
        materialId: String(materialId),
        shaderId: appearance.shaderId
          ? String(appearance.shaderId)
          : null,
        renderState: structuredClone(
          appearance.renderState ?? {}
        ),
        metadata: structuredClone(
          appearance.metadata ?? {}
        )
      },
      options
    );
  }

  get(id) {
    const asset = this.assets.get(id);
    if (!asset) return null;

    if (asset.kind !== "appearance") {
      throw new Error(
        `O recurso ${id} não é uma aparência.`
      );
    }

    return asset;
  }

  release(id, count = 1) {
    return this.assets.release(id, count);
  }
}
