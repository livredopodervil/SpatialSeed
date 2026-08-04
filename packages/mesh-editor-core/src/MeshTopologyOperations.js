const EPSILON = 1e-9;

export const MESH_COMPONENT_MODES = Object.freeze(["vertex", "edge", "face"]);

export function normalizeMeshComponentMode(value) {
  const mode = String(value ?? "vertex").trim().toLowerCase();
  if (!MESH_COMPONENT_MODES.includes(mode)) {
    throw new RangeError(`Modo de componente desconhecido: ${value}.`);
  }
  return mode;
}

export function applyMeshTopologyOperation({
  descriptor,
  topology,
  componentMode = "vertex",
  selectedIndices = [],
  activeIndex = null,
  operation,
  options = {}
} = {}) {
  const mode = normalizeMeshComponentMode(componentMode);
  const op = String(operation ?? "").trim().toLowerCase();
  if (!op) throw new Error("Operação topológica ausente.");
  const mesh = mutableMesh(descriptor);
  const beforeTopology = topology ?? topologyOf(mesh);
  const selected = normalizeSelection(selectedIndices, componentCount(beforeTopology, mode));
  enforceBoundaryPolicy({ topology: beforeTopology, mode, selected, operation: op, options });
  let result;

  switch (op) {
    case "create-vertex":
      result = createVertex(mesh, options);
      break;
    case "create-edge":
      result = createEdge(mesh, selected, mode, beforeTopology, options);
      break;
    case "create-face":
    case "fill":
      result = createFace(mesh, selected, mode, beforeTopology, options);
      break;
    case "duplicate":
      result = duplicateComponents(mesh, selected, mode, beforeTopology, options);
      break;
    case "delete":
      result = deleteComponents(mesh, selected, mode, beforeTopology, options);
      break;
    case "extrude":
      result = extrudeComponents(mesh, selected, mode, beforeTopology, options);
      break;
    case "inset":
      result = insetFaces(mesh, selected, mode, beforeTopology, options);
      break;
    case "subdivide":
      result = subdivideComponents(mesh, selected, mode, beforeTopology, options);
      break;
    case "split":
      result = splitEdges(mesh, selected, mode, beforeTopology, options);
      break;
    case "collapse":
      result = collapseEdges(mesh, selected, mode, beforeTopology, options);
      break;
    case "flip-edge":
      result = flipEdges(mesh, selected, mode, beforeTopology, options);
      break;
    case "flip-normal":
      result = flipFaceNormals(mesh, selected, mode, beforeTopology);
      break;
    case "bridge":
      result = bridgeBoundaryLoops(mesh, selected, mode, beforeTopology, options);
      break;
    case "cleanup":
      result = {
        mesh,
        selectionMode: mode,
        selectionVertices: componentVertices(beforeTopology, mode, selected),
        label: "Limpar malha"
      };
      break;
    case "weld":
      result = weldVertices(mesh, selected, mode, beforeTopology, {
        ...options,
        activeIndex
      });
      break;
    case "recalculate-normals":
      result = {
        mesh: { ...mesh, normals: [] },
        selectionVertices: componentVertices(beforeTopology, mode, selected),
        selectionFaceKeys: mode === "face" ? selected.map(index => faceKey(beforeTopology.triangles[index])) : [],
        label: "Recalcular normais"
      };
      break;
    default:
      throw new RangeError(`Operação topológica desconhecida: ${operation}.`);
  }

  const finalized = finalizeMesh(result.mesh, {
    removeUnused: op === "cleanup" || (options.removeUnused !== false && op !== "create-vertex"),
    preserveLooseVertices: ["create-vertex", "duplicate", "collapse", "weld"].includes(op) && op !== "cleanup",
    preserveNormals: op === "cleanup"
  });
  const afterTopology = topologyOf(finalized);
  validateTopology(afterTopology, {
    manifoldOnly: options.manifoldOnly !== false,
    allowBoundary: options.allowBoundary !== false
  });
  const selection = resolveSelection({
    topology: afterTopology,
    preferredMode: result.selectionMode ?? mode,
    vertexIndices: result.selectionVertices ?? [],
    edgeKeys: result.selectionEdgeKeys ?? [],
    faceKeys: result.selectionFaceKeys ?? [],
    vertexPoints: result.selectionPoints ?? []
  });

  return Object.freeze({
    descriptor: freezeDescriptor(finalized),
    topology: afterTopology,
    selection: Object.freeze({
      mode: selection.mode,
      indices: Object.freeze(selection.indices),
      activeIndex: selection.indices.at(-1) ?? null
    }),
    label: result.label ?? op,
    diagnostics: Object.freeze({
      vertexCount: finalized.positions.length,
      edgeCount: afterTopology.edgeCount,
      faceCount: afterTopology.faceCount,
      boundaryEdgeCount: afterTopology.boundaryEdges.length,
      looseEdgeCount: afterTopology.looseEdges.length,
      nonManifoldEdgeCount: afterTopology.nonManifoldEdges.length
    })
  });
}

export function meshSelectionOperation({
  topology,
  mode = "vertex",
  selectedIndices = [],
  activeIndex = null,
  operation,
  options = {}
} = {}) {
  const componentMode = normalizeMeshComponentMode(mode);
  const count = componentCount(topology, componentMode);
  const selected = new Set(normalizeSelection(selectedIndices, count));
  const op = String(operation ?? "").trim().toLowerCase();
  let next;
  switch (op) {
    case "all":
      next = new Set(Array.from({ length: count }, (_, index) => index));
      break;
    case "none":
      next = new Set();
      break;
    case "invert":
      next = new Set(Array.from({ length: count }, (_, index) => index)
        .filter(index => !selected.has(index)));
      break;
    case "grow":
      next = growSelection(topology, componentMode, selected);
      break;
    case "shrink":
      next = shrinkSelection(topology, componentMode, selected);
      break;
    case "linked":
      next = linkedSelection(topology, componentMode, selected, activeIndex);
      break;
    case "boundary":
      next = boundarySelection(topology, componentMode);
      break;
    case "by-normal":
      next = selectFacesByNormal(topology, selected, activeIndex, options.angleDegrees ?? 15);
      if (componentMode !== "face") {
        next = convertFaceSelection(topology, componentMode, next);
      }
      break;
    default:
      throw new RangeError(`Operação de seleção desconhecida: ${operation}.`);
  }
  const indices = [...next].sort((a, b) => a - b);
  return Object.freeze({
    mode: componentMode,
    indices: Object.freeze(indices),
    activeIndex: indices.includes(Number(activeIndex))
      ? Number(activeIndex)
      : indices.at(-1) ?? null
  });
}

