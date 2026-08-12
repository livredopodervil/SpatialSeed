import {
  GameAudioRuntime,
  GameEventRuntime,
  GameRuntime,
  createCharacterPhysicsState,
  intersectsCharacterBounds,
  normalizeCollisionWorld,
  stepCharacterPhysics
} from "../../game-runtime/src/index.js?build=20260810-0054f";

const CHARACTER_BOUNDS = Object.freeze({
  min: Object.freeze([-0.5, 0.5, -0.5]),
  max: Object.freeze([0.5, 1.5, 0.5])
});
const PLATFORM = Object.freeze({
  id: "platform",
  bounds: Object.freeze({
    min: Object.freeze([-8, -1, -8]),
    max: Object.freeze([8, 0, 8])
  })
});

export function createGameRuntimeTests() {
  return {
    "gravidade apoia o personagem sobre uma plataforma"() {
      const state = characterState([0, 3, 0]);
      const world = normalizeCollisionWorld([PLATFORM]);
      simulate(state, world, 180);
      assertEqual(state.grounded, true);
      assertNear(state.position[1], 0.5, 0.002);
      assertEqual(state.animationState, "idle");
    },

    "colisão lateral impede atravessar uma parede"() {
      const state = characterState([0, 0.5, 0]);
      const world = normalizeCollisionWorld([
        PLATFORM,
        {
          id: "wall",
          bounds: { min: [1, -1, -2], max: [1.5, 3, 2] }
        }
      ]);
      simulate(state, world, 120, { worldX: 1 });
      assertEqual(state.position[0] < 0.6, true);
      assertEqual(state.grounded, true);
    },

    "interpenetração inicial é resolvida sem atravessar a plataforma"() {
      const state = characterState([0, 0.35, 0]);
      const world = normalizeCollisionWorld([PLATFORM]);
      simulate(state, world, 10);
      assertEqual(state.grounded, true);
      assertEqual(state.position[1] >= 0.5, true);
    },

    "pulo sobe, cai e retorna ao chão"() {
      const state = characterState([0, 0.5, 0]);
      const world = normalizeCollisionWorld([PLATFORM]);
      simulate(state, world, 2);
      stepCharacterPhysics(
        state,
        { jump: true },
        world,
        undefined,
        1 / 60
      );
      let maximumY = state.position[1];
      let sawFall = false;
      for (let index = 0; index < 180; index += 1) {
        stepCharacterPhysics(state, {}, world, undefined, 1 / 60);
        maximumY = Math.max(maximumY, state.position[1]);
        sawFall ||= state.animationState === "fall";
      }
      assertEqual(maximumY > 1.5, true);
      assertEqual(sawFall, true);
      assertEqual(state.grounded, true);
      assertNear(state.position[1], 0.5, 0.002);
    },


    "narrow phase respeita caixa local rotacionada"() {
      const c = Math.SQRT1_2;
      const rotated = normalizeCollisionWorld([{
        id: "rotated-bar",
        broadBounds: { min: [-1.5, -0.5, -1.5], max: [1.5, 0.5, 1.5] },
        collider: {
          type: "local-box",
          localBounds: { min: [-1, -0.5, -0.1], max: [1, 0.5, 0.1] },
          worldMatrix: [
            c, 0, -c, 0,
            0, 1, 0, 0,
            c, 0, c, 0,
            0, 0, 0, 1
          ]
        }
      }])[0];
      assertEqual(intersectsCharacterBounds(
        { min: [0.85, -0.1, 0.85], max: [0.95, 0.1, 0.95] },
        rotated
      ), false);
      assertEqual(intersectsCharacterBounds(
        { min: [0.55, -0.1, -0.75], max: [0.65, 0.1, -0.65] },
        rotated
      ), true);
    },

    "malha triangular rejeita vazio interno ao broad bounds"() {
      const mesh = normalizeCollisionWorld([{
        id: "triangle",
        broadBounds: { min: [0, -0.1, 0], max: [2, 0.1, 2] },
        collider: {
          type: "triangle-mesh",
          parts: [{
            triangles: [
              0, 0, 0,
              2, 0, 0,
              0, 0, 2
            ],
            worldMatrix: [
              1, 0, 0, 0,
              0, 1, 0, 0,
              0, 0, 1, 0,
              0, 0, 0, 1
            ]
          }]
        }
      }])[0];
      assertEqual(intersectsCharacterBounds(
        { min: [1.55, -0.05, 1.55], max: [1.65, 0.05, 1.65] },
        mesh
      ), false);
      assertEqual(intersectsCharacterBounds(
        { min: [0.35, -0.05, 0.35], max: [0.45, 0.05, 0.45] },
        mesh
      ), true);
    },

    "esfera analítica não usa os cantos da AABB"() {
      const sphere = normalizeCollisionWorld([{
        id: "sphere",
        broadBounds: { min: [-1, -1, -1], max: [1, 1, 1] },
        collider: { type: "sphere", center: [0, 0, 0], radius: 1 }
      }])[0];
      assertEqual(intersectsCharacterBounds(
        { min: [0.85, 0.85, 0.85], max: [0.95, 0.95, 0.95] },
        sphere
      ), false);
      assertEqual(intersectsCharacterBounds(
        { min: [0.55, -0.05, -0.05], max: [0.65, 0.05, 0.05] },
        sphere
      ), true);
    },

    "contrato legado AABB continua aceito"() {
      const legacy = normalizeCollisionWorld([{
        id: "legacy",
        bounds: { min: [0, 0, 0], max: [1, 1, 1] }
      }])[0];
      assertEqual(intersectsCharacterBounds(
        { min: [0.2, 0.2, 0.2], max: [0.3, 0.3, 0.3] },
        legacy
      ), true);
    },

    "movimento diagonal preserva os dois eixos"() {
      const state = characterState([0, 0.5, 0]);
      const world = normalizeCollisionWorld([PLATFORM]);
      simulate(state, world, 60, { worldX: 1, worldZ: -1 });
      assertEqual(Math.abs(state.position[0]) > 0.5, true);
      assertEqual(Math.abs(state.position[2]) > 0.5, true);
      assertNear(
        Math.abs(state.position[0]),
        Math.abs(state.position[2]),
        0.08
      );
    },


    "pulo permanece livre junto a parede lateral"() {
      const state = characterState([0.58, 0.5, 0]);
      const world = normalizeCollisionWorld([
        PLATFORM,
        { id: "wall", bounds: { min: [1, -1, -2], max: [1.5, 3, 2] } }
      ]);
      simulate(state, world, 2);
      stepCharacterPhysics(state, { jump: true }, world, undefined, 1 / 60);
      assertEqual(state.velocity[1] > 0, true);
      assertEqual(state.position[1] > 0.5, true);
      assertEqual(state.grounded, false);
    },

    "eventos de jogo filtram por objeto e executam ações"() {
      const actions = [];
      const events = new GameEventRuntime({
        executeAction: async (action, event) => {
          actions.push({ action, event });
          return action.type;
        }
      });
      events.configure({ bindings: [{
        event: "character.jump",
        objectId: "character",
        actions: [{ type: "audio.effect", name: "jump" }]
      }] });
      events.emit("character.jump", { objectId: "other" });
      events.emit("character.jump", { objectId: "character" });
      assertEqual(events.has("character.jump"), true);
      assertEqual(actions.length, 1);
      assertEqual(actions[0].action.name, "jump");
    },

    "audio do jogo suporta música em loop e efeitos"() {
      const created = [];
      const audio = new GameAudioRuntime({
        createAudio: src => {
          const item = { src, volume: 1, loop: false, currentTime: 0,
            play() { item.played = true; }, pause() { item.paused = true; } };
          created.push(item);
          return item;
        }
      });
      audio.configure({
        music: { src: "music.ogg", volume: 0.4 },
        effects: { jump: { src: "jump.wav", volume: 0.8 } }
      });
      audio.playMusic();
      audio.playEffect("jump");
      assertEqual(created[0].loop, true);
      assertEqual(created[0].volume, 0.4);
      assertEqual(created[1].loop, false);
      assertEqual(created[1].volume, 0.8);
    },

    "runtime aceita frente e strafe simultâneos e ainda pula"() {
      const fixture = runtimeFixture();
      const runtime = new GameRuntime({
        surface: fixture.surface,
        cameraController: fixture.camera
      });
      runtime.start({ characterId: "character" });
      runtime.setInput({ forward: 1, strafe: 1 });
      for (let index = 0; index < 30; index += 1) {
        runtime.advance({ deltaSeconds: 1 / 60 });
      }
      const moved = runtime.status();
      assertEqual(Math.hypot(moved.position[0], moved.position[2]) > 0.2, true);
      runtime.setInput({ forward: 1, strafe: 1, jump: true });
      runtime.advance({ deltaSeconds: 1 / 60 });
      const jumped = runtime.status();
      assertEqual(jumped.velocity[1] > 0, true);
      assertEqual(jumped.grounded, false);
      runtime.dispose();
    },

    "configuração expõe inversão horizontal do mouse"() {
      const fixture = runtimeFixture();
      const runtime = new GameRuntime({
        surface: fixture.surface,
        cameraController: fixture.camera
      });
      runtime.start({
        characterId: "character",
        camera: { invertYaw: true }
      });
      assertEqual(runtime.status().camera.invertYaw, true);
      runtime.configure({ camera: { invertYaw: false } });
      assertEqual(runtime.status().camera.invertYaw, false);
      runtime.dispose();
    },

    "runtime aplica overlay local, acompanha com câmera e restaura autoria"() {
      const fixture = runtimeFixture();
      const runtime = new GameRuntime({
        surface: fixture.surface,
        cameraController: fixture.camera
      });
      const started = runtime.start({ characterId: "character" });
      assertEqual(started.state, "running");
      assertEqual(fixture.presentation.at(-1), "game");
      assertEqual(fixture.acquired.length, 1);
      runtime.setInput({ forward: 1 });
      for (let index = 0; index < 30; index += 1) {
        runtime.advance({ deltaSeconds: 1 / 60 });
      }
      assertEqual(fixture.frames.length > 1, true);
      assertEqual(
        fixture.cameraCommands.some(entry =>
          entry.command === "viewer.camera.look-at"
        ),
        true
      );
      const stopped = runtime.stop("test");
      assertEqual(stopped.state, "idle");
      assertEqual(fixture.restored, 1);
      assertEqual(fixture.released.length, 1);
      assertEqual(fixture.presentation.at(-1), "authoring");
      assertEqual(fixture.cameraCommands.at(-1).command, "viewer.camera.restore");
      runtime.dispose();
    },

    "alteração do próprio personagem encerra a sessão transitória"() {
      const fixture = runtimeFixture();
      const runtime = new GameRuntime({
        surface: fixture.surface,
        cameraController: fixture.camera
      });
      runtime.start({ characterId: "character" });
      const handled = runtime.sceneChanged([
        { type: "object-updated", objectId: "character" }
      ]);
      assertEqual(handled, true);
      assertEqual(runtime.status().state, "idle");
      assertEqual(runtime.status().statistics.lastStopReason, "character-changed");
      runtime.dispose();
    }
  };
}

