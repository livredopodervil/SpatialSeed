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

export class SelectionOperations {
  static apiVersion = "selection-operations-v5";

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
    this.lastDuplicate = null;
    this.repeatHistoryRevision = 0;

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
    material = null
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
      ...this.#creationAppearance(color, material)
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
    const id = crypto.randomUUID();
    const index = this.sandbox.getSnapshot().objects.length + 1;
    const baseName = name || `${this.geometryRegistry.label(descriptor.type)} ${index}`;
    const seedTransform = {
      id,
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
      transforms = Array.from({ length: copies }, (_, copyIndex) => ({
        index: copyIndex,
        position: [...seedTransform.position],
        rotation: [...seedTransform.rotation],
        scale: [...seedTransform.scale]
      }));
    }

    const appearance = this.#creationAppearance(color);
    const seed = {
      ...seedTransform,
      kind: descriptor.type,
      name: baseName,
      geometry: descriptor,
      ...(appearance.appearanceId
        ? { appearanceId: appearance.appearanceId }
        : { material: { color: appearance.color } }),
      instanceState: {}
    };
    const created = [seed, ...transforms.map((transform, copyIndex) => ({
      ...structuredClone(seed),
      id: crypto.randomUUID(),
      name: copyName(baseName, copyIndex),
      position: [...transform.position],
      rotation: [...transform.rotation],
      scale: [...transform.scale]
    }))];
    const changed = this.sandbox.dispatch({
      type: "selection.duplicate",
      source: "geometry-affine-series",
      sourceIds: [id],
      copyCount: copies,
      affineOperations: structuredClone(resolvedOperations),
      objects: created
    });

    if (changed) this.#selectIds([created.at(-1).id]);
    return {
      changed,
      id,
      geometry: descriptor,
      count: total,
      createdIds: created.map(object => object.id),
      activeId: created.at(-1).id
    };
  }

  createGeometryInstances({
    name = null,
    geometry,
    worldMatrices = null,
    preparedInstances = null,
    colors = null,
    color = "#6699cc",
    material = null,
    source = "geometry-instances"
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
    if (sourceInstances.length < 1 || sourceInstances.length > 10000) {
      throw new RangeError(
        "A criação instanciada exige entre 1 e 10000 transformações."
      );
    }
    const instances = usesPrepared
      ? normalizePreparedInstances(
          sourceInstances,
          typeof this.sandbox.getObject === "function"
            ? id => Boolean(this.sandbox.getObject(id))
            : this.sandbox.getSnapshot().objects
        )
      : transformsFromWorldMatrices(sourceInstances);
    const descriptor = this.geometryRegistry.normalize(geometry);
    const instanceColors = colors === null || colors === undefined
      ? null
      : normalizeInstanceColors(colors, instances.length);
    const appearance = this.#creationAppearance(color, material);
    const index = this.sandbox.getSnapshot().objects.length + 1;
    const label = this.geometryRegistry.label(descriptor.type);
    const baseName = name || `${label} ${index}`;
    const created = instances.map((instance, copyIndex) => {
      return {
        id: instance.id,
        kind: descriptor.type,
        name: copyIndex === 0
          ? baseName
          : copyName(baseName, copyIndex - 1),
        position: instance.position,
        rotation: instance.rotation,
        scale: instance.scale,
        geometry: descriptor,
        ...(appearance.appearanceId
          ? { appearanceId: appearance.appearanceId }
          : { material: { color: appearance.color } }),
        instanceState: instanceColors
          ? { color: instanceColors[copyIndex] }
          : {}
      };
    });
    const changed = this.sandbox.dispatch({
      type: "selection.duplicate",
      source: String(source),
      sourceIds: [],
      copyCount: created.length,
      objects: created
    });
    if (changed) this.#selectIds([created.at(-1).id]);
    return Object.freeze({
      changed,
      tool: "geometry-instances",
      geometry: descriptor,
      count: created.length,
      createdIds: Object.freeze(created.map(object => object.id)),
      activeIds: Object.freeze([created.at(-1).id])
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
      pivotBefore: this.#selectionPivot(sourceObjects)
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
    const objects = this.#selectedObjects();
    const pivot = this.#effectivePivot(objects);

    return this.translate(
      position.map(
        (value, index) => value - pivot[index]
      )
    );
  }

  translate(delta) {
    const objects = this.#selectedObjects();
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
    const objects = this.#selectedObjects();
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
    const objects = this.#selectedObjects();
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

  dispose() {
    this.unsubscribeSandbox?.();
    this.unsubscribeCoordination?.();
    this.unsubscribeSandbox = () => {};
    this.unsubscribeCoordination = () => {};
    this.pendingPublication = null;
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
    this.#setLastDuplicate(null);
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
        transformedIds: []
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
    const composingDuplicate = Boolean(this.pendingDuplicate);
    const changed = this.sandbox.dispatch({
      type: "selection.transform",
      source,
      selection: this.editor.selection.snapshot(),
      pivot: this.editor.snapshot().pivot,
      transforms
    });
    const repeatHistoryChanged =
      this.repeatHistoryRevision !== repeatHistoryBefore;
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
    return Object.freeze({
      id: crypto.randomUUID(),
      ...decomposeMatrix(
        new THREE.Matrix4().fromArray(matrix.map(Number))
      )
    });
  });
}

function normalizePreparedInstances(instances, existingObjects) {
  const existingHas = typeof existingObjects === "function"
    ? existingObjects
    : (() => {
        const ids = new Set(
          existingObjects.map(object => String(object.id))
        );
        return id => ids.has(String(id));
      })();
  const reserved = new Set();
  return instances.map((instance, copyIndex) => {
    const id = String(instance?.id ?? "").trim();
    if (!id || existingHas(id) || reserved.has(id)) {
      throw new Error(
        `ID preparado inválido ou duplicado na cópia ${copyIndex + 1}.`
      );
    }
    reserved.add(id);
    return Object.freeze({
      id,
      position: instanceVector(instance.position, 3, "posição", copyIndex),
      rotation: instanceVector(instance.rotation, 4, "rotação", copyIndex),
      scale: instanceVector(instance.scale, 3, "escala", copyIndex)
    });
  });
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
