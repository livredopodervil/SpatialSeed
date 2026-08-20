import {
  dataObjectDocumentEqual,
  normalizeDataObject,
  normalizeDataObjectDocument,
  persistentObjectAppendMany,
  persistentObjectRemoveIds,
  persistentObjectUpdateAt,
  persistentObjectUpdateMany
} from "../../core/src/index.js?build=20260819-0054na";
import {
  normalizeInteractionDocument
} from "../../core/src/index.js?build=20260818-0054mx";
import {
  compactHierarchyRoots,
  duplicateReferenceRoots,
  isInstanceNode,
  replaceInstanceObjectDefinition,
  replaceInstanceOccurrenceObjectDefinition,
  resolveInstanceOccurrence,
  updateInstanceOccurrenceRoot,
  ungroupAssemblyInstance
} from "../../instance-graph/src/index.js?build=20260807-0052b";
import {
  applyWorldTransforms,
  groupNodes,
  hierarchySubtreeIds,
  HierarchyIndex,
  reparentPreservingWorld,
  ungroupNodes
} from "../../scene-hierarchy/src/index.js?build=20260807-0051a";
import {
  decomposeTransformStrict,
  invertAffineMatrix,
  multiplyMatrices
} from "../../math-affine/src/index.js";
import {
  normalizeExplicitInstanceFamily
} from "../../procedural-families/src/index.js?build=20260731-0044a";
import {
  normalizeAppearanceBinding
} from "../../appearance-binding/src/index.js?build=20260730-0041a";
import {
  appendStrokeToBundle,
  normalizeStrokeBundleDescriptor,
  rebaseStrokeBundleOrigin
} from "../../stroke-resources/src/index.js?build=20260801-0045a1";
import {
  normalizeSketchDescriptor
} from "../../sketch-descriptor/src/index.js?build=20260802-0047g";

function updateById(objects, id, updater, context = {}) {
  const index = typeof context.getObjectPosition === "function"
    ? context.getObjectPosition(id)
    : objects.findIndex(object => object.id === id);
  if (index < 0) return objects;
  const current = typeof context.getObject === "function"
    ? context.getObject(id) ?? objects[index]
    : objects[index];
  const nextObject = Object.freeze(updater(current));
  return persistentObjectUpdateAt(objects, index, nextObject);
}

function updateMany(objects, transforms, context = {}) {
  const updates = [];
  for (const transform of transforms ?? []) {
    const index = typeof context.getObjectPosition === "function"
      ? context.getObjectPosition(transform.id)
      : objects.findIndex(object => object.id === transform.id);
    if (index < 0) continue;
    const object = typeof context.getObject === "function"
      ? context.getObject(transform.id) ?? objects[index]
      : objects[index];
    updates.push({
      index,
      value: Object.freeze({
        ...object,
        position: Object.freeze([...transform.position]),
        rotation: Object.freeze([...transform.rotation]),
        scale: Object.freeze([...transform.scale])
      })
    });
  }
  return persistentObjectUpdateMany(objects, updates);
}

function applyObjectPatch(object, patch = {}) {
  if (isInstanceNode(object)) {
    const currentSelf = object.overrides?.$self ?? {};
    const selfPatch = { ...patch };
    if ("instanceState" in patch) {
      selfPatch.instanceState = freezeInstanceState({
        ...(currentSelf.instanceState ?? {}),
        ...(patch.instanceState ?? {})
      });
    }
    if ("camera" in patch) {
      selfPatch.camera = freezeCamera({
        ...(currentSelf.camera ?? {}),
        ...(patch.camera ?? {})
      });
    }
    if ("light" in patch) {
      selfPatch.light = freezeLight({
        ...(currentSelf.light ?? {}),
        ...(patch.light ?? {})
      });
    }
    if ("appearanceId" in patch) {
      selfPatch.appearanceId = String(patch.appearanceId);
      delete selfPatch.material;
    }
    const overrides = Object.freeze({
      ...(object.overrides ?? {}),
      $self: Object.freeze({
        ...currentSelf,
        ...selfPatch
      })
    });
    return { ...object, overrides };
  }

  const next = {
    ...object,
    ...patch
  };

  if ("instanceState" in patch) {
    next.instanceState = freezeInstanceState({
      ...(object.instanceState ?? {}),
      ...(patch.instanceState ?? {})
    });
  }

  if ("camera" in patch) {
    next.camera = freezeCamera({
      ...(object.camera ?? {}),
      ...(patch.camera ?? {})
    });
  }

  if ("light" in patch) {
    next.light = freezeLight({
      ...(object.light ?? {}),
      ...(patch.light ?? {})
    });
  }

  if ("appearanceId" in patch) {
    next.appearanceId = String(patch.appearanceId);
    delete next.material;
  } else if (patch.material) {
    next.material = Object.freeze({
      ...(object.material ?? {}),
      ...patch.material,
      texture: patch.material.texture
        ? Object.freeze({
            ...((object.material ?? {}).texture ?? {}),
            ...patch.material.texture
          })
        : (object.material ?? {}).texture
    });
  }

  if ("appearanceBinding" in patch) {
    next.appearanceBinding = normalizeAppearanceBinding(
      patch.appearanceBinding,
      {
        family: next.family,
        fallbackColor: next.material?.color ?? object.material?.color ?? "#ffffff",
        instanceColor: next.instanceState?.color ?? null
      }
    );
  }

  if (resourcePatchKeys(patch).length) {
    next.prototypeId = newPrototypeId(object.id);
    next.derivedFromPrototypeId = object.prototypeId ?? object.id;
  }

  return next;
}

function applyPropertyUpdates(state, command, context = {}) {
  const objects = state.objects;
  const targetIds = [...(command.targetIds ?? [])].map(String);
  const updates = command.updates ?? [];
  if (!targetIds.length || !updates.length) {
    return { objects, rootChanges: new Map(), changedTargets: [] };
  }
  const uniqueTargets = new Set(targetIds);
  const updateByIdMap = new Map(updates.map(update => [String(update.id), update]));
  if (uniqueTargets.size !== targetIds.length) {
    throw new Error("Alvos de propriedades duplicados.");
  }
  for (const id of targetIds) {
    const exists = typeof context.hasObject === "function"
      ? context.hasObject(id)
      : objects.some(object => String(object.id) === id);
    if (!exists) throw new Error(`Objeto inexistente: ${id}.`);
    if (!updateByIdMap.has(id)) throw new Error(`Atualização ausente: ${id}.`);
  }
  if (
    updates.length !== targetIds.length ||
    updates.some(update => !uniqueTargets.has(String(update.id)))
  ) {
    throw new Error("Atualizações de propriedades não correspondem aos alvos.");
  }

  const indexed = [];
  const rootChanges = new Map();
  const changedTargets = [];
  for (const id of targetIds) {
    const occurrence = typeof context.getInstanceOccurrence === "function"
      ? context.getInstanceOccurrence(id)
      : null;
    const update = updateByIdMap.get(id);
    if (occurrence) {
      const rootId = occurrence.rootId;
      const existing = rootChanges.get(rootId);
      const rootObject = existing?.value ?? context.getRawObject?.(rootId);
      if (!rootObject) continue;
      const currentOccurrence = resolveInstanceOccurrence(
        state,
        id,
        { rootInstance: rootObject }
      );
      if (!currentOccurrence) continue;
      const effective = applyObjectPatch(currentOccurrence.object, update.patch);
      const occurrenceUpdate = occurrencePatchFromEffective(
        currentOccurrence.object,
        effective,
        update.patch
      );
      const value = updateInstanceOccurrenceRoot(
        rootObject,
        currentOccurrence.path,
        occurrenceUpdate
      );
      const index = context.getObjectPosition?.(rootId) ?? -1;
      if (index < 0) continue;
      rootChanges.set(rootId, {
        index,
        value,
        previousObject: existing?.previousObject ?? rootObject,
        affectedOccurrenceIds: [
          ...(existing?.affectedOccurrenceIds ?? []),
          id
        ]
      });
      changedTargets.push(id);
      continue;
    }

    const index = typeof context.getObjectPosition === "function"
      ? context.getObjectPosition(id)
      : objects.findIndex(object => String(object.id) === id);
    if (index < 0) continue;
    const object = typeof context.getObject === "function"
      ? context.getObject(id) ?? objects[index]
      : objects[index];
    indexed.push({
      index,
      value: Object.freeze(applyObjectPatch(object, update.patch))
    });
    changedTargets.push(id);
  }
  for (const entry of rootChanges.values()) {
    indexed.push({ index: entry.index, value: entry.value });
  }
  return {
    objects: persistentObjectUpdateMany(objects, indexed),
    rootChanges,
    changedTargets
  };
}

