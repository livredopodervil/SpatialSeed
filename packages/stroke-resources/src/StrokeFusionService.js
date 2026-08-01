import * as THREE from "three";
import {
  HierarchyIndex
} from "../../scene-hierarchy/src/index.js?build=20260731-0044a";
import {
  normalizeAppearanceBinding
} from "../../appearance-binding/src/index.js?build=20260730-0041b";
import {
  appendStrokeToBundle,
  mergeStrokeBundles,
  normalizeStrokeBundleDescriptor,
  strokeBundleFromStroke,
  strokeResourcePath,
  strokesTouch,
  transformStroke
} from "./StrokeBundle.js?build=20260731-0044a";

export class StrokeFusionService {
  static apiVersion = "stroke-fusion-service-v2";

  constructor({
    sandbox,
    editor,
    regionId = "region-main",
    geometryRegistry,
    appearanceRuntime = null,
    createId = () => globalThis.crypto.randomUUID()
  } = {}) {
    if (!sandbox?.dispatch || !sandbox?.getSnapshot) {
      throw new TypeError("StrokeFusionService exige sandbox.");
    }
    if (!editor?.selection?.replaceMany) {
      throw new TypeError("StrokeFusionService exige seleção editável.");
    }
    if (!geometryRegistry?.normalize) {
      throw new TypeError("StrokeFusionService exige GeometryRegistry.");
    }
    this.sandbox = sandbox;
    this.editor = editor;
    this.regionId = String(regionId);
    this.geometryRegistry = geometryRegistry;
    this.appearanceRuntime = appearanceRuntime;
    this.createId = createId;
    this.diagnostics = {
      strokesCreated: 0,
      automaticFusions: 0,
      manualFusions: 0,
      bundlesRemoved: 0,
      sceneObjectsVisited: 0,
      segmentTests: 0,
      indexRebuilds: 0,
      candidateBundles: 0,
      indexedBundles: 0,
      broadPhaseFallbacks: 0
    };
    this.indexRevision = null;
    this.bundleIndex = new Map();
    this.spatialCells = new Map();
    this.largeBundles = new Set();
    this.cellSize = 4;
  }

