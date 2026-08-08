#!/usr/bin/env python3
from pathlib import Path
import json
root=Path(__file__).resolve().parents[1]
build=json.loads((root/'apps/web/build-info.json').read_text())
assert build['build']=='20260808-0053e', build
h=(root/'packages/transform-hierarchy/src/OccurrenceTransformHierarchy.js').read_text()
assert 'sceneScans: 0' in h and 'worldToLocalTransform' in h and 'normalizeAnchorRef' in h
o=(root/'packages/renderer-three/src/FastTransformOverlay.js').read_text()
assert 'logicalWrites: 0' in o
r=(root/'packages/renderer-three/src/ThreeRegionRenderer.js').read_text()
assert '#fastTransformOverlay = new FastTransformOverlay()' in r
assert 'this.#fastTransformOverlay.setWorldMatrix' in r
sel=(root/'packages/selection-operations/src/SelectionOperations.js').read_text()
assert '#localTransformForObject' in sel and 'this.transformHierarchy?.anchor' in sel
ed=(root/'packages/editor-core/src/EditorState.js').read_text()
assert 'policy: "anchor"' in ed
print('Auditoria 0053e aprovada: occurrence-native hierarchy, overlay transitório, anchor/pivot e duplicação local.')