function characterState(pivot) {
  return createCharacterPhysicsState({
    pivot,
    bounds: {
      min: CHARACTER_BOUNDS.min.map((value, axis) =>
        value + pivot[axis] - [0, 1, 0][axis]
      ),
      max: CHARACTER_BOUNDS.max.map((value, axis) =>
        value + pivot[axis] - [0, 1, 0][axis]
      )
    }
  });
}

function simulate(state, world, frames, input = {}) {
  for (let index = 0; index < frames; index += 1) {
    stepCharacterPhysics(state, input, world, undefined, 1 / 60);
  }
}

function runtimeFixture() {
  const frames = [];
  const acquired = [];
  const released = [];
  const presentation = [];
  const cameraCommands = [];
  const cameraSnapshot = Object.freeze({
    position: Object.freeze([4, 4, 7]),
    target: Object.freeze([0, 1, 0]),
    up: Object.freeze([0, 1, 0]),
    projection: Object.freeze({ mode: "perspective" })
  });
  const fixture = {
    frames,
    acquired,
    released,
    presentation,
    cameraCommands,
    restored: 0
  };
  fixture.surface = {
    subscribeFrame(listener) {
      fixture.frameListener = listener;
      return () => { fixture.frameListener = null; };
    },
    acquireFrameDemand(label) {
      const token = `demand-${acquired.length + 1}`;
      acquired.push({ token, label });
      return token;
    },
    releaseFrameDemand(token) { released.push(token); },
    readGameCollisionWorld() {
      return {
        character: { id: "character", bounds: CHARACTER_BOUNDS },
        colliders: [PLATFORM]
      };
    },
    captureAnimationTargets(ids, { overlayId }) {
      return Object.freeze({
        overlayId,
        units: Object.freeze([
          Object.freeze({ unitId: ids[0], pivot: Object.freeze([0, 1, 0]) })
        ])
      });
    },
    applyAnimationFrame(targets, unitFrames) {
      frames.push({ targets, unitFrames });
      return { changed: true };
    },
    restoreAnimationTargets() { fixture.restored += 1; },
    setRuntimePresentationMode(mode) { presentation.push(mode); }
  };
  fixture.camera = {
    snapshot() { return cameraSnapshot; },
    execute(command, args) {
      cameraCommands.push({ command, args });
      return { changed: true };
    }
  };
  return fixture;
}

function assertEqual(actual, expected) {
  if (!Object.is(actual, expected)) {
    throw new Error(`Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}.`);
  }
}

function assertNear(actual, expected, tolerance) {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`Expected ${actual} to be within ${tolerance} of ${expected}.`);
  }
}