  createStroke({
    name = null,
    geometry,
    position = [0, 0, 0],
    rotation = [0, 0, 0, 1],
    scale = [1, 1, 1],
    color = "#6699cc",
    material = null,
    appearanceBinding = null,
    autoFuse = true,
    fusionTolerance = null,
    source = "planar-stroke"
  } = {}) {
    const tube = this.geometryRegistry.normalize(geometry);
    if (tube.type !== "tube") {
      throw new TypeError("Fusão automática exige geometria do tipo tube.");
    }
    const strokeId = String(this.createId());
    const worldMatrix = new THREE.Matrix4().compose(
      new THREE.Vector3().fromArray(vector(position, 3, "posição")),
      new THREE.Quaternion().fromArray(vector(rotation, 4, "rotação")),
      new THREE.Vector3().fromArray(vector(scale, 3, "escala"))
    ).toArray();
    const stroke = transformStroke({
      id: strokeId,
      points: tube.points,
      radius: tube.radius * maximumScale(scale),
      radialSegments: tube.radialSegments,
      tubularSegments: tube.tubularSegments,
      closed: tube.closed,
      curveType: tube.curveType,
      tension: tube.tension
    }, worldMatrix);
    const appearance = this.#creationAppearance(color, material);
    const binding = normalizeAppearanceBinding(appearanceBinding, {
      fallbackColor: color
    });
    const appearanceKey = JSON.stringify([
      appearance.appearanceId ?? null,
      appearance.material ?? null,
      binding
    ]);
    const requestedFusionTolerance = fusionTolerance === null ||
      fusionTolerance === undefined || fusionTolerance === ""
      ? 0
      : nonNegative(fusionTolerance, "fusionTolerance");
    const effectiveFusionTolerance = requestedFusionTolerance === 0
      ? Math.max(0.01, tube.radius * maximumScale(scale) * 0.35)
      : requestedFusionTolerance;
    const state = this.sandbox.getSnapshot();
    const touching = [];
    if (autoFuse) {
      this.#ensureIndex(state);
      const candidateIds = this.#candidateIds(stroke, {
        appearanceKey,
        tolerance: effectiveFusionTolerance
      });
      this.diagnostics.candidateBundles += candidateIds.length;
      for (const id of candidateIds) {
        const indexed = this.bundleIndex.get(id);
        if (!indexed || indexed.appearanceKey !== appearanceKey) continue;
        const nearbyStrokes = candidateStrokesFromIndex(
          indexed.strokeIndex,
          stroke,
          effectiveFusionTolerance,
          this.cellSize
        );
        this.diagnostics.segmentTests += nearbyStrokes.reduce(
          (total, candidate) => total +
            Math.max(1, stroke.points.length - 1) *
            Math.max(1, candidate.points.length - 1),
          0
        );
        if (nearbyStrokes.some(candidate =>
          strokesTouch(stroke, candidate, effectiveFusionTolerance)
        )) {
          touching.push({
            object: indexed.object,
            worldBundle: indexed.worldBundle,
            indexed
          });
        }
      }
    }

    const targetObject = touching[0]?.object ?? null;
    const targetId = targetObject?.id ?? String(this.createId());
    const merged = touching.length === 0
      ? strokeBundleFromStroke(stroke)
      : touching.length === 1
        ? appendStrokeToBundle(touching[0].worldBundle, stroke)
        : mergeStrokeBundles([
            ...touching.map(item => item.worldBundle),
            strokeBundleFromStroke(stroke)
          ], { idPrefix: "stroke" });
    const commandObject = {
      id: targetId,
      kind: "stroke-bundle",
      name: targetObject?.name ?? name ?? "Traço",
      parentId: null,
      position: [0, 0, 0],
      rotation: [0, 0, 0, 1],
      scale: [1, 1, 1],
      geometry: merged,
      appearanceBinding: binding,
      ...appearance,
      source
    };
    const sourceIds = touching.map(item => String(item.object.id));
    const appendToExistingBundle = touching.length === 1 &&
      touching[0].object.kind === "stroke-bundle";
    const changed = appendToExistingBundle
      ? this.sandbox.dispatch(Object.freeze({
          type: "stroke-bundle.append",
          preparedImmutable: "spatialseed-prepared-command-v1",
          objectId: targetId,
          stroke,
          source
        }))
      : this.sandbox.dispatch({
          type: "stroke-bundle.merge",
          sourceIds,
          object: commandObject,
          source
        });
    if (changed) {
      this.diagnostics.strokesCreated += 1;
      if (touching.length) this.diagnostics.automaticFusions += 1;
      this.diagnostics.bundlesRemoved += Math.max(0, touching.length - 1);
      const appendTarget = appendToExistingBundle
        ? touching[0].indexed
        : null;
      for (const id of sourceIds) {
        if (String(id) !== String(targetId)) this.#removeIndexed(id);
      }
      const persistedStroke = merged.strokes.find(item =>
        item.id === stroke.id
      ) ?? merged.strokes.at(-1);
      if (appendTarget && String(appendTarget.id) === String(targetId)) {
        this.#updateIndexedAppend(
          appendTarget,
          commandObject,
          merged,
          persistedStroke,
          appearanceKey
        );
      } else {
        this.#removeIndexed(targetId);
        this.#indexRootObject(commandObject, merged, appearanceKey);
      }
      this.indexRevision = Number(this.sandbox.revision);
      this.#select(targetId);
    }
    const persistedStroke = merged.strokes.find(item =>
      item.id === stroke.id
    ) ?? merged.strokes.at(-1);
    return Object.freeze({
      changed,
      id: targetId,
      createdIds: Object.freeze([targetId]),
      publishedObjectIds: Object.freeze([targetId]),
      strokeId: persistedStroke.id,
      strokeResource: strokeResourcePath(targetId, persistedStroke.id),
      fused: touching.length > 0,
      fusionTolerance: effectiveFusionTolerance,
      fusedBundleIds: Object.freeze(sourceIds),
      strokeCount: merged.strokes.length,
      geometry: merged
    });
  }

  fuseSelected({ objectIds = null, name = null } = {}) {
    const ids = Array.isArray(objectIds) && objectIds.length
      ? objectIds.map(String)
      : this.editor.selection.snapshot().members
          .map(member => String(member.objectId));
    const state = this.sandbox.getSnapshot();
    const hierarchy = new HierarchyIndex(state.objects);
    const objects = ids.map(id => state.objects.find(object =>
      String(object.id) === id
    )).filter(isStrokeCompatibleObject);
    if (objects.length < 2) {
      return Object.freeze({
        changed: false,
        reason: "insufficient-stroke-bundles",
        requested: ids.length
      });
    }
    const appearanceKeys = new Set(objects.map(appearanceIdentity));
    if (appearanceKeys.size !== 1) {
      throw new Error(
        "A fusão física de traços exige aparência compatível. " +
        "Agrupe aparências diferentes como objeto lógico composto."
      );
    }
    const target = objects[0];
    const merged = mergeStrokeBundles(
      objects.map(object => bundleInWorld(object, hierarchy)),
      { idPrefix: "stroke" }
    );
    const changed = this.sandbox.dispatch({
      type: "stroke-bundle.merge",
      sourceIds: objects.map(object => String(object.id)),
      object: {
        ...structuredClone(target),
        kind: "stroke-bundle",
        name: name ?? target.name ?? `Traços × ${merged.strokes.length}`,
        parentId: null,
        position: [0, 0, 0],
        rotation: [0, 0, 0, 1],
        scale: [1, 1, 1],
        geometry: merged,
        source: "selection.strokes.fuse"
      },
      source: "selection.strokes.fuse"
    });
    if (changed) {
      this.diagnostics.manualFusions += 1;
      this.diagnostics.bundlesRemoved += objects.length - 1;
      for (const object of objects) this.#removeIndexed(object.id);
      const nextObject = {
        ...structuredClone(target),
        kind: "stroke-bundle",
        name: name ?? target.name ?? `Traços × ${merged.strokes.length}`,
        parentId: null,
        position: [0, 0, 0],
        rotation: [0, 0, 0, 1],
        scale: [1, 1, 1],
        geometry: merged,
        source: "selection.strokes.fuse"
      };
      this.#indexRootObject(
        nextObject,
        merged,
        appearanceIdentity(nextObject)
      );
      this.indexRevision = Number(this.sandbox.revision);
      this.#select(String(target.id));
    }
    return Object.freeze({
      changed,
      id: String(target.id),
      removedBundleCount: objects.length - 1,
      strokeCount: merged.strokes.length,
      strokeResources: Object.freeze(merged.strokes.map(stroke =>
        strokeResourcePath(target.id, stroke.id)
      ))
    });
  }

  status() {
    return Object.freeze({ ...this.diagnostics });
  }

  #ensureIndex(state = this.sandbox.getSnapshot()) {
    const revision = Number(this.sandbox.revision);
    if (this.indexRevision === revision) return;
    this.bundleIndex.clear();
    this.spatialCells.clear();
    this.largeBundles.clear();
    const hierarchy = new HierarchyIndex(state.objects);
    for (const object of state.objects) {
      this.diagnostics.sceneObjectsVisited += 1;
      if (!isStrokeCompatibleObject(object) || object.parentId) continue;
      const worldBundle = bundleInWorld(object, hierarchy);
      this.#indexRootObject(
        object,
        worldBundle,
        appearanceIdentity(object)
      );
    }
    this.indexRevision = revision;
    this.diagnostics.indexRebuilds += 1;
  }

  #indexRootObject(object, worldBundle, appearanceKey) {
    const id = String(object.id);
    this.#removeIndexed(id);
    const bounds = bundleBounds(worldBundle);
    const cellKeys = boundsCellKeys(bounds, this.cellSize);
    const large = cellKeys === null;
    const indexed = {
      id,
      object,
      worldBundle,
      appearanceKey,
      bounds,
      cellKeys: cellKeys ?? [],
      strokeIndex: createStrokeSpatialIndex(worldBundle, this.cellSize)
    };
    this.bundleIndex.set(id, indexed);
    if (large) {
      this.largeBundles.add(id);
    } else {
      for (const key of cellKeys) {
        let ids = this.spatialCells.get(key);
        if (!ids) {
          ids = new Set();
          this.spatialCells.set(key, ids);
        }
        ids.add(id);
      }
    }
    this.diagnostics.indexedBundles = this.bundleIndex.size;
  }

  #updateIndexedAppend(
    indexed,
    object,
    worldBundle,
    stroke,
    appearanceKey
  ) {
    this.#detachBundleCells(indexed);
    indexed.object = object;
    indexed.worldBundle = worldBundle;
    indexed.appearanceKey = appearanceKey;
    indexed.bounds = mergeBounds(indexed.bounds, strokeBounds(stroke));
    appendStrokeSpatialIndex(indexed.strokeIndex, stroke, this.cellSize);
    this.#attachBundleCells(indexed);
    this.bundleIndex.set(indexed.id, indexed);
    this.diagnostics.indexedBundles = this.bundleIndex.size;
  }

  #detachBundleCells(indexed) {
    for (const key of indexed.cellKeys ?? []) {
      const ids = this.spatialCells.get(key);
      ids?.delete(indexed.id);
      if (ids && !ids.size) this.spatialCells.delete(key);
    }
    this.largeBundles.delete(indexed.id);
  }

  #attachBundleCells(indexed) {
    const cellKeys = boundsCellKeys(indexed.bounds, this.cellSize);
    indexed.cellKeys = cellKeys ?? [];
    if (cellKeys === null) {
      this.largeBundles.add(indexed.id);
      return;
    }
    for (const key of cellKeys) {
      let ids = this.spatialCells.get(key);
      if (!ids) {
        ids = new Set();
        this.spatialCells.set(key, ids);
      }
      ids.add(indexed.id);
    }
  }

  #removeIndexed(value) {
    const id = String(value);
    const indexed = this.bundleIndex.get(id);
    if (!indexed) return false;
    this.#detachBundleCells(indexed);
    this.bundleIndex.delete(id);
    this.diagnostics.indexedBundles = this.bundleIndex.size;
    return true;
  }

  #candidateIds(stroke, { appearanceKey, tolerance }) {
    const bounds = strokeBounds(stroke, tolerance);
    const keys = boundsCellKeys(bounds, this.cellSize);
    if (keys === null) {
      this.diagnostics.broadPhaseFallbacks += 1;
      return [...this.bundleIndex.values()]
        .filter(item => item.appearanceKey === appearanceKey &&
          boundsOverlap(bounds, item.bounds))
        .map(item => item.id);
    }
    const ids = new Set(this.largeBundles);
    for (const key of keys) {
      for (const id of this.spatialCells.get(key) ?? []) ids.add(id);
    }
    return [...ids].filter(id => {
      const item = this.bundleIndex.get(id);
      return item?.appearanceKey === appearanceKey &&
        boundsOverlap(bounds, item.bounds);
    });
  }

  #creationAppearance(color, material) {
    const normalizedMaterial = material
      ? structuredClone(material)
      : { color };
    normalizedMaterial.color ??= color;
    if (!this.appearanceRuntime) return { material: normalizedMaterial };
    const created = this.appearanceRuntime.internLegacyMaterial(
      normalizedMaterial
    );
    return { appearanceId: created.appearanceId };
  }

  #select(objectId) {
    this.editor.selection.replaceMany([{
      kind: "object",
      regionId: this.regionId,
      objectId
    }], { activeObjectId: objectId });
  }
}

