import * as THREE from "three";

export const SphereGeometryProvider = Object.freeze({
  type: "sphere",

  normalize(input = {}) {
    return Object.freeze({
      type: "sphere",
      radius: positive(input.radius ?? 1, "radius"),
      widthSegments: integerAtLeast(
        input.widthSegments ?? 24,
        3,
        "widthSegments"
      ),
      heightSegments: integerAtLeast(
        input.heightSegments ?? 16,
        2,
        "heightSegments"
      )
    });
  },

  key(descriptor) {
    return [
      descriptor.radius,
      descriptor.widthSegments,
      descriptor.heightSegments
    ].join(",");
  },

  create(descriptor) {
    return new THREE.SphereGeometry(
      descriptor.radius,
      descriptor.widthSegments,
      descriptor.heightSegments
    );
  }
});

function positive(value, name) {
  const number = Number(value);

  if (!Number.isFinite(number) || number <= 0) {
    throw new RangeError(`${name} deve ser positivo.`);
  }

  return number;
}

function integerAtLeast(value, minimum, name) {
  const number = Number(value);

  if (!Number.isInteger(number) || number < minimum) {
    throw new RangeError(
      `${name} deve ser inteiro maior ou igual a ${minimum}.`
    );
  }

  return number;
}
