export class CommitEnvelope {
  constructor({ commandId = crypto.randomUUID(), clientId, regionId, baseVersion, commands = [], createdAt = new Date().toISOString() }) {
    if (!Number.isInteger(Number(baseVersion)) || Number(baseVersion) < 0) throw new RangeError("baseVersion inválida.");
    this.commandId = String(commandId);
    this.clientId = String(clientId);
    this.regionId = String(regionId);
    this.baseVersion = Number(baseVersion);
    this.commands = Object.freeze(structuredClone(commands).map(Object.freeze));
    this.createdAt = String(createdAt);
    Object.freeze(this);
  }
}
