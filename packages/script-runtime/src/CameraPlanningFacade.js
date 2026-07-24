import {
  VIEWER_CAMERA_COMMANDS
} from "../../runtime-layers/src/ViewerCameraCommands.js";

export const CAMERA_PLAN_COMMANDS = VIEWER_CAMERA_COMMANDS;

export function createCameraPlanningFacade({
  run,
  snapshot = null
} = {}) {
  if (!run || typeof run.emit !== "function") {
    throw new TypeError("Execução de câmera incompatível.");
  }

  const emit = (command, args = {}) => {
    run.emit(command, objectClone(args, "Argumentos de câmera"));
    return run.commandCount;
  };
  const view = snapshot === null
    ? null
    : objectClone(snapshot, "Snapshot de câmera");

  return Object.freeze({
    view,

    projection(options = {}) {
      return emit("viewer.camera.projection.set", options);
    },

    pose(options = {}) {
      return emit("viewer.camera.pose.set", options);
    },

    position(position) {
      return emit("viewer.camera.pose.set", { position });
    },

    move(delta, options = {}) {
      return emit("viewer.camera.move", {
        ...objectClone(options, "Opções de movimento"),
        delta
      });
    },

    lookAt(target, options = {}) {
      return emit("viewer.camera.look-at", {
        ...objectClone(options, "Opções de orientação"),
        target
      });
    },

    orbit(options = {}) {
      return emit("viewer.camera.orbit", options);
    },

    frameSelection(options = {}) {
      return emit("viewer.camera.frame-selection", options);
    },

    interpolate(to, alpha, options = {}) {
      return emit("viewer.camera.interpolate", {
        ...objectClone(options, "Opções de interpolação"),
        to,
        alpha
      });
    },

    restore(camera) {
      return emit("viewer.camera.restore", { camera });
    },

    stats() {
      return Object.freeze({
        commandCount: run.commandCount,
        commands: CAMERA_PLAN_COMMANDS
      });
    }
  });
}

function objectClone(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} deve formar um objeto.`);
  }
  try {
    return structuredClone(value);
  } catch (error) {
    throw new TypeError(
      `${label} deve ser serializável por structuredClone.`,
      { cause: error }
    );
  }
}
