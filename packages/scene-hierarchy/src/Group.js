import { groupWithTransformKernel } from "../../transform-hierarchy/src/index.js";
import { HierarchyError, HierarchyIndex } from "./HierarchyIndex.js";

export function groupNodes(nodes, options = {}) {
  const hierarchy = new HierarchyIndex(nodes);
  const id = String(options.groupId ?? "").trim();
  if (!id) throw new HierarchyError("INVALID_GROUP_ID", "Identificador inválido.");
  if (hierarchy.has(id)) {
    throw new HierarchyError(
      "DUPLICATE_NODE_ID",
      `Identificador de grupo já existe: ${id}.`,
      { id }
    );
  }
  for (const value of options.targetIds ?? []) hierarchy.node(String(value));
  try {
    return groupWithTransformKernel(nodes, options);
  } catch (error) {
    if (error?.code) throw error;
    if (String(error?.message ?? "").includes("Agrupamento exige ao menos")) {
      throw new HierarchyError("EMPTY_GROUP", error.message);
    }
    throw error;
  }
}
