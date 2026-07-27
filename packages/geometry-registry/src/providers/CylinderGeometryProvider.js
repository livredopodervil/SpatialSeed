import * as THREE from "three";
import {
  canonicalDegrees,
  integerAtLeast,
  nonNegative,
  positive,
  positiveDegrees,
  radians
} from "./ProviderTools.js";

export const CylinderGeometryProvider = Object.freeze({
  type: "cylinder",
  topology: "closed-solid",
  label: "Cilindro",
  parameters: Object.freeze([
    Object.freeze({id:"radiusTop",label:"Raio superior",type:"number",default:1,minimum:0}),
    Object.freeze({id:"radiusBottom",label:"Raio inferior",type:"number",default:1,minimum:0}),
    Object.freeze({id:"height",label:"Altura",type:"number",default:2,minimum:0.001}),
    Object.freeze({id:"radialSegments",label:"Segmentos radiais",type:"integer",default:24,minimum:3}),
    Object.freeze({id:"heightSegments",label:"Segmentos de altura",type:"integer",default:1,minimum:1}),
    Object.freeze({id:"openEnded",label:"Extremidades abertas",type:"boolean",default:false}),
    Object.freeze({id:"thetaStartDeg",label:"Ângulo inicial (°)",type:"number",default:0}),
    Object.freeze({id:"thetaLengthDeg",label:"Extensão angular (°)",type:"number",default:360,minimum:0.001,maximum:360})
  ]),

  normalize(input = {}) {
    return Object.freeze({
      type: "cylinder",
      radiusTop: nonNegative(input.radiusTop ?? input.radius ?? 1, "radiusTop"),
      radiusBottom: nonNegative(input.radiusBottom ?? input.radius ?? 1, "radiusBottom"),
      height: positive(input.height ?? 2, "height"),
      radialSegments: integerAtLeast(input.radialSegments ?? 24, 3, "radialSegments"),
      heightSegments: integerAtLeast(input.heightSegments ?? 1, 1, "heightSegments"),
      openEnded: Boolean(input.openEnded ?? false),
      thetaStartDeg: canonicalDegrees(input.thetaStartDeg ?? 0, "thetaStartDeg"),
      thetaLengthDeg: positiveDegrees(input.thetaLengthDeg ?? 360, "thetaLengthDeg")
    });
  },

  key(descriptor) {
    return [
      descriptor.radiusTop,
      descriptor.radiusBottom,
      descriptor.height,
      descriptor.radialSegments,
      descriptor.heightSegments,
      descriptor.openEnded ? 1 : 0,
      descriptor.thetaStartDeg,
      descriptor.thetaLengthDeg
    ].join(",");
  },

  create(descriptor) {
    return new THREE.CylinderGeometry(
      descriptor.radiusTop,
      descriptor.radiusBottom,
      descriptor.height,
      descriptor.radialSegments,
      descriptor.heightSegments,
      descriptor.openEnded,
      radians(descriptor.thetaStartDeg),
      radians(descriptor.thetaLengthDeg)
    );
  }
});
