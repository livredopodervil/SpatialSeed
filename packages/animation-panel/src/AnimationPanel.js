export class AnimationPanel {
  static apiVersion = "animation-panel-v3-independent-instances";

  constructor({ root, query, execute, subscribe = null }) {
    if (!root) throw new TypeError("AnimationPanel exige root.");
    if (typeof query !== "function" || typeof execute !== "function") {
      throw new TypeError("AnimationPanel exige query() e execute().");
    }
    if (subscribe !== null && typeof subscribe !== "function") {
      throw new TypeError("AnimationPanel exige subscribe() compatível.");
    }
    this.root = root;
    this.query = query;
    this.execute = execute;
    this.subscribe = subscribe;
    this.preset = required(root, "[data-animation-preset]");
    this.parameters = required(root, "[data-animation-parameters]");
    this.targetMode = required(root, "[data-animation-target-mode]");
    this.timeDomain = required(root, "[data-animation-time-domain]");
    this.procedure = required(root, "[data-animation-procedure]");
    this.procedureParameters = required(
      root,
      "[data-animation-procedure-parameters]"
    );
    this.trackList = required(root, "[data-animation-tracks]");
    this.instanceList = required(root, "[data-animation-instances]");
    this.status = required(root, "[data-animation-status]");
    this.tracks = [];
    this.listeners = [];
    this.disposed = false;
    this.unsubscribe = null;
    this.#loadPresets();
    this.#loadTimeDomains();
    this.#loadProcedures();
    this.#bind();
    if (this.subscribe) {
      this.unsubscribe = this.subscribe(snapshot => {
        if (!this.disposed) this.refreshStatus(snapshot);
      });
    } else {
      this.refreshStatus();
    }
  }

  playSelection() {
    const result = this.execute("animation.preset", {
      id: this.preset.value,
      parameters: this.#readParameters(),
      targetMode: this.targetMode.value,
      timeDomainId: this.timeDomain.value
    });
    this.refreshStatus(result);
    return result;
  }

  async playProcedure() {
    const parameters = parseJsonObject(
      this.procedureParameters.value,
      "Parâmetros do procedimento"
    );
    const result = await this.execute("animation.procedure", {
      name: this.procedure.value,
      parameters,
      targetMode: this.targetMode.value,
      timeDomainId: this.timeDomain.value
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
    const definition = this.definitions.find(
      item => item.id === this.preset.value
    );
    this.tracks.push(Object.freeze({
      id: `track-${this.tracks.length + 1}`,
      presetId: definition.id,
      title: definition.title,
      parameters: Object.freeze(this.#readParameters()),
      targetIds: Object.freeze([...targetIds]),
      timeDomainId: this.timeDomain.value
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
        targetIds: track.targetIds,
        timeDomainId: track.timeDomainId
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

  pauseInstance(instanceId) {
    const result = this.execute("animation.instance.pause", { instanceId });
    this.refreshStatus(result);
    return result;
  }

  resumeInstance(instanceId) {
    const result = this.execute("animation.instance.resume", { instanceId });
    this.refreshStatus(result);
    return result;
  }

  stopInstance(instanceId) {
    const result = this.execute("animation.instance.stop", { instanceId });
    this.refreshStatus(result);
    return result;
  }

  stopAll() {
    const result = this.execute("animation.stop-all");
    this.refreshStatus(result);
    return result;
  }

  refreshStatus(snapshot = null) {
    const state = snapshot ?? this.query("animation.status");
    if (!state || typeof state !== "object") return null;
    this.root.dataset.state = state.state;
    this.#renderInstances(state.instances ?? [], state.activeInstanceId);
    this.status.textContent = JSON.stringify({
      state: state.state,
      activeInstanceId: state.activeInstanceId ?? null,
      instanceCount: state.instanceCount ?? state.instances?.length ?? 0,
      time: state.time?.simulationTime ?? 0,
      clip: state.clip,
      preset: state.preset?.id ?? null,
      tracks: state.composition?.tracks?.length ?? 0,
      temporal: {
        runtime: state.version,
        operationIds: state.clip?.operationIds ?? [],
        domains: state.clip?.domains ?? []
      },
      performance: {
        frames: state.statistics?.frames ?? 0,
        changedFrames: state.statistics?.changedFrames ?? 0,
        identityFrames: state.statistics?.identityFrames ?? 0,
        lastUpdateMs: state.statistics?.lastUpdateMs ?? 0,
        maximumUpdateMs: state.statistics?.maximumUpdateMs ?? 0,
        droppedSteps: state.statistics?.droppedSteps ?? 0
      },
      error: state.statistics?.lastError ?? null
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
    this.unsubscribe?.();
    this.unsubscribe = null;
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

  #loadTimeDomains() {
    const domains = this.query("time.domains") ?? [];
    const document = this.root.ownerDocument;
    this.timeDomain.replaceChildren(...domains.map(domain => {
      const option = document.createElement("option");
      option.value = domain.id;
      option.textContent = domain.id === "world"
        ? "world · tempo global"
        : `${domain.id} · taxa ${domain.effectiveRate}`;
      return option;
    }));
    if (!this.timeDomain.options.length) {
      const option = document.createElement("option");
      option.value = "world";
      option.textContent = "world · tempo global";
      this.timeDomain.append(option);
    }
  }

  #loadProcedures() {
    let description = { procedures: [] };
    try {
      description = this.query("animation.procedures.describe") ?? description;
    } catch {}
    this.procedureDefinitions = description.procedures ?? [];
    const document = this.root.ownerDocument;
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = this.procedureDefinitions.length
      ? "Escolha um procedimento"
      : "Nenhum procedimento disponível";
    this.procedure.replaceChildren(
      placeholder,
      ...this.procedureDefinitions.map(definition => {
        const option = document.createElement("option");
        option.value = definition.name;
        option.textContent = definition.animationSuggested
          ? `★ ${definition.label}`
          : definition.label;
        option.title = definition.description;
        return option;
      })
    );
    required(this.root, "[data-animation-play-procedure]").disabled =
      this.procedureDefinitions.length === 0;
  }

  #renderParameters() {
    const definition = this.definitions.find(
      item => item.id === this.preset.value
    );
    const document = this.root.ownerDocument;
    this.parameters.replaceChildren(...(definition?.parameters ?? []).map(
      parameter => {
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
      }
    ));
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
      text.textContent =
        `${index + 1}. ${track.title} · ${track.targetIds.length} alvo(s)` +
        ` · tempo ${track.timeDomainId}`;
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

  #renderInstances(instances, activeInstanceId) {
    const document = this.root.ownerDocument;
    if (!instances.length) {
      const empty = document.createElement("p");
      empty.className = "ss-animation-empty";
      empty.textContent = "Nenhuma animação ativa.";
      this.instanceList.replaceChildren(empty);
      required(this.root, "[data-animation-stop-all]").disabled = true;
      return;
    }

    this.instanceList.replaceChildren(...instances.map(instance => {
      const row = document.createElement("div");
      row.className = "ss-animation-instance";
      row.dataset.state = instance.state;
      row.dataset.active = String(instance.instanceId === activeInstanceId);

      const description = document.createElement("div");
      description.className = "ss-animation-instance-description";
      const title = document.createElement("strong");
      title.textContent = instance.id;
      const details = document.createElement("span");
      const domains = (instance.domains ?? [])
        .map(domain => domain.parentDomainId)
        .filter((value, index, list) => list.indexOf(value) === index);
      details.textContent = `${instance.objectCount ?? 0} objeto(s) · ` +
        `${domains.join(", ") || "world"} · ${instance.state}`;
      details.title = (instance.objectIds ?? []).join(", ");
      description.append(title, details);

      const actions = document.createElement("div");
      actions.className = "ss-animation-instance-actions";
      const pause = document.createElement("button");
      pause.type = "button";
      pause.textContent = "Pausar";
      pause.disabled = instance.state !== "playing";
      pause.addEventListener("click", () =>
        this.#attempt(() => this.pauseInstance(instance.instanceId))
      );
      const resume = document.createElement("button");
      resume.type = "button";
      resume.textContent = "Continuar";
      resume.disabled = instance.state !== "paused";
      resume.addEventListener("click", () =>
        this.#attempt(() => this.resumeInstance(instance.instanceId))
      );
      const stop = document.createElement("button");
      stop.type = "button";
      stop.textContent = "Parar";
      stop.addEventListener("click", () =>
        this.#attempt(() => this.stopInstance(instance.instanceId))
      );
      actions.append(pause, resume, stop);
      row.append(description, actions);
      return row;
    }));
    required(this.root, "[data-animation-stop-all]").disabled = false;
  }

  #bind() {
    this.#listen(this.preset, "change", () => this.#renderParameters());
    this.#listen(
      required(this.root, "[data-animation-play-selection]"),
      "click",
      () => this.#attempt(() => this.playSelection())
    );
    this.#listen(
      required(this.root, "[data-animation-play-procedure]"),
      "click",
      () => this.#attempt(() => this.playProcedure())
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
      ["[data-animation-stop]", () => this.stop()],
      ["[data-animation-stop-all]", () => this.stopAll()]
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

  async #attempt(operation) {
    try {
      const result = await operation();
      this.status.dataset.error = "false";
      return result;
    } catch (error) {
      this.status.dataset.error = "true";
      this.status.textContent = error?.message ?? String(error);
      return null;
    }
  }
}

function parseJsonObject(source, label) {
  const text = String(source ?? "").trim();
  if (!text) return {};
  let value;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw new TypeError(`${label} contém JSON inválido.`, { cause: error });
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} deve formar um objeto JSON.`);
  }
  return value;
}

function required(root, selector) {
  const element = root.querySelector(selector);
  if (!element) throw new Error(`AnimationPanel sem ${selector}.`);
  return element;
}
