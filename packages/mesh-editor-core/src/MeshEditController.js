import * as THREE from "three";
import { HierarchyIndex } from "../../scene-hierarchy/src/index.js";
import {
  DEFAULT_MESH_DEFORMATION_SETTINGS,
  applyMeshDeformation,
  createMeshInfluenceField,
  normalizeMeshDeformationSettings,
  transformLocalPositionsWithInfluenceInto
} from "./MeshDeformation.js";
import { buildMeshTopology } from "./MeshTopology.js";
import {
  applyMeshTopologyOperation,
  componentVertices,
  meshSelectionOperation,
  normalizeMeshComponentMode
} from "./MeshTopologyOperations.js";
import {
  affineDeltaWorld,
  assertInvertibleWorldMatrix,
  cameraFrameQuaternion,
  coincidentVertexGroups,
  composeRotationFrame,
  constrainAffineValue,
  expandCoincidentSelection,
  normalizeMeshConstraint,
  selectedVertexPivotWorld,
  translatePivotToWorld
} from "./MeshEditMath.js";

export class MeshEditController {
  static apiVersion = "mesh-edit-controller-v3";
  #session = null;
  #listeners = new Set();
  #unsubscribeSandbox = null;

  constructor({ sandbox, editor, renderer, geometryRegistry }) {
    if (!sandbox?.dispatch || !sandbox?.getSnapshot) {
      throw new TypeError("MeshEditController exige sandbox compatível.");
    }
    if (!editor?.selection?.snapshot) {
      throw new TypeError("MeshEditController exige editor compatível.");
    }
    if (!renderer?.beginMeshEdit || !renderer?.endMeshEdit) {
      throw new TypeError("MeshEditController exige renderer compatível.");
    }
    if (!geometryRegistry?.create || !geometryRegistry?.normalize) {
      throw new TypeError("MeshEditController exige GeometryRegistry.");
    }
    this.sandbox = sandbox;
    this.editor = editor;
    this.renderer = renderer;
    this.geometryRegistry = geometryRegistry;
    this.#unsubscribeSandbox = sandbox.subscribe((state, changes = []) => {
      const session = this.#session;
      if (!session || this.sandbox.revision === session.baseRevision) return;
      const object = state.objects.find(
        candidate => candidate.id === session.objectId
      );
      if (!object) {
        this.renderer.endMeshEdit({ restoreBatch: false });
        this.#session = null;
        this.#notify();
        return;
      }
      if (this.#compatibleWithSession(state, object, session)) {
        session.objectName = object.name ?? session.objectId;
        session.baseRevision = this.sandbox.revision;
        session.stale = false;
        session.staleChanges = [];
      } else {
        session.stale = true;
        session.staleChanges = changes.map(change => ({ ...change }));
      }
      this.#notify();
    });
  }

  get active() { return this.#session !== null; }

  enter({ selectAll = true } = {}) {
    if (this.#session) return this.status();
    const selection = this.editor.selection.snapshot();
    if (selection.members.length !== 1) {
      throw new Error("A edição de malha exige exatamente um objeto selecionado.");
    }
    const objectId = selection.members[0].objectId;
    const state = this.sandbox.getSnapshot();
    const object = state.objects.find(candidate => candidate.id === objectId);
    const availability = this.#editAvailability(object);
    if (!availability.ok) {
      throw new Error(availability.message);
    }
    const hierarchy = new HierarchyIndex(state.objects);
    const sourceDescriptor = this.geometryRegistry.describeLegacyObject(object);
    const geometry = this.geometryRegistry.create(sourceDescriptor);
    const descriptor = this.geometryRegistry.normalize(
      geometryToBufferDescriptor(geometry)
    );
    geometry.dispose?.();
    const objectWorldMatrix = hierarchy.worldMatrixOf(objectId);
    assertInvertibleWorldMatrix(objectWorldMatrix);
    const localFrame = composeRotationFrame([
      ...[...hierarchy.ancestorsOf(objectId)]
        .reverse()
        .map(id => hierarchy.node(id).rotation ?? [0, 0, 0, 1]),
      object.rotation ?? [0, 0, 0, 1]
    ]);
    const groups = coincidentVertexGroups(descriptor.positions);
    const topology = buildMeshTopology(descriptor);
    const selectedIndices = selectAll
      ? descriptor.positions.map((_, index) => index)
      : [];
    this.#session = {
      objectId,
      objectName: object.name ?? objectId,
      baseRevision: this.sandbox.revision,
      sourceType: sourceDescriptor.type,
      sourceGeometryKey: this.geometryRegistry.key(sourceDescriptor),
      initialBufferKey: this.geometryRegistry.key(descriptor),
      descriptor,
      objectWorldMatrix: [...objectWorldMatrix],
      componentMode: "vertex",
      componentSelections: {
        vertex: new Set(selectedIndices),
        edge: new Set(),
        face: new Set()
      },
      activeComponents: {
        vertex: selectedIndices.at(-1) ?? null,
        edge: null,
        face: null
      },
      selectedIndices: new Set(selectedIndices),
      activeVertex: selectedIndices.at(-1) ?? null,
      pivotWorld: selectedVertexPivotWorld({
        positions: descriptor.positions,
        selectedIndices,
        objectWorldMatrix
      }),
      weldCoincident: true,
      occlusion: true,
      groups,
      topology,
      constraint: "free",
      snap: {
        enabled: false,
        mode: "auto",
        scope: "active",
        anchor: "active",
        tolerancePixels: 18,
        self: false
      },
      deformation: normalizeMeshDeformationSettings(
        DEFAULT_MESH_DEFORMATION_SETTINGS
      ),
      topologyOptions: {
        manifoldOnly: true,
        removeUnused: true,
        autoNormals: true,
        preserveBoundary: true
      },
      display: {
        vertices: true,
        edges: true,
        faces: true,
        xray: true
      },
      history: { entries: [], index: -1, limit: 100 },
      lastOperation: "Inicial",
      frameMode: "local",
      previousFrameMode: "local",
      frameQuaternion: localFrame,
      localFrameQuaternion: localFrame,
      viewerFrameQuaternion: null,
      dirty: false,
      stale: false,
      staleChanges: []
    };
    try {
      this.renderer.beginMeshEdit({
        objectId,
        geometry: descriptor,
        objectWorldMatrix,
        selectedIndices,
        componentMode: "vertex",
        selectedComponents: selectedIndices,
        frameMode: "local",
        frameQuaternion: localFrame,
        options: {
          occlusion: true,
          constraint: "free",
          snap: this.#session.snap,
          deformation: this.#session.deformation,
          display: this.#session.display
        },
        onVertexPick: payload => this.#handleComponentPick({ mode: "vertex", ...payload }),
        onComponentPick: payload => this.#handleComponentPick(payload),
        onTransformStart: () => this.#recordHistory("Antes do gizmo"),
        onTransformPreview: positions => this.#acceptPreview(positions),
        onTransformCommit: positions => this.#acceptTransform(positions)
      });
    } catch (error) {
      this.#session = null;
      throw error;
    }
    this.#recordHistory("Inicial", { force: true });
    // A sessão começa com todos os vértices selecionados; mostrar o gizmo
    // de translação torna a mudança de modo imediatamente visível. O clique
    // nos marcadores continua selecionando vértices mesmo neste modo.
    this.renderer.setTransformMode("translate");
    this.#notify();
    return this.status();
  }

  commit() {
    const session = this.#requireSession();
    if (this.sandbox.revision !== session.baseRevision) {
      throw new Error(
        "O mundo mudou durante a edição. Cancele e reabra a malha para evitar sobrescrever alterações externas."
      );
    }
    if (this.geometryRegistry.key(session.descriptor) === session.initialBufferKey) {
      this.renderer.endMeshEdit({ restoreBatch: true });
      this.#session = null;
      this.#notify();
      return Object.freeze({
        changed: false,
        objectId: session.objectId,
        vertexCount: session.descriptor.positions.length
      });
    }
    const geometry = this.geometryRegistry.normalize({
      ...session.descriptor,
      type: "buffer",
      normals: session.topologyOptions.autoNormals ? [] : session.descriptor.normals
    });
    const changed = this.sandbox.dispatch({
      type: "object.geometry.replace",
      id: session.objectId,
      geometry,
      source: "mesh-edit"
    });
    this.renderer.endMeshEdit({ restoreBatch: true });
    this.#session = null;
    this.#notify();
    return Object.freeze({
      changed,
      objectId: session.objectId,
      vertexCount: geometry.positions.length
    });
  }

  cancel() {
    if (!this.#session) return { changed: false, active: false };
    const objectId = this.#session.objectId;
    this.renderer.endMeshEdit({ restoreBatch: true });
    this.#session = null;
    this.#notify();
    return { changed: false, active: false, objectId };
  }

  clearSelection() {
    return this.selectComponents("none");
  }

  selectAll() {
    return this.selectComponents("all");
  }

  invertSelection() {
    return this.selectComponents("invert");
  }

  setComponentMode(mode) {
    const session = this.#requireSession();
    session.componentMode = normalizeMeshComponentMode(mode);
    this.#syncSelection();
    return this.status();
  }

  selectComponents(operation, options = {}) {
    const session = this.#requireSession();
    const selected = session.componentSelections[session.componentMode];
    const result = meshSelectionOperation({
      topology: session.topology,
      mode: session.componentMode,
      selectedIndices: selected,
      activeIndex: session.activeComponents[session.componentMode],
      operation,
      options
    });
    session.componentSelections[session.componentMode] = new Set(result.indices);
    session.activeComponents[session.componentMode] = result.activeIndex;
    this.#syncSelection();
    return this.status();
  }

  applyTopology({ operation, options = {} } = {}) {
    const session = this.#requireSession();
    const selected = session.componentSelections[session.componentMode];
    const result = applyMeshTopologyOperation({
      descriptor: session.descriptor,
      topology: session.topology,
      componentMode: session.componentMode,
      selectedIndices: selected,
      activeIndex: session.activeComponents[session.componentMode],
      operation,
      options: { ...session.topologyOptions, ...options }
    });
    this.#recordHistory(`Antes de ${result.label}`);
    session.descriptor = result.descriptor;
    session.topology = result.topology;
    session.componentMode = result.selection.mode;
    session.componentSelections = { vertex: new Set(), edge: new Set(), face: new Set() };
    session.activeComponents = { vertex: null, edge: null, face: null };
    session.componentSelections[result.selection.mode] = new Set(result.selection.indices);
    session.activeComponents[result.selection.mode] = result.selection.activeIndex;
    this.#markGeometryChanged(session, { topology: result.topology });
    this.renderer.updateMeshEditGeometry(session.descriptor);
    this.#syncSelection({ notify: false });
    this.#recordHistory(result.label);
    this.#notify();
    return Object.freeze({ ...this.status(), diagnostics: result.diagnostics });
  }

  setTopologyOptions(patch = {}) {
    const session = this.#requireSession();
    for (const key of ["manifoldOnly", "removeUnused", "autoNormals", "preserveBoundary"]) {
      if (patch[key] !== undefined) session.topologyOptions[key] = Boolean(patch[key]);
    }
    this.#notify();
    return this.status();
  }

  setDisplayOptions(patch = {}) {
    const session = this.#requireSession();
    for (const key of ["vertices", "edges", "faces", "xray"]) {
      if (patch[key] !== undefined) session.display[key] = Boolean(patch[key]);
    }
    this.renderer.updateMeshEditDisplay?.(session.display);
    this.#notify();
    return this.status();
  }

  setOptions({ weldCoincident, occlusion } = {}) {
    const session = this.#requireSession();
    if (weldCoincident !== undefined) {
      session.weldCoincident = Boolean(weldCoincident);
      if (session.weldCoincident && session.componentMode === "vertex") {
        this.#refreshGroups(session);
        const expanded = expandCoincidentSelection(
          session.componentSelections.vertex,
          session.groups
        );
        session.componentSelections.vertex = new Set(expanded);
        session.activeComponents.vertex = expanded.at(-1) ?? null;
      }
    }
    if (occlusion !== undefined) session.occlusion = Boolean(occlusion);
    this.renderer.updateMeshEditOptions({ occlusion: session.occlusion });
    this.#syncSelection();
    return this.status();
  }

  setConstraint(mode) {
    const session = this.#requireSession();
    session.constraint = normalizeMeshConstraint(mode);
    this.renderer.setMeshEditConstraint?.(session.constraint);
    this.#notify();
    return this.status();
  }

  setSnap(patch = {}) {
    const session = this.#requireSession();
    const next = { ...session.snap };
    if (patch.enabled !== undefined) next.enabled = Boolean(patch.enabled);
    if (patch.mode !== undefined) {
      const mode = String(patch.mode).toLowerCase();
      if (!["auto", "vertex", "edge", "face"].includes(mode)) {
        throw new RangeError(`Modo de snap desconhecido: ${patch.mode}.`);
      }
      next.mode = mode;
    }
    if (patch.scope !== undefined) {
      const scope = String(patch.scope).toLowerCase();
      if (!["active", "scene"].includes(scope)) {
        throw new RangeError(`Escopo de snap desconhecido: ${patch.scope}.`);
      }
      next.scope = scope;
    }
    if (patch.anchor !== undefined) {
      const anchor = String(patch.anchor).toLowerCase();
      if (!["active", "pivot", "nearest"].includes(anchor)) {
        throw new RangeError(`Âncora de snap desconhecida: ${patch.anchor}.`);
      }
      next.anchor = anchor;
    }
    if (patch.tolerancePixels !== undefined) {
      const tolerance = Number(patch.tolerancePixels);
      if (!Number.isFinite(tolerance) || tolerance < 2 || tolerance > 80) {
        throw new RangeError("A tolerância de snap deve ficar entre 2 e 80 px.");
      }
      next.tolerancePixels = tolerance;
    }
    if (patch.self !== undefined) next.self = Boolean(patch.self);
    session.snap = next;
    this.renderer.updateMeshEditSnap?.(next);
    this.#notify();
    return this.status();
  }

  setDeformation(patch = {}) {
    const session = this.#requireSession();
    const next = normalizeMeshDeformationSettings({
      ...session.deformation,
      ...patch,
      variables: patch.variables === undefined
        ? session.deformation.variables
        : patch.variables,
      elastic: {
        ...session.deformation.elastic,
        ...(patch.elastic ?? {})
      }
    });
    this.renderer.updateMeshEditDeformation?.(next);
    session.deformation = next;
    this.#notify();
    return this.status();
  }

  undo() {
    const session = this.#requireSession();
    if (session.history.index <= 0) return this.status();
    session.history.index -= 1;
    this.#restoreHistoryEntry(session.history.entries[session.history.index]);
    return this.status();
  }

  redo() {
    const session = this.#requireSession();
    if (session.history.index >= session.history.entries.length - 1) {
      return this.status();
    }
    session.history.index += 1;
    this.#restoreHistoryEntry(session.history.entries[session.history.index]);
    return this.status();
  }

  applyProcedural(args = {}) {
    const session = this.#requireTransformableSelection();
    const result = applyMeshDeformation({
      descriptor: session.descriptor,
      selectedIndices: session.selectedIndices,
      objectWorldMatrix: session.objectWorldMatrix,
      frameQuaternion: session.frameQuaternion,
      constraint: session.constraint,
      ...args
    });
    this.#recordHistory(`Antes de procedural ${args.operation ?? "move"}`);
    session.descriptor = Object.freeze({
      ...session.descriptor,
      positions: result.positions.map(point => [...point])
    });
    this.#markGeometryChanged(session);
    this.renderer.updateMeshEditGeometry(session.descriptor);
    this.renderer.updateMeshEditInfluence?.(
      result.affectedIndices,
      result.weights
    );
    this.#recordHistory(`Procedural ${args.operation ?? "move"}`);
    this.#notify();
    return Object.freeze({
      ...this.status(),
      affectedCount: result.affectedIndices.length,
      metric: result.metric,
      falloff: result.falloff
    });
  }

  setFrame(mode) {
    const session = this.#requireSession();
    const next = String(mode);
    if (!['world', 'local', 'viewer'].includes(next)) {
      throw new RangeError(`Referencial de malha desconhecido: ${mode}.`);
    }
    if (next !== "viewer") session.previousFrameMode = next;
    if (next === "viewer") {
      session.viewerFrameQuaternion = cameraFrameQuaternion(
        this.renderer.readNavigationCamera().quaternion
      );
    }
    session.frameMode = next;
    session.frameQuaternion = next === "world"
      ? [0, 0, 0, 1]
      : next === "local"
        ? [...session.localFrameQuaternion]
        : [...session.viewerFrameQuaternion];
    this.renderer.setMeshEditFrame({
      mode: session.frameMode,
      quaternion: session.frameQuaternion
    });
    this.#notify();
    return this.status();
  }

  toggleViewerFrame() {
    const session = this.#requireSession();
    return this.setFrame(
      session.frameMode === "viewer"
        ? session.previousFrameMode
        : "viewer"
    );
  }

  toggleFrameSpace() {
    const session = this.#requireSession();
    return this.setFrame(session.frameMode === "local" ? "world" : "local");
  }

  translate(delta) {
    return this.#applyAffine("move", delta);
  }

  rotate(degrees) {
    return this.#applyAffine("rotate", degrees);
  }

  scale(factors) {
    return this.#applyAffine("scale", factors);
  }

  setPivotPosition(position) {
    const session = this.#requireTransformableSelection();
    this.#recordHistory("Antes de posicionar pivô");
    session.descriptor = Object.freeze({
      ...session.descriptor,
      positions: translatePivotToWorld({
        positions: session.descriptor.positions,
        selectedIndices: session.selectedIndices,
        objectWorldMatrix: session.objectWorldMatrix,
        targetWorld: position
      })
    });
    this.#markGeometryChanged(session);
    this.renderer.updateMeshEditGeometry(session.descriptor);
    this.#recordHistory("Posicionar pivô");
    this.#notify();
    return this.status();
  }

  applyAffine({ operations = [] } = {}) {
    if (operations.length) this.#recordHistory("Antes da transformação afim");
    for (const operation of operations) {
      this.#applyAffine(operation.type, operation.value, {
        notify: false,
        recordHistory: false
      });
    }
    if (operations.length) this.#recordHistory("Transformação afim");
    this.#notify();
    return this.status();
  }

  status() {
    if (!this.#session) {
      const selection = this.editor.selection.snapshot();
      const selectedId = selection.members.length === 1
        ? selection.members[0].objectId
        : null;
      const selectedObject = selectedId
        ? this.sandbox.getSnapshot().objects.find(object => object.id === selectedId)
        : null;
      const availability = selection.members.length === 1
        ? this.#editAvailability(selectedObject)
        : {
            ok: false,
            message: "Selecione exatamente um objeto."
          };
      return Object.freeze({
        active: false,
        componentMode: "vertex",
        frameMode: null,
        viewerPlaneLocked: false,
        constraint: "free",
        snap: null,
        deformation: null,
        topologyOptions: null,
        display: null,
        canUndo: false,
        canRedo: false,
        canEnter: availability.ok,
        selectionCount: selection.members.length,
        reason: availability.ok ? null : availability.message
      });
    }
    const session = this.#session;
    const rendererStatus = this.renderer.getMeshEditStatus?.() ?? {};
    return Object.freeze({
      active: true,
      objectId: session.objectId,
      objectName: session.objectName,
      sourceType: session.sourceType,
      componentMode: session.componentMode,
      vertexCount: session.descriptor.positions.length,
      uniqueVertexCount: session.groups.groups.length,
      edgeCount: session.topology.edgeCount,
      faceCount: session.topology.faceCount,
      boundaryEdgeCount: session.topology.boundaryEdges?.length ?? 0,
      looseEdgeCount: session.topology.looseEdges?.length ?? 0,
      nonManifoldEdgeCount: session.topology.nonManifoldEdges?.length ?? 0,
      selectedCount: session.componentSelections[session.componentMode].size,
      selectedVertexCount: session.selectedIndices.size,
      activeComponent: session.activeComponents[session.componentMode],
      activeVertex: session.activeVertex,
      frameMode: session.frameMode,
      viewerPlaneLocked: session.frameMode === "viewer",
      frameQuaternion: Object.freeze([...session.frameQuaternion]),
      constraint: session.constraint,
      snap: Object.freeze({ ...session.snap }),
      deformation: Object.freeze({
        ...session.deformation,
        variables: Object.freeze({ ...session.deformation.variables }),
        elastic: Object.freeze({ ...session.deformation.elastic })
      }),
      topologyOptions: Object.freeze({ ...session.topologyOptions }),
      display: Object.freeze({ ...session.display }),
      affectedCount: rendererStatus.affectedCount ??
        session.selectedIndices.size,
      snapCandidate: rendererStatus.snapCandidate ?? null,
      canUndo: session.history.index > 0,
      canRedo: session.history.index < session.history.entries.length - 1,
      undoDepth: session.history.index,
      redoDepth: session.history.entries.length - session.history.index - 1,
      historyLength: session.history.entries.length,
      lastOperation: session.lastOperation,
      weldCoincident: session.weldCoincident,
      occlusion: session.occlusion,
      dirty: session.dirty,
      stale: session.stale,
      staleChanges: Object.freeze(structuredClone(session.staleChanges)),
      baseRevision: session.baseRevision,
      currentRevision: this.sandbox.revision,
      pivotWorld: session.pivotWorld
        ? Object.freeze([...session.pivotWorld])
        : null
    });
  }

  subscribe(listener) {
    if (typeof listener !== "function") {
      throw new TypeError("Listener de edição de malha deve ser função.");
    }
    this.#listeners.add(listener);
    listener(this.status());
    return () => this.#listeners.delete(listener);
  }

  dispose() {
    this.cancel();
    this.#unsubscribeSandbox?.();
    this.#unsubscribeSandbox = null;
    this.#listeners.clear();
  }

  #applyAffine(type, value, {
    notify = true,
    recordHistory = true
  } = {}) {
    const session = this.#requireTransformableSelection();
    const pivotWorld = session.pivotWorld;
    const constrainedValue = constrainAffineValue({
      type,
      value,
      constraint: session.constraint
    });
    const deltaWorldMatrix = affineDeltaWorld({
      type,
      value: constrainedValue,
      pivotWorld,
      frameQuaternion: session.frameQuaternion
    });
    const field = createMeshInfluenceField({
      descriptor: session.descriptor,
      selectedIndices: session.selectedIndices,
      objectWorldMatrix: session.objectWorldMatrix,
      frameQuaternion: session.frameQuaternion,
      ...session.deformation
    });
    if (recordHistory) this.#recordHistory(`Antes de ${type} afim`);
    const positions = session.descriptor.positions.map(point => [...point]);
    transformLocalPositionsWithInfluenceInto({
      sourcePositions: session.descriptor.positions,
      targetPositions: positions,
      affectedIndices: field.affectedIndices,
      weights: field.weights,
      objectWorldMatrix: session.objectWorldMatrix,
      deltaWorldMatrix,
      type,
      pivotWorld: field.pivotWorld,
      frameQuaternion: session.frameQuaternion
    });
    session.descriptor = Object.freeze({
      ...session.descriptor,
      positions
    });
    this.#markGeometryChanged(session);
    this.renderer.updateMeshEditGeometry(session.descriptor);
    if (recordHistory) this.#recordHistory(`${type} afim`);
    if (notify) this.#notify();
    return this.status();
  }

  #handleComponentPick({
    mode = null,
    index = null,
    indices = null,
    operation = "replace"
  }) {
    const session = this.#requireSession();
    const componentMode = normalizeMeshComponentMode(mode ?? session.componentMode);
    if (componentMode !== session.componentMode) session.componentMode = componentMode;
    let picked = Array.isArray(indices)
      ? indices.map(Number)
      : index === null || index === undefined
        ? []
        : [Number(index)];
    if (componentMode === "vertex" && session.weldCoincident) {
      picked = expandCoincidentSelection(picked, session.groups);
    }
    const next = new Set(session.componentSelections[componentMode]);
    if (!picked.length) {
      if (operation === "replace") next.clear();
    } else {
      if (operation === "replace") next.clear();
      for (const candidate of picked) {
        if (operation === "remove") next.delete(candidate);
        else if (operation === "toggle") {
          if (next.has(candidate)) next.delete(candidate);
          else next.add(candidate);
        } else next.add(candidate);
      }
    }
    session.componentSelections[componentMode] = next;
    const active = picked.at(-1);
    session.activeComponents[componentMode] = next.has(active)
      ? active
      : [...next].at(-1) ?? null;
    this.#syncSelection();
    return this.status();
  }

  #acceptPreview() {
    const session = this.#requireSession();
    const changed = !session.dirty;
    session.dirty = true;
    if (changed) this.#notify();
  }

  #acceptTransform(positions) {
    const session = this.#requireSession();
    session.descriptor = Object.freeze({
      ...session.descriptor,
      positions: positions.map(point => [...point])
    });
    this.#markGeometryChanged(session);
    this.#recordHistory("Gizmo");
    this.#notify();
  }

  #editAvailability(object) {
    if (!object || ["camera", "group"].includes(object.kind)) {
      return {
        ok: false,
        message: "O objeto selecionado não possui malha editável."
      };
    }
    try {
      this.geometryRegistry.describeLegacyObject(object);
    } catch {
      return {
        ok: false,
        message: "A geometria do objeto selecionado não é editável."
      };
    }
    const rendererAvailability = this.renderer.canBeginMeshEdit?.(object.id);
    if (!rendererAvailability || rendererAvailability.ok) {
      return { ok: true, message: null };
    }
    const messages = {
      "mesh-edit-active": "Já existe uma edição de malha ativa.",
      "transform-active": "Finalize o arrasto atual antes de editar a malha.",
      "animation-active": "Interrompa a animação deste objeto antes de editar sua malha.",
      "shared-preview-active": "Aguarde a transformação compartilhada deste objeto terminar.",
      "object-not-renderable": "O objeto selecionado não está disponível como malha renderizável."
    };
    return {
      ok: false,
      message: messages[rendererAvailability.reason] ??
        "A malha selecionada não pode ser editada agora."
    };
  }

  #compatibleWithSession(state, object, session) {
    try {
      const descriptor = this.geometryRegistry.describeLegacyObject(object);
      if (this.geometryRegistry.key(descriptor) !== session.sourceGeometryKey) {
        return false;
      }
      const hierarchy = new HierarchyIndex(state.objects);
      return matricesNear(
        hierarchy.worldMatrixOf(session.objectId),
        session.objectWorldMatrix
      );
    } catch {
      return false;
    }
  }

  #refreshGroups(session) {
    session.groups = coincidentVertexGroups(session.descriptor.positions);
  }

  #refreshPivot(session) {
    session.pivotWorld = selectedVertexPivotWorld({
      positions: session.descriptor.positions,
      selectedIndices: session.selectedIndices,
      objectWorldMatrix: session.objectWorldMatrix
    });
  }

  #syncSelection({ notify = true } = {}) {
    const session = this.#requireSession();
    const selectedComponents = session.componentSelections[session.componentMode];
    let selectedVertices = componentVertices(
      session.topology,
      session.componentMode,
      selectedComponents
    );
    if (session.weldCoincident && session.componentMode === "vertex") {
      selectedVertices = expandCoincidentSelection(selectedVertices, session.groups);
      session.componentSelections.vertex = new Set(selectedVertices);
    }
    session.selectedIndices = new Set(selectedVertices);
    session.activeVertex = session.componentMode === "vertex"
      ? session.activeComponents.vertex
      : selectedVertices.at(-1) ?? null;
    this.#refreshPivot(session);
    if (this.renderer.updateMeshEditComponentSelection) {
      this.renderer.updateMeshEditComponentSelection({
        mode: session.componentMode,
        selectedComponents: [...session.componentSelections[session.componentMode]],
        activeComponent: session.activeComponents[session.componentMode],
        selectedVertices,
        activeVertex: session.activeVertex
      });
    } else {
      this.renderer.updateMeshEditSelection(selectedVertices, {
        activeVertex: session.activeVertex
      });
    }
    if (notify) this.#notify();
  }

  #markGeometryChanged(session, { topology = null } = {}) {
    this.#refreshGroups(session);
    session.topology = topology ?? buildMeshTopology(session.descriptor);
    const counts = {
      vertex: session.topology.vertexCount,
      edge: session.topology.edgeCount,
      face: session.topology.faceCount
    };
    for (const mode of ["vertex", "edge", "face"]) {
      session.componentSelections[mode] = new Set(
        [...session.componentSelections[mode]].filter(index =>
          Number.isInteger(index) && index >= 0 && index < counts[mode]
        )
      );
      if (!session.componentSelections[mode].has(session.activeComponents[mode])) {
        session.activeComponents[mode] = [...session.componentSelections[mode]].at(-1) ?? null;
      }
    }
    let selectedVertices = componentVertices(
      session.topology,
      session.componentMode,
      session.componentSelections[session.componentMode]
    );
    if (session.weldCoincident && session.componentMode === "vertex") {
      selectedVertices = expandCoincidentSelection(selectedVertices, session.groups);
      session.componentSelections.vertex = new Set(selectedVertices);
    }
    session.selectedIndices = new Set(selectedVertices);
    session.activeVertex = session.componentMode === "vertex"
      ? session.activeComponents.vertex
      : selectedVertices.at(-1) ?? null;
    this.#refreshPivot(session);
    session.dirty = this.geometryRegistry.key(session.descriptor) !==
      session.initialBufferKey;
  }

  #recordHistory(label, { force = false } = {}) {
    const session = this.#requireSession();
    const entry = {
      label: String(label ?? "Operação"),
      key: this.geometryRegistry.key(session.descriptor),
      descriptor: structuredClone(session.descriptor),
      componentMode: session.componentMode,
      componentSelections: Object.fromEntries(
        Object.entries(session.componentSelections).map(([mode, values]) => [mode, [...values]])
      ),
      activeComponents: { ...session.activeComponents }
    };
    const current = session.history.entries[session.history.index];
    const selectionKey = JSON.stringify([
      entry.componentMode, entry.componentSelections, entry.activeComponents
    ]);
    entry.selectionKey = selectionKey;
    if (!force && current?.key === entry.key && current?.selectionKey === selectionKey) return false;
    session.history.entries.splice(session.history.index + 1);
    session.history.entries.push(entry);
    if (session.history.entries.length > session.history.limit) {
      session.history.entries.shift();
    }
    session.history.index = session.history.entries.length - 1;
    session.lastOperation = entry.label;
    return true;
  }

  #restoreHistoryEntry(entry) {
    const session = this.#requireSession();
    session.descriptor = this.geometryRegistry.normalize(entry.descriptor);
    session.componentMode = normalizeMeshComponentMode(entry.componentMode);
    session.componentSelections = {
      vertex: new Set(entry.componentSelections.vertex ?? []),
      edge: new Set(entry.componentSelections.edge ?? []),
      face: new Set(entry.componentSelections.face ?? [])
    };
    session.activeComponents = {
      vertex: entry.activeComponents.vertex ?? null,
      edge: entry.activeComponents.edge ?? null,
      face: entry.activeComponents.face ?? null
    };
    session.lastOperation = entry.label;
    this.#markGeometryChanged(session);
    this.renderer.updateMeshEditGeometry(session.descriptor);
    this.#syncSelection({ notify: false });
    this.#notify();
  }

  #requireSession() {
    if (!this.#session) throw new Error("Nenhuma edição de malha está ativa.");
    return this.#session;
  }

  #requireTransformableSelection() {
    const session = this.#requireSession();
    if (!session.selectedIndices.size) {
      throw new Error("Selecione ao menos um vértice da malha.");
    }
    return session;
  }

  #notify() {
    const snapshot = this.status();
    for (const listener of [...this.#listeners]) {
      try { listener(snapshot); }
      catch (error) { console.error("Mesh edit listener failed", error); }
    }
  }
}

