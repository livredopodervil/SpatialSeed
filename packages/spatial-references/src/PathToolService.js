import * as THREE from "three";
import {
  applyWorldTransforms,
  cloneHierarchySubtrees,
  HierarchyIndex
} from "../../scene-hierarchy/src/index.js";
import { createSweepGeometryDescriptor } from "./SweepGeometry.js";
import {
  localizedPoints,
  normalizePointList
} from "./ReferenceGeometry.js";
import {
  samplePathFrames,
  samplePathFrameTailBySpacing,
  samplePathFramesBySpacing
} from "./PathFrames.js?build=20260729-0039g";
import {
  compilePathBrushAffineModifier,
  evaluatePathBrushAffineModifier
} from "./PathBrushAffine.js?build=20260729-0039g";
import {
  compilePathBrushColorModifier,
  evaluatePathBrushColorModifier
} from "./PathBrushColor.js?build=20260729-0039g";

const ARRAY_BRUSH_PLAN_TYPE = "array-brush-stroke-plan";
const ARRAY_BRUSH_PLAN_VERSION = 1;

export class PathToolService {
  static apiVersion = "path-tool-service-v5";
  #issuedArrayBrushPlans = new WeakSet();

  constructor({
    resolver,
    selectionOperations,
    sandbox,
    editor,
    meshEditor = null,
    requireObjectMode = () => {}
  }) {
    if (!resolver?.resolvePath || !resolver?.resolveProfile) {
      throw new TypeError("PathToolService exige SpatialReferenceResolver.");
    }
    if (!selectionOperations?.createGeometry) {
      throw new TypeError("PathToolService exige SelectionOperations.");
    }
    this.resolver = resolver;
    this.selectionOperations = selectionOperations;
    this.sandbox = sandbox;
    this.editor = editor;
    this.meshEditor = meshEditor;
    this.requireObjectMode = requireObjectMode;
  }

  listReferences(options = {}) {
    return this.resolver.listObjects(options);
  }

  inspect({ kind = "path", reference = {} } = {}) {
    const normalized = String(kind).toLowerCase();
    if (normalized === "path") return this.resolver.resolvePath(reference);
    if (normalized === "profile") return this.resolver.resolveProfile(reference);
    if (normalized === "point") return this.resolver.resolvePoint(reference);
    throw new RangeError(`Tipo de referência desconhecido: ${kind}.`);
  }

  createPath({
    points,
    name = "Caminho",
    radius = 0.08,
    tubularSegments = 96,
    radialSegments = 6,
    closed = false,
    curveType = "centripetal",
    tension = 0.5,
    color = "#70c8ff",
    preserveSelection = false
  } = {}) {
    const normalizedCurveType = String(curveType ?? "centripetal").toLowerCase();
    const sourcePoints = this.prepareSketchPoints({
      points,
      curveType: normalizedCurveType,
      tension
    });
    const localized = localizedPoints(sourcePoints);
    const previousSelection = preserveSelection
      ? this.editor.selection.snapshot()
      : null;
    const result = this.selectionOperations.createGeometry({
      name,
      position: localized.origin,
      geometry: {
        type: "tube",
        points: localized.points,
        tubularSegments: integerAtLeast(tubularSegments, 2, "tubularSegments"),
        radius: positive(radius, "radius"),
        radialSegments: integerAtLeast(radialSegments, 3, "radialSegments"),
        closed: Boolean(closed),
        curveType: normalizedCurveType,
        tension: finite(tension, "tension")
      },
      color
    });
    if (previousSelection) restoreSelection(this.editor.selection, previousSelection);
    return Object.freeze({
      ...result,
      tool: "path-create",
      pointCount: localized.points.length,
      curveType: normalizedCurveType,
      closed: Boolean(closed)
    });
  }

  prepareSketchPoints({
    points,
    curveType = "centripetal",
    tension = 0.5
  } = {}) {
    const normalizedCurveType = String(curveType ?? "centripetal").toLowerCase();
    let sourcePoints = ensureTubePoints(
      normalizePointList(points, 2, "caminho desenhado")
    );
    if (normalizedCurveType === "bezier" &&
        (sourcePoints.length - 1) % 3 !== 0) {
      sourcePoints = catmullRomToBezierControls(
        sourcePoints,
        finite(tension, "tension")
      );
    }
    return Object.freeze(
      sourcePoints.map(point => Object.freeze([...point]))
    );
  }

  createPathFromMeshSelection({
    name = null,
    radius = 0.08,
    tubularSegments = 96,
    radialSegments = 6,
    curveType = "centripetal",
    tension = 0.5,
    color = "#70c8ff"
  } = {}) {
    if (!this.meshEditor?.active || !this.meshEditor.selectedPathReference) {
      throw new Error("Entre na edição de malha e selecione componentes para criar o caminho.");
    }
    const reference = this.meshEditor.selectedPathReference();
    const result = this.createPath({
      points: reference.points,
      name: name || `Caminho — ${reference.objectName}`,
      radius,
      tubularSegments,
      radialSegments,
      closed: reference.closed,
      curveType,
      tension,
      color,
      preserveSelection: true
    });
    return Object.freeze({
      ...result,
      reference: summary(reference),
      ordering: reference.ordering
    });
  }

  convertSelectedPathToBezier({ tension = 0.5 } = {}) {
    this.#assertCanMutate("converter um caminho para Bézier");
    const selection = this.editor.selection.snapshot();
    if (selection.members.length !== 1) {
      throw new Error("Selecione exatamente um caminho para converter em Bézier.");
    }
    const objectId = selection.members[0].objectId;
    const state = this.sandbox.getSnapshot();
    const object = state.objects.find(candidate => candidate.id === objectId);
    if (!object) throw new Error("O caminho selecionado não existe.");
    const descriptor = this.resolver.geometryRegistry.describeLegacyObject(object);
    if (descriptor.type !== "tube" || !Array.isArray(descriptor.points)) {
      throw new Error("O objeto selecionado não possui uma linha central editável.");
    }
    if (descriptor.closed) {
      throw new Error("Converta primeiro o caminho fechado em caminho aberto.");
    }
    if (descriptor.curveType === "bezier") {
      return Object.freeze({ changed: false, objectId, curveType: "bezier" });
    }
    const points = catmullRomToBezierControls(
      descriptor.points,
      finite(tension, "tension")
    );
    const geometry = this.resolver.geometryRegistry.normalize({
      ...descriptor,
      points,
      curveType: "bezier",
      closed: false
    });
    const changed = this.sandbox.dispatch({
      type: "object.geometry.replace",
      id: objectId,
      geometry,
      source: "path-convert-bezier"
    });
    return Object.freeze({
      changed,
      objectId,
      curveType: "bezier",
      controlPointCount: points.length
    });
  }

  createTube({
    path = {},
    name = null,
    radius = 0.25,
    tubularSegments = 64,
    radialSegments = 8,
    closed = undefined,
    curveType = "centripetal",
    tension = 0.5,
    color = "#66aadd"
  } = {}) {
    this.#assertCanMutate("criar tubo por caminho");
    const resolved = this.resolver.resolvePath({ ...path, closed });
    const localized = localizedPoints(ensureTubePoints(resolved.points));
    const result = this.selectionOperations.createGeometry({
      name: name || `Tubo — ${resolved.objectName}`,
      position: localized.origin,
      geometry: {
        type: "tube",
        points: localized.points,
        tubularSegments: integerAtLeast(tubularSegments, 2, "tubularSegments"),
        radius: positive(radius, "radius"),
        radialSegments: integerAtLeast(radialSegments, 3, "radialSegments"),
        closed: closed === undefined ? resolved.closed : Boolean(closed),
        curveType,
        tension: finite(tension, "tension")
      },
      color
    });
    return Object.freeze({
      ...result,
      tool: "tube-along-reference",
      reference: summary(resolved)
    });
  }

