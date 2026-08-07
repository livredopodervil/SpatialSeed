import {
  composeTransform,
  decomposeTransformStrict,
  invertAffineMatrix,
  multiplyMatrices
} from "../../math-affine/src/index.js";

export const INSTANCE_GRAPH_VERSION = "instance-graph-v1";
export const INSTANCE_NODE_KIND = "instance";
export const INSTANCE_OCCURRENCE_ID_PREFIX = "@ig/";

const IDENTITY_POSITION = Object.freeze([0, 0, 0]);
const IDENTITY_ROTATION = Object.freeze([0, 0, 0, 1]);
const IDENTITY_SCALE = Object.freeze([1, 1, 1]);

export function emptyInstanceGraph() {
  return Object.freeze({
    version: INSTANCE_GRAPH_VERSION,
    definitions: Object.freeze({})
  });
}

export function normalizeInstanceGraph(value = null) {
  if (!value) return emptyInstanceGraph();
  if (
    value.version === INSTANCE_GRAPH_VERSION &&
    Object.isFrozen(value) &&
    Object.isFrozen(value.definitions)
  ) {
    return value;
  }
  if (value.version !== INSTANCE_GRAPH_VERSION) {
    throw new Error(`Versão de InstanceGraph incompatível: ${value.version ?? "ausente"}.`);
  }
  const source = value.definitions ?? {};
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    throw new TypeError("InstanceGraph.definitions deve ser um objeto.");
  }
  const definitions = {};
  for (const [id, definition] of Object.entries(source)) {
    definitions[id] = freezeDefinition({ ...definition, id });
  }
  const graph = Object.freeze({
    version: INSTANCE_GRAPH_VERSION,
    definitions: Object.freeze(definitions)
  });
  validateInstanceGraph(graph);
  return graph;
}

export function hasInstanceGraph(scene) {
  return Boolean(scene?.instanceGraph?.version === INSTANCE_GRAPH_VERSION);
}

export function isInstanceNode(value) {
  return Boolean(
    value &&
    typeof value === "object" &&
    value.kind === INSTANCE_NODE_KIND &&
    typeof value.definitionId === "string" &&
    value.definitionId.length
  );
}

export function instanceDefinition(sceneOrGraph, instanceOrId) {
  const graph = graphFrom(sceneOrGraph);
  const definitionId = typeof instanceOrId === "string"
    ? instanceOrId
    : String(instanceOrId?.definitionId ?? "");
  return graph.definitions[definitionId] ?? null;
}

export function resolveInstanceNode(scene, node) {
  if (!isInstanceNode(node)) return node ?? null;
  const definition = instanceDefinition(scene, node);
  if (!definition) return node;
  if (definition.type === "assembly") {
    return Object.freeze({
      ...node,
      kind: "group",
      instanceKind: "assembly",
      pivot: node.pivot ?? definition.pivot ?? IDENTITY_POSITION,
      definitionId: definition.id
    });
  }
  const override = ownInstanceOverride(node);
  const object = {
    ...definition.object,
    ...override,
    id: node.id,
    prototypeId: definition.prototypeId ?? definition.object?.prototypeId ?? node.prototypeId ?? node.id,
    name: node.name ?? definition.name ?? definition.object?.name ?? node.id,
    parentId: node.parentId ?? null,
    position: node.position ?? IDENTITY_POSITION,
    rotation: node.rotation ?? IDENTITY_ROTATION,
    scale: node.scale ?? IDENTITY_SCALE,
    definitionId: definition.id,
    instanceKind: "object"
  };
  return deepFreezeObjectShell(object);
}

/**
 * Compacts selected hierarchy roots into immutable definitions plus one
 * lightweight instance node per root. Descendants disappear from scene.objects;
 * their transforms become assembly child edges.
 */
