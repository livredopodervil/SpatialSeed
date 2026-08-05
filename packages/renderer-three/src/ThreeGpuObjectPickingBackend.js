import * as THREE from "three";
import {
  PickingIdAllocator
} from "../../object-picking/src/index.js?build=20260804-0048k1";

const ZERO_MATRIX = new THREE.Matrix4().makeScale(0, 0, 0);

export class ThreeGpuObjectPickingBackend {
  static apiVersion = "three-gpu-object-picking-v1";

  #renderer;
  #camera;
  #canvas;
  #batchManager;
  #heterogeneousBatchManager;
  #allocator = new PickingIdAllocator();
  #scene = new THREE.Scene();
  #cameraScratch = null;
  #target = null;
  #pixel = new Uint8Array(4);
  #instancedMaterials = new Map();
  #uniformMaterials = new Map();
  #diagnostics = {
    passes: 0,
    hits: 0,
    misses: 0,
    failures: 0,
    renderedResources: 0,
    renderedBatches: 0,
    lastPixel: [0, 0, 0, 0],
    lastDurationMs: 0,
    maximumDurationMs: 0,
    lastError: null
  };

  constructor({
    renderer,
    camera,
    canvas,
    batchManager,
    heterogeneousBatchManager
  } = {}) {
    if (!renderer?.render || !renderer?.readRenderTargetPixels) {
      throw new TypeError("GPU picking exige WebGLRenderer compatível.");
    }
    if (!camera?.isCamera) throw new TypeError("GPU picking exige câmera Three.js.");
    if (!canvas?.getBoundingClientRect) {
      throw new TypeError("GPU picking exige canvas.");
    }
    if (!batchManager?.batches || !batchManager?.metadataOf) {
      throw new TypeError("GPU picking exige InstanceBatchManager.");
    }
    if (!heterogeneousBatchManager?.pickingEntries) {
      throw new TypeError("GPU picking exige adaptador de lotes heterogêneos.");
    }
    this.#renderer = renderer;
    this.#camera = camera;
    this.#canvas = canvas;
    this.#batchManager = batchManager;
    this.#heterogeneousBatchManager = heterogeneousBatchManager;
    this.#scene.background = new THREE.Color(0x000000);
    this.#target = createPickingTarget();
  }

  get supported() {
    const context = this.#renderer.getContext?.();
    return Boolean(
      this.#target &&
      context &&
      !context.isContextLost?.()
    );
  }

  pickAt({ clientX, clientY } = {}) {
    const started = now();
    if (!this.supported) {
      return Object.freeze({
        objectId: null,
        fallback: true,
        reason: "webgl-context-unavailable",
        source: "gpu-id"
      });
    }
    const x = Number(clientX);
    const y = Number(clientY);
    const rect = this.#canvas.getBoundingClientRect();
    if (!Number.isFinite(x) || !Number.isFinite(y) ||
        rect.width <= 0 || rect.height <= 0) {
      return Object.freeze({
        objectId: null,
        fallback: true,
        reason: "invalid-picking-point",
        source: "gpu-id"
      });
    }
    if (x < rect.left || x >= rect.right || y < rect.top || y >= rect.bottom) {
      return Object.freeze({
        objectId: null,
        fallback: false,
        reason: "outside-canvas",
        source: "gpu-id"
      });
    }

    this.#allocator.clear();
    this.#clearProxies();
    let renderedResources = 0;
    let renderedBatches = 0;
    try {
      const standard = this.#appendInstancedBatchProxies();
      renderedResources += standard.resources;
      renderedBatches += standard.batches;
      const heterogeneous = this.#appendHeterogeneousProxies();
      renderedResources += heterogeneous.resources;
      renderedBatches += heterogeneous.batches;
      if (!renderedResources) {
        return Object.freeze({
          objectId: null,
          fallback: false,
          reason: "empty-picking-scene",
          source: "gpu-id",
          renderedResources,
          renderedBatches
        });
      }

      const camera = this.#pickingCamera(rect, x, y);
      const previousTarget = this.#renderer.getRenderTarget?.() ?? null;
      const previousAutoClear = this.#renderer.autoClear;
      const previousXrEnabled = this.#renderer.xr?.enabled;
      const previousClearColor = this.#renderer.getClearColor(
        new THREE.Color()
      ).clone();
      const previousClearAlpha = this.#renderer.getClearAlpha();
      try {
        if (this.#renderer.xr) this.#renderer.xr.enabled = false;
        this.#renderer.autoClear = true;
        this.#renderer.setRenderTarget(this.#target);
        this.#renderer.setClearColor(0x000000, 0);
        this.#renderer.clear(true, true, true);
        this.#renderer.render(this.#scene, camera);
        this.#renderer.readRenderTargetPixels(
          this.#target,
          0,
          0,
          1,
          1,
          this.#pixel
        );
      } finally {
        this.#renderer.setRenderTarget(previousTarget);
        this.#renderer.setClearColor(previousClearColor, previousClearAlpha);
        this.#renderer.autoClear = previousAutoClear;
        if (this.#renderer.xr && previousXrEnabled !== undefined) {
          this.#renderer.xr.enabled = previousXrEnabled;
        }
      }

      const objectId = this.#allocator.objectForPixel(this.#pixel);
      this.#diagnostics.passes += 1;
      if (objectId) this.#diagnostics.hits += 1;
      else this.#diagnostics.misses += 1;
      this.#diagnostics.renderedResources = renderedResources;
      this.#diagnostics.renderedBatches = renderedBatches;
      this.#diagnostics.lastPixel = [...this.#pixel];
      this.#diagnostics.lastError = null;
      return Object.freeze({
        objectId,
        fallback: false,
        reason: objectId ? null : "background",
        source: "gpu-id",
        renderedResources,
        renderedBatches
      });
    } catch (error) {
      this.#diagnostics.failures += 1;
      this.#diagnostics.lastError = String(error?.message ?? error);
      return Object.freeze({
        objectId: null,
        fallback: true,
        reason: this.#diagnostics.lastError,
        source: "gpu-id",
        renderedResources,
        renderedBatches
      });
    } finally {
      const durationMs = Math.max(0, now() - started);
      this.#diagnostics.lastDurationMs = durationMs;
      this.#diagnostics.maximumDurationMs = Math.max(
        this.#diagnostics.maximumDurationMs,
        durationMs
      );
      this.#clearProxies();
    }
  }

  status() {
    return Object.freeze({
      apiVersion: ThreeGpuObjectPickingBackend.apiVersion,
      supported: this.supported,
      ...structuredClone(this.#diagnostics)
    });
  }

  dispose() {
    this.#clearProxies();
    this.#target?.dispose?.();
    this.#target = null;
    for (const material of this.#instancedMaterials.values()) {
      material.dispose?.();
    }
    for (const material of this.#uniformMaterials.values()) {
      material.dispose?.();
    }
    this.#instancedMaterials.clear();
    this.#uniformMaterials.clear();
  }

  #appendInstancedBatchProxies() {
    let resources = 0;
    let batches = 0;
    const matrix = new THREE.Matrix4();
    const color = new THREE.Color();
    for (const batch of this.#batchManager.batches()) {
      const source = batch?.mesh;
      const geometry = batch?.geometry ?? source?.geometry;
      const count = Number(source?.count ?? 0);
      if (!source?.visible || !geometry || count < 1) continue;
      source.updateMatrixWorld(true);
      const proxy = new THREE.InstancedMesh(
        geometry,
        this.#instancedMaterial(source.material?.side),
        Math.max(1, count)
      );
      proxy.name = `gpu-picking-${batch.key}`;
      proxy.count = count;
      proxy.frustumCulled = false;
      proxy.matrixAutoUpdate = false;
      proxy.matrix.copy(source.matrixWorld);
      proxy.matrixWorldNeedsUpdate = true;
      proxy.layers.mask = source.layers.mask;
      for (let instanceId = 0; instanceId < count; instanceId += 1) {
        const resourceId = batch.objectAt(instanceId);
        if (!resourceId) {
          proxy.setMatrixAt(instanceId, ZERO_MATRIX);
          proxy.setColorAt(instanceId, color.setRGB(0, 0, 0));
          continue;
        }
        const ownerId = this.#batchManager.metadataOf(resourceId)?.ownerId ??
          resourceId;
        const encoded = this.#allocator.colorFor(ownerId);
        source.getMatrixAt(instanceId, matrix);
        proxy.setMatrixAt(instanceId, matrix);
        proxy.setColorAt(
          instanceId,
          color.setRGB(encoded[0], encoded[1], encoded[2])
        );
        resources += 1;
      }
      proxy.instanceMatrix.needsUpdate = true;
      if (proxy.instanceColor) proxy.instanceColor.needsUpdate = true;
      this.#scene.add(proxy);
      batches += 1;
    }
    return Object.freeze({ resources, batches });
  }

  #appendHeterogeneousProxies() {
    let resources = 0;
    const batchKeys = new Set();
    for (const entry of this.#heterogeneousBatchManager.pickingEntries()) {
      if (!entry.visible || !entry.geometry) continue;
      const encoded = this.#allocator.colorFor(entry.ownerId);
      const material = this.#uniformMaterial(entry.side);
      const mesh = new THREE.Mesh(entry.geometry, material);
      mesh.name = `gpu-picking-${entry.resourceId}`;
      mesh.frustumCulled = false;
      mesh.matrixAutoUpdate = false;
      mesh.matrix.copy(entry.matrix);
      mesh.matrixWorldNeedsUpdate = true;
      mesh.layers.mask = entry.layersMask;
      mesh.userData.pickingColor = encoded;
      mesh.onBeforeRender = () => {
        material.uniforms.pickingColor.value.set(
          encoded[0],
          encoded[1],
          encoded[2]
        );
        material.uniformsNeedUpdate = true;
      };
      this.#scene.add(mesh);
      resources += 1;
      batchKeys.add(entry.batchKey);
    }
    return Object.freeze({ resources, batches: batchKeys.size });
  }

  #pickingCamera(rect, clientX, clientY) {
    const source = this.#camera;
    const camera = source.clone();
    camera.copy(source, false);
    source.updateMatrixWorld(true);
    camera.matrixWorld.copy(source.matrixWorld);
    camera.matrixWorldInverse.copy(source.matrixWorldInverse);
    camera.layers.mask = source.layers.mask;
    const drawingSize = this.#renderer.getDrawingBufferSize(
      new THREE.Vector2()
    );
    const fullWidth = Math.max(1, Math.floor(drawingSize.x));
    const fullHeight = Math.max(1, Math.floor(drawingSize.y));
    const offsetX = clampInteger(
      Math.floor((clientX - rect.left) / rect.width * fullWidth),
      0,
      fullWidth - 1
    );
    const offsetY = clampInteger(
      Math.floor((clientY - rect.top) / rect.height * fullHeight),
      0,
      fullHeight - 1
    );
    if (typeof camera.setViewOffset === "function") {
      camera.setViewOffset(
        fullWidth,
        fullHeight,
        offsetX,
        offsetY,
        1,
        1
      );
      camera.updateProjectionMatrix();
    }
    this.#cameraScratch = camera;
    return camera;
  }

  #instancedMaterial(side) {
    const key = normalizeSide(side);
    let material = this.#instancedMaterials.get(key);
    if (!material) {
      material = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        vertexColors: true,
        side: key,
        fog: false,
        toneMapped: false,
        depthTest: true,
        depthWrite: true,
        transparent: false,
        blending: THREE.NoBlending
      });
      material.name = `gpu-picking-instanced-${key}`;
      this.#instancedMaterials.set(key, material);
    }
    return material;
  }

  #uniformMaterial(side) {
    const key = normalizeSide(side);
    let material = this.#uniformMaterials.get(key);
    if (!material) {
      material = new THREE.ShaderMaterial({
        uniforms: {
          pickingColor: { value: new THREE.Vector3() }
        },
        vertexShader: `
          uniform vec3 pickingColor;
          varying vec3 vPickingColor;
          void main() {
            vPickingColor = pickingColor;
            gl_Position = projectionMatrix * modelViewMatrix *
              vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          varying vec3 vPickingColor;
          void main() {
            gl_FragColor = vec4(vPickingColor, 1.0);
          }
        `,
        side: key,
        fog: false,
        toneMapped: false,
        depthTest: true,
        depthWrite: true,
        transparent: false,
        blending: THREE.NoBlending
      });
      material.name = `gpu-picking-uniform-${key}`;
      this.#uniformMaterials.set(key, material);
    }
    return material;
  }

  #clearProxies() {
    for (const child of [...this.#scene.children]) {
      this.#scene.remove(child);
      child.onBeforeRender = null;
      child.dispose?.();
    }
  }
}

function createPickingTarget() {
  const target = new THREE.WebGLRenderTarget(1, 1, {
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    format: THREE.RGBAFormat,
    type: THREE.UnsignedByteType,
    depthBuffer: true,
    stencilBuffer: false,
    generateMipmaps: false
  });
  target.texture.generateMipmaps = false;
  if ("colorSpace" in target.texture) {
    target.texture.colorSpace = THREE.NoColorSpace;
  }
  target.samples = 0;
  return target;
}

function normalizeSide(value) {
  return [THREE.FrontSide, THREE.BackSide, THREE.DoubleSide].includes(value)
    ? value
    : THREE.FrontSide;
}

function clampInteger(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, Math.trunc(value)));
}

function now() {
  return globalThis.performance?.now?.() ?? Date.now();
}
