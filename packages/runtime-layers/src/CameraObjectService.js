import {
  HierarchyIndex
} from "../../scene-hierarchy/src/index.js";
import {
  decomposeTransform,
  invertAffineMatrix
} from "../../math-affine/src/index.js";
import {
  normalizeNavigationCamera
} from "./ViewerCameraController.js";

const CAMERA_KIND = "camera";

export class CameraObjectService {
  static apiVersion = "camera-object-service-v2";

  #listeners = new Set();
  #unsubscribeSandbox = () => {};
  #unsubscribeViewer = () => {};
  #unsubscribeCoordination = () => {};
  #applyingObjectCamera = false;
  #lastState = null;
  #lastViewerCamera = null;
  #allowDefaultAdoption = true;
  #pendingActivationId = null;
  #previewingActiveCamera = false;
  #diagnostics = {
    creationsRequested: 0,
    pendingActivations: 0,
    pendingActivationsResolved: 0,
    pendingActivationsRejected: 0,
    activePreviewFrames: 0,
    activePreviewRestores: 0,
    cameraRemovalEvents: 0,
    lastSandboxChangeMs: 0,
    maximumSandboxChangeMs: 0
  };

  constructor({
    sandbox,
    viewer,
    controller,
    createId = () => crypto.randomUUID()
  } = {}) {
    if (!sandbox?.getSnapshot || !sandbox?.dispatch || !sandbox?.subscribe) {
      throw new TypeError("CameraObjectService exige Sandbox.");
    }
    if (!viewer?.snapshot || !viewer?.update || !viewer?.subscribe) {
      throw new TypeError("CameraObjectService exige ViewerState.");
    }
    if (!controller?.snapshot || !controller?.execute) {
      throw new TypeError(
        "CameraObjectService exige ViewerCameraController."
      );
    }
    if (typeof createId !== "function") {
      throw new TypeError("createId deve ser função.");
    }

    this.sandbox = sandbox;
    this.viewer = viewer;
    this.controller = controller;
    this.createId = createId;
    this.#lastState = sandbox.getSnapshot();
    this.#lastViewerCamera = structuredClone(
      viewer.snapshot().camera
    );
    this.#unsubscribeViewer = viewer.subscribe(
      snapshot => this.#viewerChanged(snapshot)
    );
    this.#unsubscribeSandbox = sandbox.subscribe(
      (state, changes) => this.#sandboxChanged(state, changes)
    );
    if (typeof sandbox.subscribeCoordination === "function") {
      this.#unsubscribeCoordination = sandbox.subscribeCoordination(
        snapshot => this.#coordinationChanged(snapshot)
      );
    }
    this.#adoptDefaultIfInactive();
  }

  create({
    id = this.createId(),
    name = null,
    camera = this.controller.snapshot(),
    makeDefault = false,
    activate = true
  } = {}) {
    const normalizedId = requiredText(id, "Identificador de câmera");
    const projection = normalizeCameraObject(camera);
    this.#diagnostics.creationsRequested += 1;
    if (activate) {
      this.#pendingActivationId = normalizedId;
      this.#diagnostics.pendingActivations += 1;
    }
    let changed;
    try {
      changed = this.sandbox.dispatch({
        type: "camera.create",
        id: normalizedId,
        name: name ?? `Câmera ${this.list().cameras.length + 1}`,
        position: [...projection.position],
        rotation: [...projection.quaternion],
        camera: {
          projection: "perspective",
          fov: projection.fov,
          near: projection.near,
          far: projection.far,
          focusDistance: projection.focusDistance
        },
        makeDefault: Boolean(makeDefault)
      });
    } catch (error) {
      if (this.#pendingActivationId === normalizedId) {
        this.#pendingActivationId = null;
        this.#diagnostics.pendingActivationsRejected += 1;
      }
      throw error;
    }

    if (!changed && this.#pendingActivationId === normalizedId) {
      this.#pendingActivationId = null;
      this.#diagnostics.pendingActivationsRejected += 1;
    } else if (changed && activate) {
      this.#resolvePendingActivation();
    }
    return Object.freeze({
      changed,
      id: normalizedId,
      activationPending: this.#pendingActivationId === normalizedId,
      activeCameraId: this.viewer.snapshot().activeCameraId ?? null,
      defaultCameraId:
        this.sandbox.getSnapshot().defaultCameraId ?? null
    });
  }

  updateProjection(id, patch = {}) {
    const node = this.#cameraNode(id);
    const camera = normalizeCameraObject({
      position: node.position,
      quaternion: node.rotation,
      ...node.camera,
      ...patch
    });
    const changed = this.sandbox.dispatch({
      type: "camera.update",
      id: node.id,
      patch: {
        camera: {
          projection: "perspective",
          fov: camera.fov,
          near: camera.near,
          far: camera.far,
          focusDistance: camera.focusDistance
        }
      }
    });
    return Object.freeze({
      changed,
      id: node.id,
      camera: structuredClone(camera)
    });
  }

  captureViewer(id) {
    const node = this.#cameraNode(id);
    const camera = this.controller.snapshot();
    const local = localPoseFromWorldCamera(
      node,
      this.sandbox.getSnapshot(),
      camera
    );
    const changed = this.sandbox.dispatch({
      type: "camera.update",
      id: node.id,
      patch: {
        position: [...local.position],
        rotation: [...local.rotation],
        camera: {
          projection: "perspective",
          fov: camera.fov,
          near: camera.near,
          far: camera.far,
          focusDistance: camera.focusDistance
        }
      }
    });
    if (changed) this.activate(node.id);
    return Object.freeze({ changed, id: node.id });
  }

  activate(id) {
    const node = this.#cameraNode(id);
    const camera = cameraSnapshotFromNode(
      node,
      this.sandbox.getSnapshot(),
      this.controller.snapshot().aspect
    );
    this.#applyingObjectCamera = true;
    this.#allowDefaultAdoption = false;
    try {
      this.controller.execute("viewer.camera.restore", { camera });
      this.viewer.update({ activeCameraId: node.id });
    } finally {
      this.#applyingObjectCamera = false;
    }
    this.#notify();
    return Object.freeze({
      changed: false,
      activeCameraId: node.id,
      camera: this.controller.snapshot()
    });
  }

  deactivate() {
    this.#allowDefaultAdoption = false;
    if (!this.viewer.snapshot().activeCameraId) {
      return Object.freeze({
        changed: false,
        activeCameraId: null
      });
    }
    this.viewer.update({ activeCameraId: null });
    this.#notify();
    return Object.freeze({
      changed: false,
      activeCameraId: null
    });
  }

  setDefault(id = null) {
    const normalized = id === null || id === "" || id === "none"
      ? null
      : this.#cameraNode(id).id;
    const changed = this.sandbox.dispatch({
      type: "camera.default.set",
      id: normalized
    });
    return Object.freeze({
      changed,
      defaultCameraId:
        this.sandbox.getSnapshot().defaultCameraId ?? null
    });
  }

  list() {
    const state = this.sandbox.getSnapshot();
    const hierarchy = new HierarchyIndex(state.objects);
    const aspect = this.controller.snapshot().aspect;
    const activeCameraId =
      this.viewer.snapshot().activeCameraId ?? null;
    const defaultCameraId = state.defaultCameraId ?? null;
    const cameras = state.objects
      .filter(node => node.kind === CAMERA_KIND)
      .map(node => Object.freeze({
        id: node.id,
        name: node.name ?? node.id,
        parentId: node.parentId ?? null,
        active: node.id === activeCameraId,
        default: node.id === defaultCameraId,
        camera: cameraSnapshotFromNode(
          node,
          state,
          aspect,
          hierarchy
        )
      }));
    return Object.freeze({
      apiVersion: CameraObjectService.apiVersion,
      activeCameraId,
      pendingActivationId: this.#pendingActivationId,
      defaultCameraId,
      cameras: Object.freeze(cameras)
    });
  }

  subscribe(listener) {
    this.#listeners.add(listener);
    listener(this.list());
    return () => this.#listeners.delete(listener);
  }

  dispose() {
    this.#unsubscribeSandbox();
    this.#unsubscribeViewer();
    this.#unsubscribeCoordination();
    this.#unsubscribeSandbox = () => {};
    this.#unsubscribeViewer = () => {};
    this.#unsubscribeCoordination = () => {};
    this.#listeners.clear();
  }

  diagnostics() {
    return Object.freeze({
      ...this.#diagnostics,
      pendingActivationId: this.#pendingActivationId,
      previewingActiveCamera: this.#previewingActiveCamera
    });
  }

  applyTransformPreview(transforms = []) {
    const activeId = this.viewer.snapshot().activeCameraId ?? null;
    if (!activeId) return false;
    const transform = transforms.find(entry =>
      String(entry?.id ?? entry?.objectId ?? "") === activeId
    );
    if (!transform?.worldMatrix) return false;
    const node = this.sandbox.getSnapshot().objects.find(
      object => object.id === activeId && object.kind === CAMERA_KIND
    );
    if (!node) return false;
    const decomposed = decomposeTransform(transform.worldMatrix);
    const camera = normalizeNavigationCamera({
      position: decomposed.position,
      quaternion: decomposed.rotation,
      focusDistance: node.camera?.focusDistance,
      fov: node.camera?.fov,
      near: node.camera?.near,
      far: node.camera?.far,
      aspect: this.controller.snapshot().aspect
    });
    this.#applyingObjectCamera = true;
    this.#previewingActiveCamera = true;
    try {
      this.controller.execute("viewer.camera.restore", { camera });
    } finally {
      this.#applyingObjectCamera = false;
    }
    this.#diagnostics.activePreviewFrames += 1;
    return true;
  }

  clearTransformPreview() {
    if (!this.#previewingActiveCamera) return false;
    this.#previewingActiveCamera = false;
    const activeId = this.viewer.snapshot().activeCameraId ?? null;
    if (activeId) {
      const exists = this.sandbox.getSnapshot().objects.some(
        object => object.id === activeId && object.kind === CAMERA_KIND
      );
      if (exists) this.activate(activeId);
    }
    this.#diagnostics.activePreviewRestores += 1;
    this.#notify();
    return true;
  }

  #cameraNode(id) {
    const normalized = requiredText(id, "Identificador de câmera");
    const node = this.sandbox.getSnapshot().objects.find(
      object => object.id === normalized
    );
    if (!node || node.kind !== CAMERA_KIND) {
      throw new Error(`Câmera persistente inexistente: ${normalized}.`);
    }
    return node;
  }

  #sandboxChanged(state, changes = []) {
    const startedAt = performanceNow();
    const previousState = this.#lastState;
    this.#lastState = state;
    if (changes.some(change => change?.type === "object-deleted")) {
      this.#diagnostics.cameraRemovalEvents += changes.filter(change =>
        change?.type === "object-deleted" &&
        previousState?.objects?.some(object =>
          object.id === change.objectId && object.kind === CAMERA_KIND
        )
      ).length;
    }
    this.#resolvePendingActivation();
    if (changes.some(change =>
      [
        "initial",
        "sandbox-recovered",
        "sandbox-state-replaced"
      ].includes(change?.type)
    )) {
      this.#allowDefaultAdoption = true;
    }
    const activeId = this.viewer.snapshot().activeCameraId ?? null;
    const active = activeId
      ? state.objects.find(node =>
          node.id === activeId && node.kind === CAMERA_KIND
        )
      : null;

    if (!active) {
      if (activeId) {
        this.#allowDefaultAdoption = true;
        this.#applyingObjectCamera = true;
        try {
          this.viewer.update({ activeCameraId: null });
        } finally {
          this.#applyingObjectCamera = false;
        }
      }
      this.#adoptDefaultIfInactive();
      this.#notify();
      this.#recordSandboxChangeDuration(startedAt);
      return;
    }

    const hierarchy = new HierarchyIndex(state.objects);
    const activeLineage = new Set([
      activeId,
      ...hierarchy.ancestorsOf(activeId)
    ]);
    const affectsActive = changes.some(change =>
      [
        "initial",
        "sandbox-undo",
        "sandbox-redo",
        "sandbox-recovered",
        "sandbox-state-replaced"
      ].includes(change?.type) ||
      activeLineage.has(change?.objectId) ||
      change?.type === "camera-default-changed"
    );
    if (affectsActive) this.activate(activeId);
    else this.#notify();
    this.#recordSandboxChangeDuration(startedAt);
  }

  #coordinationChanged(snapshot = {}) {
    if (!this.#pendingActivationId) return;
    if (this.#resolvePendingActivation()) return;
    const outcome = snapshot.lastOutcome;
    if (
      Number(snapshot.pendingIntents ?? 0) === 0 &&
      outcome &&
      outcome.status !== "queued"
    ) {
      this.#pendingActivationId = null;
      this.#diagnostics.pendingActivationsRejected += 1;
      this.#notify();
    }
  }

  #resolvePendingActivation() {
    const id = this.#pendingActivationId;
    if (!id) return false;
    const exists = this.sandbox.getSnapshot().objects.some(
      object => object.id === id && object.kind === CAMERA_KIND
    );
    if (!exists) return false;
    this.#pendingActivationId = null;
    this.#diagnostics.pendingActivationsResolved += 1;
    this.activate(id);
    return true;
  }

  #recordSandboxChangeDuration(startedAt) {
    const elapsed = performanceNow() - startedAt;
    this.#diagnostics.lastSandboxChangeMs = elapsed;
    this.#diagnostics.maximumSandboxChangeMs = Math.max(
      this.#diagnostics.maximumSandboxChangeMs,
      elapsed
    );
  }

  #viewerChanged(snapshot) {
    const cameraChanged = !sameValue(
      snapshot.camera,
      this.#lastViewerCamera
    );
    this.#lastViewerCamera = structuredClone(snapshot.camera);
    if (this.#applyingObjectCamera || !cameraChanged) return;
    if (!snapshot.activeCameraId) return;
    this.viewer.update({ activeCameraId: null });
    this.#notify();
  }

  #adoptDefaultIfInactive() {
    if (!this.#allowDefaultAdoption) return false;
    this.#allowDefaultAdoption = false;
    if (this.viewer.snapshot().activeCameraId) return false;
    const state = this.#lastState ?? this.sandbox.getSnapshot();
    const id = state.defaultCameraId ?? null;
    if (!id) return false;
    const camera = state.objects.find(
      node => node.id === id && node.kind === CAMERA_KIND
    );
    if (!camera) return false;
    this.activate(id);
    return true;
  }

  #notify() {
    const snapshot = this.list();
    for (const listener of [...this.#listeners]) {
      try {
        listener(snapshot);
      } catch (error) {
        console.error("CameraObjectService subscriber failed", error);
      }
    }
  }
}