export function topologyOf(descriptor) {
  const mesh = descriptor.positions ? mutableMesh(descriptor) : descriptor;
  const triangles = trianglesOf(mesh);
  const edgesByKey = new Map();
  const vertexNeighbors = mesh.positions.map(() => new Set());
  const vertexFaces = mesh.positions.map(() => []);
  const halfEdges = [];
  const directedHalfEdge = new Map();
  const faces = triangles.map((triangle, faceIndex) => {
    const [a, b, c] = triangle;
    vertexFaces[a].push(faceIndex);
    vertexFaces[b].push(faceIndex);
    vertexFaces[c].push(faceIndex);
    const starts = [a, b, c];
    const ends = [b, c, a];
    const base = halfEdges.length;
    for (let slot = 0; slot < 3; slot += 1) {
      const start = starts[slot];
      const end = ends[slot];
      const index = halfEdges.length;
      halfEdges.push({
        index,
        face: faceIndex,
        start,
        end,
        next: base + ((slot + 1) % 3),
        previous: base + ((slot + 2) % 3),
        twin: null
      });
      directedHalfEdge.set(`${start}:${end}`, index);
      registerSurfaceEdge(start, end, faceIndex, edgesByKey, vertexNeighbors);
    }
    const normalArea = triangleNormalArea(mesh.positions[a], mesh.positions[b], mesh.positions[c]);
    return Object.freeze({
      index: faceIndex,
      vertices: Object.freeze([...triangle]),
      normal: Object.freeze(normalArea.normal),
      centroid: Object.freeze(averagePoints(triangle.map(index => mesh.positions[index]))),
      area: normalArea.area
    });
  });
  for (const halfEdge of halfEdges) {
    halfEdge.twin = directedHalfEdge.get(`${halfEdge.end}:${halfEdge.start}`) ?? null;
    Object.freeze(halfEdge);
  }
  for (const [a, b] of mesh.edges) {
    const key = edgeKey(a, b);
    const edge = edgesByKey.get(key) ?? {
      a: Math.min(a, b), b: Math.max(a, b), faces: [], explicit: false
    };
    edge.explicit = true;
    edgesByKey.set(key, edge);
    vertexNeighbors[a].add(b);
    vertexNeighbors[b].add(a);
  }
  const edges = [...edgesByKey.values()]
    .sort((left, right) => left.a - right.a || left.b - right.b)
    .map((edge, index) => Object.freeze({
      index,
      key: edgeKey(edge.a, edge.b),
      a: edge.a,
      b: edge.b,
      faces: Object.freeze([...edge.faces].sort((a, b) => a - b)),
      explicit: Boolean(edge.explicit),
      loose: edge.faces.length === 0
    }));
  const edgeIndexByKey = new Map(edges.map(edge => [edge.key, edge.index]));
  const faceNeighbors = faces.map(() => new Set());
  for (const edge of edges) {
    for (const face of edge.faces) {
      for (const other of edge.faces) if (other !== face) faceNeighbors[face].add(other);
    }
  }
  const boundaryHalfEdges = halfEdges.filter(halfEdge => halfEdge.twin === null);
  const boundaryLoops = traceBoundaryLoops(boundaryHalfEdges);
  const boundaryEdges = edges.filter(edge => edge.faces.length === 1);
  const looseEdges = edges.filter(edge => edge.loose);
  const nonManifoldEdges = edges.filter(edge => edge.faces.length > 2);
  return Object.freeze({
    vertexCount: mesh.positions.length,
    edgeCount: edges.length,
    faceCount: faces.length,
    positions: Object.freeze(mesh.positions.map(point => Object.freeze([...point]))),
    triangles: Object.freeze(triangles.map(face => Object.freeze([...face]))),
    faces: Object.freeze(faces),
    edges: Object.freeze(edges),
    halfEdges: Object.freeze(halfEdges),
    boundaryEdges: Object.freeze(boundaryEdges),
    boundaryLoops: Object.freeze(boundaryLoops.map(loop => Object.freeze([...loop]))),
    looseEdges: Object.freeze(looseEdges),
    nonManifoldEdges: Object.freeze(nonManifoldEdges),
    edgeIndexByKey,
    vertexNeighbors: Object.freeze(vertexNeighbors.map(set => Object.freeze([...set].sort((a, b) => a - b)))),
    vertexFaces: Object.freeze(vertexFaces.map(list => Object.freeze([...list].sort((a, b) => a - b)))),
    faceNeighbors: Object.freeze(faceNeighbors.map(set => Object.freeze([...set].sort((a, b) => a - b))))
  });
}

export function componentVertices(topology, mode, selectedIndices) {
  const componentMode = normalizeMeshComponentMode(mode);
  const selected = normalizeSelection(selectedIndices, componentCount(topology, componentMode));
  if (componentMode === "vertex") return selected;
  const vertices = new Set();
  if (componentMode === "edge") {
    for (const index of selected) {
      const edge = topology.edges[index];
      if (edge) { vertices.add(edge.a); vertices.add(edge.b); }
    }
  } else {
    for (const index of selected) {
      for (const vertex of topology.triangles[index] ?? []) vertices.add(vertex);
    }
  }
  return [...vertices].sort((a, b) => a - b);
}

function createVertex(mesh, options) {
  const position = vector3(options.position ?? [0, 0, 0], "position");
  const index = appendVertex(mesh, position, options.uv ?? [0, 0]);
  return {
    mesh,
    selectionMode: "vertex",
    selectionVertices: [index],
    label: "Criar vértice"
  };
}

function createEdge(mesh, selected, mode, topology, options) {
  const vertices = options.vertices
    ? normalizeSelection(options.vertices, mesh.positions.length)
    : componentVertices(topology, mode, selected);
  if (vertices.length !== 2) {
    throw new Error("Criar aresta exige exatamente dois vértices.");
  }
  const key = edgeKey(vertices[0], vertices[1]);
  if (!mesh.edges.some(edge => edgeKey(edge[0], edge[1]) === key) &&
      !topology.edgeIndexByKey.has(key)) {
    mesh.edges.push([vertices[0], vertices[1]]);
  }
  return {
    mesh,
    selectionMode: "edge",
    selectionEdgeKeys: [key],
    label: "Criar aresta"
  };
}

function createFace(mesh, selected, mode, topology, options) {
  const vertices = options.vertices
    ? normalizeSelection(options.vertices, mesh.positions.length)
    : componentVertices(topology, mode, selected);
  if (vertices.length < 3) {
    throw new Error("Criar face exige ao menos três vértices.");
  }
  const triangles = triangulateVertexSet(mesh.positions, vertices, {
    reverse: Boolean(options.reverse),
    preserveOrder: Boolean(options.preserveOrder)
  });
  const existing = new Set(trianglesOf(mesh).map(faceKey));
  const created = [];
  for (const triangle of triangles) {
    const key = faceKey(triangle);
    if (existing.has(key)) continue;
    mesh.indices.push(...triangle);
    existing.add(key);
    created.push(key);
  }
  if (!created.length) throw new Error("A face já existe ou é degenerada.");
  return {
    mesh,
    selectionMode: "face",
    selectionFaceKeys: created,
    label: "Criar face"
  };
}

function duplicateComponents(mesh, selected, mode, topology, options) {
  if (!selected.length) throw new Error("Selecione componentes para duplicar.");
  const offset = vector3(options.offset ?? [0, 0, 0], "offset");
  const selectedVertices = componentVertices(topology, mode, selected);
  const map = duplicateVertices(mesh, selectedVertices, offset);
  const selectionVertices = [...map.values()];
  const edgeKeys = [];
  const faceKeys = [];
  if (mode === "edge") {
    for (const index of selected) {
      const edge = topology.edges[index];
      if (!edge) continue;
      const duplicated = [map.get(edge.a), map.get(edge.b)];
      mesh.edges.push(duplicated);
      edgeKeys.push(edgeKey(...duplicated));
    }
  } else if (mode === "face") {
    for (const index of selected) {
      const face = topology.triangles[index];
      if (!face) continue;
      const duplicated = face.map(vertex => map.get(vertex));
      mesh.indices.push(...duplicated);
      faceKeys.push(faceKey(duplicated));
    }
  }
  return {
    mesh,
    selectionMode: mode,
    selectionVertices,
    selectionEdgeKeys: edgeKeys,
    selectionFaceKeys: faceKeys,
    label: `Duplicar ${componentLabel(mode, selected.length)}`
  };
}

