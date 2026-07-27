import * as THREE from "three";
import {
  flatten,
  integerArray,
  integerAtLeast,
  points3,
  positive
} from "./ProviderTools.js";

const DEFAULT_VERTICES = Object.freeze([
  [1, 1, 1],
  [-1, -1, 1],
  [-1, 1, -1],
  [1, -1, -1]
]);
const DEFAULT_INDICES = Object.freeze([
  2, 1, 0,
  0, 3, 2,
  1, 3, 0,
  2, 3, 1
]);

export const PolyhedronGeometryProvider = Object.freeze({
  type: "polyhedron",
  topology: "closed-solid",
  label: "Poliedro genérico",
  parameters: Object.freeze([
    Object.freeze({id:"vertices",label:"Vértices [[x,y,z],...]",type:"json",default:DEFAULT_VERTICES}),
    Object.freeze({id:"indices",label:"Triângulos [a,b,c,...]",type:"json",default:DEFAULT_INDICES}),
    Object.freeze({id:"radius",label:"Raio",type:"number",default:1,minimum:0.001}),
    Object.freeze({id:"detail",label:"Subdivisões",type:"integer",default:0,minimum:0})
  ]),

  normalize(input = {}) {
    const vertices = points3(input.vertices, "vertices", {
      minimum: 4,
      fallback: DEFAULT_VERTICES
    });
    const indices = integerArray(input.indices, "indices", {
      minimumLength: 3,
      multipleOf: 3,
      fallback: DEFAULT_INDICES
    });
    validateIndices(indices, vertices.length);
    return Object.freeze({
      type: "polyhedron",
      vertices,
      indices,
      radius: positive(input.radius ?? 1, "radius"),
      detail: integerAtLeast(input.detail ?? 0, 0, "detail")
    });
  },

  create(descriptor) {
    return new THREE.PolyhedronGeometry(
      flatten(descriptor.vertices),
      descriptor.indices,
      descriptor.radius,
      descriptor.detail
    );
  }
});

function validateIndices(indices, vertexCount) {
  for (const index of indices) {
    if (index >= vertexCount) {
      throw new RangeError(
        `Índice ${index} excede os ${vertexCount} vértices disponíveis.`
      );
    }
  }
}
