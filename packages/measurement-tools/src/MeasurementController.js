import * as THREE from "three";
import {
  normalizePlanarFrame
} from "../../edit-context/src/PlanarFrame.js?build=20260730-0040e";
import {
  constrainPlanarPoint
} from "../../planar-authoring/src/PlanarConstraints.js?build=20260730-0040e";

const MODES = Object.freeze(["ruler", "protractor"]);

export class MeasurementController {
  static apiVersion = "measurement-controller-v2";

  #active = null;
  #listeners = new Set();
  #overlay;
  #renderFrame = null;

  constructor({ renderer } = {}) {
    if (!renderer?.canvas || !renderer?.scene ||
        !renderer?.resolvePointerPlacement) {
      throw new TypeError(
        "MeasurementController exige renderer com plano de posicionamento."
      );
    }
    this.renderer = renderer;
    this.#overlay = createOverlay();
    renderer.scene.add(this.#overlay);
    this.#bind(true);
  }

  get active() {
    return Boolean(this.#active);
  }

  begin({ mode = "ruler", frame = null } = {}) {
    if (this.#active) this.cancel();
    const normalizedMode = String(mode ?? "ruler").trim().toLowerCase();
    if (!MODES.includes(normalizedMode)) {
      throw new RangeError(`Ferramenta de medição desconhecida: ${mode}.`);
    }
    const resolvedFrame = normalizePlanarFrame(
      frame ??
      this.renderer.getDrawingPlane?.() ??
      this.renderer.getEditPlane?.() ??
      this.renderer.readViewerReferenceFrame()
    );
    this.#active = {
      mode: normalizedMode,
      frame: resolvedFrame,
      points: [],
      hover: null,
      pointerId: null,
      pointerType: null,
      result: null,
      previousTool:
        this.renderer.editorState?.snapshot?.().tool?.mode ?? "select",
      previousOrbitEnabled: Boolean(this.renderer.orbit?.enabled),
      navigationToken:
        this.renderer.acquireToolGestureNavigation?.(
          `measurement:${normalizedMode}`
        ) ?? null
    };
    this.renderer.setTransformMode?.("navigate");
    if (!this.#active.navigationToken && this.renderer.orbit) {
      this.renderer.orbit.enabled = false;
    }
    this.#renderNow();
    this.#notify();
    return this.status();
  }

  clear() {
    const active = this.#active;
    if (!active) return this.status();
    const changed =
      active.pointerId !== null ||
      active.points.length > 0 ||
      active.hover !== null ||
      active.result !== null;
    if (!changed) return this.status();
    this.#cancelPointer();
    active.points = [];
    active.hover = null;
    active.result = null;
    this.#renderNow();
    this.#notify();
    return this.status();
  }

  cancelDraft() {
    const active = this.#active;
    if (!active) return this.status();
    const changed =
      active.pointerId !== null ||
      active.points.length > 0 ||
      active.hover !== null;
    if (!changed) return this.status();
    this.#cancelPointer();
    active.points = [];
    active.hover = null;
    this.#renderNow();
    this.#notify();
    return this.status();
  }

  cancel() {
    const active = this.#active;
    if (!active) return this.status();
    this.#cancelPointer();
    if (active.navigationToken) {
      this.renderer.releaseToolGestureNavigation?.(active.navigationToken);
      active.navigationToken = null;
    } else if (this.renderer.orbit) {
      this.renderer.orbit.enabled = active.previousOrbitEnabled;
    }
    this.renderer.setTransformMode?.(active.previousTool);
    this.#active = null;
    this.#overlay.visible = false;
    this.renderer.invalidateRender?.("measurement-overlay-clear");
    this.#notify();
    return this.status();
  }

  status() {
    const active = this.#active;
    return Object.freeze({
      active: Boolean(active),
      mode: active?.mode ?? null,
      pointCount: active?.points.length ?? 0,
      drawing: Boolean(active?.pointerId !== null || active?.points.length),
      frame: active
        ? Object.freeze(structuredClone(active.frame))
        : null,
      result: active?.result
        ? Object.freeze(structuredClone(active.result))
        : null,
      readout: active?.result
        ? formatMeasurementResult(active.result)
        : ""
    });
  }

  subscribe(listener) {
    if (typeof listener !== "function") {
      throw new TypeError("Listener de medição deve ser função.");
    }
    this.#listeners.add(listener);
    listener(this.status());
    return () => this.#listeners.delete(listener);
  }

  dispose() {
    this.cancel();
    this.#cancelRenderFrame();
    this.#bind(false);
    this.renderer.scene.remove(this.#overlay);
    this.#overlay.geometry.dispose();
    this.#overlay.material.dispose();
    this.#listeners.clear();
  }

  #onPointerDown = event => {
    const active = this.#active;
    if (!active) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (this.renderer.isToolNavigationGesture?.(event)) {
      this.cancelDraft();
      return;
    }
    const point = this.#worldPoint(event);
    if (!point) return;
    event.preventDefault();
    if (event.pointerType !== "touch") {
      event.stopImmediatePropagation();
      this.renderer.canvas.setPointerCapture?.(event.pointerId);
    }
    if (active.mode === "ruler" || active.points.length >= 3) {
      active.points = [point];
      active.result = null;
    }
    active.pointerId = event.pointerId;
    active.pointerType = event.pointerType || "mouse";
    active.hover = point;
    this.#renderNow();
    this.#notify();
  };

  #onPointerMove = event => {
    const active = this.#active;
    if (!active) return;
    if (this.renderer.isToolNavigationGesture?.(event)) {
      this.cancelDraft();
      return;
    }
    if (active.pointerId !== event.pointerId) return;
    const point = this.#worldPoint(event);
    if (!point) return;
    event.preventDefault();
    if (event.pointerType !== "touch") {
      event.stopImmediatePropagation();
    }
    active.hover = point;
    this.#scheduleRender();
  };

  #onPointerUp = event => {
    const active = this.#active;
    if (!active) return;
    if (this.renderer.isToolNavigationGesture?.(event)) {
      this.cancelDraft();
      return;
    }
    if (active.pointerId !== event.pointerId) return;
    event.preventDefault();
    if (event.pointerType !== "touch") {
      event.stopImmediatePropagation();
      this.renderer.canvas.releasePointerCapture?.(event.pointerId);
    }
    const point = this.#worldPoint(event) ?? active.hover;
    active.pointerId = null;
    active.pointerType = null;
    active.hover = point;
    if (!point) {
      this.cancelDraft();
      return;
    }
    if (active.mode === "ruler") {
      active.points = [active.points[0] ?? point, point];
      active.result = measureDistance(active.points[0], active.points[1]);
    } else {
      if (!active.points.length || !near3(active.points.at(-1), point)) {
        active.points.push(point);
      }
      if (active.points.length >= 3) {
        active.result = measureAngle(
          active.points[0],
          active.points[1],
          active.points[2]
        );
      }
    }
    this.#renderNow();
    this.#notify();
  };

