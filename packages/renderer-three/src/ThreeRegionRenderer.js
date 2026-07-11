import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";

export class ThreeRegionRenderer {
  #meshes = new Map();
  #selectionSnapshot = null;
  #session = null;
  #tap = null;

  constructor(canvas, {
    dispatch,
    selection,
    editorState
  }) {
    this.canvas = canvas;
    this.dispatch = dispatch;
    this.selection = selection;
    this.editorState = editorState;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: "high-performance"
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x08101a);

    this.camera = new THREE.PerspectiveCamera(
      55,
      innerWidth / innerHeight,
      0.1,
      1000
    );
    this.camera.position.set(10, 8, 14);

    this.orbit = new OrbitControls(this.camera, canvas);
    this.orbit.enableDamping = true;
    this.orbit.target.set(0, 1, 0);

    this.transformAnchor = new THREE.Group();
    this.transformAnchor.name = "editor-selection-anchor";
    this.scene.add(this.transformAnchor);

    this.transform = new TransformControls(
      this.camera,
      canvas
    );
    this.transform.setMode("translate");
    this.transform.setSize(1.2);
    this.scene.add(this.transform.getHelper());

    this.scene.add(
      new THREE.HemisphereLight(
        0xaecbff,
        0x182012,
        2.2
      )
    );

    const light = new THREE.DirectionalLight(
      0xffffff,
      2.5
    );
    light.position.set(8, 16, 10);
    this.scene.add(light);

    const grid = new THREE.GridHelper(
      200,
      100,
      0x6688aa,
      0x243142
    );
    grid.position.y = 0.01;
    this.scene.add(grid);

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();

    this.selection.subscribe(snapshot => {
      this.#selectionSnapshot = snapshot;
      this.#rebuildAnchor();
      this.#updateSelectionAppearance();
    });

    this.transform.addEventListener(
      "dragging-changed",
      event => {
        this.orbit.enabled = !event.value;
      }
    );

    this.transform.addEventListener(
      "mouseDown",
      () => this.#beginTransformSession()
    );

    this.transform.addEventListener(
      "objectChange",
      () => this.#previewTransformSession()
    );

    this.transform.addEventListener(
      "mouseUp",
      () => this.#commitTransformSession()
    );

