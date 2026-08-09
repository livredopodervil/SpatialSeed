import * as THREE from "three";
import {
  RenderDemandScheduler
} from "./RenderDemandScheduler.js?build=20260808-0053i";
import {
  SpatialObjectIndex,
  spatialCellKeyForPoint
} from "./SpatialObjectIndex.js?build=20260807-0051a";
import {
  mirrorGeometryXInPlace
} from "./MirroredGeometry.js?build=20260807-0051a";
import {
  InstanceBatch,
  updateAbsoluteInstanceColor
} from "../../instance-batches/src/InstanceBatch.js?build=20260730-0040e";
import {
  InstanceBatchManager
} from "../../instance-batches/src/InstanceBatchManager.js?build=20260807-0051a";
import {
  HeterogeneousBatchManager
} from "./HeterogeneousBatchManager.js?build=20260807-0051a";
import {
  normalizeStrokeBundleDescriptor,
  strokeBundleChunkDescriptor,
  strokeChunkRenderResourcePath
} from "../../stroke-resources/src/index.js?build=20260801-0045a1";
import { BatchMaterialCache } from "../../batch-material-cache/src/index.js?build=20260726-0032a";
import {
  DEFAULT_VIEWER_RENDER_SETTINGS,
  describeViewerRenderPresets,
  mergeViewerRenderSettings,
  normalizeViewerRenderSettings,
  viewerRenderPreset
} from "./ViewerRenderSettings.js?build=20260726-0032a";
import {
  createViewerEnvironmentTexture
} from "./ViewerEnvironment.js?build=20260726-0032a";
import { ThreeResourceCache } from "../../renderer-resource-cache/src/index.js?build=20260731-0044b";
import { createDefaultGeometryRegistry } from "../../geometry-registry/src/index.js?build=20260801-0045a1";
import { HierarchyIndex } from "../../scene-hierarchy/src/index.js?build=20260807-0052b";
import {
  normalizeCameraProjection,
  normalizeNavigationCamera
} from "../../runtime-layers/src/index.js?build=20260807-0051a";
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
  composeAnimationLayer,
  rebaseAnimationLayerInput,
  createAnimationTargetSnapshot
} from "./AnimationTransformOverlay.js?build=20260808-0053i";
import { FastTransformOverlay } from "./FastTransformOverlay.js?build=20260808-0053f";

import {
  cameraFrameQuaternion,
  constrainWorldDeltaMatrix,
  projectWorldDeltaToConstraint,
  selectedVertexPivotWorld,
  snapWorldPointToFrameGrid
} from "../../mesh-editor-core/src/MeshEditMath.js?build=20260727-0036d";
import {
  buildMeshTopology
} from "../../mesh-editor-core/src/MeshTopology.js?build=20260727-0036d";
import {
  createMeshInfluenceField,
  normalizeMeshDeformationSettings,
  transformLocalPositionsWithInfluenceInto
} from "../../mesh-editor-core/src/MeshDeformation.js?build=20260727-0036d";
import {
  normalizeMeshComponentMode
} from "../../mesh-editor-core/src/MeshTopologyOperations.js?build=20260727-0036d";
import {
  normalizeScreenSelectionGesture,
  ScreenSelectionIndex
} from "./ScreenSelectionGesture.js?build=20260807-0052b";
import {
  ToolGestureNavigation
} from "./ToolGestureNavigation.js?build=20260731-0043x1";
import {
  resolveEditorOrbitEnabled
} from "./EditorOrbitPolicy.js?build=20260808-0053i";
import { ReplicaRenderIndex } from "./ReplicaRenderIndex.js?build=20260808-0053f";
import {
  createLocalBoundsScaleHandleSet,
  proportionalScaleFactor2D,
  scaleFactorsForAxes,
  scaleWorldTrsWithoutShear
} from "./LocalBoundsScale.js?build=20260807-0052b";
import {
  explicitFamilyTransformAt,
  explicitInstanceFamilyEstimatedBytes,
  familyMemberResourcePath,
  normalizeExplicitInstanceFamily
} from "../../procedural-families/src/index.js?build=20260801-0045a1";
import {
  appearanceBindingForObject,
  appearanceBindingIdentity,
  effectiveAppearanceColor,
  familyColorAt,
  multiplyHexColors
} from "../../appearance-binding/src/index.js?build=20260730-0041a";

