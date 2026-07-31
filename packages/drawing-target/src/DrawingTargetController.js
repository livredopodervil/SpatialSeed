import * as THREE from "three";
import { TransformControls } from "three/addons/controls/TransformControls.js";

const DEFAULTS = Object.freeze({
  source: "viewer",
  helperVisible: true,
  helperSize: 12,
  helperOpacity: 0.18,
  helperGrid: true,
  offset: 0,
  surfaceFrontFacesOnly: true,
  surfaceLockObject: true,
  surfaceMaximumJump: 0,
  editing: false,
  gizmoMode: "translate"
});

const SOURCES = Object.freeze([
  "viewer",
  "world-xy",
  "world-xz",
  "world-yz",
  "object",
  "face",
  "three-points",
  "edit-plane",
  "surface-selection",
  "custom"
]);

export class DrawingTargetController {
  static apiVersion = "drawing-target-controller-v2";

  #listeners = new Set();
  #baseFrame = null;
  #source = DEFAULTS.source;
  #offset = DEFAULTS.offset;
  #helperVisible = DEFAULTS.helperVisible;
  #helperSize = DEFAULTS.helperSize;
  #helperOpacity = DEFAULTS.helperOpacity;
  #helperGrid = DEFAULTS.helperGrid;
  #editing = false;
  #gizmoMode = DEFAULTS.gizmoMode;
  #helperRoot;
  #planeMesh;
  #gridLines;
  #axesLines;
  #normalArrow;
  #surfaceCursorRoot;
  #surfaceCursorRing;
  #surfaceCursorNormal;
  #surfaceTarget = null;
  #lastSurfacePlacement = null;
  #transform;
  #synchronizing = false;
  #savedMainTransform = null;
  #savedOrbitEnabled = true;

