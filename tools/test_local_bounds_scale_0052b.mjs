import {
  createLocalBoundsScaleHandleSet,
  proportionalScaleFactor2D,
  scaleFactorsForAxes,
  scaleWorldTrsWithoutShear
} from "../packages/renderer-three/src/LocalBoundsScale.js?build=20260807-0052b";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const handles3d = createLocalBoundsScaleHandleSet({
  min: [-1, -2, -3],
  max: [1, 2, 3],
  axes: { x: true, y: true, z: true }
});
assert(handles3d.dimensions === 3, "bounds 3D perdeu dimensão");
assert(handles3d.handles.length === 8, "bounds 3D deve produzir 8 controles diagonais/cantos");
for (const handle of handles3d.handles) {
  assert(Number.isInteger(handle.oppositeIndex), "handle sem oposto");
  assert(handles3d.handles[handle.oppositeIndex].oppositeIndex === handle.index, "oposto não é simétrico");
}

const handles2d = createLocalBoundsScaleHandleSet({
  min: [-1, -2, 0],
  max: [1, 2, 0],
  axes: { x: true, y: true, z: true }
});
assert(handles2d.dimensions === 2, "bounds planar não detectado");
assert(handles2d.handles.length === 4, "bounds planar deve produzir 4 controles diagonais/cantos");

const factor = proportionalScaleFactor2D({
  fixed: [0, 0],
  initial: [100, 0],
  current: [200, 0]
});
assert(Math.abs(factor - 2) < 1e-9, "fator proporcional 2D incorreto");
assert(JSON.stringify(scaleFactorsForAxes(2, { x: true, y: false, z: true })) === JSON.stringify([2, 1, 2]), "máscara de eixos incorreta");

const scaled = scaleWorldTrsWithoutShear({
  matrixWorld: [
    1,0,0,0,
    0,1,0,0,
    0,0,1,0,
    2,0,0,1
  ],
  pivotWorld: [0,0,0],
  frameQuaternion: [0,0,0,1],
  factors: [2,2,2]
});
assert(Math.abs(scaled[12] - 4) < 1e-9, "posição não escalou em torno do pivô");

console.log("0052b local-bounds scale: 5/5 testes aprovados.");
