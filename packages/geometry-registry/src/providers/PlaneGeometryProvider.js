import * as THREE from "three";

export const PlaneGeometryProvider = Object.freeze({
  type: "plane",
  topology: "open-surface",

  normalize(input = {}) {
    return Object.freeze({
      type: "plane",
      width: positive(input.width ?? 2, "width"),
      height: positive(input.height ?? 2, "height"),
      widthSegments: integerAtLeast(
        input.widthSegments ?? 1,
        1,
        "widthSegments"
      ),
      heightSegments: integerAtLeast(
        input.heightSegments ?? 1,
        1,
        "heightSegments"
      )
    });
  },

  key(descriptor) {
    return [
      descriptor.width,
      descriptor.height,
      descriptor.widthSegments,
      descriptor.heightSegments
    ].join(",");
  },

  create(descriptor) {
    return new THREE.PlaneGeometry(
      descriptor.width,
      descriptor.height,
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
