import { CommandRegistry } from "./CommandRegistry.js";

export function createEditorCommands({
  editor,
  renderer,
  selectionOperations,
  projectService,
  benchmarkRunner,
  resourceAudit,
  propertyService = null,
  meshEditor = null,
  canMutateProject = () => true
}) {
  const commands = new CommandRegistry();
  const requireObjectMode = action => {
    if (meshEditor?.active) {
      throw new Error(
        `Finalize ou cancele a edição de malha antes de ${action}.`
      );
    }
  };

  commands
    .register("tool.set", ({ mode }) => {
      renderer.setTransformMode(mode);
      return editor.snapshot().tool;
    })
    .register("space.toggle", () => {
      if (!meshEditor?.active) {
        return { space: renderer.toggleSpace() };
      }
      const status = meshEditor.toggleFrameSpace();
      return { space: status.frameMode, meshEdit: status };
    })
    .register("selection.multi.toggle", () => {
      editor.setMultiSelect(!editor.multiSelect);
      return { multiSelect: editor.multiSelect };
    })
    .register("selection.operation.set", ({ operation }) => ({
      operation: renderer.setSelectionOperation(operation)
    }))
    .register("selection.area.toggle", () => {
      editor.setAreaSelection(!editor.areaSelection);
      return { enabled: editor.areaSelection };
    })
    .register("selection.clear", () => {
      if (meshEditor?.active) return meshEditor.clearSelection();
      editor.selection.clear();
      return editor.selection.snapshot();
    })
    .register("selection.select-object", ({
      id,
      regionId = "region-main"
    } = {}) => {
      requireObjectMode("alterar a seleção de objetos");
      const objectId = String(id ?? "").trim();
      const exists = selectionOperations.sandbox
        .getSnapshot()
        .objects
        .some(object => object.id === objectId);
      if (!exists) {
        throw new Error(`Objeto inexistente para seleção: ${objectId}.`);
      }
      editor.selection.replace({
        kind: "object",
        regionId: String(regionId),
        objectId
      });
      return editor.selection.snapshot();
    })
    .register("history.undo", () => {
      if (meshEditor?.active) {
        throw new Error(
          "Finalize ou cancele a edição de malha antes de desfazer."
        );
      }
      return { changed: selectionOperations.sandbox.undo() };
    })
    .register("history.redo", () => {
      if (meshEditor?.active) {
        throw new Error(
          "Finalize ou cancele a edição de malha antes de refazer."
        );
      }
      return { changed: selectionOperations.sandbox.redo() };
    })
    .register("pivot.edit.toggle", () => {
      requireObjectMode("editar o pivô do objeto");
      const enabled = !editor.pivot.editing;
      const changed = renderer.setPivotEditing(enabled);

      return {
        changed,
        editing: changed ? enabled : editor.pivot.editing,
        reason: changed ? null : "selection-empty"
      };
    })
    .register("object.create.box", args => {
      requireObjectMode("criar objetos");
      return selectionOperations.createBox(args);
    })
    .register("object.create.geometry", args => {
      requireObjectMode("criar objetos");
      return selectionOperations.createGeometry(args);
    })
    .register("object.create.geometrySeries", args => {
      requireObjectMode("criar objetos");
      return selectionOperations.createGeometrySeries(args);
    })
    .register("selection.position", ({ position }) =>
      meshEditor?.active
        ? meshEditor.setPivotPosition(position)
        : selectionOperations.setSelectionPosition(position)
    )
    .register("selection.translate", ({ delta }) =>
      meshEditor?.active
        ? meshEditor.translate(delta)
        : selectionOperations.translate(delta)
    )
    .register("selection.rotate", ({ degrees }) =>
      meshEditor?.active
        ? meshEditor.rotate(degrees)
        : selectionOperations.rotateEuler(degrees)
    )
    .register("selection.scale", ({ factors }) =>
      meshEditor?.active
        ? meshEditor.scale(factors)
        : selectionOperations.scaleBy(factors)
    )
    .register("selection.duplicate", () => {
      requireObjectMode("duplicar objetos");
      return selectionOperations.duplicate();
    })
    .register("selection.group", (args = {}) => {
      requireObjectMode("agrupar objetos");
      return selectionOperations.group({
        ...args,
        anchorWorldPosition:
          args.anchorWorldPosition ??
          renderer.getSelectionPivotPosition()
      });
    })
    .register("selection.ungroup", () => {
      requireObjectMode("desagrupar objetos");
      return selectionOperations.ungroup();
    })
    .register("selection.duplicateMany", ({ count }) => {
      requireObjectMode("duplicar objetos");
      return selectionOperations.duplicateMany(count);
    })
    .register("selection.duplicateAffine", ({ count, operations }) => {
      requireObjectMode("duplicar objetos por programa afim");
      return selectionOperations.duplicateAffine(count, operations);
    })
    .register("selection.repeat", () => {
      requireObjectMode("repetir a duplicação");
      return selectionOperations.repeat();
    })
    .register("selection.delete", () => {
      requireObjectMode("excluir objetos");
      return selectionOperations.deleteSelection();
    })
    .register("pivot.policy", ({ policy }) => {
      requireObjectMode("alterar o pivô do objeto");
      editor.setPivotEditing(false);
      editor.setPivotPolicy(policy);
      return editor.snapshot().pivot;
    })
    .register("pivot.absolute", ({ position }) => {
      requireObjectMode("alterar o pivô do objeto");
      return selectionOperations.setPivotAbsolute(position);
    })
    .register("pivot.relative", ({ offset }) => {
      requireObjectMode("alterar o pivô do objeto");
      return selectionOperations.setPivotRelative(offset);
    })
    .register("vertices.set", ({ enabled }) =>
      renderer.setTransformConfig({ showVertices: Boolean(enabled) })
    )
    .register("snap.set", ({ kind, value }) => {
      if (kind === "grid") {
        return renderer.setTransformConfig({ gridLock: Boolean(value) });
      }
      const patch = {};
      if (kind === "move") patch.translationSnap = value || null;
      else if (kind === "rotate") patch.rotationSnapDeg = value || null;
      else if (kind === "scale") patch.scaleSnap = value || null;
      else throw new Error(`Unknown snap kind: ${kind}`);
      return renderer.setTransformConfig(patch);
    })
    .register("gizmo.inspect", () =>
      renderer.getTransformDiagnostics()
    );

  if (meshEditor) {
    commands
      .register("mesh.edit.enter", args => meshEditor.enter(args), {
        category: "mesh-edit",
        mutates: false
      })
      .register("mesh.edit.commit", () => {
        canMutateProject("aplicar a edição de malha");
        return meshEditor.commit();
      }, {
        category: "mesh-edit",
        mutates: true
      })
      .register("mesh.edit.cancel", () => meshEditor.cancel(), {
        category: "mesh-edit",
        mutates: false
      })
      .register("mesh.edit.undo", () => meshEditor.undo(), {
        category: "mesh-edit",
        mutates: false
      })
      .register("mesh.edit.redo", () => meshEditor.redo(), {
        category: "mesh-edit",
        mutates: false
      })
      .register("mesh.vertices.select-all", () => meshEditor.selectAll())
      .register("mesh.vertices.clear", () => meshEditor.clearSelection())
      .register("mesh.vertices.invert", () => meshEditor.invertSelection())
      .register("mesh.frame.set", ({ mode }) => meshEditor.setFrame(mode))
      .register("mesh.frame.viewer.toggle", () => meshEditor.toggleViewerFrame())
      .register("mesh.constraint.set", ({ mode }) => meshEditor.setConstraint(mode))
      .register("mesh.snap.set", args => meshEditor.setSnap(args))
      .register("mesh.options.set", args => meshEditor.setOptions(args))
      .register("mesh.affine.apply", args => meshEditor.applyAffine(args))
      .register("mesh.deform.apply", args => meshEditor.applyProcedural(args));
  }

  if (propertyService) {
    commands
      .register("selection.properties.set", ({
        patch,
        targetScope = "selection"
      }) => {
        requireObjectMode("alterar propriedades do objeto");
        return propertyService.setSelection(patch, { targetScope });
      })
      .register("selection.properties.unset", ({
        properties,
        targetScope = "selection"
      }) => {
        requireObjectMode("alterar propriedades do objeto");
        return propertyService.unsetSelection(properties, { targetScope });
      })
      .register("selection.properties.applyExpression", args => {
        requireObjectMode("alterar propriedades do objeto");
        return propertyService.setSelectionProcedural(args);
      });
  }

  commands
    .register("project.inspect", () =>
      projectService.inspect()
    )
    .register("project.save", () => {
      requireObjectMode("salvar o projeto");
      return projectService.save();
    })
    .register("project.open", ({ text }) => {
      requireObjectMode("abrir outro projeto");
      canMutateProject("abrir outro projeto");
      return projectService.openText(text);
    })
    .register("project.new", () => {
      requireObjectMode("criar outro projeto");
      canMutateProject("criar outro projeto");
      return projectService.newProject();
    });

  commands
    .register(
      "runtime.resources",
      () => resourceAudit.collect()
    )
    .register(
      "selection.stats",
      () => renderer.getSelectionAppearanceDiagnostics()
    );

  commands
    .register("benchmark.help", () =>
      benchmarkRunner.help()
    )
    .register("benchmark.scene", args =>
      benchmarkRunner.runScene(args)
    )
    .register("benchmark.selection", args =>
      renderer.benchmarkSelectionOutlines(args)
    )
    .register("benchmark.compare", () =>
      benchmarkRunner.compare()
    )
    .register("benchmark.history", () =>
      benchmarkRunner.list()
    )
    .register("benchmark.clear", () =>
      benchmarkRunner.clear()
    );

  return commands;
}
