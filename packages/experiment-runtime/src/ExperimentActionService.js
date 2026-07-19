export class ExperimentActionService {
  static apiVersion = "experiment-action-service-v1";

  constructor({ experiments, commit }) {
    if (!experiments || typeof experiments.plan !== "function") {
      throw new TypeError("ExperimentActionService exige experiments.plan().");
    }
    if (typeof commit !== "function") {
      throw new TypeError("ExperimentActionService exige commit().");
    }
    this.experiments = experiments;
    this.commit = commit;
  }

  async create(id, parameters = {}) {
    const planned = await this.experiments.plan(id, parameters);
    const committed = await this.commit(planned.plan);
    return Object.freeze({
      experiment: planned.experiment,
      parameters: planned.parameters,
      value: planned.plan.result?.value ?? null,
      output: planned.plan.result?.output ?? [],
      plan: Object.freeze({
        runId: String(planned.plan.runId ?? ""),
        baseVersion: Number(planned.plan.baseVersion ?? 0),
        commandCount: planned.plan.commands?.length ?? 0
      }),
      commit: committed
    });
  }
}
