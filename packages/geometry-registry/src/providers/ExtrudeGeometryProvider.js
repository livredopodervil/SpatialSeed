import * as THREE from "three";
import {
  finite,
  holes2,
  integerAtLeast,
  nonNegative,
  points2,
  positive
} from "./ProviderTools.js";
import {
  createShape,
  DEFAULT_SHAPE_CONTOUR
} from "./ShapeGeometryProvider.js";

export const ExtrudeGeometryProvider = Object.freeze({
  type: "extrude",
  topology: "closed-solid",
  label: "Extrusão",
  parameters: Object.freeze([
    Object.freeze({id:"contour",label:"Contorno [[x,y],...]",type:"json",default:DEFAULT_SHAPE_CONTOUR}),
    Object.freeze({id:"holes",label:"Furos [[[x,y],...],...]",type:"json",default:[]}),
    Object.freeze({id:"depth",label:"Profundidade",type:"number",default:1,minimum:0.001}),
    Object.freeze({id:"steps",label:"Passos",type:"integer",default:1,minimum:1}),
    Object.freeze({id:"curveSegments",label:"Segmentos de curva",type:"integer",default:12,minimum:1}),
    Object.freeze({id:"bevelEnabled",label:"Bisel",type:"boolean",default:true}),
    Object.freeze({id:"bevelThickness",label:"Espessura do bisel",type:"number",default:0.2,minimum:0}),
    Object.freeze({id:"bevelSize",label:"Tamanho do bisel",type:"number",default:0.1,minimum:0}),
    Object.freeze({id:"bevelOffset",label:"Deslocamento do bisel",type:"number",default:0}),
    Object.freeze({id:"bevelSegments",label:"Segmentos do bisel",type:"integer",default:3,minimum:0})
  ]),

  normalize(input = {}) {
    return Object.freeze({
      type: "extrude",
      contour: points2(input.contour, "contour", {
        minimum: 3,
        fallback: DEFAULT_SHAPE_CONTOUR
      }),
      holes: holes2(input.holes, "holes"),
      depth: positive(input.depth ?? 1, "depth"),
      steps: integerAtLeast(input.steps ?? 1, 1, "steps"),
      curveSegments: integerAtLeast(input.curveSegments ?? 12, 1, "curveSegments"),
      bevelEnabled: Boolean(input.bevelEnabled ?? true),
      bevelThickness: nonNegative(input.bevelThickness ?? 0.2, "bevelThickness"),
      bevelSize: nonNegative(input.bevelSize ?? 0.1, "bevelSize"),
      bevelOffset: finite(input.bevelOffset ?? 0, "bevelOffset"),
      bevelSegments: integerAtLeast(input.bevelSegments ?? 3, 0, "bevelSegments")
    });
  },

  create(descriptor) {
    return new THREE.ExtrudeGeometry(
      createShape(descriptor.contour, descriptor.holes),
      {
        depth: descriptor.depth,
        steps: descriptor.steps,
        curveSegments: descriptor.curveSegments,
        bevelEnabled: descriptor.bevelEnabled,
        bevelThickness: descriptor.bevelThickness,
        bevelSize: descriptor.bevelSize,
        bevelOffset: descriptor.bevelOffset,
        bevelSegments: descriptor.bevelSegments
      }
    );
  }
});
