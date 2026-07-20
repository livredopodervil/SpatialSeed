export class AnimationPanel {
  static apiVersion = "animation-panel-v1";

  constructor({ root, query, execute }) {
    if (!root) throw new TypeError("AnimationPanel exige root.");
    if (typeof query !== "function" || typeof execute !== "function") {
      throw new TypeError("AnimationPanel exige query() e execute().");
    }
    this.root = root;
    this.query = query;
    this.execute = execute;
    this.preset = required(root, "[data-animation-preset]");
    this.parameters = required(root, "[data-animation-parameters]");
    this.targetMode = required(root, "[data-animation-target-mode]");
    this.trackList = required(root, "[data-animation-tracks]");
    this.status = required(root, "[data-animation-status]");
    this.tracks = [];
    this.listeners = [];
    this.disposed = false;
    this.#loadPresets();
    this.#bind();
    this.refreshStatus();
    this.timer = setInterval(() => {
      if (!this.root.hidden) this.refreshStatus();
    }, 250);
  }

  playSelection() {
    const result = this.execute("animation.preset", {
      id: this.preset.value,
      parameters: this.#readParameters(),
      targetMode: this.targetMode.value
    });
    this.refreshStatus(result);
    return result;
  }

  addTrack() {
    const selection = this.query("selection.snapshot");
    const targetIds = selection.members.map(member => member.objectId);
    if (!targetIds.length) {
      throw new Error("Selecione objetos antes de adicionar uma faixa.");
    }
    const definition = this.definitions.find(item => item.id === this.preset.value);
    this.tracks.push(Object.freeze({
      id: `track-${this.tracks.length + 1}`,
      presetId: definition.id,
      title: definition.title,
      parameters: Object.freeze(this.#readParameters()),
      targetIds: Object.freeze([...targetIds])
    }));
    this.#renderTracks();
    return this.tracks.at(-1);
  }

  playTracks() {
    if (!this.tracks.length) throw new Error("Adicione ao menos uma faixa.");
    const result = this.execute("animation.tracks.start", {
      id: "panel.composition",
      targetMode: this.targetMode.value,
      tracks: this.tracks.map(track => ({
        id: track.id,
        presetId: track.presetId,
        parameters: track.parameters,
        targetIds: track.targetIds
      }))
    });
    this.refreshStatus(result);
    return result;
  }

  pause() {
    const result = this.execute("animation.pause");
    this.refreshStatus(result);
    return result;
  }

  resume() {
    const result = this.execute("animation.resume");
    this.refreshStatus(result);
    return result;
  }

  stop() {
    const result = this.execute("animation.stop");
    this.refreshStatus(result);
    return result;
  }

  refreshStatus(snapshot = null) {
    const state = snapshot ?? this.query("animation.status");
    this.root.dataset.state = state.state;
    this.status.textContent = JSON.stringify({
      state: state.state,
      time: state.time.simulationTime,
      clip: state.clip,
      preset: state.preset?.id ?? null,
      tracks: state.composition?.tracks?.length ?? 0,
      performance: {
        lastUpdateMs: state.statistics.lastUpdateMs,
        maximumUpdateMs: state.statistics.maximumUpdateMs,
        droppedSteps: state.statistics.droppedSteps
      }
    }, null, 2);
    required(this.root, "[data-animation-pause]").disabled =
      state.state !== "playing";
    required(this.root, "[data-animation-resume]").disabled =
      state.state !== "paused";
    required(this.root, "[data-animation-stop]").disabled =
      state.state === "idle";
    return state;
  }

  dispose() {
    if (this.disposed) return false;
    this.disposed = true;
    clearInterval(this.timer);
    for (const [element, type, listener] of this.listeners) {
      element.removeEventListener(type, listener);
    }
    this.listeners.length = 0;
    return true;
  }

  #loadPresets() {
    this.definitions = this.query("animation.presets.describe").presets;
    const document = this.root.ownerDocument;
    this.preset.replaceChildren(...this.definitions.map(definition => {
      const option = document.createElement("option");
      option.value = definition.id;
      option.textContent = `${definition.title} · ${definition.description}`;
      return option;
    }));
    this.#renderParameters();
  }

  #renderParameters() {
    const definition = this.definitions.find(item => item.id === this.preset.value);
    const document = this.root.ownerDocument;
    this.parameters.replaceChildren(...(definition?.parameters ?? []).map(parameter => {
      const label = document.createElement("label");
      const title = document.createElement("span");
      title.textContent = parameter.label;
      let input;
      if (parameter.type === "axis") {
        input = document.createElement("select");
        input.append(...parameter.options.map(value => {
          const option = document.createElement("option");
          option.value = value;
          option.textContent = value.toUpperCase();
          return option;
        }));
      } else {
        input = document.createElement("input");
        input.type = "number";
        input.step = "any";
        input.min = String(parameter.min);
        input.max = String(parameter.max);
      }
      input.name = parameter.id;
      input.value = String(parameter.default);
      label.append(title, input);
      return label;
    }));
  }

  #readParameters() {
    return Object.fromEntries(
      [...this.parameters.querySelectorAll("input,select")].map(input => [
        input.name,
        input.type === "number" ? Number(input.value) : input.value
      ])
    );
  }

  #renderTracks() {
    const document = this.root.ownerDocument;
    this.trackList.replaceChildren(...this.tracks.map((track, index) => {
      const row = document.createElement("div");
      row.className = "ss-animation-track";
      const text = document.createElement("span");
      text.textContent = `${index + 1}. ${track.title} · ${track.targetIds.length} alvo(s)`;
      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "×";
      remove.title = "Remover faixa";
      remove.addEventListener("click", () => {
        this.tracks.splice(index, 1);
        this.#renderTracks();
      });
      row.append(text, remove);
      return row;
    }));
    required(this.root, "[data-animation-play-tracks]").disabled =
      this.tracks.length === 0;
  }

  #bind() {
    this.#listen(this.preset, "change", () => this.#renderParameters());
    this.#listen(
      required(this.root, "[data-animation-play-selection]"),
      "click",
      () => this.#attempt(() => this.playSelection())
    );
    this.#listen(
      required(this.root, "[data-animation-add-track]"),
      "click",
      () => this.#attempt(() => this.addTrack())
    );
    this.#listen(
      required(this.root, "[data-animation-play-tracks]"),
      "click",
      () => this.#attempt(() => this.playTracks())
    );
    this.#listen(
      required(this.root, "[data-animation-clear-tracks]"),
      "click",
      () => {
        this.tracks.length = 0;
        this.#renderTracks();
      }
    );
    for (const [selector, operation] of [
      ["[data-animation-pause]", () => this.pause()],
      ["[data-animation-resume]", () => this.resume()],
      ["[data-animation-stop]", () => this.stop()]
    ]) {
      this.#listen(required(this.root, selector), "click", () =>
        this.#attempt(operation)
      );
    }
    this.#renderTracks();
  }

  #listen(element, type, listener) {
    element.addEventListener(type, listener);
    this.listeners.push([element, type, listener]);
  }

  #attempt(operation) {
    try {
      const result = operation();
      this.status.dataset.error = "false";
      return result;
    } catch (error) {
      this.status.dataset.error = "true";
      this.status.textContent = error?.message ?? String(error);
      return null;
    }
  }
}

function required(root, selector) {
  const element = root.querySelector(selector);
  if (!element) throw new Error(`AnimationPanel sem ${selector}.`);
  return element;
}
