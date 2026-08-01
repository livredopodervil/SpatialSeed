import {
  normalizeExplicitInstanceFamily,
  explicitFamilyTransformAt,
  familyMemberResourcePath
} from "../../procedural-families/src/index.js?build=20260731-0044a";
import {
  normalizeStrokeBundleDescriptor,
  strokeResourcePath
} from "../../stroke-resources/src/index.js?build=20260731-0044a";

export function buildResourceTree({
  objects = [],
  maxMembers = 128,
  maxStrokes = 128,
  maxVertices = 128
} = {}) {
  if (!Array.isArray(objects)) {
    throw new TypeError("A árvore de recursos exige objetos.");
  }
  const byId = new Map(objects.map(object => [String(object.id), object]));
  const children = new Map(objects.map(object => [String(object.id), []]));
  const roots = [];
  for (const object of objects) {
    const id = String(object.id);
    const parentId = object.parentId == null
      ? null
      : String(object.parentId);
    if (parentId && children.has(parentId)) children.get(parentId).push(id);
    else roots.push(id);
  }
  const limits = normalizeLimits({ maxMembers, maxStrokes, maxVertices });
  const nodes = roots.map(id => objectNode(id, byId, children, limits));
  return deepFreeze({
    schemaVersion: "spatialseed-resource-tree-v1",
    path: "/",
    kind: "root",
    label: "Mundo",
    childCount: nodes.length,
    children: nodes
  });
}

