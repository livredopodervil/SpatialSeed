export const RECOVERY_FORMAT = "spatial-seed-recovery";
export const RECOVERY_SCHEMA_VERSION = 1;

export function createRecoveryRecord({
  sandboxId,
  checkpoint,
  commands,
  baseVersion,
  revision,
  dirty,
  updatedAt = new Date().toISOString()
}) {
  return validateRecoveryRecord({
    format: RECOVERY_FORMAT,
    schemaVersion: RECOVERY_SCHEMA_VERSION,
    sandboxId,
    checkpoint,
    commands,
    baseVersion,
    revision,
    dirty,
    updatedAt
  });
}

export function validateRecoveryRecord(value) {
  if (!value || typeof value !== "object") {
    throw new TypeError("Registro de recuperação inválido.");
  }
  if (value.format !== RECOVERY_FORMAT) {
    throw new TypeError("Formato de recuperação incompatível.");
  }
  if (value.schemaVersion !== RECOVERY_SCHEMA_VERSION) {
    throw new TypeError(
      `Versão de recuperação incompatível: ${value.schemaVersion}.`
    );
  }

  const sandboxId = nonEmptyString(
    value.sandboxId,
    "Identidade do sandbox"
  );
  if (!value.checkpoint || typeof value.checkpoint !== "object") {
    throw new TypeError("Checkpoint de recuperação ausente.");
  }
  if (!Array.isArray(value.commands)) {
    throw new TypeError(
      "Comandos do registro de recuperação devem ser um array."
    );
  }

  const baseVersion = nonNegativeInteger(
    value.baseVersion,
    "Versão-base"
  );
  const revision = nonNegativeInteger(value.revision, "Revisão");
  if (revision < value.commands.length) {
    throw new TypeError(
      "A revisão não pode ser menor que a sequência de comandos."
    );
  }

  const updatedAt = new Date(value.updatedAt);
  if (Number.isNaN(updatedAt.getTime())) {
    throw new TypeError("Horário de recuperação inválido.");
  }

  return Object.freeze({
    format: RECOVERY_FORMAT,
    schemaVersion: RECOVERY_SCHEMA_VERSION,
    sandboxId,
    checkpoint: structuredClone(value.checkpoint),
    commands: Object.freeze(structuredClone(value.commands)),
    baseVersion,
    revision,
    dirty: Boolean(value.dirty),
    updatedAt: updatedAt.toISOString()
  });
}

function nonEmptyString(value, label) {
  const text = String(value ?? "").trim();
  if (!text) throw new TypeError(`${label} deve ser preenchida.`);
  return text;
}

function nonNegativeInteger(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) {
    throw new TypeError(`${label} deve ser um inteiro não negativo.`);
  }
  return number;
}
