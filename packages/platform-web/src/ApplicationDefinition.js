export const WEB_APPLICATION_DEFINITION_VERSION =
  "spatial-seed-web-application-v1";
export const WEB_RUNTIME_EXTENSION_API_VERSION =
  "spatial-seed-web-runtime-extension-v1";

const APPLICATION_ROLES = new Set(["production", "diagnostics"]);
const EXTENSION_ROLES = new Set(["runtime", "diagnostics"]);
const NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ID_PATTERN = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/;

export function webApplicationName(locationRef = globalThis.location) {
  const href = locationRef?.href;
  if (!href) return "default";
  const requested = new URL(href).searchParams.get("application");
  return normalizeApplicationName(requested ?? "default");
}

export async function loadWebApplicationDefinition({
  name = "default",
  applicationRootUrl = globalThis.location?.href,
  fetchImpl = globalThis.fetch
} = {}) {
  const normalizedName = normalizeApplicationName(name);
  if (!applicationRootUrl) {
    throw new TypeError("Raiz da aplicação web é obrigatória.");
  }
  if (typeof fetchImpl !== "function") {
    throw new TypeError("Carregador da definição web é incompatível.");
  }

  const definitionUrl = new URL(
    `./config/application.${normalizedName}.json`,
    applicationRootUrl
  );
  const response = await fetchImpl(definitionUrl.href, { cache: "no-store" });
  if (!response?.ok) {
    throw new Error(
      `Falha ao carregar aplicação ${normalizedName} (${response?.status ?? 0}).`
    );
  }
  return normalizeWebApplicationDefinition(await response.json(), {
    sourceUrl: definitionUrl.href
  });
}

export function normalizeWebApplicationDefinition(value, { sourceUrl } = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Definição da aplicação web deve ser um objeto.");
  }
  if (value.definitionVersion !== WEB_APPLICATION_DEFINITION_VERSION) {
    throw new TypeError("Versão da definição da aplicação web incompatível.");
  }
  if (!sourceUrl) {
    throw new TypeError("Origem da definição da aplicação web é obrigatória.");
  }

  const id = qualifiedId(value.id, "aplicação");
  const role = enumValue(value.role, APPLICATION_ROLES, "papel da aplicação");
  const extensions = arrayValue(value.extensions, "extensions").map(
    (extension, index) => normalizeExtensionDescriptor(extension, {
      sourceUrl,
      applicationRole: role,
      index
    })
  );
  unique(extensions.map(extension => extension.id), "extensão");

  return Object.freeze({
    definitionVersion: WEB_APPLICATION_DEFINITION_VERSION,
    id,
    role,
    sourceUrl: new URL(sourceUrl).href,
    extensions: Object.freeze(extensions)
  });
}

export async function loadWebRuntimeExtensions(
  definition,
  { importModule = specifier => import(specifier) } = {}
) {
  const normalized = normalizeWebApplicationDefinition(definition, {
    sourceUrl: definition?.sourceUrl
  });
  if (typeof importModule !== "function") {
    throw new TypeError("Importador de extensões web é incompatível.");
  }

  const extensions = [];
  for (const descriptor of normalized.extensions) {
    const imported = await importModule(descriptor.entryUrl);
    const extension = normalizeRuntimeExtension(
      imported?.webRuntimeExtension,
      descriptor
    );
    extensions.push(extension);
  }
  return Object.freeze(extensions);
}

export async function activateWebRuntimeExtensions(extensions, host) {
  if (!Array.isArray(extensions)) {
    throw new TypeError("Extensões web devem formar uma lista.");
  }
  if (!host || typeof host !== "object") {
    throw new TypeError("Host das extensões web é obrigatório.");
  }

  const active = [];
  try {
    for (const extension of extensions) {
      const activation = await extension.activate(Object.freeze({ ...host }));
      if (
        activation !== undefined &&
        (activation === null || typeof activation !== "object")
      ) {
        throw new TypeError(
          `Ativação incompatível da extensão ${extension.manifest.id}.`
        );
      }
      active.push(Object.freeze({
        manifest: extension.manifest,
        dispose: typeof activation?.dispose === "function"
          ? () => activation.dispose()
          : () => {}
      }));
    }
  } catch (error) {
    disposeReverse(active);
    throw error;
  }

  let disposed = false;
  return Object.freeze({
    manifests: Object.freeze(active.map(item => item.manifest)),
    dispose() {
      if (disposed) return false;
      disposed = true;
      disposeReverse(active);
      return true;
    }
  });
}

