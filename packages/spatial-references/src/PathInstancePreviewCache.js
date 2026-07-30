import * as THREE from "three";

const DEFAULT_MAXIMUM_INSTANCES = 4096;

export class PathInstancePreviewCache {
  static apiVersion = "path-instance-preview-cache-v2";

  #batches = [];
  #brushKey = null;
  #copyCapacity = 0;
  #visibleCopies = 0;
  #deltaMatrix = new THREE.Matrix4();
  #worldMatrix = new THREE.Matrix4();
  #anchor = new THREE.Vector3();
  #color = new THREE.Color();
  #statusSnapshot = null;
  #diagnostics = {
    resourceBuilds: 0,
    geometryBuilds: 0,
    materialBuilds: 0,
    meshBuilds: 0,
    frameUpdates: 0,
    matrixWrites: 0,
    matrixSkips: 0,
    colorWrites: 0,
    colorSkips: 0
  };

  constructor({
    group,
    geometryRegistry,
    maximumInstances = DEFAULT_MAXIMUM_INSTANCES
  } = {}) {
    if (!group?.add || !group?.remove) {
      throw new TypeError("PathInstancePreviewCache exige um THREE.Group.");
    }
    if (!geometryRegistry?.create || !geometryRegistry?.key) {
      throw new TypeError(
        "PathInstancePreviewCache exige GeometryRegistry."
      );
    }
    this.group = group;
    this.geometryRegistry = geometryRegistry;
    this.maximumInstances = integerAtLeast(
      maximumInstances,
      1,
      "maximumInstances"
    );
  }

  get copyCapacity() {
    return this.#copyCapacity;
  }

  configure(brush) {
    const normalized = normalizeBrush(brush, this.geometryRegistry);
    if (normalized.key === this.#brushKey) {
      this.clear();
      return this.status();
    }
    this.#disposeBatches();
    const sourceInstances = normalized.entries.reduce(
      (total, entry) => total + entry.sourceWorldMatrices.length,
      0
    );
    if (sourceInstances > this.maximumInstances) {
      throw new RangeError(
        `A fonte do pincel excede o limite visual de ${
          this.maximumInstances
        } elementos.`
      );
    }
    this.#copyCapacity = Math.floor(
      this.maximumInstances / sourceInstances
    );
    for (const entry of normalized.entries) {
      const geometry = this.geometryRegistry.create(entry.geometry);
      const material = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        depthTest: false,
        depthWrite: false,
        transparent: true,
        opacity: 0.58
      });
      const capacity =
        this.#copyCapacity * entry.sourceWorldMatrices.length;
      const mesh = new THREE.InstancedMesh(geometry, material, capacity);
      mesh.count = 0;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.renderOrder = 1499;
      mesh.userData.pathSketchPreview = true;
      mesh.userData.pathSketchBrushKey = normalized.key;
      this.group.add(mesh);
      this.#batches.push({
        key: entry.key,
        color: entry.color,
        mesh,
        sourceMatrices: entry.sourceWorldMatrices.map(matrix =>
          new THREE.Matrix4().fromArray(matrix)
        ),
        previousMatrices: new Float64Array(capacity * 16),
        matrixValidity: new Uint8Array(capacity),
        previousColors: new Int32Array(capacity).fill(-1)
      });
      this.#diagnostics.geometryBuilds += 1;
      this.#diagnostics.materialBuilds += 1;
      this.#diagnostics.meshBuilds += 1;
    }
    this.#brushKey = normalized.key;
    this.#diagnostics.resourceBuilds += 1;
    this.group.position.set(0, 0, 0);
    this.group.visible = false;
    this.#statusSnapshot = null;
    return this.status();
  }

  update({
    deltaMatrices = [],
    colorsByEntry = [],
    requestedCount = deltaMatrices.length
  } = {}) {
    if (!this.#batches.length) {
      throw new Error("Configure a fonte do pincel antes do preview.");
    }
    const copyCount = Math.min(deltaMatrices.length, this.#copyCapacity);
    const colorMap = new Map(colorsByEntry.map(entry => [
      String(entry.key),
      entry.colors
    ]));

    /*
     * As matrizes recebidas estão em coordenadas mundiais. Mantê-las no
     * InstancedMesh força o shader a subtrair câmera e objeto em float32,
     * perdendo precisão longe da origem. O grupo carrega uma origem local e
     * as matrizes passam a conter somente deslocamentos próximos de zero.
     */
    if (copyCount > 0) {
      this.#deltaMatrix.fromArray(deltaMatrices[0]);
      this.#worldMatrix.multiplyMatrices(
        this.#deltaMatrix,
        this.#batches[0].sourceMatrices[0]
      );
      this.#anchor.setFromMatrixPosition(this.#worldMatrix);
      this.group.position.copy(this.#anchor);
    } else {
      this.#anchor.set(0, 0, 0);
      this.group.position.set(0, 0, 0);
    }

    for (const batch of this.#batches) {
      let instanceIndex = 0;
      let changed = false;
      let colorsChanged = false;
      const colors = colorMap.get(batch.key) ?? [];
      for (let copyIndex = 0; copyIndex < copyCount; copyIndex += 1) {
        this.#deltaMatrix.fromArray(deltaMatrices[copyIndex]);
        const packedColor = colorHexInt(
          colors[copyIndex] ?? batch.color
        );
        for (const sourceMatrix of batch.sourceMatrices) {
          this.#worldMatrix.multiplyMatrices(
            this.#deltaMatrix,
            sourceMatrix
          );
          this.#worldMatrix.elements[12] -= this.#anchor.x;
          this.#worldMatrix.elements[13] -= this.#anchor.y;
          this.#worldMatrix.elements[14] -= this.#anchor.z;
          const offset = instanceIndex * 16;
          if (!batch.matrixValidity[instanceIndex] ||
              !matrixNearFlat(
                batch.previousMatrices,
                offset,
                this.#worldMatrix.elements
              )) {
            batch.mesh.setMatrixAt(instanceIndex, this.#worldMatrix);
            batch.previousMatrices.set(
              this.#worldMatrix.elements,
              offset
            );
            batch.matrixValidity[instanceIndex] = 1;
            this.#diagnostics.matrixWrites += 1;
            changed = true;
          } else {
            this.#diagnostics.matrixSkips += 1;
          }
          if (batch.previousColors[instanceIndex] !== packedColor) {
            this.#color.setHex(packedColor);
            batch.mesh.setColorAt(instanceIndex, this.#color);
            batch.previousColors[instanceIndex] = packedColor;
            this.#diagnostics.colorWrites += 1;
            colorsChanged = true;
          } else {
            this.#diagnostics.colorSkips += 1;
          }
          instanceIndex += 1;
        }
      }
      if (batch.mesh.count !== instanceIndex) {
        batch.mesh.count = instanceIndex;
        changed = true;
      }
      if (changed) batch.mesh.instanceMatrix.needsUpdate = true;
      if (colorsChanged && batch.mesh.instanceColor) {
        batch.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
        batch.mesh.instanceColor.needsUpdate = true;
      }
    }
    this.#visibleCopies = copyCount;
    this.#diagnostics.frameUpdates += 1;
    this.group.visible = copyCount > 0;
    this.#statusSnapshot = null;
    return Object.freeze({
      previewCount: copyCount,
      requestedCount: integerAtLeast(requestedCount, 0, "requestedCount"),
      truncated: Number(requestedCount) > copyCount,
      visibleInstances: this.#visibleInstanceCount()
    });
  }

  clear() {
    this.#visibleCopies = 0;
    for (const batch of this.#batches) batch.mesh.count = 0;
    this.group.position.set(0, 0, 0);
    this.group.visible = false;
    this.#statusSnapshot = null;
    return this.status();
  }

  status() {
    if (this.#statusSnapshot) return this.#statusSnapshot;
    this.#statusSnapshot = Object.freeze({
      brushKey: this.#brushKey,
      batchCount: this.#batches.length,
      meshIds: Object.freeze(this.#batches.map(batch => batch.mesh.uuid)),
      copyCapacity: this.#copyCapacity,
      totalCapacity: this.#batches.reduce(
        (total, batch) => total + batch.mesh.instanceMatrix.count,
        0
      ),
      visibleCopies: this.#visibleCopies,
      visibleInstances: this.#visibleInstanceCount(),
      diagnostics: Object.freeze({ ...this.#diagnostics })
    });
    return this.#statusSnapshot;
  }

  dispose() {
    this.#disposeBatches();
    this.#brushKey = null;
    this.#copyCapacity = 0;
    this.#visibleCopies = 0;
    this.#statusSnapshot = null;
  }

  #visibleInstanceCount() {
    return this.#batches.reduce(
      (total, batch) => total + batch.mesh.count,
      0
    );
  }

  #disposeBatches() {
    for (const batch of this.#batches) {
      this.group.remove(batch.mesh);
      batch.mesh.geometry.dispose();
      batch.mesh.material.dispose();
      batch.mesh.dispose?.();
    }
    this.#batches = [];
    this.group.position.set(0, 0, 0);
    this.group.visible = false;
    this.#statusSnapshot = null;
  }
}

