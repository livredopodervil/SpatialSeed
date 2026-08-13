import * as THREE from "three";
import {
  ThreeCharacterAnimationBackend
} from "../../character-animation-three/src/index.js?build=20260813-0054ml";
import {
  CharacterAnimationSystem,
  inferCharacterAnimationBindings
} from "../../character-animation/src/index.js?build=20260813-0054mk";

export function createCharacterAnimationTests() {
  return {
    "bindings semânticos são inferidos sem depender de nomes exatos"() {
      const bindings = inferCharacterAnimationBindings([
        { name: "Armature|Idle", duration: 1 },
        { name: "Walking", duration: 1 },
        { name: "Run_Fast", duration: 1 },
        { name: "Jump", duration: 0.5 },
        { name: "Falling", duration: 0.8 },
        { name: "Landing", duration: 0.3 }
      ]);
      assertEqual(bindings.idle.clip, "Armature|Idle");
      assertEqual(bindings.walk.clip, "Walking");
      assertEqual(bindings.run.clip, "Run_Fast");
      assertEqual(bindings.land.loop, false);
    },

    "Survey do Fox é reconhecido como idle"() {
      const bindings = inferCharacterAnimationBindings([
        { name: "Survey", duration: 3 },
        { name: "Walk", duration: 1 },
        { name: "Run", duration: 1 }
      ]);
      assertEqual(bindings.idle.clip, "Survey");
      assertEqual(bindings.walk.clip, "Walk");
      assertEqual(bindings.run.clip, "Run");
    },

    async "locomoção seleciona idle walk run jump fall e land"() {
      const backend = fakeBackend();
      const system = new CharacterAnimationSystem({ backend });
      await system.load("hero", { src: "hero.glb" });
      system.activate("hero");
      system.observeMotion("hero", { grounded: true, horizontalSpeed: 0 });
      system.observeMotion("hero", { grounded: true, horizontalSpeed: 2 });
      system.observeMotion("hero", { grounded: true, horizontalSpeed: 4, sprint: true });
      system.observeMotion("hero", { grounded: false, verticalSpeed: 4 });
      system.observeMotion("hero", { grounded: false, verticalSpeed: -2 });
      system.observeMotion("hero", { grounded: true, horizontalSpeed: 0 });
      const clips = backend.plays.map(entry => entry.clip);
      for (const expected of ["Idle", "Walk", "Run", "Jump", "Fall", "Land"]) {
        assertEqual(clips.includes(expected), true);
      }
    },

    async "load e deactivate deixam o personagem em idle para preview"() {
      const backend = fakeBackend();
      const system = new CharacterAnimationSystem({ backend });
      await system.load("hero", { src: "hero.glb" });
      assertEqual(system.status("hero").activeState, "idle");
      assertEqual(backend.plays.at(-1).clip, "Idle");
      system.activate("hero");
      system.observeMotion("hero", { grounded: true, horizontalSpeed: 2 });
      assertEqual(system.status("hero").activeState, "walk");
      system.deactivate("hero");
      assertEqual(system.status("hero").activeState, "idle");
      assertEqual(backend.plays.at(-1).clip, "Idle");
    },

    async "advance usa delta do scheduler e não relógio próprio Three"() {
      const backend = fakeBackend();
      const system = new CharacterAnimationSystem({ backend });
      await system.load("hero", { src: "hero.glb" });
      system.activate("hero");
      system.advance(1 / 60);
      system.advance(1 / 30);
      assertApproximately(backend.advanced, 0.05, 1e-9);
    },

    async "backend Three usa visual transitório e AnimationMixer sem clock próprio"() {
      const surface = fakeThreeSurface();
      const clip = new THREE.AnimationClip("Idle", 1, []);
      const backend = new ThreeCharacterAnimationBackend({
        surface,
        loaderFactory: () => ({
          async loadAsync() {
            return { scene: new THREE.Group(), animations: [clip] };
          }
        })
      });
      const loaded = await backend.load({
        characterId: "hero",
        source: { src: "hero.glb" },
        options: {}
      });
      assertEqual(loaded.clips[0].name, "Idle");
      // 0054mi: o GLB é projeção da sessão de jogo, não preview persistente.
      assertEqual(surface.active, false);
      backend.setActive("hero", false);
      assertEqual(surface.active, false);
      backend.setActive("hero", true);
      backend.play("hero", { clip: "Idle", loop: true });
      backend.advance(1 / 60);
      assertEqual(surface.active, true);
      backend.setActive("hero", false);
      assertEqual(surface.active, false);
      await backend.unload("hero");
      assertEqual(surface.detached, true);
    },

    async "body físico pode mudar sem redimensionar a geometria visual"() {
      const surface = fakeThreeSurface({
        bounds: { min: [-1, -0.5, -0.5], max: [1, 0.5, 0.5] },
        parentTransform: { scale: [2, 3, 4] }
      });
      const asset = new THREE.Group();
      asset.add(new THREE.Mesh(
        new THREE.BoxGeometry(2, 10, 2),
        new THREE.MeshBasicMaterial()
      ));
      const backend = new ThreeCharacterAnimationBackend({
        surface,
        loaderFactory: () => ({
          async loadAsync() {
            return { scene: asset, animations: [new THREE.AnimationClip("Idle", 1, [])] };
          }
        })
      });
      await backend.load({
        characterId: "fox",
        source: { src: "Fox.glb" },
        options: { visual: { fit: "none", scale: 0.2 } }
      });
      const before = backend.status("fox").visual.alignment;
      const beforeSize = before.finalBounds.max.map(
        (value, axis) => value - before.finalBounds.min[axis]
      );
      surface.bounds = { min: [-4, -1, -0.75], max: [4, 1, 0.75] };
      const after = backend.configureVisual("fox", { rebindTarget: true });
      const afterSize = after.alignment.finalBounds.max.map(
        (value, axis) => value - after.alignment.finalBounds.min[axis]
      );
      for (let axis = 0; axis < 3; axis += 1) {
        assertApproximately(afterSize[axis], beforeSize[axis], 1e-6);
      }
      assertApproximately(after.alignment.scale[0], 0.2, 1e-6);
      assertApproximately(after.alignment.scale[1], 0.2, 1e-6);
      assertApproximately(after.alignment.scale[2], 0.2, 1e-6);
    },

    async "auto-fit alinha altura pés e converte frente glTF +Z para jogo +X"() {
      const surface = fakeThreeSurface({
        bounds: { min: [-1, -1, -1], max: [1, 1, 1] }
      });
      const asset = new THREE.Group();
      asset.add(new THREE.Mesh(
        new THREE.BoxGeometry(2, 10, 2),
        new THREE.MeshBasicMaterial()
      ));
      const backend = new ThreeCharacterAnimationBackend({
        surface,
        loaderFactory: () => ({
          async loadAsync() {
            return { scene: asset, animations: [new THREE.AnimationClip("Idle", 1, [])] };
          }
        })
      });
      await backend.load({
        characterId: "fox",
        source: { src: "Fox.glb" },
        options: { visual: { fit: "height" } }
      });
      const status = backend.status("fox");
      assertApproximately(status.visual.alignment.fitScale, 0.2, 1e-6);
      assertApproximately(status.visual.alignment.finalBounds.min[1], -1, 1e-6);
      assertApproximately(status.visual.alignment.finalBounds.max[1], 1, 1e-6);
      const forward = new THREE.Vector3(0, 0, 1)
        .applyQuaternion(surface.visual.quaternion);
      assertApproximately(forward.x, 1, 1e-6);
      assertApproximately(forward.z, 0, 1e-6);
    },

    async "realinhamento permanece local após transformar o proxy do personagem"() {
      const surface = fakeThreeSurface({
        bounds: { min: [-1, -1, -1], max: [1, 1, 1] },
        parentTransform: {
          position: [100, 25, -70],
          rotation: [0, Math.PI / 3, 0],
          scale: [3, 2, 4]
        }
      });
      const asset = new THREE.Group();
      asset.add(new THREE.Mesh(
        new THREE.BoxGeometry(2, 10, 2),
        new THREE.MeshBasicMaterial()
      ));
      const backend = new ThreeCharacterAnimationBackend({
        surface,
        loaderFactory: () => ({
          async loadAsync() {
            return { scene: asset, animations: [new THREE.AnimationClip("Idle", 1, [])] };
          }
        })
      });
      await backend.load({
        characterId: "fox",
        source: { src: "Fox.glb" },
        options: { visual: { fit: "height" } }
      });
      const status = backend.configureVisual("fox", { hover: 0.2 });
      assertApproximately(status.alignment.fitScale, 0.2, 1e-6);
      // Hover permanece uma translação visual independente do body físico.
      // hover permanece em unidade estável mesmo com scale Y=2 no proxy.
      assertApproximately(status.alignment.finalBounds.min[1], -0.8, 1e-6);
      assertApproximately(status.alignment.finalBounds.max[1], 1.2, 1e-6);
      assertEqual(Math.abs(status.alignment.position[0]) < 2, true);
      assertEqual(Math.abs(status.alignment.position[2]) < 2, true);
    },

    async "ajuste visual permite hover âncora e rotação sem alterar o rig"() {
      const surface = fakeThreeSurface({
        bounds: { min: [-1, -1, -1], max: [1, 1, 1] }
      });
      const asset = new THREE.Group();
      asset.add(new THREE.Mesh(
        new THREE.BoxGeometry(2, 10, 2),
        new THREE.MeshBasicMaterial()
      ));
      const backend = new ThreeCharacterAnimationBackend({
        surface,
        loaderFactory: () => ({
          async loadAsync() {
            return { scene: asset, animations: [new THREE.AnimationClip("Idle", 1, [])] };
          }
        })
      });
      await backend.load({
        characterId: "fox",
        source: { src: "Fox.glb" },
        options: { visual: { fit: "height" } }
      });
      const visual = backend.configureVisual("fox", {
        hover: 0.25,
        anchor: "feet",
        rotationDegrees: [30, 0, 0]
      });
      assertEqual(visual.options.rotationDegrees[0], 30);
      assertEqual(visual.options.hover, 0.25);
      assertApproximately(visual.alignment.finalBounds.min[1], -0.75, 1e-6);
    },

    async "backend permanece substituível pelo contrato genérico"() {
      const backend = fakeBackend();
      const system = new CharacterAnimationSystem({ backend });
      await system.load("hero", { src: "anything" }, {
        bindings: { idle: { clip: "Idle", fadeSeconds: 0.4 } }
      });
      const status = system.status("hero");
      assertEqual(status.backend.kind, "fake");
      assertEqual(status.bindings.idle.fadeSeconds, 0.4);
    }
  };
}

