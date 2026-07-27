export const VIEWER_RENDER_SETTINGS_VERSION =
  "viewer-render-settings-v1";

export const DEFAULT_VIEWER_RENDER_SETTINGS = deepFreeze({
  schemaVersion: 1,
  quality: {
    pixelRatioCap: 1.5,
    transmissionResolutionScale: 0.5
  },
  toneMapping: {
    mode: "aces",
    exposure: 1
  },
  background: {
    color: "#08101a"
  },
  environment: {
    enabled: true,
    preset: "studio-blue",
    intensity: 1,
    background: false,
    backgroundBlur: 0.35,
    backgroundIntensity: 0.45
  },
  lighting: {
    hemisphere: {
      enabled: true,
      skyColor: "#aecbff",
      groundColor: "#182012",
      intensity: 0.8
    },
    directional: {
      enabled: true,
      color: "#ffffff",
      intensity: 3.5,
      position: [12, 24, 16],
      target: [0, 0, 0]
    }
  },
  shadows: {
    enabled: true,
    type: "pcf-soft",
    mapSize: 1024,
    extent: 40,
    near: 0.5,
    far: 160,
    bias: -0.0004,
    normalBias: 0.03,
    floorEnabled: true,
    floorSize: 200,
    floorY: 0,
    floorOpacity: 0.28
  },
  materials: {
    mode: "project",
    colorMode: "project",
    color: "#72cfff",
    roughness: 0.2,
    metalness: 0,
    transmission: 0,
    ior: 1.5,
    thickness: 0.5,
    attenuationColor: "#72cfff",
    attenuationDistance: 8,
    dispersion: 0,
    iridescence: 0,
    iridescenceIOR: 1.3,
    iridescenceThicknessMin: 100,
    iridescenceThicknessMax: 400,
    clearcoat: 0,
    clearcoatRoughness: 0,
    envMapIntensity: 1
  }
});

const PRESETS = deepFreeze({
  original: {
    label: "Original 0029f1",
    settings: {
      quality: {
        pixelRatioCap: 2,
        transmissionResolutionScale: 1
      },
      toneMapping: { mode: "none", exposure: 1 },
      environment: {
        enabled: false,
        preset: "studio-blue",
        intensity: 1,
        background: false,
        backgroundBlur: 0,
        backgroundIntensity: 1
      },
      lighting: {
        hemisphere: {
          enabled: true,
          skyColor: "#aecbff",
          groundColor: "#182012",
          intensity: 2.2
        },
        directional: {
          enabled: true,
          color: "#ffffff",
          intensity: 2.5,
          position: [8, 16, 10],
          target: [0, 0, 0]
        }
      },
      shadows: {
        enabled: false,
        floorEnabled: false
      },
      materials: {
        mode: "project",
        colorMode: "project"
      }
    }
  },
  "studio-shadows": {
    label: "Estúdio com sombras",
    settings: {}
  },
  "crystal-blue": {
    label: "Cristal azul",
    settings: {
      toneMapping: { mode: "aces", exposure: 1.05 },
      environment: {
        enabled: true,
        preset: "studio-blue",
        intensity: 1.4,
        background: false,
        backgroundBlur: 0.3,
        backgroundIntensity: 0.5
      },
      materials: {
        mode: "override",
        colorMode: "override",
        color: "#72cfff",
        roughness: 0.06,
        metalness: 0,
        transmission: 0.94,
        ior: 1.46,
        thickness: 0.8,
        attenuationColor: "#38a8ff",
        attenuationDistance: 8,
        dispersion: 0.18,
        iridescence: 0.08,
        iridescenceIOR: 1.3,
        iridescenceThicknessMin: 100,
        iridescenceThicknessMax: 420,
        clearcoat: 0.25,
        clearcoatRoughness: 0.04,
        envMapIntensity: 1.4
      }
    }
  },
  glass: {
    label: "Vidro",
    settings: {
      materials: {
        mode: "override",
        colorMode: "override",
        color: "#e8f7ff",
        roughness: 0.03,
        metalness: 0,
        transmission: 0.98,
        ior: 1.5,
        thickness: 0.25,
        attenuationColor: "#d9f4ff",
        attenuationDistance: 20,
        dispersion: 0.02,
        iridescence: 0,
        clearcoat: 0.1,
        clearcoatRoughness: 0.02,
        envMapIntensity: 1.25
      }
    }
  },
  steel: {
    label: "Aço polido",
    settings: {
      environment: {
        enabled: true,
        preset: "studio-neutral",
        intensity: 1.2
      },
      materials: {
        mode: "override",
        colorMode: "override",
        color: "#9aa7b2",
        roughness: 0.22,
        metalness: 0.92,
        transmission: 0,
        dispersion: 0,
        iridescence: 0,
        clearcoat: 0.12,
        clearcoatRoughness: 0.08,
        envMapIntensity: 1.2
      }
    }
  },
  concrete: {
    label: "Concreto",
    settings: {
      environment: {
        enabled: true,
        preset: "studio-neutral",
        intensity: 0.65
      },
      materials: {
        mode: "override",
        colorMode: "override",
        color: "#8b9196",
        roughness: 0.88,
        metalness: 0,
        transmission: 0,
        dispersion: 0,
        iridescence: 0,
        clearcoat: 0,
        envMapIntensity: 0.35
      }
    }
  }
});