  constructor({ renderer, editContext }) {
    if (!renderer?.scene || !renderer?.camera || !renderer?.canvas) {
      throw new TypeError("DrawingTargetController exige renderer Three.js.");
    }
    if (!editContext?.setDrawingPlane || !editContext?.clearDrawingPlane) {
      throw new TypeError("DrawingTargetController exige EditContextController.");
    }
    this.renderer = renderer;
    this.editContext = editContext;

    const helper = createPlaneHelper();
    this.#helperRoot = helper.root;
    this.#planeMesh = helper.plane;
    this.#gridLines = helper.grid;
    this.#axesLines = helper.axes;
    this.#normalArrow = helper.normal;
    this.renderer.scene.add(this.#helperRoot);

    const surfaceCursor = createSurfaceCursor();
    this.#surfaceCursorRoot = surfaceCursor.root;
    this.#surfaceCursorRing = surfaceCursor.ring;
    this.#surfaceCursorNormal = surfaceCursor.normal;
    this.renderer.scene.add(this.#surfaceCursorRoot);

    this.#transform = new TransformControls(
      this.renderer.camera,
      this.renderer.canvas
    );
    this.#transform.setMode(this.#gizmoMode);
    this.#transform.setSpace("local");
    this.#transform.setSize(0.82);
    this.#transform.enabled = false;
    this.#transform.getHelper().visible = false;
    this.renderer.scene.add(this.#transform.getHelper());

    this.#transform.addEventListener("dragging-changed", event => {
      if (event.value) {
        this.#savedOrbitEnabled = Boolean(this.renderer.orbit?.enabled);
        if (this.renderer.orbit) this.renderer.orbit.enabled = false;
      } else if (this.renderer.orbit) {
        this.renderer.orbit.enabled = this.#savedOrbitEnabled;
      }
    });
    this.#transform.addEventListener("objectChange", () => {
      if (this.#synchronizing || !this.#editing) return;
      const frame = frameFromObject(this.#helperRoot, {
        source: "custom",
        linked: false
      });
      this.#source = "custom";
      this.#offset = 0;
      this.#baseFrame = frame;
      this.editContext.setDrawingPlane({
        source: "custom",
        frame
      });
      this.#notify();
    });

    this.#updateHelperGeometry();
    this.#updateVisibility();
  }

  subscribe(listener) {
    if (typeof listener !== "function") {
      throw new TypeError("Listener do alvo de desenho deve ser função.");
    }
    this.#listeners.add(listener);
    listener(this.status());
    return () => this.#listeners.delete(listener);
  }

  status() {
    const frame = this.renderer.getDrawingPlane?.() ?? null;
    const surface = this.#surfaceTarget;
    return Object.freeze({
      active: Boolean(frame || surface),
      type: surface ? "surface" : "plane",
      source: this.#source,
      frame: frame ? freezeFrame(frame) : null,
      baseFrame: this.#baseFrame ? freezeFrame(this.#baseFrame) : null,
      surfaceTarget: surface ? freezeSurfaceTarget(surface) : null,
      lastSurfacePlacement: this.#lastSurfacePlacement,
      offset: surface?.offset ?? this.#offset,
      helperVisible: this.#helperVisible,
      helperSize: this.#helperSize,
      helperOpacity: this.#helperOpacity,
      helperGrid: this.#helperGrid,
      editing: this.#editing,
      gizmoMode: this.#gizmoMode,
      supportedSources: SOURCES
    });
  }

  set({
    source = this.#source,
    frame = null,
    offset = this.#offset,
    helperVisible = this.#helperVisible,
    helperSize = this.#helperSize,
    helperOpacity = this.#helperOpacity,
    helperGrid = this.#helperGrid,
    points = null,
    inclinationDegrees = 0,
    azimuthDegrees = 0,
    origin = null,
    normal = null,
    tangent = null,
    objectIds = null,
    frontFacesOnly = DEFAULTS.surfaceFrontFacesOnly,
    lockObject = DEFAULTS.surfaceLockObject,
    maximumJump = DEFAULTS.surfaceMaximumJump
  } = {}) {
    const normalizedSource = normalizeSource(source);
    this.setEditing(false);
    this.#helperVisible = Boolean(helperVisible);
    this.#helperSize = positiveNumber(helperSize, "Tamanho do helper");
    this.#helperOpacity = clampNumber(
      helperOpacity,
      0.02,
      0.9,
      "Opacidade do helper"
    );
    this.#helperGrid = Boolean(helperGrid);

    if (normalizedSource === "surface-selection") {
      return this.#setSurfaceTarget({
        objectIds,
        frontFacesOnly,
        lockObject,
        maximumJump,
        offset
      });
    }

    this.#surfaceTarget = null;
    this.#lastSurfacePlacement = null;
    this.#surfaceCursorRoot.visible = false;
    if (frame) {
      this.editContext.setDrawingPlane({
        source: normalizedSource,
        frame
      });
    } else {
      this.editContext.setDrawingPlane({
        source: normalizedSource,
        points,
        inclinationDegrees,
        azimuthDegrees,
        origin,
        normal,
        tangent
      });
    }
    const resolved = this.renderer.getDrawingPlane?.();
    if (!resolved) {
      throw new Error("O plano de desenho não pôde ser determinado.");
    }
    this.#source = normalizedSource;
    this.#baseFrame = normalizeFrame(resolved, normalizedSource);
    this.#offset = finiteNumber(offset, "Offset do plano");
    this.#applyFrame();
    this.#updateHelperGeometry();
    this.#updateVisibility();
    this.#notify();
    return this.status();
  }

  clear() {
    this.setEditing(false);
    this.editContext.clearDrawingPlane();
    this.#baseFrame = null;
    this.#surfaceTarget = null;
    this.#lastSurfacePlacement = null;
    this.#surfaceCursorRoot.visible = false;
    this.#offset = 0;
    this.#updateVisibility();
    this.#notify();
    return this.status();
  }

  setOffset(value = 0) {
    const next = finiteNumber(value, "Offset do alvo");
    if (this.#surfaceTarget) {
      this.#surfaceTarget = Object.freeze({
        ...this.#surfaceTarget,
        offset: next
      });
      this.#lastSurfacePlacement = null;
      this.#surfaceCursorRoot.visible = false;
      this.#notify();
      return this.status();
    }
    if (!this.#baseFrame) {
      throw new Error("Defina um alvo de desenho antes de alterar o offset.");
    }
    this.#offset = next;
    this.#applyFrame();
    this.#notify();
    return this.status();
  }

  resolvePointerPlacement({
    clientX,
    clientY,
    previous = null,
    target = this.#surfaceTarget
  } = {}) {
    if (!target) return null;
    const placement = this.renderer.resolveDrawingSurfacePlacement({
      clientX,
      clientY,
      target,
      previous
    });
    if (!placement) return null;
    this.#lastSurfacePlacement = placement;
    this.#updateSurfaceCursor(placement);
    return placement;
  }

  setHelper({
    visible = this.#helperVisible,
    size = this.#helperSize,
    opacity = this.#helperOpacity,
    grid = this.#helperGrid
  } = {}) {
    this.#helperVisible = Boolean(visible);
    this.#helperSize = positiveNumber(size, "Tamanho do helper");
    this.#helperOpacity = clampNumber(
      opacity,
      0.02,
      0.9,
      "Opacidade do helper"
    );
    this.#helperGrid = Boolean(grid);
    this.#updateHelperGeometry();
    this.#updateVisibility();
    this.#notify();
    return this.status();
  }

  setGizmoMode(mode = "translate") {
    const normalized = String(mode).toLowerCase();
    if (!new Set(["translate", "rotate"]).has(normalized)) {
      throw new RangeError("O helper aceita apenas mover ou girar.");
    }
    this.#gizmoMode = normalized;
    this.#transform.setMode(normalized);
    this.#transform.setSpace("local");
    this.#notify();
    return this.status();
  }

  setEditing(enabled = true) {
    const next = Boolean(enabled);
    if (next === this.#editing) return this.status();
    if (next && this.#surfaceTarget) {
      throw new Error(
        "A superfície capturada não usa o gizmo planar; altere a geometria alvo."
      );
    }
    if (next && !this.renderer.getDrawingPlane?.()) {
      throw new Error("Defina o plano antes de editar o helper.");
    }
    this.#editing = next;
    if (next) {
      const main = this.renderer.transform;
      this.#savedMainTransform = main
        ? {
            enabled: Boolean(main.enabled),
            visible: Boolean(main.getHelper?.().visible)
          }
        : null;
      if (main) {
        main.enabled = false;
        if (main.getHelper?.()) main.getHelper().visible = false;
      }
      this.#transform.enabled = true;
      this.#transform.getHelper().visible = true;
      this.#transform.attach(this.#helperRoot);
    } else {
      this.#transform.detach();
      this.#transform.enabled = false;
      this.#transform.getHelper().visible = false;
      const main = this.renderer.transform;
      if (main && this.#savedMainTransform) {
        main.enabled = this.#savedMainTransform.enabled;
        if (main.getHelper?.()) {
          main.getHelper().visible = this.#savedMainTransform.visible;
        }
      }
      this.#savedMainTransform = null;
      if (this.renderer.orbit) {
        this.renderer.orbit.enabled = this.#savedOrbitEnabled;
      }
    }
    this.#updateVisibility();
    this.#notify();
    return this.status();
  }

  toggleEditing() {
    return this.setEditing(!this.#editing);
  }

  resetForProjectChange() {
    this.clear();
    this.#source = DEFAULTS.source;
    this.#surfaceTarget = null;
    this.#lastSurfacePlacement = null;
    this.#surfaceCursorRoot.visible = false;
    this.#helperVisible = DEFAULTS.helperVisible;
    this.#helperSize = DEFAULTS.helperSize;
    this.#helperOpacity = DEFAULTS.helperOpacity;
    this.#helperGrid = DEFAULTS.helperGrid;
    this.#updateHelperGeometry();
    this.#updateVisibility();
    this.#notify();
    return this.status();
  }

  dispose() {
    this.setEditing(false);
    this.#listeners.clear();
    this.#transform.detach();
    this.renderer.scene.remove(this.#transform.getHelper());
    this.#transform.dispose?.();
    this.renderer.scene.remove(this.#helperRoot);
    disposeTree(this.#helperRoot);
    this.renderer.scene.remove(this.#surfaceCursorRoot);
    disposeTree(this.#surfaceCursorRoot);
  }

  #applyFrame() {
    if (!this.#baseFrame) return;
    const frame = offsetFrame(this.#baseFrame, this.#offset, this.#source);
    this.editContext.setDrawingPlane({
      source: this.#source,
      frame
    });
    this.#synchronizing = true;
    try {
      this.#helperRoot.position.fromArray(frame.origin);
      this.#helperRoot.quaternion.fromArray(frame.quaternion);
      this.#helperRoot.scale.set(1, 1, 1);
      this.#helperRoot.updateMatrixWorld(true);
    } finally {
      this.#synchronizing = false;
    }
  }

  #updateHelperGeometry() {
    const size = this.#helperSize;
    this.#planeMesh.scale.set(size, size, 1);
    this.#planeMesh.material.opacity = this.#helperOpacity;
    this.#planeMesh.material.needsUpdate = true;
    this.#surfaceCursorRing.material.opacity = THREE.MathUtils.clamp(
      this.#helperOpacity * 3.2,
      0.28,
      0.9
    );
    this.#surfaceCursorRing.material.needsUpdate = true;
    this.#gridLines.visible = this.#helperGrid;
    this.#gridLines.scale.set(size, size, 1);
    this.#axesLines.scale.set(size, size, 1);
    this.#normalArrow.setLength(
      Math.max(size * 0.22, 0.25),
      Math.max(size * 0.045, 0.08),
      Math.max(size * 0.025, 0.05)
    );
    if (this.#lastSurfacePlacement) {
      this.#updateSurfaceCursor(this.#lastSurfacePlacement);
    }
  }

  #updateVisibility() {
    const planeActive = Boolean(this.renderer.getDrawingPlane?.()) &&
      !this.#surfaceTarget;
    this.#helperRoot.visible =
      planeActive && (this.#helperVisible || this.#editing);
    this.#transform.getHelper().visible = planeActive && this.#editing;
    this.#surfaceCursorRoot.visible = Boolean(
      this.#surfaceTarget && this.#helperVisible && this.#lastSurfacePlacement
    );
  }

  #setSurfaceTarget({
    objectIds,
    frontFacesOnly,
    lockObject,
    maximumJump,
    offset
  }) {
    this.editContext.clearDrawingPlane();
    this.#baseFrame = null;
    this.#offset = 0;
    this.#surfaceTarget = this.renderer.captureDrawingSurfaceTarget({
      objectIds,
      frontFacesOnly,
      lockObject,
      maximumJump,
      offset
    });
    this.#source = "surface-selection";
    this.#lastSurfacePlacement = null;
    this.#surfaceCursorRoot.visible = false;
    this.#updateHelperGeometry();
    this.#updateVisibility();
    this.#notify();
    return this.status();
  }

  #updateSurfaceCursor(placement) {
    if (!placement?.point || !placement?.normal) return;
    const normal = new THREE.Vector3().fromArray(placement.normal).normalize();
    let tangent = new THREE.Vector3().fromArray(
      placement.tangent ?? [1, 0, 0]
    );
    tangent.addScaledVector(normal, -tangent.dot(normal));
    if (tangent.lengthSq() <= 1e-18) {
      tangent = Math.abs(normal.y) < 0.9
        ? new THREE.Vector3(0, 1, 0).cross(normal)
        : new THREE.Vector3(1, 0, 0).cross(normal);
    }
    tangent.normalize();
    const bitangent = normal.clone().cross(tangent).normalize();
    const quaternion = new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(tangent, bitangent, normal)
    );
    this.#surfaceCursorRoot.position.fromArray(placement.point);
    this.#surfaceCursorRoot.quaternion.copy(quaternion);
    const size = Math.max(this.#helperSize * 0.035, 0.12);
    this.#surfaceCursorRing.scale.setScalar(size);
    this.#surfaceCursorNormal.setLength(
      Math.max(size * 1.8, 0.2),
      Math.max(size * 0.45, 0.06),
      Math.max(size * 0.25, 0.035)
    );
    this.#surfaceCursorRoot.updateMatrixWorld(true);
    this.#updateVisibility();
  }

  #notify() {
    const snapshot = this.status();
    for (const listener of [...this.#listeners]) {
      try {
        listener(snapshot);
      } catch (error) {
        console.error("DrawingTargetController subscriber failed", error);
      }
    }
  }
}

