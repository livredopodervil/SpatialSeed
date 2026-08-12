# SpatialSeed 0054f — recovery, wall jump and game events

0054f keeps gameplay transient and adds a small event/action layer inside game-runtime.

## Recovery

On `pagehide`, an active game session is synchronously stopped before the recovery snapshot is flushed. Runtime overlays, presentation mode and camera are therefore returned to authoring state before browser recovery persistence runs.

## Character support

Grounding now uses a thin support probe immediately below the feet with a horizontal inset. Vertical movement also insets X/Z by collision skin. Tangential contact with a wall is no longer interpreted as a ceiling/floor collision, so jumping next to a wall remains possible.

## Event contract

`GameEventRuntime` binds an event name and optional `objectId` to declarative actions. Built-in runtime events include `game.start`, `game.stop`, `game.tick` (only evaluated when bound), `character.jump`, `character.land`, `character.state` and `character.respawn`. Custom events can be emitted with `game.event.emit`.

Actions are intentionally adapters rather than dependencies on editor or renderer:

- `audio.music`: play/replace looping background music;
- `audio.music.stop`: stop background music;
- `audio.effect`: play a configured sound effect;
- `command`: invoke an existing command, therefore animation and affine commands can be reused without new coupling;
- `procedure`: run a procedure program and optionally commit its plan.

Example configuration:

```js
await runtime.execute("game.audio.configure", {
  music: { src: "assets/audio/theme.ogg", volume: 0.35 },
  effects: {
    jump: { src: "assets/audio/jump.wav", volume: 0.8 },
    land: { src: "assets/audio/land.wav", volume: 0.6 }
  }
});

await runtime.execute("game.events.configure", {
  bindings: [
    { event: "game.start", actions: [{ type: "audio.music" }] },
    { event: "character.jump", actions: [{ type: "audio.effect", name: "jump" }] },
    { event: "character.land", actions: [{ type: "audio.effect", name: "land" }] },
    { event: "custom.open-door", objectId: "door-1", actions: [
      { type: "command", command: "animation.preset", args: { id: "door-open", targetIds: ["door-1"] } }
    ] }
  ]
});
```

The event layer contains no Three.js, DOM, sandbox or editor dependency. Collision/trigger systems can publish object events later without changing its contract.
