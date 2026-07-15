export class PropertyRegistry {
  static apiVersion = "property-registry-v1";
  #descriptors = new Map();

  register(input) {
    const descriptor = normalizeDescriptor(input);

    if (this.#descriptors.has(descriptor.id)) {
      throw new Error(`Propriedade já registrada: ${descriptor.id}.`);
    }

    this.#descriptors.set(descriptor.id, descriptor);
    return this;
  }

  get(id) {
    return this.#descriptors.get(String(id)) ?? null;
  }

  require(id) {
    const descriptor = this.get(id);

    if (!descriptor) {
      throw new Error(`Propriedade desconhecida: ${id}.`);
    }

    return descriptor;
  }

  list() {
    return [...this.#descriptors.values()];
  }

  describe() {
    return Object.freeze({
      apiVersion: PropertyRegistry.apiVersion,
      properties: Object.freeze(this.list().map(descriptor =>
        Object.freeze({
          id: descriptor.id,
          label: descriptor.label,
          group: descriptor.group,
          scope: descriptor.scope,
          valueType: descriptor.valueType,
          nullable: descriptor.nullable,
          editableMany: descriptor.editableMany,
          values: descriptor.values
        })
      ))
    });
  }

  inspect(objects, context = {}) {
    const members = Array.isArray(objects) ? objects : [];
    const properties = {};

    for (const descriptor of this.#descriptors.values()) {
      const supported = members.map(object =>
        descriptor.supports(object, context)
      );

      if (!members.length || supported.some(value => !value)) {
        properties[descriptor.id] = Object.freeze({
          id: descriptor.id,
          status: "unsupported",
          editable: false,
          value: null
        });
        continue;
      }

      const values = members.map(object =>
        structuredClone(descriptor.read(object, context))
      );
      const uniform = values.every(value =>
        equalValue(value, values[0])
      );

      properties[descriptor.id] = Object.freeze({
        id: descriptor.id,
        status: uniform ? "uniform" : "mixed",
        editable: members.length === 1 || descriptor.editableMany,
        value: uniform ? values[0] : null
      });
    }

    return Object.freeze(properties);
  }
}

function normalizeDescriptor(input) {
  if (!input || typeof input !== "object") {
    throw new TypeError("Descritor de propriedade inválido.");
  }

  const id = String(input.id ?? "").trim();

  if (!id || typeof input.read !== "function" || typeof input.normalize !== "function") {
    throw new TypeError(
      "Descritor exige id, read e normalize."
    );
  }

  return Object.freeze({
    id,
    label: String(input.label ?? id),
    group: String(input.group ?? "general"),
    scope: String(input.scope ?? "object"),
    path: Object.freeze([...(input.path ?? [])]),
    valueType: String(input.valueType ?? "unknown"),
    nullable: Boolean(input.nullable),
    editableMany: Boolean(input.editableMany),
    values: input.values
      ? Object.freeze([...input.values])
      : null,
    normalize: input.normalize,
    read: input.read,
    supports: typeof input.supports === "function"
      ? input.supports
      : () => true
  });
}

function equalValue(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}