export function compactHierarchyRoots(scene, rootIds = []) {
  const objects = [...(scene?.objects ?? [])];
  const byId = new Map(objects.map(object => [String(object.id), object]));
  const children = childIndex(objects);
  const roots = canonicalRootIds(rootIds, byId);
  if (!roots.length) {
    return Object.freeze({
      scene,
      changed: false,
      rootInstances: Object.freeze([]),
      removedIds: Object.freeze([]),
      definitionIds: Object.freeze([])
    });
  }

  const definitions = {
    ...normalizeInstanceGraph(scene?.instanceGraph).definitions
  };
  const removed = new Set();
  const replacements = new Map();
  const createdDefinitionIds = new Set();

  const internNode = id => {
    const node = byId.get(String(id));
    if (!node) throw new Error(`Nó inexistente para compactação: ${id}.`);
    if (isInstanceNode(node)) {
      const definition = definitions[node.definitionId];
      if (!definition) {
        throw new Error(`Definição inexistente: ${node.definitionId}.`);
      }
      return Object.freeze({
        ref: definition.id,
        name: node.name ?? null,
        pivot: node.pivot ?? null,
        overrides: edgeOverrideFromInstance(node)
      });
    }

    const childIds = children.get(String(id)) ?? [];
    if (node.kind === "group" || childIds.length) {
      const childEdges = childIds.map((childId, childIndex) => {
        const child = byId.get(childId);
        const interned = internNode(childId);
        return freezeChildEdge({
          slotId: stableSlotId(child, childIndex),
          ref: interned.ref,
          name: child.name ?? null,
          transform: transformOf(child),
          overrides: interned.overrides ?? edgeOverrideFromLegacyNode(child),
          pivot: interned.pivot ?? child.pivot ?? null
        });
      });
      const signature = assemblySignature(childEdges, node.pivot ?? null);
      const preferredId = `assembly:${String(node.prototypeId ?? node.id)}`;
      const definitionId = reusableDefinitionId(
        definitions,
        preferredId,
        "assembly",
        signature
      );
      if (!definitions[definitionId]) {
        definitions[definitionId] = freezeDefinition({
          id: definitionId,
          type: "assembly",
          signature,
          prototypeId: String(node.prototypeId ?? node.id),
          pivot: node.pivot ?? IDENTITY_POSITION,
          children: childEdges
        });
        createdDefinitionIds.add(definitionId);
      }
      return Object.freeze({
        ref: definitionId,
        name: node.name ?? null,
        pivot: node.pivot ?? null,
        overrides: Object.freeze({})
      });
    }

    const payload = objectDefinitionPayload(node);
    const signature = objectDefinitionSignature(node, payload);
    const preferredId = `object:${String(node.prototypeId ?? node.id)}`;
    const definitionId = reusableDefinitionId(
      definitions,
      preferredId,
      "object",
      signature
    );
    if (!definitions[definitionId]) {
      definitions[definitionId] = freezeDefinition({
        id: definitionId,
        type: "object",
        signature,
        prototypeId: String(node.prototypeId ?? node.id),
        object: payload
      });
      createdDefinitionIds.add(definitionId);
    }
    return Object.freeze({
      ref: definitionId,
      name: node.name ?? null,
      overrides: edgeOverrideFromLegacyNode(node)
    });
  };

  for (const rootId of roots) {
    const root = byId.get(rootId);
    if (isInstanceNode(root)) continue;
    const interned = internNode(rootId);
    const instance = freezeInstanceNode({
      id: root.id,
      definitionId: interned.ref,
      name: root.name ?? root.id,
      parentId: root.parentId ?? null,
      position: root.position,
      rotation: root.rotation,
      scale: root.scale,
      pivot: root.pivot,
      overrides: interned.overrides && Object.keys(interned.overrides).length
        ? Object.freeze({ $self: interned.overrides })
        : Object.freeze({})
    });
    replacements.set(rootId, instance);
    for (const descendantId of descendantsOf(rootId, children)) {
      removed.add(descendantId);
    }
  }

  if (!replacements.size) {
    return Object.freeze({
      scene: Object.freeze({
        ...scene,
        instanceGraph: normalizeInstanceGraph(scene?.instanceGraph)
      }),
      changed: false,
      rootInstances: Object.freeze(roots.map(id => byId.get(id)).filter(Boolean)),
      removedIds: Object.freeze([]),
      definitionIds: Object.freeze([])
    });
  }

  const nextObjects = objects.flatMap(object => {
    const id = String(object.id);
    if (removed.has(id)) return [];
    return [replacements.get(id) ?? object];
  });
  const graph = Object.freeze({
    version: INSTANCE_GRAPH_VERSION,
    definitions: Object.freeze(definitions)
  });
  validateInstanceGraph(graph);
  const nextScene = Object.freeze({
    ...scene,
    objects: Object.freeze(nextObjects),
    instanceGraph: graph
  });
  return Object.freeze({
    scene: nextScene,
    changed: true,
    rootInstances: Object.freeze(
      roots.map(id => replacements.get(id) ?? byId.get(id)).filter(Boolean)
    ),
    removedIds: Object.freeze([...removed]),
    definitionIds: Object.freeze([...createdDefinitionIds])
  });
}

/** Compacts all hierarchy roots. Used by serialization/migration. */
export function compactSceneToInstanceGraph(scene) {
  const objects = [...(scene?.objects ?? [])];
  if (!objects.length) {
    return Object.freeze({
      ...scene,
      objects: Object.freeze([]),
      instanceGraph: normalizeInstanceGraph(scene?.instanceGraph)
    });
  }
  const roots = objects
    .filter(object => object.parentId === null || object.parentId === undefined || object.parentId === "")
    .filter(object => !["camera", "light"].includes(object.kind))
    .map(object => String(object.id));
  return compactHierarchyRoots(scene, roots).scene;
}

export function duplicateReferenceRoots(scene, copies = []) {
  const specs = Array.isArray(copies) ? copies : [];
  if (!specs.length) return Object.freeze({ scene, created: Object.freeze([]), changed: false });
  const sourceIds = [...new Set(specs.map(spec => String(spec.sourceId ?? "")).filter(Boolean))];
  const compacted = compactHierarchyRoots(scene, sourceIds);
  const working = compacted.scene;
  const byId = new Map(working.objects.map(object => [String(object.id), object]));
  const existing = new Set(byId.keys());
  const created = [];

  for (const spec of specs) {
    const source = byId.get(String(spec.sourceId));
    if (!isInstanceNode(source)) {
      throw new Error(`Fonte não instanciável após compactação: ${spec.sourceId}.`);
    }
    const id = String(spec.id ?? "").trim();
    if (!id) throw new Error("Duplicação por referência exige id.");
    if (existing.has(id)) throw new Error(`Duplicate object id: ${id}`);
    existing.add(id);
    created.push(freezeInstanceNode({
      id,
      definitionId: source.definitionId,
      name: spec.name ?? source.name ?? id,
      parentId: spec.parentId !== undefined ? spec.parentId : source.parentId,
      position: spec.position ?? source.position,
      rotation: spec.rotation ?? source.rotation,
      scale: spec.scale ?? source.scale,
      pivot: source.pivot,
      overrides: cloneSmallObject(source.overrides ?? {})
    }));
  }

  const nextScene = Object.freeze({
    ...working,
    objects: Object.freeze([...working.objects, ...created])
  });
  return Object.freeze({
    scene: nextScene,
    created: Object.freeze(created),
    compacted,
    changed: true
  });
}


