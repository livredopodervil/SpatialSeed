import {
  ProjectSerializer
} from "./ProjectSerializer.js?build=20260807-0052b";
import {
  HierarchyIndex
} from "../../scene-hierarchy/src/index.js";
import {
  isInstanceNode,
  normalizeInstanceGraph,
  validateInstanceGraph
} from "../../instance-graph/src/index.js?build=20260807-0052b";

export class ProjectValidator {
  parse(text) {
    let value;

    try {
      value = JSON.parse(String(text ?? ""));
    } catch (error) {
      const wrapped = new Error(
        "O arquivo não contém JSON válido."
      );
      wrapped.cause = error;
      throw wrapped;
    }

    return this.validate(value);
  }

  validate(value) {
    if (!value || typeof value !== "object") {
      throw new Error(
        "Estrutura de projeto inválida."
      );
    }

    if (value.format !== ProjectSerializer.format) {
      throw new Error(
        `Formato incompatível: ${value.format ?? "ausente"}.`
      );
    }

    if (![1, 2, 3, ProjectSerializer.schemaVersion].includes(
      value.schemaVersion
    )) {
      throw new Error(
        `Versão de esquema incompatível: ` +
        `${value.schemaVersion ?? "ausente"}.`
      );
    }

    if (
      !value.scene ||
      !Array.isArray(value.scene.objects)
    ) {
      throw new Error(
        "A cena não contém uma lista de objetos."
      );
    }

    if (
      value.schemaVersion >= 2 &&
      (
        !value.assets ||
        value.assets.schemaVersion !== 1 ||
        typeof value.assets.assets !== "object"
      )
    ) {
      throw new Error(
        "Catálogo de assets inválido."
      );
    }

    const ids = new Set();

    const objects = value.scene.objects.map(
      (object, index) => {
        if (!object || typeof object !== "object") {
          throw new Error(
            `Objeto inválido no índice ${index}.`
          );
        }

        const id = String(object.id ?? "");

        if (!id) {
          throw new Error(
            `Objeto sem id no índice ${index}.`
          );
        }

        if (ids.has(id)) {
          throw new Error(
            `Id duplicado: ${id}.`
          );
        }

        ids.add(id);

        if (
          value.schemaVersion >= 2 &&
          !["group", "camera", "light", "instance"].includes(object.kind) &&
          !object.appearanceId
        ) {
          throw new Error(
            `Objeto sem appearanceId: ${id}.`
          );
        }

        if (object.kind === "camera") {
          if (value.schemaVersion < 3) {
            throw new Error(
              `Objeto câmera exige schema 3: ${id}.`
            );
          }
          validateCameraNode(object, id);
        }

        if (object.kind === "light") {
          if (value.schemaVersion < 3) {
            throw new Error(`Objeto luz exige schema 3: ${id}.`);
          }
          validateLightNode(object, id);
        }

        if (object.kind === "instance" && value.schemaVersion < 4) {
          throw new Error(`Instância de definição exige schema 4: ${id}.`);
        }

        return structuredClone(object);
      }
    );

    const instanceGraph = value.schemaVersion >= 4
      ? normalizeInstanceGraph(value.scene.instanceGraph)
      : normalizeInstanceGraph(null);
    if (value.schemaVersion >= 4) {
      validateInstanceGraph(instanceGraph);
      for (const object of objects) {
        if (isInstanceNode(object) && !instanceGraph.definitions[object.definitionId]) {
          throw new Error(
            `Definição inexistente para instância ${object.id}: ${object.definitionId}.`
          );
        }
      }
    }

    if (
      value.schemaVersion < 3 &&
      value.scene.defaultCameraId !== undefined
    ) {
      throw new Error("Câmera padrão exige schema 3.");
    }
    const defaultCameraId =
      value.scene.defaultCameraId === undefined ||
      value.scene.defaultCameraId === null ||
      value.scene.defaultCameraId === ""
      ? null
      : String(value.scene.defaultCameraId);
    if (
      defaultCameraId !== null &&
      !objects.some(object =>
        object.id === defaultCameraId && object.kind === "camera"
      )
    ) {
      throw new Error(
        `Câmera padrão inexistente: ${defaultCameraId}.`
      );
    }
    if (value.schemaVersion >= 3) {
      new HierarchyIndex(objects);
    }

    return {
      format: value.format,
      schemaVersion: value.schemaVersion,
      metadata: structuredClone(value.metadata ?? {}),
      region: structuredClone(value.region ?? {}),
      assets:
        value.schemaVersion >= 2
          ? structuredClone(value.assets)
          : null,
      scene: validatedSceneShell(value.scene, {
        instanceGraph: value.schemaVersion >= 4 ? instanceGraph : null,
        defaultCameraId,
        objects
      }),
      editor: structuredClone(value.editor ?? {}),
      renderer: structuredClone(value.renderer ?? {})
    };
  }
}

