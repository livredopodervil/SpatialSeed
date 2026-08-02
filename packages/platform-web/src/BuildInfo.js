export class BuildInfoError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name="BuildInfoError";
    this.code=code;
    this.details=Object.freeze({ ...details });
  }
}

export function normalizeBuildInfo(value) {
  if (!value || typeof value !== "object") {
    throw new BuildInfoError(
      "INVALID_BUILD_INFO",
      "Manifesto de build deve ser um objeto."
    );
  }

  const version=requiredText(value.version,"version");
  const build=requiredText(value.build,"build");
  const channel=requiredText(value.channel,"channel");

  return Object.freeze({ version,build,channel });
}

export function formatBuildLabel(buildInfo) {
  const info=normalizeBuildInfo(buildInfo);
  return `v${info.version} · build ${info.build}`;
}

export async function loadBuildInfo({
  url="./build-info.json",
  fetchImpl=fetch
} = {}) {
  const separator=url.includes("?") ? "&" : "?";
  const requestUrl=`${url}${separator}request=${Date.now()}`;
  const response=await fetchImpl(requestUrl,{cache:"no-store"});

  if (!response?.ok) {
    throw new BuildInfoError(
      "BUILD_INFO_REQUEST_FAILED",
      `Não foi possível carregar ${url}.`,
      { status:response?.status ?? null }
    );
  }

  return normalizeBuildInfo(await response.json());
}

function requiredText(value, field) {
  const text=String(value ?? "").trim();
  if (!text) {
    throw new BuildInfoError(
      "INVALID_BUILD_INFO",
      `Campo obrigatório ausente no manifesto: ${field}.`,
      { field }
    );
  }
  return text;
}
