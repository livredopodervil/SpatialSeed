export const GAME_EVENT_RUNTIME_VERSION = "game-event-runtime-v1";

export class GameEventRuntime {
  #bindings = new Map();
  #listeners = new Set();

  constructor({ executeAction = async () => false } = {}) {
    if (typeof executeAction !== "function") {
      throw new TypeError("GameEventRuntime requires executeAction(action, event)." );
    }
    this.executeAction = executeAction;
  }

  configure({ bindings = [] } = {}) {
    if (!Array.isArray(bindings)) throw new TypeError("bindings must be a list.");
    this.#bindings.clear();
    for (const raw of bindings) {
      const event = String(raw?.event ?? "").trim();
      if (!event) throw new TypeError("Each game event binding requires event.");
      const actions = Array.isArray(raw?.actions) ? raw.actions.map(normalizeAction) : [];
      const bucket = this.#bindings.get(event) ?? [];
      bucket.push(Object.freeze({
        objectId: raw?.objectId == null ? null : String(raw.objectId),
        actions: Object.freeze(actions)
      }));
      this.#bindings.set(event, bucket);
    }
    return this.status();
  }

  has(type) {
    return (this.#bindings.get(String(type)) ?? []).length > 0;
  }

  async emit(type, payload = {}) {
    const event = Object.freeze({
      type: String(type ?? "").trim(),
      objectId: payload?.objectId == null ? null : String(payload.objectId),
      payload: Object.freeze({ ...(payload ?? {}) })
    });
    if (!event.type) throw new TypeError("Game event requires a type.");
    const executions = [];
    for (const binding of this.#bindings.get(event.type) ?? []) {
      if (binding.objectId && binding.objectId !== event.objectId) continue;
      for (const action of binding.actions) {
        executions.push(await this.executeAction(action, event));
      }
    }
    for (const listener of this.#listeners) listener(event);
    return Object.freeze({ event, executions: Object.freeze(executions) });
  }

  subscribe(listener) {
    if (typeof listener !== "function") throw new TypeError("listener must be a function.");
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  status() {
    return Object.freeze({
      version: GAME_EVENT_RUNTIME_VERSION,
      eventTypes: Object.freeze([...this.#bindings.keys()]),
      bindingCount: [...this.#bindings.values()].reduce((n, list) => n + list.length, 0)
    });
  }
}

function normalizeAction(action) {
  if (!action || typeof action !== "object") throw new TypeError("Game event action must be an object.");
  const type = String(action.type ?? "command");
  return Object.freeze({ ...structuredClone(action), type });
}
