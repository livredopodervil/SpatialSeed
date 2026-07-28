import * as THREE from "three";
import {
  enumValue,
  finite,
  integerAtLeast,
  points3,
  positive
} from "./ProviderTools.js";

const CURVE_TYPES = Object.freeze([
  "centripetal",
  "chordal",
  "catmullrom",
  "polyline",
  "bezier"
]);
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
  label: "Caminho / tubo 3D",
  parameters: Object.freeze([
    Object.freeze({
      id: "points",
      label: "Pontos ou controles 3D [[x,y,z],...]",
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
    const curveType = enumValue(
      input.curveType,
      CURVE_TYPES,
      "centripetal",
      "curveType"
    );
    const points = points3(input.points, "points", {
      minimum: curveType === "bezier"
        ? 4
        : curveType === "polyline"
          ? 2
          : 3,
      fallback: DEFAULT_POINTS
    });
    const closed = Boolean(input.closed ?? false);
    if (curveType === "bezier") {
      if (closed) {
        throw new RangeError(
          "Caminhos Bézier fechados ainda não são aceitos; feche com Catmull-Rom ou polilinha."
        );
      }
      if ((points.length - 1) % 3 !== 0) {
        throw new RangeError(
          "Um caminho Bézier cúbico aberto exige 3n+1 pontos: âncora, dois controles e próxima âncora."
        );
      }
    }
    return Object.freeze({
      type: "tube",
      points,
      tubularSegments: integerAtLeast(input.tubularSegments ?? 64, 2, "tubularSegments"),
      radius: positive(input.radius ?? 0.25, "radius"),
      radialSegments: integerAtLeast(input.radialSegments ?? 8, 3, "radialSegments"),
      closed,
      curveType,
      tension: finite(input.tension ?? 0.5, "tension")
    });
  },

  create(descriptor) {
    return new THREE.TubeGeometry(
      curveFromDescriptor(descriptor),
      descriptor.tubularSegments,
      descriptor.radius,
      descriptor.radialSegments,
      descriptor.closed
    );
  }
});

export function curveFromDescriptor(descriptor) {
  const points = descriptor.points.map(point => new THREE.Vector3(...point));
  if (descriptor.curveType === "bezier") {
    return new PiecewiseCubicBezierCurve3(points);
  }
  if (descriptor.curveType === "polyline") {
    return new PolylineCurve3(points, descriptor.closed);
  }
  return new THREE.CatmullRomCurve3(
    points,
    descriptor.closed,
    descriptor.curveType,
    descriptor.tension
  );
}

class PiecewiseCubicBezierCurve3 extends THREE.Curve {
  constructor(points) {
    super();
    this.points = points.map(point => point.clone());
    this.segmentCount = (this.points.length - 1) / 3;
  }

  getPoint(t, target = new THREE.Vector3()) {
    const scaled = THREE.MathUtils.clamp(Number(t), 0, 1) * this.segmentCount;
    const segment = Math.min(
      this.segmentCount - 1,
      Math.floor(scaled)
    );
    const u = segment === this.segmentCount - 1 && scaled >= this.segmentCount
      ? 1
      : scaled - segment;
    const offset = segment * 3;
    return cubicBezierPoint(
      this.points[offset],
      this.points[offset + 1],
      this.points[offset + 2],
      this.points[offset + 3],
      u,
      target
    );
  }

  getTangent(t, target = new THREE.Vector3()) {
    const scaled = THREE.MathUtils.clamp(Number(t), 0, 1) * this.segmentCount;
    const segment = Math.min(
      this.segmentCount - 1,
      Math.floor(scaled)
    );
    const u = segment === this.segmentCount - 1 && scaled >= this.segmentCount
      ? 1
      : scaled - segment;
    const offset = segment * 3;
    return cubicBezierTangent(
      this.points[offset],
      this.points[offset + 1],
      this.points[offset + 2],
      this.points[offset + 3],
      u,
      target
    );
  }
}

class PolylineCurve3 extends THREE.Curve {
  constructor(points, closed = false) {
    super();
    this.points = points.map(point => point.clone());
    this.closed = Boolean(closed);
    this.lengths = [];
    this.totalLength = 0;
    const segmentCount = this.closed ? this.points.length : this.points.length - 1;
    for (let index = 0; index < segmentCount; index += 1) {
      const length = this.points[index].distanceTo(
        this.points[(index + 1) % this.points.length]
      );
      this.totalLength += length;
      this.lengths.push(this.totalLength);
    }
  }

  getPoint(t, target = new THREE.Vector3()) {
    if (this.totalLength <= 1e-12) return target.copy(this.points[0]);
    const distance = THREE.MathUtils.clamp(Number(t), 0, 1) * this.totalLength;
    let segment = this.lengths.findIndex(length => distance <= length);
    if (segment < 0) segment = this.lengths.length - 1;
    const previous = segment === 0 ? 0 : this.lengths[segment - 1];
    const segmentLength = Math.max(1e-12, this.lengths[segment] - previous);
    return target.copy(this.points[segment]).lerp(
      this.points[(segment + 1) % this.points.length],
      (distance - previous) / segmentLength
    );
  }
}

function cubicBezierPoint(p0, p1, p2, p3, t, target) {
  const oneMinus = 1 - t;
  return target.set(0, 0, 0)
    .addScaledVector(p0, oneMinus ** 3)
    .addScaledVector(p1, 3 * oneMinus ** 2 * t)
    .addScaledVector(p2, 3 * oneMinus * t ** 2)
    .addScaledVector(p3, t ** 3);
}

function cubicBezierTangent(p0, p1, p2, p3, t, target) {
  const oneMinus = 1 - t;
  return target.set(0, 0, 0)
    .addScaledVector(new THREE.Vector3().subVectors(p1, p0), 3 * oneMinus ** 2)
    .addScaledVector(new THREE.Vector3().subVectors(p2, p1), 6 * oneMinus * t)
    .addScaledVector(new THREE.Vector3().subVectors(p3, p2), 3 * t ** 2)
    .normalize();
}
