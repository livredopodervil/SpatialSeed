import * as THREE from "three";
import {
  canonicalDegrees,
  integerAtLeast,
  nonNegative,
  positive,
  positiveDegrees,
  radians
} from "./ProviderTools.js";

export const CapsuleGeometryProvider = Object.freeze({
  type: "capsule",
  topology: "closed-solid",
  label: "Cápsula",
  parameters: Object.freeze([
    number("radius", "Raio", 1, 0.001),
    number("height", "Altura central", 1, 0),
    integer("capSegments", "Segmentos das calotas", 4, 1),
    integer("radialSegments", "Segmentos radiais", 16, 3),
    integer("heightSegments", "Segmentos de altura", 1, 1)
  ]),
  normalize(input = {}) {
    return Object.freeze({
      type: "capsule",
      radius: positive(input.radius ?? 1, "radius"),
      height: nonNegative(input.height ?? 1, "height"),
      capSegments: integerAtLeast(input.capSegments ?? 4, 1, "capSegments"),
      radialSegments: integerAtLeast(input.radialSegments ?? 16, 3, "radialSegments"),
      heightSegments: integerAtLeast(input.heightSegments ?? 1, 1, "heightSegments")
    });
  },
  create(descriptor) {
    return new THREE.CapsuleGeometry(
      descriptor.radius,
      descriptor.height,
      descriptor.capSegments,
      descriptor.radialSegments,
      descriptor.heightSegments
    );
  }
});

export const CircleGeometryProvider = Object.freeze({
  type: "circle",
  topology: "open-surface",
  placement: "planar",
  label: "Círculo / setor",
  parameters: Object.freeze([
    number("radius", "Raio", 1, 0.001),
    integer("segments", "Segmentos", 32, 3),
    number("thetaStartDeg", "Ângulo inicial (°)", 0),
    number("thetaLengthDeg", "Extensão angular (°)", 360, 0.001, 360)
  ]),
  normalize(input = {}) {
    return Object.freeze({
      type: "circle",
      radius: positive(input.radius ?? 1, "radius"),
      segments: integerAtLeast(input.segments ?? 32, 3, "segments"),
      thetaStartDeg: canonicalDegrees(input.thetaStartDeg ?? 0, "thetaStartDeg"),
      thetaLengthDeg: positiveDegrees(input.thetaLengthDeg ?? 360, "thetaLengthDeg")
    });
  },
  create(descriptor) {
    return new THREE.CircleGeometry(
      descriptor.radius,
      descriptor.segments,
      radians(descriptor.thetaStartDeg),
      radians(descriptor.thetaLengthDeg)
    );
  }
});

export const ConeGeometryProvider = Object.freeze({
  type: "cone",
  topology: "closed-solid",
  label: "Cone",
  parameters: Object.freeze([
    number("radius", "Raio", 1, 0.001),
    number("height", "Altura", 2, 0.001),
    integer("radialSegments", "Segmentos radiais", 24, 3),
    integer("heightSegments", "Segmentos de altura", 1, 1),
    booleanParameter("openEnded", "Base aberta", false),
    number("thetaStartDeg", "Ângulo inicial (°)", 0),
    number("thetaLengthDeg", "Extensão angular (°)", 360, 0.001, 360)
  ]),
  normalize(input = {}) {
    return Object.freeze({
      type: "cone",
      radius: positive(input.radius ?? 1, "radius"),
      height: positive(input.height ?? 2, "height"),
      radialSegments: integerAtLeast(input.radialSegments ?? 24, 3, "radialSegments"),
      heightSegments: integerAtLeast(input.heightSegments ?? 1, 1, "heightSegments"),
      openEnded: Boolean(input.openEnded ?? false),
      thetaStartDeg: canonicalDegrees(input.thetaStartDeg ?? 0, "thetaStartDeg"),
      thetaLengthDeg: positiveDegrees(input.thetaLengthDeg ?? 360, "thetaLengthDeg")
    });
  },
  create(descriptor) {
    return new THREE.ConeGeometry(
      descriptor.radius,
      descriptor.height,
      descriptor.radialSegments,
      descriptor.heightSegments,
      descriptor.openEnded,
      radians(descriptor.thetaStartDeg),
      radians(descriptor.thetaLengthDeg)
    );
  }
});

