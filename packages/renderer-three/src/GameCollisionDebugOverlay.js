import * as THREE from "three";

export const GAME_COLLISION_DEBUG_OVERLAY_VERSION =
  "game-collision-debug-overlay-v2-obb";

const COLORS = Object.freeze({
  characterGrounded: 0x55ef8b,
  characterAirborne: 0xff6b6b,
  localBox: 0x5dade2,
  sphere: 0xbb8fce,
  triangleMesh: 0xf5b041,
  contact: 0xfff176,
  normal: 0xff5252
});

export class GameCollisionDebugOverlay {
  #worldSource = null;
  #worldHelpers = [];
  #contactHelpers = [];
  #characterHelper = null;

  constructor({ maximumColliders = 160 } = {}) {
    this.maximumColliders = positiveInteger(maximumColliders);
    this.object = new THREE.Group();
    this.object.name = "SpatialSeedGameCollisionDebug";
    this.object.visible = false;
    this.object.renderOrder = 1000;
  }

  update(snapshot = null) {
    if (!snapshot?.enabled) {
      this.object.visible = false;
      this.#clearContacts();
      return false;
    }
    this.object.visible = true;
    if (snapshot.colliders !== this.#worldSource) {
      this.#rebuildWorld(snapshot.colliders ?? [], snapshot.characterBounds);
    }
    this.#updateCharacter(
      snapshot.characterBody,
      snapshot.characterBounds,
      snapshot.grounded
    );
    this.#updateContacts(snapshot.contacts ?? []);
    return true;
  }

  dispose() {
    this.#clearWorld();
    this.#clearContacts();
    if (this.#characterHelper) {
      this.object.remove(this.#characterHelper);
      disposeObject(this.#characterHelper);
      this.#characterHelper = null;
    }
    this.object.removeFromParent();
  }

  #rebuildWorld(colliders, characterBounds) {
    this.#clearWorld();
    this.#worldSource = colliders;
    const center = boundsCenter(characterBounds);
    const nearest = [...colliders]
      .sort((left, right) => squaredDistance(
        boundsCenter(left.broadBounds),
        center
      ) - squaredDistance(boundsCenter(right.broadBounds), center))
      .slice(0, this.maximumColliders);
    for (const entry of nearest) {
      const helper = colliderHelper(entry);
      if (!helper) continue;
      this.#worldHelpers.push(helper);
      this.object.add(helper);
    }
  }

  #updateCharacter(body, bounds, grounded) {
    if (!this.#characterHelper) {
      const sourceGeometry = new THREE.BoxGeometry(1, 1, 1);
      const edgeGeometry = new THREE.EdgesGeometry(sourceGeometry);
      sourceGeometry.dispose();
      this.#characterHelper = new THREE.LineSegments(
        edgeGeometry,
        new THREE.LineBasicMaterial({ color: COLORS.characterAirborne })
      );
      this.#characterHelper.name = "collision-debug:character";
      this.#characterHelper.material.depthTest = false;
      this.#characterHelper.matrixAutoUpdate = false;
      this.object.add(this.#characterHelper);
    }
    const matrix = characterBodyMatrix(body) ?? boundsMatrix(bounds);
    if (!matrix) return;
    this.#characterHelper.matrix.fromArray(matrix);
    this.#characterHelper.material.color.setHex(
      grounded ? COLORS.characterGrounded : COLORS.characterAirborne
    );
    this.#characterHelper.updateMatrixWorld(true);
  }

  #updateContacts(contacts) {
    const visible = contacts.slice(0, 24);
    for (let index = 0; index < visible.length; index += 1) {
      const contact = visible[index];
      const point = vector3(contact.point);
      const normal = vector3(contact.normal);
      if (!point || !normal || normal.lengthSq() <= 1e-12) continue;
      normal.normalize();
      const { marker, arrow } = this.#ensureContactHelper(index);
      marker.visible = true;
      arrow.visible = true;
      marker.position.copy(point);
      arrow.position.copy(point);
      arrow.setDirection(normal);
    }
    for (let index = visible.length; index < this.#contactHelpers.length; index += 1) {
      this.#contactHelpers[index].marker.visible = false;
      this.#contactHelpers[index].arrow.visible = false;
    }
  }

  #ensureContactHelper(index) {
    if (this.#contactHelpers[index]) return this.#contactHelpers[index];
    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(0.055, 8, 6),
      new THREE.MeshBasicMaterial({
        color: COLORS.contact,
        depthTest: false
      })
    );
    marker.renderOrder = 1001;
    const arrow = new THREE.ArrowHelper(
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(),
      0.55,
      COLORS.normal,
      0.16,
      0.09
    );
    arrow.line.material.depthTest = false;
    arrow.cone.material.depthTest = false;
    arrow.renderOrder = 1001;
    const helper = { marker, arrow };
    this.#contactHelpers.push(helper);
    this.object.add(marker, arrow);
    return helper;
  }

  #clearWorld() {
    for (const helper of this.#worldHelpers) {
      this.object.remove(helper);
      disposeObject(helper);
    }
    this.#worldHelpers = [];
    this.#worldSource = null;
  }

  #clearContacts() {
    for (const { marker, arrow } of this.#contactHelpers) {
      this.object.remove(marker, arrow);
      disposeObject(marker);
      disposeObject(arrow);
    }
    this.#contactHelpers = [];
  }
}

