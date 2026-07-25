import {
  normalizeCameraProjection
} from "./ViewerState.js";
import {
  VIEWER_CAMERA_COMMANDS
} from "./ViewerCameraCommands.js";

export {
  VIEWER_CAMERA_COMMANDS
} from "./ViewerCameraCommands.js";

const EPSILON = 1e-9;
const DEG_TO_RAD = Math.PI / 180;

export class ViewerCameraController {
  static apiVersion = "viewer-camera-controller-v1";

  #applying = false;
  #disposeSurface = () => {};

  constructor({ viewer, surface } = {}) {
    if (!viewer?.snapshot || !viewer?.update) {
      throw new TypeError("ViewerCameraController exige ViewerState.");
    }
    if (
      !surface?.readNavigationCamera ||
      !surface?.applyNavigationCamera
    ) {
      throw new TypeError(
        "ViewerCameraController exige superfície de câmera."
      );
    }

    this.viewer = viewer;
    this.surface = surface;
    const initial = normalizeNavigationCamera(
      viewer.snapshot().camera,
      surface.readNavigationCamera()
    );
    this.#commit(initial);

    if (typeof surface.subscribeNavigationCamera === "function") {
      this.#disposeSurface = surface.subscribeNavigationCamera(
        state => this.#syncFromSurface(state)
      );
    }
  }

  snapshot() {
    return cameraSnapshot(this.viewer.snapshot().camera);
  }

  execute(command, args = {}) {
    const result = reduceNavigationCamera(
      this.viewer.snapshot().camera,
      command,
      args,
      {
        selectionBounds: () =>
          this.surface.readSelectionBounds?.() ?? null
      }
    );
    return this.#commit(result);
  }

  applySequence(intents = []) {
    if (!Array.isArray(intents)) {
      throw new TypeError("Sequência de câmera deve ser uma lista.");
    }

    let next = this.viewer.snapshot().camera;
    for (const [index, intent] of intents.entries()) {
      if (
        !intent ||
        intent.sequence !== index ||
        !VIEWER_CAMERA_COMMANDS.includes(intent.command)
      ) {
        throw new Error(
          `Intenção de câmera inválida na posição ${index}.`
        );
      }
      next = reduceNavigationCamera(
        next,
        intent.command,
        intent.args,
        {
          selectionBounds: () =>
            this.surface.readSelectionBounds?.() ?? null
        }
      );
    }

    return this.#commit(next);
  }

  dispose() {
    this.#disposeSurface();
    this.#disposeSurface = () => {};
  }

  #commit(state) {
    const normalized = normalizeNavigationCamera(state);
    this.#applying = true;
    try {
      this.viewer.update({ camera: normalized });
      this.surface.applyNavigationCamera(normalized);
    } finally {
      this.#applying = false;
    }
    return this.snapshot();
  }

  #syncFromSurface(state) {
    if (this.#applying) return;
    const normalized = normalizeNavigationCamera(
      state,
      this.viewer.snapshot().camera
    );
    if (sameCamera(normalized, this.viewer.snapshot().camera)) return;
    this.viewer.update({ camera: normalized });
  }
}

export function normalizeNavigationCamera(
  camera = {},
  fallback = {}
) {
  const source = camera && typeof camera === "object" ? camera : {};
  const base = fallback && typeof fallback === "object" ? fallback : {};
  const projection = normalizeCameraProjection({
    near: source.near ?? base.near ?? 0.1,
    far: source.far ?? base.far ?? 1000
  });
  const quaternion = normalizedQuaternion(
    source.quaternion ?? base.quaternion ?? [0, 0, 0, 1],
    "quaternion"
  );
  const normalized = {
    position: finiteVector(
      source.position ?? base.position ?? [10, 8, 14],
      3,
      "position"
    ),
    quaternion,
    focusDistance: positiveNumber(
      source.focusDistance ?? base.focusDistance ?? 1,
      "focusDistance"
    ),
    fov: rangedNumber(
      source.fov ?? base.fov ?? 55,
      1,
      179,
      "fov"
    ),
    near: projection.near,
    far: projection.far,
    aspect: positiveNumber(
      source.aspect ?? base.aspect ?? 1,
      "aspect"
    )
  };
  return deepFreeze(normalized);
}

