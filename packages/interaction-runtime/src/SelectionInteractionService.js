import {
  INTERACTION_BINDINGS_VERSION,
  normalizeInteractionDocument,
  normalizeInteractionEventId,
  portableInteractionValue
} from "../../core/src/index.js";

export const SELECTION_INTERACTION_SERVICE_VERSION =
  "selection-interactions-v1";

export const INTERACTION_EVENT_CATALOG = Object.freeze([
  event("app.start", "Ao iniciar a aplicação", "application"),
  event("game.start", "Ao iniciar o modo jogo", "game"),
  event("game.stop", "Ao encerrar o modo jogo", "game"),
  event("character.jump", "Ao pular", "character"),
  event("character.land", "Ao aterrissar", "character"),
  event("character.respawn", "Ao reposicionar", "character"),
  event("trigger.enter", "Ao entrar no sensor", "trigger"),
  event("trigger.exit", "Ao sair do sensor", "trigger")
]);

export class SelectionInteractionService {
  constructor({
    selection,
    sandbox,
    occurrenceResolver = null,
    commands,
    createId = defaultId
  } = {}) {
    if (!selection?.snapshot || !sandbox?.dispatch || !sandbox?.getSnapshot) {
      throw new TypeError(
        "SelectionInteractionService exige seleção e sandbox compatíveis."
      );
    }
    if (!commands?.describe) {
      throw new TypeError("Catálogo de comandos indisponível para interações.");
    }
    this.selection = selection;
    this.sandbox = sandbox;
    this.occurrenceResolver = occurrenceResolver;
    this.commands = commands;
    this.createId = createId;
  }

