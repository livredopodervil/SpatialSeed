import * as THREE from "three";
import {
  canonicalDegrees,
  integerAtLeast,
  positive,
  positiveDegrees,
  radians
} from "./ProviderTools.js";

export const SphereGeometryProvider = Object.freeze({
  type: "sphere",
  topology: "closed-solid",
  label: "Esfera",
  parameters: Object.freeze([
    Object.freeze({id:"radius",label:"Raio",type:"number",default:1,minimum:0.001}),
    Object.freeze({id:"widthSegments",label:"Segmentos horizontais",type:"integer",default:24,minimum:3}),
    Object.freeze({id:"heightSegments",label:"Segmentos verticais",type:"integer",default:16,minimum:2}),
    Object.freeze({id:"phiStartDeg",label:"Início horizontal (°)",type:"number",default:0}),
    Object.freeze({id:"phiLengthDeg",label:"Extensão horizontal (°)",type:"number",default:360,minimum:0.001,maximum:360}),
    Object.freeze({id:"thetaStartDeg",label:"Início vertical (°)",type:"number",default:0}),
    Object.freeze({id:"thetaLengthDeg",label:"Extensão vertical (°)",type:"number",default:180,minimum:0.001,maximum:180})
  ]),

  normalize(input = {}) {
    return Object.freeze({
      type: "sphere",
      radius: positive(input.radius ?? 1, "radius"),
      widthSegments: integerAtLeast(input.widthSegments ?? 24, 3, "widthSegments"),
      heightSegments: integerAtLeast(input.heightSegments ?? 16, 2, "heightSegments"),
      phiStartDeg: canonicalDegrees(input.phiStartDeg ?? 0, "phiStartDeg"),
      phiLengthDeg: positiveDegrees(input.phiLengthDeg ?? 360, "phiLengthDeg"),
      thetaStartDeg: canonicalDegrees(input.thetaStartDeg ?? 0, "thetaStartDeg"),
      thetaLengthDeg: positiveDegrees(
        input.thetaLengthDeg ?? 180,
        "thetaLengthDeg",
        { maximum: 180 }
      )
    });
  },

  key(descriptor) {
    return [
      descriptor.radius,
      descriptor.widthSegments,
      descriptor.heightSegments,
      descriptor.phiStartDeg,
      descriptor.phiLengthDeg,
      descriptor.thetaStartDeg,
      descriptor.thetaLengthDeg
    ].join(",");
  },

  create(descriptor) {
    return new THREE.SphereGeometry(
      descriptor.radius,
      descriptor.widthSegments,
      descriptor.heightSegments,
      radians(descriptor.phiStartDeg),
      radians(descriptor.phiLengthDeg),
      radians(descriptor.thetaStartDeg),
      radians(descriptor.thetaLengthDeg)
    );
  }
});