function validatedSceneShell(scene, { instanceGraph, defaultCameraId, objects }) {
  const {
    objects: _objects,
    instanceGraph: _instanceGraph,
    ...shell
  } = scene ?? {};
  return {
    ...structuredClone(shell),
    ...(instanceGraph ? { instanceGraph } : {}),
    ...(defaultCameraId === null ? {} : { defaultCameraId }),
    objects
  };
}

function validateLightNode(object, id) {
  vector(object.position ?? [0, 0, 0], 3, `Posição inválida: ${id}.`);
  vector(object.rotation ?? [0, 0, 0, 1], 4, `Rotação inválida: ${id}.`);
  const light = object.light;
  if (!light || !["point", "directional", "spot", "ambient"].includes(light.type)) {
    throw new Error(`Luz inválida: ${id}.`);
  }
  if (!/^#[0-9a-fA-F]{6}$/.test(String(light.color ?? ""))) {
    throw new Error(`Cor de luz inválida: ${id}.`);
  }
  const intensity = Number(light.intensity);
  const distance = Number(light.distance);
  const decay = Number(light.decay);
  const angleDeg = Number(light.angleDeg);
  const penumbra = Number(light.penumbra);
  for (const [key, value] of Object.entries({
    intensity, distance, decay, angleDeg, penumbra
  })) {
    if (!Number.isFinite(value)) {
      throw new Error(`Parâmetro de luz inválido (${key}): ${id}.`);
    }
  }
  if (intensity < 0 || distance < 0 || decay < 0) {
    throw new Error(`Parâmetros negativos de luz: ${id}.`);
  }
  if (!(angleDeg > 0 && angleDeg < 180)) {
    throw new Error(`Ângulo de luz fora do intervalo: ${id}.`);
  }
  if (!(penumbra >= 0 && penumbra <= 1)) {
    throw new Error(`Penumbra de luz fora do intervalo: ${id}.`);
  }
  if (typeof light.castShadow !== "boolean") {
    throw new Error(`Estado de sombra inválido: ${id}.`);
  }
}

function validateCameraNode(object, id) {
  vector(object.position ?? [0, 0, 0], 3, `Posição inválida: ${id}.`);
  const rotation = vector(
    object.rotation ?? [0, 0, 0, 1],
    4,
    `Orientação inválida: ${id}.`
  );
  if (Math.hypot(...rotation) <= 1e-12) {
    throw new Error(`Orientação inválida: ${id}.`);
  }
  const camera = object.camera;
  if (!camera || typeof camera !== "object") {
    throw new Error(`Descritor de câmera ausente: ${id}.`);
  }
  if ((camera.projection ?? "perspective") !== "perspective") {
    throw new Error(`Projeção de câmera incompatível: ${id}.`);
  }
  const fov = finite(camera.fov ?? 55);
  const near = finite(camera.near ?? 0.1);
  const far = finite(camera.far ?? 1000);
  const focusDistance = finite(camera.focusDistance ?? 10);
  if (
    !(fov >= 1 && fov <= 179) ||
    !(near > 0 && far > near) ||
    !(focusDistance > 0)
  ) {
    throw new Error(`Descritor de câmera inválido: ${id}.`);
  }
}

function vector(value, length, message) {
  if (
    !Array.isArray(value) ||
    value.length !== length ||
    !value.every(entry => Number.isFinite(Number(entry)))
  ) {
    throw new Error(message);
  }
  return value.map(Number);
}

function finite(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new TypeError("Valor de câmera deve ser finito.");
  }
  return number;
}