function deleteComponents(mesh, selected, mode, topology, options) {
  if (!selected.length) throw new Error("Selecione componentes para excluir.");
  const facesToDelete = new Set();
  const verticesToDelete = new Set();
  const edgeKeysToDelete = new Set();
  if (mode === "face") {
    selected.forEach(index => facesToDelete.add(index));
  } else if (mode === "edge") {
    for (const index of selected) {
      const edge = topology.edges[index];
      if (!edge) continue;
      edgeKeysToDelete.add(edge.key);
      edge.faces.forEach(face => facesToDelete.add(face));
    }
  } else {
    selected.forEach(index => verticesToDelete.add(index));
    topology.triangles.forEach((triangle, faceIndex) => {
      if (triangle.some(vertex => verticesToDelete.has(vertex))) facesToDelete.add(faceIndex);
    });
    topology.edges.forEach(edge => {
      if (verticesToDelete.has(edge.a) || verticesToDelete.has(edge.b)) {
        edgeKeysToDelete.add(edge.key);
      }
    });
  }
  mesh.indices = trianglesOf(mesh)
    .filter((_, index) => !facesToDelete.has(index))
    .flat();
  mesh.edges = mesh.edges.filter(edge => !edgeKeysToDelete.has(edgeKey(...edge)));
  if (mode === "vertex") {
    mesh = removeVertices(mesh, verticesToDelete);
  }
  return {
    mesh,
    selectionMode: mode,
    selectionVertices: [],
    selectionEdgeKeys: [],
    selectionFaceKeys: [],
    label: `Excluir ${componentLabel(mode, selected.length)}`
  };
}

function extrudeComponents(mesh, selected, mode, topology, options) {
  if (!selected.length) throw new Error("Selecione componentes para extrudar.");
  const vertices = componentVertices(topology, mode, selected);
  const offset = extrusionOffset(mesh, topology, mode, selected, options);
  const map = duplicateVertices(mesh, vertices, offset);
  const selectionVertices = [...map.values()];
  const edgeKeys = [];
  const faceKeys = [];

  if (mode === "vertex") {
    for (const vertex of vertices) {
      const edge = [vertex, map.get(vertex)];
      mesh.edges.push(edge);
      edgeKeys.push(edgeKey(...edge));
    }
    return {
      mesh,
      selectionMode: "vertex",
      selectionVertices,
      label: "Extrudar vértices"
    };
  }

  if (mode === "edge") {
    for (const index of selected) {
      const edge = topology.edges[index];
      if (!edge) continue;
      const a2 = map.get(edge.a);
      const b2 = map.get(edge.b);
      const top = [a2, b2];
      mesh.edges.push(top);
      edgeKeys.push(edgeKey(...top));
      const sideA = [edge.a, edge.b, b2];
      const sideB = [edge.a, b2, a2];
      mesh.indices.push(...sideA, ...sideB);
    }
    return {
      mesh,
      selectionMode: "edge",
      selectionEdgeKeys: edgeKeys,
      selectionVertices,
      label: "Extrudar arestas"
    };
  }

  const selectedFaces = new Set(selected);
  mesh.indices = trianglesOf(mesh)
    .filter((_, faceIndex) => !selectedFaces.has(faceIndex))
    .flat();
  for (const index of selected) {
    const face = topology.triangles[index];
    if (!face) continue;
    const top = face.map(vertex => map.get(vertex));
    mesh.indices.push(...top);
    faceKeys.push(faceKey(top));
  }
  for (const boundary of regionBoundaryEdges(topology, selectedFaces)) {
    const a2 = map.get(boundary.start);
    const b2 = map.get(boundary.end);
    mesh.indices.push(
      boundary.start, boundary.end, b2,
      boundary.start, b2, a2
    );
  }
  return {
    mesh,
    selectionMode: "face",
    selectionFaceKeys: faceKeys,
    selectionVertices,
    label: "Extrudar faces"
  };
}

function insetFaces(mesh, selected, mode, topology, options) {
  if (mode !== "face" || !selected.length) {
    throw new Error("Inset exige faces selecionadas.");
  }
  const amount = finite(options.amount ?? 0.2, "amount");
  if (!(amount > 0 && amount < 1)) {
    throw new RangeError("Inset deve ficar entre 0 e 1.");
  }
  const triangles = trianglesOf(mesh);
  const selectedSet = new Set(selected);
  const output = [];
  const innerFaceKeys = [];
  triangles.forEach((face, faceIndex) => {
    if (!selectedSet.has(faceIndex)) {
      output.push(face);
      return;
    }
    const centroid = averagePoints(face.map(index => mesh.positions[index]));
    const inner = face.map(vertex => appendVertex(
      mesh,
      mix3(mesh.positions[vertex], centroid, amount),
      mesh.uvs[vertex] ?? [0, 0]
    ));
    const [a, b, c] = face;
    const [ai, bi, ci] = inner;
    output.push(
      [a, b, bi], [a, bi, ai],
      [b, c, ci], [b, ci, bi],
      [c, a, ai], [c, ai, ci],
      [ai, bi, ci]
    );
    innerFaceKeys.push(faceKey([ai, bi, ci]));
  });
  mesh.indices = output.flat();
  return {
    mesh,
    selectionMode: "face",
    selectionFaceKeys: innerFaceKeys,
    label: "Inset de faces"
  };
}

function subdivideComponents(mesh, selected, mode, topology, options) {
  if (!selected.length) throw new Error("Selecione componentes para subdividir.");
  if (mode === "edge") return splitEdges(mesh, selected, mode, topology, options);
  const faceSelection = mode === "face"
    ? selected
    : [...new Set(componentVertices(topology, mode, selected)
      .flatMap(vertex => topology.vertexFaces[vertex] ?? []))];
  const selectedSet = new Set(faceSelection);
  const output = [];
  const created = [];
  trianglesOf(mesh).forEach((face, index) => {
    if (!selectedSet.has(index)) {
      output.push(face);
      return;
    }
    const centerPosition = averagePoints(face.map(vertex => mesh.positions[vertex]));
    const centerUv = averagePoints(face.map(vertex => mesh.uvs[vertex] ?? [0, 0]));
    const center = appendVertex(mesh, centerPosition, centerUv);
    const [a, b, c] = face;
    const children = [[a, b, center], [b, c, center], [c, a, center]];
    output.push(...children);
    children.forEach(child => created.push(faceKey(child)));
  });
  mesh.indices = output.flat();
  return {
    mesh,
    selectionMode: "face",
    selectionFaceKeys: created,
    label: "Subdividir faces"
  };
}

