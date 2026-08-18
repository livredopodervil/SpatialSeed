import {
  PropertyRegistry,
  SelectionPropertyClipboard
} from "../../property-registry/src/index.js?build=20260818-0054mu";

export function createSelectionPropertyClipboardTests() {
  return {
    "cópia geral preserva valores e exclui identidade por padrão"() {
      const fixture = clipboardFixture();
      const copied = fixture.clipboard.copy();
      assertEqual(copied.available, true);
      assertDeepEqual(copied.propertyIds, [
        "transform.position",
        "transform.scale",
        "appearance.color"
      ]);
      assertEqual(copied.propertyIds.includes("object.name"), false);
    },

    "atalhos copiam somente transformação ou aparência"() {
      const fixture = clipboardFixture();
      assertDeepEqual(
        fixture.clipboard.copyTransform().propertyIds,
        ["transform.position", "transform.scale"]
      );
      assertDeepEqual(
        fixture.clipboard.copyAppearance().propertyIds,
        ["appearance.color"]
      );
    },

    "colar em lote ignora propriedade não editável em muitos"() {
      const fixture = clipboardFixture();
      fixture.clipboard.copy();
      fixture.setInspection(destinationInspection({ count: 2 }));
      const pasted = fixture.clipboard.paste({ targetScope: "renderables" });
      assertEqual(pasted.changed, true);
      assertDeepEqual(pasted.appliedProperties, [
        "transform.scale",
        "appearance.color"
      ]);
      assertDeepEqual(fixture.patches[0], {
        patch: {
          "transform.scale": [2, 2, 2],
          "appearance.color": "#336699"
        },
        targetScope: "renderables"
      });
      assertDeepEqual(pasted.skipped, [{
        id: "transform.position",
        reason: "not-editable-many"
      }]);
    },

    "colar filtra propriedades incompatíveis com o destino"() {
      const fixture = clipboardFixture();
      fixture.clipboard.copyAppearance();
      fixture.setInspection(destinationInspection({
        unsupported: ["appearance.color"]
      }));
      const pasted = fixture.clipboard.paste();
      assertEqual(pasted.changed, false);
      assertEqual(pasted.reason, "no-compatible-properties");
      assertEqual(fixture.patches.length, 0);
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
    descriptor("object.name", "object", false),
    descriptor("transform.position", "transform", false),
    descriptor("transform.scale", "transform", true),
    descriptor("appearance.color", "appearance", true)
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

function descriptor(id, group, editableMany) {
  return {
    id,
    group,
    editableMany,
    normalize: value => value,
    read: () => null
  };
}

function sourceInspection() {
  return Object.freeze({
    count: 1,
    targetIds: Object.freeze(["source"]),
    properties: Object.freeze({
      "object.name": property("uniform", "Origem"),
      "transform.position": property("uniform", [1, 2, 3]),
      "transform.scale": property("uniform", [2, 2, 2]),
      "appearance.color": property("uniform", "#336699")
    })
  });
}

function destinationInspection({ count = 1, unsupported = [] } = {}) {
  const blocked = new Set(unsupported);
  return Object.freeze({
    count,
    targetIds: Object.freeze(
      Array.from({ length: count }, (_, index) => `target-${index + 1}`)
    ),
    properties: Object.freeze({
      "object.name": property("uniform", "Destino"),
      "transform.position": property("uniform", [0, 0, 0]),
      "transform.scale": property("uniform", [1, 1, 1]),
      "appearance.color": property(
        blocked.has("appearance.color") ? "unsupported" : "uniform",
        "#ffffff"
      )
    })
  });
}

function property(status, value) {
  return Object.freeze({ status, value });
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
