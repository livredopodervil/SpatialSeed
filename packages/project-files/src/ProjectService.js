import { ProjectSerializer } from "./ProjectSerializer.js";
import { ProjectValidator } from "./ProjectValidator.js";

export class ProjectService {
  static apiVersion = "project-service-v4";

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
    this.appearanceRuntime = appearanceRuntime;
    this.serializer = new ProjectSerializer({
      sandbox,
      editor,
      renderer,
      region,
      appearanceRuntime
    });
    this.validator = new ProjectValidator();
    this.metadata = {
      name: "Projeto Spatial Seed",
      createdAt: new Date().toISOString()
    };
  }

  inspect() {
    return this.serializer.serialize(this.metadata);
  }

  save() {
    const text = JSON.stringify(this.inspect(), null, 2);
    const filename = `${safeName(this.metadata.name)}.spatialseed`;

    return {
      changed: false,
      prepared: true,
      filename,
      mediaType: "application/json;charset=utf-8",
      text,
      bytes: new TextEncoder().encode(text).byteLength
    };
  }

  openText(text) {
    const project = this.validator.parse(text);

    this.appearanceRuntime.reset();

    if (project.schemaVersion === 2) {
      this.appearanceRuntime.importAssets(
        project.assets,
        { replace: true }
      );
    }

    const scene = this.appearanceRuntime.normalizeScene(
      project.scene
    );

    this.sandbox.replaceState(scene, { markClean: true });
    this.editor.selection.clear();
    restoreEditor(this.editor, project.editor);

    if (project.renderer?.transformConfig) {
      this.renderer.setTransformConfig(
        project.renderer.transformConfig
      );
    }

    this.metadata = {
      name: project.metadata?.name ?? "Projeto Spatial Seed",
      createdAt:
        project.metadata?.createdAt ?? new Date().toISOString()
    };

    return {
      changed: true,
      loaded: true,
      name: this.metadata.name,
      objectCount: scene.objects.length,
      schemaVersion: project.schemaVersion,
      normalizedRuntime: true
    };
  }

  newProject() {
    this.appearanceRuntime.reset();
    this.sandbox.replaceState(
      { schemaVersion: 1, objects: [] },
      { markClean: true }
    );
    this.editor.selection.clear();
    restoreEditor(this.editor, {
      tool: { type: "transform", mode: "translate" },
      multiSelect: false,
      pivot: {
        policy: "median",
        editing: false,
        reference: "absolute",
        customPosition: [0, 0, 0],
        relativeOffset: [0, 0, 0]
      }
    });
    this.metadata = {
      name: "Projeto Spatial Seed",
      createdAt: new Date().toISOString()
    };
    return {
      changed: true,
      created: true,
      name: this.metadata.name
    };
  }
}

function restoreEditor(editor, snapshot = {}) {
  editor.setPivotEditing(false);
  if (snapshot.tool?.mode) editor.setToolMode(snapshot.tool.mode);
  editor.setMultiSelect(Boolean(snapshot.multiSelect));
  const pivot = snapshot.pivot ?? {};

  if (
    pivot.policy === "custom" &&
    pivot.reference === "active-relative"
  ) {
    editor.setRelativePivot(pivot.relativeOffset ?? [0, 0, 0]);
  } else if (pivot.policy === "custom") {
    editor.setCustomPivot(pivot.customPosition ?? [0, 0, 0]);
  } else {
    editor.setPivotPolicy(
      ["median", "bounds", "active"].includes(pivot.policy)
        ? pivot.policy
        : "median"
    );
  }

  editor.setPivotEditing(false);
}

function safeName(value) {
  return String(value || "projeto-spatial-seed")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "projeto-spatial-seed";
}
