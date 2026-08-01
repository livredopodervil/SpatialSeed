import {
  normalizeExplicitInstanceFamily,
  explicitFamilyTransformAt,
  familyMemberResourcePath
} from "../../procedural-families/src/index.js?build=20260801-0045a1";
import {
  normalizeStrokeBundleDescriptor,
  strokeBundleFindStroke,
  strokeBundleStrokeAt,
  strokeResourcePath
} from "../../stroke-resources/src/StrokeBundle.js?build=20260801-0045a1";

const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGE_SIZE = 1000;

export class VirtualResourceTree {
  static apiVersion = "virtual-resource-tree-v2";

  constructor({
    sandbox = null,
    getState = null,
    state = null,
    pageSize = DEFAULT_PAGE_SIZE
  } = {}) {
    if (!sandbox && typeof getState !== "function" && !state) {
      throw new TypeError("VirtualResourceTree exige sandbox, getState ou state.");
    }
    this.sandbox = sandbox;
    this.authoritativeHierarchy = Boolean(
      sandbox?.getObject &&
      sandbox?.listObjectChildren &&
      sandbox?.getObjectChildCount
    );
    this.fixedState = state;
    this.getState = sandbox?.getSnapshot
      ? () => sandbox.getSnapshot()
      : typeof getState === "function"
        ? getState
        : () => this.fixedState;
    this.pageSize = normalizePageSize(pageSize);
    this.stateRef = null;
    this.byId = new Map();
    this.childrenById = new Map();
    this.rootIds = [];
    this.unsubscribe = null;
    this.diagnostics = {
      indexBuilds: 0,
      incrementalIndexUpdates: 0,
      objectsVisited: 0,
      listQueries: 0,
      describeQueries: 0,
      descriptorsCreated: 0,
      maximumPageItems: 0
    };
    if (sandbox?.subscribe && !this.authoritativeHierarchy) {
      this.unsubscribe = sandbox.subscribe((nextState, changes) => {
        this.#applyChanges(nextState, changes);
      });
    }
  }

  setState(state) {
    if (!state || !Array.isArray(state.objects)) {
      throw new TypeError("Estado do navegador de recursos inválido.");
    }
    if (this.sandbox) return false;
    this.fixedState = state;
    if (state !== this.stateRef) this.#rebuildIndex(state);
    return true;
  }

  dispose() {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.byId.clear();
    this.childrenById.clear();
    this.rootIds.length = 0;
  }

  root() {
    this.#ensureIndex();
    const objectCount = this.authoritativeHierarchy
      ? Number(this.sandbox.objectCount ?? 0)
      : this.byId.size;
    const childCount = this.#childCount(null);
    return descriptor({
      id: "/",
      path: "/",
      kind: "root",
      label: "Mundo",
      summary: `${objectCount} objeto(s)`,
      ownerObjectId: null,
      childCount,
      hasChildren: childCount > 0,
      revision: this.#revision()
    }, this.diagnostics);
  }

  describe(pathValue) {
    this.diagnostics.describeQueries += 1;
    this.#ensureIndex();
    const path = normalizePath(pathValue);
    if (path === "/") return this.root();
    const reference = parseResourcePath(path);
    if (!reference) return null;
    const object = this.#objectById(reference.ownerObjectId);
    if (!object) return null;

    if (reference.kind === "object") return this.#objectDescriptor(object);
    if (reference.kind === "members") {
      const family = familyForObject(object);
      return family ? descriptor({
        id: path,
        path,
        ownerObjectId: String(object.id),
        kind: "members",
        label: `Membros (${family.count})`,
        summary: "identidades virtuais",
        childCount: family.count,
        hasChildren: family.count > 0,
        revision: this.#revision()
      }, this.diagnostics) : null;
    }
    if (reference.kind === "family-member") {
      const family = familyForObject(object);
      const index = familyMemberIndex(family, reference.memberId);
      if (!family || index < 0) return null;
      const transform = explicitFamilyTransformAt(family, index, {});
      return descriptor({
        id: transform.memberId,
        path,
        ownerObjectId: String(object.id),
        kind: "family-member",
        label: transform.memberId,
        summary: `posição [${roundVector(transform.position)}]`,
        childCount: 0,
        hasChildren: false,
        revision: this.#revision(),
        propertyPaths: Object.freeze([
          "position", "rotation", "scale", "color"
        ])
      }, this.diagnostics);
    }
    if (reference.kind === "strokes") {
      const bundle = strokeBundleForObject(object);
      return bundle ? descriptor({
        id: path,
        path,
        ownerObjectId: String(object.id),
        kind: "strokes",
        label: `Traços (${bundle.strokeCount})`,
        summary: `${bundle.chunks.length} chunk(s) físicos`,
        childCount: bundle.strokeCount,
        hasChildren: bundle.strokeCount > 0,
        revision: this.#revision()
      }, this.diagnostics) : null;
    }
    if (reference.kind === "stroke") {
      const bundle = strokeBundleForObject(object);
      const stroke = bundle
        ? strokeBundleFindStroke(bundle, reference.strokeId)
        : null;
      return stroke ? this.#strokeDescriptor(object, stroke) : null;
    }
    if (reference.kind === "vertices") {
      const points = pointsForReference(object, reference);
      return points ? descriptor({
        id: path,
        path,
        ownerObjectId: String(object.id),
        kind: "vertices",
        label: `Vértices (${points.length})`,
        summary: "dados consultados por página",
        childCount: points.length,
        hasChildren: points.length > 0,
        revision: this.#revision()
      }, this.diagnostics) : null;
    }
    if (reference.kind === "vertex") {
      const points = pointsForReference(object, reference);
      const point = points?.[reference.vertexIndex];
      return point ? vertexDescriptor(
        path,
        object.id,
        reference.vertexIndex,
        point,
        this.#revision(),
        this.diagnostics
      ) : null;
    }
    return null;
  }

