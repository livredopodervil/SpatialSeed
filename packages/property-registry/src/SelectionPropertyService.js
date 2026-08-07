import {
  compilePropertyBatchProgram,
  describePropertyBatchProgram,
  evaluatePropertyBatchProgram
} from "./PropertyBatchProgram.js";
import { ComplexityScope } from "../../complexity-audit/src/index.js?build=20260807-0053c";

export class SelectionPropertyService {
  static apiVersion = "selection-properties-v2-occurrence-resolver";

  constructor({
    selection,
    sandbox,
    appearanceRuntime,
    registry,
    occurrenceResolver = null,
    complexityReporter = null
  }) {
    this.selection = selection;
    this.sandbox = sandbox;
    this.appearanceRuntime = appearanceRuntime;
    this.registry = registry;
    this.occurrenceResolver = occurrenceResolver;
    this.complexityReporter = complexityReporter;
  }

  inspectSelection({ targetScope = "selection" } = {}) {
    const scope = this.#complexityScope("inspector.inspect", { targetScope });
    const inspect = () => {
      const targets = this.#selectionTargets(targetScope);
      scope?.count("editTargetsVisited", targets.length);
      const properties = this.registry.inspect(targets, this.#context());
      scope?.count(
        "propertiesResolved",
        targets.length * Number(this.registry.describe?.().properties?.length ?? 0)
      );
      return Object.freeze({
        apiVersion: SelectionPropertyService.apiVersion,
        selectionId: this.selection.id,
        targetScope,
        targetIds: Object.freeze(targets.map(object => object.id)),
        count: targets.length,
        properties
      });
    };
    const result = this.occurrenceResolver && scope
      ? this.occurrenceResolver.withScope(scope, inspect)
      : inspect();
    this.#recordComplexity(scope);
    return result;
  }

  setSelection(patch, { targetScope = "selection" } = {}) {
    return this.set({
      targetIds: this.#selectionTargetIds(targetScope),
      patch
    });
  }

  unsetSelection(propertyIds, { targetScope = "selection" } = {}) {
    const patch = {};

    for (const id of propertyIds ?? []) {
      const descriptor = this.registry.require(id);
      if (!descriptor.nullable) {
        throw new Error(`Propriedade não pode ser removida: ${id}.`);
      }
      patch[id] = null;
    }

    return this.setSelection(patch, { targetScope });
  }

  setSelectionProcedural({
    propertyId,
    expression,
    targetScope = "selection"
  } = {}) {
    const objects = this.#selectionTargets(targetScope);
    if (!objects.length) throw new Error("Seleção vazia.");
    const descriptor = this.registry.require(propertyId);
    if (!descriptor.writable) {
      throw new Error(`Propriedade somente leitura: ${descriptor.id}.`);
    }
    if (objects.some(object => !descriptor.supports(object, this.#context()))) {
      throw new Error(`Propriedade não suportada pelos alvos: ${descriptor.id}.`);
    }

    const program = compilePropertyBatchProgram(descriptor, expression);
    const patches = new Map(objects.map((object, index) => {
      const raw = evaluatePropertyBatchProgram(program, {
        object,
        index: index + 1,
        count: objects.length
      });
      return [object.id, {
        [descriptor.id]: descriptor.normalize(raw)
      }];
    }));

    return this.#commitPropertyPatches(
      objects,
      patches,
      {
        [descriptor.id]: {
          mode: "expression",
          source: program.source,
          targetScope
        }
      },
      { program: describePropertyBatchProgram(program), targetScope }
    );
  }

  set({ targetIds, patch }) {
    const ids = uniqueIds(targetIds);
    const entries = Object.entries(patch ?? {});

    if (!ids.length) throw new Error("Seleção vazia.");
    if (!entries.length) throw new Error("Nenhuma propriedade informada.");

    const objects = ids.map(id => {
      const object = this.sandbox.getObject(id);
      if (!object) throw new Error(`Objeto inexistente: ${id}.`);
      return object;
    });
    const normalizedPatch = {};

    for (const [id, value] of entries) {
      const descriptor = this.registry.require(id);
      if (!descriptor.writable) {
        throw new Error(`Propriedade somente leitura: ${id}.`);
      }
      if (objects.length > 1 && !descriptor.editableMany) {
        throw new Error(`Propriedade não editável em lote: ${id}.`);
      }
      if (value === null && !descriptor.nullable) {
        throw new Error(`Propriedade não aceita nulo: ${id}.`);
      }
      if (objects.some(object => !descriptor.supports(object, this.#context()))) {
        throw new Error(`Propriedade não suportada pelos alvos: ${id}.`);
      }
      normalizedPatch[id] = descriptor.normalize(value);
    }

    return this.#commitPropertyPatches(
      objects,
      new Map(objects.map(object => [object.id, normalizedPatch])),
      normalizedPatch
    );
  }

  #commitPropertyPatches(objects, patchesById, auditPatch, extra = {}) {
    const context = this.#context();
    const appearanceCache = new Map();
    const updates = objects.flatMap(object => {
      const propertyPatch = patchesById.get(object.id) ?? {};
      const changedProperties = Object.fromEntries(
        Object.entries(propertyPatch).filter(([id, value]) => {
          const descriptor = this.registry.require(id);
          return !equalValue(descriptor.read(object, context), value);
        })
      );
      return Object.keys(changedProperties).length
        ? [{
            id: object.id,
            patch: this.#buildObjectPatch(
              object,
              changedProperties,
              appearanceCache
            )
          }]
        : [];
    });
    const frozenAudit = Object.freeze(structuredClone(auditPatch));

    if (!updates.length) {
      return Object.freeze({
        changed: false,
        targetIds: Object.freeze([]),
        propertyPatch: frozenAudit,
        ...extra
      });
    }

    const changedTargetIds = updates.map(update => update.id);
    const changed = this.sandbox.dispatch({
      type: "selection.properties.set",
      schemaVersion: 1,
      targetIds: changedTargetIds,
      propertyPatch: auditPatch,
      updates
    });
    return Object.freeze({
      changed,
      targetIds: Object.freeze([...changedTargetIds]),
      propertyPatch: frozenAudit,
      ...extra
    });
  }

  #buildObjectPatch(object, propertyPatch, appearanceCache = new Map()) {
    const patch = {};
    const appearanceValues = [];

    for (const [id, value] of Object.entries(propertyPatch)) {
      const descriptor = this.registry.require(id);

      if (descriptor.scope === "object") {
        if (descriptor.write) {
          descriptor.write(patch, value, { object });
        } else {
          setPath(patch, descriptor.path, value);
        }
      } else if (descriptor.scope === "instance") {
        patch.instanceState ??= {};
        setPath(patch.instanceState, descriptor.path, value);
      } else if (descriptor.scope === "appearance") {
        appearanceValues.push({ descriptor, value });
      }
    }

    if (appearanceValues.length) {
      const sourceKey = object.appearanceId
        ? `appearance:${object.appearanceId}`
        : `material:${JSON.stringify(object.material ?? {})}`;
      const cacheKey = `${sourceKey}:patch:${JSON.stringify(
        appearanceValues.map(({ descriptor, value }) => [descriptor.id, value])
      )}`;
      const cachedAppearance = appearanceCache.get(cacheKey);

      if (cachedAppearance) {
        this.appearanceRuntime.retainAppearanceReferences(cachedAppearance);
        patch.appearanceId = cachedAppearance.appearanceId;
      } else {
        const material = this.#editableMaterial(object);
        for (const { descriptor, value } of appearanceValues) {
          applyAppearanceValue(material, descriptor.path, value);
        }
        const created = this.appearanceRuntime.internLegacyMaterial(material);
        appearanceCache.set(cacheKey, Object.freeze({
          appearanceId: created.appearanceId,
          materialId: created.material.id,
          textureId: created.texture?.id ?? null
        }));
        patch.appearanceId = created.appearanceId;
      }
    }

    return patch;
  }

