import { WorldSnapshot } from "./WorldSnapshot.js";

export class WorldDelta {
  constructor({
    regionId,
    fromVersion,
    toVersion,
    changes = []
  }) {
    this.regionId = String(regionId);
    this.fromVersion = nonNegativeInteger(fromVersion);
    this.toVersion = nonNegativeInteger(toVersion);

    if (this.toVersion <= this.fromVersion) {
      throw new RangeError(
        "toVersion deve ser maior que fromVersion."
      );
    }

    this.changes = Object.freeze(
      structuredClone(changes).map(Object.freeze)
    );

    Object.freeze(this);
  }

  apply(snapshotValue) {
    const snapshot = WorldSnapshot.from(snapshotValue);

    if (snapshot.regionId !== this.regionId) {
      throw new Error("Delta pertence a outra região.");
    }

    if (snapshot.version !== this.fromVersion) {
      throw new Error(
        `Versão incompatível: ${snapshot.version}; ` +
        `esperada ${this.fromVersion}.`
      );
    }

    const prototypes = {
      ...structuredClone(snapshot.prototypes)
    };

    const instances = {
      ...structuredClone(snapshot.instances)
    };

    for (const change of this.changes) {
      applyChange(prototypes, instances, change);
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

function applyChange(prototypes, instances, change) {
  switch (change.type) {
    case "prototype.set":
      prototypes[change.prototype.id] =
        structuredClone(change.prototype);
      return;

    case "prototype.delete":
      delete prototypes[change.prototypeId];
      return;

    case "instance.set":
      instances[change.instance.id] =
        structuredClone(change.instance);
      return;

    case "instance.transform": {
      const current = instances[change.instanceId];

      if (!current) {
        throw new Error(
          `Instância inexistente: ${change.instanceId}.`
        );
      }

      instances[change.instanceId] = {
        ...current,
        transform: {
          ...current.transform,
          ...structuredClone(change.transform)
        }
      };
      return;
    }

    case "instance.prototype": {
      const current = instances[change.instanceId];

      if (!current) {
        throw new Error(
          `Instância inexistente: ${change.instanceId}.`
        );
      }

      instances[change.instanceId] = {
        ...current,
        prototypeId: change.prototypeId
      };
      return;
    }

    case "instance.delete":
      delete instances[change.instanceId];
      return;

    default:
      throw new Error(
        `Mudança desconhecida: ${change.type}.`
      );
  }
}

function nonNegativeInteger(value) {
  const number = Number(value);

  if (!Number.isInteger(number) || number < 0) {
    throw new RangeError("Versão inválida.");
  }

  return number;
}