  listChildren(pathValue = "/", options = {}) {
    this.diagnostics.listQueries += 1;
    this.#ensureIndex();
    const path = normalizePath(pathValue);
    const offset = normalizeOffset(options.offset ?? decodeCursor(options.cursor));
    const limit = normalizePageSize(options.limit ?? this.pageSize);
    let total = 0;
    let factory = null;

    if (path === "/") {
      const hierarchy = this.#hierarchyPage(null, offset, limit);
      const items = hierarchy.items.map(id =>
        this.#objectDescriptor(this.#objectById(id))
      ).filter(Boolean);
      this.diagnostics.maximumPageItems = Math.max(
        this.diagnostics.maximumPageItems,
        items.length
      );
      return page(items, offset, limit, hierarchy.total, this.#revision());
    } else {
      const reference = parseResourcePath(path);
      const object = reference
        ? this.#objectById(reference.ownerObjectId)
        : null;
      if (!object) return page([], offset, limit, 0, this.#revision());

      if (reference.kind === "object") {
        const hierarchyTotal = this.#childCount(object.id);
        const directories = resourceDirectories(object);
        total = hierarchyTotal + directories.length;
        if (offset < total) {
          const items = [];
          if (offset < hierarchyTotal) {
            const hierarchy = this.#hierarchyPage(
              object.id,
              offset,
              Math.min(limit, hierarchyTotal - offset)
            );
            for (const id of hierarchy.items) {
              const item = this.#objectDescriptor(this.#objectById(id));
              if (item) items.push(item);
            }
          }
          let directoryIndex = Math.max(0, offset - hierarchyTotal);
          while (items.length < limit && directoryIndex < directories.length) {
            const item = this.describe(directories[directoryIndex++]);
            if (item) items.push(item);
          }
          this.diagnostics.maximumPageItems = Math.max(
            this.diagnostics.maximumPageItems,
            items.length
          );
          return page(items, offset, limit, total, this.#revision());
        }
        return page([], offset, limit, total, this.#revision());
      } else if (reference.kind === "members") {
        const family = familyForObject(object);
        total = family?.count ?? 0;
        factory = index => {
          const transform = explicitFamilyTransformAt(family, index, {});
          return descriptor({
            id: transform.memberId,
            path: familyMemberResourcePath(object.id, transform.memberId),
            ownerObjectId: String(object.id),
            kind: "family-member",
            label: transform.memberId,
            summary: `posição [${roundVector(transform.position)}]`,
            childCount: 0,
            hasChildren: false,
            revision: this.#revision(),
            ordinal: index
          }, this.diagnostics);
        };
      } else if (reference.kind === "strokes") {
        const bundle = strokeBundleForObject(object);
        total = bundle?.strokeCount ?? 0;
        factory = index => this.#strokeDescriptor(
          object,
          strokeBundleStrokeAt(bundle, index)
        );
      } else if (reference.kind === "stroke") {
        const stroke = strokeBundleFindStroke(
          strokeBundleForObject(object),
          reference.strokeId
        );
        const verticesPath = `${strokeResourcePath(object.id, stroke.id)}/vertices`;
        total = stroke ? 1 : 0;
        factory = () => this.describe(verticesPath);
      } else if (reference.kind === "vertices") {
        const points = pointsForReference(object, reference);
        total = points?.length ?? 0;
        factory = index => vertexDescriptor(
          `${path}/${index}`,
          object.id,
          index,
          points[index],
          this.#revision(),
          this.diagnostics
        );
      }
    }

    if (!factory || offset >= total) {
      return page([], offset, limit, total, this.#revision());
    }
    const end = Math.min(total, offset + limit);
    const items = [];
    for (let index = offset; index < end; index += 1) {
      const item = factory(index);
      if (item) items.push(item);
    }
    this.diagnostics.maximumPageItems = Math.max(
      this.diagnostics.maximumPageItems,
      items.length
    );
    return page(items, offset, limit, total, this.#revision());
  }

  readValue(pathValue, property = null) {
    this.#ensureIndex();
    const path = normalizePath(pathValue);
    const reference = parseResourcePath(path);
    if (!reference) return null;
    const object = this.#objectById(reference.ownerObjectId);
    if (!object) return null;
    if (reference.kind === "vertex") {
      const point = pointsForReference(object, reference)?.[reference.vertexIndex];
      if (!point) return null;
      return property === null ? point : point[axisFromProperty(property)];
    }
    if (reference.kind === "object") {
      return property === null ? object : readProperty(object, property);
    }
    if (reference.kind === "family-member") {
      const family = familyForObject(object);
      const index = familyMemberIndex(family, reference.memberId);
      if (index < 0) return null;
      const transform = explicitFamilyTransformAt(family, index, {});
      return property === null ? transform : readProperty(transform, property);
    }
    if (reference.kind === "stroke") {
      const stroke = strokeBundleFindStroke(
        strokeBundleForObject(object),
        reference.strokeId
      );
      return property === null ? stroke : readProperty(stroke, property);
    }
    return null;
  }

  status() {
    this.#ensureIndex();
    return Object.freeze({
      apiVersion: VirtualResourceTree.apiVersion,
      objectCount: this.authoritativeHierarchy
        ? Number(this.sandbox.objectCount ?? 0)
        : this.byId.size,
      rootCount: this.#childCount(null),
      pageSize: this.pageSize,
      mode: this.authoritativeHierarchy
        ? "authoritative-lazy-sandbox"
        : this.sandbox
          ? "incremental-sandbox"
          : "snapshot",
      diagnostics: Object.freeze({ ...this.diagnostics })
    });
  }

  #objectDescriptor(object) {
    if (!object) return null;
    const id = String(object.id);
    const directories = resourceDirectories(object);
    const childCount = this.#childCount(id) + directories.length;
    return descriptor({
      id,
      path: objectPath(id),
      ownerObjectId: id,
      kind: String(object.kind ?? object.geometry?.type ?? "object"),
      label: String(object.name ?? id),
      summary: objectSummary(object),
      childCount,
      hasChildren: childCount > 0,
      revision: this.#revision(),
      propertyPaths: Object.freeze([
        "name", "position", "rotation", "scale",
        "selectionAnchorPolicy", "selectionAnchorLocal"
      ])
    }, this.diagnostics);
  }

  #strokeDescriptor(object, stroke) {
    const path = strokeResourcePath(object.id, stroke.id);
    return descriptor({
      id: stroke.id,
      path,
      ownerObjectId: String(object.id),
      kind: "stroke",
      label: stroke.id,
      summary: `${stroke.points.length} pontos · raio ${round(stroke.radius)}`,
      childCount: 1,
      hasChildren: true,
      revision: this.#revision(),
      propertyPaths: Object.freeze([
        "radius", "radialSegments", "tubularSegments", "closed",
        "curveType", "tension"
      ])
    }, this.diagnostics);
  }

  #ensureIndex() {
    if (this.authoritativeHierarchy) return;
    const state = this.getState();
    if (!state || !Array.isArray(state.objects)) {
      throw new TypeError("Estado do navegador de recursos inválido.");
    }
    if (state === this.stateRef) return;
    this.#rebuildIndex(state);
  }

  #objectById(idValue) {
    const id = String(idValue);
    return this.authoritativeHierarchy
      ? this.sandbox.getObject(id)
      : this.byId.get(id) ?? null;
  }