export function cameraSnapshot(camera) {
  const normalized = normalizeNavigationCamera(camera);
  return deepFreeze({
    ...normalized,
    target: cameraTarget(normalized)
  });
}

export function reduceNavigationCamera(
  current,
  command,
  args = {},
  context = {}
) {
  const camera = normalizeNavigationCamera(current);
  const input = objectValue(args, "Argumentos da câmera");

  switch (command) {
    case "viewer.camera.projection.set":
      return normalizeNavigationCamera({
        ...camera,
        fov: input.fov ?? camera.fov,
        near: input.near ?? camera.near,
        far: input.far ?? camera.far
      });

    case "viewer.camera.pose.set":
      return normalizeNavigationCamera({
        ...camera,
        position: input.position ?? camera.position,
        quaternion: input.quaternion ?? camera.quaternion,
        focusDistance: input.focusDistance ?? camera.focusDistance
      });

    case "viewer.camera.move":
      return moveCamera(camera, input);

    case "viewer.camera.look-at":
      return lookAt(camera, input);

    case "viewer.camera.orbit":
      return orbitCamera(camera, input);

    case "viewer.camera.frame-selection":
      return frameCamera(
        camera,
        context.selectionBounds?.(),
        input
      );

    case "viewer.camera.interpolate":
      return interpolateCamera(camera, input);

    case "viewer.camera.restore":
      return normalizeNavigationCamera(input.camera ?? input);

    default:
      throw new Error(`Comando de câmera desconhecido: ${command}.`);
  }
}

function moveCamera(camera, args) {
  if (args.position !== undefined) {
    return normalizeNavigationCamera({
      ...camera,
      position: args.position
    });
  }

  const delta = finiteVector(args.delta ?? [0, 0, 0], 3, "delta");
  const worldDelta = args.space === "local"
    ? rotateVector(delta, camera.quaternion)
    : delta;
  if (!["world", "local", undefined].includes(args.space)) {
    throw new RangeError(`Espaço de movimento desconhecido: ${args.space}.`);
  }
  return normalizeNavigationCamera({
    ...camera,
    position: add(camera.position, worldDelta)
  });
}

function lookAt(camera, args) {
  const position = finiteVector(
    args.position ?? camera.position,
    3,
    "position"
  );
  const target = finiteVector(
    args.target,
    3,
    "target"
  );
  const direction = subtract(target, position);
  const distance = vectorLength(direction);
  if (!(distance > EPSILON)) {
    throw new RangeError(
      "O alvo da câmera precisa diferir de sua posição."
    );
  }
  return normalizeNavigationCamera({
    ...camera,
    position,
    quaternion: lookAtQuaternion(
      position,
      target,
      args.up ?? [0, 1, 0]
    ),
    focusDistance: distance,
    fov: args.fov ?? camera.fov,
    near: args.near ?? camera.near,
    far: args.far ?? camera.far
  });
}

function orbitCamera(camera, args) {
  const target = finiteVector(
    args.target ?? cameraTarget(camera),
    3,
    "target"
  );
  let offset = subtract(camera.position, target);
  const currentDistance = vectorLength(offset);
  if (!(currentDistance > EPSILON)) {
    throw new RangeError("Órbita exige câmera separada do alvo.");
  }

  const yaw = finiteNumber(args.yawDegrees ?? 0, "yawDegrees") * DEG_TO_RAD;
  const pitch =
    finiteNumber(args.pitchDegrees ?? 0, "pitchDegrees") * DEG_TO_RAD;
  offset = rotateAroundAxis(offset, [0, 1, 0], yaw);
  const forward = scale(normalize(offset), -1);
  let right = cross(forward, [0, 1, 0]);
  if (vectorLength(right) <= EPSILON) right = [1, 0, 0];
  offset = rotateAroundAxis(offset, normalize(right), pitch);
  const distance = args.distance === undefined
    ? currentDistance
    : positiveNumber(args.distance, "distance");
  offset = scale(normalize(offset), distance);
  return lookAt(camera, {
    position: add(target, offset),
    target
  });
}

