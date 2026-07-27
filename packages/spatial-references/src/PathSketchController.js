import * as THREE from "three";

const DEFAULTS = Object.freeze({
  planeSource: "locked-or-viewer",
  spacingPixels: 6,
  simplify: 0.004,
  smoothIterations: 1,
  radius: 0.08,
  tubularSegments: 96,
  radialSegments: 6,
  curveType: "centripetal",
  tension: 0.5,
  color: "#70c8ff"
});

export class PathSketchController {
  static apiVersion = "path-sketch-controller-v1";

  #active = null;
  #listeners = new Set();
  #raycaster = new THREE.Raycaster();
  #pointer = new THREE.Vector2();
  #previewLine;
  #previewPoints;

  constructor({ renderer, pathTools }) {
    if (!renderer?.canvas || !renderer?.camera || !renderer?.scene) {
      throw new TypeError("PathSketchController exige renderer Three.js compatível.");
    }
    if (!pathTools?.createPath) {
      throw new TypeError("PathSketchController exige PathToolService.");
    }
    this.renderer = renderer;
    this.pathTools = pathTools;
    this.#previewLine = createPreviewLine();
    this.#previewPoints = createPreviewPoints();
    renderer.scene.add(this.#previewLine, this.#previewPoints);
    this.#bind(true);
  }

  get active() { return Boolean(this.#active); }

  begin(options = {}) {
    if (this.#active) throw new Error("Já existe um desenho de caminho ativo.");
    const settings = normalizeSettings({ ...DEFAULTS, ...options });
    const frame = resolveFrame(this.renderer, settings.planeSource);
    this.#active = {
      settings,
      frame,
      plane: new THREE.Plane(
        new THREE.Vector3().fromArray(frame.normal).normalize(),
        -new THREE.Vector3().fromArray(frame.normal)
          .normalize()
          .dot(new THREE.Vector3().fromArray(frame.origin))
      ),
      pointerId: null,
      drawing: false,
      screenPoints: [],
      points: [],
      previousTool: this.renderer.editorState?.snapshot?.().tool?.mode ?? "select",
      previousOrbitEnabled: this.renderer.orbit.enabled,
      lastResult: null,
      error: null
    };
    this.renderer.setTransformMode("navigate");
    this.renderer.orbit.enabled = false;
    this.#updatePreview([]);
    this.#notify();
    return this.status();
  }

  cancel() {
    if (!this.#active) return this.status();
    this.#finishInteraction({ restoreTool: true });
    this.#active = null;
    this.#updatePreview([]);
    this.#notify();
    return this.status();
  }

  status() {
    const active = this.#active;
    return Object.freeze({
      active: Boolean(active),
      drawing: Boolean(active?.drawing),
      pointCount: active?.points.length ?? 0,
      planeSource: active?.settings.planeSource ?? null,
      frame: active ? Object.freeze(structuredClone(active.frame)) : null,
      settings: active
        ? Object.freeze(structuredClone(active.settings))
        : Object.freeze({ ...DEFAULTS }),
      lastResult: active?.lastResult ?? null,
      error: active?.error ?? null
    });
  }

  subscribe(listener) {
    if (typeof listener !== "function") {
      throw new TypeError("Listener de desenho de caminho deve ser função.");
    }
    this.#listeners.add(listener);
    listener(this.status());
    return () => this.#listeners.delete(listener);
  }

  dispose() {
    this.cancel();
    this.#bind(false);
    this.renderer.scene.remove(this.#previewLine, this.#previewPoints);
    this.#previewLine.geometry.dispose();
    this.#previewLine.material.dispose();
    this.#previewPoints.geometry.dispose();
    this.#previewPoints.material.dispose();
    this.#listeners.clear();
  }

  #onPointerDown = event => {
    const active = this.#active;
    if (!active || active.drawing) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const point = this.#worldPoint(event);
    if (!point) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    active.pointerId = event.pointerId;
    active.drawing = true;
    active.points = [point];
    active.screenPoints = [[event.clientX, event.clientY]];
    this.renderer.canvas.setPointerCapture?.(event.pointerId);
    this.#updatePreview(active.points);
    this.#notify();
  };

  #onPointerMove = event => {
    const active = this.#active;
    if (!active?.drawing || event.pointerId !== active.pointerId) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const previous = active.screenPoints.at(-1);
    if (Math.hypot(event.clientX - previous[0], event.clientY - previous[1]) <
        active.settings.spacingPixels) return;
    const point = this.#worldPoint(event);
    if (!point || near3(point, active.points.at(-1))) return;
    active.points.push(point);
    active.screenPoints.push([event.clientX, event.clientY]);
    this.#updatePreview(active.points);
    this.#notify();
  };

  #onPointerUp = event => {
    const active = this.#active;
    if (!active?.drawing || event.pointerId !== active.pointerId) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    this.renderer.canvas.releasePointerCapture?.(event.pointerId);
    active.drawing = false;
    try {
      const points = prepareFreehandPoints(active.points, active.settings);
      if (points.length < 2) {
        throw new Error("O traço é curto demais para formar um caminho.");
      }
      active.lastResult = this.pathTools.createPath({
        points,
        name: active.settings.name || "Caminho livre",
        radius: active.settings.radius,
        tubularSegments: Math.max(
          active.settings.tubularSegments,
          points.length * 4
        ),
        radialSegments: active.settings.radialSegments,
        curveType: active.settings.curveType,
        tension: active.settings.tension,
        color: active.settings.color
      });
      active.error = null;
      this.#finishInteraction({ restoreTool: true });
      this.#active = null;
      this.#updatePreview([]);
    } catch (error) {
      active.error = error.message;
      active.points = [];
      active.screenPoints = [];
      this.#updatePreview([]);
    }
    this.#notify();
  };

  #onPointerCancel = event => {
    const active = this.#active;
    if (!active?.drawing || event.pointerId !== active.pointerId) return;
    event.preventDefault();
    active.drawing = false;
    active.points = [];
    active.screenPoints = [];
    this.#updatePreview([]);
    this.#notify();
  };

  #onKeyDown = event => {
    if (!this.#active || event.key !== "Escape") return;
    event.preventDefault();
    this.cancel();
  };

  #worldPoint(event) {
    const rect = this.renderer.canvas.getBoundingClientRect();
    this.#pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
    this.#raycaster.setFromCamera(this.#pointer, this.renderer.camera);
    const point = this.#raycaster.ray.intersectPlane(
      this.#active.plane,
      new THREE.Vector3()
    );
    return point?.toArray() ?? null;
  }

  #finishInteraction({ restoreTool }) {
    const active = this.#active;
    if (!active) return;
    if (active.pointerId !== null) {
      this.renderer.canvas.releasePointerCapture?.(active.pointerId);
    }
    this.renderer.orbit.enabled = active.previousOrbitEnabled;
    if (restoreTool) this.renderer.setTransformMode(active.previousTool);
  }

  #updatePreview(points) {
    const flat = points.flat();
    for (const object of [this.#previewLine, this.#previewPoints]) {
      object.geometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(flat, 3)
      );
      object.geometry.computeBoundingSphere();
      object.visible = points.length > 0;
    }
  }

  #notify() {
    const snapshot = this.status();
    for (const listener of this.#listeners) listener(snapshot);
  }

  #bind(enabled) {
    const method = enabled ? "addEventListener" : "removeEventListener";
    const canvas = this.renderer.canvas;
    canvas[method]("pointerdown", this.#onPointerDown, true);
    canvas[method]("pointermove", this.#onPointerMove, true);
    canvas[method]("pointerup", this.#onPointerUp, true);
    canvas[method]("pointercancel", this.#onPointerCancel, true);
    globalThis[method]("keydown", this.#onKeyDown, true);
  }
}

function resolveFrame(renderer, source) {
  const normalized = String(source ?? "locked-or-viewer").toLowerCase();
  const locked = renderer.getNavigationLocks?.().plane;
  if (["locked", "locked-or-viewer", "plane"].includes(normalized) && locked) {
    return normalizeFrame(locked);
  }
  if (["world-xy", "world-xz", "world-yz"].includes(normalized)) {
    return normalizeFrame({
      "world-xy": { origin: [0, 0, 0], normal: [0, 0, 1], xAxis: [1, 0, 0] },
      "world-xz": { origin: [0, 0, 0], normal: [0, 1, 0], xAxis: [1, 0, 0] },
      "world-yz": { origin: [0, 0, 0], normal: [1, 0, 0], xAxis: [0, 1, 0] }
    }[normalized]);
  }
  return normalizeFrame(renderer.readViewerReferenceFrame());
}

function normalizeFrame(frame) {
  const origin = vector3(frame.origin, "origin");
  const normal = new THREE.Vector3().fromArray(vector3(frame.normal, "normal")).normalize();
  let xAxis = new THREE.Vector3().fromArray(vector3(frame.xAxis ?? [1, 0, 0], "xAxis"));
  xAxis.addScaledVector(normal, -xAxis.dot(normal));
  if (xAxis.lengthSq() < 1e-12) {
    xAxis = Math.abs(normal.y) < 0.9
      ? new THREE.Vector3(0, 1, 0).cross(normal)
      : new THREE.Vector3(1, 0, 0).cross(normal);
  }
  xAxis.normalize();
  const yAxis = normal.clone().cross(xAxis).normalize();
  return Object.freeze({
    origin: Object.freeze(origin),
    normal: Object.freeze(normal.toArray()),
    xAxis: Object.freeze(xAxis.toArray()),
    yAxis: Object.freeze(yAxis.toArray())
  });
}

function prepareFreehandPoints(points, settings) {
  const source = points.map(point => [...point]);
  const diagonal = boundingDiagonal(source);
  const tolerance = diagonal * settings.simplify;
  let result = simplifyRdp(source, tolerance);
  for (let iteration = 0; iteration < settings.smoothIterations; iteration += 1) {
    result = chaikin(result);
  }
  return removeNearDuplicates(result);
}

function simplifyRdp(points, tolerance) {
  if (points.length <= 2 || !(tolerance > 0)) return points.map(point => [...point]);
  const first = new THREE.Vector3().fromArray(points[0]);
  const last = new THREE.Vector3().fromArray(points.at(-1));
  let maximum = 0;
  let split = 0;
  for (let index = 1; index < points.length - 1; index += 1) {
    const distance = distanceToSegment(
      new THREE.Vector3().fromArray(points[index]),
      first,
      last
    );
    if (distance > maximum) {
      maximum = distance;
      split = index;
    }
  }
  if (maximum <= tolerance) return [[...points[0]], [...points.at(-1)]];
  const left = simplifyRdp(points.slice(0, split + 1), tolerance);
  const right = simplifyRdp(points.slice(split), tolerance);
  return [...left.slice(0, -1), ...right];
}

function chaikin(points) {
  if (points.length < 3) return points.map(point => [...point]);
  const result = [[...points[0]]];
  for (let index = 0; index < points.length - 1; index += 1) {
    const left = points[index];
    const right = points[index + 1];
    result.push(
      mix3(left, right, 0.25),
      mix3(left, right, 0.75)
    );
  }
  result.push([...points.at(-1)]);
  return result;
}

function removeNearDuplicates(points, epsilon = 1e-7) {
  const result = [];
  for (const point of points) {
    if (!result.length || !near3(point, result.at(-1), epsilon)) {
      result.push([...point]);
    }
  }
  return result;
}

function distanceToSegment(point, start, end) {
  const direction = end.clone().sub(start);
  const denominator = direction.lengthSq();
  if (denominator <= 1e-18) return point.distanceTo(start);
  const t = THREE.MathUtils.clamp(
    point.clone().sub(start).dot(direction) / denominator,
    0,
    1
  );
  return point.distanceTo(start.clone().addScaledVector(direction, t));
}

function boundingDiagonal(points) {
  const box = new THREE.Box3();
  points.forEach(point => box.expandByPoint(new THREE.Vector3().fromArray(point)));
  return box.min.distanceTo(box.max);
}

function mix3(left, right, t) {
  return [
    left[0] + (right[0] - left[0]) * t,
    left[1] + (right[1] - left[1]) * t,
    left[2] + (right[2] - left[2]) * t
  ];
}

function near3(left, right, epsilon = 1e-9) {
  return Math.hypot(
    left[0] - right[0],
    left[1] - right[1],
    left[2] - right[2]
  ) <= epsilon;
}

function vector3(value, name) {
  if (!Array.isArray(value) || value.length !== 3) {
    throw new TypeError(`${name} deve conter x, y e z.`);
  }
  const result = value.map(Number);
  if (!result.every(Number.isFinite)) throw new TypeError(`${name} inválido.`);
  return result;
}

function normalizeSettings(value) {
  const result = {
    ...value,
    planeSource: String(value.planeSource),
    spacingPixels: integerAtLeast(value.spacingPixels, 1, "spacingPixels"),
    simplify: nonNegative(value.simplify, "simplify"),
    smoothIterations: integerAtLeast(value.smoothIterations, 0, "smoothIterations"),
    radius: positive(value.radius, "radius"),
    tubularSegments: integerAtLeast(value.tubularSegments, 2, "tubularSegments"),
    radialSegments: integerAtLeast(value.radialSegments, 3, "radialSegments"),
    curveType: String(value.curveType),
    tension: finite(value.tension, "tension"),
    color: String(value.color),
    name: value.name === undefined ? null : String(value.name)
  };
  if (!["centripetal", "chordal", "catmullrom", "polyline", "bezier"].includes(result.curveType)) {
    throw new RangeError(
      "O desenho livre aceita Catmull-Rom, Bézier ajustada ou polilinha."
    );
  }
  return Object.freeze(result);
}

function createPreviewLine() {
  const material = new THREE.LineBasicMaterial({
    color: 0x70c8ff,
    depthTest: false,
    depthWrite: false,
    transparent: true,
    opacity: 0.95
  });
  const line = new THREE.Line(new THREE.BufferGeometry(), material);
  line.name = "path-sketch-preview-line";
  line.renderOrder = 1500;
  line.frustumCulled = false;
  line.visible = false;
  return line;
}

function createPreviewPoints() {
  const material = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 5,
    sizeAttenuation: false,
    depthTest: false,
    depthWrite: false
  });
  const points = new THREE.Points(new THREE.BufferGeometry(), material);
  points.name = "path-sketch-preview-points";
  points.renderOrder = 1501;
  points.frustumCulled = false;
  points.visible = false;
  return points;
}

function positive(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    throw new RangeError(`${name} deve ser positivo.`);
  }
  return number;
}

function nonNegative(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new RangeError(`${name} deve ser não negativo.`);
  }
  return number;
}

function finite(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new TypeError(`${name} inválido.`);
  return number;
}

function integerAtLeast(value, minimum, name) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < minimum) {
    throw new RangeError(`${name} deve ser inteiro maior ou igual a ${minimum}.`);
  }
  return number;
}