function splitEdges(mesh, selected, mode, topology, options) {
  if (mode !== "edge" || !selected.length) {
    throw new Error("Dividir exige arestas selecionadas.");
  }
  const parameter = finite(options.parameter ?? 0.5, "parameter");
  if (!(parameter > 0 && parameter < 1)) {
    throw new RangeError("O parâmetro de divisão deve ficar entre 0 e 1.");
  }
  const selectedEdges = selected.map(index => topology.edges[index]).filter(Boolean);
  const midpointByKey = new Map();
  for (const edge of selectedEdges) {
    const point = mix3(mesh.positions[edge.a], mesh.positions[edge.b], parameter);
    const uv = mixN(mesh.uvs[edge.a] ?? [0, 0], mesh.uvs[edge.b] ?? [0, 0], parameter);
    midpointByKey.set(edge.key, appendVertex(mesh, point, uv));
  }
  const output = [];
  trianglesOf(mesh).forEach(face => {
    const split = faceEdges(face)
      .map(([a, b]) => ({ a, b, key: edgeKey(a, b) }))
      .filter(edge => midpointByKey.has(edge.key));
    if (!split.length) {
      output.push(face);
      return;
    }
    if (split.length === 1) {
      const edge = split[0];
      const m = midpointByKey.get(edge.key);
      output.push(...splitTriangleByEdge(face, edge.a, edge.b, m));
      return;
    }
    // Para múltiplas arestas selecionadas na mesma face, subdivisão central
    // evita dependência da ordem de aplicação.
    const center = appendVertex(
      mesh,
      averagePoints(face.map(vertex => mesh.positions[vertex])),
      averagePoints(face.map(vertex => mesh.uvs[vertex] ?? [0, 0]))
    );
    const ring = [];
    for (let slot = 0; slot < 3; slot += 1) {
      const a = face[slot];
      const b = face[(slot + 1) % 3];
      ring.push(a);
      const m = midpointByKey.get(edgeKey(a, b));
      if (m !== undefined) ring.push(m);
    }
    for (let index = 0; index < ring.length; index += 1) {
      output.push([ring[index], ring[(index + 1) % ring.length], center]);
    }
  });
  mesh.indices = output.flat();
  const newEdgeKeys = [];
  for (const edge of selectedEdges) {
    const m = midpointByKey.get(edge.key);
    newEdgeKeys.push(edgeKey(edge.a, m), edgeKey(m, edge.b));
  }
  mesh.edges = mesh.edges.flatMap(edge => {
    const key = edgeKey(...edge);
    const midpoint = midpointByKey.get(key);
    return midpoint === undefined
      ? [edge]
      : [[edge[0], midpoint], [midpoint, edge[1]]];
  });
  return {
    mesh,
    selectionMode: "edge",
    selectionEdgeKeys: newEdgeKeys,
    label: "Dividir arestas"
  };
}

function collapseEdges(mesh, selected, mode, topology, options) {
  if (mode !== "edge" || !selected.length) {
    throw new Error("Colapsar exige arestas selecionadas.");
  }
  const union = new UnionFind(mesh.positions.length);
  selected.map(index => topology.edges[index]).filter(Boolean)
    .forEach(edge => union.union(edge.a, edge.b));
  const groups = new Map();
  for (let index = 0; index < mesh.positions.length; index += 1) {
    const root = union.find(index);
    const group = groups.get(root) ?? [];
    group.push(index);
    groups.set(root, group);
  }
  const remap = Array.from({ length: mesh.positions.length }, (_, index) => index);
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const target = options.target === "first" ? group[0]
      : options.target === "last" ? group.at(-1)
        : group[0];
    mesh.positions[target] = averagePoints(group.map(index => mesh.positions[index]));
    if (mesh.uvs.length) {
      mesh.uvs[target] = averagePoints(group.map(index => mesh.uvs[index] ?? [0, 0]));
    }
    group.forEach(index => { remap[index] = target; });
  }
  mesh.indices = mesh.indices.map(index => remap[index]);
  mesh.edges = mesh.edges.map(([a, b]) => [remap[a], remap[b]]);
  return {
    mesh,
    selectionMode: "vertex",
    selectionVertices: [],
    selectionPoints: [...groups.values()]
      .filter(group => group.length > 1)
      .map(group => averagePoints(group.map(index => mesh.positions[remap[index]]))),
    label: "Colapsar arestas"
  };
}

function flipEdges(mesh, selected, mode, topology) {
  if (mode !== "edge" || !selected.length) {
    throw new Error("Inverter diagonal exige arestas selecionadas.");
  }
  const triangles = trianglesOf(mesh);
  const selectedEdges = selected.map(index => topology.edges[index]).filter(Boolean);
  const removedFaces = new Set();
  const replacements = [];
  const selectionEdgeKeys = [];
  for (const edge of selectedEdges) {
    if (edge.faces.length !== 2) continue;
    const [leftIndex, rightIndex] = edge.faces;
    if (removedFaces.has(leftIndex) || removedFaces.has(rightIndex)) continue;
    const left = triangles[leftIndex];
    const right = triangles[rightIndex];
    const oriented = orientFacePair(left, right, edge.a, edge.b);
    if (!oriented) continue;
    const { u, v, c, d } = oriented;
    if (c === d || topology.edgeIndexByKey.has(edgeKey(c, d))) continue;
    const first = [c, d, v];
    const second = [d, c, u];
    if (triangleArea(mesh.positions, first) <= EPSILON ||
        triangleArea(mesh.positions, second) <= EPSILON) continue;
    removedFaces.add(leftIndex);
    removedFaces.add(rightIndex);
    replacements.push(first, second);
    selectionEdgeKeys.push(edgeKey(c, d));
  }
  if (!replacements.length) {
    throw new Error("Nenhuma aresta interior válida pôde ter a diagonal invertida.");
  }
  mesh.indices = triangles
    .filter((_, index) => !removedFaces.has(index))
    .concat(replacements)
    .flat();
  return {
    mesh,
    selectionMode: "edge",
    selectionEdgeKeys,
    label: "Inverter diagonais"
  };
}

function bridgeBoundaryLoops(mesh, selected, mode, topology) {
  if (mode !== "edge" || !selected.length) {
    throw new Error("Ponte exige as arestas de exatamente dois contornos selecionados.");
  }
  const selectedKeys = new Set(selected
    .map(index => topology.edges[index]?.key)
    .filter(Boolean));
  const loops = topology.boundaryLoops
    .map(normalizeBoundaryLoop)
    .filter(loop => loop.length >= 2 && loop.every((vertex, index) =>
      selectedKeys.has(edgeKey(vertex, loop[(index + 1) % loop.length]))
    ));
  if (loops.length !== 2) {
    throw new Error("Ponte exige a seleção completa de exatamente dois contornos de borda.");
  }
  const [left, rightSource] = loops;
  if (left.length !== rightSource.length) {
    throw new Error("A ponte inicial exige contornos com a mesma quantidade de vértices.");
  }
  if (left.length < 2) throw new Error("Contornos insuficientes para criar ponte.");
  const right = alignBoundaryLoop(mesh.positions, left, rightSource);
  const createdFaceKeys = [];
  for (let index = 0; index < left.length; index += 1) {
    const next = (index + 1) % left.length;
    const a = left[index];
    const b = left[next];
    const c = right[next];
    const d = right[index];
    const first = [a, b, c];
    const second = [a, c, d];
    if (triangleArea(mesh.positions, first) <= EPSILON ||
        triangleArea(mesh.positions, second) <= EPSILON) {
      throw new Error("A ponte produziria uma face degenerada.");
    }
    mesh.indices.push(...first, ...second);
    createdFaceKeys.push(faceKey(first), faceKey(second));
  }
  return {
    mesh,
    selectionMode: "face",
    selectionFaceKeys: createdFaceKeys,
    label: "Criar ponte entre contornos"
  };
}

