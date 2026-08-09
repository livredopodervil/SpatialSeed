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
    appearanceRuntime
  }) {
    this.sandbox = sandbox;
    this.editor = editor;
    this.renderer = renderer;
    this.region = region;
    this.appearanceRuntime = appearanceRuntime;
  }

  serialize(metadata = {}, { state = null } = {}) {
    const compactScene = compactSceneToInstanceGraph(
      state ?? this.sandbox.getState()
    );
    const scene = this.appearanceRuntime.normalizeScene(compactScene);

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
      assets: this.appearanceRuntime.exportAssets(),
      scene,
      editor: this.editor.snapshot(),
      renderer: {
        transformConfig: this.renderer.getTransformConfig()
      }
    };
  }
}
