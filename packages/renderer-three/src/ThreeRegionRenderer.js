import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";

export class ThreeRegionRenderer {
  static apiVersion = "renderer-three-selection-pivot-v2";
  #meshes = new Map();
  #selectionSnapshot = null;
  #session = null;
  #tap = null;
  #textureLoader = new THREE.TextureLoader();
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

  constructor(canvas, { dispatch, selection, editorState }) {
    if (typeof dispatch !== "function") throw new TypeError("dispatch must be a function");
    if (!selection?.subscribe) throw new TypeError("selection object is incompatible");
    if (!editorState?.subscribe) throw new TypeError("editorState object is incompatible");

    this.canvas = canvas;
    this.dispatch = dispatch;
    this.selection = selection;
    this.editorState = editorState;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x08101a);

    this.camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 1000);
    this.camera.position.set(10, 8, 14);

    this.orbit = new OrbitControls(this.camera, canvas);
    this.orbit.enableDamping = true;
    this.orbit.target.set(0, 1, 0);

    this.transformAnchor = new THREE.Group();
    this.transformAnchor.name = "editor-selection-anchor";
    this.scene.add(this.transformAnchor);

    this.transform = new TransformControls(this.camera, canvas);
    this.transform.setMode("translate");
    this.transform.setSize(1.25);
    this.scene.add(this.transform.getHelper());

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
    });

    this.editorState.subscribe(() => {
      this.#configureTransformForEditor();
      this.#rebuildAnchor();
    });

    this.transform.addEventListener("dragging-changed", event => {
      this.orbit.enabled = !event.value;
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

  setTransformMode(mode) {
    this.editorState.setPivotEditing(false);
    this.editorState.setToolMode(mode);
    this.transform.setMode(mode);
    this.#rebuildAnchor();
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
    const seen = new Set();

    for (const object of state.objects) {
      seen.add(object.id);
      let mesh = this.#meshes.get(object.id);

      if (!mesh) {
        mesh = new THREE.Mesh(
          new THREE.BoxGeometry(...object.size),
          new THREE.MeshStandardMaterial({ color: object.material.color })
        );
        mesh.userData.objectId = object.id;
        mesh.userData.sizeKey = object.size.join(",");
        mesh.userData.textureSrc = null;
        this.#meshes.set(object.id, mesh);
        this.scene.add(mesh);
      }
      const sizeKey = object.size.join(",");
      if (mesh.userData.sizeKey !== sizeKey) {
        mesh.geometry.dispose();
        mesh.geometry = new THREE.BoxGeometry(...object.size);
        mesh.userData.sizeKey = sizeKey;
      }

      if (!this.#session) {
        mesh.position.fromArray(object.position);
        mesh.quaternion.fromArray(object.rotation);
        mesh.scale.fromArray(object.scale);
        mesh.updateMatrixWorld(true);
      }

      mesh.material.color.set(object.material.color);
      this.#applyTextureState(mesh, object.material?.texture);
    }

    for (const [id, mesh] of this.#meshes) {
      if (!seen.has(id)) {
        this.scene.remove(mesh);
        mesh.geometry.dispose();
        mesh.material.dispose();
        this.#meshes.delete(id);
      }
    }

    this.#rebuildAnchor();
    this.#updateSelectionAppearance();
  }

  #applyTextureState(mesh, textureState = null) {
    const source = textureState?.src || "";
    if (!source) {
      if (mesh.material.map) { mesh.material.map.dispose(); mesh.material.map = null; mesh.material.needsUpdate = true; }
      mesh.userData.textureSrc = null;
      return;
    }
    if (mesh.userData.textureSrc !== source) {
      mesh.userData.textureSrc = source;
      this.#textureLoader.load(source, texture => {
        if (mesh.userData.textureSrc !== source) { texture.dispose(); return; }
        if (mesh.material.map) mesh.material.map.dispose();
        texture.colorSpace = THREE.SRGBColorSpace;
        mesh.material.map = texture; mesh.material.needsUpdate = true;
        this.#configureTexture(texture, textureState);
      }, undefined, error => console.error("Falha ao carregar textura", source, error));
      return;
    }
    if (mesh.material.map) this.#configureTexture(mesh.material.map, textureState);
  }

  #configureTexture(texture, textureState = {}) {
    const wrapping = { repeat: THREE.RepeatWrapping, mirror: THREE.MirroredRepeatWrapping, clamp: THREE.ClampToEdgeWrapping }[textureState.wrap] ?? THREE.RepeatWrapping;
    texture.wrapS = wrapping; texture.wrapT = wrapping;
    texture.repeat.fromArray(textureState.repeat ?? [1, 1]);
    texture.offset.fromArray(textureState.offset ?? [0, 0]);
    texture.center.set(0.5, 0.5);
    texture.rotation = Number(textureState.rotationDeg ?? 0) * Math.PI / 180;
    texture.needsUpdate = true;
  }

  #configureTransformForEditor() {
    if (this.editorState.pivot.editing) {
      this.transform.setMode("translate");
      this.transform.setSpace("world");
    } else {
      this.transform.setMode(this.editorState.tool.mode);
      this.transform.setSpace(
        this.selection.orientationPolicy === "local" ? "local" : "world"
      );
    }
  }

  #beginSession() {
    if (this.editorState.pivot.editing) {
      this.#session = { kind: "pivot" };
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
    for (const member of members) {
      const mesh = this.#meshes.get(member.objectId);
      if (!mesh) continue;
      mesh.updateMatrixWorld(true);
      objects.set(member.objectId, { matrixWorld: mesh.matrixWorld.clone() });
    }

    this.#session = { kind: "selection", initialAnchor, objects };
  }

  #previewSession() {
    if (!this.#session) return;

    if (this.#session.kind === "pivot") {
      this.editorState.setCustomPivot(this.transformAnchor.position.toArray());
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

    for (const [objectId, snapshot] of this.#session.objects) {
      const mesh = this.#meshes.get(objectId);
      if (!mesh) continue;
      const result = delta.clone().multiply(snapshot.matrixWorld);
      result.decompose(mesh.position, mesh.quaternion, mesh.scale);
      mesh.updateMatrixWorld(true);
    }
  }

  #commitSession() {
    if (!this.#session) return;

    if (this.#session.kind === "pivot") {
      this.editorState.setCustomPivot(this.transformAnchor.position.toArray());
      this.#session = null;
      this.#rebuildAnchor();
      return;
    }

    const transforms = [];
    for (const [objectId] of this.#session.objects) {
      const mesh = this.#meshes.get(objectId);
      if (!mesh) continue;
      transforms.push({
        id: objectId,
        position: mesh.position.toArray(),
        rotation: mesh.quaternion.toArray(),
        scale: mesh.scale.toArray()
      });
    }

    this.#session = null;

    if (transforms.length) {
      this.dispatch({
        type: "selection.transform",
        selection: this.#selectionSnapshot,
        pivot: {
          policy: this.editorState.pivot.policy,
          position: this.transformAnchor.position.toArray()
        },
        transforms
      });
    }

    this.transformAnchor.quaternion.identity();
    this.transformAnchor.scale.set(1, 1, 1);
    this.#rebuildAnchor();
  }

  #calculatePivot() {
    const members = this.#selectionSnapshot?.members ?? [];
    const meshes = members.map(member => this.#meshes.get(member.objectId)).filter(Boolean);
    if (!meshes.length) return null;

    const policy = this.editorState.pivot.policy;

    if (policy === "custom") {
      return new THREE.Vector3().fromArray(this.editorState.pivot.customPosition);
    }

    if (policy === "active") {
      const activeId = this.#selectionSnapshot?.activeMember?.objectId;
      return (this.#meshes.get(activeId) ?? meshes[meshes.length - 1]).position.clone();
    }

    if (policy === "bounds") {
      const bounds = new THREE.Box3().makeEmpty();
      for (const mesh of meshes) {
        mesh.updateMatrixWorld(true);
        bounds.expandByObject(mesh, true);
      }
      return bounds.getCenter(new THREE.Vector3());
    }

    const median = new THREE.Vector3();
    for (const mesh of meshes) median.add(mesh.position);
    return median.multiplyScalar(1 / meshes.length);
  }

  #rebuildAnchor() {
    if (this.#session) return;

    const pivot = this.#calculatePivot();
    if (!pivot) {
      this.transform.detach();
      return;
    }

    this.transformAnchor.position.copy(pivot);
    this.transformAnchor.scale.set(1, 1, 1);

    const activeId = this.#selectionSnapshot?.activeMember?.objectId;
    const activeMesh = this.#meshes.get(activeId);

    if (!this.editorState.pivot.editing &&
        this.selection.orientationPolicy === "local" &&
        activeMesh) {
      this.transformAnchor.quaternion.copy(activeMesh.quaternion);
    } else {
      this.transformAnchor.quaternion.identity();
    }

    this.transform.attach(this.transformAnchor);
  }

  #updateSelectionAppearance() {
    const selected = new Set(
      (this.#selectionSnapshot?.members ?? []).map(member => member.objectId)
    );
    const activeId = this.#selectionSnapshot?.activeMember?.objectId;

    for (const [id, mesh] of this.#meshes) {
      if (id === activeId) mesh.material.emissive.set(0x263d68);
      else if (selected.has(id)) mesh.material.emissive.set(0x162741);
      else mesh.material.emissive.set(0x000000);
    }
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

    const hit = this.raycaster.intersectObjects([...this.#meshes.values()], false)[0];
    this.#inputDiagnostics.objectHits = hit ? 1 : 0;

    const hasSelection =
      (this.#selectionSnapshot?.members?.length ?? 0) > 0;

    const gizmoActive =
      hasSelection &&
      (
        this.transform.axis !== null ||
        this.transform.dragging
      );

    this.#inputDiagnostics.gizmoHits = gizmoActive ? 1 : 0;

    if (gizmoActive) {
      this.#inputDiagnostics.discardedReason = "gizmo-active";
      return;
    }
    const objectId = hit?.object?.userData?.objectId;
    this.#inputDiagnostics.lastObjectId = objectId ?? null;

    if (!objectId) {
      this.#inputDiagnostics.selectionAction = "clear";
      this.#inputDiagnostics.discardedReason = "nenhum-objeto";
      this.selection.clear();
      return;
    }

    const member = { kind: "object", regionId: "region-main", objectId };

    if (this.editorState.multiSelect) {
      this.#inputDiagnostics.selectionAction = "toggle";
      this.selection.toggle(member);
    } else {
      this.#inputDiagnostics.selectionAction = "replace";
      this.selection.replace(member);
    }

    this.#inputDiagnostics.discardedReason = null;
  }

  resize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
  }

  animate = () => {
    requestAnimationFrame(this.animate);
    this.orbit.update();
    this.renderer.render(this.scene, this.camera);
  };
}