function normalizeApplicationName(value) {
  const name = String(value ?? "").trim().toLowerCase();
  if (!NAME_PATTERN.test(name)) {
    throw new TypeError(`Nome de aplicação web inválido: ${name || "(vazio)"}.`);
  }
  return name;
}

function normalizeExtensionDescriptor(value, {
  sourceUrl,
  applicationRole,
  index
}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`Extensão web inválida na posição ${index}.`);
  }
  const role = enumValue(value.role, EXTENSION_ROLES, "papel da extensão");
  if (applicationRole === "production" && role === "diagnostics") {
    throw new TypeError(
      "Aplicação de produção não pode ativar extensão de diagnóstico."
    );
  }
  const entry = relativeEntry(value.entry);
  const entryUrl = new URL(entry, sourceUrl);
  const source = new URL(sourceUrl);
  if (entryUrl.origin !== source.origin) {
    throw new TypeError("Extensão web deve permanecer na mesma origem.");
  }
  return Object.freeze({
    id: qualifiedId(value.id, "extensão"),
    apiVersion: requiredText(value.apiVersion, "apiVersion"),
    role,
    entry,
    entryUrl: entryUrl.href
  });
}

function normalizeRuntimeExtension(value, descriptor) {
  if (!value || typeof value !== "object") {
    throw new TypeError(`Módulo ${descriptor.id} não publica webRuntimeExtension.`);
  }
  const manifest = value.manifest;
  if (!manifest || typeof manifest !== "object") {
    throw new TypeError(`Extensão ${descriptor.id} não possui manifesto.`);
  }
  const id = qualifiedId(manifest.id, "manifesto de extensão");
  const apiVersion = requiredText(manifest.apiVersion, "apiVersion");
  const role = enumValue(manifest.role, EXTENSION_ROLES, "papel da extensão");
  if (
    id !== descriptor.id ||
    apiVersion !== descriptor.apiVersion ||
    role !== descriptor.role
  ) {
    throw new TypeError(`Manifesto da extensão ${descriptor.id} diverge do perfil.`);
  }
  if (apiVersion !== WEB_RUNTIME_EXTENSION_API_VERSION) {
    throw new TypeError(`API da extensão ${descriptor.id} incompatível.`);
  }
  if (typeof value.activate !== "function") {
    throw new TypeError(`Extensão ${descriptor.id} não possui activate.`);
  }
  return Object.freeze({
    manifest: Object.freeze({ id, apiVersion, role }),
    activate: value.activate
  });
}

function relativeEntry(value) {
  const entry = requiredText(value, "entry");
  if (!entry.startsWith("./") && !entry.startsWith("../")) {
    throw new TypeError("Entrada de extensão web deve ser relativa.");
  }
  return entry;
}

function qualifiedId(value, label) {
  const id = requiredText(value, label);
  if (!ID_PATTERN.test(id)) {
    throw new TypeError(`ID inválido de ${label}: ${id}.`);
  }
  return id;
}

function requiredText(value, field) {
  const text = String(value ?? "").trim();
  if (!text) throw new TypeError(`Campo obrigatório ausente: ${field}.`);
  return text;
}

function enumValue(value, allowed, field) {
  const normalized = requiredText(value, field).toLowerCase();
  if (!allowed.has(normalized)) {
    throw new TypeError(`${field} incompatível: ${normalized}.`);
  }
  return normalized;
}

function arrayValue(value, field) {
  if (!Array.isArray(value)) {
    throw new TypeError(`${field} deve ser uma lista.`);
  }
  return value;
}

function unique(values, label) {
  const seen = new Set();
  for (const value of values) {
    if (seen.has(value)) throw new TypeError(`${label} duplicada: ${value}.`);
    seen.add(value);
  }
}

function disposeReverse(active) {
  for (const item of [...active].reverse()) {
    try {
      item.dispose();
    } catch {
      // O runtime candidato não será publicado; continue limpando o restante.
    }
  }
}
