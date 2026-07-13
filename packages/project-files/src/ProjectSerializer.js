import { ProjectAppearanceAdapter } from "./ProjectAppearanceAdapter.js";

export class ProjectSerializer {
  static format = "spatial-seed";
  static schemaVersion = 2;

  constructor({ sandbox, editor, renderer, region }) {
    this.sandbox = sandbox;
    this.editor = editor;
    this.renderer = renderer;
    this.region = region;
    this.appearances = new ProjectAppearanceAdapter();
  }

  serialize(metadata = {}) {
    const normalized = this.appearances.normalizeScene(
      this.sandbox.getState()
    );

    return {
      format: ProjectSerializer.format,
      schemaVersion: ProjectSerializer.schemaVersion,
      metadata: {
        name: metadata.name ?? "Projeto Spatial Seed",
        createdAt:
          metadata.createdAt ??
          new Date().toISOString(),
        savedAt: new Date().toISOString()
      },
      region: {
        descriptor: structuredClone(this.region.descriptor),
        version: this.region.version
      },
      assets: normalized.assets,
      scene: normalized.scene,
      editor: this.editor.snapshot(),
      renderer: {
        transformConfig:
          this.renderer.getTransformConfig()
      }
    };
  }
}
