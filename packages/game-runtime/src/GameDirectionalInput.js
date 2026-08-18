export const GAME_DIRECTIONAL_INPUT_VERSION =
  "game-directional-input-v1-analog-radial";

/**
 * Converte o deslocamento táctil de um controle circular nos dois eixos
 * canônicos aceitos por GameRuntime. A zona morta evita deriva no centro e o
 * módulo preserva intensidade, permitindo andar em qualquer direção.
 */
export function normalizeGameDirectionalInput({
  offsetX = 0,
  offsetY = 0,
  radius = 1,
  deadZone = 0.12
} = {}) {
  const safeRadius = positiveFinite(radius, "radius");
  const safeDeadZone = ranged(deadZone, 0, 0.95, "deadZone");
  const rawX = finite(offsetX, "offsetX") / safeRadius;
  const rawY = finite(offsetY, "offsetY") / safeRadius;
  const rawLength = Math.hypot(rawX, rawY);
  const visualScale = rawLength > 1 ? 1 / rawLength : 1;
  const x = rawX * visualScale;
  const y = rawY * visualScale;
  const clampedLength = Math.min(1, rawLength);
  const magnitude = clampedLength <= safeDeadZone
    ? 0
    : (clampedLength - safeDeadZone) / (1 - safeDeadZone);
  const directionLength = Math.hypot(x, y);
  const directionX = directionLength > 1e-9 ? x / directionLength : 0;
  const directionY = directionLength > 1e-9 ? y / directionLength : 0;
  return Object.freeze({
    x,
    y,
    magnitude,
    forward: -directionY * magnitude,
    strafe: directionX * magnitude
  });
}

function finite(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new TypeError(`${label} deve ser finito.`);
  return number;
}

function positiveFinite(value, label) {
  const number = finite(value, label);
  if (number <= 0) throw new RangeError(`${label} deve ser positivo.`);
  return number;
}

function ranged(value, minimum, maximum, label) {
  const number = finite(value, label);
  if (number < minimum || number > maximum) {
    throw new RangeError(`${label} deve estar entre ${minimum} e ${maximum}.`);
  }
  return number;
}
