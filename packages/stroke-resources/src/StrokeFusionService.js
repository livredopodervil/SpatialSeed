import * as THREE from "three";
import {
  normalizeAppearanceBinding
} from "../../appearance-binding/src/index.js?build=20260730-0041b";
import {
  appendStrokeToBundle,
  mergeStrokeBundles,
  normalizeStrokeBundleDescriptor,
  strokeBundleFindStroke,
  strokeBundleFromStroke,
  strokeResourcePath,
  strokeBundleStrokes,
  strokesTouch,
  transformStroke,
  transformStrokeBundle
} from "./StrokeBundle.js?build=20260801-0045a";

const PREPARED_COMMAND_MARKER = "spatialseed-prepared-command-v1";

export class StrokeFusionService {
  static apiVersion = "stroke-fusion-service-v4";

  constructor({
    sandbox,
    editor,
    regionId = "region-main",
    geometryRegistry,
    appearanceRuntime = null,
    compactionScheduler = null,
    createId = () => globalThis.crypto.randomUUID(),
    recentCandidateLimit = 2,
    recentMemoryLimit = 16
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
    this.compactionScheduler = compactionScheduler;
    this.createId = createId;
    this.recentCandidateLimit = Math.max(
      1,
      Math.min(2, Number(recentCandidateLimit) || 2)
    );
    this.recentMemoryLimit = Math.max(
      this.recentCandidateLimit,
      Math.min(64, Number(recentMemoryLimit) || 16)
    );
    this.recent = [];
    this.diagnostics = {
      strokesCreated: 0,
      automaticFusions: 0,
      manualFusions: 0,
      logicalGroupsCreated: 0,
      bundlesRemoved: 0,
      recentCandidatesVisited: 0,
      recentCandidatesRejected: 0,
      segmentTests: 0,
      maximumCandidatesPerStroke: 0
    };
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
    const worldStroke = transformStroke({
      id: strokeId,
      points: tube.points,
      radius: tube.radius * maximumScale(scale),
      radialSegments: tube.radialSegments,
      tubularSegments: tube.tubularSegments,
      closed: tube.closed,
      curveType: tube.curveType,
      tension: tube.tension
    }, objectMatrix({ position, rotation, scale }).toArray());

    const appearance = this.#creationAppearance(color, material);
    const binding = normalizeAppearanceBinding(appearanceBinding, {
      fallbackColor: color
    });
    const appearanceKey = appearanceIdentity({
      ...appearance,
      appearanceBinding: binding,
      material: appearance.material
    });
    const requestedTolerance = fusionTolerance === null ||
      fusionTolerance === undefined || fusionTolerance === ""
      ? 0
      : nonNegative(fusionTolerance, "fusionTolerance");
    const effectiveTolerance = requestedTolerance === 0
      ? Math.max(0.01, worldStroke.radius * 0.35)
      : requestedTolerance;

    const candidates = autoFuse
      ? this.#recentTouchingCandidates({
          worldStroke,
          tolerance: effectiveTolerance
        })
      : [];

    let changed = false;
    let targetId;
    let logicalObjectId = null;
    let createdLogicalGroup = false;
    let mode = "physical-bundle";
    let persistedBundle;
    let persistedStroke;
    let sourceIds = [];
    let removedSourceIds = [];

