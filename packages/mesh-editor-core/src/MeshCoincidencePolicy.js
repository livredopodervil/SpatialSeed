import {
  componentVertices
} from "./MeshTopologyOperations.js";
import {
  expandCoincidentSelection
} from "./MeshEditMath.js";

export const MESH_COINCIDENCE_POLICIES = Object.freeze([
  "independent",
  "transform-together"
]);

export function normalizeMeshCoincidencePolicy(
  value = "transform-together"
) {
  const normalized = String(value ?? "transform-together")
    .trim()
    .toLowerCase();
  if (!MESH_COINCIDENCE_POLICIES.includes(normalized)) {
    throw new RangeError(`Política de coincidência desconhecida: ${value}.`);
  }
  return normalized;
}

export function resolveTransformVertexSelection({
  topology,
  componentMode,
  selectedComponents,
  coincidentGroups,
  policy = "transform-together"
} = {}) {
  const normalizedPolicy = normalizeMeshCoincidencePolicy(policy);
  const selectedVertices = componentVertices(
    topology,
    componentMode,
    selectedComponents
  );
  if (normalizedPolicy === "independent") {
    return Object.freeze([...selectedVertices]);
  }
  return Object.freeze(
    expandCoincidentSelection(selectedVertices, coincidentGroups)
  );
}