function occurrencePatchFromEffective(before, after, requestedPatch = {}) {
  const update = {};
  if (
    "position" in requestedPatch ||
    "rotation" in requestedPatch ||
    "scale" in requestedPatch
  ) {
    update.transform = {
      position: after.position ?? before.position ?? [0, 0, 0],
      rotation: after.rotation ?? before.rotation ?? [0, 0, 0, 1],
      scale: after.scale ?? before.scale ?? [1, 1, 1]
    };
  }
  if ("name" in requestedPatch) update.name = after.name;
  if ("pivot" in requestedPatch) update.pivot = after.pivot;
  const reserved = new Set(["position", "rotation", "scale", "name", "pivot"]);
  const patch = {};
  for (const key of Object.keys(requestedPatch)) {
    if (!reserved.has(key)) patch[key] = after[key];
  }
  if (Object.keys(patch).length) update.patch = patch;
  return update;
}

function applyLocalTransforms(state, transforms, context = {}) {
  const indexed = [];
  const rootChanges = new Map();
  const changedTargets = [];
  for (const transform of transforms ?? []) {
    const id = String(transform?.id ?? "");
    if (!id) continue;
    const occurrence = context.getInstanceOccurrence?.(id) ?? null;
    if (occurrence) {
      const rootId = occurrence.rootId;
      const existing = rootChanges.get(rootId);
      const rootObject = existing?.value ?? context.getRawObject?.(rootId);
      if (!rootObject) continue;
      const currentOccurrence = resolveInstanceOccurrence(state, id, { rootInstance: rootObject });
      if (!currentOccurrence) continue;
      const value = updateInstanceOccurrenceRoot(
        rootObject,
        currentOccurrence.path,
        {
          transform: {
            position: transform.position,
            rotation: transform.rotation,
            scale: transform.scale
          }
        }
      );
      const index = context.getObjectPosition?.(rootId) ?? -1;
      if (index < 0) continue;
      rootChanges.set(rootId, {
        index,
        value,
        previousObject: existing?.previousObject ?? rootObject,
        affectedOccurrenceIds: [
          ...(existing?.affectedOccurrenceIds ?? []),
          id
        ]
      });
      changedTargets.push(id);
      continue;
    }
    const index = context.getObjectPosition?.(id) ?? -1;
    if (index < 0) continue;
    const object = context.getRawObject?.(id) ?? state.objects[index];
    indexed.push({
      index,
      value: Object.freeze({
        ...object,
        position: Object.freeze([...transform.position]),
        rotation: Object.freeze([...transform.rotation]),
        scale: Object.freeze([...transform.scale])
      })
    });
    changedTargets.push(id);
  }
  for (const entry of rootChanges.values()) indexed.push({ index: entry.index, value: entry.value });
  return {
    objects: persistentObjectUpdateMany(state.objects, indexed),
    rootChanges,
    changedTargets
  };
}

function localTransformsFromWorld(transforms, context = {}) {
  return (transforms ?? []).map(transform => {
    const id = String(transform?.id ?? "");
    const occurrence = context.getInstanceOccurrence?.(id) ?? null;
    if (!occurrence) return null;
    const parentWorld = context.getObjectParentWorldMatrix?.(id);
    if (!parentWorld) return null;
    const localMatrix = multiplyMatrices(
      invertAffineMatrix(parentWorld),
      transform.worldMatrix
    );
    const local = decomposeTransformStrict(localMatrix);
    return {
      id,
      position: local.position,
      rotation: local.rotation,
      scale: local.scale
    };
  }).filter(Boolean);
}

function occurrenceRootChanges(rootChanges, source, type = "object-updated") {
  return [...rootChanges.entries()].map(([rootId, entry]) => ({
    type,
    objectId: rootId,
    object: entry.value,
    previousObject: entry.previousObject,
    source,
    affectedOccurrenceIds: Object.freeze([...new Set(entry.affectedOccurrenceIds ?? [])]),
    occurrenceChanges: Object.freeze([...new Set(entry.affectedOccurrenceIds ?? [])].map(
      occurrenceId => Object.freeze({ occurrenceId, type: "sync" })
    ))
  }));
}


