export class MaterialStore {
  constructor({ assets, textures }) {
    this.assets = assets;
    this.textures = textures;
  }

  intern(material = {}, options = {}) {
    let textureId = material.textureId ?? null;

    if (!textureId && material.texture?.src) {
      textureId = this.textures
        .intern(material.texture, options)
        .id;
    }

    return this.assets.intern(
      "material",
      normalizeMaterial(material, textureId),
      options
    );
  }

  get(id) {
    const asset = this.assets.get(id);
    if (!asset) return null;

    if (asset.kind !== "material") {
      throw new Error(
        `O recurso ${id} não é um material.`
      );
    }

    return asset;
  }

  release(id, count = 1) {
    return this.assets.release(id, count);
  }
}

function normalizeMaterial(material, textureId) {
  return {
    model: String(material.model ?? "standard"),
    color: String(material.color ?? "#ffffff"),
    opacity: finiteNumber(material.opacity, 1),
    transparent: Boolean(material.transparent ?? false),
    textureId: textureId ? String(textureId) : null,
    textureTransform: {
      repeat: vector(
        material.texture?.repeat ??
        material.textureTransform?.repeat ??
        [1, 1],
        2
      ),
      offset: vector(
        material.texture?.offset ??
        material.textureTransform?.offset ??
        [0, 0],
        2
      ),
      rotationDeg: finiteNumber(
        material.texture?.rotationDeg ??
        material.textureTransform?.rotationDeg,
        0
      ),
      wrap: String(
        material.texture?.wrap ??
        material.textureTransform?.wrap ??
        "repeat"
      )
    },
    parameters: structuredClone(material.parameters ?? {})
  };
}

function vector(value, length) {
  if (!Array.isArray(value) || value.length !== length) {
    throw new Error(
      `Vetor deve conter ${length} componentes.`
    );
  }

  return value.map(item => {
    const result = Number(item);

    if (!Number.isFinite(result)) {
      throw new Error(
        "Componente vetorial inválido."
      );
    }

    return result;
  });
}

function finiteNumber(value, fallback) {
  const result =
    value === undefined
      ? fallback
      : Number(value);

  if (!Number.isFinite(result)) {
    throw new Error(
      "Parâmetro numérico inválido."
    );
  }

  return result;
}