  #editableMaterial(object) {
    const material = structuredClone(
      object.appearanceId
        ? this.appearanceRuntime.legacyMaterial(object.appearanceId)
        : object.material
    );
    const transform = this.#textureTransform(object);

    material.texture ??= {
      src: "",
      repeat: [...transform.repeat],
      offset: [...transform.offset],
      rotationDeg: transform.rotationDeg,
      wrap: transform.wrap
    };

    return material;
  }

  #context() {
    return {
      material: object => object.appearanceId
        ? this.appearanceRuntime.legacyMaterial(object.appearanceId)
        : object.material,
      textureTransform: object => this.#textureTransform(object)
    };
  }

  #textureTransform(object) {
    const resolved = object.appearanceId
      ? this.appearanceRuntime.resolve(object.appearanceId)
      : null;
    const transform = resolved?.material?.value?.textureTransform ?? {};

    return {
      repeat: [...(transform.repeat ?? [1, 1])],
      offset: [...(transform.offset ?? [0, 0])],
      rotationDeg: Number(transform.rotationDeg ?? 0),
      wrap: String(transform.wrap ?? "repeat")
    };
  }

  #selectionTargetIds(targetScope = "selection") {
    if (!["selection", "renderables"].includes(targetScope)) {
      throw new RangeError(`Escopo de alvos desconhecido: ${targetScope}.`);
    }
    const selectedIds = uniqueIds(
      this.selection?.members?.map(member => member.objectId) ?? []
    ).filter(id => Boolean(
      this.occurrenceResolver
        ? this.occurrenceResolver.exists(id)
        : this.sandbox.getObject(id)
    ));
    if (targetScope === "selection" || !selectedIds.length) {
      return Object.freeze(selectedIds);
    }

    /*
     * Não materializamos o mundo para resolver o Inspector. O Sandbox mantém
     * índices autoritativos por id/pai, então o custo depende da seleção e de
     * seus descendentes, não do número total de objetos da cena.
     */
    const selected = new Set(selectedIds);
    const roots = selectedIds.filter(id => {
      let current = this.occurrenceResolver
        ? this.occurrenceResolver.object(id)
        : this.sandbox.getObject(id);
      const visited = new Set([id]);
      while (current?.parentId != null) {
        const parentId = String(current.parentId);
        if (selected.has(parentId)) return false;
        if (visited.has(parentId)) break;
        visited.add(parentId);
        current = this.occurrenceResolver
          ? this.occurrenceResolver.object(parentId)
          : this.sandbox.getObject(parentId);
      }
      return true;
    });
    const resolved = this.occurrenceResolver
      ? this.occurrenceResolver.descendantIds(roots, { includeRoots: true })
      : this.sandbox.getObjectDescendantIds(roots, { includeRoots: true });
    return Object.freeze(resolved.filter(id => {
      const kind = (this.occurrenceResolver
        ? this.occurrenceResolver.object(id)
        : this.sandbox.getObject(id))?.kind;
      return !["group", "camera", "light"].includes(kind);
    }));
  }

  #selectionTargets(targetScope = "selection") {
    return this.#selectionTargetIds(targetScope)
      .map(id => this.occurrenceResolver
        ? this.occurrenceResolver.object(id)
        : this.sandbox.getObject(id))
      .filter(Boolean);
  }

  #complexityScope(operation, metadata = {}) {
    if (!this.complexityReporter) return null;
    return new ComplexityScope({
      id: `${operation}:${Date.now()}:${Math.random().toString(36).slice(2)}`,
      operation,
      metadata
    });
  }

  #recordComplexity(scope) {
    if (!scope || !this.complexityReporter) return null;
    return this.complexityReporter.record(scope.finish());
  }
}

function applyAppearanceValue(material, path, value) {
  if (path[0] === "texture" && path[1] === "src" && value === null) {
    delete material.texture;
    return;
  }

  setPath(material, path, value);
}

function setPath(target, path, value) {
  let current = target;

  for (let index = 0; index < path.length - 1; index += 1) {
    current[path[index]] ??= {};
    current = current[path[index]];
  }

  current[path.at(-1)] = structuredClone(value);
}

function uniqueIds(values) {
  const seen = new Set();
  const result = [];

  for (const value of values ?? []) {
    const id = String(value ?? "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    result.push(id);
  }

  return result;
}

function equalValue(left, right) {
  if (Object.is(left, right)) return true;
  if (
    left === null || right === null ||
    typeof left !== "object" || typeof right !== "object"
  ) {
    return false;
  }
  return JSON.stringify(left) === JSON.stringify(right);
}
