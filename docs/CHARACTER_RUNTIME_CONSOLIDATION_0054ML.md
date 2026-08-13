# 0054ml — Character runtime consolidation

This increment removes the scale-compensation chain introduced after 0054mh and restores one authority per concern.

## Character contract

- `CharacterBodyFrame` is the physical authority. It stores body-local `centerOffset`, `halfExtents`, and `baseYaw`.
- Character movement updates world pose (`position`, `yaw`). The physical body is projected to a conservative world AABB from the oriented body frame for collision queries.
- `colliderHorizontalScale` defaults to `1`. The authoring proxy therefore represents the physical volume without a hidden 18% horizontal shrink.
- Camera-rig logic consumes the same body state used by physics. `camera.distance` is interpreted as clearance beyond the body surface, so resizing the body also resizes the nominal orbit.

## Visual projection

The GLB visual is not a child of the scalable physical proxy. `ThreeRegionRenderer` creates a scene-level runtime pose root and synchronizes only position and rotation from the physical proxy. Scale remains owned by the visual configuration.

Removed mechanisms:

- `scaleIsolationRoot`
- `referenceParentScale`
- `parentEffectiveScale`
- `parentCompensation`
- proxy-scale reconciliation from `createWebRuntime`

The generic animation backend defaults to `fit: none`. The web application assigns the built-in Fox its own initial visual scale (`0.01`). Changing the physical proxy therefore changes the body/collider, not the GLB geometry.

## Horizontal characters

A quadruped body can be longer along canonical `+X` than `+Z`. When yaw changes, `CharacterBodyFrame` rotates that body and projects a conservative AABB. A body that is 4 units long in X at yaw 0 becomes 4 units long in Z after a 90-degree turn.

This intentionally avoids coupling the generic collision world to Three.js or to animated skin geometry. A future OBB/SAT narrow phase can replace the conservative AABB projection behind the same body-frame contract.

## Input ownership

In game presentation mode the renderer's authoring pointer handlers return before selection, bounds scaling, or editing logic. Mouse/touch look remains owned by the game binding. The default demo is started only after `bindWebInterface().ready`, eliminating the previous timer-based startup dependency.

## Demo

The default demo keeps object 46 as the physical character proxy, rotation identity. Its initial sphere scale is elongated along canonical `+X` to represent a horizontal quadruped body while remaining independently editable.
