import {
  DATA_OBJECTS_VERSION,
  Region,
  Sandbox,
  normalizeDataObjectDocument
} from "../../core/src/index.js?build=20260819-0054na";
import {
  boxRegionReducer
} from "../../region-box/src/index.js?build=20260819-0054na";
import {
  GameSessionState
} from "../../game-runtime/src/index.js?build=20260819-0054na";
import {
  classifyChanges
} from "../../incremental-runtime/src/index.js";
import {
  ProjectSerializer
} from "../../project-files/src/ProjectSerializer.js?build=20260819-0054na";
import {
  ProjectValidator
} from "../../project-files/src/ProjectValidator.js?build=20260819-0054na";

export function createGameSessionStateTests() {
  return {
    "DataObject é não geométrico e mudança não solicita projeção espacial"() {
      const sandbox = createSandbox();
      assertEqual("dataObjects" in sandbox.getSnapshot(), false);
      let lastChanges = [];
      const unsubscribe = sandbox.subscribe((_state, changes) => {
        if (!changes.some(change => change?.type === "initial")) lastChanges = changes;
      });
      const changed = sandbox.dispatch({
        type: "data.object.create",
        id: "game-state",
        name: "Estado do jogo",
        dataType: "game-state",
        value: { score: 0, hasKey: false }
      });
      unsubscribe();
      assertEqual(changed, true);
      assertEqual(sandbox.objectCount, 0);
      const item = sandbox.getSnapshot().dataObjects.items[0];
      assertEqual(item.kind, "data");
      assertEqual("position" in item, false);
      assertEqual("geometry" in item, false);
      assertEqual(classifyChanges(lastChanges).mode, "none");
    },

    "DataObject participa de undo e redo sem virar mudança espacial"() {
      const sandbox = createSandbox();
      const notifications = [];
      const unsubscribe = sandbox.subscribe((_state, changes) => {
        if (!changes.some(change => change?.type === "initial")) {
          notifications.push(changes);
        }
      });
      sandbox.dispatch({
        type: "data.object.create",
        id: "state",
        value: { score: 1 }
      });
      sandbox.dispatch({
        type: "data.object.update",
        id: "state",
        patch: { value: { score: 2 } }
      });
      assertEqual(sandbox.getSnapshot().dataObjects.items[0].value.score, 2);
      assertEqual(sandbox.undo(), true);
      assertEqual(sandbox.getSnapshot().dataObjects.items[0].value.score, 1);
      assertEqual(classifyChanges(notifications.at(-1)).mode, "none");
      assertEqual(sandbox.redo(), true);
      assertEqual(sandbox.getSnapshot().dataObjects.items[0].value.score, 2);
      assertEqual(classifyChanges(notifications.at(-1)).mode, "none");
      unsubscribe();
    },

    "GameSessionState altera cópia efêmera e reset restaura autoria"() {
      const authored = normalizeDataObjectDocument({
        items: [{
          id: "game-state",
          kind: "data",
          dataType: "game-state",
          value: { score: 0, hasKey: false, nested: { lives: 3 } }
        }]
      });
      const session = new GameSessionState();
      session.start(authored);
      assertEqual(session.increment("game-state", "score", 2), 2);
      assertEqual(session.toggle("game-state", "hasKey"), true);
      assertEqual(session.set("game-state", "nested.lives", 2), 2);
      assertDeepEqual(authored.items[0].value, {
        score: 0,
        hasKey: false,
        nested: { lives: 3 }
      });
      session.reset("game-state");
      assertEqual(session.get("game-state", "score"), 0);
      assertEqual(session.get("game-state", "hasKey"), false);
      assertEqual(session.get("game-state", "nested.lives"), 3);
      session.stop();
      assertThrowsMessage(() => session.get("game-state", "score"), "sessão de jogo");
    },

    "validador preserva DataObjects e rejeita ids duplicados"() {
      const validator = new ProjectValidator();
      const project = validator.validate(projectDocument({
        items: [{ id: "state", kind: "data", value: { score: 0 } }]
      }));
      assertEqual(project.scene.dataObjects.version, DATA_OBJECTS_VERSION);
      assertEqual(project.scene.dataObjects.items[0].value.score, 0);
      assertThrowsMessage(() => validator.validate(projectDocument({
        items: [
          { id: "same", kind: "data", value: 1 },
          { id: "same", kind: "data", value: 2 }
        ]
      })), "duplicado");
    },


    "cena sem DataObjects preserva o shell legado compacto"() {
      const sandbox = createSandbox();
      const serializer = new ProjectSerializer({
        sandbox,
        editor: { snapshot: () => ({}) },
        renderer: { getTransformConfig: () => ({}) },
        region: sandbox.region,
        appearanceRuntime: {
          normalizeScene: scene => scene,
          exportAssets: () => ({ schemaVersion: 1, assets: {} })
        }
      });
      const project = serializer.serialize({ name: "Sem dados" });
      assertEqual("dataObjects" in sandbox.getSnapshot(), false);
      assertEqual("dataObjects" in project.scene, false);
      const validated = new ProjectValidator().validate(projectDocument({ items: [] }));
      assertEqual("dataObjects" in validated.scene, false);
    },

    "serializador inclui DataObjects no arquivo spatialseed"() {
      const sandbox = createSandbox();
      sandbox.dispatch({
        type: "data.object.create",
        id: "game-state",
        dataType: "game-state",
        value: { score: 7 }
      });
      const serializer = new ProjectSerializer({
        sandbox,
        editor: { snapshot: () => ({}) },
        renderer: { getTransformConfig: () => ({}) },
        region: sandbox.region,
        appearanceRuntime: {
          normalizeScene: scene => scene,
          exportAssets: () => ({ schemaVersion: 1, assets: {} })
        }
      });
      const project = serializer.serialize({ name: "Teste" });
      assertEqual(project.scene.dataObjects.items[0].id, "game-state");
      assertEqual(project.scene.dataObjects.items[0].value.score, 7);
    }
  };
}

function createSandbox() {
  return new Sandbox(
    new Region(
      { id: "region-test", name: "Teste", type: "box-region" },
      { schemaVersion: 1, objects: [] }
    ),
    boxRegionReducer
  );
}

function projectDocument(dataObjects) {
  return {
    format: "spatial-seed",
    schemaVersion: ProjectSerializer.schemaVersion,
    metadata: {},
    region: {},
    assets: { schemaVersion: 1, assets: {} },
    scene: {
      schemaVersion: 1,
      objects: [],
      dataObjects
    },
    editor: {},
    renderer: {}
  };
}

function assertEqual(actual, expected) {
  if (!Object.is(actual, expected)) {
    throw new Error(`Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}.`);
  }
}

function assertDeepEqual(actual, expected) {
  const left = JSON.stringify(actual);
  const right = JSON.stringify(expected);
  if (left !== right) throw new Error(`Expected ${right}, received ${left}.`);
}

function assertThrowsMessage(callback, fragment) {
  let message = "";
  try {
    callback();
  } catch (error) {
    message = String(error?.message ?? error);
  }
  if (!message.toLowerCase().includes(String(fragment).toLowerCase())) {
    throw new Error(`Expected error containing ${JSON.stringify(fragment)}, received ${JSON.stringify(message)}.`);
  }
}
