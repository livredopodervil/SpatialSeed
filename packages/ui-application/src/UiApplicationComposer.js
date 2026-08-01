export class UiApplicationComposer {
  static apiVersion = "ui-application-composer-v1";

  #registry;
  #store;
  #unsubscribeStore;
  #unsubscribeRegistry;
  #listeners = new Set();
  #applying = false;

  constructor({ registry, store } = {}) {
    if (!registry) throw new TypeError("UiApplicationComposer exige registry.");
    if (!store) throw new TypeError("UiApplicationComposer exige store.");
    this.#registry = registry;
    this.#store = store;
    this.#unsubscribeStore = store.subscribe(() => this.apply());
    this.#unsubscribeRegistry = registry.subscribe(event => {
      if (this.#applying || !["registered", "unregistered"].includes(event.type)) return;
      this.#store.updateInstalledModules(this.#registry.describe().modules.map(module => module.id));
      this.apply();
    });
    this.apply();
  }

  dispose() {
    this.#unsubscribeStore?.();
    this.#unsubscribeRegistry?.();
    this.#listeners.clear();
  }

  apply() {
    if (this.#applying) return this.snapshot();
    this.#applying = true;
    try {
      const definition = this.#store.activeApplication();
      const installed = this.#registry.describe().modules.map(module => module.id);
      const disabled = new Set(definition.disabledModules);
      const moduleById = new Map(this.#registry.describe().modules.map(module => [module.id, module]));
      const candidates = definition.enabledModules.length
        ? definition.enabledModules.filter(id => installed.includes(id) && !disabled.has(id))
        : installed.filter(id => !disabled.has(id));
      const viable = candidates.filter(id => dependenciesAvailable(id, moduleById, disabled));
      const enabled = new Set(this.#registry.resolveEnabled(viable).filter(id => !disabled.has(id)));
      // Apply disables first so exclusivity and dependent state converge before activation.
      for (const moduleId of [...installed].reverse()) {
        if (!enabled.has(moduleId) && this.#registry.isEnabled(moduleId)) {
          this.#registry.setEnabled(moduleId, false, { cascade: true });
        }
      }
      for (const moduleId of enabled) {
        if (!this.#registry.isEnabled(moduleId)) {
          this.#registry.setEnabled(moduleId, true, { cascade: true });
        }
      }
      const snapshot = this.snapshot();
      for (const listener of this.#listeners) listener(snapshot);
      return snapshot;
    } finally {
      this.#applying = false;
    }
  }

  snapshot() {
    const definition = this.#store.activeApplication();
    const modules = this.#registry.describe().modules;
    return Object.freeze({
      apiVersion: UiApplicationComposer.apiVersion,
      application: definition,
      modules: Object.freeze(modules.map(module => Object.freeze({
        ...module,
        enabled: this.#registry.isEnabled(module.id)
      })))
    });
  }

  subscribe(listener) {
    if (typeof listener !== "function") throw new TypeError("Listener do compositor inválido.");
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }
}

function dependenciesAvailable(moduleId, moduleById, disabled, visiting = new Set()) {
  if (disabled.has(moduleId)) return false;
  if (visiting.has(moduleId)) return false;
  const module = moduleById.get(moduleId);
  if (!module) return false;
  const next = new Set(visiting);
  next.add(moduleId);
  return module.dependencies.every(dependency =>
    !disabled.has(dependency) && dependenciesAvailable(dependency, moduleById, disabled, next)
  );
}