  createSweep({
    path = {},
    profile = {},
    name = null,
    segments = 32,
    closedPath = undefined,
    curveType = "centripetal",
    tension = 0.5,
    twistDegrees = 0,
    scaleStart = 1,
    scaleEnd = 1,
    caps = true,
    color = "#7f9cff"
  } = {}) {
    this.#assertCanMutate("criar varredura por caminho");
    const resolvedPath = this.resolver.resolvePath({
      ...path,
      closed: closedPath
    });
    const resolvedProfile = this.resolver.resolveProfile(profile);
    const sweep = createSweepGeometryDescriptor({
      pathPoints: resolvedPath.points,
      profilePoints: resolvedProfile.points,
      segments: integerAtLeast(segments, 1, "segments"),
      closedPath: closedPath === undefined
        ? resolvedPath.closed
        : Boolean(closedPath),
      curveType,
      tension: finite(tension, "tension"),
      twistDegrees: finite(twistDegrees, "twistDegrees"),
      scaleStart: nonZero(scaleStart, "scaleStart"),
      scaleEnd: nonZero(scaleEnd, "scaleEnd"),
      caps: Boolean(caps),
      initialNormal: resolvedProfile.xAxis
    });
    const result = this.selectionOperations.createGeometry({
      name: name || `Varredura — ${resolvedProfile.objectName} × ${resolvedPath.objectName}`,
      position: sweep.origin,
      geometry: sweep.geometry,
      color
    });
    return Object.freeze({
      ...result,
      tool: "sweep-along-reference",
      path: summary(resolvedPath),
      profile: summary(resolvedProfile),
      diagnostics: sweep.diagnostics
    });
  }