function createPlaneHelper() {
  const root = new THREE.Group();
  root.name = "drawing-target-helper";
  root.renderOrder = 1492;
  root.userData.drawingTargetHelper = true;

  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({
      color: 0x4fc3f7,
      transparent: true,
      opacity: DEFAULTS.helperOpacity,
      depthWrite: false,
      side: THREE.DoubleSide
    })
  );
  plane.name = "drawing-target-plane";
  plane.renderOrder = 1490;
  disableRaycast(plane);
  root.add(plane);

  const grid = new THREE.LineSegments(
    createGridGeometry(10),
    new THREE.LineBasicMaterial({
      color: 0x9bdff8,
      transparent: true,
      opacity: 0.55,
      depthWrite: false
    })
  );
  grid.name = "drawing-target-grid";
  grid.position.z = 0.001;
  grid.renderOrder = 1491;
  disableRaycast(grid);
  root.add(grid);

  const axes = new THREE.LineSegments(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-0.5, 0, 0.002),
      new THREE.Vector3(0.5, 0, 0.002),
      new THREE.Vector3(0, -0.5, 0.002),
      new THREE.Vector3(0, 0.5, 0.002)
    ]),
    new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.9,
      depthWrite: false
    })
  );
  axes.name = "drawing-target-axes";
  axes.renderOrder = 1492;
  disableRaycast(axes);
  root.add(axes);

  const normal = new THREE.ArrowHelper(
    new THREE.Vector3(0, 0, 1),
    new THREE.Vector3(0, 0, 0.004),
    1,
    0xffca5c
  );
  normal.name = "drawing-target-normal";
  normal.line.material.transparent = true;
  normal.line.material.opacity = 0.9;
  normal.line.material.depthWrite = false;
  normal.cone.material.transparent = true;
  normal.cone.material.opacity = 0.9;
  normal.cone.material.depthWrite = false;
  disableRaycast(normal.line);
  disableRaycast(normal.cone);
  root.add(normal);

  return { root, plane, grid, axes, normal };
}

