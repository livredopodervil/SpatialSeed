const PRIORITY_FIELDS = Object.freeze([
  "message",
  "summary",
  "status",
  "changed",
  "reason",
  "id",
  "activeId",
  "count",
  "selectedCount",
  "passed",
  "failed",
  "total",
  "durationMs",
  "ok",
  "active",
  "mode",
  "tool",
  "build",
  "channel"
]);

export function formatConsoleEntry({ result, error } = {}) {
  if (error !== undefined && error !== null) {
    return `Erro: ${String(error)}`;
  }
  return formatConsoleValue(result);
}

export function formatConsoleValue(value) {
  if (value === undefined) return "Concluído.";
  if (value === null) return "∅";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    if (!value.length) return "0 itens";
    if (value.length <= 4 && value.every(isScalar)) {
      return value.map(formatScalar).join(" · ");
    }
    return `${value.length} itens`;
  }
  if (typeof value !== "object") return String(value);

  if (isRuntimeTestResult(value)) {
    const mark = value.ok === false || Number(value.failed) > 0 ? "Falhou" : "Passou";
    const duration = Number.isFinite(Number(value.durationMs))
      ? ` · ${formatDuration(value.durationMs)}`
      : "";
    return `${mark}: ${Number(value.passed)}/${Number(value.total)} testes` +
      `${Number(value.failed) ? ` · ${Number(value.failed)} falhas` : ""}${duration}`;
  }

  const entries = PRIORITY_FIELDS
    .filter(name => Object.hasOwn(value, name) && isCompact(value[name]))
    .slice(0, 7)
    .map(name => [labelFor(name), formatCompact(value[name])]
      .filter(Boolean).join(" "));
  if (entries.length) return entries.join(" · ");

  const fallback = Object.entries(value)
    .filter(([, item]) => isCompact(item))
    .slice(0, 5)
    .map(([name, item]) => `${name} ${formatCompact(item)}`);
  if (fallback.length) return fallback.join(" · ");
  return `${Object.keys(value).length} campos retornados`;
}

function isRuntimeTestResult(value) {
  return ["passed", "failed", "total"].every(name =>
    Number.isFinite(Number(value?.[name]))
  );
}

function formatDuration(value) {
  const milliseconds = Number(value);
  return milliseconds >= 1000
    ? `${(milliseconds / 1000).toFixed(milliseconds >= 10000 ? 1 : 2)} s`
    : `${Math.round(milliseconds)} ms`;
}

function isScalar(value) {
  return value === null || ["string", "number", "boolean"].includes(typeof value);
}

function isCompact(value) {
  return isScalar(value) || Array.isArray(value);
}

function formatScalar(value) {
  if (value === null) return "∅";
  return String(value);
}

function formatCompact(value) {
  if (!Array.isArray(value)) return formatScalar(value);
  if (value.length <= 3 && value.every(isScalar)) {
    return `[${value.map(formatScalar).join(", ")}]`;
  }
  return `[${value.length}]`;
}

function labelFor(name) {
  return {
    message: "",
    summary: "",
    status: "estado",
    changed: "alterado",
    reason: "motivo",
    id: "id",
    activeId: "ativo",
    count: "quantidade",
    selectedCount: "selecionados",
    passed: "passaram",
    failed: "falharam",
    total: "total",
    durationMs: "duração",
    ok: "ok",
    active: "ativo",
    mode: "modo",
    tool: "ferramenta",
    build: "build",
    channel: "canal"
  }[name] ?? name;
}