export class ThreeRegionRenderer {
  static apiVersion = "renderer-three-navigation-camera-v8";
  #meshes = new Map();
  #cameraVisuals = new Map();
  #lightVisuals = new Map();
  #familyVisuals = new Map();
  #strokeVisuals = new Map();
  #familyBuildQueue = [];
  #familyBuildHandle = null;
  #familyBuildDeferredAt = null;
  #objectVisualListeners = new Set();
  #selectionSnapshot = null;
  #session = null;
  #tap = null;
  #lastPointer = null;
  #meshTopologyCache = new WeakMap();
  #textureLoader = new THREE.TextureLoader();
  #projectObject = object => object;
  #geometryRegistry = null;
  #resourceCache = new ThreeResourceCache({ textureLoader: this.#textureLoader });
  #materialCache = null;
  #viewerRenderSettings = DEFAULT_VIEWER_RENDER_SETTINGS;
  #environmentTarget = null;
  #hemisphereLight = null;
  #directionalLight = null;
  #shadowFloor = null;
  #lastState = null;
  #batchManager = null;
  #heterogeneousBatchManager = null;
  #selectedVisualIds = new Set();
  #selectionOutlines = null;
  #interactionMode = "select";
  #selectionOperation = "replace";
  #objectTransformFrame = {
    mode: "world",
    quaternion: [0, 0, 0, 1]
  };
  #objectTransformAxes = { x: true, y: true, z: true };
  #navigationLocks = { plane: null, point: null };
  #navigationMode = "free";
  #toolGestureNavigation = null;
  #editorToolNavigationToken = null;
  #editPlane = null;
  #drawingPlane = null;
  #surfaceRaycastProbe = new THREE.Mesh();
  #pickingRaycastProbe = new THREE.Mesh();
  #spatialObjectIndex = new SpatialObjectIndex({
    cellSize: 32,
    maxCellsPerObject: 512
  });
  #replicaRenderIndex = new ReplicaRenderIndex();
  #spatialShardSize = 32;
  #spatialShardCapacity = 256;
  #mirrorXMatrix = new THREE.Matrix4().makeScale(-1, 1, 1);
  #navigationDefaults = {
    enableRotate: true,
    enablePan: true,
    screenSpacePanning: true,
    cameraUp: [0, 1, 0]
  };
  #applyingNavigationLocks = false;
  #overlapCycle = { x: null, y: null, ids: [], index: -1, time: 0 };
  #batchCapacity = 65536;
  #hierarchy = new HierarchyIndex([]);
  #objectsById = new Map();
  #hierarchyRefreshHandle = null;
  #hierarchyRefreshState = null;
  #batchMaintenanceHandle = null;
  #dirtyBatchKeys = new Set();
  #screenSelectionVersion = 0;
  #screenSelectionCache = {
    key: null,
    index: new ScreenSelectionIndex(),
    builds: 0,
    hits: 0
  };
  #frameListeners = new Set();
  #renderDemand = null;
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
  #animationAppliedMatrices = new Map();
  #animationAppliedColors = new Map();
  #animationPivotSignature = null;
  #animationOverlays = new Map();
  #animationObjectOverlayIds = new Map();
  #animationOverlaySequence = 0;
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
    localUpdates: 0,
    localHierarchyUpdates: 0,
    localHierarchyObjectsVisited: 0,
    deferredHierarchyBuilds: 0,
    deferredBatchBounds: 0,
    objectsCreated: 0,
    objectsUpdated: 0,
    objectsDeleted: 0,
    skippedHierarchyBuilds: 0,
    hierarchyObjectsVisited: 0,
    dirtyBatchVisits: 0,
    fullBatchVisits: 0,
    screenObjectsVisited: 0,
    raycastBatchVisits: 0,
    spatialRayQueries: 0,
    spatialRayCandidates: 0,
    spatialExactRaycasts: 0,
    spatialShardMigrations: 0,
    familyObjects: 0,
    familyInstances: 0,
    familyEstimatedBytes: 0,
    familyBuildChunks: 0,
    familyBuildDeferredForInput: 0,
    familyBuildForcedProgress: 0,
    familyBuildMaximumChunkMs: 0,
    surfaceTargetCaptures: 0,
    surfaceRaycasts: 0,
    surfaceRaycastObjectVisits: 0,
    surfaceHits: 0,
    surfaceMisses: 0,
    surfaceJumpRejections: 0
  };
  #fastTransformOverlay = new FastTransformOverlay();
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
    scaleFromCenter: false,
    gridLock: false,
    showX: true,
    showY: true,
    showZ: true,
    showVertices: false,
    vertexSize: 5
  };
  #vertexMarkers = null;
  #boundsScale = null;
  #boundsScalePickCycle = null;
  #meshEdit = null;
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
      projectObject = object => object,
      viewerRenderSettings = DEFAULT_VIEWER_RENDER_SETTINGS
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
    this.#viewerRenderSettings = normalizeViewerRenderSettings(
      viewerRenderSettings
    );
    this.#materialCache = new BatchMaterialCache({
      resourceCache: this.#resourceCache,
      viewerMaterialSettings: this.#viewerRenderSettings.materials
    });

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(
      globalThis.devicePixelRatio ?? 1,
      this.#viewerRenderSettings.quality.pixelRatioCap
    ));
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
        batch.mesh.castShadow = this.#viewerRenderSettings.shadows.enabled;
        batch.mesh.receiveShadow = this.#viewerRenderSettings.shadows.enabled;
        this.scene.add(batch.mesh);
        return batch;
      }
    });
    this.#heterogeneousBatchManager = new HeterogeneousBatchManager({
      onBatchCreated: batch => {
        // BatchedMesh não calcula bounds automaticamente. Mantemos o lote
        // visível até que uma política incremental de bounds por shard seja
        // habilitada; isto preserva correção sem revarrer a geometria no gesto.
        batch.mesh.frustumCulled = false;
        batch.mesh.castShadow = this.#viewerRenderSettings.shadows.enabled;
        batch.mesh.receiveShadow = this.#viewerRenderSettings.shadows.enabled;
        this.scene.add(batch.mesh);
      },
      onBatchDeleted: batch => {
        this.scene.remove(batch.mesh);
        if (batch.materialKey) this.#materialCache.release(batch.materialKey);
      }
    });

    this.camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 1000);
    this.camera.position.set(10, 8, 14);

    this.orbit = new OrbitControls(this.camera, canvas);
    this.orbit.enableDamping = true;
    this.orbit.target.set(0, 1, 0);
    this.#toolGestureNavigation = new ToolGestureNavigation({
      canvas,
      orbit: this.orbit,
      camera: this.camera,
      canRotate: () =>
        this.orbit.enableRotate && !this.#navigationLocks.plane,
      onCameraChanged: () => {
        // OrbitControls.update() emite o único evento público de câmera.
        // Aqui apenas aplicamos as travas antes dessa emissão.
        this.#enforceNavigationLocks();
      }
    });
    this.#navigationDefaults = {
      enableRotate: this.orbit.enableRotate,
      enablePan: this.orbit.enablePan,
      screenSpacePanning: this.orbit.screenSpacePanning,
      cameraUp: this.camera.up.toArray()
    };
    this.orbit.addEventListener(
      "change",
      () => {
        this.#enforceNavigationLocks();
        this.#notifyNavigationCamera();
        this.invalidateRender("camera");
      }
    );
    this.#renderDemand = new RenderDemandScheduler({
      prepareFrame: () => {
        const changed = Boolean(this.orbit.update());
        return Object.freeze({ changed, continue: changed });
      },
      render: () => this.renderer.render(this.scene, this.camera)
    });

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

    this.#hemisphereLight = new THREE.HemisphereLight();
    this.scene.add(this.#hemisphereLight);

    this.#directionalLight = new THREE.DirectionalLight();
    this.scene.add(
      this.#directionalLight,
      this.#directionalLight.target
    );

    this.#shadowFloor = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200),
      new THREE.ShadowMaterial({
        color: 0x000000,
        opacity: 0.28,
        transparent: true
      })
    );
    this.#shadowFloor.name = "viewer-shadow-floor";
    this.#shadowFloor.rotation.x = -Math.PI / 2;
    this.#shadowFloor.receiveShadow = true;
    this.scene.add(this.#shadowFloor);

    this.#applyViewerRenderSettings();

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
      this.invalidateRender("selection");
    });

    this.editorState.subscribe(() => {
      this.#configureTransformForEditor();
      this.#rebuildAnchor();
      this.#updateVertexMarkers();
      this.invalidateRender("editor-state");
    });

    this.transform.addEventListener("dragging-changed", event => {
      this.orbit.enabled = this.#resolveEditorOrbitEnabled({
        transformDragging: Boolean(event.value)
      });
      if (event.value) this.#beginSession();
      else if (this.#session) this.#commitSession();
    });
    this.transform.addEventListener("mouseDown", () => this.#beginSession());
    this.transform.addEventListener("objectChange", () => {
      if (!this.#session) {
        /*
         * TransformControls altera o objeto anexado antes de emitir
         * objectChange. Se uma sessão não pôde ser aberta, restauramos a
         * âncora imediatamente para que o gizmo não pareça editar um pivô
         * sem alvo.
         */
        this.#rebuildAnchor();
        return;
      }
      this.#previewSession();
      this.invalidateRender("transform-preview");
    });
    this.transform.addEventListener("mouseUp", () => this.#commitSession());

    canvas.addEventListener("pointerdown", event => {
      this.#inputDiagnostics.pointerDown += 1;
      this.#inputDiagnostics.lastPointerType = event.pointerType || "mouse";
      this.#inputDiagnostics.discardedReason = null;
      this.#lastPointer = {
        x: event.clientX,
        y: event.clientY,
        type: event.pointerType || "mouse"
      };
      if (this.#toolGestureNavigation.isNavigationGesture(event)) {
        this.#tap = null;
        this.#inputDiagnostics.discardedReason = "gesto-multitoque";
        return;
      }
      if (this.#tryBeginBoundsScale(event)) {
        this.#tap = null;
        return;
      }
      if (
        this.#interactionMode === "select" &&
        this.editorState.areaSelection
      ) {
        this.#tap = null;
        return;
      }
      this.#tap = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        time: performance.now(),
        type: event.pointerType || "mouse"
      };
    }, true);

    canvas.addEventListener("pointermove", event => {
      this.#lastPointer = {
        x: event.clientX,
        y: event.clientY,
        type: event.pointerType || "mouse"
      };
      this.#updateBoundsScale(event);
    }, true);

    canvas.addEventListener("pointercancel", event => {
      this.#inputDiagnostics.pointerCancel += 1;
      this.#inputDiagnostics.discardedReason = "pointercancel";
      this.#tap = null;
      this.#finishBoundsScale(event);
    }, true);
    canvas.addEventListener("pointerup", event => {
      if (this.#finishBoundsScale(event)) return;
      this.#selectAt(event);
    }, true);
    addEventListener("resize", () => this.resize());

    installRenderInvalidationWrappers(this);
    this.invalidateRender("initial");
  }

  canBeginMeshEdit(objectId) {
    const id = String(objectId ?? "").trim();
    if (!id) return Object.freeze({ ok: false, reason: "object-id-empty" });
    if (this.#meshEdit) {
      return Object.freeze({ ok: false, reason: "mesh-edit-active" });
    }
    if (this.#session) {
      return Object.freeze({ ok: false, reason: "transform-active" });
    }
    if (this.#animationTargetIds.has(id)) {
      return Object.freeze({ ok: false, reason: "animation-active" });
    }
    if (this.#sharedTransformObjectIds.has(id)) {
      return Object.freeze({ ok: false, reason: "shared-preview-active" });
    }
    const proxy = this.#meshes.get(id);
    const location = this.#batchManager.locationOf(id);
    const batch = location
      ? this.#batchManager.getBatch(location.batchKey)
      : null;
    if (!proxy || !batch || proxy.userData.logicalOnly) {
      return Object.freeze({ ok: false, reason: "object-not-renderable" });
    }
    return Object.freeze({ ok: true, reason: null });
  }

  beginMeshEdit({
    objectId,
    geometry,
    objectWorldMatrix,
    selectedIndices = [],
    componentMode = "vertex",
    selectedComponents = selectedIndices,
    frameMode = "local",
    frameQuaternion = [0, 0, 0, 1],
    options = {},
    onVertexPick = null,
    onComponentPick = null,
    onTransformStart = null,
    onTransformPreview = null,
    onTransformCommit = null
  } = {}) {
    const id = String(objectId ?? "").trim();
    const availability = this.canBeginMeshEdit(id);
    if (!availability.ok) {
      const messages = {
        "mesh-edit-active": "Já existe uma edição de malha ativa neste viewer.",
        "transform-active": "Finalize o arrasto atual antes de editar a malha.",
        "animation-active": "Interrompa a animação ativa deste objeto antes de editar sua malha.",
        "shared-preview-active": "Aguarde o término da transformação compartilhada deste objeto.",
        "object-not-renderable": `Objeto renderizável inexistente: ${id}.`,
        "object-id-empty": "Identificador do objeto ausente."
      };
      throw new Error(
        messages[availability.reason] ??
        "A malha não pode ser editada agora."
      );
    }
    const proxy = this.#meshes.get(id);
    const location = this.#batchManager.locationOf(id);
    const batch = this.#batchManager.getBatch(location.batchKey);
    const descriptor = this.#geometryRegistry.normalize(geometry);
    const editGeometry = this.#geometryRegistry.create(descriptor);
    const group = new THREE.Group();
    group.name = `mesh-edit:${id}`;
    group.matrixAutoUpdate = false;
    group.matrix.fromArray(objectWorldMatrix);
    group.matrixWorldNeedsUpdate = true;

    const material = this.#cloneBatchMaterial(batch, id);
    const mesh = new THREE.Mesh(editGeometry, material);
    mesh.name = `mesh-edit-surface:${id}`;
    mesh.castShadow = this.#viewerRenderSettings.shadows.enabled;
    mesh.receiveShadow = this.#viewerRenderSettings.shadows.enabled;
    mesh.frustumCulled = false;

    const wire = new THREE.Mesh(
      editGeometry,
      new THREE.MeshBasicMaterial({
        color: 0x7ec8ff,
        wireframe: true,
        transparent: true,
        opacity: 0.2,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1
      })
    );
    wire.name = `mesh-edit-wire:${id}`;
    wire.frustumCulled = false;

    const occlusion = options.occlusion !== false;
    const constraint = String(options.constraint ?? "free");
    const snap = normalizeMeshSnapSettings(options.snap);
    const deformation = normalizeMeshDeformationSettings(options.deformation);
    const markerGeometry = new THREE.BufferGeometry();
    const markers = new THREE.Points(
      markerGeometry,
      new THREE.PointsMaterial({
        size: Math.max(8, this.#transformConfig.vertexSize),
        sizeAttenuation: false,
        vertexColors: true,
        depthTest: false,
        depthWrite: false
      })
    );
    markers.name = `mesh-edit-vertices:${id}`;
    markers.renderOrder = 1200;
    markers.frustumCulled = false;

    const edgeOverlay = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.9,
        depthTest: false,
        depthWrite: false
      })
    );
    edgeOverlay.name = `mesh-edit-edges:${id}`;
    edgeOverlay.renderOrder = 1190;
    edgeOverlay.frustumCulled = false;

    const faceOverlay = new THREE.Mesh(
      new THREE.BufferGeometry(),
      new THREE.MeshBasicMaterial({
        color: 0xffb347,
        transparent: true,
        opacity: 0.28,
        depthTest: false,
        depthWrite: false,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2
      })
    );
    faceOverlay.name = `mesh-edit-faces:${id}`;
    faceOverlay.renderOrder = 1185;
    faceOverlay.frustumCulled = false;

    const snapMarkerGeometry = new THREE.BufferGeometry();
    snapMarkerGeometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute([0, 0, 0], 3)
    );
    const snapMarker = new THREE.Points(
      snapMarkerGeometry,
      new THREE.PointsMaterial({
        color: 0xfff176,
        size: 14,
        sizeAttenuation: false,
        depthTest: false,
        depthWrite: false
      })
    );
    snapMarker.name = `mesh-edit-snap-target:${id}`;
    snapMarker.visible = false;
    snapMarker.renderOrder = 1300;

    const snapLineGeometry = new THREE.BufferGeometry();
    snapLineGeometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0], 3)
    );
    const snapLine = new THREE.Line(
      snapLineGeometry,
      new THREE.LineBasicMaterial({
        color: 0xfff176,
        transparent: true,
        opacity: 0.85,
        depthTest: false,
        depthWrite: false
      })
    );
    snapLine.name = `mesh-edit-snap-line:${id}`;
    snapLine.visible = false;
    snapLine.renderOrder = 1299;

    group.add(mesh, wire, faceOverlay, edgeOverlay, markers, snapMarker, snapLine);
    this.scene.add(group);
    this.#batchManager.update(id, new THREE.Matrix4().makeScale(0, 0, 0));
    this.#flushBatchBounds();

    this.#meshEdit = {
      objectId: id,
      descriptor,
      objectWorldMatrix: [...objectWorldMatrix],
      group,
      mesh,
      wire,
      markers,
      edgeOverlay,
      faceOverlay,
      componentMode: normalizeMeshComponentMode(componentMode),
      selectedComponents: new Set(selectedComponents.map(Number)),
      activeComponent: selectedComponents.at(-1) ?? null,
      selectedIndices: new Set(selectedIndices),
      activeVertex: selectedIndices.at(-1) ?? null,
      frameMode,
      frameQuaternion: [...frameQuaternion],
      constraint,
      snap,
      deformation,
      topology: buildMeshTopology(descriptor),
      influenceField: null,
      influence: new Map(),
      snapMarker,
      snapLine,
      lastSnapCandidate: null,
      options: { occlusion },
      display: normalizeMeshDisplaySettings(options.display),
      onVertexPick:
        typeof onVertexPick === "function" ? onVertexPick : null,
      onComponentPick:
        typeof onComponentPick === "function" ? onComponentPick : null,
      onTransformStart:
        typeof onTransformStart === "function" ? onTransformStart : null,
      onTransformPreview:
        typeof onTransformPreview === "function" ? onTransformPreview : null,
      onTransformCommit:
        typeof onTransformCommit === "function" ? onTransformCommit : null
    };
    this.#updateMeshEditMarkerGeometry();
    this.#updateMeshEditEdgeGeometry();
    this.#updateMeshEditFaceOverlay();
    this.#applyMeshEditDisplay();
    this.#refreshMeshEditInfluence();
    this.#configureTransformForEditor();
    this.#rebuildAnchor();
    this.#updateSelectionAppearance();
    this.#updateVertexMarkers();
    return this.getMeshEditStatus();
  }

  updateMeshEditGeometry(geometry) {
    const edit = this.#requireMeshEdit();
    const descriptor = this.#geometryRegistry.normalize(geometry);
    const nextGeometry = this.#geometryRegistry.create(descriptor);
    const previousGeometry = edit.mesh.geometry;
    edit.mesh.geometry = nextGeometry;
    edit.wire.geometry = nextGeometry;
    if (previousGeometry !== nextGeometry) previousGeometry.dispose?.();
    edit.descriptor = descriptor;
    edit.topology = buildMeshTopology(descriptor);
    edit.lastSnapCandidate = null;
    edit.selectedIndices = new Set(
      [...edit.selectedIndices].filter(index => index < descriptor.positions.length)
    );
    edit.selectedComponents = new Set(
      [...edit.selectedComponents].filter(index =>
        index < meshComponentCount(edit.topology, edit.componentMode)
      )
    );
    this.#finalizeMeshEditGeometry();
    this.#updateMeshEditMarkerGeometry();
    this.#updateMeshEditEdgeGeometry();
    this.#updateMeshEditFaceOverlay();
    this.#refreshMeshEditInfluence();
    this.#rebuildAnchor();
    return this.getMeshEditStatus();
  }

  updateMeshEditSelection(selectedIndices = [], {
    activeVertex = null
  } = {}) {
    return this.updateMeshEditComponentSelection({
      mode: "vertex",
      selectedComponents: selectedIndices,
      activeComponent: activeVertex,
      selectedVertices: selectedIndices,
      activeVertex
    });
  }

  updateMeshEditComponentSelection({
    mode = "vertex",
    selectedComponents = [],
    activeComponent = null,
    selectedVertices = [],
    activeVertex = null
  } = {}) {
    const edit = this.#requireMeshEdit();
    edit.componentMode = normalizeMeshComponentMode(mode);
    edit.selectedComponents = new Set(selectedComponents.map(Number));
    edit.activeComponent = activeComponent === null ? null : Number(activeComponent);
    edit.selectedIndices = new Set(selectedVertices.map(Number));
    edit.activeVertex = activeVertex === null ? null : Number(activeVertex);
    this.#refreshMeshEditInfluence();
    this.#updateMeshEditEdgeGeometry();
    this.#updateMeshEditFaceOverlay();
    this.#rebuildAnchor();
    return this.getMeshEditStatus();
  }

  setMeshEditComponentMode(mode) {
    const edit = this.#requireMeshEdit();
    edit.componentMode = normalizeMeshComponentMode(mode);
    this.#updateMeshEditEdgeGeometry();
    this.#updateMeshEditFaceOverlay();
    return this.getMeshEditStatus();
  }

  updateMeshEditDisplay(patch = {}) {
    const edit = this.#requireMeshEdit();
    edit.display = normalizeMeshDisplaySettings({ ...edit.display, ...patch });
    this.#applyMeshEditDisplay();
    return this.getMeshEditStatus();
  }

  updateMeshEditOptions(patch = {}) {
    const edit = this.#requireMeshEdit();
    edit.options = {
      ...edit.options,
      ...(patch.occlusion === undefined
        ? {}
        : { occlusion: Boolean(patch.occlusion) })
    };
    // A oclusão limita o picking; a exibição através da superfície é
    // controlada independentemente pela opção visual xray.
    this.#applyMeshEditDisplay();
    return this.getMeshEditStatus();
  }

  setMeshEditConstraint(mode = "free") {
    const edit = this.#requireMeshEdit();
    edit.constraint = String(mode ?? "free").toLowerCase();
    edit.lastSnapCandidate = null;
    this.#refreshMeshEditInfluence();
    this.#configureTransformForEditor();
    return this.getMeshEditStatus();
  }

  updateMeshEditSnap(patch = {}) {
    const edit = this.#requireMeshEdit();
    edit.snap = normalizeMeshSnapSettings({ ...edit.snap, ...patch });
    edit.lastSnapCandidate = null;
    if (!edit.snap.enabled) this.#clearMeshSnapOverlay();
    return this.getMeshEditStatus();
  }

  updateMeshEditDeformation(patch = {}) {
    const edit = this.#requireMeshEdit();
    if (this.transform.dragging || this.#session?.kind === "mesh") {
      throw new Error(
        "Finalize o arrasto antes de alterar a influência proporcional."
      );
    }
    const next = normalizeMeshDeformationSettings({
      ...edit.deformation,
      ...patch,
      variables: patch.variables === undefined
        ? edit.deformation.variables
        : patch.variables,
      elastic: {
        ...edit.deformation.elastic,
        ...(patch.elastic ?? {})
      }
    });
    const previous = edit.deformation;
    edit.deformation = next;
    try {
      this.#refreshMeshEditInfluence();
    } catch (error) {
      edit.deformation = previous;
      this.#refreshMeshEditInfluence();
      throw error;
    }
    return this.getMeshEditStatus();
  }

  updateMeshEditInfluence(indices = [], weights = []) {
    const edit = this.#requireMeshEdit();
    edit.influence = new Map();
    indices.forEach((index, ordinal) => {
      const value = Number(weights[ordinal] ?? 0);
      if (Number.isInteger(Number(index)) && Number.isFinite(value)) {
        edit.influence.set(Number(index), value);
      }
    });
    this.#updateMeshEditMarkerColors();
    return this.getMeshEditStatus();
  }

  setMeshEditFrame({ mode, quaternion } = {}) {
    const edit = this.#requireMeshEdit();
    edit.frameMode = String(mode ?? edit.frameMode);
    if (!Array.isArray(quaternion) || quaternion.length !== 4) {
      throw new TypeError("O referencial de malha exige um quaternion.");
    }
    edit.frameQuaternion = [...quaternion];
    this.#refreshMeshEditInfluence();
    this.#configureTransformForEditor();
    this.#rebuildAnchor();
    return this.getMeshEditStatus();
  }

  endMeshEdit({ restoreBatch = true } = {}) {
    const edit = this.#meshEdit;
    if (!edit) return false;
    if (this.#session?.kind === "mesh") this.#session = null;
    this.transform.detach();
    this.scene.remove(edit.group);
    edit.mesh.geometry.dispose?.();
    edit.mesh.material.dispose?.();
    edit.wire.material.dispose?.();
    edit.markers.geometry.dispose?.();
    edit.markers.material.dispose?.();
    edit.edgeOverlay.geometry.dispose?.();
    edit.edgeOverlay.material.dispose?.();
    edit.faceOverlay.geometry.dispose?.();
    edit.faceOverlay.material.dispose?.();
    edit.snapMarker.geometry.dispose?.();
    edit.snapMarker.material.dispose?.();
    edit.snapLine.geometry.dispose?.();
    edit.snapLine.material.dispose?.();
    if (restoreBatch) {
      const proxy = this.#meshes.get(edit.objectId);
      const matrix = proxy?.userData.canonicalWorldMatrix;
      if (matrix) this.#batchManager.update(edit.objectId, matrix);
    }
    this.#meshEdit = null;
    this.#flushBatchBounds();
    this.#configureTransformForEditor();
    this.#rebuildAnchor();
    this.#updateSelectionAppearance();
    return true;
  }

  getMeshEditStatus() {
    const edit = this.#meshEdit;
    if (!edit) return Object.freeze({ active: false });
    return Object.freeze({
      active: true,
      objectId: edit.objectId,
      vertexCount: edit.descriptor.positions.length,
      edgeCount: edit.topology.edgeCount,
      faceCount: edit.topology.faceCount,
      componentMode: edit.componentMode,
      selectedComponentCount: edit.selectedComponents.size,
      selectedCount: edit.selectedIndices.size,
      activeComponent: edit.activeComponent,
      activeVertex: edit.activeVertex,
      display: Object.freeze({ ...edit.display }),
      frameMode: edit.frameMode,
      frameQuaternion: Object.freeze([...edit.frameQuaternion]),
      constraint: edit.constraint,
      snap: Object.freeze({ ...edit.snap }),
      deformation: Object.freeze({
        ...edit.deformation,
        variables: Object.freeze({ ...edit.deformation.variables }),
        elastic: Object.freeze({ ...edit.deformation.elastic })
      }),
      affectedCount: edit.influenceField?.affectedIndices.length ??
        edit.selectedIndices.size,
      snapCandidate: edit.lastSnapCandidate
        ? Object.freeze({
            type: edit.lastSnapCandidate.type,
            objectId: edit.lastSnapCandidate.objectId,
            key: edit.lastSnapCandidate.key,
            score: edit.lastSnapCandidate.score
          })
        : null,
      occlusion: edit.options.occlusion
    });
  }

  getViewerRenderSettings() {
    return Object.freeze(
      structuredClone(this.#viewerRenderSettings)
    );
  }

  getViewerRenderPresets() {
    return describeViewerRenderPresets();
  }

  setViewerRenderSettings(patch = {}) {
    const previous = this.#viewerRenderSettings;
    const next = mergeViewerRenderSettings(previous, patch);
    const materialChanged = JSON.stringify(previous.materials) !==
      JSON.stringify(next.materials);
    const environmentChanged =
      previous.environment.enabled !== next.environment.enabled ||
      previous.environment.preset !== next.environment.preset;
    const shadowProgramChanged =
      previous.shadows.enabled !== next.shadows.enabled ||
      previous.shadows.type !== next.shadows.type;

    this.#viewerRenderSettings = next;
    this.#materialCache.setViewerMaterialSettings(next.materials);
    this.#applyViewerRenderSettings(previous);

    if (materialChanged) {
      this.#rebuildRenderableBatches();
    } else if (environmentChanged || shadowProgramChanged) {
      this.#markBatchMaterialsForUpdate();
    }

    return this.getViewerRenderSettings();
  }

  applyViewerRenderPreset(id) {
    return this.setViewerRenderSettings(
      viewerRenderPreset(id)
    );
  }

  resetViewerRenderSettings() {
    return this.setViewerRenderSettings(
      DEFAULT_VIEWER_RENDER_SETTINGS
    );
  }

  getObjectTransformFrame() {
    return Object.freeze({
      mode: this.#objectTransformFrame.mode,
      quaternion: Object.freeze([...this.#objectTransformFrame.quaternion])
    });
  }

  setObjectTransformFrame({ mode = "world", quaternion = null } = {}) {
    const normalized = String(mode ?? "world").toLowerCase();
    if (!["world", "local", "viewer", "custom-plane"].includes(normalized)) {
      throw new RangeError(`Referencial de objeto desconhecido: ${mode}.`);
    }
    let nextQuaternion = [0, 0, 0, 1];
    if (["viewer", "custom-plane"].includes(normalized)) {
      if (!Array.isArray(quaternion) || quaternion.length !== 4) {
        throw new TypeError("Referencial personalizado exige quaternion.");
      }
      nextQuaternion = quaternion.map(Number);
      if (!nextQuaternion.every(Number.isFinite)) {
        throw new TypeError("Quaternion do referencial contém valor inválido.");
      }
      const normalizedQuaternion = new THREE.Quaternion()
        .fromArray(nextQuaternion)
        .normalize();
      nextQuaternion = normalizedQuaternion.toArray();
    }
    this.#objectTransformFrame = {
      mode: normalized,
      quaternion: nextQuaternion
    };
    if (normalized === "world" || normalized === "local") {
      this.selection.orientationPolicy = normalized;
      this.selection.notifyContextChanged();
    }
    this.#configureTransformForEditor();
    this.#rebuildAnchor();
    return this.getObjectTransformFrame();
  }

  getObjectTransformAxes() {
    return Object.freeze({ ...this.#objectTransformAxes });
  }

  setObjectTransformAxes(patch = {}) {
    this.#objectTransformAxes = {
      x: patch.x === undefined ? this.#objectTransformAxes.x : Boolean(patch.x),
      y: patch.y === undefined ? this.#objectTransformAxes.y : Boolean(patch.y),
      z: patch.z === undefined ? this.#objectTransformAxes.z : Boolean(patch.z)
    };
    this.#configureTransformForEditor();
    return this.getObjectTransformAxes();
  }

  readViewerReferenceFrame() {
    const quaternion = new THREE.Quaternion().fromArray(
      cameraFrameQuaternion(this.camera.quaternion.toArray())
    );
    const xAxis = new THREE.Vector3(1, 0, 0).applyQuaternion(quaternion);
    const yAxis = new THREE.Vector3(0, 1, 0).applyQuaternion(quaternion);
    const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(quaternion);
    return Object.freeze({
      origin: Object.freeze(this.orbit.target.toArray()),
      xAxis: Object.freeze(xAxis.toArray()),
      yAxis: Object.freeze(yAxis.toArray()),
      normal: Object.freeze(normal.toArray()),
      quaternion: Object.freeze(quaternion.toArray()),
      source: "viewer"
    });
  }

  readSelectionReferenceFrame() {
    const origin = this.getSelectionPivotPosition();
    if (!origin) return null;
    const activeId = this.#selectionSnapshot?.activeMember?.objectId;
    const proxy = activeId ? this.#meshes.get(activeId) : null;
    const quaternion = new THREE.Quaternion();
    if (proxy) {
      proxy.updateMatrixWorld(true);
      proxy.matrixWorld.decompose(
        new THREE.Vector3(),
        quaternion,
        new THREE.Vector3()
      );
    }
    const xAxis = new THREE.Vector3(1, 0, 0).applyQuaternion(quaternion);
    const yAxis = new THREE.Vector3(0, 1, 0).applyQuaternion(quaternion);
    const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(quaternion);
    return Object.freeze({
      origin: Object.freeze([...origin]),
      xAxis: Object.freeze(xAxis.toArray()),
      yAxis: Object.freeze(yAxis.toArray()),
      normal: Object.freeze(normal.toArray()),
      quaternion: Object.freeze(quaternion.toArray()),
      source: Object.freeze({ type: "object", objectId: activeId ?? null })
    });
  }

  readSelectionReferencePoints() {
    const members = this.#selectionSnapshot?.members ?? [];
    return Object.freeze(
      members
        .map(member => this.#selectionReferencePosition(member.objectId))
        .filter(Boolean)
        .map(point => Object.freeze(point.toArray()))
    );
  }

  getNavigationLocks() {
    return Object.freeze({
      ...structuredClone(this.#navigationLocks),
      mode: this.#navigationMode,
      editPlane: this.#editPlane
        ? structuredClone(this.#editPlane)
        : null,
      drawingPlane: this.#drawingPlane
        ? structuredClone(this.#drawingPlane)
        : null
    });
  }

  setNavigationPlaneLock(frame = null) {
    this.#navigationLocks = {
      ...this.#navigationLocks,
      plane: frame ? normalizeNavigationPlane(frame) : null
    };
    if (this.#navigationLocks.point && this.#navigationLocks.plane) {
      this.#navigationLocks.point = {
        ...this.#navigationLocks.point,
        point: projectPointToPlane(
          this.#navigationLocks.point.point,
          this.#navigationLocks.plane
        )
      };
    }
    this.#synchronizeNavigationMode();
    this.#enforceNavigationLocks();
    this.#notifyNavigationCamera();
    return this.getNavigationLocks();
  }

  setNavigationPointLock(value = null) {
    if (!value) {
      this.#navigationLocks = { ...this.#navigationLocks, point: null };
    } else {
      const point = normalizeVector3Array(value.point ?? value, "Ponto travado");
      this.#navigationLocks = {
        ...this.#navigationLocks,
        point: {
          point: this.#navigationLocks.plane
            ? projectPointToPlane(point, this.#navigationLocks.plane)
            : point,
          source: value.source ?? null
        }
      };
    }
    this.#synchronizeNavigationMode();
    this.#enforceNavigationLocks();
    this.#notifyNavigationCamera();
    return this.getNavigationLocks();
  }

  clearNavigationLocks() {
    this.#navigationLocks = { plane: null, point: null };
    this.#synchronizeNavigationMode();
    this.#notifyNavigationCamera();
    return this.getNavigationLocks();
  }

  getEditPlane() {
    return this.#editPlane
      ? Object.freeze(structuredClone(this.#editPlane))
      : null;
  }

  setEditPlane(frame = null) {
    this.#editPlane = frame ? normalizeNavigationPlane(frame) : null;
    return this.getEditPlane();
  }

  getDrawingPlane() {
    return this.#drawingPlane
      ? Object.freeze(structuredClone(this.#drawingPlane))
      : null;
  }

  setDrawingPlane(frame = null) {
    this.#drawingPlane = frame ? normalizeNavigationPlane(frame) : null;
    return this.getDrawingPlane();
  }

  captureDrawingSurfaceTarget({
    objectIds = null,
    frontFacesOnly = true,
    lockObject = true,
    maximumJump = 0,
    offset = 0
  } = {}) {
    const requested = Array.isArray(objectIds) && objectIds.length
      ? objectIds.map(String)
      : (this.#selectionSnapshot?.members ?? [])
          .map(member => String(member.objectId));
    if (!requested.length) {
      throw new Error(
        "Selecione ao menos uma geometria para travar a superfície."
      );
    }
    const expanded = projectedSelectionIdsWithFallback(
      this.#hierarchy,
      requested
    );
    const surfaceIds = [...new Set(expanded.filter(id =>
      this.#familyVisuals.has(id) || this.#batchManager.hasObject(id)
    ))];
    if (!surfaceIds.length) {
      throw new Error(
        "A seleção não contém geometria renderizável para projeção."
      );
    }
    const bounds = new THREE.Box3().makeEmpty();
    for (const id of surfaceIds) {
      const objectBounds = this.#worldBoundsForObjectId(id);
      if (objectBounds && !objectBounds.isEmpty()) bounds.union(objectBounds);
    }
    const diagonal = bounds.isEmpty()
      ? 1
      : bounds.getSize(new THREE.Vector3()).length();
    const requestedJump = Number(maximumJump);
    const resolvedJump = Number.isFinite(requestedJump) && requestedJump > 0
      ? requestedJump
      : Math.max(diagonal * 0.12, 0.25);
    const resolvedOffset = Number(offset);
    if (!Number.isFinite(resolvedOffset)) {
      throw new TypeError("Offset da superfície inválido.");
    }
    this.#incrementalDiagnostics.surfaceTargetCaptures += 1;
    return Object.freeze({
      version: "drawing-surface-target-v1",
      type: "surface",
      objectIds: Object.freeze(surfaceIds),
      sourceObjectIds: Object.freeze([...new Set(requested)]),
      frontFacesOnly: Boolean(frontFacesOnly),
      lockObject: Boolean(lockObject),
      maximumJump: resolvedJump,
      automaticMaximumJump: !(Number.isFinite(requestedJump) && requestedJump > 0),
      offset: resolvedOffset,
      bounds: bounds.isEmpty()
        ? null
        : Object.freeze({
            min: Object.freeze(bounds.min.toArray()),
            max: Object.freeze(bounds.max.toArray())
          })
    });
  }

  resolveDrawingSurfacePlacement({
    clientX,
    clientY,
    target,
    previous = null
  } = {}) {
    if (target?.version !== "drawing-surface-target-v1" ||
        !Array.isArray(target.objectIds) || !target.objectIds.length) {
      throw new TypeError("Alvo de superfície inválido.");
    }
    const rect = this.canvas.getBoundingClientRect();
    const x = Number(clientX);
    const y = Number(clientY);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      throw new TypeError("Coordenadas do ponteiro inválidas.");
    }
    this.pointer.set(
      ((x - rect.left) / rect.width) * 2 - 1,
      -((y - rect.top) / rect.height) * 2 + 1
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);
    this.#incrementalDiagnostics.surfaceRaycasts += 1;

    const lockedObjectId = target.lockObject && previous?.objectId
      ? String(previous.objectId)
      : null;
    const candidates = [];
    const probe = this.#surfaceRaycastProbe;
    probe.matrixAutoUpdate = false;
    probe.visible = true;

    for (const rawId of target.objectIds) {
      const objectId = String(rawId);
      if (lockedObjectId && objectId !== lockedObjectId) continue;
      this.#incrementalDiagnostics.surfaceRaycastObjectVisits += 1;
      const family = this.#familyVisuals.get(objectId);
      if (family?.resourceIds?.length) {
        const batchKeys = new Set(
          family.resourceIds
            .map(resourceId => this.#batchManager.locationOf(resourceId)?.batchKey)
            .filter(Boolean)
        );
        for (const batchKey of batchKeys) {
          const batch = this.#batchManager.getBatch(batchKey);
          if (!batch) continue;
          for (const hit of this.raycaster.intersectObject(batch.mesh, false)) {
            if (this.#batchManager.objectFromHit(hit) !== objectId) continue;
            candidates.push(surfacePlacementFromHit({
              hit,
              objectId,
              ray: this.raycaster.ray,
              target,
              previous
            }));
          }
        }
        continue;
      }
      const heterogeneousResources =
        this.#heterogeneousBatchManager.resourcesForOwner(objectId);
      if (heterogeneousResources.length) {
        const batchKeys = new Set(heterogeneousResources
          .map(resourceId =>
            this.#heterogeneousBatchManager.locationOf(resourceId)?.batchKey
          )
          .filter(Boolean));
        for (const batchKey of batchKeys) {
          const heterogeneousBatch = this.#heterogeneousBatchManager
            .batches()
            .find(item => item.key === batchKey);
          if (!heterogeneousBatch) continue;
          for (const hit of this.raycaster.intersectObject(
            heterogeneousBatch.mesh,
            false
          )) {
            if (this.#heterogeneousBatchManager.objectFromHit(hit) !== objectId) {
              continue;
            }
            candidates.push(surfacePlacementFromHit({
              hit,
              objectId,
              ray: this.raycaster.ray,
              target,
              previous
            }));
          }
        }
        continue;
      }
      const location = this.#batchManager.locationOf(objectId);
      const batch = location
        ? this.#batchManager.getBatch(location.batchKey)
        : null;
      const proxy = this.#meshes.get(objectId);
      if (!batch?.mesh?.geometry || !proxy) continue;
      proxy.updateWorldMatrix?.(true, false);
      probe.geometry = batch.mesh.geometry;
      probe.material = batch.mesh.material;
      probe.matrixWorld.copy(this.#batchMatrixForProxy(proxy));
      probe.userData.surfaceObjectId = objectId;
      for (const hit of this.raycaster.intersectObject(probe, false)) {
        candidates.push(surfacePlacementFromHit({
          hit,
          objectId,
          ray: this.raycaster.ray,
          target,
          previous
        }));
      }
    }

    const accepted = candidates
      .filter(Boolean)
      .sort((left, right) => left.distance - right.distance)[0] ?? null;
    if (!accepted) {
      this.#incrementalDiagnostics.surfaceMisses += 1;
      return null;
    }
    if (accepted.jumpRejected) {
      this.#incrementalDiagnostics.surfaceJumpRejections += 1;
      this.#incrementalDiagnostics.surfaceMisses += 1;
      return null;
    }
    this.#incrementalDiagnostics.surfaceHits += 1;
    return accepted;
  }

  resolvePointerPlacement({
    clientX,
    clientY,
    plane = this.#editPlane,
    surface = true
  } = {}) {
    const rect = this.canvas.getBoundingClientRect();
    const x = Number(clientX);
    const y = Number(clientY);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      throw new TypeError("Coordenadas do ponteiro inválidas.");
    }
    this.pointer.set(
      ((x - rect.left) / rect.width) * 2 - 1,
      -((y - rect.top) / rect.height) * 2 + 1
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);
    if (surface) {
      this.#flushBatchBounds();
      const hit = this.#raycastSpatialObjects({ firstOnly: true })[0] ?? null;
      if (hit?.point) {
        return Object.freeze({
          point: Object.freeze(hit.point.toArray()),
          normal: hit.normal
            ? Object.freeze(hit.normal.toArray())
            : null,
          objectId: hit.objectId,
          source: "surface"
        });
      }
    }
    const frame = plane ?? this.readViewerReferenceFrame();
    const normalized = normalizeNavigationPlane(frame);
    const threePlane = new THREE.Plane(
      new THREE.Vector3().fromArray(normalized.normal),
      -new THREE.Vector3().fromArray(normalized.normal)
        .dot(new THREE.Vector3().fromArray(normalized.origin))
    );
    const point = this.raycaster.ray.intersectPlane(
      threePlane,
      new THREE.Vector3()
    );
    if (!point) return null;
    return Object.freeze({
      point: Object.freeze(point.toArray()),
      normal: Object.freeze([...normalized.normal]),
      source: plane ? "edit-plane" : "viewer-plane"
    });
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

  acquireToolGestureNavigation(owner = "interactive-tool") {
    const token = this.#toolGestureNavigation.acquire(owner);
    this.orbit.enabled = true;
    return token;
  }

  releaseToolGestureNavigation(token) {
    const released = this.#toolGestureNavigation.release(token);
    this.#configureTransformForEditor();
    return released;
  }

  isToolNavigationGesture(event = null) {
    return this.#toolGestureNavigation.isNavigationGesture(event);
  }

  getToolGestureNavigationStatus() {
    return this.#toolGestureNavigation.status();
  }

  disposeToolGestureNavigation() {
    this.#editorToolNavigationToken = null;
    this.#toolGestureNavigation.dispose();
  }

  setSelectionOperation(operation) {
    this.#selectionOperation = operation;
    this.editorState.setSelectionOperation(operation);
    return operation;
  }

  selectScreenRect(rectangle, operation = this.#selectionOperation) {
    const result = this.resolveScreenSelectionGesture({
      mode: "rectangle",
      rectangle
    });
    if (result.subject === "component") {
      const edit = this.#meshEdit;
      edit?.onComponentPick?.({
        mode: result.component,
        indices: result.indices,
        operation
      });
      if (!edit?.onComponentPick && result.component === "vertex") {
        edit?.onVertexPick?.({ indices: result.indices, operation });
      }
      return {
        operation,
        selected: result.indices.length,
        component: result.component,
        objectId: result.objectId
      };
    }
    this.#applySelectionMembers(result.members, operation);
    return {
      operation,
      selected: result.members.length,
      selection: this.selection.snapshot()
    };
  }

  resolveScreenSelectionGesture(rawGesture) {
    const gesture = normalizeScreenSelectionGesture(rawGesture);
    if (this.#meshEdit) {
      const edit = this.#meshEdit;
      const rect = this.canvas.getBoundingClientRect();
      edit.group.updateMatrixWorld(true);
      const entries = [];
      const append = (point, index) => {
        const projected = new THREE.Vector3()
          .fromArray(point)
          .applyMatrix4(edit.group.matrixWorld)
          .project(this.camera);
        if (projected.z < -1 || projected.z > 1) return;
        const x = (projected.x + 1) * 0.5 * rect.width;
        const y = (1 - projected.y) * 0.5 * rect.height;
        entries.push({ x, y, index });
      };
      if (edit.componentMode === "vertex") {
        edit.descriptor.positions.forEach((point, index) => {
          append(point, index);
        });
      } else if (edit.componentMode === "edge") {
        edit.topology.edges.forEach(edge => {
          const midpoint = edit.descriptor.positions[edge.a].map((value, axis) =>
            (value + edit.descriptor.positions[edge.b][axis]) * 0.5
          );
          append(midpoint, edge.index);
        });
      } else {
        edit.topology.faces.forEach(face => {
          append(face.centroid, face.index);
        });
      }
      const index = new ScreenSelectionIndex().rebuild(entries);
      const indices = index.query(gesture).map(entry => entry.index);
      return Object.freeze({
        subject: "component",
        mode: gesture.mode,
        selected: indices.length,
        component: edit.componentMode,
        objectId: edit.objectId,
        indices: Object.freeze(indices)
      });
    }
    const byId = new Map();
    for (const entry of this.#objectScreenSelectionIndex().query(gesture)) {
      byId.set(entry.member.objectId, entry.member);
    }
    const members = [...byId.values()];
    return Object.freeze({
      subject: "object",
      mode: gesture.mode,
      selected: members.length,
      members: Object.freeze(members)
    });
  }

  getScreenSelectionDiagnostics() {
    return Object.freeze({
      version: this.#screenSelectionVersion,
      builds: this.#screenSelectionCache.builds,
      hits: this.#screenSelectionCache.hits,
      index: this.#screenSelectionCache.index.diagnostics()
    });
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
    const current = this.#objectTransformFrame.mode;
    const next = current === "world" ? "local" : "world";
    this.setObjectTransformFrame({ mode: next });
    return next;
  }

  update(state) {
    this.#lastState = state;
    this.#screenSelectionVersion += 1;
    this.#incrementalDiagnostics.fullUpdates += 1;
    this.#cancelDeferredSceneMaintenance();
    const seen = new Set();
    this.#incrementalDiagnostics.hierarchyObjectsVisited += state.objects.length;
    const hierarchy = new HierarchyIndex(state.objects);
    this.#hierarchy = hierarchy;
    this.#objectsById = new Map(
      state.objects.map(object => [String(object.id), object])
    );

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
    if (!Array.isArray(changes) || changes.length === 0) {
      return Object.freeze({ changed: false, reason: "no-changes" });
    }
    this.#lastState = state;
    if (changes.length) this.#screenSelectionVersion += 1;
    this.#incrementalDiagnostics.incrementalUpdates += 1;

    if (this.#canApplyRootObjectChanges(changes)) {
      this.#applyRootObjectChanges(state, changes);
      return;
    }

    if (this.#canApplyStableHierarchyChanges(changes)) {
      this.#applyStableHierarchyChanges(state, changes);
      return;
    }

    this.#incrementalDiagnostics.hierarchyObjectsVisited += state.objects.length;
    const hierarchy = new HierarchyIndex(state.objects);
    this.#hierarchy = hierarchy;
    this.#objectsById = new Map(
      state.objects.map(object => [String(object.id), object])
    );
    const affectedIds = affectedHierarchyIds(hierarchy, changes);

    for (const change of changes) {
      const id = change.objectId;
      if (!id) continue;

      if (change.type === "object-deleted") {
        this.#removeObject(id);
      }
    }

    for (const id of affectedIds) {
      const rawObject = this.#objectsById.get(String(id));

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

  #canApplyStableHierarchyChanges(changes) {
    if (!Array.isArray(changes) || !changes.length) return false;
    return changes.every(change => {
      if (!["object-transform", "object-updated"].includes(change?.type)) {
        return false;
      }
      const object = change.object;
      const id = String(change.objectId ?? object?.id ?? "");
      if (!id || !object || !this.#hierarchy.has(id)) return false;
      const parentId = object.parentId == null || object.parentId === ""
        ? null
        : String(object.parentId);
      return this.#hierarchy.parentOf(id) === parentId;
    });
  }

  #applyStableHierarchyChanges(state, changes) {
    this.#incrementalDiagnostics.localHierarchyUpdates += 1;
    const affected = new Set();
    for (const change of changes) {
      const id = String(change.objectId ?? change.object?.id ?? "");
      const object = change.object;
      this.#objectsById.set(id, object);
      this.#hierarchy.updateNode(id, object);
      affected.add(id);
      for (const descendantId of this.#hierarchy.descendantsOf(id)) {
        affected.add(descendantId);
      }
    }
    this.#incrementalDiagnostics.localHierarchyObjectsVisited += affected.size;
    for (const id of affected) {
      const rawObject = this.#objectsById.get(id);
      if (!rawObject) continue;
      this.#upsertObject(
        this.#projectObject(rawObject),
        this.#hierarchy.worldMatrixOf(id)
      );
    }
    this.#incrementalDiagnostics.skippedHierarchyBuilds += 1;
    this.#finishLocalizedSceneUpdate();
  }

  #canApplyRootObjectChanges(changes) {
    if (!Array.isArray(changes) || !changes.length) return false;
    const supported = new Set([
      "object-created",
      "object-deleted",
      "object-transform",
      "object-updated"
    ]);
    return changes.every(change => {
      if (!supported.has(change?.type)) return false;
      const object = change.object ?? change.previousObject;
      if (!object || !String(change.objectId ?? object.id ?? "")) return false;
      if (object.kind === "group") return false;
      return !hasHierarchyParent(object);
    });
  }

  #applyRootObjectChanges(state, changes) {
    this.#incrementalDiagnostics.localUpdates += 1;
    for (const change of changes) {
      const id = String(change.objectId);
      if (change.type === "object-deleted") {
        this.#objectsById.delete(id);
        this.#removeObject(id);
        continue;
      }
      const rawObject = change.object;
      this.#objectsById.set(id, rawObject);
      this.#upsertObject(
        this.#projectObject(rawObject),
        rootObjectMatrix(rawObject)
      );
    }
    /*
     * Criação, remoção e transformação de objetos-raiz não alteram relações
     * hierárquicas. O mapa local já recebeu os objetos materializados; uma
     * reconstrução O(N) do HierarchyIndex seria apenas manutenção redundante.
     * Operações de grupo/reparent continuam pelo caminho completo acima.
     */
    this.#incrementalDiagnostics.skippedHierarchyBuilds += 1;
    if (changes.some(change =>
      ["object-created", "object-deleted"].includes(change.type)
    )) {
      this.#scheduleHierarchyRefresh(state);
    }
    this.#finishLocalizedSceneUpdate();
  }

  #refreshHierarchyForTargets(targetIds) {
    const hasMismatch = targetIds.some(id =>
      this.#objectsById.has(id) !== this.#hierarchy.has(id)
    );
    if (!hasMismatch || !this.#lastState?.objects) return false;
    this.#incrementalDiagnostics.hierarchyObjectsVisited +=
      this.#lastState.objects.length;
    this.#hierarchy = new HierarchyIndex(this.#lastState.objects);
    this.#incrementalDiagnostics.deferredHierarchyBuilds += 1;
    return true;
  }

  hasObjectVisual(objectId) {
    const id = String(objectId ?? "");
    const family = this.#familyVisuals.get(id);
    if (family) return family.resourceIds.length > 0;
    return this.#meshes.has(id);
  }

  subscribeObjectVisuals(listener) {
    if (typeof listener !== "function") {
      throw new TypeError("Listener visual deve ser função.");
    }
    this.#objectVisualListeners.add(listener);
    return () => this.#objectVisualListeners.delete(listener);
  }

  subscribeFrame(listener) {
    if (typeof listener !== "function") {
      throw new TypeError("Listener de quadro deve ser função.");
    }
    return this.#renderDemand.subscribeFrame(listener);
  }
  invalidateRender(reason = "unspecified") {
    return this.#renderDemand?.invalidate(reason) ?? false;
  }
  acquireFrameDemand(owner = "anonymous") {
    if (!this.#renderDemand) throw new Error("Scheduler visual indisponível.");
    return this.#renderDemand.acquireContinuous(owner);
  }
  releaseFrameDemand(token) {
    return this.#renderDemand?.releaseContinuous(token) ?? false;
  }
  scheduleFrameWakeAt(timestampMs, owner = "timer") {
    if (!this.#renderDemand) throw new Error("Scheduler visual indisponível.");
    return this.#renderDemand.wakeAt(timestampMs, owner);
  }
  cancelFrameWake(token) {
    return this.#renderDemand?.cancelWake(token) ?? false;
  }
  getRenderDemandDiagnostics() {
    return this.#renderDemand?.status() ?? null;
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
    this.#screenSelectionVersion += 1;
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
    this.#screenSelectionVersion += 1;
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
    targetMode = "selection",
    overlayId = null
  } = {}) {
    const resolvedOverlayId = String(
      overlayId ?? `animation-overlay:${++this.#animationOverlaySequence}`
    ).trim();
    if (!resolvedOverlayId) {
      throw new TypeError("Identificador da sobreposição de animação vazio.");
    }
    if (this.#animationOverlays.has(resolvedOverlayId)) {
      throw new Error(
        `Sobreposição de animação já existente: ${resolvedOverlayId}.`
      );
    }
    const normalizedTargetIds = [...new Set(
      targetIds.map(value => String(value)).filter(Boolean)
    )];
    this.#refreshHierarchyForTargets(normalizedTargetIds);
    const requested = normalizedTargetIds.filter(id => this.#hierarchy.has(id));
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

    const baseSnapshot = createAnimationTargetSnapshot(units);
    const snapshot = Object.freeze({
      overlayId: resolvedOverlayId,
      units: baseSnapshot.units
    });
    const objectIds = new Set(
      snapshot.units.flatMap(unit =>
        unit.objects.map(object => object.objectId)
      )
    );
    const overlay = {
      id: resolvedOverlayId,
      order: ++this.#animationOverlaySequence,
      targets: snapshot,
      objectIds,
      transforms: new Map(),
      colors: new Map(),
      pivots: new Map()
    };
    this.#animationOverlays.set(resolvedOverlayId, overlay);

    for (const objectId of objectIds) {
      let ids = this.#animationObjectOverlayIds.get(objectId);
      if (!ids) this.#animationObjectOverlayIds.set(objectId, ids = new Set());
      ids.add(resolvedOverlayId);
      this.#animationTargetIds.add(objectId);
      this.#acquireAnimationBatchCulling(objectId);
    }

    this.#animationSurfaceDiagnostics.captures += 1;
    return snapshot;
  }

  applyAnimationFrame(targets, unitFrames, {
    overlayId = targets?.overlayId
  } = {}) {
    const startedAt = performance.now();
    const id = String(overlayId ?? "").trim();
    const overlay = this.#animationOverlays.get(id);
    if (!overlay) {
      throw new Error(`Sobreposição de animação inexistente: ${id}.`);
    }
    const rebased = rebaseAnimationLayerInput(
      targets,
      unitFrames,
      unitId => this.#hierarchy.has(unitId)
        ? this.#hierarchy.worldPivotOf(unitId)
        : null
    );
    const layer = composeAnimationLayer(
      rebased.targets,
      rebased.unitFrames
    );
    overlay.targets = rebased.targets;
    overlay.transforms = new Map(
      layer.transforms
        .filter(entry => overlay.objectIds.has(entry.objectId))
        .map(entry => [entry.objectId, entry.matrix])
    );
    overlay.colors = new Map(
      layer.colors
        .filter(entry => overlay.objectIds.has(entry.objectId))
        .map(entry => [entry.objectId, entry.color])
    );
    const activeUnitIds = new Set(
      overlay.targets.units
        .filter(unit => unit.objects.some(object =>
          overlay.objectIds.has(object.objectId)
        ))
        .map(unit => unit.unitId)
    );
    overlay.pivots = new Map(
      layer.pivots
        .filter(entry => activeUnitIds.has(entry.unitId))
        .map(entry => [entry.unitId, entry.position])
    );

    let matrixWrites = 0;
    let colorWrites = 0;
    for (const objectId of overlay.objectIds) {
      const result = this.#applyAnimationObjectLayers(objectId);
      matrixWrites += result.matrixWrites;
      colorWrites += result.colorWrites;
    }

    const pivotWrites = this.#rebuildAnimationPivotOverrides();
    if (pivotWrites) {
      this.#rebuildAnchor();
      this.#updateSelectionAppearance();
      this.#updateVertexMarkers();
    }

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
    const changed = matrixWrites > 0 || colorWrites > 0 || pivotWrites > 0;
    if (changed) this.invalidateRender(`animation-frame:${id}`);
    return Object.freeze({
      changed,
      overlayId: id,
      matrixWrites,
      colorWrites,
      pivotWrites,
      unitCount: layer.pivots.length
    });
  }

  restoreAnimationTargets(targets, {
    overlayId = targets?.overlayId
  } = {}) {
    const id = String(overlayId ?? "").trim();
    const overlay = this.#animationOverlays.get(id);
    if (!overlay) {
      return Object.freeze({
        changed: false,
        overlayId: id || null,
        restored: 0,
        matrixWrites: 0,
        colorWrites: 0,
        pivotWrites: 0
      });
    }

    this.#animationOverlays.delete(id);
    for (const objectId of overlay.objectIds) {
      const ids = this.#animationObjectOverlayIds.get(objectId);
      ids?.delete(id);
      if (!ids?.size) {
        this.#animationObjectOverlayIds.delete(objectId);
        this.#animationTargetIds.delete(objectId);
      }
      this.#releaseAnimationBatchCulling(objectId);
    }

    let matrixWrites = 0;
    let colorWrites = 0;
    for (const objectId of overlay.objectIds) {
      const result = this.#applyAnimationObjectLayers(objectId);
      matrixWrites += result.matrixWrites;
      colorWrites += result.colorWrites;
    }
    const pivotWrites = this.#rebuildAnimationPivotOverrides();
    this.#flushBatchBounds();
    if (pivotWrites || matrixWrites || colorWrites) {
      this.#rebuildAnchor();
      this.#updateSelectionAppearance();
      this.#updateVertexMarkers();
      this.invalidateRender(`animation-restore:${id}`);
    }
    this.#animationSurfaceDiagnostics.restores += 1;
    return Object.freeze({
      changed: matrixWrites > 0 || colorWrites > 0 || pivotWrites > 0,
      overlayId: id,
      restored: overlay.objectIds.size,
      matrixWrites,
      colorWrites,
      pivotWrites
    });
  }

  getAnimationSurfaceDiagnostics() {
    return Object.freeze({
      ...this.#animationSurfaceDiagnostics,
      activeOverlays: this.#animationOverlays.size,
      activeObjects: this.#animationTargetIds.size,
      pivotOverrides: this.#animationPivotOverrides.size,
      uncullableBatches: this.#animationBatchCulling.size
    });
  }

  #applyAnimationObjectLayers(objectId) {
    const id = String(objectId);
    const proxy = this.#meshes.get(id);
    if (!proxy || proxy.userData.logicalOnly) {
      this.#animationAppliedMatrices.delete(id);
      this.#animationAppliedColors.delete(id);
      return Object.freeze({ matrixWrites: 0, colorWrites: 0 });
    }
    const canonical = proxy.userData.canonicalWorldMatrix;
    if (!Array.isArray(canonical) || canonical.length !== 16) {
      return Object.freeze({ matrixWrites: 0, colorWrites: 0 });
    }

    const overlayIds = [...(this.#animationObjectOverlayIds.get(id) ?? [])]
      .map(overlayId => this.#animationOverlays.get(overlayId))
      .filter(Boolean)
      .sort((left, right) => left.order - right.order);
    const effective = new THREE.Matrix4().fromArray(canonical);
    let color = null;
    for (const overlay of overlayIds) {
      const delta = overlay.transforms.get(id);
      if (delta) {
        effective.premultiply(new THREE.Matrix4().fromArray(delta));
      }
      if (overlay.colors.has(id)) color = overlay.colors.get(id);
    }

    const matrix = effective.toArray();
    let matrixWrites = 0;
    if (!numericArrayEqual(this.#animationAppliedMatrices.get(id), matrix)) {
      applyProjectedWorldMatrix(proxy, matrix);
      if (this.#updateBatchMatrix(id, proxy)) matrixWrites = 1;
      if (overlayIds.length) {
        this.#animationAppliedMatrices.set(id, Object.freeze([...matrix]));
      } else {
        this.#animationAppliedMatrices.delete(id);
      }
    }

    let colorWrites = 0;
    const previousColor = this.#animationAppliedColors.get(id);
    if (color !== null) {
      if (previousColor !== color && this.#setInstanceColor(id, color)) {
        colorWrites = 1;
      }
      this.#animationAppliedColors.set(id, color);
    } else if (previousColor !== undefined) {
      if (this.#applyObjectInstanceColor(id)) colorWrites = 1;
      this.#animationAppliedColors.delete(id);
    }
    return Object.freeze({ matrixWrites, colorWrites });
  }

  #rebuildAnimationPivotOverrides() {
    const pivots = new Map();
    const overlays = [...this.#animationOverlays.values()]
      .sort((left, right) => left.order - right.order);
    for (const overlay of overlays) {
      for (const [unitId, position] of overlay.pivots) {
        pivots.set(unitId, [...position]);
      }
    }
    const signature = stableRenderIdentity(
      [...pivots].map(([unitId, position]) => ({ unitId, position }))
    );
    if (signature === this.#animationPivotSignature) return 0;
    this.#animationPivotSignature = signature;
    this.#animationPivotOverrides = pivots;
    return 1;
  }

  #acquireAnimationBatchCulling(objectId) {
    for (const [storageKey, batch] of this.#animationBatchesForObject(objectId)) {
      const existing = this.#animationBatchCulling.get(storageKey);
      if (existing) {
        existing.references += 1;
        continue;
      }
      this.#animationBatchCulling.set(storageKey, {
        references: 1,
        frustumCulled: batch.mesh.frustumCulled
      });
      batch.mesh.frustumCulled = false;
    }
  }

  #releaseAnimationBatchCulling(objectId) {
    for (const [storageKey, batch] of this.#animationBatchesForObject(objectId)) {
      const entry = this.#animationBatchCulling.get(storageKey);
      if (!entry) continue;
      entry.references -= 1;
      if (entry.references > 0) continue;
      batch.mesh.frustumCulled = entry.frustumCulled;
      this.#animationBatchCulling.delete(storageKey);
    }
  }

  #animationBatchesForObject(objectId) {
    const result = [];
    const family = this.#familyVisuals.get(String(objectId));
    const normalBatchKeys = family
      ? [...family.batchKeys]
      : [this.#meshes.get(objectId)?.userData.batchKey].filter(Boolean);
    for (const batchKey of normalBatchKeys) {
      const batch = this.#batchManager.getBatch(batchKey);
      if (batch) result.push([`instance:${batchKey}`, batch]);
    }
    const heterogeneousBatchKeys = new Set(
      this.#heterogeneousBatchManager.resourcesForOwner(objectId)
        .map(resourceId =>
          this.#heterogeneousBatchManager.locationOf(resourceId)?.batchKey
        )
        .filter(Boolean)
    );
    for (const batchKey of heterogeneousBatchKeys) {
      const batch = this.#heterogeneousBatchManager.getBatch(batchKey);
      if (batch) result.push([`heterogeneous:${batchKey}`, batch]);
    }
    return result;
  }

  getIncrementalDiagnostics() {
    return {
      ...this.#incrementalDiagnostics,
      meshes: this.#meshes.size,
      familyBuildQueue: this.#familyBuildQueue.length,
      familyBuildActive: this.#familyBuildHandle !== null,
      spatialIndex: this.#spatialObjectIndex.diagnostics(),
      spatialShards: this.#batchManager.stats(),
      renderDemand: this.getRenderDemandDiagnostics()
    };
  }

  #applyViewerRenderSettings(previous = null) {
    const settings = this.#viewerRenderSettings;
    const pixelRatio = Math.min(
      globalThis.devicePixelRatio ?? 1,
      settings.quality.pixelRatioCap
    );
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.transmissionResolutionScale =
      settings.quality.transmissionResolutionScale;
    this.renderer.toneMapping = toneMapping(settings.toneMapping.mode);
    this.renderer.toneMappingExposure = settings.toneMapping.exposure;

    this.renderer.shadowMap.enabled = settings.shadows.enabled;
    this.renderer.shadowMap.type = shadowMapType(settings.shadows.type);

    const hemisphere = settings.lighting.hemisphere;
    this.#hemisphereLight.visible = hemisphere.enabled;
    this.#hemisphereLight.color.set(hemisphere.skyColor);
    this.#hemisphereLight.groundColor.set(hemisphere.groundColor);
    this.#hemisphereLight.intensity = hemisphere.intensity;

    const directional = settings.lighting.directional;
    this.#directionalLight.visible = directional.enabled;
    this.#directionalLight.color.set(directional.color);
    this.#directionalLight.intensity = directional.intensity;
    this.#directionalLight.position.fromArray(directional.position);
    this.#directionalLight.target.position.fromArray(directional.target);
    this.#directionalLight.target.updateMatrixWorld();
    this.#directionalLight.castShadow =
      settings.shadows.enabled && directional.enabled;

    const shadow = this.#directionalLight.shadow;
    const mapSizeChanged =
      shadow.mapSize.x !== settings.shadows.mapSize ||
      shadow.mapSize.y !== settings.shadows.mapSize;
    shadow.mapSize.set(
      settings.shadows.mapSize,
      settings.shadows.mapSize
    );
    shadow.camera.near = settings.shadows.near;
    shadow.camera.far = Math.max(
      settings.shadows.near + 0.001,
      settings.shadows.far
    );
    shadow.camera.left = -settings.shadows.extent;
    shadow.camera.right = settings.shadows.extent;
    shadow.camera.top = settings.shadows.extent;
    shadow.camera.bottom = -settings.shadows.extent;
    shadow.camera.updateProjectionMatrix();
    shadow.bias = settings.shadows.bias;
    shadow.normalBias = settings.shadows.normalBias;
    if (mapSizeChanged && shadow.map) {
      shadow.map.dispose();
      shadow.map = null;
    }

    const floor = settings.shadows;
    this.#shadowFloor.visible = floor.enabled && floor.floorEnabled;
    this.#shadowFloor.position.y = floor.floorY;
    this.#shadowFloor.material.opacity = floor.floorOpacity;
    const floorSizeChanged =
      this.#shadowFloor.userData.size !== floor.floorSize;
    if (floorSizeChanged) {
      this.#shadowFloor.geometry.dispose();
      this.#shadowFloor.geometry = new THREE.PlaneGeometry(
        floor.floorSize,
        floor.floorSize
      );
      this.#shadowFloor.userData.size = floor.floorSize;
    }

    for (const batch of this.#batchManager?.batches?.() ?? []) {
      batch.mesh.castShadow = settings.shadows.enabled;
      batch.mesh.receiveShadow = settings.shadows.enabled;
    }
    for (const batch of this.#heterogeneousBatchManager?.batches?.() ?? []) {
      batch.mesh.castShadow = settings.shadows.enabled;
      batch.mesh.receiveShadow = settings.shadows.enabled;
    }

    const environmentChanged = !previous ||
      previous.environment.enabled !== settings.environment.enabled ||
      previous.environment.preset !== settings.environment.preset;
    if (environmentChanged) {
      this.#environmentTarget?.dispose?.();
      this.#environmentTarget = settings.environment.enabled
        ? createViewerEnvironmentTexture(
            this.renderer,
            settings.environment.preset
          )
        : null;
    }

    const environmentTexture = this.#environmentTarget?.texture ?? null;
    this.scene.environment = environmentTexture;
    this.scene.environmentIntensity = settings.environment.intensity;
    this.scene.background =
      settings.environment.background && environmentTexture
        ? environmentTexture
        : new THREE.Color(settings.background.color);
    this.scene.backgroundBlurriness = settings.environment.background
      ? settings.environment.backgroundBlur
      : 0;
    this.scene.backgroundIntensity = settings.environment.background
      ? settings.environment.backgroundIntensity
      : 1;
  }

  #markBatchMaterialsForUpdate() {
    for (const batch of this.#batchManager.batches()) {
      if (batch.material) batch.material.needsUpdate = true;
    }
    for (const batch of this.#heterogeneousBatchManager.batches()) {
      if (batch.mesh?.material) batch.mesh.material.needsUpdate = true;
    }
  }

  #rebuildRenderableBatches() {
    const state = this.#lastState;
    for (const id of [...this.#familyVisuals.keys()]) {
      this.#removeFamilyVisual(id, this.#meshes.get(id));
    }
    for (const id of [...this.#strokeVisuals.keys()]) {
      this.#removeStrokeBundleVisual(id, this.#meshes.get(id));
    }
    for (const [id, proxy] of this.#meshes) {
      if (proxy.userData.heterogeneousBatch) {
        this.#removeHeterogeneousObject(id, proxy);
      }
      if (!proxy.userData.batchKey) continue;
      this.#removeFromBatch(id, proxy.userData.batchKey);
      proxy.userData.batchKey = null;
      /*
       * A reconstrução removeu de fato a instância. Preservar a identidade
       * lógica do lote faria #upsertObject escolher somente o caminho de
       * update e nunca reinserir o objeto no novo material do viewer.
       */
      proxy.userData.batchBaseKey = null;
      proxy.userData.spatialShardBaseKey = null;
    }
    if (state) this.update(state);
  }

  #upsertObject(object, worldMatrix) {
    let proxy = this.#meshes.get(object.id);

    if (!proxy) {
      proxy = new THREE.Object3D();
      proxy.userData.objectId = object.id;
      proxy.userData.kind = object.kind;
      proxy.userData.batchKey = null;
      proxy.userData.batchBaseKey = null;
      proxy.userData.spatialShardBaseKey = null;
      proxy.userData.size = object.size ? [...object.size] : [0,0,0];
      proxy.userData.localBounds = null;
      proxy.userData.appearanceId = object.appearanceId;
      proxy.userData.instanceColor =
        object.instanceState?.color ?? null;
      proxy.userData.appearanceBinding = appearanceBindingForObject(object);
      this.#meshes.set(object.id, proxy);
      this.#incrementalDiagnostics.objectsCreated += 1;
    } else {
      this.#incrementalDiagnostics.objectsUpdated += 1;
    }

    proxy.userData.kind = object.kind;
    proxy.userData.size = object.size ? [...object.size] : [0,0,0];
    proxy.userData.canonicalWorldMatrix = [...worldMatrix];
    proxy.userData.appearanceBinding = appearanceBindingForObject(object);
    proxy.userData.instanceRootId = object.instanceRootId ?? null;
    proxy.userData.instancePath = object.instancePath ?? null;
    const replicaRegistration = this.#replicaRenderIndex.register(
      object,
      worldMatrix
    );
    if (replicaRegistration.rootChanged && String(object.id) === String(replicaRegistration.rootId)) {
      const descendantChanges = this.#replicaRenderIndex.rebaseRoot(
        replicaRegistration.rootId,
        worldMatrix
      );
      for (const change of descendantChanges) {
        const descendant = this.#meshes.get(change.id);
        if (!descendant) continue;
        descendant.userData.canonicalWorldMatrix = [...change.worldMatrix];
        if (!this.#session && !this.#animationTargetIds.has(change.id)) {
          applyProjectedWorldMatrix(descendant, change.worldMatrix);
          if (!descendant.userData.logicalOnly) {
            this.#updateBatchMatrix(change.id, descendant);
          }
        }
      }
    }

    if (
      !this.#session &&
      !this.#animationTargetIds.has(object.id) &&
      !this.#sharedTransformObjectIds.has(object.id)
    ) {
      applyProjectedWorldMatrix(proxy,worldMatrix);
    }

    if (object.kind === "light") {
      if (proxy.userData.batchKey) {
        this.#removeFromBatch(object.id, proxy.userData.batchKey);
        proxy.userData.batchKey = null;
        proxy.userData.batchBaseKey = null;
        proxy.userData.spatialShardBaseKey = null;
      }
      proxy.userData.logicalOnly = true;
      proxy.userData.lightVisual = true;
      this.#spatialObjectIndex.remove(object.id);
      this.#upsertLightVisual(object, proxy);
      return;
    }

    if (proxy.userData.lightVisual) {
      this.#removeLightVisual(object.id, proxy);
    }

    if (object.kind === "camera") {
      if (proxy.userData.batchKey) {
        this.#removeFromBatch(object.id, proxy.userData.batchKey);
        proxy.userData.batchKey = null;
        proxy.userData.batchBaseKey = null;
        proxy.userData.spatialShardBaseKey = null;
      }
      proxy.userData.logicalOnly = true;
      proxy.userData.cameraVisual = true;
      this.#spatialObjectIndex.remove(object.id);
      this.#upsertCameraVisual(object, proxy);
      return;
    }

    if (proxy.userData.cameraVisual) {
      this.#removeCameraVisual(object.id, proxy);
    }

    if (object.kind === "instance-family") {
      if (proxy.userData.batchKey) {
        this.#removeFromBatch(object.id, proxy.userData.batchKey);
        proxy.userData.batchKey = null;
        proxy.userData.batchBaseKey = null;
        proxy.userData.spatialShardBaseKey = null;
      }
      proxy.userData.logicalOnly = false;
      this.#upsertFamilyVisual(object, proxy);
      return;
    }

    if (proxy.userData.familyVisual) {
      this.#removeFamilyVisual(object.id, proxy);
    }

    if (this.#isStrokeBundleObject(object) &&
        this.#canUseSegmentedStrokeBatch(object)) {
      if (proxy.userData.batchKey) {
        this.#removeFromBatch(object.id, proxy.userData.batchKey);
        proxy.userData.batchKey = null;
        proxy.userData.batchBaseKey = null;
        proxy.userData.spatialShardBaseKey = null;
      }
      proxy.userData.logicalOnly = false;
      if (this.#upsertStrokeBundleVisual(object, proxy)) return;
    } else if (proxy.userData.strokeBundleVisual) {
      this.#removeStrokeBundleVisual(object.id, proxy);
    }

    if (this.#canUseHeterogeneousBatch(object)) {
      if (proxy.userData.batchKey) {
        this.#removeFromBatch(object.id, proxy.userData.batchKey);
        proxy.userData.batchKey = null;
        proxy.userData.batchBaseKey = null;
        proxy.userData.spatialShardBaseKey = null;
      }
      proxy.userData.logicalOnly = false;
      if (this.#upsertHeterogeneousVisual(object, proxy)) return;
    } else if (proxy.userData.heterogeneousBatch) {
      this.#removeHeterogeneousObject(object.id, proxy);
    }

    if (!isRenderableSceneNode(object)) {
      if (proxy.userData.batchKey) {
        this.#removeFromBatch(object.id,proxy.userData.batchKey);
        proxy.userData.batchKey=null;
      }
      proxy.userData.logicalOnly=true;
      this.#spatialObjectIndex.remove(object.id);
      return;
    }
    proxy.userData.logicalOnly=false;

    const nextBatchKey = this.#batchKeyFor(object, proxy);

    if (proxy.userData.batchBaseKey !== nextBatchKey) {
      if (proxy.userData.batchKey) {
        this.#removeFromBatch(object.id, proxy.userData.batchKey);
      }
      proxy.userData.batchKey = null;
      proxy.userData.batchBaseKey = null;
      proxy.userData.spatialShardBaseKey = null;
      this.#addToBatch(object, proxy, nextBatchKey);
    } else {
      this.#updateBatchMatrix(object.id, proxy);
    }

    proxy.userData.appearanceId = object.appearanceId;
    proxy.userData.instanceColor =
      object.instanceState?.color ?? null;

    this.#applyObjectInstanceColor(object.id);
    if (this.#meshEdit?.objectId === object.id) {
      const location = this.#batchManager.locationOf(object.id);
      const batch = location
        ? this.#batchManager.getBatch(location.batchKey)
        : null;
      if (batch) {
        const previousMaterial = this.#meshEdit.mesh.material;
        this.#meshEdit.mesh.material = this.#cloneBatchMaterial(
          batch,
          object.id
        );
        previousMaterial.dispose?.();
      }
      this.#batchManager.update(
        object.id,
        new THREE.Matrix4().makeScale(0, 0, 0)
      );
    }
  }

  #removeObject(id) {
    const startedAt = performance.now();
    const proxy = this.#meshes.get(id);
    if (!proxy) return false;

    const overlayIds = [
      ...(this.#animationObjectOverlayIds.get(id) ?? [])
    ];
    for (const overlayId of overlayIds) {
      const overlay = this.#animationOverlays.get(overlayId);
      if (!overlay) continue;
      this.#releaseAnimationBatchCulling(id);
      overlay.objectIds.delete(id);
      overlay.transforms.delete(id);
      overlay.colors.delete(id);
      for (const unit of overlay.targets.units) {
        if (unit.objects.some(object => object.objectId === id)) {
          overlay.pivots.delete(unit.unitId);
        }
      }
    }
    this.#animationObjectOverlayIds.delete(id);
    this.#animationAppliedMatrices.delete(id);
    this.#animationAppliedColors.delete(id);

    const cameraVisual = Boolean(this.#cameraVisuals.has(id));
    const lightVisual = Boolean(this.#lightVisuals.has(id));
    this.#removeCameraVisual(id, proxy);
    this.#removeLightVisual(id, proxy);
    this.#removeFamilyVisual(id, proxy);
    this.#removeStrokeBundleVisual(id, proxy);
    this.#removeHeterogeneousObject(id, proxy);
    this.#removeFromBatch(id, proxy.userData.batchKey);
    this.#spatialObjectIndex.remove(id);
    this.#replicaRenderIndex.unregister(id);
    this.#meshes.delete(id);
    this.#selectedVisualIds.delete(id);
    this.#animationTargetIds.delete(id);
    this.#animationPivotOverrides.delete(id);
    if (overlayIds.length && this.#rebuildAnimationPivotOverrides()) {
      this.#rebuildAnchor();
      this.#updateSelectionAppearance();
      this.#updateVertexMarkers();
    }
    this.#incrementalDiagnostics.objectsDeleted += 1;
    if (cameraVisual || lightVisual) {
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

  #upsertFamilyVisual(object, proxy) {
    const family = normalizeExplicitInstanceFamily(object.family);
    const binding = appearanceBindingForObject(object);
    const descriptor = this.#geometryRegistry.describeLegacyObject(object);
    const renderProfile = this.#geometryRegistry.renderProfile(descriptor);
    const geometryKey = this.#geometryRegistry.key(descriptor);
    const materialRequest = renderMaterialRequest(object, binding);
    const materialIdentity = renderBatchMaterialIdentity(
      materialRequest,
      renderProfile,
      binding
    );
    const bindingIdentity = appearanceBindingIdentity(binding, { family });
    const signature = JSON.stringify([
      geometryKey,
      materialIdentity,
      this.#viewerRenderSettings.shadows.enabled
    ]);
    const current = this.#familyVisuals.get(object.id);
    if (
      current &&
      current.family === object.family &&
      current.signature === signature
    ) {
      current.binding = binding;
      current.bindingIdentity = bindingIdentity;
      proxy.userData.familyVisual = true;
      proxy.userData.appearanceBinding = binding;
      if (proxy.parent !== this.scene) this.scene.add(proxy);
      this.#updateSharedFamilyMatrices(current);
      this.#applyFamilyAppearance(current, binding);
      this.#updateSpatialObjectIndex(object.id, proxy);
      return current;
    }
    if (current) this.#removeFamilyVisual(object.id, proxy);

    const geometry = this.#resourceCache.acquireGeometry(
      geometryKey,
      () => this.#geometryRegistry.create(descriptor)
    );
    const material = this.#materialCache.acquire({
      ...materialRequest,
      renderProfile
    });
    try {
      const conservativeBounds = explicitFamilyConservativeBounds(
        geometry.value,
        family
      );
      proxy.userData.localBounds = {
        min: conservativeBounds.min.toArray(),
        max: conservativeBounds.max.toArray()
      };
      proxy.userData.size = conservativeBounds.getSize(
        new THREE.Vector3()
      ).toArray();
      proxy.userData.familyVisual = true;
      proxy.userData.appearanceBinding = binding;
      if (proxy.parent !== this.scene) this.scene.add(proxy);
      this.#updateSpatialObjectIndex(object.id, proxy);

      const visual = {
        objectId: String(object.id),
        proxy,
        family: object.family,
        normalizedFamily: family,
        familyCount: family.count,
        estimatedBytes: explicitInstanceFamilyEstimatedBytes(family),
        geometryKey: geometry.key,
        geometry: geometry.value,
        materialKey: material.key,
        material: material.value.material,
        materialIdentity,
        binding,
        bindingIdentity,
        signature,
        resourceIds: [],
        batchKeys: new Set(),
        nextIndex: 0,
        building: true,
        animationColorActive: false,
        transform: {
          memberId: null,
          position: [0, 0, 0],
          rotation: [0, 0, 0, 1],
          scale: [1, 1, 1],
          color: null
        },
        position: new THREE.Vector3(),
        quaternion: new THREE.Quaternion(),
        scale: new THREE.Vector3(),
        localMatrix: new THREE.Matrix4(),
        worldMatrix: new THREE.Matrix4(),
        color: new THREE.Color()
      };
      this.#familyVisuals.set(object.id, visual);
      this.#incrementalDiagnostics.familyObjects += 1;
      this.#incrementalDiagnostics.familyInstances += family.count;
      this.#incrementalDiagnostics.familyEstimatedBytes +=
        visual.estimatedBytes;
      this.#fillFamilyVisualChunk(visual, Math.min(32, family.count));
      if (visual.building) this.#queueFamilyBuild(object.id);
      return visual;
    } catch (error) {
      this.#resourceCache.releaseGeometry(geometry.key);
      this.#materialCache.release(material.key);
      throw error;
    }
  }

  #applyFamilyAppearance(visual, binding) {
    visual.binding = binding;
    visual.bindingIdentity = appearanceBindingIdentity(binding, {
      family: visual.normalizedFamily
    });
    for (let index = 0; index < visual.resourceIds.length; index += 1) {
      const resourceId = visual.resourceIds[index];
      const desired = this.#familyMemberColor(visual, index);
      const location = this.#batchManager.locationOf(resourceId);
      const batch = location
        ? this.#batchManager.getBatch(location.batchKey)
        : null;
      if (!batch || !desired) continue;
      updateAbsoluteInstanceColor(batch, resourceId, desired);
      this.#markBatchDirty(location.batchKey);
    }
    visual.proxy.userData.appearanceBinding = binding;
    return true;
  }

  #familyMemberColor(visual, index) {
    if (visual.binding.colorMode === "per-instance") {
      return familyColorAt(visual.normalizedFamily, index);
    }
    if (visual.binding.colorMode === "uniform") {
      return multiplyHexColors(
        visual.binding.uniformColor,
        visual.binding.tint
      );
    }
    const base = visual.material?.color?.isColor
      ? `#${visual.material.color.getHexString()}`
      : "#ffffff";
    return multiplyHexColors(base, visual.binding.tint);
  }

  #queueFamilyBuild(objectId) {
    const id = String(objectId);
    if (!this.#familyBuildQueue.includes(id)) {
      this.#familyBuildQueue.push(id);
    }
    this.#scheduleFamilyBuild();
  }

  #scheduleFamilyBuild() {
    if (this.#familyBuildHandle !== null || !this.#familyBuildQueue.length) {
      return;
    }
    const run = () => {
      this.#familyBuildHandle = null;
      const pendingInput = rendererInputPending();
      const now = rendererNow();
      if (pendingInput) {
        this.#familyBuildDeferredAt ??= now;
        if (now - this.#familyBuildDeferredAt < 40) {
          this.#incrementalDiagnostics.familyBuildDeferredForInput += 1;
          this.#scheduleFamilyBuild();
          return;
        }
        this.#incrementalDiagnostics.familyBuildForcedProgress += 1;
      } else {
        this.#familyBuildDeferredAt = null;
      }
      const startedAt = rendererNow();
      const budgetMs = pendingInput ? 1.5 : 4;
      const maximumPerFamily = pendingInput ? 64 : 256;
      while (this.#familyBuildQueue.length) {
        const id = this.#familyBuildQueue.shift();
        const visual = this.#familyVisuals.get(id);
        if (!visual?.building) continue;
        this.#fillFamilyVisualChunk(visual, maximumPerFamily);
        if (visual.building) this.#familyBuildQueue.push(id);
        if (rendererInputPending() || rendererNow() - startedAt >= budgetMs) {
          break;
        }
      }
      const elapsed = rendererNow() - startedAt;
      this.#incrementalDiagnostics.familyBuildChunks += 1;
      this.#incrementalDiagnostics.familyBuildMaximumChunkMs = Math.max(
        this.#incrementalDiagnostics.familyBuildMaximumChunkMs,
        elapsed
      );
      if (this.#familyBuildQueue.length) {
        this.#scheduleFamilyBuild();
      } else {
        this.#familyBuildDeferredAt = null;
      }
    };
    if (typeof globalThis.requestAnimationFrame === "function") {
      this.#familyBuildHandle = {
        kind: "frame",
        id: globalThis.requestAnimationFrame(run)
      };
      return;
    }
    this.#familyBuildHandle = {
      kind: "timeout",
      id: globalThis.setTimeout(run, 0)
    };
  }

  #fillFamilyVisualChunk(visual, maximum = 512) {
    const family = visual.normalizedFamily;
    const start = visual.nextIndex;
    const end = Math.min(family.count, start + maximum);
    visual.proxy.updateMatrixWorld(true);
    for (let index = start; index < end; index += 1) {
      explicitFamilyTransformAt(family, index, visual.transform);
      visual.position.fromArray(visual.transform.position);
      visual.quaternion.fromArray(visual.transform.rotation);
      visual.scale.fromArray(visual.transform.scale);
      visual.localMatrix.compose(
        visual.position,
        visual.quaternion,
        visual.scale
      );
      visual.worldMatrix.multiplyMatrices(
        visual.proxy.matrixWorld,
        visual.localMatrix
      );
      const memberId = visual.transform.memberId ?? `member-${index + 1}`;
      const resourceId = familyMemberResourcePath(
        visual.objectId,
        memberId
      );
      const cell = familyBatchSpatialCell(
        visual.worldMatrix,
        this.#spatialShardSize
      );
      const baseKey = JSON.stringify([
        "shared-family",
        visual.signature,
        cell
      ]);
      const desired = this.#familyMemberColor(visual, index);
      const added = this.#batchManager.addSegmented({
        resourceId,
        ownerId: visual.objectId,
        memberId,
        batchBaseKey: baseKey,
        matrix: visual.worldMatrix,
        attributes: desired
          ? { color: absoluteInstanceColorFactor(visual.material, desired) }
          : {},
        descriptor: {
          geometry: visual.geometry,
          material: visual.material,
          capacity: this.#spatialShardCapacity
        },
        metadata: Object.freeze({
          kind: "family-member",
          ordinal: index
        })
      });
      added.batch.mesh.userData.sharedFamilyResources = true;
      added.batch.mesh.userData.renderSignature = visual.signature;
      visual.resourceIds[index] = resourceId;
      visual.batchKeys.add(added.batch.key);
      this.#markBatchDirty(added.batch.key);
    }
    visual.nextIndex = end;
    if (end > start) this.invalidateRender("family-build");
    if (start === 0 && end > 0) {
      this.#notifyObjectVisual(visual, {
        ready: true,
        partial: end < family.count
      });
      this.#rebuildAnchor();
      this.#updateSelectionAppearance();
    }
    if (end < family.count) return;
    visual.building = false;
    this.#notifyObjectVisual(visual, { ready: true, partial: false });
    this.#rebuildAnchor();
    this.#updateSelectionAppearance();
  }

  #updateSharedFamilyMatrices(visual) {
    if (!visual?.resourceIds?.length) return false;
    visual.proxy.updateMatrixWorld(true);
    let changed = false;
    for (let index = 0; index < visual.resourceIds.length; index += 1) {
      explicitFamilyTransformAt(
        visual.normalizedFamily,
        index,
        visual.transform
      );
      visual.position.fromArray(visual.transform.position);
      visual.quaternion.fromArray(visual.transform.rotation);
      visual.scale.fromArray(visual.transform.scale);
      visual.localMatrix.compose(
        visual.position,
        visual.quaternion,
        visual.scale
      );
      visual.worldMatrix.multiplyMatrices(
        visual.proxy.matrixWorld,
        visual.localMatrix
      );
      const resourceId = visual.resourceIds[index];
      const location = this.#batchManager.locationOf(resourceId);
      if (this.#batchManager.update(resourceId, visual.worldMatrix)) {
        changed = true;
        this.#markBatchDirty(location?.batchKey);
      }
    }
    this.#updateSpatialObjectIndex(visual.objectId, visual.proxy);
    return changed;
  }

  #notifyObjectVisual(visual, { ready, partial }) {
    for (const listener of this.#objectVisualListeners) {
      try {
        listener(Object.freeze({
          objectId: visual.objectId,
          ready: Boolean(ready),
          partial: Boolean(partial),
          kind: "instance-family"
        }));
      } catch (error) {
        console.error("Object visual listener failed", error);
      }
    }
  }

  #removeFamilyVisual(id, proxy = this.#meshes.get(id)) {
    const visual = this.#familyVisuals.get(String(id));
    this.#familyBuildQueue = this.#familyBuildQueue.filter(
      queuedId => queuedId !== String(id)
    );
    if (!visual) {
      if (proxy?.userData) proxy.userData.familyVisual = false;
      return false;
    }
    const removal = this.#batchManager.removeOwner(visual.objectId);
    const batchKeys = new Set(removal.results.map(result => result.batchKey));
    for (const batchKey of batchKeys) {
      const batch = this.#batchManager.getBatch(batchKey);
      if (!batch || batch.size > 0) continue;
      this.scene.remove(batch.mesh);
      this.#batchManager.deleteBatch(batchKey);
      this.#dirtyBatchKeys.delete(batchKey);
    }
    this.#resourceCache.releaseGeometry(visual.geometryKey);
    this.#materialCache.release(visual.materialKey);
    this.#familyVisuals.delete(String(id));
    if (proxy?.userData) {
      proxy.userData.familyVisual = false;
      proxy.userData.localBounds = null;
    }
    this.#incrementalDiagnostics.familyObjects = Math.max(
      0,
      this.#incrementalDiagnostics.familyObjects - 1
    );
    this.#incrementalDiagnostics.familyInstances = Math.max(
      0,
      this.#incrementalDiagnostics.familyInstances - visual.familyCount
    );
    this.#incrementalDiagnostics.familyEstimatedBytes = Math.max(
      0,
      this.#incrementalDiagnostics.familyEstimatedBytes -
        visual.estimatedBytes
    );
    return true;
  }

  #upsertLightVisual(object, proxy) {
    const descriptor = object.light ?? {};
    const type = String(descriptor.type ?? "point");
    let visual = this.#lightVisuals.get(object.id);
    if (!visual || visual.type !== type) {
      if (visual) this.#removeLightVisual(object.id, proxy);
      const icon = new THREE.Mesh(
        type === "directional"
          ? new THREE.OctahedronGeometry(0.28, 0)
          : new THREE.SphereGeometry(0.24, 12, 8),
        new THREE.MeshBasicMaterial({
          color: descriptor.color ?? "#ffffff",
          depthTest: true,
          depthWrite: true
        })
      );
      icon.userData.lightObjectId = object.id;
      const rays = new THREE.LineSegments(
        lightRayGeometry(type),
        new THREE.LineBasicMaterial({
          color: descriptor.color ?? "#ffffff",
          transparent: true,
          opacity: 0.8
        })
      );
      rays.userData.lightObjectId = object.id;
      const target = new THREE.Object3D();
      target.position.set(0, 0, -1);
      const light = createThreeLight(type, descriptor);
      light.userData.lightObjectId = object.id;
      if (light.target) light.target = target;
      proxy.add(icon, rays, target, light);
      this.scene.add(proxy);
      visual = { type, icon, rays, target, light };
      this.#lightVisuals.set(object.id, visual);
    }

    visual.icon.material.color.set(descriptor.color ?? "#ffffff");
    visual.rays.material.color.set(descriptor.color ?? "#ffffff");
    visual.light.color?.set?.(descriptor.color ?? "#ffffff");
    visual.light.intensity = Number(descriptor.intensity ?? 3);
    if ("distance" in visual.light) {
      visual.light.distance = Number(descriptor.distance ?? 0);
    }
    if ("decay" in visual.light) {
      visual.light.decay = Number(descriptor.decay ?? 2);
    }
    if (visual.light.isSpotLight) {
      visual.light.angle = Number(descriptor.angleDeg ?? 45) * Math.PI / 180;
      visual.light.penumbra = Number(descriptor.penumbra ?? 0.2);
    }
    visual.light.castShadow = Boolean(
      descriptor.castShadow && !visual.light.isAmbientLight
    );
    if (visual.light.shadow?.mapSize) {
      visual.light.shadow.mapSize.set(512, 512);
      visual.light.shadow.bias = -0.0003;
      visual.light.shadow.normalBias = 0.02;
    }
    proxy.userData.localBounds = {
      min: [-0.42, -0.42, -0.75],
      max: [0.42, 0.42, 0.42]
    };
    proxy.userData.lightProjection = structuredClone(descriptor);
  }

  #removeLightVisual(id, proxy = this.#meshes.get(id)) {
    const visual = this.#lightVisuals.get(id);
    if (!visual) return false;
    this.scene.remove(proxy);
    for (const object of [visual.icon, visual.rays]) {
      object.geometry?.dispose?.();
      object.material?.dispose?.();
    }
    visual.light?.dispose?.();
    proxy.clear();
    proxy.userData.lightVisual = false;
    this.#lightVisuals.delete(id);
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
    this.#cancelDeferredSceneMaintenance();
    this.#flushBatchBounds({ all: true });
    const batches = this.#batchManager.batches();
    this.#incrementalDiagnostics.fullBatchVisits += batches.length;
    for (const batch of batches) {
      batch.mesh.frustumCulled = true;
    }
    this.#rebuildAnchor();
    this.#updateSelectionAppearance();
    this.#updateVertexMarkers();
    this.invalidateRender("scene-update");
  }

  #finishLocalizedSceneUpdate() {
    let deferred = 0;
    for (const batchKey of this.#dirtyBatchKeys) {
      const batch = this.#batchManager.getBatch(batchKey);
      this.#incrementalDiagnostics.dirtyBatchVisits += 1;
      if (!batch?.boundsDirty) continue;
      batch.mesh.frustumCulled = false;
      deferred += 1;
    }
    if (deferred) {
      this.#incrementalDiagnostics.deferredBatchBounds += deferred;
      this.#scheduleBatchMaintenance();
    }
    this.#rebuildAnchor();
    this.#updateSelectionAppearance();
    this.#updateVertexMarkers();
    this.invalidateRender("scene-update-local");
  }

  #scheduleHierarchyRefresh(state) {
    this.#hierarchyRefreshState = state;
    if (this.#hierarchyRefreshHandle !== null) return;
    const run = () => {
      this.#hierarchyRefreshHandle = null;
      if (rendererInputPending()) {
        this.#scheduleHierarchyRefresh(this.#hierarchyRefreshState);
        return;
      }
      const latest = this.#hierarchyRefreshState;
      this.#hierarchyRefreshState = null;
      if (!latest?.objects) return;
      this.#incrementalDiagnostics.hierarchyObjectsVisited +=
        latest.objects.length;
      this.#hierarchy = new HierarchyIndex(latest.objects);
      this.#incrementalDiagnostics.deferredHierarchyBuilds += 1;
    };
    if (typeof globalThis.requestIdleCallback === "function") {
      this.#hierarchyRefreshHandle = {
        kind: "idle",
        id: globalThis.requestIdleCallback(run)
      };
      return;
    }
    this.#hierarchyRefreshHandle = {
      kind: "timeout",
      id: globalThis.setTimeout(run, 120)
    };
  }

  #scheduleBatchMaintenance() {
    if (this.#batchMaintenanceHandle !== null) return;
    const run = () => {
      this.#batchMaintenanceHandle = null;
      if (rendererInputPending()) {
        this.#scheduleBatchMaintenance();
        return;
      }
      for (const batchKey of [...this.#dirtyBatchKeys]) {
        const batch = this.#batchManager.getBatch(batchKey);
        this.#incrementalDiagnostics.dirtyBatchVisits += 1;
        if (!batch || !batch.boundsDirty || batch.flushBounds()) {
          if (batch) batch.mesh.frustumCulled = true;
          this.#dirtyBatchKeys.delete(batchKey);
        }
      }
    };
    if (typeof globalThis.requestIdleCallback === "function") {
      this.#batchMaintenanceHandle = {
        kind: "idle",
        id: globalThis.requestIdleCallback(run)
      };
      return;
    }
    this.#batchMaintenanceHandle = {
      kind: "timeout",
      id: globalThis.setTimeout(run, 120)
    };
  }

  #cancelDeferredSceneMaintenance() {
    for (const [field, handle] of [
      ["hierarchy", this.#hierarchyRefreshHandle],
      ["bounds", this.#batchMaintenanceHandle]
    ]) {
      if (!handle) continue;
      if (handle.kind === "idle" &&
          typeof globalThis.cancelIdleCallback === "function") {
        globalThis.cancelIdleCallback(handle.id);
      } else {
        globalThis.clearTimeout(handle.id);
      }
      if (field === "hierarchy") this.#hierarchyRefreshHandle = null;
      else this.#batchMaintenanceHandle = null;
    }
    this.#hierarchyRefreshState = null;
  }

  #flushBatchBounds({ all = false } = {}) {
    let flushed = 0;
    if (all) {
      const batches = this.#batchManager.batches();
      this.#incrementalDiagnostics.fullBatchVisits += batches.length;
      for (const batch of batches) {
        if (batch.flushBounds()) flushed += 1;
      }
      this.#dirtyBatchKeys.clear();
      return flushed;
    }
    for (const batchKey of [...this.#dirtyBatchKeys]) {
      const batch = this.#batchManager.getBatch(batchKey);
      this.#incrementalDiagnostics.dirtyBatchVisits += 1;
      if (batch?.flushBounds()) flushed += 1;
      this.#dirtyBatchKeys.delete(batchKey);
    }
    return flushed;
  }

  #markBatchDirty(batchKey) {
    if (!batchKey) return;
    this.#dirtyBatchKeys.add(batchKey);
    const batch = this.#batchManager.getBatch(batchKey);
    if (batch) batch.mesh.frustumCulled = false;
  }

  #isStrokeBundleObject(object) {
    return Boolean(
      object?.kind === "stroke-bundle" ||
      object?.geometry?.type === "stroke-bundle"
    );
  }

  #isOpaqueBatchCandidate(object) {
    const binding = appearanceBindingForObject(object);
    const request = renderMaterialRequest(object, binding);
    const opacity = Number(
      request.material?.opacity ?? object.material?.opacity ?? 1
    ) * Number(binding.opacityMultiplier ?? 1);
    return opacity >= 0.999 &&
      !Boolean(request.material?.transparent) &&
      !Boolean(request.material?.alphaMap);
  }

  #canUseSegmentedStrokeBatch(object) {
    return Boolean(
      this.#heterogeneousBatchManager?.supported &&
      this.#isStrokeBundleObject(object) &&
      this.#isOpaqueBatchCandidate(object)
    );
  }

  #upsertStrokeBundleVisual(object, proxy) {
    const bundle = normalizeStrokeBundleDescriptor(
      object.geometry?.type === "stroke-bundle"
        ? object.geometry
        : object.strokeBundle ?? object.geometry
    );
    const binding = appearanceBindingForObject(object);
    const renderProfile = this.#geometryRegistry.renderProfile(bundle);
    const materialRequest = renderMaterialRequest(object, binding);
    const materialIdentity = renderBatchMaterialIdentity(
      materialRequest,
      renderProfile,
      binding
    );
    const signature = JSON.stringify([
      "segmented-stroke-bundle",
      materialIdentity,
      this.#viewerRenderSettings.shadows.enabled
    ]);
    proxy.updateMatrixWorld(true);

    let visual = this.#strokeVisuals.get(String(object.id)) ?? null;
    if (visual && visual.signature !== signature) {
      this.#removeStrokeBundleVisual(object.id, proxy);
      visual = null;
    }
    if (!visual) {
      visual = {
        objectId: String(object.id),
        bundle: null,
        signature,
        binding,
        materialRequest,
        renderProfile,
        chunks: new Map(),
        animationColorActive: false
      };
      this.#strokeVisuals.set(String(object.id), visual);
    }

    const nextChunksById = new Map(
      bundle.chunks.map(chunk => [String(chunk.id), chunk])
    );
    const nextChunkIds = new Set(nextChunksById.keys());
    for (const [chunkId, entry] of [...visual.chunks]) {
      const nextChunk = nextChunksById.get(chunkId);
      if (!nextChunk || nextChunk !== entry.chunk) {
        this.#heterogeneousBatchManager.remove(entry.resourceId);
        visual.chunks.delete(chunkId);
      }
    }

    const desired = effectiveAppearanceColor(binding, {
      baseColor: object.material?.color ?? "#ffffff",
      instanceColor: object.instanceState?.color ?? null
    });
    let failed = false;
    for (const chunk of bundle.chunks) {
      const chunkId = String(chunk.id);
      if (visual.chunks.has(chunkId)) continue;
      const descriptor = strokeBundleChunkDescriptor(bundle, chunk);
      const geometryKey = this.#geometryRegistry.key(descriptor);
      const geometryResource = this.#resourceCache.acquireGeometry(
        geometryKey,
        () => this.#geometryRegistry.create(descriptor)
      );
      try {
        const resourceId = strokeChunkRenderResourcePath(object.id, chunkId);
        const attributeSignature = bufferGeometryAttributeSignature(
          geometryResource.value
        );
        const cell = strokeChunkSpatialCell(
          proxy.matrixWorld,
          chunk.bounds,
          64
        );
        const batchBaseKey = JSON.stringify([
          signature,
          cell,
          attributeSignature
        ]);
        const result = this.#heterogeneousBatchManager.add({
          objectId: object.id,
          resourceId,
          ownerId: object.id,
          metadata: Object.freeze({
            kind: "stroke-chunk",
            chunkId
          }),
          batchBaseKey,
          geometry: geometryResource.value,
          matrix: proxy.matrixWorld,
          materialFactory: () => {
            const acquired = this.#materialCache.acquire({
              ...materialRequest,
              renderProfile
            });
            return {
              material: acquired.value.material,
              materialKey: acquired.key
            };
          }
        });
        if (!result.added) {
          failed = true;
          break;
        }
        visual.chunks.set(chunkId, Object.freeze({
          chunk,
          resourceId,
          geometryKey,
          batchBaseKey
        }));
        this.#setHeterogeneousResourceColor(resourceId, desired);
      } finally {
        this.#resourceCache.releaseGeometry(geometryResource.key);
      }
    }

    if (failed || visual.chunks.size !== nextChunkIds.size) {
      this.#removeStrokeBundleVisual(object.id, proxy);
      return false;
    }

    visual.bundle = bundle;
    visual.binding = binding;
    visual.materialRequest = materialRequest;
    visual.renderProfile = renderProfile;
    proxy.userData.strokeBundleVisual = true;
    proxy.userData.heterogeneousBatch = true;
    proxy.userData.appearanceBinding = binding;
    proxy.userData.appearanceId = object.appearanceId;
    proxy.userData.instanceColor = object.instanceState?.color ?? null;
    proxy.userData.materialColor = object.material?.color ?? "#ffffff";
    proxy.userData.localBounds = {
      min: [...bundle.bounds.min],
      max: [...bundle.bounds.max]
    };
    proxy.userData.selectionAnchorPolicy = bundle.selectionAnchorPolicy;
    proxy.userData.selectionAnchorLocal = bundle.selectionAnchorLocal
      ? [...bundle.selectionAnchorLocal]
      : null;
    proxy.userData.size = bundle.bounds.max.map(
      (value, axis) => value - bundle.bounds.min[axis]
    );
    if (proxy.parent !== this.scene) this.scene.add(proxy);
    this.#heterogeneousBatchManager.updateOwner(object.id, proxy.matrixWorld);
    this.#updateSpatialObjectIndex(object.id, proxy);
    this.#applyObjectInstanceColor(object.id);
    return true;
  }

  #removeStrokeBundleVisual(
    objectId,
    proxy = this.#meshes.get(String(objectId))
  ) {
    const id = String(objectId);
    const visual = this.#strokeVisuals.get(id);
    if (!visual) return false;
    this.#heterogeneousBatchManager.removeOwner(id);
    this.#strokeVisuals.delete(id);
    if (proxy?.userData) {
      proxy.userData.strokeBundleVisual = false;
      proxy.userData.heterogeneousBatch = false;
      delete proxy.userData.selectionAnchorPolicy;
      delete proxy.userData.selectionAnchorLocal;
    }
    return true;
  }

  #canUseHeterogeneousBatch(object) {
    return Boolean(
      this.#heterogeneousBatchManager?.supported &&
      object?.geometry?.type === "tube" &&
      this.#isOpaqueBatchCandidate(object)
    );
  }

  #upsertHeterogeneousVisual(object, proxy) {
    const descriptor = this.#geometryRegistry.describeLegacyObject(object);
    const geometryKey = this.#geometryRegistry.key(descriptor);
    const binding = appearanceBindingForObject(object);
    const renderProfile = this.#geometryRegistry.renderProfile(descriptor);
    const materialRequest = renderMaterialRequest(object, binding);
    const materialIdentity = renderBatchMaterialIdentity(
      materialRequest,
      renderProfile,
      binding
    );
    proxy.updateMatrixWorld(true);
    const cell = familyBatchSpatialCell(proxy.matrixWorld, 64);
    const signature = JSON.stringify([
      "heterogeneous-tube",
      materialIdentity,
      cell,
      this.#viewerRenderSettings.shadows.enabled
    ]);
    if (proxy.userData.heterogeneousBatch &&
        proxy.userData.heterogeneousGeometryKey === geometryKey &&
        proxy.userData.heterogeneousSignature === signature) {
      this.#heterogeneousBatchManager.update(object.id, proxy.matrixWorld);
      this.#updateSpatialObjectIndex(object.id, proxy);
      this.#applyObjectInstanceColor(object.id);
      return true;
    }
    if (proxy.userData.heterogeneousBatch) {
      this.#removeHeterogeneousObject(object.id, proxy);
    }

    const geometryResource = this.#resourceCache.acquireGeometry(
      geometryKey,
      () => this.#geometryRegistry.create(descriptor)
    );
    this.#storeGeometryBounds(proxy, geometryResource.value);
    const attributeSignature = bufferGeometryAttributeSignature(
      geometryResource.value
    );
    const batchBaseKey = JSON.stringify([signature, attributeSignature]);
    try {
      const result = this.#heterogeneousBatchManager.add({
        objectId: object.id,
        batchBaseKey,
        geometry: geometryResource.value,
        matrix: proxy.matrixWorld,
        materialFactory: () => {
          const acquired = this.#materialCache.acquire({
            ...materialRequest,
            renderProfile
          });
          return {
            material: acquired.value.material,
            materialKey: acquired.key
          };
        }
      });
      if (!result.added) return false;
      proxy.userData.heterogeneousBatch = true;
      proxy.userData.heterogeneousGeometryKey = geometryKey;
      proxy.userData.heterogeneousSignature = signature;
      proxy.userData.appearanceBinding = binding;
      proxy.userData.appearanceId = object.appearanceId;
      proxy.userData.instanceColor = object.instanceState?.color ?? null;
      proxy.userData.materialColor = object.material?.color ?? "#ffffff";
      if (proxy.parent !== this.scene) this.scene.add(proxy);
      this.#updateSpatialObjectIndex(object.id, proxy);
      const desired = effectiveAppearanceColor(binding, {
        baseColor: object.material?.color ?? "#ffffff",
        instanceColor: object.instanceState?.color ?? null
      });
      this.#setHeterogeneousColor(object.id, desired);
      return true;
    } finally {
      this.#resourceCache.releaseGeometry(geometryResource.key);
    }
  }

  #removeHeterogeneousObject(objectId, proxy = this.#meshes.get(objectId)) {
    const result = this.#heterogeneousBatchManager?.removeOwner(objectId) ?? {
      removed: 0
    };
    if (proxy?.userData && !proxy.userData.strokeBundleVisual) {
      proxy.userData.heterogeneousBatch = false;
      delete proxy.userData.heterogeneousGeometryKey;
      delete proxy.userData.heterogeneousSignature;
    }
    return Number(result.removed ?? 0) > 0;
  }

  #setHeterogeneousResourceColor(resourceId, value) {
    const location = this.#heterogeneousBatchManager.locationOf(resourceId);
    if (!location) return false;
    const batch = this.#heterogeneousBatchManager.getBatch(location.batchKey);
    if (!batch) return false;
    return this.#heterogeneousBatchManager.updateColor(
      resourceId,
      absoluteInstanceColorFactor(batch.mesh.material, value)
    );
  }

  #setHeterogeneousColor(objectId, value) {
    let changed = false;
    for (const resourceId of
      this.#heterogeneousBatchManager.resourcesForOwner(objectId)) {
      if (this.#setHeterogeneousResourceColor(resourceId, value)) {
        changed = true;
      }
    }
    return changed;
  }

  #batchKeyFor(object, proxy = null) {
    const descriptor = this.#geometryRegistry.describeLegacyObject(object);
    const renderProfile = this.#geometryRegistry.renderProfile(descriptor);
    const binding = appearanceBindingForObject(object);
    const materialRequest = renderMaterialRequest(object, binding);
    return JSON.stringify([
      this.#geometryRegistry.key(descriptor),
      proxy && this.#proxyUsesMirrorX(proxy) ? "mirror-x" : "normal",
      object.kind === "stroke-bundle" ? String(object.id) : null,
      materialRequest.appearanceId ?? null,
      materialRequest.material ?? null,
      renderProfile.side,
      binding.materialMode,
      binding.opacityMultiplier
    ]);
  }

  #proxyUsesMirrorX(proxy) {
    proxy.updateMatrixWorld(true);
    return proxy.matrixWorld.determinant() < 0;
  }

  #batchMatrixForProxy(proxy) {
    proxy.updateMatrixWorld(true);
    const matrix = proxy.matrixWorld.clone();
    return this.#proxyUsesMirrorX(proxy)
      ? matrix.multiply(this.#mirrorXMatrix)
      : matrix;
  }

  #addToBatch(object, proxy, batchBaseKey) {
    proxy.updateMatrixWorld(true);
    const mirroredX = this.#proxyUsesMirrorX(proxy);
    const batchMatrix = this.#batchMatrixForProxy(proxy);
    const spatialShardBaseKey = this.#spatialShardBaseKey(
      batchBaseKey,
      proxy
    );
    let batch = this.#batchManager.writableBatchForBaseKey(
      spatialShardBaseKey
    );
    let added = null;

    if (!batch) {
      const descriptor = this.#geometryRegistry.describeLegacyObject(object);
      const renderProfile = this.#geometryRegistry.renderProfile(descriptor);
      const baseGeometryKey = this.#geometryRegistry.key(descriptor);
      const geometryKey = mirroredX
        ? `${baseGeometryKey}|mirror:x`
        : baseGeometryKey;
      const geometry = this.#resourceCache.acquireGeometry(
        geometryKey,
        () => {
          const created = this.#geometryRegistry.create(descriptor);
          return mirroredX ? mirrorGeometryXInPlace(created) : created;
        }
      );
      const binding = appearanceBindingForObject(object);
      const material = this.#materialCache.acquire({
        ...renderMaterialRequest(object, binding),
        renderProfile
      });

      try {
        added = this.#batchManager.addSegmented({
          objectId: object.id,
          batchBaseKey: spatialShardBaseKey,
          matrix: batchMatrix,
          descriptor: {
            geometry: geometry.value,
            material: material.value.material,
            capacity: this.#spatialShardCapacity
          }
        });
        batch = added.batch;
        batch.mesh.userData.geometryCacheKey = geometry.key;
        batch.mesh.userData.appearanceId = object.appearanceId;
        batch.mesh.userData.materialCacheKey = material.key;
        batch.mesh.userData.spatialShardBaseKey = spatialShardBaseKey;
      } catch (error) {
        this.#resourceCache.releaseGeometry(geometry.key);
        this.#materialCache.release(material.key);
        throw error;
      }
    } else {
      added = this.#batchManager.addSegmented({
        objectId: object.id,
        batchBaseKey: spatialShardBaseKey,
        matrix: batchMatrix,
        descriptor: {
          geometry: batch.geometry,
          material: batch.material,
          capacity: this.#spatialShardCapacity
        }
      });
      batch = added.batch;
    }

    proxy.userData.batchBaseKey = batchBaseKey;
    proxy.userData.spatialShardBaseKey = spatialShardBaseKey;
    proxy.userData.batchKey = batch.key;
    this.#markBatchDirty(batch.key);
    this.#storeGeometryBounds(proxy, batch.geometry, { mirroredX });
    this.#updateSpatialObjectIndex(object.id, proxy);
    this.#applyObjectInstanceColor(object.id);
  }

  #spatialShardBaseKey(batchBaseKey, proxy) {
    proxy.updateMatrixWorld(true);
    const elements = proxy.matrixWorld.elements;
    const cellKey = spatialCellKeyForPoint(
      [elements[12], elements[13], elements[14]],
      this.#spatialShardSize
    );
    return `${batchBaseKey}|spatial:${cellKey}`;
  }

  #updateSpatialObjectIndex(objectId, proxy) {
    if (!proxy || proxy.userData.logicalOnly) {
      this.#spatialObjectIndex.remove(objectId);
      return false;
    }
    const bounds = this.#worldBoundsForProxy(proxy, new THREE.Box3());
    if (bounds.isEmpty()) {
      this.#spatialObjectIndex.remove(objectId);
      return false;
    }
    return this.#spatialObjectIndex.update(objectId, {
      min: bounds.min.toArray(),
      max: bounds.max.toArray()
    });
  }

  #storeGeometryBounds(proxy, geometry, { mirroredX = false } = {}) {
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    const bounds = geometry.boundingBox;
    if (!bounds) {
      proxy.userData.localBounds = null;
      return;
    }
    const min = bounds.min.toArray();
    const max = bounds.max.toArray();
    proxy.userData.localBounds = mirroredX
      ? {
          min: [-max[0], min[1], min[2]],
          max: [-min[0], max[1], max[2]]
        }
      : { min, max };
  }

  #removeFromBatch(objectId, batchKey) {
    if (!batchKey) return false;
    const batch = this.#batchManager.getBatch(batchKey);
    const result = this.#batchManager.remove(objectId);
    if (result.removed) this.#markBatchDirty(batchKey);

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
    this.#dirtyBatchKeys.delete(batchKey);
    return true;
  }

  #setInstanceColor(objectId, value) {
    const family = this.#familyVisuals.get(String(objectId));
    if (family) {
      family.animationColorActive = true;
      let changed = false;
      for (const resourceId of family.resourceIds) {
        const location = this.#batchManager.locationOf(resourceId);
        const batch = location
          ? this.#batchManager.getBatch(location.batchKey)
          : null;
        if (!batch) continue;
        if (updateAbsoluteInstanceColor(batch, resourceId, value)) {
          changed = true;
          this.#markBatchDirty(location.batchKey);
        }
      }
      return changed;
    }

    const strokeVisual = this.#strokeVisuals.get(String(objectId));
    if (strokeVisual) strokeVisual.animationColorActive = true;
    if (this.#heterogeneousBatchManager.resourcesForOwner(objectId).length) {
      return this.#setHeterogeneousColor(objectId, value);
    }

    const location = this.#batchManager.locationOf(objectId);
    if (!location) return false;
    const batch = this.#batchManager.getBatch(location.batchKey);
    if (!batch) return false;
    return updateAbsoluteInstanceColor(batch, objectId, value);
  }

  #applyObjectInstanceColor(objectId) {
    const proxy = this.#meshes.get(objectId);
    if (!proxy) return false;

    const family = this.#familyVisuals.get(String(objectId));
    if (family) {
      family.animationColorActive = false;
      return this.#applyFamilyAppearance(family, family.binding);
    }

    if (this.#heterogeneousBatchManager.resourcesForOwner(objectId).length) {
      const strokeVisual = this.#strokeVisuals.get(String(objectId));
      if (strokeVisual) strokeVisual.animationColorActive = false;
      const baseColor = proxy.userData.instanceColor ??
        proxy.userData.appearanceBinding?.uniformColor ??
        proxy.userData.materialColor ?? "#ffffff";
      const desired = effectiveAppearanceColor(
        proxy.userData.appearanceBinding,
        {
          baseColor,
          instanceColor: proxy.userData.instanceColor
        }
      );
      return this.#setHeterogeneousColor(objectId, desired);
    }

    const location = this.#batchManager.locationOf(objectId);
    const batch = location
      ? this.#batchManager.getBatch(location.batchKey)
      : null;

    if (!batch) return false;

    const baseColor = batch.material?.color?.isColor
      ? `#${batch.material.color.getHexString()}`
      : "#ffffff";
    const desired = effectiveAppearanceColor(
      proxy.userData.appearanceBinding,
      {
        baseColor,
        instanceColor: proxy.userData.instanceColor
      }
    );

    return this.#setInstanceColor(objectId, desired);
  }

  #updateBatchMatrix(objectId, proxy) {
    const family = this.#familyVisuals.get(String(objectId));
    if (family) return this.#updateSharedFamilyMatrices(family);
    if (proxy.matrixAutoUpdate) proxy.updateMatrix();
    proxy.updateMatrixWorld(true);
    if (this.#heterogeneousBatchManager.resourcesForOwner(objectId).length) {
      const changed = this.#heterogeneousBatchManager.updateOwner(
        objectId,
        proxy.matrixWorld
      ) > 0;
      this.#updateSpatialObjectIndex(objectId, proxy);
      return changed;
    }

    const location = this.#batchManager.locationOf(objectId);
    const baseKey = proxy.userData.batchBaseKey;
    const rawObject = this.#objectsById.get(String(objectId));
    const projectedObject = rawObject ? this.#projectObject(rawObject) : null;
    const desiredBaseKey = projectedObject
      ? this.#batchKeyFor(projectedObject, proxy)
      : baseKey;

    /*
     * InstancedMesh não suporta matriz de instância com determinante negativo.
     * Quando a transformação cruza a paridade, migramos somente este objeto
     * para um batch cuja geometria é espelhada em X e cuja matriz volta a ter
     * determinante positivo. O produto visual continua exatamente o mesmo.
     */
    if (location && baseKey && desiredBaseKey !== baseKey && projectedObject) {
      const overlayReferences =
        this.#animationObjectOverlayIds.get(String(objectId))?.size ?? 0;
      for (let index = 0; index < overlayReferences; index += 1) {
        this.#releaseAnimationBatchCulling(objectId);
      }
      this.#removeFromBatch(objectId, location.batchKey);
      proxy.userData.batchKey = null;
      proxy.userData.batchBaseKey = null;
      proxy.userData.spatialShardBaseKey = null;
      this.#addToBatch(projectedObject, proxy, desiredBaseKey);
      this.#animationAppliedColors.delete(String(objectId));
      for (let index = 0; index < overlayReferences; index += 1) {
        this.#acquireAnimationBatchCulling(objectId);
      }
      this.#incrementalDiagnostics.spatialShardMigrations += 1;
      return true;
    }

    const canMigrateShard = Boolean(
      location && baseKey &&
      !this.#session &&
      !this.#animationTargetIds.has(String(objectId)) &&
      !this.#sharedTransformObjectIds.has(String(objectId))
    );

    if (canMigrateShard) {
      const desiredShardBaseKey = this.#spatialShardBaseKey(baseKey, proxy);
      if (desiredShardBaseKey !== proxy.userData.spatialShardBaseKey) {
        if (projectedObject) {
          const previousBatchKey = location.batchKey;
          this.#removeFromBatch(objectId, previousBatchKey);
          proxy.userData.batchKey = null;
          proxy.userData.spatialShardBaseKey = null;
          this.#addToBatch(projectedObject, proxy, baseKey);
          this.#incrementalDiagnostics.spatialShardMigrations += 1;
          return true;
        }
      }
    }

    const changed = this.#batchManager.update(
      objectId,
      this.#batchMatrixForProxy(proxy)
    );
    if (changed) this.#markBatchDirty(location?.batchKey);
    this.#updateSpatialObjectIndex(objectId, proxy);
    return changed;
  }

  #raycastSpatialObjects({ firstOnly = false } = {}) {
    this.#incrementalDiagnostics.spatialRayQueries += 1;
    const candidates = this.#spatialObjectIndex.queryRay(
      this.raycaster.ray,
      { maxDistance: this.camera.far }
    );
    this.#incrementalDiagnostics.spatialRayCandidates += candidates.length;
    const results = [];
    let bestDistance = Infinity;
    const pushHit = (objectId, hit) => {
      if (!hit) return;
      const normal = hit.face?.normal
        ? transformHitNormalToWorld(hit).normalize()
        : null;
      const result = Object.freeze({
        objectId: String(objectId),
        distance: Number(hit.distance),
        point: hit.point?.clone?.() ?? null,
        normal: normal?.clone?.() ?? null
      });
      results.push(result);
      bestDistance = Math.min(bestDistance, result.distance);
      this.#incrementalDiagnostics.spatialExactRaycasts += 1;
    };

    const probe = this.#pickingRaycastProbe;
    probe.matrixAutoUpdate = false;
    probe.visible = true;

    for (const candidate of candidates) {
      if (firstOnly && candidate.distance > bestDistance) break;
      const objectId = String(candidate.id);
      const family = this.#familyVisuals.get(objectId);
      if (family) {
        let familyHit = null;
        for (const batchKey of family.batchKeys) {
          const batch = this.#batchManager.getBatch(batchKey);
          if (!batch) continue;
          this.#incrementalDiagnostics.raycastBatchVisits += 1;
          for (const hit of this.raycaster.intersectObject(batch.mesh, false)) {
            if (this.#batchManager.objectFromHit(hit) !== objectId) continue;
            if (!familyHit || hit.distance < familyHit.distance) familyHit = hit;
            break;
          }
        }
        if (familyHit) pushHit(objectId, familyHit);
        continue;
      }

      const heterogeneousResources =
        this.#heterogeneousBatchManager.resourcesForOwner(objectId);
      if (heterogeneousResources.length) {
        const batchKeys = new Set(heterogeneousResources
          .map(resourceId =>
            this.#heterogeneousBatchManager.locationOf(resourceId)?.batchKey
          )
          .filter(Boolean));
        let heterogeneousHit = null;
        for (const batchKey of batchKeys) {
          const batch = this.#heterogeneousBatchManager.getBatch(batchKey);
          if (!batch) continue;
          this.#incrementalDiagnostics.raycastBatchVisits += 1;
          for (const hit of this.raycaster.intersectObject(batch.mesh, false)) {
            if (this.#heterogeneousBatchManager.objectFromHit(hit) !== objectId) {
              continue;
            }
            if (!heterogeneousHit || hit.distance < heterogeneousHit.distance) {
              heterogeneousHit = hit;
            }
            break;
          }
        }
        if (heterogeneousHit) pushHit(objectId, heterogeneousHit);
        continue;
      }

      const location = this.#batchManager.locationOf(objectId);
      const batch = location
        ? this.#batchManager.getBatch(location.batchKey)
        : null;
      const proxy = this.#meshes.get(objectId);
      if (!batch?.geometry || !proxy) continue;
      proxy.updateMatrixWorld(true);
      probe.geometry = batch.geometry;
      probe.material = batch.material;
      probe.matrixWorld.copy(this.#batchMatrixForProxy(proxy));
      const hit = this.raycaster.intersectObject(probe, false)[0] ?? null;
      if (hit) pushHit(objectId, hit);
    }

    results.sort((left, right) => left.distance - right.distance);
    return results;
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
    if (!this.#hierarchy.has(objectId)) {
      const rootProxy = this.#meshes.get(String(objectId));
      return rootProxy
        ? this.#worldBoundsForProxy(rootProxy, target)
        : target;
    }

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
    const selectionGestureActive =
      mode === "select" && Boolean(this.editorState.areaSelection);
    if (mode === "navigate" && this.#editorToolNavigationToken) {
      this.#toolGestureNavigation.release(this.#editorToolNavigationToken);
      this.#editorToolNavigationToken = null;
    } else if (mode !== "navigate" && !this.#editorToolNavigationToken) {
      this.#editorToolNavigationToken =
        this.#toolGestureNavigation.acquire(`editor:${mode}`);
    }
    this.#interactionMode=mode;
    this.#selectionOperation=this.editorState.selectionOperation??"replace";
    if (this.#boundsScale) {
      this.transform.enabled = false;
      this.transform.getHelper().visible = false;
      this.orbit.enabled = false;
      return;
    }

    if (this.#meshEdit) {
      const enabled = ["translate", "rotate", "scale"].includes(mode) &&
        this.#meshEdit.selectedIndices.size > 0;
      this.transform.enabled = enabled;
      this.transform.getHelper().visible = enabled;
      if (enabled) {
        this.transform.setMode(this.editorState.tool.transformMode ?? mode);
        this.transform.setSpace("local");
        const axes = meshConstraintAxes(this.#meshEdit.constraint);
        this.transform.showX = axes.x;
        this.transform.showY = axes.y;
        this.transform.showZ = axes.z;
      }
      this.orbit.enabled = this.#resolveEditorOrbitEnabled({
        selectionGestureActive
      });
      return;
    }

    this.transform.showX = this.#objectTransformAxes.x;
    this.transform.showY = this.#objectTransformAxes.y;
    this.transform.showZ = this.#objectTransformAxes.z;
    const enabled=this.editorState.pivot.editing||["translate","rotate","scale"].includes(mode);
    this.transform.enabled=enabled;
    this.transform.getHelper().visible=enabled;
    if(this.editorState.pivot.editing){this.transform.setMode("translate");this.transform.setSpace("world")}
    else if(enabled){
      this.transform.setMode(this.editorState.tool.transformMode??mode);
      this.transform.setSpace(
        ["viewer", "custom-plane"].includes(this.#objectTransformFrame.mode)
          ? "local"
          : this.#objectTransformFrame.mode
      );
    }
    this.orbit.enabled = this.#resolveEditorOrbitEnabled({
      selectionGestureActive
    });
  }

  #resolveEditorOrbitEnabled({
    transformDragging = this.transform.dragging,
    selectionGestureActive = (
      this.#interactionMode === "select" &&
      Boolean(this.editorState.areaSelection)
    )
  } = {}) {
    return resolveEditorOrbitEnabled({
      transformDragging,
      boundsScaleActive: Boolean(this.#boundsScale),
      toolGestureNavigationActive: this.#toolGestureNavigation.active,
      selectionGestureActive
    });
  }

  #beginSession() {
    if (this.#session) return;

    if (this.#meshEdit) {
      if (!this.#meshEdit.selectedIndices.size) return;
      this.#meshEdit.onTransformStart?.();
      this.transformAnchor.updateMatrixWorld(true);
      this.#session = {
        kind: "mesh",
        initialAnchor: {
          position: this.transformAnchor.position.clone(),
          quaternion: this.transformAnchor.quaternion.clone(),
          scale: this.transformAnchor.scale.clone()
        },
        mode: this.transform.getMode(),
        initialPositions: this.#meshEdit.descriptor.positions.map(
          point => [...point]
        ),
        workingPositions: this.#meshEdit.descriptor.positions.map(
          point => [...point]
        ),
        influenceField: this.#snapshotMeshInfluenceField(),
        scalePivotWorld: this.#boundsScale?.fixedWorld?.toArray() ?? null
      };
      this.#transformLifecycleDiagnostics.sessionsStarted += 1;
      return;
    }

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
    const previewRoots = new Map();
    for (const member of members) {
      const mesh = this.#meshes.get(member.objectId);
      if (!mesh) continue;
      mesh.updateMatrixWorld(true);
      objects.set(member.objectId, { matrixWorld: mesh.matrixWorld.clone() });

    }

    const selectedIds = members.map(member => String(member.objectId));
    const hierarchyPreviewIds = projectedSelectionIdsWithFallback(
      this.#hierarchy,
      selectedIds
    );
    const previewIds = [...new Set([
      ...hierarchyPreviewIds,
      ...selectedIds.flatMap(id => this.#replicaRenderIndex.members(id))
    ])];
    for (const rootId of selectedIds) {
      const memberIds = [...new Set([
        ...projectedSelectionIdsWithFallback(this.#hierarchy, [rootId]),
        ...this.#replicaRenderIndex.members(rootId)
      ])];
      for (const projectedId of memberIds) {
        if (!previewRoots.has(projectedId)) previewRoots.set(projectedId, rootId);
      }
    }
    for (const previewId of previewIds) {
      const previewMesh=this.#meshes.get(previewId);
      if (!previewMesh) continue;
      previewMesh.updateMatrixWorld(true);
      previewObjects.set(previewId,{
        matrixWorld:previewMesh.matrixWorld.clone()
      });
    }

    /*
     * A projeção incremental pode criar o proxy visual antes de a
     * reconstrução ociosa da hierarquia registrar o novo objeto. Nesse
     * intervalo, a própria raiz selecionada é um alvo de preview válido.
     */
    if (!previewObjects.size) {
      for (const [objectId, snapshot] of objects) {
        previewObjects.set(objectId, {
          matrixWorld: snapshot.matrixWorld.clone()
        });
        previewRoots.set(objectId, objectId);
      }
    }

    if (!objects.size || !previewObjects.size) {
      const diagnostics=this.#transformLifecycleDiagnostics;
      diagnostics.lastError={
        code:"TRANSFORM_TARGET_UNAVAILABLE",
        message:"A seleção ainda não possui proxy transformável."
      };
      this.#rebuildAnchor();
      return;
    }

    this.#session = {
      kind:"selection",
      previewId: createPreviewId(),
      initialAnchor,
      mode: this.transform.getMode(),
      scaleAxes: this.#boundsScale?.axes ?? this.#activeScaleAxes(),
      objects,
      previewObjects,
      previewRoots
    };
    this.#fastTransformOverlay.begin(
      this.#session.previewId,
      [...previewObjects].map(([id, snapshot]) => ({
        id,
        worldMatrix: snapshot.matrixWorld.toArray()
      }))
    );
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

    if (this.#session.kind === "mesh") {
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
      const rawDelta = current
        .clone()
        .multiply(initial.clone().invert());
      const constrainedDelta = constrainWorldDeltaMatrix({
        type: this.#session.mode,
        deltaWorldMatrix: rawDelta.toArray(),
        pivotWorld: this.#session.initialAnchor.position.toArray(),
        frameQuaternion: this.#meshEdit.frameQuaternion,
        constraint: this.#meshEdit.constraint
      });
      const influenceField = this.#session.influenceField;
      let positions = transformLocalPositionsWithInfluenceInto({
        sourcePositions: this.#session.initialPositions,
        targetPositions: this.#session.workingPositions,
        affectedIndices: influenceField.affectedIndices,
        weights: influenceField.weights,
        objectWorldMatrix: this.#meshEdit.objectWorldMatrix,
        deltaWorldMatrix: constrainedDelta,
        type: this.#session.mode,
        pivotWorld: influenceField.pivotWorld,
        frameQuaternion: this.#meshEdit.frameQuaternion
      });
      if (
        this.#session.mode === "translate" &&
        this.#meshEdit.snap.enabled
      ) {
        positions = this.#applyMeshSnap(positions, influenceField);
      } else {
        this.#clearMeshSnapOverlay();
      }
      this.#setMeshEditPositions(positions, {
        finalize: false,
        changedIndices: influenceField.affectedIndices
      });
      this.#meshEdit.onTransformPreview?.();
      const elapsed = performance.now() - startedAt;
      const diagnostics = this.#transformLifecycleDiagnostics;
      diagnostics.previews += 1;
      diagnostics.lastPreviewMs = elapsed;
      diagnostics.maxPreviewMs = Math.max(diagnostics.maxPreviewMs, elapsed);
      return;
    }

    if (this.#session.kind === "pivot") {
      this.#storeEditedPivot(this.transformAnchor.position);
      return;
    }

    if (this.#session.mode === "scale") {
      this.#previewSelectionScaleWithoutShear();
    } else {
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

      for (const [objectId, snapshot] of this.#session.objects) {
        const mesh = this.#meshes.get(objectId);
        if (!mesh) continue;
        const result = delta.clone().multiply(snapshot.matrixWorld);
        this.#fastTransformOverlay.setWorldMatrix(
          this.#session.previewId, objectId, result.toArray()
        );
        applyProjectedWorldMatrix(mesh, result.toArray());
        if (!mesh.userData.logicalOnly) this.#updateBatchMatrix(objectId, mesh);
      }

      for (const [objectId, snapshot] of this.#session.previewObjects) {
        if (this.#session.objects.has(objectId)) continue;
        const mesh = this.#meshes.get(objectId);
        if (!mesh) continue;
        const result = delta.clone().multiply(snapshot.matrixWorld);
        applyProjectedWorldMatrix(mesh,result.toArray());
        this.#updateBatchMatrix(objectId, mesh);
      }
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
      if (session.kind === "mesh") {
        let positions = this.#meshEdit.descriptor.positions.map(
          point => [...point]
        );
        if (
          session.mode === "translate" &&
          this.#transformConfig.gridLock &&
          this.#transformConfig.translationSnap
        ) {
          const pivotWorld = selectedVertexPivotWorld({
            positions,
            selectedIndices: this.#meshEdit.selectedIndices,
            objectWorldMatrix: this.#meshEdit.objectWorldMatrix
          });
          if (pivotWorld) {
            const targetWorld = snapWorldPointToFrameGrid({
              pointWorld: pivotWorld,
              frameQuaternion: this.#meshEdit.frameQuaternion,
              step: this.#transformConfig.translationSnap
            });
            const correction = new THREE.Vector3()
              .fromArray(targetWorld)
              .sub(new THREE.Vector3().fromArray(pivotWorld));
            const field = session.influenceField;
            positions = transformLocalPositionsWithInfluenceInto({
              sourcePositions: positions,
              targetPositions: positions,
              affectedIndices: field.affectedIndices,
              weights: field.weights,
              objectWorldMatrix: this.#meshEdit.objectWorldMatrix,
              deltaWorldMatrix: new THREE.Matrix4()
                .makeTranslation(correction.x, correction.y, correction.z)
                .toArray(),
              type: "translate",
              pivotWorld: field.pivotWorld,
              frameQuaternion: this.#meshEdit.frameQuaternion
            });
            this.#setMeshEditPositions(positions, {
              finalize: false,
              changedIndices: field.affectedIndices
            });
          }
        }
        this.#finalizeMeshEditGeometry();
        this.#meshEdit.onTransformCommit?.(positions);
        this.#refreshMeshEditInfluence();
        this.#transformLifecycleDiagnostics.commits += 1;
        this.transformAnchor.quaternion.fromArray(
          this.#meshEdit.frameQuaternion
        );
        this.transformAnchor.scale.set(1, 1, 1);
        this.#rebuildAnchor();
        return;
      }

      if (session.kind === "pivot") {
        this.#storeEditedPivot(this.transformAnchor.position);
        this.#transformLifecycleDiagnostics.commits += 1;
        return;
      }

      const transforms = [];
      for (const [objectId] of session.objects) {
        const mesh = this.#meshes.get(objectId);
        if (!mesh) continue;
        const overlayMatrix = this.#fastTransformOverlay.worldMatrix(objectId);
        transforms.push({
          id: objectId,
          worldMatrix: overlayMatrix ? [...overlayMatrix] : mesh.matrix.toArray()
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
      this.#fastTransformOverlay.clearOwner(session.previewId);
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
    for (const [objectId,snapshot] of session.objects ?? []) {
      const mesh=this.#meshes.get(objectId);
      if (!mesh) continue;
      applyProjectedWorldMatrix(mesh,snapshot.matrixWorld.toArray());
      if (!mesh.userData.logicalOnly) this.#updateBatchMatrix(objectId,mesh);
    }
    for (const [objectId,snapshot] of session.previewObjects) {
      if (session.objects?.has(objectId)) continue;
      const mesh=this.#meshes.get(objectId);
      if (!mesh) continue;
      applyProjectedWorldMatrix(mesh,snapshot.matrixWorld.toArray());
      this.#updateBatchMatrix(objectId,mesh);
    }
    this.#flushBatchBounds();
    this.#updateSelectionAppearance();
    this.#updateVertexMarkers();
    if (session?.previewId) this.#fastTransformOverlay.clearOwner(session.previewId);
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

    if (policy === "anchor") {
      const activeId = this.#selectionSnapshot?.activeMember?.objectId;
      const activePosition = this.#selectionReferencePosition(activeId) ?? references.at(-1);
      return activePosition.clone();
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
    if (!objectId) return null;
    const id = String(objectId);
    const animated = this.#animationPivotOverrides.get(id);
    if (animated) return new THREE.Vector3().fromArray(animated);

    const object = this.#objectsById.get(id) ?? null;
    const proxy = this.#meshes.get(id) ?? null;
    const defaultPolicy = object && (
      object.kind === "instance-family" ||
      object.kind === "stroke-bundle" ||
      object.geometry?.type === "stroke-bundle"
    ) ? "bounds-center" : "pivot";
    const policy = String(
      object?.selectionAnchorPolicy ??
      object?.geometry?.selectionAnchorPolicy ??
      defaultPolicy
    );

    if (policy === "bounds-center") {
      const bounds = this.#worldBoundsForObjectId(id, new THREE.Box3());
      if (!bounds.isEmpty()) return bounds.getCenter(new THREE.Vector3());
    }

    if (policy === "custom" && proxy) {
      const local = object?.selectionAnchorLocal ??
        object?.geometry?.selectionAnchorLocal;
      if (Array.isArray(local) && local.length === 3) {
        proxy.updateMatrixWorld(true);
        return new THREE.Vector3().fromArray(local).applyMatrix4(
          proxy.matrixWorld
        );
      }
    }

    if (policy === "origin" && proxy) {
      proxy.updateMatrixWorld(true);
      return proxy.getWorldPosition(new THREE.Vector3());
    }

    if (!this.#hierarchy.has(id)) {
      if (!proxy) return null;
      proxy.updateMatrixWorld(true);
      return proxy.getWorldPosition(new THREE.Vector3());
    }
    return new THREE.Vector3().fromArray(
      selectionReferenceWorldPosition(this.#hierarchy,id)
    );
  }

  #rebuildAnchor() {
    if (this.#session) return;

    if (this.#meshEdit) {
      const pivot = selectedVertexPivotWorld({
        positions: this.#meshEdit.descriptor.positions,
        selectedIndices: this.#meshEdit.selectedIndices,
        objectWorldMatrix: this.#meshEdit.objectWorldMatrix
      });
      const enabled = pivot &&
        ["translate", "rotate", "scale"].includes(this.editorState.tool.mode);
      if (!enabled) {
        this.transform.detach();
        return;
      }
      this.transformAnchor.position.fromArray(pivot);
      this.transformAnchor.quaternion.fromArray(
        this.#meshEdit.frameQuaternion
      );
      this.transformAnchor.scale.set(1, 1, 1);
      this.transform.attach(this.transformAnchor);
      return;
    }

    const pivot = this.#calculatePivot();
    if (!pivot) { this.transform.detach(); return; }
    if (!this.editorState.pivot.editing && !["translate","rotate","scale"].includes(this.editorState.tool.mode)) {
      this.transform.detach(); return;
    }

    this.transformAnchor.position.copy(pivot);
    this.transformAnchor.scale.set(1, 1, 1);

    const activeId = this.#selectionSnapshot?.activeMember?.objectId;
    const activeMesh = this.#meshes.get(activeId);

    const customFrame = ["viewer", "custom-plane"].includes(
      this.#objectTransformFrame.mode
    );
    const alignToActive = this.#objectTransformFrame.mode === "local" ||
      this.editorState.pivot.policy === "anchor" ||
      this.editorState.tool.mode === "scale";

    if (!this.editorState.pivot.editing && customFrame) {
      this.transformAnchor.quaternion.fromArray(
        this.#objectTransformFrame.quaternion
      );
    } else if (!this.editorState.pivot.editing && alignToActive && activeMesh) {
      activeMesh.updateMatrixWorld(true);
      activeMesh.matrixWorld.decompose(
        new THREE.Vector3(),
        this.transformAnchor.quaternion,
        new THREE.Vector3()
      );
    } else {
      this.transformAnchor.quaternion.identity();
    }

    this.transform.attach(this.transformAnchor);
  }

  #activeScaleAxes() {
    return this.#meshEdit
      ? meshConstraintAxes(this.#meshEdit.constraint)
      : {
          x: Boolean(this.#objectTransformAxes.x),
          y: Boolean(this.#objectTransformAxes.y),
          z: Boolean(this.#objectTransformAxes.z)
        };
  }

  #localBoundsScaleFrame() {
    if (this.editorState.tool.mode !== "scale") return null;
    const members = this.#selectionSnapshot?.members ?? [];
    if (!this.#meshEdit && !members.length) return null;
    const frameOrigin = this.#boundsScale?.fixedWorld?.clone() ??
      this.transformAnchor.position.clone();
    const frameQuaternion = this.#boundsScale?.frameQuaternion?.clone() ??
      this.transformAnchor.quaternion.clone().normalize();
    const inverseFrame = frameQuaternion.clone().invert();
    const bounds = new THREE.Box3().makeEmpty();

    if (this.#meshEdit) {
      const worldMatrix = new THREE.Matrix4().fromArray(
        this.#meshEdit.objectWorldMatrix
      );
      for (const index of this.#meshEdit.selectedIndices) {
        const point = this.#meshEdit.descriptor.positions[index];
        if (!point) continue;
        bounds.expandByPoint(
          new THREE.Vector3()
            .fromArray(point)
            .applyMatrix4(worldMatrix)
            .sub(frameOrigin)
            .applyQuaternion(inverseFrame)
        );
      }
    } else {
      const selectedIds = members.map(member => String(member.objectId));
      const proxyIds = projectedSelectionIdsWithFallback(
        this.#hierarchy,
        selectedIds
      );
      for (const objectId of proxyIds) {
        const proxy = this.#meshes.get(objectId);
        if (!proxy) continue;
        const localBounds = proxy.userData.localBounds ?? (() => {
          const size = proxy.userData.size ?? [1, 1, 1];
          return {
            min: size.map(value => -Number(value) * 0.5),
            max: size.map(value => Number(value) * 0.5)
          };
        })();
        proxy.updateMatrixWorld(true);
        for (const z of [localBounds.min[2], localBounds.max[2]]) {
          for (const y of [localBounds.min[1], localBounds.max[1]]) {
            for (const x of [localBounds.min[0], localBounds.max[0]]) {
              bounds.expandByPoint(
                new THREE.Vector3(x, y, z)
                  .applyMatrix4(proxy.matrixWorld)
                  .sub(frameOrigin)
                  .applyQuaternion(inverseFrame)
              );
            }
          }
        }
      }
    }
    if (bounds.isEmpty()) return null;
    const handleSet = createLocalBoundsScaleHandleSet({
      min: bounds.min.toArray(),
      max: bounds.max.toArray(),
      axes: this.#boundsScale?.axes ?? this.#activeScaleAxes()
    });
    if (!handleSet.handles.length) return null;
    const centerWorld = bounds.getCenter(new THREE.Vector3())
      .applyQuaternion(frameQuaternion)
      .add(frameOrigin);
    const handles = handleSet.handles.map(handle => Object.freeze({
      ...handle,
      world: new THREE.Vector3()
        .fromArray(handle.point)
        .applyQuaternion(frameQuaternion)
        .add(frameOrigin)
    }));
    return Object.freeze({
      frameOrigin,
      frameQuaternion,
      centerWorld,
      axes: handleSet.axes,
      handles: Object.freeze(handles)
    });
  }

  #tryBeginBoundsScale(event) {
    if (
      this.#session ||
      this.#boundsScale ||
      this.editorState.pivot.editing ||
      this.editorState.tool.mode !== "scale" ||
      event.isPrimary === false ||
      (event.pointerType === "mouse" && event.button !== 0)
    ) return false;
    const frame = this.#localBoundsScaleFrame();
    if (!frame) return false;
    const rect = this.canvas.getBoundingClientRect();
    const radius = event.pointerType === "touch" ? 32 : 16;
    const centerScreen = projectWorldToScreen(frame.centerWorld, this.camera, rect);
    const useCenter = Boolean(this.#transformConfig.scaleFromCenter) !==
      Boolean(event.altKey);
    const candidates = frame.handles.map(handle => {
      const opposite = frame.handles[handle.oppositeIndex];
      const screen = projectWorldToScreen(handle.world, this.camera, rect);
      const oppositeScreen = opposite
        ? projectWorldToScreen(opposite.world, this.camera, rect)
        : null;
      const pivotWorld = useCenter ? frame.centerWorld : opposite?.world;
      const pivotScreen = useCenter ? centerScreen : oppositeScreen;
      const outwardWorld = new THREE.Vector3(...handle.signs)
        .applyQuaternion(frame.frameQuaternion)
        .normalize();
      const outwardScreen = projectWorldToScreen(
        handle.world.clone().add(outwardWorld),
        this.camera,
        rect
      );
      return {
        handle,
        opposite,
        screen,
        pivotWorld,
        pivotScreen,
        fallbackDirection: [
          outwardScreen.x - screen.x,
          outwardScreen.y - screen.y
        ],
        distance: Math.hypot(event.clientX - screen.x, event.clientY - screen.y)
      };
    }).filter(candidate =>
      candidate.opposite &&
      candidate.pivotWorld &&
      candidate.screen.visible &&
      candidate.pivotScreen?.visible &&
      candidate.distance <= radius
    ).sort((left, right) =>
      left.distance - right.distance || left.screen.z - right.screen.z
    );
    if (!candidates.length) return false;
    const nearestDistance = candidates[0].distance;
    const overlapping = candidates.filter(candidate =>
      candidate.distance <= nearestDistance + 4
    );
    const pickKey = overlapping.map(candidate => candidate.handle.index).join(",");
    const now = performance.now();
    const previousPick = this.#boundsScalePickCycle;
    const samePickCluster = Boolean(
      previousPick &&
      previousPick.key === pickKey &&
      now - previousPick.time <= 1200 &&
      Math.hypot(event.clientX - previousPick.x, event.clientY - previousPick.y) <= 10
    );
    const pickIndex = samePickCluster
      ? (previousPick.index + 1) % overlapping.length
      : 0;
    const hit = overlapping[pickIndex];
    this.#boundsScalePickCycle = {
      key: pickKey,
      index: pickIndex,
      x: event.clientX,
      y: event.clientY,
      time: now
    };
    const projectedSpan = Math.max(
      32,
      ...frame.handles.map(handle => {
        const point = projectWorldToScreen(handle.world, this.camera, rect);
        return Math.hypot(point.x - centerScreen.x, point.y - centerScreen.y);
      })
    );
    this.#boundsScale = {
      pointerId: event.pointerId,
      frameQuaternion: frame.frameQuaternion.clone(),
      axes: frame.axes,
      fixedWorld: hit.pivotWorld.clone(),
      fixedScreen: [hit.pivotScreen.x, hit.pivotScreen.y],
      initialScreen: [hit.screen.x, hit.screen.y],
      fallbackDirection: hit.fallbackDirection,
      fallbackLength: projectedSpan,
      fromCenter: useCenter
    };
    this.transformAnchor.position.copy(hit.pivotWorld);
    this.transformAnchor.quaternion.copy(frame.frameQuaternion);
    this.transformAnchor.scale.set(1, 1, 1);
    this.transformAnchor.updateMatrixWorld(true);
    this.transform.enabled = false;
    this.transform.getHelper().visible = false;
    this.orbit.enabled = false;
    this.canvas.setPointerCapture?.(event.pointerId);
    try {
      this.#beginSession();
    } catch (error) {
      if (this.canvas.hasPointerCapture?.(event.pointerId)) {
        this.canvas.releasePointerCapture(event.pointerId);
      }
      this.#boundsScale = null;
      this.#configureTransformForEditor();
      this.#rebuildAnchor();
      this.#updateVertexMarkers();
      throw error;
    }
    if (!this.#session) {
      if (this.canvas.hasPointerCapture?.(event.pointerId)) {
        this.canvas.releasePointerCapture(event.pointerId);
      }
      this.#boundsScale = null;
      this.#configureTransformForEditor();
      this.#rebuildAnchor();
      this.#updateVertexMarkers();
      return false;
    }
    this.#inputDiagnostics.gizmoHits += 1;
    this.invalidateRender("bounds-scale-begin");
    event.preventDefault();
    event.stopImmediatePropagation();
    return true;
  }

  #updateBoundsScale(event) {
    const state = this.#boundsScale;
    if (!state || state.pointerId !== event.pointerId || !this.#session) return false;
    const factor = proportionalScaleFactor2D({
      fixed: state.fixedScreen,
      initial: state.initialScreen,
      current: [event.clientX, event.clientY],
      snap: this.#transformConfig.scaleSnap,
      fallbackDirection: state.fallbackDirection,
      fallbackLength: state.fallbackLength
    });
    this.transformAnchor.scale.fromArray(scaleFactorsForAxes(factor, state.axes));
    this.transformAnchor.updateMatrixWorld(true);
    this.#previewSession();
    this.invalidateRender("bounds-scale-preview");
    event.preventDefault();
    event.stopImmediatePropagation();
    return true;
  }

  #finishBoundsScale(event) {
    const state = this.#boundsScale;
    if (!state || state.pointerId !== event.pointerId) return false;
    this.#boundsScale = null;
    if (this.canvas.hasPointerCapture?.(event.pointerId)) {
      this.canvas.releasePointerCapture(event.pointerId);
    }
    if (this.#session) this.#commitSession();
    this.#configureTransformForEditor();
    this.#rebuildAnchor();
    this.#updateVertexMarkers();
    this.invalidateRender("bounds-scale-end");
    event.preventDefault();
    event.stopImmediatePropagation();
    return true;
  }

  #previewSelectionScaleWithoutShear() {
    const session = this.#session;
    if (!session || session.kind !== "selection") return;
    const rawFactors = this.transformAnchor.scale.clone().divide(
      session.initialAnchor.scale
    );
    const axes = session.scaleAxes ?? { x: true, y: true, z: true };
    const factors = [
      axes.x ? rawFactors.x : 1,
      axes.y ? rawFactors.y : 1,
      axes.z ? rawFactors.z : 1
    ];
    const pivotWorld = session.initialAnchor.position.toArray();
    const frameQuaternion = session.initialAnchor.quaternion.toArray();
    const rootDeltas = new Map();
    for (const [objectId, snapshot] of session.objects) {
      const next = new THREE.Matrix4().fromArray(
        scaleWorldTrsWithoutShear({
          matrixWorld: snapshot.matrixWorld.toArray(),
          pivotWorld,
          frameQuaternion,
          factors
        })
      );
      this.#fastTransformOverlay.setWorldMatrix(
        session.previewId,
        objectId,
        next.toArray()
      );
      rootDeltas.set(
        objectId,
        next.clone().multiply(snapshot.matrixWorld.clone().invert())
      );
      const rootMesh = this.#meshes.get(objectId);
      if (rootMesh) {
        applyProjectedWorldMatrix(rootMesh, next.toArray());
        if (!rootMesh.userData.logicalOnly) this.#updateBatchMatrix(objectId, rootMesh);
      }
    }
    for (const [objectId, snapshot] of session.previewObjects) {
      if (session.objects.has(objectId)) continue;
      const mesh = this.#meshes.get(objectId);
      if (!mesh) continue;
      const rootId = session.previewRoots.get(objectId) ?? objectId;
      const delta = rootDeltas.get(rootId);
      if (!delta) continue;
      const result = delta.clone().multiply(snapshot.matrixWorld);
      applyProjectedWorldMatrix(mesh, result.toArray());
      this.#updateBatchMatrix(objectId, mesh);
    }
  }

  #updateVertexMarkers() {
    const scaleFrame = this.#localBoundsScaleFrame();
    if (scaleFrame) {
      const vertices = scaleFrame.handles.flatMap(handle => handle.world.toArray());
      this.#vertexMarkers.geometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(vertices, 3)
      );
      const attribute = this.#vertexMarkers.geometry.getAttribute("position");
      attribute.needsUpdate = true;
      this.#vertexMarkers.geometry.computeBoundingSphere();
      this.#vertexMarkers.material.size = Math.max(10, this.#transformConfig.vertexSize);
      this.#vertexMarkers.material.needsUpdate = true;
      this.#vertexMarkers.visible = true;
      return;
    }
    if (this.#meshEdit) {
      this.#vertexMarkers.visible = false;
      return;
    }
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
    this.#vertexMarkers.material.size = this.#transformConfig.vertexSize;
    this.#vertexMarkers.material.needsUpdate = true;
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
    if (this.#meshEdit) this.#updateMeshEditMarkerColors();

    this.#updateVertexMarkers();

    return this.getTransformConfig();
  }

  getTransformConfig() {
    return structuredClone(this.#transformConfig);
  }

  getReplicaDiagnostics() {
    return this.#replicaRenderIndex.status();
  }

  getTransformDiagnostics() {
    return {
      config: this.getTransformConfig(),
      mode: this.transform.mode,
      space: this.transform.space,
      axis: this.transform.axis,
      dragging: this.transform.dragging,
      pivotPolicy: this.editorState.pivot.policy,
      transformOverlay: this.#fastTransformOverlay.status(),
      replicaRenderIndex: this.#replicaRenderIndex.status(),
      pivotPosition: this.getSelectionPivotPosition(),
      selection: this.#selectionSnapshot,
      selectionAppearance: this.#selectionOutlines.diagnostics(),
      lifecycle:structuredClone(this.#transformLifecycleDiagnostics)
    };
  }

  getObjectReferencePosition(objectId) {
    return this.#selectionReferencePosition(String(objectId ?? ""))?.toArray() ?? null;
  }

  getSelectionPivotPosition() {
    if (this.#meshEdit) {
      return selectedVertexPivotWorld({
        positions: this.#meshEdit.descriptor.positions,
        selectedIndices: this.#meshEdit.selectedIndices,
        objectWorldMatrix: this.#meshEdit.objectWorldMatrix
      });
    }
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
        diagnostics.rendererInstanceLimit,
      screenGestures: this.getScreenSelectionDiagnostics()
    });
  }

  #cloneBatchMaterial(batch, objectId) {
    const material = batch.material.clone();
    const instanceColor = batch.colorAt(objectId);
    if (instanceColor && material.color) {
      material.color.multiply(instanceColor);
    }
    return material;
  }

  #applyMeshSnap(positions, influenceField = null) {
    const edit = this.#requireMeshEdit();
    const pointer = this.#lastPointer;
    if (!pointer || !edit.snap.enabled) {
      this.#clearMeshSnapOverlay();
      return positions;
    }
    const rect = this.canvas.getBoundingClientRect();
    const anchor = this.#meshSnapAnchorWorld(positions, pointer, rect);
    if (!anchor) {
      this.#clearMeshSnapOverlay();
      return positions;
    }
    const candidates = this.#meshSnapCandidates({
      positions,
      anchorWorld: anchor.point,
      pointer,
      rect
    });
    if (!candidates.length) {
      edit.lastSnapCandidate = null;
      this.#clearMeshSnapOverlay();
      return positions;
    }
    candidates.sort((left, right) => left.score - right.score);
    let candidate = candidates[0];
    const previous = edit.lastSnapCandidate;
    if (previous) {
      const previousCurrent = candidates.find(item => item.key === previous.key);
      if (
        previousCurrent &&
        previousCurrent.screenDistance <= edit.snap.tolerancePixels * 1.35 &&
        candidate.score >= previousCurrent.score * 0.8
      ) candidate = previousCurrent;
    }
    const projected = projectWorldDeltaToConstraint({
      deltaWorld: new THREE.Vector3()
        .fromArray(candidate.pointWorld)
        .sub(new THREE.Vector3().fromArray(anchor.point))
        .toArray(),
      frameQuaternion: edit.frameQuaternion,
      constraint: edit.constraint
    });
    const residualPixels = worldVectorScreenLength({
      camera: this.camera,
      rect,
      originWorld: anchor.point,
      vectorWorld: projected.residualWorld
    });
    if (residualPixels > edit.snap.tolerancePixels * 1.35) {
      edit.lastSnapCandidate = null;
      this.#clearMeshSnapOverlay();
      return positions;
    }
    const field = influenceField ?? this.#snapshotMeshInfluenceField();
    const snapped = transformLocalPositionsWithInfluenceInto({
      sourcePositions: positions,
      targetPositions: positions,
      affectedIndices: field.affectedIndices,
      weights: field.weights,
      objectWorldMatrix: edit.objectWorldMatrix,
      deltaWorldMatrix: new THREE.Matrix4()
        .makeTranslation(...projected.deltaWorld)
        .toArray(),
      type: "translate",
      pivotWorld: field.pivotWorld,
      frameQuaternion: edit.frameQuaternion
    });
    edit.lastSnapCandidate = {
      ...candidate,
      residualPixels
    };
    this.#showMeshSnapOverlay(anchor.point, candidate.pointWorld, candidate.type);
    return snapped;
  }

  #meshSnapAnchorWorld(positions, pointer, rect) {
    const edit = this.#requireMeshEdit();
    edit.group.updateMatrixWorld(true);
    const worldMatrix = edit.group.matrixWorld;
    if (
      edit.snap.anchor === "active" &&
      Number.isInteger(edit.activeVertex) &&
      edit.selectedIndices.has(edit.activeVertex)
    ) {
      return {
        index: edit.activeVertex,
        point: new THREE.Vector3()
          .fromArray(positions[edit.activeVertex])
          .applyMatrix4(worldMatrix)
          .toArray()
      };
    }
    if (edit.snap.anchor === "nearest") {
      let best = null;
      for (const index of edit.selectedIndices) {
        const point = new THREE.Vector3()
          .fromArray(positions[index])
          .applyMatrix4(worldMatrix);
        const screen = projectWorldToScreen(point, this.camera, rect);
        if (!screen.visible) continue;
        const distance = Math.hypot(pointer.x - screen.x, pointer.y - screen.y);
        if (!best || distance < best.distance) {
          best = { index, point: point.toArray(), distance };
        }
      }
      if (best) return best;
    }
    const point = selectedVertexPivotWorld({
      positions,
      selectedIndices: edit.selectedIndices,
      objectWorldMatrix: edit.objectWorldMatrix
    });
    return point ? { index: null, point } : null;
  }

  #meshSnapCandidates({ positions, anchorWorld, pointer, rect }) {
    const edit = this.#requireMeshEdit();
    const candidates = [];
    const tolerance = edit.snap.tolerancePixels;
    const enabled = type => edit.snap.modes?.includes(type) ??
      (edit.snap.mode === "auto" || edit.snap.mode === type);
    const add = candidate => {
      const scored = this.#scoreMeshSnapCandidate({
        ...candidate,
        anchorWorld,
        rect,
        tolerance
      });
      if (scored.screenDistance <= tolerance && scored.score <= 3) {
        candidates.push(scored);
      }
    };

    if (edit.snap.scope === "active" || edit.snap.self) {
      edit.group.updateMatrixWorld(true);
      const matrix = edit.group.matrixWorld;
      if (enabled("vertex")) {
        positions.forEach((point, index) => {
          if (edit.selectedIndices.has(index)) return;
          const world = new THREE.Vector3().fromArray(point).applyMatrix4(matrix);
          const screen = projectWorldToScreen(world, this.camera, rect);
          if (!screen.visible) return;
          const screenDistance = Math.hypot(pointer.x - screen.x, pointer.y - screen.y);
          if (screenDistance > tolerance) return;
          add({
            type: "vertex",
            key: `active:vertex:${index}`,
            objectId: edit.objectId,
            pointWorld: world.toArray(),
            screenDistance
          });
        });
      }
      if (enabled("edge")) {
        for (const edge of edit.topology.edges) {
          if (edit.selectedIndices.has(edge.a) && edit.selectedIndices.has(edge.b)) continue;
          const start = new THREE.Vector3().fromArray(positions[edge.a]).applyMatrix4(matrix);
          const end = new THREE.Vector3().fromArray(positions[edge.b]).applyMatrix4(matrix);
          const screenStart = projectWorldToScreen(start, this.camera, rect);
          const screenEnd = projectWorldToScreen(end, this.camera, rect);
          if (!screenStart.visible && !screenEnd.visible) continue;
          const closest = closestScreenSegmentPoint(pointer, screenStart, screenEnd);
          const parameter = this.#meshSnapEdgeParameter({
            start,
            end,
            anchorWorld,
            fallback: closest.parameter
          });
          const target = start.clone().lerp(end, parameter);
          const targetScreen = projectWorldToScreen(target, this.camera, rect);
          const screenDistance = Math.hypot(
            pointer.x - targetScreen.x,
            pointer.y - targetScreen.y
          );
          if (screenDistance > tolerance) continue;
          add({
            type: "edge",
            key: `active:edge:${edge.a}:${edge.b}`,
            objectId: edit.objectId,
            pointWorld: target.toArray(),
            screenDistance
          });
        }
      }
    }

    if (edit.snap.scope === "scene") {
      let primitiveBudget = 120000;
      for (const batch of this.#batchManager.batches()) {
        if (primitiveBudget <= 0) break;
        const geometry = batch.geometry;
        const attribute = geometry.getAttribute("position");
        if (!attribute) continue;
        const topology = this.#topologyForGeometry(geometry);
        for (let instanceId = 0; instanceId < batch.mesh.count; instanceId += 1) {
          if (primitiveBudget <= 0) break;
          const objectId = batch.objectAt(instanceId);
          if (!objectId || objectId === edit.objectId) continue;
          const matrix = new THREE.Matrix4();
          batch.mesh.getMatrixAt(instanceId, matrix);
          matrix.premultiply(batch.mesh.matrixWorld);
          if (enabled("vertex")) {
            for (let index = 0; index < attribute.count && primitiveBudget > 0; index += 1) {
              primitiveBudget -= 1;
              const world = new THREE.Vector3(
                attribute.getX(index),
                attribute.getY(index),
                attribute.getZ(index)
              ).applyMatrix4(matrix);
              const screen = projectWorldToScreen(world, this.camera, rect);
              if (!screen.visible) continue;
              const screenDistance = Math.hypot(pointer.x - screen.x, pointer.y - screen.y);
              if (screenDistance > tolerance) continue;
              add({
                type: "vertex",
                key: `${objectId}:vertex:${index}`,
                objectId,
                pointWorld: world.toArray(),
                screenDistance
              });
            }
          }
          if (enabled("edge")) {
            for (const edge of topology.edges) {
              if (primitiveBudget-- <= 0) break;
              const start = new THREE.Vector3(
                attribute.getX(edge.a),
                attribute.getY(edge.a),
                attribute.getZ(edge.a)
              ).applyMatrix4(matrix);
              const end = new THREE.Vector3(
                attribute.getX(edge.b),
                attribute.getY(edge.b),
                attribute.getZ(edge.b)
              ).applyMatrix4(matrix);
              const screenStart = projectWorldToScreen(start, this.camera, rect);
              const screenEnd = projectWorldToScreen(end, this.camera, rect);
              if (!screenStart.visible && !screenEnd.visible) continue;
              const closest = closestScreenSegmentPoint(pointer, screenStart, screenEnd);
              const parameter = this.#meshSnapEdgeParameter({
                start,
                end,
                anchorWorld,
                fallback: closest.parameter
              });
              const target = start.clone().lerp(end, parameter);
              const targetScreen = projectWorldToScreen(target, this.camera, rect);
              const screenDistance = Math.hypot(
                pointer.x - targetScreen.x,
                pointer.y - targetScreen.y
              );
              if (screenDistance > tolerance) continue;
              add({
                type: "edge",
                key: `${objectId}:edge:${edge.a}:${edge.b}`,
                objectId,
                pointWorld: target.toArray(),
                screenDistance
              });
            }
          }
        }
      }
    }

    if (enabled("face")) {
      const ndc = new THREE.Vector2(
        ((pointer.x - rect.left) / rect.width) * 2 - 1,
        -((pointer.y - rect.top) / rect.height) * 2 + 1
      );
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(ndc, this.camera);
      const targets = [];
      if (edit.snap.scope === "active" || edit.snap.self) targets.push(edit.mesh);
      if (edit.snap.scope === "scene") {
        for (const batch of this.#batchManager.batches()) targets.push(batch.mesh);
        for (const batch of this.#heterogeneousBatchManager.batches()) {
          targets.push(batch.mesh);
        }
      }
      for (const hit of raycaster.intersectObjects(targets, false)) {
        let objectId = edit.objectId;
        if (hit.object === edit.mesh) {
          const face = edit.topology.faces[hit.faceIndex ?? -1];
          if (face?.vertices.every(index => edit.selectedIndices.has(index))) {
            continue;
          }
        }
        if (hit.object.isInstancedMesh) {
          objectId = this.#batchManager.objectFromHit(hit);
          if (!objectId || objectId === edit.objectId) continue;
        } else if (Number.isInteger(hit.batchId)) {
          objectId = this.#heterogeneousBatchManager.objectFromHit(hit);
          if (!objectId || objectId === edit.objectId) continue;
        }
        const faceTarget = this.#meshSnapFacePoint(hit, anchorWorld);
        if (!faceTarget) continue;
        const faceScreen = projectWorldToScreen(faceTarget, this.camera, rect);
        const screenDistance = Math.hypot(
          pointer.x - faceScreen.x,
          pointer.y - faceScreen.y
        );
        if (screenDistance > tolerance) continue;
        add({
          type: "face",
          key: `${objectId}:face:${hit.faceIndex ?? 0}`,
          objectId,
          pointWorld: faceTarget.toArray(),
          screenDistance
        });
        break;
      }
    }
    return candidates;
  }

  #meshSnapFacePoint(hit, anchorWorld) {
    const edit = this.#requireMeshEdit();
    if (edit.constraint === "free") return hit.point.clone();
    const geometry = hit.object.geometry;
    const position = geometry?.getAttribute?.("position");
    const face = hit.face;
    if (!position || !face) return null;
    const matrix = hit.object.matrixWorld.clone();
    if (hit.object.isInstancedMesh && Number.isInteger(hit.instanceId)) {
      const instance = new THREE.Matrix4();
      hit.object.getMatrixAt(hit.instanceId, instance);
      matrix.multiply(instance);
    }
    const a = new THREE.Vector3(
      position.getX(face.a), position.getY(face.a), position.getZ(face.a)
    ).applyMatrix4(matrix);
    const b = new THREE.Vector3(
      position.getX(face.b), position.getY(face.b), position.getZ(face.b)
    ).applyMatrix4(matrix);
    const c = new THREE.Vector3(
      position.getX(face.c), position.getY(face.c), position.getZ(face.c)
    ).applyMatrix4(matrix);
    const triangle = new THREE.Triangle(a, b, c);
    const normal = triangle.getNormal(new THREE.Vector3());
    if (normal.lengthSq() <= 1e-12) return null;
    const anchor = new THREE.Vector3().fromArray(anchorWorld);
    const frame = new THREE.Quaternion().fromArray(edit.frameQuaternion).normalize();
    const axes = meshConstraintAxes(edit.constraint);
    const allowed = [axes.x, axes.y, axes.z]
      .map((enabled, index) => enabled ? index : -1)
      .filter(index => index >= 0);
    let target = null;
    if (allowed.length === 1) {
      const direction = new THREE.Vector3(
        allowed[0] === 0 ? 1 : 0,
        allowed[0] === 1 ? 1 : 0,
        allowed[0] === 2 ? 1 : 0
      ).applyQuaternion(frame);
      const denominator = normal.dot(direction);
      if (Math.abs(denominator) <= 1e-10) return null;
      const amount = normal.dot(a.clone().sub(anchor)) / denominator;
      target = anchor.clone().addScaledVector(direction, amount);
    } else if (allowed.length === 2) {
      const forbidden = [0, 1, 2].find(index => !allowed.includes(index));
      const movementNormal = new THREE.Vector3(
        forbidden === 0 ? 1 : 0,
        forbidden === 1 ? 1 : 0,
        forbidden === 2 ? 1 : 0
      ).applyQuaternion(frame);
      const dot = movementNormal.dot(normal);
      const determinant = 1 - dot * dot;
      if (Math.abs(determinant) <= 1e-10) {
        return Math.abs(normal.dot(hit.point.clone().sub(a))) <= 1e-6
          ? hit.point.clone()
          : null;
      }
      const desired = hit.point.clone();
      const residualMovement = movementNormal.dot(desired.clone().sub(anchor));
      const residualFace = normal.dot(desired.clone().sub(a));
      const lambdaMovement = (residualMovement - dot * residualFace) / determinant;
      const lambdaFace = (residualFace - dot * residualMovement) / determinant;
      target = desired
        .addScaledVector(movementNormal, -lambdaMovement)
        .addScaledVector(normal, -lambdaFace);
    }
    if (!target) return null;
    return triangle.containsPoint(target) ? target : null;
  }

  #meshSnapEdgeParameter({ start, end, anchorWorld, fallback }) {
    const edit = this.#requireMeshEdit();
    if (edit.constraint === "free") return fallback;
    const frameInverse = new THREE.Quaternion()
      .fromArray(edit.frameQuaternion)
      .normalize()
      .invert();
    const anchor = new THREE.Vector3().fromArray(anchorWorld);
    const residual = start.clone().sub(anchor).applyQuaternion(frameInverse);
    const direction = end.clone().sub(start).applyQuaternion(frameInverse);
    const axes = meshConstraintAxes(edit.constraint);
    const forbiddenResidual = new THREE.Vector3(
      axes.x ? 0 : residual.x,
      axes.y ? 0 : residual.y,
      axes.z ? 0 : residual.z
    );
    const forbiddenDirection = new THREE.Vector3(
      axes.x ? 0 : direction.x,
      axes.y ? 0 : direction.y,
      axes.z ? 0 : direction.z
    );
    const denominator = forbiddenDirection.lengthSq();
    if (denominator <= 1e-12) return fallback;
    return THREE.MathUtils.clamp(
      -forbiddenDirection.dot(forbiddenResidual) / denominator,
      0,
      1
    );
  }

  #scoreMeshSnapCandidate({
    type,
    key,
    objectId,
    pointWorld,
    screenDistance,
    anchorWorld,
    rect,
    tolerance
  }) {
    const projected = projectWorldDeltaToConstraint({
      deltaWorld: new THREE.Vector3()
        .fromArray(pointWorld)
        .sub(new THREE.Vector3().fromArray(anchorWorld))
        .toArray(),
      frameQuaternion: this.#meshEdit.frameQuaternion,
      constraint: this.#meshEdit.constraint
    });
    const residualPixels = worldVectorScreenLength({
      camera: this.camera,
      rect,
      originWorld: anchorWorld,
      vectorWorld: projected.residualWorld
    });
    const penalty = { vertex: 0, edge: 0.08, face: 0.16 }[type] ?? 1;
    return {
      type,
      key,
      objectId,
      pointWorld,
      screenDistance,
      residualPixels,
      score: screenDistance / tolerance + residualPixels / tolerance + penalty
    };
  }

  #topologyForGeometry(geometry) {
    let topology = this.#meshTopologyCache.get(geometry);
    if (topology) return topology;
    const attribute = geometry.getAttribute("position");
    const empty = Object.freeze({ edges: Object.freeze([]), faces: Object.freeze([]) });
    if (!attribute) return empty;
    const positions = [];
    for (let index = 0; index < attribute.count; index += 1) {
      positions.push([
        attribute.getX(index),
        attribute.getY(index),
        attribute.getZ(index)
      ]);
    }
    try {
      topology = buildMeshTopology({
        positions,
        indices: geometry.index
          ? Array.from(geometry.index.array)
          : attribute.count % 3 === 0
            ? Array.from({ length: attribute.count }, (_, index) => index)
            : []
      });
    } catch {
      // Alguns assets auxiliares podem ter atributos de posição que não
      // descrevem triângulos completos. Eles continuam renderizáveis, mas
      // não oferecem arestas ou faces como referências de snap.
      topology = empty;
    }
    this.#meshTopologyCache.set(geometry, topology);
    return topology;
  }

  #showMeshSnapOverlay(anchorWorld, targetWorld, type = "vertex") {
    const edit = this.#requireMeshEdit();
    const color = ({
      vertex: 0xfff176,
      edge: 0x7dffb2,
      face: 0xff8ad8
    })[type] ?? 0xfff176;
    edit.snapMarker.material.color.setHex(color);
    edit.snapLine.material.color.setHex(color);
    edit.group.updateMatrixWorld(true);
    const inverse = edit.group.matrixWorld.clone().invert();
    const anchor = new THREE.Vector3().fromArray(anchorWorld).applyMatrix4(inverse);
    const target = new THREE.Vector3().fromArray(targetWorld).applyMatrix4(inverse);
    const marker = edit.snapMarker.geometry.getAttribute("position");
    marker.setXYZ(0, target.x, target.y, target.z);
    marker.needsUpdate = true;
    const line = edit.snapLine.geometry.getAttribute("position");
    line.setXYZ(0, anchor.x, anchor.y, anchor.z);
    line.setXYZ(1, target.x, target.y, target.z);
    line.needsUpdate = true;
    edit.snapMarker.visible = true;
    edit.snapLine.visible = true;
  }

  #clearMeshSnapOverlay() {
    const edit = this.#meshEdit;
    if (!edit) return;
    edit.snapMarker.visible = false;
    edit.snapLine.visible = false;
  }

  #refreshMeshEditInfluence() {
    const edit = this.#requireMeshEdit();
    if (!edit.selectedIndices.size) {
      edit.influenceField = null;
      edit.influence = new Map();
      this.#updateMeshEditMarkerColors();
      return null;
    }
    const field = createMeshInfluenceField({
      descriptor: edit.descriptor,
      selectedIndices: edit.selectedIndices,
      objectWorldMatrix: edit.objectWorldMatrix,
      frameQuaternion: edit.frameQuaternion,
      ...edit.deformation
    });
    edit.influenceField = field;
    edit.influence = new Map();
    field.affectedIndices.forEach((index, ordinal) => {
      edit.influence.set(index, field.weights[ordinal]);
    });
    this.#updateMeshEditMarkerColors();
    return field;
  }

  #snapshotMeshInfluenceField() {
    const edit = this.#requireMeshEdit();
    const field = edit.influenceField ?? this.#refreshMeshEditInfluence();
    if (!field) {
      throw new Error("Selecione ao menos um vértice para transformar.");
    }
    return Object.freeze({
      affectedIndices: Object.freeze([...field.affectedIndices]),
      weights: Object.freeze([...field.weights]),
      pivotWorld: Object.freeze([...field.pivotWorld]),
      metric: field.metric,
      falloff: field.falloff,
      radius: field.radius,
      enabled: field.enabled
    });
  }

  #requireMeshEdit() {
    if (!this.#meshEdit) {
      throw new Error("Nenhuma edição de malha está ativa no viewer.");
    }
    return this.#meshEdit;
  }

  #setMeshEditPositions(positions, {
    finalize = true,
    changedIndices = null
  } = {}) {
    const edit = this.#requireMeshEdit();
    edit.descriptor = Object.freeze({
      ...edit.descriptor,
      positions
    });
    const meshAttribute = edit.mesh.geometry.getAttribute("position");
    const markerAttribute = edit.markers.geometry.getAttribute("position");
    const indices = changedIndices === null
      ? positions.map((_, index) => index)
      : [...changedIndices];
    for (const index of indices) {
      const point = positions[index];
      meshAttribute.setXYZ(index, point[0], point[1], point[2]);
      markerAttribute?.setXYZ(index, point[0], point[1], point[2]);
    }
    meshAttribute.needsUpdate = true;
    if (markerAttribute) markerAttribute.needsUpdate = true;
    else this.#updateMeshEditMarkerGeometry();
    this.#updateMeshEditEdgeGeometry();
    this.#updateMeshEditFaceOverlay();
    if (finalize) this.#finalizeMeshEditGeometry();
  }

  #finalizeMeshEditGeometry() {
    const edit = this.#requireMeshEdit();
    edit.mesh.geometry.computeVertexNormals();
    edit.mesh.geometry.computeBoundingBox();
    edit.mesh.geometry.computeBoundingSphere();
  }

  #updateMeshEditMarkerGeometry() {
    const edit = this.#meshEdit;
    if (!edit) return;
    const count = edit.descriptor.positions.length;
    let attribute = edit.markers.geometry.getAttribute("position");
    if (!attribute || attribute.count !== count) {
      attribute = new THREE.Float32BufferAttribute(count * 3, 3);
      edit.markers.geometry.setAttribute("position", attribute);
    }
    edit.descriptor.positions.forEach((point, index) => {
      attribute.setXYZ(index, point[0], point[1], point[2]);
    });
    attribute.needsUpdate = true;
    const color = edit.markers.geometry.getAttribute("color");
    if (!color || color.count !== count) this.#updateMeshEditMarkerColors();
  }

  #updateMeshEditMarkerColors() {
    const edit = this.#meshEdit;
    if (!edit) return;
    const count = edit.descriptor.positions.length;
    let attribute = edit.markers.geometry.getAttribute("color");
    if (!attribute || attribute.count !== count) {
      attribute = new THREE.Float32BufferAttribute(count * 3, 3);
      edit.markers.geometry.setAttribute("color", attribute);
    }
    const normal = new THREE.Color(0x7ec8ff);
    const selected = new THREE.Color(0xffb347);
    const active = new THREE.Color(0xffffff);
    const positiveInfluence = new THREE.Color(0x77ffb0);
    const negativeInfluence = new THREE.Color(0xff6f91);
    const mixed = new THREE.Color();
    for (let index = 0; index < count; index += 1) {
      let color = normal;
      if (index === edit.activeVertex) color = active;
      else if (edit.selectedIndices.has(index)) color = selected;
      else if (edit.influence?.has(index)) {
        const weight = Number(edit.influence.get(index));
        mixed.copy(normal).lerp(
          weight < 0 ? negativeInfluence : positiveInfluence,
          Math.min(1, Math.abs(weight))
        );
        color = mixed;
      }
      attribute.setXYZ(index, color.r, color.g, color.b);
    }
    attribute.needsUpdate = true;
    edit.markers.material.size = Math.max(
      8,
      this.#transformConfig.vertexSize
    );
    edit.markers.material.needsUpdate = true;
  }

  #applyMeshEditDisplay() {
    const edit = this.#meshEdit;
    if (!edit) return;
    edit.markers.visible = Boolean(edit.display.vertices);
    edit.edgeOverlay.visible = Boolean(edit.display.edges);
    edit.faceOverlay.visible = Boolean(edit.display.faces) &&
      edit.selectedComponents.size > 0 && edit.componentMode === "face";
    const depthTest = !edit.display.xray;
    edit.markers.material.depthTest = depthTest;
    edit.edgeOverlay.material.depthTest = depthTest;
    edit.faceOverlay.material.depthTest = depthTest;
    edit.markers.material.needsUpdate = true;
    edit.edgeOverlay.material.needsUpdate = true;
    edit.faceOverlay.material.needsUpdate = true;
  }

  #updateMeshEditEdgeGeometry() {
    const edit = this.#meshEdit;
    if (!edit) return;
    const count = edit.topology.edges.length;
    const positions = new Float32Array(count * 6);
    const colors = new Float32Array(count * 6);
    const normal = new THREE.Color(0x4d789c);
    const loose = new THREE.Color(0x78d6a9);
    const selected = new THREE.Color(0xffb347);
    const active = new THREE.Color(0xffffff);
    edit.topology.edges.forEach((edge, index) => {
      const a = edit.descriptor.positions[edge.a];
      const b = edit.descriptor.positions[edge.b];
      positions.set([...a, ...b], index * 6);
      let color = edge.loose ? loose : normal;
      if (edit.componentMode === "edge" && edit.selectedComponents.has(edge.index)) {
        color = edge.index === edit.activeComponent ? active : selected;
      }
      colors.set([color.r, color.g, color.b, color.r, color.g, color.b], index * 6);
    });
    edit.edgeOverlay.geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(positions, 3)
    );
    edit.edgeOverlay.geometry.setAttribute(
      "color",
      new THREE.BufferAttribute(colors, 3)
    );
    edit.edgeOverlay.geometry.computeBoundingSphere();
    this.#applyMeshEditDisplay();
  }

  #updateMeshEditFaceOverlay() {
    const edit = this.#meshEdit;
    if (!edit) return;
    const positions = [];
    if (edit.componentMode === "face") {
      for (const faceIndex of edit.selectedComponents) {
        const face = edit.topology.triangles[faceIndex];
        if (!face) continue;
        for (const vertex of face) positions.push(...edit.descriptor.positions[vertex]);
      }
    }
    const count = positions.length / 3;
    let attribute = edit.faceOverlay.geometry.getAttribute("position");
    if (!attribute || attribute.count !== count) {
      edit.faceOverlay.geometry.dispose?.();
      const geometry = new THREE.BufferGeometry();
      attribute = new THREE.Float32BufferAttribute(positions, 3);
      geometry.setAttribute("position", attribute);
      edit.faceOverlay.geometry = geometry;
    } else {
      attribute.array.set(positions);
      attribute.needsUpdate = true;
    }
    if (count) {
      edit.faceOverlay.geometry.computeVertexNormals();
      edit.faceOverlay.geometry.computeBoundingSphere();
    }
    this.#applyMeshEditDisplay();
  }

  #pickMeshEditComponent(event, rect, pointerType) {
    const edit = this.#requireMeshEdit();
    if (edit.componentMode === "edge") {
      return this.#pickMeshEditEdge(event, rect, pointerType);
    }
    if (edit.componentMode === "face") {
      const hit = this.raycaster.intersectObject(edit.mesh, false)[0];
      return Number.isInteger(hit?.faceIndex) ? hit.faceIndex : null;
    }
    return this.#pickMeshEditVertex(event, rect, pointerType);
  }

  #pickMeshEditEdge(event, rect, pointerType) {
    const edit = this.#requireMeshEdit();
    const radius = pointerType === "touch" ? 24 : 12;
    edit.group.updateMatrixWorld(true);
    const cameraPosition = this.camera.getWorldPosition(new THREE.Vector3());
    const candidates = [];
    const worldA = new THREE.Vector3();
    const worldB = new THREE.Vector3();
    const screenA = new THREE.Vector3();
    const screenB = new THREE.Vector3();
    for (const edge of edit.topology.edges) {
      worldA.fromArray(edit.descriptor.positions[edge.a]).applyMatrix4(edit.group.matrixWorld);
      worldB.fromArray(edit.descriptor.positions[edge.b]).applyMatrix4(edit.group.matrixWorld);
      screenA.copy(worldA).project(this.camera);
      screenB.copy(worldB).project(this.camera);
      if ((screenA.z < -1 || screenA.z > 1) && (screenB.z < -1 || screenB.z > 1)) continue;
      const ax = rect.left + (screenA.x + 1) * 0.5 * rect.width;
      const ay = rect.top + (1 - screenA.y) * 0.5 * rect.height;
      const bx = rect.left + (screenB.x + 1) * 0.5 * rect.width;
      const by = rect.top + (1 - screenB.y) * 0.5 * rect.height;
      const distance = pointSegmentDistance2D(
        event.clientX, event.clientY, ax, ay, bx, by
      );
      if (distance > radius) continue;
      candidates.push({
        index: edge.index,
        distance,
        cameraDistance: Math.min(
          worldA.distanceTo(cameraPosition),
          worldB.distanceTo(cameraPosition)
        )
      });
    }
    candidates.sort((left, right) =>
      left.distance - right.distance || left.cameraDistance - right.cameraDistance
    );
    return candidates[0]?.index ?? null;
  }

  #pickMeshEditVertex(event, rect, pointerType) {
    const edit = this.#requireMeshEdit();
    const radius = pointerType === "touch" ? 22 : 12;
    edit.group.updateMatrixWorld(true);
    const candidates = [];
    const cameraPosition = this.camera.getWorldPosition(new THREE.Vector3());
    const world = new THREE.Vector3();
    const projected = new THREE.Vector3();

    edit.descriptor.positions.forEach((point, index) => {
      world.fromArray(point).applyMatrix4(edit.group.matrixWorld);
      const cameraDistance = world.distanceTo(cameraPosition);
      projected.copy(world).project(this.camera);
      if (projected.z < -1 || projected.z > 1) return;
      const x = rect.left + (projected.x + 1) * 0.5 * rect.width;
      const y = rect.top + (1 - projected.y) * 0.5 * rect.height;
      const screenDistance = Math.hypot(event.clientX - x, event.clientY - y);
      if (screenDistance > radius) return;
      candidates.push({
        index,
        screenDistance,
        cameraDistance,
        world: world.clone()
      });
    });

    candidates.sort((left, right) =>
      left.screenDistance - right.screenDistance ||
      left.cameraDistance - right.cameraDistance
    );
    if (!edit.options.occlusion) return candidates[0]?.index ?? null;

    const visibilityRay = new THREE.Raycaster();
    for (const candidate of candidates) {
      const direction = candidate.world.clone().sub(cameraPosition);
      const distance = direction.length();
      if (distance <= 1e-9) return candidate.index;
      direction.multiplyScalar(1 / distance);
      const tolerance = Math.max(1e-4, distance * 1e-5);
      visibilityRay.set(cameraPosition, direction);
      visibilityRay.near = 0;
      visibilityRay.far = Math.max(0, distance - tolerance);
      if (!visibilityRay.intersectObject(edit.mesh, false).length) {
        return candidate.index;
      }
    }
    return null;
  }

  #updateSelectionAppearance() {
    if (this.#meshEdit) {
      this.#selectionOutlines.update([]);
      this.#selectedVisualIds = new Set();
      this.#updateCameraVisualAppearance();
      return;
    }
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

    if (this.#toolGestureNavigation.isNavigationGesture(event)) {
      this.#tap = null;
      this.#inputDiagnostics.discardedReason = "gesto-multitoque";
      return;
    }

    if (
      this.#interactionMode === "select" &&
      this.editorState.areaSelection
    ) {
      this.#tap = null;
      this.#inputDiagnostics.discardedReason = "gesto-de-selecao";
      return;
    }

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

    if (this.#meshEdit) {
      if (this.#interactionMode === "navigate") {
        this.#inputDiagnostics.discardedReason = "navigation-mode";
        return;
      }
      const transformMode = ["translate", "rotate", "scale"]
        .includes(this.#interactionMode);
      const gizmoActive = transformMode &&
        (this.transform.axis !== null || this.transform.dragging);
      if (gizmoActive) {
        this.#inputDiagnostics.gizmoHits = 1;
        this.#inputDiagnostics.discardedReason = "gizmo-active";
        return;
      }
      const operation = this.editorState.multiSelect
        ? "toggle"
        : this.#selectionOperation;
      const index = this.#pickMeshEditComponent(event, rect, pointerType);
      this.#meshEdit.onComponentPick?.({
        mode: this.#meshEdit.componentMode,
        index,
        operation
      });
      if (!this.#meshEdit.onComponentPick && this.#meshEdit.componentMode === "vertex") {
        this.#meshEdit.onVertexPick?.({ index, operation });
      }
      this.#inputDiagnostics.selectionAction =
        `${this.#meshEdit.componentMode}:${operation}`;
      this.#inputDiagnostics.lastObjectId = this.#meshEdit.objectId;
      this.#inputDiagnostics.discardedReason = index === null
        ? `nenhum-${this.#meshEdit.componentMode}`
        : null;
      return;
    }

    // Bounds sujos agora pertencem a shards pequenos. O picking consulta o
    // índice espacial e só faz raycast exato nos objetos candidatos.
    this.#flushBatchBounds();
    const spatialHits = this.#raycastSpatialObjects();
    const cameraHits = this.raycaster.intersectObjects(
      [...this.#cameraVisuals.values()].flatMap(
        visual => [visual.body, visual.lens, visual.lines]
      ),
      false
    );
    const lightHits = this.raycaster.intersectObjects(
      [...this.#lightVisuals.values()].flatMap(
        visual => [visual.icon, visual.rays]
      ),
      false
    );
    const hitIds=[...new Set([
      ...spatialHits.map(hit => hit.objectId),
      ...cameraHits.map(hit => hit.object.userData.cameraObjectId),
      ...lightHits.map(hit => hit.object.userData.lightObjectId),
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

  #objectScreenSelectionIndex() {
    const rect = this.canvas.getBoundingClientRect();
    this.camera.updateMatrixWorld(true);
    const key = [
      this.#screenSelectionVersion,
      this.#animationSurfaceDiagnostics.frames,
      rect.width,
      rect.height,
      ...this.camera.projectionMatrix.elements,
      ...this.camera.matrixWorldInverse.elements
    ].join(",");
    if (this.#screenSelectionCache.key === key) {
      this.#screenSelectionCache.hits += 1;
      return this.#screenSelectionCache.index;
    }
    const entries = [];
    this.#incrementalDiagnostics.screenObjectsVisited += this.#meshes.size;
    for (const [objectId, proxy] of this.#meshes) {
      if (
        proxy.userData.logicalOnly &&
        !proxy.userData.cameraVisual
      ) continue;
      const screen = this.#screenBoundsForProxy(proxy, rect);
      if (!screen) continue;
      const selectedId = this.#hierarchy.has(objectId)
        ? selectionUnitId(this.#hierarchy, objectId)
        : objectId;
      entries.push({
        x: screen.x,
        y: screen.y,
        bounds: screen.bounds,
        member: Object.freeze({
          kind: "object",
          regionId: "region-main",
          objectId: selectedId
        })
      });
    }
    this.#screenSelectionCache.index.rebuild(entries);
    this.#screenSelectionCache.key = key;
    this.#screenSelectionCache.builds += 1;
    return this.#screenSelectionCache.index;
  }

  #screenBoundsForProxy(proxy, viewport) {
    const local = new THREE.Box3();
    const localBounds = proxy.userData.localBounds;
    if (localBounds) {
      local.min.fromArray(localBounds.min);
      local.max.fromArray(localBounds.max);
    } else {
      const size = proxy.userData.size ?? [1, 1, 1];
      const half = new THREE.Vector3(
        Number(size[0]) / 2,
        Number(size[1]) / 2,
        Number(size[2]) / 2
      );
      local.min.copy(half).multiplyScalar(-1);
      local.max.copy(half);
    }
    proxy.updateMatrixWorld(true);
    const points = [];
    if (!local.isEmpty()) {
      for (const x of [local.min.x, local.max.x]) {
        for (const y of [local.min.y, local.max.y]) {
          for (const z of [local.min.z, local.max.z]) {
            const projected = new THREE.Vector3(x, y, z)
              .applyMatrix4(proxy.matrixWorld)
              .project(this.camera);
            if (projected.z < -1 || projected.z > 1) continue;
            points.push({
              x: (projected.x + 1) * 0.5 * viewport.width,
              y: (1 - projected.y) * 0.5 * viewport.height
            });
          }
        }
      }
    }
    const center = local.getCenter(new THREE.Vector3())
      .applyMatrix4(proxy.matrixWorld)
      .project(this.camera);
    const centerVisible = center.z >= -1 && center.z <= 1;
    if (centerVisible) {
      points.push({
        x: (center.x + 1) * 0.5 * viewport.width,
        y: (1 - center.y) * 0.5 * viewport.height
      });
    }
    if (!points.length) return null;
    const xs = points.map(point => point.x);
    const ys = points.map(point => point.y);
    const rawLeft = Math.min(...xs);
    const rawTop = Math.min(...ys);
    const rawRight = Math.max(...xs);
    const rawBottom = Math.max(...ys);
    if (
      rawRight < 0 ||
      rawBottom < 0 ||
      rawLeft > viewport.width ||
      rawTop > viewport.height
    ) {
      return null;
    }
    const centerX = centerVisible
      ? (center.x + 1) * 0.5 * viewport.width
      : (rawLeft + rawRight) * 0.5;
    const centerY = centerVisible
      ? (1 - center.y) * 0.5 * viewport.height
      : (rawTop + rawBottom) * 0.5;
    const minimumExtent = 6;
    const halfWidth = Math.max((rawRight - rawLeft) * 0.5, minimumExtent * 0.5);
    const halfHeight = Math.max((rawBottom - rawTop) * 0.5, minimumExtent * 0.5);
    const left = Math.max(0, Math.min(viewport.width, centerX - halfWidth));
    const top = Math.max(0, Math.min(viewport.height, centerY - halfHeight));
    const right = Math.max(0, Math.min(viewport.width, centerX + halfWidth));
    const bottom = Math.max(0, Math.min(viewport.height, centerY + halfHeight));
    return Object.freeze({
      x: centerX,
      y: centerY,
      bounds: Object.freeze({ left, top, right, bottom })
    });
  }

  #applySelectionMembers(members,operation){
    if (this.selection.applyMany) {
      this.selection.applyMany(members, { operation });
      return;
    }
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

  #enforceNavigationLocks() {
    if (this.#applyingNavigationLocks) return;
    const { plane, point } = this.#navigationLocks;
    if (!plane && !point) return;
    this.#applyingNavigationLocks = true;
    try {
      const current = this.orbit.target.clone();
      let desired = current.clone();
      if (plane) {
        desired.fromArray(projectPointToPlane(current.toArray(), plane));
      }
      if (point) {
        desired.fromArray(point.point);
      }
      if (plane) {
        const normal = new THREE.Vector3().fromArray(plane.normal).normalize();
        const yAxis = new THREE.Vector3().fromArray(plane.yAxis).normalize();
        const offset = this.camera.position.clone().sub(current);
        const distance = Math.max(offset.length(), 1e-6);
        const side = Math.sign(offset.dot(normal)) || 1;
        this.orbit.target.copy(desired);
        this.camera.position.copy(desired).addScaledVector(
          normal,
          distance * side
        );
        this.camera.up.copy(yAxis);
        this.camera.lookAt(desired);
        this.camera.updateMatrixWorld(true);
      } else {
        const correction = desired.sub(current);
        if (correction.lengthSq() > 1e-18) {
          this.camera.position.add(correction);
          this.orbit.target.add(correction);
        }
      }
    } finally {
      this.#applyingNavigationLocks = false;
    }
  }

  #synchronizeNavigationMode() {
    const { plane, point } = this.#navigationLocks;
    this.#navigationMode = plane
      ? (point ? "plane-point" : "plane-2d")
      : (point ? "orbit-point" : "free");
    if (plane) {
      this.orbit.enableRotate = false;
      this.orbit.enablePan = !point;
      this.orbit.screenSpacePanning = true;
    } else if (point) {
      this.orbit.enableRotate = true;
      this.orbit.enablePan = false;
      this.orbit.screenSpacePanning = this.#navigationDefaults.screenSpacePanning;
      this.camera.up.fromArray(this.#navigationDefaults.cameraUp);
    } else {
      this.orbit.enableRotate = this.#navigationDefaults.enableRotate;
      this.orbit.enablePan = this.#navigationDefaults.enablePan;
      this.orbit.screenSpacePanning = this.#navigationDefaults.screenSpacePanning;
      this.camera.up.fromArray(this.#navigationDefaults.cameraUp);
    }
    this.orbit.update();
  }

  resize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
    this.#notifyNavigationCamera();
    this.invalidateRender("resize");
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
  const heterogeneousBatches = this.#heterogeneousBatchManager.batches();
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
  for (const batch of heterogeneousBatches) {
    if (batch.mesh?.geometry) geometries.add(batch.mesh.geometry);
    if (batch.mesh?.material) {
      materials.add(batch.mesh.material);
      if (batch.mesh.material.map) {
        textures.add(batch.mesh.material.map);
        texturedMeshes += 1;
      }
    }
  }

  const info = this.renderer?.info;

  return Object.freeze({
    meshes: batches.length + heterogeneousBatches.length,
    logicalProxies: this.#meshes.size,
    instancedMeshes: batches.length,
    heterogeneousMeshes: heterogeneousBatches.length,
    logicalInstances: this.#batchManager.stats().resources +
      this.#heterogeneousBatchManager.status().resources,
    familyObjects: this.#familyVisuals.size,
    familyInstances: this.#incrementalDiagnostics.familyInstances,
    familyEstimatedBytes:
      this.#incrementalDiagnostics.familyEstimatedBytes,
    cameraObjects: this.#cameraVisuals.size,
    lightObjects: this.#lightVisuals.size,
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
    heterogeneousBatches: this.#heterogeneousBatchManager.status(),
    incremental: this.getIncrementalDiagnostics?.() ?? null
  });
}

  animate = () => {
    this.invalidateRender("legacy-animate");
  };
}


function installRenderInvalidationWrappers(renderer) {
  const methods = [
    "beginMeshEdit",
    "updateMeshEditGeometry",
    "updateMeshEditSelection",
    "updateMeshEditComponentSelection",
    "setMeshEditComponentMode",
    "updateMeshEditDisplay",
    "updateMeshEditOptions",
    "setMeshEditConstraint",
    "updateMeshEditSnap",
    "updateMeshEditDeformation",
    "updateMeshEditInfluence",
    "setMeshEditFrame",
    "endMeshEdit",
    "setViewerRenderSettings",
    "applyViewerRenderPreset",
    "resetViewerRenderSettings",
    "setObjectTransformFrame",
    "setObjectTransformAxes",
    "setNavigationPlaneLock",
    "setNavigationPointLock",
    "clearNavigationLocks",
    "setEditPlane",
    "setDrawingPlane",
    "applyNavigationCamera",
    "setCameraProjection",
    "setTransformMode",
    "setSelectionOperation",
    "setPivotEditing",
    "toggleSpace",
    "applySharedTransformPreview",
    "clearSharedTransformPreview",
    "setCameraVisualState",
    "restoreAnimationTargets",
    "setTransformConfig"
  ];
  for (const method of methods) {
    const original = renderer[method];
    if (typeof original !== "function") continue;
    renderer[method] = function renderInvalidatingMethod(...args) {
      const result = original.apply(this, args);
      if (shouldInvalidateRenderResult(result)) {
        this.invalidateRender(`method:${method}`);
      }
      return result;
    };
  }
}

function shouldInvalidateRenderResult(result) {
  if (result === false || result?.changed === false) return false;
  if (
    result &&
    typeof result === "object" &&
    "matrixWrites" in result &&
    "colorWrites" in result
  ) {
    return Number(result.matrixWrites ?? 0) > 0 ||
      Number(result.colorWrites ?? 0) > 0 ||
      Number(result.pivotWrites ?? 0) > 0 ||
      Number(result.restored ?? 0) > 0;
  }
  return true;
}

function numericArrayEqual(a, b, epsilon = 1e-12) {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
    return false;
  }
  for (let index = 0; index < a.length; index += 1) {
    if (Math.abs(Number(a[index]) - Number(b[index])) > epsilon) return false;
  }
  return true;
}