function matricesNear(left, right, epsilon = 1e-8) {
  if (!Array.isArray(left) || !Array.isArray(right) ||
      left.length !== 16 || right.length !== 16) return false;
  return left.every((value, index) =>
    Math.abs(Number(value) - Number(right[index])) <= epsilon
  );
}

function geometryToBufferDescriptor(geometry) {
  const position = geometry.getAttribute("position");
  if (!position) throw new Error("A geometria não possui atributo position.");
  const positions = [];
  for (let index = 0; index < position.count; index += 1) {
    positions.push([position.getX(index), position.getY(index), position.getZ(index)]);
  }
  const normal = geometry.getAttribute("normal");
  const normals = [];
  if (normal) {
    for (let index = 0; index < normal.count; index += 1) {
      normals.push([normal.getX(index), normal.getY(index), normal.getZ(index)]);
    }
  }
  const uv = geometry.getAttribute("uv");
  const uvs = [];
  if (uv) {
    for (let index = 0; index < uv.count; index += 1) {
      uvs.push([uv.getX(index), uv.getY(index)]);
    }
  }
  return {
    type: "buffer",
    positions,
    indices: geometry.index
      ? Array.from(geometry.index.array)
      : Array.from({ length: position.count }, (_, index) => index),
    normals,
    uvs,
    edges: []
  };
}
