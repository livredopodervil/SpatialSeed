export const APPLICATION_DEFINITION_SCHEMA = "spatial-seed-application-v1";

export function normalizeApplicationDefinition(value = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("A definição da aplicação deve ser um objeto.");
  }
  const id = stableId(value.id ?? "spatialseed", "application.id");
  return deepFreeze({
    schemaVersion: APPLICATION_DEFINITION_SCHEMA,
    id,
    name: nonEmpty(value.name ?? id, "application.name"),
    enabledModules: uniqueIds(value.enabledModules ?? value.modules ?? []),
    disabledModules: uniqueIds(value.disabledModules ?? []),
    workspaceProfileId: optionalId(value.workspaceProfileId),
    hudProfileId: optionalId(value.hudProfileId),
    safeModeModules: uniqueIds(value.safeModeModules ?? ["ui.shell", "project.files", "ui.diagnostics"]),
    metadata: cloneObject(value.metadata)
  });
}

function uniqueIds(values) {
  if (!Array.isArray(values)) throw new TypeError("modules deve ser uma lista.");
  return Object.freeze([...new Set(values.map((value, index) => stableId(value, `modules[${index}]`)))]);
}

function stableId(value, path) {
  const text = nonEmpty(value, path);
  if (!/^[a-z][a-z0-9]*(?:[._:-][a-z0-9]+)*$/i.test(text)) throw new TypeError(`${path} inválido.`);
  return text;
}

function optionalId(value) {
  if (value == null || value === "") return null;
  return stableId(value, "id");
}

function nonEmpty(value, path) {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${path} deve ser texto não vazio.`);
  return value.trim();
}

function cloneObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return Object.freeze({});
  try { return structuredClone(value); }
  catch { return {}; }
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
