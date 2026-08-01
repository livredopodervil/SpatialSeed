import { GeometryRegistry } from "./GeometryRegistry.js";
import { BoxGeometryProvider } from "./providers/BoxGeometryProvider.js";
import { SphereGeometryProvider } from "./providers/SphereGeometryProvider.js";
import { CylinderGeometryProvider } from "./providers/CylinderGeometryProvider.js";
import { PlaneGeometryProvider } from "./providers/PlaneGeometryProvider.js";
import { PolygonGeometryProvider } from "./providers/PolygonGeometryProvider.js";
import {
  THREE_PRIMITIVE_GEOMETRY_PROVIDERS
} from "./providers/ThreePrimitiveGeometryProviders.js";
import { LatheGeometryProvider } from "./providers/LatheGeometryProvider.js";
import { TubeGeometryProvider } from "./providers/TubeGeometryProvider.js";
import { ShapeGeometryProvider } from "./providers/ShapeGeometryProvider.js";
import { ExtrudeGeometryProvider } from "./providers/ExtrudeGeometryProvider.js";
import { PolyhedronGeometryProvider } from "./providers/PolyhedronGeometryProvider.js";
import { BufferGeometryProvider } from "./providers/BufferGeometryProvider.js";
import { StrokeBundleGeometryProvider } from "./providers/StrokeBundleGeometryProvider.js?build=20260801-0045a";

export function createDefaultGeometryRegistry() {
  const registry = new GeometryRegistry()
    .register(BoxGeometryProvider)
    .register(SphereGeometryProvider)
    .register(CylinderGeometryProvider)
    .register(PlaneGeometryProvider)
    .register(PolygonGeometryProvider);

  for (const provider of THREE_PRIMITIVE_GEOMETRY_PROVIDERS) {
    registry.register(provider);
  }

  return registry
    .register(LatheGeometryProvider)
    .register(TubeGeometryProvider)
    .register(ShapeGeometryProvider)
    .register(ExtrudeGeometryProvider)
    .register(PolyhedronGeometryProvider)
    .register(BufferGeometryProvider)
    .register(StrokeBundleGeometryProvider);
}