    if (!candidates.length) {
      const origin = worldStroke.points[0];
      const localStroke = transformStroke(
        worldStroke,
        new THREE.Matrix4().makeTranslation(
          -origin[0],
          -origin[1],
          -origin[2]
        ).toArray()
      );
      targetId = String(this.createId());
      persistedBundle = strokeBundleFromStroke(localStroke, {
        storageOrigin: [0, 0, 0],
        originPolicy: "first-point",
        selectionAnchorPolicy: "bounds-center"
      });
      persistedStroke = localStroke;
      changed = this.sandbox.dispatch({
        type: "stroke-bundle.merge",
        sourceIds: [],
        object: {
          id: targetId,
          kind: "stroke-bundle",
          name: name ?? "Traço",
          parentId: null,
          position: [...origin],
          rotation: [0, 0, 0, 1],
          scale: [1, 1, 1],
          selectionAnchorPolicy: "bounds-center",
          geometry: persistedBundle,
          appearanceBinding: binding,
          ...appearance,
          source
        },
        source
      });
    } else {
      sourceIds = [...new Set(candidates.map(item => String(item.object.id)))];
      const physicallyCompatible = candidates.every(
        item => appearanceIdentity(item.object) === appearanceKey
      );

      if (physicallyCompatible) {
        const target = candidates[0].object;
        targetId = String(target.id);
        logicalObjectId = logicalParentOfObject(target, this.sandbox)?.id ?? null;
        const targetInverse = sandboxWorldMatrix(this.sandbox, targetId).invert();
        const localStroke = transformStroke(worldStroke, targetInverse.toArray());
        const appendOnly = sourceIds.length === 1 &&
          target.kind === "stroke-bundle";

        if (appendOnly) {
          persistedBundle = appendStrokeToBundle(target.geometry, localStroke);
          persistedStroke = strokeBundleFindStroke(persistedBundle, strokeId);
          changed = this.sandbox.dispatch(Object.freeze({
            type: "stroke-bundle.append",
            preparedImmutable: PREPARED_COMMAND_MARKER,
            objectId: targetId,
            stroke: localStroke,
            trustedUniqueId: true,
            source
          }));
        } else {
          const sourceBundles = candidates.map(item =>
            bundleInTargetLocal(item.object, this.sandbox, targetInverse)
          );
          persistedBundle = mergeStrokeBundles([
            ...sourceBundles,
            strokeBundleFromStroke(localStroke)
          ], {
            idPrefix: "stroke",
            storageOrigin: target.geometry?.storageOrigin ?? [0, 0, 0],
            originPolicy: "first-point",
            selectionAnchorPolicy: target.selectionAnchorPolicy ??
              target.geometry?.selectionAnchorPolicy ?? "bounds-center"
          });
          persistedStroke = strokeBundleFindStroke(persistedBundle, strokeId) ??
            strokeBundleStrokes(persistedBundle).at(-1);
          changed = this.sandbox.dispatch({
            type: "stroke-bundle.merge",
            sourceIds,
            object: {
              ...structuredClone(target),
              kind: "stroke-bundle",
              geometry: persistedBundle,
              source
            },
            source
          });
          removedSourceIds = sourceIds;
        }
      } else {
        mode = "logical-group";
        const origin = worldStroke.points[0];
        const localStroke = transformStroke(
          worldStroke,
          new THREE.Matrix4().makeTranslation(
            -origin[0], -origin[1], -origin[2]
          ).toArray()
        );
        targetId = String(this.createId());
        persistedBundle = strokeBundleFromStroke(localStroke, {
          storageOrigin: [0, 0, 0],
          originPolicy: "first-point",
          selectionAnchorPolicy: "bounds-center"
        });
        persistedStroke = localStroke;
        const existingGroup = commonLogicalParent(candidates, this.sandbox);
        logicalObjectId = existingGroup?.id ?? String(this.createId());
        createdLogicalGroup = !existingGroup;
        changed = this.sandbox.dispatch({
          type: "stroke-logical-group.create",
          object: {
            id: targetId,
            kind: "stroke-bundle",
            name: name ?? "Traço",
            parentId: null,
            position: [...origin],
            rotation: [0, 0, 0, 1],
            scale: [1, 1, 1],
            selectionAnchorPolicy: "bounds-center",
            geometry: persistedBundle,
            appearanceBinding: binding,
            ...appearance,
            source
          },
          ...(existingGroup
            ? { existingGroupId: logicalObjectId }
            : {
                groupId: logicalObjectId,
                targetIds: sourceIds,
                name: "Objeto composto",
                anchorWorldPosition: centerOfObjectsAndStroke(
                  candidates.map(item => item.object),
                  worldStroke,
                  this.sandbox
                ),
                pivot: [0, 0, 0]
              }),
          source
        });
      }
    }

