export function composeToolbar({ root = document, configuration }) {
  const toolbar = root.getElementById("toolbar");
  if (!toolbar || !configuration) return Object.freeze({ dispose() {} });
  const ownerDocument = toolbar.ownerDocument;

  const configured = new Set([
    ...configuration.primary,
    ...configuration.menus.flatMap(menu => menu.items),
    ...configuration.hidden
  ]);
  const find = id => {
    const element = root.getElementById(id);
    if (!element) throw new Error(`Controle de UI ausente: #${id}.`);
    return element;
  };

  toolbar.querySelectorAll(":scope > .toolbar-divider").forEach(node => node.remove());
  for (const id of configuration.hidden) find(id).hidden = true;
  for (const id of configuration.primary) toolbar.append(find(id));

  const createdMenus = [];
  for (const description of configuration.menus) {
    const details = ownerDocument.createElement("details");
    details.className = "ss-toolbar-menu";
    details.dataset.menu = description.id;

    const summary = ownerDocument.createElement("summary");
    summary.textContent = description.label;
    const content = ownerDocument.createElement("div");
    content.className = "ss-toolbar-menu-content";
    for (const id of description.items) content.append(find(id));

    details.append(summary, content);
    toolbar.append(details);
    createdMenus.push(details);
  }

  const fallback = [...toolbar.children].filter(element =>
    (element.matches("button,select") && element.id && !configured.has(element.id))
  );
  if (fallback.length) {
    const details = ownerDocument.createElement("details");
    details.className = "ss-toolbar-menu";
    const summary = ownerDocument.createElement("summary");
    summary.textContent = "Mais";
    const content = ownerDocument.createElement("div");
    content.className = "ss-toolbar-menu-content";
    content.append(...fallback);
    details.append(summary, content);
    toolbar.append(details);
    createdMenus.push(details);
  }

  const fileInput = root.getElementById("project-file-input");
  const status = root.getElementById("status");
  if (fileInput) toolbar.append(fileInput);
  if (status) toolbar.append(status);

  const closeOtherMenus = event => {
    const current = event.target.closest(".ss-toolbar-menu");
    for (const menu of createdMenus) {
      if (menu !== current) menu.open = false;
    }
  };
  const closeAfterCommand = event => {
    if (event.target.closest("button")) {
      event.target.closest(".ss-toolbar-menu")?.removeAttribute("open");
    }
  };
  toolbar.addEventListener("toggle", closeOtherMenus, true);
  toolbar.addEventListener("click", closeAfterCommand);
  const updateClearance = () => {
    const bottom = Math.ceil(toolbar.getBoundingClientRect().bottom + 8);
    ownerDocument.documentElement.style.setProperty(
      "--ss-toolbar-clearance",
      `${bottom}px`
    );
    ownerDocument.dispatchEvent(new ownerDocument.defaultView.CustomEvent(
      "spatialseed:toolbar-layout",
      { detail: { clearance: bottom } }
    ));
  };
  const resizeObserver = typeof ResizeObserver === "function"
    ? new ResizeObserver(updateClearance)
    : null;
  resizeObserver?.observe(toolbar);
  updateClearance();

  return Object.freeze({
    dispose() {
      resizeObserver?.disconnect();
      toolbar.removeEventListener("toggle", closeOtherMenus, true);
      toolbar.removeEventListener("click", closeAfterCommand);
    }
  });
}