  arraySelection({
    path = {},
    count = 8,
    align = true,
    closed = undefined,
    curveType = "centripetal",
    tension = 0.5,
    twistDegrees = 0,
    includePathObject = false
  } = {}) {
    this.#assertCanMutate("distribuir objetos ao longo de caminho");
    const resolvedPath = this.resolver.resolvePath({ ...path, closed });
    return this.#arraySelectionResolved({
      resolvedPath,
      count,
      align,
      closed,
      curveType,
      tension,
      twistDegrees,
      includePathObject
    });
  }

  arraySelectionAlongPoints({
    points,
    sourceIds = null,
    count = null,
    brush = null,
    sourceMode = "selection",
    geometryType = "box",
    sourceGeometry = null,
    sourceColor = "#6699cc",
    spacingMode = "auto",
    spacingWorld = 1,
    spacingScale = 1,
    align = true,
    closed = false,
    curveType = "centripetal",
    tension = 0.5,
    twistDegrees = 0,
    initialNormal = null,
    orientationMode = "preserve",
    affineModifier = null,
    colorModifier = null,
    affineMoveX = "0",
    affineMoveY = "0",
    affineMoveZ = "0",
    affineRotateX = "0",
    affineRotateY = "0",
    affineRotateZ = "0",
    affineScale = "1",
    affineULength = 1,
    affineColor = "source"
  } = {}) {
    this.#assertCanMutate("distribuir objetos no caminho desenhado");
    if (count === null || count === undefined) {
      const captured = brush ?? this.captureArrayBrush({
        sourceMode,
        sourceIds,
        geometryType,
        geometry: sourceGeometry,
        color: sourceColor
      });
      const spacing = this.resolveArrayBrushSpacing({
        brush: captured,
        spacingMode,
        spacingWorld,
        spacingScale
      });
      const modifier = affineModifier ??
        this.compileArrayBrushModifier({
          affineMoveX,
          affineMoveY,
          affineMoveZ,
          affineRotateX,
          affineRotateY,
          affineRotateZ,
          affineScale
        });
      const resolvedColorModifier = colorModifier ??
        this.compileArrayBrushColorModifier({ affineColor });
      return this.arrayBrushAlongPoints({
        points,
        brush: captured,
        spacing,
        align,
        closed,
        curveType,
        tension,
        twistDegrees,
        initialNormal,
        orientationMode,
        affineModifier: modifier,
        colorModifier: resolvedColorModifier,
        affineULength
      });
    }
    const resolvedPath = pointsPathReference({
      points,
      closed,
      sourceRevision: this.sandbox.revision
    });
    return this.#arraySelectionResolved({
      resolvedPath,
      sourceIds,
      count,
      align,
      closed,
      curveType,
      tension,
      twistDegrees,
      includePathObject: true
    });
  }

  captureArraySource({ sourceIds = null, excludeIds = [] } = {}) {
    const state = this.sandbox.getSnapshot();
    const hierarchy = new HierarchyIndex(state.objects);
    return this.#arraySourceIds({ sourceIds, excludeIds, hierarchy });
  }

  captureArrayBrush({
    sourceMode = "selection",
    sourceIds = null,
    geometryType = "box",
    geometry = null,
    color = "#6699cc"
  } = {}) {
    const mode = String(sourceMode ?? "selection").toLowerCase();
    if (mode === "catalog") {
      const requestedType = String(geometryType ?? "box").toLowerCase();
      const descriptor =
        geometry &&
        String(geometry.type ?? "").toLowerCase() === requestedType
          ? this.resolver.geometryRegistry.normalize(geometry)
          : defaultGeometryDescriptor(
              this.resolver.geometryRegistry,
              requestedType
            );
      const normalizedColor = colorValue(color);
      const bounds = geometryBounds(
        this.resolver.geometryRegistry,
        descriptor,
        new THREE.Matrix4()
      );
      const key = JSON.stringify([
        "catalog",
        this.resolver.geometryRegistry.key(descriptor),
        normalizedColor
      ]);
      return Object.freeze({
        key,
        sourceMode: "catalog",
        sourceRevision: this.sandbox.revision,
        sourceIds: Object.freeze([]),
        sourceNodeIds: Object.freeze([]),
        sourceGeometry: descriptor,
        sourceColor: normalizedColor,
        sourceName: this.resolver.geometryRegistry.label(descriptor.type),
        pivot: Object.freeze([0, 0, 0]),
        referenceRotation: Object.freeze([0, 0, 0, 1]),
        autoSpacing: boundsSpacing(bounds),
        renderableCount: 1,
        entries: Object.freeze([Object.freeze({
          key,
          geometry: descriptor,
          color: normalizedColor,
          sourceIds: Object.freeze([null]),
          sourceWorldMatrices: Object.freeze([
            Object.freeze(new THREE.Matrix4().toArray())
          ])
        })])
      });
    }
    if (mode !== "selection") {
      throw new RangeError(
        "A fonte do pincel deve ser selection ou catalog."
      );
    }
    const state = this.sandbox.getSnapshot();
    const hierarchy = new HierarchyIndex(state.objects);
    const rootIds = this.#arraySourceIds({
      sourceIds,
      excludeIds: [],
      hierarchy
    });
    const batches = new Map();
    const bounds = new THREE.Box3();
    let renderableCount = 0;
    for (const rootId of rootIds) {
      for (const objectId of [rootId, ...hierarchy.descendantsOf(rootId)]) {
        const object = hierarchy.node(objectId);
        if (["group", "camera", "light"].includes(object.kind)) continue;
        let descriptor;
        try {
          descriptor =
            this.resolver.geometryRegistry.describeLegacyObject(object);
        } catch {
          continue;
        }
        const objectColor = previewColor(
          object,
          this.selectionOperations.appearanceRuntime
        );
        const batchKey = JSON.stringify([
          this.resolver.geometryRegistry.key(descriptor),
          objectColor
        ]);
        const worldMatrix = new THREE.Matrix4().fromArray(
          hierarchy.worldMatrixOf(objectId)
        );
        const batch = batches.get(batchKey) ?? {
          key: batchKey,
          geometry: descriptor,
          color: objectColor,
          sourceIds: [],
          sourceWorldMatrices: []
        };
        batch.sourceIds.push(objectId);
        batch.sourceWorldMatrices.push(
          Object.freeze(worldMatrix.toArray())
        );
        batches.set(batchKey, batch);
        bounds.union(geometryBounds(
          this.resolver.geometryRegistry,
          descriptor,
          worldMatrix
        ));
        renderableCount += 1;
      }
    }
    if (!renderableCount) {
      throw new Error(
        "A seleção não possui geometria renderizável para usar como pincel."
      );
    }
    const entries = [...batches.values()].map(entry => Object.freeze({
      ...entry,
      geometry: Object.freeze(structuredClone(entry.geometry)),
      sourceIds: Object.freeze(entry.sourceIds),
      sourceWorldMatrices: Object.freeze(entry.sourceWorldMatrices)
    }));
    const pivot = average(rootIds.map(id => hierarchy.worldPivotOf(id)));
    const sourceNodeIds = rootIds.flatMap(rootId => [
      rootId,
      ...hierarchy.descendantsOf(rootId)
    ]);
    const referenceRotation = worldRotation(
      hierarchy.worldMatrixOf(rootIds[0])
    );
    const key = JSON.stringify([
      "selection",
      rootIds,
      pivot,
      referenceRotation,
      entries.map(entry => [
        entry.key,
        entry.sourceWorldMatrices
      ])
    ]);
    return Object.freeze({
      key,
      sourceMode: "selection",
      sourceRevision: this.sandbox.revision,
      sourceIds: rootIds,
      sourceNodeIds: Object.freeze(sourceNodeIds),
      sourceGeometry: null,
      sourceColor: null,
      sourceName: rootIds.length === 1
        ? hierarchy.node(rootIds[0]).name ?? rootIds[0]
        : `${rootIds.length} raízes selecionadas`,
      pivot: Object.freeze(pivot),
      referenceRotation,
      autoSpacing: boundsSpacing(bounds),
      renderableCount,
      entries: Object.freeze(entries)
    });
  }

  rebaseArrayBrush({
    brush,
    createdIds = []
  } = {}) {
    if (!brush?.key || !Array.isArray(brush.entries)) {
      throw new TypeError("Pincel geométrico inválido para rearmamento.");
    }
    const previousRevision = Number(brush.sourceRevision);
    const currentRevision = Number(this.sandbox.revision);
    if (
      !Number.isInteger(previousRevision) ||
      previousRevision < 0 ||
      !Number.isInteger(currentRevision) ||
      currentRevision < previousRevision
    ) {
      throw new Error("Revisão inválida ao rearmar o pincel geométrico.");
    }
    if (currentRevision === previousRevision) return brush;

    const created = new Set(
      (Array.isArray(createdIds) ? createdIds : [])
        .map(String)
    );
    const sourceNodes = new Set(
      (brush.sourceNodeIds ?? brush.sourceIds ?? [])
        .map(String)
    );
    const ownAppendOnlyCommit =
      currentRevision === previousRevision + 1 &&
      created.size > 0 &&
      [...created].every(id => !sourceNodes.has(id));

    /*
     * O catálogo independe da cena. Para uma fonte selecionada, a publicação
     * do próprio traço só acrescenta novos IDs e não altera a captura. Nesses
     * dois caminhos avançamos apenas a revisão e conservamos descritores,
     * matrizes, geometrias e lotes pela mesma referência.
     */
    if (brush.sourceMode === "catalog" || ownAppendOnlyCommit) {
      return Object.freeze({
        ...brush,
        sourceRevision: currentRevision
      });
    }

    /*
     * Se outra edição ocorreu entre captura e rearmamento, recapture somente
     * a subárvore-fonte explícita. O novo key força a reconstrução visual
     * apenas quando a própria fonte realmente mudou.
     */
    return this.captureArrayBrush({
      sourceMode: "selection",
      sourceIds: brush.sourceIds
    });
  }

  resolveArrayBrushSpacing({
    brush,
    spacingMode = "auto",
    spacingWorld = 1,
    spacingScale = 1
  } = {}) {
    const mode = String(spacingMode ?? "auto").toLowerCase();
    if (mode === "auto") {
      return positive(brush?.autoSpacing, "autoSpacing") *
        positive(spacingScale, "spacingScale");
    }
    if (mode === "world") {
      return positive(spacingWorld, "spacingWorld");
    }
    throw new RangeError("O espaçamento deve ser auto ou world.");
  }

  compileArrayBrushModifier(options = {}) {
    return compilePathBrushAffineModifier(options);
  }

  compileArrayBrushColorModifier(options = {}) {
    return compilePathBrushColorModifier(
      options.affineColor ?? options.colorExpression ?? "source"
    );
  }

  previewArrayBrush({
    points,
    brush,
    spacing,
    align = true,
    closed = false,
    curveType = "centripetal",
    tension = 0.5,
    twistDegrees = 0,
    initialNormal = null,
    orientationMode = "preserve",
    affineModifier = null,
    colorModifier = null,
    affineULength = 1,
    previousPlan = null,
    preserveStablePrefix = true,
    maximumCopies = 4096
  } = {}) {
    const resolvedPath = pointsPathReference({
      points,
      closed,
      sourceRevision: this.sandbox.revision
    });
    const reusablePlan = this.#issuedArrayBrushPlans.has(previousPlan)
      ? previousPlan
      : null;
    const layout = this.#arrayBrushLayout({
      resolvedPath,
      brush,
      spacing,
      align,
      closed,
      curveType,
      tension,
      twistDegrees,
      initialNormal,
      orientationMode,
      affineModifier: affineModifier ??
        this.compileArrayBrushModifier(),
      colorModifier: colorModifier ??
        this.compileArrayBrushColorModifier(),
      affineULength: positive(affineULength, "affineULength"),
      previousPlan: reusablePlan,
      preserveStablePrefix,
      maximumCopies
    });
    const draft = this.#prepareArrayBrushDraft({
      brush,
      layout,
      previousPlan: layout.diagnostics.incremental
        ? reusablePlan
        : null
    });
    const plan = deepFreeze({
      type: ARRAY_BRUSH_PLAN_TYPE,
      version: ARRAY_BRUSH_PLAN_VERSION,
      tool: "array-brush-preview",
      key: layout.key,
      brushKey: brush.key,
      sourceRevision: brush.sourceRevision,
      path: {
        points: resolvedPath.points,
        closed: resolvedPath.closed,
        curveType: String(curveType),
        tension: finite(tension, "tension")
      },
      spacing: layout.frames.spacing,
      requestedCount: layout.frames.requestedCount,
      previewCount: layout.deltaMatrices.length,
      truncated: layout.frames.truncated,
      deltaMatrices: layout.deltaMatrices.map(matrix => matrix.toArray()),
      colorsByEntry: layout.colorsByEntry,
      samples: layout.samples,
      baseInverse: layout.baseInverse,
      draft,
      diagnostics: {
        ...layout.diagnostics,
        ...draft.diagnostics
      }
    });
    this.#issuedArrayBrushPlans.add(plan);
    return plan;
  }

  arrayBrushAlongPoints({
    points,
    brush,
    spacing,
    align = true,
    closed = false,
    curveType = "centripetal",
    tension = 0.5,
    twistDegrees = 0,
    initialNormal = null,
    orientationMode = "preserve",
    affineModifier = null,
    colorModifier = null,
    affineULength = 1
  } = {}) {
    const plan = this.previewArrayBrush({
      points,
      brush,
      spacing,
      align,
      closed,
      curveType,
      tension,
      twistDegrees,
      initialNormal,
      orientationMode,
      affineModifier,
      colorModifier,
      affineULength,
      maximumCopies: 10001
    });
    return this.commitArrayBrushPlan({ plan, brush });
  }

  commitArrayBrushPlan({ plan, brush } = {}) {
    this.#assertCanMutate("distribuir um pincel no caminho desenhado");
    const validated = validateArrayBrushPlan(plan, brush, {
      issued: this.#issuedArrayBrushPlans.has(plan)
    });
    if (validated.sourceRevision !== this.sandbox.revision) {
      throw new Error(
        "A cena mudou durante o desenho; arme o pincel novamente."
      );
    }
    if (validated.requestedCount > 10000) {
      throw new RangeError(
        "O traço produziria mais de 10000 instâncias; aumente o espaçamento."
      );
    }
    if (validated.truncated) {
      throw new Error(
        "O plano incremental está truncado; recalcule-o com o limite completo."
      );
    }
    const resolvedPath = pointsPathReference({
      points: validated.path.points,
      closed: validated.path.closed,
      sourceRevision: validated.sourceRevision
    });
    if (brush.sourceMode === "catalog") {
      const colors = colorsForEntry(validated, brush.entries[0].key);
      const result = this.selectionOperations.createGeometryInstances({
        name: `${brush.sourceName} · pincel`,
        geometry: brush.sourceGeometry,
        preparedInstances: validated.draft.instances,
        colors,
        color: brush.sourceColor,
        source: "path-brush-catalog"
      });
      return Object.freeze({
        ...result,
        tool: "array-brush-along-drawn-path",
        sourceMode: "catalog",
        spacing: validated.spacing,
        incrementalPlan: true,
        reference: summary(resolvedPath)
      });
    }
    const currentBrush = this.captureArrayBrush({
      sourceMode: "selection",
      sourceIds: brush.sourceIds
    });
    if (currentBrush.key !== brush.key) {
      throw new Error(
        "A fonte do pincel mudou durante o desenho; arme a ferramenta novamente."
      );
    }
    return this.#commitSelectionBrush({
      resolvedPath,
      brush,
      draft: validated.draft,
      spacing: validated.spacing
    });
  }

  #arraySourceIds({ sourceIds, excludeIds, hierarchy }) {
    const excluded = new Set(excludeIds.map(String));
    const requested = Array.isArray(sourceIds)
      ? sourceIds
      : this.editor.selection.snapshot().members.map(member => member.objectId);
    const selectedIds = requested
      .map(String)
      .filter(id => hierarchy.has(id) && !excluded.has(id));
    const rootIds = [...hierarchy.canonicalizeSelection(selectedIds)];
    if (!rootIds.length) {
      throw new Error(
        "Selecione ao menos um objeto ou grupo para distribuir no caminho."
      );
    }
    return Object.freeze(rootIds);
  }

  previewArraySelection({
    points,
    sourceIds = null,
    count = 8,
    align = true,
    closed = false,
    curveType = "centripetal",
    tension = 0.5,
    twistDegrees = 0,
    maximumCopies = 256
  } = {}) {
    const requestedCount = integerAtLeast(count, 1, "count");
    const previewCount = Math.min(
      requestedCount,
      integerAtLeast(maximumCopies, 1, "maximumCopies")
    );
    const resolvedPath = pointsPathReference({
      points,
      closed,
      sourceRevision: this.sandbox.revision
    });
    const layout = this.#arrayLayout({
      resolvedPath,
      sourceIds,
      count: previewCount,
      align,
      closed,
      curveType,
      tension,
      twistDegrees,
      includePathObject: true
    });
    const entries = [];
    const renderableIds = new Set();
    for (const rootId of layout.rootIds) {
      for (const objectId of [rootId, ...layout.hierarchy.descendantsOf(rootId)]) {
        const object = layout.hierarchy.node(objectId);
        if (["group", "camera", "light"].includes(object.kind)) continue;
        renderableIds.add(objectId);
      }
    }
    for (const objectId of renderableIds) {
      const object = layout.hierarchy.node(objectId);
      let geometry;
      try {
        geometry = this.resolver.geometryRegistry.describeLegacyObject(object);
      } catch {
        continue;
      }
      const sourceWorld = new THREE.Matrix4().fromArray(
        layout.hierarchy.worldMatrixOf(objectId)
      );
      entries.push(Object.freeze({
        sourceId: objectId,
        sourceName: object.name ?? objectId,
        geometry: Object.freeze(structuredClone(geometry)),
        color: previewColor(
          object,
          this.selectionOperations.appearanceRuntime
        ),
        worldMatrices: Object.freeze(layout.deltaMatrices.map(delta =>
          Object.freeze(delta.clone().multiply(sourceWorld).toArray())
        ))
      }));
    }
    return Object.freeze({
      tool: "array-along-drawn-path-preview",
      requestedCount,
      previewCount,
      truncated: previewCount !== requestedCount,
      sourceIds: layout.rootIds,
      entries: Object.freeze(entries)
    });
  }

  #arraySelectionResolved({
    resolvedPath,
    sourceIds = null,
    count,
    align,
    closed,
    curveType,
    tension,
    twistDegrees,
    includePathObject
  }) {
    const copies = integerAtLeast(count, 1, "count");
    if (copies > 10000) {
      throw new RangeError("A distribuição aceita no máximo 10000 cópias.");
    }
    const layout = this.#arrayLayout({
      resolvedPath,
      sourceIds,
      count: copies,
      align,
      closed,
      curveType,
      tension,
      twistDegrees,
      includePathObject
    });
    const {
      state,
      hierarchy,
      rootIds,
      deltaMatrices
    } = layout;
    const cloned = cloneHierarchySubtrees(state.objects, {
      rootIds,
      copies,
      createId: () => crypto.randomUUID(),
      rename: ({ name, copyIndex }) => `${name ?? "Objeto"} · caminho ${copyIndex}`
    });
    const desired = [];
    cloned.copies.forEach((copy, copyArrayIndex) => {
      const delta = deltaMatrices[copyArrayIndex];
      copy.rootIds.forEach((cloneId, rootIndex) => {
        const sourceId = cloned.sourceRootIds[rootIndex];
        const sourceWorld = new THREE.Matrix4().fromArray(hierarchy.worldMatrixOf(sourceId));
        desired.push({
          id: cloneId,
          worldMatrix: delta.clone().multiply(sourceWorld).toArray()
        });
      });
    });
    const combined = applyWorldTransforms(
      [...state.objects, ...cloned.objects],
      desired
    );
    const cloneIds = new Set(cloned.objects.map(object => object.id));
    const transformedClones = combined.filter(object => cloneIds.has(object.id));
    const changed = this.sandbox.dispatch({
      type: "selection.duplicate",
      source: "path-array",
      sourceIds: cloned.sourceRootIds,
      copyCount: copies,
      pathReference: summary(resolvedPath),
      objects: transformedClones
    });
    if (changed) {
      const lastRoots = cloned.copies.at(-1).rootIds;
      this.editor.selection.replaceMany(lastRoots.map(objectId => ({
        kind: "object",
        regionId: this.selectionOperations.regionId,
        objectId
      })));
    }
    return Object.freeze({
      changed,
      tool: "array-along-reference",
      count: copies,
      sourceIds: Object.freeze(rootIds),
      createdIds: Object.freeze(transformedClones.map(object => object.id)),
      activeIds: Object.freeze([...(cloned.copies.at(-1)?.rootIds ?? [])]),
      reference: summary(resolvedPath)
    });
  }

  #arrayLayout({
    resolvedPath,
    sourceIds,
    count,
    align,
    closed,
    curveType,
    tension,
    twistDegrees,
    includePathObject
  }) {
    const state = this.sandbox.getSnapshot();
    const hierarchy = new HierarchyIndex(state.objects);
    const excluded = includePathObject || !resolvedPath.objectId
      ? []
      : [resolvedPath.objectId];
    const rootIds = this.#arraySourceIds({
      sourceIds,
      excludeIds: excluded,
      hierarchy
    });
    const frames = samplePathFrames({
      points: resolvedPath.points,
      count,
      closed: closed === undefined ? resolvedPath.closed : Boolean(closed),
      curveType,
      tension: finite(tension, "tension"),
      twistDegrees: finite(twistDegrees, "twistDegrees")
    });
    const sourcePivot = average(rootIds.map(id => hierarchy.worldPivotOf(id)));
    const firstFrame = new THREE.Quaternion().fromArray(frames.quaternions[0]);
    const firstFrameInverse = firstFrame.clone().invert();
    const deltaMatrices = frames.positions.map((point, index) => {
      const frame = new THREE.Quaternion().fromArray(frames.quaternions[index]);
      const relativeRotation = align
        ? frame.clone().multiply(firstFrameInverse)
        : new THREE.Quaternion();
      return new THREE.Matrix4()
        .makeTranslation(...point)
        .multiply(new THREE.Matrix4().makeRotationFromQuaternion(relativeRotation))
        .multiply(new THREE.Matrix4().makeTranslation(
          -sourcePivot[0], -sourcePivot[1], -sourcePivot[2]
        ));
    });
    return Object.freeze({
      state,
      hierarchy,
      rootIds,
      frames,
      deltaMatrices: Object.freeze(deltaMatrices)
    });
  }

  #prepareArrayBrushDraft({ brush, layout, previousPlan }) {
    const copies = layout.deltaMatrices.length;
    const reusedPreparedCopies = Math.min(
      layout.diagnostics.reusedCopies,
      brush.sourceMode === "catalog"
        ? previousPlan?.draft?.instances?.length ?? 0
        : previousPlan?.draft?.copies?.length ?? 0
    );
    if (brush.sourceMode === "catalog") {
      const colors = colorsForEntry(
        { colorsByEntry: layout.colorsByEntry },
        brush.entries[0].key
      );
      const previous = previousPlan?.draft?.instances ?? [];
      const instances = layout.deltaMatrices.map((matrix, index) =>
        index < reusedPreparedCopies
          ? previous[index]
          : Object.freeze({
              id: previous[index]?.id ?? crypto.randomUUID(),
              ...matrixTransform(matrix),
              color: colors[index]
            })
      );
      return Object.freeze({
        type: "catalog-instance-draft",
        instances: Object.freeze(instances),
        diagnostics: Object.freeze({
          reusedPreparedCopies,
          preparedCopies: copies - reusedPreparedCopies
        })
      });
    }

    const sourceNodeIds = brush.sourceNodeIds ?? [];
    if (!sourceNodeIds.length) {
      throw new Error("A fonte selecionada não possui uma subárvore válida.");
    }
    if (sourceNodeIds.length * copies > 100000) {
      throw new RangeError(
        "O pincel produziria mais de 100000 nós; aumente o espaçamento."
      );
    }
    const previousCopies = previousPlan?.draft?.copies ?? [];
    const stableCopies = previousCopies.slice(0, reusedPreparedCopies);
    const tailCount = copies - reusedPreparedCopies;
    if (tailCount < 1) {
      return selectionDraft({
        copies: stableCopies,
        reusedPreparedCopies,
        preparedCopies: 0
      });
    }

    const state = this.sandbox.getSnapshot();
    const hierarchy = new HierarchyIndex(state.objects);
    const rootIds = this.#arraySourceIds({
      sourceIds: brush.sourceIds,
      excludeIds: [],
      hierarchy
    });
    const previousIdsByCopy = Array.from(
      { length: tailCount },
      (_, relativeIndex) => {
        const previous =
          previousCopies[reusedPreparedCopies + relativeIndex];
        return new Map((previous?.sourceIds ?? []).map(
          (sourceId, sourceIndex) => [
            sourceId,
            previous.objects[sourceIndex]?.id
          ]
        ));
      }
    );
    const cloned = cloneHierarchySubtrees(state.objects, {
      rootIds,
      copies: tailCount,
      createId: ({ sourceId, copyIndex }) =>
        previousIdsByCopy[copyIndex - 1].get(sourceId) ??
        crypto.randomUUID(),
      rename: ({ name, copyIndex }) =>
        `${name ?? "Objeto"} · pincel ${
          reusedPreparedCopies + copyIndex
        }`
    });
    if (cloned.sourceIds.length !== sourceNodeIds.length ||
        cloned.sourceIds.some((id, index) => id !== sourceNodeIds[index])) {
      throw new Error("A subárvore da fonte mudou durante o desenho.");
    }
    const desired = [];
    cloned.copies.forEach((copy, relativeIndex) => {
      const matrix =
        layout.deltaMatrices[reusedPreparedCopies + relativeIndex];
      copy.rootIds.forEach((cloneId, rootIndex) => {
        const sourceId = cloned.sourceRootIds[rootIndex];
        const sourceWorld = new THREE.Matrix4().fromArray(
          hierarchy.worldMatrixOf(sourceId)
        );
        desired.push({
          id: cloneId,
          worldMatrix: matrix.clone().multiply(sourceWorld).toArray()
        });
      });
    });
    const combined = applyWorldTransforms(
      [...state.objects, ...cloned.objects],
      desired
    );
    const transformedById = new Map(
      combined.map(object => [object.id, object])
    );
    const colorsBySourceId = brushColorsBySourceId(
      brush,
      layout.colorsByEntry
    );
    const preparedTail = cloned.copies.map((copy, relativeIndex) => {
      const copyIndex = reusedPreparedCopies + relativeIndex;
      const objects = copy.objects.map((object, sourceIndex) => {
        const transformed = transformedById.get(object.id);
        const sourceId = cloned.sourceIds[sourceIndex];
        const color = colorsBySourceId.get(sourceId)?.[copyIndex];
        if (!color) return transformed;
        return Object.freeze({
          ...structuredClone(transformed),
          instanceState: Object.freeze({
            ...(transformed.instanceState ?? {}),
            color
          })
        });
      });
      return Object.freeze({
        copyIndex: copyIndex + 1,
        rootIds: copy.rootIds,
        sourceIds: cloned.sourceIds,
        objects: Object.freeze(objects)
      });
    });
    return selectionDraft({
      copies: [...stableCopies, ...preparedTail],
      reusedPreparedCopies,
      preparedCopies: tailCount
    });
  }

  #arrayBrushLayout({
    resolvedPath,
    brush,
    spacing,
    align,
    closed,
    curveType,
    tension,
    twistDegrees,
    initialNormal,
    orientationMode,
    affineModifier,
    colorModifier,
    affineULength,
    previousPlan,
    preserveStablePrefix,
    maximumCopies
  }) {
    if (!brush || !Array.isArray(brush.pivot) || brush.pivot.length !== 3 ||
        !Array.isArray(brush.referenceRotation) ||
        brush.referenceRotation.length !== 4) {
      throw new TypeError("Fonte do pincel inválida.");
    }
    const resolvedSpacing = positive(spacing, "spacing");
    const maximumSamples = integerAtLeast(
      maximumCopies,
      1,
      "maximumCopies"
    );
    const resolvedClosed = closed === undefined
      ? resolvedPath.closed
      : Boolean(closed);
    const resolvedTension = finite(tension, "tension");
    const resolvedInitialNormal =
      initialNormal === null || initialNormal === undefined
        ? null
        : vector3(initialNormal, "initialNormal");
    const resolvedTwist = finite(twistDegrees, "twistDegrees");
    const mode = normalizeBrushOrientationMode(orientationMode);
    const modifier = affineModifier ??
      this.compileArrayBrushModifier();
    const color = colorModifier ??
      this.compileArrayBrushColorModifier();
    const uLength = positive(affineULength, "affineULength");
    const key = arrayBrushLayoutKey({
      brush,
      spacing,
      align,
      closed,
      curveType,
      tension,
      twistDegrees,
      initialNormal,
      orientationMode: mode,
      affineModifier: modifier,
      colorModifier: color,
      affineULength: uLength
    });
    const mutableTailCopies = arrayBrushMutableTailCopies(curveType);
    const compatiblePlan = preserveStablePrefix &&
      isCompatibleArrayBrushPlan(previousPlan, {
        key,
        resolvedPath
      })
        ? previousPlan
        : null;
    const requestedReuse = compatiblePlan
      ? Math.max(0, compatiblePlan.previewCount - mutableTailCopies)
      : 0;
    let frames;
    let reusable = null;
    let reusedCopies = 0;
    let evaluatedFrameSamples = 0;
    let frameSampling = "full";
    if (requestedReuse > 0 &&
        !resolvedClosed &&
        Math.abs(resolvedTwist) <= 1e-14) {
      const tail = samplePathFrameTailBySpacing({
        points: resolvedPath.points,
        spacing: resolvedSpacing,
        maximumSamples,
        startIndex: requestedReuse,
        previousFrame: compatiblePlan.samples[requestedReuse - 1],
        closed: false,
        curveType,
        tension: resolvedTension,
        initialNormal: resolvedInitialNormal,
        twistDegrees: 0
      });
      if (tail.startIndex === requestedReuse &&
          canReuseArrayBrushPlan(compatiblePlan, {
            key,
            resolvedPath,
            requestedCount: tail.requestedCount
          })) {
        reusable = compatiblePlan;
        reusedCopies = requestedReuse;
        frames = mergeIncrementalPathFrames({
          plan: compatiblePlan,
          tail,
          reusedCopies
        });
        evaluatedFrameSamples = tail.evaluatedCount;
        frameSampling = "tail";
      }
    }
    if (!frames) {
      frames = samplePathFramesBySpacing({
        points: resolvedPath.points,
        spacing: resolvedSpacing,
        maximumSamples,
        closed: resolvedClosed,
        curveType,
        tension: resolvedTension,
        initialNormal: resolvedInitialNormal,
        twistDegrees: resolvedTwist
      });
      reusable = compatiblePlan &&
        canReuseArrayBrushPlan(compatiblePlan, {
          key,
          resolvedPath,
          requestedCount: frames.requestedCount
        })
          ? compatiblePlan
          : null;
      reusedCopies = reusable
        ? Math.min(requestedReuse, frames.positions.length)
        : 0;
      evaluatedFrameSamples = frames.positions.length;
    }
    const pathOrientations = frames.quaternions.map(value =>
      new THREE.Quaternion().fromArray(value)
    );
    const orientations = mode === "plane"
      ? frames.positions.map((_, index) =>
          planeFrameQuaternion({
            tangent: frames.tangents[index],
            normal: frames.normals[index]
          })
        )
      : pathOrientations;
    const firstOrientation = orientations[0];
    const baseInverse = reusable?.baseInverse
      ? new THREE.Quaternion().fromArray(reusable.baseInverse)
      : mode === "preserve"
        ? pathOrientations[0].clone().invert()
        : new THREE.Quaternion()
            .fromArray(brush.referenceRotation)
            .normalize()
            .invert();
    const contextCount = frames.requestedCount;
    const previousColors = new Map(
      (reusable?.colorsByEntry ?? []).map(entry => [
        entry.key,
        entry.colors
      ])
    );
    const colorsByEntry = new Map(brush.entries.map(entry => [
      entry.key,
      []
    ]));
    const deltaMatrices = [];
    const samples = [];
    for (let index = 0; index < frames.positions.length; index += 1) {
      if (index < reusedCopies) {
        deltaMatrices.push(
          new THREE.Matrix4().fromArray(reusable.deltaMatrices[index])
        );
        samples.push(structuredClone(reusable.samples[index]));
        for (const entry of brush.entries) {
          colorsByEntry.get(entry.key).push(
            previousColors.get(entry.key)?.[index] ?? entry.color
          );
        }
        continue;
      }
      const point = frames.positions[index];
      const orientation = align
        ? orientations[index]
        : firstOrientation;
      const variables = pathBrushVariables({ frames, index });
      const progress = variables.distance / uLength;
      const evaluated = modifier.identity
        ? identityPathBrushEvaluation({
            index: index + 1,
            count: contextCount,
            progress,
            point,
            variables
          })
        : evaluatePathBrushAffineModifier(modifier, {
            index: index + 1,
            count: contextCount,
            progress,
            position: point,
            rotation: orientation.toArray(),
            variables
          });
      const matrix = new THREE.Matrix4()
        .makeTranslation(...point)
        .multiply(
          new THREE.Matrix4().makeRotationFromQuaternion(orientation)
        );
      matrix.multiply(new THREE.Matrix4().fromArray(evaluated.matrix));
      matrix
        .multiply(
          new THREE.Matrix4().makeRotationFromQuaternion(baseInverse)
        )
        .multiply(new THREE.Matrix4().makeTranslation(
          -brush.pivot[0],
          -brush.pivot[1],
          -brush.pivot[2]
        ));
      deltaMatrices.push(matrix);
      const colorContext = {
        ...evaluated.context,
        position: point,
        rotation: orientation.toArray(),
        scale: [evaluated.scale, evaluated.scale, evaluated.scale]
      };
      for (const entry of brush.entries) {
        colorsByEntry.get(entry.key).push(
          evaluatePathBrushColorModifier(color, {
            context: colorContext,
            sourceColor: entry.color,
            invert: evaluated.invertColor
          })
        );
      }
      samples.push({
        index: index + 1,
        u: progress,
        distance: variables.distance,
        curvature: variables.curvature,
        position: [...point],
        tangent: [...frames.tangents[index]],
        normal: [...frames.normals[index]],
        binormal: [...frames.binormals[index]],
        signedScale: evaluated.signedScale,
        scale: evaluated.scale,
        invertColor: evaluated.invertColor,
        clampedAtZero: evaluated.clampedAtZero
      });
    }
    return Object.freeze({
      key,
      brush,
      frames,
      orientationMode: mode,
      affineModifier: modifier,
      colorModifier: color,
      baseInverse: Object.freeze(baseInverse.toArray()),
      deltaMatrices: Object.freeze(deltaMatrices),
      colorsByEntry: Object.freeze(
        [...colorsByEntry].map(([entryKey, colors]) => Object.freeze({
          key: entryKey,
          colors: Object.freeze(colors)
        }))
      ),
      samples: Object.freeze(samples.map(sample => Object.freeze({
        ...sample,
        position: Object.freeze(sample.position),
        tangent: Object.freeze(sample.tangent),
        normal: Object.freeze(sample.normal),
        binormal: Object.freeze(sample.binormal)
      }))),
      diagnostics: Object.freeze({
        frameSamples: frames.positions.length,
        evaluatedFrameSamples,
        reusedFrameSamples: reusedCopies,
        frameSampling,
        reusedCopies,
        evaluatedCopies: frames.positions.length - reusedCopies,
        mutableTailCopies,
        stableCopies: Math.max(
          0,
          frames.positions.length - mutableTailCopies
        ),
        incremental: Boolean(reusable)
      })
    });
  }

  #commitSelectionBrush({
    resolvedPath,
    brush,
    draft,
    spacing
  }) {
    if (draft?.type !== "selection-subtree-draft" ||
        !Array.isArray(draft.copies) ||
        !Array.isArray(draft.objects) ||
        draft.copies.length < 1) {
      throw new TypeError("Rascunho incremental da seleção inválido.");
    }
    const copies = draft.copies.length;
    const rootIds = brush.sourceIds;
    const changed = this.sandbox.dispatch({
      type: "selection.duplicate",
      source: "path-brush-selection",
      sourceIds: rootIds,
      copyCount: copies,
      spacing,
      pathReference: summary(resolvedPath),
      objects: draft.objects
    });
    if (changed) {
      const lastRoots = draft.copies.at(-1).rootIds;
      this.editor.selection.replaceMany(lastRoots.map(objectId => ({
        kind: "object",
        regionId: this.selectionOperations.regionId,
        objectId
      })));
    }
    return Object.freeze({
      changed,
      tool: "array-brush-along-drawn-path",
      sourceMode: "selection",
      incrementalPlan: true,
      spacing,
      count: copies,
      sourceIds: Object.freeze(rootIds),
      createdIds: Object.freeze(draft.objects.map(object => object.id)),
      activeIds: Object.freeze([
        ...(draft.copies.at(-1)?.rootIds ?? [])
      ]),
      reference: summary(resolvedPath)
    });
  }

  #assertCanMutate(action) {
    this.requireObjectMode(action);
  }
}

