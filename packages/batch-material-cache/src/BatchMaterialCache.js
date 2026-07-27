import * as THREE from "three";
import { RefCountCache } from "../../renderer-resource-cache/src/RefCountCache.js";

export class BatchMaterialCache {
  #viewerMaterialSettings;

  constructor({
    resourceCache,
    viewerMaterialSettings = {}
  }) {
    if (!resourceCache) {
      throw new TypeError("BatchMaterialCache exige resourceCache.");
    }

    this.resourceCache = resourceCache;
    this.#viewerMaterialSettings = normalizeViewerMaterialSettings(
      viewerMaterialSettings
    );

    this.materials = new RefCountCache({
      create: (_, descriptor) => this.#createMaterial(descriptor),

      dispose: record => {
        if (record.textureCacheKey) {
          this.resourceCache.releaseTexture(record.textureCacheKey);
        }

        record.material.map = null;
        record.material.dispose();
      }
    });
  }

  setViewerMaterialSettings(settings = {}) {
    this.#viewerMaterialSettings = normalizeViewerMaterialSettings(
      settings
    );
    return this.viewerMaterialSettings();
  }

  viewerMaterialSettings() {
    return Object.freeze(
      structuredClone(this.#viewerMaterialSettings)
    );
  }

  acquire({ appearanceId, material, renderProfile = null }) {
    const descriptor = {
      appearanceId: String(appearanceId),
      material: normalizeMaterial(material),
      renderProfile: normalizeRenderProfile(renderProfile)
    };

    return this.materials.acquire(
      materialCacheKey(descriptor.appearanceId, descriptor.renderProfile),
      descriptor
    );
  }

  release(cacheKey) {
    return this.materials.release(cacheKey);
  }

  stats() {
    return Object.freeze({
      ...this.materials.stats(),
      viewerMode: this.#viewerMaterialSettings.mode
    });
  }

  #createMaterial({ material, renderProfile }) {
    const resolved = resolveViewerMaterial(
      material,
      this.#viewerMaterialSettings
    );
    const parameters = resolved.parameters;
    const usesPhysicalMaterial =
      resolved.model === "physical" ||
      parameters.transmission > 0 ||
      parameters.dispersion > 0 ||
      parameters.iridescence > 0 ||
      parameters.clearcoat > 0;
    const MaterialClass = usesPhysicalMaterial
      ? THREE.MeshPhysicalMaterial
      : THREE.MeshStandardMaterial;
    const usesTransmission =
      usesPhysicalMaterial && parameters.transmission > 0;

    const threeMaterial = new MaterialClass({
      color: resolved.color,
      opacity: usesTransmission ? 1 : resolved.opacity,
      transparent: usesTransmission
        ? false
        : resolved.transparent,
      side: threeSide(renderProfile.side),
      roughness: parameters.roughness,
      metalness: parameters.metalness,
      envMapIntensity: parameters.envMapIntensity
    });

    if (usesPhysicalMaterial) {
      threeMaterial.transmission = parameters.transmission;
      threeMaterial.ior = parameters.ior;
      threeMaterial.thickness = parameters.thickness;
      threeMaterial.attenuationDistance =
        parameters.attenuationDistance <= 0
          ? Infinity
          : parameters.attenuationDistance;
      threeMaterial.attenuationColor.set(
        parameters.attenuationColor
      );
      threeMaterial.dispersion = parameters.dispersion;
      threeMaterial.iridescence = parameters.iridescence;
      threeMaterial.iridescenceIOR = parameters.iridescenceIOR;
      threeMaterial.iridescenceThicknessRange = [
        parameters.iridescenceThicknessMin,
        parameters.iridescenceThicknessMax
      ];
      threeMaterial.clearcoat = parameters.clearcoat;
      threeMaterial.clearcoatRoughness =
        parameters.clearcoatRoughness;
    }

    const acquiredTexture =
      this.resourceCache.acquireTexture(resolved.texture);

    const record = {
      material: threeMaterial,
      textureCacheKey: acquiredTexture?.key ?? null
    };

    if (!acquiredTexture) {
      return record;
    }

    if (acquiredTexture.value) {
      threeMaterial.map = acquiredTexture.value;
      threeMaterial.needsUpdate = true;
      return record;
    }

    acquiredTexture.promise?.then(texture => {
      if (!texture) return;
      threeMaterial.map = texture;
      threeMaterial.needsUpdate = true;
    }).catch(error => {
      console.error(
        "Falha ao preparar material compartilhado",
        error
      );
    });

    return record;
  }
}

export function resolveViewerMaterial(
  material = {},
  viewerSettings = {}
) {
  const source = normalizeMaterial(material);
  const viewer = normalizeViewerMaterialSettings(viewerSettings);
  const projectParameters = source.parameters;
  const parameters = {};

  for (const [key, fallback] of Object.entries(
    MATERIAL_PARAMETER_DEFAULTS
  )) {
    const projectValue = projectParameters[key];
    const viewerValue = viewer[key];

    parameters[key] = viewer.mode === "override"
      ? viewerValue
      : viewer.mode === "enhance" && projectValue === undefined
        ? viewerValue
        : normalizeParameter(key, projectValue, fallback);
  }

  return Object.freeze({
    model: viewer.mode === "override" && requiresPhysical(parameters)
      ? "physical"
      : source.model,
    color: viewer.colorMode === "override"
      ? viewer.color
      : source.color,
    opacity: source.opacity,
    transparent: source.transparent,
    texture: source.texture,
    parameters: Object.freeze(parameters)
  });
}

