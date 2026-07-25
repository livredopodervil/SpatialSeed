import * as THREE from "three";
import {
  InstanceBatch
} from "../../instance-batches/src/InstanceBatch.js?build=20260713-0019g-c2";
import {
  InstanceBatchManager
} from "../../instance-batches/src/InstanceBatchManager.js?build=20260713-0019g-c2";
import { BatchMaterialCache } from "../../batch-material-cache/src/index.js";
import { ThreeResourceCache } from "../../renderer-resource-cache/src/index.js";
import { createDefaultGeometryRegistry } from "../../geometry-registry/src/index.js";
import { HierarchyIndex } from "../../scene-hierarchy/src/index.js?build=20260715-0023d";
import {
  normalizeCameraProjection,
  normalizeNavigationCamera
} from "../../runtime-layers/src/index.js?build=20260725-0029f1";
import {
  affectedHierarchyIds,
  applyProjectedWorldMatrix,
  isRenderableSceneNode,
  projectedSelectionIds,
  renderableSubtreeIds,
  selectionReferenceWorldPosition,
  selectionUnitId
} from "./WorldTransformProjection.js?build=20260724-0029f";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import {
  SelectionOutlineBatch,
  benchmarkSelectionOutlines,
  selectionOutlineInstance
} from "./SelectionOutlineBatch.js?build=20260718-0027g";
import {
  composeAnimationOverlay,
  createAnimationTargetSnapshot
} from "./AnimationTransformOverlay.js?build=20260720-0028d";