    if (changed) {
      this.diagnostics.strokesCreated += 1;
      if (candidates.length) this.diagnostics.automaticFusions += 1;
      if (createdLogicalGroup) this.diagnostics.logicalGroupsCreated += 1;
      this.diagnostics.bundlesRemoved += Math.max(
        0,
        removedSourceIds.length - 1
      );
      if (removedSourceIds.length) {
        this.#remapRecentObjects(removedSourceIds, targetId);
      }
      this.#remember({
        objectId: targetId,
        strokeId: persistedStroke.id,
        appearanceKey
      });
      this.compactionScheduler?.noteAppend?.(targetId);
      this.#select(logicalObjectId ?? targetId);
    }

    const resultId = logicalObjectId ?? targetId;
    return Object.freeze({
      changed,
      id: resultId,
      objectId: targetId,
      logicalObjectId,
      mode,
      createdIds: Object.freeze([
        targetId,
        ...(createdLogicalGroup ? [logicalObjectId] : [])
      ]),
      publishedObjectIds: Object.freeze([targetId]),
      strokeId: persistedStroke.id,
      strokeResource: strokeResourcePath(targetId, persistedStroke.id),
      fused: candidates.length > 0,
      fusionTolerance: effectiveTolerance,
      fusedBundleIds: Object.freeze(sourceIds),
      strokeCount: persistedBundle.strokeCount,
      geometry: persistedBundle
    });
  }

  fuseSelected({ objectIds = null, name = null } = {}) {
    const ids = Array.isArray(objectIds) && objectIds.length
      ? [...new Set(objectIds.map(String))]
      : [...new Set(this.editor.selection.snapshot().members
          .map(member => String(member.objectId)))];
    const objects = ids.map(id => this.sandbox.getObject(id))
      .filter(isStrokeCompatibleObject);
    if (objects.length < 2) {
      return Object.freeze({
        changed: false,
        reason: "insufficient-stroke-bundles",
        requested: ids.length
      });
    }

    const appearanceKeys = new Set(objects.map(appearanceIdentity));
    if (appearanceKeys.size > 1) {
      const groupId = String(this.createId());
      const anchorWorldPosition = centerOfObjects(objects, this.sandbox);
      const changed = this.sandbox.dispatch({
        type: "selection.group",
        groupId,
        targetIds: objects.map(object => String(object.id)),
        name: name ?? "Objeto composto",
        anchorWorldPosition,
        pivot: [0, 0, 0]
      });
      if (changed) {
        this.diagnostics.manualFusions += 1;
        this.diagnostics.logicalGroupsCreated += 1;
        this.#select(groupId);
      }
      return Object.freeze({
        changed,
        mode: "logical-group",
        id: changed ? groupId : null,
        sourceIds: Object.freeze(objects.map(object => String(object.id)))
      });
    }

    const target = objects[0];
    const targetId = String(target.id);
    const targetInverse = sandboxWorldMatrix(this.sandbox, targetId).invert();
    const merged = mergeStrokeBundles(
      objects.map(object => bundleInTargetLocal(
        object,
        this.sandbox,
        targetInverse
      )),
      {
        idPrefix: "stroke",
        storageOrigin: target.geometry?.storageOrigin ?? [0, 0, 0],
        originPolicy: "first-point",
        selectionAnchorPolicy: target.selectionAnchorPolicy ??
          target.geometry?.selectionAnchorPolicy ?? "bounds-center"
      }
    );
    const sourceIds = objects.map(object => String(object.id));
    const changed = this.sandbox.dispatch({
      type: "stroke-bundle.merge",
      sourceIds,
      object: {
        ...structuredClone(target),
        kind: "stroke-bundle",
        name: name ?? target.name ?? `Traços × ${merged.strokeCount}`,
        geometry: merged,
        source: "selection.strokes.fuse"
      },
      source: "selection.strokes.fuse"
    });
    if (changed) {
      this.diagnostics.manualFusions += 1;
      this.diagnostics.bundlesRemoved += objects.length - 1;
      this.#remapRecentObjects(sourceIds, targetId);
      this.compactionScheduler?.schedule?.(targetId, {
        reason: "manual-fusion"
      });
      this.#select(targetId);
    }
    return Object.freeze({
      changed,
      mode: "physical-bundle",
      id: changed ? targetId : null,
      sourceIds: Object.freeze(sourceIds),
      strokeCount: merged.strokeCount
    });
  }

  status() {
    return Object.freeze({
      apiVersion: StrokeFusionService.apiVersion,
      recentCandidateLimit: this.recentCandidateLimit,
      recentMemoryLimit: this.recentMemoryLimit,
      recent: Object.freeze(this.recent.map(item => Object.freeze({ ...item }))),
      diagnostics: Object.freeze({ ...this.diagnostics })
    });
  }

  clearRecent() {
    this.recent.length = 0;
    return true;
  }

  #recentTouchingCandidates({
    worldStroke,
    tolerance
  }) {
    const result = [];
    const seenObjects = new Set();
    const recent = [];
    for (let index = this.recent.length - 1; index >= 0; index -= 1) {
      const reference = this.recent[index];
      const object = this.sandbox.getObject(reference.objectId);
      if (!isStrokeCompatibleObject(object) ||
          !strokeExists(object, reference.strokeId)) {
        continue;
      }
      recent.push({ reference, object });
      if (recent.length >= this.recentCandidateLimit) break;
    }
    this.diagnostics.maximumCandidatesPerStroke = Math.max(
      this.diagnostics.maximumCandidatesPerStroke,
      recent.length
    );
    for (const { reference, object } of recent) {
      this.diagnostics.recentCandidatesVisited += 1;
      const candidate = strokeWorldById(
        object,
        reference.strokeId,
        this.sandbox
      );
      if (!candidate) {
        this.diagnostics.recentCandidatesRejected += 1;
        continue;
      }
      this.diagnostics.segmentTests +=
        Math.max(1, worldStroke.points.length - 1) *
        Math.max(1, candidate.points.length - 1);
      if (!strokesTouch(worldStroke, candidate, tolerance)) continue;
      const objectId = String(object.id);
      if (seenObjects.has(objectId)) continue;
      seenObjects.add(objectId);
      result.push({ object, reference });
    }
    return result;
  }

  #remember(reference) {
    this.recent.push(Object.freeze({ ...reference }));
    if (this.recent.length > this.recentMemoryLimit) {
      this.recent.splice(0, this.recent.length - this.recentMemoryLimit);
    }
  }

  #remapRecentObjects(sourceIds, targetId) {
    const sourceSet = new Set(sourceIds.map(String));
    this.recent = this.recent.map(reference => sourceSet.has(reference.objectId)
      ? Object.freeze({ ...reference, objectId: String(targetId) })
      : reference
    );
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