function frameCamera(camera, rawBounds, args) {
  if (!rawBounds) {
    throw new Error("Não há seleção renderizável para enquadrar.");
  }
  const bounds = objectValue(rawBounds, "Limites da seleção");
  const min = finiteVector(bounds.min, 3, "bounds.min");
  const max = finiteVector(bounds.max, 3, "bounds.max");
  const center = scale(add(min, max), 0.5);
  const radius = Math.max(
    vectorLength(scale(subtract(max, min), 0.5)),
    0.001
  );
  const padding = positiveNumber(args.padding ?? 1.2, "padding");
  const verticalHalf = camera.fov * DEG_TO_RAD * 0.5;
  const horizontalHalf = Math.atan(
    Math.tan(verticalHalf) * camera.aspect
  );
  const limitingHalf = Math.min(verticalHalf, horizontalHalf);
  const distance = Math.max(
    radius * padding / Math.sin(limitingHalf),
    camera.near * 2
  );
  const backward = scale(
    rotateVector([0, 0, 1], camera.quaternion),
    distance
  );
  return lookAt(camera, {
    position: add(center, backward),
    target: center
  });
}

function interpolateCamera(camera, args) {
  const from = normalizeNavigationCamera(args.from ?? camera, camera);
  const to = normalizeNavigationCamera(args.to, camera);
  const alpha = rangedNumber(args.alpha, 0, 1, "alpha");
  return normalizeNavigationCamera({
    position: lerpVector(from.position, to.position, alpha),
    quaternion: slerp(from.quaternion, to.quaternion, alpha),
    focusDistance: lerp(from.focusDistance, to.focusDistance, alpha),
    fov: lerp(from.fov, to.fov, alpha),
    near: lerp(from.near, to.near, alpha),
    far: lerp(from.far, to.far, alpha),
    aspect: lerp(from.aspect, to.aspect, alpha)
  });
}

function cameraTarget(camera) {
  const forward = rotateVector([0, 0, -1], camera.quaternion);
  return add(camera.position, scale(forward, camera.focusDistance));
}

function lookAtQuaternion(position, target, rawUp) {
  const forward = normalize(subtract(target, position));
  let up = normalize(finiteVector(rawUp, 3, "up"));
  let right = cross(forward, up);
  if (vectorLength(right) <= EPSILON) {
    up = Math.abs(forward[1]) < 0.999
      ? [0, 1, 0]
      : [0, 0, 1];
    right = cross(forward, up);
  }
  right = normalize(right);
  const correctedUp = normalize(cross(right, forward));
  return quaternionFromRotationMatrix([
    right[0], correctedUp[0], -forward[0],
    right[1], correctedUp[1], -forward[1],
    right[2], correctedUp[2], -forward[2]
  ]);
}

function quaternionFromRotationMatrix(matrix) {
  const [m00, m01, m02, m10, m11, m12, m20, m21, m22] = matrix;
  const trace = m00 + m11 + m22;
  let quaternion;

  if (trace > 0) {
    const s = Math.sqrt(trace + 1) * 2;
    quaternion = [
      (m21 - m12) / s,
      (m02 - m20) / s,
      (m10 - m01) / s,
      0.25 * s
    ];
  } else if (m00 > m11 && m00 > m22) {
    const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
    quaternion = [
      0.25 * s,
      (m01 + m10) / s,
      (m02 + m20) / s,
      (m21 - m12) / s
    ];
  } else if (m11 > m22) {
    const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
    quaternion = [
      (m01 + m10) / s,
      0.25 * s,
      (m12 + m21) / s,
      (m02 - m20) / s
    ];
  } else {
    const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
    quaternion = [
      (m02 + m20) / s,
      (m12 + m21) / s,
      0.25 * s,
      (m10 - m01) / s
    ];
  }

  return normalizedQuaternion(quaternion, "quaternion");
}

function rotateAroundAxis(vector, axis, angle) {
  const half = angle * 0.5;
  const sine = Math.sin(half);
  return rotateVector(vector, [
    axis[0] * sine,
    axis[1] * sine,
    axis[2] * sine,
    Math.cos(half)
  ]);
}

