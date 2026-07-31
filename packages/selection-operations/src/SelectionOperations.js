import * as THREE from "three";
import { resolvePlacementFrame } from "../../math-affine/src/index.js";
import {
  cloneHierarchySubtrees,
  hierarchySubtreeIds,
  HierarchyIndex
} from "../../scene-hierarchy/src/index.js";
import {
  resolveAffineOperations,
  composeAffineStep,
  affineCopies,
  affineProgramCopies,
  matrixFromObject,
  decomposeMatrix
} from "./AffineRepeat.js?build=20260715-0021d";
import {
  explicitInstanceFamilyEstimatedBytes,
  packAnchoredExplicitInstanceFamily
} from "../../procedural-families/src/index.js?build=20260730-0041a";
import {
  appearanceBindingForObject,
  compactUniformFamilyColors,
  normalizeAppearanceBinding
} from "../../appearance-binding/src/index.js?build=20260730-0041b";

export class SelectionOperations {
  static apiVersion = "selection-operations-v7";

  constructor({
    editor,
    sandbox,
    regionId,
    geometryRegistry = null,
    appearanceRuntime = null,
    onRepeatableChanged = null
  }) {
    if (
      onRepeatableChanged !== null &&
      typeof onRepeatableChanged !== "function"
    ) {
      throw new TypeError(
        "Observador de repetição deve ser função."
      );
    }
    this.editor = editor;
    this.sandbox = sandbox;
    this.regionId = regionId;
    this.geometryRegistry = geometryRegistry;
    this.appearanceRuntime = appearanceRuntime;
    this.onRepeatableChanged = onRepeatableChanged;
    this.pendingDuplicate = null;
    this.pendingPublication = null;
    this.pendingRepeatCount = 0;
    this.lastDuplicate = null;
    this.repeatHistoryRevision = 0;
    this.localityDiagnostics = {
      explicitSceneScans: 0,
      sceneObjectsVisited: 0,
      hierarchyBuilds: 0,
      selectedObjectsVisited: 0,
      compactions: 0,
      objectsCompacted: 0,
      familyObjectsCreated: 0
    };

    this.unsubscribeSandbox = this.sandbox.subscribe((state, changes) => {
      this.#resolvePendingPublication(state);
      this.#observeDuplicateTransform(state, changes);
    });
    this.unsubscribeCoordination =
      typeof this.sandbox.subscribeCoordination === "function"
        ? this.sandbox.subscribeCoordination(snapshot =>
            this.#observeCoordination(snapshot)
          )
        : () => {};
  }

  getLocalityDiagnostics() {
    return Object.freeze({ ...this.localityDiagnostics });
  }

  createBox({ name = null, position = [0, 1, 0], size = [2, 2, 2], color = "#6699cc" } = {}) {
    const id = crypto.randomUUID();
    const index = this.sandbox.getSnapshot().objects.length + 1;
    const changed = this.sandbox.dispatch({
      type: "object.create",
      id,
      name: name || `Caixa ${index}`,
      position: [...position],
      size: [...size],
      ...this.#creationAppearance(color)
    });
    if (changed) this.#selectIds([id]);
    return { changed, id };
  }

  createGeometry({
    name = null,
    geometry,
    position = [0, 0, 0],
    rotation = [0, 0, 0, 1],
    placement = null,
    color = "#6699cc",
    material = null,
    appearanceBinding = null
  } = {}) {
    if (!this.geometryRegistry) {
      throw new Error("Registro de geometrias indisponível.");
    }

    const descriptor = this.geometryRegistry.normalize(geometry);
    const frame = placement === null
      ? null
      : resolvePlacementFrame(placement);
    const id = crypto.randomUUID();
    const index = this.sandbox.getSnapshot().objects.length + 1;
    const label = this.geometryRegistry.label(descriptor.type);
    const changed = this.sandbox.dispatch({
      type: "object.create",
      id,
      kind: descriptor.type,
      name: name || `${label} ${index}`,
      position: [...(frame?.origin ?? position)],
      rotation: [...(frame?.rotation ?? rotation)],
      geometry: descriptor,
      ...this.#creationAppearance(color, material),
      ...(appearanceBinding
        ? {
            appearanceBinding: normalizeAppearanceBinding(
              appearanceBinding,
              { fallbackColor: color }
            )
          }
        : {})
    });

    if (changed) this.#selectIds([id]);
    return { changed, id, geometry: descriptor };
  }

  createGeometrySeries({
    name = null,
    geometry,
    position = [0, 0, 0],
    rotation = [0, 0, 0, 1],
    placement = null,
    color = "#6699cc",
    count = 1,
    operations = []
  } = {}) {
    if (!this.geometryRegistry) {
      throw new Error("Registro de geometrias indisponível.");
    }
    const total = Number(count);
    if (!Number.isInteger(total) || total < 1 || total > 100000) {
      throw new RangeError("A quantidade total deve estar entre 1 e 100000.");
    }
    if (!Array.isArray(operations)) {
      throw new TypeError("Operações afins devem formar uma lista.");
    }

    const descriptor = this.geometryRegistry.normalize(geometry);
    const frame = placement === null ? null : resolvePlacementFrame(placement);
    const seedPosition = [...(frame?.origin ?? position)];
    const seedRotation = [...(frame?.rotation ?? rotation)];
    const index = this.sandbox.objectCount + 1;
    const baseName = name || `${this.geometryRegistry.label(descriptor.type)} ${index}`;
    const seedTransform = {
      position: seedPosition,
      rotation: seedRotation,
      scale: [1, 1, 1]
    };

    const copies = total - 1;
    let transforms = [];
    let resolvedOperations = [];
    if (copies > 0 && operations.length) {
      const pivotContext = {
        defaultPivot: [...seedPosition],
        medianPivot: [...seedPosition],
        boundsPivot: [...seedPosition],
        activePosition: [...seedPosition]
      };
      const resolved = resolveAffineOperations(operations, pivotContext);
      resolvedOperations = resolved.operations;
      const parametric = hasAffineExpressions(resolvedOperations);
      transforms = parametric
        ? affineProgramCopies(seedTransform, copies, resolvedOperations, {
            defaultPivot: pivotContext.defaultPivot
          })
        : affineCopies(
            seedTransform,
            copies,
            composeAffineStep(
              resolvedOperations,
              pivotContext.defaultPivot
            )
          );
    } else if (copies > 0) {
      transforms = Array.from({ length: copies }, () => ({
        position: [...seedTransform.position],
        rotation: [...seedTransform.rotation],
        scale: [...seedTransform.scale]
      }));
    }

    return this.createGeometryInstances({
      name: baseName,
      geometry: descriptor,
      preparedInstances: [seedTransform, ...transforms],
      color,
      source: "geometry-affine-series",
      generator: {
        type: "affine-series-v1",
        count: total,
        operations: structuredClone(resolvedOperations)
      }
    });
  }

