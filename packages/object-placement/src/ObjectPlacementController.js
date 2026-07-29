import * as THREE from "three";

const DEFAULTS = Object.freeze({
  color: "#6699cc",
  surface: true,
  continuous: false,
  orientationMode: "frame",
  positionMode: "pointer",
  rotation: [0, 0, 0, 1],
  referencePosition: [0, 0, 0]
});

export class ObjectPlacementController {
  static apiVersion = "object-placement-controller-v1";

  #active = null;
  #listeners = new Set();
  #preview = null;

  constructor({
    renderer,
    geometryRegistry,
    createObject,
    onCompleted = () => {},
    onEnded = () => {}
  }) {
    if (!renderer?.resolvePointerPlacement || !renderer?.scene) {
      throw new TypeError("ObjectPlacementController exige renderer compatível.");
    }
    if (!geometryRegistry?.normalize || !geometryRegistry?.create) {
      throw new TypeError("ObjectPlacementController exige registro geométrico.");
    }
    if (typeof createObject !== "function") {
      throw new TypeError("ObjectPlacementController exige comando de criação.");
    }
    this.renderer = renderer;
    this.geometryRegistry = geometryRegistry;
    this.createObject = createObject;
    this.onCompleted = onCompleted;
    this.onEnded = onEnded;
    this.#bind(true);
  }

