import * as THREE from "three";

const SINGLE_TOUCH_DISABLED = -1;

export class ToolGestureNavigation {
  static apiVersion = "tool-gesture-navigation-v1";

  #canvas;
  #orbit;
  #camera;
  #owners = new Map();
  #touches = new Map();
  #navigationPointers = new Set();
  #previousOrbit = null;
  #threeTouchCentroid = null;
  #canRotate;
  #onCameraChanged;

  constructor({
    canvas,
    orbit,
    camera,
    canRotate = () => true,
    onCameraChanged = () => {}
  } = {}) {
    if (!canvas?.addEventListener || !canvas?.removeEventListener) {
      throw new TypeError(
        "ToolGestureNavigation exige um canvas com eventos de ponteiro."
      );
    }
    if (!orbit?.target || !orbit?.touches || !camera?.position) {
      throw new TypeError(
        "ToolGestureNavigation exige OrbitControls e câmera compatíveis."
      );
    }
    this.#canvas = canvas;
    this.#orbit = orbit;
    this.#camera = camera;
    this.#canRotate =
      typeof canRotate === "function" ? canRotate : () => true;
    this.#onCameraChanged =
      typeof onCameraChanged === "function"
        ? onCameraChanged
        : () => {};
    this.#bind(true);
  }

  get active() {
    return this.#owners.size > 0;
  }

  acquire(owner = "interactive-tool") {
    const token = Object.freeze({
      id: Symbol(String(owner)),
      owner: String(owner)
    });
    if (!this.#owners.size) {
      this.#previousOrbit = {
        enabled: Boolean(this.#orbit.enabled),
        one: this.#orbit.touches.ONE,
        two: this.#orbit.touches.TWO
      };
      this.#orbit.enabled = true;
      this.#orbit.touches.ONE = SINGLE_TOUCH_DISABLED;
      this.#orbit.touches.TWO = THREE.TOUCH.DOLLY_PAN;
    }
    this.#owners.set(token, token.owner);
    return token;
  }

  release(token) {
    if (!this.#owners.delete(token)) return false;
    if (this.#owners.size) return true;
    if (this.#previousOrbit) {
      this.#orbit.enabled = this.#previousOrbit.enabled;
      this.#orbit.touches.ONE = this.#previousOrbit.one;
      this.#orbit.touches.TWO = this.#previousOrbit.two;
    }
    this.#previousOrbit = null;
    this.#threeTouchCentroid = null;
    return true;
  }

  isNavigationGesture(event = null) {
    if (!this.active) return false;
    if (event && String(event.pointerType ?? "") !== "touch") {
      return false;
    }
    return this.#touches.size >= 2 ||
      (event && this.#navigationPointers.has(event.pointerId));
  }

  status() {
    const pointerCount = this.#touches.size;
    return Object.freeze({
      active: this.active,
      owners: this.#owners.size,
      pointerCount,
      mode: pointerCount >= 3
        ? "orbit"
        : pointerCount >= 2
          ? "pan-zoom"
          : "tool"
    });
  }

  dispose() {
    this.#bind(false);
    this.#owners.clear();
    this.#touches.clear();
    this.#navigationPointers.clear();
    if (this.#previousOrbit) {
      this.#orbit.enabled = this.#previousOrbit.enabled;
      this.#orbit.touches.ONE = this.#previousOrbit.one;
      this.#orbit.touches.TWO = this.#previousOrbit.two;
    }
    this.#previousOrbit = null;
    this.#threeTouchCentroid = null;
  }

  #onPointerDown = event => {
    if (String(event.pointerType ?? "") !== "touch") return;
    this.#touches.set(event.pointerId, pointerPosition(event));
    if (this.#touches.size >= 2) {
      for (const pointerId of this.#touches.keys()) {
        this.#navigationPointers.add(pointerId);
      }
    }
    this.#threeTouchCentroid = this.#touches.size >= 3
      ? centroid(this.#touches.values())
      : null;
  };

  #onPointerMove = event => {
    if (
      String(event.pointerType ?? "") !== "touch" ||
      !this.#touches.has(event.pointerId)
    ) {
      return;
    }
    this.#touches.set(event.pointerId, pointerPosition(event));
    if (!this.active || this.#touches.size < 3) return;
    const next = centroid(this.#touches.values());
    const previous = this.#threeTouchCentroid ?? next;
    this.#threeTouchCentroid = next;
    const dx = next.x - previous.x;
    const dy = next.y - previous.y;
    if ((dx || dy) && this.#canRotate()) {
      this.#orbitAroundTarget(dx, dy);
    }
    event.preventDefault?.();
    event.stopImmediatePropagation?.();
  };

  #onPointerEnd = event => {
    if (String(event.pointerType ?? "") !== "touch") return;
    this.#touches.delete(event.pointerId);
    this.#threeTouchCentroid = this.#touches.size >= 3
      ? centroid(this.#touches.values())
      : null;
    globalThis.queueMicrotask?.(() => {
      this.#navigationPointers.delete(event.pointerId);
    });
  };

  #orbitAroundTarget(dx, dy) {
    const rect = this.#canvas.getBoundingClientRect?.() ?? {
      width: globalThis.innerWidth ?? 1,
      height: globalThis.innerHeight ?? 1
    };
    const width = Math.max(1, Number(rect.width) || 1);
    const height = Math.max(1, Number(rect.height) || 1);
    const offset = this.#camera.position.clone().sub(this.#orbit.target);
    if (offset.lengthSq() <= 1e-18) return;
    const up = this.#camera.up.clone().normalize();
    const toY = new THREE.Quaternion().setFromUnitVectors(
      up,
      new THREE.Vector3(0, 1, 0)
    );
    const fromY = toY.clone().invert();
    const spherical = new THREE.Spherical().setFromVector3(
      offset.applyQuaternion(toY)
    );
    spherical.theta -= dx * Math.PI * 2 / width;
    spherical.phi -= dy * Math.PI / height;
    spherical.phi = THREE.MathUtils.clamp(
      spherical.phi,
      Number.isFinite(this.#orbit.minPolarAngle)
        ? this.#orbit.minPolarAngle
        : 0,
      Number.isFinite(this.#orbit.maxPolarAngle)
        ? this.#orbit.maxPolarAngle
        : Math.PI
    );
    spherical.makeSafe();
    offset
      .setFromSpherical(spherical)
      .applyQuaternion(fromY);
    this.#camera.position.copy(this.#orbit.target).add(offset);
    this.#camera.lookAt(this.#orbit.target);
    this.#camera.updateMatrixWorld?.(true);
    this.#orbit.update?.();
    this.#onCameraChanged();
  }

  #bind(enabled) {
    const method = enabled ? "addEventListener" : "removeEventListener";
    this.#canvas[method]("pointerdown", this.#onPointerDown, true);
    this.#canvas[method]("pointermove", this.#onPointerMove, true);
    this.#canvas[method]("pointerup", this.#onPointerEnd, true);
    this.#canvas[method]("pointercancel", this.#onPointerEnd, true);
  }
}

function pointerPosition(event) {
  return Object.freeze({
    x: Number(event.clientX ?? event.pageX ?? 0),
    y: Number(event.clientY ?? event.pageY ?? 0)
  });
}

function centroid(points) {
  const values = [...points];
  const total = values.reduce(
    (result, point) => ({
      x: result.x + point.x,
      y: result.y + point.y
    }),
    { x: 0, y: 0 }
  );
  return Object.freeze({
    x: total.x / Math.max(1, values.length),
    y: total.y / Math.max(1, values.length)
  });
}