function summary(reference) {
  return Object.freeze({
    kind: reference.kind,
    objectId: reference.objectId,
    objectName: reference.objectName,
    extraction: reference.extraction,
    pointCount: reference.points?.length ?? 1,
    closed: Boolean(reference.closed),
    sourceRevision: reference.sourceRevision
  });
}

function pointsPathReference({ points, closed, sourceRevision }) {
  const normalized = normalizePointList(points, 2, "caminho desenhado");
  return Object.freeze({
    kind: "path",
    objectId: null,
    objectName: "Traço desenhado",
    extraction: "drawn-points",
    points: Object.freeze(
      normalized.map(point => Object.freeze([...point]))
    ),
    closed: Boolean(closed),
    sourceRevision,
    source: Object.freeze({ type: "drawn-points" })
  });
}

function previewColor(object, appearanceRuntime = null) {
  let projected = object;
  if (object.appearanceId && appearanceRuntime?.projectObject) {
    try {
      projected = appearanceRuntime.projectObject(object);
    } catch {
      projected = object;
    }
  }
  const candidate =
    object.instanceState?.color ??
    projected.material?.color ??
    projected.color ??
    "#70c8ff";
  return /^#[0-9a-f]{6}$/i.test(String(candidate))
    ? String(candidate)
    : "#70c8ff";
}