export function boxRegionReducer(state, command, context = {}) {
  switch (command.type) {
    case "camera.create": {
      const id = String(command.id ?? "").trim();
      if (!id) {
        throw new TypeError("Câmera persistente exige id.");
      }
      if (typeof context.hasObject === "function"
        ? context.hasObject(id)
        : state.objects.some(object => object.id === id)) {
        throw new Error(`Duplicate object id: ${id}`);
      }
      const camera = freezeCamera(command.camera);
      const object = Object.freeze({
        id,
        prototypeId: command.prototypeId ?? id,
        kind: "camera",
        name: String(command.name ?? id),
        parentId: command.parentId ?? null,
        position: freezeVector(
          command.position ?? [0, 0, 0],
          3,
          "Posição de câmera inválida."
        ),
        rotation: freezeVector(
          command.rotation ?? [0, 0, 0, 1],
          4,
          "Orientação de câmera inválida."
        ),
        scale: Object.freeze([1, 1, 1]),
        camera
      });
      const objects = persistentObjectAppendMany(state.objects, [object]);
      validateNewParent(object, context);
      const makeDefault = Boolean(command.makeDefault);
      return {
        state: Object.freeze({
          ...state,
          objects,
          ...(makeDefault ? { defaultCameraId: id } : {})
        }),
        changes: [
          {
            type: "object-created",
            objectId: id,
            object
          },
          ...(makeDefault
            ? [{
                type: "camera-default-changed",
                objectId: id,
                cameraId: id
              }]
            : [])
        ]
      };
    }

    case "camera.update": {
      const id = String(command.id ?? "").trim();
      const current = typeof context.getObject === "function"
        ? context.getObject(id)
        : state.objects.find(object => object.id === id);
      if (!current || current.kind !== "camera") {
        throw new Error(`Câmera persistente inexistente: ${id}.`);
      }
      const patch = structuredClone(command.patch ?? {});
      const nextCamera = "camera" in patch
        ? freezeCamera({
            ...current.camera,
            ...patch.camera
          })
        : current.camera;
      const nextPosition = "position" in patch
        ? freezeVector(
            patch.position,
            3,
            "Posição de câmera inválida."
          )
        : current.position;
      const nextRotation = "rotation" in patch
        ? freezeVector(
            patch.rotation,
            4,
            "Orientação de câmera inválida."
          )
        : current.rotation;
      const objects = updateById(
        state.objects,
        id,
        object => ({
          ...object,
          ...patch,
          kind: "camera",
          position: nextPosition,
          rotation: nextRotation,
          scale: object.scale ?? [1, 1, 1],
          camera: nextCamera
        }),
        context
      );
      return {
        state: Object.freeze({ ...state, objects }),
        changes: [{
          type: "object-updated",
          objectId: id,
          source: "camera"
        }]
      };
    }

    case "camera.default.set": {
      const id = command.id === null || command.id === undefined
        ? null
        : String(command.id).trim();
      if (id !== null) {
        const candidate = typeof context.getObject === "function"
          ? context.getObject(id)
          : state.objects.find(object => object.id === id);
        const camera = candidate?.kind === "camera" ? candidate : null;
        if (!camera) {
          throw new Error(`Câmera persistente inexistente: ${id}.`);
        }
      }
      if ((state.defaultCameraId ?? null) === id) {
        return { state, changes: [] };
      }
      const next = { ...state };
      if (id === null) delete next.defaultCameraId;
      else next.defaultCameraId = id;
      return {
        state: Object.freeze(next),
        changes: [{
          type: "camera-default-changed",
          objectId: id,
          cameraId: id
        }]
      };
    }

    case "light.create": {
      const id = String(command.id ?? "").trim();
      if (!id) throw new TypeError("Luz persistente exige id.");
      if (typeof context.hasObject === "function"
        ? context.hasObject(id)
        : state.objects.some(object => object.id === id)) {
        throw new Error(`Duplicate object id: ${id}`);
      }
      const object = Object.freeze({
        id,
        prototypeId: command.prototypeId ?? id,
        kind: "light",
        name: String(command.name ?? id),
        parentId: command.parentId ?? null,
        position: freezeVector(
          command.position ?? [0, 3, 0],
          3,
          "Posição de luz inválida."
        ),
        rotation: freezeVector(
          command.rotation ?? [0, 0, 0, 1],
          4,
          "Orientação de luz inválida."
        ),
        scale: Object.freeze([1, 1, 1]),
        light: freezeLight(command.light)
      });
      const objects = persistentObjectAppendMany(state.objects, [object]);
      validateNewParent(object, context);
      return {
        state: Object.freeze({ ...state, objects }),
        changes: [{ type: "object-created", objectId: id, object }]
      };
    }

    case "stroke-bundle.append": {
      const objectId = String(command.objectId ?? "").trim();
      if (!objectId) throw new TypeError("Append de traço exige objeto-alvo.");
      const existing = typeof context.getObject === "function"
        ? context.getObject(objectId)
        : state.objects.find(object => String(object.id) === objectId);
      if (!existing || existing.kind !== "stroke-bundle") {
        throw new Error(`Conjunto de traços inexistente: ${objectId}.`);
      }
      const geometry = appendStrokeToBundle(
        existing.geometry,
        command.stroke,
        {
          policy: command.policy ?? null,
          trustedUniqueId: Boolean(command.trustedUniqueId)
        }
      );
      const existingWithoutSketch = omitSketch(existing);
      const object = Object.freeze({ ...existingWithoutSketch, geometry });
      const objects = updateById(
        state.objects,
        objectId,
        () => object,
        context
      );
      return {
        state: Object.freeze({ ...state, objects }),
        changes: [{
          type: "object-updated",
          objectId,
          object,
          source: command.source ?? "stroke-bundle.append"
        }]
      };
    }

    case "stroke-logical-group.create": {
      const target = freezeStrokeBundleObject(command.object, context);
      if (typeof context.hasObject === "function"
        ? context.hasObject(target.id)
        : state.objects.some(object => String(object.id) === String(target.id))) {
        throw new Error(`Duplicate object id: ${target.id}`);
      }
      const withTarget = persistentObjectAppendMany(state.objects, [target]);
      const existingGroupId = command.existingGroupId == null
        ? null
        : String(command.existingGroupId);

      if (existingGroupId !== null) {
        const group = typeof context.getObject === "function"
          ? context.getObject(existingGroupId)
          : state.objects.find(object => String(object.id) === existingGroupId);
        if (!group || group.kind !== "group") {
          throw new Error(`Grupo lógico inexistente: ${existingGroupId}.`);
        }
        const objects = reparentPreservingWorld(withTarget, {
          id: String(target.id),
          parentId: existingGroupId
        });
        return {
          state: Object.freeze({ ...state, objects }),
          changes: [
            {
              type: "object-created",
              objectId: String(target.id),
              source: command.source ?? "stroke-logical-group.create"
            },
            {
              type: "hierarchy-reparented",
              objectId: String(target.id),
              parentId: existingGroupId,
              source: command.source ?? "stroke-logical-group.create"
            }
          ]
        };
      }

      const targetIds = [...new Set([
        ...(command.targetIds ?? []).map(String),
        String(target.id)
      ])];
      const result = groupNodes(withTarget, {
        groupId: command.groupId,
        targetIds,
        name: command.name ?? "Objeto composto",
        anchorWorldPosition: command.anchorWorldPosition,
        pivot: command.pivot ?? [0,0,0]
      });
      return {
        state: Object.freeze({ ...state, objects: result.nodes }),
        changes: [
          {
            type: "object-created",
            objectId: String(target.id),
            source: command.source ?? "stroke-logical-group.create"
          },
          {
            type: "hierarchy-grouped",
            objectId: result.group.id,
            targetIds: result.targetIds,
            source: command.source ?? "stroke-logical-group.create"
          }
        ]
      };
    }

    case "stroke-bundle.rebase-origin": {
      const objectId = String(command.objectId ?? "").trim();
      if (!objectId) throw new TypeError("Rebase de origem exige objeto-alvo.");
      const existing = typeof context.getObject === "function"
        ? context.getObject(objectId)
        : state.objects.find(object => String(object.id) === objectId);
      if (!existing || existing.kind !== "stroke-bundle") {
        throw new Error(`Conjunto de traços inexistente: ${objectId}.`);
      }
      if (command.expectedGeometry &&
          existing.geometry !== command.expectedGeometry) {
        return { state, changes: [] };
      }
      const current = normalizeStrokeBundleDescriptor(existing.geometry);
      const nextOrigin = freezeVector(
        command.nextOrigin,
        3,
        "Nova origem geométrica inválida."
      );
      const localDelta = nextOrigin.map(
        (value, axis) => value - current.storageOrigin[axis]
      );
      if (localDelta.every(value => Math.abs(value) <= 1e-12)) {
        return { state, changes: [] };
      }
      const geometry = rebaseStrokeBundleOrigin(current, nextOrigin);
      const positionDelta = rotateScaledVector(
        localDelta,
        existing.rotation ?? [0, 0, 0, 1],
        existing.scale ?? [1, 1, 1]
      );
      const object = Object.freeze({
        ...existing,
        position: Object.freeze((existing.position ?? [0, 0, 0]).map(
          (value, axis) => Number(value) + positionDelta[axis]
        )),
        geometry,
        prototypeId: newPrototypeId(objectId),
        derivedFromPrototypeId: existing.prototypeId ?? existing.id,
        selectionAnchorPolicy: geometry.selectionAnchorPolicy,
        ...(geometry.selectionAnchorLocal
          ? { selectionAnchorLocal: geometry.selectionAnchorLocal }
          : {})
      });
      const objects = updateById(state.objects, objectId, () => object, context);
      return {
        state: Object.freeze({ ...state, objects }),
        changes: [{
          type: "object-updated",
          objectId,
          object,
          source: command.source ?? "stroke-bundle.rebase-origin",
          maintenance: true
        }]
      };
    }

    case "stroke-bundle.compact": {
      const objectId = String(command.objectId ?? "").trim();
      if (!objectId) throw new TypeError("Compactação exige objeto-alvo.");
      const existing = typeof context.getObject === "function"
        ? context.getObject(objectId)
        : state.objects.find(object => String(object.id) === objectId);
      if (!existing || existing.kind !== "stroke-bundle") {
        throw new Error(`Conjunto de traços inexistente: ${objectId}.`);
      }
      if (command.expectedGeometry &&
          existing.geometry !== command.expectedGeometry) {
        return { state, changes: [] };
      }
      const geometry = normalizeStrokeBundleDescriptor(command.geometry);
      if (geometry === existing.geometry) return { state, changes: [] };
      const object = Object.freeze({
        ...existing,
        geometry,
        prototypeId: newPrototypeId(objectId),
        derivedFromPrototypeId: existing.prototypeId ?? existing.id,
        selectionAnchorPolicy: geometry.selectionAnchorPolicy,
        ...(geometry.selectionAnchorLocal
          ? { selectionAnchorLocal: geometry.selectionAnchorLocal }
          : {})
      });
      const objects = updateById(state.objects, objectId, () => object, context);
      return {
        state: Object.freeze({ ...state, objects }),
        changes: [{
          type: "object-updated",
          objectId,
          object,
          source: command.source ?? "stroke-bundle.compact",
          maintenance: true
        }]
      };
    }

    case "stroke-bundle.merge": {
      const sourceIds = [...new Set(
        (command.sourceIds ?? []).map(id => String(id ?? "").trim())
      )].filter(Boolean);
      const target = freezeStrokeBundleObject(command.object, context, {
        allowedExistingIds: new Set(sourceIds)
      });
      const targetId = String(target.id);
      const existingById = new Map(
        state.objects.map(object => [String(object.id), object])
      );
      const targetExists = existingById.has(targetId);
      if (targetExists && !sourceIds.includes(targetId)) {
        throw new Error(`Duplicate object id: ${targetId}`);
      }
      const removedSet = new Set(sourceIds.filter(id => id !== targetId));
      for (const id of removedSet) {
        if (!existingById.has(id)) {
          throw new Error(`Traço fundido inexistente: ${id}.`);
        }
      }
      for (const object of state.objects) {
        const parentId = object.parentId == null
          ? null
          : String(object.parentId);
        if (parentId && removedSet.has(parentId)) {
          throw new Error(
            `Não é possível fundir ${parentId}: ele possui descendentes.`
          );
        }
      }
      const objects = [];
      let inserted = false;
      for (const object of state.objects) {
        const id = String(object.id);
        if (removedSet.has(id)) continue;
        if (id === targetId) {
          objects.push(target);
          inserted = true;
        } else {
          objects.push(object);
        }
      }
      if (!inserted) objects.push(target);
      const frozen = Object.freeze(objects);
      new HierarchyIndex(frozen);
      return {
        state: Object.freeze({ ...state, objects: frozen }),
        changes: [
          {
            type: targetExists ? "object-updated" : "object-created",
            objectId: targetId,
            ...(targetExists ? {} : { object: target }),
            source: command.source ?? "stroke-bundle.merge"
          },
          ...[...removedSet].map(objectId => ({
            type: "object-deleted",
            objectId,
            source: command.source ?? "stroke-bundle.merge"
          }))
        ]
      };
    }

    case "instance-family.compact-many": {
      if (!Array.isArray(command.removeIds) ||
          !Array.isArray(command.families) ||
          !command.families.length) {
        throw new TypeError("Compactação procedural inválida.");
      }
      const removeIds = command.removeIds.map(id => String(id ?? "").trim());
      if (removeIds.some(id => !id) || new Set(removeIds).size !== removeIds.length) {
        throw new Error("IDs removidos pela compactação são inválidos.");
      }
      const removedSet = new Set(removeIds);
      const removedObjects = removeIds.map(id =>
        typeof context.getObject === "function"
          ? context.getObject(id)
          : state.objects.find(object => String(object.id) === id)
      );
      if (removedObjects.some(object => !object)) {
        throw new Error("A compactação referencia objetos inexistentes.");
      }
      for (const object of state.objects) {
        const parentId = object.parentId == null
          ? null
          : String(object.parentId);
        if (parentId && removedSet.has(parentId)) {
          throw new Error(
            `Não é possível fundir ${parentId}: ele possui descendentes.`
          );
        }
      }
      const familyObjects = command.families.map(item =>
        freezeInstanceFamilyObject(item, context, removedSet)
      );
      const familyIds = new Set(familyObjects.map(object => object.id));
      if (familyIds.size !== familyObjects.length) {
        throw new Error("IDs de famílias compactadas estão duplicados.");
      }
      const objects = Object.freeze([
        ...state.objects.filter(object => !removedSet.has(String(object.id))),
        ...familyObjects
      ]);
      new HierarchyIndex(objects);
      return {
        state: Object.freeze({ ...state, objects }),
        changes: [
          ...removeIds.map(objectId => ({
            type: "object-deleted",
            objectId,
            source: command.source ?? "selection-compaction"
          })),
          ...familyObjects.map(object => ({
            type: "object-created",
            objectId: object.id,
            object,
            source: command.source ?? "selection-compaction"
          }))
        ]
      };
    }

    case "instance-family.create": {
      const id = String(command.id ?? "").trim();
      if (!id) {
        throw new TypeError("Família procedural exige id.");
      }
      const exists = typeof context.hasObject === "function"
        ? context.hasObject(id)
        : state.objects.some(object => String(object.id) === id);
      if (exists) throw new Error(`Duplicate object id: ${id}`);
      const geometry = freezeGeometry(command.geometry);
      const family = normalizeExplicitInstanceFamily(command.family);
      const object = Object.freeze({
        id,
        prototypeId: command.prototypeId ?? id,
        kind: "instance-family",
        name: String(command.name ?? id),
        parentId: command.parentId ?? null,
        position: freezeVector(
          command.position ?? [0, 0, 0],
          3,
          "Posição da família inválida."
        ),
        rotation: freezeVector(
          command.rotation ?? [0, 0, 0, 1],
          4,
          "Rotação da família inválida."
        ),
        scale: freezeVector(
          command.scale ?? [1, 1, 1],
          3,
          "Escala da família inválida."
        ),
        geometry,
        family,
        selectionAnchorPolicy: normalizeSelectionAnchorPolicy(
          command.selectionAnchorPolicy ?? "bounds-center"
        ),
        ...(String(command.selectionAnchorPolicy ?? "bounds-center") === "custom"
          ? { selectionAnchorLocal: freezeVector(
              command.selectionAnchorLocal,
              3,
              "Âncora personalizada da família inválida."
            ) }
          : {}),
        ...(command.appearanceId
          ? { appearanceId: String(command.appearanceId) }
          : {
              material: Object.freeze({
                ...(command.material ? structuredClone(command.material) : {}),
                color: normalizeHexColor(
                  command.material?.color ?? command.color ?? "#6699cc"
                )
              })
            }),
        appearanceBinding: normalizeAppearanceBinding(
          command.appearanceBinding,
          { family, fallbackColor: command.color ?? "#6699cc" }
        ),
        instanceState: Object.freeze({}),
        source: String(command.source ?? "instance-family")
      });
      return {
        state: Object.freeze({
          ...state,
          objects: persistentObjectAppendMany(state.objects, [object])
        }),
        changes: [{
          type: "object-created",
          objectId: id,
          object,
          source: command.source ?? "instance-family"
        }]
      };
    }

    case "object.create": {
      const geometry = command.geometry
        ? freezeGeometry(command.geometry)
        : null;
      const object = Object.freeze({
        id: command.id,
        prototypeId: command.prototypeId ?? command.id,
        kind: command.kind ?? geometry?.type ?? "box",
        name: command.name ?? command.id,
        position: Object.freeze([...(command.position ?? [0, 1, 0])]),
        rotation: Object.freeze([...(command.rotation ?? [0, 0, 0, 1])]),
        scale: freezeVector(
          command.scale ?? [1, 1, 1],
          3,
          "Escala do objeto inválida."
        ),
        ...(geometry
          ? { geometry }
          : { size: command.size ?? [2, 2, 2] }),
        ...(command.sketch
          ? { sketch: normalizeSketchDescriptor(command.sketch) }
          : {}),
        ...(command.appearanceId
          ? { appearanceId: String(command.appearanceId) }
          : {
              material: Object.freeze({
                ...(command.material ? structuredClone(command.material) : {}),
                color: normalizeHexColor(
                  command.material?.color ?? command.color ?? "#6699cc"
                )
              })
            }),
        appearanceBinding: normalizeAppearanceBinding(
          command.appearanceBinding,
          {
            fallbackColor: command.material?.color ?? command.color ?? "#6699cc",
            instanceColor: command.instanceState?.color ?? null
          }
        ),
        instanceState: freezeInstanceState(
          command.instanceState
        )
      });

      return {
        state: Object.freeze({
          ...state,
          objects: persistentObjectAppendMany(state.objects, [object])
        }),
        changes: [{
          type: "object-created",
          objectId: object.id,
          object
        }]
      };
    }

    case "object.geometry.replace": {
      const geometry = freezeGeometry(command.geometry);
      const current = typeof context.getObject === "function"
        ? context.getObject(command.id)
        : state.objects.find(object => String(object.id) === String(command.id));
      if (!current) return { state, changes: [] };

      const occurrence = context.getInstanceOccurrence?.(command.id) ?? null;
      if (occurrence) {
        const payload = {
          ...occurrence.object,
          kind: geometry.type,
          geometry,
          ...(command.sketch
            ? { sketch: normalizeSketchDescriptor(command.sketch) }
            : {})
        };
        for (const key of [
          "id", "parentId", "position", "rotation", "scale", "name",
          "definitionId", "instanceKind", "projectedInstance",
          "instanceRootId", "instancePath"
        ]) delete payload[key];
        const result = replaceInstanceOccurrenceObjectDefinition(
          state,
          command.id,
          payload,
          {
            prototypeId: newPrototypeId(command.id),
            rootInstance: context.getRawObject?.(occurrence.rootId) ?? occurrence.rootInstance
          }
        );
        if (!result.changed) return { state, changes: [] };
        const index = context.getObjectPosition?.(occurrence.rootId) ?? -1;
        if (index < 0) return { state, changes: [] };
        const objects = persistentObjectUpdateAt(state.objects, index, result.rootInstance);
        return {
          state: Object.freeze({
            ...state,
            objects,
            instanceGraph: result.graph
          }),
          changes: [{
            type: "object-updated",
            objectId: occurrence.rootId,
            object: result.rootInstance,
            previousObject: occurrence.rootInstance,
            source: command.source ?? "object.geometry.replace",
            affectedOccurrenceIds: Object.freeze([String(command.id)]),
            occurrenceChanges: Object.freeze([{
              occurrenceId: String(command.id),
              type: "sync"
            }])
          }]
        };
      }

      if (isInstanceNode(current)) {
        const effective = resolveEffectiveInstanceForReducer(state, current);
        const payload = {
          ...effective,
          kind: geometry.type,
          geometry,
          ...(command.sketch
            ? { sketch: normalizeSketchDescriptor(command.sketch) }
            : {})
        };
        delete payload.id;
        delete payload.parentId;
        delete payload.position;
        delete payload.rotation;
        delete payload.scale;
        delete payload.name;
        delete payload.definitionId;
        delete payload.instanceKind;
        delete payload.projectedInstance;
        delete payload.instanceRootId;
        delete payload.instancePath;
        const result = replaceInstanceObjectDefinition(
          state,
          command.id,
          payload,
          { prototypeId: newPrototypeId(command.id) }
        );
        if (!result.changed) return { state, changes: [] };
        return {
          state: Object.freeze(result.scene),
          changes: [{
            type: "object-updated",
            objectId: command.id,
            object: result.instance,
            source: command.source ?? "object.geometry.replace"
          }]
        };
      }

      const objects = updateById(
        state.objects,
        command.id,
        object => ({
          ...omitSketch(object),
          kind: geometry.type,
          geometry,
          ...(command.sketch
            ? { sketch: normalizeSketchDescriptor(command.sketch) }
            : {}),
          prototypeId: newPrototypeId(command.id),
          derivedFromPrototypeId: object.prototypeId ?? object.id
        }),
        context
      );
      if (objects === state.objects) return { state, changes: [] };
      return {
        state: Object.freeze({ ...state, objects }),
        changes: [{
          type: "object-updated",
          objectId: command.id,
          source: command.source ?? "object.geometry.replace"
        }]
      };
    }

    case "object.transform": {
      const result = applyLocalTransforms(state, [{
        id: command.id,
        position: command.position,
        rotation: command.rotation,
        scale: command.scale
      }], context);
      if (result.objects === state.objects) return { state, changes: [] };
      const occurrenceChanges = occurrenceRootChanges(
        result.rootChanges,
        command.source ?? "object.transform",
        "object-transform"
      );
      const occurrenceRoots = new Set(result.rootChanges.keys());
      return {
        state: Object.freeze({ ...state, objects: result.objects }),
        changes: [
          ...result.changedTargets
            .filter(id => !context.getInstanceOccurrence?.(id))
            .map(objectId => ({ type: "object-transform", objectId })),
          ...occurrenceChanges
        ].filter(change => !occurrenceRoots.has(change.objectId) || change.occurrenceChanges)
      };
    }

    case "object.update": {
      const occurrence = context.getInstanceOccurrence?.(command.id) ?? null;
      if (occurrence) {
        const rootObject = context.getRawObject?.(occurrence.rootId);
        const index = context.getObjectPosition?.(occurrence.rootId) ?? -1;
        if (!rootObject || index < 0) return { state, changes: [] };
        const effective = applyObjectPatch(occurrence.object, command.patch);
        const nextRoot = updateInstanceOccurrenceRoot(
          rootObject,
          occurrence.path,
          occurrencePatchFromEffective(occurrence.object, effective, command.patch)
        );
        const objects = persistentObjectUpdateAt(state.objects, index, nextRoot);
        return {
          state: Object.freeze({ ...state, objects }),
          changes: [{
            type: "object-updated",
            objectId: occurrence.rootId,
            object: nextRoot,
            previousObject: rootObject,
            affectedOccurrenceIds: Object.freeze([String(command.id)]),
            occurrenceChanges: Object.freeze([{ occurrenceId: String(command.id), type: "sync" }]),
            ...(command.source ? { source: String(command.source) } : {})
          }]
        };
      }
      const objects = updateById(
        state.objects,
        command.id,
        object => applyObjectPatch(object, command.patch),
        context
      );
      if (objects === state.objects) return { state, changes: [] };
      return {
        state: Object.freeze({ ...state, objects }),
        changes: [{
          type: "object-updated",
          objectId: command.id,
          ...(command.source ? { source: String(command.source) } : {})
        }]
      };
    }

    case "selection.properties.set": {
      const result = applyPropertyUpdates(state, command, context);
      if (result.objects === state.objects) return { state, changes: [] };
      const occurrenceTargets = new Set(
        [...result.rootChanges.values()].flatMap(entry => entry.affectedOccurrenceIds ?? [])
      );
      return {
        state: Object.freeze({ ...state, objects: result.objects }),
        changes: [
          ...result.changedTargets
            .filter(id => !occurrenceTargets.has(id))
            .map(objectId => ({
              type: "object-updated",
              objectId,
              source: "selection.properties"
            })),
          ...occurrenceRootChanges(result.rootChanges, "selection.properties")
        ]
      };
    }

    case "data.object.create": {
      const document = normalizeDataObjectDocument(state.dataObjects);
      const dataObject = normalizeDataObject(command.dataObject ?? {
        id: command.id,
        name: command.name,
        dataType: command.dataType,
        value: command.value,
        metadata: command.metadata
      });
      if (document.items.some(item => item.id === dataObject.id)) {
        throw new Error(`DataObject duplicado: ${dataObject.id}.`);
      }
      const dataObjects = normalizeDataObjectDocument({
        version: document.version,
        items: [...document.items, dataObject]
      });
      return {
        state: Object.freeze({ ...state, dataObjects }),
        changes: [Object.freeze({
          type: "data-object-created",
          dataObjectId: dataObject.id,
          dataObject
        })]
      };
    }

    case "data.object.update": {
      const document = normalizeDataObjectDocument(state.dataObjects);
      const id = String(command.id ?? command.dataObjectId ?? "").trim();
      if (!id) throw new TypeError("DataObject a atualizar não informado.");
      const index = document.items.findIndex(item => item.id === id);
      if (index < 0) throw new Error(`DataObject inexistente: ${id}.`);
      const previousDataObject = document.items[index];
      const patch = command.patch && typeof command.patch === "object"
        ? command.patch
        : {};
      const dataObject = normalizeDataObject({
        ...previousDataObject,
        ...patch,
        id,
        kind: "data"
      });
      if (dataObjectDocumentEqual(
        { items: [previousDataObject] },
        { items: [dataObject] }
      )) {
        return { state, changes: [] };
      }
      const items = [...document.items];
      items[index] = dataObject;
      const dataObjects = normalizeDataObjectDocument({
        version: document.version,
        items
      });
      return {
        state: Object.freeze({ ...state, dataObjects }),
        changes: [Object.freeze({
          type: "data-object-updated",
          dataObjectId: id,
          dataObject,
          previousDataObject
        })]
      };
    }

    case "data.object.delete": {
      const document = normalizeDataObjectDocument(state.dataObjects);
      const id = String(command.id ?? command.dataObjectId ?? "").trim();
      if (!id) throw new TypeError("DataObject a remover não informado.");
      const previousDataObject = document.items.find(item => item.id === id) ?? null;
      if (!previousDataObject) return { state, changes: [] };
      const dataObjects = normalizeDataObjectDocument({
        version: document.version,
        items: document.items.filter(item => item.id !== id)
      });
      return {
        state: Object.freeze({ ...state, dataObjects }),
        changes: [Object.freeze({
          type: "data-object-deleted",
          dataObjectId: id,
          dataObject: previousDataObject,
          previousDataObject
        })]
      };
    }

    case "interaction.bindings.set": {
      const interactions = normalizeInteractionDocument(command.interactions);
      const previous = normalizeInteractionDocument(state.interactions);
      if (interactionDocumentsEqual(previous, interactions)) {
        return { state, changes: [] };
      }
      return {
        state: Object.freeze({ ...state, interactions }),
        changes: [Object.freeze({
          type: "interaction-bindings-changed",
          source: command.source ?? "interaction.bindings.set"
        })]
      };
    }

    case "selection.duplicate-reference": {
      const result = duplicateReferenceRoots(
        state,
        command.copies ?? []
      );
      if (!result.changed) return { state, changes: [] };
      const compactedIds = new Set(
        result.compacted?.rootInstances?.map(object => String(object.id)) ?? []
      );
      const removedIds = result.compacted?.removedIds ?? [];
      return {
        state: Object.freeze(result.scene),
        changes: [
          ...[...compactedIds].map(objectId => ({
            type: "object-updated",
            objectId,
            object: result.scene.objects.find(object => String(object.id) === objectId),
            source: "instance-graph.compact"
          })),
          ...removedIds.map(objectId => ({
            type: "object-deleted",
            objectId,
            source: "instance-graph.compact"
          })),
          ...result.created.map(object => ({
            type: "object-created",
            objectId: object.id,
            object,
            source: command.source ?? "selection.duplicate-reference"
          }))
        ]
      };
    }

    case "selection.duplicate": {
      const incoming = (command.objects ?? []).map(object =>
        freezeDuplicateObject(object)
      );
      if (!incoming.length) return { state, changes: [] };

      const existingIds = typeof context.hasObject === "function"
        ? null
        : new Set(state.objects.map(object => String(object.id)));
      const hasExisting = id => typeof context.hasObject === "function"
        ? Boolean(context.hasObject(id))
        : existingIds.has(String(id));
      const incomingIds = new Set();
      for (const object of incoming) {
        const id = String(object.id ?? "").trim();
        if (!id) {
          throw new Error("Identificador de nó ausente.");
        }
        if (hasExisting(id) || incomingIds.has(id)) {
          throw new Error(`Duplicate object id: ${object.id}`);
        }
        incomingIds.add(id);
      }

      validateIncomingHierarchy(incoming, {
        hasExisting,
        incomingIds
      });
      const objects = persistentObjectAppendMany(state.objects, incoming);

      return {
        state: Object.freeze({
          ...state,
          objects
        }),
        changes: incoming.map(object => ({
          type: "object-created",
          objectId: object.id,
          object,
          source: command.source ?? "selection.duplicate"
        }))
      };
    }

    case "selection.delete": {
      const requestedIds = [...new Set((command.ids ?? []).map(String).filter(Boolean))];
      if (!requestedIds.length) return { state, changes: [] };
      const rawObject = id => typeof context.getRawObject === "function"
        ? context.getRawObject(id)
        : state.objects.find(object => String(object.id) === String(id)) ?? null;
      const objectPosition = id => typeof context.getObjectPosition === "function"
        ? context.getObjectPosition(id)
        : state.objects.findIndex(object => String(object.id) === String(id));

      const occurrenceDescriptors = requestedIds
        .map(id => context.getInstanceOccurrence?.(id) ?? null)
        .filter(Boolean);
      const occurrenceByRoot = new Map();
      for (const occurrence of occurrenceDescriptors) {
        const list = occurrenceByRoot.get(occurrence.rootId) ?? [];
        list.push(occurrence);
        occurrenceByRoot.set(occurrence.rootId, list);
      }
      // If an authoritative root itself is deleted, no descendant override is needed.
      const requestedAuthoritative = new Set(
        requestedIds.filter(id => Boolean(rawObject(id)))
      );

      const rootUpdates = new Map();
      for (const [rootId, descriptors] of occurrenceByRoot) {
        if (requestedAuthoritative.has(rootId)) continue;
        const canonical = descriptors.filter(candidate => !descriptors.some(other =>
          other !== candidate &&
          candidate.path.length > other.path.length &&
          other.path.every((slot, index) => candidate.path[index] === slot)
        ));
        let rootObject = rawObject(rootId);
        const index = objectPosition(rootId);
        if (!rootObject || index < 0) continue;
        const previousObject = rootObject;
        const affectedOccurrenceIds = [];
        for (const occurrence of canonical) {
          rootObject = updateInstanceOccurrenceRoot(
            rootObject,
            occurrence.path,
            { hidden: true }
          );
          affectedOccurrenceIds.push(occurrence.id);
        }
        rootUpdates.set(rootId, {
          index,
          value: rootObject,
          previousObject,
          affectedOccurrenceIds
        });
      }

      const authoritativeIds = new Set();
      for (const id of requestedIds) {
        const raw = rawObject(id);
        if (!raw) continue;
        if (isInstanceNode(raw) || command.expandedSubtree === true) {
          authoritativeIds.add(id);
          continue;
        }
        const subtree = context.getObjectDescendantIds?.([id], { includeRoots: true }) ?? [id];
        for (const childId of subtree) {
          if (rawObject(childId)) authoritativeIds.add(String(childId));
        }
      }

      let objects = state.objects;
      if (rootUpdates.size) {
        objects = persistentObjectUpdateMany(
          objects,
          [...rootUpdates.values()].map(entry => ({ index: entry.index, value: entry.value }))
        );
      }
      const removed = [...authoritativeIds]
        .map(id => rawObject(id))
        .filter(Boolean);
      if (authoritativeIds.size) objects = persistentObjectRemoveIds(objects, authoritativeIds);
      if (objects === state.objects) return { state, changes: [] };

      const nextState = { ...state, objects };
      const defaultRemoved = authoritativeIds.has(String(state.defaultCameraId ?? ""));
      if (defaultRemoved) delete nextState.defaultCameraId;
      return {
        state: Object.freeze(nextState),
        changes: [
          ...occurrenceRootChanges(rootUpdates, command.source ?? "selection.delete"),
          ...removed.map(object => ({
            type: "object-deleted",
            objectId: object.id,
            object,
            previousObject: object,
            source: command.source ?? "selection.delete"
          })),
          ...(defaultRemoved
            ? [{ type: "camera-default-changed", objectId: null, cameraId: null }]
            : [])
        ]
      };
    }

    case "selection.transform": {
      const result = applyLocalTransforms(state, command.transforms ?? [], context);
      if (result.objects === state.objects) return { state, changes: [] };
      const occurrenceTargets = new Set(
        [...result.rootChanges.values()].flatMap(entry => entry.affectedOccurrenceIds ?? [])
      );
      return {
        state: Object.freeze({ ...state, objects: result.objects }),
        changes: [
          ...result.changedTargets
            .filter(id => !occurrenceTargets.has(id))
            .map(objectId => ({ type: "object-transform", objectId, source: "selection" })),
          ...occurrenceRootChanges(result.rootChanges, "selection", "object-transform")
        ]
      };
    }

    case "selection.transform-world": {
      const all = command.transforms ?? [];
      const occurrenceWorld = all.filter(transform => context.getInstanceOccurrence?.(transform.id));
      const authoritativeWorld = all.filter(transform => !context.getInstanceOccurrence?.(transform.id));
      let objects = authoritativeWorld.length
        ? applyWorldTransforms(state.objects, authoritativeWorld, context)
        : state.objects;
      let occurrenceResult = { objects, rootChanges: new Map(), changedTargets: [] };
      if (occurrenceWorld.length) {
        const localTransforms = localTransformsFromWorld(occurrenceWorld, context);
        occurrenceResult = applyLocalTransforms(
          { ...state, objects },
          localTransforms,
          context
        );
        objects = occurrenceResult.objects;
      }
      if (objects === state.objects) return { state, changes: [] };
      return {
        state: Object.freeze({ ...state, objects }),
        changes: [
          ...authoritativeWorld.map(transform => ({
            type: "object-transform",
            objectId: transform.id,
            source: "selection-world"
          })),
          ...occurrenceRootChanges(
            occurrenceResult.rootChanges,
            "selection-world",
            "object-transform"
          )
        ]
      };
    }

    case "hierarchy.reparent": {
      const objects=reparentPreservingWorld(state.objects,{
        id: command.id,
        parentId: command.parentId
      });

      if (objects === state.objects) return { state, changes: [] };

      return {
        state: Object.freeze({ ...state, objects }),
        changes: [{
          type: "hierarchy-reparented",
          objectId: command.id,
          parentId: command.parentId ?? null
        }]
      };
    }

    case "selection.group": {
      const result=groupNodes(state.objects,{
        groupId:command.groupId,
        targetIds:command.targetIds,
        name:command.name,
        anchorWorldPosition:command.anchorWorldPosition,
        pivot:command.pivot
      });
      const groupedScene = Object.freeze({
        ...state,
        objects: result.nodes
      });
      const compacted = compactHierarchyRoots(groupedScene, [result.group.id]);
      const groupInstance = compacted.scene.objects.find(
        object => String(object.id) === String(result.group.id)
      );
      return {
        state:Object.freeze(compacted.scene),
        changes:[{
          type:"hierarchy-grouped",
          objectId:result.group.id,
          object:groupInstance,
          targetIds:result.targetIds,
          compacted:true
        }]
      };
    }

    case "selection.ungroup": {
      let workingState = state;
      const promoted = [];
      const removedGroups = [];
      const legacyGroups = [];
      for (const groupIdValue of command.groupIds ?? []) {
        const groupId = String(groupIdValue);
        const raw = typeof context.getObject === "function"
          ? context.getObject(groupId)
          : workingState.objects.find(object => String(object.id) === groupId);
        if (isInstanceNode(raw)) {
          const childIds = command.promotedIdsByGroup?.[groupId] ?? [];
          const result = ungroupAssemblyInstance(workingState, groupId, childIds);
          if (result.changed) {
            workingState = result.scene;
            promoted.push(...result.promoted);
            removedGroups.push(groupId);
            continue;
          }
        }
        legacyGroups.push(groupId);
      }

      if (legacyGroups.length) {
        const result=ungroupNodes(workingState.objects,{ groupIds:legacyGroups });
        if (result.groupIds.length) {
          workingState = Object.freeze({ ...workingState, objects: result.nodes });
          removedGroups.push(...result.groupIds);
          for (const id of result.promotedIds) {
            const object = result.nodes.find(node => String(node.id) === String(id));
            if (object) promoted.push(object);
          }
        }
      }
      if (!removedGroups.length) return {state,changes:[]};

      return {
        state:Object.freeze(workingState),
        changes:[
          ...removedGroups.map(objectId => ({
            type:"object-deleted",
            objectId,
            source:"selection.ungroup"
          })),
          ...promoted.map(object => ({
            type:"object-created",
            objectId:String(object.id),
            object,
            source:"selection.ungroup"
          }))
        ]
      };
    }

    default:
      return { state, changes: [] };
  }
}

