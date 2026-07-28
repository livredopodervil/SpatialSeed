import * as THREE from "three";
import { HierarchyIndex } from "../../scene-hierarchy/src/index.js";
import { topologyOf } from "../../mesh-editor-core/src/index.js";
import {
  bufferDescriptorFromGeometry,
  orderEdgeChain,
  projectPlanarProfile,
  stripRepeatedEndpoint,
  transformPoints
} from "./ReferenceGeometry.js";

const PATH_EXTRACTIONS = Object.freeze([
  "auto",
  "centerline",
  "boundary",
  "loose-edges"
]);
const PROFILE_EXTRACTIONS = Object.freeze([
  "auto",
  "contour",
  "boundary"
]);

export class SpatialReferenceResolver {
  static apiVersion = "spatial-reference-resolver-v1";

  constructor({ sandbox, editor, geometryRegistry }) {
    if (!sandbox?.getSnapshot) {
      throw new TypeError("SpatialReferenceResolver exige sandbox compatível.");
    }
    if (!editor?.selection?.snapshot) {
      throw new TypeError("SpatialReferenceResolver exige editor compatível.");
    }
    if (!geometryRegistry?.describeLegacyObject || !geometryRegistry?.create) {
      throw new TypeError("SpatialReferenceResolver exige GeometryRegistry.");
    }
    this.sandbox = sandbox;
    this.editor = editor;
    this.geometryRegistry = geometryRegistry;
  }

