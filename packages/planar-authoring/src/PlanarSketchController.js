import * as THREE from "three";
import {
  normalizePlanarFrame,
  planarFrameCoordinates,
  planarFramePoint
} from "../../edit-context/src/PlanarFrame.js?build=20260730-0040e";
import {
  resolveActiveAuthoringPlane
} from "../../edit-context/src/index.js?build=20260812-0054l";
import {
  constrainPlanarPoint
} from "./PlanarConstraints.js?build=20260730-0040e";
import {
  createPlanarSketchDescriptor
} from "../../sketch-descriptor/src/index.js?build=20260802-0047g";

const MODES = Object.freeze([
  "point",
  "line",
  "polyline",
  "rectangle",
  "circle",
  "arc",
  "polygon"
]);
const STYLES = Object.freeze(["stroke", "fill"]);
const EPSILON = 1e-7;
const DEFAULTS = Object.freeze({
  mode: "line",
  planeSource: "drawing-or-edit",
  style: "stroke",
  color: "#64d8c8",
  strokeWidth: 0.08,
  segments: 48,
  radialSegments: 6,
  sides: 6,
  arcAngleDegrees: 90,
  closed: false,
  continuous: false,
  autoFuse: true,
  fusionTolerance: 0
});

export class PlanarSketchController {
  static apiVersion = "planar-sketch-controller-v3";

  #active = null;
  #listeners = new Set();
  #preview = null;
  #previewFrame = null;
  #previewDirty = false;
  #handoffFrames = [];
  #pendingCommit = null;
  #commitObservers = [];
  #visibilityRevision = null;
  #visibilityIds = new Set();
  #drawingTarget = null;

  constructor({
    renderer,
    geometryRegistry,
    sandbox = null,
    drawingTarget = null,
    createObject,
    createStroke = null,
    onCompleted = () => {},
    onEnded = () => {}
  }) {
    if (!renderer?.canvas || !renderer?.scene ||
        !renderer?.resolvePointerPlacement) {
      throw new TypeError(
        "PlanarSketchController exige renderer com posicionamento em plano."
      );
    }
    if (!geometryRegistry?.create || !geometryRegistry?.normalize) {
      throw new TypeError(
        "PlanarSketchController exige GeometryRegistry."
      );
    }
    if (typeof createObject !== "function") {
      throw new TypeError(
        "PlanarSketchController exige comando público de criação."
      );
    }
    if (createStroke !== null && typeof createStroke !== "function") {
      throw new TypeError("createStroke deve ser função quando informado.");
    }
    this.renderer = renderer;
    this.geometryRegistry = geometryRegistry;
    this.sandbox = sandbox;
    this.#drawingTarget = drawingTarget;
    this.createObject = createObject;
    this.createStroke = createStroke;
    this.onCompleted = onCompleted;
    this.onEnded = onEnded;
    this.#bind(true);
  }

