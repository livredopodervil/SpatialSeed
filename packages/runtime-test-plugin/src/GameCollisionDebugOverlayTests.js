import {
  GameCollisionDebugOverlay
} from "../../renderer-three/src/index.js?build=20260818-0054mu";

export function createGameCollisionDebugOverlayTests() {
  return {
    "overlay distingue body grounded formas e contatos sem DOM"() {
      const overlay = new GameCollisionDebugOverlay({ maximumColliders: 4 });
      const updated = overlay.update({
        enabled: true,
        grounded: true,
        characterBody: {
          center: [0, 0.5, 0],
          halfExtents: [1, 0.5, 0.25],
          axes: [[0, 0, -1], [0, 1, 0], [1, 0, 0]]
        },
        characterBounds: { min: [-0.5, 0, -0.5], max: [0.5, 1, 0.5] },
        contacts: [{ point: [0, 0, 0], normal: [0, 1, 0] }],
        colliders: [
          {
            id: "floor",
            broadBounds: { min: [-4, -1, -4], max: [4, 0, 4] },
            collider: {
              type: "local-box",
              localBounds: { min: [-4, -0.5, -4], max: [4, 0.5, 4] },
              worldMatrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, -0.5, 0, 1]
            }
          },
          {
            id: "ball",
            broadBounds: { min: [1, 0, 1], max: [3, 2, 3] },
            collider: { type: "sphere", center: [2, 1, 2], radius: 1 }
          }
        ]
      });
      assertEqual(updated, true);
      assertEqual(overlay.object.visible, true);
      assertEqual(
        overlay.object.children.some(child =>
          child.name === "collision-debug:character"
        ),
        true
      );
      const character = overlay.object.children.find(child =>
        child.name === "collision-debug:character"
      );
      assertNear(character.matrix.elements[2], -2, 1e-9);
      assertNear(character.matrix.elements[8], 0.5, 1e-9);
      assertEqual(
        overlay.object.children.some(child =>
          child.name === "collision-debug:floor"
        ),
        true
      );
      assertEqual(overlay.update(null), false);
      assertEqual(overlay.object.visible, false);
      overlay.dispose();
    }
  };
}

function assertEqual(actual, expected) {
  if (!Object.is(actual, expected)) {
    throw new Error(
      `Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}.`
    );
  }
}

function assertNear(actual, expected, tolerance) {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(
      `Expected ${actual} to be within ${tolerance} of ${expected}.`
    );
  }
}