    canvas.addEventListener(
      "pointerdown",
      event => {
        this.#tap = {
          id: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          time: performance.now(),
          type: event.pointerType
        };
      },
      true
    );

    canvas.addEventListener(
      "pointerup",
      event => this.#selectAt(event),
      true
    );

    addEventListener(
      "resize",
      () => this.resize()
    );

    this.animate();
  }

  setTransformMode(mode) {
    this.editorState.setToolMode(mode);
    this.transform.setMode(mode);
    this.#rebuildAnchor();
  }

  toggleSpace() {
    const next =
      this.transform.space === "world"
        ? "local"
        : "world";

    this.transform.setSpace(next);
    this.selection.orientationPolicy = next;
    this.#rebuildAnchor();

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
          new THREE.MeshStandardMaterial({
            color: object.material.color
          })
        );

        mesh.userData.objectId = object.id;
        this.#meshes.set(object.id, mesh);
        this.scene.add(mesh);
      }

      if (!this.#session) {
        mesh.position.fromArray(object.position);
        mesh.quaternion.fromArray(object.rotation);
        mesh.scale.fromArray(object.scale);
      }

      mesh.material.color.set(
        object.material.color
      );
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

  #beginTransformSession() {
    const members =
      this.#selectionSnapshot?.members ?? [];

    if (!members.length) return;

    const initialAnchor = {
      position: this.transformAnchor.position.clone(),
      quaternion: this.transformAnchor.quaternion.clone(),
      scale: this.transformAnchor.scale.clone()
    };

    const objects = new Map();

    for (const member of members) {
      const mesh = this.#meshes.get(member.objectId);
      if (!mesh) continue;

      objects.set(member.objectId, {
        position: mesh.position.clone(),
        quaternion: mesh.quaternion.clone(),
        scale: mesh.scale.clone(),
        matrixWorld: mesh.matrixWorld.clone()
      });
    }

    this.#session = {
      initialAnchor,
      objects
    };
  }

  #previewTransformSession() {
    if (!this.#session) return;

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

    const delta = current
      .clone()
      .multiply(initial.clone().invert());

    for (
      const [objectId, snapshot]
      of this.#session.objects
    ) {
      const mesh = this.#meshes.get(objectId);
      if (!mesh) continue;

      const result = delta
        .clone()
        .multiply(snapshot.matrixWorld);

      result.decompose(
        mesh.position,
        mesh.quaternion,
        mesh.scale
      );
    }
  }

  #commitTransformSession() {
    if (!this.#session) return;

    const transforms = [];

    for (
      const [objectId]
      of this.#session.objects
    ) {
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
        transforms
      });
    }

    this.#resetAnchorTransform();
    this.#rebuildAnchor();
  }

  #resetAnchorTransform() {
    this.transformAnchor.rotation.set(0, 0, 0);
    this.transformAnchor.quaternion.identity();
    this.transformAnchor.scale.set(1, 1, 1);
  }

  #rebuildAnchor() {
    if (this.#session) return;

    const members =
      this.#selectionSnapshot?.members ?? [];

    const meshes = members
      .map(member =>
        this.#meshes.get(member.objectId)
      )
      .filter(Boolean);

    if (!meshes.length) {
      this.transform.detach();
      return;
    }

    const pivot = new THREE.Vector3();

    for (const mesh of meshes) {
      pivot.add(mesh.position);
    }

    pivot.multiplyScalar(1 / meshes.length);

    this.transformAnchor.position.copy(pivot);
    this.transformAnchor.scale.set(1, 1, 1);

    const active =
      this.#selectionSnapshot?.activeMember;

    if (
      this.selection.orientationPolicy === "local" &&
      active
    ) {
      const activeMesh =
        this.#meshes.get(active.objectId);

      if (activeMesh) {
        this.transformAnchor.quaternion.copy(
          activeMesh.quaternion
        );
      }
    } else {
      this.transformAnchor.quaternion.identity();
    }

    this.transform.attach(
      this.transformAnchor
    );
  }

  #updateSelectionAppearance() {
    const selected = new Set(
      (this.#selectionSnapshot?.members ?? [])
        .map(member => member.objectId)
    );

    for (const [id, mesh] of this.#meshes) {
      mesh.material.emissive.set(
        selected.has(id)
          ? 0x18263d
          : 0x000000
      );
    }
  }

  #selectAt(event) {
    if (
      !this.#tap ||
      this.#tap.id !== event.pointerId ||
      this.transform.dragging
    ) {
      return;
    }

    const tolerance =
      this.#tap.type === "touch"
        ? 26
        : 8;

    const distance = Math.hypot(
      event.clientX - this.#tap.x,
      event.clientY - this.#tap.y
    );

    const duration =
      performance.now() - this.#tap.time;

    this.#tap = null;

    if (
      distance > tolerance ||
      duration > 600
    ) {
      return;
    }

    const rect =
      this.canvas.getBoundingClientRect();

    this.pointer.x =
      ((event.clientX - rect.left) /
        rect.width) *
        2 -
      1;

    this.pointer.y =
      -((event.clientY - rect.top) /
        rect.height) *
        2 +
      1;

    this.raycaster.setFromCamera(
      this.pointer,
      this.camera
    );

    const hit =
      this.raycaster.intersectObjects(
        [...this.#meshes.values()],
        false
      )[0];

    const objectId =
      hit?.object?.userData?.objectId;

    if (!objectId) {
      this.selection.clear();
      return;
    }

    const member = {
      kind: "object",
      regionId: "region-main",
      objectId
    };

    if (this.editorState.multiSelect) {
      this.selection.toggle(member);
    } else {
      this.selection.replace(member);
    }
  }

  resize() {
    this.camera.aspect =
      innerWidth / innerHeight;

    this.camera.updateProjectionMatrix();
    this.renderer.setSize(
      innerWidth,
      innerHeight
    );
  }

  animate = () => {
    requestAnimationFrame(this.animate);
    this.orbit.update();
    this.renderer.render(
      this.scene,
      this.camera
    );
  };
}