  #childCount(parentId) {
    if (this.authoritativeHierarchy) {
      return this.sandbox.getObjectChildCount(parentId);
    }
    return parentId == null
      ? this.rootIds.length
      : (this.childrenById.get(String(parentId))?.length ?? 0);
  }

  #hierarchyPage(parentId, offset, limit) {
    if (this.authoritativeHierarchy) {
      return this.sandbox.listObjectChildren(parentId, { offset, limit });
    }
    const ids = parentId == null
      ? this.rootIds
      : (this.childrenById.get(String(parentId)) ?? []);
    return Object.freeze({
      items: Object.freeze(ids.slice(offset, offset + limit)),
      offset,
      limit,
      total: ids.length,
      nextOffset: offset + limit < ids.length ? offset + limit : null
    });
  }

  #rebuildIndex(state) {
    this.stateRef = state;
    this.byId.clear();
    this.childrenById.clear();
    this.rootIds.length = 0;
    for (const object of state.objects) {
      const id = String(object.id);
      this.byId.set(id, object);
      this.childrenById.set(id, []);
      this.diagnostics.objectsVisited += 1;
    }
    for (const object of state.objects) {
      this.#attachToParent(String(object.id), object.parentId);
    }
    this.diagnostics.indexBuilds += 1;
  }

  #applyChanges(state, changes) {
    if (!state || !Array.isArray(state.objects)) return;
    const list = Array.isArray(changes) ? changes : [];
    const supported = new Set([
      "object-created",
      "object-deleted",
      "object-transform",
      "object-updated"
    ]);
    if (!this.stateRef || !list.length ||
        list.some(change => !supported.has(change?.type))) {
      this.#rebuildIndex(state);
      return;
    }
    for (const change of list) {
      const id = String(change.objectId ?? change.object?.id ?? "");
      if (!id) {
        this.#rebuildIndex(state);
        return;
      }
      if (change.type === "object-deleted") {
        if ((this.childrenById.get(id)?.length ?? 0) > 0) {
          this.#rebuildIndex(state);
          return;
        }
        this.#detachFromParent(id, change.previousObject?.parentId);
        this.byId.delete(id);
        this.childrenById.delete(id);
        continue;
      }
      const object = change.object;
      if (!object || String(object.id) !== id) {
        this.#rebuildIndex(state);
        return;
      }
      const previous = this.byId.get(id) ?? change.previousObject ?? null;
      if (change.type === "object-created") {
        this.byId.set(id, object);
        this.childrenById.set(id, []);
        this.#attachToParent(id, object.parentId);
        continue;
      }
      const previousParent = previous?.parentId == null
        ? null
        : String(previous.parentId);
      const nextParent = object.parentId == null
        ? null
        : String(object.parentId);
      this.byId.set(id, object);
      if (previousParent !== nextParent) {
        this.#detachFromParent(id, previousParent);
        this.#attachToParent(id, nextParent);
      }
    }
    this.stateRef = state;
    this.diagnostics.incrementalIndexUpdates += 1;
  }

  #attachToParent(idValue, parentValue) {
    const id = String(idValue);
    const parentId = parentValue == null ? null : String(parentValue);
    if (parentId && this.childrenById.has(parentId)) {
      const children = this.childrenById.get(parentId);
      if (!children.includes(id)) children.push(id);
      return;
    }
    if (!this.rootIds.includes(id)) this.rootIds.push(id);
  }

  #detachFromParent(idValue, parentValue) {
    const id = String(idValue);
    const parentId = parentValue == null ? null : String(parentValue);
    const collection = parentId && this.childrenById.has(parentId)
      ? this.childrenById.get(parentId)
      : this.rootIds;
    const index = collection.indexOf(id);
    if (index >= 0) collection.splice(index, 1);
  }

  #revision() {
    return this.authoritativeHierarchy
      ? Number(this.sandbox.revision ?? 0)
      : Number(this.stateRef?.revision ?? 0);
  }
}