export function replaceInstanceObjectDefinition(scene, instanceId, objectPayload, {
  prototypeId = null
} = {}) {
  const objects = [...(scene?.objects ?? [])];
  const index = objects.findIndex(object => String(object.id) === String(instanceId));
  if (index < 0 || !isInstanceNode(objects[index])) {
    return Object.freeze({ scene, changed: false, instance: null });
  }
  const instance = objects[index];
  const current = instanceDefinition(scene, instance);
  if (current?.type !== "object") {
    throw new Error(`A instância ${instanceId} não referencia uma definição de objeto.`);
  }
  const definitions = { ...normalizeInstanceGraph(scene.instanceGraph).definitions };
  const nextPrototypeId = String(prototypeId ?? `prototype:${instanceId}:${Date.now()}`);
  const payload = deepFreezeObjectShell(objectPayload);
  const signature = objectDefinitionSignature({ id: instanceId, prototypeId: nextPrototypeId }, payload);
  const preferredId = `object:${nextPrototypeId}`;
  const definitionId = reusableDefinitionId(definitions, preferredId, "object", signature);
  definitions[definitionId] ??= freezeDefinition({
    id: definitionId,
    type: "object",
    signature,
    prototypeId: nextPrototypeId,
    object: payload
  });
  const updated = freezeInstanceNode({
    ...instance,
    definitionId,
    overrides: instance.overrides ?? {}
  });
  objects[index] = updated;
  const graph = Object.freeze({ version: INSTANCE_GRAPH_VERSION, definitions: Object.freeze(definitions) });
  validateInstanceGraph(graph);
  return Object.freeze({
    scene: Object.freeze({ ...scene, objects: Object.freeze(objects), instanceGraph: graph }),
    changed: true,
    instance: updated,
    definitionId
  });
}


/**
 * Copy-on-write replacement for one projected leaf occurrence. Only the root
 * instance receives a path override; siblings keep referencing the previous
 * immutable definition. No descendant is materialized in scene.objects.
 */
export function replaceInstanceOccurrenceObjectDefinition(
  scene,
  occurrenceId,
  objectPayload,
  { prototypeId = null, rootInstance = null } = {}
) {
  const occurrence = resolveInstanceOccurrence(scene, occurrenceId, { rootInstance });
  if (!occurrence) {
    return Object.freeze({ changed: false, rootInstance: null, graph: normalizeInstanceGraph(scene?.instanceGraph), definitionId: null });
  }
  if (occurrence.definition?.type !== "object") {
    throw new Error(`A ocorrência ${occurrenceId} não referencia uma definição de objeto.`);
  }

  const graph = normalizeInstanceGraph(scene?.instanceGraph);
  const definitions = { ...graph.definitions };
  const nextPrototypeId = String(
    prototypeId ?? `prototype:${occurrence.rootId}:${occurrence.pathKey}:${Date.now()}`
  );
  const payload = deepFreezeObjectShell(objectPayload);
  const signature = objectDefinitionSignature(
    { id: occurrenceId, prototypeId: nextPrototypeId },
    payload
  );
  const preferredId = `object:${nextPrototypeId}`;
  const definitionId = reusableDefinitionId(
    definitions,
    preferredId,
    "object",
    signature
  );
  definitions[definitionId] ??= freezeDefinition({
    id: definitionId,
    type: "object",
    signature,
    prototypeId: nextPrototypeId,
    object: payload
  });

  const nextRoot = updateInstanceOccurrenceRoot(
    occurrence.rootInstance,
    occurrence.path,
    { ref: definitionId }
  );
  const nextGraph = Object.freeze({
    version: INSTANCE_GRAPH_VERSION,
    definitions: Object.freeze(definitions)
  });
  validateInstanceGraph(nextGraph);
  return Object.freeze({
    changed: true,
    rootInstance: nextRoot,
    graph: nextGraph,
    definitionId,
    occurrenceId: String(occurrenceId)
  });
}

export function assemblyChildrenForInstance(scene, instanceId) {
  const node = (scene?.objects ?? []).find(object => String(object.id) === String(instanceId));
  if (!isInstanceNode(node)) return Object.freeze([]);
  const definition = instanceDefinition(scene, node);
  if (definition?.type !== "assembly") return Object.freeze([]);
  return definition.children;
}

export function ungroupAssemblyInstance(scene, instanceId, childIds = []) {
  const objects = [...(scene?.objects ?? [])];
  const index = objects.findIndex(object => String(object.id) === String(instanceId));
  if (index < 0) return Object.freeze({ scene, changed: false, promoted: Object.freeze([]) });
  const instance = objects[index];
  if (!isInstanceNode(instance)) return Object.freeze({ scene, changed: false, promoted: Object.freeze([]) });
  const definition = instanceDefinition(scene, instance);
  if (definition?.type !== "assembly") return Object.freeze({ scene, changed: false, promoted: Object.freeze([]) });
  if (childIds.length && childIds.length !== definition.children.length) {
    throw new Error("Quantidade de IDs promovidos não corresponde aos filhos da definição.");
  }
  const rootMatrix = composeTransform(transformOf(instance));
  const promoted = definition.children.map((child, childIndex) => {
    const id = String(childIds[childIndex] ?? `${instance.id}:${child.slotId}`);
    const local = decomposeTransformStrict(
      multiplyMatrices(rootMatrix, composeTransform(child.transform))
    );
    return freezeInstanceNode({
      id,
      definitionId: child.ref,
      name: child.name ?? id,
      parentId: instance.parentId ?? null,
      position: local.position,
      rotation: local.rotation,
      scale: local.scale,
      pivot: child.pivot,
      overrides: child.overrides ?? {}
    });
  });
  const nextObjects = [
    ...objects.slice(0, index),
    ...promoted,
    ...objects.slice(index + 1)
  ];
  return Object.freeze({
    scene: Object.freeze({ ...scene, objects: Object.freeze(nextObjects) }),
    changed: true,
    promoted: Object.freeze(promoted)
  });
}