  get active() {
    return Boolean(this.#active);
  }

  begin(options = {}) {
    if (this.#active) this.cancel();
    if (this.#drawingTarget?.status?.().type === "surface") {
      throw new Error(
        "O alvo de superfície aceita caminhos e tubos nesta etapa; " +
        "a projeção de primitivas 2D entra no casting 0042d."
      );
    }
    const settings = normalizeSettings({ ...DEFAULTS, ...options });
    const frame = resolveDrawingFrame(
      this.renderer,
      settings.planeSource,
      options.frame
    );
    this.#active = {
      settings,
      frame,
      points: [],
      hover: null,
      pointerId: null,
      pointerType: null,
      dragging: false,
      committing: false,
      commitRequestId: null,
      lastResult: null,
      error: null,
      previousTool:
        this.renderer.editorState?.snapshot?.().tool?.mode ?? "select",
      previousOrbitEnabled: Boolean(this.renderer.orbit?.enabled),
      navigationToken:
        this.renderer.acquireToolGestureNavigation?.("planar-sketch") ?? null
    };
    this.#ensurePreview(settings.color);
    this.renderer.setTransformMode?.("navigate");
    if (!this.#active.navigationToken && this.renderer.orbit) {
      this.renderer.orbit.enabled = false;
    }
    this.#notify();
    return this.status();
  }

  create({
    mode = DEFAULTS.mode,
    frame = null,
    points = [],
    ...options
  } = {}) {
    const settings = normalizeSettings({
      ...DEFAULTS,
      ...options,
      mode
    });
    const resolvedFrame = frame
      ? normalizePlanarFrame(frame)
      : resolveDrawingFrame(
          this.renderer,
          settings.planeSource,
          null
        );
    const plan = createPlanarPrimitive({
      frame: resolvedFrame,
      points,
      settings
    });
    const creation = {
      name: options.name ?? plan.name,
      geometry: plan.geometry,
      sketch: plan.sketch,
      position: plan.position,
      rotation: plan.rotation,
      color: settings.color
    };
    const result = this.createStroke &&
      settings.style === "stroke" &&
      plan.geometry.type === "tube"
      ? this.createStroke({
          ...creation,
          autoFuse: settings.autoFuse,
          fusionTolerance: settings.fusionTolerance,
          source: "planar-sketch"
        })
      : this.createObject(creation);
    return Object.freeze({
      ...result,
      tool: "planar-primitive",
      mode: settings.mode,
      frame: resolvedFrame,
      points: Object.freeze(points.map(point => Object.freeze([...point]))),
      geometry: plan.geometry
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

  refreshDrawingFrame() {
    const active = this.#active;
    if (!active || active.dragging || active.points.length || active.committing) {
      return this.status();
    }
    if (this.#drawingTarget?.status?.().type === "surface") {
      active.error =
        "Primitivas 2D não são projetadas diretamente no 0042c; use caminho/tubo.";
      active.hover = null;
      this.#hidePreview();
      this.#notify();
      return this.status();
    }
    active.frame = resolveDrawingFrame(
      this.renderer,
      active.settings.planeSource,
      null
    );
    active.hover = null;
    this.#hidePreview();
    this.#notify();
    return this.status();
  }

  updateSettings(patch = {}) {
    if (!this.#active) return this.status();
    this.#active.settings = normalizeSettings({
      ...this.#active.settings,
      ...patch
    });
    if (this.#preview?.material?.color) {
      this.#preview.material.color.set(this.#active.settings.color);
    }
    this.#schedulePreview();
    this.#notify();
    return this.status();
  }

  finish() {
    const active = this.#active;
    if (!active) return this.status();
    if (active.committing) return this.status();
    if (active.settings.mode !== "polyline") {
      throw new Error(
        "Concluir pontos explicitamente só se aplica à polilinha."
      );
    }
    if (active.points.length < 2) {
      throw new Error("A polilinha exige ao menos dois pontos.");
    }
    this.#commit([...active.points]);
    return this.status();
  }

  removeLastPoint() {
    const active = this.#active;
    if (!active || active.settings.mode !== "polyline" ||
        active.committing) {
      return this.status();
    }
    active.points.pop();
    active.hover = null;
    active.error = null;
    this.#schedulePreview();
    this.#notify();
    return this.status();
  }

  cancelDraft() {
    const active = this.#active;
    if (!active || active.committing) return this.status();
    const changed =
      active.pointerId !== null ||
      active.pointerType !== null ||
      active.points.length > 0 ||
      active.hover !== null ||
      active.dragging ||
      active.error !== null;
    if (!changed) return this.status();
    if (active.pointerId !== null && active.pointerType !== "touch") {
      this.renderer.canvas.releasePointerCapture?.(active.pointerId);
    }
    active.points = [];
    active.hover = null;
    active.dragging = false;
    active.pointerId = null;
    active.pointerType = null;
    active.error = null;
    this.#hidePreview();
    this.#notify();
    return this.status();
  }

  cancel() {
    if (!this.#active) return this.status();
    if (this.#active.committing) {
      this.#active.error =
        "A publicação da geometria 2D ainda está pendente.";
      this.#notify();
      return this.status();
    }
    this.#clearCommitObservation();
    this.#finishInteraction({ restoreTool: true });
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
      mode: active?.settings.mode ?? null,
      drawing: Boolean(active?.dragging || active?.points.length),
      committing: Boolean(active?.committing),
      commitRequestId: active?.commitRequestId ?? null,
      pointCount: active?.points.length ?? 0,
      canFinish: Boolean(
        active?.settings.mode === "polyline" &&
        active.points.length >= 2 &&
        !active.committing
      ),
      frame: active?.frame ?? null,
      settings: active?.settings ?? DEFAULTS,
      lastResult: active?.lastResult ?? null,
      error: active?.error ?? null
    });
  }

  subscribe(listener) {
    if (typeof listener !== "function") {
      throw new TypeError("Listener de desenho 2D deve ser função.");
    }
    this.#listeners.add(listener);
    listener(this.status());
    return () => this.#listeners.delete(listener);
  }

  dispose() {
    this.#clearCommitObservation();
    if (this.#active) {
      this.#finishInteraction({ restoreTool: true });
      this.#active = null;
    }
    this.#bind(false);
    this.#cancelPreviewFrame();
    this.#cancelPreviewHandoff();
    this.#disposePreview();
    this.#listeners.clear();
  }

  #onPointerDown = event => {
    const active = this.#active;
    if (!active || active.committing) return;
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
    }
    active.error = null;
    if (active.settings.mode === "point" &&
        event.pointerType !== "touch") {
      active.points = [point];
      this.#schedulePreview();
      this.#commit([point]);
      return;
    }
    if (active.settings.mode === "polyline") {
      if (!near3(point, active.points.at(-1))) {
        active.points.push(point);
      }
      active.hover = point;
      this.#schedulePreview();
      if (Number(event.detail ?? 0) >= 2 && active.points.length >= 2) {
        this.#commit([...active.points]);
      } else {
        this.#notify();
      }
      return;
    }
    active.pointerId = event.pointerId;
    active.pointerType = event.pointerType || "mouse";
    active.dragging = true;
    active.points = [point];
    active.hover = point;
    if (active.pointerType !== "touch") {
      this.renderer.canvas.setPointerCapture?.(event.pointerId);
    }
    this.#schedulePreview();
    this.#notify();
  };

