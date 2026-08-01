import * as THREE from "three";
import {
  PathInstancePreviewCache
} from "./PathInstancePreviewCache.js?build=20260730-0041b";
import {
  constrainPlanarPoint
} from "../../planar-authoring/src/PlanarConstraints.js?build=20260730-0040e";
import {
  StrokePreprocessPool
} from "./StrokePreprocessPool.js?build=20260730-0040g";

const INITIAL_PACKED_POINT_CAPACITY = 128;
const EMPTY_ARRAY = Object.freeze([]);

const DEFAULTS = Object.freeze({
  mode: "tube",
  planeSource: "locked-or-viewer",
  anchorPolicy: "first",
  inputSamplePixels: 6,
  simplify: 0.004,
  smoothIterations: 1,
  radius: 0.08,
  tubularSegments: 96,
  radialSegments: 6,
  curveType: "centripetal",
  tension: 0.5,
  color: "#70c8ff",
  closed: false,
  sourceMode: "selection",
  geometryType: "box",
  sourceGeometry: Object.freeze({}),
  sourceColor: "#6699cc",
  materialMode: "inherit",
  opacityMultiplier: 1,
  spacingMode: "auto",
  spacingWorld: 1,
  spacingScale: 1,
  align: true,
  twistDegrees: 0,
  orientationMode: "preserve",
  affineMoveX: "0",
  affineMoveY: "0",
  affineMoveZ: "0",
  affineRotateX: "0",
  affineRotateY: "0",
  affineRotateZ: "0",
  affineScale: "1",
  affineULength: 1,
  affineColor: "source"
});

export class PathSketchController {
  static apiVersion = "path-sketch-controller-v10";

