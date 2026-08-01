import {
  normalizeHudComponentDescriptor,
  normalizeHudComponentRuntime
} from "../../ui-contracts/src/index.js?build=20260801-0046d";
import { DescriptorRegistry } from "./DescriptorRegistry.js?build=20260801-0046d";

export class HudComponentRegistry extends DescriptorRegistry {
  static apiVersion = "hud-component-registry-v1";

  constructor() {
    super({
      kind: "componente HUD",
      normalize: value => normalizeHudComponentDescriptor(value)
    });
  }

  register(value, { runtime = null, replace = false } = {}) {
    return super.register(value, {
      replace,
      runtime: runtime ? normalizeHudComponentRuntime(runtime) : null
    });
  }
}
