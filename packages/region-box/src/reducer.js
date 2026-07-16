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
    case "object.create": {
      const object = Object.freeze({
        id: command.id,
        kind: "box",
        name: command.name ?? command.id,
        position: command.position ?? [0, 1, 0],
        rotation: [0, 0, 0, 1],
        scale: [1, 1, 1],
        size: command.size ?? [2, 2, 2],
        material: Object.freeze({
          color: command.color ?? "#6699cc"
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

      return {
        state: Object.freeze({
          ...state,
          objects: Object.freeze(state.objects.filter(object => !ids.has(object.id)))
        }),
        changes: removed.map(object => ({
          type: "object-deleted",
          objectId: object.id,
          source: command.source ?? "selection.delete"
        }))
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


function freezeInstanceState(value = {}) {
  const state = { ...value };

  if (state.color === null || state.color === "") {
    delete state.color;
  } else if (state.color !== undefined) {
    state.color = normalizeHexColor(state.color);
  }

  return Object.freeze(state);
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
