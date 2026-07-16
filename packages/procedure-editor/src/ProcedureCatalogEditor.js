const DEFAULT_FONT_SIZE = 14;
const MIN_FONT_SIZE = 10;
const MAX_FONT_SIZE = 28;
const FONT_STORAGE_KEY = "spatialseed.procedure-editor.v1";

export class ProcedureCatalogEditor {
  constructor({
    root,
    catalog,
    storage = safeLocalStorage(root?.ownerDocument?.defaultView),
    confirm = message => root.ownerDocument.defaultView.confirm(message)
  } = {}) {
    if (!root || typeof root.querySelector !== "function") {
      throw new TypeError("Editor de procedimentos exige elemento raiz.");
    }
    if (
      !catalog ||
      typeof catalog.list !== "function" ||
      typeof catalog.define !== "function"
    ) {
      throw new TypeError("Catálogo de procedimentos incompatível.");
    }

    this.root = root;
    this.catalog = catalog;
    this.storage = storage;
    this.confirm = confirm;
    this.selectedName = null;
    this.dirty = false;
    this.disposers = [];
    this.resizeObserver = null;
    this.fontSize = readFontSize(storage);

    this.#build();
    this.#bind();
    this.#applyFontSize();
    this.refresh();
  }

  refresh({ preserveSelection = true } = {}) {
    const preferred = preserveSelection ? this.selectedName : null;
    const procedures = this.catalog.list();
    const select = this.elements.select;

    select.replaceChildren();
    const placeholder = select.ownerDocument.createElement("option");
    placeholder.value = "";
    placeholder.textContent = procedures.length
      ? "Selecione um procedimento"
      : "Catálogo vazio";
    select.append(placeholder);

    for (const procedure of procedures) {
      const option = select.ownerDocument.createElement("option");
      option.value = procedure.name;
      option.textContent = procedure.name;
      select.append(option);
    }

    if (preferred && procedures.some(item => item.name === preferred)) {
      select.value = preferred;
      if (!this.dirty) {
        const record = this.catalog.get(preferred);
        this.elements.name.value = record.name;
        this.elements.source.value = record.source;
      }
    } else if (!preserveSelection || (
      this.selectedName &&
      !procedures.some(item => item.name === this.selectedName)
    )) {
      this.selectedName = null;
      this.elements.name.value = "";
      this.elements.source.value = "";
      this.dirty = false;
    }

    this.#renderSource();
    return this.snapshot();
  }

  snapshot() {
    return Object.freeze({
      selectedName: this.selectedName,
      dirty: this.dirty,
      fontSize: this.fontSize,
      logicalLines: logicalLineCount(this.elements.source.value),
      catalog: this.catalog.snapshot()
    });
  }

  dispose() {
    for (const dispose of this.disposers.splice(0)) dispose();
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
  }

  #build() {
    this.root.innerHTML = [
      '<div class="ss-procedure-editor">',
      '  <div class="ss-procedure-editor-toolbar">',
      '    <select data-role="procedure-select" aria-label="Procedimento"></select>',
      '    <button type="button" data-action="new">Novo</button>',
      '    <button type="button" data-action="save">Salvar</button>',
      '    <button type="button" data-action="delete">Excluir</button>',
      '    <button type="button" data-action="refresh">Atualizar</button>',
      '  </div>',
      '  <div class="ss-procedure-editor-metadata">',
      '    <label>Nome <input data-role="procedure-name" autocomplete="off"></label>',
      '    <span class="ss-procedure-font-controls">',
      '      <span>Fonte</span>',
      '      <button type="button" data-action="font-down" aria-label="Diminuir fonte">−</button>',
      '      <output data-role="font-size"></output>',
      '      <button type="button" data-action="font-up" aria-label="Aumentar fonte">+</button>',
      '    </span>',
      '  </div>',
      '  <div class="ss-code-editor" data-role="code-editor">',
      '    <div class="ss-code-gutter" aria-hidden="true"><div data-role="line-numbers"></div></div>',
      '    <div class="ss-code-stack">',
      '      <pre class="ss-code-highlight" aria-hidden="true"><code data-role="highlight"></code></pre>',
      '      <textarea data-role="source" wrap="soft" spellcheck="false"',
      '        autocapitalize="off" autocomplete="off" aria-label="Código-fonte do procedimento"></textarea>',
      '    </div>',
      '  </div>',
      '  <div class="ss-procedure-editor-status" data-role="status" aria-live="polite"></div>',
      '</div>'
    ].join("\n");

