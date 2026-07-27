import * as THREE from "three";

const PALETTES = Object.freeze({
  "studio-blue": Object.freeze({
    room: 0x101826,
    floor: 0x18253a,
    ceiling: 0x263f61,
    key: 0xb9dcff,
    fill: 0x4f8fd8,
    rim: 0x8ce7ff
  }),
  "studio-neutral": Object.freeze({
    room: 0x24272b,
    floor: 0x34383d,
    ceiling: 0x5d6268,
    key: 0xffffff,
    fill: 0xb8c0ca,
    rim: 0xdce8f5
  }),
  "studio-warm": Object.freeze({
    room: 0x241914,
    floor: 0x3b2a20,
    ceiling: 0x6a4932,
    key: 0xffe2bd,
    fill: 0xd9864d,
    rim: 0xffc98b
  })
});

export function createViewerEnvironmentTexture(
  renderer,
  preset = "studio-blue"
) {
  const palette = PALETTES[preset] ?? PALETTES["studio-blue"];
  const scene = new THREE.Scene();
  const resources = [];

  const room = new THREE.Mesh(
    new THREE.BoxGeometry(24, 16, 24),
    new THREE.MeshBasicMaterial({
      color: palette.room,
      side: THREE.BackSide
    })
  );
  resources.push(room.geometry, room.material);
  scene.add(room);

  addPanel(scene, resources, {
    color: palette.floor,
    size: [18, 12],
    position: [0, -7.8, 0],
    rotation: [-Math.PI / 2, 0, 0]
  });
  addPanel(scene, resources, {
    color: palette.ceiling,
    size: [16, 10],
    position: [0, 7.7, 0],
    rotation: [Math.PI / 2, 0, 0]
  });
  addPanel(scene, resources, {
    color: palette.key,
    size: [5, 10],
    position: [-8.5, 1.5, -2],
    rotation: [0, Math.PI / 2, 0]
  });
  addPanel(scene, resources, {
    color: palette.fill,
    size: [4, 7],
    position: [7.5, -1, 3],
    rotation: [0, -Math.PI / 2, 0]
  });
  addPanel(scene, resources, {
    color: palette.rim,
    size: [7, 3],
    position: [0, 3, -9],
    rotation: [0, 0, 0]
  });

  const pmrem = new THREE.PMREMGenerator(renderer);
  const target = pmrem.fromScene(scene, 0.04, 0.1, 100);
  pmrem.dispose();
  for (const resource of resources) resource.dispose?.();
  scene.clear();
  return target;
}

function addPanel(scene, resources, {
  color,
  size,
  position,
  rotation
}) {
  const panel = new THREE.Mesh(
    new THREE.PlaneGeometry(size[0], size[1]),
    new THREE.MeshBasicMaterial({
      color,
      side: THREE.DoubleSide,
      toneMapped: false
    })
  );
  panel.position.fromArray(position);
  panel.rotation.fromArray(rotation);
  resources.push(panel.geometry, panel.material);
  scene.add(panel);
}