/**
 * Expands compact definitions only for runtime/render projection. The returned
 * leaf/group nodes are derived cache entries and must never be serialized.
 */
export function projectInstanceGraphRoot(scene, objectOrId) {
  const object = typeof objectOrId === "string"
    ? (scene?.objects ?? []).find(candidate => String(candidate.id) === String(objectOrId))
    : objectOrId;
  if (!object) return null;
  if (!isInstanceNode(object)) return object;
  const definition = instanceDefinition(scene, object);
  if (!definition) throw new Error(`Definição inexistente: ${object.definitionId}.`);
  if (definition.type === "assembly") {
    return projectAssemblyRoot(definition, object, object.parentId ?? null);
  }
  return projectLeaf(definition, object, {
    id: object.id,
    parentId: object.parentId ?? null,
    name: object.name,
    transform: transformOf(object),
    rootId: object.id,
    path: []
  });
}

export function projectInstanceGraphObject(scene, objectOrId) {
  const object = typeof objectOrId === "string"
    ? (scene?.objects ?? []).find(candidate => String(candidate.id) === String(objectOrId))
    : objectOrId;
  if (!object) return Object.freeze([]);
  const knownIds = new Set((scene?.objects ?? []).map(candidate => String(candidate.id)));
  return projectInstanceGraphObjectKnown(scene, object, knownIds);
}

function projectInstanceGraphObjectKnown(scene, object, knownIds) {
  if (!isInstanceNode(object)) return Object.freeze([object]);
  const graph = normalizeInstanceGraph(scene?.instanceGraph);
  const definition = graph.definitions[object.definitionId];
  if (!definition) throw new Error(`Definição inexistente: ${object.definitionId}.`);
  const projected = [];

  if (definition.type === "object") {
    projected.push(projectLeaf(definition, object, {
      id: object.id,
      parentId: object.parentId ?? null,
      name: object.name,
      transform: transformOf(object),
      rootId: object.id,
      path: []
    }));
    return Object.freeze(projected);
  }

  projected.push(projectAssemblyRoot(definition, object, object.parentId ?? null));
  projectAssemblyChildren({
    graph,
    definition,
    rootInstance: object,
    rootId: String(object.id),
    parentId: String(object.id),
    path: [],
    projected,
    knownIds
  });
  return Object.freeze(projected);
}

export function projectInstanceGraphScene(scene) {
  const graph = normalizeInstanceGraph(scene?.instanceGraph);
  if (!Object.keys(graph.definitions).length || !(scene?.objects ?? []).some(isInstanceNode)) {
    return scene;
  }
  const projected = [];
  const knownIds = new Set((scene?.objects ?? []).map(candidate => String(candidate.id)));
  for (const object of scene.objects ?? []) {
    projected.push(...projectInstanceGraphObjectKnown(scene, object, knownIds));
  }
  return Object.freeze({
    ...scene,
    objects: Object.freeze(projected),
    projectedFromInstanceGraph: true
  });
}

function projectAssemblyRoot(definition, instance, parentId = null) {
  return deepFreezeObjectShell({
    id: instance.id,
    kind: "group",
    name: instance.name ?? instance.id,
    parentId,
    position: freezeVector(instance.position, 3, IDENTITY_POSITION),
    rotation: freezeVector(instance.rotation, 4, IDENTITY_ROTATION),
    scale: freezeVector(instance.scale, 3, IDENTITY_SCALE),
    pivot: freezeVector(instance.pivot ?? definition.pivot, 3, IDENTITY_POSITION),
    instanceRootId: String(instance.id),
    instancePath: Object.freeze([]),
    definitionId: definition.id,
    projectedInstance: true
  });
}


export function instanceOccurrenceId(rootId, path = []) {
  const root = encodeURIComponent(String(rootId ?? ""));
  const slots = (path ?? []).map(value => encodeURIComponent(String(value)));
  if (!root || !slots.length) {
    throw new Error("Ocorrência projetada exige raiz e caminho não vazio.");
  }
  return `${INSTANCE_OCCURRENCE_ID_PREFIX}${root}/${slots.join("/")}`;
}

export function isInstanceOccurrenceId(value) {
  return String(value ?? "").startsWith(INSTANCE_OCCURRENCE_ID_PREFIX);
}

export function parseInstanceOccurrenceId(value) {
  const id = String(value ?? "");
  if (!isInstanceOccurrenceId(id)) return null;
  const body = id.slice(INSTANCE_OCCURRENCE_ID_PREFIX.length);
  const parts = body.split("/").filter(Boolean);
  if (parts.length < 2) return null;
  try {
    return Object.freeze({
      id,
      rootId: decodeURIComponent(parts[0]),
      path: Object.freeze(parts.slice(1).map(decodeURIComponent)),
      pathKey: parts.slice(1).map(decodeURIComponent).join("/")
    });
  } catch {
    return null;
  }
}