function normalizeBrush(brush, geometryRegistry) {
  if (!brush || typeof brush !== "object" || !Array.isArray(brush.entries)) {
    throw new TypeError("Fonte do pincel inválida.");
  }
  const entries = brush.entries.map((entry, index) => {
    const geometry = geometryRegistry.normalize(entry.geometry);
    const sourceWorldMatrices = (entry.sourceWorldMatrices ?? []).map(
      (matrix, matrixIndex) => {
        if (!Array.isArray(matrix) || matrix.length !== 16 ||
            !matrix.every(value => Number.isFinite(Number(value)))) {
          throw new TypeError(
            `Matriz ${matrixIndex} inválida na entrada ${index} do pincel.`
          );
        }
        return Object.freeze(matrix.map(Number));
      }
    );
    if (!sourceWorldMatrices.length) {
      throw new Error("Cada lote do pincel exige ao menos uma matriz fonte.");
    }
    const color = normalizeColor(entry.color);
    const sourceIds = Array.isArray(entry.sourceIds)
      ? entry.sourceIds.map(value => value === null ? null : String(value))
      : sourceWorldMatrices.map(() => null);
    if (sourceIds.length !== sourceWorldMatrices.length) {
      throw new Error(
        `IDs e matrizes da entrada ${index} do pincel não correspondem.`
      );
    }
    return Object.freeze({
      key: String(
        entry.key ??
        `${geometryRegistry.key(geometry)}:${color}:${index}`
      ),
      geometry,
      color,
      sourceIds: Object.freeze(sourceIds),
      sourceWorldMatrices: Object.freeze(sourceWorldMatrices)
    });
  });
  if (!entries.length) {
    throw new Error("A fonte do pincel não possui geometria renderizável.");
  }
  const key = String(
    brush.key ??
    JSON.stringify(entries.map(entry => [
      entry.key,
      entry.sourceWorldMatrices
    ]))
  );
  return Object.freeze({ key, entries: Object.freeze(entries) });
}

function normalizeColor(value) {
  const color = String(value ?? "#70c8ff");
  if (!/^#[0-9a-f]{6}$/i.test(color)) {
    throw new TypeError("A cor do pincel deve usar a forma #rrggbb.");
  }
  return color.toLowerCase();
}

function matrixNearFlat(previous, offset, next, epsilon = 1e-10) {
  for (let index = 0; index < 16; index += 1) {
    if (Math.abs(previous[offset + index] - next[index]) > epsilon) {
      return false;
    }
  }
  return true;
}

function colorHexInt(value) {
  return Number.parseInt(normalizeColor(value).slice(1), 16);
}

function integerAtLeast(value, minimum, name) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < minimum) {
    throw new RangeError(
      `${name} deve ser inteiro maior ou igual a ${minimum}.`
    );
  }
  return number;
}