function toneMapping(mode) {
  return ({
    none: THREE.NoToneMapping,
    linear: THREE.LinearToneMapping,
    reinhard: THREE.ReinhardToneMapping,
    cineon: THREE.CineonToneMapping,
    aces: THREE.ACESFilmicToneMapping,
    agx: THREE.AgXToneMapping,
    neutral: THREE.NeutralToneMapping
  })[mode] ?? THREE.ACESFilmicToneMapping;
}

function shadowMapType(type) {
  return ({
    basic: THREE.BasicShadowMap,
    pcf: THREE.PCFShadowMap,
    "pcf-soft": THREE.PCFSoftShadowMap,
    vsm: THREE.VSMShadowMap
  })[type] ?? THREE.PCFSoftShadowMap;
}

function normalizeMeshSnapSettings(value = {}) {
  const mode = String(value?.mode ?? "auto").toLowerCase();
  const scope = String(value?.scope ?? "active").toLowerCase();
  const anchor = String(value?.anchor ?? "active").toLowerCase();
  if (!["auto", "vertex", "edge", "face"].includes(mode)) {
    throw new RangeError(`Modo de snap desconhecido: ${mode}.`);
  }
  if (!["active", "scene"].includes(scope)) {
    throw new RangeError(`Escopo de snap desconhecido: ${scope}.`);
  }
  if (!["active", "pivot", "nearest"].includes(anchor)) {
    throw new RangeError(`Âncora de snap desconhecida: ${anchor}.`);
  }
  const tolerancePixels = Number(value?.tolerancePixels ?? 18);
  if (!Number.isFinite(tolerancePixels) || tolerancePixels < 2 || tolerancePixels > 80) {
    throw new RangeError("A tolerância de snap deve ficar entre 2 e 80 px.");
  }
  const modes = value?.modes === undefined
    ? mode === "auto" ? ["vertex", "edge", "face"] : [mode]
    : [...new Set(Array.from(value.modes ?? [], item =>
        String(item).toLowerCase()
      ))];
  if (modes.some(item => !["vertex", "edge", "face"].includes(item))) {
    throw new RangeError("modes contém alvo de snap desconhecido.");
  }
  return {
    enabled: Boolean(value?.enabled),
    mode,
    modes,
    scope,
    anchor,
    tolerancePixels,
    self: Boolean(value?.self)
  };
}

