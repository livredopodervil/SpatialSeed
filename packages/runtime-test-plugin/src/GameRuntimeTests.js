import {
  GameAudioRuntime,
  GameEventRuntime,
  GameRuntime,
  characterBodyWorldObb,
  characterWorldBounds,
  createCharacterPhysicsState,
  castCollisionSegment,
  intersectsCharacterBody,
  intersectsCharacterBounds,
  normalizeCollisionWorld,
  normalizeGameDirectionalInput,
  stepCharacterPhysics
} from "../../game-runtime/src/index.js?build=20260818-0054mu";

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
    "controle circular preserva direção diagonal intensidade e zona morta"() {
      const diagonal = normalizeGameDirectionalInput({
        offsetX: 50,
        offsetY: -50,
        radius: 100
      });
      assertNear(diagonal.strafe, 0.4718, 0.001);
      assertNear(diagonal.forward, 0.4718, 0.001);
      assertNear(diagonal.magnitude, 0.6672, 0.001);
      const edge = normalizeGameDirectionalInput({
        offsetX: -200,
        offsetY: 0,
        radius: 100
      });
      assertNear(edge.strafe, -1, 1e-9);
      assertNear(edge.forward, 0, 1e-9);
      const center = normalizeGameDirectionalInput({
        offsetX: 5,
        offsetY: -5,
        radius: 100
      });
      assertNear(center.magnitude, 0, 1e-9);
      assertNear(center.forward, 0, 1e-9);
      assertNear(center.strafe, 0, 1e-9);
    },
    "gravidade apoia o personagem sobre uma plataforma"() {
      const state = characterState([0, 3, 0]);
      const world = normalizeCollisionWorld([PLATFORM]);
      simulate(state, world, 180);
      assertEqual(state.grounded, true);
      assertNear(state.position[1], 0.5, 0.002);
      assertEqual(state.animationState, "idle");
      const support = state.contacts.find(contact => contact.kind === "support");
      assertEqual(Boolean(support), true);
      assertEqual(support.colliderId, "platform");
      assertEqual(support.normal[1], 1);
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
      const wall = state.contacts.find(contact =>
        contact.kind === "blocked" && contact.colliderId === "wall"
      );
      assertEqual(Boolean(wall), true);
      assertEqual(wall.normal[0], -1);
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

    "corpo OBB rejeita falso positivo da AABB conservadora"() {
      const state = createCharacterPhysicsState({
        pivot: [0, 0, 0],
        bodyFrame: {
          centerOffset: [0, 0, 0],
          halfExtents: [1.5, 0.5, 0.2],
          baseYaw: Math.PI / 4
        }
      });
      const obstacle = normalizeCollisionWorld([{
        id: "corner-outside-obb",
        bounds: { min: [0.9, -0.1, 0.9], max: [1.1, 0.1, 1.1] }
      }])[0];
      assertEqual(intersectsCharacterBounds(characterWorldBounds(state), obstacle), true);
      assertEqual(intersectsCharacterBody(characterBodyWorldObb(state), obstacle), false);
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

    "plano copiado permanece válido como colisor sem volume AABB"() {
      const world = normalizeCollisionWorld([{
        id: "copied-plane",
        broadBounds: { min: [-2, -2, 0], max: [2, 2, 0] },
        collider: {
          type: "triangle-mesh",
          parts: [{
            triangles: [
              -2, -2, 0,  2, -2, 0,  2, 2, 0,
              -2, -2, 0,  2,  2, 0, -2, 2, 0
            ],
            worldMatrix: [
              1, 0, 0, 0,
              0, 1, 0, 0,
              0, 0, 1, 0,
              0, 0, 0, 1
            ]
          }]
        }
      }]);
      assertEqual(world.length, 1);
      assertEqual(world[0].broadBounds.min[2] < 0, true);
      assertEqual(world[0].broadBounds.max[2] > 0, true);
      const hit = castCollisionSegment([0, 0, 2], [0, 0, -2], world);
      assertEqual(hit?.colliderId, "copied-plane");
      assertNear(hit?.distance ?? -1, 2, 1e-6);
    },

    "consulta de câmera retorna a primeira superfície no segmento"() {
      const world = normalizeCollisionWorld([
        { id: "far", bounds: { min: [-2, -2, 4], max: [2, 2, 4.2] } },
        { id: "near", bounds: { min: [-2, -2, 2], max: [2, 2, 2.2] } }
      ]);
      const hit = castCollisionSegment([0, 0, 0], [0, 0, 6], world);
      assertEqual(hit?.colliderId, "near");
      assertNear(hit?.distance ?? -1, 2, 1e-6);
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

    "rampa sobe e desce aderida sem converter inclinação em degraus"() {
      const world = rampWorld();
      const ascending = characterState([-0.6, 0.5, 0]);
      let airborneAscent = 0;
      let maximumAscentStep = 0;
      let previousY = ascending.position[1];
      for (let index = 0; index < 48; index += 1) {
        stepCharacterPhysics(ascending, { worldX: 1 }, world, undefined, 1 / 60);
        if (index > 4 && !ascending.grounded) airborneAscent += 1;
        if (index > 4) {
          maximumAscentStep = Math.max(
            maximumAscentStep,
            Math.abs(ascending.position[1] - previousY)
          );
        }
        previousY = ascending.position[1];
      }
      assertEqual(airborneAscent, 0);
      assertEqual(ascending.position[1] > 1.2, true);
      assertEqual(ascending.velocity[0] > 4, true);
      assertEqual(maximumAscentStep < 0.08, true);

      const descending = characterState([3.4, 2.56, 0]);
      let airborneDescent = 0;
      let maximumDescentStep = 0;
      previousY = descending.position[1];
      for (let index = 0; index < 36; index += 1) {
        stepCharacterPhysics(descending, { worldX: -1 }, world, undefined, 1 / 60);
        if (index > 2 && !descending.grounded) airborneDescent += 1;
        if (index > 2) {
          maximumDescentStep = Math.max(
            maximumDescentStep,
            Math.abs(descending.position[1] - previousY)
          );
        }
        previousY = descending.position[1];
      }
      assertEqual(airborneDescent, 0);
      assertEqual(maximumDescentStep < 0.08, true);
      assertNear(ascending.facingYaw, 0, 0.03);
      assertNear(Math.abs(descending.facingYaw), Math.PI, 0.03);
    },

    "visual acompanha a direção mesmo quando a OBB não pode girar"() {
      const fixture = runtimeFixture({
        colliders: [
          PLATFORM,
          { id: "wall", bounds: { min: [-8, -1, 0.8], max: [8, 3, 1.2] } }
        ],
        characterBodyFrame: {
          centerOffset: [0, 0, 0],
          halfExtents: [2, 0.5, 0.5],
          baseYaw: 0
        }
      });
      const runtime = new GameRuntime({
        surface: fixture.surface,
        cameraController: fixture.camera
      });
      runtime.start({
        characterId: "character",
        controls: { movementReference: "world" }
      });
      runtime.setInput({ strafe: 1 });
      for (let index = 0; index < 30; index += 1) {
        runtime.advance({ deltaSeconds: 1 / 60 });
      }
      const status = runtime.status();
      const matrix = fixture.frames.at(-1).unitFrames[0].matrix;
      assertNear(status.visualYaw, -Math.PI / 2, 0.03);
      assertEqual(Math.abs(status.yaw - status.visualYaw) > 0.1, true);
      assertNear(matrix[0], 0, 0.03);
      runtime.dispose();
    },

    "parede bloqueia a normal e preserva o movimento tangencial"() {
      const state = characterState([0, 0.5, -2]);
      const world = normalizeCollisionWorld([
        PLATFORM,
        { id: "wall", bounds: { min: [1, -1, -8], max: [1.5, 3, 8] } }
      ]);
      simulate(state, world, 90, { worldX: 1, worldZ: 1 });
      assertEqual(state.position[0] < 0.6, true);
      assertEqual(state.position[2] > 1, true);
      assertEqual(state.grounded, true);
      assertNear(state.position[1], 0.501, 0.004);
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

    "yaw segue o frame canônico +X/+Z"() {
      const forward = characterState([0, 0.5, 0]);
      const backward = characterState([0, 0.5, 0]);
      const right = characterState([0, 0.5, 0]);
      const left = characterState([0, 0.5, 0]);
      const world = normalizeCollisionWorld([PLATFORM]);

      simulate(forward, world, 60, { worldX: 1, worldZ: 0 });
      simulate(backward, world, 60, { worldX: -1, worldZ: 0 });
      simulate(right, world, 60, { worldX: 0, worldZ: 1 });
      simulate(left, world, 60, { worldX: 0, worldZ: -1 });

      assertEqual(forward.position[0] > 0.5, true);
      assertEqual(backward.position[0] < -0.5, true);
      assertEqual(right.position[2] > 0.5, true);
      assertEqual(left.position[2] < -0.5, true);

      assertNear(forward.yaw, 0, 0.03);
      assertNear(Math.abs(backward.yaw), Math.PI, 0.03);
      assertNear(right.yaw, -Math.PI / 2, 0.03);
      assertNear(left.yaw, Math.PI / 2, 0.03);
    },

    "body horizontal acompanha o yaw sem perder comprimento físico"() {
      const state = createCharacterPhysicsState({
        pivot: [0, 0.5, 0],
        bodyFrame: {
          centerOffset: [0, 0, 0],
          halfExtents: [2, 0.5, 0.5],
          baseYaw: 0
        }
      });
      let bounds = characterWorldBounds(state);
      assertNear(bounds.max[0] - bounds.min[0], 4, 1e-9);
      assertNear(bounds.max[2] - bounds.min[2], 1, 1e-9);

      state.yaw = -Math.PI / 2;
      bounds = characterWorldBounds(state);
      assertNear(bounds.max[0] - bounds.min[0], 1, 1e-9);
      assertNear(bounds.max[2] - bounds.min[2], 4, 1e-9);
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

    "diagnóstico de colisão publica overlay somente quando ativado"() {
      const fixture = runtimeFixture();
      const runtime = new GameRuntime({
        surface: fixture.surface,
        cameraController: fixture.camera
      });
      runtime.start({ characterId: "character" });
      assertEqual(runtime.status().debug.collision, false);
      runtime.setCollisionDebug({ enabled: true });
      assertEqual(runtime.status().debug.collision, true);
      assertEqual(fixture.collisionDebug.at(-1).enabled, true);
      runtime.advance({ deltaSeconds: 1 / 60 });
      assertEqual(Array.isArray(fixture.collisionDebug.at(-1).contacts), true);
      assertEqual(Array.isArray(fixture.collisionDebug.at(-1).characterBody.axes), true);
      runtime.setCollisionDebug({ enabled: false });
      assertEqual(fixture.collisionDebug.at(-1), null);
      runtime.dispose();
    },

    "frame mundial preserva W/S frente e A/D lateral"() {
      const forwardFixture = runtimeFixture();
      const strafeFixture = runtimeFixture();
      const forwardRuntime = new GameRuntime({
        surface: forwardFixture.surface,
        cameraController: forwardFixture.camera
      });
      const strafeRuntime = new GameRuntime({
        surface: strafeFixture.surface,
        cameraController: strafeFixture.camera
      });
      forwardRuntime.start({
        characterId: "character",
        controls: { movementReference: "world" }
      });
      strafeRuntime.start({
        characterId: "character",
        controls: { movementReference: "world" }
      });
      forwardRuntime.setInput({ forward: 1, strafe: 0 });
      strafeRuntime.setInput({ forward: 0, strafe: 1 });
      for (let index = 0; index < 30; index += 1) {
        forwardRuntime.advance({ deltaSeconds: 1 / 60 });
        strafeRuntime.advance({ deltaSeconds: 1 / 60 });
      }
      const forward = forwardRuntime.status().position;
      const strafe = strafeRuntime.status().position;
      assertEqual(forward[0] > 0.2, true);
      assertNear(forward[2], 0, 0.08);
      assertEqual(strafe[2] > 0.2, true);
      assertNear(strafe[0], 0, 0.08);
      forwardRuntime.dispose();
      strafeRuntime.dispose();
    },

    "movimento padrão acompanha a câmera livre"() {
      const left = runtimeFixture({
        cameraSnapshot: {
          position: [6, 4, 0], target: [0, 1, 0], up: [0, 1, 0],
          projection: { mode: "perspective" }
        }
      });
      const right = runtimeFixture({
        cameraSnapshot: {
          position: [-6, 4, 0], target: [0, 1, 0], up: [0, 1, 0],
          projection: { mode: "perspective" }
        }
      });
      const first = new GameRuntime({ surface: left.surface, cameraController: left.camera });
      const second = new GameRuntime({ surface: right.surface, cameraController: right.camera });
      first.start({ characterId: "character" });
      second.start({ characterId: "character" });
      first.setInput({ forward: 1 });
      second.setInput({ forward: 1 });
      for (let index = 0; index < 30; index += 1) {
        first.advance({ deltaSeconds: 1 / 60 });
        second.advance({ deltaSeconds: 1 / 60 });
      }
      const firstPosition = first.status().position;
      const secondPosition = second.status().position;
      assertEqual(first.status().controls.movementReference, "camera");
      assertEqual(second.status().controls.movementReference, "camera");
      // Câmera em +X olha para -X; câmera em -X olha para +X.
      assertEqual(firstPosition[0] < -0.2, true);
      assertEqual(secondPosition[0] > 0.2, true);
      first.dispose();
      second.dispose();
    },

    "referência mundial permanece configurável"() {
      const fixture = runtimeFixture();
      const runtime = new GameRuntime({
        surface: fixture.surface,
        cameraController: fixture.camera
      });
      runtime.start({
        characterId: "character",
        controls: { movementReference: "world" }
      });
      assertEqual(runtime.status().controls.movementReference, "world");
      runtime.configure({ controls: { movementReference: "camera" } });
      assertEqual(runtime.status().controls.movementReference, "camera");
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

    "câmera de jogo retrai antes de atravessar parede"() {
      const wall = {
        id: "camera-wall",
        bounds: { min: [-3, -2, 2], max: [3, 5, 2.2] }
      };
      const fixture = runtimeFixture({
        colliders: [PLATFORM, wall],
        cameraSnapshot: {
          position: [0, 2, 6],
          target: [0, 1, 0],
          up: [0, 1, 0],
          projection: { mode: "perspective" }
        }
      });
      const runtime = new GameRuntime({
        surface: fixture.surface,
        cameraController: fixture.camera
      });
      runtime.start({
        characterId: "character",
        camera: {
          distance: 6,
          height: 1,
          pitch: 0,
          collisionEnabled: true,
          collisionProbeRadius: 0.18
        }
      });
      const lookAt = fixture.cameraCommands.find(entry =>
        entry.command === "viewer.camera.look-at"
      );
      assertEqual(Boolean(lookAt), true);
      assertEqual(lookAt.args.position[2] < 2, true);
      assertEqual(lookAt.args.position[2] > 0, true);
      runtime.dispose();
    },

    "câmera mantém estado livre separado e não entra no corpo durante lag"() {
      const fixture = runtimeFixture({
        cameraSnapshot: {
          position: [0, 1.2, 0.08],
          target: [0, 1, 0],
          up: [0, 1, 0],
          projection: { mode: "perspective" }
        }
      });
      const runtime = new GameRuntime({
        surface: fixture.surface,
        cameraController: fixture.camera
      });
      runtime.start({
        characterId: "character",
        camera: {
          distance: 6,
          height: 1,
          pitch: 0,
          lag: 4,
          collisionEnabled: true,
          collisionProbeRadius: 0.18,
          collisionCharacterPadding: 0.08
        }
      });
      for (let index = 0; index < 20; index += 1) {
        runtime.advance({ deltaSeconds: 1 / 60 });
      }
      const lookAt = fixture.cameraCommands.filter(entry =>
        entry.command === "viewer.camera.look-at"
      ).at(-1);
      const dx = lookAt.args.position[0] - lookAt.args.target[0];
      const dy = lookAt.args.position[1] - lookAt.args.target[1];
      const dz = lookAt.args.position[2] - lookAt.args.target[2];
      assertEqual(Math.hypot(dx, dy, dz) > 0.5, true);
      runtime.dispose();
    },

    "câmera inicia diretamente no rig configurado e não na posição editorial"() {
      const fixture = runtimeFixture({
        cameraSnapshot: {
          position: [0, 1.2, 0.3],
          target: [0, 1, 0],
          up: [0, 1, 0],
          projection: { mode: "perspective" }
        }
      });
      const runtime = new GameRuntime({
        surface: fixture.surface,
        cameraController: fixture.camera
      });
      runtime.start({
        characterId: "character",
        camera: { distance: 6, height: 2.2, pitch: -0.12 }
      });
      const lookAt = fixture.cameraCommands.find(entry =>
        entry.command === "viewer.camera.look-at"
      );
      const dx = lookAt.args.position[0] - lookAt.args.target[0];
      const dy = lookAt.args.position[1] - lookAt.args.target[1];
      const dz = lookAt.args.position[2] - lookAt.args.target[2];
      assertEqual(Math.hypot(dx, dy, dz) > 4.5, true);
      runtime.dispose();
    },

    "distância nominal da câmera cresce com o comprimento físico do body"() {
      const short = runtimeFixture({
        colliders: [],
        characterBodyFrame: {
          centerOffset: [0, 0, 0],
          halfExtents: [0.5, 0.5, 0.5],
          baseYaw: 0
        },
        cameraSnapshot: {
          position: [6, 2, 0], target: [0, 0.5, 0], up: [0, 1, 0],
          projection: { mode: "perspective" }
        }
      });
      const long = runtimeFixture({
        colliders: [],
        characterBodyFrame: {
          centerOffset: [0, 0, 0],
          halfExtents: [2, 0.5, 0.5],
          baseYaw: 0
        },
        cameraSnapshot: {
          position: [6, 2, 0], target: [0, 0.5, 0], up: [0, 1, 0],
          projection: { mode: "perspective" }
        }
      });
      const first = new GameRuntime({ surface: short.surface, cameraController: short.camera });
      const second = new GameRuntime({ surface: long.surface, cameraController: long.camera });
      first.start({ characterId: "character", camera: { distance: 4, height: 1, pitch: 0 } });
      second.start({ characterId: "character", camera: { distance: 4, height: 1, pitch: 0 } });
      const shortLook = short.cameraCommands.find(entry =>
        entry.command === "viewer.camera.look-at"
      );
      const longLook = long.cameraCommands.find(entry =>
        entry.command === "viewer.camera.look-at"
      );
      const shortDistance = Math.hypot(
        shortLook.args.position[0] - shortLook.args.target[0],
        shortLook.args.position[2] - shortLook.args.target[2]
      );
      const longDistance = Math.hypot(
        longLook.args.position[0] - longLook.args.target[0],
        longLook.args.position[2] - longLook.args.target[2]
      );
      assertEqual(longDistance > shortDistance + 1.4, true);
      first.dispose();
      second.dispose();
    },

    "câmera não orbita abaixo da base física do personagem"() {
      const fixture = runtimeFixture();
      const runtime = new GameRuntime({
        surface: fixture.surface,
        cameraController: fixture.camera
      });
      runtime.start({
        characterId: "character",
        camera: { minimumPitch: -1.2, pitch: -1.1, minimumBaseClearance: 0.25 }
      });
      runtime.setInput({ lookPitchDelta: -1 });
      runtime.advance({ deltaSeconds: 1 / 60 });
      const lookAt = fixture.cameraCommands.filter(entry =>
        entry.command === "viewer.camera.look-at"
      ).at(-1);
      // O fixture usa bounds de personagem com base em y=0.
      assertEqual(lookAt.args.position[1] >= 0.24, true);
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

function rampWorld() {
  const angle = Math.atan2(2, 4);
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const halfLength = Math.sqrt(5);
  return normalizeCollisionWorld([
    {
      id: "ramp-entry",
      bounds: { min: [-8, -1, -8], max: [0, 0, 8] }
    },
    {
      id: "ramp",
      broadBounds: { min: [-0.2, -0.2, -2], max: [4.2, 2.2, 2] },
      collider: {
        type: "local-box",
        localBounds: {
          min: [-halfLength, -0.1, -2],
          max: [halfLength, 0.1, 2]
        },
        worldMatrix: [
          cosine, sine, 0, 0,
          -sine, cosine, 0, 0,
          0, 0, 1, 0,
          2, 1, 0, 1
        ]
      }
    }
  ]);
}

function runtimeFixture({
  colliders = [PLATFORM],
  characterBodyFrame = null,
  cameraSnapshot = {
    position: [4, 4, 7],
    target: [0, 1, 0],
    up: [0, 1, 0],
    projection: { mode: "perspective" }
  }
} = {}) {
  const frames = [];
  const acquired = [];
  const released = [];
  const presentation = [];
  const collisionDebug = [];
  const cameraCommands = [];
  const frozenCameraSnapshot = Object.freeze({
    position: Object.freeze([...cameraSnapshot.position]),
    target: Object.freeze([...cameraSnapshot.target]),
    up: Object.freeze([...cameraSnapshot.up]),
    projection: Object.freeze({ ...cameraSnapshot.projection })
  });
  const fixture = {
    frames,
    acquired,
    released,
    presentation,
    collisionDebug,
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
        character: {
          id: "character",
          bounds: CHARACTER_BOUNDS,
          bodyFrame: characterBodyFrame
        },
        colliders
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
    setRuntimePresentationMode(mode) { presentation.push(mode); },
    setGameCollisionDebug(snapshot) { collisionDebug.push(snapshot); return true; }
  };
  fixture.camera = {
    snapshot() { return frozenCameraSnapshot; },
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
