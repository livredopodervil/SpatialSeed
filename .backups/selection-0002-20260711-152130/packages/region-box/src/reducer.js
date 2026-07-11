function updateById(objects, id, updater) {
  const index = objects.findIndex(object => object.id === id);
  if (index < 0) return objects;
  const next = objects.slice();
  next[index] = Object.freeze(updater(objects[index]));
  return Object.freeze(next);
}

export function boxRegionReducer(state, command) {
  switch (command.type) {
    case "object.create": {
      const object = Object.freeze({
        id:command.id,
        kind:"box",
        name:command.name ?? command.id,
        position:command.position ?? [0,1,0],
        rotation:[0,0,0,1],
        scale:[1,1,1],
        size:command.size ?? [2,2,2],
        material:Object.freeze({color:command.color ?? "#6699cc"})
      });
      return {
        state:Object.freeze({...state, objects:Object.freeze([...state.objects, object])}),
        changes:[{type:"object-created", objectId:object.id}]
      };
    }

    case "object.transform": {
      const objects = updateById(state.objects, command.id, object => ({
        ...object,
        position:[...command.position],
        rotation:[...command.rotation],
        scale:[...command.scale]
      }));
      if (objects === state.objects) return {state,changes:[]};
      return {
        state:Object.freeze({...state,objects}),
        changes:[{type:"object-transform",objectId:command.id}]
      };
    }

    default:
      return {state,changes:[]};
  }
}