function meshConstraintAxes(constraint = "free") {
  const normalized = String(constraint ?? "free").toLowerCase();
  return {
    x: normalized === "free" || normalized.includes("x"),
    y: normalized === "free" || normalized.includes("y"),
    z: normalized === "free" || normalized.includes("z")
  };
}

function rendererNow() {
  return globalThis.performance?.now?.() ?? Date.now();
}

function explicitFamilyConservativeBounds(geometry, family) {
  if (!geometry.boundingSphere) geometry.computeBoundingSphere?.();
  const sphere = geometry.boundingSphere;
  const maximumScale = Number(family.bounds?.maximumScale ?? 1);
  const radius = Math.max(
    0,
    (Number(sphere?.radius ?? 0) + Number(sphere?.center?.length?.() ?? 0)) *
      maximumScale
  );
  const minimum = new THREE.Vector3().fromArray(
    family.bounds?.min ?? [0, 0, 0]
  ).addScalar(-radius);
  const maximum = new THREE.Vector3().fromArray(
    family.bounds?.max ?? [0, 0, 0]
  ).addScalar(radius);
  return new THREE.Box3(minimum, maximum);
}

function renderMaterialRequest(
  object,
  binding,
  { applyBinding = true } = {}
) {
  if (!applyBinding) {
    return {
      appearanceId: object.appearanceId,
      material: object.material
    };
  }
  const materialMode = binding?.materialMode ?? "inherit";
  const opacityMultiplier = Number(binding?.opacityMultiplier ?? 1);
  if (materialMode === "inherit" && Math.abs(opacityMultiplier - 1) <= 1e-12) {
    return {
      appearanceId: object.appearanceId,
      material: object.material
    };
  }
  const material = structuredClone(object.material ?? { color: "#ffffff" });
  if (materialMode !== "inherit") material.model = materialMode;
  const baseOpacity = Number(material.opacity ?? 1);
  material.opacity = Math.max(0, Math.min(1, baseOpacity * opacityMultiplier));
  material.transparent = Boolean(material.transparent) || material.opacity < 1;
  return { appearanceId: null, material };
}

