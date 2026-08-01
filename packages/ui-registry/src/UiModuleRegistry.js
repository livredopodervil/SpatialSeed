import {
  normalizeOverlayDescriptor,
  normalizePanelDescriptor,
  normalizeUiModuleDescriptor
} from "../../ui-contracts/src/index.js?build=20260801-0046d";
import { DescriptorRegistry } from "./DescriptorRegistry.js?build=20260801-0046d";
import { HudComponentRegistry } from "./HudComponentRegistry.js?build=20260801-0046d";

export class UiModuleRegistry {
  static apiVersion = "ui-module-registry-v2";

  #modules = new DescriptorRegistry({
    kind: "módulo de UI",
    normalize: value => normalizeUiModuleDescriptor(value)
  });
  #hud;
  #panels;
  #overlays;
  #moduleMembers = new Map();
  #moduleRuntimes = new Map();
  #enabled = new Map();
  #listeners = new Set();

  constructor({
    hudComponents = new HudComponentRegistry(),
    panels = new DescriptorRegistry({ kind: "painel", normalize: normalizePanelDescriptor }),
    overlays = new DescriptorRegistry({ kind: "overlay", normalize: normalizeOverlayDescriptor })
  } = {}) {
    this.#hud = hudComponents;
    this.#panels = panels;
    this.#overlays = overlays;
  }

  get hudComponents() { return this.#hud; }
  get panels() { return this.#panels; }
  get overlays() { return this.#overlays; }

  register(value, { runtimes = {}, replace = false, enabled = true } = {}) {
    const descriptor = normalizeUiModuleDescriptor(value);
    if (replace && this.#modules.has(descriptor.id)) this.unregister(descriptor.id, { force: true });
    this.#modules.register(descriptor);
    const members = { hud: [], panels: [], overlays: [] };
    try {
      for (const component of descriptor.hudComponents) {
        this.#hud.register(component, {
          runtime: runtimes.hudComponents?.[component.id] ?? null
        });
        members.hud.push(component.id);
      }
      for (const panel of descriptor.panels) {
        this.#panels.register(panel, {
          runtime: runtimes.panels?.[panel.id] ?? null
        });
        members.panels.push(panel.id);
      }
      for (const overlay of descriptor.overlays) {
        this.#overlays.register(overlay, {
          runtime: runtimes.overlays?.[overlay.id] ?? null
        });
        members.overlays.push(overlay.id);
      }
      this.#moduleMembers.set(descriptor.id, members);
      this.#moduleRuntimes.set(descriptor.id, normalizeModuleRuntime(runtimes.module));
      this.#enabled.set(descriptor.id, false);
      this.setEnabled(descriptor.id, enabled, { cascade: true });
      this.#emit({ type: "registered", id: descriptor.id });
      return descriptor;
    } catch (error) {
      for (const id of members.hud) this.#hud.unregister(id);
      for (const id of members.panels) this.#panels.unregister(id);
      for (const id of members.overlays) this.#overlays.unregister(id);
      this.#moduleMembers.delete(descriptor.id);
      this.#moduleRuntimes.delete(descriptor.id);
      this.#enabled.delete(descriptor.id);
      this.#modules.unregister(descriptor.id);
      throw error;
    }
  }

  unregister(moduleId, { force = false } = {}) {
    const id = String(moduleId ?? "").trim();
    if (!this.#modules.has(id)) return false;
    const dependents = this.dependentsOf(id).filter(dependent => this.isEnabled(dependent));
    if (dependents.length && !force) {
      throw new Error(`O módulo ${id} ainda é exigido por: ${dependents.join(", ")}.`);
    }
    if (force) {
      for (const dependent of dependents) this.setEnabled(dependent, false, { cascade: true });
    }
    this.setEnabled(id, false, { cascade: true });
    const runtime = this.#moduleRuntimes.get(id);
    try { runtime?.dispose?.({ module: this.#modules.get(id), registry: this }); }
    catch (error) { console.error(`Falha ao liberar módulo de UI ${id}`, error); }
    const members = this.#moduleMembers.get(id);
    if (members) {
      for (const member of members.hud) this.#hud.unregister(member);
      for (const member of members.panels) this.#panels.unregister(member);
      for (const member of members.overlays) this.#overlays.unregister(member);
      this.#moduleMembers.delete(id);
    }
    this.#moduleRuntimes.delete(id);
    this.#enabled.delete(id);
    const removed = this.#modules.unregister(id);
    if (removed) this.#emit({ type: "unregistered", id });
    return removed;
  }

  setEnabled(moduleId, enabled, { cascade = false } = {}) {
    const id = String(moduleId ?? "").trim();
    const descriptor = this.#modules.get(id);
    if (!descriptor) throw new Error(`Módulo de UI inexistente: ${id}.`);
    const next = Boolean(enabled);
    if (next) {
      const missing = descriptor.dependencies.filter(dependency => !this.#modules.has(dependency));
      if (missing.length) throw new Error(`Dependências ausentes para ${id}: ${missing.join(", ")}.`);
      for (const dependency of descriptor.dependencies) {
        if (!this.isEnabled(dependency)) {
          if (!cascade) throw new Error(`Ative primeiro a dependência ${dependency}.`);
          this.setEnabled(dependency, true, { cascade: true });
        }
      }
    } else {
      const activeDependents = this.dependentsOf(id).filter(dependent => this.isEnabled(dependent));
      if (activeDependents.length && !cascade) {
        throw new Error(`Não é possível desativar ${id}; dependentes ativos: ${activeDependents.join(", ")}.`);
      }
      if (cascade) {
        for (const dependent of activeDependents) this.setEnabled(dependent, false, { cascade: true });
      }
    }
    if (this.#enabled.get(id) === next) return false;
    const runtime = this.#moduleRuntimes.get(id);
    const previous = !next;
    this.#enabled.set(id, next);
    try {
      if (next) runtime?.activate?.({ module: descriptor, registry: this });
      else runtime?.deactivate?.({ module: descriptor, registry: this });
    } catch (error) {
      this.#enabled.set(id, previous);
      throw error;
    }
    this.#emit({ type: next ? "enabled" : "disabled", id });
    return true;
  }

  isEnabled(moduleId) {
    return this.#enabled.get(String(moduleId ?? "").trim()) === true;
  }

  dependentsOf(moduleId) {
    const id = String(moduleId ?? "").trim();
    return this.#modules.describe()
      .filter(module => module.dependencies.includes(id))
      .map(module => module.id);
  }

  resolveEnabled(moduleIds = null) {
    const requested = moduleIds == null
      ? this.#modules.describe().filter(module => this.isEnabled(module.id)).map(module => module.id)
      : [...new Set(moduleIds.map(id => String(id ?? "").trim()).filter(Boolean))];
    const resolved = new Set();
    const visiting = new Set();
    const visit = id => {
      if (resolved.has(id)) return;
      if (visiting.has(id)) throw new Error(`Ciclo de dependências de UI em ${id}.`);
      const module = this.#modules.get(id);
      if (!module) throw new Error(`Módulo de UI desconhecido: ${id}.`);
      visiting.add(id);
      for (const dependency of module.dependencies) visit(dependency);
      visiting.delete(id);
      resolved.add(id);
    };
    for (const id of requested) visit(id);
    return Object.freeze([...resolved]);
  }

  describe({ activeOnly = false } = {}) {
    const modules = this.#modules.describe()
      .filter(module => !activeOnly || this.isEnabled(module.id))
      .map(module => Object.freeze({ ...module, enabled: this.isEnabled(module.id) }));
    const enabledIds = new Set(modules.filter(module => module.enabled).map(module => module.id));
    const visible = descriptor => !activeOnly || !descriptor.sourceModule || enabledIds.has(descriptor.sourceModule);
    return Object.freeze({
      apiVersion: UiModuleRegistry.apiVersion,
      modules: Object.freeze(modules),
      hudComponents: Object.freeze(this.#hud.describe().filter(visible)),
      panels: Object.freeze(this.#panels.describe().filter(visible)),
      overlays: Object.freeze(this.#overlays.describe().filter(visible))
    });
  }

  subscribe(listener) {
    if (typeof listener !== "function") throw new TypeError("Listener de módulos inválido.");
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }


  #emit(event) {
    const snapshot = Object.freeze({ ...event, registry: this.describe() });
    for (const listener of this.#listeners) listener(snapshot);
  }
}

function normalizeModuleRuntime(value) {
  if (!value || typeof value !== "object") return null;
  return Object.freeze({
    activate: typeof value.activate === "function" ? value.activate : null,
    deactivate: typeof value.deactivate === "function" ? value.deactivate : null,
    dispose: typeof value.dispose === "function" ? value.dispose : null
  });
}
