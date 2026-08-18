const DEFAULT_LIMIT = 80;
const MAX_LIMIT = 200;

export class ResourceSearchIndex {
  static apiVersion = "resource-search-index-v1";

  constructor({
    getObjects,
    getAssets = () => [],
    getRevision = () => 0
  } = {}) {
    if (typeof getObjects !== "function") {
      throw new TypeError("ResourceSearchIndex exige getObjects.");
    }
    if (typeof getAssets !== "function" || typeof getRevision !== "function") {
      throw new TypeError("Providers de recursos inválidos.");
    }
    this.getObjects = getObjects;
    this.getAssets = getAssets;
    this.getRevision = getRevision;
    this.revision = null;
    this.entries = Object.freeze([]);
    this.statistics = {
      rebuilds: 0,
      searches: 0,
      indexedObjects: 0,
      indexedAssets: 0
    };
  }

  search(query = "", { limit = DEFAULT_LIMIT } = {}) {
    this.#ensureIndex();
    this.statistics.searches += 1;
    const parsed = parseResourceSearchQuery(query);
    const ranked = [];
    for (const entry of this.entries) {
      const score = scoreEntry(entry, parsed);
      if (Number.isFinite(score)) ranked.push({ entry, score });
    }
    ranked.sort((left, right) =>
      right.score - left.score ||
      left.entry.label.localeCompare(right.entry.label, "pt-BR") ||
      left.entry.id.localeCompare(right.entry.id)
    );
    const normalizedLimit = Math.max(
      1,
      Math.min(MAX_LIMIT, Math.floor(Number(limit) || DEFAULT_LIMIT))
    );
    return Object.freeze({
      apiVersion: ResourceSearchIndex.apiVersion,
      query: String(query ?? ""),
      revision: this.revision,
      total: ranked.length,
      limit: normalizedLimit,
      items: Object.freeze(
        ranked.slice(0, normalizedLimit).map(item => item.entry)
      )
    });
  }

  status() {
    this.#ensureIndex();
    return Object.freeze({
      apiVersion: ResourceSearchIndex.apiVersion,
      revision: this.revision,
      entries: this.entries.length,
      statistics: Object.freeze({ ...this.statistics })
    });
  }

  #ensureIndex() {
    const revision = String(this.getRevision());
    if (revision === this.revision) return;
    const objects = Array.from(this.getObjects() ?? []);
    const assets = Array.from(this.getAssets() ?? []);
    this.entries = Object.freeze([
      ...objects.map(objectEntry).filter(Boolean),
      ...assets.map(assetEntry).filter(Boolean)
    ]);
    this.revision = revision;
    this.statistics.rebuilds += 1;
    this.statistics.indexedObjects = objects.length;
    this.statistics.indexedAssets = assets.length;
  }
}

export function parseResourceSearchQuery(query = "") {
  const filters = {};
  const terms = [];
  for (const token of tokenize(query)) {
    const separator = token.indexOf(":");
    if (separator > 0) {
      const key = normalize(token.slice(0, separator));
      const value = normalize(unquote(token.slice(separator + 1)));
      if (["type", "kind", "name", "id", "hidden", "category"].includes(key) && value) {
        (filters[key] ??= []).push(value);
        continue;
      }
    }
    const term = normalize(token);
    if (term) terms.push(term);
  }
  return Object.freeze({
    terms: Object.freeze(terms),
    filters: Object.freeze(Object.fromEntries(
      Object.entries(filters).map(([key, values]) => [key, Object.freeze(values)])
    ))
  });
}

