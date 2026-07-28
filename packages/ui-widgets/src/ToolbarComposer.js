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
  const layoutSelect = find("toolbar-layout");
  const dragHandle = ownerDocument.createElement("button");
  dragHandle.type = "button";
  dragHandle.className = "ss-toolbar-drag-handle";
  dragHandle.textContent = "⠿";
  dragHandle.title = "Mover barra flutuante";
  dragHandle.setAttribute("aria-label", "Mover barra flutuante");
  toolbar.append(dragHandle);
  if (fileInput) toolbar.append(fileInput);
  if (status) toolbar.append(status);

  const positionMenu = menu => {
    if (!menu?.open) return;
    const content = menu.querySelector(":scope > .ss-toolbar-menu-content");
    const summary = menu.querySelector(":scope > summary");
    if (!content || !summary) return;
    const view = ownerDocument.defaultView;
    const margin = 4;
    content.dataset.viewportPositioned = "true";
    content.style.visibility = "hidden";
    content.style.left = "0px";
    content.style.right = "auto";
    content.style.bottom = "auto";
    content.style.top = "0px";
    const summaryRect = summary.getBoundingClientRect();
    const contentRect = content.getBoundingClientRect();
    const width = Math.min(contentRect.width, Math.max(0, view.innerWidth - margin * 2));
    const height = Math.min(contentRect.height, Math.max(0, view.innerHeight - margin * 2));
    let left = clamp(summaryRect.left, margin, Math.max(margin, view.innerWidth - width - margin));
    let top = summaryRect.bottom + 6;
    if (top + height > view.innerHeight - margin) {
      const above = summaryRect.top - height - 6;
      top = above >= margin
        ? above
        : clamp(top, margin, Math.max(margin, view.innerHeight - height - margin));
    }
    content.style.left = `${left}px`;
    content.style.top = `${top}px`;
    content.style.maxWidth = `${Math.max(0, view.innerWidth - margin * 2)}px`;
    content.style.maxHeight = `${Math.max(0, view.innerHeight - margin * 2)}px`;
    content.style.visibility = "";
  };
  const closeOtherMenus = event => {
    const current = event.target.closest(".ss-toolbar-menu");
    for (const menu of createdMenus) {
      if (menu !== current) menu.open = false;
    }
    if (current?.open) requestAnimationFrame(() => positionMenu(current));
  };
  const repositionMenus = () => {
    for (const menu of createdMenus) positionMenu(menu);
  };
  toolbar.addEventListener("toggle", closeOtherMenus, true);
  ownerDocument.defaultView.addEventListener("resize", repositionMenus);
  ownerDocument.defaultView.addEventListener("scroll", repositionMenus, true);

  const readToolbarState = () => {
    try {
      return JSON.parse(
        ownerDocument.defaultView.localStorage.getItem(
          configuration.storageKey
        ) || "{}"
      );
    } catch {
      return {};
    }
  };
  const saveToolbarState = patch => {
    try {
      ownerDocument.defaultView.localStorage.setItem(
        configuration.storageKey,
        JSON.stringify({ ...readToolbarState(), ...patch })
      );
    } catch {}
  };
  const updateClearance = () => {
    const rectangle = toolbar.getBoundingClientRect();
    const layout = toolbar.dataset.layout;
    const clearance = layout === "horizontal"
      ? Math.ceil(rectangle.bottom + 8)
      : 8;
    const leftClearance = layout === "vertical"
      ? Math.ceil(rectangle.right + 8)
      : 8;
    ownerDocument.documentElement.style.setProperty(
      "--ss-toolbar-clearance",
      `${clearance}px`
    );
    ownerDocument.documentElement.style.setProperty(
      "--ss-toolbar-left-clearance",
      `${leftClearance}px`
    );
    ownerDocument.dispatchEvent(new ownerDocument.defaultView.CustomEvent(
      "spatialseed:toolbar-layout",
      { detail: { clearance, leftClearance } }
    ));
  };
  const applyLayout = (layout, { persist = true } = {}) => {
    const allowed = ["horizontal", "vertical", "floating"];
    const next = allowed.includes(layout) ? layout : configuration.layout;
    toolbar.dataset.layout = next;
    ownerDocument.documentElement.dataset.toolbarLayout = next;
    layoutSelect.value = next;

    if (next === "floating") {
      const state = readToolbarState();
      toolbar.style.left = `${Number.isFinite(state.left) ? state.left : 8}px`;
      toolbar.style.top = `${Number.isFinite(state.top) ? state.top : 8}px`;
      toolbar.style.right = "auto";
      toolbar.style.bottom = "auto";
    } else {
      toolbar.style.left = "";
      toolbar.style.top = "";
      toolbar.style.right = "";
      toolbar.style.bottom = "";
    }

    if (persist) saveToolbarState({ layout: next });
    updateClearance();
  };
  const onLayoutChange = event => {
    applyLayout(event.target.value);
  };
  layoutSelect.addEventListener("change", onLayoutChange);

  const drag = event => {
    if (toolbar.dataset.layout !== "floating") return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.preventDefault();
    const rectangle = toolbar.getBoundingClientRect();
    const origin = {
      x:event.clientX,
      y:event.clientY,
      left:rectangle.left,
      top:rectangle.top
    };
    dragHandle.setPointerCapture?.(event.pointerId);

    const move = current => {
      const left = clamp(
        origin.left + current.clientX - origin.x,
        0,
        Math.max(0, ownerDocument.defaultView.innerWidth - toolbar.offsetWidth)
      );
      const top = clamp(
        origin.top + current.clientY - origin.y,
        0,
        Math.max(0, ownerDocument.defaultView.innerHeight - toolbar.offsetHeight)
      );
      toolbar.style.left = `${left}px`;
      toolbar.style.top = `${top}px`;
    };
    const end = current => {
      dragHandle.releasePointerCapture?.(current.pointerId);
      dragHandle.removeEventListener("pointermove", move);
      dragHandle.removeEventListener("pointerup", end);
      dragHandle.removeEventListener("pointercancel", end);
      const finalRectangle = toolbar.getBoundingClientRect();
      saveToolbarState({
        left:Math.round(finalRectangle.left),
        top:Math.round(finalRectangle.top)
      });
    };
    dragHandle.addEventListener("pointermove", move);
    dragHandle.addEventListener("pointerup", end);
    dragHandle.addEventListener("pointercancel", end);
  };
  dragHandle.addEventListener("pointerdown", drag);

  const resizeObserver = typeof ownerDocument.defaultView.ResizeObserver === "function"
    ? new ownerDocument.defaultView.ResizeObserver(updateClearance)
    : null;
  resizeObserver?.observe(toolbar);
  const storedLayout = readToolbarState().layout;
  applyLayout(storedLayout ?? configuration.layout, { persist:false });

  return Object.freeze({
    dispose() {
      resizeObserver?.disconnect();
      layoutSelect.removeEventListener("change", onLayoutChange);
      dragHandle.removeEventListener("pointerdown", drag);
      toolbar.removeEventListener("toggle", closeOtherMenus, true);
      ownerDocument.defaultView.removeEventListener("resize", repositionMenus);
      ownerDocument.defaultView.removeEventListener("scroll", repositionMenus, true);
    }
  });
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}
