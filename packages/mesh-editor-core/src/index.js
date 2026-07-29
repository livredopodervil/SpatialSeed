export { MeshEditController } from "./MeshEditController.js?build=20260729-0039g2";
export { buildMeshTopology, geodesicVertexDistances, closestPointOnSegment } from "./MeshTopology.js";
export {
  DEFAULT_MESH_DEFORMATION_SETTINGS,
  applyMeshDeformation,
  createMeshInfluenceField,
  evaluateMeshFalloff,
  normalizeMeshDeformationSettings,
  transformLocalPositionsWithInfluenceInto
} from "./MeshDeformation.js";
export {
  MESH_CONSTRAINTS,
  affineDeltaWorld,
  assertInvertibleWorldMatrix,
  cameraFrameQuaternion,
  constrainAffineValue,
  constrainWorldDeltaMatrix,
  composeRotationFrame,
  coincidentVertexGroups,
  expandCoincidentSelection,
  frameVectorToWorld,
  meshConstraintMask,
  normalizeMeshConstraint,
  pointInFrame,
  projectWorldDeltaToConstraint,
  selectedVertexPivotWorld,
  snapWorldPointToFrameGrid,
  transformLocalPositions,
  transformLocalPositionsInto,
  translatePivotToWorld
} from "./MeshEditMath.js";

export {
  MESH_COMPONENT_MODES,
  applyMeshTopologyOperation,
  componentVertices,
  meshSelectionOperation,
  normalizeMeshComponentMode,
  topologyOf
} from "./MeshTopologyOperations.js";
