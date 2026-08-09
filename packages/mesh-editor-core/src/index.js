export { MeshEditController } from "./MeshEditController.js?build=20260807-0052c";
export { buildMeshTopology, geodesicVertexDistances, closestPointOnSegment } from "./MeshTopology.js";
export {
  DEFAULT_MESH_DEFORMATION_SETTINGS,
  applyMeshDeformation,
  createMeshInfluenceField,
  evaluateMeshFalloff,
  normalizeMeshDeformationSettings,
  transformLocalPositionsWithInfluenceInto
} from "./MeshDeformation.js?build=20260804-0048i-audit1";
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
} from "./MeshTopologyOperations.js?build=20260804-0048i-audit1";

export {
  MESH_COINCIDENCE_POLICIES,
  normalizeMeshCoincidencePolicy,
  resolveTransformVertexSelection
} from "./MeshCoincidencePolicy.js";

export {
  MESH_NORMAL_POLICIES,
  classifyMeshDescriptorChange,
  normalizeMeshNormalPolicy,
  prepareMeshCommitDescriptor,
  recomputeLocalVertexNormals,
  recomputeVertexNormals
} from "../../mesh-attributes/src/index.js?build=20260804-0048h1";

export {
  DEFAULT_MESH_TOOLS,
  MeshToolRegistry,
  createDefaultMeshToolRegistry
} from "../../mesh-tool-registry/src/index.js";

export {
  buildGeometricVertexIdentity,
  expandGeometricValues,
  geometricIndicesForVertices,
  renderVerticesForGeometricIndices
} from "../../mesh-geometric-identity/src/index.js?build=20260804-0048i-audit1";
