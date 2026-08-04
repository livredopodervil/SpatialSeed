import * as THREE from "three";
import {
  flatten,
  integerArray,
  optionalPoints2,
  optionalPoints3,
  points3
} from "./ProviderTools.js";
import {
  classifyBufferRenderProfile,
  normalizeBufferRenderProfile
} from "../BufferRenderProfile.js";

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
    Object.freeze({id:"uvs",label:"UVs [[u,v],...] ou []",type:"json",default:[]}),
    Object.freeze({id:"edges",label:"Arestas soltas [[a,b],...]",type:"json",default:[]})
  ]),

  normalize(input = {}) {
    const positions = points3(input.positions, "positions", {
      minimum: 0,
      fallback: DEFAULT_POSITIONS
    });
    const indices = integerArray(input.indices, "indices", {
      minimumLength: 0,
      multipleOf: 3,
      fallback: DEFAULT_INDICES
    });
    const normals = optionalPoints3(input.normals, "normals");
    const uvs = optionalPoints2(input.uvs, "uvs");
    const edges = normalizeEdges(input.edges, positions.length);
    const renderProfile = normalizeBufferRenderProfile(input.renderProfile) ??
      classifyBufferRenderProfile({ positions, indices });

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
      uvs,
      edges,
      renderProfile
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

function normalizeEdges(value, vertexCount) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new TypeError("edges deve formar uma lista.");
  const unique = new Map();
  value.forEach((edge, index) => {
    if (!Array.isArray(edge) || edge.length !== 2) {
      throw new TypeError(`edges[${index}] deve conter dois índices.`);
    }
    const [a, b] = edge.map(Number);
    for (const vertex of [a, b]) {
      if (!Number.isInteger(vertex) || vertex < 0 || vertex >= vertexCount) {
        throw new RangeError(`Índice inválido em edges[${index}]: ${vertex}.`);
      }
    }
    if (a === b) return;
    const left = Math.min(a, b);
    const right = Math.max(a, b);
    unique.set(`${left}:${right}`, [left, right]);
  });
  return [...unique.values()].sort((left, right) =>
    left[0] - right[0] || left[1] - right[1]
  );
}
