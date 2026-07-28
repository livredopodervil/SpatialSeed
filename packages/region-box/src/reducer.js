import {
  applyWorldTransforms,
  groupNodes,
  hierarchySubtreeIds,
  HierarchyIndex,
  reparentPreservingWorld,
  ungroupNodes
} from "../../scene-hierarchy/src/index.js";

function updateById(objects, id, updater) {
  const index = objects.findIndex(object => object.id === id);
  if (index < 0) return objects;

  const next = objects.slice();
  next[index] = Object.freeze(updater(objects[index]));
  return Object.freeze(next);
}

function updateMany(objects, transforms) {
  const byId = new Map(
    transforms.map(transform => [transform.id, transform])
  );

  let changed = false;

  const next = objects.map(object => {
    const transform = byId.get(object.id);
    if (!transform) return object;

    changed = true;
    return Object.freeze({
      ...object,
      position: [...transform.position],
      rotation: [...transform.rotation],
      scale: [...transform.scale]
    });
  });

  return changed ? Object.freeze(next) : objects;
}

function applyObjectPatch(object, patch = {}) {
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
    next.appearanceId = patch.appearanceId;
    delete next.material;
  } else if (patch.material) {
    next.material = {
      ...(object.material ?? {}),
      ...patch.material,
      texture: patch.material.texture
        ? {
            ...((object.material ?? {}).texture ?? {}),
            ...patch.material.texture
          }
        : (object.material ?? {}).texture
    };
  }

  return next;
}

function applyPropertyUpdates(objects, command) {
  const targetIds = [...(command.targetIds ?? [])];
  const updates = command.updates ?? [];

  if (!targetIds.length || !updates.length) return objects;

  const uniqueTargets = new Set(targetIds);
  const existingIds = new Set(objects.map(object => object.id));
  const updateById = new Map(updates.map(update => [update.id, update]));

  if (uniqueTargets.size !== targetIds.length) {
    throw new Error("Alvos de propriedades duplicados.");
  }

  for (const id of targetIds) {
    if (!existingIds.has(id)) throw new Error(`Objeto inexistente: ${id}.`);
    if (!updateById.has(id)) throw new Error(`Atualização ausente: ${id}.`);
  }

  if (
    updates.length !== targetIds.length ||
    updates.some(update => !uniqueTargets.has(update.id))
  ) {
    throw new Error("Atualizações de propriedades não correspondem aos alvos.");
  }

  return Object.freeze(objects.map(object => {
    const update = updateById.get(object.id);
    return update
      ? Object.freeze(applyObjectPatch(object, update.patch))
      : object;
  }));
}

