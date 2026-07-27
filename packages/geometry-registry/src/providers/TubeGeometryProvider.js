import * as THREE from "three";
import {
  enumValue,
  finite,
  integerAtLeast,
  points3,
  positive
} from "./ProviderTools.js";

const CURVE_TYPES = Object.freeze(["centripetal", "chordal", "catmullrom"]);
const DEFAULT_POINTS = Object.freeze([
  [-2, 0, 0],
  [-1, 1, 0],
  [0, 0, 1],
  [1, -1, 0],
  [2, 0, 0]
]);

export const TubeGeometryProvider = Object.freeze({
  type: "tube",
  topology: "open-surface",
  label: "Tubo por curva",
  parameters: Object.freeze([
    Object.freeze({
      id: "points",
      label: "Caminho 3D [[x,y,z],...]",
      type: "json",
      default: DEFAULT_POINTS
    }),
    Object.freeze({id:"tubularSegments",label:"Segmentos do caminho",type:"integer",default:64,minimum:2}),
    Object.freeze({id:"radius",label:"Raio",type:"number",default:0.25,minimum:0.001}),
    Object.freeze({id:"radialSegments",label:"Segmentos radiais",type:"integer",default:8,minimum:3}),
    Object.freeze({id:"closed",label:"Caminho fechado",type:"boolean",default:false}),
    Object.freeze({
      id: "curveType",
      label: "Interpolação",
      type: "enum",
      default: "centripetal",
      options: CURVE_TYPES
    }),
    Object.freeze({id:"tension",label:"Tensão Catmull-Rom",type:"number",default:0.5})
  ]),

  normalize(input = {}) {
    return Object.freeze({
      type: "tube",
      points: points3(input.points, "points", {
        minimum: 3,
        fallback: DEFAULT_POINTS
      }),
      tubularSegments: integerAtLeast(input.tubularSegments ?? 64, 2, "tubularSegments"),
      radius: positive(input.radius ?? 0.25, "radius"),
      radialSegments: integerAtLeast(input.radialSegments ?? 8, 3, "radialSegments"),
      closed: Boolean(input.closed ?? false),
      curveType: enumValue(input.curveType, CURVE_TYPES, "centripetal", "curveType"),
      tension: finite(input.tension ?? 0.5, "tension")
    });
  },

  create(descriptor) {
    const curve = new THREE.CatmullRomCurve3(
      descriptor.points.map(point => new THREE.Vector3(...point)),
      descriptor.closed,
      descriptor.curveType,
      descriptor.tension
    );
    return new THREE.TubeGeometry(
      curve,
      descriptor.tubularSegments,
      descriptor.radius,
      descriptor.radialSegments,
      descriptor.closed
    );
  }
});
