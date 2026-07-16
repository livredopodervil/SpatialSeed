import * as THREE from "three";

export const PolygonGeometryProvider = Object.freeze({
  type: "polygon",

  normalize(input = {}) {
    return Object.freeze({
      type: "polygon",
      sides: integerAtLeast(input.sides ?? 6,3,"sides"),
      radius: positive(input.radius ?? 1,"radius"),
      startAngleDeg:canonicalAngle(
        input.startAngleDeg ?? 0,
        "startAngleDeg"
      )
    });
  },

  key(descriptor) {
    return [
      descriptor.sides,
      descriptor.radius,
      descriptor.startAngleDeg
    ].join(",");
  },

  create(descriptor) {
    return new THREE.CircleGeometry(
      descriptor.radius,
      descriptor.sides,
      THREE.MathUtils.degToRad(descriptor.startAngleDeg),
      Math.PI*2
    );
  }
});

function positive(value, name) {
  const number=Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    throw new RangeError(`${name} deve ser positivo.`);
  }
  return number;
}

function integerAtLeast(value, minimum, name) {
  const number=Number(value);
  if (!Number.isInteger(number) || number < minimum) {
    throw new RangeError(
      `${name} deve ser inteiro maior ou igual a ${minimum}.`
    );
  }
  return number;
}

function canonicalAngle(value, name) {
  const number=Number(value);
  if (!Number.isFinite(number)) throw new TypeError(`${name} inválido.`);
  const result=((number%360)+360)%360;
  return Object.is(result,-0) ? 0 : result;
}
