import { ProjectSerializer } from "./ProjectSerializer.js";

export class ProjectValidator {
  parse(text) {
    let value;

    try {
      value = JSON.parse(String(text ?? ""));
    } catch (error) {
      const wrapped = new Error(
        "O arquivo não contém JSON válido."
      );
      wrapped.cause = error;
      throw wrapped;
    }

    return this.validate(value);
  }

  validate(value) {
    if (!value || typeof value !== "object") {
      throw new Error(
        "Estrutura de projeto inválida."
      );
    }

    if (value.format !== ProjectSerializer.format) {
      throw new Error(
        `Formato incompatível: ${value.format ?? "ausente"}.`
      );
    }

    if (![1, ProjectSerializer.schemaVersion].includes(
      value.schemaVersion
    )) {
      throw new Error(
        `Versão de esquema incompatível: ` +
        `${value.schemaVersion ?? "ausente"}.`
      );
    }

    if (
      !value.scene ||
      !Array.isArray(value.scene.objects)
    ) {
      throw new Error(
        "A cena não contém uma lista de objetos."
      );
    }

    if (
      value.schemaVersion === 2 &&
      (
        !value.assets ||
        value.assets.schemaVersion !== 1 ||
        typeof value.assets.assets !== "object"
      )
    ) {
      throw new Error(
        "Catálogo de assets inválido."
      );
    }

    const ids = new Set();

    const objects = value.scene.objects.map(
      (object, index) => {
        if (!object || typeof object !== "object") {
          throw new Error(
            `Objeto inválido no índice ${index}.`
          );
        }

        const id = String(object.id ?? "");

        if (!id) {
          throw new Error(
            `Objeto sem id no índice ${index}.`
          );
        }

        if (ids.has(id)) {
          throw new Error(
            `Id duplicado: ${id}.`
          );
        }

        ids.add(id);

        if (
          value.schemaVersion === 2 &&
          !object.appearanceId
        ) {
          throw new Error(
            `Objeto sem appearanceId: ${id}.`
          );
        }

        return structuredClone(object);
      }
    );

    return {
      format: value.format,
      schemaVersion: value.schemaVersion,
      metadata: structuredClone(value.metadata ?? {}),
      region: structuredClone(value.region ?? {}),
      assets:
        value.schemaVersion === 2
          ? structuredClone(value.assets)
          : null,
      scene: {
        ...structuredClone(value.scene),
        objects
      },
      editor: structuredClone(value.editor ?? {}),
      renderer: structuredClone(value.renderer ?? {})
    };
  }
}
