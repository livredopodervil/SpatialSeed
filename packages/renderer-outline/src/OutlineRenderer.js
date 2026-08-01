import {
  buildResourceTree,
  parseResourcePath
} from "../../resource-tree/src/index.js?build=20260731-0044a";

export class OutlineRenderer {
  static apiVersion = "outline-renderer-v2";

  constructor(target, {
    maxObjects = 200,
    maxMembers = 128,
    maxStrokes = 128,
    maxVertices = 128,
    onActivate = null
  } = {}) {
    this.target = target;
    this.maxObjects = maxObjects;
    this.maxMembers = maxMembers;
    this.maxStrokes = maxStrokes;
    this.maxVertices = maxVertices;
    this.onActivate = typeof onActivate === "function" ? onActivate : null;
    this.resourceIndex = new Map();
    this.openPaths = new Set(["/"]);
    this.#bind();
  }

  update(region, sandbox, modules, state = sandbox.getSnapshot()) {
    this.#captureOpenPaths();
    const objects = state.objects ?? [];
    const visible = objects.slice(0, this.maxObjects);
    const omittedObjects = Math.max(0, objects.length - visible.length);
    const tree = buildResourceTree({
      objects: visible,
      maxMembers: this.maxMembers,
      maxStrokes: this.maxStrokes,
      maxVertices: this.maxVertices
    });
    this.resourceIndex.clear();
    indexTree(tree, this.resourceIndex);

    this.target.innerHTML = `
      <div class="region outline-status">
        <strong>${escapeHtml(region.descriptor.name)}</strong><br>
        versão autoritativa: ${region.version}<br>
        sandbox base: ${sandbox.baseVersion}<br>
        estado: ${sandbox.dirty ? "alterado" : "limpo"}
      </div>
      <div class="region resource-browser">
        <div class="resource-browser-header">
          <strong>Recursos (${objects.length})</strong>
          <input
            type="search"
            data-resource-filter
            placeholder="Filtrar nome, tipo ou caminho"
            aria-label="Filtrar recursos"
          >
        </div>
        <div class="resource-current-path" data-resource-current>/</div>
        <div class="resource-tree" role="tree">
          ${tree.children.map(node => this.#renderNode(node, 0)).join("")}
          ${omittedObjects
            ? `<div class="resource-omitted">… ${omittedObjects} objeto(s) fora da página atual</div>`
            : ""}
        </div>
      </div>
      <div class="region">
        <strong>Módulos</strong>
        ${modules.map(module => `
          <div class="object">
            ${escapeHtml(module.id)} — ${module.failed ? "falhou" : "ativo"}
          </div>
        `).join("")}
      </div>`;
  }

  #renderNode(node, depth) {
    const children = node.children ?? [];
    const path = String(node.path);
    const search = resourceSearchText(node);
    const button = `
      <button
        type="button"
        class="resource-node-button"
        data-resource-path="${escapeAttribute(path)}"
        data-owner-object-id="${escapeAttribute(node.ownerObjectId ?? "")}"
        style="--resource-depth:${depth}"
        title="${escapeAttribute(path)}"
      >
        <span class="resource-kind">${escapeHtml(resourceIcon(node.kind))}</span>
        <span class="resource-label">${escapeHtml(node.label)}</span>
        ${node.summary
          ? `<span class="resource-summary">${escapeHtml(node.summary)}</span>`
          : ""}
      </button>`;
    if (!children.length) {
      return `<div class="resource-leaf" data-resource-row data-search="${escapeAttribute(search)}">${button}</div>`;
    }
    const open = this.openPaths.has(path) || depth === 0;
    return `
      <details
        class="resource-branch"
        data-resource-row
        data-resource-branch="${escapeAttribute(path)}"
        data-search="${escapeAttribute(search)}"
        ${open ? "open" : ""}
      >
        <summary>${button}</summary>
        <div class="resource-children">
          ${children.map(child => this.#renderNode(child, depth + 1)).join("")}
        </div>
      </details>`;
  }

  #captureOpenPaths() {
    for (const details of this.target?.querySelectorAll?.(
      "details[data-resource-branch]"
    ) ?? []) {
      const path = details.dataset.resourceBranch;
      if (!path) continue;
      if (details.open) this.openPaths.add(path);
      else this.openPaths.delete(path);
    }
  }

  #bind() {
    this.target?.addEventListener?.("click", event => {
      const button = event.target?.closest?.("[data-resource-path]");
      if (!button || !this.target.contains(button)) return;
      const path = button.dataset.resourcePath;
      const node = this.resourceIndex.get(path) ?? null;
      const current = this.target.querySelector?.("[data-resource-current]");
      if (current) current.textContent = path;
      this.onActivate?.(Object.freeze({
        path,
        node,
        reference: parseResourcePath(path)
      }));
    });
    this.target?.addEventListener?.("input", event => {
      if (!event.target?.matches?.("[data-resource-filter]")) return;
      const query = String(event.target.value ?? "").trim().toLowerCase();
      for (const row of this.target.querySelectorAll?.("[data-resource-row]") ?? []) {
        row.hidden = Boolean(query) &&
          !String(row.dataset.search ?? "").includes(query);
      }
    });
    this.target?.addEventListener?.("toggle", event => {
      const details = event.target;
      if (!details?.matches?.("details[data-resource-branch]")) return;
      const path = details.dataset.resourceBranch;
      if (details.open) this.openPaths.add(path);
      else this.openPaths.delete(path);
    }, true);
  }
}

function indexTree(node, index) {
  if (node.path) index.set(String(node.path), node);
  for (const child of node.children ?? []) indexTree(child, index);
}

function resourceSearchText(node) {
  return [
    node.label,
    node.kind,
    node.path,
    node.summary,
    ...(node.children ?? []).map(resourceSearchText)
  ].join(" ").toLowerCase();
}

function resourceIcon(kind) {
  return ({
    group: "▣",
    "instance-family": "⠿",
    "family-member": "·",
    "stroke-bundle": "〰",
    stroke: "⌁",
    vertices: "⋮",
    vertex: "•",
    members: "⋮",
    strokes: "⋮",
    continuation: "…",
    camera: "◉",
    light: "✦"
  })[kind] ?? "◇";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("'", "&#39;");
}
