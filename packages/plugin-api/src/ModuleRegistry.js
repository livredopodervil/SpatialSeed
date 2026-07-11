export class ModuleRegistry {
  #modules = new Map();
  #failures = new Map();

  register(module) {
    const id = module?.manifest?.id;
    if (!id) throw new TypeError("module.manifest.id is required");
    if (this.#modules.has(id)) throw new Error(`Duplicate module: ${id}`);
    this.#modules.set(id, module);
  }

  async activateAll(context) {
    for (const [id, module] of this.#modules) {
      try { await module.activate(context); }
      catch (error) {
        this.#failures.set(id, error);
        console.error(`Module disabled: ${id}`, error);
      }
    }
  }

  describe() {
    return [...this.#modules.values()].map(module => ({
      ...module.manifest,
      failed:this.#failures.has(module.manifest.id)
    }));
  }
}