function normalizeBoundaryLoop(loop) {
  const result = [...loop];
  if (result.length > 1 && result[0] === result.at(-1)) result.pop();
  return result;
}

function alignBoundaryLoop(positions, left, rightSource) {
  let best = null;
  for (const candidateSource of [rightSource, [...rightSource].reverse()]) {
    for (let shift = 0; shift < candidateSource.length; shift += 1) {
      const candidate = candidateSource.map((_, index) =>
        candidateSource[(index + shift) % candidateSource.length]
      );
      const cost = candidate.reduce((sum, vertex, index) =>
        sum + squaredDistance3(positions[left[index]], positions[vertex]), 0
      );
      if (!best || cost < best.cost) best = { cost, candidate };
    }
  }
  return best.candidate;
}

function enforceBoundaryPolicy({ topology, mode, selected, operation, options }) {
  if (!options.preserveBoundary) return;
  if (operation === "collapse" && mode === "edge") {
    const boundary = selected.some(index => {
      const edge = topology.edges[index];
      return edge && (edge.faces.length < 2 || edge.loose);
    });
    if (boundary) throw new Error("Preservar contornos impede colapsar arestas de borda ou soltas.");
  }
  if (operation === "weld") {
    const vertices = new Set(componentVertices(topology, mode, selected));
    const boundary = topology.boundaryEdges.some(edge =>
      vertices.has(edge.a) || vertices.has(edge.b)
    );
    if (boundary) throw new Error("Preservar contornos impede soldar vértices de borda.");
  }
}

function flipFaceNormals(mesh, selected, mode, topology) {
  if (mode !== "face" || !selected.length) {
    throw new Error("Inverter normal exige faces selecionadas.");
  }
  const selectedSet = new Set(selected);
  const faces = trianglesOf(mesh).map((face, index) =>
    selectedSet.has(index) ? [face[0], face[2], face[1]] : face
  );
  mesh.indices = faces.flat();
  return {
    mesh,
    selectionMode: "face",
    selectionFaceKeys: selected.map(index => faceKey(faces[index])),
    label: "Inverter normais"
  };
}

function weldVertices(mesh, selected, mode, topology, options) {
  const vertices = componentVertices(topology, mode, selected);
  if (vertices.length < 2) throw new Error("Soldar exige ao menos dois vértices.");
  const active = Number(options.activeIndex);
  const target = Number.isInteger(active) && vertices.includes(active)
    ? active
    : vertices[0];
  const position = options.target === "active"
    ? [...mesh.positions[target]]
    : averagePoints(vertices.map(index => mesh.positions[index]));
  const uv = mesh.uvs.length
    ? averagePoints(vertices.map(index => mesh.uvs[index] ?? [0, 0]))
    : null;
  mesh.positions[target] = position;
  if (uv) mesh.uvs[target] = uv;
  const selectedSet = new Set(vertices);
  const remap = mesh.positions.map((_, index) => selectedSet.has(index) ? target : index);
  mesh.indices = mesh.indices.map(index => remap[index]);
  mesh.edges = mesh.edges.map(([a, b]) => [remap[a], remap[b]]);
  return {
    mesh,
    selectionMode: "vertex",
    selectionVertices: [],
    selectionPoints: [position],
    label: "Soldar vértices"
  };
}

function mutableMesh(descriptor = {}) {
  const positions = Array.isArray(descriptor.positions)
    ? descriptor.positions.map((point, index) => vector3(point, `positions[${index}]`))
    : [];
  const indices = Array.from(descriptor.indices ?? [], Number);
  if (indices.length % 3 !== 0) throw new RangeError("indices deve conter triângulos completos.");
  indices.forEach(index => {
    if (!Number.isInteger(index) || index < 0 || index >= positions.length) {
      throw new RangeError(`Índice de face inválido: ${index}.`);
    }
  });
  const uvs = Array.isArray(descriptor.uvs) && descriptor.uvs.length === positions.length
    ? descriptor.uvs.map((point, index) => vectorN(point, 2, `uvs[${index}]`))
    : [];
  const normals = Array.isArray(descriptor.normals) && descriptor.normals.length === positions.length
    ? descriptor.normals.map((point, index) => vector3(point, `normals[${index}]`))
    : [];
  const edges = normalizeEdges(descriptor.edges ?? [], positions.length);
  return { type: "buffer", positions, indices, normals, uvs, edges };
}

function finalizeMesh(mesh, {
  removeUnused = true,
  preserveLooseVertices = false,
  preserveNormals = false
} = {}) {
  let result = mutableMesh(mesh);
  const faces = trianglesOf(result).filter(face =>
    new Set(face).size === 3 && triangleArea(result.positions, face) > EPSILON
  );
  result.indices = faces.flat();
  result.edges = uniqueEdges(result.edges.filter(([a, b]) => a !== b));
  if (!preserveNormals || result.normals.length !== result.positions.length) {
    result.normals = [];
  }
  if (removeUnused && !preserveLooseVertices) {
    const used = new Set(result.indices);
    result.edges.forEach(([a, b]) => { used.add(a); used.add(b); });
    result = compactToVertices(result, used);
  }
  return result;
}

function compactToVertices(mesh, used) {
  const ordered = [...used].filter(index => index >= 0 && index < mesh.positions.length)
    .sort((a, b) => a - b);
  const remap = new Map(ordered.map((oldIndex, newIndex) => [oldIndex, newIndex]));
  return {
    ...mesh,
    positions: ordered.map(index => mesh.positions[index]),
    uvs: mesh.uvs.length ? ordered.map(index => mesh.uvs[index] ?? [0, 0]) : [],
    normals: mesh.normals.length === mesh.positions.length
      ? ordered.map(index => mesh.normals[index] ?? [0, 0, 0])
      : [],
    indices: mesh.indices.map(index => remap.get(index)),
    edges: mesh.edges
      .filter(([a, b]) => remap.has(a) && remap.has(b))
      .map(([a, b]) => [remap.get(a), remap.get(b)])
  };
}

function removeVertices(mesh, verticesToDelete) {
  const used = new Set();
  mesh.indices.forEach(index => { if (!verticesToDelete.has(index)) used.add(index); });
  mesh.edges.forEach(([a, b]) => {
    if (!verticesToDelete.has(a) && !verticesToDelete.has(b)) {
      used.add(a); used.add(b);
    }
  });
  return compactToVertices(mesh, used);
}

function freezeDescriptor(mesh) {
  return Object.freeze({
    type: "buffer",
    positions: Object.freeze(mesh.positions.map(point => Object.freeze([...point]))),
    indices: Object.freeze([...mesh.indices]),
    normals: Object.freeze((mesh.normals ?? []).map(
      point => Object.freeze([...point])
    )),
    uvs: Object.freeze((mesh.uvs ?? []).map(point => Object.freeze([...point]))),
    edges: Object.freeze((mesh.edges ?? []).map(edge => Object.freeze([...edge])))
  });
}

function validateTopology(topology, { manifoldOnly = true } = {}) {
  if (manifoldOnly && topology.nonManifoldEdges.length) {
    throw new Error(
      `A operação produziria ${topology.nonManifoldEdges.length} aresta(s) não manifold.`
    );
  }
}