function createSurfaceCursor() {
  const root = new THREE.Group();
  root.name = "drawing-surface-cursor";
  root.renderOrder = 1494;
  root.userData.drawingTargetHelper = true;
  root.visible = false;

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.72, 1, 40),
    new THREE.MeshBasicMaterial({
      color: 0x66e0ff,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
      side: THREE.DoubleSide
    })
  );
  ring.renderOrder = 1494;
  disableRaycast(ring);
  root.add(ring);

  const normal = new THREE.ArrowHelper(
    new THREE.Vector3(0, 0, 1),
    new THREE.Vector3(0, 0, 0.003),
    1,
    0xffca5c
  );
  normal.line.material.transparent = true;
  normal.line.material.opacity = 0.9;
  normal.line.material.depthWrite = false;
  normal.cone.material.transparent = true;
  normal.cone.material.opacity = 0.9;
  normal.cone.material.depthWrite = false;
  disableRaycast(normal.line);
  disableRaycast(normal.cone);
  root.add(normal);
  return { root, ring, normal };
}

function freezeSurfaceTarget(target) {
  return Object.freeze({
    ...target,
    objectIds: Object.freeze([...(target.objectIds ?? [])]),
    sourceObjectIds: Object.freeze([...(target.sourceObjectIds ?? [])]),
    bounds: target.bounds
      ? Object.freeze({
          min: Object.freeze([...(target.bounds.min ?? [])]),
          max: Object.freeze([...(target.bounds.max ?? [])])
        })
      : null
  });
}

