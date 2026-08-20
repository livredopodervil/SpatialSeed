import {
  normalizeDataObjectDocument,
  portableDataValue
} from "../../core/src/index.js?build=20260819-0054na";

export const GAME_SESSION_STATE_VERSION = "game-session-state-v1";

export class GameSessionState {
  #active = false;
  #authored = new Map();
  #values = new Map();
  #revision = 0;

  start(dataObjects = null) {
    const document = normalizeDataObjectDocument(dataObjects);
    this.#authored = new Map(document.items.map(item => [item.id, item]));
    this.#values = new Map(document.items.map(item => [
      item.id,
      portableDataValue(item.value, `estado inicial de ${item.id}`)
    ]));
    this.#active = true;
    this.#revision += 1;
    return this.status();
  }

  stop() {
    const changed = this.#active || this.#values.size > 0 || this.#authored.size > 0;
    this.#active = false;
    this.#authored.clear();
    this.#values.clear();
    if (changed) this.#revision += 1;
    return this.status();
  }

  has(dataId) {
    return this.#active && this.#values.has(normalizeDataId(dataId));
  }

  get(dataId, path = null) {
    this.#assertActive();
    const id = normalizeDataId(dataId);
    if (!this.#values.has(id)) throw new Error(`DataObject inexistente na sessão: ${id}.`);
    const value = readPath(this.#values.get(id), normalizePath(path));
    return portableDataValue(value, `estado ${id}`);
  }

  set(dataId, path, value) {
    this.#assertActive();
    const id = normalizeDataId(dataId);
    if (!this.#values.has(id)) throw new Error(`DataObject inexistente na sessão: ${id}.`);
    const segments = normalizePath(path, { required: true });
    const next = writePath(
      this.#values.get(id),
      segments,
      portableDataValue(value, `novo estado ${id}`)
    );
    this.#values.set(id, portableDataValue(next, `estado ${id}`));
    this.#revision += 1;
    return this.get(id, segments);
  }

  increment(dataId, path, amount = 1) {
    const current = this.get(dataId, path);
    if (typeof current !== "number" || !Number.isFinite(current)) {
      throw new TypeError("game.state.increment exige um valor numérico existente.");
    }
    const delta = Number(amount);
    if (!Number.isFinite(delta)) throw new TypeError("Incremento inválido.");
    return this.set(dataId, path, current + delta);
  }

  toggle(dataId, path) {
    const current = this.get(dataId, path);
    if (typeof current !== "boolean") {
      throw new TypeError("game.state.toggle exige um valor booleano existente.");
    }
    return this.set(dataId, path, !current);
  }

  reset(dataId = null) {
    this.#assertActive();
    if (dataId === null || dataId === undefined || String(dataId).trim() === "") {
      this.#values = new Map([...this.#authored.entries()].map(([id, item]) => [
        id,
        portableDataValue(item.value, `estado inicial de ${id}`)
      ]));
      this.#revision += 1;
      return this.snapshot();
    }
    const id = normalizeDataId(dataId);
    const authored = this.#authored.get(id);
    if (!authored) throw new Error(`DataObject inexistente na sessão: ${id}.`);
    this.#values.set(id, portableDataValue(authored.value, `estado inicial de ${id}`));
    this.#revision += 1;
    return this.get(id);
  }

  snapshot() {
    return Object.freeze({
      version: GAME_SESSION_STATE_VERSION,
      active: this.#active,
      revision: this.#revision,
      items: Object.freeze([...this.#values.entries()].map(([id, value]) =>
        Object.freeze({ id, value: portableDataValue(value, `estado ${id}`) })
      ))
    });
  }

  status() {
    return Object.freeze({
      version: GAME_SESSION_STATE_VERSION,
      active: this.#active,
      revision: this.#revision,
      dataObjectCount: this.#values.size
    });
  }

  #assertActive() {
    if (!this.#active) throw new Error("Nenhuma sessão de jogo está ativa.");
  }
}

function normalizeDataId(value) {
  const id = String(value ?? "").trim();
  if (!id) throw new TypeError("DataObject da sessão não informado.");
  return id;
}

function normalizePath(value, { required = false } = {}) {
  if (Array.isArray(value)) {
    const result = value.map(segment => String(segment)).filter(Boolean);
    if (required && !result.length) throw new TypeError("Caminho de estado ausente.");
    return result;
  }
  if (value === null || value === undefined || String(value).trim() === "") {
    if (required) throw new TypeError("Caminho de estado ausente.");
    return [];
  }
  const text = String(value).trim();
  const parts = text.startsWith("/")
    ? text.split("/").filter(Boolean)
    : text.split(".").filter(Boolean);
  if (required && !parts.length) throw new TypeError("Caminho de estado ausente.");
  return parts;
}

function readPath(root, segments) {
  let current = root;
  for (const segment of segments) {
    if (current === null || typeof current !== "object" || !Object.hasOwn(current, segment)) {
      throw new Error(`Caminho de estado inexistente: ${segments.join(".")}.`);
    }
    current = current[segment];
  }
  return current;
}

function writePath(root, segments, value) {
  const result = cloneMutable(root);
  if (!result || typeof result !== "object") {
    throw new TypeError("O valor raiz do DataObject deve ser objeto ou lista para escrita por caminho.");
  }
  let cursor = result;
  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index];
    const current = cursor?.[segment];
    if (!current || typeof current !== "object") {
      cursor[segment] = {};
    } else {
      cursor[segment] = cloneMutable(current);
    }
    cursor = cursor[segment];
  }
  cursor[segments.at(-1)] = cloneMutable(value);
  return result;
}

function cloneMutable(value) {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(cloneMutable);
  return Object.fromEntries(Object.entries(value).map(
    ([key, child]) => [key, cloneMutable(child)]
  ));
}