  get active() { return Boolean(this.#active); }

  begin(options = {}) {
    if (this.#active) this.cancel();
    const settings = normalizeSettings({ ...DEFAULTS, ...options }, this.geometryRegistry);
    const geometry = this.geometryRegistry.create(settings.geometry);
    const material = new THREE.MeshBasicMaterial({
      color: settings.color,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    const preview = new THREE.Mesh(geometry, material);
    preview.name = "object-placement-preview";
    preview.visible = false;
    preview.renderOrder = 1400;
    this.renderer.scene.add(preview);
    this.#preview = preview;
    this.#active = {
      settings,
      previousTool: this.renderer.editorState?.snapshot?.().tool?.mode ?? "select",
      previousOrbitEnabled: this.renderer.orbit.enabled,
      navigationToken:
        this.renderer.acquireToolGestureNavigation?.("object-placement") ?? null,
      pointerId: null,
      pointerType: null,
      lastPlacement: null,
      lastResult: null,
      error: null
    };
    this.renderer.setTransformMode("navigate");
    if (!this.#active.navigationToken) {
      this.renderer.orbit.enabled = false;
    }
    this.#notify();
    return this.status();
  }

  cancel() {
    if (!this.#active) return this.status();
    this.#finish({ restoreTool: true });
    this.#active = null;
    this.#disposePreview();
    this.onEnded({ reason: "cancel" });
    this.#notify();
    return this.status();
  }

  status() {
    const active = this.#active;
    return Object.freeze({
      active: Boolean(active),
      settings: active
        ? Object.freeze(structuredClone(active.settings))
        : null,
      placement: active?.lastPlacement
        ? Object.freeze(structuredClone(active.lastPlacement))
        : null,
      lastResult: active?.lastResult ?? null,
      error: active?.error ?? null
    });
  }

  setContinuous(enabled) {
    if (!this.#active) return this.status();
    this.#active.settings = Object.freeze({
      ...this.#active.settings,
      continuous: Boolean(enabled)
    });
    this.#notify();
    return this.status();
  }

  subscribe(listener) {
    if (typeof listener !== "function") {
      throw new TypeError("Listener de posicionamento deve ser função.");
    }
    this.#listeners.add(listener);
    listener(this.status());
    return () => this.#listeners.delete(listener);
  }

  dispose() {
    this.cancel();
    this.#bind(false);
    this.#listeners.clear();
  }

  #onPointerMove = event => {
    if (!this.#active) return;
    if (this.renderer.isToolNavigationGesture?.(event)) {
      this.#cancelPointer();
      return;
    }
    if (this.#active.pointerId !== null &&
        event.pointerId !== this.#active.pointerId) {
      return;
    }
    const placement = this.#resolve(event);
    if (!placement) return;
    this.#active.lastPlacement = placement;
    this.#updatePreview(placement);
    this.#notify();
  };

  #onPointerDown = event => {
    if (!this.#active) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (this.renderer.isToolNavigationGesture?.(event)) {
      this.#cancelPointer();
      return;
    }
    const placement = this.#resolve(event);
    if (!placement) return;
    event.preventDefault();
    const active = this.#active;
    if (event.pointerType !== "touch") {
      event.stopImmediatePropagation();
      this.renderer.canvas.setPointerCapture?.(event.pointerId);
    }
    active.pointerId = event.pointerId;
    active.pointerType = event.pointerType || "mouse";
    active.lastPlacement = placement;
    this.#updatePreview(placement);
    this.#notify();
  };

  #onPointerUp = event => {
    const active = this.#active;
    if (!active) return;
    if (this.renderer.isToolNavigationGesture?.(event)) {
      this.#cancelPointer();
      return;
    }
    if (event.pointerId !== active.pointerId) return;
    event.preventDefault();
    if (event.pointerType !== "touch") {
      event.stopImmediatePropagation();
      this.renderer.canvas.releasePointerCapture?.(event.pointerId);
    }
    const placement = this.#resolve(event) ?? active.lastPlacement;
    active.pointerId = null;
    active.pointerType = null;
    if (!placement) return;
    try {
      const result = this.createObject({
        name: active.settings.name,
        geometry: active.settings.geometry,
        position: placement.position,
        rotation: placement.rotation,
        color: active.settings.color,
        materialPatch: active.settings.materialPatch
      });
      active.lastResult = result;
      active.error = null;
      this.onCompleted({
        result,
        settings: structuredClone(active.settings),
        placement: structuredClone(placement)
      });
      if (!active.settings.continuous) {
        this.#finish({ restoreTool: true });
        this.#active = null;
        this.#disposePreview();
        this.onEnded({ reason: "completed" });
      }
    } catch (error) {
      active.error = error.message;
    }
    this.#notify();
  };

  #onPointerCancel = event => {
    const active = this.#active;
    if (!active || event.pointerId !== active.pointerId) return;
    event.preventDefault();
    this.#cancelPointer();
  };

  #cancelPointer() {
    const active = this.#active;
    if (!active) return;
    if (active.pointerId !== null && active.pointerType !== "touch") {
      this.renderer.canvas.releasePointerCapture?.(active.pointerId);
    }
    active.pointerId = null;
    active.pointerType = null;
    active.lastPlacement = null;
    if (this.#preview) this.#preview.visible = false;
    this.#notify();
  }

  #onKeyDown = event => {
    if (!this.#active || event.key !== "Escape") return;
    event.preventDefault();
    this.cancel();
  };

  #resolve(event) {
    const active = this.#active;
    const pointerPlacement = this.renderer.resolvePointerPlacement({
      clientX: event.clientX,
      clientY: event.clientY,
      plane: this.renderer.getEditPlane?.(),
      surface: active.settings.surface
    });
    if (!pointerPlacement) return null;
    const position = active.settings.positionMode === "reference"
      ? [...active.settings.referencePosition]
      : [...pointerPlacement.point];
    const rotation = resolveRotation({
      settings: active.settings,
      placement: pointerPlacement,
      frame: this.renderer.getEditPlane?.() ?? this.renderer.readViewerReferenceFrame()
    });
    return Object.freeze({
      position: Object.freeze(position),
      rotation: Object.freeze(rotation),
      source: pointerPlacement.source,
      normal: pointerPlacement.normal
    });
  }

  #updatePreview(placement) {
    if (!this.#preview) return;
    this.#preview.position.fromArray(placement.position);
    this.#preview.quaternion.fromArray(placement.rotation);
    this.#preview.visible = true;
  }

