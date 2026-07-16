import {
  normalizeHexColor
} from "../../property-registry/src/ColorCodec.js";
import {
  resolvePlacementFrame
} from "../../math-affine/src/PlacementFrame.js";
import {
  PROGRAM_PLAN_VERSION
} from "./DisposableProgramRun.js";
import {
  SPATIAL_CREATE_COMMAND
} from "./SpatialPlanningFacade.js";

export class SpatialPlanCommitService {
  constructor({
    sandbox,
    editor,
    regionId,
    geometryRegistry,
    appearanceRuntime,
    createId = () => globalThis.crypto.randomUUID()
  } = {}) {
    if (!sandbox || typeof sandbox.dispatch !== "function") {
      throw new TypeError("SpatialPlanCommitService exige sandbox.");
    }
    if (!editor?.selection?.replaceMany) {
      throw new TypeError("SpatialPlanCommitService exige seleção editável.");
    }
    if (!geometryRegistry || typeof geometryRegistry.normalize !== "function") {
      throw new TypeError("SpatialPlanCommitService exige geometryRegistry.");
    }
    if (
      !appearanceRuntime ||
      typeof appearanceRuntime.internLegacyMaterial !== "function"
    ) {
      throw new TypeError("SpatialPlanCommitService exige appearanceRuntime.");
    }
    if (typeof createId !== "function") {
      throw new TypeError("createId deve ser função.");
    }

    this.sandbox = sandbox;
    this.editor = editor;
    this.regionId = nonEmptyString(regionId, "regionId");
    this.geometryRegistry = geometryRegistry;
    this.appearanceRuntime = appearanceRuntime;
    this.createId = createId;
  }

  validate(plan) {
    const normalized = normalizePlan(plan);

    if (normalized.baseVersion !== this.sandbox.revision) {
      throw new Error(
        `Plano obsoleto: revisão ${normalized.baseVersion}, ` +
        `sandbox ${this.sandbox.revision}.`
      );
    }

    const existingIds = new Set(
      this.sandbox.getSnapshot().objects.map(object => object.id)
    );
    const handles = new Set();
    const drafts = normalized.commands.map((intent, index) => {
      if (
        intent.sequence !== index ||
        intent.command !== SPATIAL_CREATE_COMMAND
      ) {
        throw new Error(`Intenção espacial inválida na posição ${index}.`);
      }

      const args = objectValue(intent.args, "args");
      const handle = objectValue(args.handle, "handle");
      const handleId = nonEmptyString(handle.id, "handle.id");

      if (handle.kind !== "object") {
        throw new Error(`Handle espacial incompatível: ${handleId}.`);
      }
      if (handles.has(handleId)) {
        throw new Error(`Handle espacial duplicado: ${handleId}.`);
      }
      handles.add(handleId);

      const geometry = this.geometryRegistry.normalize(args.geometry);
      const frame = args.placement === undefined
        ? null
        : resolvePlacementFrame(args.placement);
      const position = frame?.origin ?? finiteVector(
        args.position ?? [0, 0, 0],
        3,
        "position"
      );
      const rotation = frame?.rotation ?? finiteVector(
        args.rotation ?? [0, 0, 0, 1],
        4,
        "rotation"
      );
      const color = normalizeHexColor(args.color ?? "#6699cc");
      const name = args.name === undefined
        ? `${geometryLabel(geometry.type)} ${
            this.sandbox.getSnapshot().objects.length + index + 1
          }`
        : nonEmptyString(args.name, "name");

      return {
        handleId,
        geometry,
        kind: geometry.type,
        name,
        position: [...position],
        rotation: [...rotation],
        scale: [1, 1, 1],
        color,
        instanceState: {}
      };
    });

    const handleMap = {};
    const objects = drafts.map(draft => {
      const id = nonEmptyString(this.createId(), "createId");
      if (existingIds.has(id)) {
        throw new Error(`Identificador espacial duplicado: ${id}.`);
      }
      existingIds.add(id);
      handleMap[draft.handleId] = id;

      return {
        id,
        kind: draft.kind,
        name: draft.name,
        position: draft.position,
        rotation: draft.rotation,
        scale: draft.scale,
        geometry: draft.geometry,
        material: { color: draft.color },
        instanceState: draft.instanceState
      };
    });

    return deepFreeze({
      runId: normalized.runId,
      baseVersion: normalized.baseVersion,
      handles: handleMap,
      objects,
      command: {
        type: "selection.duplicate",
        source: "program-plan",
        sourceIds: [],
        copyCount: objects.length,
        objects
      }
    });
  }

