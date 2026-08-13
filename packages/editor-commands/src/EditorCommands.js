import { CommandRegistry } from "./CommandRegistry.js";

export function createEditorCommands({
  editor,
  renderer,
  selectionOperations,
  projectService,
  propertyService = null,
  meshEditor = null,
  editContext = null,
  toolLifecycle = null,
  toolParameters = null,
  pathTools = null,
  pathSketch = null,
  meshPathGesture = null,
  planarSketch = null,
  objectPlacement = null,
  measurement = null,
  beforeProjectSave = null,
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
  const cancelInteractiveAction = ({ except = null } = {}) => {
    const preserved = String(except ?? "");
    if (preserved !== "object.place" && objectPlacement?.active) {
      objectPlacement.cancel();
    }
    if (preserved !== "path.sketch" && pathSketch?.status?.().active) {
      pathSketch.cancel();
    }
    if (preserved !== "mesh.path" && meshPathGesture?.status?.().active) {
      meshPathGesture.cancel("other-action");
    }
    if (preserved !== "planar.sketch" && planarSketch?.status?.().active) {
      planarSketch.cancel();
    }
    if (preserved !== "measurement" && measurement?.status?.().active) {
      measurement.cancel();
    }
    if (!preserved || toolLifecycle?.status?.().activeAction !== preserved) {
      toolLifecycle?.cancelAction();
    }
  };
  const toggleOffActiveAction = toolId => {
    const normalized = String(toolId);
    if (normalized === "object.place" && objectPlacement?.active) {
      objectPlacement.cancel();
      toolLifecycle?.cancelAction(normalized);
      return true;
    }
    if (normalized === "path.sketch" && pathSketch?.status?.().active) {
      pathSketch.cancel();
      toolLifecycle?.cancelAction(normalized);
      return true;
    }
    if (normalized === "planar.sketch" && planarSketch?.status?.().active) {
      planarSketch.cancel();
      toolLifecycle?.cancelAction(normalized);
      return true;
    }
    if (normalized === "measurement" && measurement?.status?.().active) {
      measurement.cancel();
      toolLifecycle?.cancelAction();
      return true;
    }
    return false;
  };
  const configured = (toolId, args, execute) => {
    if (!toolParameters) return execute(args ?? {});
    toolParameters.activate(toolId);
    const parameters = toolParameters.resolve(toolId, args ?? {});
    const invocation = {
      ...Object.fromEntries(
        Object.entries(args ?? {}).filter(([, value]) =>
          value !== null && value !== undefined
        )
      ),
      ...Object.fromEntries(
        Object.entries(parameters).filter(([, value]) => value !== null)
      )
    };
    const result = execute(invocation, parameters);
    if (!toolParameters.status().futureSchema) {
      toolParameters.remember(toolId, parameters);
    }
    return result;
  };

  commands
    .register("tool.set", ({ mode }) => {
      cancelInteractiveAction();
      renderer.setTransformMode(mode);
      return editor.snapshot().tool;
    })
    .register("edit.interaction.cancel", () => {
      cancelInteractiveAction();
      renderer.setTransformMode("select");
      return Object.freeze({ active: false, mode: "select" });
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
    .register("selection.gesture.set", ({
      mode = editor.selectionGestureMode,
      radiusPixels = editor.selectionBrushRadius,
      enabled = true,
      toggle = false
    } = {}) => {
      const normalizedMode = String(mode ?? "rectangle").trim().toLowerCase();
      const nextEnabled = toggle &&
        editor.areaSelection &&
        editor.selectionGestureMode === normalizedMode
        ? false
        : Boolean(enabled);
      if (nextEnabled && editor.tool.mode !== "select") {
        renderer.setTransformMode("select");
      }
      editor.setSelectionGesture({
        mode: normalizedMode,
        radiusPixels,
        enabled: nextEnabled
      });
      return {
        enabled: editor.areaSelection,
        mode: editor.selectionGestureMode,
        radiusPixels: editor.selectionBrushRadius
      };
    })
    .register("selection.gesture.apply", ({
      operation = editor.selectionOperation,
      ...gesture
    } = {}) => {
      const result = renderer.resolveScreenSelectionGesture(gesture);
      if (result.subject === "component") {
        if (!meshEditor?.active) {
          throw new Error("A sessão de malha do gesto não está ativa.");
        }
        if (result.mode === "eraser") {
          if (!result.indices.length) {
            return { changed: false, deleted: 0, subject: "component" };
          }
          meshEditor.applyComponentSelection({
            mode: result.component,
            indices: result.indices,
            operation: "replace"
          });
          return meshEditor.applyTopology({ operation: "delete" });
        }
        return meshEditor.applyComponentSelection({
          mode: result.component,
          indices: result.indices,
          operation
        });
      }
      if (result.mode === "eraser") {
        return selectionOperations.deleteIds(
          result.members.map(member => member.objectId),
          { source: "selection-eraser" }
        );
      }
      return editor.selection.applyMany(result.members, { operation });
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
      .register("authoring.plane.set", args =>
        editContext.setAuthoringPlane(args))
      .register("authoring.plane.clear", () =>
        editContext.clearAuthoringPlane())
      .register("edit.plane.set", args =>
        editContext.setAuthoringPlane(args))
      .register("edit.plane.clear", () =>
        editContext.clearAuthoringPlane())
      .register("drawing.plane.set", args =>
        editContext.setAuthoringPlane(args))
      .register("drawing.plane.clear", () =>
        editContext.clearAuthoringPlane());
  }

  if (toolLifecycle) {
    commands
      .register("edit.tool.keep.set", ({ enabled, toolId = null }) => {
        const targetToolId = String(
          toolId ?? toolLifecycle.status().toolId ?? ""
        ).trim();
        const status = toolLifecycle.setKeepActive(enabled, {
          toolId: targetToolId || undefined
        });
        if (targetToolId === "object.place" && objectPlacement?.active) {
          objectPlacement.setContinuous(enabled);
        }
        if (targetToolId === "path.sketch" && pathSketch?.status?.().active) {
          pathSketch.setContinuous(enabled);
        }
        if (targetToolId === "planar.sketch" &&
            planarSketch?.status?.().active) {
          planarSketch.setContinuous(enabled);
        }
        return status;
      })
      .register("edit.command.repeat", () => toolLifecycle.repeat());
  }

  if (toolParameters) {
    commands
      .register("edit.tool.parameters.activate", ({ toolId }) =>
        toolParameters.activate(toolId))
      .register("edit.tool.parameters.set", ({ toolId, patch = {} }) => {
        if (toolParameters.status().futureSchema) {
          return toolParameters.set(toolId, patch);
        }
        const next = toolParameters.resolve(toolId, patch);
        if (toolId === "path.sketch" && pathSketch?.status?.().active) {
          pathSketch.updateSettings(next);
        }
        if (toolId === "planar.sketch" &&
            planarSketch?.status?.().active) {
          planarSketch.updateSettings(next);
        }
        return toolParameters.set(toolId, patch);
      })
      .register("edit.tool.parameters.reset", ({ toolId }) => {
        const next = toolParameters.reset(toolId);
        if (toolId === "path.sketch" && pathSketch?.status?.().active) {
          pathSketch.updateSettings(next);
        }
        if (toolId === "planar.sketch" &&
            planarSketch?.status?.().active) {
          planarSketch.updateSettings(next);
        }
        return next;
      });
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
        configured("path.tube", args, invocation =>
          pathTools.createTube(invocation)), {
          category: "path-tools",
          mutates: true,
          repeatable: true,
          label: "Criar tubo por caminho"
        })
      .register("path.sweep.create", args =>
        configured("path.sweep", args, invocation =>
          pathTools.createSweep(invocation)), {
          category: "path-tools",
          mutates: true,
          repeatable: true,
          label: "Criar varredura"
        })
      .register("profile.extrude.create", args =>
        configured("path.sketch", args, invocation =>
          pathTools.createExtrude(invocation)), {
          category: "path-tools",
          mutates: true,
          repeatable: true,
          label: "Extrudar perfil existente"
        })
      .register("profile.revolve.create", args =>
        configured("path.sketch", args, invocation =>
          pathTools.createRevolve(invocation)), {
          category: "path-tools",
          mutates: true,
          repeatable: true,
          label: "Revolucionar perfil existente"
        })
      .register("path.array.create", args =>
        configured("path.array", args, invocation =>
          pathTools.arraySelection(invocation)), {
          category: "path-tools",
          mutates: true,
          repeatable: true,
          label: "Distribuir por caminho"
        })
      .register("path.array.points.create", args =>
        configured("path.sketch", args, invocation =>
          pathTools.arraySelectionAlongPoints(invocation)), {
          category: "path-tools",
          mutates: true,
          repeatable: true,
          label: "Distribuir no caminho desenhado"
        })
      .register("path.from-mesh-selection.create", args =>
        configured("path.from-selection", args, invocation =>
          pathTools.createPathFromMeshSelection(invocation)), {
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
        requireObjectMode("desenhar caminhos");
        if (toggleOffActiveAction("path.sketch")) {
          return Object.freeze({ active: false, toggledOff: true });
        }
        cancelInteractiveAction({ except: "path.sketch" });
        toolLifecycle?.activateAction("path.sketch");
        try {
          return configured("path.sketch", args, invocation =>
            pathSketch.begin({
              ...invocation,
              continuous:
                args.continuous ??
                toolLifecycle?.keepActive("path.sketch")
            })
          );
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

  if (planarSketch) {
    commands
      .register("planar.sketch.begin", (args = {}) => {
        requireObjectMode("desenhar geometria 2D");
        const status = planarSketch?.status?.() ?? {};
        if (status.active && (!args.mode || args.mode === status.mode)) {
          toggleOffActiveAction("planar.sketch");
          return Object.freeze({ active: false, toggledOff: true });
        }
        cancelInteractiveAction({ except: "planar.sketch" });
        toolLifecycle?.activateAction("planar.sketch");
        try {
          return configured("planar.sketch", args, invocation =>
            planarSketch.begin({
              ...invocation,
              continuous:
                args.continuous ??
                toolLifecycle?.keepActive("planar.sketch")
            })
          );
        } catch (error) {
          toolLifecycle?.cancelAction("planar.sketch");
          throw error;
        }
      }, {
        category: "planar-sketch",
        mutates: false
      })
      .register("planar.sketch.finish", () =>
        planarSketch.finish(), {
          category: "planar-sketch",
          mutates: false
        })
      .register("planar.sketch.point.remove", () =>
        planarSketch.removeLastPoint(), {
          category: "planar-sketch",
          mutates: false
        })
      .register("planar.sketch.cancel", () => {
        const result = planarSketch.cancel();
        toolLifecycle?.cancelAction("planar.sketch");
        return result;
      }, {
        category: "planar-sketch",
        mutates: false
      })
      .register("planar.primitive.create", args =>
        configured("planar.sketch", args, invocation =>
          planarSketch.create(invocation)), {
          category: "planar-sketch",
          mutates: true,
          repeatable: true,
          label: "Criar geometria 2D"
        });
  }

  if (objectPlacement) {
    commands
      .register("object.placement.begin", args => {
        requireObjectMode("posicionar objetos");
        const activePlacement = objectPlacement?.status?.() ?? null;
        const sameGeometry = activePlacement?.active &&
          JSON.stringify(activePlacement.settings?.geometry ?? null) ===
          JSON.stringify(args?.geometry ?? null);
        if (objectPlacement?.active &&
            (sameGeometry || !activePlacement?.settings)) {
          toggleOffActiveAction("object.place");
          return Object.freeze({ active: false, toggledOff: true });
        }
        cancelInteractiveAction({ except: "object.place" });
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

  if (measurement) {
    commands
      .register("measurement.begin", (args = {}) => {
        const status = measurement?.status?.() ?? {};
        if (status.active && (!args.mode || args.mode === status.mode)) {
          toggleOffActiveAction("measurement");
          return Object.freeze({ active: false, toggledOff: true });
        }
        cancelInteractiveAction({ except: "measurement" });
        toolLifecycle?.cancelAction();
        return measurement.begin(args);
      }, { category: "measurement", mutates: false })
      .register("measurement.clear", () =>
        measurement.clear(), {
          category: "measurement",
          mutates: false
        })
      .register("measurement.cancel", () =>
        measurement.cancel(), {
          category: "measurement",
          mutates: false
        });
  }

  if (meshEditor) {
    commands
      .register("planar.edit.begin", ({ selectAll = false } = {}) => {
        cancelInteractiveAction();
        if (editContext && !editContext.status().editPlane) {
          const drawingPlane = editContext.status().drawingPlane;
          editContext.setEditPlane(
            drawingPlane
              ? {
                  source: "drawing-plane",
                  frame: drawingPlane
                }
              : { source: "object" }
          );
        }
        const status = editContext
          ? editContext.setSubjectLevel("vertex", { selectAll })
          : meshEditor.enter({ selectAll });
        if (editContext?.status().editPlane) {
          editContext.setFrame("custom-plane");
        }
        return status;
      }, {
        category: "planar-edit",
        mutates: false
      })
      .register("mesh.edit.enter", (args = {}) => {
        const selectAll = args.selectAll === true;
        if (!editContext) return meshEditor.enter({ ...args, selectAll });
        editContext.setSubjectLevel("vertex", { selectAll });
        return meshEditor.status();
      }, {
        category: "mesh-edit",
        mutates: false
      })
      .register("mesh.edit.commit", () => {
        canMutateProject("aplicar a edição de malha");
        if (meshPathGesture?.status?.().active) {
          meshPathGesture.cancel("mesh-commit");
        }
        return meshEditor.commit();
      }, {
        category: "mesh-edit",
        mutates: true
      })
      .register("mesh.edit.cancel", () => {
        if (meshPathGesture?.status?.().active) {
          meshPathGesture.cancel("mesh-cancel");
        }
        return meshEditor.cancel();
      }, {
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
      .register("mesh.tools.list", ({ kind = null } = {}) =>
        meshEditor.availableTools({ kind }), {
          category: "mesh-edit",
          mutates: false
        })
      .register("mesh.extrude.invoke", ({ options = {} } = {}) => {
        const pathMode = String(options.pathMode ?? "drag-line").toLowerCase();
        if (pathMode === "normal" || Array.isArray(options.path)) {
          return meshEditor.applyTopology({
            operation: "extrude",
            options
          });
        }
        if (!meshPathGesture) {
          throw new Error("A interação de extrusão por caminho não está instalada.");
        }
        cancelInteractiveAction({ except: "mesh.path" });
        const {
          pathSamplePixels = 6,
          pathSimplify = 0.004,
          ...operatorOptions
        } = options;
        return meshPathGesture.begin({
          operation: "extrude",
          pathMode,
          pathSamplePixels,
          pathSimplify,
          options: operatorOptions
        });
      }, {
        category: "mesh-edit",
        mutates: false,
        label: "Iniciar extrusão por caminho"
      })
      .register("mesh.path.cancel", () =>
        meshPathGesture?.cancel("command") ?? { active: false }, {
          category: "mesh-edit",
          mutates: false
        })
      .register("mesh.tool.execute", ({ toolId, options = {} } = {}) =>
        meshEditor.executeTool({ toolId, options }), {
          category: "mesh-edit",
          mutates: true,
          repeatable: true,
          label: "Executar ferramenta de malha"
        })
      .register("mesh.topology.apply", args => {
        const toolId = {
          extrude: "mesh.extrude",
          inset: "mesh.inset",
          split: "mesh.split"
        }[args.operation];
        if (!toolId || !toolParameters) {
          return meshEditor.applyTopology(args);
        }
        return configured(toolId, args.options ?? {}, parameters =>
          meshEditor.applyTopology({
            ...args,
            options: {
              ...(args.options ?? {}),
              ...parameters
            }
          })
        );
      }, {
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
      if (typeof beforeProjectSave === "function") beforeProjectSave();
      return projectService.save();
    })
    .register("project.open", ({ text }) => {
      canMutateProject("abrir outro projeto");
      return projectService.openText(text);
    })
    .register("project.new", () => {
      canMutateProject("criar outro projeto");
      return projectService.newProject();
    });

  commands.register(
    "selection.stats",
    () => renderer.getSelectionAppearanceDiagnostics()
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