function defaultGeometryDescriptor(registry, geometryType) {
  const type = String(geometryType ?? "box").toLowerCase();
  const description = registry.describe().find(entry => entry.type === type);
  if (!description) {
    throw new Error(`Geometria não registrada para o pincel: ${type}.`);
  }
  return registry.normalize(Object.fromEntries([
    ["type", type],
    ...description.parameters.map(parameter => [
      parameter.id,
      structuredClone(parameter.default)
    ])
  ]));
}

function geometryBounds(registry, descriptor, worldMatrix) {
  const geometry = registry.create(descriptor);
  try {
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    if (!geometry.boundingBox) return new THREE.Box3();
    return geometry.boundingBox.clone().applyMatrix4(worldMatrix);
  } finally {
    geometry.dispose();
  }
}

function boundsSpacing(bounds) {
  if (!bounds || bounds.isEmpty()) return 0.1;
  const size = bounds.getSize(new THREE.Vector3());
  return Math.max(0.01, size.x, size.y, size.z);
}

function colorValue(value) {
  const color = String(value ?? "#6699cc");
  if (!/^#[0-9a-f]{6}$/i.test(color)) {
    throw new TypeError("A cor do pincel deve usar a forma #rrggbb.");
  }
  return color.toLowerCase();
}

function average(points) {
  const sum = points.reduce((accumulator, point) => [
    accumulator[0] + point[0],
    accumulator[1] + point[1],
    accumulator[2] + point[2]
  ], [0, 0, 0]);
  return sum.map(value => value / points.length);
}

