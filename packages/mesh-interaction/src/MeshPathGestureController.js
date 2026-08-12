import {
  normalizeMeshPathMode,
  pathDiagonal,
  prepareMeshPath
} from "../../mesh-operator-kernel/src/index.js?build=20260812-0054g";

const DEFAULTS = Object.freeze({
  operation: "extrude",
  pathMode: "drag-line",
  pathSamplePixels: 6,
  pathSimplify: 0.004
});

export class MeshPathGestureController {
  static apiVersion = "mesh-path-gesture-controller-v1";

  #active = null;
  #listeners = new Set();
  constructor({
    renderer,
    meshEditor,
    onCompleted = () => {},
    onEnded = () => {}
  } = {}) {
    if (!renderer?.canvas || typeof renderer.resolvePointerPlacement !== "function") {
      throw new TypeError("MeshPathGestureController exige uma porta de projeção do renderer.");
    }
    if (!meshEditor?.previewTopology || !meshEditor?.worldPointsToLocal) {
      throw new TypeError("MeshPathGestureController exige MeshEditController com preview topológico.");
    }
    this.renderer = renderer;
    this.meshEditor = meshEditor;
    this.onCompleted = onCompleted;
    this.onEnded = onEnded;
    this.#bind(true);
  }

  get active() { return Boolean(this.#active); }

  begin(options = {}) {
    if (!this.meshEditor.active) {
      throw new Error("Entre na edição de malha antes de usar um gesto topológico.");
    }
    if (this.#active) this.cancel("replaced");
    const settings = normalizeSettings({ ...DEFAULTS, ...options });
    if (settings.pathMode === "normal") {
      throw new Error("O modo normal é uma operação imediata, não um gesto por caminho.");
    }
    const anchor = this.meshEditor.referencePoint?.() ??
      this.meshEditor.status?.().pivotWorld ?? null;
    if (!Array.isArray(anchor) || anchor.length !== 3) {
      throw new Error("A seleção atual não possui referência espacial para o gesto.");
    }
    const viewerFrame = this.renderer.readViewerReferenceFrame?.();
    const normal = Array.isArray(viewerFrame?.normal)
      ? [...viewerFrame.normal]
      : [0, 0, -1];
    const navigationToken =
      this.renderer.acquireToolGestureNavigation?.("mesh-path-gesture") ?? null;
    this.#active = {
      settings,
      plane: Object.freeze({
        ...(viewerFrame ?? {}),
        origin: Object.freeze([...anchor]),
        normal: Object.freeze(normal)
      }),
      pointerId: null,
      pointerType: null,
      drawing: false,
      screenPoints: [],
      worldPoints: [],
      previewed: false,
      previousTool: this.renderer.editorState?.snapshot?.().tool?.mode ?? "select",
      previousOrbitEnabled: this.renderer.orbit?.enabled ?? true,
      navigationToken,
      error: null,
      lastPath: null
    };
    this.renderer.setTransformMode?.("navigate");
    if (!navigationToken && this.renderer.orbit) this.renderer.orbit.enabled = false;
    this.#notify();
    return this.status();
  }

  cancel(reason = "cancel") {
    const active = this.#active;
    if (!active) return this.status();
    try {
      this.meshEditor.cancelTopologyPreview?.();
    } finally {
      this.#finishInteraction(active);
      this.#active = null;
      this.onEnded({ reason });
      this.#notify();
    }
    return this.status();
  }

  status() {
    const active = this.#active;
    return Object.freeze({
      active: Boolean(active),
      drawing: Boolean(active?.drawing),
      operation: active?.settings.operation ?? null,
      pathMode: active?.settings.pathMode ?? null,
      pointCount: active?.worldPoints.length ?? 0,
      previewed: Boolean(active?.previewed),
      lastPath: active?.lastPath ?? null,
      error: active?.error ?? null
    });
  }

  subscribe(listener) {
    if (typeof listener !== "function") throw new TypeError("Listener inválido.");
    this.#listeners.add(listener);
    listener(this.status());
    return () => this.#listeners.delete(listener);
  }

  dispose() {
    if (this.#active) this.cancel("dispose");
    this.#bind(false);
    this.#listeners.clear();
  }

  #onPointerDown = event => {
    const active = this.#active;
    if (!active || active.drawing) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (this.renderer.isToolNavigationGesture?.(event)) return;
    const point = this.#worldPoint(event, active.plane);
    if (!point) return;
    event.preventDefault();
    if (event.pointerType !== "touch") event.stopImmediatePropagation();
    active.pointerId = event.pointerId;
    active.pointerType = event.pointerType || "mouse";
    active.drawing = true;
    active.error = null;
    active.screenPoints = [[event.clientX, event.clientY]];
    active.worldPoints = [point];
    active.previewed = false;
    active.lastPath = null;
    if (active.pointerType !== "touch") {
      this.renderer.canvas.setPointerCapture?.(event.pointerId);
    }
    this.#notify();
  };

  #onPointerMove = event => {
    const active = this.#active;
    if (!active?.drawing || event.pointerId !== active.pointerId) return;
    if (this.renderer.isToolNavigationGesture?.(event)) {
      this.cancel("navigation");
      return;
    }
    event.preventDefault();
    if (event.pointerType !== "touch") event.stopImmediatePropagation();
    this.#appendSample(event, { force: false });
  };

  #onPointerUp = event => {
    const active = this.#active;
    if (!active?.drawing || event.pointerId !== active.pointerId) return;
    event.preventDefault();
    if (event.pointerType !== "touch") {
      event.stopImmediatePropagation();
      this.renderer.canvas.releasePointerCapture?.(event.pointerId);
    }
    this.#appendSample(event, { force: true });
    active.drawing = false;
    active.pointerId = null;
    active.pointerType = null;
    try {
      if (!active.previewed) {
        throw new Error("Arraste o cursor para definir um caminho de extrusão.");
      }
      const result = this.meshEditor.commitTopologyPreview();
      const path = active.lastPath;
      const operation = active.settings.operation;
      this.#finishInteraction(active);
      this.#active = null;
      this.onCompleted({
        operation,
        path,
        options: active.settings.options,
        result
      });
      this.#notify();
    } catch (error) {
      active.error = error?.message ?? String(error);
      this.meshEditor.cancelTopologyPreview?.();
      this.#notify();
    }
  };

