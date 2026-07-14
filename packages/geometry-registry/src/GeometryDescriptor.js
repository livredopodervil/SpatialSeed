export function normalizeGeometryDescriptor(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError("Descritor de geometria deve ser um objeto.");
  }

  const type = String(input.type ?? "").trim().toLowerCase();

  if (!type) {
    throw new TypeError("Descritor de geometria sem type.");
  }

  return Object.freeze({
    ...structuredClone(input),
    type
  });
}

export function geometryDescriptorKey(descriptor) {
  return stableStringify(normalizeGeometryDescriptor(descriptor));
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return "[" + value.map(stableStringify).join(",") + "]";
  }

  if (value && typeof value === "object") {
    return "{" + Object.keys(value)
      .sort()
      .map(key =>
        JSON.stringify(key) + ":" + stableStringify(value[key])
      )
      .join(",") + "}";
  }

  return JSON.stringify(value);
}
