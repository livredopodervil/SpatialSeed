import { evaluateComplexityBudget } from "./ComplexityBudget.js";

export const COMPLEXITY_REPORTER_VERSION = "complexity-reporter-v1";

export class ComplexityReporter {
  #records = [];
  #limit;

  constructor({ limit = 256 } = {}) {
    this.#limit = Math.max(1, Number(limit) || 256);
  }

  record(scopeSnapshot, budgets = undefined) {
    const budget = evaluateComplexityBudget(scopeSnapshot.operation, scopeSnapshot, budgets);
    const record = Object.freeze({
      version: COMPLEXITY_REPORTER_VERSION,
      ...scopeSnapshot,
      budget
    });
    this.#records.push(record);
    if (this.#records.length > this.#limit) this.#records.splice(0, this.#records.length - this.#limit);
    return record;
  }

  status() {
    const failures = this.#records.filter(record => !record.budget.ok);
    return Object.freeze({
      version: COMPLEXITY_REPORTER_VERSION,
      recordCount: this.#records.length,
      failureCount: failures.length,
      latest: this.#records.at(-1) ?? null,
      failures: Object.freeze(failures)
    });
  }

  clear() {
    this.#records.length = 0;
  }
}