  listObjects() {
    const state = this.sandbox.getSnapshot();
    const selected = new Set(
      this.editor.selection.snapshot().members.map(member => member.objectId)
    );
    return Object.freeze(state.objects
      .filter(object => !["group", "camera", "light"].includes(object.kind))
      .map(object => {
        let geometryType = null;
        let curveType = null;
        try {
          const descriptor = this.geometryRegistry.describeLegacyObject(object);
          geometryType = descriptor.type;
          curveType = descriptor.curveType ?? null;
        } catch {}
        return Object.freeze({
          id: object.id,
          name: object.name ?? object.id,
          kind: object.kind,
          geometryType,
          curveType,
          selected: selected.has(object.id),
          pathExtractions: Object.freeze(this.#pathExtractions(object)),
          profileExtractions: Object.freeze(this.#profileExtractions(object))
        });
      }));
  }

  resolvePath(reference = {}) {
    const normalized = normalizeReference(reference, PATH_EXTRACTIONS);
    if (normalized.source === "selection-origins") {
      return this.#selectionOriginsPath(normalized);
    }
    const { state, hierarchy, object } = this.#objectContext(normalized);
    const descriptor = this.geometryRegistry.describeLegacyObject(object);
    const extraction = normalized.extraction === "auto"
      ? this.#automaticPathExtraction(descriptor)
      : normalized.extraction;
    let localPoints;
    let closed = Boolean(normalized.closed);
    if (extraction === "centerline") {
      if (!Array.isArray(descriptor.points) ||
          !descriptor.points.every(point => Array.isArray(point) && point.length === 3)) {
        throw new Error(
          `${object.name ?? object.id} não possui uma linha central 3D declarada.`
        );
      }
      localPoints = descriptor.points.map(point => [...point]);
      closed = normalized.closed ?? Boolean(descriptor.closed);
    } else {
      const { geometry, topology } = this.#topology(descriptor);
      try {
        if (extraction === "loose-edges") {
          const chain = orderEdgeChain(topology.looseEdges);
          localPoints = chain.indices.map(index => topology.positions[index]);
          closed = normalized.closed ?? chain.closed;
        } else if (extraction === "boundary") {
          const loop = largestBoundaryLoop(topology);
          localPoints = loop.map(index => topology.positions[index]);
          closed = normalized.closed ?? near3(localPoints[0], localPoints.at(-1));
        } else {
          throw new RangeError(`Extração de caminho desconhecida: ${extraction}.`);
        }
      } finally {
        geometry.dispose?.();
      }
    }
    const worldPoints = transformPoints(
      stripRepeatedEndpointIfClosed(localPoints, closed),
      hierarchy.worldMatrixOf(object.id)
    );
    if (worldPoints.length < 2) {
      throw new Error("O objeto de referência não produz um caminho utilizável.");
    }
    return Object.freeze({
      kind: "path",
      objectId: object.id,
      objectName: object.name ?? object.id,
      extraction,
      points: Object.freeze(worldPoints),
      closed: Boolean(closed),
      sourceRevision: this.sandbox.revision,
      source: Object.freeze({ type: "object", objectId: object.id })
    });
  }

  resolveProfile(reference = {}) {
    const normalized = normalizeReference(reference, PROFILE_EXTRACTIONS);
    const { hierarchy, object } = this.#objectContext(normalized);
    const descriptor = this.geometryRegistry.describeLegacyObject(object);
    const extraction = normalized.extraction === "auto"
      ? this.#automaticProfileExtraction(descriptor)
      : normalized.extraction;
    let localPoints;
    if (extraction === "contour") {
      if (!Array.isArray(descriptor.contour) || descriptor.contour.length < 3) {
        throw new Error(`${object.name ?? object.id} não possui contorno 2D declarado.`);
      }
      if (Array.isArray(descriptor.holes) && descriptor.holes.length) {
        throw new Error(
          "Perfis com furos ainda não são aceitos pela varredura; use um contorno externo sem furos."
        );
      }
      localPoints = descriptor.contour.map(([x, y]) => [x, y, 0]);
    } else if (extraction === "boundary") {
      const { geometry, topology } = this.#topology(descriptor);
      try {
        const loop = largestBoundaryLoop(topology);
        localPoints = stripRepeatedEndpoint(loop.map(index => topology.positions[index]));
      } finally {
        geometry.dispose?.();
      }
    } else {
      throw new RangeError(`Extração de perfil desconhecida: ${extraction}.`);
    }
    const worldPoints = transformPoints(localPoints, hierarchy.worldMatrixOf(object.id));
    const profile = projectPlanarProfile(worldPoints);
    return Object.freeze({
      kind: "profile",
      objectId: object.id,
      objectName: object.name ?? object.id,
      extraction,
      points: profile.points,
      origin: profile.origin,
      xAxis: profile.xAxis,
      yAxis: profile.yAxis,
      normal: profile.normal,
      quaternion: profile.quaternion,
      maxDeviation: profile.maxDeviation,
      sourceRevision: this.sandbox.revision,
      source: Object.freeze({ type: "object", objectId: object.id })
    });
  }

  resolvePoint(reference = {}) {
    const normalized = normalizeReference(reference, ["origin", "pivot"]);
    const { hierarchy, object } = this.#objectContext(normalized);
    const extraction = normalized.extraction === "auto"
      ? "pivot"
      : normalized.extraction;
    const point = extraction === "origin"
      ? hierarchy.worldPointOf(object.id, [0, 0, 0])
      : hierarchy.worldPivotOf(object.id);
    return Object.freeze({
      kind: "point",
      objectId: object.id,
      objectName: object.name ?? object.id,
      extraction,
      point: Object.freeze([...point]),
      sourceRevision: this.sandbox.revision
    });
  }

  #selectionOriginsPath(reference) {
    const state = this.sandbox.getSnapshot();
    const hierarchy = new HierarchyIndex(state.objects);
    const ids = this.editor.selection.snapshot().members
      .map(member => member.objectId)
      .filter(id => hierarchy.has(id));
    if (ids.length < 2) {
      throw new Error("O caminho por origens exige ao menos dois objetos selecionados.");
    }
    return Object.freeze({
      kind: "path",
      objectId: null,
      objectName: "Origens da seleção",
      extraction: "selection-origins",
      points: Object.freeze(ids.map(id => hierarchy.worldPivotOf(id))),
      closed: Boolean(reference.closed),
      sourceRevision: this.sandbox.revision,
      source: Object.freeze({ type: "selection", objectIds: Object.freeze(ids) })
    });
  }

  #objectContext(reference) {
    const state = this.sandbox.getSnapshot();
    const hierarchy = new HierarchyIndex(state.objects);
    const object = resolveObject(state.objects, this.editor.selection.snapshot(), reference);
    if (["group", "camera", "light"].includes(object.kind)) {
      throw new Error(`${object.name ?? object.id} não é uma geometria utilizável.`);
    }
    return { state, hierarchy, object };
  }

