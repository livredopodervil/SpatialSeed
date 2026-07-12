import { ProjectSerializer } from "./ProjectSerializer.js";

export class ProjectValidator {
  parse(text) {
    let value;
    try {
      value = JSON.parse(String(text ?? ""));
    } catch (error) {
      const wrapped = new Error("O arquivo não contém JSON válido.");
      wrapped.cause = error;
      throw wrapped;
    }
    return this.validate(value);
  }

  validate(value) {
    if (!value || typeof value !== "object") {
      throw new Error("Estrutura de projeto inválida.");
    }
    if (value.format !== ProjectSerializer.format) {
      throw new Error(`Formato incompatível: ${value.format ?? "ausente"}.`);
    }
    if (value.schemaVersion !== ProjectSerializer.schemaVersion) {
      throw new Error(`Versão de esquema incompatível: ${value.schemaVersion ?? "ausente"}.`);
    }
    if (!value.scene || !Array.isArray(value.scene.objects)) {
      throw new Error("A cena não contém uma lista de objetos.");
    }

    const ids = new Set();
    const objects = value.scene.objects.map((object, index) => {
      if (!object || typeof object !== "object") {
        throw new Error(`Objeto inválido no índice ${index}.`);
      }
      const id = String(object.id ?? "");
      if (!id) throw new Error(`Objeto sem id no índice ${index}.`);
      if (ids.has(id)) throw new Error(`Id duplicado: ${id}.`);
      ids.add(id);
      return structuredClone(object);
    });

    return {
      format: value.format,
      schemaVersion: value.schemaVersion,
      metadata: structuredClone(value.metadata ?? {}),
      region: structuredClone(value.region ?? {}),
      scene: {
        ...structuredClone(value.scene),
        objects
      },
      editor: structuredClone(value.editor ?? {}),
      renderer: structuredClone(value.renderer ?? {})
    };
  }
}
