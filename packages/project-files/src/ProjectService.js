import { ProjectSerializer } from "./ProjectSerializer.js";
import { ProjectValidator } from "./ProjectValidator.js";

export class ProjectService {
  static apiVersion = "project-service-v1";

  constructor({ sandbox, editor, renderer, region }) {
    this.sandbox = sandbox;
    this.editor = editor;
    this.renderer = renderer;
    this.serializer = new ProjectSerializer({ sandbox, editor, renderer, region });
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
    const json = JSON.stringify(this.inspect(), null, 2);
    const blob = new Blob([json], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const filename = `${safeName(this.metadata.name)}.spatialseed`;

    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);

    return { changed: false, downloaded: true, filename, bytes: blob.size };
  }

  openText(text) {
    const project = this.validator.parse(text);
    this.sandbox.replaceState(project.scene, { markClean: true });
    this.editor.selection.clear();
    restoreEditor(this.editor, project.editor);
    if (project.renderer?.transformConfig) {
      this.renderer.setTransformConfig(project.renderer.transformConfig);
    }
    this.metadata = {
      name: project.metadata?.name ?? "Projeto Spatial Seed",
      createdAt: project.metadata?.createdAt ?? new Date().toISOString()
    };
    return {
      changed: true,
      loaded: true,
      name: this.metadata.name,
      objectCount: project.scene.objects.length
    };
  }

  newProject() {
    this.sandbox.replaceState({ schemaVersion: 1, objects: [] }, { markClean: true });
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
    return { changed: true, created: true, name: this.metadata.name };
  }
}

function restoreEditor(editor, snapshot = {}) {
  editor.setPivotEditing(false);
  if (snapshot.tool?.mode) editor.setToolMode(snapshot.tool.mode);
  editor.setMultiSelect(Boolean(snapshot.multiSelect));
  const pivot = snapshot.pivot ?? {};
  if (pivot.policy === "custom" && pivot.reference === "active-relative") {
    editor.setRelativePivot(pivot.relativeOffset ?? [0, 0, 0]);
  } else if (pivot.policy === "custom") {
    editor.setCustomPivot(pivot.customPosition ?? [0, 0, 0]);
  } else {
    editor.setPivotPolicy(["median", "bounds", "active"].includes(pivot.policy) ? pivot.policy : "median");
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