function createFamilyDisplayMaterial(source, { family, binding }) {
  const baseColor = source?.color?.isColor
    ? `#${source.color.getHexString()}`
    : "#ffffff";
  const baseOpacity = Number(source?.opacity ?? 1);
  const inheritedUnlit = family.generator?.shading === "unlit";
  const forceUnlit = binding.materialMode === "unlit" ||
    (binding.materialMode === "inherit" && inheritedUnlit);
  let material = forceUnlit
    ? createUnlitFamilyMaterial(source)
    : source?.clone?.() ?? createUnlitFamilyMaterial(source);
  if (
    binding.materialMode === "standard" &&
    (!material.isMeshStandardMaterial || material.isMeshPhysicalMaterial)
  ) {
    material.dispose?.();
    material = createStandardFamilyMaterial(source, false);
  } else if (
    binding.materialMode === "physical" &&
    !material.isMeshPhysicalMaterial
  ) {
    material.dispose?.();
    material = createStandardFamilyMaterial(source, true);
  }
  material.name = `${source?.name ?? "family"}-appearance`;
  return { material, baseColor, baseOpacity };
}

function createStandardFamilyMaterial(source, physical) {
  const MaterialType = physical
    ? THREE.MeshPhysicalMaterial
    : THREE.MeshStandardMaterial;
  return new MaterialType({
    color: source?.color?.isColor ? source.color.clone() : 0xffffff,
    map: source?.map ?? null,
    alphaMap: source?.alphaMap ?? null,
    normalMap: source?.normalMap ?? null,
    roughnessMap: source?.roughnessMap ?? null,
    metalnessMap: source?.metalnessMap ?? null,
    roughness: Number(source?.roughness ?? 0.6),
    metalness: Number(source?.metalness ?? 0),
    transparent: Boolean(source?.transparent),
    opacity: Number(source?.opacity ?? 1),
    alphaTest: Number(source?.alphaTest ?? 0),
    side: source?.side ?? THREE.FrontSide,
    depthTest: source?.depthTest !== false,
    depthWrite: source?.depthWrite !== false,
    wireframe: Boolean(source?.wireframe)
  });
}