  #onPointerCancel = event => {
    if (!this.#active || event.pointerId !== this.#active.pointerId) return;
    event.preventDefault();
    this.cancelDraft();
  };

  #onKeyDown = event => {
    if (!this.#active || event.key !== "Escape") return;
    event.preventDefault();
    if (this.#active.points.length || this.#active.pointerId !== null) {
      this.cancelDraft();
    } else {
      this.cancel();
    }
  };

  #worldPoint(event) {
    const active = this.#active;
    const placement = this.renderer.resolvePointerPlacement({
      clientX: event.clientX,
      clientY: event.clientY,
      plane: active.frame,
      surface: false
    });
    if (!placement?.point) return null;
    const transform = this.renderer.getTransformConfig?.() ?? {};
    return [...constrainPlanarPoint({
      frame: active.frame,
      point: placement.point,
      anchor: active.points[0] ?? null,
      gridStep: transform.gridLock
        ? transform.translationSnap ?? 1
        : null,
      angleStepDegrees: transform.rotationSnapDeg,
      axes: this.renderer.getObjectTransformAxes?.() ?? {
        x: true,
        y: true
      }
    })];
  }

  #cancelPointer() {
    const active = this.#active;
    if (!active || active.pointerId === null) return false;
    if (active.pointerType !== "touch") {
      this.renderer.canvas.releasePointerCapture?.(active.pointerId);
    }
    active.pointerId = null;
    active.pointerType = null;
    return true;
  }

  #scheduleRender() {
    if (this.#renderFrame !== null) return;
    if (typeof globalThis.requestAnimationFrame !== "function") {
      this.#renderNow();
      return;
    }
    this.#renderFrame = globalThis.requestAnimationFrame(() => {
      this.#renderFrame = null;
      this.#renderNow();
    });
  }

  #cancelRenderFrame() {
    if (
      this.#renderFrame !== null &&
      typeof globalThis.cancelAnimationFrame === "function"
    ) {
      globalThis.cancelAnimationFrame(this.#renderFrame);
    }
    this.#renderFrame = null;
  }

  #renderNow() {
    this.#cancelRenderFrame();
    const active = this.#active;
    if (!active) {
      const wasVisible = this.#overlay.visible;
      this.#overlay.visible = false;
      if (wasVisible) {
        this.renderer.invalidateRender?.("measurement-overlay-clear");
      }
      return;
    }
    const points = active.points.map(point => [...point]);
    if (active.hover) {
      if (active.mode === "ruler") {
        if (!points.length) points.push([...active.hover]);
        points[1] = [...active.hover];
      } else if (points.length === 1) {
        points.push([...active.hover]);
      } else if (points.length >= 2 && points.length < 3) {
        points.push([...points[0]], [...active.hover]);
      }
    }
    const linePoints = measurementLinePoints(active.mode, points);
    const attribute = this.#overlay.geometry.getAttribute("position");
    const array = attribute.array;
    let offset = 0;
    for (const point of linePoints) {
      array[offset++] = point[0];
      array[offset++] = point[1];
      array[offset++] = point[2];
    }
    while (offset < array.length) array[offset++] = 0;
    const vertexCount = linePoints.length;
    this.#overlay.geometry.setDrawRange(0, vertexCount);
    attribute.needsUpdate = true;
    if (vertexCount >= 2) {
      this.#overlay.geometry.computeBoundingSphere();
    }
    this.#overlay.visible = vertexCount >= 2;
    this.renderer.invalidateRender?.("measurement-overlay");
  }

  #notify() {
    const snapshot = this.status();
    for (const listener of [...this.#listeners]) listener(snapshot);
  }

  #bind(enabled) {
    const method = enabled ? "addEventListener" : "removeEventListener";
    const canvas = this.renderer.canvas;
    canvas[method]("pointerdown", this.#onPointerDown, true);
    canvas[method]("pointermove", this.#onPointerMove, true);
    canvas[method]("pointerup", this.#onPointerUp, true);
    canvas[method]("pointercancel", this.#onPointerCancel, true);
    globalThis[method]?.("keydown", this.#onKeyDown, true);
  }
}

export function measureDistance(start, end) {
  const from = vector3(start, "início da régua");
  const to = vector3(end, "fim da régua");
  const delta = to.map((value, index) => value - from[index]);
  return Object.freeze({
    type: "distance",
    start: Object.freeze(from),
    end: Object.freeze(to),
    delta: Object.freeze(delta),
    distance: Math.hypot(...delta)
  });
}

export function measureAngle(center, first, second) {
  const origin = vector3(center, "centro do transferidor");
  const left = subtract(vector3(first, "primeiro raio"), origin);
  const right = subtract(vector3(second, "segundo raio"), origin);
  const leftLength = Math.hypot(...left);
  const rightLength = Math.hypot(...right);
  if (!(leftLength > 1e-12) || !(rightLength > 1e-12)) {
    throw new RangeError("Os raios do transferidor devem ter comprimento.");
  }
  const cosine = THREE.MathUtils.clamp(
    dot(left, right) / (leftLength * rightLength),
    -1,
    1
  );
  return Object.freeze({
    type: "angle",
    center: Object.freeze(origin),
    first: Object.freeze(vector3(first, "primeiro raio")),
    second: Object.freeze(vector3(second, "segundo raio")),
    angleDegrees: Math.acos(cosine) * 180 / Math.PI
  });
}

export function formatMeasurementResult(result) {
  if (result?.type === "distance") {
    return `${formatNumber(result.distance)} u`;
  }
  if (result?.type === "angle") {
    return `${formatNumber(result.angleDegrees)}°`;
  }
  return "";
}

function createOverlay() {
  const geometry = new THREE.BufferGeometry();
  const position = new THREE.BufferAttribute(new Float32Array(12), 3);
  position.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("position", position);
  geometry.setDrawRange(0, 0);
  const line = new THREE.LineSegments(
    geometry,
    new THREE.LineBasicMaterial({
      color: 0x3de0ff,
      depthTest: false,
      depthWrite: false,
      transparent: true,
      opacity: 0.95
    })
  );
  line.name = "viewer-measurement-overlay";
  line.renderOrder = 1600;
  line.frustumCulled = false;
  line.visible = false;
  return line;
}

function measurementLinePoints(mode, points) {
  if (mode === "ruler" && points.length >= 2) {
    return [points[0], points[1]];
  }
  if (mode === "protractor") {
    if (points.length >= 4) {
      return [points[0], points[1], points[2], points[3]];
    }
    if (points.length >= 3) {
      return [points[0], points[1], points[0], points[2]];
    }
    if (points.length >= 2) {
      return [points[0], points[1]];
    }
  }
  return [];
}

function vector3(value, label) {
  if (!Array.isArray(value) || value.length !== 3) {
    throw new TypeError(`${label} deve conter três valores.`);
  }
  const result = value.map(Number);
  if (!result.every(Number.isFinite)) {
    throw new TypeError(`${label} contém valor inválido.`);
  }
  return result;
}

function subtract(left, right) {
  return left.map((value, index) => value - right[index]);
}

function dot(left, right) {
  return left.reduce(
    (sum, value, index) => sum + value * right[index],
    0
  );
}

function near3(left, right, epsilon = 1e-9) {
  if (!left || !right) return false;
  return Math.hypot(
    left[0] - right[0],
    left[1] - right[1],
    left[2] - right[2]
  ) <= epsilon;
}

function formatNumber(value) {
  return Number(value).toLocaleString("pt-BR", {
    maximumFractionDigits: 4
  });
}
