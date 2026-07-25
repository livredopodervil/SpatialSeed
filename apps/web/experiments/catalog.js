const catalogElement = document.getElementById("catalog");
const summaryElement = document.getElementById("catalog-summary");
const template = document.getElementById("experiment-card-template");
const filterButtons = [...document.querySelectorAll("[data-filter]")];
let entries = [];
let activeFilter = "all";

const statusLabels = {
  maintained: "Mantido",
  historical: "Histórico",
  diagnostic: "Diagnóstico"
};

const offlineLabels = {
  "app-cache": "PWA do aplicativo",
  "local-assets": "Recursos locais; fora do cache PWA",
  "network-required": "Rede necessária"
};

loadCatalog();

for (const button of filterButtons) {
  button.addEventListener("click", () => {
    activeFilter = button.dataset.filter;
    for (const candidate of filterButtons) {
      candidate.classList.toggle("active", candidate === button);
    }
    applyFilter();
  });
}

async function loadCatalog() {
  try {
    const response = await fetch("./catalog.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    if (!Array.isArray(payload.entries)) {
      throw new TypeError("O manifesto não contém uma lista de experimentos.");
    }
    entries = payload.entries;
    renderCatalog();
  } catch (error) {
    summaryElement.textContent = "Falha ao carregar o catálogo";
    const message = document.createElement("p");
    message.className = "catalog-error";
    message.textContent =
      `O catálogo não pôde ser carregado: ${error.message}`;
    catalogElement.replaceChildren(message);
  }
}

function renderCatalog() {
  const fragment = document.createDocumentFragment();
  for (const entry of entries) {
    const card = template.content.firstElementChild.cloneNode(true);
    card.dataset.status = entry.status;
    card.dataset.entryId = entry.id;

    const badges = card.querySelector(".card-badges");
    badges.append(badge(statusLabels[entry.status] || entry.status, entry.status));
    badges.append(badge(entry.kind === "integrated" ? "Integrado" : "Independente"));
    if (entry.offline === "network-required") {
      badges.append(badge("Rede", "network"));
    }

    card.querySelector("h2").textContent = entry.title;
    card.querySelector(".summary").textContent = entry.summary;
    card.querySelector(".offline").textContent =
      offlineLabels[entry.offline] || entry.offline;
    card.querySelector(".dependencies").textContent =
      entry.externalDependencies.length
        ? `${entry.externalDependencies.length} declarada(s)`
        : "Nenhuma";

    const issues = card.querySelector(".issues");
    if (entry.knownIssues.length) {
      const heading = document.createElement("strong");
      heading.textContent = "Limites conhecidos";
      const list = document.createElement("ul");
      for (const issue of entry.knownIssues) {
        const item = document.createElement("li");
        item.textContent = issue;
        list.append(item);
      }
      issues.append(heading, list);
    } else {
      issues.textContent = "Nenhum limite específico registrado neste catálogo.";
    }

    const link = card.querySelector(".open-experiment");
    link.href = entry.path;
    link.textContent =
      entry.kind === "integrated"
        ? "Abrir editor e usar Explorar →"
        : "Abrir protótipo →";
    fragment.append(card);
  }
  catalogElement.replaceChildren(fragment);
  applyFilter();
}

function applyFilter() {
  let visible = 0;
  for (const card of catalogElement.querySelectorAll(".experiment-card")) {
    const show = activeFilter === "all" || card.dataset.status === activeFilter;
    card.hidden = !show;
    if (show) visible += 1;
  }
  summaryElement.textContent =
    `${visible} de ${entries.length} entradas visíveis`;
}

function badge(label, variant = "") {
  const element = document.createElement("span");
  element.className = `badge${variant ? ` badge-${variant}` : ""}`;
  element.textContent = label;
  return element;
}