  createGeometryInstances({
    name = null,
    geometry,
    worldMatrices = null,
    preparedInstances = null,
    colors = null,
    color = "#6699cc",
    material = null,
    appearanceBinding = null,
    source = "geometry-instances",
    generator = null,
    anchorPolicy = "first",
    anchor = null
  } = {}) {
    if (!this.geometryRegistry) {
      throw new Error("Registro de geometrias indisponível.");
    }
    const usesPrepared = preparedInstances !== null &&
      preparedInstances !== undefined;
    const sourceInstances = usesPrepared
      ? preparedInstances
      : worldMatrices;
    if (!Array.isArray(sourceInstances)) {
      throw new TypeError(
        "A criação instanciada exige matrizes ou transformações preparadas."
      );
    }
    if (sourceInstances.length < 1 || sourceInstances.length > 100000) {
      throw new RangeError(
        "A criação instanciada exige entre 1 e 100000 transformações."
      );
    }

    const instances = usesPrepared
      ? normalizePreparedInstances(sourceInstances)
      : transformsFromWorldMatrices(sourceInstances);
    const descriptor = this.geometryRegistry.normalize(geometry);
    const instanceColors = colors === null || colors === undefined
      ? null
      : normalizeInstanceColors(colors, instances.length);
    const requestedAppearance = normalizeAppearanceBinding(
      appearanceBinding,
      { fallbackColor: color }
    );
    const appearance = this.#creationAppearance(color, material);
    const index = this.sandbox.objectCount + 1;
    const label = this.geometryRegistry.label(descriptor.type);
    const baseName = name || `${label} ${index}`;
    /*
     * Cada cópia continua sendo um objeto lógico endereçável. O renderer pode
     * agrupá-las em lotes instanciados por geometria/aparência, sem reduzir o
     * contrato público a um único id de família.
     */
    const ids = sourceInstances.map(instance =>
      String(instance?.id ?? "").trim() || crypto.randomUUID()
    );
    const objects = instances.map((instance, instanceIndex) => {
      const instanceColor = instanceColors?.[instanceIndex] ?? null;
      return Object.freeze({
        id: ids[instanceIndex],
        name: instances.length === 1
          ? baseName
          : `${baseName} ${instanceIndex + 1}`,
        kind: descriptor.type,
        position: Object.freeze([...instance.position]),
        rotation: Object.freeze([...instance.rotation]),
        scale: Object.freeze([...instance.scale]),
        geometry: descriptor,
        ...appearance,
        appearanceBinding: requestedAppearance,
        instanceState: Object.freeze(
          instanceColor ? { color: instanceColor } : {}
        )
      });
    });
    const command = deepFreezeCommand({
      type: "selection.duplicate",
      preparedImmutable: "spatialseed-prepared-command-v1",
      source: String(source),
      sourceIds: [],
      copyCount: instances.length,
      geometryInstances: true,
      anchorPolicy,
      ...(anchor ? { anchor: structuredClone(anchor) } : {}),
      ...(generator ? { generator: structuredClone(generator) } : {}),
      objects
    });
    const changed = this.sandbox.dispatch(command);
    if (changed) this.#selectIds([ids.at(-1)]);
    return Object.freeze({
      changed,
      tool: "geometry-instances",
      geometry: descriptor,
      count: instances.length,
      familyId: null,
      familyOrigin: null,
      anchorPolicy,
      colorMode: requestedAppearance.colorMode,
      materialMode: requestedAppearance.materialMode,
      opacityMultiplier: requestedAppearance.opacityMultiplier,
      logicalObjectCount: instances.length,
      estimatedTransformBytes: instances.length * 80,
      createdIds: Object.freeze([...ids]),
      activeIds: Object.freeze(ids.length ? [ids.at(-1)] : []),
      activeId: ids.at(-1) ?? null
    });
  }

  createLight({
    name = null,
    type = "point",
    position = [0, 3, 0],
    rotation = [0, 0, 0, 1],
    color = "#ffffff",
    intensity = 3,
    distance = 0,
    decay = 2,
    angleDeg = 45,
    penumbra = 0.2,
    castShadow = true
  } = {}) {
    const id = crypto.randomUUID();
    const index = this.sandbox.getSnapshot().objects.length + 1;
    const changed = this.sandbox.dispatch({
      type: "light.create",
      id,
      name: name || `Luz ${index}`,
      position: [...position],
      rotation: [...rotation],
      light: {
        type,
        color,
        intensity,
        distance,
        decay,
        angleDeg,
        penumbra,
        castShadow
      }
    });
    if (changed) this.#selectIds([id]);
    return { changed, id };
  }

  duplicate() {
    return this.duplicateMany(1);
  }

  group({
    groupId=crypto.randomUUID(),
    name=null,
    anchorWorldPosition,
    pivot=[0,0,0]
  }={}) {
    const targetIds=this.editor.selection.snapshot().members
      .map(member => member.objectId);

    if (!targetIds.length) {
      return {
        changed:false,
        groupId:null,
        targetIds:[],
        reason:"selection-empty"
      };
    }

    const changed=this.sandbox.dispatch({
      type:"selection.group",
      groupId,
      targetIds,
      name,
      anchorWorldPosition,
      pivot
    });

    if (changed) {
      this.#selectIds([groupId]);
      this.pendingDuplicate=null;
    }

    return {
      changed,
      groupId:changed ? groupId : null,
      targetIds:[...targetIds]
    };
  }

