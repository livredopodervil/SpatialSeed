import {
  AnalyticTimeDomains,
  DependencyVersions,
  TemporalRuntime
} from "../packages/temporal-runtime/src/index.js?build=20260806-0050b";
import {
  AnimationCommandService,
  TemporalAnimationRuntime
} from "../packages/animation-runtime/src/index.js?build=20260806-0050c";
import {
  composeAnimationLayer,
  createAnimationTargetSnapshot
} from "../packages/renderer-three/src/AnimationTransformOverlay.js?build=20260806-0050c";
import { identityMatrix } from "../packages/math-affine/src/index.js";

let now = 0;
let selected = ["a"];
const domains = new AnalyticTimeDomains({ nowSeconds: () => now });
const temporal = new TemporalRuntime({
  domains,
  dependencies: new DependencyVersions()
});
const surface = createSurface();
const animation = new TemporalAnimationRuntime({
  surface,
  temporalRuntime: temporal,
  timeDomains: domains,
  now: () => now * 1000
});
const service = new AnimationCommandService({
  runtime: animation,
  selection: () => ({
    members: selected.map(objectId => ({ objectId }))
  })
});

service.preset("spin", { axis: "y", speed: 90 });
const firstId = service.status().activeInstanceId;
selected = ["b"];
service.preset("float", { amplitude: 1, frequency: 1 });
const secondId = service.status().activeInstanceId;

assert(firstId && secondId && firstId !== secondId,
  "cada início deve criar uma instância própria");
assert(service.status().instanceCount === 2,
  "objetos distintos devem manter duas animações");
assert(temporal.status().operationCount === 2,
  "cada instância deve registrar sua operação temporal");
assert(surface.overlays.size === 2,
  "cada instância deve possuir overlay próprio");

now = 1;
let cycle = await temporal.evaluateParallel({ snapshot: {} });
let consumed = animation.consumeTemporalEvents(cycle.events);
assert(consumed.instanceCount === 2,
  "eventos de instâncias diferentes devem ser consumidos em paralelo");
assert(surface.applied.size === 2,
  "ambos os overlays devem receber quadros");

let impact = service.sceneChanged([
  { type: "object-updated", objectId: "c" }
]);
assert(impact.changed === false && service.status().instanceCount === 2,
  "objeto não relacionado não pode interromper animações");

impact = service.sceneChanged([
  { type: "object-transform", objectId: "a" }
]);
assert(impact.stoppedInstanceIds.includes(firstId),
  "alterar o objeto a deve parar apenas sua instância");
assert(service.status().instanceCount === 1,
  "a animação de b deve continuar");
assert(service.status().instances[0].instanceId === secondId,
  "a instância não relacionada deve ser preservada");

selected = ["b"];
service.preset("pulse", { amplitude: 0.25, frequency: 2 });
const thirdId = service.status().activeInstanceId;
assert(service.status().instanceCount === 2,
  "o mesmo objeto deve aceitar camadas de animação concorrentes");
assert(surface.overlays.size === 2,
  "camadas concorrentes do mesmo objeto devem ser independentes");

service.pause({ instanceId: secondId });
assert(instance(service.status(), secondId).state === "paused",
  "pausar uma instância não deve pausar as demais");
assert(instance(service.status(), thirdId).state === "playing",
  "a camada concorrente deve continuar executando");
service.resume({ instanceId: secondId });
service.stop({ instanceId: thirdId });
assert(service.status().instanceCount === 1,
  "parar uma camada não deve remover outra camada do mesmo objeto");
assert(surface.overlays.has(overlayOf(service.status(), secondId)),
  "overlay restante deve continuar registrado");

service.stopAll();
assert(service.status().instanceCount === 0,
  "parar todas deve remover todas as instâncias");
assert(surface.overlays.size === 0,
  "parar todas deve restaurar todos os overlays");
assert(temporal.status().operationCount === 0,
  "nenhuma operação temporal deve permanecer");

const targets = createAnimationTargetSnapshot([{
  unitId: "group",
  sourceId: "group",
  pivot: [0, 0, 0],
  objects: [
    { objectId: "a", baseMatrix: identityMatrix() },
    { objectId: "b", baseMatrix: identityMatrix() }
  ]
}]);
const delta = identityMatrix();
delta[12] = 3;
const layer = composeAnimationLayer(targets, [{
  unitId: "group",
  matrix: delta,
  color: "#112233"
}]);
assert(layer.transforms.length === 2,
  "uma camada de grupo deve gerar deltas por objeto");
assert(layer.transforms.every(entry => entry.matrix[12] === 3),
  "o renderer deve receber o delta, não matriz absoluta capturada");

console.log("Independent animation overlays: 18/18 testes aprovados.");

function createSurface() {
  return {
    overlays: new Map(),
    applied: new Map(),
    captureAnimationTargets(ids, { overlayId } = {}) {
      if (this.overlays.has(overlayId)) {
        throw new Error(`overlay repetido: ${overlayId}`);
      }
      const snapshot = Object.freeze({
        overlayId,
        units: Object.freeze(ids.map(id => Object.freeze({
          unitId: id,
          sourceId: id,
          pivot: Object.freeze([0, 0, 0]),
          objects: Object.freeze([Object.freeze({
            objectId: id,
            baseMatrix: Object.freeze(identityMatrix())
          })])
        })))
      });
      this.overlays.set(overlayId, snapshot);
      return snapshot;
    },
    applyAnimationFrame(_targets, frame, { overlayId } = {}) {
      if (!this.overlays.has(overlayId)) {
        throw new Error(`overlay ausente: ${overlayId}`);
      }
      this.applied.set(overlayId, structuredClone(frame));
      return Object.freeze({
        changed: true,
        matrixWrites: frame.length,
        colorWrites: 0,
        pivotWrites: frame.length
      });
    },
    restoreAnimationTargets(_targets, { overlayId } = {}) {
      const changed = this.overlays.delete(overlayId);
      this.applied.delete(overlayId);
      return Object.freeze({ changed, restored: changed ? 1 : 0 });
    },
    getAnimationSurfaceDiagnostics() {
      return Object.freeze({ activeOverlays: this.overlays.size });
    }
  };
}

function instance(status, instanceId) {
  return status.instances.find(entry => entry.instanceId === instanceId);
}

function overlayOf(status, instanceId) {
  return instance(status, instanceId)?.overlayId;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
