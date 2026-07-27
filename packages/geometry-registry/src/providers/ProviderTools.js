export function finite(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new TypeError(`${name} inválido.`);
  }
  return number;
}

export function positive(value, name) {
  const number = finite(value, name);
  if (number <= 0) {
    throw new RangeError(`${name} deve ser positivo.`);
  }
  return number;
}

export function nonNegative(value, name) {
  const number = finite(value, name);
  if (number < 0) {
    throw new RangeError(`${name} não pode ser negativo.`);
  }
  return number;
}

export function integerAtLeast(value, minimum, name) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < minimum) {
    throw new RangeError(
      `${name} deve ser inteiro maior ou igual a ${minimum}.`
    );
  }
  return number;
}

export function canonicalDegrees(value, name) {
  const number = finite(value, name);
  const result = ((number % 360) + 360) % 360;
  return Object.is(result, -0) ? 0 : result;
}

export function positiveDegrees(value, name, { maximum = 360 } = {}) {
  const number = positive(value, name);
  if (number > maximum) {
    throw new RangeError(`${name} não pode exceder ${maximum} graus.`);
  }
  return number;
}

export function vector(value, length, fallback, {
  name = "vetor",
  positiveValues = false,
  integerValues = false,
  minimum = 0
} = {}) {
  const source = value === undefined ? fallback : value;
  if (!Array.isArray(source) || source.length !== length) {
    throw new TypeError(`${name} deve conter ${length} valores.`);
  }
  return source.map((component, index) => {
    const label = `${name}[${index}]`;
    if (integerValues) {
      return integerAtLeast(component, minimum, label);
    }
    return positiveValues
      ? positive(component, label)
      : finite(component, label);
  });
}

export function points2(value, name, { minimum = 2, fallback = null } = {}) {
  const source = value === undefined ? fallback : value;
  if (!Array.isArray(source) || source.length < minimum) {
    throw new TypeError(`${name} deve conter ao menos ${minimum} pontos 2D.`);
  }
  return source.map((point, index) =>
    vector(point, 2, null, { name: `${name}[${index}]` })
  );
}

export function points3(value, name, { minimum = 2, fallback = null } = {}) {
  const source = value === undefined ? fallback : value;
  if (!Array.isArray(source) || source.length < minimum) {
    throw new TypeError(`${name} deve conter ao menos ${minimum} pontos 3D.`);
  }
  return source.map((point, index) =>
    vector(point, 3, null, { name: `${name}[${index}]` })
  );
}

export function optionalPoints2(value, name) {
  if (value === undefined || value === null) return [];
  if (Array.isArray(value) && value.length === 0) return [];
  return points2(value, name, { minimum: 1 });
}

export function optionalPoints3(value, name) {
  if (value === undefined || value === null) return [];
  if (Array.isArray(value) && value.length === 0) return [];
  return points3(value, name, { minimum: 1 });
}

export function holes2(value, name = "holes") {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw new TypeError(`${name} deve formar uma lista de contornos.`);
  }
  return value.map((hole, index) =>
    points2(hole, `${name}[${index}]`, { minimum: 3 })
  );
}

export function integerArray(value, name, {
  minimumLength = 0,
  minimumValue = 0,
  multipleOf = null,
  fallback = null
} = {}) {
  const source = value === undefined ? fallback : value;
  if (!Array.isArray(source) || source.length < minimumLength) {
    throw new TypeError(
      `${name} deve conter ao menos ${minimumLength} inteiros.`
    );
  }
  if (multipleOf && source.length % multipleOf !== 0) {
    throw new RangeError(
      `${name} deve ter quantidade múltipla de ${multipleOf}.`
    );
  }
  return source.map((item, index) =>
    integerAtLeast(item, minimumValue, `${name}[${index}]`)
  );
}

export function enumValue(value, allowed, fallback, name) {
  const normalized = String(value ?? fallback).trim().toLowerCase();
  if (!allowed.includes(normalized)) {
    throw new RangeError(
      `${name} deve ser um de: ${allowed.join(", ")}.`
    );
  }
  return normalized;
}

export function radians(degrees) {
  return Number(degrees) * Math.PI / 180;
}

export function flatten(points) {
  return points.flatMap(point => [...point]);
}
