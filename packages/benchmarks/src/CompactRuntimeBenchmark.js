import { Region } from "../../core/src/Region.js";
import { Sandbox } from "../../core/src/Sandbox.js";
import {
  explicitInstanceFamilyEstimatedBytes,
  packAnchoredExplicitInstanceFamily
} from "../../procedural-families/src/index.js";
import {
  appendStrokeToBundle,
  strokeBundleEstimatedBytes,
  strokeBundleFromStroke
} from "../../stroke-resources/src/index.js";
import {
  createVirtualResourceTree
} from "../../resource-tree/src/index.js";
import { InstanceBatchManager } from "../../instance-batches/src/index.js";
import * as THREE from "three";
import { summarizeSamples } from "./BenchmarkStatistics.js";

export const COMPACT_BASELINE_VERSION = "compact-runtime-baseline-v1";

export const COMPACT_BASELINE_SCALE = Object.freeze({
  instanceCount: 10000,
  strokeCount: 1000,
  sceneObjectCount: 10000,
  transformCount: 100,
  pageSize: 25
});

export const COMPACT_BASELINE_LIMITS = Object.freeze({
  familyEstimatedBytes: 417808,
  familyJsonBytes: 397097,
  instanceBatchCount: 1,
  instanceMatrixBytes: 640000,
  strokeBundleEstimatedBytes: 124932,
  strokeBundleJsonBytes: 198667,
  strokeChunkCount: 8,
  sceneSerializedBytes: 1819009,
  virtualPageDescriptors: 25
});

export function createCompactRuntimeBenchmark({
  reducer,
  measureScene,
  options = {}
}) {
  if (typeof reducer !== "function") {
    throw new TypeError("Compact benchmark requires a reducer.");
  }
  if (typeof measureScene !== "function") {
    throw new TypeError("Compact benchmark requires a scene measurement.");
  }

  const {
    instanceCount = COMPACT_BASELINE_SCALE.instanceCount,
    strokeCount = COMPACT_BASELINE_SCALE.strokeCount,
    sceneObjectCount = COMPACT_BASELINE_SCALE.sceneObjectCount,
    transformCount = COMPACT_BASELINE_SCALE.transformCount,
    pageSize = COMPACT_BASELINE_SCALE.pageSize,
    samples = 5
  } = options;
  const members = integer(instanceCount, 1, 100000, "instanceCount");
  const strokes = integer(strokeCount, 1, 100000, "strokeCount");
  const sceneObjects = integer(
    sceneObjectCount,
    1,
    100000,
    "sceneObjectCount"
  );
  const transforms = Math.min(
    integer(transformCount, 1, 100000, "transformCount"),
    sceneObjects
  );
  const pageItems = Math.min(
    integer(pageSize, 1, 1000, "pageSize"),
    members
  );
  const repetitions = integer(samples, 1, 20, "samples");

  const instances = Array.from({ length: members }, (_, index) => ({
    id: `member-${index}`,
    position: [index % 100, Math.floor(index / 100), index * 0.001],
    rotation: [0, 0, 0, 1],
    scale: [1, 1, 1]
  }));
  const familySample = sampleOperation(repetitions, () =>
    packAnchoredExplicitInstanceFamily(instances, {
      anchorPolicy: "bounds"
    })
  );
  const family = familySample.value.family;

  const matrices = Array.from({ length: members }, (_, index) =>
    new THREE.Matrix4().makeTranslation(
      index % 100,
      Math.floor(index / 100),
      0
    )
  );
  const batchSample = sampleOperation(repetitions, () => {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshBasicMaterial();
    const manager = new InstanceBatchManager();
    for (let index = 0; index < members; index += 1) {
      manager.add({
        objectId: `object-${index}`,
        batchKey: "compact-baseline",
        matrix: matrices[index],
        descriptor: { geometry, material, capacity: members }
      });
    }
    const stats = manager.stats();
    manager.clear({ disposeGeometry: true, disposeMaterial: true });
    return stats;
  });

  const strokeDescriptors = Array.from({ length: strokes }, (_, index) => ({
    id: `stroke-${index}`,
    points: [[index, 0, 0], [index + 0.5, 0.25, 0]],
    radius: 0.02,
    radialSegments: 4,
    tubularSegments: 2,
    curveType: "polyline"
  }));
  const strokePolicy = {
    targetChunkPoints: 512,
    maximumChunkPoints: 1024,
    maximumChunkStrokes: 128,
    targetChunkBytes: 65536
  };
  const strokeSample = sampleOperation(repetitions, () => {
    let bundle = strokeBundleFromStroke(strokeDescriptors[0], {
      policy: strokePolicy
    });
    for (let index = 1; index < strokeDescriptors.length; index += 1) {
      bundle = appendStrokeToBundle(bundle, strokeDescriptors[index], {
        policy: strokePolicy
      });
    }
    return bundle;
  });
  const strokeBundle = strokeSample.value;

  const region = new Region(
    { id: "compact-baseline", type: "box-region" },
    {
      schemaVersion: 1,
      objects: [{
        id: "compact-family",
        kind: "instance-family",
        name: "Compact baseline family",
        parentId: null,
        position: [0, 0, 0],
        rotation: [0, 0, 0, 1],
        scale: [1, 1, 1],
        geometry: { type: "box", size: [1, 1, 1] },
        family
      }]
    }
  );
  const sandbox = new Sandbox(region, reducer);
  const tree = createVirtualResourceTree({ sandbox, pageSize: pageItems });
  const resourcePageSample = sampleOperation(repetitions, () => {
    const before = tree.status().diagnostics.descriptorsCreated;
    const page = tree.listChildren(
      "/objects/compact-family/members",
      {
        offset: Math.max(0, Math.floor((members - pageItems) / 2)),
        limit: pageItems
      }
    );
    const after = tree.status().diagnostics.descriptorsCreated;
    return { page, descriptorsCreated: after - before };
  });

  const scene = measureScene({
    objectCount: sceneObjects,
    samples: repetitions,
    transformCount: transforms
  });
  const structure = Object.freeze({
    family: Object.freeze({
      members,
      estimatedBytes: explicitInstanceFamilyEstimatedBytes(family),
      jsonBytes: jsonBytes(family),
      expandedInputJsonBytes: jsonBytes(instances)
    }),
    instanceBatch: Object.freeze({
      batches: batchSample.value.batches,
      instances: batchSample.value.objects,
      matrixBytes: batchSample.value.byBatch.reduce(
        (total, batch) => total + batch.capacity * 16 * 4,
        0
      )
    }),
    strokes: Object.freeze({
      strokes: strokeBundle.strokeCount,
      chunks: strokeBundle.chunks.length,
      estimatedBytes: strokeBundleEstimatedBytes(strokeBundle),
      jsonBytes: jsonBytes(strokeBundle)
    }),
    virtualPage: Object.freeze({
      items: resourcePageSample.value.page.items.length,
      total: resourcePageSample.value.page.total,
      descriptorsCreated: resourcePageSample.value.descriptorsCreated
    }),
    scene: Object.freeze({
      objects: scene.objectCount,
      serializedBytes: scene.serializedBytes
    })
  });
  const gates = evaluateCompactBaseline(structure, {
    instanceCount: members,
    strokeCount: strokes,
    sceneObjectCount: sceneObjects,
    transformCount: transforms,
    pageSize: pageItems
  });

  return Object.freeze({
    id: `compact-${members}-${strokes}-${Date.now()}`,
    type: "compact-runtime",
    comparisonKey: [
      COMPACT_BASELINE_VERSION,
      members,
      strokes,
      sceneObjects,
      transforms,
      pageItems
    ].join(":"),
    baselineVersion: COMPACT_BASELINE_VERSION,
    timestamp: new Date().toISOString(),
    instanceCount: members,
    strokeCount: strokes,
    objectCount: sceneObjects,
    transformCount: transforms,
    pageSize: pageItems,
    samples: repetitions,
    structure,
    gates,
    metrics: Object.freeze({
      familyPackMs: familySample.summary,
      instanceBatchMs: batchSample.summary,
      strokeBundleMs: strokeSample.summary,
      virtualPageMs: resourcePageSample.summary,
      ...Object.fromEntries(
        Object.entries(scene.metrics).map(([id, summary]) => [
          `scene.${id}`,
          summary
        ])
      )
    })
  });
}