  ungroup() {
    const state=this.sandbox.getSnapshot();
    const hierarchy=new HierarchyIndex(state.objects);
    const selectedIds=this.editor.selection.snapshot().members
      .map(member => member.objectId);
    const requestedGroups=selectedIds.filter(id =>
      hierarchy.node(id).kind === "group"
    );

    if (!requestedGroups.length) {
      return {
        changed:false,
        groupIds:[],
        promotedIds:[],
        reason:"selection-has-no-groups"
      };
    }

    const groupIds=[...hierarchy.canonicalizeSelection(requestedGroups)];
    const promotedIds=groupIds.flatMap(id => [...hierarchy.childrenOf(id)]);
    const passthroughIds=selectedIds.filter(id =>
      !groupIds.includes(id) &&
      !groupIds.some(groupId => hierarchy.ancestorsOf(id).includes(groupId))
    );
    const nextSelectionIds=[...new Set([...passthroughIds,...promotedIds])];
    const changed=this.sandbox.dispatch({
      type:"selection.ungroup",
      groupIds
    });

    if (changed) {
      if (nextSelectionIds.length) this.#selectIds(nextSelectionIds);
      else this.editor.selection.clear();
      this.pendingDuplicate=null;
    }

    return {changed,groupIds,promotedIds};
  }

  canUngroup() {
    const selectedIds =
      this.editor.selection.snapshot().members
        .map(member => member.objectId);
    return selectedIds.some(id =>
      this.#objectById(id)?.kind === "group"
    );
  }