  #active = null;
  #listeners = new Set();
  #raycaster = new THREE.Raycaster();
  #pointer = new THREE.Vector2();
  #previewLine;
  #previewPoints;
  #previewTube;
  #previewArrayGroup;
  #previewArrayCache;
  #preprocessPool;
  #drawingTarget = null;
  #inputPositionArray = new Float32Array(0);
  #inputPositionAttribute = null;
  #inputCapacity = 0;
  #inputPointCount = 0;
  #previewFrame = null;
  #pendingPreviewPoints = null;
  #handoffFrames = [];
  #pendingCommits = new Map();
  #commitObservers = [];
  #commitQueue = [];
  #commitDrainHandle = null;
  #commitDrainDeferredAt = null;
  #commitSequence = 0;
  #projectEpoch = 0;
  #lastProjectReset = null;
  #ownCommitRevisions = [];
  #commitDiagnostics = {
    sealedStrokes: 0,
    dispatchedStrokes: 0,
    publishedStrokes: 0,
    failedStrokes: 0,
    lastQueueWaitMs: 0,
    maximumQueueWaitMs: 0,
    lastDispatchMs: 0,
    maximumDispatchMs: 0,
    lastPublicationMs: 0,
    maximumPublicationMs: 0,
    pointerEvents: 0,
    coalescedSamples: 0,
    acceptedSamples: 0,
    lastPointerUpMs: 0,
    maximumPointerUpMs: 0,
    workerPreparedStrokes: 0,
    synchronousPreparedStrokes: 0,
    lazyQueueRebases: 0,
    sourceRecaptures: 0,
    preparedQueueJobs: 0,
    lastPrepareMs: 0,
    maximumPrepareMs: 0,
    forcedDrainsWithInput: 0,
    projectResets: 0,
    staleWorkerResults: 0,
    purgedSceneTransients: 0,
    publicationsCancelledByUndo: 0,
    handoffsReleasedByUndo: 0
  };

  constructor({
    renderer,
    pathTools,
    geometryRegistry = pathTools?.resolver?.geometryRegistry,
    drawingTarget = null,
    onCompleted = () => {},
    onEnded = () => {}
  }) {
    if (!renderer?.canvas || !renderer?.camera || !renderer?.scene) {
      throw new TypeError("PathSketchController exige renderer Three.js compatível.");
    }
    if (!pathTools?.createPath) {
      throw new TypeError("PathSketchController exige PathToolService.");
    }
    if (!geometryRegistry?.create) {
      throw new TypeError("PathSketchController exige GeometryRegistry.");
    }
    this.renderer = renderer;
    this.pathTools = pathTools;
    this.geometryRegistry = geometryRegistry;
    this.#drawingTarget = drawingTarget;
    this.onCompleted = onCompleted;
    this.onEnded = onEnded;
    this.#previewLine = createPreviewLine();
    this.#previewPoints = createPreviewPoints();
    this.#previewTube = createPreviewTube();
    this.#previewArrayGroup = new THREE.Group();
    this.#previewArrayGroup.name = "path-sketch-array-preview";
    this.#previewArrayGroup.renderOrder = 1499;
    this.#previewArrayCache = new PathInstancePreviewCache({
      group: this.#previewArrayGroup,
      geometryRegistry,
      maximumInstances: 4096
    });
    this.#preprocessPool = new StrokePreprocessPool();
    renderer.scene.add(
      this.#previewTube,
      this.#previewArrayGroup,
      this.#previewLine,
      this.#previewPoints
    );
    this.#bind(true);
  }

  get active() { return Boolean(this.#active); }

  begin(options = {}) {
    if (this.#active) throw new Error("Já existe um desenho de caminho ativo.");
    this.#cancelPreviewHandoff({ clear: true });
    const requested = { ...options };
    if (requested.inputSamplePixels === undefined &&
        requested.spacingPixels !== undefined) {
      requested.inputSamplePixels = requested.spacingPixels;
    }
    const settings = normalizeSettings({ ...DEFAULTS, ...requested });
    const drawingTargetStatus = this.#drawingTarget?.status?.() ?? null;
    const targetType = drawingTargetStatus?.type === "surface"
      ? "surface"
      : "plane";
    const frame = targetType === "surface"
      ? surfaceFallbackFrame(this.renderer, drawingTargetStatus)
      : resolveFrame(this.renderer, settings.planeSource);
    const affineModifier = settings.mode === "array"
      ? this.pathTools.compileArrayBrushModifier(settings)
      : null;
    const colorModifier = settings.mode === "array"
      ? this.pathTools.compileArrayBrushColorModifier(settings)
      : null;
    const brush = settings.mode === "array"
      ? this.pathTools.captureArrayBrush({
          sourceMode: settings.sourceMode,
          geometryType: settings.geometryType,
          geometry: settings.sourceGeometry,
          color: settings.sourceColor,
          materialMode: settings.materialMode,
          opacityMultiplier: settings.opacityMultiplier
        })
      : null;
    if (brush) this.#previewArrayCache.configure(brush);
    else this.#previewArrayCache.clear();
    const sourceIds = brush?.sourceIds ?? Object.freeze([]);
    this.#active = {
      settings,
      sourceIds,
      brush,
      affineModifier,
      colorModifier,
      arrayPlan: null,
      pathPlan: null,
      brushSettingsKey: brushSettingsKey(settings),
      resolvedSpacing: brush
        ? this.pathTools.resolveArrayBrushSpacing({
            brush,
            spacingMode: settings.spacingMode,
            spacingWorld: settings.spacingWorld,
            spacingScale: settings.spacingScale
          })
        : null,
      frame,
      targetType,
      surfaceTarget: targetType === "surface"
        ? drawingTargetStatus.surfaceTarget
        : null,
      surfacePlacements: [],
      lastSurfacePlacement: null,
      surfaceHits: 0,
      surfaceMisses: 0,
      plane: new THREE.Plane(
        new THREE.Vector3().fromArray(frame.normal).normalize(),
        -new THREE.Vector3().fromArray(frame.normal)
          .normalize()
          .dot(new THREE.Vector3().fromArray(frame.origin))
      ),
      pointerId: null,
      pointerType: null,
      drawing: false,
      screenPoints: [],
      points: [],
      packedPoints: new Float32Array(INITIAL_PACKED_POINT_CAPACITY * 3),
      packedPointCount: 0,
      previewCount: 0,
      previewTruncated: false,
      previousTool: this.renderer.editorState?.snapshot?.().tool?.mode ?? "select",
      previousOrbitEnabled: this.renderer.orbit.enabled,
      navigationToken:
        this.renderer.acquireToolGestureNavigation?.("path-sketch") ?? null,
      lastResult: null,
      error: null
    };
    this.renderer.setTransformMode("navigate");
    if (!this.#active.navigationToken) {
      this.renderer.orbit.enabled = false;
    }
    this.#updatePreview([]);
    this.#notify();
    return this.status();
  }

  cancel() {
    if (!this.#active) return this.status();
    this.#finishInteraction({ restoreTool: true });
    this.#active = null;
    this.#updatePreview([]);
    this.#clearResultPreview();
    this.onEnded({ reason: "cancel" });
    this.#notify();
    return this.status();
  }

  status() {
    const active = this.#active;
    return Object.freeze({
      active: Boolean(active),
      drawing: Boolean(active?.drawing),
      committing: Boolean(this.#pendingCommits.size || this.#commitQueue.length),
      pendingPublications: this.#pendingCommits.size,
      commitRequestId:
        this.#pendingCommits.values().next().value?.requestId ?? null,
      queuedCommits: this.#commitQueue.length,
      commitDiagnostics: Object.freeze({ ...this.#commitDiagnostics }),
      projectEpoch: this.#projectEpoch,
      transientResources: this.transientStatus({ scanScene: false }),
      preprocess: this.#preprocessPool.status(),
      pointCount: active?.points.length ?? 0,
      mode: active?.settings.mode ?? null,
      sourceIds: active?.sourceIds ?? EMPTY_ARRAY,
      previewCount: active?.previewCount ?? 0,
      previewTruncated: Boolean(active?.previewTruncated),
      sourceMode: active?.brush?.sourceMode ?? null,
      sourceName: active?.brush?.sourceName ?? null,
      resolvedSpacing: active?.resolvedSpacing ?? null,
      planDiagnostics: active?.arrayPlan?.diagnostics ?? null,
      previewResources: this.#previewArrayCache.status(),
      planeSource: active?.settings.planeSource ?? null,
      drawingTargetType: active?.targetType ?? null,
      surfaceTarget: active?.surfaceTarget ?? null,
      surfaceHits: active?.surfaceHits ?? 0,
      surfaceMisses: active?.surfaceMisses ?? 0,
      frame: active?.frame ?? null,
      settings: active?.settings ?? DEFAULTS,
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

  refreshDrawingFrame() {
    const active = this.#active;
    if (!active || active.drawing || active.points.length) return this.status();
    const target = this.#drawingTarget?.status?.() ?? null;
    active.targetType = target?.type === "surface" ? "surface" : "plane";
    active.surfaceTarget = active.targetType === "surface"
      ? target.surfaceTarget
      : null;
    active.surfacePlacements = [];
    active.lastSurfacePlacement = null;
    const frame = active.targetType === "surface"
      ? surfaceFallbackFrame(this.renderer, target)
      : resolveFrame(this.renderer, active.settings.planeSource);
    active.frame = frame;
    active.plane = new THREE.Plane(
      new THREE.Vector3().fromArray(frame.normal).normalize(),
      -new THREE.Vector3().fromArray(frame.normal)
        .normalize()
        .dot(new THREE.Vector3().fromArray(frame.origin))
    );
    active.arrayPlan = null;
    active.pathPlan = null;
    this.#clearResultPreview();
    this.#notify();
    return this.status();
  }

  updateSettings(patch = {}) {
    if (!this.#active) return this.status();
    const settings = normalizeSettings({
      ...this.#active.settings,
      ...patch
    });
    const affineModifier = settings.mode === "array"
      ? this.pathTools.compileArrayBrushModifier(settings)
      : null;
    const colorModifier = settings.mode === "array"
      ? this.pathTools.compileArrayBrushColorModifier(settings)
      : null;
    let brush = this.#active.brush;
    const nextBrushSettingsKey = brushSettingsKey(settings);
    if (settings.mode === "array" &&
        (!brush ||
         nextBrushSettingsKey !== this.#active.brushSettingsKey)) {
      brush = this.pathTools.captureArrayBrush({
        sourceMode: settings.sourceMode,
        sourceIds: settings.sourceMode === "selection" &&
          this.#active.sourceIds.length
          ? this.#active.sourceIds
          : null,
        geometryType: settings.geometryType,
        geometry: settings.sourceGeometry,
        color: settings.sourceColor,
        materialMode: settings.materialMode,
        opacityMultiplier: settings.opacityMultiplier
      });
      this.#previewArrayCache.configure(brush);
    } else if (settings.mode !== "array") {
      brush = null;
      this.#previewArrayCache.clear();
    }
    this.#active.settings = settings;
    this.#active.brush = brush;
    this.#active.affineModifier = affineModifier;
    this.#active.colorModifier = colorModifier;
    this.#active.arrayPlan = null;
    this.#active.pathPlan = null;
    this.#active.brushSettingsKey = nextBrushSettingsKey;
    this.#active.sourceIds = brush?.sourceIds ?? Object.freeze([]);
    this.#active.resolvedSpacing = brush
      ? this.pathTools.resolveArrayBrushSpacing({
          brush,
          spacingMode: settings.spacingMode,
          spacingWorld: settings.spacingWorld,
          spacingScale: settings.spacingScale
        })
      : null;
    this.#scheduleResultPreview(this.#active.points);
    this.#notify();
    return this.status();
  }

  subscribe(listener) {
    if (typeof listener !== "function") {
      throw new TypeError("Listener de desenho de caminho deve ser função.");
    }
    this.#listeners.add(listener);
    listener(this.status());
    return () => this.#listeners.delete(listener);
  }

  transientStatus({ scanScene = true } = {}) {
    const trackedHandoffs =
      this.#commitQueue.length + this.#pendingCommits.size;
    const scene = scanScene
      ? scanPathSketchTransients(this.renderer.scene, {
          retained: new Set([
            this.#previewTube,
            this.#previewArrayGroup,
            this.#previewLine,
            this.#previewPoints
          ])
        })
      : null;
    return Object.freeze({
      projectEpoch: this.#projectEpoch,
      active: Boolean(this.#active),
      queuedCommits: this.#commitQueue.length,
      pendingPublications: this.#pendingCommits.size,
      trackedHandoffs,
      previewTubeVisible: Boolean(this.#previewTube?.visible),
      previewArrayObjects: this.#previewArrayGroup?.children?.length ?? 0,
      scene,
      lastProjectReset: this.#lastProjectReset
    });
  }

  resetForProjectChange({ reason = "project-replaced" } = {}) {
    const previousEpoch = this.#projectEpoch;
    this.#projectEpoch += 1;
    this.#cancelCommitDrain();
    this.#cancelPendingPreview();
    this.#cancelPreviewHandoff({ clear: true });

    const pending = [...this.#pendingCommits.values()];
    this.#pendingCommits.clear();
    this.#clearCommitObservers();
    const queued = this.#commitQueue.splice(0);
    for (const publication of pending) {
      this.#disposeHandoff(publication.job?.handoff);
    }
    for (const job of queued) this.#disposeHandoff(job.handoff);

    if (this.#active) {
      this.#finishInteraction({ restoreTool: false });
      this.#active = null;
      try {
        this.onEnded({ reason: String(reason) });
      } catch {
        // A troca de projeto permanece autoritativa mesmo se a UI falhar.
      }
    }
    this.#clearInputPreview();
    this.#clearResultPreview();
    resetPreviewTransform(this.#previewTube);
    this.#previewArrayGroup.position.set(0, 0, 0);
    this.#previewArrayGroup.quaternion.identity();
    this.#previewArrayGroup.scale.set(1, 1, 1);
    this.#previewArrayGroup.updateMatrixWorld(true);
    this.#ownCommitRevisions = [];

    const purged = purgePathSketchTransients(this.renderer.scene, {
      retained: new Set([
        this.#previewTube,
        this.#previewArrayGroup,
        this.#previewLine,
        this.#previewPoints
      ])
    });
    this.#commitDiagnostics.projectResets += 1;
    this.#commitDiagnostics.purgedSceneTransients += purged;
    this.#lastProjectReset = Object.freeze({
      reason: String(reason),
      previousEpoch,
      projectEpoch: this.#projectEpoch,
      queuedJobsCancelled: queued.length,
      publicationsCancelled: pending.length,
      sceneTransientsPurged: purged,
      at: new Date().toISOString()
    });
    this.#notify();
    return this.#lastProjectReset;
  }

  dispose() {
    this.#cancelCommitDrain();
    const pending = [...this.#pendingCommits.values()];
    this.#clearCommitObservers();
    this.#pendingCommits.clear();
    for (const publication of pending) {
      this.#disposeHandoff(publication.job?.handoff);
    }
    for (const job of this.#commitQueue.splice(0)) {
      this.#disposeHandoff(job.handoff);
    }
    if (this.#active) {
      this.#finishInteraction({ restoreTool: true });
      this.#active = null;
      this.#updatePreview([]);
      this.#clearResultPreview();
    }
    this.#bind(false);
    this.#cancelPreviewHandoff({ clear: true });
    this.#cancelPendingPreview();
    this.#previewArrayCache.dispose();
    this.#preprocessPool.dispose();
    this.renderer.scene.remove(
      this.#previewTube,
      this.#previewArrayGroup,
      this.#previewLine,
      this.#previewPoints
    );
    this.#previewTube.geometry.dispose();
    this.#previewTube.material.dispose();
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
    if (this.renderer.isToolNavigationGesture?.(event)) {
      this.#cancelInputDraft();
      return;
    }
    try {
      this.#refreshBrushRevision();
    } catch (error) {
      active.error = error?.message ?? String(error);
      this.#notify();
      return;
    }
    const point = this.#worldPoint(event);
    if (!point) return;
    /*
     * Um gesto novo tem prioridade sobre uma publicação ainda não iniciada.
     * O plano já está selado na fila e pode ser despachado no próximo intervalo.
     */
    this.#cancelCommitDrain();
    event.preventDefault();
    if (event.pointerType !== "touch") {
      event.stopImmediatePropagation();
    }
    this.#cancelPreviewHandoff({ clear: true });
    active.pointerId = event.pointerId;
    active.pointerType = event.pointerType || "mouse";
    active.drawing = true;
    active.error = null;
    active.points = [point];
    active.screenPoints = [[event.clientX, event.clientY]];
    active.surfacePlacements = active.lastSurfacePlacement
      ? [active.lastSurfacePlacement]
      : [];
    active.packedPoints = new Float32Array(
      INITIAL_PACKED_POINT_CAPACITY * 3
    );
    active.packedPointCount = 0;
    this.#appendPackedPoint(active, point);
    active.arrayPlan = null;
    active.pathPlan = null;
    if (active.pointerType !== "touch") {
      this.renderer.canvas.setPointerCapture?.(event.pointerId);
    }
    this.#updatePreview(active.points);
    this.#notify();
  };

  #refreshBrushRevision() {
    const active = this.#active;
    if (active?.settings.mode !== "array" || !active.brush) return false;
    const currentRevision = Number(this.pathTools.sandbox?.revision);
    if (
      Number.isInteger(currentRevision) &&
      active.brush.sourceRevision === currentRevision
    ) {
      return false;
    }
    const previousBrush = active.brush;
    const nextBrush = this.pathTools.rebaseArrayBrush({
      brush: previousBrush,
      createdIds: this.#ownCreatedIdsSince(
        previousBrush.sourceRevision,
        currentRevision
      )
    });
    active.brush = nextBrush;
    active.sourceIds = nextBrush.sourceIds ?? Object.freeze([]);
    active.arrayPlan = null;
    active.pathPlan = null;
    active.resolvedSpacing = this.pathTools.resolveArrayBrushSpacing({
      brush: nextBrush,
      spacingMode: active.settings.spacingMode,
      spacingWorld: active.settings.spacingWorld,
      spacingScale: active.settings.spacingScale
    });
    if (nextBrush.key !== previousBrush.key) {
      this.#previewArrayCache.configure(nextBrush);
    }
    return true;
  }

  #ownCreatedIdsSince(fromRevision, toRevision) {
    const from = Number(fromRevision);
    const to = Number(toRevision);
    if (!Number.isInteger(from) || !Number.isInteger(to) || to <= from) {
      return [];
    }
    const relevant = this.#ownCommitRevisions
      .filter(entry => entry.revision > from && entry.revision <= to)
      .sort((left, right) => left.revision - right.revision);
    if (relevant.length !== to - from) return [];
    for (let index = 0; index < relevant.length; index += 1) {
      if (relevant[index].revision !== from + index + 1) return [];
    }
    return relevant.flatMap(entry => entry.createdIds);
  }

  #rebaseQueuedArrayJob(job) {
    if (job.mode !== "array" || !job.brush) return false;
    const currentRevision = Number(this.pathTools.sandbox?.revision);
    if (!Number.isInteger(currentRevision) ||
        job.brush.sourceRevision === currentRevision) {
      return false;
    }
    const createdIds = this.#ownCreatedIdsSince(
      job.brush.sourceRevision,
      currentRevision
    );
    const previousKey = job.brush.key;
    if (job.plan) {
      const rebased = this.pathTools.rebaseArrayBrushPlan({
        plan: job.plan,
        brush: job.brush,
        createdIds
      });
      job.plan = rebased.plan;
      job.brush = rebased.brush;
    } else {
      job.brush = this.pathTools.rebaseArrayBrush({
        brush: job.brush,
        createdIds
      });
    }
    this.#commitDiagnostics.lazyQueueRebases += 1;
    if (job.brush.key !== previousKey) {
      this.#commitDiagnostics.sourceRecaptures += 1;
    }
    return true;
  }

  #onPointerMove = event => {
    const active = this.#active;
    if (active && this.renderer.isToolNavigationGesture?.(event)) {
      this.#cancelInputDraft();
      return;
    }
    if (!active?.drawing || event.pointerId !== active.pointerId) return;
    event.preventDefault();
    if (event.pointerType !== "touch") {
      event.stopImmediatePropagation();
    }
    this.#appendPointerSamples(event);
  };

  #onPointerUp = event => {
    const active = this.#active;
    if (active && this.renderer.isToolNavigationGesture?.(event)) {
      this.#cancelInputDraft();
      return;
    }
    if (!active?.drawing || event.pointerId !== active.pointerId) return;
    const startedAt = nowMs();
    event.preventDefault();
    if (event.pointerType !== "touch") {
      event.stopImmediatePropagation();
      this.renderer.canvas.releasePointerCapture?.(event.pointerId);
    }
    /* Recupera amostras que o navegador acumulou enquanto a thread principal
       estava ocupada e inclui explicitamente a coordenada final. */
    this.#appendPointerSamples(event, { forceLast: true });
    active.drawing = false;
    active.pointerId = null;
    active.pointerType = null;
    try {
      this.#flushPendingResultPreview();
      const hadPendingPreview = this.#pendingPreviewPoints !== null;
      const currentPlan = active.settings.mode === "array"
        ? active.arrayPlan
        : active.pathPlan;
      /* Transfere a propriedade do array para a fila. Não copia P pontos no
         encerramento; #resetAfterSealedStroke instala arrays novos. */
      const rawPoints = active.points;
      if (rawPoints.length < 2) {
        throw new Error("O traço é curto demais para formar um caminho.");
      }
      const preparedPoints = active.settings.mode === "array"
        ? currentPlan?.path?.points
        : currentPlan?.points;
      const job = {
        id: ++this.#commitSequence,
        projectEpoch: this.#projectEpoch,
        mode: active.settings.mode,
        plan: currentPlan,
        rawPoints,
        packedPoints: active.packedPoints,
        packedPointCount: active.packedPointCount,
        needsPreparation: hadPendingPreview || !currentPlan,
        planReady: !hadPendingPreview && Boolean(currentPlan),
        preprocessingPending: false,
        preprocessingError: null,
        preprocessedPoints: null,
        brush: active.brush,
        affineModifier: active.affineModifier,
        colorModifier: active.colorModifier,
        resolvedSpacing: active.resolvedSpacing,
        settings: active.settings,
        points: Array.isArray(preparedPoints)
          ? preparedPoints
          : rawPoints,
        sourceIds: active.sourceIds,
        frame: active.frame,
        targetType: active.targetType,
        surfaceTarget: active.surfaceTarget,
        surfacePlacements: active.surfacePlacements,
        handoff: this.#sealResultPreview(active.settings.mode),
        sealedAt: nowMs()
      };
      this.#resetAfterSealedStroke(active);
      this.#enqueueCommit(job, { notify: false });
      const elapsed = nowMs() - startedAt;
      this.#commitDiagnostics.lastPointerUpMs = elapsed;
      this.#commitDiagnostics.maximumPointerUpMs = Math.max(
        this.#commitDiagnostics.maximumPointerUpMs,
        elapsed
      );
      this.#notify();
    } catch (error) {
      active.error = error?.message ?? String(error);
      active.points = [];
      active.screenPoints = [];
      active.surfacePlacements = [];
      active.lastSurfacePlacement = null;
      active.packedPoints = new Float32Array(
        INITIAL_PACKED_POINT_CAPACITY * 3
      );
      active.packedPointCount = 0;
      active.arrayPlan = null;
      active.pathPlan = null;
      this.#updatePreview([]);
      this.#clearResultPreview();
      this.#notify();
    }
  };

  #appendPointerSamples(event, { forceLast = false } = {}) {
    const active = this.#active;
    if (!active?.drawing) return 0;
    this.#commitDiagnostics.pointerEvents += 1;
    const coalesced = typeof event.getCoalescedEvents === "function"
      ? event.getCoalescedEvents()
      : [];
    const samples = coalesced.length ? [...coalesced] : [];
    const last = samples.at(-1);
    if (!last || last.clientX !== event.clientX || last.clientY !== event.clientY) {
      samples.push(event);
    }
    this.#commitDiagnostics.coalescedSamples += Math.max(0, samples.length - 1);
    let accepted = 0;
    for (let index = 0; index < samples.length; index += 1) {
      const sample = samples[index];
      if (sample.pointerId !== undefined &&
          sample.pointerId !== active.pointerId) continue;
      const previous = active.screenPoints.at(-1);
      const isFinal = forceLast && index === samples.length - 1;
      if (!isFinal && previous &&
          Math.hypot(sample.clientX - previous[0], sample.clientY - previous[1]) <
            active.settings.inputSamplePixels) {
        continue;
      }
      const point = this.#worldPoint(sample);
      if (!point || near3(point, active.points.at(-1))) continue;
      active.points.push(point);
      active.screenPoints.push([sample.clientX, sample.clientY]);
      if (active.lastSurfacePlacement) {
        active.surfacePlacements.push(active.lastSurfacePlacement);
      }
      this.#appendPackedPoint(active, point);
      accepted += 1;
    }
    if (accepted) {
      this.#commitDiagnostics.acceptedSamples += accepted;
      this.#updatePreview(active.points);
    }
    return accepted;
  }

  #appendPackedPoint(active, point) {
    const required = (active.packedPointCount + 1) * 3;
    if (required > active.packedPoints.length) {
      let nextLength = Math.max(
        INITIAL_PACKED_POINT_CAPACITY * 3,
        active.packedPoints.length * 2
      );
      while (nextLength < required) nextLength *= 2;
      const expanded = new Float32Array(nextLength);
      expanded.set(
        active.packedPoints.subarray(0, active.packedPointCount * 3)
      );
      active.packedPoints = expanded;
    }
    const offset = active.packedPointCount * 3;
    active.packedPoints[offset] = point[0];
    active.packedPoints[offset + 1] = point[1];
    active.packedPoints[offset + 2] = point[2];
    active.packedPointCount += 1;
  }

  #onPointerCancel = event => {
    const active = this.#active;
    if (!active?.drawing || event.pointerId !== active.pointerId) return;
    event.preventDefault();
    if (event.pointerType !== "touch") {
      this.renderer.canvas.releasePointerCapture?.(event.pointerId);
    }
    this.#cancelInputDraft();
  };

  #cancelInputDraft() {
    const active = this.#active;
    if (!active) return false;
    const changed =
      active.pointerId !== null ||
      active.pointerType !== null ||
      active.drawing ||
      active.points.length > 0 ||
      active.screenPoints.length > 0 ||
      active.arrayPlan !== null ||
      active.pathPlan !== null;
    if (!changed) return false;
    if (active.pointerId !== null && active.pointerType !== "touch") {
      this.renderer.canvas.releasePointerCapture?.(active.pointerId);
    }
    active.pointerId = null;
    active.pointerType = null;
    active.drawing = false;
    active.points = [];
    active.screenPoints = [];
    active.surfacePlacements = [];
    active.lastSurfacePlacement = null;
    active.packedPoints = new Float32Array(
      INITIAL_PACKED_POINT_CAPACITY * 3
    );
    active.packedPointCount = 0;
    active.arrayPlan = null;
    active.pathPlan = null;
    this.#updatePreview([]);
    this.#clearResultPreview();
    this.#scheduleCommitDrain();
    this.#notify();
    return true;
  }

  #onKeyDown = event => {
    if (!this.#active || event.key !== "Escape") return;
    event.preventDefault();
    this.cancel();
  };

  #worldPoint(event) {
    const active = this.#active;
    if (active?.targetType === "surface") {
      const placement = this.#drawingTarget?.resolvePointerPlacement?.({
        clientX: event.clientX,
        clientY: event.clientY,
        previous: active.lastSurfacePlacement,
        target: active.surfaceTarget
      });
      if (!placement?.point) {
        active.surfaceMisses += 1;
        return null;
      }
      active.surfaceHits += 1;
      active.lastSurfacePlacement = placement;
      if (!active.surfacePlacements.length) {
        active.frame = frameFromSurfacePlacement(
          placement,
          this.renderer.camera
        );
      }
      return [...placement.point];
    }
    const rect = this.renderer.canvas.getBoundingClientRect();
    this.#pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
    this.#raycaster.setFromCamera(this.#pointer, this.renderer.camera);
    const point = this.#raycaster.ray.intersectPlane(
      active.plane,
      new THREE.Vector3()
    );
    if (!point) return null;
    const transform = this.renderer.getTransformConfig?.() ?? {};
    return [...constrainPlanarPoint({
      frame: active.frame,
      point: point.toArray(),
      anchor: active.points.at(-1) ?? null,
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

  #finishInteraction({ restoreTool }) {
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

  #updatePreview(points) {
    const reallocated = this.#ensureInputCapacity(points.length);
    const start = reallocated || points.length < this.#inputPointCount
      ? 0
      : this.#inputPointCount;
    for (let index = start; index < points.length; index += 1) {
      const offset = index * 3;
      const point = points[index];
      this.#inputPositionArray[offset] = point[0];
      this.#inputPositionArray[offset + 1] = point[1];
      this.#inputPositionArray[offset + 2] = point[2];
    }
    if (this.#inputPositionAttribute && points.length > start) {
      const offset = start * 3;
      const count = (points.length - start) * 3;
      if (typeof this.#inputPositionAttribute.addUpdateRange === "function") {
        this.#inputPositionAttribute.addUpdateRange(offset, count);
      } else if (this.#inputPositionAttribute.updateRange) {
        this.#inputPositionAttribute.updateRange.offset = offset;
        this.#inputPositionAttribute.updateRange.count = count;
      }
      this.#inputPositionAttribute.needsUpdate = true;
    }
    this.#inputPointCount = points.length;
    for (const object of [this.#previewLine, this.#previewPoints]) {
      object.geometry.setDrawRange(0, points.length);
      object.visible = points.length > 0;
    }
    this.#scheduleResultPreview(points);
  }

  #ensureInputCapacity(pointCount) {
    if (this.#inputCapacity >= pointCount &&
        this.#inputPositionAttribute) {
      return false;
    }
    let capacity = Math.max(64, this.#inputCapacity || 0);
    while (capacity < pointCount) capacity *= 2;
    this.#inputCapacity = capacity;
    this.#inputPositionArray = new Float32Array(capacity * 3);
    this.#inputPositionAttribute = new THREE.BufferAttribute(
      this.#inputPositionArray,
      3
    );
    this.#inputPositionAttribute.setUsage(THREE.DynamicDrawUsage);
    this.#inputPointCount = 0;
    for (const object of [this.#previewLine, this.#previewPoints]) {
      object.geometry.setAttribute(
        "position",
        this.#inputPositionAttribute
      );
      object.geometry.setDrawRange(0, 0);
    }
    return true;
  }

  #scheduleResultPreview(points) {
    this.#pendingPreviewPoints = points;
    if (this.#previewFrame !== null) return;
    if (typeof globalThis.requestAnimationFrame !== "function") {
      this.#flushResultPreview();
      return;
    }
    this.#previewFrame = globalThis.requestAnimationFrame(() => {
      this.#previewFrame = null;
      this.#flushResultPreview();
    });
  }

  #flushResultPreview() {
    const points = this.#pendingPreviewPoints ?? [];
    this.#pendingPreviewPoints = null;
    const active = this.#active;
    if (!active || points.length < 2) {
      this.#clearResultPreview();
      return;
    }
    try {
      const surfaceTarget = active.targetType === "surface";
      const curveType = surfaceTarget
        ? "polyline"
        : active.settings.curveType;
      const prepared = active.settings.mode === "array" || surfaceTarget
        ? this.pathTools.prepareSketchPoints({
            points,
            curveType,
            tension: active.settings.tension
          })
        : prepareFreehandPoints(points, active.settings);
      if (active.settings.mode === "array") {
        active.pathPlan = null;
        this.#renderArrayPreview(this.pathTools.previewArrayBrush({
          points: prepared,
          brush: active.brush,
          spacing: active.resolvedSpacing,
          align: active.settings.align,
          closed: active.settings.closed,
          curveType,
          tension: active.settings.tension,
          twistDegrees: active.settings.twistDegrees,
          initialNormal: active.frame.normal,
          orientationMode: active.settings.orientationMode,
          affineModifier: active.affineModifier,
          colorModifier: active.colorModifier,
          affineULength: active.settings.affineULength,
          previousPlan: active.arrayPlan,
          maximumCopies: 10000
        }));
        this.#previewTube.visible = false;
      } else {
        this.#clearArrayPreview();
        const pathPlan = this.pathTools.preparePathCreatePlan({
          points: prepared,
          name: active.settings.name || "Tubo desenhado",
          radius: active.settings.radius,
          tubularSegments: Math.max(
            active.settings.tubularSegments,
            prepared.length * 4
          ),
          radialSegments: active.settings.radialSegments,
          closed: active.settings.closed,
          curveType,
          tension: active.settings.tension,
          color: active.settings.color,
          materialMode: active.settings.materialMode,
          opacityMultiplier: active.settings.opacityMultiplier
        });
        active.pathPlan = pathPlan;
        active.arrayPlan = null;
        const geometry = this.geometryRegistry.create({
          ...pathPlan.geometry,
          tubularSegments: Math.min(
            pathPlan.geometry.tubularSegments,
            Math.max(8, pathPlan.points.length * 4)
          ),
          radialSegments: Math.min(
            pathPlan.geometry.radialSegments,
            12
          )
        });
        this.#previewTube.geometry = updateDynamicPreviewGeometry(
          this.#previewTube.geometry,
          geometry
        );
        this.#previewTube.material = updatePreviewMaterial(
          this.#previewTube.material,
          active.settings.materialMode,
          active.settings.color,
          0.66 * active.settings.opacityMultiplier
        );
        applyPathPlanTransform(this.#previewTube, pathPlan);
        this.#previewTube.visible = true;
        active.previewCount = 1;
        active.previewTruncated = false;
      }
      active.error = null;
    } catch (error) {
      active.error = error?.message ?? String(error);
      if (!(active.settings.mode === "array" && active.arrayPlan)) {
        this.#clearResultPreview();
      }
    }
    this.#notify();
  }

  #renderArrayPreview(plan) {
    const active = this.#active;
    if (active?.brush &&
        this.#previewArrayCache.status().brushKey !== active.brush.key) {
      this.#previewArrayCache.configure(active.brush);
    }
    const rendered = this.#previewArrayCache.update(plan);
    if (this.#active) {
      this.#active.arrayPlan = plan;
      this.#active.previewCount = rendered.previewCount;
      this.#active.previewTruncated = rendered.truncated;
    }
  }

  #clearArrayPreview() {
    this.#previewArrayCache.clear();
  }

  #clearResultPreview() {
    this.#cancelPendingPreview();
    this.#previewTube.visible = false;
    resetPreviewTransform(this.#previewTube);
    this.#clearArrayPreview();
    if (this.#active) {
      this.#active.arrayPlan = null;
      this.#active.pathPlan = null;
      this.#active.previewCount = 0;
      this.#active.previewTruncated = false;
    }
  }

  #clearInputPreview() {
    this.#inputPointCount = 0;
    for (const object of [this.#previewLine, this.#previewPoints]) {
      object.geometry.setDrawRange(0, 0);
      object.visible = false;
    }
  }

  #flushPendingResultPreview() {
    if (this.#pendingPreviewPoints === null) return;
    if (this.#previewFrame !== null &&
        typeof globalThis.cancelAnimationFrame === "function") {
      globalThis.cancelAnimationFrame(this.#previewFrame);
    }
    this.#previewFrame = null;
    this.#flushResultPreview();
  }

  #sealResultPreview(mode) {
    this.#cancelPendingPreview();
    if (mode === "array") {
      const coordinated = typeof this.pathTools.sandbox?.coordinationStatus ===
        "function";
      if (this.#active?.settings?.continuous && !coordinated) {
        return {
          kind: "array-reusable",
          projectEpoch: this.#projectEpoch,
          disposed: false,
          group: this.#previewArrayGroup,
          cache: this.#previewArrayCache
        };
      }
      const handoff = {
        kind: "array",
        projectEpoch: this.#projectEpoch,
        disposed: false,
        group: this.#previewArrayGroup,
        cache: this.#previewArrayCache
      };
      handoff.group.name = `path-sketch-array-handoff-${
        this.#commitSequence
      }`;
      handoff.group.userData.pathSketchHandoff = true;
      this.#previewArrayGroup = new THREE.Group();
      this.#previewArrayGroup.name = "path-sketch-array-preview";
      this.#previewArrayGroup.renderOrder = 1499;
      this.#previewArrayCache = new PathInstancePreviewCache({
        group: this.#previewArrayGroup,
        geometryRegistry: this.geometryRegistry,
        maximumInstances: 4096
      });
      this.renderer.scene.add(this.#previewArrayGroup);
      return handoff;
    }
    const handoff = {
      kind: "tube",
      projectEpoch: this.#projectEpoch,
      disposed: false,
      mesh: this.#previewTube
    };
    handoff.mesh.name = `path-sketch-tube-handoff-${
      this.#commitSequence
    }`;
    handoff.mesh.userData.pathSketchHandoff = true;
    this.#previewTube = createPreviewTube();
    this.renderer.scene.add(this.#previewTube);
    return handoff;
  }

  #resetAfterSealedStroke(active) {
    this.#clearInputPreview();
    active.pointerId = null;
    active.pointerType = null;
    active.drawing = false;
    active.points = [];
    active.screenPoints = [];
    active.surfacePlacements = [];
    active.lastSurfacePlacement = null;
    active.packedPoints = new Float32Array(
      INITIAL_PACKED_POINT_CAPACITY * 3
    );
    active.packedPointCount = 0;
    active.arrayPlan = null;
    active.pathPlan = null;
    active.previewCount = 0;
    active.previewTruncated = false;
    active.error = null;
    if (active.settings.continuous) return;
    this.#finishInteraction({ restoreTool: true });
    this.#active = null;
    this.onEnded({ reason: "completed" });
  }

  #enqueueCommit(job, { notify = true } = {}) {
    if (job.projectEpoch !== this.#projectEpoch) {
      this.#disposeHandoff(job.handoff);
      return;
    }
    if (this.#commitQueue.length >= 64) {
      this.#disposeHandoff(job.handoff);
      throw new Error(
        "A fila de publicação atingiu 64 traços; aguarde o sandbox."
      );
    }
    if (job.needsPreparation && this.#preprocessPool.status().workers > 0) {
      job.preprocessingPending = true;
      job.preprocessingPromise = this.#preprocessPool.prepare({
        points: job.rawPoints,
        packedPoints: job.packedPoints,
        pointCount: job.packedPointCount,
        settings: job.targetType === "surface"
          ? {
              ...job.settings,
              simplify: 0,
              smoothIterations: 0,
              curveType: "polyline"
            }
          : job.settings,
        mode: job.mode
      }).then(points => {
        if (job.projectEpoch !== this.#projectEpoch) {
          this.#commitDiagnostics.staleWorkerResults += 1;
          return;
        }
        job.preprocessedPoints = points;
        job.preprocessingPending = false;
        this.#commitDiagnostics.workerPreparedStrokes += 1;
        this.#scheduleCommitDrain();
      }).catch(error => {
        if (job.projectEpoch !== this.#projectEpoch) {
          this.#commitDiagnostics.staleWorkerResults += 1;
          return;
        }
        job.preprocessingError = error;
        job.preprocessingPending = false;
        this.#scheduleCommitDrain();
      });
    }
    this.#commitQueue.push(job);
    this.#commitDiagnostics.sealedStrokes += 1;
    if (job.planReady && !job.preprocessingPending && !this.#active?.drawing) {
      this.#drainCommitQueue({ allowPreparation: false });
    } else {
      this.#scheduleCommitDrain();
    }
    if (notify) this.#notify();
  }

  #scheduleCommitDrain() {
    if (this.#commitDrainHandle !== null || !this.#commitQueue.length) return;
    const run = () => {
      this.#commitDrainHandle = null;
      const pendingInput = inputPending();
      const now = nowMs();
      if (pendingInput) {
        this.#commitDrainDeferredAt ??= now;
        if (now - this.#commitDrainDeferredAt < 40) {
          this.#scheduleCommitDrain();
          return;
        }
        this.#commitDiagnostics.forcedDrainsWithInput += 1;
      }
      this.#commitDrainDeferredAt = null;
      this.#drainCommitQueue({
        allowPreparation: !pendingInput && !this.#active?.drawing
      });
    };
    if (typeof globalThis.requestAnimationFrame === "function") {
      this.#commitDrainHandle = {
        kind: "frame",
        id: globalThis.requestAnimationFrame(run)
      };
      return;
    }
    this.#commitDrainHandle = {
      kind: "timeout",
      id: globalThis.setTimeout(run, 16)
    };
  }

  #cancelCommitDrain() {
    const handle = this.#commitDrainHandle;
    if (!handle) return;
    if (handle.kind === "frame" &&
        typeof globalThis.cancelAnimationFrame === "function") {
      globalThis.cancelAnimationFrame(handle.id);
    } else {
      globalThis.clearTimeout(handle.id);
    }
    this.#commitDrainHandle = null;
    this.#commitDrainDeferredAt = null;
  }

  #prepareQueuedPlan(job) {
    if (job.preprocessingError) throw job.preprocessingError;
    this.#rebaseQueuedArrayJob(job);
    if (job.preprocessingPending) {
      throw new Error("Pré-processamento do traço ainda não terminou.");
    }
    if (!job.needsPreparation && job.plan) return job.plan;
    const sourcePoints = job.preprocessedPoints ?? job.rawPoints;
    const surfaceTarget = job.targetType === "surface";
    const curveType = surfaceTarget ? "polyline" : job.settings.curveType;
    if (!job.preprocessedPoints) {
      this.#commitDiagnostics.synchronousPreparedStrokes += 1;
    }
    if (job.mode === "array") {
      const prepared = this.pathTools.prepareSketchPoints({
        points: sourcePoints,
        curveType,
        tension: job.settings.tension
      });
      job.plan = this.pathTools.previewArrayBrush({
        points: prepared,
        brush: job.brush,
        spacing: job.resolvedSpacing,
        align: job.settings.align,
        closed: job.settings.closed,
        curveType,
        tension: job.settings.tension,
        twistDegrees: job.settings.twistDegrees,
        initialNormal: job.frame.normal,
        orientationMode: job.settings.orientationMode,
        affineModifier: job.affineModifier,
        colorModifier: job.colorModifier,
        affineULength: job.settings.affineULength,
        previousPlan: job.plan,
        maximumCopies: 10000
      });
      job.points = job.plan.path.points;
    } else {
      const prepared = job.preprocessedPoints ?? (
        surfaceTarget
          ? this.pathTools.prepareSketchPoints({
              points: sourcePoints,
              curveType,
              tension: job.settings.tension
            })
          : prepareFreehandPoints(sourcePoints, job.settings)
      );
      job.plan = this.pathTools.preparePathCreatePlan({
        points: prepared,
        name: job.settings.name || "Tubo desenhado",
        radius: job.settings.radius,
        tubularSegments: Math.max(
          job.settings.tubularSegments,
          prepared.length * 4
        ),
        radialSegments: job.settings.radialSegments,
        closed: job.settings.closed,
        curveType,
        tension: job.settings.tension,
        color: job.settings.color,
        materialMode: job.settings.materialMode,
        opacityMultiplier: job.settings.opacityMultiplier
      });
      job.points = job.plan.points;
    }
    job.needsPreparation = false;
    job.planReady = true;
    return job.plan;
  }

  #drainCommitQueue({ allowPreparation = true } = {}) {
    while (this.#commitQueue[0]?.projectEpoch !== this.#projectEpoch) {
      const stale = this.#commitQueue.shift();
      this.#disposeHandoff(stale?.handoff);
    }
    const head = this.#commitQueue[0];
    if (!head) return;

    /* Preparação geométrica pesada nunca concorre com um gesto ativo. Jobs já
       preparados podem ser despachados; os demais aguardam uma lacuna real de
       entrada, preservando a coleta de pointermove. */
    if (!head.planReady) {
      if (!allowPreparation) {
        this.#scheduleCommitDrain();
        return;
      }
      const preparable = !head.preprocessingPending
        ? head
        : this.#commitQueue.find(job =>
            !job.planReady && !job.preprocessingPending
          );
      if (!preparable) return;
      const startedAt = nowMs();
      try {
        this.#prepareQueuedPlan(preparable);
        preparable.planReady = true;
        const elapsed = nowMs() - startedAt;
        this.#commitDiagnostics.preparedQueueJobs += 1;
        this.#commitDiagnostics.lastPrepareMs = elapsed;
        this.#commitDiagnostics.maximumPrepareMs = Math.max(
          this.#commitDiagnostics.maximumPrepareMs,
          elapsed
        );
      } catch (error) {
        preparable.preprocessingError = error;
        preparable.planReady = true;
      }
      this.#scheduleCommitDrain();
      return;
    }

    const job = this.#commitQueue.shift();
    try {
      if (job.preprocessingError) throw job.preprocessingError;
      const dispatchStartedAt = nowMs();
      const queueWaitMs = dispatchStartedAt - job.sealedAt;
      if (job.mode === "array") this.#rebaseQueuedArrayJob(job);
      const plan = job.plan;
      if (!plan) throw new Error("Plano preparado ausente na fila do traço.");
      const result = job.mode === "array"
        ? this.pathTools.commitArrayBrushPlan({
            plan,
            brush: job.brush,
            anchorPolicy: job.settings.anchorPolicy
          })
        : this.pathTools.commitPathCreatePlan({ plan });
      const dispatchMs = nowMs() - dispatchStartedAt;
      this.#commitDiagnostics.dispatchedStrokes += 1;
      this.#commitDiagnostics.lastQueueWaitMs = queueWaitMs;
      this.#commitDiagnostics.maximumQueueWaitMs = Math.max(
        this.#commitDiagnostics.maximumQueueWaitMs,
        queueWaitMs
      );
      this.#commitDiagnostics.lastDispatchMs = dispatchMs;
      this.#commitDiagnostics.maximumDispatchMs = Math.max(
        this.#commitDiagnostics.maximumDispatchMs,
        dispatchMs
      );
      const completion = Object.freeze({
        result,
        settings: job.settings,
        points: job.points,
        sourceIds: job.sourceIds,
        frame: job.frame,
        targetType: job.targetType,
        surfaceTarget: job.surfaceTarget,
        surfacePlacements: job.surfacePlacements,
        preparedPlan: plan
      });
      this.#beginCommitHandoff(job, completion);
    } catch (error) {
      this.#disposeHandoff(job.handoff);
      this.#commitDiagnostics.failedStrokes += 1;
      if (this.#active) {
        this.#active.error = error?.message ?? String(error);
      }
      this.#scheduleCommitDrain();
      this.#notify();
    }
  }

  #beginCommitHandoff(job, completion) {
    if (job.projectEpoch !== this.#projectEpoch) {
      this.#disposeHandoff(job.handoff);
      return;
    }
    const createdIds = resultCreatedIds(completion?.result);
    if (!completion?.result?.changed || !createdIds.length) {
      this.#disposeHandoff(job.handoff);
      throw new Error("O comando do traço não publicou objetos.");
    }
    const coordination = this.pathTools.sandbox?.coordinationStatus?.();
    const outcome = coordination?.lastOutcome;
    const requestId = outcome?.status === "queued"
      ? outcome.requestId ?? null
      : null;
    const revisionAfterDispatch = Number(this.pathTools.sandbox?.revision);
    if (Number.isInteger(revisionAfterDispatch) && !requestId) {
      this.#recordOwnCommitRevision(revisionAfterDispatch, createdIds);
    }
    const pending = {
      id: job.id,
      job,
      completion,
      createdIds,
      requestId,
      revisionAfterDispatch,
      dispatchedAt: nowMs(),
      projectEpoch: job.projectEpoch,
      accepted: !requestId,
      logicalSeen: this.#committedObjectsPresent(createdIds)
    };
    this.#pendingCommits.set(job.id, pending);
    this.#ensureCommitObservers();
    this.#observePendingCommits();
    /* A projeção visual pode terminar depois. Ela não serializa a integração
       lógica dos próximos capsules já preparados. */
    this.#scheduleCommitDrain();
  }

  #releaseCommittedHandoff(job) {
    this.#disposeHandoff(job.handoff);
    if (!this.#active?.drawing &&
        !this.#active?.arrayPlan &&
        !this.#active?.pathPlan) {
      this.#clearResultPreview();
    }
  }

  #deferResultPreviewClear(job) {
    const schedule = callback => {
      const id = globalThis.requestAnimationFrame(() => {
        const index = this.#handoffFrames.indexOf(id);
        if (index >= 0) this.#handoffFrames.splice(index, 1);
        callback();
      });
      this.#handoffFrames.push(id);
    };
    schedule(() => schedule(() => this.#releaseCommittedHandoff(job)));
  }

  #recordOwnCommitRevision(revision, createdIds) {
    const existing = this.#ownCommitRevisions.find(
      entry => entry.revision === revision
    );
    if (existing) return;
    this.#ownCommitRevisions.push(Object.freeze({
      revision,
      createdIds: Object.freeze(createdIds.map(String))
    }));
    this.#ownCommitRevisions.sort((left, right) =>
      left.revision - right.revision
    );
    if (this.#ownCommitRevisions.length > 256) {
      this.#ownCommitRevisions.splice(0, this.#ownCommitRevisions.length - 256);
    }
  }

  #ensureCommitObservers() {
    if (this.#commitObservers.length) return;
    const sandbox = this.pathTools.sandbox;
    if (typeof sandbox?.subscribe === "function") {
      this.#commitObservers.push(
        sandbox.subscribe(() =>
          queueMicrotask(() => this.#observePendingCommits())
        )
      );
    }
    if (typeof sandbox?.subscribeCoordination === "function") {
      this.#commitObservers.push(
        sandbox.subscribeCoordination(
          status => queueMicrotask(() =>
            this.#observePendingCoordination(status)
          )
        )
      );
    }
    if (typeof this.renderer.subscribeObjectVisuals === "function") {
      this.#commitObservers.push(
        this.renderer.subscribeObjectVisuals(() =>
          this.#observePendingCommits()
        )
      );
    }
  }

  #observePendingCommits() {
    for (const pending of [...this.#pendingCommits.values()]) {
      if (pending.projectEpoch !== this.#projectEpoch) {
        this.#pendingCommits.delete(pending.id);
        this.#disposeHandoff(pending.job?.handoff);
        continue;
      }
      const present = this.#committedObjectsPresent(pending.createdIds);
      if (present) pending.logicalSeen = true;
      /*
       * Um undo pode remover o objeto lógico antes que uma geometria muito
       * grande termine de nascer no renderer. Nesse caso o handoff nunca deve
       * aguardar um visual que já não pode existir.
       */
      if (!present && pending.accepted && pending.logicalSeen) {
        this.#cancelPendingPublicationByRemoval(pending);
        continue;
      }
      if (!present || !this.#committedVisualsPresent(pending.createdIds)) {
        continue;
      }
      this.#completeCommittedStroke(pending);
    }
  }

  #observePendingCoordination(status) {
    if (!status?.lastOutcome) return;
    const outcome = status.lastOutcome;
    const pending = [...this.#pendingCommits.values()].find(item =>
      item.requestId && item.requestId === outcome.requestId
    );
    if (!pending) return;
    if (outcome.status === "accepted") {
      pending.accepted = true;
      const revision = Number(this.pathTools.sandbox?.revision);
      if (Number.isInteger(revision)) {
        this.#recordOwnCommitRevision(revision, pending.createdIds);
      }
      this.#observePendingCommits();
      return;
    }
    if (!String(outcome.status).startsWith("rejected")) return;
    const detail = outcome.error ? `: ${outcome.error}` : "";
    this.#failPendingCommit(
      pending,
      `A publicação do traço foi rejeitada (${outcome.status})${detail}.`
    );
  }

  #committedObjectsPresent(createdIds) {
    const getObject = this.pathTools.sandbox?.getObject;
    if (typeof getObject === "function") {
      return createdIds.every(id =>
        Boolean(getObject.call(this.pathTools.sandbox, id))
      );
    }
    const objects = this.pathTools.sandbox?.getSnapshot?.().objects;
    if (!Array.isArray(objects)) return false;
    const available = new Set(objects.map(object => String(object.id)));
    return createdIds.every(id => available.has(String(id)));
  }

  #committedVisualsPresent(createdIds) {
    if (typeof this.renderer.hasObjectVisual !== "function") return true;
    return createdIds.every(id => this.renderer.hasObjectVisual(id));
  }

  #cancelPendingPublicationByRemoval(pending) {
    if (!this.#pendingCommits.delete(pending.id)) return;
    this.#disposeHandoff(pending.job?.handoff);
    this.#commitDiagnostics.publicationsCancelledByUndo += 1;
    this.#commitDiagnostics.handoffsReleasedByUndo += 1;
    if (this.#active && this.#active.lastResult === pending.completion?.result) {
      this.#active.lastResult = null;
    }
    this.#clearCommitObserversIfIdle();
    this.#scheduleCommitDrain();
    this.#notify();
  }

  #completeCommittedStroke(pending) {
    if (!this.#pendingCommits.delete(pending.id)) return;
    const { job, completion } = pending;
    const publicationMs = nowMs() - pending.dispatchedAt;
    this.#commitDiagnostics.publishedStrokes += 1;
    this.#commitDiagnostics.lastPublicationMs = publicationMs;
    this.#commitDiagnostics.maximumPublicationMs = Math.max(
      this.#commitDiagnostics.maximumPublicationMs,
      publicationMs
    );
    let completionError = null;
    try {
      this.onCompleted(completion);
    } catch (error) {
      completionError = error;
    }
    const hasVisualObserver =
      typeof this.renderer.hasObjectVisual === "function" ||
      typeof this.renderer.subscribeObjectVisuals === "function";
    if (!hasVisualObserver &&
        typeof globalThis.requestAnimationFrame === "function") {
      this.#deferResultPreviewClear(job);
    } else {
      this.#releaseCommittedHandoff(job);
    }
    if (this.#active) {
      this.#active.lastResult = completion.result;
      this.#active.error = completionError
        ? `Traço publicado; falha ao registrar repetição: ${
            completionError?.message ?? String(completionError)
          }`
        : null;
    }
    this.#clearCommitObserversIfIdle();
    this.#scheduleCommitDrain();
    this.#notify();
  }

  #failPendingCommit(pending, message) {
    if (!this.#pendingCommits.delete(pending.id)) return;
    this.#disposeHandoff(pending.job.handoff);
    this.#commitDiagnostics.failedStrokes += 1;
    if (this.#active) this.#active.error = String(message);
    this.#clearCommitObserversIfIdle();
    this.#scheduleCommitDrain();
    this.#notify();
  }

  #disposeHandoff(handoff) {
    if (!handoff || handoff.disposed) return;
    handoff.disposed = true;
    if (handoff.kind === "array") {
      this.renderer.scene.remove(handoff.group);
      handoff.cache?.dispose?.();
      return;
    }
    if (handoff.kind === "array-reusable") {
      handoff.cache?.clear?.();
      return;
    }
    if (handoff.kind === "tube") {
      this.renderer.scene.remove(handoff.mesh);
      handoff.mesh?.geometry?.dispose?.();
      handoff.mesh?.material?.dispose?.();
    }
  }

  #clearCommitObserversIfIdle() {
    if (this.#pendingCommits.size) return;
    this.#clearCommitObservers();
  }

  #clearCommitObservers() {
    for (const unsubscribe of this.#commitObservers.splice(0)) {
      try {
        unsubscribe?.();
      } catch {
        // Observação auxiliar; o sandbox continua sendo a autoridade.
      }
    }
  }

  #cancelPreviewHandoff({ clear = false } = {}) {
    if (typeof globalThis.cancelAnimationFrame === "function") {
      for (const frame of this.#handoffFrames) {
        globalThis.cancelAnimationFrame(frame);
      }
    }
    this.#handoffFrames = [];
    if (clear) {
      this.#previewTube.visible = false;
      this.#clearArrayPreview();
    }
  }

  #cancelPendingPreview() {
    if (this.#previewFrame !== null &&
        typeof globalThis.cancelAnimationFrame === "function") {
      globalThis.cancelAnimationFrame(this.#previewFrame);
    }
    this.#previewFrame = null;
    this.#pendingPreviewPoints = null;
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

function applyPathPlanTransform(mesh, plan) {
  const position = Array.isArray(plan?.position)
    ? plan.position
    : [0, 0, 0];
  mesh.position.fromArray(position);
  mesh.quaternion.identity();
  mesh.scale.set(1, 1, 1);
  mesh.updateMatrixWorld(true);
}

function resetPreviewTransform(object) {
  if (!object) return;
  object.position.set(0, 0, 0);
  object.quaternion.identity();
  object.scale.set(1, 1, 1);
  object.updateMatrixWorld(true);
}

function isPathSketchHandoff(object) {
  const name = String(object?.name ?? "");
  return Boolean(object?.userData?.pathSketchHandoff) ||
    name.startsWith("path-sketch-tube-handoff-") ||
    name.startsWith("path-sketch-array-handoff-");
}

function scanPathSketchTransients(scene, { retained = new Set() } = {}) {
  let handoffs = 0;
  let stalePreviews = 0;
  scene?.traverse?.(object => {
    if (retained.has(object)) return;
    if (isPathSketchHandoff(object)) handoffs += 1;
    else if (String(object?.name ?? "").startsWith("path-sketch-")) {
      stalePreviews += 1;
    }
  });
  return Object.freeze({ handoffs, stalePreviews });
}

function purgePathSketchTransients(scene, { retained = new Set() } = {}) {
  const roots = [];
  scene?.traverse?.(object => {
    if (retained.has(object) || !isPathSketchHandoff(object)) return;
    if (roots.some(root => isDescendantOf(object, root))) return;
    roots.push(object);
  });
  for (const object of roots) {
    object.parent?.remove?.(object);
    disposeTransientTree(object);
  }
  return roots.length;
}

function isDescendantOf(object, ancestor) {
  let current = object?.parent ?? null;
  while (current) {
    if (current === ancestor) return true;
    current = current.parent ?? null;
  }
  return false;
}

function disposeTransientTree(root) {
  const geometries = new Set();
  const materials = new Set();
  root?.traverse?.(object => {
    if (object.geometry) geometries.add(object.geometry);
    const list = Array.isArray(object.material)
      ? object.material
      : [object.material];
    for (const material of list) {
      if (material) materials.add(material);
    }
    object.dispose?.();
  });
  for (const geometry of geometries) geometry.dispose?.();
  for (const material of materials) material.dispose?.();
}

function resolveFrame(renderer, source) {
  const normalized = String(source ?? "locked-or-viewer").toLowerCase();
  const drawingPlane = renderer.getDrawingPlane?.();
  const editPlane = renderer.getEditPlane?.();
  const navigationPlane = renderer.getNavigationLocks?.().plane;
  if (["drawing", "drawing-plane", "draw-plane"].includes(normalized)) {
    if (!drawingPlane) {
      throw new Error("Defina um plano de desenho antes de iniciar o traço.");
    }
    return normalizeFrame(drawingPlane);
  }
  if (["edit", "edit-plane"].includes(normalized)) {
    if (!editPlane) {
      throw new Error("Defina um plano de edição antes de iniciar o traço.");
    }
    return normalizeFrame(editPlane);
  }
  const locked = drawingPlane ?? editPlane ?? navigationPlane;
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

function surfaceFallbackFrame(renderer, status = null) {
  const placement = status?.lastSurfacePlacement;
  if (placement?.point && placement?.normal) {
    return frameFromSurfacePlacement(placement, renderer.camera);
  }
  return resolveFrame(renderer, "locked-or-viewer");
}

function frameFromSurfacePlacement(placement, camera) {
  const origin = new THREE.Vector3().fromArray(placement.point);
  const normal = new THREE.Vector3().fromArray(placement.normal).normalize();
  let xAxis = placement.tangent
    ? new THREE.Vector3().fromArray(placement.tangent)
    : new THREE.Vector3(1, 0, 0);
  xAxis.addScaledVector(normal, -xAxis.dot(normal));
  if (xAxis.lengthSq() <= 1e-18 && camera?.quaternion) {
    xAxis.set(1, 0, 0).applyQuaternion(camera.quaternion);
    xAxis.addScaledVector(normal, -xAxis.dot(normal));
  }
  if (xAxis.lengthSq() <= 1e-18) {
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
    origin: Object.freeze(origin.toArray()),
    normal: Object.freeze(normal.toArray()),
    xAxis: Object.freeze(xAxis.toArray()),
    yAxis: Object.freeze(yAxis.toArray()),
    quaternion: Object.freeze(quaternion.toArray()),
    source: "surface-selection",
    linked: true
  });
}

function normalizeSettings(value) {
  const result = {
    ...value,
    mode: String(value.mode ?? "tube").toLowerCase(),
    planeSource: String(value.planeSource),
    anchorPolicy: String(value.anchorPolicy ?? "first").toLowerCase(),
    inputSamplePixels: integerAtLeast(
      value.inputSamplePixels,
      1,
      "inputSamplePixels"
    ),
    simplify: nonNegative(value.simplify, "simplify"),
    smoothIterations: integerAtLeast(value.smoothIterations, 0, "smoothIterations"),
    radius: positive(value.radius, "radius"),
    tubularSegments: integerAtLeast(value.tubularSegments, 2, "tubularSegments"),
    radialSegments: integerAtLeast(value.radialSegments, 3, "radialSegments"),
    curveType: String(value.curveType),
    tension: finite(value.tension, "tension"),
    color: String(value.color),
    closed: Boolean(value.closed),
    sourceMode: String(value.sourceMode ?? "selection").toLowerCase(),
    geometryType: String(value.geometryType ?? "box").toLowerCase(),
    sourceGeometry: geometryDescriptor(value.sourceGeometry),
    sourceColor: String(value.sourceColor ?? "#6699cc"),
    materialMode: String(value.materialMode ?? "inherit").toLowerCase(),
    opacityMultiplier: finiteRange(
      value.opacityMultiplier ?? 1,
      0,
      1,
      "opacityMultiplier"
    ),
    spacingMode: String(value.spacingMode ?? "auto").toLowerCase(),
    spacingWorld: positive(value.spacingWorld, "spacingWorld"),
    spacingScale: positive(value.spacingScale, "spacingScale"),
    align: Boolean(value.align),
    twistDegrees: finite(value.twistDegrees, "twistDegrees"),
    orientationMode: String(
      value.orientationMode ?? "preserve"
    ).toLowerCase(),
    affineMoveX: expression(value.affineMoveX, "affineMoveX"),
    affineMoveY: expression(value.affineMoveY, "affineMoveY"),
    affineMoveZ: expression(value.affineMoveZ, "affineMoveZ"),
    affineRotateX: expression(value.affineRotateX, "affineRotateX"),
    affineRotateY: expression(value.affineRotateY, "affineRotateY"),
    affineRotateZ: expression(value.affineRotateZ, "affineRotateZ"),
    affineScale: expression(value.affineScale, "affineScale"),
    affineULength: positive(value.affineULength, "affineULength"),
    affineColor: expression(value.affineColor, "affineColor"),
    continuous: Boolean(value.continuous),
    name: value.name === undefined ? null : String(value.name)
  };
  if (!["tube", "array"].includes(result.mode)) {
    throw new RangeError("O desenho aceita resultado tube ou array.");
  }
  if (!["first", "bounds", "world"].includes(result.anchorPolicy)) {
    throw new RangeError("A âncora deve usar início, centro dos limites ou mundo.");
  }
  if (!["selection", "catalog"].includes(result.sourceMode)) {
    throw new RangeError("A fonte do pincel deve ser selection ou catalog.");
  }
  if (!["inherit", "unlit", "standard", "physical"].includes(
    result.materialMode
  )) {
    throw new RangeError(
      "O material deve ser herdado, não iluminado, padrão ou físico."
    );
  }
  if (!["auto", "world"].includes(result.spacingMode)) {
    throw new RangeError("O espaçamento deve ser auto ou world.");
  }
  if (!["preserve", "plane", "path"].includes(result.orientationMode)) {
    throw new RangeError(
      "A orientação deve preservar a fonte, seguir o plano ou seguir o caminho."
    );
  }
  if (!/^#[0-9a-f]{6}$/i.test(result.sourceColor)) {
    throw new TypeError("A cor do pincel deve usar a forma #rrggbb.");
  }
  if (!["centripetal", "chordal", "catmullrom", "polyline", "bezier"].includes(result.curveType)) {
    throw new RangeError(
      "O desenho livre aceita Catmull-Rom, Bézier ajustada ou polilinha."
    );
  }
  return Object.freeze(result);
}

function brushSettingsKey(settings) {
  if (settings.mode !== "array") return "tube";
  return JSON.stringify([
    settings.sourceMode,
    settings.sourceMode === "catalog" ? settings.geometryType : null,
    settings.sourceMode === "catalog" ? settings.sourceGeometry : null,
    settings.sourceMode === "catalog" ? settings.sourceColor : null,
    settings.sourceMode === "catalog" ? settings.materialMode : null,
    settings.sourceMode === "catalog" ? settings.opacityMultiplier : null
  ]);
}

function inputPending() {
  try {
    return Boolean(
      globalThis.navigator?.scheduling?.isInputPending?.({
        includeContinuous: true
      })
    );
  } catch {
    return false;
  }
}

function nowMs() {
  return typeof globalThis.performance?.now === "function"
    ? globalThis.performance.now()
    : Date.now();
}

function resultCreatedIds(result) {
  const ids = Array.isArray(result?.publishedObjectIds)
    ? result.publishedObjectIds
    : Array.isArray(result?.createdIds)
      ? result.createdIds
      : result?.id !== undefined && result?.id !== null
        ? [result.id]
        : Array.isArray(result?.activeIds)
          ? result.activeIds
          : [];
  return [...new Set(ids.map(String).filter(Boolean))];
}

function geometryDescriptor(value) {
  let source = value;
  if (typeof source === "string") {
    try {
      source = JSON.parse(source);
    } catch (error) {
      throw new TypeError("sourceGeometry deve ser JSON válido.", {
        cause: error
      });
    }
  }
  if (source === null || source === undefined) return Object.freeze({});
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    throw new TypeError("sourceGeometry deve ser um objeto.");
  }
  return deepFreeze(structuredClone(source));
}