function worldRotation(matrix) {
  const rotation = new THREE.Quaternion();
  new THREE.Matrix4().fromArray(matrix).decompose(
    new THREE.Vector3(),
    rotation,
    new THREE.Vector3()
  );
  return Object.freeze(rotation.normalize().toArray());
}

function normalizeBrushOrientationMode(value) {
  const mode = String(value ?? "preserve").toLowerCase();
  if (!["preserve", "plane", "path"].includes(mode)) {
    throw new RangeError(
      "A orientação do pincel deve ser preserve, plane ou path."
    );
  }
  return mode;
}

function planeFrameQuaternion({ tangent, normal }) {
  const xAxis = new THREE.Vector3().fromArray(
    vector3(tangent, "tangent")
  ).normalize();
  const zAxis = new THREE.Vector3().fromArray(
    vector3(normal, "normal")
  );
  zAxis.addScaledVector(xAxis, -zAxis.dot(xAxis));
  if (zAxis.lengthSq() <= 1e-18) {
    throw new Error(
      "Não foi possível orientar a geometria no plano do caminho."
    );
  }
  zAxis.normalize();
  const yAxis = new THREE.Vector3()
    .crossVectors(zAxis, xAxis)
    .normalize();
  zAxis.crossVectors(xAxis, yAxis).normalize();
  return new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis)
  );
}

