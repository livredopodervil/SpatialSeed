import * as THREE from "three";
import {
  flatten,
  integerArray,
  optionalPoints2,
  optionalPoints3,
  points3
} from "./ProviderTools.js";

const DEFAULT_POSITIONS = Object.freeze([
  [-1, 0, 0],
  [1, 0, 0],
  [0, 1, 0]
]);
const DEFAULT_INDICES = Object.freeze([0, 1, 2]);

export const BufferGeometryProvider = Object.freeze({
  type: "buffer",
  topology: "open-surface",
  label: "Malha BufferGeometry",
  parameters: Object.freeze([
    Object.freeze({id:"positions",label:"Posições [[x,y,z],...]",type:"json",default:DEFAULT_POSITIONS}),
    Object.freeze({id:"indices",label:"Índices [a,b,c,...]",type:"json",default:DEFAULT_INDICES}),
    Object.freeze({id:"normals",label:"Normais [[x,y,z],...] ou []",type:"json",default:[]}),
    Object.freeze({id:"uvs",label:"UVs [[u,v],...] ou []",type:"json",default:[]})
  ]),

  normalize(input = {}) {
    const positions = points3(input.positions, "positions", {
      minimum: 3,
      fallback: DEFAULT_POSITIONS
    });
    const indices = integerArray(input.indices, "indices", {
      minimumLength: 0,
      multipleOf: 3,
      fallback: DEFAULT_INDICES
    });
    const normals = optionalPoints3(input.normals, "normals");
    const uvs = optionalPoints2(input.uvs, "uvs");

    if (!indices.length && positions.length % 3 !== 0) {
      throw new RangeError(
        "positions sem indices deve ter quantidade múltipla de 3."
      );
    }
    if (normals.length && normals.length !== positions.length) {
      throw new RangeError("normals deve ter a mesma quantidade de positions.");
    }
    if (uvs.length && uvs.length !== positions.length) {
      throw new RangeError("uvs deve ter a mesma quantidade de positions.");
    }
    for (const index of indices) {
      if (index >= positions.length) {
        throw new RangeError(
          `Índice ${index} excede os ${positions.length} vértices disponíveis.`
        );
      }
    }

    return Object.freeze({
      type: "buffer",
      positions,
      indices,
      normals,
      uvs
    });
  },

  create(descriptor) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(flatten(descriptor.positions), 3)
    );
    if (descriptor.indices.length) geometry.setIndex(descriptor.indices);
    if (descriptor.normals.length) {
      geometry.setAttribute(
        "normal",
        new THREE.Float32BufferAttribute(flatten(descriptor.normals), 3)
      );
    } else {
      geometry.computeVertexNormals();
    }
    if (descriptor.uvs.length) {
      geometry.setAttribute(
        "uv",
        new THREE.Float32BufferAttribute(flatten(descriptor.uvs), 2)
      );
    }
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  }
});
