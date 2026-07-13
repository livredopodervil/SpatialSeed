import { WorldSnapshot } from "./WorldSnapshot.js";

export class WorldDelta {
  constructor({ regionId, fromVersion, toVersion, changes = [] }) {
    this.regionId = String(regionId);
    this.fromVersion = Number(fromVersion);
    this.toVersion = Number(toVersion);
    if (!Number.isInteger(this.fromVersion) || !Number.isInteger(this.toVersion) || this.fromVersion < 0 || this.toVersion <= this.fromVersion) {
      throw new RangeError("Versões do delta inválidas.");
    }
    this.changes = Object.freeze(structuredClone(changes).map(Object.freeze));
    Object.freeze(this);
  }

  apply(snapshot) {
    if (!(snapshot instanceof WorldSnapshot)) snapshot = new WorldSnapshot(snapshot);
    if (snapshot.regionId !== this.regionId) throw new Error("Delta pertence a outra região.");
    if (snapshot.version !== this.fromVersion) throw new Error("Versão-base incompatível.");

    const prototypes = { ...snapshot.prototypes };
    const instances = { ...snapshot.instances };

    for (const change of this.changes) {
      switch (change.type) {
        case "prototype.set":
          prototypes[change.prototype.id] = structuredClone(change.prototype);
          break;
        case "prototype.delete":
          delete prototypes[change.prototypeId];
          break;
        case "instance.set":
          instances[change.instance.id] = structuredClone(change.instance);
          break;
        case "instance.transform": {
          const current = instances[change.instanceId];
          if (!current) throw new Error(`Instância inexistente: ${change.instanceId}`);
          instances[change.instanceId] = {
            ...current,
            transform: { ...current.transform, ...structuredClone(change.transform) }
          };
          break;
        }
        case "instance.prototype":
          if (!instances[change.instanceId]) throw new Error(`Instância inexistente: ${change.instanceId}`);
          instances[change.instanceId] = { ...instances[change.instanceId], prototypeId: change.prototypeId };
          break;
        case "instance.delete":
          delete instances[change.instanceId];
          break;
        default:
          throw new Error(`Mudança desconhecida: ${change.type}`);
      }
    }

    return new WorldSnapshot({
      worldId: snapshot.worldId,
      regionId: snapshot.regionId,
      version: this.toVersion,
      prototypes,
      instances,
      metadata: snapshot.metadata
    });
  }
}
