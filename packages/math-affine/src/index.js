export {
  AffineTransformError,
  identityMatrix, multiplyMatrices, translationMatrix, scaleMatrix,
  eulerQuaternion, quaternionMatrix, composeTransform, decomposeTransform,
  decomposeTransformStrict, invertAffineMatrix,
  aroundPivot, validateMatrix, validateAffineMatrix
} from "./Matrix4.js";
export { composeAffineOperations, affineCopies } from "./AffineSequence.js";
export { resolvePlacementFrame } from "./PlacementFrame.js";