export class ThreeRegionRenderer {
  static apiVersion = "renderer-three-navigation-camera-v2";
  #meshes = new Map();
  #cameraVisuals = new Map();
  #selectionSnapshot = null;
  #session = null;
  #tap = null;
  #textureLoader = new THREE.TextureLoader();
  #projectObject = object => object;
  #geometryRegistry = null;
  #resourceCache = new ThreeResourceCache({ textureLoader: this.#textureLoader });
  #materialCache = new BatchMaterialCache({ resourceCache: this.#resourceCache });
  #batchManager = null;
  #selectedVisualIds = new Set();
  #selectionOutlines = null;
  #interactionMode = "select";
  #selectionOperation = "replace";
  #overlapCycle = { x: null, y: null, ids: [], index: -1, time: 0 };
  #batchCapacity = 65536;
  #hierarchy = new HierarchyIndex([]);
  #frameListeners = new Set();
  #cameraListeners = new Set();
  #transformPreviewListeners = new Set();
  #sharedTransformPreviews = new Map();
  #sharedTransformObjectIds = new Set();
  #cameraVisualState = {
    activeCameraId: null,
    defaultCameraId: null,
    helperPolicy: "selected",
    showIcons: true,
    showFrustums: true
  };
  #cameraDeletionDiagnostics = {
    count: 0,
    lastMs: 0,
    maximumMs: 0
  };
  #lastFrameTimestamp = null;
  #animationTargetIds = new Set();
  #animationPivotOverrides = new Map();
  #animationBatchCulling = new Map();
  #animationSurfaceDiagnostics = {
    captures: 0,
    frames: 0,
    restores: 0,
    matrixWrites: 0,
    colorWrites: 0,
    lastFrameMs: 0,
    maximumFrameMs: 0
  };

  #incrementalDiagnostics = {
    fullUpdates: 0,
    incrementalUpdates: 0,
    objectsCreated: 0,
    objectsUpdated: 0,
    objectsDeleted: 0
  };
  #transformLifecycleDiagnostics = {
    sessionsStarted:0,
    previews:0,
    commits:0,
    rollbacks:0,
    selectionRootCount:0,
    previewObjectCount:0,
    renderablePreviewCount:0,
    lastPreviewMs:0,
    maxPreviewMs:0,
    lastCommitMs:0,
    lastError:null
  };
  #transformConfig = {
    size: 1.25,
    translationSnap: null,
    rotationSnapDeg: null,
    scaleSnap: null,
    gridLock: false,
    showX: true,
    showY: true,
    showZ: true,
    showVertices: false,
    vertexSize: 5
  };
  #vertexMarkers = null;
  #inputDiagnostics = {
    pointerDown: 0,
    pointerUp: 0,
    pointerCancel: 0,
    lastPointerType: null,
    lastDistance: null,
    lastDuration: null,
    discardedReason: null,
    gizmoHits: 0,
    objectHits: 0,
    lastObjectId: null,
    lastNdc: null,
    selectionAction: null
  };

  constructor(
    canvas,
    {
      dispatch,
      selection,
      editorState,
      geometryRegistry = createDefaultGeometryRegistry(),
      projectObject = object => object
    }
  ) {
    if (typeof dispatch !== "function") throw new TypeError("dispatch must be a function");
    if (!selection?.subscribe) throw new TypeError("selection object is incompatible");
    if (!editorState?.subscribe) throw new TypeError("editorState object is incompatible");
    if (!geometryRegistry?.key || !geometryRegistry?.create ||
        !geometryRegistry?.describeLegacyObject) {
      throw new TypeError("geometryRegistry object is incompatible");
    }

    this.canvas = canvas;
    this.dispatch = dispatch;
    this.selection = selection;
    this.editorState = editorState;
    this.#geometryRegistry = geometryRegistry;
    this.#projectObject =
      typeof projectObject === "function"
        ? projectObject
        : object => object;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x08101a);
    this.#selectionOutlines = new SelectionOutlineBatch();
    this.scene.add(this.#selectionOutlines.object);

    this.#batchManager = new InstanceBatchManager({
      createBatch: descriptor => {
        const batch = new InstanceBatch(descriptor);
        batch.mesh.frustumCulled = false;
        this.scene.add(batch.mesh);
        return batch;
      }
    });

    this.camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 1000);
    this.camera.position.set(10, 8, 14);

    this.orbit = new OrbitControls(this.camera, canvas);
    this.orbit.enableDamping = true;
    this.orbit.target.set(0, 1, 0);
    this.orbit.addEventListener(
      "change",
      () => this.#notifyNavigationCamera()
    );

    this.transformAnchor = new THREE.Group();
    this.transformAnchor.name = "editor-selection-anchor";
    this.scene.add(this.transformAnchor);

    this.transform = new TransformControls(this.camera, canvas);
    this.transform.setMode("translate");
    this.transform.setSize(this.#transformConfig.size);
    this.scene.add(this.transform.getHelper());

    const vertexGeometry = new THREE.BufferGeometry();
    vertexGeometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute([], 3)
    );

    this.#vertexMarkers = new THREE.Points(
      vertexGeometry,
      new THREE.PointsMaterial({
        color: 0xffffff,
        size: this.#transformConfig.vertexSize,
        sizeAttenuation: false,
        depthTest: false,
        depthWrite: false
      })
    );

    this.#vertexMarkers.renderOrder = 1000;
    this.#vertexMarkers.frustumCulled = false;
    this.#vertexMarkers.visible = false;
    this.scene.add(this.#vertexMarkers);

    this.scene.add(new THREE.HemisphereLight(0xaecbff, 0x182012, 2.2));
    const light = new THREE.DirectionalLight(0xffffff, 2.5);
    light.position.set(8, 16, 10);
    this.scene.add(light);

    const grid = new THREE.GridHelper(200, 100, 0x6688aa, 0x243142);
    grid.position.y = 0.01;
    this.scene.add(grid);

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();

    this.selection.subscribe(snapshot => {
      this.#selectionSnapshot = snapshot;
      this.#rebuildAnchor();
      this.#updateSelectionAppearance();
      this.#updateVertexMarkers();
    });

    this.editorState.subscribe(() => {
      this.#configureTransformForEditor();
      this.#rebuildAnchor();
      this.#updateVertexMarkers();
    });

    this.transform.addEventListener("dragging-changed", event => {
      this.orbit.enabled = !event.value;
      if (event.value) this.#beginSession();
      else if (this.#session) this.#commitSession();
    });
    this.transform.addEventListener("mouseDown", () => this.#beginSession());
    this.transform.addEventListener("objectChange", () => this.#previewSession());
    this.transform.addEventListener("mouseUp", () => this.#commitSession());

    canvas.addEventListener("pointerdown", event => {
      this.#inputDiagnostics.pointerDown += 1;
      this.#inputDiagnostics.lastPointerType = event.pointerType || "mouse";
      this.#inputDiagnostics.discardedReason = null;
      this.#tap = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        time: performance.now(),
        type: event.pointerType || "mouse"
      };
    }, true);

    canvas.addEventListener("pointercancel", () => {
      this.#inputDiagnostics.pointerCancel += 1;
      this.#inputDiagnostics.discardedReason = "pointercancel";
      this.#tap = null;
    }, true);
    canvas.addEventListener("pointerup", event => this.#selectAt(event), true);
    addEventListener("resize", () => this.resize());

    this.animate();
  }

  getCameraProjection() {
    return Object.freeze({
      near: this.camera.near,
      far: this.camera.far
    });
  }

  readNavigationCamera() {
    return Object.freeze({
      position: this.camera.position.toArray(),
      quaternion: this.camera.quaternion.toArray(),
      focusDistance: Math.max(
        this.camera.position.distanceTo(this.orbit.target),
        1e-9
      ),
      fov: this.camera.fov,
      near: this.camera.near,
      far: this.camera.far,
      aspect: this.camera.aspect
    });
  }

  applyNavigationCamera(camera = {}) {
    const next = normalizeNavigationCamera(
      camera,
      this.readNavigationCamera()
    );
    this.camera.position.fromArray(next.position);
    this.camera.quaternion.fromArray(next.quaternion);
    this.camera.fov = next.fov;
    this.camera.near = next.near;
    this.camera.far = next.far;
    this.camera.aspect = next.aspect;
    this.camera.updateProjectionMatrix();
    const forward = new THREE.Vector3(0, 0, -1)
      .applyQuaternion(this.camera.quaternion)
      .multiplyScalar(next.focusDistance);
    this.orbit.target.copy(this.camera.position).add(forward);
    this.orbit.update();
    return this.readNavigationCamera();
  }

  subscribeNavigationCamera(listener) {
    if (typeof listener !== "function") {
      throw new TypeError("Listener de câmera deve ser função.");
    }
    this.#cameraListeners.add(listener);
    listener(this.readNavigationCamera());
    return () => this.#cameraListeners.delete(listener);
  }

  readSelectionBounds() {
    const members = this.#selectionSnapshot?.members ?? [];
    if (!members.length) return null;
    const bounds = new THREE.Box3().makeEmpty();
    for (const member of members) {
      bounds.union(this.#worldBoundsForObjectId(member.objectId));
    }
    return bounds.isEmpty()
      ? null
      : Object.freeze({
          min: bounds.min.toArray(),
          max: bounds.max.toArray()
        });
  }

  setCameraProjection({
    near = this.camera.near,
    far = this.camera.far
  } = {}) {
    const projection = normalizeCameraProjection({ near, far });
    this.applyNavigationCamera({
      ...this.readNavigationCamera(),
      ...projection
    });
    return this.getCameraProjection();
  }

  setTransformMode(mode) {
    this.editorState.setPivotEditing(false);
    this.editorState.setToolMode(mode);
    this.#interactionMode = mode;
    if (["translate", "rotate", "scale"].includes(mode)) this.transform.setMode(mode);
    this.#configureTransformForEditor();
    this.#rebuildAnchor();
  }

  setSelectionOperation(operation) {
    this.#selectionOperation = operation;
    this.editorState.setSelectionOperation(operation);
    return operation;
  }

  selectScreenRect(rectangle, operation = this.#selectionOperation) {
    const r = this.canvas.getBoundingClientRect(), byId = new Map();
    for (const [objectId, proxy] of this.#meshes) {
      if (
        proxy.userData.logicalOnly &&
        !proxy.userData.cameraVisual
      ) continue;
      const p = proxy.getWorldPosition(new THREE.Vector3()).project(this.camera);
      if (p.z < -1 || p.z > 1) continue;
      const x=(p.x+1)*.5*r.width,y=(1-p.y)*.5*r.height;
      if(x>=rectangle.left&&x<=rectangle.right&&y>=rectangle.top&&y<=rectangle.bottom){const selectedId=this.#hierarchy.has(objectId)?selectionUnitId(this.#hierarchy,objectId):objectId;byId.set(selectedId,{kind:"object",regionId:"region-main",objectId:selectedId})}
    }
    const members=[...byId.values()];
    this.#applySelectionMembers(members, operation);
    return { operation, selected: members.length, selection: this.selection.snapshot() };
  }

  setPivotEditing(enabled) {
    if (enabled && this.selection.empty) return false;

    if (enabled && this.editorState.pivot.policy !== "custom") {
      const pivot = this.#calculatePivot();
      if (pivot) this.editorState.setCustomPivot(pivot.toArray());
      this.editorState.setPivotPolicy("custom");
    }

    this.editorState.setPivotEditing(enabled);
    this.#configureTransformForEditor();
    this.#rebuildAnchor();
    return true;
  }

  toggleSpace() {
    const next = this.transform.space === "world" ? "local" : "world";
    this.transform.setSpace(next);
    this.selection.orientationPolicy = next;
    this.selection.notifyContextChanged();
    return next;
  }

  update(state) {
    this.#incrementalDiagnostics.fullUpdates += 1;
    const seen = new Set();
    const hierarchy = new HierarchyIndex(state.objects);
    this.#hierarchy = hierarchy;

    for (const rawObject of state.objects) {
      const object = this.#projectObject(rawObject);
      seen.add(object.id);
      this.#upsertObject(
        object,
        hierarchy.worldMatrixOf(rawObject.id)
      );
    }

    for (const id of [...this.#meshes.keys()]) {
      if (!seen.has(id)) this.#removeObject(id);
    }

    this.#finishSceneUpdate();
  }

  applyChanges(state, changes = []) {
    this.#incrementalDiagnostics.incrementalUpdates += 1;
    const hierarchy = new HierarchyIndex(state.objects);
    this.#hierarchy = hierarchy;
    const byId = new Map(
      state.objects.map(object => [object.id,object])
    );
    const affectedIds = affectedHierarchyIds(hierarchy,changes);

    for (const change of changes) {
      const id = change.objectId;
      if (!id) continue;

      if (change.type === "object-deleted") {
        this.#removeObject(id);
      }
    }

    for (const id of affectedIds) {
      const rawObject = byId.get(id);

      if (!rawObject) {
        this.#removeObject(id);
        continue;
      }

      this.#upsertObject(
        this.#projectObject(rawObject),
        hierarchy.worldMatrixOf(id)
      );
    }

    this.#finishSceneUpdate();
  }

  subscribeFrame(listener) {
    if (typeof listener !== "function") {
      throw new TypeError("Listener de quadro deve ser função.");
    }
    this.#frameListeners.add(listener);
    return () => this.#frameListeners.delete(listener);
  }

  subscribeTransformPreview(listener) {
    if (typeof listener !== "function") {
      throw new TypeError("Listener de preview deve ser função.");
    }
    this.#transformPreviewListeners.add(listener);
    return () => this.#transformPreviewListeners.delete(listener);
  }

  applySharedTransformPreview(session = {}) {
    const key = previewSessionKey(session);
    const transforms = normalizePreviewTransforms(session.transforms);
    this.#sharedTransformPreviews.delete(key);
    this.#sharedTransformPreviews.set(key, transforms);
    this.#rebuildSharedTransformObjectIds();
    this.#applySharedPreviewTransforms(transforms);
    return Object.freeze({
      previewId: String(session.previewId),
      applied: transforms.length
    });
  }

  clearSharedTransformPreview(session = {}) {
    const key = previewSessionKey(session);
    const previous = this.#sharedTransformPreviews.get(key) ?? [];
    if (!this.#sharedTransformPreviews.delete(key)) return false;
    this.#rebuildSharedTransformObjectIds();
    this.#restoreSharedPreviewObjects(
      previous.map(transform => transform.id)
    );
    return true;
  }

  setCameraVisualState(patch = {}) {
    const nextPolicy = patch.helperPolicy ??
      this.#cameraVisualState.helperPolicy;
    if (!["none", "selected", "all"].includes(nextPolicy)) {
      throw new RangeError(
        `Política de auxiliares de câmera inválida: ${nextPolicy}.`
      );
    }
    this.#cameraVisualState = {
      ...this.#cameraVisualState,
      ...patch,
      activeCameraId:
        patch.activeCameraId === undefined
          ? this.#cameraVisualState.activeCameraId
          : patch.activeCameraId,
      defaultCameraId:
        patch.defaultCameraId === undefined
          ? this.#cameraVisualState.defaultCameraId
          : patch.defaultCameraId,
      helperPolicy: nextPolicy,
      showIcons: patch.showIcons === undefined
        ? this.#cameraVisualState.showIcons
        : Boolean(patch.showIcons),
      showFrustums: patch.showFrustums === undefined
        ? this.#cameraVisualState.showFrustums
        : Boolean(patch.showFrustums)
    };
    this.#updateCameraVisualAppearance();
    return this.getCameraVisualState();
  }

  getCameraVisualState() {
    return Object.freeze({
      ...this.#cameraVisualState,
      deletion: Object.freeze({
        ...this.#cameraDeletionDiagnostics
      })
    });
  }

  captureAnimationTargets(targetIds = [], {
    targetMode = "selection"
  } = {}) {
    if (this.#animationTargetIds.size) {
      throw new Error("Já existe uma sobreposição de animação ativa.");
    }
    const requested = [...new Set(
      targetIds.map(value => String(value)).filter(id => this.#hierarchy.has(id))
    )];
    const roots = this.#hierarchy.canonicalizeSelection(requested);
    if (!["selection", "objects"].includes(targetMode)) {
      throw new RangeError(`Modo de alvos de animação desconhecido: ${targetMode}.`);
    }
    const units = [];

    for (const sourceId of roots) {
      const objectIds = renderableSubtreeIds(this.#hierarchy, sourceId);
      const unitIds = targetMode === "objects" ? objectIds : [sourceId];
      for (const unitId of unitIds) {
        const members = targetMode === "objects" ? [unitId] : objectIds;
        const objects = members
        .map(objectId => {
          const proxy = this.#meshes.get(objectId);
          if (!proxy || proxy.userData.logicalOnly) return null;
          return {
            objectId,
            baseMatrix: [
              ...(proxy.userData.canonicalWorldMatrix ??
                proxy.matrix.toArray())
            ]
          };
        })
        .filter(Boolean);
        if (!objects.length) continue;
        units.push({
          unitId,
          sourceId,
          pivot: this.#hierarchy.worldPivotOf(unitId),
          objects
        });
      }
    }

    const snapshot = createAnimationTargetSnapshot(units);
    this.#animationTargetIds = new Set(
      snapshot.units.flatMap(unit =>
        unit.objects.map(object => object.objectId)
      )
    );
    for (const objectId of this.#animationTargetIds) {
      const batchKey = this.#meshes.get(objectId)?.userData.batchKey;
      if (!batchKey || this.#animationBatchCulling.has(batchKey)) continue;
      const batch = this.#batchManager.getBatch(batchKey);
      if (!batch) continue;
      this.#animationBatchCulling.set(
        batchKey,
        batch.mesh.frustumCulled
      );
      batch.mesh.frustumCulled = false;
    }
    this.#animationSurfaceDiagnostics.captures += 1;
    return snapshot;
  }

  applyAnimationFrame(targets, unitFrames) {
    const startedAt = performance.now();
    const overlay = composeAnimationOverlay(targets, unitFrames);
    let matrixWrites = 0;
    let colorWrites = 0;

    for (const transform of overlay.transforms) {
      if (!this.#animationTargetIds.has(transform.objectId)) {
        throw new Error(
          `Objeto fora da sobreposição ativa: ${transform.objectId}.`
        );
      }
      const proxy = this.#meshes.get(transform.objectId);
      if (!proxy || proxy.userData.logicalOnly) continue;
      applyProjectedWorldMatrix(proxy, transform.matrix);
      if (this.#updateBatchMatrix(transform.objectId, proxy)) {
        matrixWrites += 1;
      }
    }

    for (const entry of overlay.colors) {
      if (!this.#animationTargetIds.has(entry.objectId)) {
        throw new Error(`Cor fora da sobreposição ativa: ${entry.objectId}.`);
      }
      if (this.#setInstanceColor(entry.objectId, entry.color)) {
        colorWrites += 1;
      }
    }

    this.#animationPivotOverrides = new Map(
      overlay.pivots.map(entry => [entry.unitId, [...entry.position]])
    );
    this.#rebuildAnchor();
    this.#updateSelectionAppearance();
    this.#updateVertexMarkers();

    const elapsed = performance.now() - startedAt;
    const diagnostics = this.#animationSurfaceDiagnostics;
    diagnostics.frames += 1;
    diagnostics.matrixWrites += matrixWrites;
    diagnostics.colorWrites += colorWrites;
    diagnostics.lastFrameMs = elapsed;
    diagnostics.maximumFrameMs = Math.max(
      diagnostics.maximumFrameMs,
      elapsed
    );
    return Object.freeze({
      matrixWrites,
      colorWrites,
      unitCount: overlay.pivots.length
    });
  }

  restoreAnimationTargets(targets) {
    const requested = new Set(
      targets?.units?.flatMap(unit =>
        unit.objects.map(object => object.objectId)
      ) ?? []
    );
    let matrixWrites = 0;
    let restoreError = null;

    try {
      for (const objectId of requested) {
        const proxy = this.#meshes.get(objectId);
        const canonical = proxy?.userData.canonicalWorldMatrix;
        if (!proxy || !canonical || proxy.userData.logicalOnly) continue;
        applyProjectedWorldMatrix(proxy, canonical);
        if (this.#updateBatchMatrix(objectId, proxy)) matrixWrites += 1;
        this.#applyObjectInstanceColor(objectId);
      }
    } catch (error) {
      restoreError = error;
    }

    this.#animationTargetIds.clear();
    this.#animationPivotOverrides.clear();
    for (const [batchKey, frustumCulled] of this.#animationBatchCulling) {
      const batch = this.#batchManager.getBatch(batchKey);
      if (batch) batch.mesh.frustumCulled = frustumCulled;
    }
    this.#animationBatchCulling.clear();
    this.#flushBatchBounds();
    this.#rebuildAnchor();
    this.#updateSelectionAppearance();
    this.#updateVertexMarkers();
    this.#animationSurfaceDiagnostics.restores += 1;
    if (restoreError) throw restoreError;
    return Object.freeze({ restored: matrixWrites, matrixWrites });
  }

  getAnimationSurfaceDiagnostics() {
    return Object.freeze({
      ...this.#animationSurfaceDiagnostics,
      activeObjects: this.#animationTargetIds.size,
      pivotOverrides: this.#animationPivotOverrides.size,
      uncullableBatches: this.#animationBatchCulling.size
    });
  }

  getIncrementalDiagnostics() {
    return {
      ...this.#incrementalDiagnostics,
      meshes: this.#meshes.size
    };
  }

  #upsertObject(object, worldMatrix) {
    let proxy = this.#meshes.get(object.id);

    if (!proxy) {
      proxy = new THREE.Object3D();
      proxy.userData.objectId = object.id;
      proxy.userData.batchKey = null;
      proxy.userData.size = object.size ? [...object.size] : [0,0,0];
      proxy.userData.localBounds = null;
      proxy.userData.appearanceId = object.appearanceId;
      proxy.userData.instanceColor =
        object.instanceState?.color ?? null;
      this.#meshes.set(object.id, proxy);
      this.#incrementalDiagnostics.objectsCreated += 1;
    } else {
      this.#incrementalDiagnostics.objectsUpdated += 1;
    }

    proxy.userData.size = object.size ? [...object.size] : [0,0,0];
    proxy.userData.canonicalWorldMatrix = [...worldMatrix];

    if (
      !this.#session &&
      !this.#animationTargetIds.has(object.id) &&
      !this.#sharedTransformObjectIds.has(object.id)
    ) {
      applyProjectedWorldMatrix(proxy,worldMatrix);
    }

    if (object.kind === "camera") {
      if (proxy.userData.batchKey) {
        this.#removeFromBatch(object.id, proxy.userData.batchKey);
        proxy.userData.batchKey = null;
      }
      proxy.userData.logicalOnly = true;
      proxy.userData.cameraVisual = true;
      this.#upsertCameraVisual(object, proxy);
      return;
    }

    if (proxy.userData.cameraVisual) {
      this.#removeCameraVisual(object.id, proxy);
    }

    if (!isRenderableSceneNode(object)) {
      if (proxy.userData.batchKey) {
        this.#removeFromBatch(object.id,proxy.userData.batchKey);
        proxy.userData.batchKey=null;
      }
      proxy.userData.logicalOnly=true;
      return;
    }
    proxy.userData.logicalOnly=false;

    const nextBatchKey = this.#batchKeyFor(object);

    if (proxy.userData.batchKey !== nextBatchKey) {
      if (proxy.userData.batchKey) {
        this.#removeFromBatch(object.id, proxy.userData.batchKey);
      }
      this.#addToBatch(object, proxy, nextBatchKey);
    } else {
      this.#updateBatchMatrix(object.id, proxy);
    }

    proxy.userData.appearanceId = object.appearanceId;
    proxy.userData.instanceColor =
      object.instanceState?.color ?? null;

    this.#applyObjectInstanceColor(object.id);
  }

  #removeObject(id) {
    const startedAt = performance.now();
    const proxy = this.#meshes.get(id);
    if (!proxy) return false;

    const cameraVisual = Boolean(this.#cameraVisuals.has(id));
    this.#removeCameraVisual(id, proxy);
    this.#removeFromBatch(id, proxy.userData.batchKey);
    this.#meshes.delete(id);
    this.#selectedVisualIds.delete(id);
    this.#animationTargetIds.delete(id);
    this.#animationPivotOverrides.delete(id);
    this.#incrementalDiagnostics.objectsDeleted += 1;
    if (cameraVisual) {
      const elapsed = performance.now() - startedAt;
      this.#cameraDeletionDiagnostics.count += 1;
      this.#cameraDeletionDiagnostics.lastMs = elapsed;
      this.#cameraDeletionDiagnostics.maximumMs = Math.max(
        this.#cameraDeletionDiagnostics.maximumMs,
        elapsed
      );
    }
    return true;
  }

  #upsertCameraVisual(object, proxy) {
    let visual = this.#cameraVisuals.get(object.id);
    if (!visual) {
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(0.58, 0.38, 0.62),
        new THREE.MeshBasicMaterial({
          color: 0xffc857,
          depthTest: true,
          depthWrite: true
        })
      );
      body.position.z = 0.22;
      body.userData.cameraObjectId = object.id;
      const lens = new THREE.Mesh(
        new THREE.ConeGeometry(0.24, 0.42, 12, 1, true),
        new THREE.MeshBasicMaterial({
          color: 0xffa62b,
          wireframe: true
        })
      );
      lens.rotation.x = -Math.PI / 2;
      lens.position.z = -0.28;
      lens.userData.cameraObjectId = object.id;
      const lines = new THREE.LineSegments(
        new THREE.BufferGeometry(),
        new THREE.LineBasicMaterial({ color: 0x72d6ff })
      );
      lines.userData.cameraObjectId = object.id;
      proxy.add(body, lens, lines);
      this.scene.add(proxy);
      visual = { body, lens, lines };
      this.#cameraVisuals.set(object.id, visual);
    }

    const fov = Number(object.camera?.fov ?? 55);
    const length = 2;
    const halfHeight = Math.min(
      3,
      Math.max(0.15, Math.tan(fov * Math.PI / 360) * length)
    );
    const halfWidth = Math.min(4, halfHeight * 1.6);
    const z = -length;
    const corners = [
      [-halfWidth, -halfHeight, z],
      [halfWidth, -halfHeight, z],
      [halfWidth, halfHeight, z],
      [-halfWidth, halfHeight, z]
    ];
    const segments = [];
    for (const corner of corners) {
      segments.push(0, 0, 0, ...corner);
    }
    for (let index = 0; index < corners.length; index += 1) {
      segments.push(
        ...corners[index],
        ...corners[(index + 1) % corners.length]
      );
    }
    visual.lines.geometry.dispose();
    visual.lines.geometry = new THREE.BufferGeometry();
    visual.lines.geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(segments, 3)
    );
    proxy.userData.localBounds = {
      min: [-0.42, -0.28, -0.5],
      max: [0.42, 0.28, 0.53]
    };
    proxy.userData.cameraProjection = {
      fov,
      near: Number(object.camera?.near ?? 0.1),
      far: Number(object.camera?.far ?? 1000),
      focusDistance: Number(object.camera?.focusDistance ?? 10)
    };
    this.#updateCameraVisualAppearance();
  }

  #removeCameraVisual(id, proxy = this.#meshes.get(id)) {
    const visual = this.#cameraVisuals.get(id);
    if (!visual) return false;
    this.scene.remove(proxy);
    for (const object of [visual.body, visual.lens, visual.lines]) {
      object.geometry?.dispose?.();
      object.material?.dispose?.();
    }
    proxy.clear();
    proxy.userData.cameraVisual = false;
    this.#cameraVisuals.delete(id);
    return true;
  }

  #finishSceneUpdate() {
    this.#flushBatchBounds();
    this.#rebuildAnchor();
    this.#updateSelectionAppearance();
    this.#updateVertexMarkers();
  }

  #flushBatchBounds() {
    let flushed = 0;

    for (const batch of this.#batchManager.batches()) {
      if (batch.flushBounds()) flushed += 1;
    }

    return flushed;
  }

  #batchKeyFor(object) {
    const descriptor=this.#geometryRegistry.describeLegacyObject(object);
    const renderProfile=this.#geometryRegistry.renderProfile(descriptor);
    return JSON.stringify([
      this.#geometryRegistry.key(descriptor),
      object.appearanceId,
      renderProfile.side
    ]);
  }

  #addToBatch(object, proxy, batchKey) {
    let batch = this.#batchManager.getBatch(batchKey);

    if (!batch) {
      const descriptor=this.#geometryRegistry.describeLegacyObject(object);
      const renderProfile=this.#geometryRegistry.renderProfile(descriptor);
      const geometryKey=this.#geometryRegistry.key(descriptor);
      const geometry = this.#resourceCache.acquireGeometry(
        geometryKey,
        () => this.#geometryRegistry.create(descriptor)
      );
      const material = this.#materialCache.acquire({
        appearanceId: object.appearanceId,
        material: object.material,
        renderProfile
      });

      try {
        const added = this.#batchManager.add({
          objectId: object.id,
          batchKey,
          matrix: proxy.matrix,
          descriptor: {
            geometry: geometry.value,
            material: material.value.material,
            capacity: this.#batchCapacity
          }
        });
        batch = added.batch;
        batch.mesh.userData.geometryCacheKey = geometry.key;
        batch.mesh.userData.appearanceId = object.appearanceId;
        batch.mesh.userData.materialCacheKey = material.key;
      } catch (error) {
        this.#resourceCache.releaseGeometry(geometry.key);
        this.#materialCache.release(material.key);
        throw error;
      }
    } else {
      this.#batchManager.add({
        objectId: object.id,
        batchKey,
        matrix: proxy.matrix,
        descriptor: {
          geometry: batch.geometry,
          material: batch.material,
          capacity: batch.capacity
        }
      });
    }

    proxy.userData.batchKey = batchKey;
    this.#storeGeometryBounds(proxy,batch.geometry);
    this.#applyObjectInstanceColor(object.id);
  }

  #storeGeometryBounds(proxy,geometry) {
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    const bounds=geometry.boundingBox;
    proxy.userData.localBounds=bounds
      ? {
          min:bounds.min.toArray(),
          max:bounds.max.toArray()
        }
      : null;
  }

  #removeFromBatch(objectId, batchKey) {
    if (!batchKey) return false;
    const batch = this.#batchManager.getBatch(batchKey);
    const result = this.#batchManager.remove(objectId);

    if (!result.removed || !batch || batch.size > 0) {
      return result.removed;
    }

    this.scene.remove(batch.mesh);
    this.#resourceCache.releaseGeometry(
      batch.mesh.userData.geometryCacheKey
    );
    this.#materialCache.release(
      batch.mesh.userData.materialCacheKey ??
      batch.mesh.userData.appearanceId
    );
    this.#batchManager.deleteBatch(batchKey);
    return true;
  }

  #setInstanceColor(objectId, value) {
    const location = this.#batchManager.locationOf(objectId);
    if (!location) return false;
    const batch = this.#batchManager.getBatch(location.batchKey);
    if (!batch) return false;

    const desired = new THREE.Color(value);
    const base = batch.material?.color?.isColor
      ? batch.material.color
      : new THREE.Color(0xffffff);

    const tint = new THREE.Color(
      safeColorRatio(desired.r, base.r),
      safeColorRatio(desired.g, base.g),
      safeColorRatio(desired.b, base.b)
    );

    return this.#batchManager.updateAttributes(
      objectId,
      { color: tint }
    );
  }

  #applyObjectInstanceColor(objectId) {
    const proxy = this.#meshes.get(objectId);
    if (!proxy) return false;

    const location = this.#batchManager.locationOf(objectId);
    const batch = location
      ? this.#batchManager.getBatch(location.batchKey)
      : null;

    if (!batch) return false;

    const desired =
      proxy.userData.instanceColor ??
      batch.material?.color ??
      0xffffff;

    return this.#setInstanceColor(objectId, desired);
  }

  #updateBatchMatrix(objectId, proxy) {
    if (proxy.matrixAutoUpdate) proxy.updateMatrix();
    return this.#batchManager.update(objectId, proxy.matrix);
  }

  #worldBoundsForProxy(proxy, target = new THREE.Box3()) {
    const localBounds=proxy.userData.localBounds;
    if (localBounds) {
      target.min.fromArray(localBounds.min);
      target.max.fromArray(localBounds.max);
    } else {
      const size = proxy.userData.size ?? [1, 1, 1];
      const half = new THREE.Vector3(size[0] / 2, size[1] / 2, size[2] / 2);
      target.min.copy(half).multiplyScalar(-1);
      target.max.copy(half);
    }
    proxy.updateMatrixWorld(true);
    return target.applyMatrix4(proxy.matrixWorld);
  }

  #worldBoundsForObjectId(objectId, target = new THREE.Box3()) {
    target.makeEmpty();
    if (!this.#hierarchy.has(objectId)) return target;

    for (const id of renderableSubtreeIds(this.#hierarchy,objectId)) {
      const proxy=this.#meshes.get(id);
      if (!proxy) continue;
      target.union(this.#worldBoundsForProxy(proxy,new THREE.Box3()));
    }
    return target;
  }

  #storeEditedPivot(position) {
    const world = position.toArray();

    if (this.editorState.pivot.reference === "active-relative") {
      const activeId =
        this.#selectionSnapshot?.activeMember?.objectId;

      const center=this.#selectionReferencePosition(activeId);

      if (center) {
        const offset = new THREE.Vector3()
          .fromArray(world)
          .sub(center)
          .toArray();

        this.editorState.setRelativePivot(offset);
        return;
      }
    }

    this.editorState.setCustomPivot(world);
  }

  #configureTransformForEditor() {
    const mode=this.editorState.tool.mode;
    this.#interactionMode=mode;
    this.#selectionOperation=this.editorState.selectionOperation??"replace";
    const enabled=this.editorState.pivot.editing||["translate","rotate","scale"].includes(mode);
    this.transform.enabled=enabled;
    this.transform.getHelper().visible=enabled;
    if(this.editorState.pivot.editing){this.transform.setMode("translate");this.transform.setSpace("world")}
    else if(enabled){this.transform.setMode(this.editorState.tool.transformMode??mode);this.transform.setSpace(this.selection.orientationPolicy==="local"?"local":"world")}
    this.orbit.enabled=mode==="navigate"||!this.transform.dragging;
  }

  #beginSession() {
    if (this.#session) return;

    if (this.editorState.pivot.editing) {
      this.#session = { kind: "pivot" };
      this.#transformLifecycleDiagnostics.sessionsStarted += 1;
      return;
    }

    const members = this.#selectionSnapshot?.members ?? [];
    if (!members.length) return;

    this.transformAnchor.updateMatrixWorld(true);

    const initialAnchor = {
      position: this.transformAnchor.position.clone(),
      quaternion: this.transformAnchor.quaternion.clone(),
      scale: this.transformAnchor.scale.clone()
    };

    const objects = new Map();
    const previewObjects = new Map();
    for (const member of members) {
      const mesh = this.#meshes.get(member.objectId);
      if (!mesh) continue;
      mesh.updateMatrixWorld(true);
      objects.set(member.objectId, { matrixWorld: mesh.matrixWorld.clone() });

    }

    const previewIds=projectedSelectionIds(
      this.#hierarchy,
      members.map(member => member.objectId)
    );
    for (const previewId of previewIds) {
      const previewMesh=this.#meshes.get(previewId);
      if (!previewMesh) continue;
      previewMesh.updateMatrixWorld(true);
      previewObjects.set(previewId,{
        matrixWorld:previewMesh.matrixWorld.clone()
      });
    }

    this.#session = {
      kind:"selection",
      previewId: createPreviewId(),
      initialAnchor,
      objects,
      previewObjects
    };
    const diagnostics=this.#transformLifecycleDiagnostics;
    diagnostics.sessionsStarted += 1;
    diagnostics.selectionRootCount=objects.size;
    diagnostics.previewObjectCount=previewObjects.size;
    diagnostics.renderablePreviewCount=[...previewObjects.keys()]
      .filter(id => !this.#meshes.get(id)?.userData.logicalOnly)
      .length;
    diagnostics.lastError=null;
    this.#emitTransformPreview("begin", this.#session);
  }

  #previewSession() {
    if (!this.#session) return;

    const startedAt=performance.now();

    if (this.#session.kind === "pivot") {
      this.#storeEditedPivot(this.transformAnchor.position);
      return;
    }

    const initial = new THREE.Matrix4().compose(
      this.#session.initialAnchor.position,
      this.#session.initialAnchor.quaternion,
      this.#session.initialAnchor.scale
    );
    const current = new THREE.Matrix4().compose(
      this.transformAnchor.position,
      this.transformAnchor.quaternion,
      this.transformAnchor.scale
    );
    const delta = current.clone().multiply(initial.clone().invert());

    for (const [objectId, snapshot] of this.#session.previewObjects) {
      const mesh = this.#meshes.get(objectId);
      if (!mesh) continue;
      const result = delta.clone().multiply(snapshot.matrixWorld);
      applyProjectedWorldMatrix(mesh,result.toArray());
      this.#updateBatchMatrix(objectId, mesh);
    }
    this.#flushBatchBounds();
    this.#updateSelectionAppearance();
    this.#updateVertexMarkers();
    this.#emitTransformPreview("update", this.#session);
    const elapsed=performance.now()-startedAt;
    const diagnostics=this.#transformLifecycleDiagnostics;
    diagnostics.previews += 1;
    diagnostics.lastPreviewMs=elapsed;
    diagnostics.maxPreviewMs=Math.max(diagnostics.maxPreviewMs,elapsed);
  }

  #commitSession() {
    if (!this.#session) return;
    const startedAt=performance.now();
    const session=this.#session;
    this.#session=null;

    try {
      if (session.kind === "pivot") {
        this.#storeEditedPivot(this.transformAnchor.position);
        this.#transformLifecycleDiagnostics.commits += 1;
        return;
      }

      const transforms = [];
      for (const [objectId] of session.objects) {
        const mesh = this.#meshes.get(objectId);
        if (!mesh) continue;
        transforms.push({
          id: objectId,
          worldMatrix: mesh.matrix.toArray()
        });
      }

      if (
        this.#transformConfig.gridLock &&
        this.#transformConfig.translationSnap
      ) {
        const step = this.#transformConfig.translationSnap;

        for (const transform of transforms) {
          for (const index of [12,13,14]) {
            transform.worldMatrix[index]=
              Math.round(transform.worldMatrix[index]/step)*step;
          }
        }
      }

      const changed=!transforms.length || this.dispatch({
        type: "selection.transform-world",
        selection: this.#selectionSnapshot,
        pivot: {
          policy: this.editorState.pivot.policy,
          position: this.transformAnchor.position.toArray()
        },
        transforms
      });

      if (!changed) this.#restorePreviewSession(session);
      this.#emitTransformPreview(
        changed ? "end" : "cancel",
        session
      );
      this.#transformLifecycleDiagnostics.commits += 1;
      this.#transformLifecycleDiagnostics.lastError=null;
    } catch (error) {
      this.#restorePreviewSession(session);
      this.#emitTransformPreview("cancel", session);
      const diagnostics=this.#transformLifecycleDiagnostics;
      diagnostics.rollbacks += 1;
      diagnostics.lastError={
        code:error?.code ?? "TRANSFORM_COMMIT_FAILED",
        message:error?.message ?? String(error)
      };
      console.error("Transform session rolled back",error);
    } finally {
      this.transformAnchor.quaternion.identity();
      this.transformAnchor.scale.set(1, 1, 1);
      this.#rebuildAnchor();
      this.#transformLifecycleDiagnostics.lastCommitMs=
        performance.now()-startedAt;
    }
  }

  #restorePreviewSession(session) {
    if (session?.kind !== "selection") return;
    for (const [objectId,snapshot] of session.previewObjects) {
      const mesh=this.#meshes.get(objectId);
      if (!mesh) continue;
      applyProjectedWorldMatrix(mesh,snapshot.matrixWorld.toArray());
      this.#updateBatchMatrix(objectId,mesh);
    }
    this.#flushBatchBounds();
    this.#updateSelectionAppearance();
    this.#updateVertexMarkers();
  }

  #emitTransformPreview(phase, session) {
    if (
      session?.kind !== "selection" ||
      !session.previewId ||
      !this.#transformPreviewListeners.size
    ) {
      return;
    }
    const payload = Object.freeze({
      previewId: session.previewId,
      phase,
      transforms: Object.freeze(
        [...session.previewObjects.keys()]
          .map(id => {
            const proxy = this.#meshes.get(id);
            if (!proxy) return null;
            proxy.updateMatrixWorld(true);
            return Object.freeze({
              id,
              worldMatrix: Object.freeze(
                proxy.matrixWorld.toArray()
              )
            });
          })
          .filter(Boolean)
      )
    });
    for (const listener of [...this.#transformPreviewListeners]) {
      try {
        listener(payload);
      } catch (error) {
        console.error("Transform preview listener failed", error);
      }
    }
  }

  #applySharedPreviewTransforms(transforms) {
    for (const transform of transforms) {
      const proxy = this.#meshes.get(transform.id);
      if (!proxy) continue;
      applyProjectedWorldMatrix(proxy, transform.worldMatrix);
      this.#updateBatchMatrix(transform.id, proxy);
    }
    this.#flushBatchBounds();
    this.#rebuildAnchor();
    this.#updateSelectionAppearance();
    this.#updateVertexMarkers();
  }

  #restoreSharedPreviewObjects(objectIds) {
    const unique = new Set(objectIds);
    const nextTransforms = [];
    for (const id of unique) {
      let overlay = null;
      for (const transforms of this.#sharedTransformPreviews.values()) {
        const candidate = transforms.find(transform => transform.id === id);
        if (candidate) overlay = candidate;
      }
      if (overlay) {
        nextTransforms.push(overlay);
        continue;
      }
      const proxy = this.#meshes.get(id);
      const canonical = proxy?.userData.canonicalWorldMatrix;
      if (!proxy || !canonical) continue;
      nextTransforms.push({ id, worldMatrix: canonical });
    }
    this.#applySharedPreviewTransforms(nextTransforms);
  }

  #rebuildSharedTransformObjectIds() {
    this.#sharedTransformObjectIds = new Set(
      [...this.#sharedTransformPreviews.values()]
        .flatMap(transforms => transforms.map(transform => transform.id))
    );
  }

  #calculatePivot() {
    const members = this.#selectionSnapshot?.members ?? [];
    const references = members
      .map(member => this.#selectionReferencePosition(member.objectId))
      .filter(Boolean);

    if (!references.length) return null;

    const policy = this.editorState.pivot.policy;

    if (policy === "custom") {
      if (
        this.editorState.pivot.reference ===
        "active-relative"
      ) {
        const activeId =
          this.#selectionSnapshot?.activeMember?.objectId;

        const activePosition=this.#selectionReferencePosition(activeId);

        if (activePosition) {
          return activePosition
            .add(
              new THREE.Vector3().fromArray(
                this.editorState.pivot.relativeOffset
              )
            );
        }
      }

      return new THREE.Vector3().fromArray(
        this.editorState.pivot.customPosition
      );
    }

    if (policy === "active") {
      const activeId =
        this.#selectionSnapshot?.activeMember?.objectId;

      const activePosition=
        this.#selectionReferencePosition(activeId) ?? references.at(-1);

      return activePosition.clone();
    }

    if (policy === "bounds") {
      const bounds = new THREE.Box3().makeEmpty();

      for (const member of members) {
        bounds.union(this.#worldBoundsForObjectId(member.objectId));
      }

      return bounds.getCenter(new THREE.Vector3());
    }

    const median = new THREE.Vector3();

    for (const position of references) {
      median.add(position);
    }

    return median.multiplyScalar(1 / references.length);
  }

  #selectionReferencePosition(objectId) {
    if (!objectId || !this.#hierarchy.has(objectId)) return null;
    const animated = this.#animationPivotOverrides.get(objectId);
    if (animated) return new THREE.Vector3().fromArray(animated);
    return new THREE.Vector3().fromArray(
      selectionReferenceWorldPosition(this.#hierarchy,objectId)
    );
  }

  #rebuildAnchor() {
    if (this.#session) return;

    const pivot = this.#calculatePivot();
    if (!pivot) { this.transform.detach(); return; }
    if (!this.editorState.pivot.editing && !["translate","rotate","scale"].includes(this.editorState.tool.mode)) {
      this.transform.detach(); return;
    }

    this.transformAnchor.position.copy(pivot);
    this.transformAnchor.scale.set(1, 1, 1);

    const activeId = this.#selectionSnapshot?.activeMember?.objectId;
    const activeMesh = this.#meshes.get(activeId);

    const alignToActive=
      this.selection.orientationPolicy === "local" ||
      this.editorState.tool.mode === "scale";

    if (!this.editorState.pivot.editing && alignToActive && activeMesh) {
      this.transformAnchor.quaternion.copy(activeMesh.quaternion);
    } else {
      this.transformAnchor.quaternion.identity();
    }

    this.transform.attach(this.transformAnchor);
  }

  #updateVertexMarkers() {
    if (
      !this.#transformConfig.showVertices ||
      !this.#selectionSnapshot?.members?.length
    ) {
      this.#vertexMarkers.visible = false;
      return;
    }

    const bounds = new THREE.Box3().makeEmpty();

    for (const member of this.#selectionSnapshot.members) {
      bounds.union(this.#worldBoundsForObjectId(member.objectId));
    }

    if (bounds.isEmpty()) {
      this.#vertexMarkers.visible = false;
      return;
    }

    const min = bounds.min;
    const max = bounds.max;

    const vertices = [
      min.x, min.y, min.z,
      max.x, min.y, min.z,
      min.x, max.y, min.z,
      max.x, max.y, min.z,
      min.x, min.y, max.z,
      max.x, min.y, max.z,
      min.x, max.y, max.z,
      max.x, max.y, max.z
    ];

    this.#vertexMarkers.geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(vertices, 3)
    );

    const attribute =
      this.#vertexMarkers.geometry.getAttribute("position");

    attribute.needsUpdate = true;
    this.#vertexMarkers.geometry.computeBoundingSphere();
    this.#vertexMarkers.visible = true;
  }

  setTransformConfig(patch = {}) {
    this.#transformConfig = {
      ...this.#transformConfig,
      ...patch
    };

    const config = this.#transformConfig;

    this.transform.setSize(config.size);
    this.transform.setTranslationSnap(config.translationSnap);
    this.transform.setRotationSnap(
      config.rotationSnapDeg
        ? config.rotationSnapDeg * Math.PI / 180
        : null
    );
    this.transform.setScaleSnap(config.scaleSnap);

    this.transform.showX = config.showX;
    this.transform.showY = config.showY;
    this.transform.showZ = config.showZ;
    this.#vertexMarkers.material.size = config.vertexSize;
    this.#vertexMarkers.material.needsUpdate = true;

    this.#updateVertexMarkers();

    return this.getTransformConfig();
  }

  getTransformConfig() {
    return structuredClone(this.#transformConfig);
  }

  getTransformDiagnostics() {
    return {
      config: this.getTransformConfig(),
      mode: this.transform.mode,
      space: this.transform.space,
      axis: this.transform.axis,
      dragging: this.transform.dragging,
      pivotPolicy: this.editorState.pivot.policy,
      pivotPosition: this.getSelectionPivotPosition(),
      selection: this.#selectionSnapshot,
      selectionAppearance: this.#selectionOutlines.diagnostics(),
      lifecycle:structuredClone(this.#transformLifecycleDiagnostics)
    };
  }

  getSelectionPivotPosition() {
    return this.#calculatePivot()?.toArray() ?? null;
  }

  benchmarkSelectionOutlines(options = {}) {
    return benchmarkSelectionOutlines(options);
  }

  getSelectionAppearanceDiagnostics() {
    const diagnostics = this.#selectionOutlines.diagnostics();
    const selectedMembers =
      this.#selectionSnapshot?.members?.length ?? 0;

    return Object.freeze({
      selectedMembers,
      outlinesRequested: diagnostics.instanceCount,
      outlinesSubmitted: diagnostics.submittedInstanceCount,
      complete:
        selectedMembers === diagnostics.instanceCount &&
        diagnostics.instanceCount ===
        diagnostics.submittedInstanceCount,
      capacity: diagnostics.capacity,
      reallocations: diagnostics.reallocations,
      geometryReplacements: diagnostics.geometryReplacements,
      drawCalls: diagnostics.drawCalls,
      submittedLineSegments:
        diagnostics.submittedLineSegments,
      lastMatrixWrites: diagnostics.lastMatrixWrites,
      lastColorWrites: diagnostics.lastColorWrites,
      lastUploadedBytes: diagnostics.lastUploadedBytes,
      memoryBytes: diagnostics.memoryBytes,
      lastUpdateMs: diagnostics.lastUpdateMs,
      maxUpdateMs: diagnostics.maxUpdateMs,
      rendererInstanceLimit:
        diagnostics.rendererInstanceLimit
    });
  }

  #updateSelectionAppearance() {
    const selected=new Set((this.#selectionSnapshot?.members??[]).map(m=>m.objectId));
    const activeId=this.#selectionSnapshot?.activeMember?.objectId;
    const outlines=[];
    for(const id of selected){
      if(!this.#meshes.has(id))continue;
      const bounds=this.#worldBoundsForObjectId(id);
      if(bounds.isEmpty())continue;
      outlines.push(selectionOutlineInstance({
        id,
        bounds,
        active:id===activeId
      }));
    }
    this.#selectionOutlines.update(outlines);
    for(const id of this.#selectedVisualIds)if(!selected.has(id))this.#applyObjectInstanceColor(id);
    this.#selectedVisualIds=selected;
    this.#updateCameraVisualAppearance();
  }

  #updateCameraVisualAppearance() {
    const selected = new Set(
      (this.#selectionSnapshot?.members ?? [])
        .map(member => member.objectId)
    );
    const activeId = this.#cameraVisualState.activeCameraId;
    const defaultId = this.#cameraVisualState.defaultCameraId;
    const policy = this.#cameraVisualState.helperPolicy;

    for (const [id, visual] of this.#cameraVisuals) {
      const isSelected = selected.has(id);
      const isActive = id === activeId;
      const isDefault = id === defaultId;
      const bodyColor = isSelected
        ? 0x68f0a8
        : isActive
          ? 0xff6bd6
          : isDefault
            ? 0x72d6ff
            : 0xffc857;
      const lensColor = isSelected
        ? 0xc6ffe1
        : isActive
          ? 0xffb5ec
          : isDefault
            ? 0xb8ecff
            : 0xffa62b;
      visual.body.material.color.setHex(bodyColor);
      visual.lens.material.color.setHex(lensColor);
      visual.lines.material.color.setHex(
        isSelected ? 0x68f0a8 : isDefault ? 0x72d6ff : 0x58748d
      );
      visual.body.visible = this.#cameraVisualState.showIcons;
      visual.lens.visible = this.#cameraVisualState.showIcons;
      visual.lines.visible = Boolean(
        this.#cameraVisualState.showFrustums &&
        !isActive &&
        (
          policy === "all" ||
          (policy === "selected" && isSelected)
        )
      );
      visual.body.material.depthTest = !isSelected;
      visual.lens.material.depthTest = !isSelected;
      visual.body.renderOrder = isSelected ? 900 : 0;
      visual.lens.renderOrder = isSelected ? 900 : 0;
    }
  }

  #cameraScreenHitIds(clientX, clientY, rect, radius) {
    const hits = [];
    for (const [id] of this.#cameraVisuals) {
      const proxy = this.#meshes.get(id);
      if (!proxy) continue;
      const projected = proxy
        .getWorldPosition(new THREE.Vector3())
        .project(this.camera);
      if (projected.z < -1 || projected.z > 1) continue;
      const x = rect.left + (projected.x + 1) * 0.5 * rect.width;
      const y = rect.top + (1 - projected.y) * 0.5 * rect.height;
      const distance = Math.hypot(clientX - x, clientY - y);
      if (distance <= radius) hits.push({ id, distance });
    }
    return hits
      .sort((left, right) => left.distance - right.distance)
      .map(hit => hit.id);
  }

  getInputDiagnostics() {
    return structuredClone(this.#inputDiagnostics);
  }

  #selectAt(event) {
    this.#inputDiagnostics.pointerUp += 1;

    if (!this.#tap) {
      this.#inputDiagnostics.discardedReason = "sem-pointerdown";
      return;
    }

    if (this.#tap.id !== event.pointerId) {
      this.#inputDiagnostics.discardedReason = "pointer-id-diferente";
      return;
    }

    if (this.transform.dragging) {
      this.#inputDiagnostics.discardedReason = "transform-dragging";
      return;
    }

    const tolerance = this.#tap.type === "touch" ? 28 : 8;
    const pointerType = this.#tap.type;
    const distance = Math.hypot(event.clientX - this.#tap.x, event.clientY - this.#tap.y);
    const duration = performance.now() - this.#tap.time;
    this.#inputDiagnostics.lastDistance = Number(distance.toFixed(2));
    this.#inputDiagnostics.lastDuration = Number(duration.toFixed(1));
    this.#tap = null;

    if (distance > tolerance) {
      this.#inputDiagnostics.discardedReason = "movimento-excessivo";
      return;
    }

    if (duration > 650) {
      this.#inputDiagnostics.discardedReason = "toque-longo";
      return;
    }

    const rect = this.canvas.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.#inputDiagnostics.lastNdc = [
      Number(this.pointer.x.toFixed(3)),
      Number(this.pointer.y.toFixed(3))
    ];
    this.raycaster.setFromCamera(this.pointer, this.camera);

    // Atualiza apenas lotes modificados. O Raycaster ordena os
    // resultados pela distância à câmera, não pelo centro do mundo.
    this.#flushBatchBounds();

    const hits = this.raycaster.intersectObjects(
      this.#batchManager.batches().map(batch => batch.mesh),
      false
    );

    const cameraHits = this.raycaster.intersectObjects(
      [...this.#cameraVisuals.values()].flatMap(
        visual => [visual.body, visual.lens, visual.lines]
      ),
      false
    );
    const hitIds=[...new Set([
      ...hits.map(hit => this.#batchManager.objectFromHit(hit)),
      ...cameraHits.map(hit => hit.object.userData.cameraObjectId),
      ...this.#cameraScreenHitIds(
        event.clientX,
        event.clientY,
        rect,
        pointerType === "touch" ? 22 : 12
      )
    ].filter(Boolean).map(id=>this.#hierarchy.has(id)?selectionUnitId(this.#hierarchy,id):id))];
    const objectId=this.#cycledHitId(hitIds,event.clientX,event.clientY);
    this.#inputDiagnostics.objectHits=hitIds.length;

    if(this.#interactionMode==="navigate"){this.#inputDiagnostics.discardedReason="navigation-mode";return}
    const transformMode=["translate","rotate","scale"].includes(this.#interactionMode);
    const gizmoActive=transformMode&&(this.transform.axis!==null||this.transform.dragging);
    this.#inputDiagnostics.gizmoHits=gizmoActive?1:0;
    if(gizmoActive){this.#inputDiagnostics.discardedReason="gizmo-active";return}
    this.#inputDiagnostics.lastObjectId=objectId??null;

    if(!objectId){this.#inputDiagnostics.selectionAction="clear";this.#inputDiagnostics.discardedReason="nenhum-objeto";if(this.#selectionOperation==="replace")this.selection.clear();return}
    const member={kind:"object",regionId:"region-main",objectId};
    const op=this.editorState.multiSelect?"toggle":this.#selectionOperation;
    this.#inputDiagnostics.selectionAction=op;this.#applySelectionMembers([member],op);this.#inputDiagnostics.discardedReason=null;
  }

  #applySelectionMembers(members,operation){
    const current=this.#selectionSnapshot?.members??[],byId=new Map(current.map(m=>[m.objectId,m]));
    if(operation==="replace"){if(this.selection.replaceMany)this.selection.replaceMany(members);else{this.selection.clear();if(members[0])this.selection.replace(members[0]);for(const m of members.slice(1))this.selection.toggle(m)}return}
    if(operation==="add")for(const m of members)byId.set(m.objectId,m);
    else if(operation==="remove")for(const m of members)byId.delete(m.objectId);
    else for(const m of members){if(byId.has(m.objectId))byId.delete(m.objectId);else byId.set(m.objectId,m)}
    const next=[...byId.values()];if(this.selection.replaceMany)this.selection.replaceMany(next);else{this.selection.clear();if(next[0])this.selection.replace(next[0]);for(const m of next.slice(1))this.selection.toggle(m)}
  }

  #cycledHitId(ids,x,y){
    if(!ids.length){this.#overlapCycle={x:null,y:null,ids:[],index:-1,time:0};return null}
    const now=performance.now(),samePoint=this.#overlapCycle.x!==null&&Math.hypot(x-this.#overlapCycle.x,y-this.#overlapCycle.y)<12,sameIds=ids.length===this.#overlapCycle.ids.length&&ids.every((id,i)=>id===this.#overlapCycle.ids[i]);
    if(samePoint&&sameIds&&now-this.#overlapCycle.time<1400)this.#overlapCycle.index=(this.#overlapCycle.index+1)%ids.length;else this.#overlapCycle={x,y,ids:[...ids],index:0,time:now};this.#overlapCycle.time=now;return ids[this.#overlapCycle.index];
  }

  resize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
    this.#notifyNavigationCamera();
  }

  #notifyNavigationCamera() {
    if (!this.#cameraListeners.size) return;
    const snapshot = this.readNavigationCamera();
    for (const listener of [...this.#cameraListeners]) {
      try {
        listener(snapshot);
      } catch (error) {
        console.error("Navigation camera listener failed", error);
      }
    }
  }

getResourceDiagnostics() {
  const batches = this.#batchManager.batches();
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  let texturedMeshes = 0;

  for (const batch of batches) {
    if (batch.geometry) geometries.add(batch.geometry);
    if (batch.material) {
      materials.add(batch.material);
      if (batch.material.map) {
        textures.add(batch.material.map);
        texturedMeshes += 1;
      }
    }
  }

  const info = this.renderer?.info;

  return Object.freeze({
    meshes: batches.length,
    logicalProxies: this.#meshes.size,
    instancedMeshes: batches.length,
    logicalInstances: this.#batchManager.stats().objects,
    cameraObjects: this.#cameraVisuals.size,
    uniqueGeometries: geometries.size,
    uniqueMaterials: materials.size,
    uniqueTextures: textures.size,
    texturedMeshes,
    render: info ? {
      calls: info.render.calls,
      triangles: info.render.triangles,
      lines: info.render.lines,
      points: info.render.points,
      frame: info.render.frame
    } : null,
    memory: info ? {
      geometries: info.memory.geometries,
      textures: info.memory.textures
    } : null,
    programs: Array.isArray(info?.programs) ? info.programs.length : null,
    cache: this.#resourceCache.stats(),
    materials: this.#materialCache.stats(),
    batches: this.#batchManager.stats(),
    incremental: this.getIncrementalDiagnostics?.() ?? null
  });
}

  animate = timestamp => {
    requestAnimationFrame(this.animate);
    const current = Number.isFinite(timestamp)
      ? timestamp
      : performance.now();
    const deltaSeconds = this.#lastFrameTimestamp === null
      ? 0
      : Math.max(0, (current - this.#lastFrameTimestamp) / 1000);
    this.#lastFrameTimestamp = current;
    const frame = Object.freeze({
      timestampMs: current,
      deltaSeconds
    });
    for (const listener of [...this.#frameListeners]) {
      try {
        listener(frame);
      } catch (error) {
        console.error("Animation frame listener failed", error);
      }
    }
    this.orbit.update();
    this.renderer.render(this.scene, this.camera);
  };
}

function previewSessionKey(session = {}) {
  const source = String(session.source ?? "").trim();
  const previewId = String(session.previewId ?? "").trim();
  if (!source || !previewId) {
    throw new TypeError(
      "Preview compartilhado exige origem e identificador."
    );
  }
  return `${source}:${previewId}`;
}

function normalizePreviewTransforms(transforms = []) {
  if (!Array.isArray(transforms)) {
    throw new TypeError("Preview compartilhado exige transformações.");
  }
  return transforms.map(entry => {
    const id = String(entry?.id ?? entry?.objectId ?? "").trim();
    const worldMatrix = entry?.worldMatrix;
    if (
      !id ||
      !Array.isArray(worldMatrix) ||
      worldMatrix.length !== 16 ||
      !worldMatrix.every(Number.isFinite)
    ) {
      throw new TypeError("Transformação de preview inválida.");
    }
    return Object.freeze({
      id,
      worldMatrix: Object.freeze(worldMatrix.map(Number))
    });
  });
}

function createPreviewId() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `preview-${Date.now().toString(36)}-${
    Math.random().toString(36).slice(2)
  }`;
}


function safeColorRatio(desired, base) {
  if (Math.abs(base) < 1e-8) {
    return desired <= 1e-8 ? 0 : desired;
  }

  return desired / base;
}