function resolveSelection({ topology, preferredMode, vertexIndices, edgeKeys, faceKeys, vertexPoints = [] }) {
  const mode = normalizeMeshComponentMode(preferredMode);
  if (mode === "vertex") {
    const valid = [...new Set(vertexIndices.map(Number))]
      .filter(index => Number.isInteger(index) && index >= 0 && index < topology.vertexCount);
    for (const point of vertexPoints) {
      const index = closestVertexIndex(topology.positions, point);
      if (index !== null) valid.push(index);
    }
    return { mode, indices: [...new Set(valid)].sort((a, b) => a - b) };
  }
  if (mode === "edge") {
    const indices = [...new Set(edgeKeys
      .map(key => topology.edgeIndexByKey.get(key))
      .filter(Number.isInteger))].sort((a, b) => a - b);
    return { mode, indices };
  }
  const keys = new Set(faceKeys);
  const indices = topology.triangles
    .map((face, index) => keys.has(faceKey(face)) ? index : null)
    .filter(Number.isInteger);
  return { mode, indices };
}

function componentCount(topology, mode) {
  if (mode === "vertex") return topology.vertexCount;
  if (mode === "edge") return topology.edgeCount;
  return topology.faceCount;
}

function growSelection(topology, mode, selected) {
  const result = new Set(selected);
  if (mode === "vertex") {
    selected.forEach(index => (topology.vertexNeighbors[index] ?? []).forEach(value => result.add(value)));
  } else if (mode === "face") {
    selected.forEach(index => (topology.faceNeighbors[index] ?? []).forEach(value => result.add(value)));
  } else {
    const vertices = new Set();
    selected.forEach(index => {
      const edge = topology.edges[index];
      if (edge) { vertices.add(edge.a); vertices.add(edge.b); }
    });
    topology.edges.forEach(edge => {
      if (vertices.has(edge.a) || vertices.has(edge.b)) result.add(edge.index);
    });
  }
  return result;
}

function shrinkSelection(topology, mode, selected) {
  const result = new Set(selected);
  if (mode === "vertex") {
    for (const index of selected) {
      if ((topology.vertexNeighbors[index] ?? []).some(value => !selected.has(value))) result.delete(index);
    }
  } else if (mode === "face") {
    for (const index of selected) {
      const faceEdgesList = faceEdges(topology.triangles[index] ?? []);
      if (faceEdgesList.some(([a, b]) => {
        const edge = topology.edges[topology.edgeIndexByKey.get(edgeKey(a, b))];
        return !edge || edge.faces.length < 2 || edge.faces.some(face => !selected.has(face));
      })) result.delete(index);
    }
  } else {
    for (const index of selected) {
      const edge = topology.edges[index];
      if (!edge) { result.delete(index); continue; }
      const adjacent = topology.edges.filter(candidate =>
        candidate.index !== edge.index &&
        (candidate.a === edge.a || candidate.a === edge.b || candidate.b === edge.a || candidate.b === edge.b)
      );
      if (adjacent.some(candidate => !selected.has(candidate.index))) result.delete(index);
    }
  }
  return result;
}

function linkedSelection(topology, mode, selected, activeIndex) {
  const seed = Number.isInteger(Number(activeIndex)) ? Number(activeIndex) : [...selected][0];
  if (!Number.isInteger(seed)) return new Set();
  const result = new Set([seed]);
  const queue = [seed];
  while (queue.length) {
    const current = queue.shift();
    const neighbors = mode === "vertex"
      ? topology.vertexNeighbors[current] ?? []
      : mode === "face"
        ? topology.faceNeighbors[current] ?? []
        : edgeNeighbors(topology, current);
    for (const neighbor of neighbors) {
      if (result.has(neighbor)) continue;
      result.add(neighbor);
      queue.push(neighbor);
    }
  }
  return result;
}

function boundarySelection(topology, mode) {
  if (mode === "edge") return new Set(topology.boundaryEdges.map(edge => edge.index));
  if (mode === "vertex") {
    return new Set(topology.boundaryEdges.flatMap(edge => [edge.a, edge.b]));
  }
  return new Set(topology.boundaryEdges.flatMap(edge => edge.faces));
}

function selectFacesByNormal(topology, selected, activeIndex, angleDegrees) {
  const seedIndex = Number.isInteger(Number(activeIndex))
    ? Number(activeIndex)
    : [...selected][0];
  const seed = topology.faces[seedIndex];
  if (!seed) return new Set();
  const cosine = Math.cos(Number(angleDegrees) * Math.PI / 180);
  const normal = seed.normal;
  return new Set(topology.faces
    .filter(face => dot3(normal, face.normal) >= cosine)
    .map(face => face.index));
}

function convertFaceSelection(topology, mode, faceSelection) {
  if (mode === "vertex") {
    return new Set([...faceSelection].flatMap(index => topology.triangles[index] ?? []));
  }
  const faceSet = new Set(faceSelection);
  return new Set(topology.edges
    .filter(edge => edge.faces.some(face => faceSet.has(face)))
    .map(edge => edge.index));
}

function edgeNeighbors(topology, edgeIndex) {
  const edge = topology.edges[edgeIndex];
  if (!edge) return [];
  return topology.edges
    .filter(candidate => candidate.index !== edgeIndex &&
      (candidate.a === edge.a || candidate.a === edge.b || candidate.b === edge.a || candidate.b === edge.b))
    .map(candidate => candidate.index);
}

function extrusionOffset(mesh, topology, mode, selected, options) {
  if (options.vector !== undefined) return vector3(options.vector, "vector");
  const distance = finite(options.distance ?? 1, "distance");
  let normal = [0, 0, 1];
  if (mode === "face") {
    const sum = [0, 0, 0];
    let area = 0;
    for (const index of selected) {
      const face = topology.faces[index];
      if (!face) continue;
      sum[0] += face.normal[0] * face.area;
      sum[1] += face.normal[1] * face.area;
      sum[2] += face.normal[2] * face.area;
      area += face.area;
    }
    normal = normalize3(area > EPSILON ? sum : normal);
  } else if (mode === "edge") {
    const sum = [0, 0, 0];
    for (const index of selected) {
      const edge = topology.edges[index];
      for (const faceIndex of edge?.faces ?? []) {
        const face = topology.faces[faceIndex];
        sum[0] += face.normal[0] * face.area;
        sum[1] += face.normal[1] * face.area;
        sum[2] += face.normal[2] * face.area;
      }
    }
    normal = normalize3(length3(sum) > EPSILON ? sum : normal);
  }
  return scale3(normal, distance);
}

function regionBoundaryEdges(topology, selectedFaces) {
  const result = [];
  for (const faceIndex of selectedFaces) {
    const face = topology.triangles[faceIndex];
    for (const [start, end] of faceEdges(face)) {
      const edge = topology.edges[topology.edgeIndexByKey.get(edgeKey(start, end))];
      const selectedAdjacent = (edge?.faces ?? []).filter(index => selectedFaces.has(index));
      if (selectedAdjacent.length === 1) result.push({ start, end, edge });
    }
  }
  return result;
}