function pathBrushVariables({ frames, index }) {
  const tangent = frames.tangents[index];
  const normal = frames.normals[index];
  const binormal = frames.binormals[index];
  const distance = Math.min(
    frames.length,
    index * frames.spacing
  );
  const curvature = frameCurvature(frames, index);
  return Object.freeze({
    d: distance,
    distance,
    length: frames.length,
    pathLength: frames.length,
    spacing: frames.spacing,
    k: curvature,
    curvature,
    tx: tangent[0],
    ty: tangent[1],
    tz: tangent[2],
    nx: normal[0],
    ny: normal[1],
    nz: normal[2],
    bx: binormal[0],
    by: binormal[1],
    bz: binormal[2]
  });
}

function frameCurvature(frames, index) {
  if (frames.tangents.length < 2) return 0;
  const leftIndex = Math.max(0, index - 1);
  const rightIndex = Math.min(frames.tangents.length - 1, index + 1);
  if (leftIndex === rightIndex) return 0;
  const left = new THREE.Vector3().fromArray(frames.tangents[leftIndex]);
  const right = new THREE.Vector3().fromArray(frames.tangents[rightIndex]);
  const angle = Math.acos(
    THREE.MathUtils.clamp(left.dot(right), -1, 1)
  );
  const distance = Math.max(
    1e-12,
    (rightIndex - leftIndex) * frames.spacing
  );
  return angle / distance;
}

function identityPathBrushEvaluation({
  index,
  count,
  progress,
  point,
  variables
}) {
  return Object.freeze({
    matrix: Object.freeze(new THREE.Matrix4().toArray()),
    context: Object.freeze({
      ...variables,
      i: index,
      index,
      count,
      u: progress,
      x: point[0],
      y: point[1],
      z: point[2]
    }),
    move: Object.freeze([0, 0, 0]),
    rotate: Object.freeze([0, 0, 0]),
    scale: 1,
    signedScale: 1,
    invertColor: false,
    clampedAtZero: false
  });
}

function arrayBrushLayoutKey({
  brush,
  spacing,
  align,
  closed,
  curveType,
  tension,
  twistDegrees,
  initialNormal,
  orientationMode,
  affineModifier,
  colorModifier,
  affineULength
}) {
  return JSON.stringify([
    brush.key,
    positive(spacing, "spacing"),
    Boolean(align),
    Boolean(closed),
    String(curveType),
    finite(tension, "tension"),
    finite(twistDegrees, "twistDegrees"),
    initialNormal === null || initialNormal === undefined
      ? null
      : vector3(initialNormal, "initialNormal"),
    orientationMode,
    affineModifier?.program?.astHash ?? null,
    colorModifier?.source ?? null,
    positive(affineULength, "affineULength")
  ]);
}

function canReuseArrayBrushPlan(plan, {
  key,
  resolvedPath,
  requestedCount
}) {
  if (!isCompatibleArrayBrushPlan(plan, { key, resolvedPath })) {
    return false;
  }
  return requestedCount >= Math.max(
    1,
    plan.previewCount - arrayBrushMutableTailCopies(
      resolvedPath.curveType ?? plan.path.curveType
    )
  );
}

