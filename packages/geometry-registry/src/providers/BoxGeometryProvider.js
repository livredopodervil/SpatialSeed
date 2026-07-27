import * as THREE from "three";
import { vector } from "./ProviderTools.js";

export const BoxGeometryProvider = Object.freeze({
  type: "box",
  topology: "closed-solid",
  label: "Caixa",
  parameters: Object.freeze([
    Object.freeze({
      id: "size",
      label: "Dimensões",
      type: "vector3",
      default: [1, 1, 1],
      minimum: 0.001
    }),
    Object.freeze({
      id: "segments",
      label: "Segmentos XYZ",
      type: "integer-vector3",
      default: [1, 1, 1],
      minimum: 1
    })
  ]),

  normalize(input = {}) {
    return Object.freeze({
      type: "box",
      size: vector(input.size, 3, [1, 1, 1], {
        name: "size",
        positiveValues: true
      }),
      segments: vector(input.segments, 3, [1, 1, 1], {
        name: "segments",
        integerValues: true,
        minimum: 1
      })
    });
  },

  key(descriptor) {
    return [...descriptor.size, ...descriptor.segments].join(",");
  },

  create(descriptor) {
    return new THREE.BoxGeometry(
      ...descriptor.size,
      ...descriptor.segments
    );
  }
});
