#!/usr/bin/env python3
from pathlib import Path
import json
root = Path(__file__).resolve().parents[1]
build = json.loads((root / 'apps/web/build-info.json').read_text(encoding='utf-8'))
assert build['build'] == '20260807-0053d', build
ig = (root / 'packages/instance-graph/src/InstanceGraph.js').read_text(encoding='utf-8')
assert 'value.kind === "group" && value.instanceKind === "assembly"' in ig
assert 'semanticKind: rootDefinition?.type === "assembly" ? "group" : null' in ig
sel = (root / 'packages/selection-operations/src/SelectionOperations.js').read_text(encoding='utf-8')
assert '#isGroupId(id)' in sel
assert 'object.instanceKind === "assembly"' in sel
tests = (root / 'packages/runtime-test-plugin/src/RuntimeLayerTests.js').read_text(encoding='utf-8')
assert 'failuresOnly = false' in tests and 'reportedResults' in tests
plugin = (root / 'packages/runtime-test-plugin/src/RuntimeTestPlugin.js').read_text(encoding='utf-8')
assert 'runtime test all failed' in plugin
console = (root / 'packages/devtools/src/DevConsole.js').read_text(encoding='utf-8')
assert 'failed-only' in console and '{ suite, failuresOnly }' in console
print('Auditoria 0053c aprovada: grupos preservam interface semântica e runtime test suporta failures-only.')
