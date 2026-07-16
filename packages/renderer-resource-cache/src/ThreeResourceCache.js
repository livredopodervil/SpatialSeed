import * as THREE from "three";
import { RefCountCache } from "./RefCountCache.js";

export class ThreeResourceCache {
  constructor({ textureLoader = new THREE.TextureLoader() } = {}) {
    this.textureLoader = textureLoader;

    this.geometries = new RefCountCache({
      create: (_, descriptor) => {
        const geometry=descriptor.create();
        if (!geometry?.isBufferGeometry) {
          throw new TypeError("Factory deve produzir BufferGeometry.");
        }
        return geometry;
      }
    });

    this.textures = new RefCountCache({
      create: (_, descriptor) =>
        loadTexture(this.textureLoader, descriptor)
    });
  }

  acquireBox(size) {
    const normalized = normalizeVector(size, 3, [1, 1, 1]);
    const key = "box:" + normalized.join(",");
    return this.acquireGeometry(
      key,
      () => new THREE.BoxGeometry(...normalized)
    );
  }

  acquireGeometry(key, create) {
    if (typeof create !== "function") {
      throw new TypeError("Geometria exige uma factory.");
    }
    return this.geometries.acquire(key,{create});
  }

  releaseGeometry(key) {
    return this.geometries.release(key);
  }

  acquireTexture(textureState) {
    const descriptor = normalizeTextureState(textureState);
    if (!descriptor.src) return null;

    const key = JSON.stringify(descriptor);
    return this.textures.acquire(key, descriptor);
  }

  releaseTexture(key) {
    return this.textures.release(key);
  }

  stats() {
    return Object.freeze({
      geometries: this.geometries.stats(),
      textures: this.textures.stats()
    });
  }
}

export function textureKey(textureState) {
  return JSON.stringify(normalizeTextureState(textureState));
}

export function normalizeTextureState(textureState = null) {
  const state = textureState ?? {};

  return {
    src: String(state.src ?? ""),
    colorSpace: String(state.colorSpace ?? "srgb"),
    flipY: Boolean(state.flipY ?? true),
    wrap: String(state.wrap ?? "repeat"),
    repeat: normalizeVector(state.repeat, 2, [1, 1]),
    offset: normalizeVector(state.offset, 2, [0, 0]),
    rotationDeg: finite(state.rotationDeg ?? 0)
  };
}

function loadTexture(loader, descriptor) {
  return new Promise((resolve, reject) => {
    loader.load(
      descriptor.src,
      texture => {
        configureTexture(texture, descriptor);
        resolve(texture);
      },
      undefined,
      reject
    );
  });
}

function configureTexture(texture, descriptor) {
  const wrapping = {
    repeat: THREE.RepeatWrapping,
    mirror: THREE.MirroredRepeatWrapping,
    clamp: THREE.ClampToEdgeWrapping
  }[descriptor.wrap] ?? THREE.RepeatWrapping;

  if (descriptor.colorSpace === "srgb") {
    texture.colorSpace = THREE.SRGBColorSpace;
  }

  texture.flipY = descriptor.flipY;
  texture.wrapS = wrapping;
  texture.wrapT = wrapping;
  texture.repeat.fromArray(descriptor.repeat);
  texture.offset.fromArray(descriptor.offset);
  texture.center.set(0.5, 0.5);
  texture.rotation = descriptor.rotationDeg * Math.PI / 180;
  texture.needsUpdate = true;
}

function normalizeVector(values, length, fallback) {
  const source = Array.isArray(values) ? values : fallback;

  if (source.length !== length) {
    throw new TypeError(`Vetor deve conter ${length} valores.`);
  }

  return source.map(finite);
}

function finite(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    throw new TypeError(`Valor numérico inválido: ${value}.`);
  }

  return number;
}
