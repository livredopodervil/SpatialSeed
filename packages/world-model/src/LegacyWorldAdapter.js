import { WorldSnapshot } from "./WorldSnapshot.js";

export class LegacyWorldAdapter {
  static fromLegacyState(state, { worldId = "world-main", regionId = "region-main", version = 0 } = {}) {
    const prototypes = {};
    const instances = {};
    const byKey = new Map();

    for (const object of state.objects ?? []) {
      const key = JSON.stringify({ kind: object.kind ?? "box", size: object.size ?? [1,1,1], material: object.material ?? {} });
      let prototypeId = byKey.get(key);
      if (!prototypeId) {
        prototypeId = `prototype-${byKey.size}`;
        byKey.set(key, prototypeId);
        prototypes[prototypeId] = {
          id: prototypeId,
          kind: object.kind ?? "box",
          geometry: { type: object.kind ?? "box", size: [...(object.size ?? [1,1,1])] },
          material: structuredClone(object.material ?? { color: "#6699cc" }),
          revision: 1
        };
      }
      instances[object.id] = {
        id: object.id,
        name: object.name ?? object.id,
        prototypeId,
        transform: {
          position: [...object.position],
          rotation: [...object.rotation],
          scale: [...object.scale]
        }
      };
    }

    return new WorldSnapshot({ worldId, regionId, version, prototypes, instances, metadata: { sourceSchema: "legacy-objects-v1" } });
  }
}
