import {
  normalizeDataObjectDocument
} from "../../core/src/index.js?build=20260819-0054na";
import {
  compactSceneToInstanceGraph
} from "../../instance-graph/src/index.js?build=20260807-0052b";
export class ProjectSerializer {
  static format = "spatial-seed";
  static schemaVersion = 4;

  constructor({
    sandbox,
    editor,
    renderer,
    region,
    appearanceRuntime,
    portableAssetStore = null
  }) {
    this.sandbox = sandbox;
    this.editor = editor;
    this.renderer = renderer;
    this.region = region;
    this.appearanceRuntime = appearanceRuntime;
    this.portableAssetStore = portableAssetStore;
  }

  serialize(metadata = {}, { state = null } = {}) {
    const sourceState = state ?? this.sandbox.getState();
    const compactScene = compactSceneToInstanceGraph(sourceState);
    const projectedScene = this.appearanceRuntime.normalizeScene(compactScene);
    const dataObjects = normalizeDataObjectDocument(sourceState.dataObjects);
    const scene = dataObjects.items.length
      ? { ...projectedScene, dataObjects: structuredClone(dataObjects) }
      : projectedScene;

    const assets = this.appearanceRuntime.exportAssets();
    const portableAssets = this.portableAssetStore?.export?.() ?? null;
    if (portableAssets && Object.keys(portableAssets.assets ?? {}).length) {
      assets.portable = portableAssets;
    }

    return {
      format: ProjectSerializer.format,
      schemaVersion: ProjectSerializer.schemaVersion,
      metadata: {
        name: metadata.name ?? "Projeto Spatial Seed",
        createdAt: metadata.createdAt ?? new Date().toISOString(),
        savedAt: new Date().toISOString()
      },
      region: {
        descriptor: structuredClone(this.region.descriptor),
        version: this.region.version
      },
      assets,
      scene,
      editor: this.editor.snapshot(),
      renderer: {
        transformConfig: this.renderer.getTransformConfig()
      }
    };
  }
}
