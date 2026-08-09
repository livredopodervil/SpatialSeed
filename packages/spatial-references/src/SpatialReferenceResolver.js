import * as THREE from "three";
import { HierarchyIndex } from "../../scene-hierarchy/src/index.js";
import { topologyOf } from "../../mesh-editor-core/src/index.js";
import {
  normalizeSketchDescriptor
} from "../../sketch-descriptor/src/index.js?build=20260802-0047g";
import {
  bufferDescriptorFromGeometry,
  orderEdgeChain,
  projectPlanarProfile,
  stripRepeatedEndpoint,
  transformPoints
} from "./ReferenceGeometry.js";

const PATH_EXTRACTIONS = Object.freeze([
  "auto",
  "sketch",
  "centerline",
  "boundary",
  "loose-edges"
]);
const PROFILE_EXTRACTIONS = Object.freeze([
  "auto",
  "sketch",
  "centerline",
  "contour",
  "boundary"
]);

export class SpatialReferenceResolver {
  static apiVersion = "spatial-reference-resolver-v3";
  #referenceState = null;
  #references = Object.freeze([]);
  #referenceById = new Map();
  #referenceIndexById = new Map();
  #selectedReferenceState = null;
  #selectedReferenceKey = null;
  #selectedReferences = null;

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

  listObjects({ includeSelection = true, ids = null } = {}) {
    const state = this.sandbox.getSnapshot();
    if (state !== this.#referenceState) {
      this.#rebuildReferenceCache(state);
    }
    if (Array.isArray(ids)) {
      const references = Object.freeze(
        [...new Set(ids.map(String))]
          .map(id => this.#referenceById.get(id))
          .filter(Boolean)
      );
      if (!includeSelection) return references;
      const selected = new Set(
        this.editor.selection.snapshot().members.map(
          member => String(member.objectId)
        )
      );
      return Object.freeze(references.map(reference => Object.freeze({
        ...reference,
        selected: selected.has(String(reference.id))
      })));
    }
    if (!includeSelection) return this.#references;

    const selection = this.editor.selection.snapshot();
    const selectionKey = selection.members
      .map(member => String(member.objectId))
      .join("\u0000");
    if (
      this.#selectedReferenceState === this.#references &&
      this.#selectedReferenceKey === selectionKey &&
      this.#selectedReferences
    ) {
      return this.#selectedReferences;
    }
    const selected = new Set(
      selection.members.map(member => String(member.objectId))
    );
    this.#selectedReferenceState = this.#references;
    this.#selectedReferenceKey = selectionKey;
    this.#selectedReferences = Object.freeze(
      this.#references.map(reference => Object.freeze({
        ...reference,
        selected: selected.has(String(reference.id))
      }))
    );
    return this.#selectedReferences;
  }

  applyChanges(state, changes = []) {
    if (!state || !Array.isArray(state.objects)) {
      throw new TypeError(
        "O cache de referências exige um snapshot com objetos."
      );
    }
    if (state === this.#referenceState) return this.#references;
    if (!this.#referenceState) {
      return this.#rebuildReferenceCache(state);
    }
    const list = Array.isArray(changes) ? changes : [];
    const supported = new Set([
      "object-created",
      "object-deleted",
      "object-transform",
      "object-updated"
    ]);
    if (
      !list.length ||
      list.some(change => !supported.has(change?.type))
    ) {
      return this.#rebuildReferenceCache(state);
    }
    if (list.some(change => change.type === "object-deleted")) {
      return this.#rebuildReferenceCache(state);
    }
    if (list.every(change => change.type === "object-transform")) {
      this.#referenceState = state;
      return this.#references;
    }

    let references = null;
    const changedReferences = [];
    for (const change of list) {
      const id = String(change.objectId ?? "");
      if (!id) return this.#rebuildReferenceCache(state);
      if (change.type === "object-transform") continue;

      const object =
        change.object ??
        this.sandbox.getObject?.(id) ??
        state.objects.find(candidate => String(candidate.id) === id);
      if (!object) return this.#rebuildReferenceCache(state);
      const reference = this.#referenceMetadata(object);
      const index = this.#referenceIndexById.get(id);
      if (Number.isInteger(index)) {
        if (reference) {
          references ??= [...this.#references];
          references[index] = reference;
          changedReferences.push({ id, index, reference });
        }
        else {
          return this.#rebuildReferenceCache(state);
        }
      } else if (reference) {
        references ??= [...this.#references];
        const appendedIndex = references.length;
        references.push(reference);
        changedReferences.push({
          id,
          index: appendedIndex,
          reference
        });
      }
    }

    this.#referenceState = state;
    if (!references) return this.#references;
    this.#references = Object.freeze(references);
    for (const { id, index, reference } of changedReferences) {
      this.#referenceById.set(id, reference);
      this.#referenceIndexById.set(id, index);
    }
    this.#invalidateSelectedReferenceCache();
    return this.#references;
  }

  resolvePath(reference = {}) {
    const normalized = normalizeReference(reference, PATH_EXTRACTIONS);
    if (normalized.source === "selection-origins") {
      return this.#selectionOriginsPath(normalized);
    }
    const { state, hierarchy, object } = this.#objectContext(normalized);
    const descriptor = this.geometryRegistry.describeLegacyObject(object);
    const extraction = normalized.extraction === "auto"
      ? this.#automaticPathExtraction(object, descriptor)
      : normalized.extraction;
    let localPoints;
    let closed = Boolean(normalized.closed);
    if (extraction === "sketch") {
      const sketch = semanticSketch(object, "path");
      localPoints = sketch.points.map(([x, y]) => [x, y, 0]);
      closed = normalized.closed ?? sketch.closed;
    } else if (extraction === "centerline") {
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
      ? this.#automaticProfileExtraction(object, descriptor)
      : normalized.extraction;
    let localPoints;
    if (extraction === "sketch") {
      const sketch = semanticSketch(object, "profile");
      localPoints = sketch.points.map(([x, y]) => [x, y, 0]);
    } else if (extraction === "centerline") {
      if (
        descriptor.type !== "tube" ||
        !descriptor.closed ||
        !Array.isArray(descriptor.points) ||
        descriptor.points.length < 3
      ) {
        throw new Error(
          `${object.name ?? object.id} não possui um contorno central fechado.`
        );
      }
      localPoints = descriptor.points.map(point => [...point]);
    } else if (extraction === "contour") {
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
    const raw = resolveObject(state.objects, this.editor.selection.snapshot(), reference);
    const object = this.sandbox.getObject?.(raw.id) ?? raw;
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

  #automaticPathExtraction(object, descriptor) {
    const sketch = optionalSemanticSketch(object);
    if (sketch) {
      if (sketch.roles.includes("path")) return "sketch";
      throw new Error(
        `${object.name ?? object.id} não declara um caminho semântico.`
      );
    }
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

  #automaticProfileExtraction(object, descriptor) {
    const sketch = optionalSemanticSketch(object);
    if (sketch) {
      if (sketch.roles.includes("profile")) return "sketch";
      throw new Error(
        `${object.name ?? object.id} não declara um perfil semântico.`
      );
    }
    if (["shape", "extrude"].includes(descriptor.type) && descriptor.contour) {
      return "contour";
    }
    if (
      descriptor.type === "tube" &&
      descriptor.closed &&
      Array.isArray(descriptor.points) &&
      descriptor.points.length >= 3
    ) {
      return "centerline";
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

  #referenceMetadata(object) {
    if (["group", "camera", "light"].includes(object.kind)) return null;
    let geometryType = null;
    let curveType = null;
    let geometryClosed = false;
    let topology = null;
    try {
      const descriptor = this.geometryRegistry.describeLegacyObject(object);
      geometryType = descriptor.type;
      curveType = descriptor.curveType ?? null;
      geometryClosed = Boolean(descriptor.closed);
      topology = this.geometryRegistry.renderProfile(descriptor).topology;
    } catch {}
    const sketch = optionalSemanticSketch(object);
    const hasSketchPath = sketch?.roles.includes("path");
    const hasSketchProfile = sketch?.roles.includes("profile");
    const pathExtractions = sketch
      ? hasSketchPath
        ? ["auto", "sketch", ...(geometryType === "tube" ? ["centerline"] : [])]
        : []
      : geometryType === "tube"
        ? ["auto", "centerline", "boundary"]
        : topology === "open-surface"
          ? ["auto", "boundary", "loose-edges"]
          : [];
    const legacyClosedCenterline = geometryType === "tube" && geometryClosed;
    const profileExtractions = sketch
      ? hasSketchProfile
        ? [
            "auto",
            "sketch",
            ...(["shape", "extrude"].includes(geometryType) ? ["contour"] : []),
            ...(legacyClosedCenterline ? ["centerline"] : [])
          ]
        : []
      : ["shape", "extrude"].includes(geometryType)
        ? ["auto", "contour", "boundary"]
        : legacyClosedCenterline
          ? ["auto", "centerline"]
          : topology === "open-surface"
            ? ["auto", "boundary"]
            : [];
    return Object.freeze({
      id: object.id,
      name: object.name ?? object.id,
      kind: object.kind,
      geometryType,
      curveType,
      sketchRoles: Object.freeze([...(sketch?.roles ?? [])]),
      pathExtractions: Object.freeze(pathExtractions),
      profileExtractions: Object.freeze(profileExtractions)
    });
  }

  #rebuildReferenceCache(state) {
    this.#referenceState = state;
    this.#references = Object.freeze(
      state.objects
        .map(object => this.sandbox.getObject?.(object.id) ?? object)
        .map(object => this.#referenceMetadata(object))
        .filter(Boolean)
    );
    this.#rebuildReferenceMaps();
    this.#invalidateSelectedReferenceCache();
    return this.#references;
  }

  #rebuildReferenceMaps() {
    this.#referenceById.clear();
    this.#referenceIndexById.clear();
    for (const [index, reference] of this.#references.entries()) {
      const id = String(reference.id);
      this.#referenceById.set(id, reference);
      this.#referenceIndexById.set(id, index);
    }
  }

  #invalidateSelectedReferenceCache() {
    this.#selectedReferenceState = null;
    this.#selectedReferenceKey = null;
    this.#selectedReferences = null;
  }
}

function optionalSemanticSketch(object) {
  if (!object?.sketch) return null;
  try {
    return normalizeSketchDescriptor(object.sketch);
  } catch {
    return null;
  }
}

function semanticSketch(object, role) {
  const sketch = optionalSemanticSketch(object);
  if (!sketch?.roles.includes(role)) {
    throw new Error(
      `${object?.name ?? object?.id ?? "O objeto"} não declara o papel ${role}.`
    );
  }
  return sketch;
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
