import { ungroupWithTransformKernel } from "../../transform-hierarchy/src/index.js";
import { HierarchyError, HierarchyIndex } from "./HierarchyIndex.js";

export function ungroupNodes(nodes, options = {}) {
  const hierarchy = new HierarchyIndex(nodes);
  for (const value of options.groupIds ?? []) {
    const id = String(value ?? "").trim();
    const node = hierarchy.node(id);
    if (node.kind !== "group" && node.instanceKind !== "assembly") {
      throw new HierarchyError("NOT_A_GROUP", `Nó não é um grupo: ${id}.`, { id });
    }
  }
  return ungroupWithTransformKernel(nodes, options);
}
