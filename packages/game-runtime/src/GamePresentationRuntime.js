export const GAME_PRESENTATION_RUNTIME_VERSION =
  "game-presentation-runtime-v1";

const HUD_ANCHORS = Object.freeze([
  "top-left",
  "top-center",
  "top-right",
  "center",
  "bottom-left",
  "bottom-center",
  "bottom-right"
]);

export class GamePresentationRuntime {
  #active = false;
  #revision = 0;
  #hud = new Map();
  #worldText = new Map();
  #dialog = null;
  #listeners = new Set();

  constructor({ readStateValue = null, projectObject = null } = {}) {
    if (readStateValue !== null && typeof readStateValue !== "function") {
      throw new TypeError("readStateValue deve ser função.");
    }
    if (projectObject !== null && typeof projectObject !== "function") {
      throw new TypeError("projectObject deve ser função.");
    }
    this.readStateValue = readStateValue ?? (() => undefined);
    this.projectObject = projectObject ?? (() => null);
  }

  start({ worldText = [] } = {}) {
    if (!Array.isArray(worldText)) {
      throw new TypeError("worldText inicial deve ser uma lista.");
    }
    this.#active = true;
    this.#hud.clear();
    this.#worldText.clear();
    this.#dialog = null;
    for (const entry of worldText) {
      const normalized = normalizeWorldText(entry);
      this.#worldText.set(normalized.id, normalized);
    }
    this.#changed("started");
    return this.snapshot();
  }

  stop() {
    const changed = this.#active || this.#hud.size || this.#worldText.size || this.#dialog;
    this.#active = false;
    this.#hud.clear();
    this.#worldText.clear();
    this.#dialog = null;
    if (changed) this.#changed("stopped");
    return this.snapshot();
  }

  showHudText({ id = "main", text, anchor = "top-left" } = {}) {
    this.#assertActive();
    const item = Object.freeze({
      id: requiredId(id, "HUD"),
      text: requiredText(text, "Texto do HUD"),
      anchor: normalizeHudAnchor(anchor)
    });
    this.#hud.set(item.id, item);
    this.#changed("hud-show");
    return this.snapshot();
  }

  hideHudText({ id = "main" } = {}) {
    this.#assertActive();
    const changed = this.#hud.delete(requiredId(id, "HUD"));
    if (changed) this.#changed("hud-hide");
    return this.snapshot();
  }

  showDialog({ speaker = "", text } = {}) {
    this.#assertActive();
    this.#dialog = Object.freeze({
      speaker: String(speaker ?? "").trim(),
      text: requiredText(text, "Texto do diálogo")
    });
    this.#changed("dialog-show");
    return this.snapshot();
  }

  closeDialog() {
    this.#assertActive();
    if (this.#dialog !== null) {
      this.#dialog = null;
      this.#changed("dialog-close");
    }
    return this.snapshot();
  }

  showWorldText({
    id = null,
    objectId,
    text,
    offsetX = 0,
    offsetY = -18
  } = {}) {
    this.#assertActive();
    const item = normalizeWorldText({
      id: id ?? `object:${String(objectId ?? "").trim()}`,
      objectId,
      text,
      offsetX,
      offsetY
    });
    this.#worldText.set(item.id, item);
    this.#changed("world-text-show");
    return this.snapshot();
  }

  hideWorldText({ id = null, objectId = null } = {}) {
    this.#assertActive();
    const resolvedId = id == null || String(id).trim() === ""
      ? `object:${requiredId(objectId, "objeto")}`
      : requiredId(id, "texto no mundo");
    const changed = this.#worldText.delete(resolvedId);
    if (changed) this.#changed("world-text-hide");
    return this.snapshot();
  }

  snapshot() {
    const active = this.#active;
    return Object.freeze({
      version: GAME_PRESENTATION_RUNTIME_VERSION,
      active,
      revision: this.#revision,
      hud: Object.freeze(active
        ? [...this.#hud.values()].map(item => Object.freeze({
            ...item,
            text: this.#resolveTemplate(item.text)
          }))
        : []),
      dialog: active && this.#dialog
        ? Object.freeze({
            speaker: this.#resolveTemplate(this.#dialog.speaker),
            text: this.#resolveTemplate(this.#dialog.text)
          })
        : null,
      worldText: Object.freeze(active
        ? [...this.#worldText.values()].map(item => {
            const projected = this.projectObject(item.objectId);
            return Object.freeze({
              ...item,
              text: this.#resolveTemplate(item.text),
              screen: projected && typeof projected === "object"
                ? Object.freeze({
                    x: finite(projected.x, "x projetado"),
                    y: finite(projected.y, "y projetado"),
                    z: finite(projected.z ?? 0, "z projetado"),
                    visible: projected.visible !== false
                  })
                : null
            });
          })
        : [])
    });
  }

  subscribe(listener) {
    if (typeof listener !== "function") {
      throw new TypeError("Listener de apresentação deve ser função.");
    }
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  #resolveTemplate(template) {
    return String(template ?? "").replace(
      /\{([A-Za-z0-9_-]+)(?:\.([^{}]+))?\}/g,
      (token, dataId, path = null) => {
        try {
          const value = this.readStateValue(dataId, path);
          return displayValue(value);
        } catch {
          return token;
        }
      }
    );
  }

  #assertActive() {
    if (!this.#active) {
      throw new Error("A apresentação do jogo exige uma sessão ativa.");
    }
  }

  #changed(type) {
    this.#revision += 1;
    const event = Object.freeze({ type, revision: this.#revision });
    const snapshot = this.snapshot();
    for (const listener of this.#listeners) listener(snapshot, event);
  }
}

function normalizeWorldText(value = {}) {
  const objectId = requiredId(value.objectId, "objeto");
  return Object.freeze({
    id: requiredId(value.id ?? `object:${objectId}`, "texto no mundo"),
    objectId,
    text: requiredText(value.text, "Texto no mundo"),
    offsetX: finite(value.offsetX ?? 0, "offset X"),
    offsetY: finite(value.offsetY ?? -18, "offset Y")
  });
}

function normalizeHudAnchor(value) {
  const source = String(value ?? "top-left").trim().toLowerCase();
  const aliases = {
    "superior-esquerda": "top-left",
    "superior-centro": "top-center",
    "superior-direita": "top-right",
    centro: "center",
    "inferior-esquerda": "bottom-left",
    "inferior-centro": "bottom-center",
    "inferior-direita": "bottom-right"
  };
  const anchor = aliases[source] ?? source;
  if (!HUD_ANCHORS.includes(anchor)) {
    throw new RangeError(`Âncora de HUD inválida: ${source}.`);
  }
  return anchor;
}

function requiredId(value, label) {
  const id = String(value ?? "").trim();
  if (!id) throw new TypeError(`${label} não informado.`);
  if (id.length > 256) throw new RangeError(`${label} excede 256 caracteres.`);
  return id;
}

function requiredText(value, label) {
  const text = String(value ?? "").trim();
  if (!text) throw new TypeError(`${label} não informado.`);
  if (text.length > 4096) throw new RangeError(`${label} excede 4096 caracteres.`);
  return text;
}

function finite(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new TypeError(`${label} inválido.`);
  return number;
}

function displayValue(value) {
  if (value === null) return "null";
  if (["string", "number", "boolean"].includes(typeof value)) {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
