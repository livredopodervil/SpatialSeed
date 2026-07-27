import * as THREE from "three";
import {
  holes2,
  integerAtLeast,
  points2
} from "./ProviderTools.js";

export const DEFAULT_SHAPE_CONTOUR = Object.freeze([
  [-1, -1],
  [1, -1],
  [1, 1],
  [-1, 1]
]);

export const ShapeGeometryProvider = Object.freeze({
  type: "shape",
  topology: "open-surface",
  placement: "planar",
  label: "Forma 2D",
  parameters: Object.freeze([
    Object.freeze({
      id: "contour",
      label: "Contorno [[x,y],...]",
      type: "json",
      default: DEFAULT_SHAPE_CONTOUR
    }),
    Object.freeze({
      id: "holes",
      label: "Furos [[[x,y],...],...]",
      type: "json",
      default: []
    }),
    Object.freeze({id:"curveSegments",label:"Segmentos de curva",type:"integer",default:12,minimum:1})
  ]),

  normalize(input = {}) {
    return Object.freeze({
      type: "shape",
      contour: points2(input.contour, "contour", {
        minimum: 3,
        fallback: DEFAULT_SHAPE_CONTOUR
      }),
      holes: holes2(input.holes, "holes"),
      curveSegments: integerAtLeast(input.curveSegments ?? 12, 1, "curveSegments")
    });
  },

  create(descriptor) {
    return new THREE.ShapeGeometry(
      createShape(descriptor.contour, descriptor.holes),
      descriptor.curveSegments
    );
  }
});

export function createShape(contour, holes) {
  const shape = new THREE.Shape();
  tracePath(shape, contour);
  for (const holePoints of holes) {
    const hole = new THREE.Path();
    tracePath(hole, holePoints);
    shape.holes.push(hole);
  }
  return shape;
}

function tracePath(path, points) {
  path.moveTo(...points[0]);
  for (const point of points.slice(1)) path.lineTo(...point);
  path.closePath();
}
