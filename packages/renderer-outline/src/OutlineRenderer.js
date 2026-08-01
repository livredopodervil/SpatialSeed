import {
  createVirtualResourceTree,
  parseResourcePath
} from "../../resource-tree/src/index.js?build=20260801-0045a";

export class OutlineRenderer {
  static apiVersion = "outline-renderer-v3";

  constructor(target, {
    pageSize = 100,
    resourceTree = null,
    onActivate = null,
    onEdit = null
  } = {}) {
    this.target = target;
    this.pageSize = normalizePageSize(pageSize);
    this.onActivate = typeof onActivate === "function" ? onActivate : null;
    this.onEdit = typeof onEdit === "function" ? onEdit : null;
    this.resourceIndex = new Map();
    this.openPaths = new Set(["/"]);
    this.tree = resourceTree;
    this.currentPath = "/";
    this.#bind();
  }

  update(region, sandbox, modules, state = sandbox.getSnapshot()) {
    this.#captureOpenPaths();
    if (!this.tree) {
      this.tree = createVirtualResourceTree({
        state,
        pageSize: this.pageSize
      });
    } else {
      this.tree.setState?.(state);
    }
    this.resourceIndex.clear();
    const rootPage = this.tree.listChildren("/", {
      offset: 0,
      limit: this.pageSize
    });

    this.target.innerHTML = `
      <div class="region outline-status">
        <strong>${escapeHtml(region.descriptor.name)}</strong><br>
        versão autoritativa: ${region.version}<br>
        sandbox base: ${sandbox.baseVersion}<br>
        estado: ${sandbox.dirty ? "alterado" : "limpo"}
      </div>
      <div class="region resource-browser">
        <div class="resource-browser-header">
          <strong>Recursos (${state.objects?.length ?? 0})</strong>
          <input
            type="search"
            data-resource-filter
            placeholder="Filtrar recursos carregados"
            aria-label="Filtrar recursos carregados"
          >
        </div>
        <div class="resource-current-path" data-resource-current>${escapeHtml(this.currentPath)}</div>
        <div class="resource-tree" role="tree" data-resource-root>
          ${rootPage.items.map(node => this.#renderNode(node, 0)).join("")}
          ${this.#renderContinuation("/", rootPage, 0)}
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

    for (const node of rootPage.items) this.resourceIndex.set(node.path, node);
    this.#restoreOpenTopLevel();
  }

  #renderNode(node, depth) {
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
    if (!node.hasChildren) {
      return `<div class="resource-leaf" data-resource-row data-search="${escapeAttribute(search)}">${button}</div>`;
    }
    return `
      <details
        class="resource-branch"
        data-resource-row
        data-resource-branch="${escapeAttribute(path)}"
        data-resource-depth="${depth}"
        data-search="${escapeAttribute(search)}"
        ${this.openPaths.has(path) ? "open" : ""}
      >
        <summary>${button}</summary>
        <div
          class="resource-children"
          data-resource-children="${escapeAttribute(path)}"
          data-loaded="false"
        ></div>
      </details>`;
  }

  #renderContinuation(path, page, depth) {
    if (page.nextOffset === null) return "";
    return `
      <button
        type="button"
        class="resource-node-button resource-continuation"
        data-resource-more="${escapeAttribute(path)}"
        data-resource-offset="${page.nextOffset}"
        data-resource-depth="${depth}"
        style="--resource-depth:${depth}"
      >
        <span class="resource-kind">…</span>
        <span class="resource-label">Carregar próximos ${Math.min(page.limit, page.total - page.nextOffset)}</span>
      </button>`;
  }

  #loadChildren(details, { reset = false } = {}) {
    if (!this.tree || !details) return;
    const path = details.dataset.resourceBranch;
    const container = details.querySelector(":scope > [data-resource-children]");
    if (!path || !container) return;
    if (!reset && container.dataset.loaded === "true") return;
    const depth = Number(details.dataset.resourceDepth ?? 0) + 1;
    const result = this.tree.listChildren(path, {
      offset: 0,
      limit: this.pageSize
    });
    container.innerHTML = result.items
      .map(node => this.#renderNode(node, depth))
      .join("") + this.#renderContinuation(path, result, depth);
    container.dataset.loaded = "true";
    for (const node of result.items) this.resourceIndex.set(node.path, node);
    for (const child of container.querySelectorAll?.(
      ":scope > details[data-resource-branch][open]"
    ) ?? []) {
      this.#loadChildren(child);
    }
  }

  #loadMore(button) {
    if (!this.tree || !button) return;
    const path = button.dataset.resourceMore;
    const offset = Number(button.dataset.resourceOffset ?? 0);
    const depth = Number(button.dataset.resourceDepth ?? 0);
    const result = this.tree.listChildren(path, {
      offset,
      limit: this.pageSize
    });
    const host = button.parentElement;
    if (!host) return;
    const fragment = document.createRange().createContextualFragment(
      result.items.map(node => this.#renderNode(node, depth)).join("") +
      this.#renderContinuation(path, result, depth)
    );
    for (const node of result.items) this.resourceIndex.set(node.path, node);
    host.insertBefore(fragment, button);
    button.remove();
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

  #restoreOpenTopLevel() {
    for (const details of this.target?.querySelectorAll?.(
      "details[data-resource-branch][open]"
    ) ?? []) {
      this.#loadChildren(details);
    }
  }

  #bind() {
    this.target?.addEventListener?.("click", event => {
      const more = event.target?.closest?.("[data-resource-more]");
      if (more && this.target.contains(more)) {
        this.#loadMore(more);
        return;
      }
      const button = event.target?.closest?.("[data-resource-path]");
      if (!button || !this.target.contains(button)) return;
      const path = button.dataset.resourcePath;
      const node = this.resourceIndex.get(path) ?? this.tree?.describe(path) ?? null;
      if (node) this.resourceIndex.set(path, node);
      this.currentPath = path;
      const current = this.target.querySelector?.("[data-resource-current]");
      if (current) current.textContent = path;
      this.onActivate?.(Object.freeze({
        path,
        node,
        reference: parseResourcePath(path)
      }));
    });

    this.target?.addEventListener?.("dblclick", event => {
      const button = event.target?.closest?.("[data-resource-path]");
      if (!button || !this.target.contains(button) || !this.onEdit) return;
      const path = button.dataset.resourcePath;
      const node = this.resourceIndex.get(path) ?? this.tree?.describe(path) ?? null;
      this.onEdit(Object.freeze({
        path,
        node,
        reference: parseResourcePath(path),
        readValue: property => this.tree?.readValue(path, property)
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
      if (details.open) {
        this.openPaths.add(path);
        this.#loadChildren(details);
      } else {
        this.openPaths.delete(path);
      }
    }, true);
  }
}

function normalizePageSize(value) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1 || number > 1000) {
    throw new RangeError("pageSize deve estar entre 1 e 1000.");
  }
  return number;
}

function resourceSearchText(node) {
  return [node.label, node.kind, node.path, node.summary]
    .join(" ")
    .toLowerCase();
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
