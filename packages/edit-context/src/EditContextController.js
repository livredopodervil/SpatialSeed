const SUBJECT_LEVELS = Object.freeze(["object", "vertex", "edge", "face"]);
const TOOLS = Object.freeze(["navigate", "select", "translate", "rotate", "scale"]);
const FRAMES = Object.freeze(["world", "local", "viewer", "custom-plane"]);
const SNAP_COMPONENTS = Object.freeze(["vertex", "edge", "face"]);

export class EditContextController {
  static apiVersion = "edit-context-controller-v1";

  #listeners = new Set();
  #unsubscribeEditor = null;
  #unsubscribeSelection = null;
  #unsubscribeMesh = null;
  #unsubscribeTools = null;
  #lastNotificationKey = null;
  #snap = {
    enabled: false,
    auto: true,
    vertex: true,
    edge: true,
    face: true,
    grid: false,
    scope: "active",
    anchor: "active",
    tolerancePixels: 18,
    self: false
  };

  constructor({ editor, renderer, meshEditor, toolLifecycle = null }) {
    if (!editor?.snapshot || !editor?.subscribe) {
      throw new TypeError("EditContextController exige editor compatível.");
    }
    if (!renderer?.setTransformMode || !renderer?.readNavigationCamera) {
      throw new TypeError("EditContextController exige renderer compatível.");
    }
    if (!meshEditor?.status || !meshEditor?.subscribe) {
      throw new TypeError("EditContextController exige MeshEditController.");
    }
    this.editor = editor;
    this.renderer = renderer;
    this.meshEditor = meshEditor;
    this.toolLifecycle = toolLifecycle;
    this.#unsubscribeEditor = editor.subscribe(() => this.#notify());
    this.#unsubscribeSelection =
      editor.selection?.subscribe?.(() => this.#notify()) ?? null;
    this.#unsubscribeMesh = meshEditor.subscribe(snapshot => {
      if (snapshot.active && snapshot.snap) {
        this.#snap = mergeSnapState(this.#snap, snapshot.snap);
      }
      this.#notify();
    });
    this.#unsubscribeTools = toolLifecycle?.subscribe?.(() => this.#notify()) ?? null;
  }

  dispose() {
    this.#unsubscribeEditor?.();
    this.#unsubscribeSelection?.();
    this.#unsubscribeMesh?.();
    this.#unsubscribeTools?.();
    this.#listeners.clear();
  }

  subscribe(listener) {
    if (typeof listener !== "function") {
      throw new TypeError("Listener do contexto de edição deve ser função.");
    }
    this.#listeners.add(listener);
    const snapshot = this.status();
    this.#lastNotificationKey = contextNotificationKey(
      snapshot,
      this.editor.selection?.snapshot?.()
    );
    listener(snapshot);
    return () => this.#listeners.delete(listener);
  }

  status() {
    const editor = this.editor.snapshot();
    const mesh = this.meshEditor.status();
    const objectFrame = this.renderer.getObjectTransformFrame?.() ?? {
      mode: this.renderer.transform?.space === "local" ? "local" : "world",
      quaternion: [0, 0, 0, 1]
    };
    const objectAxes = this.renderer.getObjectTransformAxes?.() ?? {
      x: true,
      y: true,
      z: true
    };
    const navigation = this.renderer.getNavigationLocks?.() ?? {
      plane: null,
      point: null,
      mode: "free",
      editPlane: null
    };
    const toolLifecycle = this.toolLifecycle?.status?.() ?? {
      keepActive: true,
      canRepeat: false,
      activeAction: null,
      lifecycle: "sticky",
      lastRepeatable: null
    };
    const axes = mesh.active
      ? axesFromConstraint(mesh.constraint)
      : objectAxes;
    const frameMode = mesh.active
      ? mesh.frameMode
      : objectFrame.mode;
    const snap = mesh.active && mesh.snap
      ? mergeSnapState(this.#snap, mesh.snap)
      : { ...this.#snap };
    return Object.freeze({
      subjectLevel: mesh.active ? mesh.componentMode : "object",
      meshActive: Boolean(mesh.active),
      canEnterMesh: Boolean(mesh.canEnter),
      tool: editor.tool.mode,
      selectionOperation: editor.selectionOperation,
      areaSelection: editor.areaSelection,
      multiSelect: editor.multiSelect,
      frameMode,
      axes: Object.freeze({ ...axes }),
      snap: Object.freeze({ ...snap }),
      proportional: Boolean(mesh.active && mesh.deformation?.enabled),
      planeLock: navigation.plane
        ? Object.freeze(structuredClone(navigation.plane))
        : null,
      pointLock: navigation.point
        ? Object.freeze(structuredClone(navigation.point))
        : null,
      navigationMode: navigation.mode ?? "free",
      editPlane: navigation.editPlane
        ? Object.freeze(structuredClone(navigation.editPlane))
        : null,
      keepToolActive: Boolean(toolLifecycle.keepActive),
      activeAction: toolLifecycle.activeAction,
      toolLifecycle: toolLifecycle.lifecycle,
      canRepeat: Boolean(toolLifecycle.canRepeat),
      lastRepeatable: toolLifecycle.lastRepeatable,
      canUndo: mesh.active ? Boolean(mesh.canUndo) : false,
      canRedo: mesh.active ? Boolean(mesh.canRedo) : false,
      stale: Boolean(mesh.stale),
      dirty: Boolean(mesh.dirty)
    });
  }

  setSubjectLevel(level, { selectAll = false } = {}) {
    const normalized = normalizeOne(level, SUBJECT_LEVELS, "nível de edição");
    if (normalized === "object") {
      if (this.meshEditor.active) {
        throw new Error(
          "Aplique ou cancele a edição de malha antes de retornar ao modo objeto."
        );
      }
      this.#notify();
      return this.status();
    }
    if (!this.meshEditor.active) {
      this.meshEditor.enter({ selectAll: Boolean(selectAll) });
    }
    this.meshEditor.setComponentMode(normalized);
    if (this.editor.snapshot().tool.mode === "navigate") {
      this.renderer.setTransformMode("select");
    }
    this.#notify();
    return this.status();
  }

  setTool(mode) {
    this.renderer.setTransformMode(normalizeOne(mode, TOOLS, "ferramenta"));
    return this.status();
  }

  setSelectionOperation(operation) {
    return Object.freeze({
      ...this.status(),
      selectionOperation: this.renderer.setSelectionOperation(operation)
    });
  }

  setFrame(mode) {
    const normalized = normalizeOne(mode, FRAMES, "referencial");
    if (this.meshEditor.active) {
      if (normalized === "custom-plane") {
        const plane = this.renderer.getEditPlane?.();
        if (!plane?.quaternion) {
          throw new Error(
            "Defina um plano de edição antes de usá-lo como referencial."
          );
        }
        this.meshEditor.setCustomFrame?.({
          mode: "custom-plane",
          quaternion: plane.quaternion
        });
      } else {
        this.meshEditor.setFrame(normalized);
      }
    } else if (normalized === "viewer") {
      const frame = this.renderer.readViewerReferenceFrame();
      this.renderer.setObjectTransformFrame({
        mode: "viewer",
        quaternion: frame.quaternion
      });
    } else if (normalized === "custom-plane") {
      const plane = this.renderer.getEditPlane?.();
      if (!plane?.quaternion) {
        throw new Error(
          "Defina um plano de edição antes de usá-lo como referencial."
        );
      }
      this.renderer.setObjectTransformFrame({
        mode: "custom-plane",
        quaternion: plane.quaternion
      });
    } else {
      this.renderer.setObjectTransformFrame({ mode: normalized });
    }
    this.#notify();
    return this.status();
  }

  setAxes(patch = {}) {
    const current = this.status().axes;
    const axes = {
      x: patch.x === undefined ? current.x : Boolean(patch.x),
      y: patch.y === undefined ? current.y : Boolean(patch.y),
      z: patch.z === undefined ? current.z : Boolean(patch.z)
    };
    if (this.meshEditor.active) {
      this.meshEditor.setConstraint(constraintFromAxes(axes));
    } else {
      this.renderer.setObjectTransformAxes(axes);
    }
    this.#notify();
    return this.status();
  }

  setSnap(patch = {}) {
    this.#snap = normalizeSnap({ ...this.#snap, ...patch });
    this.renderer.setTransformConfig?.({
      gridLock: this.#snap.enabled && this.#snap.grid
    });
    if (this.meshEditor.active) {
      const modes = SNAP_COMPONENTS.filter(type => this.#snap[type]);
      this.meshEditor.setSnap({
        enabled: this.#snap.enabled && modes.length > 0,
        mode: this.#snap.auto || modes.length !== 1 ? "auto" : modes[0],
        modes,
        scope: this.#snap.scope,
        anchor: this.#snap.anchor,
        tolerancePixels: this.#snap.tolerancePixels,
        self: this.#snap.self
      });
    }
    this.#notify();
    return this.status();
  }

  setProportional(enabled) {
    if (!this.meshEditor.active) {
      if (enabled) {
        throw new Error(
          "A influência proporcional opera durante a edição de malha."
        );
      }
      return this.status();
    }
    this.meshEditor.setDeformation({ enabled: Boolean(enabled) });
    return this.status();
  }

  togglePlaneLock({ source = "viewer", frame = null } = {}) {
    const current = this.renderer.getNavigationLocks?.().plane;
    if (current && !frame) {
      this.renderer.setNavigationPlaneLock(null);
      this.#notify();
      return this.status();
    }
    this.renderer.setNavigationPlaneLock(
      frame ?? this.#resolvePlaneFrame(source)
    );
    this.#notify();
    return this.status();
  }

  togglePointLock({ source = "selection", point = null } = {}) {
    const current = this.renderer.getNavigationLocks?.().point;
    if (current && !point) {
      this.renderer.setNavigationPointLock(null);
      this.#notify();
      return this.status();
    }
    const resolved = point ?? this.#resolvePoint(source);
    this.renderer.setNavigationPointLock({
      point: resolved,
      source: String(source)
    });
    this.#notify();
    return this.status();
  }

  clearNavigationLocks() {
    this.renderer.clearNavigationLocks?.();
    this.#notify();
    return this.status();
  }

  setEditPlane({ source = "viewer", frame = null } = {}) {
    const resolved = frame ?? this.#resolvePlaneFrame(source);
    this.renderer.setEditPlane?.(resolved);
    this.#notify();
    return this.status();
  }

  clearEditPlane() {
    this.renderer.setEditPlane?.(null);
    this.#notify();
    return this.status();
  }

  #resolvePlaneFrame(source) {
    const normalized = String(source ?? "viewer").toLowerCase();
    if (normalized === "viewer") return this.renderer.readViewerReferenceFrame();
    if (normalized === "object") {
      const frame = this.renderer.readSelectionReferenceFrame?.();
      if (!frame) throw new Error("Selecione um objeto para usar seu plano.");
      return frame;
    }
    if (normalized === "face") {
      const frame = this.meshEditor.referenceFrame?.();
      if (!frame) {
        throw new Error("Selecione uma face ativa para definir o plano.");
      }
      return frame;
    }
    const world = {
      "world-xy": {
        origin: [0, 0, 0],
        xAxis: [1, 0, 0],
        normal: [0, 0, 1],
        source: "world-xy"
      },
      "world-xz": {
        origin: [0, 0, 0],
        xAxis: [1, 0, 0],
        normal: [0, 1, 0],
        source: "world-xz"
      },
      "world-yz": {
        origin: [0, 0, 0],
        xAxis: [0, 1, 0],
        normal: [1, 0, 0],
        source: "world-yz"
      }
    }[normalized];
    if (world) return world;
    throw new RangeError(`Fonte de plano desconhecida: ${source}.`);
  }

  #resolvePoint(source) {
    const normalized = String(source ?? "selection").toLowerCase();
    if (normalized === "viewer") {
      return this.renderer.readViewerReferenceFrame().origin;
    }
    if (normalized === "component") {
      const point = this.meshEditor.referencePoint?.();
      if (!point) throw new Error("Não há componente ativo para travar.");
      return point;
    }
    const pivot = this.renderer.getSelectionPivotPosition?.();
    if (!pivot) throw new Error("Selecione um objeto ou componente para travar.");
    return pivot;
  }

  #notify() {
    if (!this.#listeners.size) return;
    const snapshot = this.status();
    const key = contextNotificationKey(
      snapshot,
      this.editor.selection?.snapshot?.()
    );
    if (key === this.#lastNotificationKey) return;
    this.#lastNotificationKey = key;
    for (const listener of [...this.#listeners]) {
      try {
        listener(snapshot);
      } catch (error) {
        console.error("EditContextController subscriber failed", error);
      }
    }
  }
}

function contextNotificationKey(snapshot, selection = null) {
  return JSON.stringify([
    snapshot,
    selection?.members?.map(member => [
      member.kind,
      member.regionId,
      member.objectId,
      member.componentType ?? null,
      member.componentIndex ?? null
    ]) ?? [],
    selection?.activeMember?.objectId ?? null
  ]);
}

export function constraintFromAxes({ x, y, z }) {
  const key = `${x ? "x" : ""}${y ? "y" : ""}${z ? "z" : ""}`;
  return key === "xyz" ? "free" : key || "none";
}

export function axesFromConstraint(value = "free") {
  const normalized = String(value ?? "free").toLowerCase();
  return Object.freeze({
    x: normalized === "free" || normalized.includes("x"),
    y: normalized === "free" || normalized.includes("y"),
    z: normalized === "free" || normalized.includes("z")
  });
}

function normalizeSnap(value = {}) {
  const tolerancePixels = Number(value.tolerancePixels ?? 18);
  if (!Number.isFinite(tolerancePixels) || tolerancePixels < 2 || tolerancePixels > 80) {
    throw new RangeError("A tolerância de snap deve ficar entre 2 e 80 px.");
  }
  const scope = normalizeOne(value.scope ?? "active", ["active", "scene"], "escopo de snap");
  const anchor = normalizeOne(value.anchor ?? "active", ["active", "pivot", "nearest"], "âncora de snap");
  return {
    enabled: Boolean(value.enabled),
    auto: value.auto === undefined ? true : Boolean(value.auto),
    vertex: value.vertex === undefined ? true : Boolean(value.vertex),
    edge: value.edge === undefined ? true : Boolean(value.edge),
    face: value.face === undefined ? true : Boolean(value.face),
    grid: Boolean(value.grid),
    scope,
    anchor,
    tolerancePixels,
    self: Boolean(value.self)
  };
}

function mergeSnapState(base, meshSnap) {
  const modes = Array.isArray(meshSnap.modes)
    ? new Set(meshSnap.modes)
    : new Set(meshSnap.mode === "auto"
      ? SNAP_COMPONENTS
      : [meshSnap.mode].filter(Boolean));
  return normalizeSnap({
    ...base,
    enabled: meshSnap.enabled ?? base.enabled,
    auto: meshSnap.mode === "auto",
    vertex: modes.has("vertex"),
    edge: modes.has("edge"),
    face: modes.has("face"),
    scope: meshSnap.scope ?? base.scope,
    anchor: meshSnap.anchor ?? base.anchor,
    tolerancePixels: meshSnap.tolerancePixels ?? base.tolerancePixels,
    self: meshSnap.self ?? base.self
  });
}

function normalizeOne(value, allowed, label) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!allowed.includes(normalized)) {
    throw new RangeError(`${label} desconhecido: ${value}.`);
  }
  return normalized;
}
