export class TextureStore {
  constructor({ assets }) {
    this.assets = assets;
  }

  intern(texture, options = {}) {
    return this.assets.intern(
      "texture",
      normalizeTexture(texture),
      options
    );
  }

  get(id) {
    const asset = this.assets.get(id);
    if (!asset) return null;

    if (asset.kind !== "texture") {
      throw new Error(
        `O recurso ${id} não é uma textura.`
      );
    }

    return asset;
  }

  release(id, count = 1) {
    return this.assets.release(id, count);
  }
}

function normalizeTexture(texture = {}) {
  return {
    src: String(texture.src ?? ""),
    mimeType: String(
      texture.mimeType ?? inferMimeType(texture.src)
    ),
    colorSpace: String(texture.colorSpace ?? "srgb"),
    flipY: Boolean(texture.flipY ?? true),
    metadata: structuredClone(texture.metadata ?? {})
  };
}

function inferMimeType(source = "") {
  const match =
    /^data:([^;,]+)[;,]/.exec(String(source));

  return match?.[1] ?? "";
}