  #onPointerCancel = event => {
    if (!this.#active?.drawing || event.pointerId !== this.#active.pointerId) return;
    this.cancel("pointer-cancel");
  };

  #appendSample(event, { force }) {
    const active = this.#active;
    const previousScreen = active.screenPoints.at(-1);
    if (!force && previousScreen && Math.hypot(
      event.clientX - previousScreen[0],
      event.clientY - previousScreen[1]
    ) < active.settings.pathSamplePixels) {
      return false;
    }
    const point = this.#worldPoint(event, active.plane);
    if (!point) return false;
    const previousWorld = active.worldPoints.at(-1);
    if (previousWorld && Math.hypot(
      point[0] - previousWorld[0],
      point[1] - previousWorld[1],
      point[2] - previousWorld[2]
    ) <= 1e-8) return false;
    active.screenPoints.push([event.clientX, event.clientY]);
    active.worldPoints.push(point);
    try {
      this.#preview(active);
      active.error = null;
    } catch (error) {
      active.error = error?.message ?? String(error);
    }
    this.#notify();
    return true;
  }

  #preview(active) {
    if (active.worldPoints.length < 2) return false;
    const relativeTolerance = active.settings.pathMode === "drawn"
      ? pathDiagonal(active.worldPoints) * active.settings.pathSimplify
      : 0;
    const preparedWorld = prepareMeshPath({
      points: active.worldPoints,
      mode: active.settings.pathMode,
      simplifyTolerance: relativeTolerance,
      minimumSegment: 1e-7
    });
    const localPoints = this.meshEditor.worldPointsToLocal(preparedWorld.points);
    const preparedLocal = prepareMeshPath({
      points: localPoints,
      mode: "explicit",
      simplifyTolerance: 0,
      minimumSegment: 1e-8
    });
    this.meshEditor.previewTopology({
      operation: active.settings.operation,
      options: {
        ...active.settings.options,
        path: preparedLocal.points,
        pathMode: "explicit"
      }
    });
    active.previewed = true;
    active.lastPath = Object.freeze({
      mode: active.settings.pathMode,
      worldPoints: preparedWorld.points,
      localPoints: preparedLocal.points,
      length: preparedWorld.length,
      segmentCount: preparedWorld.segments.length
    });
    return true;
  }

  #worldPoint(event, plane) {
    return this.renderer.resolvePointerPlacement({
      clientX: event.clientX,
      clientY: event.clientY,
      plane,
      surface: false
    })?.point ?? null;
  }

  #finishInteraction(active) {
    if (active.pointerId !== null && active.pointerType !== "touch") {
      try { this.renderer.canvas.releasePointerCapture?.(active.pointerId); } catch {}
    }
    if (active.navigationToken) {
      this.renderer.releaseToolGestureNavigation?.(active.navigationToken);
    } else if (this.renderer.orbit) {
      this.renderer.orbit.enabled = active.previousOrbitEnabled;
    }
    this.renderer.setTransformMode?.(active.previousTool);
  }

  #bind(enabled) {
    const method = enabled ? "addEventListener" : "removeEventListener";
    const canvas = this.renderer.canvas;
    canvas[method]("pointerdown", this.#onPointerDown, true);
    canvas[method]("pointermove", this.#onPointerMove, true);
    canvas[method]("pointerup", this.#onPointerUp, true);
    canvas[method]("pointercancel", this.#onPointerCancel, true);
  }

  #notify() {
    const snapshot = this.status();
    for (const listener of [...this.#listeners]) listener(snapshot);
  }
}

function normalizeSettings(value) {
  const pathMode = normalizeMeshPathMode(value.pathMode);
  const samplePixels = integerAtLeast(value.pathSamplePixels, 1, "pathSamplePixels");
  const simplify = ranged(value.pathSimplify, 0, 0.2, "pathSimplify");
  return Object.freeze({
    operation: String(value.operation ?? "extrude").trim().toLowerCase(),
    pathMode,
    pathSamplePixels: samplePixels,
    pathSimplify: simplify,
    options: Object.freeze(structuredClone(value.options ?? {}))
  });
}

function integerAtLeast(value, minimum, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < minimum) {
    throw new RangeError(`${label} deve ser inteiro >= ${minimum}.`);
  }
  return number;
}

function ranged(value, minimum, maximum, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < minimum || number > maximum) {
    throw new RangeError(`${label} deve ficar entre ${minimum} e ${maximum}.`);
  }
  return number;
}
