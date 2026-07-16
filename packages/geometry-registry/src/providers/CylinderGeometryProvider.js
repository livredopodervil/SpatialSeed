import * as THREE from "three";

export const CylinderGeometryProvider = Object.freeze({
  type: "cylinder",
  topology: "closed-solid",
  label: "Cilindro / cone",
  parameters: Object.freeze([
    Object.freeze({id:"radiusTop",label:"Raio superior",type:"number",default:1,minimum:0}),
    Object.freeze({id:"radiusBottom",label:"Raio inferior",type:"number",default:1,minimum:0}),
    Object.freeze({id:"height",label:"Altura",type:"number",default:2,minimum:0.001}),
    Object.freeze({id:"radialSegments",label:"Segmentos radiais",type:"integer",default:24,minimum:3}),
    Object.freeze({id:"heightSegments",label:"Segmentos de altura",type:"integer",default:1,minimum:1}),
    Object.freeze({id:"openEnded",label:"Extremidades abertas",type:"boolean",default:false})
  ]),

  normalize(input = {}) {
    return Object.freeze({
      type: "cylinder",
      radiusTop: nonNegative(
        input.radiusTop ?? input.radius ?? 1,
        "radiusTop"
      ),
      radiusBottom: nonNegative(
        input.radiusBottom ?? input.radius ?? 1,
        "radiusBottom"
      ),
      height: positive(input.height ?? 2, "height"),
      radialSegments: integerAtLeast(
        input.radialSegments ?? 24,
        3,
        "radialSegments"
      ),
      heightSegments: integerAtLeast(
        input.heightSegments ?? 1,
        1,
        "heightSegments"
      ),
      openEnded: Boolean(input.openEnded ?? false)
    });
  },

  key(descriptor) {
    return [
      descriptor.radiusTop,
      descriptor.radiusBottom,
      descriptor.height,
      descriptor.radialSegments,
      descriptor.heightSegments,
      descriptor.openEnded ? 1 : 0
    ].join(",");
  },

  create(descriptor) {
    return new THREE.CylinderGeometry(
      descriptor.radiusTop,
      descriptor.radiusBottom,
      descriptor.height,
      descriptor.radialSegments,
      descriptor.heightSegments,
      descriptor.openEnded
    );
  }
});

function finite(value, name) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    throw new TypeError(`${name} inválido.`);
  }

  return number;
}

function positive(value, name) {
  const number = finite(value, name);

  if (number <= 0) {
    throw new RangeError(`${name} deve ser positivo.`);
  }

  return number;
}

function nonNegative(value, name) {
  const number = finite(value, name);

  if (number < 0) {
    throw new RangeError(`${name} não pode ser negativo.`);
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
