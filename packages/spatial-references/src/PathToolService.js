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
  samplePathFramesBySpacing
} from "./PathFrames.js?build=20260728-0039e";

export class PathToolService {
  static apiVersion = "path-tool-service-v2";

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

  listReferences() {
    return this.resolver.listObjects();
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
    twistDegrees = 0
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
      return this.arrayBrushAlongPoints({
        points,
        brush: captured,
        spacing,
        align,
        closed,
        curveType,
        tension,
        twistDegrees
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
      const descriptor = geometry
        ? this.resolver.geometryRegistry.normalize(geometry)
        : defaultGeometryDescriptor(
            this.resolver.geometryRegistry,
            geometryType
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
        sourceGeometry: descriptor,
        sourceColor: normalizedColor,
        sourceName: this.resolver.geometryRegistry.label(descriptor.type),
        pivot: Object.freeze([0, 0, 0]),
        autoSpacing: boundsSpacing(bounds),
        renderableCount: 1,
        entries: Object.freeze([Object.freeze({
          key,
          geometry: descriptor,
          color: normalizedColor,
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
          sourceWorldMatrices: []
        };
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
      sourceWorldMatrices: Object.freeze(entry.sourceWorldMatrices)
    }));
    const pivot = average(rootIds.map(id => hierarchy.worldPivotOf(id)));
    const key = JSON.stringify([
      "selection",
      rootIds,
      pivot,
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
      sourceGeometry: null,
      sourceColor: null,
      sourceName: rootIds.length === 1
        ? hierarchy.node(rootIds[0]).name ?? rootIds[0]
        : `${rootIds.length} raízes selecionadas`,
      pivot: Object.freeze(pivot),
      autoSpacing: boundsSpacing(bounds),
      renderableCount,
      entries: Object.freeze(entries)
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

  previewArrayBrush({
    points,
    brush,
    spacing,
    align = true,
    closed = false,
    curveType = "centripetal",
    tension = 0.5,
    twistDegrees = 0,
    maximumCopies = 4096
  } = {}) {
    const resolvedPath = pointsPathReference({
      points,
      closed,
      sourceRevision: this.sandbox.revision
    });
    const layout = this.#arrayBrushLayout({
      resolvedPath,
      brush,
      spacing,
      align,
      closed,
      curveType,
      tension,
      twistDegrees,
      maximumCopies
    });
    return Object.freeze({
      tool: "array-brush-preview",
      spacing: layout.frames.spacing,
      requestedCount: layout.frames.requestedCount,
      previewCount: layout.deltaMatrices.length,
      truncated: layout.frames.truncated,
      deltaMatrices: Object.freeze(layout.deltaMatrices.map(matrix =>
        Object.freeze(matrix.toArray())
      ))
    });
  }

  arrayBrushAlongPoints({
    points,
    brush,
    spacing,
    align = true,
    closed = false,
    curveType = "centripetal",
    tension = 0.5,
    twistDegrees = 0
  } = {}) {
    this.#assertCanMutate("distribuir um pincel no caminho desenhado");
    const resolvedPath = pointsPathReference({
      points,
      closed,
      sourceRevision: this.sandbox.revision
    });
    const layout = this.#arrayBrushLayout({
      resolvedPath,
      brush,
      spacing,
      align,
      closed,
      curveType,
      tension,
      twistDegrees,
      maximumCopies: 10001
    });
    if (layout.frames.requestedCount > 10000) {
      throw new RangeError(
        "O traço produziria mais de 10000 instâncias; aumente o espaçamento."
      );
    }
    if (brush.sourceMode === "catalog") {
      const result = this.selectionOperations.createGeometryInstances({
        name: `${brush.sourceName} · pincel`,
        geometry: brush.sourceGeometry,
        worldMatrices: layout.deltaMatrices.map(matrix => matrix.toArray()),
        color: brush.sourceColor,
        source: "path-brush-catalog"
      });
      return Object.freeze({
        ...result,
        tool: "array-brush-along-drawn-path",
        sourceMode: "catalog",
        spacing: layout.frames.spacing,
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
      deltaMatrices: layout.deltaMatrices,
      spacing: layout.frames.spacing
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

  #arrayBrushLayout({
    resolvedPath,
    brush,
    spacing,
    align,
    closed,
    curveType,
    tension,
    twistDegrees,
    maximumCopies
  }) {
    if (!brush || !Array.isArray(brush.pivot) || brush.pivot.length !== 3) {
      throw new TypeError("Fonte do pincel inválida.");
    }
    const frames = samplePathFramesBySpacing({
      points: resolvedPath.points,
      spacing: positive(spacing, "spacing"),
      maximumSamples: integerAtLeast(
        maximumCopies,
        1,
        "maximumCopies"
      ),
      closed: closed === undefined ? resolvedPath.closed : Boolean(closed),
      curveType,
      tension: finite(tension, "tension"),
      twistDegrees: finite(twistDegrees, "twistDegrees")
    });
    const firstFrame = new THREE.Quaternion().fromArray(
      frames.quaternions[0]
    );
    const firstFrameInverse = firstFrame.clone().invert();
    const deltaMatrices = frames.positions.map((point, index) => {
      const frame = new THREE.Quaternion().fromArray(
        frames.quaternions[index]
      );
      const relativeRotation = align
        ? frame.clone().multiply(firstFrameInverse)
        : new THREE.Quaternion();
      return new THREE.Matrix4()
        .makeTranslation(...point)
        .multiply(
          new THREE.Matrix4().makeRotationFromQuaternion(relativeRotation)
        )
        .multiply(new THREE.Matrix4().makeTranslation(
          -brush.pivot[0],
          -brush.pivot[1],
          -brush.pivot[2]
        ));
    });
    return Object.freeze({
      brush,
      frames,
      deltaMatrices: Object.freeze(deltaMatrices)
    });
  }

  #commitSelectionBrush({
    resolvedPath,
    brush,
    deltaMatrices,
    spacing
  }) {
    const copies = deltaMatrices.length;
    const state = this.sandbox.getSnapshot();
    const hierarchy = new HierarchyIndex(state.objects);
    const rootIds = this.#arraySourceIds({
      sourceIds: brush.sourceIds,
      excludeIds: [],
      hierarchy
    });
    const cloned = cloneHierarchySubtrees(state.objects, {
      rootIds,
      copies,
      createId: () => crypto.randomUUID(),
      rename: ({ name, copyIndex }) =>
        `${name ?? "Objeto"} · pincel ${copyIndex}`
    });
    const desired = [];
    cloned.copies.forEach((copy, copyArrayIndex) => {
      const delta = deltaMatrices[copyArrayIndex];
      copy.rootIds.forEach((cloneId, rootIndex) => {
        const sourceId = cloned.sourceRootIds[rootIndex];
        const sourceWorld = new THREE.Matrix4().fromArray(
          hierarchy.worldMatrixOf(sourceId)
        );
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
    const transformedClones = combined.filter(object =>
      cloneIds.has(object.id)
    );
    const changed = this.sandbox.dispatch({
      type: "selection.duplicate",
      source: "path-brush-selection",
      sourceIds: cloned.sourceRootIds,
      copyCount: copies,
      spacing,
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
      tool: "array-brush-along-drawn-path",
      sourceMode: "selection",
      spacing,
      count: copies,
      sourceIds: Object.freeze(rootIds),
      createdIds: Object.freeze(
        transformedClones.map(object => object.id)
      ),
      activeIds: Object.freeze([
        ...(cloned.copies.at(-1)?.rootIds ?? [])
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
