import { decomposeTransformStrict } from "../../math-affine/src/index.js";

export const TOOL_PIVOT_VERSION = "tool-pivot-v1";

/** Pivot belongs to an edit/tool session, never to geometry. */
export class ToolPivotResolver {
  #hierarchy;
  constructor({ transformHierarchy } = {}) {
    if (!transformHierarchy?.anchor || !transformHierarchy?.worldMatrix) {
      throw new TypeError("ToolPivotResolver exige TransformHierarchy.");
    }
    this.#hierarchy = transformHierarchy;
  }

  resolve({
    targets = [],
    active = null,
    mode = "target-anchor",
    customWorld = null,
    reference = null,
    orientation = "local"
  } = {}) {
    const canonical = this.#hierarchy.canonicalize(targets);
    if (!canonical.length) return null;
    const activeRef = active
      ? canonical.find(ref => this.#hierarchy.id(ref) === this.#hierarchy.id(active)) ?? canonical.at(-1)
      : canonical.at(-1);
    let position;
    if (mode === "world") position = [0, 0, 0];
    else if (mode === "custom") position = vector3(customWorld);
    else if (mode === "other-anchor") {
      if (!reference) throw new TypeError("Pivot other-anchor exige reference.");
      position = [...this.#hierarchy.anchor(reference).world];
    } else if (mode === "median") {
      position = median(canonical.map(ref => this.#hierarchy.anchor(ref).world));
    } else {
      position = [...this.#hierarchy.anchor(activeRef).world];
    }

    let quaternion = [0, 0, 0, 1];
    if (orientation === "local") {
      const world = this.#hierarchy.worldMatrix(activeRef);
      quaternion = [...decomposeTransformStrict(world).rotation];
    } else if (orientation === "reference" && reference) {
      quaternion = [...decomposeTransformStrict(this.#hierarchy.worldMatrix(reference)).rotation];
    }
    return Object.freeze({
      version: TOOL_PIVOT_VERSION,
      mode,
      orientation,
      target: activeRef,
      position: Object.freeze(position),
      rotation: Object.freeze(quaternion)
    });
  }
}

function median(points) {
  const sum = [0, 0, 0];
  for (const p of points) { sum[0] += p[0]; sum[1] += p[1]; sum[2] += p[2]; }
  return sum.map(v => v / points.length);
}
function vector3(value) {
  if (!Array.isArray(value) || value.length !== 3) throw new TypeError("Pivot custom exige [x,y,z].");
  const result = value.map(Number);
  if (!result.every(Number.isFinite)) throw new TypeError("Pivot custom inválido.");
  return result;
}
