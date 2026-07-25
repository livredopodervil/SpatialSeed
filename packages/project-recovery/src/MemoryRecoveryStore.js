import { validateRecoveryRecord } from "./RecoveryRecord.js";

export class MemoryRecoveryStore {
  constructor(records = []) {
    this.records = new Map(
      records.map(record => [
        record.sandboxId,
        structuredClone(validateRecoveryRecord(record))
      ])
    );
  }

  get available() {
    return true;
  }

  async load(sandboxId) {
    const record = this.records.get(String(sandboxId));
    return record ? validateRecoveryRecord(record) : null;
  }

  async save(record) {
    const normalized = validateRecoveryRecord(record);
    this.records.set(
      normalized.sandboxId,
      structuredClone(normalized)
    );
    return true;
  }

  async delete(sandboxId) {
    return this.records.delete(String(sandboxId));
  }
}
