const DEFAULT_STORAGE_KEY = "spatialseed.viewer.render.v1";

export class ViewerRenderPanel {
  #root;
  #query;
  #execute;
  #storage;
  #storageKey;
  #listeners = [];

  constructor({
    root,
    query,
    execute,
    storage = safeLocalStorage(),
    storageKey = DEFAULT_STORAGE_KEY
  }) {
    if (!root) throw new TypeError("ViewerRenderPanel exige root.");
    if (typeof query !== "function") {
      throw new TypeError("ViewerRenderPanel exige query.");
    }
    if (typeof execute !== "function") {
      throw new TypeError("ViewerRenderPanel exige execute.");
    }

    this.#root = root;
    this.#query = query;
    this.#execute = execute;
    this.#storage = storage;
    this.#storageKey = storageKey;
    this.#renderShell();
    this.#bind();
    this.#loadInitialSettings();
  }

  refresh() {
    const settings = this.#query("viewer.render.settings");
    this.#write(settings);
    this.#status("Configuração local atualizada.");
    return settings;
  }

  dispose() {
    for (const dispose of this.#listeners.splice(0)) dispose();
    this.#root.replaceChildren();
    return true;
  }

  #renderShell() {
    const presets = this.#query("viewer.render.presets");
    this.#root.innerHTML = `
      <div class="ss-viewer-render-content">
        <p>
          Estas opções pertencem somente a este viewer e não alteram o arquivo
          do projeto nem os outros viewers.
        </p>
        <label class="ss-render-field">
          <span>Preset</span>
          <select data-render-preset>
            ${presets.map(item =>
              `<option value="${escapeHtml(item.id)}">${escapeHtml(item.label)}</option>`
            ).join("")}
          </select>
        </label>
        <div class="actions">
          <button type="button" data-render-apply-preset>Aplicar preset</button>
          <button type="button" data-render-apply>Aplicar campos</button>
          <button type="button" data-render-reset>Restaurar padrão</button>
        </div>

        <details open>
          <summary>Qualidade, fundo e tone mapping</summary>
          <div class="ss-render-fields">
            ${field("quality.pixelRatioCap", "Limite pixel ratio", "number", { min:0.5,max:3,step:0.1 })}
            ${field("quality.transmissionResolutionScale", "Escala da transmissão", "number", { min:0.1,max:1,step:0.05 })}
            ${selectField("toneMapping.mode", "Tone mapping", [
              ["none","Nenhum"],["linear","Linear"],["reinhard","Reinhard"],
              ["cineon","Cineon"],["aces","ACES Filmic"],["agx","AgX"],
              ["neutral","Neutral"]
            ])}
            ${field("toneMapping.exposure", "Exposição", "number", { min:0.01,max:20,step:0.05 })}
            ${field("background.color", "Cor do fundo", "color")}
          </div>
        </details>

        <details open>
          <summary>Ambiente e reflexos</summary>
          <div class="ss-render-fields">
            ${checkField("environment.enabled", "Ativar ambiente PMREM")}
            ${selectField("environment.preset", "Ambiente", [
              ["studio-blue","Estúdio azul"],
              ["studio-neutral","Estúdio neutro"],
              ["studio-warm","Estúdio quente"]
            ])}
            ${field("environment.intensity", "Intensidade do ambiente", "number", { min:0,max:20,step:0.05 })}
            ${checkField("environment.background", "Usar ambiente como fundo")}
            ${field("environment.backgroundBlur", "Desfoque do fundo", "number", { min:0,max:1,step:0.05 })}
            ${field("environment.backgroundIntensity", "Intensidade do fundo", "number", { min:0,max:20,step:0.05 })}
          </div>
        </details>

        <details open>
          <summary>Luzes</summary>
          <div class="ss-render-fields">
            ${checkField("lighting.hemisphere.enabled", "Luz hemisférica")}
            ${field("lighting.hemisphere.skyColor", "Cor do céu", "color")}
            ${field("lighting.hemisphere.groundColor", "Cor do chão", "color")}
            ${field("lighting.hemisphere.intensity", "Intensidade hemisférica", "number", { min:0,max:100,step:0.1 })}
            ${checkField("lighting.directional.enabled", "Luz direcional")}
            ${field("lighting.directional.color", "Cor direcional", "color")}
            ${field("lighting.directional.intensity", "Intensidade direcional", "number", { min:0,max:100,step:0.1 })}
            ${vectorField("lighting.directional.position", "Posição da luz")}
            ${vectorField("lighting.directional.target", "Alvo da luz")}
          </div>
        </details>

        <details open>
          <summary>Sombras</summary>
          <div class="ss-render-fields">
            ${checkField("shadows.enabled", "Ativar sombras")}
            ${selectField("shadows.type", "Filtro", [
              ["basic","Básico"],["pcf","PCF"],
              ["pcf-soft","PCF suave"],["vsm","VSM"]
            ])}
            ${selectField("shadows.mapSize", "Mapa", [
              [256,"256"],[512,"512"],[1024,"1024"],
              [2048,"2048"],[4096,"4096"]
            ], "number")}
            ${field("shadows.extent", "Extensão da câmera", "number", { min:0.01,step:1 })}
            ${field("shadows.near", "Near da sombra", "number", { min:0.001,step:0.1 })}
            ${field("shadows.far", "Far da sombra", "number", { min:0.002,step:1 })}
            ${field("shadows.bias", "Bias", "number", { step:0.0001 })}
            ${field("shadows.normalBias", "Normal bias", "number", { min:0,step:0.005 })}
            ${checkField("shadows.floorEnabled", "Plano receptor local")}
            ${field("shadows.floorSize", "Tamanho do plano", "number", { min:0.01,step:1 })}
            ${field("shadows.floorY", "Altura do plano", "number", { step:0.01 })}
            ${field("shadows.floorOpacity", "Opacidade da sombra", "number", { min:0,max:1,step:0.01 })}
          </div>
        </details>

        <details open>
          <summary>Materiais físicos locais</summary>
          <p class="ss-render-note">
            Projeto preserva os materiais do documento. Complementar preenche
            parâmetros ausentes. Sobrescrever força o mesmo material em todas
            as superfícies apenas neste viewer.
          </p>
          <div class="ss-render-fields">
            ${selectField("materials.mode", "Modo", [
              ["project","Projeto"],["enhance","Complementar"],
              ["override","Sobrescrever"]
            ])}
            ${selectField("materials.colorMode", "Cor", [
              ["project","Cor do projeto"],["override","Cor local"]
            ])}
            ${field("materials.color", "Cor local", "color")}
            ${field("materials.roughness", "Rugosidade", "number", { min:0,max:1,step:0.01 })}
            ${field("materials.metalness", "Metallicidade", "number", { min:0,max:1,step:0.01 })}
            ${field("materials.envMapIntensity", "Reflexo ambiental", "number", { min:0,max:20,step:0.05 })}
            ${field("materials.transmission", "Transmissão", "number", { min:0,max:1,step:0.01 })}
            ${field("materials.ior", "Índice de refração", "number", { min:1,max:2.333,step:0.01 })}
            ${field("materials.thickness", "Espessura óptica", "number", { min:0,step:0.05 })}
            ${field("materials.attenuationColor", "Cor de atenuação", "color")}
            ${field("materials.attenuationDistance", "Distância de atenuação; 0 = infinita", "number", { min:0,step:0.1 })}
            ${field("materials.dispersion", "Dispersão cromática", "number", { min:0,max:10,step:0.01 })}
            ${field("materials.iridescence", "Iridescência", "number", { min:0,max:1,step:0.01 })}
            ${field("materials.iridescenceIOR", "IOR da iridescência", "number", { min:1,max:2.333,step:0.01 })}
            ${field("materials.iridescenceThicknessMin", "Película mínima nm", "number", { min:0,step:1 })}
            ${field("materials.iridescenceThicknessMax", "Película máxima nm", "number", { min:0,step:1 })}
            ${field("materials.clearcoat", "Verniz", "number", { min:0,max:1,step:0.01 })}
            ${field("materials.clearcoatRoughness", "Rugosidade do verniz", "number", { min:0,max:1,step:0.01 })}
          </div>
        </details>

        <output data-render-status></output>
      </div>
    `;
  }

  #bind() {
    this.#listen(
      this.#root.querySelector("[data-render-apply]"),
      "click",
      () => this.#applyFields()
    );
    this.#listen(
      this.#root.querySelector("[data-render-apply-preset]"),
      "click",
      () => this.#applyPreset()
    );
    this.#listen(
      this.#root.querySelector("[data-render-reset]"),
      "click",
      () => this.#reset()
    );
  }

  #loadInitialSettings() {
    let saved = null;
    try {
      saved = JSON.parse(
        this.#storage?.getItem(this.#storageKey) ?? "null"
      );
    } catch {}

    try {
      const settings = saved
        ? this.#execute("viewer.render.settings.set", saved)
        : this.#query("viewer.render.settings");
      this.#write(settings);
      this.#status(saved
        ? "Configuração local restaurada."
        : "Configuração padrão do viewer.");
    } catch (error) {
      this.#write(this.#query("viewer.render.settings"));
      this.#status(error.message, true);
    }
  }

  #applyFields() {
    try {
      const settings = this.#read();
      const applied = this.#execute(
        "viewer.render.settings.set",
        settings
      );
      this.#write(applied);
      this.#save(applied);
      this.#status("Iluminação e materiais aplicados neste viewer.");
    } catch (error) {
      this.#status(error.message, true);
    }
  }

  #applyPreset() {
    try {
      const id = this.#root.querySelector(
        "[data-render-preset]"
      ).value;
      const applied = this.#execute(
        "viewer.render.preset.apply",
        { id }
      );
      this.#write(applied);
      this.#save(applied);
      this.#status(`Preset aplicado: ${id}.`);
    } catch (error) {
      this.#status(error.message, true);
    }
  }

  #reset() {
    try {
      const applied = this.#execute("viewer.render.settings.reset");
      this.#write(applied);
      this.#storage?.removeItem(this.#storageKey);
      this.#status("Configuração padrão restaurada.");
    } catch (error) {
      this.#status(error.message, true);
    }
  }

  #read() {
    const settings = structuredClone(
      this.#query("viewer.render.settings")
    );
    for (const input of this.#root.querySelectorAll(
      "[data-render-path]"
    )) {
      const path = input.dataset.renderPath.split(".");
      const value = input.type === "checkbox"
        ? input.checked
        : input.dataset.renderType === "number" ||
          input.type === "number"
          ? Number(input.value)
          : input.value;
      setPath(settings, path, value);
    }
    return settings;
  }

  #write(settings) {
    for (const input of this.#root.querySelectorAll(
      "[data-render-path]"
    )) {
      const value = getPath(
        settings,
        input.dataset.renderPath.split(".")
      );
      if (input.type === "checkbox") {
        input.checked = Boolean(value);
      } else {
        input.value = value ?? "";
      }
    }
  }

  #save(settings) {
    try {
      this.#storage?.setItem(
        this.#storageKey,
        JSON.stringify(settings)
      );
    } catch {}
  }

  #status(message, error = false) {
    const output = this.#root.querySelector("[data-render-status]");
    output.textContent = message;
    output.dataset.error = error ? "true" : "false";
  }

  #listen(target, type, listener) {
    target.addEventListener(type, listener);
    this.#listeners.push(() =>
      target.removeEventListener(type, listener)
    );
  }
}

function field(path, label, type, attributes = {}) {
  return `<label class="ss-render-field">
    <span>${escapeHtml(label)}</span>
    <input data-render-path="${path}" type="${type}"
      ${attributesHtml(attributes)}>
  </label>`;
}

function checkField(path, label) {
  return `<label class="ss-render-check">
    <input data-render-path="${path}" type="checkbox">
    <span>${escapeHtml(label)}</span>
  </label>`;
}

function selectField(path, label, options, valueType = "string") {
  return `<label class="ss-render-field">
    <span>${escapeHtml(label)}</span>
    <select data-render-path="${path}" data-render-type="${valueType}">
      ${options.map(([value, text]) =>
        `<option value="${escapeHtml(value)}">${escapeHtml(text)}</option>`
      ).join("")}
    </select>
  </label>`;
}

function vectorField(path, label) {
  return `<fieldset class="ss-render-vector-field">
    <legend>${escapeHtml(label)}</legend>
    <div class="ss-render-vector">
      ${["X", "Y", "Z"].map((axis, index) =>
        `<label><span>${axis}</span><input type="number" step="any"
          data-render-path="${path}.${index}"></label>`
      ).join("")}
    </div>
  </fieldset>`;
}

function attributesHtml(attributes) {
  return Object.entries(attributes).map(([key, value]) =>
    `${key}="${escapeHtml(value)}"`
  ).join(" ");
}

function getPath(object, path) {
  return path.reduce((value, key) => value?.[key], object);
}

function setPath(object, path, value) {
  let target = object;
  for (const key of path.slice(0, -1)) {
    target = target[key];
  }
  target[path.at(-1)] = value;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function safeLocalStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}