function objectEntry(object) {
  if (!object?.id) return null;
  const id = String(object.id);
  const kind = String(object.kind ?? object.geometry?.type ?? "object");
  const geometryType = String(object.geometry?.type ?? "");
  const label = String(object.name ?? id);
  const hidden = object.hidden === true || object.visible === false;
  const types = new Set(["object", kind, geometryType].filter(Boolean));
  if (["tube", "stroke-bundle", "path", "curve", "polyline"].some(type =>
    kind.includes(type) || geometryType.includes(type)
  )) types.add("path");
  const path = `/objects/${encodeURIComponent(id)}`;
  const searchable = [
    label,
    id,
    kind,
    geometryType,
    path,
    object.parentId,
    object.appearanceId,
    hidden ? "hidden oculto" : "visible visivel"
  ].map(normalize).filter(Boolean);
  return freezeEntry({
    id,
    path,
    ownerObjectId: id,
    category: "object",
    kind,
    label,
    summary: [geometryType && geometryType !== kind ? geometryType : "", hidden ? "oculto" : ""]
      .filter(Boolean)
      .join(" · ") || kind,
    hidden,
    selectable: true,
    types: [...types],
    searchable
  });
}

function assetEntry(asset) {
  if (!asset?.id || !asset?.kind) return null;
  const id = String(asset.id);
  const kind = String(asset.kind);
  const metadata = asset.metadata && typeof asset.metadata === "object"
    ? asset.metadata
    : {};
  const label = String(metadata.label ?? metadata.name ?? `${kind} ${shortId(id)}`);
  const path = `/assets/${encodeURIComponent(kind)}/${encodeURIComponent(id)}`;
  return freezeEntry({
    id,
    path,
    ownerObjectId: null,
    category: "asset",
    kind,
    label,
    summary: `${asset.references ?? 0} referência(s) · ${formatBytes(asset.canonicalBytes)}`,
    hidden: false,
    selectable: false,
    types: ["asset", kind],
    searchable: [label, id, kind, path, metadata.description]
      .map(normalize)
      .filter(Boolean)
  });
}

function freezeEntry(entry) {
  return Object.freeze({
    ...entry,
    types: Object.freeze(entry.types),
    searchable: Object.freeze(entry.searchable)
  });
}

function scoreEntry(entry, parsed) {
  for (const [key, expected] of Object.entries(parsed.filters)) {
    const candidates = filterCandidates(entry, key);
    if (!expected.every(value => candidates.some(candidate => candidate.includes(value)))) {
      return Number.NEGATIVE_INFINITY;
    }
  }
  let score = entry.category === "object" ? 20 : 0;
  for (const term of parsed.terms) {
    const termScore = Math.max(
      ...entry.searchable.map(field => scoreField(field, term))
    );
    if (!Number.isFinite(termScore)) return Number.NEGATIVE_INFINITY;
    score += termScore;
  }
  return score;
}

function filterCandidates(entry, key) {
  if (key === "type") return entry.types.map(normalize);
  if (key === "kind") return [normalize(entry.kind)];
  if (key === "name") return [normalize(entry.label)];
  if (key === "id") return [normalize(entry.id)];
  if (key === "category") return [normalize(entry.category)];
  if (key === "hidden") return [String(entry.hidden)];
  return [];
}

function scoreField(field, term) {
  if (field === term) return 1000;
  if (field.startsWith(term)) return 800 - Math.min(200, field.length - term.length);
  const contained = field.indexOf(term);
  if (contained >= 0) return 600 - Math.min(250, contained * 4);
  let cursor = -1;
  let gaps = 0;
  for (const character of term) {
    const next = field.indexOf(character, cursor + 1);
    if (next < 0) return Number.NEGATIVE_INFINITY;
    gaps += next - cursor - 1;
    cursor = next;
  }
  return 300 - Math.min(250, gaps * 5);
}

function tokenize(query) {
  return String(query ?? "").match(/[^\s":]+:"[^"]*"|"[^"]*"|\S+/g)?.map(unquote) ?? [];
}

function unquote(value) {
  const source = String(value);
  return source.startsWith('"') && source.endsWith('"')
    ? source.slice(1, -1)
    : source;
}

function normalize(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .trim();
}

function shortId(id) {
  return String(id).length > 16 ? `${String(id).slice(0, 12)}…` : String(id);
}

function formatBytes(value) {
  const bytes = Math.max(0, Number(value) || 0);
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KiB`;
  return `${Math.round(bytes)} B`;
}
