import * as THREE from "three";

const SINGLE_TOUCH_DISABLED = -1;
const WORLD_UP = new THREE.Vector3(0, 1, 0);

export class ToolGestureNavigation {
  static apiVersion = "tool-gesture-navigation-v3";

  #canvas;
  #orbit;
  #camera;
  #owners = new Map();
  #touches = new Map();
  #navigationPointers = new Set();
  #previousOrbit = null;
  #threeTouchX = 0;
  #threeTouchY = 0;
  #hasThreeTouchCentroid = false;
  #pendingOrbitX = 0;
  #pendingOrbitY = 0;
  #orbitFrame = null;
  #canRotate;
  #onCameraChanged;
  #offset = new THREE.Vector3();
  #up = new THREE.Vector3();
  #toY = new THREE.Quaternion();
  #fromY = new THREE.Quaternion();
  #spherical = new THREE.Spherical();

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
    this.#cancelOrbitFrame();
    if (this.#previousOrbit) {
      this.#orbit.enabled = this.#previousOrbit.enabled;
      this.#orbit.touches.ONE = this.#previousOrbit.one;
      this.#orbit.touches.TWO = this.#previousOrbit.two;
    }
    this.#previousOrbit = null;
    this.#hasThreeTouchCentroid = false;
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
    this.#cancelOrbitFrame();
    this.#owners.clear();
    this.#touches.clear();
    this.#navigationPointers.clear();
    if (this.#previousOrbit) {
      this.#orbit.enabled = this.#previousOrbit.enabled;
      this.#orbit.touches.ONE = this.#previousOrbit.one;
      this.#orbit.touches.TWO = this.#previousOrbit.two;
    }
    this.#previousOrbit = null;
    this.#hasThreeTouchCentroid = false;
  }

  #onPointerDown = event => {
    if (String(event.pointerType ?? "") !== "touch") return;
    const position = this.#touches.get(event.pointerId) ?? { x: 0, y: 0 };
    updatePointerPosition(position, event);
    this.#touches.set(event.pointerId, position);
    if (this.#touches.size >= 2) {
      for (const pointerId of this.#touches.keys()) {
        this.#navigationPointers.add(pointerId);
      }
    }
    this.#captureCentroid();
  };

  #onPointerMove = event => {
    if (
      String(event.pointerType ?? "") !== "touch" ||
      !this.#touches.has(event.pointerId)
    ) {
      return;
    }
    updatePointerPosition(this.#touches.get(event.pointerId), event);
    if (!this.active || this.#touches.size < 3) return;

    let x = 0;
    let y = 0;
    for (const point of this.#touches.values()) {
      x += point.x;
      y += point.y;
    }
    const count = Math.max(1, this.#touches.size);
    x /= count;
    y /= count;
    const previousX = this.#hasThreeTouchCentroid ? this.#threeTouchX : x;
    const previousY = this.#hasThreeTouchCentroid ? this.#threeTouchY : y;
    this.#threeTouchX = x;
    this.#threeTouchY = y;
    this.#hasThreeTouchCentroid = true;

    const dx = x - previousX;
    const dy = y - previousY;
    if ((dx || dy) && this.#canRotate()) {
      this.#pendingOrbitX += dx;
      this.#pendingOrbitY += dy;
      /* O gesto precisa mover a câmera no próprio pointermove; adiar para o
         próximo frame fazia a ferramenta consumir o estado ainda antigo. */
      this.#flushOrbitFrame();
    }
    event.preventDefault?.();
    event.stopImmediatePropagation?.();
  };

  #onPointerEnd = event => {
    if (String(event.pointerType ?? "") !== "touch") return;
    this.#touches.delete(event.pointerId);
    if (this.#touches.size < 3) {
      this.#hasThreeTouchCentroid = false;
      this.#cancelOrbitFrame();
    } else {
      this.#captureCentroid();
    }
    const releasePointer = () => {
      this.#navigationPointers.delete(event.pointerId);
    };
    if (typeof globalThis.queueMicrotask === "function") {
      globalThis.queueMicrotask(releasePointer);
    } else {
      Promise.resolve().then(releasePointer);
    }
  };

  #captureCentroid() {
    if (this.#touches.size < 3) {
      this.#hasThreeTouchCentroid = false;
      return;
    }
    let x = 0;
    let y = 0;
    for (const point of this.#touches.values()) {
      x += point.x;
      y += point.y;
    }
    const count = Math.max(1, this.#touches.size);
    this.#threeTouchX = x / count;
    this.#threeTouchY = y / count;
    this.#hasThreeTouchCentroid = true;
  }

  #scheduleOrbitFrame() {
    if (this.#orbitFrame !== null) return;
    if (typeof globalThis.requestAnimationFrame !== "function") {
      this.#flushOrbitFrame();
      return;
    }
    this.#orbitFrame = globalThis.requestAnimationFrame(() => {
      this.#orbitFrame = null;
      this.#flushOrbitFrame();
    });
  }

  #flushOrbitFrame() {
    const dx = this.#pendingOrbitX;
    const dy = this.#pendingOrbitY;
    this.#pendingOrbitX = 0;
    this.#pendingOrbitY = 0;
    if (!dx && !dy) return;
    this.#orbitAroundTarget(dx, dy);
  }

  #cancelOrbitFrame() {
    if (
      this.#orbitFrame !== null &&
      typeof globalThis.cancelAnimationFrame === "function"
    ) {
      globalThis.cancelAnimationFrame(this.#orbitFrame);
    }
    this.#orbitFrame = null;
    this.#pendingOrbitX = 0;
    this.#pendingOrbitY = 0;
  }

  #orbitAroundTarget(dx, dy) {
    const rect = this.#canvas.getBoundingClientRect?.() ?? {
      width: globalThis.innerWidth ?? 1,
      height: globalThis.innerHeight ?? 1
    };
    const width = Math.max(1, Number(rect.width) || 1);
    const height = Math.max(1, Number(rect.height) || 1);
    const offset = this.#offset
      .copy(this.#camera.position)
      .sub(this.#orbit.target);
    if (offset.lengthSq() <= 1e-18) return;
    const up = this.#up.copy(this.#camera.up).normalize();
    this.#toY.setFromUnitVectors(up, WORLD_UP);
    this.#fromY.copy(this.#toY).invert();
    const spherical = this.#spherical.setFromVector3(
      offset.applyQuaternion(this.#toY)
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
      .applyQuaternion(this.#fromY);
    this.#camera.position.copy(this.#orbit.target).add(offset);
    this.#camera.lookAt(this.#orbit.target);
    this.#camera.updateMatrixWorld?.(true);
    this.#onCameraChanged();
    this.#orbit.update?.();
  }

  #bind(enabled) {
    const method = enabled ? "addEventListener" : "removeEventListener";
    this.#canvas[method]("pointerdown", this.#onPointerDown, true);
    this.#canvas[method]("pointermove", this.#onPointerMove, true);
    this.#canvas[method]("pointerup", this.#onPointerEnd, true);
    this.#canvas[method]("pointercancel", this.#onPointerEnd, true);
  }
}

function updatePointerPosition(target, event) {
  target.x = Number(event.clientX ?? event.pageX ?? 0);
  target.y = Number(event.clientY ?? event.pageY ?? 0);
  return target;
}