  duplicateMany(count = 1) {
    const copies = Number(count);
    if (!Number.isInteger(copies) || copies < 1 || copies > 100000) {
      throw new RangeError("A quantidade deve ser inteiro entre 1 e 100000.");
    }

    const sourceObjects = this.#selectedObjects();
    const cloned=cloneHierarchySubtrees(
      this.sandbox.getSnapshot().objects,
      {
        rootIds:sourceObjects.map(object => object.id),
        copies,
        createId:() => crypto.randomUUID(),
        rename:({name,copyIndex}) => copyName(name,copyIndex-1)
      }
    );
    const duplicates=[...cloned.objects];
    const duplicateIds = [...cloned.duplicatedRootIds];
    this.#beginPendingPublication({
      kind: "plain",
      createdIds: duplicates.map(object => object.id),
      selectionIds: duplicateIds,
      sourceIds: [...cloned.sourceRootIds],
      duplicateIds,
      pivotBefore: this.#selectionPivot(sourceObjects),
      stagedObjects: duplicates
    });

    let changed;
    try {
      changed = this.sandbox.dispatch({
        type: "selection.duplicate",
        source: copies === 1 ? "selection-operations" : "selection-duplicate-many",
        sourceIds: [...cloned.sourceRootIds],
        copyCount: copies,
        objects: duplicates
      });
    } catch (error) {
      this.#cancelPendingPublication();
      throw error;
    }

    if (!changed) {
      this.#cancelPendingPublication();
      return { changed: false, duplicateIds: [] };
    }

    return {
      changed: true,
      copyCount: copies,
      sourceCount: sourceObjects.length,
      createdCount: duplicates.length,
      duplicateIds,
      createdIds:duplicates.map(object => object.id),
      repeatDeferred: true,
      publicationPending: Boolean(this.pendingPublication)
    };
  }

  duplicateAffine(count, operations = []) {
    const copies = Number(count);
    if (!Number.isInteger(copies) || copies < 1 || copies > 100000) {
      throw new RangeError("A quantidade deve ser inteiro entre 1 e 100000.");
    }
    if (!Array.isArray(operations) || operations.length === 0) {
      return this.duplicateMany(copies);
    }

    const sourceObjects = this.#selectedObjects();
    const pivotContext = {
      defaultPivot: this.#effectivePivot(sourceObjects),
      medianPivot: this.#selectionPivot(sourceObjects),
      boundsPivot: this.#boundsPivot(sourceObjects),
      activePosition: [...this.#activeObject().position]
    };
    const resolved = resolveAffineOperations(
      operations,
      pivotContext
    );
    const parametric = hasAffineExpressions(
      resolved.operations
    );

    const step = parametric
      ? null
      : composeAffineStep(
          resolved.operations,
          pivotContext.defaultPivot
        );

    const pivot = [...resolved.pivot.effective];
    const transformsByRootAndCopy=new Map();

    for (const object of sourceObjects) {
      const transforms = parametric
        ? affineProgramCopies(
            object,
            copies,
            resolved.operations,
            {
              defaultPivot:
                pivotContext.defaultPivot
            }
          )
        : affineCopies(object, copies, step);

      for (const transform of transforms) {
        transformsByRootAndCopy.set(
          `${transform.index}:${object.id}`,
          transform
        );
      }
    }

    const cloned=cloneHierarchySubtrees(
      this.sandbox.getSnapshot().objects,
      {
        rootIds:sourceObjects.map(object => object.id),
        copies,
        createId:() => crypto.randomUUID(),
        rename:({name,copyIndex}) => copyName(name,copyIndex-1),
        transformRoot:({clone,sourceId,copyIndex}) => {
          const transform=transformsByRootAndCopy.get(
            `${copyIndex}:${sourceId}`
          );
          return {
            ...clone,
            position:transform.position,
            rotation:transform.rotation,
            scale:transform.scale
          };
        }
      }
    );
    const duplicates=[...cloned.objects];
    const duplicateIds = [...cloned.duplicatedRootIds];
    const frontierIds=[...cloned.copies.at(-1).rootIds];
    const repeatHistory = step
      ? {
          explicit: true,
          sourceIds:
            sourceObjects.map(object => object.id),
          duplicateIds: frontierIds,
          repeatSourceIds: frontierIds,
          deltaMatrix: step.toArray(),
          matrixSpace: "local",
          pivot:
            structuredClone(resolved.pivot),
          pivotBefore: pivot
        }
      : null;
    this.#beginPendingPublication({
      kind: "affine",
      createdIds: duplicates.map(object => object.id),
      selectionIds: frontierIds,
      repeatHistory,
      repeatCount: 1
    });

    let changed;
    try {
      changed = this.sandbox.dispatch({
        type: "selection.duplicate",
        source: "selection-affine-duplicate",
        sourceIds: [...cloned.sourceRootIds],
        copyCount: copies,
        affineOperations:
          structuredClone(resolved.operations),
        affinePivot:
          structuredClone(resolved.pivot),
        affineParametric: parametric,
        ...(step
          ? { deltaMatrix: step.toArray() }
          : {}),
        objects: duplicates
      });
    } catch (error) {
      this.#cancelPendingPublication();
      throw error;
    }

    if (!changed) {
      this.#cancelPendingPublication();
      return { changed: false, duplicateIds: [] };
    }
    const publicationPending = Boolean(this.pendingPublication);

    return {
      changed: true,
      copyCount: copies,
      sourceCount: sourceObjects.length,
      createdCount: duplicates.length,
      duplicateIds,
      createdIds:duplicates.map(object => object.id),
      selectedIds: frontierIds,
      parametric,
      ...(step
        ? { deltaMatrix: step.toArray() }
        : {}),
      operations:
        structuredClone(resolved.operations),
      pivot:
        structuredClone(resolved.pivot),
      repeatSupported: !parametric,
      ...(step && !publicationPending
        ? { repeatCommand: this.#repeatCommand() }
        : { repeatDeferred: true }),
      publicationPending
    };
  }

  repeat(count = 1) {
    const repeats = Number(count);
    if (
      !Number.isInteger(repeats) ||
      repeats < 1 ||
      repeats > 100000
    ) {
      throw new RangeError(
        "A quantidade de repetições deve ser inteiro entre 1 e 100000."
      );
    }
    if (!this.lastDuplicate?.deltaMatrix) {
      const awaitingTransform = Boolean(
        this.pendingPublication?.kind === "plain" &&
        Number(this.pendingPublication.stagedTransformCount ?? 0) > 0 ||
        Number(this.pendingDuplicate?.queuedTransformCount ?? 0) > 0
      );
      if (awaitingTransform) {
        this.pendingRepeatCount += repeats;
        return {
          changed: true,
          repeatCount: repeats,
          repeatDeferred: true,
          reason: "awaiting-repeat-history"
        };
      }
      return {
        changed: false,
        reason: "no-repeat-history"
      };
    }

    let sourceObjects;

    try {
      const explicitIds = this.lastDuplicate.explicit
        ? this.lastDuplicate.repeatSourceIds
        : [];
      sourceObjects = explicitIds?.length
        ? this.#objectsByIds(explicitIds)
        : this.#selectedObjects({
            fallbackIds: this.lastDuplicate.duplicateIds
          });
    } catch (error) {
      const message = error?.message ?? "";

      if (message.includes("Objeto não encontrado")) {
        this.pendingDuplicate = null;
        this.#setLastDuplicate(null);
        this.editor.selection.clear();

        return {
          changed: false,
          reason: "stale-repeat-history"
        };
      }

      throw error;
    }

    const previousHistory = structuredClone(this.lastDuplicate);
    const delta = new THREE.Matrix4().fromArray(previousHistory.deltaMatrix);
    const deltaPowers = [];
    let accumulated = new THREE.Matrix4().identity();

    for (let index = 0; index < repeats; index += 1) {
      accumulated = delta.clone().multiply(accumulated);
      deltaPowers.push(accumulated.clone());
    }

    const currentState = this.sandbox.getSnapshot();
    const hierarchy = new HierarchyIndex(currentState.objects);
    const cloned=cloneHierarchySubtrees(
      currentState.objects,
      {
        rootIds:sourceObjects.map(object => object.id),
        copies:repeats,
        createId:() => crypto.randomUUID(),
        rename:({name,copyIndex}) =>
          repeatCopyName(name,copyIndex,repeats),
        transformRoot:({clone,source,sourceId,copyIndex}) => {
          const resultLocal =
            previousHistory.matrixSpace === "world"
              ? worldResultToLocal({
                  resultWorld: deltaPowers[copyIndex-1]
                    .clone()
                    .multiply(
                      new THREE.Matrix4().fromArray(
                        hierarchy.worldMatrixOf(sourceId)
                      )
                    ),
                  sourceId,
                  hierarchy
                })
              : deltaPowers[copyIndex-1]
                  .clone()
                  .multiply(matrixFromObject(source));
          return {...clone,...decomposeMatrix(resultLocal)};
        }
      }
    );
    const duplicates=[...cloned.objects];
    const duplicateIds = [...cloned.duplicatedRootIds];
    const frontierIds=[...cloned.copies.at(-1).rootIds];
    this.#beginPendingPublication({
      kind: "repeat",
      createdIds: duplicates.map(object => object.id),
      selectionIds: frontierIds,
      repeatHistory: {
        ...previousHistory,
        sourceIds: sourceObjects.map(object => object.id),
        duplicateIds: frontierIds,
        repeatSourceIds: frontierIds,
        pivotBefore: this.#selectionPivot(sourceObjects)
      },
      repeatCount: repeats
    });

    let changed;
    try {
      changed = this.sandbox.dispatch({
        type: "selection.duplicate",
        source: "selection-repeat",
        sourceIds: [...cloned.sourceRootIds],
        copyCount: repeats,
        repeatCount: repeats,
        deltaMatrix: [...previousHistory.deltaMatrix],
        objects: duplicates
      });
    } catch (error) {
      this.#cancelPendingPublication();
      throw error;
    }

    if (!changed) {
      this.#cancelPendingPublication();
      return { changed: false };
    }
    const publicationPending = Boolean(this.pendingPublication);

    return {
      changed: true,
      copyCount: repeats,
      repeatCount: repeats,
      createdCount: duplicates.length,
      duplicateIds,
      createdIds: duplicates.map(object => object.id),
      selectedIds: frontierIds,
      deltaMatrix: [...previousHistory.deltaMatrix],
      ...(publicationPending
        ? { repeatDeferred: true }
        : { repeatCommand: this.#repeatCommand(repeats) }),
      publicationPending
    };
  }

  deleteSelection() {
    const selectedIds = this.editor.selection.snapshot().members
      .map(member => member.objectId);
    if (!selectedIds.length) {
      return {
        changed: false,
        deletedIds: [],
        reason: "selection-empty"
      };
    }
    return this.deleteIds(selectedIds, {
      source: "selection-operations"
    });
  }

  deleteIds(objectIds, { source = "selection-eraser" } = {}) {
    const selectedIds = [...new Set(
      (objectIds ?? []).map(value => String(value ?? "").trim()).filter(Boolean)
    )];
    if (!selectedIds.length) {
      return {
        changed: false,
        deletedIds: [],
        reason: "selection-empty"
      };
    }
    const ids=[...hierarchySubtreeIds(
      this.sandbox.getSnapshot().objects,
      selectedIds
    )];

    const changed = this.sandbox.dispatch({
      type: "selection.delete",
      source,
      ids
    });

    if (changed) {
      const deleted = new Set(ids);
      this.editor.selection.replaceMany(
        this.editor.selection.snapshot().members.filter(
          member => !deleted.has(member.objectId)
        )
      );
      this.pendingDuplicate = null;
    }

    return { changed, deletedIds: ids };
  }

  setSelectionPosition(position) {
    const objects = this.#transformTargetObjects();
    const pivot = this.#effectivePivot(objects);

    return this.translate(
      position.map(
        (value, index) => value - pivot[index]
      )
    );
  }

  translate(delta) {
    const objects = this.#transformTargetObjects();
    return this.#dispatchTransforms(
      objects.map(object => ({
        id: object.id,
        position: object.position.map((value, index) => value + delta[index]),
        rotation: [...object.rotation],
        scale: [...object.scale]
      })),
      "console-translate"
    );
  }

  rotateEuler(degrees) {
    const objects = this.#transformTargetObjects();
    const pivot = new THREE.Vector3().fromArray(this.#effectivePivot(objects));
    const euler = new THREE.Euler(
      THREE.MathUtils.degToRad(degrees[0]),
      THREE.MathUtils.degToRad(degrees[1]),
      THREE.MathUtils.degToRad(degrees[2]),
      "XYZ"
    );
    const delta = aroundPivot(
      new THREE.Matrix4().makeRotationFromEuler(euler),
      pivot
    );
    return this.#applyMatrixToSelection(objects, delta, "console-rotate");
  }

  scaleBy(factors) {
    const objects = this.#transformTargetObjects();
    const pivot = new THREE.Vector3().fromArray(this.#effectivePivot(objects));
    const delta = aroundPivot(
      new THREE.Matrix4().makeScale(factors[0], factors[1], factors[2]),
      pivot
    );
    return this.#applyMatrixToSelection(objects, delta, "console-scale");
  }

  setPivotAbsolute(position) {
    this.editor.setCustomPivot([...position]);
    this.editor.setPivotPolicy("custom");
    return { policy: "custom", position: [...position], mode: "absolute" };
  }

  setPivotRelative(offset) {
    const center = [...this.#activeObject().position];
    const position = center.map(
      (value, index) => value + offset[index]
    );

    this.editor.setRelativePivot(offset);

    return {
      policy: "custom",
      reference: "active-relative",
      center,
      offset: [...offset],
      position,
      mode: "relative"
    };
  }

  getState() {
    return structuredClone({
      pendingDuplicate: this.pendingDuplicate,
      lastDuplicate: this.lastDuplicate,
      pendingPublication: this.pendingPublication
        ? {
            kind: this.pendingPublication.kind,
            createdIds: this.pendingPublication.createdIds,
            selectionIds: this.pendingPublication.selectionIds
          }
        : null
    });
  }

  compactSelectedInstances({ objectIds = null, minimumGroupSize = 2 } = {}) {
    if (!this.geometryRegistry) {
      throw new Error("Registro de geometrias indisponível.");
    }
    const minimum = Number(minimumGroupSize);
    if (!Number.isInteger(minimum) || minimum < 2) {
      throw new RangeError("Grupo mínimo de compactação deve ser >= 2.");
    }
    const requestedIds = Array.isArray(objectIds) && objectIds.length
      ? objectIds.map(String)
      : this.editor.selection.snapshot().members
          .map(member => String(member.objectId));
    if (requestedIds.length < minimum) {
      return Object.freeze({
        changed: false,
        reason: "insufficient-selection",
        requested: requestedIds.length
      });
    }

    const requested = new Set(requestedIds);
    const state = this.sandbox.getSnapshot();
    this.localityDiagnostics.explicitSceneScans += 1;
    this.localityDiagnostics.sceneObjectsVisited += state.objects.length;
    this.localityDiagnostics.selectedObjectsVisited += requested.size;
    const hasChildren = new Set();
    for (const object of state.objects) {
      const parentId = object.parentId === null || object.parentId === undefined
        ? null
        : String(object.parentId);
      if (parentId && requested.has(parentId)) hasChildren.add(parentId);
    }

    const groups = new Map();
    for (const id of requested) {
      const object = this.#objectById(id);
      if (!object || hasChildren.has(id) || object.parentId) continue;
      if (["group", "camera", "light", "instance-family"].includes(object.kind)) {
        continue;
      }
      let descriptor;
      try {
        descriptor = this.geometryRegistry.describeLegacyObject(object);
      } catch {
        continue;
      }
      const appearanceKey = JSON.stringify([
        object.appearanceId ?? null,
        object.material ?? null,
        appearanceBindingForObject(object)
      ]);
      const key = `${this.geometryRegistry.key(descriptor)}|${appearanceKey}`;
      let group = groups.get(key);
      if (!group) {
        group = { descriptor, appearanceKey, objects: [] };
        groups.set(key, group);
      }
      group.objects.push(object);
    }

    const families = [];
    const removeIds = [];
    for (const group of groups.values()) {
      if (group.objects.length < minimum) continue;
      for (let offset = 0; offset < group.objects.length; offset += 100000) {
        const members = group.objects.slice(offset, offset + 100000);
        if (members.length < minimum) continue;
        const colors = members.every(object =>
          /^#[0-9a-f]{6}$/i.test(String(object.instanceState?.color ?? ""))
        )
          ? members.map(object => object.instanceState.color)
          : null;
        const compactedColors = colors
          ? compactUniformFamilyColors(colors)
          : Object.freeze({
              colors: null,
              appearanceBinding: appearanceBindingForObject(members[0])
            });
        const anchored = packAnchoredExplicitInstanceFamily(
          members.map(object => ({
            position: [...(object.position ?? [0, 0, 0])],
            rotation: [...(object.rotation ?? [0, 0, 0, 1])],
            scale: [...(object.scale ?? [1, 1, 1])]
          })),
          {
            colors: compactedColors.colors,
            generator: {
              type: "selection-compaction-v1",
              coordinateSpace: "family-local-v1",
              sourceRevision: this.sandbox.revision,
              sourceCount: members.length
            }
          }
        );
        const family = anchored.family;
        const first = members[0];
        families.push({
          id: crypto.randomUUID(),
          name: `${first.name ?? this.geometryRegistry.label(group.descriptor.type)} × ${members.length}`,
          position: anchored.origin,
          geometry: group.descriptor,
          family,
          appearanceBinding: compactedColors.appearanceBinding,
          ...(first.appearanceId
            ? { appearanceId: first.appearanceId }
            : { material: structuredClone(first.material ?? { color: "#6699cc" }) })
        });
        removeIds.push(...members.map(object => String(object.id)));
      }
    }

    if (!families.length) {
      return Object.freeze({
        changed: false,
        reason: "no-compatible-groups",
        requested: requestedIds.length
      });
    }
    const command = deepFreezeCommand({
      type: "instance-family.compact-many",
      preparedImmutable: "spatialseed-prepared-command-v1",
      removeIds,
      families,
      source: "selection-compaction"
    });
    const changed = this.sandbox.dispatch(command);
    const familyIds = families.map(family => family.id);
    if (changed) {
      this.localityDiagnostics.compactions += 1;
      this.localityDiagnostics.objectsCompacted += removeIds.length;
      this.localityDiagnostics.familyObjectsCreated += familyIds.length;
      this.#selectIds(familyIds);
    }
    return Object.freeze({
      changed,
      removedLogicalObjects: removeIds.length,
      createdFamilyObjects: familyIds.length,
      instanceCount: families.reduce(
        (total, item) => total + item.family.count,
        0
      ),
      estimatedTransformBytes: families.reduce(
        (total, item) =>
          total + explicitInstanceFamilyEstimatedBytes(item.family),
        0
      ),
      familyIds: Object.freeze(familyIds)
    });
  }

  dispose() {
    this.unsubscribeSandbox?.();
    this.unsubscribeCoordination?.();
    this.unsubscribeSandbox = () => {};
    this.unsubscribeCoordination = () => {};
    this.pendingPublication = null;
    this.pendingRepeatCount = 0;
  }

  #beginPendingPublication(publication) {
    if (this.pendingPublication) {
      throw new Error(
        "Aguarde a duplicação anterior ser confirmada."
      );
    }
    this.pendingPublication = {
      ...structuredClone(publication),
      rollback: {
        pendingDuplicate: structuredClone(this.pendingDuplicate),
        lastDuplicate: structuredClone(this.lastDuplicate)
      }
    };
    this.pendingDuplicate = null;
    if (publication.kind !== "repeat") {
      this.#setLastDuplicate(null);
    }
  }

  #resolvePendingPublication(state) {
    const publication = this.pendingPublication;
    if (!publication) return false;
    if (publication.createdIds.some(id => !this.#objectById(id))) {
      return false;
    }

    const selectedObjects = publication.selectionIds.map(
      id => this.#objectById(id)
    );
    this.pendingPublication = null;
    this.#selectIds(publication.selectionIds);

    if (publication.kind === "plain") {
      this.localityDiagnostics.hierarchyBuilds += 1;
      this.localityDiagnostics.sceneObjectsVisited += state.objects.length;
      const hierarchy = new HierarchyIndex(state.objects);
      this.pendingDuplicate = {
        sourceIds: [...publication.sourceIds],
        duplicateIds: [...publication.duplicateIds],
        pivotBefore: [...publication.pivotBefore],
        initialWorldMatrices: Object.fromEntries(
          publication.duplicateIds.map(id => [
            id,
            [...hierarchy.worldMatrixOf(id)]
          ])
        ),
        transformedIds: [],
        queuedTransformCount: Number(
          publication.stagedTransformCount ?? 0
        )
      };
      return true;
    }

    this.pendingDuplicate = null;
    this.#setLastDuplicate(
      publication.repeatHistory
        ? {
            ...publication.repeatHistory,
            pivotAfter: this.#selectionPivot(selectedObjects)
          }
        : null,
      { count: publication.repeatCount ?? 1 }
    );
    return true;
  }

  #cancelPendingPublication() {
    const publication = this.pendingPublication;
    if (!publication) return false;
    this.pendingPublication = null;
    this.pendingRepeatCount = 0;
    this.pendingDuplicate =
      structuredClone(publication.rollback.pendingDuplicate);
    this.#setLastDuplicate(
      publication.rollback.lastDuplicate
    );
    return true;
  }

  #observeCoordination(snapshot = {}) {
    if (!this.pendingPublication) return;
    const outcome = snapshot.lastOutcome;
    if (
      Number(snapshot.pendingIntents ?? 0) === 0 &&
      outcome &&
      String(outcome.status ?? "").startsWith("rejected")
    ) {
      this.#cancelPendingPublication();
    }
  }

  #observeDuplicateTransform(state, changes = []) {
    if (!this.pendingDuplicate) return;

    const transformedIds = new Set(
      this.pendingDuplicate.transformedIds ?? []
    );
    let relevantTransform = false;

    for (const change of changes) {
      if (
        change.type === "object-transform" &&
        this.pendingDuplicate.duplicateIds.includes(
          change.objectId
        )
      ) {
        transformedIds.add(change.objectId);
        relevantTransform = true;
      }
    }

    if (!relevantTransform) return;

    this.pendingDuplicate.transformedIds = [
      ...transformedIds
    ];

    /*
     * O gizmo pode publicar os membros da seleção em notificações
     * sucessivas. Só consolidamos o histórico quando todos os membros
     * duplicados tiverem recebido sua transformação.
     */
    if (
      transformedIds.size <
      this.pendingDuplicate.duplicateIds.length
    ) {
      return;
    }

    this.localityDiagnostics.explicitSceneScans += 1;
    this.localityDiagnostics.sceneObjectsVisited += state.objects.length;
    const byId = new Map(
      state.objects.map(object => [
        object.id,
        object
      ])
    );

    const duplicates =
      this.pendingDuplicate.duplicateIds
        .map(id => byId.get(id))
        .filter(Boolean);

    if (
      duplicates.length !==
      this.pendingDuplicate.duplicateIds.length
    ) {
      return;
    }

    this.localityDiagnostics.hierarchyBuilds += 1;
    this.localityDiagnostics.sceneObjectsVisited += state.objects.length;
    const hierarchy = new HierarchyIndex(state.objects);
    const deltaMatrices = this.pendingDuplicate.duplicateIds.map(id => {
      const before = this.pendingDuplicate.initialWorldMatrices[id];
      if (!byId.has(id) || !before) return null;
      return new THREE.Matrix4()
        .fromArray(hierarchy.worldMatrixOf(id))
        .multiply(
          new THREE.Matrix4().fromArray(before).invert()
        );
    });
    if (deltaMatrices.some(matrix => matrix === null)) return;

    const [deltaMatrix] = deltaMatrices;
    if (
      deltaMatrices.some(candidate =>
        !matricesNear(candidate,deltaMatrix)
      )
    ) {
      this.pendingRepeatCount = 0;
      this.#setLastDuplicate(null);
      return;
    }

    this.#setLastDuplicate({
      sourceIds: [
        ...this.pendingDuplicate.sourceIds
      ],
      duplicateIds: [
        ...this.pendingDuplicate.duplicateIds
      ],
      pivotBefore: [
        ...this.pendingDuplicate.pivotBefore
      ],
      pivotAfter:
        this.#selectionPivot(duplicates),
      deltaMatrix:
        deltaMatrix.toArray(),
      matrixSpace: "world"
    });
    this.pendingDuplicate.queuedTransformCount = Math.max(
      0,
      Number(this.pendingDuplicate.queuedTransformCount ?? 0) - 1
    );
    if (this.pendingDuplicate.queuedTransformCount === 0) {
      this.#flushPendingRepeat();
    }
  }

  #applyMatrixToSelection(objects, delta, source) {
    return this.#dispatchTransforms(
      objects.map(object => ({
        id: object.id,
        ...decomposeMatrix(delta.clone().multiply(matrixFromObject(object)))
      })),
      source
    );
  }

  #dispatchTransforms(transforms, source) {
    const repeatHistoryBefore = this.repeatHistoryRevision;
    const composingDuplicate = Boolean(
      this.pendingDuplicate ||
      this.pendingPublication?.kind === "plain"
    );
    const changed = this.sandbox.dispatch({
      type: "selection.transform",
      source,
      selection: this.editor.selection.snapshot(),
      pivot: this.editor.snapshot().pivot,
      transforms
    });
    const repeatHistoryChanged =
      this.repeatHistoryRevision !== repeatHistoryBefore;
    if (changed && !repeatHistoryChanged) {
      this.#stagePendingTransforms(transforms);
    }
    return {
      changed,
      transforms: structuredClone(transforms),
      ...(repeatHistoryChanged && this.lastDuplicate?.deltaMatrix
        ? { repeatCommand: this.#repeatCommand() }
        : {}),
      ...(repeatHistoryChanged && !this.lastDuplicate?.deltaMatrix
        ? { repeatDeferred: true }
        : {}),
      ...(changed && composingDuplicate && !repeatHistoryChanged
        ? { repeatDeferred: true }
        : {})
    };
  }

  #transformTargetObjects() {
    const publication = this.pendingPublication;
    if (
      publication?.kind === "plain" &&
      Array.isArray(publication.stagedObjects) &&
      publication.selectionIds?.length
    ) {
      const byId = new Map(
        publication.stagedObjects.map(object => [String(object.id), object])
      );
      const targets = publication.selectionIds.map(id => byId.get(String(id)));
      if (targets.every(Boolean)) return targets;
    }
    return this.#selectedObjects();
  }

  #stagePendingTransforms(transforms) {
    const publication = this.pendingPublication;
    if (
      publication?.kind === "plain" &&
      Array.isArray(publication.stagedObjects)
    ) {
      const updates = new Map(
        transforms.map(transform => [String(transform.id), transform])
      );
      let changed = false;
      publication.stagedObjects = publication.stagedObjects.map(object => {
        const transform = updates.get(String(object.id));
        if (!transform) return object;
        changed = true;
        return {
          ...object,
          position: [...transform.position],
          rotation: [...transform.rotation],
          scale: [...transform.scale]
        };
      });
      if (changed) {
        publication.stagedTransformCount =
          Number(publication.stagedTransformCount ?? 0) + 1;
      }
      return changed;
    }
    if (this.pendingDuplicate) {
      this.pendingDuplicate.queuedTransformCount =
        Number(this.pendingDuplicate.queuedTransformCount ?? 0) + 1;
      return true;
    }
    return false;
  }

  #flushPendingRepeat() {
    const count = this.pendingRepeatCount;
    if (!(count > 0) || !this.lastDuplicate?.deltaMatrix) return false;
    this.pendingRepeatCount = 0;
    try {
      return this.repeat(count).changed;
    } catch (error) {
      this.pendingRepeatCount = count;
      console.error("Deferred selection repeat failed", error);
      return false;
    }
  }

  #selectedObjects({ fallbackIds = [] } = {}) {
    const selectedIds = this.editor.selection.snapshot().members
      .map(member => member.objectId);
    const ids = selectedIds.length ? selectedIds : fallbackIds;
    if (!ids.length) throw new Error("A seleção está vazia.");

    return ids.map(id => {
      const object = this.#objectById(id);
      if (!object) throw new Error(`Objeto não encontrado: ${id}`);
      return object;
    });
  }

  #objectsByIds(ids) {
    return ids.map(id => {
      const object = this.#objectById(id);
      if (!object) throw new Error(`Objeto não encontrado: ${id}`);
      return object;
    });
  }

  #activeObject() {
    const publication = this.pendingPublication;
    if (
      publication?.kind === "plain" &&
      Array.isArray(publication.stagedObjects) &&
      publication.selectionIds?.length
    ) {
      const activeId = String(publication.selectionIds.at(-1));
      const staged = publication.stagedObjects.find(
        object => String(object.id) === activeId
      );
      if (staged) return staged;
    }
    const id = this.editor.selection.snapshot().activeMember?.objectId;
    if (!id) throw new Error("A seleção está vazia.");
    const object = this.#objectById(id);
    if (!object) throw new Error(`Objeto ativo não encontrado: ${id}`);
    return object;
  }

  #objectById(id) {
    if (typeof this.sandbox.getObject === "function") {
      return this.sandbox.getObject(id);
    }
    return this.sandbox.getSnapshot().objects.find(
      object => String(object.id) === String(id)
    ) ?? null;
  }

  #selectionPivot(objects) {
    const sum = [0, 0, 0];
    for (const object of objects) {
      for (let index = 0; index < 3; index += 1) {
        sum[index] += Number(object.position?.[index] ?? 0);
      }
    }
    return sum.map(value => value / objects.length);
  }

  #boundsPivot(objects) {
    const bounds = new THREE.Box3().makeEmpty();
    const corner = new THREE.Vector3();

    for (const object of objects) {
      const size = object.size ?? [1, 1, 1];
      const half = size.map(
        (value, index) =>
          Math.abs(
            Number(value ?? 1) *
            Number(object.scale?.[index] ?? 1)
          ) / 2
      );
      const matrix = matrixFromObject({
        ...object,
        scale: [1, 1, 1]
      });

      for (const x of [-half[0], half[0]]) {
        for (const y of [-half[1], half[1]]) {
          for (const z of [-half[2], half[2]]) {
            corner.set(x, y, z).applyMatrix4(matrix);
            bounds.expandByPoint(corner);
          }
        }
      }
    }

    if (bounds.isEmpty()) {
      return this.#selectionPivot(objects);
    }

    return bounds.getCenter(
      new THREE.Vector3()
    ).toArray();
  }

  #effectivePivot(objects) {
    if (this.editor.pivot.policy === "custom") {
      if (
        this.editor.pivot.reference ===
        "active-relative"
      ) {
        const center =
          this.#activeObject().position;

        return center.map(
          (value, index) =>
            value +
            this.editor.pivot.relativeOffset[index]
        );
      }

      return [
        ...this.editor.pivot.customPosition
      ];
    }

    if (this.editor.pivot.policy === "active") {
      return [
        ...this.#activeObject().position
      ];
    }

    if (this.editor.pivot.policy === "bounds") {
      return this.#boundsPivot(objects);
    }

    return this.#selectionPivot(objects);
  }

  #selectIds(ids) {
    /*
     * A seleção de um objeto recém-criado ou duplicado deve voltar ao domínio
     * de transformação da geometria. Manter pivot.editing ativo fazia o gizmo
     * mover somente o pivô; assim a duplicação nunca publicava object-transform
     * e o histórico de Repetir não era consolidado.
     */
    this.editor.setPivotEditing?.(false);
    this.editor.selection.replaceMany(
      ids.map(id => ({
        kind: "object",
        regionId: this.regionId,
        objectId: id
      })),
      { activeObjectId: ids.at(-1) ?? null }
    );
  }

  #creationAppearance(color, material = null) {
    const normalizedMaterial = material
      ? structuredClone(material)
      : { color };
    normalizedMaterial.color ??= color;
    if (!this.appearanceRuntime) return { material: normalizedMaterial };

    const created = this.appearanceRuntime.internLegacyMaterial(normalizedMaterial);
    return { appearanceId: created.appearanceId };
  }

  #setLastDuplicate(history, { count = 1 } = {}) {
    this.lastDuplicate = history
      ? structuredClone(history)
      : null;
    this.repeatHistoryRevision += 1;
    if (!this.onRepeatableChanged) return;

    try {
      this.onRepeatableChanged(
        this.lastDuplicate?.deltaMatrix
          ? this.#repeatCommand(count)
          : null
      );
    } catch (error) {
      console.error(
        "SelectionOperations repeat observer failed",
        error
      );
    }
  }

  #repeatCommand(count = 1) {
    if (!this.lastDuplicate?.deltaMatrix) return null;
    return Object.freeze({
      id: "selection.repeat",
      args: Object.freeze({ count: Number(count) }),
      label: "Repetir transformação"
    });
  }

}