function createUnlitFamilyMaterial(source) {
  const material = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    map: source?.map ?? null,
    alphaMap: source?.alphaMap ?? null,
    transparent: Boolean(source?.transparent),
    opacity: Number(source?.opacity ?? 1),
    alphaTest: Number(source?.alphaTest ?? 0),
    side: source?.side ?? THREE.FrontSide,
    depthTest: source?.depthTest !== false,
    depthWrite: source?.depthWrite !== false,
    wireframe: Boolean(source?.wireframe),
    toneMapped: false
  });
  material.name = `${source?.name ?? "family"}-unlit`;
  return material;
}

function rendererInputPending() {
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

function hasHierarchyParent(object) {
  return [
    object?.parentId,
    object?.parent,
    object?.groupId,
    object?.containerId,
    object?.hierarchyParentId
  ].some(value => value !== undefined && value !== null && value !== "");
}

function rootObjectMatrix(object) {
  const position = Array.isArray(object?.position) && object.position.length === 3
    ? object.position.map(Number)
    : [0, 0, 0];
  const rotation = Array.isArray(object?.rotation) && object.rotation.length === 4
    ? object.rotation.map(Number)
    : [0, 0, 0, 1];
  const scale = Array.isArray(object?.scale) && object.scale.length === 3
    ? object.scale.map(Number)
    : [1, 1, 1];
  if (![...position, ...rotation, ...scale].every(Number.isFinite)) {
    throw new TypeError(`Transformação inválida do objeto ${object?.id ?? "?"}.`);
  }
  return new THREE.Matrix4().compose(
    new THREE.Vector3().fromArray(position),
    new THREE.Quaternion().fromArray(rotation).normalize(),
    new THREE.Vector3().fromArray(scale)
  ).toArray();
}

function transformHitNormalToWorld(hit) {
  return hit.face.normal.clone()
    .transformDirection(hitWorldMatrix(hit))
    .normalize();
}

function hitWorldMatrix(hit) {
  const matrix = hit.object.matrixWorld.clone();
  const instanceId = hit.object.isInstancedMesh && Number.isInteger(hit.instanceId)
    ? hit.instanceId
    : Number.isInteger(hit.batchId)
      ? hit.batchId
      : null;
  if (instanceId !== null && typeof hit.object.getMatrixAt === "function") {
    const instanceMatrix = new THREE.Matrix4();
    hit.object.getMatrixAt(instanceId, instanceMatrix);
    matrix.multiply(instanceMatrix);
  }
  return matrix;
}

function normalizeNavigationPlane(frame = {}) {
  const origin = new THREE.Vector3().fromArray(
    normalizeVector3Array(frame.origin ?? [0, 0, 0], "Origem do plano")
  );
  const normal = new THREE.Vector3().fromArray(
    normalizeVector3Array(frame.normal ?? [0, 0, 1], "Normal do plano")
  );
  if (normal.lengthSq() < 1e-18) {
    throw new RangeError("A normal do plano não pode ser nula.");
  }
  normal.normalize();
  let xAxis = new THREE.Vector3().fromArray(
    normalizeVector3Array(frame.xAxis ?? [1, 0, 0], "Eixo X do plano")
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
  return {
    origin: origin.toArray(),
    normal: normal.toArray(),
    xAxis: xAxis.toArray(),
    yAxis: yAxis.toArray(),
    quaternion: quaternion.toArray(),
    source: frame.source ?? null,
    linked: Boolean(frame.linked)
  };
}

function projectPointToPlane(point, plane) {
  const value = new THREE.Vector3().fromArray(
    normalizeVector3Array(point, "Ponto")
  );
  const origin = new THREE.Vector3().fromArray(plane.origin);
  const normal = new THREE.Vector3().fromArray(plane.normal).normalize();
  return value.addScaledVector(
    normal,
    -value.clone().sub(origin).dot(normal)
  ).toArray();
}

function normalizeVector3Array(value, label) {
  if (!Array.isArray(value) || value.length !== 3) {
    throw new TypeError(`${label} deve conter três valores.`);
  }
  const values = value.map(Number);
  if (!values.every(Number.isFinite)) {
    throw new TypeError(`${label} contém valor inválido.`);
  }
  return values;
}

function projectWorldToScreen(pointWorld, camera, rect) {
  const projected = pointWorld.clone().project(camera);
  return {
    x: rect.left + (projected.x + 1) * 0.5 * rect.width,
    y: rect.top + (1 - projected.y) * 0.5 * rect.height,
    z: projected.z,
    visible: projected.z >= -1 && projected.z <= 1
  };
}

function closestScreenSegmentPoint(pointer, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  const parameter = lengthSquared <= 1e-12
    ? 0
    : THREE.MathUtils.clamp(
        ((pointer.x - start.x) * dx + (pointer.y - start.y) * dy) /
          lengthSquared,
        0,
        1
      );
  const x = start.x + dx * parameter;
  const y = start.y + dy * parameter;
  return {
    parameter,
    distance: Math.hypot(pointer.x - x, pointer.y - y)
  };
}

function worldVectorScreenLength({
  camera,
  rect,
  originWorld,
  vectorWorld
}) {
  const origin = new THREE.Vector3().fromArray(originWorld);
  const target = origin.clone().add(new THREE.Vector3().fromArray(vectorWorld));
  const originScreen = projectWorldToScreen(origin, camera, rect);
  const targetScreen = projectWorldToScreen(target, camera, rect);
  if (!originScreen.visible && !targetScreen.visible) return Infinity;
  return Math.hypot(
    targetScreen.x - originScreen.x,
    targetScreen.y - originScreen.y
  );
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

function projectedSelectionIdsWithFallback(hierarchy, ids = []) {
  const result = [];
  const seen = new Set();
  const known = [];
  const pending = [];

  for (const rawId of ids) {
    const id = String(rawId);
    if (!id || seen.has(id)) continue;
    if (hierarchy?.has?.(id)) known.push(id);
    else pending.push(id);
  }

  if (known.length) {
    try {
      for (const id of projectedSelectionIds(hierarchy, known)) {
        if (seen.has(id)) continue;
        seen.add(id);
        result.push(id);
      }
    } catch {
      /*
       * A hierarquia é uma projeção derivada e pode estar entre revisões.
       * Uma falha nessa leitura não deve impedir a transformação dos proxies
       * já existentes.
       */
      for (const id of known) {
        if (seen.has(id)) continue;
        seen.add(id);
        result.push(id);
      }
    }
  }

  for (const id of pending) {
    if (seen.has(id)) continue;
    seen.add(id);
    result.push(id);
  }

  return Object.freeze(result);
}


function renderBatchMaterialIdentity(materialRequest, renderProfile, binding) {
  const material = structuredClone(materialRequest?.material ?? {});
  delete material.color;
  return stableRenderIdentity({
    material,
    side: renderProfile?.side ?? "front",
    materialMode: binding?.materialMode ?? "inherit",
    opacityMultiplier: Number(binding?.opacityMultiplier ?? 1)
  });
}

function stableRenderIdentity(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableRenderIdentity).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .filter(key => value[key] !== undefined)
      .map(key => `${JSON.stringify(key)}:${stableRenderIdentity(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function strokeChunkSpatialCell(matrix, bounds, cellSize = 64) {
  const center = new THREE.Vector3(
    Number(bounds?.min?.[0] ?? 0) +
      (Number(bounds?.max?.[0] ?? 0) - Number(bounds?.min?.[0] ?? 0)) * 0.5,
    Number(bounds?.min?.[1] ?? 0) +
      (Number(bounds?.max?.[1] ?? 0) - Number(bounds?.min?.[1] ?? 0)) * 0.5,
    Number(bounds?.min?.[2] ?? 0) +
      (Number(bounds?.max?.[2] ?? 0) - Number(bounds?.min?.[2] ?? 0)) * 0.5
  ).applyMatrix4(matrix);
  const size = Math.max(1, Number(cellSize) || 64);
  return [center.x, center.y, center.z]
    .map(value => Math.floor(value / size))
    .join(":");
}

function familyBatchSpatialCell(matrix, cellSize = 64) {
  const size = Math.max(1, Number(cellSize) || 64);
  const elements = matrix.elements ?? matrix;
  return [12, 13, 14].map(index =>
    Math.floor(Number(elements[index] ?? 0) / size)
  ).join(":");
}

function absoluteInstanceColorFactor(material, desiredValue) {
  const desired = desiredValue?.isColor
    ? desiredValue.clone()
    : new THREE.Color(desiredValue ?? 0xffffff);
  const base = material?.color?.isColor
    ? material.color
    : new THREE.Color(0xffffff);
  const minimum = 1e-6;
  for (const channel of ["r", "g", "b"]) {
    if (Math.abs(base[channel]) < minimum) base[channel] = minimum;
  }
  return new THREE.Color(
    desired.r / base.r,
    desired.g / base.g,
    desired.b / base.b
  );
}

function bufferGeometryAttributeSignature(geometry) {
  const attributes = Object.entries(geometry?.attributes ?? {})
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, attribute]) => [
      name,
      Number(attribute.itemSize),
      Boolean(attribute.normalized),
      attribute.array?.constructor?.name ?? "TypedArray"
    ]);
  return JSON.stringify({
    indexed: Boolean(geometry?.index),
    indexType: geometry?.index?.array?.constructor?.name ?? null,
    attributes
  });
}

function surfacePlacementFromHit({ hit, objectId, ray, target, previous }) {
  if (!hit?.point || !hit?.face) return null;
  const normal = transformHitNormalToWorld(hit);
  if (!normal || normal.lengthSq() <= 1e-18) return null;
  normal.normalize();
  if (target.frontFacesOnly && normal.dot(ray.direction) >= -1e-7) {
    return null;
  }
  const surfacePoint = hit.point.clone();
  const point = surfacePoint.clone().addScaledVector(
    normal,
    Number(target.offset) || 0
  );
  const previousPoint = Array.isArray(previous?.point)
    ? new THREE.Vector3().fromArray(previous.point)
    : null;
  const jumpDistance = previousPoint ? point.distanceTo(previousPoint) : 0;
  const maximumJump = Number(target.maximumJump);
  const jumpRejected = Boolean(
    previousPoint && Number.isFinite(maximumJump) && maximumJump > 0 &&
    jumpDistance > maximumJump
  );
  const triangle = surfaceHitTriangle(hit);
  const barycentric = triangle
    ? triangle.getBarycoord(surfacePoint, new THREE.Vector3())
    : null;
  const tangent = triangle
    ? triangle.b.clone().sub(triangle.a)
        .addScaledVector(normal, -triangle.b.clone().sub(triangle.a).dot(normal))
    : new THREE.Vector3(1, 0, 0);
  if (tangent.lengthSq() <= 1e-18) {
    tangent.set(1, 0, 0).addScaledVector(normal, -normal.x);
  }
  tangent.normalize();
  return Object.freeze({
    version: "drawing-surface-placement-v1",
    point: Object.freeze(point.toArray()),
    surfacePoint: Object.freeze(surfacePoint.toArray()),
    normal: Object.freeze(normal.toArray()),
    tangent: Object.freeze(tangent.toArray()),
    objectId: String(objectId),
    faceIndex: Number.isInteger(hit.faceIndex) ? hit.faceIndex : null,
    instanceId: Number.isInteger(hit.instanceId) ? hit.instanceId : null,
    batchId: Number.isInteger(hit.batchId) ? hit.batchId : null,
    barycentric: barycentric
      ? Object.freeze(barycentric.toArray())
      : null,
    distance: Number(hit.distance) || 0,
    jumpDistance,
    jumpRejected,
    source: "surface-target"
  });
}

function surfaceHitTriangle(hit) {
  const geometry = hit?.object?.geometry;
  const position = geometry?.getAttribute?.("position");
  const face = hit?.face;
  if (!position || !face) return null;
  const matrix = hitWorldMatrix(hit);
  return new THREE.Triangle(
    new THREE.Vector3(
      position.getX(face.a), position.getY(face.a), position.getZ(face.a)
    ).applyMatrix4(matrix),
    new THREE.Vector3(
      position.getX(face.b), position.getY(face.b), position.getZ(face.b)
    ).applyMatrix4(matrix),
    new THREE.Vector3(
      position.getX(face.c), position.getY(face.c), position.getZ(face.c)
    ).applyMatrix4(matrix)
  );
}

function createPreviewId() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `preview-${Date.now().toString(36)}-${
    Math.random().toString(36).slice(2)
  }`;
}


function normalizeMeshDisplaySettings(value = {}) {
  return {
    vertices: value.vertices === undefined ? true : Boolean(value.vertices),
    edges: value.edges === undefined ? true : Boolean(value.edges),
    faces: value.faces === undefined ? true : Boolean(value.faces),
    xray: value.xray === undefined ? true : Boolean(value.xray)
  };
}

function meshComponentCount(topology, mode) {
  if (mode === "edge") return topology.edgeCount;
  if (mode === "face") return topology.faceCount;
  return topology.vertexCount;
}

function pointSegmentDistance2D(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  const parameter = lengthSquared <= 1e-12
    ? 0
    : THREE.MathUtils.clamp(
        ((px - ax) * dx + (py - ay) * dy) / lengthSquared,
        0,
        1
      );
  return Math.hypot(px - (ax + dx * parameter), py - (ay + dy * parameter));
}

function createThreeLight(type, descriptor = {}) {
  const color = descriptor.color ?? "#ffffff";
  const intensity = Number(descriptor.intensity ?? 3);
  if (type === "ambient") return new THREE.AmbientLight(color, intensity);
  if (type === "directional") return new THREE.DirectionalLight(color, intensity);
  if (type === "spot") {
    return new THREE.SpotLight(
      color,
      intensity,
      Number(descriptor.distance ?? 0),
      Number(descriptor.angleDeg ?? 45) * Math.PI / 180,
      Number(descriptor.penumbra ?? 0.2),
      Number(descriptor.decay ?? 2)
    );
  }
  return new THREE.PointLight(
    color,
    intensity,
    Number(descriptor.distance ?? 0),
    Number(descriptor.decay ?? 2)
  );
}

function lightRayGeometry(type) {
  const lines = [];
  if (["directional", "spot"].includes(type)) {
    const spread = type === "spot" ? 0.45 : 0.2;
    for (const [x, y] of [[-1,-1],[1,-1],[1,1],[-1,1]]) {
      lines.push(0, 0, 0, x * spread, y * spread, -0.9);
    }
  } else {
    for (const axis of [[1,0,0],[0,1,0],[0,0,1]]) {
      for (const sign of [-1, 1]) {
        lines.push(0, 0, 0, axis[0] * sign * 0.65, axis[1] * sign * 0.65, axis[2] * sign * 0.65);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(lines, 3));
  return geometry;
}
