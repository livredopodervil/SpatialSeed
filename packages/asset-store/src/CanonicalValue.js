export function canonicalStringify(value) {
  return JSON.stringify(canonicalize(value));
}

export function canonicalize(value, seen = new WeakSet()) {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError(
        "Valores numéricos devem ser finitos."
      );
    }

    return Object.is(value, -0) ? 0 : value;
  }

  if (typeof value === "bigint") {
    return {
      $type: "bigint",
      value: value.toString()
    };
  }

  if (
    typeof value === "undefined" ||
    typeof value === "function" ||
    typeof value === "symbol"
  ) {
    throw new TypeError(
      `Tipo não serializável: ${typeof value}.`
    );
  }

  if (seen.has(value)) {
    throw new TypeError(
      "Estruturas cíclicas não são suportadas."
    );
  }

  seen.add(value);

  try {
    if (Array.isArray(value)) {
      return value.map(item =>
        canonicalize(item, seen)
      );
    }

    if (value instanceof Date) {
      return {
        $type: "date",
        value: value.toISOString()
      };
    }

    if (
      ArrayBuffer.isView(value) &&
      !(value instanceof DataView)
    ) {
      return {
        $type:
          value.constructor.name,
        value:
          Array.from(value)
      };
    }

    if (
      value instanceof ArrayBuffer
    ) {
      return {
        $type: "ArrayBuffer",
        value:
          Array.from(
            new Uint8Array(value)
          )
      };
    }

    const result = {};

    for (
      const key of
      Object.keys(value).sort()
    ) {
      result[key] =
        canonicalize(
          value[key],
          seen
        );
    }

    return result;
  } finally {
    seen.delete(value);
  }
}