function colliderHelper(entry) {
  const collider = entry?.collider;
  let helper;
  if (collider?.type === "local-box") {
    const box = threeBox(collider.localBounds);
    if (!box) return null;
    const sourceGeometry = new THREE.BoxGeometry(1, 1, 1);
    const edgeGeometry = new THREE.EdgesGeometry(sourceGeometry);
    sourceGeometry.dispose();
    helper = new THREE.LineSegments(
      edgeGeometry,
      new THREE.LineBasicMaterial({ color: COLORS.localBox })
    );
    helper.matrixAutoUpdate = false;
    const localMatrix = new THREE.Matrix4().compose(
      box.getCenter(new THREE.Vector3()),
      new THREE.Quaternion(),
      box.getSize(new THREE.Vector3())
    );
    helper.matrix.fromArray(collider.worldMatrix).multiply(localMatrix);
  } else if (collider?.type === "sphere") {
    helper = new THREE.Mesh(
      new THREE.SphereGeometry(collider.radius, 12, 8),
      new THREE.MeshBasicMaterial({
        color: COLORS.sphere,
        wireframe: true,
        transparent: true,
        opacity: 0.7,
        depthTest: false
      })
    );
    helper.position.fromArray(collider.center);
  } else {
    const box = threeBox(entry?.broadBounds);
    if (!box) return null;
    helper = new THREE.Box3Helper(box, COLORS.triangleMesh);
  }
  helper.name = `collision-debug:${entry?.id ?? "collider"}`;
  helper.renderOrder = 1000;
  if (helper.material) {
    helper.material.transparent = true;
    helper.material.opacity = 0.68;
    helper.material.depthTest = false;
  }
  return helper;
}

function threeBox(bounds) {
  if (!bounds?.min || !bounds?.max) return null;
  return new THREE.Box3(
    new THREE.Vector3().fromArray(bounds.min),
    new THREE.Vector3().fromArray(bounds.max)
  );
}

function characterBodyMatrix(body) {
  if (!Array.isArray(body?.center) || !Array.isArray(body?.halfExtents) ||
      !Array.isArray(body?.axes) || body.axes.length !== 3) return null;
  const sizes = body.halfExtents.map(value => Number(value) * 2);
  const axes = body.axes;
  if (sizes.some(value => !Number.isFinite(value)) ||
      axes.some(axis => !Array.isArray(axis) || axis.length !== 3)) return null;
  return [
    axes[0][0] * sizes[0], axes[0][1] * sizes[0], axes[0][2] * sizes[0], 0,
    axes[1][0] * sizes[1], axes[1][1] * sizes[1], axes[1][2] * sizes[1], 0,
    axes[2][0] * sizes[2], axes[2][1] * sizes[2], axes[2][2] * sizes[2], 0,
    body.center[0], body.center[1], body.center[2], 1
  ];
}

function boundsMatrix(bounds) {
  const box = threeBox(bounds);
  if (!box) return null;
  return new THREE.Matrix4().compose(
    box.getCenter(new THREE.Vector3()),
    new THREE.Quaternion(),
    box.getSize(new THREE.Vector3())
  ).toArray();
}

function vector3(value) {
  return Array.isArray(value) && value.length === 3
    ? new THREE.Vector3().fromArray(value)
    : null;
}

function boundsCenter(bounds) {
  if (!bounds?.min || !bounds?.max) return [0, 0, 0];
  return bounds.min.map((value, axis) => (value + bounds.max[axis]) * 0.5);
}

function squaredDistance(left, right) {
  return left.reduce((sum, value, axis) => {
    const delta = value - right[axis];
    return sum + delta * delta;
  }, 0);
}

function disposeObject(object) {
  object.geometry?.dispose?.();
  if (Array.isArray(object.material)) {
    object.material.forEach(material => material?.dispose?.());
  } else {
    object.material?.dispose?.();
  }
  object.line?.geometry?.dispose?.();
  object.line?.material?.dispose?.();
  object.cone?.geometry?.dispose?.();
  object.cone?.material?.dispose?.();
}

function positiveInteger(value) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    throw new RangeError("maximumColliders deve ser inteiro positivo.");
  }
  return number;
}