function isCompatibleArrayBrushPlan(plan, {
  key,
  resolvedPath
}) {
  if (plan?.type !== ARRAY_BRUSH_PLAN_TYPE ||
      plan?.version !== ARRAY_BRUSH_PLAN_VERSION ||
      plan.key !== key ||
      plan.sourceRevision !== resolvedPath.sourceRevision ||
      !Array.isArray(plan.path?.points) ||
      !Array.isArray(plan.deltaMatrices) ||
      !Array.isArray(plan.samples)) {
    return false;
  }
  const previousFirst = plan.path.points[0];
  const nextFirst = resolvedPath.points[0];
  if (!previousFirst || !nextFirst ||
      Math.hypot(
        previousFirst[0] - nextFirst[0],
        previousFirst[1] - nextFirst[1],
        previousFirst[2] - nextFirst[2]
      ) > 1e-7) {
    return false;
  }
  return true;
}

function mergeIncrementalPathFrames({
  plan,
  tail,
  reusedCopies
}) {
  const prefix = plan.samples.slice(0, reusedCopies);
  if (prefix.length !== reusedCopies ||
      tail.startIndex !== reusedCopies ||
      reusedCopies + tail.positions.length !== tail.sampleCount) {
    throw new Error("A cauda incremental não corresponde ao plano anterior.");
  }
  return Object.freeze({
    ...tail,
    positions: Object.freeze([
      ...prefix.map(sample => sample.position),
      ...tail.positions
    ]),
    tangents: Object.freeze([
      ...prefix.map(sample => sample.tangent),
      ...tail.tangents
    ]),
    normals: Object.freeze([
      ...prefix.map(sample => sample.normal),
      ...tail.normals
    ]),
    binormals: Object.freeze([
      ...prefix.map(sample => sample.binormal),
      ...tail.binormals
    ]),
    quaternions: Object.freeze([
      ...prefix.map(sampleQuaternion),
      ...tail.quaternions
    ])
  });
}

function sampleQuaternion(sample) {
  const tangent = new THREE.Vector3().fromArray(sample.tangent);
  const normal = new THREE.Vector3().fromArray(sample.normal);
  const binormal = new THREE.Vector3().fromArray(sample.binormal);
  return Object.freeze(
    new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(normal, binormal, tangent)
    ).toArray()
  );
}

function arrayBrushMutableTailCopies(curveType) {
  const type = String(curveType ?? "centripetal").toLowerCase();
  if (type === "polyline") return 2;
  if (type === "bezier") return 6;
  return 4;
}

function validateArrayBrushPlan(plan, brush, { issued = false } = {}) {
  if (plan?.type !== ARRAY_BRUSH_PLAN_TYPE ||
      plan?.version !== ARRAY_BRUSH_PLAN_VERSION) {
    throw new TypeError("Plano incremental do pincel inválido.");
  }
  if (!issued || !Object.isFrozen(plan)) {
    throw new Error(
      "O plano do pincel não foi emitido por este serviço."
    );
  }
  if (!brush?.key || plan.brushKey !== brush.key) {
    throw new Error("O plano não pertence à fonte atual do pincel.");
  }
  if (!Array.isArray(plan.deltaMatrices) ||
      plan.deltaMatrices.length < 1 ||
      plan.deltaMatrices.length > 10000) {
    throw new RangeError(
      "O plano do pincel exige entre 1 e 10000 matrizes."
    );
  }
  if (!Array.isArray(plan.path?.points) ||
      plan.path.points.length < 2 ||
      !Array.isArray(plan.colorsByEntry)) {
    throw new TypeError("Conteúdo do plano incremental inválido.");
  }
  for (const entry of brush.entries ?? []) {
    const colors = colorsForEntry(plan, entry.key);
    if (colors.length !== plan.deltaMatrices.length) {
      throw new Error(
        `Cores incompletas no lote do pincel: ${entry.key}.`
      );
    }
  }
  if (brush.sourceMode === "catalog") {
    if (plan.draft?.type !== "catalog-instance-draft" ||
        plan.draft.instances?.length !== plan.deltaMatrices.length) {
      throw new Error("Rascunho incremental do catálogo incompleto.");
    }
  } else if (plan.draft?.type !== "selection-subtree-draft" ||
      plan.draft.copies?.length !== plan.deltaMatrices.length ||
      !Array.isArray(plan.draft.objects)) {
    throw new Error("Rascunho incremental da seleção incompleto.");
  }
  return plan;
}

function colorsForEntry(plan, entryKey) {
  const entry = plan.colorsByEntry.find(candidate =>
    candidate.key === entryKey
  );
  if (!entry || !Array.isArray(entry.colors)) {
    throw new Error(`Lote de cor ausente no plano: ${entryKey}.`);
  }
  return entry.colors;
}

function matrixTransform(matrix) {
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  matrix.decompose(position, rotation, scale);
  const values = [
    ...position.toArray(),
    ...rotation.toArray(),
    ...scale.toArray()
  ];
  if (!values.every(Number.isFinite)) {
    throw new TypeError("Transformação incremental do pincel inválida.");
  }
  return Object.freeze({
    position: Object.freeze(position.toArray()),
    rotation: Object.freeze(rotation.normalize().toArray()),
    scale: Object.freeze(scale.toArray())
  });
}

function brushColorsBySourceId(brush, colorsByEntry) {
  const result = new Map();
  for (const entry of brush.entries) {
    const colors = colorsForEntry({ colorsByEntry }, entry.key);
    for (const sourceId of entry.sourceIds ?? []) {
      if (sourceId !== null) result.set(sourceId, colors);
    }
  }
  return result;
}

function selectionDraft({
  copies,
  reusedPreparedCopies,
  preparedCopies
}) {
  const frozenCopies = Object.freeze([...copies]);
  return Object.freeze({
    type: "selection-subtree-draft",
    copies: frozenCopies,
    objects: Object.freeze(
      frozenCopies.flatMap(copy => copy.objects)
    ),
    diagnostics: Object.freeze({
      reusedPreparedCopies,
      preparedCopies
    })
  });
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function vector3(value, name) {
  if (!Array.isArray(value) || value.length !== 3) {
    throw new TypeError(`${name} deve conter x, y e z.`);
  }
  const result = value.map(Number);
  if (!result.every(Number.isFinite)) {
    throw new TypeError(`${name} inválido.`);
  }
  return result;
}

function positive(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    throw new RangeError(`${name} deve ser positivo.`);
  }
  return number;
}

function nonZero(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number) || Math.abs(number) < 1e-12) {
    throw new RangeError(`${name} deve ser finito e diferente de zero.`);
  }
  return number;
}

function finite(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new TypeError(`${name} inválido.`);
  return number;
}

function integerAtLeast(value, minimum, name) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < minimum) {
    throw new RangeError(`${name} deve ser inteiro maior ou igual a ${minimum}.`);
  }
  return number;
}

function restoreSelection(selection, snapshot) {
  if (!snapshot?.members?.length) {
    selection.clear();
    return;
  }
  selection.replaceMany(snapshot.members.map(member => ({ ...member })));
}

function catmullRomToBezierControls(points, tension = 0.5) {
  const source = points.map(point => new THREE.Vector3().fromArray(point));
  if (source.length < 2) throw new Error("O caminho exige ao menos dois pontos.");
  const controls = [source[0].toArray()];
  for (let index = 0; index < source.length - 1; index += 1) {
    const p0 = source[Math.max(0, index - 1)];
    const p1 = source[index];
    const p2 = source[index + 1];
    const p3 = source[Math.min(source.length - 1, index + 2)];
    const tangent1 = p2.clone().sub(p0).multiplyScalar(tension / 3);
    const tangent2 = p3.clone().sub(p1).multiplyScalar(tension / 3);
    controls.push(
      p1.clone().add(tangent1).toArray(),
      p2.clone().sub(tangent2).toArray(),
      p2.toArray()
    );
  }
  return controls;
}

function ensureTubePoints(points) {
  if (points.length !== 2) return points;
  const [left, right] = points;
  return [
    left,
    [
      (left[0] + right[0]) * 0.5,
      (left[1] + right[1]) * 0.5,
      (left[2] + right[2]) * 0.5
    ],
    right
  ];
}