function validateIncomingHierarchy(
  incoming,
  { hasExisting, incomingIds }
) {
  const parentById = new Map();
  for (const object of incoming) {
    const id = String(object.id ?? "").trim();
    const parentId = object.parentId === undefined ||
      object.parentId === null
      ? null
      : String(object.parentId).trim() || null;
    if (parentId === null) continue;
    if (!incomingIds.has(parentId) && !hasExisting(parentId)) {
      throw new Error(`Parent object not found: ${object.parentId}`);
    }
    parentById.set(id, parentId);
  }

  const complete = new Set();
  for (const start of parentById.keys()) {
    if (complete.has(start)) continue;
    const path = new Set();
    let current = start;
    while (parentById.has(current)) {
      if (path.has(current)) {
        throw new Error(`Hierarchy cycle detected at: ${current}`);
      }
      if (complete.has(current)) break;
      path.add(current);
      current = parentById.get(current);
    }
    for (const id of path) complete.add(id);
  }
}

function normalizeSelectionAnchorPolicy(value) {
  const policy = String(value ?? "bounds-center").trim().toLowerCase();
  if (!["bounds-center", "origin", "custom", "pivot"].includes(policy)) {
    throw new RangeError(`Política de âncora desconhecida: ${policy}.`);
  }
  return policy;
}


