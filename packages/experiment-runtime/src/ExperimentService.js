export class ExperimentService {
  #sequence = 0;

  constructor({
    registry,
    programs,
    snapshot = () => null,
    baseVersion = () => 0
  } = {}) {
    if (!registry || typeof registry.get !== "function") {
      throw new TypeError("ExperimentService exige registry.");
    }
    if (!programs || typeof programs.run !== "function") {
      throw new TypeError("ExperimentService exige programs.");
    }
    if (typeof snapshot !== "function" || typeof baseVersion !== "function") {
      throw new TypeError("Fontes de snapshot e versão incompatíveis.");
    }

    this.registry = registry;
    this.programs = programs;
    this.snapshot = snapshot;
    this.baseVersion = baseVersion;
  }

  list() {
    return this.registry.list();
  }

  describe(id) {
    return this.registry.describe(id);
  }

  async plan(id, parameters = {}) {
    const definition = this.registry.get(id);
    const resolved = this.registry.resolveParameters(id, parameters);
    this.#sequence += 1;

    const plan = await this.programs.run({
      runId: `experiment-${definition.id}-${this.#sequence}`,
      baseVersion: this.baseVersion(),
      seed: 0,
      source: buildExperimentInvocation(definition, resolved),
      mode: definition.program.mode,
      snapshot: this.snapshot()
    });

    return Object.freeze({
      experiment: Object.freeze({
        id: definition.id,
        title: definition.title
      }),
      parameters: structuredClone(resolved),
      plan: structuredClone(plan)
    });
  }
}

export function buildExperimentInvocation(definition, parameters) {
  const source = String(definition?.program?.source ?? "").trim();
  if (!source) throw new TypeError("Experimento não contém programa.");

  return `(${source})(${JSON.stringify(structuredClone(parameters))})`;
}