function createGridGeometry(divisions) {
  const points = [];
  for (let index = 0; index <= divisions; index += 1) {
    const value = -0.5 + index / divisions;
    points.push(
      new THREE.Vector3(-0.5, value, 0),
      new THREE.Vector3(0.5, value, 0),
      new THREE.Vector3(value, -0.5, 0),
      new THREE.Vector3(value, 0.5, 0)
    );
  }
  return new THREE.BufferGeometry().setFromPoints(points);
}

function frameFromObject(object, { source = "custom", linked = false } = {}) {
  object.updateMatrixWorld(true);
  const quaternion = object.quaternion.clone().normalize();
  const xAxis = new THREE.Vector3(1, 0, 0).applyQuaternion(quaternion);
  const yAxis = new THREE.Vector3(0, 1, 0).applyQuaternion(quaternion);
  const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(quaternion);
  return Object.freeze({
    origin: Object.freeze(object.position.toArray()),
    normal: Object.freeze(normal.toArray()),
    xAxis: Object.freeze(xAxis.toArray()),
    yAxis: Object.freeze(yAxis.toArray()),
    quaternion: Object.freeze(quaternion.toArray()),
    source,
    linked: Boolean(linked)
  });
}

function normalizeFrame(frame, source = null) {
  const origin = vector3(frame.origin ?? [0, 0, 0], "Origem");
  const normal = new THREE.Vector3().fromArray(
    vector3(frame.normal ?? [0, 0, 1], "Normal")
  );
  if (normal.lengthSq() < 1e-18) {
    throw new RangeError("A normal do plano não pode ser nula.");
  }
  normal.normalize();
  let xAxis = new THREE.Vector3().fromArray(
    vector3(frame.xAxis ?? [1, 0, 0], "Eixo X")
  );
  xAxis.addScaledVector(normal, -xAxis.dot(normal));
  if (xAxis.lengthSq() < 1e-18) {
    xAxis = Math.abs(normal.y) < 0.9
      ? new THREE.Vector3(0, 1, 0).cross(normal)
      : new THREE.Vector3(1, 0, 0).cross(normal);
  }
  xAxis.normalize();
  const yAxis = normal.clone().cross(xAxis).normalize();
  const quaternion = new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().makeBasis(xAxis, yAxis, normal)
  );
  return Object.freeze({
    origin: Object.freeze(origin),
    normal: Object.freeze(normal.toArray()),
    xAxis: Object.freeze(xAxis.toArray()),
    yAxis: Object.freeze(yAxis.toArray()),
    quaternion: Object.freeze(quaternion.toArray()),
    source: source ?? frame.source ?? null,
    linked: Boolean(frame.linked)
  });
}

