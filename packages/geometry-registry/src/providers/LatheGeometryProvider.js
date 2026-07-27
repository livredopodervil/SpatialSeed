import * as THREE from "three";
import {
  canonicalDegrees,
  integerAtLeast,
  points2,
  positiveDegrees,
  radians
} from "./ProviderTools.js";

const DEFAULT_POINTS = Object.freeze([
  [0, -1],
  [0.7, -0.8],
  [1, 0],
  [0.7, 0.8],
  [0, 1]
]);

export const LatheGeometryProvider = Object.freeze({
  type: "lathe",
  topology: "open-surface",
  label: "Superfície de revolução",
  parameters: Object.freeze([
    Object.freeze({
      id: "points",
      label: "Perfil 2D [[x,y],...]",
      type: "json",
      default: DEFAULT_POINTS
    }),
    Object.freeze({id:"segments",label:"Segmentos",type:"integer",default:32,minimum:3}),
    Object.freeze({id:"phiStartDeg",label:"Ângulo inicial (°)",type:"number",default:0}),
    Object.freeze({id:"phiLengthDeg",label:"Extensão angular (°)",type:"number",default:360,minimum:0.001,maximum:360})
  ]),

  normalize(input = {}) {
    return Object.freeze({
      type: "lathe",
      points: points2(input.points, "points", {
        minimum: 2,
        fallback: DEFAULT_POINTS
      }),
      segments: integerAtLeast(input.segments ?? 32, 3, "segments"),
      phiStartDeg: canonicalDegrees(input.phiStartDeg ?? 0, "phiStartDeg"),
      phiLengthDeg: positiveDegrees(input.phiLengthDeg ?? 360, "phiLengthDeg")
    });
  },

  create(descriptor) {
    return new THREE.LatheGeometry(
      descriptor.points.map(([x, y]) => new THREE.Vector2(x, y)),
      descriptor.segments,
      radians(descriptor.phiStartDeg),
      radians(descriptor.phiLengthDeg)
    );
  }
});
