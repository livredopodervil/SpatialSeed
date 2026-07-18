import * as THREE from "three";

const DEFAULT_CAPACITY = 64;
const INACTIVE_COLOR = 0x8faaff;
const ACTIVE_COLOR = 0xffd166;

export class SelectionOutlineBatch {
  #capacity;
  #matrixAttribute;
  #colorAttribute;
  #ids = [];
  #color = new THREE.Color();
  #diagnostics = {
    updates: 0,
    reallocations: 0,
    instanceCount: 0,
    capacity: 0,
    drawCalls: 0,
    lastMatrixWrites: 0,
    lastColorWrites: 0,
    lastUploadedBytes: 0,
    totalUploadedBytes: 0,
    memoryBytes: 0,
    lastUpdateMs: 0,
    maxUpdateMs: 0
  };

  constructor({ capacity = DEFAULT_CAPACITY } = {}) {
    this.#capacity = normalizePositiveInteger(capacity, "capacity");
    this.geometry = createOutlineGeometry();
    this.material = createOutlineMaterial();
    this.object = new THREE.LineSegments(this.geometry, this.material);
    this.object.name = "instanced-selection-outlines";
    this.object.renderOrder = 999;
    this.object.frustumCulled = false;
    this.object.visible = false;
    this.#replaceInstanceAttributes(this.#capacity);
  }

  update(instances = []) {
    if (!Array.isArray(instances)) {
      throw new TypeError("Instâncias de contorno devem formar uma lista.");
    }
    const started = performance.now();
    this.#ensureCapacity(instances.length);
    this.#matrixAttribute.clearUpdateRanges();
    this.#colorAttribute.clearUpdateRanges();

    let matrixFirst = Infinity;
    let matrixLast = -1;
    let colorFirst = Infinity;
    let colorLast = -1;
    let matrixWrites = 0;
    let colorWrites = 0;
    const nextIds = [];
    const seen = new Set();

    for (let index = 0; index < instances.length; index += 1) {
      const instance = normalizeInstance(instances[index], index);
      if (seen.has(instance.id)) {
        throw new Error(`Contorno de seleção duplicado: ${instance.id}.`);
      }
      seen.add(instance.id);
      nextIds.push(instance.id);

      if (writeMatrixIfChanged(
        this.#matrixAttribute.array,
        index,
        instance.matrix
      )) {
        matrixFirst = Math.min(matrixFirst, index);
        matrixLast = index;
        matrixWrites += 1;
      }

      this.#color.set(instance.color);
      if (writeColorIfChanged(
        this.#colorAttribute.array,
        index,
        this.#color
      )) {
        colorFirst = Math.min(colorFirst, index);
        colorLast = index;
        colorWrites += 1;
      }
    }

    let uploadedBytes = 0;
    if (matrixLast >= matrixFirst) {
      const start = matrixFirst * 16;
      const count = (matrixLast - matrixFirst + 1) * 16;
      this.#matrixAttribute.addUpdateRange(start, count);
      this.#matrixAttribute.needsUpdate = true;
      uploadedBytes += count * Float32Array.BYTES_PER_ELEMENT;
    }
    if (colorLast >= colorFirst) {
      const start = colorFirst * 3;
      const count = (colorLast - colorFirst + 1) * 3;
      this.#colorAttribute.addUpdateRange(start, count);
      this.#colorAttribute.needsUpdate = true;
      uploadedBytes += count * Float32Array.BYTES_PER_ELEMENT;
    }

    this.#ids = nextIds;
    this.geometry.instanceCount = instances.length;
    this.object.visible = instances.length > 0;
    const elapsed = performance.now() - started;
    this.#diagnostics = {
      ...this.#diagnostics,
      updates: this.#diagnostics.updates + 1,
      instanceCount: instances.length,
      capacity: this.#capacity,
      drawCalls: instances.length > 0 ? 1 : 0,
      lastMatrixWrites: matrixWrites,
      lastColorWrites: colorWrites,
      lastUploadedBytes: uploadedBytes,
      totalUploadedBytes:
        this.#diagnostics.totalUploadedBytes + uploadedBytes,
      memoryBytes:
        this.#matrixAttribute.array.byteLength +
        this.#colorAttribute.array.byteLength,
      lastUpdateMs: elapsed,
      maxUpdateMs: Math.max(this.#diagnostics.maxUpdateMs, elapsed)
    };
    return this.diagnostics();
  }

  clear() {
    return this.update([]);
  }

  diagnostics() {
    return Object.freeze(structuredClone(this.#diagnostics));
  }

  matrixAt(index, target = new THREE.Matrix4()) {
    assertIndex(index, this.geometry.instanceCount);
    return target.fromArray(this.#matrixAttribute.array, index * 16);
  }

  colorAt(index, target = new THREE.Color()) {
    assertIndex(index, this.geometry.instanceCount);
    return target.fromArray(this.#colorAttribute.array, index * 3);
  }

  dispose() {
    this.#ids.length = 0;
    this.geometry.dispose();
    this.material.dispose();
    this.object.visible = false;
  }

  #ensureCapacity(required) {
    if (required <= this.#capacity) return false;
    let next = this.#capacity;
    while (next < required) next *= 2;
    this.#replaceInstanceAttributes(next);
    this.#capacity = next;
    this.#diagnostics.reallocations += 1;
    return true;
  }

  #replaceInstanceAttributes(capacity) {
    this.#matrixAttribute = new THREE.InstancedBufferAttribute(
      new Float32Array(capacity * 16),
      16
    ).setUsage(THREE.DynamicDrawUsage);
    this.#colorAttribute = new THREE.InstancedBufferAttribute(
      new Float32Array(capacity * 3),
      3
    ).setUsage(THREE.DynamicDrawUsage);
    this.geometry.setAttribute("instanceMatrix", this.#matrixAttribute);
    this.geometry.setAttribute("instanceColor", this.#colorAttribute);
  }
}

export function selectionOutlineInstance({
  id,
  bounds,
  active = false
}) {
  if (!bounds?.isBox3) {
    throw new TypeError("Contorno exige THREE.Box3.");
  }
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const matrix = new THREE.Matrix4().compose(
    center,
    new THREE.Quaternion(),
    size
  );
  return Object.freeze({
    id: String(id),
    matrix,
    color: active ? ACTIVE_COLOR : INACTIVE_COLOR
  });
}

export function benchmarkSelectionOutlines({
  objectCount = 1000,
  samples = 5
} = {}) {
  const count = normalizePositiveInteger(objectCount, "objectCount");
  const totalSamples = normalizePositiveInteger(samples, "samples");
  const bounds = Array.from({ length: count }, (_, index) =>
    new THREE.Box3(
      new THREE.Vector3(index, 0, 0),
      new THREE.Vector3(index + 1, 1, 1)
    )
  );
  const instances = bounds.map((box, index) =>
    selectionOutlineInstance({
      id: `selection-${index}`,
      bounds: box,
      active: index === count - 1
    })
  );
  const legacySamples = [];
  const instancedSamples = [];

  for (let sample = 0; sample < totalSamples; sample += 1) {
    let started = performance.now();
    const helpers = bounds.map((box, index) => {
      const helper = new THREE.Box3Helper(
        box.clone(),
        index === count - 1 ? ACTIVE_COLOR : INACTIVE_COLOR
      );
      helper.material.depthTest = false;
      return helper;
    });
    legacySamples.push(performance.now() - started);
    for (const helper of helpers) {
      helper.geometry.dispose();
      helper.material.dispose();
    }

    started = performance.now();
    const batch = new SelectionOutlineBatch({
      capacity: nextPowerOfTwo(count)
    });
    batch.update(instances);
    instancedSamples.push(performance.now() - started);
    batch.dispose();
  }

  return Object.freeze({
    type: "selection-outlines",
    objectCount: count,
    samples: totalSamples,
    cpuPreparationMs: Object.freeze({
      legacyHelpers: summarize(legacySamples),
      instancedBatch: summarize(instancedSamples)
    }),
    resources: Object.freeze({
      legacyHelpers: Object.freeze({
        objects: count,
        geometries: count,
        materials: count,
        drawCalls: count
      }),
      instancedBatch: Object.freeze({
        objects: 1,
        geometries: 1,
        materials: 1,
        drawCalls: 1,
        activeInstanceBytes:
          count * (16 + 3) * Float32Array.BYTES_PER_ELEMENT,
        allocatedInstanceBytes:
          nextPowerOfTwo(count) *
          (16 + 3) * Float32Array.BYTES_PER_ELEMENT
      })
    }),
    note:
      "Mede preparação CPU e recursos estruturais; tempo GPU depende do dispositivo."
  });
}

function createOutlineGeometry() {
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(unitBoxEdgePositions(), 3)
  );
  geometry.instanceCount = 0;
  return geometry;
}

function createOutlineMaterial() {
  return new THREE.ShaderMaterial({
    name: "InstancedSelectionOutlineMaterial",
    depthTest: false,
    depthWrite: false,
    transparent: true,
    toneMapped: false,
    vertexShader: `
      attribute mat4 instanceMatrix;
      attribute vec3 instanceColor;
      varying vec3 vInstanceColor;
      void main() {
        vInstanceColor = instanceColor;
        gl_Position = projectionMatrix * modelViewMatrix *
          instanceMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 vInstanceColor;
      void main() {
        gl_FragColor = vec4(vInstanceColor, 1.0);
        #include <colorspace_fragment>
      }
    `
  });
}

function unitBoxEdgePositions() {
  const n = -0.5;
  const p = 0.5;
  return [
    n,n,n, p,n,n,  p,n,n, p,p,n,
    p,p,n, n,p,n,  n,p,n, n,n,n,
    n,n,p, p,n,p,  p,n,p, p,p,p,
    p,p,p, n,p,p,  n,p,p, n,n,p,
    n,n,n, n,n,p,  p,n,n, p,n,p,
    p,p,n, p,p,p,  n,p,n, n,p,p
  ];
}

function normalizeInstance(value, index) {
  if (!value || typeof value !== "object") {
    throw new TypeError(`Instância de contorno inválida: ${index}.`);
  }
  const id = String(value.id ?? "").trim();
  if (!id) throw new TypeError(`Contorno sem id: ${index}.`);
  const matrix = value.matrix?.isMatrix4
    ? value.matrix
    : Array.isArray(value.matrix) && value.matrix.length === 16
      ? new THREE.Matrix4().fromArray(value.matrix)
      : null;
  if (!matrix || !matrix.elements.every(Number.isFinite)) {
    throw new TypeError(`Matriz de contorno inválida: ${id}.`);
  }
  return {
    id,
    matrix,
    color: value.color ?? INACTIVE_COLOR
  };
}

function writeMatrixIfChanged(array, index, matrix) {
  const offset = index * 16;
  let changed = false;
  for (let component = 0; component < 16; component += 1) {
    const value = Math.fround(matrix.elements[component]);
    if (array[offset + component] !== value) {
      array[offset + component] = value;
      changed = true;
    }
  }
  return changed;
}

function writeColorIfChanged(array, index, color) {
  const offset = index * 3;
  const values = [color.r, color.g, color.b];
  let changed = false;
  for (let component = 0; component < 3; component += 1) {
    const value = Math.fround(values[component]);
    if (array[offset + component] !== value) {
      array[offset + component] = value;
      changed = true;
    }
  }
  return changed;
}

function summarize(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const mean = sorted.reduce((sum, value) => sum + value, 0) / sorted.length;
  const percentile = fraction => {
    const position = (sorted.length - 1) * fraction;
    const lower = Math.floor(position);
    const upper = Math.ceil(position);
    if (lower === upper) return sorted[lower];
    return sorted[lower] +
      (sorted[upper] - sorted[lower]) * (position - lower);
  };
  return Object.freeze({
    min: round(sorted[0]),
    median: round(percentile(0.5)),
    mean: round(mean),
    max: round(sorted.at(-1)),
    p95: round(percentile(0.95))
  });
}

function nextPowerOfTwo(value) {
  let result = 1;
  while (result < value) result *= 2;
  return result;
}

function normalizePositiveInteger(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) {
    throw new RangeError(`${label} deve ser inteiro positivo.`);
  }
  return number;
}

function assertIndex(index, count) {
  if (!Number.isInteger(index) || index < 0 || index >= count) {
    throw new RangeError(`Índice de contorno inválido: ${index}.`);
  }
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}
