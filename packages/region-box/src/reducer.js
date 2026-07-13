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
        })
      });

      return {
        state: Object.freeze({
          ...state,
          objects: Object.freeze([...state.objects, object])
        }),
        changes: [{
          type: "object-created",
          objectId: object.id
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
      const objects = updateById(state.objects, command.id, object => {
        const patch = command.patch ?? {};
        const next = {
          ...object,
          ...patch
        };

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
      });
      if (objects === state.objects) return { state, changes: [] };
      return { state: Object.freeze({ ...state, objects }), changes: [{ type: "object-updated", objectId: command.id }] };
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
      }

      return {
        state: Object.freeze({
          ...state,
          objects: Object.freeze([...state.objects, ...incoming])
        }),
        changes: incoming.map(object => ({
          type: "object-created",
          objectId: object.id,
          source: command.source ?? "selection.duplicate"
        }))
      };
    }

    case "selection.delete": {
      const ids = new Set(command.ids ?? []);
      if (!ids.size) return { state, changes: [] };

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

    default:
      return { state, changes: [] };
  }
}
