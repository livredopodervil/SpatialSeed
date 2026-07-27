import * as THREE from "three";
import {
  applyWorldTransforms,
  cloneHierarchySubtrees,
  HierarchyIndex
} from "../../scene-hierarchy/src/index.js";
import { createSweepGeometryDescriptor } from "./SweepGeometry.js";
import { localizedPoints } from "./ReferenceGeometry.js";
import { samplePathFrames } from "./PathFrames.js";

export class PathToolService {
  static apiVersion = "path-tool-service-v1";

  constructor({
    resolver,
    selectionOperations,
    sandbox,
    editor,
    requireObjectMode = () => {}
  }) {
    if (!resolver?.resolvePath || !resolver?.resolveProfile) {
      throw new TypeError("PathToolService exige SpatialReferenceResolver.");
    }
    if (!selectionOperations?.createGeometry) {
      throw new TypeError("PathToolService exige SelectionOperations.");
    }
    this.resolver = resolver;
    this.selectionOperations = selectionOperations;
    this.sandbox = sandbox;
    this.editor = editor;
    this.requireObjectMode = requireObjectMode;
  }

  listReferences() {
    return this.resolver.listObjects();
  }

  inspect({ kind = "path", reference = {} } = {}) {
    const normalized = String(kind).toLowerCase();
    if (normalized === "path") return this.resolver.resolvePath(reference);
    if (normalized === "profile") return this.resolver.resolveProfile(reference);
    if (normalized === "point") return this.resolver.resolvePoint(reference);
    throw new RangeError(`Tipo de referência desconhecido: ${kind}.`);
  }

  createTube({
    path = {},
    name = null,
    radius = 0.25,
    tubularSegments = 64,
    radialSegments = 8,
    closed = undefined,
    curveType = "centripetal",
    tension = 0.5,
    color = "#66aadd"
  } = {}) {
    this.#assertCanMutate("criar tubo por caminho");
    const resolved = this.resolver.resolvePath({ ...path, closed });
    const localized = localizedPoints(ensureTubePoints(resolved.points));
    const result = this.selectionOperations.createGeometry({
      name: name || `Tubo — ${resolved.objectName}`,
      position: localized.origin,
      geometry: {
        type: "tube",
        points: localized.points,
        tubularSegments: integerAtLeast(tubularSegments, 2, "tubularSegments"),
        radius: positive(radius, "radius"),
        radialSegments: integerAtLeast(radialSegments, 3, "radialSegments"),
        closed: closed === undefined ? resolved.closed : Boolean(closed),
        curveType,
        tension: finite(tension, "tension")
      },
      color
    });
    return Object.freeze({
      ...result,
      tool: "tube-along-reference",
      reference: summary(resolved)
    });
  }

  createSweep({
    path = {},
    profile = {},
    name = null,
    segments = 32,
    closedPath = undefined,
    curveType = "centripetal",
    tension = 0.5,
    twistDegrees = 0,
    scaleStart = 1,
    scaleEnd = 1,
    caps = true,
    color = "#7f9cff"
  } = {}) {
    this.#assertCanMutate("criar varredura por caminho");
    const resolvedPath = this.resolver.resolvePath({
      ...path,
      closed: closedPath
    });
    const resolvedProfile = this.resolver.resolveProfile(profile);
    const sweep = createSweepGeometryDescriptor({
      pathPoints: resolvedPath.points,
      profilePoints: resolvedProfile.points,
      segments: integerAtLeast(segments, 1, "segments"),
      closedPath: closedPath === undefined
        ? resolvedPath.closed
        : Boolean(closedPath),
      curveType,
      tension: finite(tension, "tension"),
      twistDegrees: finite(twistDegrees, "twistDegrees"),
      scaleStart: nonZero(scaleStart, "scaleStart"),
      scaleEnd: nonZero(scaleEnd, "scaleEnd"),
      caps: Boolean(caps),
      initialNormal: resolvedProfile.xAxis
    });
    const result = this.selectionOperations.createGeometry({
      name: name || `Varredura — ${resolvedProfile.objectName} × ${resolvedPath.objectName}`,
      position: sweep.origin,
      geometry: sweep.geometry,
      color
    });
    return Object.freeze({
      ...result,
      tool: "sweep-along-reference",
      path: summary(resolvedPath),
      profile: summary(resolvedProfile),
      diagnostics: sweep.diagnostics
    });
  }