function resolveEffectiveInstanceForReducer(state, instance) {
  if (!isInstanceNode(instance)) return instance;
  const definition = state.instanceGraph?.definitions?.[instance.definitionId];
  if (!definition || definition.type !== "object") return instance;
  const reserved = new Set([
    "id", "kind", "definitionId", "name", "parentId", "position",
    "rotation", "scale", "pivot", "overrides"
  ]);
  const overrides = Object.fromEntries(
    Object.entries(instance).filter(([key]) => !reserved.has(key))
  );
  return Object.freeze({
    ...definition.object,
    ...overrides,
    id: instance.id,
    name: instance.name ?? instance.id,
    parentId: instance.parentId ?? null,
    position: instance.position,
    rotation: instance.rotation,
    scale: instance.scale,
    definitionId: instance.definitionId,
    instanceKind: "object"
  });
}

function validateNewParent(object, context = {}) {
  if (object?.parentId === null || object?.parentId === undefined) return true;
  if (typeof context.hasObject === "function" && !context.hasObject(object.parentId)) {
    throw new Error(`Parent object not found: ${object.parentId}`);
  }
  return true;
}

function freezeDuplicateObject(value) {
  if (!value || typeof value !== "object") {
    throw new TypeError("Objeto duplicado inválido.");
  }
  if (Object.isFrozen(value)) return value;
  const object = { ...value };
  object.prototypeId ??= value.id;
  for (const key of ["position", "rotation", "scale"]) {
    if (Array.isArray(object[key])) object[key] = Object.freeze([...object[key]]);
  }
  return Object.freeze(object);
}

