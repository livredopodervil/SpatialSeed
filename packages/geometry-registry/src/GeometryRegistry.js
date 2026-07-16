import {
  normalizeGeometryDescriptor,
  geometryDescriptorKey
} from "./GeometryDescriptor.js";

export class GeometryRegistry {
  #providers = new Map();

  register(provider) {
    validateProvider(provider);

    const type = String(provider.type).trim().toLowerCase();

    if (this.#providers.has(type)) {
      throw new Error(`Provider de geometria já registrado: ${type}.`);
    }

    this.#providers.set(type, provider);
    return this;
  }

  has(type) {
    return this.#providers.has(
      String(type).trim().toLowerCase()
    );
  }

  provider(type) {
    const normalized = String(type).trim().toLowerCase();
    const provider = this.#providers.get(normalized);

    if (!provider) {
      throw new Error(`Geometria não registrada: ${normalized}.`);
    }

    return provider;
  }

  normalize(input) {
    const descriptor = normalizeGeometryDescriptor(input);
    const provider = this.provider(descriptor.type);
    const normalized = provider.normalize(descriptor);

    return Object.freeze({
      ...normalized,
      type: descriptor.type
    });
  }

  key(input) {
    const descriptor = this.normalize(input);
    const provider = this.provider(descriptor.type);

    return `${descriptor.type}:${provider.key?.(descriptor) ?? geometryDescriptorKey(descriptor)}`;
  }

  create(input) {
    const descriptor = this.normalize(input);
    const provider = this.provider(descriptor.type);

    return provider.create(descriptor);
  }

  renderProfile(input) {
    const descriptor = this.normalize(input);
    const provider = this.provider(descriptor.type);
    const topology = provider.topology ?? "closed-solid";

    return Object.freeze({
      topology,
      side: topology === "open-surface" ? "double" : "front"
    });
  }

  describeLegacyObject(object) {
    if (object?.geometry) {
      return this.normalize(object.geometry);
    }

    if (object?.kind === "box") {
      return this.normalize({
        type: "box",
        size: object.size
      });
    }

    throw new Error(
      `Objeto sem descritor geométrico compatível: ${object?.id ?? "(sem id)"}.`
    );
  }

  list() {
    return [...this.#providers.keys()];
  }

  describe() {
    return [...this.#providers.values()].map(provider => Object.freeze({
      type: provider.type,
      label: provider.label ?? provider.type,
      topology: provider.topology ?? "closed-solid",
      parameters: Object.freeze(
        structuredClone(provider.parameters ?? [])
          .map(parameter => Object.freeze(parameter))
      )
    }));
  }
}

function validateProvider(provider) {
  if (!provider || typeof provider !== "object") {
    throw new TypeError("Provider de geometria inválido.");
  }

  if (!String(provider.type ?? "").trim()) {
    throw new TypeError("Provider sem type.");
  }

  if (
    provider.topology !== undefined &&
    !["closed-solid", "open-surface"].includes(provider.topology)
  ) {
    throw new TypeError(
      `Topologia geométrica inválida: ${provider.topology}.`
    );
  }

  for (const method of ["normalize", "create"]) {
    if (typeof provider[method] !== "function") {
      throw new TypeError(`Provider sem método ${method}().`);
    }
  }
}
