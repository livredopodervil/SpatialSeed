export class ProjectSerializer {
  static format = "spatial-seed";
  static schemaVersion = 1;

  constructor({ sandbox, editor, renderer, region }) {
    this.sandbox = sandbox;
    this.editor = editor;
    this.renderer = renderer;
    this.region = region;
  }

  serialize(metadata = {}) {
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
      scene: this.sandbox.getState(),
      editor: this.editor.snapshot(),
      renderer: {
        transformConfig: this.renderer.getTransformConfig()
      }
    };
  }
}