    const find = selector => this.root.querySelector(selector);
    this.elements = {
      select: find('[data-role="procedure-select"]'),
      name: find('[data-role="procedure-name"]'),
      source: find('[data-role="source"]'),
      highlight: find('[data-role="highlight"]'),
      numbers: find('[data-role="line-numbers"]'),
      fontSize: find('[data-role="font-size"]'),
      status: find('[data-role="status"]'),
      stack: find(".ss-code-stack")
    };
  }

  #bind() {
    this.#listen(this.elements.source, "input", () => {
      this.dirty = true;
      this.#renderSource();
      this.#status("Alterações ainda não salvas.");
    });
    this.#listen(this.elements.source, "scroll", () =>
      this.#syncScroll()
    );
    this.#listen(this.elements.name, "input", () => {
      this.dirty = true;
      this.#status("Alterações ainda não salvas.");
    });
    this.#listen(this.elements.select, "change", event =>
      this.#select(event.target.value)
    );

    for (const button of this.root.querySelectorAll("button[data-action]")) {
      this.#listen(button, "click", () => {
        const actions = {
          new: () => this.#newProcedure(),
          save: () => this.#save(),
          delete: () => this.#delete(),
          refresh: () => this.refresh(),
          "font-down": () => this.#setFontSize(this.fontSize - 1),
          "font-up": () => this.#setFontSize(this.fontSize + 1)
        };
        actions[button.dataset.action]?.();
      });
    }

    const ResizeObserverClass =
      this.root.ownerDocument.defaultView.ResizeObserver;
    if (typeof ResizeObserverClass === "function") {
      this.resizeObserver = new ResizeObserverClass(() =>
        this.#measureLogicalLines()
      );
      this.resizeObserver.observe(this.elements.stack);
    }
  }

  #listen(target, type, listener) {
    target.addEventListener(type, listener);
    this.disposers.push(() => target.removeEventListener(type, listener));
  }

  #select(name) {
    if (name === this.selectedName) return;
    if (!this.#mayDiscardChanges()) {
      this.elements.select.value = this.selectedName ?? "";
      return;
    }
    if (!name) {
      this.#clearEditor();
      return;
    }

    const record = this.catalog.get(name);
    this.selectedName = record.name;
    this.elements.name.value = record.name;
    this.elements.source.value = record.source;
    this.dirty = false;
    this.#renderSource();
    this.#status(`Procedimento ${record.name} carregado.`);
  }

  #newProcedure() {
    if (!this.#mayDiscardChanges()) return;
    this.#clearEditor();
    this.elements.name.focus();
    this.#status("Novo procedimento.");
  }

  #save() {
    try {
      const result = this.catalog.define(
        this.elements.name.value,
        this.elements.source.value,
        { replace: true }
      );
      this.selectedName = result.procedure.name;
      this.dirty = false;
      this.refresh();
      this.elements.select.value = this.selectedName;
      this.#status(
        result.changed
          ? `Procedimento ${this.selectedName} salvo.`
          : `Procedimento ${this.selectedName} já estava atualizado.`
      );
    } catch (error) {
      this.#status(error?.message ?? String(error), { error: true });
    }
  }

  #delete() {
    const name = this.selectedName || this.elements.name.value.trim();
    if (!name) {
      this.#status("Nenhum procedimento selecionado.", { error: true });
      return;
    }
    if (!this.confirm(`Excluir o procedimento ${name}?`)) return;

    try {
      const result = this.catalog.remove(name);
      this.#clearEditor();
      this.refresh({ preserveSelection: false });
      this.#status(
        result.changed
          ? `Procedimento ${name} excluído.`
          : `Procedimento ${name} não existia.`
      );
    } catch (error) {
      this.#status(error?.message ?? String(error), { error: true });
    }
  }

  #clearEditor() {
    this.selectedName = null;
    this.elements.select.value = "";
    this.elements.name.value = "";
    this.elements.source.value = "";
    this.dirty = false;
    this.#renderSource();
  }

  #mayDiscardChanges() {
    return !this.dirty || this.confirm(
      "Descartar alterações ainda não salvas?"
    );
  }

  #setFontSize(value) {
    this.fontSize = clampEditorFontSize(value);
    this.#applyFontSize();
    writeFontSize(this.storage, this.fontSize);
    this.#renderSource();
  }

  #applyFontSize() {
    this.root.style.setProperty(
      "--ss-procedure-editor-font-size",
      `${this.fontSize}px`
    );
    this.elements.fontSize.value = `${this.fontSize}px`;
    this.elements.fontSize.textContent = `${this.fontSize}px`;
  }

  #renderSource() {
    const source = this.elements.source.value;
    this.elements.highlight.innerHTML = highlightProcedureSource(source);
    this.elements.numbers.innerHTML = Array.from(
      { length: logicalLineCount(source) },
      (_, index) => `<span>${index + 1}</span>`
    ).join("");
    this.#syncScroll();
    this.root.ownerDocument.defaultView.requestAnimationFrame?.(() =>
      this.#measureLogicalLines()
    );
  }

  #measureLogicalLines() {
    this.elements.highlight.parentElement.style.width =
      `${this.elements.source.clientWidth}px`;
    const lines = this.elements.highlight.querySelectorAll(
      ".ss-code-line"
    );
    const numbers = this.elements.numbers.children;

    for (let index = 0; index < numbers.length; index += 1) {
      const height = lines[index]?.getBoundingClientRect().height;
      numbers[index].style.height = `${Math.max(1, height || 0)}px`;
    }
  }

  #syncScroll() {
    const { scrollTop, scrollLeft } = this.elements.source;
    this.elements.highlight.style.transform =
      `translate(${-scrollLeft}px, ${-scrollTop}px)`;
    this.elements.numbers.style.transform =
      `translateY(${-scrollTop}px)`;
  }

  #status(message, { error = false } = {}) {
    this.elements.status.textContent = message;
    this.elements.status.dataset.error = error ? "true" : "false";
  }
}