function rotateVector(vector, quaternion) {
  const [x, y, z] = vector;
  const [qx, qy, qz, qw] = quaternion;
  const ix = qw * x + qy * z - qz * y;
  const iy = qw * y + qz * x - qx * z;
  const iz = qw * z + qx * y - qy * x;
  const iw = -qx * x - qy * y - qz * z;
  return [
    ix * qw + iw * -qx + iy * -qz - iz * -qy,
    iy * qw + iw * -qy + iz * -qx - ix * -qz,
    iz * qw + iw * -qz + ix * -qy - iy * -qx
  ];
}

function slerp(from, to, alpha) {
  let end = [...to];
  let dot = from.reduce(
    (sum, value, index) => sum + value * end[index],
    0
  );
  if (dot < 0) {
    end = end.map(value => -value);
    dot = -dot;
  }
  if (dot > 0.9995) {
    return normalizedQuaternion(
      from.map((value, index) =>
        lerp(value, end[index], alpha)
      ),
      "quaternion"
    );
  }
  const theta = Math.acos(Math.min(1, dot));
  const sine = Math.sin(theta);
  const a = Math.sin((1 - alpha) * theta) / sine;
  const b = Math.sin(alpha * theta) / sine;
  return from.map((value, index) => value * a + end[index] * b);
}

function normalizedQuaternion(value, label) {
  const quaternion = finiteVector(value, 4, label);
  const length = vectorLength(quaternion);
  if (!(length > EPSILON)) {
    throw new RangeError(`${label} não pode ser nulo.`);
  }
  return quaternion.map(component => component / length);
}

function finiteVector(value, length, label) {
  if (!Array.isArray(value) || value.length !== length) {
    throw new TypeError(`${label} deve conter ${length} números.`);
  }
  return value.map(component => finiteNumber(component, label));
}

function finiteNumber(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new TypeError(`${label} precisa ser número finito.`);
  }
  return number;
}

function positiveNumber(value, label) {
  const number = finiteNumber(value, label);
  if (!(number > 0)) {
    throw new RangeError(`${label} precisa ser maior que zero.`);
  }
  return number;
}

function rangedNumber(value, minimum, maximum, label) {
  const number = finiteNumber(value, label);
  if (number < minimum || number > maximum) {
    throw new RangeError(
      `${label} precisa estar entre ${minimum} e ${maximum}.`
    );
  }
  return number;
}

function objectValue(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} deve formar um objeto.`);
  }
  return value;
}

function sameCamera(left, right) {
  const a = normalizeNavigationCamera(left);
  const b = normalizeNavigationCamera(right);
  return [
    ...a.position,
    ...a.quaternion,
    a.focusDistance,
    a.fov,
    a.near,
    a.far,
    a.aspect
  ].every((value, index) =>
    Math.abs(value - [
      ...b.position,
      ...b.quaternion,
      b.focusDistance,
      b.fov,
      b.near,
      b.far,
      b.aspect
    ][index]) <= EPSILON
  );
}

function add(left, right) {
  return left.map((value, index) => value + right[index]);
}

function subtract(left, right) {
  return left.map((value, index) => value - right[index]);
}

function scale(vector, factor) {
  return vector.map(value => value * factor);
}

function cross(left, right) {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0]
  ];
}

function vectorLength(vector) {
  return Math.hypot(...vector);
}

function normalize(vector) {
  const length = vectorLength(vector);
  if (!(length > EPSILON)) {
    throw new RangeError("Vetor não pode ser nulo.");
  }
  return scale(vector, 1 / length);
}

function lerp(from, to, alpha) {
  return from + (to - from) * alpha;
}

function lerpVector(from, to, alpha) {
  return from.map((value, index) => lerp(value, to[index], alpha));
}

function deepFreeze(value, visited = new WeakSet()) {
  if (!value || typeof value !== "object" || visited.has(value)) return value;
  visited.add(value);
  for (const child of Object.values(value)) deepFreeze(child, visited);
  return Object.freeze(value);
}