function bundleInWorld(object, hierarchy) {
  const bundle = localStrokeBundle(object);
  const matrix = hierarchy.worldMatrixOf(object.id);
  return normalizeStrokeBundleDescriptor({
    type: "stroke-bundle",
    strokes: bundle.strokes.map(stroke => transformStroke(stroke, matrix))
  });
}

function localStrokeBundle(object) {
  if (object?.geometry?.type === "stroke-bundle") {
    return normalizeStrokeBundleDescriptor(object.geometry);
  }
  if (object?.geometry?.type === "tube") {
    return strokeBundleFromStroke({
      id: `${String(object.id)}:stroke`,
      points: object.geometry.points,
      radius: object.geometry.radius,
      radialSegments: object.geometry.radialSegments,
      tubularSegments: object.geometry.tubularSegments,
      closed: object.geometry.closed,
      curveType: object.geometry.curveType,
      tension: object.geometry.tension
    });
  }
  throw new TypeError(`Objeto ${object?.id ?? "?"} não contém traços.`);
}

function isStrokeCompatibleObject(object) {
  return Boolean(
    object &&
    (object.kind === "stroke-bundle" || object.geometry?.type === "tube")
  );
}

function appearanceIdentity(object) {
  return JSON.stringify([
    object.appearanceId ?? null,
    object.material ?? null,
    normalizeAppearanceBinding(object.appearanceBinding, {
      fallbackColor: object.material?.color ?? "#6699cc"
    })
  ]);
}

