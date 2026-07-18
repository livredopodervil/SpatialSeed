import { CommandRegistry } from "./CommandRegistry.js";

export function createEditorCommands({
  editor,
  renderer,
  selectionOperations,
  projectService,
  benchmarkRunner,
  resourceAudit,
  propertyService = null
}) {
  const commands = new CommandRegistry();

  commands
    .register("tool.set", ({ mode }) => {
      renderer.setTransformMode(mode);
      return editor.snapshot().tool;
    })
    .register("space.toggle", () => ({
      space: renderer.toggleSpace()
    }))
    .register("selection.multi.toggle", () => {
      editor.setMultiSelect(!editor.multiSelect);
      return { multiSelect: editor.multiSelect };
    })
    .register("selection.clear", () => {
      editor.selection.clear();
      return editor.selection.snapshot();
    })
    .register("history.undo", () => ({
      changed: selectionOperations.sandbox.undo()
    }))
    .register("history.redo", () => ({
      changed: selectionOperations.sandbox.redo()
    }))
    .register("pivot.edit.toggle", () => {
      const enabled = !editor.pivot.editing;
      const changed = renderer.setPivotEditing(enabled);

      return {
        changed,
        editing: changed ? enabled : editor.pivot.editing,
        reason: changed ? null : "selection-empty"
      };
    })
    .register("object.create.box", args =>
      selectionOperations.createBox(args)
    )
    .register("object.create.geometry", args =>
      selectionOperations.createGeometry(args)
    )
    .register("object.create.geometrySeries", args =>
      selectionOperations.createGeometrySeries(args)
    )
    .register("selection.position", ({ position }) =>
      selectionOperations.setSelectionPosition(position)
    )
    .register("selection.translate", ({ delta }) =>
      selectionOperations.translate(delta)
    )
    .register("selection.rotate", ({ degrees }) =>
      selectionOperations.rotateEuler(degrees)
    )
    .register("selection.scale", ({ factors }) =>
      selectionOperations.scaleBy(factors)
    )
    .register("selection.duplicate", () =>
      selectionOperations.duplicate()
    )
    .register("selection.group", (args = {}) =>
      selectionOperations.group({
        ...args,
        anchorWorldPosition:
          args.anchorWorldPosition ??
          renderer.getSelectionPivotPosition()
      })
    )
    .register("selection.ungroup", () =>
      selectionOperations.ungroup()
    )
    .register("selection.duplicateMany", ({ count }) =>
      selectionOperations.duplicateMany(count)
    )
    .register("selection.duplicateAffine", ({ count, operations }) =>
      selectionOperations.duplicateAffine(count, operations)
    )
    .register("selection.repeat", () =>
      selectionOperations.repeat()
    )
    .register("selection.delete", () =>
      selectionOperations.deleteSelection()
    )
    .register("pivot.policy", ({ policy }) => {
      editor.setPivotEditing(false);
      editor.setPivotPolicy(policy);
      return editor.snapshot().pivot;
    })
    .register("pivot.absolute", ({ position }) =>
      selectionOperations.setPivotAbsolute(position)
    )
    .register("pivot.relative", ({ offset }) =>
      selectionOperations.setPivotRelative(offset)
    )
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

  if (propertyService) {
    commands
      .register("selection.properties.set", ({ patch }) =>
        propertyService.setSelection(patch)
      )
      .register("selection.properties.unset", ({ properties }) =>
        propertyService.unsetSelection(properties)
      );
  }

  commands
    .register("project.inspect", () =>
      projectService.inspect()
    )
    .register("project.save", () =>
      projectService.save()
    )
    .register("project.open", ({ text }) =>
      projectService.openText(text)
    )
    .register("project.new", () =>
      projectService.newProject()
    );

  commands
    .register(
      "runtime.resources",
      () => resourceAudit.collect()
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
