import {
  normalizePlanarFrame,
  planarFrameCoordinates,
  planarFramePoint
} from "../../edit-context/src/PlanarFrame.js?build=20260729-0040b";

const DEG_TO_RAD = Math.PI / 180;

export function constrainPlanarPoint({
  frame,
  point,
  anchor = null,
  gridStep = null,
  angleStepDegrees = null,
  axes = { x: true, y: true }
} = {}) {
  const normalizedFrame = normalizePlanarFrame(frame);
  const local = [...planarFrameCoordinates(normalizedFrame, point)];
  const anchorLocal = anchor
    ? [...planarFrameCoordinates(normalizedFrame, anchor)]
    : null;
  const step = positiveOrNull(gridStep);
  const angleStep = positiveOrNull(angleStepDegrees);
  const allowX = axes?.x !== false;
  const allowY = axes?.y !== false;

  if (step) {
    local[0] = Math.round(local[0] / step) * step;
    local[1] = Math.round(local[1] / step) * step;
  }

  if (anchorLocal) {
    if (!allowX) local[0] = anchorLocal[0];
    if (!allowY) local[1] = anchorLocal[1];
    if (allowX && allowY && angleStep) {
      const dx = local[0] - anchorLocal[0];
      const dy = local[1] - anchorLocal[1];
      const radius = Math.hypot(dx, dy);
      if (radius > 1e-12) {
        const radians = angleStep * DEG_TO_RAD;
        const angle = Math.round(Math.atan2(dy, dx) / radians) * radians;
        local[0] = anchorLocal[0] + Math.cos(angle) * radius;
        local[1] = anchorLocal[1] + Math.sin(angle) * radius;
      }
    }
  }

  local[2] = 0;
  return planarFramePoint(normalizedFrame, local);
}

function positiveOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}
