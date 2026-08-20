import {
  GamePresentationRuntime
} from "../../game-runtime/src/index.js?build=20260818-0054my&revision=20260820-0054nd2";
import {
  createDefaultPropertyRegistry
} from "../../property-registry/src/index.js?build=20260818-0054mv&revision=20260820-0054nd2";

export function createGamePresentationTests() {
  return {
    "HUD resolve valores do GameSessionState sem copiar estado para a UI"() {
      const state = { score: 2, hasKey: false };
      const runtime = new GamePresentationRuntime({
        readStateValue: (_dataId, path) => state[path]
      });
      runtime.start();
      runtime.showHudText({
        id: "score",
        text: "Score: {game-state.score}",
        anchor: "top-left"
      });
      assertEqual(runtime.snapshot().hud[0].text, "Score: 2");
      state.score = 7;
      assertEqual(runtime.snapshot().hud[0].text, "Score: 7");
    },

    "diálogo é efêmero e stop limpa a apresentação da sessão"() {
      const runtime = new GamePresentationRuntime();
      runtime.start();
      runtime.showDialog({ speaker: "Terminal", text: "Área de testes." });
      assertEqual(runtime.snapshot().dialog.speaker, "Terminal");
      assertEqual(runtime.snapshot().dialog.text, "Área de testes.");
      runtime.closeDialog();
      assertEqual(runtime.snapshot().dialog, null);
      runtime.showHudText({ text: "HUD" });
      runtime.stop();
      assertEqual(runtime.snapshot().active, false);
      assertEqual(runtime.snapshot().hud.length, 0);
      assertEqual(runtime.snapshot().worldText.length, 0);
    },

    "texto no mundo acompanha a projeção atual do objeto"() {
      let x = 10;
      const runtime = new GamePresentationRuntime({
        projectObject: objectId => ({
          x,
          y: objectId === "sign" ? 20 : 0,
          z: 0,
          visible: true
        })
      });
      runtime.start({
        worldText: [{
          id: "authored:sign",
          objectId: "sign",
          text: "SENSORES",
          offsetX: 0,
          offsetY: -18
        }]
      });
      assertEqual(runtime.snapshot().worldText[0].screen.x, 10);
      x = 42;
      assertEqual(runtime.snapshot().worldText[0].screen.x, 42);
      assertEqual(runtime.snapshot().worldText[0].text, "SENSORES");
    },

    "propriedade Texto no mundo preserva outras configurações de jogo"() {
      const registry = createDefaultPropertyRegistry();
      const descriptor = registry.require("game.worldText");
      const object = {
        id: "box",
        kind: "box",
        game: { collisionMode: "sensor" }
      };
      const patch = {};
      const value = descriptor.normalize("  Entrada secreta  ");
      descriptor.write(patch, value, { object });
      assertEqual(patch.game.collisionMode, "sensor");
      assertEqual(patch.game.worldText, "Entrada secreta");
      assertEqual(descriptor.read({ ...object, ...patch }), "Entrada secreta");
    },

    "âncoras inválidas de HUD são rejeitadas"() {
      const runtime = new GamePresentationRuntime();
      runtime.start();
      assertThrows(() => runtime.showHudText({
        text: "teste",
        anchor: "lado-inexistente"
      }));
    }
  };
}

function assertEqual(actual, expected) {
  if (!Object.is(actual, expected)) {
    throw new Error(`Esperado ${JSON.stringify(expected)}, recebido ${JSON.stringify(actual)}.`);
  }
}

function assertThrows(fn) {
  let threw = false;
  try {
    fn();
  } catch {
    threw = true;
  }
  if (!threw) throw new Error("Esperava erro, mas a operação foi aceita.");
}