function triangulateVertexSet(positions, vertexIndices, { reverse = false, preserveOrder = false } = {}) {
  let order = [...new Set(vertexIndices)];
  const points = order.map(index => positions[index]);
  if (points.length === 3) {
    const face = reverse ? [order[0], order[2], order[1]] : order;
    if (triangleArea(positions, face) <= EPSILON) throw new Error("Os vértices são colineares.");
    return [face];
  }
  const plane = bestFitPlane(points);
  const projected = points.map(point => projectPoint2(point, plane));
  if (!preserveOrder) {
    const centroid = averagePoints(projected);
    order = order.map((vertex, index) => ({ vertex, point: projected[index] }))
      .sort((left, right) =>
        Math.atan2(left.point[1] - centroid[1], left.point[0] - centroid[0]) -
        Math.atan2(right.point[1] - centroid[1], right.point[0] - centroid[0])
      )
      .map(item => item.vertex);
  }
  let polygon = order.map(vertex => ({ vertex, point: projectPoint2(positions[vertex], plane) }));
  if (signedArea2(polygon.map(item => item.point)) < 0) polygon.reverse();
  if (reverse) polygon.reverse();
  const triangles = earClip(polygon);
  if (!triangles.length) throw new Error("Não foi possível triangular a face selecionada.");
  return triangles;
}

function bestFitPlane(points) {
  const centroid = averagePoints(points);
  const covariance = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (const point of points) {
    const x = point[0] - centroid[0];
    const y = point[1] - centroid[1];
    const z = point[2] - centroid[2];
    covariance[0] += x * x; covariance[1] += x * y; covariance[2] += x * z;
    covariance[3] += y * x; covariance[4] += y * y; covariance[5] += y * z;
    covariance[6] += z * x; covariance[7] += z * y; covariance[8] += z * z;
  }
  const { values, vectors } = jacobiEigenSymmetric3(covariance);
  let smallest = 0;
  if (values[1] < values[smallest]) smallest = 1;
  if (values[2] < values[smallest]) smallest = 2;
  let normal = normalize3([
    vectors[smallest], vectors[3 + smallest], vectors[6 + smallest]
  ]);
  if (length3(normal) <= EPSILON) normal = fallbackNormal(points);
  const reference = Math.abs(normal[2]) < 0.9 ? [0, 0, 1] : [0, 1, 0];
  const tangent = normalize3(cross3(reference, normal));
  const bitangent = normalize3(cross3(normal, tangent));
  return { centroid, normal, tangent, bitangent };
}

function jacobiEigenSymmetric3(matrix) {
  const a = [...matrix];
  const v = [1,0,0, 0,1,0, 0,0,1];
  for (let iteration = 0; iteration < 24; iteration += 1) {
    const pairs = [[0,1],[0,2],[1,2]];
    let [p, q] = pairs[0];
    let maximum = Math.abs(a[p * 3 + q]);
    for (const pair of pairs.slice(1)) {
      const value = Math.abs(a[pair[0] * 3 + pair[1]]);
      if (value > maximum) { maximum = value; [p, q] = pair; }
    }
    if (maximum < 1e-12) break;
    const app = a[p * 3 + p];
    const aqq = a[q * 3 + q];
    const apq = a[p * 3 + q];
    const angle = 0.5 * Math.atan2(2 * apq, aqq - app);
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    for (let k = 0; k < 3; k += 1) {
      const aik = a[p * 3 + k];
      const aqk = a[q * 3 + k];
      a[p * 3 + k] = c * aik - s * aqk;
      a[q * 3 + k] = s * aik + c * aqk;
    }
    for (let k = 0; k < 3; k += 1) {
      const akp = a[k * 3 + p];
      const akq = a[k * 3 + q];
      a[k * 3 + p] = c * akp - s * akq;
      a[k * 3 + q] = s * akp + c * akq;
      const vkp = v[k * 3 + p];
      const vkq = v[k * 3 + q];
      v[k * 3 + p] = c * vkp - s * vkq;
      v[k * 3 + q] = s * vkp + c * vkq;
    }
  }
  return { values: [a[0], a[4], a[8]], vectors: v };
}

function projectPoint2(point, plane) {
  const delta = sub3(point, plane.centroid);
  return [dot3(delta, plane.tangent), dot3(delta, plane.bitangent)];
}

function earClip(polygon) {
  const work = polygon.map(item => ({ vertex: item.vertex, point: [...item.point] }));
  const result = [];
  let guard = work.length * work.length;
  while (work.length > 3 && guard-- > 0) {
    let clipped = false;
    for (let index = 0; index < work.length; index += 1) {
      const previous = work[(index - 1 + work.length) % work.length];
      const current = work[index];
      const next = work[(index + 1) % work.length];
      if (cross2(sub2(current.point, previous.point), sub2(next.point, current.point)) <= EPSILON) continue;
      if (work.some((candidate, candidateIndex) =>
        candidateIndex !== index &&
        candidateIndex !== (index - 1 + work.length) % work.length &&
        candidateIndex !== (index + 1) % work.length &&
        pointInTriangle2(candidate.point, previous.point, current.point, next.point)
      )) continue;
      result.push([previous.vertex, current.vertex, next.vertex]);
      work.splice(index, 1);
      clipped = true;
      break;
    }
    if (!clipped) break;
  }
  if (work.length === 3) result.push(work.map(item => item.vertex));
  if (result.length !== polygon.length - 2) {
    const vertices = polygon.map(item => item.vertex);
    return vertices.slice(1, -1).map((vertex, index) => [vertices[0], vertex, vertices[index + 2]]);
  }
  return result;
}

function pointInTriangle2(point, a, b, c) {
  const ab = cross2(sub2(b, a), sub2(point, a));
  const bc = cross2(sub2(c, b), sub2(point, b));
  const ca = cross2(sub2(a, c), sub2(point, c));
  return ab >= -EPSILON && bc >= -EPSILON && ca >= -EPSILON;
}

function traceBoundaryLoops(boundaryHalfEdges) {
  const outgoing = new Map();
  boundaryHalfEdges.forEach(edge => {
    const list = outgoing.get(edge.start) ?? [];
    list.push(edge);
    outgoing.set(edge.start, list);
  });
  const remaining = new Set(boundaryHalfEdges.map(edge => edge.index));
  const loops = [];
  while (remaining.size) {
    const firstIndex = remaining.values().next().value;
    const first = boundaryHalfEdges.find(edge => edge.index === firstIndex);
    const vertices = [first.start];
    let current = first;
    let guard = boundaryHalfEdges.length + 1;
    while (current && guard-- > 0 && remaining.has(current.index)) {
      remaining.delete(current.index);
      vertices.push(current.end);
      const candidates = (outgoing.get(current.end) ?? []).filter(edge => remaining.has(edge.index));
      current = candidates[0] ?? null;
      if (current?.end === vertices[0]) {
        remaining.delete(current.index);
        vertices.push(current.end);
        break;
      }
    }
    if (vertices.length > 1) loops.push(vertices);
  }
  return loops;
}

function registerSurfaceEdge(a, b, faceIndex, map, neighbors) {
  const key = edgeKey(a, b);
  const edge = map.get(key) ?? { a: Math.min(a, b), b: Math.max(a, b), faces: [], explicit: false };
  edge.faces.push(faceIndex);
  map.set(key, edge);
  neighbors[a].add(b);
  neighbors[b].add(a);
}