function createStrokeSpatialIndex(bundleValue, cellSize) {
  const bundle = normalizeStrokeBundleDescriptor(bundleValue);
  const index = {
    byId: new Map(),
    cells: new Map(),
    large: new Set()
  };
  for (const stroke of bundle.strokes) {
    appendStrokeSpatialIndex(index, stroke, cellSize);
  }
  return index;
}

function appendStrokeSpatialIndex(index, stroke, cellSize) {
  const bounds = strokeBounds(stroke);
  const cellKeys = boundsCellKeys(bounds, cellSize);
  const entry = { stroke, bounds, cellKeys: cellKeys ?? [] };
  index.byId.set(stroke.id, entry);
  if (cellKeys === null) {
    index.large.add(stroke.id);
    return;
  }
  for (const key of cellKeys) {
    let ids = index.cells.get(key);
    if (!ids) {
      ids = new Set();
      index.cells.set(key, ids);
    }
    ids.add(stroke.id);
  }
}

function candidateStrokesFromIndex(index, stroke, tolerance, cellSize) {
  const bounds = strokeBounds(stroke, tolerance);
  const keys = boundsCellKeys(bounds, cellSize);
  if (keys === null) {
    return [...index.byId.values()]
      .filter(entry => boundsOverlap(bounds, entry.bounds))
      .map(entry => entry.stroke);
  }
  const ids = new Set(index.large);
  for (const key of keys) {
    for (const id of index.cells.get(key) ?? []) ids.add(id);
  }
  return [...ids].map(id => index.byId.get(id))
    .filter(entry => entry && boundsOverlap(bounds, entry.bounds))
    .map(entry => entry.stroke);
}

