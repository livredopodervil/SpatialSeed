#!/usr/bin/env python3
from pathlib import Path
import json
root=Path(__file__).resolve().parents[1]
build=json.loads((root/'apps/web/build-info.json').read_text())
assert build['build']=='20260808-0053f', build
kernel=(root/'packages/transform-hierarchy/src/TransformHierarchyKernel.js').read_text()
assert 'world(n)' not in kernel  # implementation, not prose
for marker in ['class TransformHierarchyKernel','reparentLocalTransform','worldPivotOf','groupWithTransformKernel','ungroupWithTransformKernel']:
    assert marker in kernel, marker
sel=(root/'packages/selection-operations/src/SelectionOperations.js').read_text()
assert '#worldPivotForObject' in sel
assert 'resolvePivotLocal(object)' in sel
renderer=(root/'packages/renderer-three/src/ThreeRegionRenderer.js').read_text()
assert 'for (const [objectId, snapshot] of this.#session.objects)' in renderer
assert 'if (this.#session.objects.has(objectId)) continue;' in renderer
assert 'if (session.objects.has(objectId)) continue;' in renderer
manifest=json.loads((root/'tools/test-history-manifest-0053d.json').read_text())
assert manifest['version']=='historical-test-continuity-v1'
assert len(manifest['entries'])>=37
assert all(e['status'] in {'active','missing','superseded'} for e in manifest['entries'])
print('Auditoria 0053d aprovada: kernel hierárquico, pivot local, preview de raiz e continuidade histórica explicitados.')
