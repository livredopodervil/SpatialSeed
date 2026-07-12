export class SelectionOperations {
  static apiVersion = "selection-operations-v1";

  constructor({ editor, sandbox, regionId }) {
    this.editor = editor;
    this.sandbox = sandbox;
    this.regionId = regionId;
    this.pendingDuplicate = null;
    this.lastDuplicate = null;

    this.sandbox.subscribe((state, changes) => {
      this.#observe(state, changes);
    });
  }

  duplicate() {
    const selection = this.editor.selection.snapshot();
    if (!selection.members.length) throw new Error("A seleção está vazia.");

    const state = this.sandbox.getState();
    const byId = new Map(state.objects.map(object => [object.id, object]));
    const sourceObjects = selection.members.map(member => {
      const object = byId.get(member.objectId);
      if (!object) throw new Error(`Objeto selecionado não encontrado: ${member.objectId}`);
      return object;
    });

    const pivotBefore = averagePosition(sourceObjects);
    const duplicates = sourceObjects.map(object => ({
      ...structuredClone(object),
      id: crypto.randomUUID(),
      name: `${object.name ?? object.id} cópia`
    }));

    const changed = this.sandbox.dispatch({
      type: "selection.duplicate",
      source: "selection-operations",
      sourceIds: sourceObjects.map(object => object.id),
      objects: duplicates
    });

    if (!changed) return { changed: false };

    const duplicateIds = duplicates.map(object => object.id);
    this.#selectIds(duplicateIds);
    this.pendingDuplicate = {
      sourceIds: sourceObjects.map(object => object.id),
      duplicateIds,
      pivotBefore
    };

    return { changed: true, duplicateIds, pivotBefore };
  }

  repeat() {
    if (!this.lastDuplicate) {
      throw new Error("Ainda não existe uma duplicação deslocada para repetir.");
    }

    const state = this.sandbox.getState();
    const byId = new Map(state.objects.map(object => [object.id, object]));
    const selectedIds = this.editor.selection.snapshot().members.map(member => member.objectId);
    const sourceIds = selectedIds.length ? selectedIds : this.lastDuplicate.duplicateIds;

    const sourceObjects = sourceIds.map(id => {
      const object = byId.get(id);
      if (!object) throw new Error(`Objeto da repetição não encontrado: ${id}`);
      return object;
    });

    const delta = this.lastDuplicate.translationDelta;
    const duplicates = sourceObjects.map(object => ({
      ...structuredClone(object),
      id: crypto.randomUUID(),
      name: `${object.name ?? object.id} cópia`,
      position: object.position.map((value, index) => value + delta[index])
    }));

    const changed = this.sandbox.dispatch({
      type: "selection.duplicate",
      source: "selection-repeat",
      sourceIds,
      translationDelta: [...delta],
      objects: duplicates
    });

    if (!changed) return { changed: false };

    const duplicateIds = duplicates.map(object => object.id);
    this.#selectIds(duplicateIds);
    this.lastDuplicate = {
      ...this.lastDuplicate,
      sourceIds: [...sourceIds],
      duplicateIds,
      pivotBefore: averagePosition(sourceObjects),
      pivotAfter: averagePosition(duplicates)
    };

    return { changed: true, duplicateIds, translationDelta: [...delta] };
  }

  deleteSelection() {
    const ids = this.editor.selection.snapshot().members.map(member => member.objectId);
    if (!ids.length) throw new Error("A seleção está vazia.");

    const changed = this.sandbox.dispatch({
      type: "selection.delete",
      source: "selection-operations",
      ids
    });

    if (changed) {
      this.editor.selection.clear();
      this.pendingDuplicate = null;
    }

    return { changed, deletedIds: ids };
  }

  getState() {
    return structuredClone({
      pendingDuplicate: this.pendingDuplicate,
      lastDuplicate: this.lastDuplicate
    });
  }

  #observe(state, changes = []) {
    if (!this.pendingDuplicate) return;

    const transformedIds = new Set(
      changes.filter(change => change.type === "object-transform")
        .map(change => change.objectId)
    );

    if (!this.pendingDuplicate.duplicateIds.some(id => transformedIds.has(id))) return;

    const byId = new Map(state.objects.map(object => [object.id, object]));
    const duplicates = this.pendingDuplicate.duplicateIds.map(id => byId.get(id)).filter(Boolean);
    if (!duplicates.length) return;

    const pivotAfter = averagePosition(duplicates);
    const pivotBefore = this.pendingDuplicate.pivotBefore;
    const translationDelta = pivotAfter.map((value, index) => value - pivotBefore[index]);

    this.lastDuplicate = {
      sourceIds: [...this.pendingDuplicate.sourceIds],
      duplicateIds: [...this.pendingDuplicate.duplicateIds],
      pivotBefore: [...pivotBefore],
      pivotAfter: [...pivotAfter],
      translationDelta
    };

    this.pendingDuplicate = null;
  }

  #selectIds(ids) {
    if (!ids.length) {
      this.editor.selection.clear();
      return;
    }

    this.editor.selection.replace({
      kind: "object",
      regionId: this.regionId,
      objectId: ids[0]
    });

    for (const id of ids.slice(1)) {
      this.editor.selection.toggle({
        kind: "object",
        regionId: this.regionId,
        objectId: id
      });
    }
  }
}

function averagePosition(objects) {
  if (!objects.length) return [0, 0, 0];
  const sum = [0, 0, 0];

  for (const object of objects) {
    for (let index = 0; index < 3; index += 1) {
      sum[index] += Number(object.position?.[index] ?? 0);
    }
  }

  return sum.map(value => value / objects.length);
}