function resourcePatchKeys(patch = {}) {
  const transformOnly = new Set([
    "position", "rotation", "scale", "name", "parentId", "instanceState"
  ]);
  return Object.keys(patch).filter(key => !transformOnly.has(key));
}

function interactionDocumentsEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function newPrototypeId(objectId) {
  const suffix = globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `prototype:${String(objectId)}:${suffix}`;
}

function freezeGeometry(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Descritor de geometria inválido.");
  }

  return Object.freeze(Object.fromEntries(
    Object.entries(structuredClone(value)).map(([key, entry]) => [
      key,
      Array.isArray(entry) ? Object.freeze(entry) : entry
    ])
  ));
}

function freezeInstanceState(value = {}) {
  const state = { ...value };

  if (state.color === null || state.color === "") {
    delete state.color;
  } else if (state.color !== undefined) {
    state.color = normalizeHexColor(state.color);
  }

  return Object.freeze(state);
}

function freezeCamera(value = {}) {
  const projection = String(value.projection ?? "perspective");
  if (projection !== "perspective") {
    throw new RangeError(
      `Projeção de câmera desconhecida: ${projection}.`
    );
  }
  const fov = finiteNumber(value.fov ?? 55, "Campo visual");
  const near = finiteNumber(value.near ?? 0.1, "Plano near");
  const far = finiteNumber(value.far ?? 1000, "Plano far");
  const focusDistance = finiteNumber(
    value.focusDistance ?? 10,
    "Distância de foco"
  );
  if (!(fov >= 1 && fov <= 179)) {
    throw new RangeError(
      "O campo visual precisa estar entre 1 e 179 graus."
    );
  }
  if (!(near > 0 && far > near)) {
    throw new RangeError(
      "A projeção precisa satisfazer 0 < near < far."
    );
  }
  if (!(focusDistance > 0)) {
    throw new RangeError(
      "A distância de foco precisa ser positiva."
    );
  }
  return Object.freeze({
    projection,
    fov,
    near,
    far,
    focusDistance
  });
}


