import { immutableClone } from "./Immutable.js";

export class WorldSnapshot {
  static schemaVersion = 1;

  constructor({
    worldId = "world-main",
    regionId = "region-main",
    version = 0,
    prototypes = {},
    instances = {},
    metadata = {}
  } = {}) {
    this.schemaVersion = WorldSnapshot.schemaVersion;
    this.worldId = String(worldId);
    this.regionId = String(regionId);
    this.version = nonNegativeInteger(version, "version");
    this.prototypes = immutableClone(prototypes);
    this.instances = immutableClone(instances);
    this.metadata = immutableClone(metadata);

    Object.freeze(this);
  }

  get prototypeCount() {
    return Object.keys(this.prototypes).length;
  }

  get instanceCount() {
    return Object.keys(this.instances).length;
  }

  getPrototype(id) {
    return this.prototypes[id] ?? null;
  }

  getInstance(id) {
    return this.instances[id] ?? null;
  }

  toJSON() {
    return {
      schemaVersion: this.schemaVersion,
      worldId: this.worldId,
      regionId: this.regionId,
      version: this.version,
      prototypes: structuredClone(this.prototypes),
      instances: structuredClone(this.instances),
      metadata: structuredClone(this.metadata)
    };
  }

  static from(value) {
    return value instanceof WorldSnapshot
      ? value
      : new WorldSnapshot(value);
  }
}

function nonNegativeInteger(value, label) {
  const number = Number(value);

  if (!Number.isInteger(number) || number < 0) {
    throw new RangeError(
      `${label} deve ser inteiro não negativo.`
    );
  }

  return number;
}