function evaluateCompactBaseline(structure, scale) {
  const applicable = Object.entries(COMPACT_BASELINE_SCALE)
    .every(([key, value]) => scale[key] === value);
  if (!applicable) {
    return Object.freeze({
      applicable: false,
      ok: null,
      reason: "Escala diferente da linha de base canônica.",
      checks: Object.freeze([])
    });
  }

  const checks = [
    maximumGate(
      "family.estimatedBytes",
      structure.family.estimatedBytes,
      COMPACT_BASELINE_LIMITS.familyEstimatedBytes
    ),
    maximumGate(
      "family.jsonBytes",
      structure.family.jsonBytes,
      COMPACT_BASELINE_LIMITS.familyJsonBytes
    ),
    maximumGate(
      "instanceBatch.batches",
      structure.instanceBatch.batches,
      COMPACT_BASELINE_LIMITS.instanceBatchCount
    ),
    maximumGate(
      "instanceBatch.matrixBytes",
      structure.instanceBatch.matrixBytes,
      COMPACT_BASELINE_LIMITS.instanceMatrixBytes
    ),
    maximumGate(
      "strokes.estimatedBytes",
      structure.strokes.estimatedBytes,
      COMPACT_BASELINE_LIMITS.strokeBundleEstimatedBytes
    ),
    maximumGate(
      "strokes.jsonBytes",
      structure.strokes.jsonBytes,
      COMPACT_BASELINE_LIMITS.strokeBundleJsonBytes
    ),
    maximumGate(
      "strokes.chunks",
      structure.strokes.chunks,
      COMPACT_BASELINE_LIMITS.strokeChunkCount
    ),
    maximumGate(
      "scene.serializedBytes",
      structure.scene.serializedBytes,
      COMPACT_BASELINE_LIMITS.sceneSerializedBytes
    ),
    maximumGate(
      "virtualPage.descriptorsCreated",
      structure.virtualPage.descriptorsCreated,
      COMPACT_BASELINE_LIMITS.virtualPageDescriptors
    )
  ];
  return Object.freeze({
    applicable: true,
    ok: checks.every(check => check.ok),
    checks: Object.freeze(checks)
  });
}

function maximumGate(id, actual, maximum) {
  return Object.freeze({
    id,
    actual,
    maximum,
    ok: actual <= maximum
  });
}

function sampleOperation(repetitions, operation) {
  operation();
  const values = [];
  let value;
  for (let index = 0; index < repetitions; index += 1) {
    const started = performance.now();
    value = operation();
    values.push(performance.now() - started);
  }
  return Object.freeze({
    value,
    summary: summarizeSamples(values)
  });
}

function jsonBytes(value) {
  return new Blob([JSON.stringify(value)]).size;
}

function integer(value, minimum, maximum, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < minimum || number > maximum) {
    throw new RangeError(
      `${label} deve ser inteiro entre ${minimum} e ${maximum}.`
    );
  }
  return number;
}