export function normalizeCameraObject(value = {}) {
  return normalizeNavigationCamera({
    position: value.position,
    quaternion: value.quaternion ?? value.rotation,
    focusDistance: value.focusDistance,
    fov: value.fov,
    near: value.near,
    far: value.far,
    aspect: value.aspect ?? 1
  });
}

export function cameraSnapshotFromNode(
  node,
  state,
  aspect = 1,
  hierarchy = new HierarchyIndex(state.objects)
) {
  if (!node || node.kind !== CAMERA_KIND) {
    throw new TypeError("Nó não representa câmera persistente.");
  }
  const world = hierarchy.worldMatrixOf(node.id);
  const quaternion = worldQuaternion(hierarchy, node.id);
  return normalizeNavigationCamera({
    position: [world[12], world[13], world[14]],
    quaternion,
    focusDistance: node.camera?.focusDistance,
    fov: node.camera?.fov,
    near: node.camera?.near,
    far: node.camera?.far,
    aspect
  });
}

function worldQuaternion(hierarchy, id) {
  const lineage = [id, ...hierarchy.ancestorsOf(id)].reverse();
  let result = [0, 0, 0, 1];
  for (const nodeId of lineage) {
    result = multiplyQuaternions(
      result,
      hierarchy.node(nodeId).rotation ?? [0, 0, 0, 1]
    );
  }
  const length = Math.hypot(...result);
  return length > 1e-12
    ? result.map(value => value / length)
    : [0, 0, 0, 1];
}

