import * as THREE from "three";
import { HierarchyIndex } from "../../scene-hierarchy/src/index.js";
import {
  affineDeltaWorld,
  assertInvertibleWorldMatrix,
  cameraFrameQuaternion,
  coincidentVertexGroups,
  composeRotationFrame,
  expandCoincidentSelection,
  selectedVertexPivotWorld,
  transformLocalPositions,
  translatePivotToWorld
} from "./MeshEditMath.js";

export class MeshEditController {
  static apiVersion = "mesh-edit-controller-v1";
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
        frameMode: "local",
        frameQuaternion: localFrame,
        options: { occlusion: true },
        onVertexPick: payload => this.#handleVertexPick(payload),
        onTransformPreview: positions => this.#acceptPreview(positions),
        onTransformCommit: positions => this.#acceptTransform(positions)
      });
    } catch (error) {
      this.#session = null;
      throw error;
    }
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
      normals: []
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
    const session = this.#requireSession();
    session.selectedIndices.clear();
    session.activeVertex = null;
    this.#syncSelection();
    return this.status();
  }

  selectAll() {
    const session = this.#requireSession();
    session.selectedIndices = new Set(
      session.descriptor.positions.map((_, index) => index)
    );
    session.activeVertex = session.descriptor.positions.length - 1;
    this.#syncSelection();
    return this.status();
  }

  invertSelection() {
    const session = this.#requireSession();
    const next = new Set();
    session.descriptor.positions.forEach((_, index) => {
      if (!session.selectedIndices.has(index)) next.add(index);
    });
    session.selectedIndices = next;
    session.activeVertex = [...next].at(-1) ?? null;
    this.#syncSelection();
    return this.status();
  }

  setOptions({ weldCoincident, occlusion } = {}) {
    const session = this.#requireSession();
    if (weldCoincident !== undefined) {
      session.weldCoincident = Boolean(weldCoincident);
      if (session.weldCoincident) {
        this.#refreshGroups(session);
        session.selectedIndices = new Set(expandCoincidentSelection(
          session.selectedIndices,
          session.groups
        ));
      }
    }
    if (occlusion !== undefined) session.occlusion = Boolean(occlusion);
    this.renderer.updateMeshEditOptions({ occlusion: session.occlusion });
    this.#syncSelection();
    return this.status();
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
    session.descriptor = Object.freeze({
      ...session.descriptor,
      positions: translatePivotToWorld({
        positions: session.descriptor.positions,
        selectedIndices: session.selectedIndices,
        objectWorldMatrix: session.objectWorldMatrix,
        targetWorld: position
      })
    });
    session.dirty = true;
    this.#refreshGroups(session);
    this.#refreshPivot(session);
    this.renderer.updateMeshEditGeometry(session.descriptor);
    this.#notify();
    return this.status();
  }

  applyAffine({ operations = [] } = {}) {
    for (const operation of operations) {
      this.#applyAffine(operation.type, operation.value, { notify: false });
    }
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
        canEnter: availability.ok,
        selectionCount: selection.members.length,
        reason: availability.ok ? null : availability.message
      });
    }
    const session = this.#session;
    return Object.freeze({
      active: true,
      objectId: session.objectId,
      objectName: session.objectName,
      sourceType: session.sourceType,
      componentMode: "vertex",
      vertexCount: session.descriptor.positions.length,
      uniqueVertexCount: session.groups.groups.length,
      selectedCount: session.selectedIndices.size,
      activeVertex: session.activeVertex,
      frameMode: session.frameMode,
      viewerPlaneLocked: session.frameMode === "viewer",
      frameQuaternion: Object.freeze([...session.frameQuaternion]),
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

  #applyAffine(type, value, { notify = true } = {}) {
    const session = this.#requireTransformableSelection();
    const pivotWorld = session.pivotWorld;
    const deltaWorldMatrix = affineDeltaWorld({
      type,
      value,
      pivotWorld,
      frameQuaternion: session.frameQuaternion
    });
    session.descriptor = Object.freeze({
      ...session.descriptor,
      positions: transformLocalPositions({
        positions: session.descriptor.positions,
        selectedIndices: session.selectedIndices,
        objectWorldMatrix: session.objectWorldMatrix,
        deltaWorldMatrix
      })
    });
    session.dirty = true;
    this.#refreshGroups(session);
    this.#refreshPivot(session);
    this.renderer.updateMeshEditGeometry(session.descriptor);
    if (notify) this.#notify();
    return this.status();
  }

  #handleVertexPick({ index = null, indices = null, operation = "replace" }) {
    const session = this.#requireSession();
    const picked = Array.isArray(indices)
      ? indices
      : index === null || index === undefined
        ? []
        : [index];
    if (!picked.length) {
      if (operation === "replace") return this.clearSelection();
      return this.status();
    }
    const candidates = session.weldCoincident
      ? expandCoincidentSelection(picked, session.groups)
      : picked;
    const next = new Set(session.selectedIndices);
    if (operation === "replace") next.clear();
    for (const candidate of candidates) {
      if (operation === "remove") next.delete(candidate);
      else if (operation === "toggle") {
        if (next.has(candidate)) next.delete(candidate);
        else next.add(candidate);
      } else next.add(candidate);
    }
    session.selectedIndices = next;
    const active = picked.at(-1);
    session.activeVertex = next.has(active) ? active : [...next].at(-1) ?? null;
    this.#syncSelection();
    return this.status();
  }

  #acceptPreview() {
    this.#requireSession().dirty = true;
  }

  #acceptTransform(positions) {
    const session = this.#requireSession();
    session.descriptor = Object.freeze({
      ...session.descriptor,
      positions: positions.map(point => [...point])
    });
    session.dirty = true;
    this.#refreshGroups(session);
    this.#refreshPivot(session);
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

  #syncSelection() {
    const session = this.#requireSession();
    this.#refreshPivot(session);
    this.renderer.updateMeshEditSelection([...session.selectedIndices], {
      activeVertex: session.activeVertex
    });
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
    indices: geometry.index ? Array.from(geometry.index.array) : [],
    normals,
    uvs
  };
}
