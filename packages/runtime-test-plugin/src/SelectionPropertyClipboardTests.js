import {
  createDefaultPropertyTransferPresetCatalog,
  PropertyRegistry,
  PropertyTransferPresetCatalog,
  SelectionPropertyClipboard
} from "../../property-registry/src/index.js?build=20260818-0054mv";

export function createSelectionPropertyClipboardTests() {
  return {
    "preset padrão seguro não substitui posição nem identidade"() {
      const fixture = clipboardFixture();
      const copied = fixture.clipboard.copy();
      assertEqual(copied.available, true);
      assertEqual(copied.presetId, "safe");
      assertDeepEqual(copied.propertyIds, [
        "transform.rotationDeg",
        "transform.scale",
        "geometry.radius",
        "appearance.color"
      ]);
      assertEqual(copied.propertyIds.includes("transform.position"), false);
      assertEqual(copied.propertyIds.includes("object.name"), false);
    },

    "presets separam transformação material textura binding e instância"() {
      const fixture = clipboardFixture();
      assertDeepEqual(
        fixture.clipboard.copyPreset({ presetId: "transform" }).propertyIds,
        ["transform.rotationDeg", "transform.scale"]
      );
      assertDeepEqual(
        fixture.clipboard.copyPreset({ presetId: "position" }).propertyIds,
        ["transform.position"]
      );
      assertDeepEqual(
        fixture.clipboard.copyPreset({ presetId: "material" }).propertyIds,
        ["appearance.color"]
      );
      assertDeepEqual(
        fixture.clipboard.copyPreset({ presetId: "texture" }).propertyIds,
        ["texture.repeat"]
      );
      assertDeepEqual(
        fixture.clipboard.copyPreset({ presetId: "color-binding" }).propertyIds,
        ["appearance.tint"]
      );
      assertDeepEqual(
        fixture.clipboard.copyPreset({ presetId: "instance-color" }).propertyIds,
        ["instance.color"]
      );
    },

    "preview expõe nomes valores atuais compatibilidade e mudanças"() {
      const fixture = clipboardFixture();
      fixture.clipboard.copyTransform();
      fixture.setInspection(destinationInspection());
      const preview = fixture.clipboard.preview();

      assertDeepEqual(preview.compatiblePropertyIds, [
        "transform.rotationDeg",
        "transform.scale"
      ]);
      assertDeepEqual(preview.entries[0], {
        id: "transform.rotationDeg",
        label: "Rotação",
        group: "transform",
        valueType: "vector3",
        sourceValue: [0, 45, 0],
        targetStatus: "uniform",
        targetValue: [0, 0, 0],
        compatible: true,
        changed: true,
        reason: null
      });
    },

    "colar exige propriedades explicitamente confirmadas"() {
      const fixture = clipboardFixture();
      fixture.clipboard.copyTransform();
      fixture.setInspection(destinationInspection());
      const blocked = fixture.clipboard.paste();
      assertEqual(blocked.changed, false);
      assertEqual(blocked.reason, "explicit-properties-required");
      assertEqual(fixture.patches.length, 0);

      const pasted = fixture.clipboard.paste({
        properties: ["transform.rotationDeg"]
      });
      assertEqual(pasted.changed, true);
      assertDeepEqual(pasted.appliedProperties, ["transform.rotationDeg"]);
      assertDeepEqual(fixture.patches[0].patch, {
        "transform.rotationDeg": [0, 45, 0]
      });
    },

    "colar em lote ignora propriedade não editável em muitos"() {
      const fixture = clipboardFixture();
      fixture.clipboard.copy({
        properties: ["transform.position", "transform.scale", "appearance.color"]
      });
      fixture.setInspection(destinationInspection({ count: 2 }));
      const pasted = fixture.clipboard.paste({
        properties: ["transform.position", "transform.scale", "appearance.color"],
        targetScope: "renderables"
      });
      assertEqual(pasted.changed, true);
      assertDeepEqual(pasted.appliedProperties, [
        "transform.scale",
        "appearance.color"
      ]);
      assertDeepEqual(pasted.skipped, [{
        id: "transform.position",
        reason: "not-editable-many"
      }]);
    },

    "catálogo aceita presets declarativos adicionais sem alterar clipboard"() {
      const catalog = createDefaultPropertyTransferPresetCatalog();
      catalog.register({
        id: "plugin.light",
        label: "Luz do plugin",
        groups: ["light"]
      });
      assertEqual(
        catalog.describe().presets.some(item => item.id === "plugin.light"),
        true
      );
      assertThrowsMessage(
        () => catalog.register({
          id: "plugin.light",
          label: "Duplicado",
          groups: ["light"]
        }),
        "já registrado"
      );
      assertEqual(new PropertyTransferPresetCatalog().list().length, 0);
    },

    "clipboard é local à sessão e pode ser limpo"() {
      const fixture = clipboardFixture();
      fixture.clipboard.copyTransform();
      assertEqual(fixture.clipboard.clear().changed, true);
      assertEqual(fixture.clipboard.inspect().available, false);
    }
  };
}