export function logicalLineCount(source) {
  return String(source ?? "").split(/\r?\n/).length;
}

export function clampEditorFontSize(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return DEFAULT_FONT_SIZE;
  return Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, Math.round(number)));
}

export function highlightProcedureSource(source) {
  return String(source ?? "")
    .split(/\r?\n/)
    .map(line =>
      `<span class="ss-code-line">${highlightLine(line) || "&#8203;"}</span>`
    )
    .join("");
}

function highlightLine(line) {
  const pattern = /(\/\/.*$|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b(?:const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|new|class|extends|throw|try|catch|finally|typeof|instanceof|in|of|true|false|null|undefined|async|await)\b|\b(?:0[xob][0-9a-f]+|\d+(?:\.\d+)?(?:e[+-]?\d+)?)\b)/gi;
  let html = "";
  let cursor = 0;

  for (const match of line.matchAll(pattern)) {
    html += escapeHtml(line.slice(cursor, match.index));
    const token = match[0];
    const kind = token.startsWith("//")
      ? "comment"
      : /^["'`]/.test(token)
        ? "string"
        : /^\d|^0[xob]/i.test(token)
          ? "number"
          : "keyword";
    html += `<span class="ss-token-${kind}">${escapeHtml(token)}</span>`;
    cursor = match.index + token.length;
  }

  return html + escapeHtml(line.slice(cursor));
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function safeLocalStorage(windowRef) {
  try {
    return windowRef?.localStorage ?? null;
  } catch {
    return null;
  }
}

function readFontSize(storage) {
  try {
    const state = JSON.parse(storage?.getItem(FONT_STORAGE_KEY) || "{}");
    return clampEditorFontSize(state.fontSize);
  } catch {
    return DEFAULT_FONT_SIZE;
  }
}

function writeFontSize(storage, fontSize) {
  try {
    storage?.setItem(FONT_STORAGE_KEY, JSON.stringify({ fontSize }));
  } catch {}
}
