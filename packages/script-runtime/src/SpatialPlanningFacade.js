export const SPATIAL_CREATE_COMMAND = "object.create.geometry";

const CREATION_KEYS = new Set([
  "name",
  "position",
  "rotation",
  "placement",
  "color"
]);

export function createSpatialPlanningFacade({
  run,
  geometryTypes = []
} = {}) {
  if (
    !run ||
    typeof run.createHandle !== "function" ||
    typeof run.emit !== "function"
  ) {
    throw new TypeError("Execução espacial incompatível.");
  }

  const supported = Object.freeze(
    [...new Set(geometryTypes.map(normalizeType))].sort()
  );
  const supportedSet = new Set(supported);

  const facade = {
    geometries: supported,

    create(type, options = {}) {
      const normalizedType = normalizeType(type);

      if (!supportedSet.has(normalizedType)) {
        throw new Error(
          `Geometria não permitida no programa: ${normalizedType}.`
        );
      }

      const normalized = normalizeCreationOptions(
        normalizedType,
        options
      );
      const handle = run.createHandle("object");

      run.emit(SPATIAL_CREATE_COMMAND, {
        handle,
        ...normalized
      });

      return handle;
    },

    stats() {
      return Object.freeze({
        commandCount: run.commandCount,
        geometries: supported
      });
    }
  };

  return Object.freeze(facade);
}

function normalizeCreationOptions(type, options) {
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    throw new TypeError("Opções de criação devem formar um objeto.");
  }

  const source = clone(options, "Opções de criação");
  const explicitGeometry = source.geometry ?? {};

  if (
    !explicitGeometry ||
    typeof explicitGeometry !== "object" ||
    Array.isArray(explicitGeometry)
  ) {
    throw new TypeError("geometry deve formar um objeto.");
  }

  const geometry = {
    ...explicitGeometry,
    ...Object.fromEntries(
      Object.entries(source).filter(([name]) =>
        name !== "geometry" && !CREATION_KEYS.has(name)
      )
    ),
    type
  };
  const result = { geometry };

  if (source.name !== undefined) {
    result.name = nonEmptyString(source.name, "name");
  }
  if (source.position !== undefined) {
    result.position = finiteVector(source.position, 3, "position");
  }
  if (source.rotation !== undefined) {
    result.rotation = finiteVector(source.rotation, 4, "rotation");
  }
  if (source.placement !== undefined) {
    if (
      !source.placement ||
      typeof source.placement !== "object" ||
      Array.isArray(source.placement)
    ) {
      throw new TypeError("placement deve formar um objeto.");
    }
    result.placement = clone(source.placement, "placement");
  }
  if (source.color !== undefined) {
    result.color = nonEmptyString(source.color, "color");
  }

  return clone(result, "Plano de criação");
}

function normalizeType(value) {
  return nonEmptyString(value, "type").toLowerCase();
}

function finiteVector(value, length, label) {
  if (!Array.isArray(value) || value.length !== length) {
    throw new TypeError(`${label} deve conter ${length} números.`);
  }

  return value.map(component => {
    const number = Number(component);
    if (!Number.isFinite(number)) {
      throw new TypeError(`${label} contém valor não finito.`);
    }
    return number;
  });
}

function nonEmptyString(value, label) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new TypeError(`${label} deve ser texto não vazio.`);
  return normalized;
}

function clone(value, label) {
  try {
    return structuredClone(value);
  } catch (error) {
    throw new TypeError(
      `${label} deve ser serializável por structuredClone.`,
      { cause: error }
    );
  }
}
