export {
  INSTANCE_GRAPH_VERSION,
  INSTANCE_NODE_KIND,
  emptyInstanceGraph,
  normalizeInstanceGraph,
  hasInstanceGraph,
  isInstanceNode,
  instanceDefinition,
  resolveInstanceNode,
  compactHierarchyRoots,
  compactSceneToInstanceGraph,
  duplicateReferenceRoots,
  replaceInstanceObjectDefinition,
  assemblyChildrenForInstance,
  ungroupAssemblyInstance,
  projectInstanceGraphObject,
  projectInstanceGraphRoot,
  projectInstanceGraphScene,
  projectInstanceGraphChanges,
  validateInstanceGraph,
  instanceGraphDiagnostics
} from "./InstanceGraph.js";

export { InstanceGraphProjectionCache } from "./InstanceGraphProjectionCache.js?build=20260807-0052a";
