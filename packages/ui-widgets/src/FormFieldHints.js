export function attachFormFieldHints(root = document) {
  if (!root?.querySelectorAll) return () => {};

  const apply = scope => {
    const labels = scope.matches?.("label")
      ? [scope]
      : [...scope.querySelectorAll?.("label") ?? []];
    for (const label of labels) decorateLabel(label);
  };

  apply(root.documentElement ?? root);
  const ViewMutationObserver = root.defaultView?.MutationObserver ?? globalThis.MutationObserver;
  if (!ViewMutationObserver) return () => {};
  const target = root.body ?? root.documentElement ?? root;
  const observer = new ViewMutationObserver(records => {
    for (const record of records) {
      for (const node of record.addedNodes ?? []) {
        if (node?.nodeType === 1) apply(node);
      }
    }
  });
  observer.observe(target, { childList: true, subtree: true });
  return () => observer.disconnect();
}

function decorateLabel(label) {
  const control = label.querySelector?.("input, select, textarea");
  if (!control || control.type === "hidden") return;
  const explicit = String(
    control.dataset?.help ?? label.dataset?.help ?? label.getAttribute("title") ?? control.getAttribute("title") ?? ""
  ).trim();
  const name = labelText(label, control);
  const parameters = parameterHelp(control);
  const help = [explicit || name, parameters].filter(Boolean).join(" · ");
  if (!help) return;
  label.title = help;
  if (!control.title) control.title = help;
  if (!control.getAttribute("aria-description")) {
    control.setAttribute("aria-description", help);
  }
}

function labelText(label, control) {
  const clone = label.cloneNode(true);
  for (const nested of clone.querySelectorAll?.("input, select, textarea, button") ?? []) {
    nested.remove();
  }
  return clone.textContent.replace(/\s+/g, " ").trim() || control.getAttribute("aria-label") || "Campo";
}

function parameterHelp(control) {
  if (control.tagName === "SELECT") {
    const options = [...control.options].map(option => option.textContent.trim()).filter(Boolean);
    return options.length ? `Opções: ${options.join("; ")}` : "";
  }
  if (control.type === "checkbox" || control.type === "radio" || control.type === "color") return "";
  const parts = [];
  if (control.min !== "") parts.push(`mín. ${control.min}`);
  if (control.max !== "") parts.push(`máx. ${control.max}`);
  if (control.step && control.step !== "any") parts.push(`passo ${control.step}`);
  return parts.length ? `Parâmetros: ${parts.join(", ")}` : "";
}