function clipboardFixture() {
  const descriptors = [
    descriptor("object.name", "Nome", "object", false, "string"),
    descriptor("transform.position", "Posição", "transform", false, "vector3"),
    descriptor("transform.rotationDeg", "Rotação", "transform", false, "vector3"),
    descriptor("transform.scale", "Escala", "transform", true, "vector3"),
    descriptor("geometry.radius", "Raio", "geometry", true, "number"),
    descriptor("appearance.color", "Cor-base", "appearance", true, "color"),
    descriptor("texture.repeat", "Repetição", "texture", true, "vector2"),
    descriptor("appearance.tint", "Matiz final", "appearance-binding", true, "color"),
    descriptor("instance.color", "Cor própria", "instance", true, "color")
  ];
  const registry = new PropertyRegistry();
  descriptors.forEach(item => registry.register(item));
  let inspection = sourceInspection();
  const patches = [];
  const propertyService = {
    inspectSelection() {
      return inspection;
    },
    setSelection(patch, { targetScope } = {}) {
      patches.push(structuredClone({ patch, targetScope }));
      return Object.freeze({ changed: true, targetIds: inspection.targetIds });
    }
  };
  return {
    clipboard: new SelectionPropertyClipboard({ propertyService, registry }),
    patches,
    setInspection(value) {
      inspection = value;
    }
  };
}

function descriptor(id, label, group, editableMany, valueType) {
  return {
    id,
    label,
    group,
    editableMany,
    valueType,
    normalize: value => value,
    read: () => null
  };
}

function sourceInspection() {
  return inspection("source", {
    "object.name": "Origem",
    "transform.position": [1, 2, 3],
    "transform.rotationDeg": [0, 45, 0],
    "transform.scale": [2, 2, 2],
    "geometry.radius": 4,
    "appearance.color": "#336699",
    "texture.repeat": [3, 2],
    "appearance.tint": "#ffeecc",
    "instance.color": "#123456"
  });
}

function destinationInspection({ count = 1, unsupported = [] } = {}) {
  return inspection("target", {
    "object.name": "Destino",
    "transform.position": [0, 0, 0],
    "transform.rotationDeg": [0, 0, 0],
    "transform.scale": [1, 1, 1],
    "geometry.radius": 1,
    "appearance.color": "#ffffff",
    "texture.repeat": [1, 1],
    "appearance.tint": "#ffffff",
    "instance.color": null
  }, { count, unsupported });
}

function inspection(prefix, values, { count = 1, unsupported = [] } = {}) {
  const blocked = new Set(unsupported);
  return Object.freeze({
    count,
    targetIds: Object.freeze(
      Array.from({ length: count }, (_, index) => `${prefix}-${index + 1}`)
    ),
    properties: Object.freeze(Object.fromEntries(
      Object.entries(values).map(([id, value]) => [
        id,
        property(blocked.has(id) ? "unsupported" : "uniform", value)
      ])
    ))
  });
}

function property(status, value) {
  return Object.freeze({ status, value, editable: status !== "unsupported" });
}

function assertEqual(actual, expected) {
  if (!Object.is(actual, expected)) {
    throw new Error(`Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}.`);
  }
}

function assertDeepEqual(actual, expected) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}.`);
  }
}

function assertThrowsMessage(callback, fragment) {
  let error = null;
  try {
    callback();
  } catch (caught) {
    error = caught;
  }
  if (!error || !String(error.message).includes(fragment)) {
    throw new Error(`Expected error containing ${JSON.stringify(fragment)}.`);
  }
}
