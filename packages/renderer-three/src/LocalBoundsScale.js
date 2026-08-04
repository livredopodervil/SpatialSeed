import * as THREE from "three";

const AXIS_NAMES = Object.freeze(["x", "y", "z"]);
const MINIMUM_SCALE = 1e-4;
const EXTENT_EPSILON = 1e-9;

export function normalizeScaleAxes(value = {}) {
  return Object.freeze({
    x: value?.x !== false,
    y: value?.y !== false,
    z: value?.z !== false
  });
}

export function createLocalBoundsScaleHandleSet({
  min,
  max,
  axes = { x: true, y: true, z: true }
} = {}) {
  const minimum = vector3(min, "Limite mínimo");
  const maximum = vector3(max, "Limite máximo");
  const requested = normalizeScaleAxes(axes);
  const center = minimum.map((value, index) =>
    value + (maximum[index] - value) * 0.5
  );
  const effective = Object.freeze(Object.fromEntries(
    AXIS_NAMES.map((axis, index) => [
      axis,
      requested[axis] &&
        Math.abs(maximum[index] - minimum[index]) > EXTENT_EPSILON
    ])
  ));
  const enabledIndices = AXIS_NAMES
    .map((axis, index) => effective[axis] ? index : -1)
    .filter(index => index >= 0);

  if (enabledIndices.length < 2) {
    return Object.freeze({
      axes: effective,
      dimensions: enabledIndices.length,
      handles: Object.freeze([])
    });
  }

  const signs = [];
  const enumerate = (ordinal, current) => {
    if (ordinal >= enabledIndices.length) {
      signs.push(Object.freeze([...current]));
      return;
    }
    const axisIndex = enabledIndices[ordinal];
    current[axisIndex] = -1;
    enumerate(ordinal + 1, current);
    current[axisIndex] = 1;
    enumerate(ordinal + 1, current);
    current[axisIndex] = 0;
  };
  enumerate(0, [0, 0, 0]);

  const key = value => value.join(",");
  const indexBySigns = new Map(
    signs.map((value, index) => [key(value), index])
  );
  const handles = signs.map((value, index) => {
    const point = value.map((sign, axisIndex) =>
      sign < 0
        ? minimum[axisIndex]
        : sign > 0
          ? maximum[axisIndex]
          : center[axisIndex]
    );
    const oppositeSigns = value.map(sign => -sign);
    return Object.freeze({
      index,
      signs: value,
      point: Object.freeze(point),
      oppositeIndex: indexBySigns.get(key(oppositeSigns))
    });
  });

  return Object.freeze({
    axes: effective,
    dimensions: enabledIndices.length,
    handles: Object.freeze(handles)
  });
}

export function proportionalScaleFactor2D({
  fixed,
  initial,
  current,
  snap = null,
  minimum = MINIMUM_SCALE,
  fallbackDirection = [1, 0],
  fallbackLength = 80
} = {}) {
  const origin = vector2(fixed, "Ponto fixo");
  const source = vector2(initial, "Ponto inicial");
  const target = vector2(current, "Ponto atual");
  const dx = source[0] - origin[0];
  const dy = source[1] - origin[1];
  const denominator = dx * dx + dy * dy;

  let factor;
  if (denominator <= 1e-12) {
    const direction = normalizedDirection2(
      fallbackDirection,
      "Direção alternativa"
    );
    const referenceLength = Math.max(
      Number(fallbackLength) || 80,
      16
    );
    factor = 1 + (
      (target[0] - source[0]) * direction[0] +
      (target[1] - source[1]) * direction[1]
    ) / referenceLength;
  } else {
    factor = (
      (target[0] - origin[0]) * dx +
      (target[1] - origin[1]) * dy
    ) / denominator;
  }
  const step = Number(snap);
  if (Number.isFinite(step) && step > 0) {
    factor = Math.round(factor / step) * step;
  }
  const floor = Math.max(Number(minimum) || MINIMUM_SCALE, MINIMUM_SCALE);
  return Math.max(floor, factor);
}

export function scaleFactorsForAxes(factor, axes = {}) {
  const value = Number(factor);
  if (!Number.isFinite(value)) {
    throw new TypeError("Fator de escala inválido.");
  }
  const enabled = normalizeScaleAxes(axes);
  return Object.freeze([
    enabled.x ? value : 1,
    enabled.y ? value : 1,
    enabled.z ? value : 1
  ]);
}

export function scaleWorldTrsWithoutShear({
  matrixWorld,
  pivotWorld,
  frameQuaternion,
  factors
} = {}) {
  const matrix = matrix4(matrixWorld, "Matriz mundial");
  const pivot = new THREE.Vector3().fromArray(
    vector3(pivotWorld, "Pivô mundial")
  );
  const frame = new THREE.Quaternion().fromArray(
    quaternion(frameQuaternion, "Quaternion do frame")
  ).normalize();
  const frameInverse = frame.clone().invert();
  const scaleFactors = new THREE.Vector3().fromArray(
    vector3(factors, "Fatores de escala")
  );
  for (const component of scaleFactors.toArray()) {
    if (component < MINIMUM_SCALE) {
      throw new RangeError("A escala deve permanecer positiva.");
    }
  }

  const position = new THREE.Vector3();
  const orientation = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  matrix.decompose(position, orientation, scale);

  position
    .sub(pivot)
    .applyQuaternion(frameInverse)
    .multiply(scaleFactors)
    .applyQuaternion(frame)
    .add(pivot);
  scale.multiply(scaleFactors);

  return Object.freeze(
    new THREE.Matrix4()
      .compose(position, orientation, scale)
      .toArray()
  );
}

function normalizedDirection2(value, label) {
  const direction = vector2(value, label);
  const length = Math.hypot(direction[0], direction[1]);
  if (length <= 1e-12) return [1, 0];
  return direction.map(component => component / length);
}

function vector2(value, label) {
  if (
    !Array.isArray(value) ||
    value.length !== 2 ||
    !value.every(Number.isFinite)
  ) {
    throw new TypeError(`${label} deve conter dois valores finitos.`);
  }
  return value.map(Number);
}

function vector3(value, label) {
  if (
    !Array.isArray(value) ||
    value.length !== 3 ||
    !value.every(Number.isFinite)
  ) {
    throw new TypeError(`${label} deve conter três valores finitos.`);
  }
  return value.map(Number);
}

function quaternion(value, label) {
  if (
    !Array.isArray(value) ||
    value.length !== 4 ||
    !value.every(Number.isFinite)
  ) {
    throw new TypeError(`${label} deve conter quatro valores finitos.`);
  }
  return value.map(Number);
}

function matrix4(value, label) {
  if (
    !Array.isArray(value) ||
    value.length !== 16 ||
    !value.every(Number.isFinite)
  ) {
    throw new TypeError(`${label} deve conter 16 valores finitos.`);
  }
  const matrix = new THREE.Matrix4().fromArray(value);
  if (Math.abs(matrix.determinant()) <= 1e-12) {
    throw new RangeError(`${label} não pode ser singular.`);
  }
  return matrix;
}