/**
 * Resolves one projected occurrence without expanding unrelated roots. The
 * caller may pass rootInstance from an O(1) authoritative index.
 */
export function resolveInstanceOccurrence(scene, value, { rootInstance = null } = {}) {
  const parsed = typeof value === "string"
    ? parseInstanceOccurrenceId(value)
    : value;
  if (!parsed?.rootId || !parsed.path?.length) return null;
  const graph = normalizeInstanceGraph(scene?.instanceGraph);
  const root = rootInstance ?? (scene?.objects ?? []).find(
    object => String(object?.id ?? "") === String(parsed.rootId)
  );
  if (!isInstanceNode(root)) return null;
  let definition = graph.definitions[root.definitionId];
  if (definition?.type !== "assembly") return null;
  let parentId = String(root.id);
  let parentPath = [];
  let child = null;
  let childDefinition = null;
  let transform = null;
  let rootOverride = null;

  for (let index = 0; index < parsed.path.length; index += 1) {
    const slotId = String(parsed.path[index]);
    child = definition.children.find(candidate => String(candidate.slotId) === slotId);
    if (!child) return null;
    const childPath = [...parentPath, slotId];
    const pathKey = childPath.join("/");
    rootOverride = root.overrides?.[pathKey] ?? null;
    if (rootOverride?.hidden === true) return null;
    const ref = String(rootOverride?.ref ?? child.ref);
    childDefinition = graph.definitions[ref];
    if (!childDefinition) return null;
    transform = mergeTransform(child.transform, rootOverride?.transform);
    const id = instanceOccurrenceId(root.id, childPath);
    const name = rootOverride?.name ?? child.name ?? child.slotId;
    const isLast = index === parsed.path.length - 1;
    if (isLast) {
      const object = childDefinition.type === "assembly"
        ? deepFreezeObjectShell({
            id,
            kind: "group",
            name,
            parentId,
            position: transform.position,
            rotation: transform.rotation,
            scale: transform.scale,
            pivot: freezeVector(
              rootOverride?.pivot ?? child.pivot ?? childDefinition.pivot,
              3,
              IDENTITY_POSITION
            ),
            instanceRootId: String(root.id),
            instancePath: Object.freeze(childPath),
            definitionId: childDefinition.id,
            projectedInstance: true
          })
        : projectLeaf(childDefinition, root, {
            id,
            parentId,
            name,
            transform,
            rootId: String(root.id),
            path: childPath,
            childOverride: mergeSmallObjects(child.overrides, rootOverride?.patch)
          });
      return Object.freeze({
        id,
        rootId: String(root.id),
        path: Object.freeze(childPath),
        pathKey,
        parentId,
        parentPath: Object.freeze([...parentPath]),
        rootInstance: root,
        definition: childDefinition,
        parentDefinition: definition,
        childEdge: child,
        override: rootOverride,
        transform,
        object
      });
    }
    if (childDefinition.type !== "assembly") return null;
    parentId = id;
    parentPath = childPath;
    definition = childDefinition;
  }
  return null;
}

export function projectInstanceOccurrenceSubtree(scene, value, { rootInstance = null } = {}) {
  const occurrence = resolveInstanceOccurrence(scene, value, { rootInstance });
  if (!occurrence) return Object.freeze([]);
  if (occurrence.definition.type !== "assembly") {
    return Object.freeze([occurrence.object]);
  }
  const graph = normalizeInstanceGraph(scene?.instanceGraph);
  const projected = [occurrence.object];
  const knownIds = new Set((scene?.objects ?? []).map(candidate => String(candidate.id)));
  projectAssemblyChildren({
    graph,
    definition: occurrence.definition,
    rootInstance: occurrence.rootInstance,
    rootId: occurrence.rootId,
    parentId: occurrence.id,
    path: [...occurrence.path],
    projected,
    knownIds
  });
  return Object.freeze(projected);
}

/** Returns a new lightweight root instance with a single occurrence override changed. */
export function updateInstanceOccurrenceRoot(rootInstance, path, update = {}) {
  if (!isInstanceNode(rootInstance)) {
    throw new TypeError("Override de ocorrência exige uma instância raiz.");
  }
  const normalizedPath = (path ?? []).map(String);
  if (!normalizedPath.length) {
    throw new Error("Override de ocorrência exige caminho não vazio.");
  }
  const pathKey = normalizedPath.join("/");
  const previous = rootInstance.overrides?.[pathKey] ?? {};
  const next = { ...previous };

  if ("hidden" in update) {
    if (update.hidden === null || update.hidden === undefined || update.hidden === false) {
      delete next.hidden;
    } else {
      next.hidden = true;
    }
  }
  if (update.transform) next.transform = freezeTransform(update.transform);
  if (update.patch) {
    const merged = mergeSmallObjects(previous.patch, update.patch);
    if (Object.keys(merged).length) next.patch = deepFreezeSmall(merged);
    else delete next.patch;
  }
  if ("name" in update) {
    if (update.name === null || update.name === undefined) delete next.name;
    else next.name = String(update.name);
  }
  if ("pivot" in update) {
    if (update.pivot === null || update.pivot === undefined) delete next.pivot;
    else next.pivot = freezeVector(update.pivot, 3, IDENTITY_POSITION);
  }
  if ("ref" in update) {
    if (update.ref === null || update.ref === undefined) delete next.ref;
    else next.ref = String(update.ref);
  }

  const overrides = { ...(rootInstance.overrides ?? {}) };
  if (Object.keys(next).length) overrides[pathKey] = deepFreezeSmall(next);
  else delete overrides[pathKey];
  return freezeInstanceNode({
    ...rootInstance,
    overrides: deepFreezeSmall(overrides)
  });
}

