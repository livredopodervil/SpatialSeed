import * as THREE from "three";

export const BoxGeometryProvider = Object.freeze({
  type: "box",
  topology: "closed-solid",
  label: "Caixa",
  parameters: Object.freeze([
    Object.freeze({id:"size",label:"Dimensões",type:"vector3",default:[1,1,1],minimum:0.001})
  ]),

  normalize(input = {}) {
    return Object.freeze({
      type: "box",
      size: vector(
        input.size,
        3,
        [1, 1, 1],
        { positive: true }
      )
    });
  },

  key(descriptor) {
    return descriptor.size.join(",");
  },

  create(descriptor) {
    return new THREE.BoxGeometry(...descriptor.size);
  }
});

function vector(values, length, fallback, { positive = false } = {}) {
  const source = Array.isArray(values) ? values : fallback;

  if (source.length !== length) {
    throw new TypeError(`Vetor deve conter ${length} valores.`);
  }

  return source.map(value => {
    const number = Number(value);

    if (!Number.isFinite(number)) {
      throw new TypeError(`Valor numérico inválido: ${value}.`);
    }

    if (positive && number <= 0) {
      throw new RangeError(`Valor deve ser positivo: ${value}.`);
    }

    return number;
  });
}
