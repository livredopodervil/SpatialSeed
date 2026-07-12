import * as THREE from "three";

export class SelectionOperations {
  static apiVersion = "selection-operations-v2";

  constructor({ editor, sandbox, regionId }) {
    this.editor = editor;
    this.sandbox = sandbox;
    this.regionId = regionId;
    this.pendingDuplicate = null;
    this.lastDuplicate = null;

    this.sandbox.subscribe((state, changes) => {
      this.#observeDuplicateTransform(state, changes);
    });
  }

  createBox({ name = null, position = [0, 1, 0], size = [2, 2, 2], color = "#6699cc" } = {}) {
    const id = crypto.randomUUID();
    const index = this.sandbox.getState().objects.length + 1;
    const changed = this.sandbox.dispatch({
      type: "object.create",
      id,
      name: name || `Caixa ${index}`,
      position: [...position],
      size: [...size],
      color
    });
    if (changed) this.#selectIds([id]);
    return { changed, id };
  }

  duplicate() {
    const sourceObjects = this.#selectedObjects();
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
      pivotBefore: this.#selectionPivot(sourceObjects),
      initialTransforms: Object.fromEntries(
        duplicates.map(object => [object.id, snapshotTransform(object)])
      )
    };

    return { changed: true, duplicateIds };
  }

  repeat() {
    if (!this.lastDuplicate?.deltaMatrix) {
      throw new Error("Ainda não existe uma duplicação transformada para repetir.");
    }

    const sourceObjects = this.#selectedObjects({
      fallbackIds: this.lastDuplicate.duplicateIds
    });

    const delta = new THREE.Matrix4().fromArray(this.lastDuplicate.deltaMatrix);

    const duplicates = sourceObjects.map(object => {
      const result = delta.clone().multiply(matrixFromObject(object));
      return {
        ...structuredClone(object),
        id: crypto.randomUUID(),
        name: `${object.name ?? object.id} cópia`,
        ...decomposeMatrix(result)
      };
    });

    const changed = this.sandbox.dispatch({
      type: "selection.duplicate",
      source: "selection-repeat",
      sourceIds: sourceObjects.map(object => object.id),
      deltaMatrix: [...this.lastDuplicate.deltaMatrix],
      objects: duplicates
    });

    if (!changed) return { changed: false };

    const duplicateIds = duplicates.map(object => object.id);
    this.#selectIds(duplicateIds);

    this.lastDuplicate = {
      ...this.lastDuplicate,
      sourceIds: sourceObjects.map(object => object.id),
      duplicateIds,
      pivotBefore: this.#selectionPivot(sourceObjects),
      pivotAfter: this.#selectionPivot(duplicates)
    };

    return {
      changed: true,
      duplicateIds,
      deltaMatrix: [...this.lastDuplicate.deltaMatrix]
    };
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

  setSelectionPosition(position) {
    const objects = this.#selectedObjects();
    const pivot = this.#effectivePivot(objects);

    return this.translate(
      position.map(
        (value, index) => value - pivot[index]
      )
    );
  }

  translate(delta) {
    const objects = this.#selectedObjects();
    return this.#dispatchTransforms(
      objects.map(object => ({
        id: object.id,
        position: object.position.map((value, index) => value + delta[index]),
        rotation: [...object.rotation],
        scale: [...object.scale]
      })),
      "console-translate"
    );
  }

  rotateEuler(degrees) {
    const objects = this.#selectedObjects();
    const pivot = new THREE.Vector3().fromArray(this.#effectivePivot(objects));
    const euler = new THREE.Euler(
      THREE.MathUtils.degToRad(degrees[0]),
      THREE.MathUtils.degToRad(degrees[1]),
      THREE.MathUtils.degToRad(degrees[2]),
      "XYZ"
    );
    const delta = aroundPivot(
      new THREE.Matrix4().makeRotationFromEuler(euler),
      pivot
    );
    return this.#applyMatrixToSelection(objects, delta, "console-rotate");
  }

  scaleBy(factors) {
    const objects = this.#selectedObjects();
    const pivot = new THREE.Vector3().fromArray(this.#effectivePivot(objects));
    const delta = aroundPivot(
      new THREE.Matrix4().makeScale(factors[0], factors[1], factors[2]),
      pivot
    );
    return this.#applyMatrixToSelection(objects, delta, "console-scale");
  }

  setPivotAbsolute(position) {
    this.editor.setCustomPivot([...position]);
    this.editor.setPivotPolicy("custom");
    return { policy: "custom", position: [...position], mode: "absolute" };
  }

  setPivotRelative(offset) {
    const center = [...this.#activeObject().position];
    const position = center.map((value, index) => value + offset[index]);
    this.editor.setCustomPivot(position);
    this.editor.setPivotPolicy("custom");
    return { policy: "custom", center, offset: [...offset], position, mode: "relative" };
  }

  getState() {
    return structuredClone({
      pendingDuplicate: this.pendingDuplicate,
      lastDuplicate: this.lastDuplicate
    });
  }

  #observeDuplicateTransform(state, changes = []) {
    if (!this.pendingDuplicate) return;

    const transformed = new Set(
      changes
        .filter(change => change.type === "object-transform")
        .map(change => change.objectId)
    );

    const changedId = this.pendingDuplicate.duplicateIds.find(id => transformed.has(id));
    if (!changedId) return;

    const object = state.objects.find(candidate => candidate.id === changedId);
    const before = this.pendingDuplicate.initialTransforms[changedId];
    if (!object || !before) return;

    const deltaMatrix = matrixFromObject(object)
      .multiply(matrixFromSnapshot(before).invert());

    const duplicates = this.pendingDuplicate.duplicateIds
      .map(id => state.objects.find(candidate => candidate.id === id))
      .filter(Boolean);

    this.lastDuplicate = {
      sourceIds: [...this.pendingDuplicate.sourceIds],
      duplicateIds: [...this.pendingDuplicate.duplicateIds],
      pivotBefore: [...this.pendingDuplicate.pivotBefore],
      pivotAfter: this.#selectionPivot(duplicates),
      deltaMatrix: deltaMatrix.toArray()
    };

    this.pendingDuplicate = null;
  }

  #applyMatrixToSelection(objects, delta, source) {
    return this.#dispatchTransforms(
      objects.map(object => ({
        id: object.id,
        ...decomposeMatrix(delta.clone().multiply(matrixFromObject(object)))
      })),
      source
    );
  }

  #dispatchTransforms(transforms, source) {
    const changed = this.sandbox.dispatch({
      type: "selection.transform",
      source,
      selection: this.editor.selection.snapshot(),
      pivot: this.editor.snapshot().pivot,
      transforms
    });
    return { changed, transforms: structuredClone(transforms) };
  }

  #selectedObjects({ fallbackIds = [] } = {}) {
    const selectedIds = this.editor.selection.snapshot().members
      .map(member => member.objectId);
    const ids = selectedIds.length ? selectedIds : fallbackIds;
    if (!ids.length) throw new Error("A seleção está vazia.");

    const byId = new Map(
      this.sandbox.getState().objects.map(object => [object.id, object])
    );

    return ids.map(id => {
      const object = byId.get(id);
      if (!object) throw new Error(`Objeto não encontrado: ${id}`);
      return object;
    });
  }

  #activeObject() {
    const id = this.editor.selection.snapshot().activeMember?.objectId;
    if (!id) throw new Error("A seleção está vazia.");
    const object = this.sandbox.getState().objects.find(candidate => candidate.id === id);
    if (!object) throw new Error(`Objeto ativo não encontrado: ${id}`);
    return object;
  }

  #selectionPivot(objects) {
    const sum = [0, 0, 0];
    for (const object of objects) {
      for (let index = 0; index < 3; index += 1) {
        sum[index] += Number(object.position?.[index] ?? 0);
      }
    }
    return sum.map(value => value / objects.length);
  }

  #effectivePivot(objects) {
    if (this.editor.pivot.policy === "custom") {
      return [...this.editor.pivot.customPosition];
    }
    if (this.editor.pivot.policy === "active") {
      return [...this.#activeObject().position];
    }
    return this.#selectionPivot(objects);
  }

  #selectIds(ids) {
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

function snapshotTransform(object) {
  return {
    position: [...object.position],
    rotation: [...object.rotation],
    scale: [...object.scale]
  };
}

function matrixFromSnapshot(snapshot) {
  return new THREE.Matrix4().compose(
    new THREE.Vector3().fromArray(snapshot.position),
    new THREE.Quaternion().fromArray(snapshot.rotation),
    new THREE.Vector3().fromArray(snapshot.scale)
  );
}

function matrixFromObject(object) {
  return matrixFromSnapshot(snapshotTransform(object));
}

function decomposeMatrix(matrix) {
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  matrix.decompose(position, rotation, scale);
  return {
    position: position.toArray(),
    rotation: rotation.toArray(),
    scale: scale.toArray()
  };
}

function aroundPivot(operation, pivot) {
  return new THREE.Matrix4()
    .makeTranslation(pivot.x, pivot.y, pivot.z)
    .multiply(operation)
    .multiply(
      new THREE.Matrix4().makeTranslation(-pivot.x, -pivot.y, -pivot.z)
    );
}