/**
 * Computes the current occurrence world context from a supplied world matrix
 * of the root's parent. This walks only the instance path.
 */
export function instanceOccurrenceWorldContext(
  scene,
  value,
  { rootInstance = null, rootParentWorldMatrix = null } = {}
) {
  const occurrence = resolveInstanceOccurrence(scene, value, { rootInstance });
  if (!occurrence) return null;
  let world = rootParentWorldMatrix
    ? [...rootParentWorldMatrix]
    : [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  world = multiplyMatrices(world, composeTransform(transformOf(occurrence.rootInstance)));
  let definition = normalizeInstanceGraph(scene?.instanceGraph)
    .definitions[occurrence.rootInstance.definitionId];
  let path = [];
  let parentWorld = [...world];
  for (const slotId of occurrence.path) {
    const child = definition?.children?.find(candidate => String(candidate.slotId) === String(slotId));
    if (!child) return null;
    path = [...path, String(slotId)];
    const rootOverride = occurrence.rootInstance.overrides?.[path.join("/")] ?? null;
    const ref = String(rootOverride?.ref ?? child.ref);
    const childDefinition = normalizeInstanceGraph(scene?.instanceGraph).definitions[ref];
    const transform = mergeTransform(child.transform, rootOverride?.transform);
    parentWorld = [...world];
    world = multiplyMatrices(world, composeTransform(transform));
    definition = childDefinition;
  }
  return Object.freeze({
    occurrence,
    parentWorldMatrix: Object.freeze(parentWorld),
    worldMatrix: Object.freeze(world),
    localTransform: Object.freeze(decomposeTransformStrict(
      multiplyMatrices(invertAffineMatrix(parentWorld), world)
    ))
  });
}

export function projectInstanceGraphChanges(authoritativeScene, projectedScene, changes = []) {
  if (!projectedScene?.projectedFromInstanceGraph) return changes;
  const byId = new Map(projectedScene.objects.map(object => [String(object.id), object]));
  return Object.freeze((changes ?? []).map(change => {
    const id = String(change?.objectId ?? "");
    const projectedObject = byId.get(id) ?? null;
    return Object.freeze({
      ...change,
      ...(projectedObject ? { object: projectedObject } : {})
    });
  }));
}

export function validateInstanceGraph(sceneOrGraph) {
  const graph = graphFrom(sceneOrGraph);
  const definitions = graph.definitions ?? {};
  for (const [id, definition] of Object.entries(definitions)) {
    if (!definition || String(definition.id ?? id) !== id) {
      throw new Error(`Definição inválida: ${id}.`);
    }
    if (!['object', 'assembly'].includes(definition.type)) {
      throw new Error(`Tipo de definição inválido: ${definition.type}.`);
    }
    if (definition.type === 'assembly') {
      const slots = new Set();
      for (const child of definition.children ?? []) {
        if (!child?.slotId || slots.has(String(child.slotId))) {
          throw new Error(`Slot de assembly inválido/duplicado em ${id}.`);
        }
        slots.add(String(child.slotId));
        if (!definitions[child.ref]) {
          throw new Error(`Referência de definição inexistente: ${child.ref}.`);
        }
      }
    }
  }
  const complete = new Set();
  const visiting = new Set();
  const visit = id => {
    if (complete.has(id)) return;
    if (visiting.has(id)) {
      throw new Error(`Ciclo de definição ainda não permitido: ${id}.`);
    }
    visiting.add(id);
    const definition = definitions[id];
    if (definition?.type === 'assembly') {
      for (const child of definition.children) visit(child.ref);
    }
    visiting.delete(id);
    complete.add(id);
  };
  for (const id of Object.keys(definitions)) visit(id);
  return true;
}

export function instanceGraphDiagnostics(scene) {
  const graph = normalizeInstanceGraph(scene?.instanceGraph);
  const definitions = Object.values(graph.definitions);
  const instances = (scene?.objects ?? []).filter(isInstanceNode);
  const objectDefinitions = definitions.filter(definition => definition.type === 'object').length;
  const assemblyDefinitions = definitions.filter(definition => definition.type === 'assembly').length;
  const edgeCount = definitions.reduce(
    (total, definition) => total + (definition.type === 'assembly' ? definition.children.length : 0),
    0
  );
  return Object.freeze({
    version: INSTANCE_GRAPH_VERSION,
    definitionCount: definitions.length,
    objectDefinitions,
    assemblyDefinitions,
    edgeCount,
    rootInstanceCount: instances.length,
    legacyObjectCount: (scene?.objects ?? []).length - instances.length,
    authoritativeObjectCount: (scene?.objects ?? []).length
  });
}

function projectAssemblyChildren({
  graph,
  definition,
  rootInstance,
  rootId,
  parentId,
  path,
  projected,
  knownIds
}) {
  for (const child of definition.children) {
    const childPath = [...path, child.slotId];
    const pathKey = childPath.join('/');
    const rootOverride = rootInstance.overrides?.[pathKey] ?? null;
    if (rootOverride?.hidden === true) continue;
    const ref = String(rootOverride?.ref ?? child.ref);
    const childDefinition = graph.definitions[ref];
    if (!childDefinition) throw new Error(`Definição inexistente: ${ref}.`);
    const id = projectedNodeId(rootId, childPath, knownIds);
    const transform = mergeTransform(child.transform, rootOverride?.transform);
    const name = rootOverride?.name ?? child.name ?? child.slotId;
    if (childDefinition.type === 'assembly') {
      projected.push(deepFreezeObjectShell({
        id,
        kind: 'group',
        name,
        parentId,
        position: transform.position,
        rotation: transform.rotation,
        scale: transform.scale,
        pivot: freezeVector(rootOverride?.pivot ?? child.pivot ?? childDefinition.pivot, 3, IDENTITY_POSITION),
        instanceRootId: rootId,
        instancePath: Object.freeze(childPath),
        definitionId: childDefinition.id,
        projectedInstance: true
      }));
      projectAssemblyChildren({
        graph,
        definition: childDefinition,
        rootInstance,
        rootId,
        parentId: id,
        path: childPath,
        projected,
        knownIds
      });
    } else {
      projected.push(projectLeaf(childDefinition, rootInstance, {
        id,
        parentId,
        name,
        transform,
        rootId,
        path: childPath,
        childOverride: mergeSmallObjects(child.overrides, rootOverride?.patch)
      }));
    }
  }
}

function projectLeaf(definition, rootInstance, {
  id,
  parentId,
  name,
  transform,
  rootId,
  path,
  childOverride = null
}) {
  const ownOverride = path.length ? childOverride : ownInstanceOverride(rootInstance);
  const object = {
    ...definition.object,
    ...(ownOverride ?? {}),
    id,
    prototypeId: definition.prototypeId ?? definition.object?.prototypeId ?? definition.id,
    name: name ?? definition.object?.name ?? id,
    parentId: parentId ?? null,
    position: freezeVector(transform.position, 3, IDENTITY_POSITION),
    rotation: freezeVector(transform.rotation, 4, IDENTITY_ROTATION),
    scale: freezeVector(transform.scale, 3, IDENTITY_SCALE),
    definitionId: definition.id,
    instanceRootId: rootId,
    instancePath: Object.freeze([...path]),
    projectedInstance: true
  };
  return deepFreezeObjectShell(object);
}

function objectDefinitionPayload(node) {
  const omit = new Set([
    'id', 'parentId', 'position', 'rotation', 'scale', 'name', 'pivot',
    'prototypeId', 'derivedFromPrototypeId', 'instanceState', 'overrides',
    'definitionId', 'instanceKind', 'projectedInstance', 'instanceRootId',
    'instancePath'
  ]);
  const payload = {};
  for (const [key, value] of Object.entries(node ?? {})) {
    if (!omit.has(key)) payload[key] = value;
  }
  return deepFreezeObjectShell(payload);
}

function ownInstanceOverride(node) {
  const reserved = new Set([
    'id', 'kind', 'definitionId', 'name', 'parentId', 'position', 'rotation',
    'scale', 'pivot', 'prototypeId', 'overrides', 'instanceKind'
  ]);
  const result = { ...(node?.overrides?.$self ?? {}) };
  for (const [key, value] of Object.entries(node ?? {})) {
    if (!reserved.has(key)) result[key] = value;
  }
  return result;
}

function edgeOverrideFromLegacyNode(node) {
  const result = {};
  if (node?.instanceState && Object.keys(node.instanceState).length) {
    result.instanceState = node.instanceState;
  }
  return Object.freeze(result);
}

function edgeOverrideFromInstance(node) {
  return deepFreezeSmall({ ...(node?.overrides?.$self ?? {}) });
}

function freezeInstanceNode({
  id,
  definitionId,
  name,
  parentId = null,
  position = IDENTITY_POSITION,
  rotation = IDENTITY_ROTATION,
  scale = IDENTITY_SCALE,
  pivot = null,
  overrides = {}
}) {
  const result = {
    id: String(id),
    kind: INSTANCE_NODE_KIND,
    definitionId: String(definitionId),
    name: String(name ?? id),
    parentId: parentId === null || parentId === undefined || parentId === '' ? null : String(parentId),
    position: freezeVector(position, 3, IDENTITY_POSITION),
    rotation: freezeVector(rotation, 4, IDENTITY_ROTATION),
    scale: freezeVector(scale, 3, IDENTITY_SCALE),
    overrides: deepFreezeSmall(overrides ?? {})
  };
  if (pivot) result.pivot = freezeVector(pivot, 3, IDENTITY_POSITION);
  return Object.freeze(result);
}

function freezeDefinition(value) {
  const id = String(value?.id ?? '');
  if (!id) throw new Error('Definição sem id.');
  if (value.type === 'object') {
    return Object.freeze({
      id,
      type: 'object',
      signature: String(value.signature ?? ''),
      prototypeId: String(value.prototypeId ?? id),
      object: deepFreezeObjectShell(value.object ?? {})
    });
  }
  if (value.type === 'assembly') {
    return Object.freeze({
      id,
      type: 'assembly',
      signature: String(value.signature ?? ''),
      prototypeId: String(value.prototypeId ?? id),
      pivot: freezeVector(value.pivot, 3, IDENTITY_POSITION),
      children: Object.freeze((value.children ?? []).map(freezeChildEdge))
    });
  }
  throw new Error(`Tipo de definição inválido: ${value.type}.`);
}

function freezeChildEdge(value) {
  return Object.freeze({
    slotId: String(value.slotId),
    ref: String(value.ref),
    name: value.name == null ? null : String(value.name),
    transform: freezeTransform(value.transform),
    overrides: deepFreezeSmall(value.overrides ?? {}),
    ...(value.pivot ? { pivot: freezeVector(value.pivot, 3, IDENTITY_POSITION) } : {})
  });
}

function transformOf(node) {
  return freezeTransform({
    position: node?.position,
    rotation: node?.rotation,
    scale: node?.scale
  });
}

function freezeTransform(value = {}) {
  return Object.freeze({
    position: freezeVector(value.position, 3, IDENTITY_POSITION),
    rotation: freezeVector(value.rotation, 4, IDENTITY_ROTATION),
    scale: freezeVector(value.scale, 3, IDENTITY_SCALE)
  });
}

function mergeTransform(base, patch = null) {
  if (!patch) return freezeTransform(base);
  return freezeTransform({
    position: patch.position ?? base.position,
    rotation: patch.rotation ?? base.rotation,
    scale: patch.scale ?? base.scale
  });
}

function stableSlotId(_node, index = 0) {
  return `slot:${Number(index)}`;
}

function canonicalRootIds(rootIds, byId) {
  const requested = [...new Set((rootIds ?? []).map(String).filter(id => byId.has(id)))];
  const requestedSet = new Set(requested);
  return requested.filter(id => {
    let cursor = byId.get(id)?.parentId;
    const seen = new Set();
    while (cursor !== null && cursor !== undefined && cursor !== '') {
      const parentId = String(cursor);
      if (requestedSet.has(parentId)) return false;
      if (seen.has(parentId)) break;
      seen.add(parentId);
      cursor = byId.get(parentId)?.parentId;
    }
    return true;
  });
}

function childIndex(objects) {
  const result = new Map();
  for (const object of objects) {
    const parentId = object?.parentId === null || object?.parentId === undefined || object?.parentId === ''
      ? null
      : String(object.parentId);
    if (parentId === null) continue;
    let list = result.get(parentId);
    if (!list) {
      list = [];
      result.set(parentId, list);
    }
    list.push(String(object.id));
  }
  return result;
}

function descendantsOf(rootId, children) {
  const result = [];
  const queue = [...(children.get(String(rootId)) ?? [])];
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const id = queue[cursor];
    result.push(id);
    queue.push(...(children.get(id) ?? []));
  }
  return result;
}