  describeCatalog() {
    return Object.freeze({
      version: SELECTION_INTERACTION_SERVICE_VERSION,
      documentVersion: INTERACTION_BINDINGS_VERSION,
      events: INTERACTION_EVENT_CATALOG,
      actions: Object.freeze(this.#actionDescriptors())
    });
  }

  inspectSelection() {
    const selection = this.selection.snapshot();
    const targetIds = uniqueIds(
      selection.members?.map(member => member.objectId) ?? []
    );
    const document = this.document();
    const objectId = targetIds.length === 1 ? targetIds[0] : null;
    const bindings = objectId === null
      ? []
      : document.bindings.filter(binding => binding.objectId === objectId);
    return Object.freeze({
      version: SELECTION_INTERACTION_SERVICE_VERSION,
      selectionId: selection.id ?? null,
      targetIds: Object.freeze(targetIds),
      count: targetIds.length,
      editable: targetIds.length === 1 && Boolean(this.#object(targetIds[0])),
      objectId,
      bindings: Object.freeze(bindings)
    });
  }

  document() {
    return normalizeInteractionDocument(
      this.sandbox.getSnapshot().interactions
    );
  }

  runtimeBindings() {
    return Object.freeze(this.document().bindings.filter(binding =>
      binding.objectId === null || Boolean(this.#object(binding.objectId))
    ));
  }

  add({
    objectId = null,
    event: eventId,
    command,
    args = {},
    enabled = true
  } = {}) {
    const targetId = this.#targetId(objectId);
    const normalizedEvent = this.#requireEvent(eventId);
    const action = this.#prepareAction(command, args);
    const document = this.document();
    const binding = Object.freeze({
      id: String(this.createId()),
      event: normalizedEvent,
      objectId: targetId,
      enabled: enabled !== false,
      actions: Object.freeze([action])
    });
    const next = normalizeInteractionDocument({
      bindings: [...document.bindings, binding]
    });
    const changed = this.#replace(next);
    return Object.freeze({ changed, binding, document: next });
  }

  remove({ id, objectId = null } = {}) {
    const targetId = this.#targetId(objectId);
    const bindingId = String(id ?? "").trim();
    if (!bindingId) throw new TypeError("Binding a remover não informado.");
    const document = this.document();
    const binding = document.bindings.find(entry => entry.id === bindingId);
    if (!binding || binding.objectId !== targetId) {
      return Object.freeze({ changed: false, reason: "binding-not-found" });
    }
    const next = normalizeInteractionDocument({
      bindings: document.bindings.filter(entry => entry.id !== bindingId)
    });
    return Object.freeze({ changed: this.#replace(next), removed: binding });
  }

  setEnabled({ id, enabled, objectId = null } = {}) {
    const targetId = this.#targetId(objectId);
    const bindingId = String(id ?? "").trim();
    const document = this.document();
    let found = false;
    const bindings = document.bindings.map(binding => {
      if (binding.id !== bindingId || binding.objectId !== targetId) return binding;
      found = true;
      return Object.freeze({ ...binding, enabled: Boolean(enabled) });
    });
    if (!found) {
      return Object.freeze({ changed: false, reason: "binding-not-found" });
    }
    const next = normalizeInteractionDocument({ bindings });
    return Object.freeze({ changed: this.#replace(next), document: next });
  }

  #replace(document) {
    return this.sandbox.dispatch({
      type: "interaction.bindings.set",
      interactions: document,
      source: "selection.interactions"
    });
  }

  #targetId(requested) {
    const selection = this.selection.snapshot();
    const id = String(
      requested ??
      selection.activeMember?.objectId ??
      (selection.members?.length === 1 ? selection.members[0].objectId : "")
    ).trim();
    if (!id) throw new Error("Selecione exatamente um objeto.");
    if (!this.#object(id)) throw new Error(`Objeto inexistente: ${id}.`);
    return id;
  }

  #object(id) {
    return this.occurrenceResolver?.object?.(id) ?? this.sandbox.getObject?.(id) ??
      this.sandbox.getSnapshot().objects.find(object => String(object.id) === String(id)) ??
      null;
  }

  #requireEvent(value) {
    const id = normalizeInteractionEventId(value);
    if (
      !INTERACTION_EVENT_CATALOG.some(descriptor => descriptor.id === id) &&
      !id.startsWith("custom.")
    ) {
      throw new Error(`Evento ainda não publicável: ${id}.`);
    }
    return id;
  }

  #prepareAction(commandId, suppliedArgs) {
    const descriptor = this.#actionDescriptors().find(
      action => action.command === String(commandId)
    );
    if (!descriptor) {
      throw new Error(`Comando não autorizado como ação: ${commandId}.`);
    }
    const supplied = portableInteractionValue(
      suppliedArgs ?? {},
      "argumentos da ação"
    );
    const known = new Set(descriptor.parameters.map(parameter => parameter.id));
    const unknown = Object.keys(supplied).filter(key => !known.has(key));
    if (unknown.length) {
      throw new Error(`Argumentos desconhecidos para ${commandId}: ${unknown.join(", ")}.`);
    }
    const args = { ...descriptor.defaults };
    for (const parameter of descriptor.parameters) {
      const present = Object.hasOwn(supplied, parameter.id);
      const raw = present ? supplied[parameter.id] : parameter.default;
      if (raw === undefined || raw === "") {
        if (parameter.required) {
          throw new Error(`Parâmetro obrigatório: ${parameter.label}.`);
        }
        continue;
      }
      args[parameter.id] = normalizeParameterValue(parameter, raw);
    }
    return Object.freeze({
      type: "command",
      command: descriptor.command,
      args: portableInteractionValue(args, "argumentos normalizados")
    });
  }

  #actionDescriptors() {
    return this.commands.describe()
      .map(command => actionDescriptor(command))
      .filter(Boolean)
      .sort((left, right) =>
        left.label.localeCompare(right.label, "pt-BR") ||
        left.id.localeCompare(right.id)
      );
  }
}

function actionDescriptor(command) {
  const source = command?.metadata?.interactionAction;
  if (!source) return null;
  const configuration = source === true ? {} : source;
  const parameters = (configuration.parameters ?? []).map(parameter =>
    Object.freeze({
      id: String(parameter.id),
      label: String(parameter.label ?? parameter.id),
      type: String(parameter.type ?? "text"),
      required: parameter.required === true,
      ...(parameter.default === undefined
        ? {}
        : { default: portableInteractionValue(parameter.default) }),
      ...(parameter.placeholder == null
        ? {}
        : { placeholder: String(parameter.placeholder) }),
      values: Object.freeze([...(parameter.values ?? [])].map(String))
    })
  );
  return Object.freeze({
    id: String(configuration.id ?? command.id),
    command: String(command.id),
    label: String(configuration.label ?? command.metadata?.label ?? command.id),
    category: String(command.metadata?.category ?? "interaction"),
    defaults: portableInteractionValue(configuration.defaults ?? {}),
    parameters: Object.freeze(parameters)
  });
}

function normalizeParameterValue(parameter, raw) {
  if (parameter.type === "number") {
    const value = Number(raw);
    if (!Number.isFinite(value)) throw new TypeError(`${parameter.label}: número inválido.`);
    return value;
  }
  if (parameter.type === "boolean") {
    if (typeof raw === "boolean") return raw;
    if (["true", "1", "sim"].includes(String(raw).toLowerCase())) return true;
    if (["false", "0", "nao", "não"].includes(String(raw).toLowerCase())) return false;
    throw new TypeError(`${parameter.label}: valor booleano inválido.`);
  }
  if (parameter.type === "select") {
    const value = String(raw);
    if (parameter.values.length && !parameter.values.includes(value)) {
      throw new RangeError(`${parameter.label}: opção inválida.`);
    }
    return value;
  }
  if (parameter.type === "json") {
    return portableInteractionValue(
      typeof raw === "string" ? JSON.parse(raw) : raw,
      parameter.label
    );
  }
  return String(raw);
}

function uniqueIds(values) {
  return [...new Set((values ?? []).map(value => String(value)).filter(Boolean))];
}

function defaultId() {
  return globalThis.crypto?.randomUUID?.() ??
    `interaction-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function event(id, label, category) {
  return Object.freeze({ id, label, category, available: true });
}
