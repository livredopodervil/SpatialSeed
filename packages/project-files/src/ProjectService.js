import {
  ProjectSerializer
} from "./ProjectSerializer.js?build=20260807-0052b";
import { ProjectValidator } from "./ProjectValidator.js?build=20260807-0052b";

export class ProjectService {
  static apiVersion = "project-service-v7-instance-graph";

  #subscribers = new Set();

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

  createCheckpoint() {
    return this.serializer.serialize(this.metadata, {
      state: this.sandbox.getBaseState()
    });
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
    const scene = this.#restoreProject(project);

    const result = {
      changed: true,
      loaded: true,
      name: this.metadata.name,
      objectCount: scene.objects.length,
      schemaVersion: project.schemaVersion,
      normalizedRuntime: true
    };
    this.#notify({ type: "project-opened", result });
    return result;
  }

  newProject() {
    this.appearanceRuntime.reset();
    const scene = { schemaVersion: 1, objects: [] };
    this.region.restoreCheckpoint(scene, { version: 0 });
    this.sandbox.replaceState(scene, { markClean: true });
    this.editor.selection.clear();
    restoreEditor(this.editor, {
      tool: { type: "transform", mode: "translate" },
      multiSelect: false,
      pivot: {
        policy: "anchor",
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
    const result = {
      changed: true,
      created: true,
      name: this.metadata.name
    };
    this.#notify({ type: "project-created", result });
    return result;
  }

  restoreRecovery(record, {
    restoreEditorState = true,
    restoreRendererState = true
  } = {}) {
    const project = this.validator.validate(record.checkpoint);
    const commands = structuredClone(record.commands ?? []);
    this.sandbox.previewCommandSequence(project.scene, commands);
    const scene = this.#normalizeProjectScene(project);

    this.sandbox.previewCommandSequence(scene, commands);
    this.region.restoreCheckpoint(scene, {
      version: record.baseVersion ?? project.region?.version ?? 0
    });
    this.sandbox.restoreCommandSequence({
      baseState: scene,
      commands,
      baseVersion: record.baseVersion ?? project.region?.version ?? 0,
      revision: record.revision
    });
    if (restoreEditorState) {
      this.editor.selection.clear();
      restoreEditor(this.editor, project.editor);
    } else {
      reconcileSelection(
        this.editor.selection,
        this.sandbox.getState()
      );
    }
    if (restoreRendererState) {
      this.#restoreRenderer(project);
    }
    this.#restoreMetadata(project);

    return {
      changed: true,
      recovered: true,
      name: this.metadata.name,
      objectCount: this.sandbox.objectCount,
      commandCount: commands.length,
      schemaVersion: project.schemaVersion
    };
  }

  prepareRecoveryExport(record) {
    const project = this.validator.validate(record.checkpoint);
    const scene = this.#normalizeProjectScene(project, { mutate: false });
    const recovered = this.sandbox.previewCommandSequence(
      scene,
      record.commands ?? []
    );
    const document = structuredClone(project);
    document.scene = recovered;
    document.metadata = {
      ...document.metadata,
      savedAt: new Date().toISOString()
    };
    const text = JSON.stringify(document, null, 2);
    return {
      changed: false,
      prepared: true,
      filename: `${safeName(
        document.metadata?.name ?? "projeto-recuperado"
      )}-recuperado.spatialseed`,
      mediaType: "application/json;charset=utf-8",
      text,
      bytes: new TextEncoder().encode(text).byteLength
    };
  }

  subscribe(listener) {
    this.#subscribers.add(listener);
    return () => this.#subscribers.delete(listener);
  }

  #restoreProject(project) {
    const scene = this.#normalizeProjectScene(project);
    this.region.restoreCheckpoint(scene, {
      version: project.region?.version ?? 0
    });
    this.sandbox.replaceState(scene, { markClean: true });
    this.editor.selection.clear();
    restoreEditor(this.editor, project.editor);
    this.#restoreRenderer(project);
    this.#restoreMetadata(project);
    return scene;
  }

  #normalizeProjectScene(project, { mutate = true } = {}) {
    if (mutate) {
      this.appearanceRuntime.reset();
      if (project.schemaVersion >= 2) {
        this.appearanceRuntime.importAssets(
          project.assets,
          { replace: true }
        );
      }
      return this.appearanceRuntime.normalizeScene(project.scene);
    }

    return structuredClone(project.scene);
  }

  #restoreRenderer(project) {
    if (project.renderer?.transformConfig) {
      this.renderer.setTransformConfig(
        project.renderer.transformConfig
      );
    }
  }

  #restoreMetadata(project) {
    this.metadata = {
      name: project.metadata?.name ?? "Projeto Spatial Seed",
      createdAt:
        project.metadata?.createdAt ?? new Date().toISOString()
    };
  }

  #notify(event) {
    for (const listener of this.#subscribers) {
      try {
        listener(Object.freeze(structuredClone(event)));
      } catch (error) {
        console.error("ProjectService subscriber failed", error);
      }
    }
  }
}

function reconcileSelection(selection, scene) {
  const known = new Set(
    (scene.objects ?? []).map(object => object.id)
  );
  const snapshot = selection.snapshot();
  const members = snapshot.members.filter(member =>
    known.has(member.objectId)
  );
  const activeObjectId = known.has(
    snapshot.activeMember?.objectId
  )
    ? snapshot.activeMember.objectId
    : null;
  if (members.length !== snapshot.members.length) {
    selection.replaceMany(members, { activeObjectId });
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