function reusableDefinitionId(definitions, preferredId, type, signature) {
  const existing = definitions[preferredId];
  if (!existing) return preferredId;
  if (existing.type === type && existing.signature === signature) return preferredId;
  const hash = fnv1a64(`${type}|${signature}`);
  const candidate = `${preferredId}:variant:${hash}`;
  const variant = definitions[candidate];
  if (!variant || (variant.type === type && variant.signature === signature)) return candidate;
  let index = 2;
  while (definitions[`${candidate}:${index}`]) index += 1;
  return `${candidate}:${index}`;
}

function objectDefinitionSignature(node, payload) {
  return JSON.stringify([
    String(node.prototypeId ?? node.id),
    payload.kind ?? null,
    payload.geometry?.type ?? null,
    payload.appearanceId ?? null,
    payload.material?.color ?? null,
    payload.size ?? null,
    payload.geometry?.revision ?? null,
    payload.sketch?.revision ?? null
  ]);
}

function assemblySignature(children, pivot) {
  return JSON.stringify([
    pivot ?? null,
    children.map(child => [
      child.ref,
      child.transform.position,
      child.transform.rotation,
      child.transform.scale,
      child.overrides ?? null
    ])
  ]);
}

function projectedNodeId(rootId, path, knownIds) {
  const id = instanceOccurrenceId(rootId, path);
  if (knownIds.has(id)) {
    throw new Error(`ID reservado de ocorrência já existe na cena: ${id}.`);
  }
  knownIds.add(id);
  return id;
}