  #finish({ restoreTool }) {
    const active = this.#active;
    if (!active) return;
    if (active.pointerId !== null && active.pointerType !== "touch") {
      this.renderer.canvas.releasePointerCapture?.(active.pointerId);
    }
    if (active.navigationToken) {
      this.renderer.releaseToolGestureNavigation?.(active.navigationToken);
      active.navigationToken = null;
    } else {
      this.renderer.orbit.enabled = active.previousOrbitEnabled;
    }
    if (restoreTool) this.renderer.setTransformMode(active.previousTool);
  }

  #disposePreview() {
    if (!this.#preview) return;
    this.renderer.scene.remove(this.#preview);
    this.#preview.geometry.dispose();
    this.#preview.material.dispose();
    this.#preview = null;
  }

  #notify() {
    if (!this.#listeners.size) return;
    const snapshot = this.status();
    for (const listener of [...this.#listeners]) listener(snapshot);
  }

  #bind(enabled) {
    const method = enabled ? "addEventListener" : "removeEventListener";
    this.renderer.canvas[method]("pointermove", this.#onPointerMove, true);
    this.renderer.canvas[method]("pointerdown", this.#onPointerDown, true);
    this.renderer.canvas[method]("pointerup", this.#onPointerUp, true);
    this.renderer.canvas[method]("pointercancel", this.#onPointerCancel, true);
    globalThis[method]?.("keydown", this.#onKeyDown, true);
  }
}

function normalizeSettings(value, registry) {
  const orientationMode = oneOf(
    value.orientationMode,
    ["frame", "surface-normal", "reference"],
    "orientação"
  );
  const positionMode = oneOf(
    value.positionMode,
    ["pointer", "reference"],
    "posição"
  );
  return Object.freeze({
    name: value.name ? String(value.name) : null,
    geometry: registry.normalize(value.geometry),
    color: String(value.color ?? DEFAULTS.color),
    surface: value.surface !== false,
    continuous: Boolean(value.continuous),
    orientationMode,
    positionMode,
    rotation: vector(value.rotation ?? DEFAULTS.rotation, 4, "rotação"),
    referencePosition: vector(
      value.referencePosition ?? DEFAULTS.referencePosition,
      3,
      "posição de referência"
    ),
    materialPatch: value.materialPatch && typeof value.materialPatch === "object"
      ? structuredClone(value.materialPatch)
      : null
  });
}

function resolveRotation({ settings, placement, frame }) {
  if (settings.orientationMode === "reference") {
    return [...settings.rotation];
  }
  if (settings.orientationMode === "surface-normal" && placement.normal) {
    return new THREE.Quaternion()
      .setFromUnitVectors(
        new THREE.Vector3(0, 0, 1),
        new THREE.Vector3().fromArray(placement.normal).normalize()
      )
      .toArray();
  }
  if (Array.isArray(frame?.quaternion)) return [...frame.quaternion];
  const xAxis = new THREE.Vector3().fromArray(frame?.xAxis ?? [1, 0, 0]).normalize();
  const normal = new THREE.Vector3().fromArray(frame?.normal ?? [0, 0, 1]).normalize();
  const yAxis = normal.clone().cross(xAxis).normalize();
  return new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().makeBasis(xAxis, yAxis, normal)
  ).toArray();
}

function vector(value, length, label) {
  if (!Array.isArray(value) || value.length !== length) {
    throw new TypeError(`${label} deve conter ${length} valores.`);
  }
  const result = value.map(Number);
  if (!result.every(Number.isFinite)) {
    throw new TypeError(`${label} contém valor inválido.`);
  }
  return result;
}

function oneOf(value, allowed, label) {
  const normalized = String(value ?? allowed[0]).trim().toLowerCase();
  if (!allowed.includes(normalized)) {
    throw new RangeError(`${label} desconhecida: ${value}.`);
  }
  return normalized;
}