export function boxRegionReducer(state, command) {
  switch (command.type) {
    case "camera.create": {
      const id = String(command.id ?? "").trim();
      if (!id) {
        throw new TypeError("Câmera persistente exige id.");
      }
      if (state.objects.some(object => object.id === id)) {
        throw new Error(`Duplicate object id: ${id}`);
      }
      const camera = freezeCamera(command.camera);
      const object = Object.freeze({
        id,
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
      const objects = Object.freeze([...state.objects, object]);
      new HierarchyIndex(objects);
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
      const current = state.objects.find(object => object.id === id);
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
        })
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
        const camera = state.objects.find(object =>
          object.id === id && object.kind === "camera"
        );
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
      if (state.objects.some(object => object.id === id)) {
        throw new Error(`Duplicate object id: ${id}`);
      }
      const object = Object.freeze({
        id,
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
      const objects = Object.freeze([...state.objects, object]);
      new HierarchyIndex(objects);
      return {
        state: Object.freeze({ ...state, objects }),
        changes: [{ type: "object-created", objectId: id, object }]
      };
    }

    case "object.create": {
      const geometry = command.geometry
        ? freezeGeometry(command.geometry)
        : null;
      const object = Object.freeze({
        id: command.id,
        kind: command.kind ?? geometry?.type ?? "box",
        name: command.name ?? command.id,
        position: command.position ?? [0, 1, 0],
        rotation: Object.freeze([...(command.rotation ?? [0, 0, 0, 1])]),
        scale: [1, 1, 1],
        ...(geometry
          ? { geometry }
          : { size: command.size ?? [2, 2, 2] }),
        ...(command.appearanceId
          ? { appearanceId: String(command.appearanceId) }
          : {
              material: Object.freeze({
                color: command.color ?? "#6699cc"
              })
            }),
        instanceState: freezeInstanceState(
          command.instanceState
        )
      });

      return {
        state: Object.freeze({
          ...state,
          objects: Object.freeze([...state.objects, object])
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
      const objects = updateById(
        state.objects,
        command.id,
        object => ({ ...object, kind: geometry.type, geometry })
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
      const objects = updateById(
        state.objects,
        command.id,
        object => ({
          ...object,
          position: [...command.position],
          rotation: [...command.rotation],
          scale: [...command.scale]
        })
      );

      if (objects === state.objects) {
        return { state, changes: [] };
      }

      return {
        state: Object.freeze({ ...state, objects }),
        changes: [{
          type: "object-transform",
          objectId: command.id
        }]
      };
    }

    case "object.update": {
      const objects = updateById(
        state.objects,
        command.id,
        object => applyObjectPatch(object, command.patch)
      );
      if (objects === state.objects) return { state, changes: [] };
      return { state: Object.freeze({ ...state, objects }), changes: [{ type: "object-updated", objectId: command.id }] };
    }

    case "selection.properties.set": {
      const objects = applyPropertyUpdates(state.objects, command);
      if (objects === state.objects) return { state, changes: [] };

      return {
        state: Object.freeze({ ...state, objects }),
        changes: command.targetIds.map(objectId => ({
          type: "object-updated",
          objectId,
          source: "selection.properties"
        }))
      };
    }

    case "selection.duplicate": {
      const incoming = (command.objects ?? []).map(object =>
        Object.freeze(structuredClone(object))
      );
      if (!incoming.length) return { state, changes: [] };

      const existingIds = new Set(state.objects.map(object => object.id));
      for (const object of incoming) {
        if (existingIds.has(object.id)) {
          throw new Error(`Duplicate object id: ${object.id}`);
        }
        existingIds.add(object.id);
      }

      new HierarchyIndex([...state.objects,...incoming]);

      return {
        state: Object.freeze({
          ...state,
          objects: Object.freeze([...state.objects, ...incoming])
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
      const requestedIds=command.ids ?? [];
      if (!requestedIds.length) return { state, changes: [] };
      const ids=new Set(hierarchySubtreeIds(state.objects,requestedIds));

      const removed = state.objects.filter(object => ids.has(object.id));
      if (!removed.length) return { state, changes: [] };

      const nextState = {
        ...state,
        objects: Object.freeze(state.objects.filter(object => !ids.has(object.id)))
      };
      const defaultRemoved = ids.has(state.defaultCameraId);
      if (defaultRemoved) delete nextState.defaultCameraId;
      return {
        state: Object.freeze(nextState),
        changes: [
          ...removed.map(object => ({
          type: "object-deleted",
          objectId: object.id,
          source: command.source ?? "selection.delete"
          })),
          ...(defaultRemoved
            ? [{
                type: "camera-default-changed",
                objectId: null,
                cameraId: null
              }]
            : [])
        ]
      };
    }

    case "selection.transform": {
      const objects = updateMany(
        state.objects,
        command.transforms ?? []
      );

      if (objects === state.objects) {
        return { state, changes: [] };
      }

      return {
        state: Object.freeze({ ...state, objects }),
        changes: command.transforms.map(transform => ({
          type: "object-transform",
          objectId: transform.id,
          source: "selection"
        }))
      };
    }

    case "selection.transform-world": {
      const objects=applyWorldTransforms(
        state.objects,
        command.transforms ?? []
      );

      if (objects === state.objects) return { state, changes: [] };

      return {
        state: Object.freeze({ ...state, objects }),
        changes: command.transforms.map(transform => ({
          type: "object-transform",
          objectId: transform.id,
          source: "selection-world"
        }))
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

      return {
        state:Object.freeze({
          ...state,
          objects:result.nodes
        }),
        changes:[{
          type:"hierarchy-grouped",
          objectId:result.group.id,
          targetIds:result.targetIds
        }]
      };
    }

    case "selection.ungroup": {
      const result=ungroupNodes(state.objects,{
        groupIds:command.groupIds
      });
      if (!result.groupIds.length) return {state,changes:[]};

      return {
        state:Object.freeze({...state,objects:result.nodes}),
        changes:[
          ...result.groupIds.map(objectId => ({
            type:"object-deleted",
            objectId,
            source:"selection.ungroup"
          })),
          ...result.promotedIds.map(objectId => ({
            type:"object-transform",
            objectId,
            source:"selection.ungroup"
          }))
        ]
      };
    }

    default:
      return { state, changes: [] };
  }
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