function graphFrom(sceneOrGraph) {
  if (sceneOrGraph?.version === INSTANCE_GRAPH_VERSION && sceneOrGraph.definitions) {
    return sceneOrGraph;
  }
  return normalizeInstanceGraph(sceneOrGraph?.instanceGraph);
}

function deepFreezeObjectShell(value) {
  if (!value || typeof value !== 'object') return value;
  if (Object.isFrozen(value)) return value;
  const result = { ...value };
  for (const [key, child] of Object.entries(result)) {
    if (Array.isArray(child)) {
      result[key] = Object.freeze([...child]);
    } else if (child && typeof child === 'object') {
      result[key] = deepFreezeSmall(child);
    }
  }
  return Object.freeze(result);
}

function deepFreezeSmall(value) {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  if (Array.isArray(value)) return Object.freeze(value.map(deepFreezeSmall));
  return Object.freeze(Object.fromEntries(
    Object.entries(value).map(([key, child]) => [key, deepFreezeSmall(child)])
  ));
}

function cloneSmallObject(value) {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(cloneSmallObject);
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, cloneSmallObject(child)]));
}

function mergeSmallObjects(...values) {
  return Object.assign({}, ...values.filter(value => value && typeof value === 'object'));
}

function freezeVector(value, length, fallback) {
  const source = Array.isArray(value) ? value : fallback;
  const result = Array.from(source ?? fallback, Number);
  if (result.length !== length || !result.every(Number.isFinite)) {
    return Object.freeze([...fallback]);
  }
  return Object.freeze(result);
}

function fnv1a64(value) {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  for (const byte of new TextEncoder().encode(String(value))) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * prime);
  }
  return hash.toString(16).padStart(16, '0');
}