function expression(value, name) {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError(`${name} inválido.`);
    return value;
  }
  const text = String(value ?? "").trim();
  if (!text) throw new TypeError(`${name} exige um valor ou expressão.`);
  return text;
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

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
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

function createPreviewMaterial(mode, color, opacity) {
  const common = {
    color,
    depthTest: false,
    depthWrite: false,
    transparent: true,
    opacity
  };
  if (mode === "physical") {
    return new THREE.MeshPhysicalMaterial({
      ...common,
      roughness: 0.45,
      metalness: 0
    });
  }
  if (mode === "standard") {
    return new THREE.MeshStandardMaterial({
      ...common,
      roughness: 0.6,
      metalness: 0
    });
  }
  return new THREE.MeshBasicMaterial(common);
}

function updatePreviewMaterial(current, mode, color, opacity) {
  const expected = mode === "physical"
    ? "MeshPhysicalMaterial"
    : mode === "standard"
      ? "MeshStandardMaterial"
      : "MeshBasicMaterial";
  if (current?.type !== expected) {
    current?.dispose?.();
    return createPreviewMaterial(mode, color, opacity);
  }
  current.color.set(color);
  current.opacity = opacity;
  current.transparent = opacity < 1;
  current.needsUpdate = true;
  return current;
}

function createPreviewTube() {
  const material = createPreviewMaterial("inherit", "#70c8ff", 0.62);
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
  mesh.name = "path-sketch-preview-tube";
  mesh.renderOrder = 1499;
  mesh.frustumCulled = false;
  mesh.visible = false;
  return mesh;
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

function finiteRange(value, minimum, maximum, name) {
  const number = finite(value, name);
  if (number < minimum || number > maximum) {
    throw new RangeError(
      `${name} deve estar entre ${minimum} e ${maximum}.`
    );
  }
  return number;
}

function integerAtLeast(value, minimum, name) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < minimum) {
    throw new RangeError(`${name} deve ser inteiro maior ou igual a ${minimum}.`);
  }
  return number;
}