function rotateScaledVector(vector, quaternion, scale) {
  const x = Number(vector[0]) * Number(scale[0]);
  const y = Number(vector[1]) * Number(scale[1]);
  const z = Number(vector[2]) * Number(scale[2]);
  const qx = Number(quaternion[0]);
  const qy = Number(quaternion[1]);
  const qz = Number(quaternion[2]);
  const qw = Number(quaternion[3]);
  const ix = qw * x + qy * z - qz * y;
  const iy = qw * y + qz * x - qx * z;
  const iz = qw * z + qx * y - qy * x;
  const iw = -qx * x - qy * y - qz * z;
  return [
    ix * qw + iw * -qx + iy * -qz - iz * -qy,
    iy * qw + iw * -qy + iz * -qx - ix * -qz,
    iz * qw + iw * -qz + ix * -qy - iy * -qx
  ];
}

function freezeStrokeBundleObject(
  command = {},
  context = {},
  { allowedExistingIds = new Set() } = {}
) {
  const id = String(command.id ?? "").trim();
  if (!id) throw new TypeError("Conjunto de traços exige id.");
  const exists = typeof context.hasObject === "function"
    ? context.hasObject(id) && !allowedExistingIds.has(id)
    : false;
  if (exists) throw new Error(`Duplicate object id: ${id}`);
  const geometry = normalizeStrokeBundleDescriptor(command.geometry);
  return Object.freeze({
    id,
    kind: "stroke-bundle",
    name: String(command.name ?? id),
    parentId: command.parentId ?? null,
    position: freezeVector(
      command.position ?? [0, 0, 0],
      3,
      "Posição do conjunto de traços inválida."
    ),
    rotation: freezeVector(
      command.rotation ?? [0, 0, 0, 1],
      4,
      "Rotação do conjunto de traços inválida."
    ),
    scale: freezeVector(
      command.scale ?? [1, 1, 1],
      3,
      "Escala do conjunto de traços inválida."
    ),
    geometry,
    ...(command.sketch
      ? { sketch: normalizeSketchDescriptor(command.sketch) }
      : {}),
    selectionAnchorPolicy: normalizeSelectionAnchorPolicy(
      command.selectionAnchorPolicy ?? geometry.selectionAnchorPolicy
    ),
    ...((command.selectionAnchorPolicy ?? geometry.selectionAnchorPolicy) === "custom"
      ? { selectionAnchorLocal: freezeVector(
          command.selectionAnchorLocal ?? geometry.selectionAnchorLocal,
          3,
          "Âncora personalizada do conjunto inválida."
        ) }
      : {}),
    ...(command.appearanceId
      ? { appearanceId: String(command.appearanceId) }
      : {
          material: Object.freeze({
            ...(command.material ? structuredClone(command.material) : {}),
            color: normalizeHexColor(
              command.material?.color ?? command.color ?? "#6699cc"
            )
          })
        }),
    appearanceBinding: normalizeAppearanceBinding(
      command.appearanceBinding,
      { fallbackColor: command.material?.color ?? command.color ?? "#6699cc" }
    ),
    instanceState: Object.freeze({}),
    source: String(command.source ?? "stroke-bundle")
  });
}

