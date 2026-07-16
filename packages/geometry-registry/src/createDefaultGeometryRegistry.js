import { GeometryRegistry } from "./GeometryRegistry.js";
import { BoxGeometryProvider } from "./providers/BoxGeometryProvider.js";
import { SphereGeometryProvider } from "./providers/SphereGeometryProvider.js";
import { CylinderGeometryProvider } from "./providers/CylinderGeometryProvider.js";
import { PlaneGeometryProvider } from "./providers/PlaneGeometryProvider.js";
import { PolygonGeometryProvider } from "./providers/PolygonGeometryProvider.js";

export function createDefaultGeometryRegistry() {
  return new GeometryRegistry()
    .register(BoxGeometryProvider)
    .register(SphereGeometryProvider)
    .register(CylinderGeometryProvider)
    .register(PlaneGeometryProvider)
    .register(PolygonGeometryProvider);
}
