export const ANIMATION_PROCEDURE_SERVICE_VERSION =
  "animation-procedure-service-v1";

export class AnimationProcedureService {
  constructor({ catalog, programs, selection }) {
    if (!catalog?.list || !catalog?.get || !catalog?.invocationSource) {
      throw new TypeError("AnimationProcedureService exige catálogo.");
    }
    if (!programs?.run) {
      throw new TypeError("AnimationProcedureService exige sessão de programas.");
    }
    if (typeof selection !== "function") {
      throw new TypeError("AnimationProcedureService exige seleção consultável.");
    }
    this.catalog = catalog;
    this.programs = programs;
    this.selection = selection;
  }

  describe() {
    const ui = uiByProcedure(this.catalog.describeUi?.());
    return Object.freeze({
      version: ANIMATION_PROCEDURE_SERVICE_VERSION,
      procedures: Object.freeze(this.catalog.list().map(entry => {
        const metadata = ui.get(entry.name) ?? null;
        return Object.freeze({
          name: entry.name,
          sourceLength: entry.sourceLength,
          label: metadata?.label ?? entry.name,
          description: metadata?.description ?? "",
          parameters: Object.freeze(
            structuredClone(metadata?.parameters ?? [])
          ),
          animationSuggested: isAnimationProcedure(entry.name, metadata)
        });
      }))
    });
  }

  async resolve({
    name,
    parameters = {},
    targetIds = null,
    targetMode = "selection",
    timeDomainId = "world",
    seed = 0
  } = {}) {
    const procedureName = nonEmpty(name, "Nome do procedimento ausente.");
    const targets = targetIds === null
      ? selectedTargetIds(this.selection())
      : normalizeTargetIds(targetIds);
    const mode = normalizeTargetMode(targetMode);
    const domainId = nonEmpty(timeDomainId ?? "world", "Domínio temporal vazio.");
    const plan = await this.programs.run({
      runId: `animation-procedure-${createId()}`,
      baseVersion: 0,
      seed,
      source: this.catalog.invocationSource(procedureName, {
        ...structuredClone(parameters),
        targetIds: [...targets],
        targetMode: mode,
        timeDomainId: domainId
      }),
      mode: "program",
      snapshot: Object.freeze({
        selection: this.selection(),
        animation: Object.freeze({
          targetIds: Object.freeze([...targets]),
          targetMode: mode,
          timeDomainId: domainId
        })
      }),
      maxOutput: 100
    });

    if (plan.commands.length) {
      throw new Error(
        "Procedimento de animação deve retornar uma definição, não comandos."
      );
    }

    const value = plan.result?.value;
    return normalizeProcedureResult(value, {
      procedureName,
      targetIds: targets,
      targetMode: mode,
      timeDomainId: domainId
    });
  }
}

function normalizeProcedureResult(value, defaults) {
  if (Array.isArray(value)) {
    return Object.freeze({
      kind: "program",
      args: Object.freeze({
        id: `procedure.${defaults.procedureName}`,
        operations: structuredClone(value),
        targetIds: Object.freeze([...defaults.targetIds]),
        targetMode: defaults.targetMode,
        timeDomainId: defaults.timeDomainId
      })
    });
  }
  if (!value || typeof value !== "object") {
    throw new TypeError(
      "Procedimento de animação deve retornar operações, preset ou faixas."
    );
  }

  if (Array.isArray(value.operations)) {
    return Object.freeze({
      kind: "program",
      args: Object.freeze({
        id: String(value.id ?? `procedure.${defaults.procedureName}`),
        operations: structuredClone(value.operations),
        targetIds: Object.freeze(normalizeOptionalTargets(
          value.targetIds,
          defaults.targetIds
        )),
        targetMode: normalizeTargetMode(
          value.targetMode ?? defaults.targetMode
        ),
        timeDomainId: nonEmpty(
          value.timeDomainId ?? defaults.timeDomainId,
          "Domínio temporal vazio."
        )
      })
    });
  }

  if (value.presetId || value.preset) {
    return Object.freeze({
      kind: "preset",
      args: Object.freeze({
        id: String(value.presetId ?? value.preset),
        parameters: structuredClone(value.parameters ?? {}),
        targetIds: Object.freeze(normalizeOptionalTargets(
          value.targetIds,
          defaults.targetIds
        )),
        targetMode: normalizeTargetMode(
          value.targetMode ?? defaults.targetMode
        ),
        timeDomainId: nonEmpty(
          value.timeDomainId ?? defaults.timeDomainId,
          "Domínio temporal vazio."
        )
      })
    });
  }

  if (Array.isArray(value.tracks)) {
    return Object.freeze({
      kind: "composition",
      args: Object.freeze({
        id: String(value.id ?? `procedure.${defaults.procedureName}`),
        targetMode: normalizeTargetMode(
          value.targetMode ?? "objects"
        ),
        tracks: Object.freeze(value.tracks.map((track, index) => Object.freeze({
          id: String(track?.id ?? `track-${index + 1}`),
          targetIds: Object.freeze(normalizeOptionalTargets(
            track?.targetIds,
            defaults.targetIds
          )),
          ...(track?.presetId
            ? {
                presetId: String(track.presetId),
                parameters: structuredClone(track.parameters ?? {})
              }
            : { operations: structuredClone(track?.operations) }),
          timeDomainId: nonEmpty(
            track?.timeDomainId ?? defaults.timeDomainId,
            "Domínio temporal vazio."
          ),
          metadata: structuredClone(track?.metadata ?? {})
        })))
      })
    });
  }

  throw new TypeError(
    "Procedimento de animação retornou uma definição desconhecida."
  );
}

function uiByProcedure(description) {
  const result = new Map();
  for (const group of description?.groups ?? []) {
    for (const procedure of group.procedures ?? []) {
      result.set(procedure.name, procedure);
    }
  }
  return result;
}

function isAnimationProcedure(name, metadata) {
  return String(name).startsWith("animation.") ||
    /anima(?:tion|ção)/i.test(String(metadata?.group ?? ""));
}

function selectedTargetIds(snapshot) {
  return normalizeTargetIds(
    snapshot?.members?.map(member => member.objectId) ?? []
  );
}

function normalizeOptionalTargets(values, fallback) {
  return values === undefined || values === null
    ? [...fallback]
    : normalizeTargetIds(values);
}

function normalizeTargetIds(values) {
  if (!Array.isArray(values)) {
    throw new TypeError("Alvos de animação devem formar uma lista.");
  }
  const ids = [...new Set(
    values.map(value => String(value ?? "").trim()).filter(Boolean)
  )];
  if (!ids.length) {
    throw new RangeError("Selecione ao menos um objeto para animar.");
  }
  return ids;
}

function normalizeTargetMode(value) {
  const mode = String(value ?? "selection");
  if (!["selection", "objects"].includes(mode)) {
    throw new RangeError(`Modo de alvos de animação desconhecido: ${mode}.`);
  }
  return mode;
}

function nonEmpty(value, message) {
  const text = String(value ?? "").trim();
  if (!text) throw new TypeError(message);
  return text;
}

function createId() {
  return globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