  #topology(descriptor) {
    const geometry = this.geometryRegistry.create(descriptor);
    const buffer = bufferDescriptorFromGeometry(geometry);
    return { geometry, topology: topologyOf(buffer) };
  }

  #automaticPathExtraction(descriptor) {
    if (descriptor.type === "tube" && Array.isArray(descriptor.points)) {
      return "centerline";
    }
    const geometry = this.geometryRegistry.create(descriptor);
    try {
      const topology = topologyOf(bufferDescriptorFromGeometry(geometry));
      if (topology.looseEdges.length) return "loose-edges";
      if (topology.boundaryLoops.length) return "boundary";
    } finally {
      geometry.dispose?.();
    }
    throw new Error(
      `A geometria ${descriptor.type} não possui linha central, arestas soltas ou contorno aberto.`
    );
  }

  #automaticProfileExtraction(descriptor) {
    if (["shape", "extrude"].includes(descriptor.type) && descriptor.contour) {
      return "contour";
    }
    const geometry = this.geometryRegistry.create(descriptor);
    try {
      const topology = topologyOf(bufferDescriptorFromGeometry(geometry));
      if (topology.boundaryLoops.length) return "boundary";
    } finally {
      geometry.dispose?.();
    }
    throw new Error(
      `A geometria ${descriptor.type} não possui contorno planar aberto.`
    );
  }

  #pathExtractions(object) {
    try {
      const descriptor = this.geometryRegistry.describeLegacyObject(object);
      if (descriptor.type === "tube") {
        return ["auto", "centerline", "boundary"];
      }
      if (this.geometryRegistry.renderProfile(descriptor).topology === "open-surface") {
        return ["auto", "boundary", "loose-edges"];
      }
      return [];
    } catch {
      return [];
    }
  }

  #profileExtractions(object) {
    try {
      const descriptor = this.geometryRegistry.describeLegacyObject(object);
      if (["shape", "extrude"].includes(descriptor.type)) {
        return ["auto", "contour", "boundary"];
      }
      return this.geometryRegistry.renderProfile(descriptor).topology === "open-surface"
        ? ["auto", "boundary"]
        : [];
    } catch {
      return [];
    }
  }
}

function normalizeReference(reference, allowedExtractions) {
  const source = typeof reference === "string"
    ? { objectId: reference }
    : { ...(reference ?? {}) };
  const extraction = String(source.extraction ?? "auto").toLowerCase();
  if (extraction !== "auto" && !allowedExtractions.includes(extraction)) {
    throw new RangeError(`Extração desconhecida: ${extraction}.`);
  }
  return Object.freeze({
    source: String(source.source ?? "object").toLowerCase(),
    objectId: source.objectId === undefined ? null : String(source.objectId),
    objectName: source.objectName === undefined ? null : String(source.objectName),
    extraction,
    closed: source.closed === undefined ? undefined : Boolean(source.closed)
  });
}

function resolveObject(objects, selection, reference) {
  const explicitId = String(reference.objectId ?? "").trim();
  if (explicitId) {
    const object = objects.find(candidate => candidate.id === explicitId);
    if (!object) throw new Error(`Objeto de referência inexistente: ${explicitId}.`);
    return object;
  }
  const explicitName = String(reference.objectName ?? "").trim();
  if (explicitName) {
    const matches = objects.filter(candidate =>
      String(candidate.name ?? "").toLowerCase() === explicitName.toLowerCase()
    );
    if (matches.length !== 1) {
      throw new Error(
        matches.length
          ? `Nome de objeto ambíguo: ${explicitName}.`
          : `Objeto de referência inexistente: ${explicitName}.`
      );
    }
    return matches[0];
  }
  const selectedId = selection.activeMember?.objectId ??
    (selection.members.length === 1 ? selection.members[0].objectId : null);
  const object = selectedId
    ? objects.find(candidate => candidate.id === selectedId)
    : null;
  if (!object) {
    throw new Error("Informe um objeto de referência ou selecione exatamente um objeto.");
  }
  return object;
}

function largestBoundaryLoop(topology) {
  if (!topology.boundaryLoops.length) {
    throw new Error("A geometria não possui contorno aberto.");
  }
  return [...topology.boundaryLoops]
    .sort((left, right) => loopLength(topology.positions, right) - loopLength(topology.positions, left))[0];
}

function loopLength(positions, loop) {
  let total = 0;
  for (let index = 1; index < loop.length; index += 1) {
    const left = positions[loop[index - 1]];
    const right = positions[loop[index]];
    total += Math.hypot(
      right[0] - left[0],
      right[1] - left[1],
      right[2] - left[2]
    );
  }
  return total;
}

function stripRepeatedEndpointIfClosed(points, closed) {
  if (!closed) return points.map(point => [...point]);
  return stripRepeatedEndpoint(points);
}

function near3(left, right, epsilon = 1e-8) {
  return new THREE.Vector3().fromArray(left)
    .distanceTo(new THREE.Vector3().fromArray(right)) <= epsilon;
}
