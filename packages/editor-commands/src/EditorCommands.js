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
  editContext = null,
  toolLifecycle = null,
  pathTools = null,
  pathSketch = null,
  objectPlacement = null,
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
  const cancelInteractiveAction = () => {
    if (objectPlacement?.active) objectPlacement.cancel();
    if (pathSketch?.status?.().active) pathSketch.cancel();
    toolLifecycle?.cancelAction();
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
    }, { repeatable: true, label: "Criar objeto" })
    .register("object.create.configured", ({ materialPatch = null, ...args }) => {
      requireObjectMode("criar objetos");
      return selectionOperations.createGeometry({
        ...args,
        material: materialPatch
          ? materialFromAppearancePatch(materialPatch, args.color)
          : null
      });
    }, { repeatable: true, label: "Criar objeto configurado" })
    .register("object.create.geometrySeries", args => {
      requireObjectMode("criar objetos");
      return selectionOperations.createGeometrySeries(args);
    })
    .register("light.create", args => {
      requireObjectMode("criar luzes");
      return selectionOperations.createLight(args);
    }, { repeatable: true, label: "Criar luz" })
    .register("selection.position", ({ position }) =>
      meshEditor?.active
        ? meshEditor.setPivotPosition(position)
        : selectionOperations.setSelectionPosition(position)
    )
    .register("selection.translate", ({ delta }) =>
      meshEditor?.active
        ? meshEditor.translate(delta)
        : selectionOperations.translate(delta)
    , { repeatable: true, label: "Mover seleção" })
    .register("selection.rotate", ({ degrees }) =>
      meshEditor?.active
        ? meshEditor.rotate(degrees)
        : selectionOperations.rotateEuler(degrees)
    , { repeatable: true, label: "Girar seleção" })
    .register("selection.scale", ({ factors }) =>
      meshEditor?.active
        ? meshEditor.scale(factors)
        : selectionOperations.scaleBy(factors)
    , { repeatable: true, label: "Escalar seleção" })
    .register("selection.duplicate", () => {
      if (meshEditor?.active) {
        return meshEditor.applyTopology({ operation: "duplicate" });
      }
      return selectionOperations.duplicate();
    }, { repeatable: true, label: "Duplicar" })
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
    .register("selection.repeat", ({ count = 1 } = {}) => {
      requireObjectMode("repetir a duplicação");
      return selectionOperations.repeat(count);
    })
    .register("selection.delete", () => {
      if (meshEditor?.active) {
        return meshEditor.applyTopology({ operation: "delete" });
      }
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
    )
    .register("viewer.transform.settings.set", patch =>
      renderer.setTransformConfig(patch)
    );

  if (editContext) {
    commands
      .register("edit.context.subject.set", ({ level, selectAll = false }) => {
        cancelInteractiveAction();
        return editContext.setSubjectLevel(level, { selectAll });
      })
      .register("edit.context.tool.set", ({ mode }) => {
        cancelInteractiveAction();
        return editContext.setTool(mode);
      })
      .register("edit.context.selection-operation.set", ({ operation }) =>
        editContext.setSelectionOperation(operation))
      .register("edit.context.frame.set", ({ mode }) =>
        editContext.setFrame(mode))
      .register("edit.context.axes.set", patch =>
        editContext.setAxes(patch))
      .register("edit.context.snap.set", patch =>
        editContext.setSnap(patch))
      .register("edit.context.proportional.set", ({ enabled }) =>
        editContext.setProportional(enabled))
      .register("edit.navigation.plane.toggle", args =>
        editContext.togglePlaneLock(args))
      .register("edit.navigation.plane.clear", () => {
        if (renderer.getNavigationLocks?.().plane) {
          return editContext.togglePlaneLock();
        }
        return editContext.status();
      })
      .register("edit.navigation.point.toggle", args =>
        editContext.togglePointLock(args))
      .register("edit.navigation.point.clear", () => {
        if (renderer.getNavigationLocks?.().point) {
          return editContext.togglePointLock();
        }
        return editContext.status();
      })
      .register("edit.navigation.locks.clear", () =>
        editContext.clearNavigationLocks())
      .register("edit.plane.set", args =>
        editContext.setEditPlane(args))
      .register("edit.plane.clear", () =>
        editContext.clearEditPlane());
  }

  if (toolLifecycle) {
    commands
      .register("edit.tool.keep.set", ({ enabled, toolId = null }) => {
        const status = toolLifecycle.setKeepActive(enabled, {
          toolId: toolId ?? undefined
        });
        if (objectPlacement?.active) objectPlacement.setContinuous(enabled);
        if (pathSketch?.status?.().active) pathSketch.setContinuous(enabled);
        return status;
      })
      .register("edit.command.repeat", () => toolLifecycle.repeat());
  }

  if (pathTools) {
    commands
      .register("path.create", args =>
        pathTools.createPath(args), {
          category: "path-tools",
          mutates: true,
          repeatable: true,
          label: "Criar caminho"
        })
      .register("path.reference.inspect", args =>
        pathTools.inspect(args), {
          category: "path-reference",
          mutates: false
        })
      .register("path.tube.create", args =>
        pathTools.createTube(args), {
          category: "path-tools",
          mutates: true,
          repeatable: true,
          label: "Criar tubo por caminho"
        })
      .register("path.sweep.create", args =>
        pathTools.createSweep(args), {
          category: "path-tools",
          mutates: true,
          repeatable: true,
          label: "Criar varredura"
        })
      .register("path.array.create", args =>
        pathTools.arraySelection(args), {
          category: "path-tools",
          mutates: true,
          repeatable: true,
          label: "Distribuir por caminho"
        })
      .register("path.from-mesh-selection.create", args =>
        pathTools.createPathFromMeshSelection(args), {
          category: "path-tools",
          mutates: true,
          repeatable: true,
          label: "Criar caminho da seleção"
        })
      .register("path.bezier.convert", args =>
        pathTools.convertSelectedPathToBezier(args), {
          category: "path-tools",
          mutates: true
        });
  }

  if (pathSketch) {
    commands
      .register("path.sketch.begin", args => {
        toolLifecycle?.activateAction("path.sketch");
        try {
          return pathSketch.begin({
            ...args,
            continuous: args.continuous ?? toolLifecycle?.keepActive("path.sketch")
          });
        } catch (error) {
          toolLifecycle?.cancelAction("path.sketch");
          throw error;
        }
      }, {
        category: "path-sketch",
        mutates: false
      })
      .register("path.sketch.cancel", () => {
        const result = pathSketch.cancel();
        toolLifecycle?.cancelAction("path.sketch");
        return result;
      }, {
        category: "path-sketch",
        mutates: false
      });
  }

  if (objectPlacement) {
    commands
      .register("object.placement.begin", args => {
        requireObjectMode("posicionar objetos");
        toolLifecycle?.activateAction("object.place");
        try {
          return objectPlacement.begin({
            ...args,
            continuous: args.continuous ?? toolLifecycle?.keepActive("object.place")
          });
        } catch (error) {
          toolLifecycle?.cancelAction("object.place");
          throw error;
        }
      }, { category: "object-placement", mutates: false })
      .register("object.placement.cancel", () => {
        const result = objectPlacement.cancel();
        toolLifecycle?.cancelAction("object.place");
        return result;
      }, { category: "object-placement", mutates: false });
  }

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
      .register("mesh.component.mode.set", ({ mode }) =>
        meshEditor.setComponentMode(mode))
      .register("mesh.selection.apply", ({ operation, options }) =>
        meshEditor.selectComponents(operation, options))
      .register("mesh.topology.apply", args => meshEditor.applyTopology(args), {
        repeatable: true,
        label: "Operação topológica"
      })
      .register("mesh.topology.options.set", args =>
        meshEditor.setTopologyOptions(args))
      .register("mesh.display.set", args => meshEditor.setDisplayOptions(args))
      .register("mesh.frame.set", ({ mode }) => meshEditor.setFrame(mode))
      .register("mesh.frame.viewer.toggle", () => meshEditor.toggleViewerFrame())
      .register("mesh.constraint.set", ({ mode }) => meshEditor.setConstraint(mode))
      .register("mesh.snap.set", args => meshEditor.setSnap(args))
      .register("mesh.deform.settings.set", args =>
        meshEditor.setDeformation(args))
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

function materialFromAppearancePatch(patch = {}, fallbackColor = "#6699cc") {
  const opacity = finiteOr(patch["appearance.opacity"], 1);
  return {
    model: String(patch["appearance.model"] ?? "standard"),
    color: String(patch["appearance.color"] ?? fallbackColor),
    opacity,
    transparent: Boolean(patch["appearance.transparent"] ?? opacity < 1),
    parameters: {
      roughness: finiteOr(patch["appearance.roughness"], 0.55),
      metalness: finiteOr(patch["appearance.metalness"], 0),
      transmission: finiteOr(patch["appearance.transmission"], 0),
      ior: finiteOr(patch["appearance.ior"], 1.5),
      thickness: finiteOr(patch["appearance.thickness"], 0.5),
      dispersion: finiteOr(patch["appearance.dispersion"], 0),
      clearcoat: finiteOr(patch["appearance.clearcoat"], 0),
      envMapIntensity: finiteOr(patch["appearance.envMapIntensity"], 1)
    }
  };
}

function finiteOr(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
