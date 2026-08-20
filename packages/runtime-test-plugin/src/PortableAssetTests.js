import {
  AssetStore,
  portableBinarySource,
  portableBinaryValue
} from "../../asset-store/src/index.js?revision=20260819-0054nc";
import {
  ProjectSerializer
} from "../../project-files/src/ProjectSerializer.js?revision=20260819-0054nc";
import {
  ProjectValidator
} from "../../project-files/src/ProjectValidator.js?revision=20260819-0054nc";

export function createPortableAssetTests() {
  return {
    "codec binário preserva bytes GLB sem depender do cache do navegador"() {
      const input = new Uint8Array([0x67, 0x6c, 0x54, 0x46, 2, 0, 0, 0, 255]);
      const value = portableBinaryValue(input, { mediaType: "model/gltf-binary" });
      const store = new AssetStore();
      const asset = store.intern("binary", value, {
        retain: false,
        metadata: { filename: "hero.glb", role: "character-model" }
      });
      const source = portableBinarySource(asset);
      assertDeepEqual([...new Uint8Array(source.data)], [...input]);
      assertEqual(source.filename, "hero.glb");
      assertEqual(source.mediaType, "model/gltf-binary");
    },

    "conteúdo binário idêntico é deduplicado por content id"() {
      const value = portableBinaryValue(new Uint8Array([1, 2, 3, 4]));
      const store = new AssetStore();
      const first = store.intern("binary", value, {
        retain: false,
        metadata: { filename: "a.glb" }
      });
      const second = store.intern("binary", value, {
        retain: false,
        metadata: { filename: "b.glb" }
      });
      assertEqual(first.id, second.id);
      assertEqual(store.stats().assets, 1);
    },

    "serializer inclui catálogo portátil somente quando há assets"() {
      const empty = serializeWith(new AssetStore());
      assertEqual("portable" in empty.assets, false);

      const store = new AssetStore();
      store.intern("binary", portableBinaryValue(new Uint8Array([7, 8, 9])), {
        retain: false,
        metadata: { filename: "hero.glb" }
      });
      const project = serializeWith(store);
      assertEqual(project.assets.portable.schemaVersion, 1);
      assertEqual(Object.keys(project.assets.portable.assets).length, 1);
    },

    "validator preserva e verifica catálogo portátil"() {
      const store = new AssetStore();
      store.intern("binary", portableBinaryValue(new Uint8Array([10, 20, 30])), {
        retain: false,
        metadata: { filename: "hero.glb" }
      });
      const project = serializeWith(store);
      const validated = new ProjectValidator().validate(project);
      assertDeepEqual(validated.assets.portable, project.assets.portable);

      const corrupted = structuredClone(project);
      const [id] = Object.keys(corrupted.assets.portable.assets);
      corrupted.assets.portable.assets[id].value.bytes += 1;
      assertThrows(() => new ProjectValidator().validate(corrupted));
    }
  };
}

function serializeWith(portableAssetStore) {
  const appearanceRuntime = {
    normalizeScene: scene => structuredClone(scene),
    exportAssets: () => ({ schemaVersion: 1, assets: {} })
  };
  return new ProjectSerializer({
    sandbox: {
      getState: () => ({ schemaVersion: 1, objects: [] })
    },
    editor: { snapshot: () => ({}) },
    renderer: { getTransformConfig: () => ({}) },
    region: { descriptor: { id: "region-test" }, version: 0 },
    appearanceRuntime,
    portableAssetStore
  }).serialize({ name: "Portable asset test" });
}

function assertEqual(actual, expected) {
  if (!Object.is(actual, expected)) {
    throw new Error(`Esperado ${JSON.stringify(expected)}, recebido ${JSON.stringify(actual)}.`);
  }
}

function assertDeepEqual(actual, expected) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
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