function localPoseFromWorldCamera(node, state, camera) {
  const hierarchy = new HierarchyIndex(state.objects);
  const parentId = hierarchy.parentOf(node.id);
  if (parentId === null) {
    return Object.freeze({
      position: Object.freeze([...camera.position]),
      rotation: Object.freeze([...camera.quaternion])
    });
  }
  const inverseParent = invertAffineMatrix(
    hierarchy.worldMatrixOf(parentId)
  );
  const [x, y, z] = camera.position.map(Number);
  const parentQuaternion = worldQuaternion(hierarchy, parentId);
  return Object.freeze({
    position: Object.freeze([
      inverseParent[0] * x +
        inverseParent[4] * y +
        inverseParent[8] * z +
        inverseParent[12],
      inverseParent[1] * x +
        inverseParent[5] * y +
        inverseParent[9] * z +
        inverseParent[13],
      inverseParent[2] * x +
        inverseParent[6] * y +
        inverseParent[10] * z +
        inverseParent[14]
    ]),
    rotation: Object.freeze(normalizeQuaternion(
      multiplyQuaternions(
        conjugateQuaternion(parentQuaternion),
        camera.quaternion
      )
    ))
  });
}

function multiplyQuaternions(left, right) {
  const [ax, ay, az, aw] = left.map(Number);
  const [bx, by, bz, bw] = right.map(Number);
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz
  ];
}

function conjugateQuaternion(value) {
  const [x, y, z, w] = value.map(Number);
  return [-x, -y, -z, w];
}

function normalizeQuaternion(value) {
  const length = Math.hypot(...value);
  return length > 1e-12
    ? value.map(component => component / length)
    : [0, 0, 0, 1];
}

function requiredText(value, label) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new TypeError(`${label} deve ser texto não vazio.`);
  return normalized;
}

function sameValue(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function performanceNow() {
  return typeof globalThis.performance?.now === "function"
    ? globalThis.performance.now()
    : Date.now();
}
