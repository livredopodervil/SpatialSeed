const buildStatus = document.getElementById("build-status");

loadBuildStatus();

async function loadBuildStatus() {
  try {
    const response = await fetch("./apps/web/build-info.json", {
      cache: "no-store"
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const info = await response.json();
    buildStatus.replaceChildren(
      document.createTextNode("Aplicativo publicado: "),
      strong(info.build || "build não identificado"),
      document.createTextNode(info.channel ? ` · ${info.channel}` : "")
    );
  } catch (error) {
    buildStatus.textContent =
      "O build não pôde ser consultado; os links locais continuam disponíveis.";
  }
}

function strong(text) {
  const element = document.createElement("strong");
  element.textContent = text;
  return element;
}
