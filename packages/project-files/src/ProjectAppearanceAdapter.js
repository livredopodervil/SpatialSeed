import { AppearanceGraph } from "../../appearance-graph/src/index.js";

export class ProjectAppearanceAdapter {
  normalizeScene(scene) {
    const graph = new AppearanceGraph();

    const objects = (scene.objects ?? []).map(object => {
      if (!object.material) {
        if (!object.appearanceId) {
          throw new Error(
            `Objeto sem material ou appearanceId: ${object.id}.`
          );
        }

        return structuredClone(object);
      }

      const result = graph.internLegacyMaterial(
        object.material
      );

      return graph.attachToObject(
        object,
        result.appearanceId
      );
    });

    return {
      scene: {
        ...structuredClone(scene),
        objects
      },
      assets: graph.export()
    };
  }

  denormalizeScene(scene, assets) {
    const graph = new AppearanceGraph();
    graph.import(assets, { replace: true });

    const objects = (scene.objects ?? []).map(object => {
      if (!object.appearanceId) {
        return structuredClone(object);
      }

      const resolved = graph.resolveAppearance(
        object.appearanceId
      );

      if (!resolved) {
        throw new Error(
          `Aparência ausente: ${object.appearanceId}.`
        );
      }

      return {
        ...structuredClone(object),
        material: materialToLegacy(
          resolved.material.value,
          resolved.texture?.value ?? null
        )
      };
    });

    return {
      ...structuredClone(scene),
      objects
    };
  }
}

function materialToLegacy(material, texture) {
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

  return result;
}