function hasAffineExpressions(operations) {
  return operations.some(operation =>
    Array.isArray(operation?.value) &&
    operation.value.some(value =>
      typeof value === "string"
    )
  );
}

function transformsFromWorldMatrices(worldMatrices) {
  return worldMatrices.map((matrix, copyIndex) => {
    if (!Array.isArray(matrix) || matrix.length !== 16 ||
        !matrix.every(value => Number.isFinite(Number(value)))) {
      throw new TypeError(
        `Matriz mundial inválida na cópia ${copyIndex + 1}.`
      );
    }
    return Object.freeze(decomposeMatrix(
      new THREE.Matrix4().fromArray(matrix.map(Number))
    ));
  });
}

function normalizePreparedInstances(instances) {
  return instances.map((instance, copyIndex) => Object.freeze({
    position: instanceVector(instance?.position, 3, "posição", copyIndex),
    rotation: instanceVector(instance?.rotation, 4, "rotação", copyIndex),
    scale: instanceVector(instance?.scale, 3, "escala", copyIndex)
  }));
}

function instanceVector(value, length, name, copyIndex) {
  if (!Array.isArray(value) || value.length !== length) {
    throw new TypeError(
      `${name} preparada inválida na cópia ${copyIndex + 1}.`
    );
  }
  const normalized = value.map(Number);
  if (!normalized.every(Number.isFinite)) {
    throw new TypeError(
      `${name} preparada inválida na cópia ${copyIndex + 1}.`
    );
  }
  return Object.freeze(normalized);
}

