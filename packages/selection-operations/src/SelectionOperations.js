import * as THREE from "three";
import {
  resolveAffineOperations,
  composeAffineStep,
  affineCopies,
  affineProgramCopies,
  matrixFromObject,
  decomposeMatrix
} from "./AffineRepeat.js?build=20260715-0021d";

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
    const index = this.sandbox.getSnapshot().objects.length + 1;
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
    return this.duplicateMany(1);
  }

  duplicateMany(count = 1) {
    const copies = Number(count);
    if (!Number.isInteger(copies) || copies < 1 || copies > 100000) {
      throw new RangeError("A quantidade deve ser inteiro entre 1 e 100000.");
    }

    const sourceObjects = this.#selectedObjects();
    const duplicates = [];

    for (let copyIndex = 1; copyIndex <= copies; copyIndex += 1) {
      for (const object of sourceObjects) {
        duplicates.push({
          ...structuredClone(object),
          id: crypto.randomUUID(),
          name: copyName(object.name ?? object.id, copyIndex)
        });
      }
    }

    const changed = this.sandbox.dispatch({
      type: "selection.duplicate",
      source: copies === 1 ? "selection-operations" : "selection-duplicate-many",
      sourceIds: sourceObjects.map(object => object.id),
      copyCount: copies,
      objects: duplicates
    });

    if (!changed) return { changed: false, duplicateIds: [] };

    const duplicateIds = duplicates.map(object => object.id);
    this.#selectIds(duplicateIds);

    this.pendingDuplicate = {
      sourceIds: sourceObjects.map(object => object.id),
      duplicateIds,
      pivotBefore: this.#selectionPivot(sourceObjects),
      initialTransforms: Object.fromEntries(
        duplicates.map(object => [object.id, snapshotTransform(object)])
      ),
      transformedIds: []
    };

    return {
      changed: true,
      copyCount: copies,
      sourceCount: sourceObjects.length,
      createdCount: duplicates.length,
      duplicateIds
    };
  }

  duplicateAffine(count, operations = []) {
    const copies = Number(count);
    if (!Number.isInteger(copies) || copies < 1 || copies > 100000) {
      throw new RangeError("A quantidade deve ser inteiro entre 1 e 100000.");
    }
    if (!Array.isArray(operations) || operations.length === 0) {
      return this.duplicateMany(copies);
    }

    const sourceObjects = this.#selectedObjects();
    const pivotContext = {
      defaultPivot: this.#effectivePivot(sourceObjects),
      medianPivot: this.#selectionPivot(sourceObjects),
      boundsPivot: this.#boundsPivot(sourceObjects),
      activePosition: [...this.#activeObject().position]
    };
    const resolved = resolveAffineOperations(
      operations,
      pivotContext
    );
    const parametric = hasAffineExpressions(
      resolved.operations
    );

    const step = parametric
      ? null
      : composeAffineStep(
          resolved.operations,
          pivotContext.defaultPivot
        );

    const pivot = [...resolved.pivot.effective];
    const duplicates = [];
    const frontierIds = [];

    for (const object of sourceObjects) {
      const transforms = parametric
        ? affineProgramCopies(
            object,
            copies,
            resolved.operations,
            {
              defaultPivot:
                pivotContext.defaultPivot
            }
          )
        : affineCopies(object, copies, step);

      for (const transform of transforms) {
        const duplicate = {
          ...structuredClone(object),
          id: crypto.randomUUID(),
          name: copyName(object.name ?? object.id, transform.index),
          position: transform.position,
          rotation: transform.rotation,
          scale: transform.scale
        };
        duplicates.push(duplicate);
        if (transform.index === copies) frontierIds.push(duplicate.id);
      }
    }

    const changed = this.sandbox.dispatch({
      type: "selection.duplicate",
      source: "selection-affine-duplicate",
      sourceIds: sourceObjects.map(object => object.id),
      copyCount: copies,
      affineOperations:
        structuredClone(resolved.operations),
      affinePivot:
        structuredClone(resolved.pivot),
      affineParametric: parametric,
      ...(step
        ? { deltaMatrix: step.toArray() }
        : {}),
      objects: duplicates
    });

    if (!changed) return { changed: false, duplicateIds: [] };

    const duplicateIds = duplicates.map(object => object.id);
    this.#selectIds(frontierIds);
    this.pendingDuplicate = null;

    this.lastDuplicate = step
      ? {
          explicit: true,
          sourceIds:
            sourceObjects.map(object => object.id),
          duplicateIds: frontierIds,
          repeatSourceIds: frontierIds,
          deltaMatrix: step.toArray(),
          pivot:
            structuredClone(resolved.pivot),
          pivotBefore: pivot,
          pivotAfter: this.#selectionPivot(
            duplicates.filter(object =>
              frontierIds.includes(object.id)
            )
          )
        }
      : null;

    return {
      changed: true,
      copyCount: copies,
      sourceCount: sourceObjects.length,
      createdCount: duplicates.length,
      duplicateIds,
      selectedIds: frontierIds,
      parametric,
      ...(step
        ? { deltaMatrix: step.toArray() }
        : {}),
      operations:
        structuredClone(resolved.operations),
      pivot:
        structuredClone(resolved.pivot),
      repeatSupported: !parametric
    };
  }

  repeat() {
    if (!this.lastDuplicate?.deltaMatrix) {
      return {
        changed: false,
        reason: "no-repeat-history"
      };
    }

    let sourceObjects;

    try {
      const explicitIds = this.lastDuplicate.explicit
        ? this.lastDuplicate.repeatSourceIds
        : [];
      sourceObjects = explicitIds?.length
        ? this.#objectsByIds(explicitIds)
        : this.#selectedObjects({
            fallbackIds: this.lastDuplicate.duplicateIds
          });
    } catch (error) {
      const message = error?.message ?? "";

      if (message.includes("Objeto não encontrado")) {
        this.pendingDuplicate = null;
        this.lastDuplicate = null;
        this.editor.selection.clear();

        return {
          changed: false,
          reason: "stale-repeat-history"
        };
      }

      throw error;
    }

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
      repeatSourceIds: duplicateIds,
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
    if (!ids.length) {
      return {
        changed: false,
        deletedIds: [],
        reason: "selection-empty"
      };
    }

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
    const position = center.map(
      (value, index) => value + offset[index]
    );

    this.editor.setRelativePivot(offset);

    return {
      policy: "custom",
      reference: "active-relative",
      center,
      offset: [...offset],
      position,
      mode: "relative"
    };
  }

  getState() {
    return structuredClone({
      pendingDuplicate: this.pendingDuplicate,
      lastDuplicate: this.lastDuplicate
    });
  }

  #observeDuplicateTransform(state, changes = []) {
    if (!this.pendingDuplicate) return;

    const transformedIds = new Set(
      this.pendingDuplicate.transformedIds ?? []
    );

    for (const change of changes) {
      if (
        change.type === "object-transform" &&
        this.pendingDuplicate.duplicateIds.includes(
          change.objectId
        )
      ) {
        transformedIds.add(change.objectId);
      }
    }

    this.pendingDuplicate.transformedIds = [
      ...transformedIds
    ];

    /*
     * O gizmo pode publicar os membros da seleção em notificações
     * sucessivas. Só consolidamos o histórico quando todos os membros
     * duplicados tiverem recebido sua transformação.
     */
    if (
      transformedIds.size <
      this.pendingDuplicate.duplicateIds.length
    ) {
      return;
    }

    const byId = new Map(
      state.objects.map(object => [
        object.id,
        object
      ])
    );

    const duplicates =
      this.pendingDuplicate.duplicateIds
        .map(id => byId.get(id))
        .filter(Boolean);

    if (
      duplicates.length !==
      this.pendingDuplicate.duplicateIds.length
    ) {
      return;
    }

    const referenceId =
      this.pendingDuplicate.duplicateIds[0];

    const object =
      byId.get(referenceId);

    const before =
      this.pendingDuplicate
        .initialTransforms[referenceId];

    if (!object || !before) return;

    const deltaMatrix =
      matrixFromObject(object)
        .multiply(
          matrixFromSnapshot(before)
            .invert()
        );

    this.lastDuplicate = {
      sourceIds: [
        ...this.pendingDuplicate.sourceIds
      ],
      duplicateIds: [
        ...this.pendingDuplicate.duplicateIds
      ],
      pivotBefore: [
        ...this.pendingDuplicate.pivotBefore
      ],
      pivotAfter:
        this.#selectionPivot(duplicates),
      deltaMatrix:
        deltaMatrix.toArray()
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
      this.sandbox.getSnapshot().objects.map(object => [object.id, object])
    );

    return ids.map(id => {
      const object = byId.get(id);
      if (!object) throw new Error(`Objeto não encontrado: ${id}`);
      return object;
    });
  }

  #objectsByIds(ids) {
    const byId = new Map(
      this.sandbox.getSnapshot().objects.map(object => [object.id, object])
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
    const object = this.sandbox.getSnapshot().objects.find(candidate => candidate.id === id);
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

  #boundsPivot(objects) {
    const bounds = new THREE.Box3().makeEmpty();
    const corner = new THREE.Vector3();

    for (const object of objects) {
      const size = object.size ?? [1, 1, 1];
      const half = size.map(
        (value, index) =>
          Math.abs(
            Number(value ?? 1) *
            Number(object.scale?.[index] ?? 1)
          ) / 2
      );
      const matrix = matrixFromObject({
        ...object,
        scale: [1, 1, 1]
      });

      for (const x of [-half[0], half[0]]) {
        for (const y of [-half[1], half[1]]) {
          for (const z of [-half[2], half[2]]) {
            corner.set(x, y, z).applyMatrix4(matrix);
            bounds.expandByPoint(corner);
          }
        }
      }
    }

    if (bounds.isEmpty()) {
      return this.#selectionPivot(objects);
    }

    return bounds.getCenter(
      new THREE.Vector3()
    ).toArray();
  }

  #effectivePivot(objects) {
    if (this.editor.pivot.policy === "custom") {
      if (
        this.editor.pivot.reference ===
        "active-relative"
      ) {
        const center =
          this.#activeObject().position;

        return center.map(
          (value, index) =>
            value +
            this.editor.pivot.relativeOffset[index]
        );
      }

      return [
        ...this.editor.pivot.customPosition
      ];
    }

    if (this.editor.pivot.policy === "active") {
      return [
        ...this.#activeObject().position
      ];
    }

    if (this.editor.pivot.policy === "bounds") {
      return this.#boundsPivot(objects);
    }

    return this.#selectionPivot(objects);
  }

  #selectIds(ids) {
    this.editor.selection.replaceMany(
      ids.map(id => ({
        kind: "object",
        regionId: this.regionId,
        objectId: id
      })),
      { activeObjectId: ids.at(-1) ?? null }
    );
  }

}

function hasAffineExpressions(operations) {
  return operations.some(operation =>
    Array.isArray(operation?.value) &&
    operation.value.some(value =>
      typeof value === "string"
    )
  );
}

function copyName(name, copyIndex) {
  const base = String(name)
    .replace(/(?:\s+#\d+)+$/u, "")
    .replace(/(?:\s+cópia)+$/u, "");
  return `${base} #${copyIndex + 1}`;
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

function aroundPivot(operation, pivot) {
  return new THREE.Matrix4()
    .makeTranslation(pivot.x, pivot.y, pivot.z)
    .multiply(operation)
    .multiply(
      new THREE.Matrix4().makeTranslation(-pivot.x, -pivot.y, -pivot.z)
    );
}