function fakeBackend() {
  return {
    plays: [],
    active: new Map(),
    advanced: 0,
    async load({ characterId }) {
      return {
        assetId: `asset:${characterId}`,
        clips: [
          { name: "Idle", duration: 1 },
          { name: "Walk", duration: 1 },
          { name: "Run", duration: 1 },
          { name: "Jump", duration: 0.5 },
          { name: "Fall", duration: 1 },
          { name: "Land", duration: 0.25 }
        ]
      };
    },
    setActive(characterId, active) {
      this.active.set(characterId, active);
      return true;
    },
    configureVisual(_characterId, visual) {
      return { options: structuredClone(visual), alignment: null };
    },
    play(characterId, request) {
      this.plays.push({ characterId, ...request });
      return request;
    },
    advance(dt) {
      this.advanced += dt;
      return true;
    },
    async unload(characterId) {
      this.active.delete(characterId);
      return true;
    },
    status() { return { kind: "fake" }; }
  };
}

function fakeThreeSurface({ bounds = null, parentTransform = null } = {}) {
  return {
    active: false,
    detached: false,
    bounds,
    physicalScale: parentTransform?.scale ?? [1, 1, 1],
    attachRuntimeVisual(objectId, visual, options = {}) {
      this.objectId = objectId;
      this.visual = visual;
      const poseRoot = new THREE.Group();
      poseRoot.position.fromArray(parentTransform?.position ?? [0, 0, 0]);
      poseRoot.rotation.set(...(parentTransform?.rotation ?? [0, 0, 0]));
      poseRoot.scale.set(1, 1, 1);
      poseRoot.add(visual);
      poseRoot.updateMatrixWorld(true);
      this.poseRoot = poseRoot;
      this.active = Boolean(options.active);
      return { key: `character-animation:${objectId}` };
    },
    readRuntimeVisualTargetFrame(objectId) {
      return this.bounds ? { objectId, bounds: this.bounds } : null;
    },
    setRuntimeVisualActive(_handle, active) {
      this.active = Boolean(active);
      return true;
    },
    detachRuntimeVisual() {
      this.detached = true;
      return true;
    }
  };
}

function assertEqual(actual, expected) {
  if (actual !== expected) throw new Error(`Esperado ${expected}, recebido ${actual}.`);
}

function assertApproximately(actual, expected, epsilon) {
  if (Math.abs(actual - expected) > epsilon) {
    throw new Error(`Esperado ~${expected}, recebido ${actual}.`);
  }
}
