// Presentation only. These groups refer to existing HUD components.
export function normalizeWorkspaceConfiguration(source = {}) {
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    throw new TypeError("workspace deve ser um objeto.");
  }
  const mode = source.mode ?? "free";
  if (!["guided", "free"].includes(mode)) {
    throw new RangeError("workspace.mode deve ser guided ou free.");
  }
  const ids = new Set();
  const sections = (source.sections ?? []).map(section => {
    if (!section || !/^[a-z][a-z0-9-]*$/.test(section.id) || ids.has(section.id)) {
      throw new TypeError("workspace.sections exige identificadores únicos.");
    }
    ids.add(section.id);
    if (typeof section.label !== "string" || !section.label.trim() ||
        !Array.isArray(section.groups) || !section.groups.length ||
        section.groups.some(id => typeof id !== "string" || !/^[a-z][a-z0-9-]*$/.test(id))) {
      throw new TypeError(`Seção de workspace inválida: ${section.id}.`);
    }
    const when = section.when ?? "always";
    if (!["always", "selection", "mesh"].includes(when)) {
      throw new RangeError(`Contexto inválido: ${when}.`);
    }
    return Object.freeze({
      id: section.id, label: section.label.trim(), when,
      hint: String(section.hint ?? ""),
      groups: Object.freeze([...new Set(section.groups)])
    });
  });
  const defaultSection = source.defaultSection ?? sections[0]?.id ?? null;
  if (sections.length && !ids.has(defaultSection)) {
    throw new RangeError("workspace.defaultSection não existe.");
  }
  if (mode === "guided" && !sections.some(section => section.when === "always")) {
    throw new RangeError("O workspace guiado exige uma seção sempre disponível.");
  }
  return Object.freeze({ mode, defaultSection, sections: Object.freeze(sections) });
}