function trianglesOf(mesh) {
  const result = [];
  for (let offset = 0; offset < mesh.indices.length; offset += 3) {
    result.push([mesh.indices[offset], mesh.indices[offset + 1], mesh.indices[offset + 2]]);
  }
  return result;
}

function duplicateVertices(mesh, vertices, offset) {
  const map = new Map();
  for (const vertex of vertices) {
    const position = add3(mesh.positions[vertex], offset);
    const uv = mesh.uvs[vertex] ?? [0, 0];
    map.set(vertex, appendVertex(mesh, position, uv));
  }
  return map;
}

function appendVertex(mesh, position, uv = [0, 0]) {
  const index = mesh.positions.length;
  mesh.positions.push(vector3(position, "position"));
  if (mesh.uvs.length) mesh.uvs.push(vectorN(uv, 2, "uv"));
  return index;
}

function splitTriangleByEdge(face, a, b, midpoint) {
  for (let slot = 0; slot < 3; slot += 1) {
    const start = face[slot];
    const end = face[(slot + 1) % 3];
    const third = face[(slot + 2) % 3];
    if (start === a && end === b) return [[a, midpoint, third], [midpoint, b, third]];
    if (start === b && end === a) return [[b, midpoint, third], [midpoint, a, third]];
  }
  return [face];
}

function orientFacePair(left, right, a, b) {
  const leftHasAB = hasDirectedEdge(left, a, b);
  const leftHasBA = hasDirectedEdge(left, b, a);
  const rightHasAB = hasDirectedEdge(right, a, b);
  const rightHasBA = hasDirectedEdge(right, b, a);
  if (leftHasAB && rightHasBA) return { u: a, v: b, c: thirdVertex(left, a, b), d: thirdVertex(right, a, b) };
  if (leftHasBA && rightHasAB) return { u: b, v: a, c: thirdVertex(left, a, b), d: thirdVertex(right, a, b) };
  return null;
}

function hasDirectedEdge(face, a, b) {
  return face.some((vertex, index) => vertex === a && face[(index + 1) % 3] === b);
}

function thirdVertex(face, a, b) {
  return face.find(vertex => vertex !== a && vertex !== b);
}

function faceEdges(face) {
  return [[face[0], face[1]], [face[1], face[2]], [face[2], face[0]]];
}

function faceKey(face) {
  return [...face].sort((a, b) => a - b).join(":");
}

function edgeKey(a, b) {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

function uniqueEdges(edges) {
  const map = new Map();
  for (const edge of edges) map.set(edgeKey(edge[0], edge[1]), [Math.min(...edge), Math.max(...edge)]);
  return [...map.values()].sort((left, right) => left[0] - right[0] || left[1] - right[1]);
}

function normalizeEdges(value, vertexCount) {
  if (!Array.isArray(value)) return [];
  return uniqueEdges(value.map((edge, index) => {
    if (!Array.isArray(edge) || edge.length !== 2) {
      throw new TypeError(`edges[${index}] deve conter dois índices.`);
    }
    const values = edge.map(Number);
    values.forEach(vertex => {
      if (!Number.isInteger(vertex) || vertex < 0 || vertex >= vertexCount) {
        throw new RangeError(`Índice inválido em edges[${index}]: ${vertex}.`);
      }
    });
    return values;
  }).filter(edge => edge[0] !== edge[1]));
}

function normalizeSelection(values, count) {
  const result = [...new Set(Array.from(values ?? [], Number))];
  result.forEach(index => {
    if (!Number.isInteger(index) || index < 0 || index >= count) {
      throw new RangeError(`Índice de componente inválido: ${index}.`);
    }
  });
  return result.sort((a, b) => a - b);
}

function componentLabel(mode, count) {
  const names = {
    vertex: count === 1 ? "vértice" : "vértices",
    edge: count === 1 ? "aresta" : "arestas",
    face: count === 1 ? "face" : "faces"
  };
  return names[mode];
}

function triangleNormalArea(a, b, c) {
  const cross = cross3(sub3(b, a), sub3(c, a));
  const length = length3(cross);
  return {
    normal: length > EPSILON ? scale3(cross, 1 / length) : [0, 0, 0],
    area: length * 0.5
  };
}

function triangleArea(positions, face) {
  return triangleNormalArea(positions[face[0]], positions[face[1]], positions[face[2]]).area;
}

function fallbackNormal(points) {
  for (let i = 0; i < points.length - 2; i += 1) {
    for (let j = i + 1; j < points.length - 1; j += 1) {
      for (let k = j + 1; k < points.length; k += 1) {
        const normal = cross3(sub3(points[j], points[i]), sub3(points[k], points[i]));
        if (length3(normal) > EPSILON) return normalize3(normal);
      }
    }
  }
  return [0, 0, 1];
}

function signedArea2(points) {
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    area += current[0] * next[1] - current[1] * next[0];
  }
  return area * 0.5;
}

function averagePoints(points) {
  if (!points.length) return [];
  const result = Array(points[0].length).fill(0);
  points.forEach(point => point.forEach((value, index) => { result[index] += value; }));
  return result.map(value => value / points.length);
}

function mix3(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
function mixN(a, b, t) { return a.map((value, index) => value + (b[index] - value) * t); }
function add3(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
function sub3(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function scale3(a, scalar) { return [a[0] * scalar, a[1] * scalar, a[2] * scalar]; }
function dot3(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function cross3(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function squaredDistance3(left, right) {
  const x = left[0] - right[0];
  const y = left[1] - right[1];
  const z = left[2] - right[2];
  return x * x + y * y + z * z;
}

function length3(a) { return Math.hypot(a[0], a[1], a[2]); }
function normalize3(a) { const length = length3(a); return length > EPSILON ? scale3(a, 1 / length) : [0, 0, 0]; }
function sub2(a, b) { return [a[0] - b[0], a[1] - b[1]]; }
function cross2(a, b) { return a[0] * b[1] - a[1] * b[0]; }
function finite(value, label) { const number = Number(value); if (!Number.isFinite(number)) throw new TypeError(`${label} inválido.`); return number; }
function vector3(value, label) { return vectorN(value, 3, label); }
function vectorN(value, length, label) {
  if (!Array.isArray(value) || value.length !== length) throw new TypeError(`${label} deve conter ${length} valores.`);
  const result = value.map(Number);
  if (!result.every(Number.isFinite)) throw new TypeError(`${label} contém valor inválido.`);
  return result;
}

class UnionFind {
  constructor(count) { this.parent = Array.from({ length: count }, (_, index) => index); this.rank = Array(count).fill(0); }
  find(value) { let current = value; while (this.parent[current] !== current) { this.parent[current] = this.parent[this.parent[current]]; current = this.parent[current]; } return current; }
  union(a, b) { const ra = this.find(a); const rb = this.find(b); if (ra === rb) return; if (this.rank[ra] < this.rank[rb]) this.parent[ra] = rb; else if (this.rank[ra] > this.rank[rb]) this.parent[rb] = ra; else { this.parent[rb] = ra; this.rank[ra] += 1; } }
}

function closestVertexIndex(positions, point) {
  if (!positions.length) return null;
  let best = null;
  let distance = Infinity;
  positions.forEach((candidate, index) => {
    const value = Math.hypot(
      candidate[0] - point[0],
      candidate[1] - point[1],
      candidate[2] - point[2]
    );
    if (value < distance) { distance = value; best = index; }
  });
  return best;
}
