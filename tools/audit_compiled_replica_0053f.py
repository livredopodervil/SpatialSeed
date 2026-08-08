#!/usr/bin/env python3
from pathlib import Path
import json, hashlib
root=Path(__file__).resolve().parents[1]
build=json.loads((root/'apps/web/build-info.json').read_text())
assert build['build']=='20260808-0053f', build
# path distribution must stay byte-identical to 0053e baseline
expected={
 'packages/spatial-references/src/PathToolService.js':'85fd809fffa7a6ffcefbf6eed31e1db1c2bacabd5ea780da612988036421db20',
 'packages/spatial-references/src/PathInstancePreviewCache.js':'9efcd06d81a05bafcbe2c8d9c29e4835232eb91105662b983abf1c3b036be8ae'
}
for rel,digest in expected.items():
    got=hashlib.sha256((root/rel).read_bytes()).hexdigest()
    assert got==digest, f'{rel} alterado: {got}'
ig=(root/'packages/instance-graph/src/InstanceGraph.js').read_text()
assert 'COMPILED_DEFINITION_PROJECTIONS' in ig
assert 'projectCompiledAssemblyRoot' in ig
rr=(root/'packages/renderer-three/src/ReplicaRenderIndex.js').read_text()
assert 'definitionTraversals: 0' in rr
renderer=(root/'packages/renderer-three/src/ThreeRegionRenderer.js').read_text()
assert '#replicaRenderIndex = new ReplicaRenderIndex()' in renderer
assert 'render.replica.status' in (root/'apps/web/bootstrap/createWebRuntime.js').read_text()
print('Auditoria 0053f aprovada: distribuição por caminho intacta; definições compiladas e réplicas renderizadas por índice.')
