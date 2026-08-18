import {
  InteractionRuntime
} from "../../interaction-runtime/src/index.js?build=20260818-0054mx";

export const GAME_EVENT_RUNTIME_VERSION =
  "game-event-runtime-v2-interaction-sources";

/**
 * Compatibility name for game integrations. Event/action evaluation is now
 * owned by the renderer-independent InteractionRuntime and can also be used by
 * exported applications without the authoring shell.
 */
export class GameEventRuntime extends InteractionRuntime {}