export function createVirtualResourceTree(options = {}) {
  return new VirtualResourceTree(options);
}

/* Compatibilidade para consumidores antigos. Esta função materializa somente
   os limites solicitados; o OutlineRenderer não a usa mais. */
export function buildResourceTree({
  objects = [],
  maxMembers = 128,
  maxStrokes = 128,
  maxVertices = 128
} = {}) {
  const state = { objects };
  const tree = createVirtualResourceTree({ state, pageSize: Math.max(
    maxMembers,
    maxStrokes,
    maxVertices
  ) });
  const root = tree.root();
  return deepFreeze({
    ...root,
    schemaVersion: "spatialseed-resource-tree-v2",
    children: materializeChildren(tree, root.path, {
      maxMembers,
      maxStrokes,
      maxVertices
    })
  });
}

export function resourceOwnerObjectId(path) {
  const match = String(path ?? "").match(/^\/objects\/([^/?#]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

export function parseResourcePath(pathValue) {
  const normalized = normalizePath(pathValue);
  const ownerObjectId = resourceOwnerObjectId(normalized);
  if (!ownerObjectId) return normalized === "/"
    ? Object.freeze({ kind: "root", path: "/" })
    : null;
  const base = `/objects/${encodeURIComponent(ownerObjectId)}`;
  if (normalized === base) {
    return Object.freeze({ kind: "object", ownerObjectId, path: normalized });
  }
  if (normalized === `${base}/members`) {
    return Object.freeze({ kind: "members", ownerObjectId, path: normalized });
  }
  const member = normalized.match(/^\/objects\/[^/]+\/members\/([^/]+)$/);
  if (member) return Object.freeze({
    kind: "family-member",
    ownerObjectId,
    memberId: decodeURIComponent(member[1]),
    path: normalized
  });
  if (normalized === `${base}/strokes`) {
    return Object.freeze({ kind: "strokes", ownerObjectId, path: normalized });
  }
  const strokeVertices = normalized.match(
    /^\/objects\/[^/]+\/strokes\/([^/]+)\/vertices$/
  );
  if (strokeVertices) return Object.freeze({
    kind: "vertices",
    ownerObjectId,
    strokeId: decodeURIComponent(strokeVertices[1]),
    path: normalized
  });
  const strokeVertex = normalized.match(
    /^\/objects\/[^/]+\/strokes\/([^/]+)\/vertices\/(\d+)$/
  );
  if (strokeVertex) return Object.freeze({
    kind: "vertex",
    ownerObjectId,
    strokeId: decodeURIComponent(strokeVertex[1]),
    vertexIndex: Number(strokeVertex[2]),
    path: normalized
  });
  const stroke = normalized.match(/^\/objects\/[^/]+\/strokes\/([^/]+)$/);
  if (stroke) return Object.freeze({
    kind: "stroke",
    ownerObjectId,
    strokeId: decodeURIComponent(stroke[1]),
    path: normalized
  });
  if (normalized === `${base}/vertices`) {
    return Object.freeze({ kind: "vertices", ownerObjectId, path: normalized });
  }
  const vertex = normalized.match(/^\/objects\/[^/]+\/vertices\/(\d+)$/);
  if (vertex) return Object.freeze({
    kind: "vertex",
    ownerObjectId,
    vertexIndex: Number(vertex[1]),
    path: normalized
  });
  return Object.freeze({ kind: "resource", ownerObjectId, path: normalized });
}

function materializeChildren(tree, path, limits) {
  const reference = parseResourcePath(path);
  const requestedLimit = reference?.kind === "members"
    ? limits.maxMembers
    : reference?.kind === "strokes"
      ? limits.maxStrokes
      : reference?.kind === "vertices"
        ? limits.maxVertices
        : Infinity;
  const items = [];
  let offset = 0;
  while (items.length < requestedLimit) {
    const remaining = Number.isFinite(requestedLimit)
      ? requestedLimit - items.length
      : MAX_PAGE_SIZE;
    const pageResult = tree.listChildren(path, {
      offset,
      limit: Math.max(1, Math.min(MAX_PAGE_SIZE, remaining))
    });
    items.push(...pageResult.items);
    if (pageResult.nextOffset === null || !pageResult.items.length) break;
    offset = pageResult.nextOffset;
  }
  return items.map(item => deepFreeze({
    ...item,
    children: item.hasChildren
      ? materializeChildren(tree, item.path, limits)
      : []
  }));
}

function resourceDirectories(object) {
  const result = [];
  if (object.kind === "instance-family") {
    result.push(`${objectPath(object.id)}/members`);
  }
  if (object.kind === "stroke-bundle" ||
      object.geometry?.type === "stroke-bundle" ||
      object.geometry?.type === "tube") {
    result.push(`${objectPath(object.id)}/strokes`);
  } else if (geometryPoints(object.geometry)?.length) {
    result.push(`${objectPath(object.id)}/vertices`);
  }
  return result;
}

function familyForObject(object) {
  if (object?.kind !== "instance-family") return null;
  return normalizeExplicitInstanceFamily(object.family);
}

function familyMemberIndex(family, memberId) {
  if (!family) return -1;
  const ids = family.memberIds;
  if (Array.isArray(ids)) return ids.indexOf(String(memberId));
  const match = String(memberId).match(/(\d+)$/);
  const index = match ? Number(match[1]) - 1 : -1;
  return index >= 0 && index < family.count ? index : -1;
}

function strokeBundleForObject(object) {
  if (!object) return null;
  if (object.geometry?.type === "stroke-bundle") {
    return normalizeStrokeBundleDescriptor(object.geometry);
  }
  if (object.geometry?.type === "tube") {
    return normalizeStrokeBundleDescriptor({
      type: "stroke-bundle",
      strokes: [{
        id: `${String(object.id)}:stroke`,
        points: object.geometry.points,
        radius: object.geometry.radius,
        radialSegments: object.geometry.radialSegments,
        tubularSegments: object.geometry.tubularSegments,
        closed: object.geometry.closed,
        curveType: object.geometry.curveType,
        tension: object.geometry.tension
      }]
    });
  }
  return null;
}

function pointsForReference(object, reference) {
  if (reference.strokeId) {
    return strokeBundleFindStroke(
      strokeBundleForObject(object),
      reference.strokeId
    )?.points ?? null;
  }
  return geometryPoints(object.geometry);
}

function geometryPoints(geometry) {
  if (!geometry || typeof geometry !== "object") return null;
  if (Array.isArray(geometry.positions)) return geometry.positions;
  if (Array.isArray(geometry.points)) return geometry.points;
  return null;
}

function objectSummary(object) {
  if (object.kind === "instance-family") {
    return `${Number(object.family?.count ?? 0)} membros virtuais`;
  }
  if (object.kind === "stroke-bundle") {
    const bundle = normalizeStrokeBundleDescriptor(object.geometry);
    return `${bundle.strokeCount} traços · ${bundle.chunks.length} chunk(s)`;
  }
  if (object.kind === "group") return "grupo lógico";
  return `posição [${roundVector(object.position ?? [0, 0, 0])}]`;
}

function vertexDescriptor(path, objectId, index, point, revision, diagnostics) {
  return descriptor({
    id: String(index),
    path,
    ownerObjectId: String(objectId),
    kind: "vertex",
    label: `v${index}`,
    summary: `[${roundVector(point)}]`,
    childCount: 0,
    hasChildren: false,
    revision,
    propertyPaths: Object.freeze(["x", "y", "z"])
  }, diagnostics);
}

function descriptor(value, diagnostics) {
  diagnostics.descriptorsCreated += 1;
  return Object.freeze(value);
}

function page(items, offset, limit, total, revision) {
  const nextOffset = offset + items.length < total
    ? offset + items.length
    : null;
  return Object.freeze({
    items: Object.freeze(items),
    offset,
    limit,
    total,
    nextOffset,
    nextCursor: nextOffset === null ? null : encodeCursor(nextOffset),
    revision
  });
}

function objectPath(id) {
  return `/objects/${encodeURIComponent(String(id))}`;
}
function normalizePath(value) {
  const raw = String(value ?? "/").split(/[?#]/, 1)[0] || "/";
  return raw.length > 1 ? raw.replace(/\/+$/, "") : raw;
}
function normalizeOffset(value) {
  const number = Number(value ?? 0);
  if (!Number.isInteger(number) || number < 0) {
    throw new RangeError("offset deve ser inteiro não negativo.");
  }
  return number;
}
function normalizePageSize(value) {
  const number = Number(value ?? DEFAULT_PAGE_SIZE);
  if (!Number.isInteger(number) || number < 1 || number > MAX_PAGE_SIZE) {
    throw new RangeError(`limit deve estar entre 1 e ${MAX_PAGE_SIZE}.`);
  }
  return number;
}
function encodeCursor(offset) {
  return `offset:${offset}`;
}
function decodeCursor(value) {
  if (value === null || value === undefined || value === "") return 0;
  const match = String(value).match(/^offset:(\d+)$/);
  if (!match) throw new TypeError("Cursor de recursos inválido.");
  return Number(match[1]);
}
function axisFromProperty(property) {
  const axis = ({ x: 0, y: 1, z: 2 })[String(property)];
  if (axis === undefined) throw new RangeError(`Componente desconhecido: ${property}.`);
  return axis;
}
function readProperty(value, path) {
  return String(path).split(".").reduce(
    (current, key) => current == null ? null : current[key],
    value
  );
}
function roundVector(value) {
  return value.map(round).join(", ");
}
function round(value) {
  return Math.round(Number(value) * 1000) / 1000;
}
function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}
