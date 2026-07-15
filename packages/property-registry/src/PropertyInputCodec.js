export function parsePropertyInput(descriptor, input) {
  const values = Array.isArray(input) ? input : [input];

  switch (descriptor.valueType) {
    case "number":
      expectLength(values, 1, descriptor);
      return finiteNumber(values[0], descriptor);

    case "boolean":
      expectLength(values, 1, descriptor);
      return booleanValue(values[0], descriptor);

    case "vector2":
      return numericVector(values, 2, descriptor);

    case "vector3":
      return numericVector(values, 3, descriptor);

    case "vector4":
      return numericVector(values, 4, descriptor);

    default:
      expectLength(values, 1, descriptor);
      return values[0];
  }
}

export function formatPropertyValue(descriptor, value) {
  if (value === null || value === undefined) return "";

  if (descriptor.valueType.startsWith("vector")) {
    return value.map(component => formatNumber(component)).join(" ");
  }

  if (descriptor.valueType === "number") {
    return formatNumber(value);
  }

  return String(value);
}

export function propertyComponentCount(descriptor) {
  const match = /^vector([2-4])$/.exec(descriptor.valueType);
  return match ? Number(match[1]) : 1;
}

function numericVector(values, length, descriptor) {
  expectLength(values, length, descriptor);
  return values.map(value => finiteNumber(value, descriptor));
}

function finiteNumber(value, descriptor) {
  const result = Number(value);
  if (!Number.isFinite(result)) {
    throw new TypeError(
      `Valor numérico inválido para ${descriptor.id}: ${value}.`
    );
  }
  return result;
}

function booleanValue(value, descriptor) {
  if (value === true || value === false) return value;

  const source = String(value).trim().toLowerCase();
  if (["true", "on", "yes", "sim", "1"].includes(source)) return true;
  if (["false", "off", "no", "não", "nao", "0"].includes(source)) return false;

  throw new TypeError(
    `Booleano inválido para ${descriptor.id}: ${value}.`
  );
}

function expectLength(values, length, descriptor) {
  if (values.length !== length) {
    throw new Error(
      `${descriptor.id} exige ${length} valor(es).`
    );
  }
}

function formatNumber(value) {
  const number = Number(value);
  return Number.isInteger(number)
    ? String(number)
    : String(Number(number.toFixed(8)));
}