function omitSketch(object) {
  const result = { ...object };
  delete result.sketch;
  return result;
}


function freezeInstanceFamilyObject(command = {}, context = {}, ignoredIds = new Set()) {
  const id = String(command.id ?? "").trim();
  if (!id) throw new TypeError("Família procedural exige id.");
  const exists = typeof context.hasObject === "function"
    ? context.hasObject(id) && !ignoredIds.has(id)
    : false;
  if (exists) throw new Error(`Duplicate object id: ${id}`);
  const geometry = freezeGeometry(command.geometry);
  const family = normalizeExplicitInstanceFamily(command.family);
  return Object.freeze({
    id,
    kind: "instance-family",
    name: String(command.name ?? id),
    parentId: command.parentId ?? null,
    position: freezeVector(
      command.position ?? [0, 0, 0],
      3,
      "Posição da família inválida."
    ),
    rotation: freezeVector(
      command.rotation ?? [0, 0, 0, 1],
      4,
      "Rotação da família inválida."
    ),
    scale: freezeVector(
      command.scale ?? [1, 1, 1],
      3,
      "Escala da família inválida."
    ),
    geometry,
    family,
    selectionAnchorPolicy: normalizeSelectionAnchorPolicy(
      command.selectionAnchorPolicy ?? "bounds-center"
    ),
    ...(String(command.selectionAnchorPolicy ?? "bounds-center") === "custom"
      ? { selectionAnchorLocal: freezeVector(
          command.selectionAnchorLocal,
          3,
          "Âncora personalizada da família inválida."
        ) }
      : {}),
    ...(command.appearanceId
      ? { appearanceId: String(command.appearanceId) }
      : {
          material: Object.freeze({
            ...(command.material ? structuredClone(command.material) : {}),
            color: normalizeHexColor(
              command.material?.color ?? command.color ?? "#6699cc"
            )
          })
        }),
    appearanceBinding: normalizeAppearanceBinding(
      command.appearanceBinding,
      { family, fallbackColor: command.material?.color ?? command.color ?? "#6699cc" }
    ),
    instanceState: Object.freeze({}),
    source: String(command.source ?? "instance-family")
  });
}

function freezeLight(value = {}) {
  const type = String(value.type ?? "point").toLowerCase();
  if (!["point", "directional", "spot", "ambient"].includes(type)) {
    throw new RangeError(`Tipo de luz desconhecido: ${type}.`);
  }
  const color = normalizeHexColor(value.color ?? "#ffffff");
  const intensity = finiteNumber(value.intensity ?? 3, "Intensidade da luz");
  const distance = finiteNumber(value.distance ?? 0, "Distância da luz");
  const decay = finiteNumber(value.decay ?? 2, "Decaimento da luz");
  const angleDeg = finiteNumber(value.angleDeg ?? 45, "Ângulo da luz");
  const penumbra = finiteNumber(value.penumbra ?? 0.2, "Penumbra da luz");
  if (intensity < 0 || distance < 0 || decay < 0) {
    throw new RangeError("Intensidade, distância e decaimento não podem ser negativos.");
  }
  if (!(angleDeg > 0 && angleDeg < 180)) {
    throw new RangeError("Ângulo da luz deve estar entre 0 e 180 graus.");
  }
  if (!(penumbra >= 0 && penumbra <= 1)) {
    throw new RangeError("Penumbra da luz deve estar entre 0 e 1.");
  }
  return Object.freeze({
    type,
    color,
    intensity,
    distance,
    decay,
    angleDeg,
    penumbra,
    castShadow: Boolean(value.castShadow ?? true)
  });
}

function freezeVector(value, length, message) {
  if (!Array.isArray(value) || value.length !== length) {
    throw new TypeError(message);
  }
  const vector = value.map(Number);
  if (!vector.every(Number.isFinite)) {
    throw new TypeError(message);
  }
  if (length === 4 && Math.hypot(...vector) <= 1e-12) {
    throw new TypeError(message);
  }
  return Object.freeze(vector);
}

function finiteNumber(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new TypeError(`${label} deve ser número finito.`);
  }
  return number;
}

function normalizeHexColor(value) {
  const color = String(value).trim();

  if (!/^#[0-9a-fA-F]{6}$/.test(color)) {
    throw new TypeError(
      `Cor de instância inválida: ${value}.`
    );
  }

  return color.toLowerCase();
}