function mergeBounds(left, right) {
  return Object.freeze({
    min: Object.freeze(left.min.map((value, axis) =>
      Math.min(value, right.min[axis])
    )),
    max: Object.freeze(left.max.map((value, axis) =>
      Math.max(value, right.max[axis])
    ))
  });
}

function bundleBounds(bundle) {
  const normalized = normalizeStrokeBundleDescriptor(bundle);
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const stroke of normalized.strokes) {
    const radius = Math.max(0, Number(stroke.radius));
    for (const point of stroke.points) {
      for (let axis = 0; axis < 3; axis += 1) {
        min[axis] = Math.min(min[axis], point[axis] - radius);
        max[axis] = Math.max(max[axis], point[axis] + radius);
      }
    }
  }
  return Object.freeze({ min: Object.freeze(min), max: Object.freeze(max) });
}

function strokeBounds(stroke, tolerance = 0) {
  const margin = Math.max(0, Number(stroke.radius)) +
    Math.max(0, Number(tolerance));
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const point of stroke.points) {
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis], point[axis] - margin);
      max[axis] = Math.max(max[axis], point[axis] + margin);
    }
  }
  return Object.freeze({ min: Object.freeze(min), max: Object.freeze(max) });
}

function boundsOverlap(left, right) {
  return [0, 1, 2].every(axis =>
    left.min[axis] <= right.max[axis] &&
    left.max[axis] >= right.min[axis]
  );
}

function boundsCellKeys(bounds, cellSize, maximum = 4096) {
  const first = bounds.min.map(value => Math.floor(value / cellSize));
  const last = bounds.max.map(value => Math.floor(value / cellSize));
  const count = (last[0] - first[0] + 1) *
    (last[1] - first[1] + 1) *
    (last[2] - first[2] + 1);
  if (!Number.isFinite(count) || count > maximum) return null;
  const keys = [];
  for (let x = first[0]; x <= last[0]; x += 1) {
    for (let y = first[1]; y <= last[1]; y += 1) {
      for (let z = first[2]; z <= last[2]; z += 1) {
        keys.push(`${x}:${y}:${z}`);
      }
    }
  }
  return keys;
}

function vector(value, length, label) {
  if (!Array.isArray(value) || value.length !== length) {
    throw new TypeError(`${label} deve conter ${length} números.`);
  }
  const result = value.map(Number);
  if (!result.every(Number.isFinite)) {
    throw new TypeError(`${label} contém valor inválido.`);
  }
  return result;
}

function maximumScale(value) {
  return Math.max(...vector(value, 3, "escala").map(Math.abs));
}

function nonNegative(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new RangeError(`${label} deve ser finito e não negativo.`);
  }
  return number;
}