  arraySelection({
    path = {},
    count = 8,
    align = true,
    closed = undefined,
    curveType = "centripetal",
    tension = 0.5,
    twistDegrees = 0,
    includePathObject = false
  } = {}) {
    this.#assertCanMutate("distribuir objetos ao longo de caminho");
    const copies = integerAtLeast(count, 1, "count");
    if (copies > 10000) {
      throw new RangeError("A distribuição aceita no máximo 10000 cópias.");
    }
    const resolvedPath = this.resolver.resolvePath({ ...path, closed });
    const state = this.sandbox.getSnapshot();
    const hierarchy = new HierarchyIndex(state.objects);
    const selectedIds = this.editor.selection.snapshot().members
      .map(member => member.objectId)
      .filter(id => hierarchy.has(id))
      .filter(id => includePathObject || id !== resolvedPath.objectId);
    const rootIds = [...hierarchy.canonicalizeSelection(selectedIds)];
    if (!rootIds.length) {
      throw new Error(
        "Selecione ao menos um objeto para distribuir; o objeto de caminho é excluído por padrão."
      );
    }
    const frames = samplePathFrames({
      points: resolvedPath.points,
      count: copies,
      closed: closed === undefined ? resolvedPath.closed : Boolean(closed),
      curveType,
      tension: finite(tension, "tension"),
      twistDegrees: finite(twistDegrees, "twistDegrees")
    });
    const sourcePivot = average(rootIds.map(id => hierarchy.worldPivotOf(id)));
    const firstFrame = new THREE.Quaternion().fromArray(frames.quaternions[0]);
    const firstFrameInverse = firstFrame.clone().invert();
    const cloned = cloneHierarchySubtrees(state.objects, {
      rootIds,
      copies,
      createId: () => crypto.randomUUID(),
      rename: ({ name, copyIndex }) => `${name ?? "Objeto"} · caminho ${copyIndex}`
    });
    const desired = [];
    cloned.copies.forEach((copy, copyArrayIndex) => {
      const point = frames.positions[copyArrayIndex];
      const frame = new THREE.Quaternion().fromArray(frames.quaternions[copyArrayIndex]);
      const relativeRotation = align
        ? frame.clone().multiply(firstFrameInverse)
        : new THREE.Quaternion();
      const delta = new THREE.Matrix4()
        .makeTranslation(...point)
        .multiply(new THREE.Matrix4().makeRotationFromQuaternion(relativeRotation))
        .multiply(new THREE.Matrix4().makeTranslation(
          -sourcePivot[0], -sourcePivot[1], -sourcePivot[2]
        ));
      copy.rootIds.forEach((cloneId, rootIndex) => {
        const sourceId = cloned.sourceRootIds[rootIndex];
        const sourceWorld = new THREE.Matrix4().fromArray(hierarchy.worldMatrixOf(sourceId));
        desired.push({
          id: cloneId,
          worldMatrix: delta.clone().multiply(sourceWorld).toArray()
        });
      });
    });
    const combined = applyWorldTransforms(
      [...state.objects, ...cloned.objects],
      desired
    );
    const cloneIds = new Set(cloned.objects.map(object => object.id));
    const transformedClones = combined.filter(object => cloneIds.has(object.id));
    const changed = this.sandbox.dispatch({
      type: "selection.duplicate",
      source: "path-array",
      sourceIds: cloned.sourceRootIds,
      copyCount: copies,
      pathReference: summary(resolvedPath),
      objects: transformedClones
    });
    if (changed) {
      const lastRoots = cloned.copies.at(-1).rootIds;
      this.editor.selection.replaceMany(lastRoots.map(objectId => ({
        kind: "object",
        regionId: this.selectionOperations.regionId,
        objectId
      })));
    }
    return Object.freeze({
      changed,
      tool: "array-along-reference",
      count: copies,
      sourceIds: Object.freeze(rootIds),
      createdIds: Object.freeze(transformedClones.map(object => object.id)),
      activeIds: Object.freeze([...(cloned.copies.at(-1)?.rootIds ?? [])]),
      reference: summary(resolvedPath)
    });
  }

  #assertCanMutate(action) {
    this.requireObjectMode(action);
  }
}

function summary(reference) {
  return Object.freeze({
    kind: reference.kind,
    objectId: reference.objectId,
    objectName: reference.objectName,
    extraction: reference.extraction,
    pointCount: reference.points?.length ?? 1,
    closed: Boolean(reference.closed),
    sourceRevision: reference.sourceRevision
  });
}

function average(points) {
  const sum = points.reduce((accumulator, point) => [
    accumulator[0] + point[0],
    accumulator[1] + point[1],
    accumulator[2] + point[2]
  ], [0, 0, 0]);
  return sum.map(value => value / points.length);
}

function positive(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    throw new RangeError(`${name} deve ser positivo.`);
  }
  return number;
}

function nonZero(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number) || Math.abs(number) < 1e-12) {
    throw new RangeError(`${name} deve ser finito e diferente de zero.`);
  }
  return number;
}

function finite(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new TypeError(`${name} inválido.`);
  return number;
}

function integerAtLeast(value, minimum, name) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < minimum) {
    throw new RangeError(`${name} deve ser inteiro maior ou igual a ${minimum}.`);
  }
  return number;
}

function ensureTubePoints(points) {
  if (points.length !== 2) return points;
  const [left, right] = points;
  return [
    left,
    [
      (left[0] + right[0]) * 0.5,
      (left[1] + right[1]) * 0.5,
      (left[2] + right[2]) * 0.5
    ],
    right
  ];
}