function normalizeInstanceColors(colors, count) {
  if (!Array.isArray(colors) || colors.length !== count) {
    throw new RangeError(
      "Cores instanciadas devem acompanhar todas as matrizes."
    );
  }
  return colors.map((value, index) => {
    const color = String(value ?? "").trim().toLowerCase();
    if (!/^#[0-9a-f]{6}$/i.test(color)) {
      throw new TypeError(
        `Cor instanciada inválida na cópia ${index + 1}.`
      );
    }
    return color;
  });
}

function deepFreezeCommand(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreezeCommand(child);
  return value;
}

function copyName(name, copyIndex) {
  const base = String(name)
    .replace(/(?:\s+#\d+)+$/u, "")
    .replace(/(?:\s+cópia)+$/u, "");
  return `${base} #${copyIndex + 1}`;
}

function repeatCopyName(name, copyIndex, count) {
  return count === 1
    ? `${name} cópia`
    : `${name} cópia ${copyIndex}`;
}

function matricesNear(left, right, epsilon = 1e-8) {
  return left.elements.every(
    (value,index) =>
      Math.abs(value-right.elements[index]) <= epsilon
  );
}

function worldResultToLocal({
  resultWorld,
  sourceId,
  hierarchy
}) {
  const parentId = hierarchy.parentOf(sourceId);
  return parentId === null
    ? resultWorld
    : new THREE.Matrix4()
        .fromArray(hierarchy.worldMatrixOf(parentId))
        .invert()
        .multiply(resultWorld);
}


function aroundPivot(operation, pivot) {
  return new THREE.Matrix4()
    .makeTranslation(pivot.x, pivot.y, pivot.z)
    .multiply(operation)
    .multiply(
      new THREE.Matrix4().makeTranslation(-pivot.x, -pivot.y, -pivot.z)
    );
}
