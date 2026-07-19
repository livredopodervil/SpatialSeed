export const ANIMATION_PRESET_VERSION = "animation-preset-v1";

const AXES = Object.freeze(["x", "y", "z"]);

const DEFINITIONS = Object.freeze([
  preset("spin", "Giro", "Rotação contínua em torno do pivô local.", [
    axisParameter("axis", "Eixo", "y"),
    numberParameter("speed", "Velocidade (graus/s)", 45, -720, 720)
  ]),
  preset("orbit", "Órbita", "Movimento circular que parte da posição atual.", [
    axisParameter("axis", "Normal da órbita", "y"),
    numberParameter("radius", "Raio", 3, 0, 100),
    numberParameter("speed", "Velocidade (graus/s)", 45, -720, 720)
  ]),
  preset("float", "Flutuação", "Oscilação senoidal ao longo de um eixo.", [
    axisParameter("axis", "Eixo", "y"),
    numberParameter("amplitude", "Amplitude", 1, 0, 100),
    numberParameter("frequency", "Frequência (Hz)", 0.5, 0.01, 20)
  ]),
  preset("pulse", "Pulso", "Escala uniforme periódica em torno do pivô.", [
    numberParameter("amplitude", "Amplitude", 0.2, 0, 0.95),
    numberParameter("frequency", "Frequência (Hz)", 0.5, 0.01, 20)
  ]),
  preset("wave", "Onda", "Oscilação defasada entre os itens selecionados.", [
    axisParameter("axis", "Eixo", "y"),
    numberParameter("amplitude", "Amplitude", 1, 0, 100),
    numberParameter("frequency", "Frequência (Hz)", 0.5, 0.01, 20),
    numberParameter("phase", "Fase por item (rad)", 0.35, -100, 100)
  ])
]);

export function listAnimationPresets() {
  return deepFreeze(structuredClone(DEFINITIONS));
}

export function resolveAnimationPreset(id, input = {}) {
  const normalizedId = String(id ?? "").trim().toLowerCase();
  const definition = DEFINITIONS.find(item => item.id === normalizedId);
  if (!definition) {
    throw new Error(`Preset de animação desconhecido: ${normalizedId}.`);
  }

  const parameters = resolveParameters(definition, input);
  const operations = buildOperations(normalizedId, parameters);
  return deepFreeze({
    version: ANIMATION_PRESET_VERSION,
    id: normalizedId,
    title: definition.title,
    parameters,
    operations
  });
}

function buildOperations(id, parameters) {
  if (id === "spin") {
    return [{
      type: "rotate",
      value: axisVector(
        parameters.axis,
        `${numberSource(parameters.speed)} * t`
      )
    }];
  }

  if (id === "orbit") {
    const radius = numberSource(parameters.radius);
    const angle = `${numberSource(parameters.speed)} * t`;
    const cosine = `${radius} * (cosd(${angle}) - 1)`;
    const sine = `${radius} * sind(${angle})`;
    return [{
      type: "move",
      value: orbitVector(parameters.axis, cosine, sine)
    }];
  }

  if (id === "float") {
    const value = `${numberSource(parameters.amplitude)} * ` +
      `sin(tau * ${numberSource(parameters.frequency)} * t)`;
    return [{ type: "move", value: axisVector(parameters.axis, value) }];
  }

  if (id === "pulse") {
    const factor = `1 + ${numberSource(parameters.amplitude)} * ` +
      `sin(tau * ${numberSource(parameters.frequency)} * t)`;
    return [{ type: "scale", value: [factor, factor, factor] }];
  }

  const phase = `${numberSource(parameters.phase)} * (i - 1)`;
  const value = `${numberSource(parameters.amplitude)} * (` +
    `sin(tau * ${numberSource(parameters.frequency)} * t + ${phase}) - ` +
    `sin(${phase}))`;
  return [{ type: "move", value: axisVector(parameters.axis, value) }];
}

function resolveParameters(definition, input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError("Parâmetros de animação devem formar um objeto.");
  }
  const allowed = new Set(definition.parameters.map(item => item.id));
  for (const name of Object.keys(input)) {
    if (!allowed.has(name)) {
      throw new Error(`Parâmetro desconhecido em ${definition.id}: ${name}.`);
    }
  }

  return Object.fromEntries(definition.parameters.map(parameter => {
    const value = Object.hasOwn(input, parameter.id)
      ? input[parameter.id]
      : parameter.default;
    return [parameter.id, parameter.type === "axis"
      ? normalizeAxis(value, parameter.id)
      : normalizeNumber(value, parameter)];
  }));
}

function normalizeAxis(value, id) {
  const axis = String(value ?? "").trim().toLowerCase();
  if (!AXES.includes(axis)) {
    throw new RangeError(`${id} deve ser x, y ou z.`);
  }
  return axis;
}

function normalizeNumber(value, parameter) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new TypeError(`${parameter.id} deve ser numérico.`);
  }
  if (number < parameter.min || number > parameter.max) {
    throw new RangeError(
      `${parameter.id} deve estar entre ${parameter.min} e ${parameter.max}.`
    );
  }
  return number;
}

function axisVector(axis, value) {
  return AXES.map(candidate => candidate === axis ? value : 0);
}

function orbitVector(axis, cosine, sine) {
  if (axis === "x") return [0, cosine, sine];
  if (axis === "y") return [cosine, 0, sine];
  return [cosine, sine, 0];
}

function numberSource(value) {
  const number = Number(value);
  return Object.is(number, -0) ? "0" : String(number);
}

function preset(id, title, description, parameters) {
  return deepFreeze({
    version: ANIMATION_PRESET_VERSION,
    id,
    title,
    description,
    parameters
  });
}

function axisParameter(id, label, fallback) {
  return { type: "axis", id, label, default: fallback, options: AXES };
}

function numberParameter(id, label, fallback, min, max) {
  return { type: "number", id, label, default: fallback, min, max };
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}