export function resourceOwnerObjectId(path) {
  const match = String(path ?? "").match(/^\/objects\/([^/]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

export function parseResourcePath(path) {
  const normalized = String(path ?? "");
  const ownerObjectId = resourceOwnerObjectId(normalized);
  if (!ownerObjectId) return null;
  const member = normalized.match(/^\/objects\/[^/]+\/members\/([^/]+)$/);
  if (member) {
    return Object.freeze({
      kind: "family-member",
      ownerObjectId,
      memberId: decodeURIComponent(member[1]),
      path: normalized
    });
  }
  const stroke = normalized.match(/^\/objects\/[^/]+\/strokes\/([^/]+)$/);
  if (stroke) {
    return Object.freeze({
      kind: "stroke",
      ownerObjectId,
      strokeId: decodeURIComponent(stroke[1]),
      path: normalized
    });
  }
  const strokeVertex = normalized.match(
    /^\/objects\/[^/]+\/strokes\/([^/]+)\/vertices\/(\d+)$/
  );
  if (strokeVertex) {
    return Object.freeze({
      kind: "vertex",
      ownerObjectId,
      strokeId: decodeURIComponent(strokeVertex[1]),
      vertexIndex: Number(strokeVertex[2]),
      path: normalized
    });
  }
  const vertex = normalized.match(
    /^\/objects\/[^/]+\/vertices\/(\d+)$/
  );
  if (vertex) {
    return Object.freeze({
      kind: "vertex",
      ownerObjectId,
      vertexIndex: Number(vertex[1]),
      path: normalized
    });
  }
  if (normalized === objectPath(ownerObjectId)) {
    return Object.freeze({
      kind: "object",
      ownerObjectId,
      path: normalized
    });
  }
  return Object.freeze({
    kind: "resource",
    ownerObjectId,
    path: normalized
  });
}

function objectNode(id, byId, childrenById, limits) {
  const object = byId.get(id);
  const path = objectPath(id);
  const hierarchyChildren = (childrenById.get(id) ?? []).map(childId =>
    objectNode(childId, byId, childrenById, limits)
  );
  const resources = objectResources(object, path, limits);
  return deepFreeze({
    id,
    path,
    ownerObjectId: id,
    kind: String(object.kind ?? object.geometry?.type ?? "object"),
    label: String(object.name ?? id),
    summary: objectSummary(object),
    childCount: hierarchyChildren.length + resources.length,
    children: [...hierarchyChildren, ...resources]
  });
}

function objectResources(object, path, limits) {
  if (object.kind === "instance-family") {
    const family = normalizeExplicitInstanceFamily(object.family);
    const shown = Math.min(family.count, limits.maxMembers);
    const members = Array.from({ length: shown }, (_, index) => {
      const transform = explicitFamilyTransformAt(family, index, {});
      return deepFreeze({
        id: transform.memberId,
        path: familyMemberResourcePath(object.id, transform.memberId),
        ownerObjectId: String(object.id),
        kind: "family-member",
        label: transform.memberId,
        summary: `posição [${roundVector(transform.position)}]`,
        childCount: 0,
        children: []
      });
    });
    return [directoryNode({
      path: `${path}/members`,
      ownerObjectId: object.id,
      label: `Membros (${family.count})`,
      kind: "members",
      children: members,
      omitted: family.count - shown
    })];
  }
  if (object.kind === "stroke-bundle" ||
      object.geometry?.type === "stroke-bundle") {
    const bundle = normalizeStrokeBundleDescriptor(object.geometry);
    const shown = Math.min(bundle.strokes.length, limits.maxStrokes);
    const strokes = bundle.strokes.slice(0, shown).map(stroke => {
      const strokePath = strokeResourcePath(object.id, stroke.id);
      const vertexCount = stroke.points.length;
      const shownVertices = Math.min(vertexCount, limits.maxVertices);
      return deepFreeze({
        id: stroke.id,
        path: strokePath,
        ownerObjectId: String(object.id),
        kind: "stroke",
        label: stroke.id,
        summary: `${vertexCount} pontos · raio ${round(stroke.radius)}`,
        childCount: vertexCount,
        children: [directoryNode({
          path: `${strokePath}/vertices`,
          ownerObjectId: object.id,
          label: `Vértices (${vertexCount})`,
          kind: "vertices",
          children: stroke.points.slice(0, shownVertices).map((point, index) =>
            vertexNode(`${strokePath}/vertices/${index}`, object.id, index, point)
          ),
          omitted: vertexCount - shownVertices
        })]
      });
    });
    return [directoryNode({
      path: `${path}/strokes`,
      ownerObjectId: object.id,
      label: `Traços (${bundle.strokes.length})`,
      kind: "strokes",
      children: strokes,
      omitted: bundle.strokes.length - shown
    })];
  }
  const points = geometryPoints(object.geometry);
  if (!points.length) return [];
  const shown = Math.min(points.length, limits.maxVertices);
  return [directoryNode({
    path: `${path}/vertices`,
    ownerObjectId: object.id,
    label: `Vértices (${points.length})`,
    kind: "vertices",
    children: points.slice(0, shown).map((point, index) =>
      vertexNode(`${path}/vertices/${index}`, object.id, index, point)
    ),
    omitted: points.length - shown
  })];
}

function directoryNode({
  path,
  ownerObjectId,
  label,
  kind,
  children,
  omitted = 0
}) {
  const result = [...children];
  if (omitted > 0) {
    result.push(deepFreeze({
      id: `${path}:omitted`,
      path: `${path}?offset=${children.length}`,
      ownerObjectId: String(ownerObjectId),
      kind: "continuation",
      label: `… ${omitted} recurso(s) não materializado(s)`,
      summary: "Use a API de recursos para paginação.",
      childCount: 0,
      children: []
    }));
  }
  return deepFreeze({
    id: path,
    path,
    ownerObjectId: String(ownerObjectId),
    kind,
    label,
    summary: "",
    childCount: children.length + omitted,
    children: result
  });
}

function vertexNode(path, objectId, index, point) {
  return deepFreeze({
    id: String(index),
    path,
    ownerObjectId: String(objectId),
    kind: "vertex",
    label: `v${index}`,
    summary: `[${roundVector(point)}]`,
    childCount: 0,
    children: []
  });
}

function geometryPoints(geometry) {
  if (!geometry || typeof geometry !== "object") return [];
  if (Array.isArray(geometry.positions)) return geometry.positions;
  if (Array.isArray(geometry.points)) return geometry.points;
  return [];
}

function objectSummary(object) {
  if (object.kind === "instance-family") {
    return `${Number(object.family?.count ?? 0)} membros virtuais`;
  }
  if (object.kind === "stroke-bundle") {
    return `${Number(object.geometry?.strokes?.length ?? 0)} traços compactados`;
  }
  if (object.kind === "group") return "grupo lógico";
  return `posição [${roundVector(object.position ?? [0, 0, 0])}]`;
}

function objectPath(id) {
  return `/objects/${encodeURIComponent(String(id))}`;
}
function normalizeLimits(value) {
  const result = {};
  for (const [name, fallback] of [
    ["maxMembers", 128],
    ["maxStrokes", 128],
    ["maxVertices", 128]
  ]) {
    const number = Number(value[name] ?? fallback);
    if (!Number.isInteger(number) || number < 1 || number > 10000) {
      throw new RangeError(`${name} deve ser inteiro entre 1 e 10000.`);
    }
    result[name] = number;
  }
  return result;
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