const MATERIAL_PARAMETER_DEFAULTS = Object.freeze({
  roughness: 1,
  metalness: 0,
  transmission: 0,
  ior: 1.5,
  thickness: 0,
  attenuationColor: "#ffffff",
  attenuationDistance: 0,
  dispersion: 0,
  iridescence: 0,
  iridescenceIOR: 1.3,
  iridescenceThicknessMin: 100,
  iridescenceThicknessMax: 400,
  clearcoat: 0,
  clearcoatRoughness: 0,
  envMapIntensity: 1
});

function normalizeMaterial(material = {}) {
  return {
    model: String(material.model ?? "standard").toLowerCase(),
    color: color(material.color, "#ffffff"),
    opacity: bounded(material.opacity, 0, 1, 1),
    transparent: Boolean(material.transparent),
    texture: material.texture ?? null,
    parameters: structuredClone(material.parameters ?? {})
  };
}

function normalizeViewerMaterialSettings(settings = {}) {
  return Object.freeze({
    mode: choice(
      settings.mode,
      ["project", "enhance", "override"],
      "project"
    ),
    colorMode: choice(
      settings.colorMode,
      ["project", "override"],
      "project"
    ),
    color: color(settings.color, "#72cfff"),
    roughness: bounded(settings.roughness, 0, 1, 0.2),
    metalness: bounded(settings.metalness, 0, 1, 0),
    transmission: bounded(settings.transmission, 0, 1, 0),
    ior: bounded(settings.ior, 1, 2.333, 1.5),
    thickness: nonNegative(settings.thickness, 0.5),
    attenuationColor: color(
      settings.attenuationColor,
      "#72cfff"
    ),
    attenuationDistance: nonNegative(
      settings.attenuationDistance,
      8
    ),
    dispersion: bounded(settings.dispersion, 0, 10, 0),
    iridescence: bounded(settings.iridescence, 0, 1, 0),
    iridescenceIOR: bounded(
      settings.iridescenceIOR,
      1,
      2.333,
      1.3
    ),
    iridescenceThicknessMin: nonNegative(
      settings.iridescenceThicknessMin,
      100
    ),
    iridescenceThicknessMax: nonNegative(
      settings.iridescenceThicknessMax,
      400
    ),
    clearcoat: bounded(settings.clearcoat, 0, 1, 0),
    clearcoatRoughness: bounded(
      settings.clearcoatRoughness,
      0,
      1,
      0
    ),
    envMapIntensity: bounded(
      settings.envMapIntensity,
      0,
      20,
      1
    )
  });
}

function normalizeRenderProfile(profile = null) {
  const side = String(profile?.side ?? "front").toLowerCase();
  if (!["front", "back", "double"].includes(side)) {
    throw new TypeError(`Face de renderização inválida: ${side}.`);
  }

  return Object.freeze({
    topology: String(profile?.topology ?? "closed-solid"),
    side
  });
}

function materialCacheKey(appearanceId, profile) {
  return profile.side === "front"
    ? appearanceId
    : `${appearanceId}|side:${profile.side}`;
}

function threeSide(side) {
  return ({
    front: THREE.FrontSide,
    back: THREE.BackSide,
    double: THREE.DoubleSide
  })[side];
}

function requiresPhysical(parameters) {
  return parameters.transmission > 0 ||
    parameters.dispersion > 0 ||
    parameters.iridescence > 0 ||
    parameters.clearcoat > 0;
}

function normalizeParameter(key, value, fallback) {
  if (value === undefined) return fallback;
  if (key === "attenuationColor") {
    return color(value, fallback);
  }
  if (key === "ior" || key === "iridescenceIOR") {
    return bounded(value, 1, 2.333, fallback);
  }
  if ([
    "roughness",
    "metalness",
    "transmission",
    "iridescence",
    "clearcoat",
    "clearcoatRoughness"
  ].includes(key)) {
    return bounded(value, 0, 1, fallback);
  }
  if (key === "dispersion") {
    return bounded(value, 0, 10, fallback);
  }
  if (key === "envMapIntensity") {
    return bounded(value, 0, 20, fallback);
  }
  return nonNegative(value, fallback);
}

function choice(value, allowed, fallback) {
  const normalized = String(value ?? fallback).toLowerCase();
  return allowed.includes(normalized) ? normalized : fallback;
}

function color(value, fallback) {
  const normalized = String(value ?? fallback).trim();
  return /^#[0-9a-f]{6}$/i.test(normalized)
    ? normalized.toLowerCase()
    : fallback;
}

function bounded(value, minimum, maximum, fallback) {
  const number = finite(value, fallback);
  return Math.min(maximum, Math.max(minimum, number));
}

function nonNegative(value, fallback) {
  return Math.max(0, finite(value, fallback));
}

function finite(value, fallback) {
  const number = value === undefined ? fallback : Number(value);
  return Number.isFinite(number) ? number : fallback;
}