  #onPointerMove = event => {
    const active = this.#active;
    if (!active || active.committing) return;
    if (this.renderer.isToolNavigationGesture?.(event)) {
      if (active.dragging || active.points.length) this.cancelDraft();
      return;
    }
    if (active.settings.mode !== "polyline" &&
        (!active.dragging || event.pointerId !== active.pointerId)) {
      return;
    }
    if (active.settings.mode === "polyline" && !active.points.length) {
      return;
    }
    const point = this.#worldPoint(event);
    if (!point) return;
    event.preventDefault();
    if (event.pointerType !== "touch") {
      event.stopImmediatePropagation();
    }
    active.hover = point;
    this.#schedulePreview();
  };

  #onPointerUp = event => {
    const active = this.#active;
    if (active && this.renderer.isToolNavigationGesture?.(event)) {
      if (active.dragging || active.points.length) this.cancelDraft();
      return;
    }
    if (!active || active.committing ||
        active.settings.mode === "polyline" ||
        !active.dragging ||
        event.pointerId !== active.pointerId) {
      return;
    }
    event.preventDefault();
    if (event.pointerType !== "touch") {
      event.stopImmediatePropagation();
      this.renderer.canvas.releasePointerCapture?.(event.pointerId);
    }
    const point = this.#worldPoint(event) ?? active.hover;
    active.dragging = false;
    active.pointerId = null;
    active.pointerType = null;
    if (!point) {
      this.cancelDraft();
      return;
    }
    active.hover = point;
    this.#schedulePreview({ flush: true });
    this.#commit([active.points[0], point]);
  };

  #onPointerCancel = event => {
    const active = this.#active;
    if (!active || !active.dragging ||
        event.pointerId !== active.pointerId) {
      return;
    }
    event.preventDefault();
    if (event.pointerType !== "touch") {
      this.renderer.canvas.releasePointerCapture?.(event.pointerId);
    }
    this.cancelDraft();
  };

  #onKeyDown = event => {
    const active = this.#active;
    if (!active) return;
    if (event.key === "Enter" && active.settings.mode === "polyline") {
      event.preventDefault();
      this.finish();
      return;
    }
    if (event.key === "Backspace" &&
        active.settings.mode === "polyline" &&
        active.points.length) {
      event.preventDefault();
      this.removeLastPoint();
      return;
    }
    if (event.key !== "Escape") return;
    event.preventDefault();
    if (active.points.length || active.dragging) this.cancelDraft();
    else this.cancel();
  };

  #worldPoint(event) {
    const active = this.#active;
    if (this.#drawingTarget?.status?.().type === "surface") return null;
    const placement = this.renderer.resolvePointerPlacement({
      clientX: event.clientX,
      clientY: event.clientY,
      plane: active.frame,
      surface: false
    });
    if (!placement?.point) return null;
    const transform = this.renderer.getTransformConfig?.() ?? {};
    const anchor = active.settings.mode === "polyline"
      ? active.points.at(-1) ?? null
      : active.points[0] ?? null;
    return [...constrainPlanarPoint({
      frame: active.frame,
      point: placement.point,
      anchor,
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

  #commit(points) {
    const active = this.#active;
    if (!active || active.committing) return;
    try {
      const result = this.create({
        ...active.settings,
        frame: active.frame,
        points
      });
      active.lastResult = result;
      const completion = {
        result,
        mode: active.settings.mode,
        settings: active.settings,
        frame: active.frame,
        points: result.points
      };
      this.#beginCommitHandoff(completion);
    } catch (error) {
      active.error = error?.message ?? String(error);
      if (active.settings.mode !== "polyline") {
        active.points = [];
        active.hover = null;
        this.#hidePreview();
      }
      this.#notify();
    }
  }

  #beginCommitHandoff(completion) {
    const active = this.#active;
    const ids = resultCreatedIds(completion.result);
    if (!active || !completion.result?.changed || !ids.length) {
      throw new Error("O comando 2D não publicou um objeto.");
    }
    if (!this.sandbox || this.#objectsVisible(ids)) {
      this.#completeCommit(completion);
      return;
    }
    const outcome = this.sandbox.coordinationStatus?.().lastOutcome;
    const requestId = outcome?.status === "queued"
      ? outcome.requestId ?? null
      : null;
    active.committing = true;
    active.commitRequestId = requestId;
    this.#pendingCommit = { active, completion, ids, requestId };
    if (typeof this.sandbox.subscribe === "function") {
      this.#commitObservers.push(
        this.sandbox.subscribe(() => this.#observePendingCommit())
      );
    }
    if (typeof this.sandbox.subscribeCoordination === "function") {
      this.#commitObservers.push(
        this.sandbox.subscribeCoordination(status =>
          this.#observePendingCoordination(status)
        )
      );
    }
    this.#observePendingCommit();
  }

  #observePendingCommit() {
    const pending = this.#pendingCommit;
    if (pending && this.#objectsVisible(pending.ids)) {
      this.#completeCommit(pending.completion);
    }
  }

  #observePendingCoordination(status) {
    const pending = this.#pendingCommit;
    const outcome = status?.lastOutcome;
    if (!pending || !outcome) return;
    if (pending.requestId && outcome.requestId !== pending.requestId) return;
    if (outcome.status === "accepted") {
      this.#observePendingCommit();
    } else if (String(outcome.status).startsWith("rejected")) {
      this.#clearCommitObservation();
      pending.active.committing = false;
      pending.active.commitRequestId = null;
      pending.active.error =
        `A publicação 2D foi rejeitada (${outcome.status})${
          outcome.error ? `: ${outcome.error}` : ""
        }.`;
      this.#notify();
    }
  }

  #objectsVisible(ids) {
    if (typeof this.sandbox?.getObject === "function") {
      return ids.every(id => Boolean(this.sandbox.getObject(id)));
    }
    const revision = Number(this.sandbox?.revision);
    const cacheable = Number.isInteger(revision);
    if (!cacheable || this.#visibilityRevision !== revision) {
      const objects = this.sandbox?.getSnapshot?.().objects;
      if (!Array.isArray(objects)) return false;
      this.#visibilityIds = new Set(
        objects.map(object => String(object.id))
      );
      this.#visibilityRevision = cacheable ? revision : null;
    }
    return ids.every(id => this.#visibilityIds.has(String(id)));
  }

  #completeCommit(completion) {
    const active = this.#pendingCommit?.active ?? this.#active;
    if (!active || active !== this.#active) return;
    this.#clearCommitObservation();
    active.committing = false;
    active.commitRequestId = null;
    active.error = null;
    try {
      this.onCompleted(completion);
    } catch (error) {
      active.error =
        `Objeto publicado; falha ao registrar repetição: ${
          error?.message ?? String(error)
        }`;
    }
    active.points = [];
    active.hover = null;
    active.dragging = false;
    active.pointerId = null;
    active.pointerType = null;
    if (active.settings.continuous) {
      this.#deferPreviewClear();
    } else {
      this.#finishInteraction({ restoreTool: true });
      this.#active = null;
      this.#deferPreviewClear();
      this.onEnded({ reason: "completed" });
    }
    this.#notify();
  }

  #clearCommitObservation() {
    for (const unsubscribe of this.#commitObservers.splice(0)) {
      try {
        unsubscribe?.();
      } catch {
        // A publicação possui sua própria autoridade; a observação é auxiliar.
      }
    }
    this.#pendingCommit = null;
  }

  #schedulePreview({ flush = false } = {}) {
    this.#previewDirty = true;
    if (flush) {
      this.#cancelPreviewFrame();
      this.#flushPreview();
      return;
    }
    if (this.#previewFrame !== null) return;
    if (typeof globalThis.requestAnimationFrame !== "function") {
      this.#flushPreview();
      return;
    }
    this.#previewFrame = globalThis.requestAnimationFrame(() => {
      this.#previewFrame = null;
      this.#flushPreview();
    });
  }

  #draftPoints() {
    const active = this.#active;
    if (!active) return [];
    if (active.settings.mode === "polyline") {
      const points = active.points.slice();
      if (active.hover && !near3(active.hover, points.at(-1))) {
        points.push(active.hover);
      }
      return points;
    }
    return active.points.length && active.hover
      ? [active.points[0], active.hover]
      : active.points.slice();
  }

  #flushPreview() {
    const active = this.#active;
    const points = this.#previewDirty ? this.#draftPoints() : [];
    this.#previewDirty = false;
    if (!active || !points.length) {
      this.#hidePreview();
      return;
    }
    try {
      const plan = createPlanarPrimitive({
        frame: active.frame,
        points,
        settings: active.settings,
        preview: true
      });
      const geometry = this.geometryRegistry.create(plan.geometry);
      this.#ensurePreview(active.settings.color);
      this.#preview.geometry = updateDynamicPreviewGeometry(
        this.#preview.geometry,
        geometry
      );
      this.#preview.position.fromArray(plan.position);
      this.#preview.quaternion.fromArray(plan.rotation);
      this.#preview.material.color.set(active.settings.color);
      this.#preview.visible = true;
      this.renderer.invalidateRender?.("planar-sketch-preview");
      active.error = null;
    } catch {
      this.#hidePreview();
    }
  }

  #ensurePreview(color) {
    if (this.#preview) return;
    this.#preview = new THREE.Mesh(
      new THREE.BufferGeometry(),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
        side: THREE.DoubleSide
      })
    );
    this.#preview.name = "planar-sketch-preview";
    this.#preview.renderOrder = 1498;
    this.#preview.frustumCulled = false;
    this.#preview.visible = false;
    this.renderer.scene.add(this.#preview);
  }

  #hidePreview() {
    if (!this.#preview?.visible) return false;
    this.#preview.visible = false;
    this.renderer.invalidateRender?.("planar-sketch-preview-clear");
    return true;
  }

  #deferPreviewClear() {
    this.#cancelPreviewHandoff();
    if (typeof globalThis.requestAnimationFrame !== "function") {
      this.#hidePreview();
      return;
    }
    const first = globalThis.requestAnimationFrame(() => {
      this.#handoffFrames = this.#handoffFrames.filter(id => id !== first);
      const second = globalThis.requestAnimationFrame(() => {
        this.#handoffFrames =
          this.#handoffFrames.filter(id => id !== second);
        this.#hidePreview();
      });
      this.#handoffFrames.push(second);
    });
    this.#handoffFrames.push(first);
  }

  #cancelPreviewHandoff() {
    if (typeof globalThis.cancelAnimationFrame === "function") {
      for (const frame of this.#handoffFrames) {
        globalThis.cancelAnimationFrame(frame);
      }
    }
    this.#handoffFrames = [];
  }

  #cancelPreviewFrame() {
    if (this.#previewFrame !== null &&
        typeof globalThis.cancelAnimationFrame === "function") {
      globalThis.cancelAnimationFrame(this.#previewFrame);
    }
    this.#previewFrame = null;
  }

  #finishInteraction({ restoreTool }) {
    const active = this.#active;
    if (!active) return;
    if (active.pointerId !== null && active.pointerType !== "touch") {
      this.renderer.canvas.releasePointerCapture?.(active.pointerId);
    }
    if (active.navigationToken) {
      this.renderer.releaseToolGestureNavigation?.(active.navigationToken);
      active.navigationToken = null;
    } else if (this.renderer.orbit) {
      this.renderer.orbit.enabled = active.previousOrbitEnabled;
    }
    if (restoreTool) {
      this.renderer.setTransformMode?.(active.previousTool);
    }
  }

  #disposePreview() {
    if (!this.#preview) return;
    this.renderer.scene.remove(this.#preview);
    this.#preview.geometry.dispose();
    this.#preview.material.dispose();
    this.#preview = null;
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
    globalThis[method]?.("keydown", this.#onKeyDown, true);
  }
}

function updateDynamicPreviewGeometry(current, next) {
  if (!geometryLayoutsMatch(current, next)) {
    current?.dispose?.();
    markDynamicGeometry(next);
    return next;
  }
  for (const name of Object.keys(next.attributes)) {
    const target = current.getAttribute(name);
    const source = next.getAttribute(name);
    target.array.set(source.array);
    target.clearUpdateRanges?.();
    target.addUpdateRange?.(0, target.array.length);
    target.needsUpdate = true;
  }
  if (current.index && next.index) {
    current.index.array.set(next.index.array);
    current.index.clearUpdateRanges?.();
    current.index.addUpdateRange?.(0, current.index.array.length);
    current.index.needsUpdate = true;
  }
  current.setDrawRange(next.drawRange.start, next.drawRange.count);
  current.clearGroups();
  for (const group of next.groups) {
    current.addGroup(group.start, group.count, group.materialIndex);
  }
  next.dispose();
  return current;
}

function geometryLayoutsMatch(left, right) {
  if (!left || !right) return false;
  const leftNames = Object.keys(left.attributes).sort();
  const rightNames = Object.keys(right.attributes).sort();
  if (leftNames.length !== rightNames.length ||
      leftNames.some((name, index) => name !== rightNames[index])) {
    return false;
  }
  for (const name of leftNames) {
    const a = left.getAttribute(name);
    const b = right.getAttribute(name);
    if (!a || !b || a.itemSize !== b.itemSize ||
        a.normalized !== b.normalized ||
        a.array.constructor !== b.array.constructor ||
        a.array.length !== b.array.length) {
      return false;
    }
  }
  if (Boolean(left.index) !== Boolean(right.index)) return false;
  if (left.index && (
      left.index.array.constructor !== right.index.array.constructor ||
      left.index.array.length !== right.index.array.length
  )) return false;
  return true;
}

function markDynamicGeometry(geometry) {
  for (const attribute of Object.values(geometry.attributes ?? {})) {
    attribute.setUsage?.(THREE.DynamicDrawUsage);
  }
  geometry.index?.setUsage?.(THREE.DynamicDrawUsage);
  return geometry;
}

export function createPlanarPrimitive({
  frame,
  points,
  settings = {},
  preview = false
} = {}) {
  const normalizedFrame = normalizePlanarFrame(frame);
  const normalizedSettings = normalizeSettings({
    ...DEFAULTS,
    ...settings
  });
  if (!Array.isArray(points) || !points.length) {
    throw new TypeError("A ferramenta 2D exige pontos no plano.");
  }
  const local = points.map(point =>
    planarFrameCoordinates(normalizedFrame, point)
  );
  const mode = normalizedSettings.mode;
  const complete = plan => freezePlan({
    ...plan,
    sketch: planarSketchForPlan({
      mode,
      style: normalizedSettings.style,
      local,
      objectOrigin: planarFrameCoordinates(
        normalizedFrame,
        plan.position
      ),
      settings: normalizedSettings,
      geometry: plan.geometry
    })
  });
  if (mode === "point") {
    const [x, y] = local[0];
    return complete({
      name: "Ponto 2D",
      geometry: {
        type: "circle",
        radius: normalizedSettings.strokeWidth,
        segments: Math.max(8, normalizedSettings.segments),
        thetaStartDeg: 0,
        thetaLengthDeg: 360
      },
      position: planarFramePoint(normalizedFrame, [x, y, 0]),
      rotation: normalizedFrame.quaternion
    });
  }
  if (mode === "polyline") {
    if (local.length < 2) {
      throw new Error("A polilinha exige ao menos dois pontos.");
    }
    const center = localBoundsCenter(local);
    return complete({
      name: "Polilinha 2D",
      geometry: strokeGeometry(
        local.map(([x, y]) => [x - center[0], y - center[1], 0]),
        normalizedSettings,
        normalizedSettings.closed
      ),
      position: planarFramePoint(
        normalizedFrame,
        [center[0], center[1], 0]
      ),
      rotation: normalizedFrame.quaternion
    });
  }
  if (local.length < 2) {
    throw new Error(`A ferramenta ${mode} exige dois pontos.`);
  }
  const first = local[0];
  const last = local.at(-1);
  const dx = last[0] - first[0];
  const dy = last[1] - first[1];
  const distance = Math.hypot(dx, dy);
  if (distance <= EPSILON) {
    throw new Error("O gesto 2D é curto demais.");
  }
  if (mode === "line") {
    const center = [(first[0] + last[0]) / 2, (first[1] + last[1]) / 2];
    return complete({
      name: "Segmento 2D",
      geometry: strokeGeometry([
        [first[0] - center[0], first[1] - center[1], 0],
        [last[0] - center[0], last[1] - center[1], 0]
      ], normalizedSettings, false),
      position: planarFramePoint(
        normalizedFrame,
        [center[0], center[1], 0]
      ),
      rotation: normalizedFrame.quaternion
    });
  }
  if (mode === "rectangle") {
    const center = [(first[0] + last[0]) / 2, (first[1] + last[1]) / 2];
    const width = Math.abs(dx);
    const height = Math.abs(dy);
    if (width <= EPSILON || height <= EPSILON) {
      throw new Error("O retângulo exige largura e altura não nulas.");
    }
    const halfX = width / 2;
    const halfY = height / 2;
    const geometry = normalizedSettings.style === "fill"
      ? {
          type: "plane",
          width,
          height,
          widthSegments: 1,
          heightSegments: 1
        }
      : strokeGeometry([
          [-halfX, -halfY, 0],
          [halfX, -halfY, 0],
          [halfX, halfY, 0],
          [-halfX, halfY, 0]
        ], normalizedSettings, true);
    return complete({
      name: "Retângulo 2D",
      geometry,
      position: planarFramePoint(
        normalizedFrame,
        [center[0], center[1], 0]
      ),
      rotation: normalizedFrame.quaternion
    });
  }
  const center = [first[0], first[1]];
  const radius = distance;
  const startAngle = Math.atan2(dy, dx) * 180 / Math.PI;
  if (mode === "circle") {
    const geometry = normalizedSettings.style === "fill"
      ? {
          type: "circle",
          radius,
          segments: normalizedSettings.segments,
          thetaStartDeg: 0,
          thetaLengthDeg: 360
        }
      : ringGeometry(radius, 360, 0, normalizedSettings);
    return complete({
      name: "Círculo 2D",
      geometry,
      position: planarFramePoint(
        normalizedFrame,
        [center[0], center[1], 0]
      ),
      rotation: normalizedFrame.quaternion
    });
  }
  if (mode === "arc") {
    const signedAngle = normalizedSettings.arcAngleDegrees;
    const thetaStartDeg = signedAngle < 0
      ? startAngle + signedAngle
      : startAngle;
    return complete({
      name: "Arco 2D",
      geometry: normalizedSettings.style === "fill"
        ? {
            type: "circle",
            radius,
            segments: normalizedSettings.segments,
            thetaStartDeg,
            thetaLengthDeg: Math.abs(signedAngle)
          }
        : ringGeometry(
            radius,
            Math.abs(signedAngle),
            thetaStartDeg,
            normalizedSettings
          ),
      position: planarFramePoint(
        normalizedFrame,
        [center[0], center[1], 0]
      ),
      rotation: normalizedFrame.quaternion
    });
  }
  if (mode === "polygon") {
    const geometry = normalizedSettings.style === "fill"
      ? {
          type: "polygon",
          sides: normalizedSettings.sides,
          radius,
          startAngleDeg: startAngle
        }
      : strokeGeometry(
          regularPolygonPoints(
            normalizedSettings.sides,
            radius,
            startAngle
          ),
          normalizedSettings,
          true
        );
    return complete({
      name: "Polígono 2D",
      geometry,
      position: planarFramePoint(
        normalizedFrame,
        [center[0], center[1], 0]
      ),
      rotation: normalizedFrame.quaternion
    });
  }
  if (!preview) {
    throw new RangeError(`Ferramenta 2D desconhecida: ${mode}.`);
  }
  throw new Error("Preview 2D incompleto.");
}

function strokeGeometry(points, settings, closed) {
  const segmentCount = closed ? points.length : points.length - 1;
  return {
    type: "tube",
    points,
    tubularSegments: Math.max(2, Math.min(4096, segmentCount)),
    radius: settings.strokeWidth / 2,
    radialSegments: settings.radialSegments,
    closed: Boolean(closed),
    curveType: "polyline",
    tension: 0.5
  };
}

function ringGeometry(radius, angle, startAngle, settings) {
  const halfStroke = Math.min(settings.strokeWidth / 2, radius * 0.999);
  return {
    type: "ring",
    innerRadius: Math.max(0, radius - halfStroke),
    outerRadius: radius + halfStroke,
    thetaSegments: settings.segments,
    phiSegments: 1,
    thetaStartDeg: startAngle,
    thetaLengthDeg: Math.min(360, Math.max(0.001, angle))
  };
}

function regularPolygonPoints(sides, radius, startAngleDegrees) {
  const start = startAngleDegrees * Math.PI / 180;
  return Array.from({ length: sides }, (_, index) => {
    const angle = start + index * Math.PI * 2 / sides;
    return [
      Math.cos(angle) * radius,
      Math.sin(angle) * radius,
      0
    ];
  });
}

function planarSketchForPlan({
  mode,
  style,
  local,
  objectOrigin,
  settings,
  geometry
}) {
  const relative = points => points.map(point => [
    point[0] - objectOrigin[0],
    point[1] - objectOrigin[1]
  ]);
  let points;
  let closed = false;
  let primitive;

  if (mode === "point") {
    points = [[0, 0]];
    primitive = {
      type: "point",
      radius: settings.strokeWidth
    };
  } else if (mode === "line") {
    points = relative([local[0], local.at(-1)]);
    primitive = { type: "line" };
  } else if (mode === "polyline") {
    points = relative(local);
    closed = settings.closed;
    primitive = { type: "polyline" };
  } else if (mode === "rectangle") {
    const width = Math.abs(local.at(-1)[0] - local[0][0]);
    const height = Math.abs(local.at(-1)[1] - local[0][1]);
    const halfX = width / 2;
    const halfY = height / 2;
    points = [
      [-halfX, -halfY],
      [halfX, -halfY],
      [halfX, halfY],
      [-halfX, halfY]
    ];
    closed = true;
    primitive = {
      type: "rectangle",
      width,
      height
    };
  } else if (mode === "circle") {
    const radius = Math.hypot(
      local.at(-1)[0] - local[0][0],
      local.at(-1)[1] - local[0][1]
    );
    points = sampleArcPoints(radius, 0, 360, settings.segments, {
      includeEnd: false
    });
    closed = true;
    primitive = { type: "circle", radius };
  } else if (mode === "arc") {
    const dx = local.at(-1)[0] - local[0][0];
    const dy = local.at(-1)[1] - local[0][1];
    const radius = Math.hypot(dx, dy);
    const start = Math.atan2(dy, dx) * 180 / Math.PI;
    const length = settings.arcAngleDegrees;
    const thetaStart = length < 0 ? start + length : start;
    points = sampleArcPoints(
      radius,
      thetaStart,
      Math.abs(length),
      settings.segments
    );
    primitive = {
      type: "arc",
      radius,
      startAngleDeg: thetaStart,
      angleDeg: Math.abs(length)
    };
  } else if (mode === "polygon") {
    const dx = local.at(-1)[0] - local[0][0];
    const dy = local.at(-1)[1] - local[0][1];
    const radius = Math.hypot(dx, dy);
    const startAngleDeg = Math.atan2(dy, dx) * 180 / Math.PI;
    points = regularPolygonPoints(
      settings.sides,
      radius,
      startAngleDeg
    ).map(([x, y]) => [x, y]);
    closed = true;
    primitive = {
      type: "polygon",
      sides: settings.sides,
      radius,
      startAngleDeg
    };
  } else {
    throw new RangeError(`Esboço 2D desconhecido: ${mode}.`);
  }

  return createPlanarSketchDescriptor({
    mode,
    style,
    points,
    closed,
    primitive
  });
}

function sampleArcPoints(
  radius,
  startAngleDeg,
  lengthDeg,
  segments,
  { includeEnd = true } = {}
) {
  const divisions = Math.max(
    1,
    Math.ceil(Number(segments) * Number(lengthDeg) / 360)
  );
  const total = includeEnd ? divisions + 1 : divisions;
  return Array.from({ length: total }, (_, index) => {
    const angle = (
      Number(startAngleDeg) +
      Number(lengthDeg) * index / divisions
    ) * Math.PI / 180;
    return [Math.cos(angle) * radius, Math.sin(angle) * radius];
  });
}

function localBoundsCenter(points) {
  const xs = points.map(point => point[0]);
  const ys = points.map(point => point[1]);
  return [
    (Math.min(...xs) + Math.max(...xs)) / 2,
    (Math.min(...ys) + Math.max(...ys)) / 2
  ];
}

function normalizeSettings(value = {}) {
  const mode = oneOf(value.mode, MODES, "ferramenta 2D");
  const style = oneOf(value.style, STYLES, "estilo 2D");
  const strokeWidth = positive(value.strokeWidth, "espessura 2D");
  const segments = integerBetween(value.segments, 3, 4096, "segmentos 2D");
  const radialSegments = integerBetween(
    value.radialSegments,
    3,
    32,
    "segmentos radiais"
  );
  const sides = integerBetween(value.sides, 3, 256, "lados do polígono");
  const arcAngleDegrees = finite(
    value.arcAngleDegrees,
    "ângulo do arco"
  );
  if (Math.abs(arcAngleDegrees) < 0.001 ||
      Math.abs(arcAngleDegrees) > 360) {
    throw new RangeError(
      "O ângulo do arco deve ficar entre -360° e 360° e não pode ser zero."
    );
  }
  return Object.freeze({
    name: value.name ? String(value.name) : null,
    mode,
    planeSource: String(
      value.planeSource ?? DEFAULTS.planeSource
    ).trim().toLowerCase(),
    style,
    color: String(value.color ?? DEFAULTS.color),
    strokeWidth,
    segments,
    radialSegments,
    sides,
    arcAngleDegrees,
    closed: Boolean(value.closed),
    continuous: Boolean(value.continuous),
    autoFuse: value.autoFuse === undefined
      ? DEFAULTS.autoFuse
      : Boolean(value.autoFuse),
    fusionTolerance: nonNegative(
      value.fusionTolerance ?? DEFAULTS.fusionTolerance,
      "tolerância de fusão"
    )
  });
}

function resolveDrawingFrame(renderer, source, explicitFrame) {
  if (explicitFrame) return normalizePlanarFrame(explicitFrame);
  const normalized = String(source ?? "active").toLowerCase();
  if (normalized === "viewer") {
    return normalizePlanarFrame(renderer.readViewerReferenceFrame());
  }
  // drawing/edit/drawing-or-edit são aliases legados do único plano ativo.
  const active = resolveActiveAuthoringPlane(renderer);
  if (!active.frame) throw new Error("Não foi possível determinar o plano ativo.");
  return normalizePlanarFrame(active.frame);
}

function resultCreatedIds(result) {
  if (Array.isArray(result?.publishedObjectIds)) {
    return result.publishedObjectIds.map(String);
  }
  if (Array.isArray(result?.createdIds)) {
    return result.createdIds.map(String);
  }
  return result?.id ? [String(result.id)] : [];
}

function freezePlan({ name, geometry, sketch, position, rotation }) {
  return Object.freeze({
    name,
    geometry: Object.freeze(structuredClone(geometry)),
    sketch: Object.freeze(structuredClone(sketch)),
    position: Object.freeze([...position]),
    rotation: Object.freeze([...rotation])
  });
}

function near3(left, right, epsilon = EPSILON) {
  if (!left || !right) return false;
  return Math.hypot(
    left[0] - right[0],
    left[1] - right[1],
    left[2] - right[2]
  ) <= epsilon;
}

function positive(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    throw new RangeError(`${label} deve ser positiva.`);
  }
  return number;
}

function nonNegative(value, label) {
  const number = finite(value, label);
  if (number < 0) throw new RangeError(`${label} não pode ser negativa.`);
  return number;
}

function finite(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new TypeError(`${label} deve ser finito.`);
  }
  return number;
}

function integerBetween(value, minimum, maximum, label) {
  const number = Number(value);
  if (!Number.isInteger(number) ||
      number < minimum ||
      number > maximum) {
    throw new RangeError(
      `${label} deve ser inteiro entre ${minimum} e ${maximum}.`
    );
  }
  return number;
}

function oneOf(value, allowed, label) {
  const normalized = String(value ?? allowed[0]).trim().toLowerCase();
  if (!allowed.includes(normalized)) {
    throw new RangeError(`${label} desconhecida: ${value}.`);
  }
  return normalized;
}
