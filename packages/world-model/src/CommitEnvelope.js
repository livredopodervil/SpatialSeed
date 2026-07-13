export class CommitEnvelope {
  constructor({
    commandId = crypto.randomUUID(),
    clientId,
    regionId,
    baseVersion,
    commands = [],
    createdAt = new Date().toISOString()
  }) {
    this.commandId = String(commandId);
    this.clientId = String(clientId);
    this.regionId = String(regionId);
    this.baseVersion = nonNegativeInteger(baseVersion);
    this.commands = Object.freeze(
      structuredClone(commands).map(Object.freeze)
    );
    this.createdAt = String(createdAt);

    Object.freeze(this);
  }

  toJSON() {
    return {
      commandId: this.commandId,
      clientId: this.clientId,
      regionId: this.regionId,
      baseVersion: this.baseVersion,
      commands: structuredClone(this.commands),
      createdAt: this.createdAt
    };
  }
}

function nonNegativeInteger(value) {
  const number = Number(value);

  if (!Number.isInteger(number) || number < 0) {
    throw new RangeError("baseVersion inválida.");
  }

  return number;
}