export function describeViewerRenderPresets() {
  return Object.freeze(
    Object.entries(PRESETS).map(([id, preset]) =>
      Object.freeze({ id, label: preset.label })
    )
  );
}

export function viewerRenderPreset(id) {
  const preset = PRESETS[String(id)];
  if (!preset) {
    throw new RangeError(`Preset de viewer desconhecido: ${id}.`);
  }
  return normalizeViewerRenderSettings(
    preset.settings,
    DEFAULT_VIEWER_RENDER_SETTINGS
  );
}

export function mergeViewerRenderSettings(base, patch = {}) {
  return normalizeViewerRenderSettings(
    patch,
    normalizeViewerRenderSettings(base)
  );
}

export function normalizeViewerRenderSettings(
  value = {},
  fallback = DEFAULT_VIEWER_RENDER_SETTINGS
) {
  const source = mergeObjects(fallback, value);
  const shadowMapSize = integerChoice(
    source.shadows?.mapSize,
    [256, 512, 1024, 2048, 4096],
    1024
  );
  const iridescenceMin = nonNegative(
    source.materials?.iridescenceThicknessMin,
    100
  );
  const iridescenceMax = Math.max(
    iridescenceMin,
    nonNegative(
      source.materials?.iridescenceThicknessMax,
      400
    )
  );

  return deepFreeze({
    schemaVersion: 1,
    quality: {
      pixelRatioCap: bounded(
        source.quality?.pixelRatioCap,
        0.5,
        3,
        1.5
      ),
      transmissionResolutionScale: bounded(
        source.quality?.transmissionResolutionScale,
        0.1,
        1,
        0.5
      )
    },
    toneMapping: {
      mode: choice(
        source.toneMapping?.mode,
        [
          "none",
          "linear",
          "reinhard",
          "cineon",
          "aces",
          "agx",
          "neutral"
        ],
        "aces"
      ),
      exposure: bounded(
        source.toneMapping?.exposure,
        0.01,
        20,
        1
      )
    },
    background: {
      color: hexColor(
        source.background?.color,
        "#08101a"
      )
    },
    environment: {
      enabled: Boolean(source.environment?.enabled),
      preset: choice(
        source.environment?.preset,
        ["studio-blue", "studio-neutral", "studio-warm"],
        "studio-blue"
      ),
      intensity: bounded(
        source.environment?.intensity,
        0,
        20,
        1
      ),
      background: Boolean(source.environment?.background),
      backgroundBlur: bounded(
        source.environment?.backgroundBlur,
        0,
        1,
        0.35
      ),
      backgroundIntensity: bounded(
        source.environment?.backgroundIntensity,
        0,
        20,
        0.45
      )
    },
    lighting: {
      hemisphere: {
        enabled: Boolean(source.lighting?.hemisphere?.enabled),
        skyColor: hexColor(
          source.lighting?.hemisphere?.skyColor,
          "#aecbff"
        ),
        groundColor: hexColor(
          source.lighting?.hemisphere?.groundColor,
          "#182012"
        ),
        intensity: bounded(
          source.lighting?.hemisphere?.intensity,
          0,
          100,
          0.8
        )
      },
      directional: {
        enabled: Boolean(source.lighting?.directional?.enabled),
        color: hexColor(
          source.lighting?.directional?.color,
          "#ffffff"
        ),
        intensity: bounded(
          source.lighting?.directional?.intensity,
          0,
          100,
          3.5
        ),
        position: vector3(
          source.lighting?.directional?.position,
          [12, 24, 16]
        ),
        target: vector3(
          source.lighting?.directional?.target,
          [0, 0, 0]
        )
      }
    },
    shadows: {
      enabled: Boolean(source.shadows?.enabled),
      type: choice(
        source.shadows?.type,
        ["basic", "pcf", "pcf-soft", "vsm"],
        "pcf-soft"
      ),
      mapSize: shadowMapSize,
      extent: positive(source.shadows?.extent, 40),
      near: positive(source.shadows?.near, 0.5),
      far: positive(source.shadows?.far, 160),
      bias: finite(source.shadows?.bias, -0.0004),
      normalBias: nonNegative(
        source.shadows?.normalBias,
        0.03
      ),
      floorEnabled: Boolean(source.shadows?.floorEnabled),
      floorSize: positive(source.shadows?.floorSize, 200),
      floorY: finite(source.shadows?.floorY, 0),
      floorOpacity: bounded(
        source.shadows?.floorOpacity,
        0,
        1,
        0.28
      )
    },
    materials: {
      mode: choice(
        source.materials?.mode,
        ["project", "enhance", "override"],
        "project"
      ),
      colorMode: choice(
        source.materials?.colorMode,
        ["project", "override"],
        "project"
      ),
      color: hexColor(source.materials?.color, "#72cfff"),
      roughness: bounded(source.materials?.roughness, 0, 1, 0.2),
      metalness: bounded(source.materials?.metalness, 0, 1, 0),
      transmission: bounded(
        source.materials?.transmission,
        0,
        1,
        0
      ),
      ior: bounded(source.materials?.ior, 1, 2.333, 1.5),
      thickness: nonNegative(source.materials?.thickness, 0.5),
      attenuationColor: hexColor(
        source.materials?.attenuationColor,
        "#72cfff"
      ),
      attenuationDistance: nonNegative(
        source.materials?.attenuationDistance,
        8
      ),
      dispersion: bounded(
        source.materials?.dispersion,
        0,
        10,
        0
      ),
      iridescence: bounded(
        source.materials?.iridescence,
        0,
        1,
        0
      ),
      iridescenceIOR: bounded(
        source.materials?.iridescenceIOR,
        1,
        2.333,
        1.3
      ),
      iridescenceThicknessMin: iridescenceMin,
      iridescenceThicknessMax: iridescenceMax,
      clearcoat: bounded(
        source.materials?.clearcoat,
        0,
        1,
        0
      ),
      clearcoatRoughness: bounded(
        source.materials?.clearcoatRoughness,
        0,
        1,
        0
      ),
      envMapIntensity: bounded(
        source.materials?.envMapIntensity,
        0,
        20,
        1
      )
    }
  });
}