  commit(plan) {
    const compiled = this.validate(plan);

    if (!compiled.objects.length) {
      return Object.freeze({
        changed: false,
        runId: compiled.runId,
        createdIds: [],
        handles: compiled.handles,
        reason: "plan-empty",
        revision: this.sandbox.revision
      });
    }

    const beforeRevision = this.sandbox.revision;
    const dryRun = this.sandbox.reducer(
      this.sandbox.getSnapshot(),
      structuredClone(compiled.command)
    );

    if (
      !dryRun ||
      dryRun.state === this.sandbox.getSnapshot() ||
      dryRun.changes?.length !== compiled.objects.length
    ) {
      throw new Error("Reducer recusou a transação espacial.");
    }
    if (this.sandbox.revision !== beforeRevision) {
      throw new Error("Sandbox mudou durante a validação do plano.");
    }

    const assetsBefore = this.appearanceRuntime.exportAssets();

    try {
      const appearances = internColors(
        this.appearanceRuntime,
        compiled.objects
      );
      const command = {
        ...compiled.command,
        objects: compiled.objects.map(object => {
          const next = {
            ...structuredClone(object),
            appearanceId: appearances.get(object.material.color)
          };
          delete next.material;
          return next;
        })
      };
      const changed = this.sandbox.dispatch(command);

      if (!changed) {
        throw new Error("Sandbox recusou o commit espacial.");
      }
    } catch (error) {
      this.appearanceRuntime.importAssets(assetsBefore, {
        replace: true
      });
      throw error;
    }

    const createdIds = compiled.objects.map(object => object.id);
    this.editor.selection.replaceMany(
      createdIds.map(objectId => ({
        kind: "object",
        regionId: this.regionId,
        objectId
      })),
      { activeObjectId: createdIds.at(-1) }
    );

    return deepFreeze({
      changed: true,
      runId: compiled.runId,
      createdIds,
      handles: compiled.handles,
      commandCount: compiled.objects.length,
      revision: this.sandbox.revision
    });
  }
}

function normalizePlan(plan) {
  if (!plan || typeof plan !== "object") {
    throw new TypeError("Plano espacial inválido.");
  }
  if (plan.planVersion !== PROGRAM_PLAN_VERSION) {
    throw new Error("Versão de plano espacial incompatível.");
  }
  if (!Array.isArray(plan.commands)) {
    throw new TypeError("Plano espacial sem comandos.");
  }

  return {
    runId: nonEmptyString(plan.runId, "runId"),
    baseVersion: nonNegativeInteger(plan.baseVersion, "baseVersion"),
    commands: structuredClone(plan.commands)
  };
}

function internColors(runtime, objects) {
  const counts = new Map();
  for (const object of objects) {
    const color = object.material.color;
    counts.set(color, (counts.get(color) ?? 0) + 1);
  }

  const appearances = new Map();
  for (const [color, count] of counts) {
    const created = runtime.internLegacyMaterial({ color });
    if (count > 1) {
      runtime.retainAppearance(created.appearanceId, count - 1);
    }
    appearances.set(color, created.appearanceId);
  }
  return appearances;
}

function geometryLabel(type) {
  return ({
    box: "Caixa",
    sphere: "Esfera",
    cylinder: "Cilindro",
    plane: "Plano",
    polygon: "Polígono"
  })[type] ?? String(type);
}

function objectValue(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} deve formar um objeto.`);
  }
  return value;
}

function finiteVector(value, length, label) {
  if (!Array.isArray(value) || value.length !== length) {
    throw new TypeError(`${label} deve conter ${length} números.`);
  }
  return value.map(component => {
    const number = Number(component);
    if (!Number.isFinite(number)) {
      throw new TypeError(`${label} contém valor não finito.`);
    }
    return number;
  });
}

function nonEmptyString(value, label) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new TypeError(`${label} deve ser texto não vazio.`);
  return normalized;
}

function nonNegativeInteger(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) {
    throw new RangeError(`${label} deve ser inteiro não negativo.`);
  }
  return number;
}

function deepFreeze(value, visited = new WeakSet()) {
  if (!value || typeof value !== "object" || visited.has(value)) return value;
  visited.add(value);
  for (const child of Object.values(value)) deepFreeze(child, visited);
  return Object.freeze(value);
}