function strokeWorldById(object, strokeId, sandbox) {
  const bundle = localStrokeBundle(object);
  const stroke = strokeBundleFindStroke(bundle, strokeId) ??
    (object.geometry?.type === "tube" ? strokeBundleStrokes(bundle)[0] : null);
  return stroke
    ? transformStroke(stroke, sandboxWorldMatrix(sandbox, object.id).toArray())
    : null;
}

function strokeExists(object, strokeId) {
  if (!isStrokeCompatibleObject(object)) return false;
  if (object.geometry?.type === "tube") {
    return strokeId === `${String(object.id)}:stroke`;
  }
  return Boolean(strokeBundleFindStroke(object.geometry, strokeId));
}

function bundleInTargetLocal(object, sandbox, targetInverse) {
  const sourceWorld = sandboxWorldMatrix(sandbox, object.id);
  const matrix = targetInverse.clone().multiply(sourceWorld);
  return transformStrokeBundle(localStrokeBundle(object), matrix.toArray());
}

function sandboxWorldMatrix(sandbox, objectId) {
  const chain = [];
  const seen = new Set();
  let object = sandbox.getObject(String(objectId));
  while (object) {
    const id = String(object.id);
    if (seen.has(id)) throw new Error(`Ciclo hierárquico em ${id}.`);
    seen.add(id);
    chain.push(object);
    const parentId = object.parentId == null ? null : String(object.parentId);
    object = parentId ? sandbox.getObject(parentId) : null;
  }
  const matrix = new THREE.Matrix4().identity();
  for (let index = chain.length - 1; index >= 0; index -= 1) {
    matrix.multiply(objectMatrix(chain[index]));
  }
  return matrix;
}

function objectMatrix({
  position = [0, 0, 0],
  rotation = [0, 0, 0, 1],
  scale = [1, 1, 1]
}) {
  return new THREE.Matrix4().compose(
    new THREE.Vector3().fromArray(vector(position, 3, "posição")),
    new THREE.Quaternion().fromArray(vector(rotation, 4, "rotação")).normalize(),
    new THREE.Vector3().fromArray(vector(scale, 3, "escala"))
  );
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

function logicalParentOfObject(object, sandbox) {
  if (object?.parentId == null) return null;
  const parent = sandbox.getObject(String(object.parentId));
  return parent?.kind === "group" ? parent : null;
}

function commonLogicalParent(candidates, sandbox) {
  const parentIds = [...new Set(candidates.map(({ object }) =>
    object.parentId == null ? null : String(object.parentId)
  ))];
  if (parentIds.length !== 1 || parentIds[0] === null) return null;
  const parent = sandbox.getObject(parentIds[0]);
  return parent?.kind === "group" ? parent : null;
}

function centerOfObjectsAndStroke(objects, stroke, sandbox) {
  const bounds = new THREE.Box3().makeEmpty();
  for (const object of objects) {
    const bundle = transformStrokeBundle(
      localStrokeBundle(object),
      sandboxWorldMatrix(sandbox, object.id).toArray()
    );
    bounds.expandByPoint(new THREE.Vector3().fromArray(bundle.bounds.min));
    bounds.expandByPoint(new THREE.Vector3().fromArray(bundle.bounds.max));
  }
  for (const point of stroke.points) {
    bounds.expandByPoint(new THREE.Vector3().fromArray(point));
  }
  if (!bounds.isEmpty() && stroke.radius > 0) {
    bounds.expandByScalar(stroke.radius);
  }
  return bounds.isEmpty()
    ? [0, 0, 0]
    : bounds.getCenter(new THREE.Vector3()).toArray();
}

function centerOfObjects(objects, sandbox) {
  const bounds = new THREE.Box3().makeEmpty();
  for (const object of objects) {
    const bundle = transformStrokeBundle(
      localStrokeBundle(object),
      sandboxWorldMatrix(sandbox, object.id).toArray()
    );
    bounds.expandByPoint(new THREE.Vector3().fromArray(bundle.bounds.min));
    bounds.expandByPoint(new THREE.Vector3().fromArray(bundle.bounds.max));
  }
  return bounds.isEmpty()
    ? [0, 0, 0]
    : bounds.getCenter(new THREE.Vector3()).toArray();
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