function offsetFrame(baseFrame, offset, source) {
  const origin = new THREE.Vector3().fromArray(baseFrame.origin);
  const normal = new THREE.Vector3().fromArray(baseFrame.normal).normalize();
  origin.addScaledVector(normal, offset);
  return Object.freeze({
    origin: Object.freeze(origin.toArray()),
    normal: Object.freeze([...baseFrame.normal]),
    xAxis: Object.freeze([...baseFrame.xAxis]),
    yAxis: Object.freeze([...baseFrame.yAxis]),
    quaternion: Object.freeze([...baseFrame.quaternion]),
    source,
    linked: Boolean(baseFrame.linked)
  });
}

function freezeFrame(frame) {
  return Object.freeze({
    origin: Object.freeze([...(frame.origin ?? [0, 0, 0])]),
    normal: Object.freeze([...(frame.normal ?? [0, 0, 1])]),
    xAxis: Object.freeze([...(frame.xAxis ?? [1, 0, 0])]),
    yAxis: Object.freeze([...(frame.yAxis ?? [0, 1, 0])]),
    quaternion: Object.freeze([...(frame.quaternion ?? [0, 0, 0, 1])]),
    source: frame.source ?? null,
    linked: Boolean(frame.linked)
  });
}

function normalizeSource(value) {
  const normalized = String(value ?? DEFAULTS.source).toLowerCase();
  if (!SOURCES.includes(normalized)) {
    throw new RangeError(`Fonte de alvo de desenho desconhecida: ${value}.`);
  }
  return normalized;
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

function finiteNumber(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new TypeError(`${label} inválido.`);
  }
  return number;
}

function positiveNumber(value, label) {
  const number = finiteNumber(value, label);
  if (number <= 0) throw new RangeError(`${label} deve ser positivo.`);
  return number;
}

function clampNumber(value, minimum, maximum, label) {
  return THREE.MathUtils.clamp(finiteNumber(value, label), minimum, maximum);
}

function disableRaycast(object) {
  object.raycast = () => {};
}

function disposeTree(root) {
  const geometries = new Set();
  const materials = new Set();
  root.traverse(object => {
    if (object.geometry) geometries.add(object.geometry);
    const list = Array.isArray(object.material)
      ? object.material
      : [object.material];
    for (const material of list) if (material) materials.add(material);
  });
  for (const geometry of geometries) geometry.dispose?.();
  for (const material of materials) material.dispose?.();
}