export const DodecahedronGeometryProvider = polyhedronPrimitive({
  type: "dodecahedron",
  label: "Dodecaedro",
  Geometry: THREE.DodecahedronGeometry
});

export const IcosahedronGeometryProvider = polyhedronPrimitive({
  type: "icosahedron",
  label: "Icosaedro",
  Geometry: THREE.IcosahedronGeometry
});

export const OctahedronGeometryProvider = polyhedronPrimitive({
  type: "octahedron",
  label: "Octaedro",
  Geometry: THREE.OctahedronGeometry
});

export const TetrahedronGeometryProvider = polyhedronPrimitive({
  type: "tetrahedron",
  label: "Tetraedro",
  Geometry: THREE.TetrahedronGeometry
});

export const RingGeometryProvider = Object.freeze({
  type: "ring",
  topology: "open-surface",
  placement: "planar",
  label: "Anel plano",
  parameters: Object.freeze([
    number("innerRadius", "Raio interno", 0.5, 0),
    number("outerRadius", "Raio externo", 1, 0.001),
    integer("thetaSegments", "Segmentos angulares", 32, 3),
    integer("phiSegments", "Segmentos radiais", 1, 1),
    number("thetaStartDeg", "Ângulo inicial (°)", 0),
    number("thetaLengthDeg", "Extensão angular (°)", 360, 0.001, 360)
  ]),
  normalize(input = {}) {
    const innerRadius = nonNegative(input.innerRadius ?? 0.5, "innerRadius");
    const outerRadius = positive(input.outerRadius ?? 1, "outerRadius");
    if (innerRadius >= outerRadius) {
      throw new RangeError("innerRadius deve ser menor que outerRadius.");
    }
    return Object.freeze({
      type: "ring",
      innerRadius,
      outerRadius,
      thetaSegments: integerAtLeast(input.thetaSegments ?? 32, 3, "thetaSegments"),
      phiSegments: integerAtLeast(input.phiSegments ?? 1, 1, "phiSegments"),
      thetaStartDeg: canonicalDegrees(input.thetaStartDeg ?? 0, "thetaStartDeg"),
      thetaLengthDeg: positiveDegrees(input.thetaLengthDeg ?? 360, "thetaLengthDeg")
    });
  },
  create(descriptor) {
    return new THREE.RingGeometry(
      descriptor.innerRadius,
      descriptor.outerRadius,
      descriptor.thetaSegments,
      descriptor.phiSegments,
      radians(descriptor.thetaStartDeg),
      radians(descriptor.thetaLengthDeg)
    );
  }
});

export const TorusGeometryProvider = Object.freeze({
  type: "torus",
  topology: "closed-solid",
  label: "Toro",
  parameters: Object.freeze([
    number("radius", "Raio principal", 1, 0.001),
    number("tube", "Raio do tubo", 0.4, 0.001),
    integer("radialSegments", "Segmentos radiais", 12, 3),
    integer("tubularSegments", "Segmentos tubulares", 48, 3),
    number("arcDeg", "Arco principal (°)", 360, 0.001, 360),
    number("thetaStartDeg", "Início da seção (°)", 0),
    number("thetaLengthDeg", "Extensão da seção (°)", 360, 0.001, 360)
  ]),
  normalize(input = {}) {
    return Object.freeze({
      type: "torus",
      radius: positive(input.radius ?? 1, "radius"),
      tube: positive(input.tube ?? 0.4, "tube"),
      radialSegments: integerAtLeast(input.radialSegments ?? 12, 3, "radialSegments"),
      tubularSegments: integerAtLeast(input.tubularSegments ?? 48, 3, "tubularSegments"),
      arcDeg: positiveDegrees(input.arcDeg ?? 360, "arcDeg"),
      thetaStartDeg: canonicalDegrees(input.thetaStartDeg ?? 0, "thetaStartDeg"),
      thetaLengthDeg: positiveDegrees(input.thetaLengthDeg ?? 360, "thetaLengthDeg")
    });
  },
  create(descriptor) {
    return new THREE.TorusGeometry(
      descriptor.radius,
      descriptor.tube,
      descriptor.radialSegments,
      descriptor.tubularSegments,
      radians(descriptor.arcDeg),
      radians(descriptor.thetaStartDeg),
      radians(descriptor.thetaLengthDeg)
    );
  }
});