function mergeObjects(base, patch) {
  const result = structuredClone(base ?? {});
  for (const [key, value] of Object.entries(patch ?? {})) {
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      result[key] &&
      typeof result[key] === "object" &&
      !Array.isArray(result[key])
    ) {
      result[key] = mergeObjects(result[key], value);
    } else {
      result[key] = structuredClone(value);
    }
  }
  return result;
}

function vector3(value, fallback) {
  if (!Array.isArray(value) || value.length !== 3) {
    return [...fallback];
  }
  return value.map((item, index) => finite(item, fallback[index]));
}

function choice(value, allowed, fallback) {
  const normalized = String(value ?? fallback).toLowerCase();
  return allowed.includes(normalized) ? normalized : fallback;
}

function integerChoice(value, allowed, fallback) {
  const number = Number(value);
  return allowed.includes(number) ? number : fallback;
}

function finite(value, fallback) {
  const number = value === undefined ? fallback : Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function positive(value, fallback) {
  const number = finite(value, fallback);
  return number > 0 ? number : fallback;
}

function nonNegative(value, fallback) {
  return Math.max(0, finite(value, fallback));
}

function bounded(value, minimum, maximum, fallback) {
  return Math.min(
    maximum,
    Math.max(minimum, finite(value, fallback))
  );
}

function hexColor(value, fallback) {
  const normalized = String(value ?? fallback).trim();
  return /^#[0-9a-f]{6}$/i.test(normalized)
    ? normalized.toLowerCase()
    : fallback;
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