export const TorusKnotGeometryProvider = Object.freeze({
  type: "torus-knot",
  topology: "closed-solid",
  label: "Nó toroidal",
  parameters: Object.freeze([
    number("radius", "Raio", 1, 0.001),
    number("tube", "Raio do tubo", 0.4, 0.001),
    integer("tubularSegments", "Segmentos tubulares", 96, 3),
    integer("radialSegments", "Segmentos radiais", 12, 3),
    integer("p", "Voltas p", 2, 1),
    integer("q", "Voltas q", 3, 1)
  ]),
  normalize(input = {}) {
    return Object.freeze({
      type: "torus-knot",
      radius: positive(input.radius ?? 1, "radius"),
      tube: positive(input.tube ?? 0.4, "tube"),
      tubularSegments: integerAtLeast(input.tubularSegments ?? 96, 3, "tubularSegments"),
      radialSegments: integerAtLeast(input.radialSegments ?? 12, 3, "radialSegments"),
      p: integerAtLeast(input.p ?? 2, 1, "p"),
      q: integerAtLeast(input.q ?? 3, 1, "q")
    });
  },
  create(descriptor) {
    return new THREE.TorusKnotGeometry(
      descriptor.radius,
      descriptor.tube,
      descriptor.tubularSegments,
      descriptor.radialSegments,
      descriptor.p,
      descriptor.q
    );
  }
});

export const THREE_PRIMITIVE_GEOMETRY_PROVIDERS = Object.freeze([
  CapsuleGeometryProvider,
  CircleGeometryProvider,
  ConeGeometryProvider,
  DodecahedronGeometryProvider,
  IcosahedronGeometryProvider,
  OctahedronGeometryProvider,
  RingGeometryProvider,
  TetrahedronGeometryProvider,
  TorusGeometryProvider,
  TorusKnotGeometryProvider
]);

function polyhedronPrimitive({ type, label, Geometry }) {
  return Object.freeze({
    type,
    topology: "closed-solid",
    label,
    parameters: Object.freeze([
      number("radius", "Raio", 1, 0.001),
      integer("detail", "Subdivisões", 0, 0)
    ]),
    normalize(input = {}) {
      return Object.freeze({
        type,
        radius: positive(input.radius ?? 1, "radius"),
        detail: integerAtLeast(input.detail ?? 0, 0, "detail")
      });
    },
    create(descriptor) {
      return new Geometry(descriptor.radius, descriptor.detail);
    }
  });
}

function number(id, label, defaultValue, minimum = undefined, maximum = undefined) {
  return Object.freeze({
    id,
    label,
    type: "number",
    default: defaultValue,
    ...(minimum === undefined ? {} : { minimum }),
    ...(maximum === undefined ? {} : { maximum })
  });
}

function integer(id, label, defaultValue, minimum) {
  return Object.freeze({
    id,
    label,
    type: "integer",
    default: defaultValue,
    minimum
  });
}

function booleanParameter(id, label, defaultValue) {
  return Object.freeze({
    id,
    label,
    type: "boolean",
    default: defaultValue
  });
}
