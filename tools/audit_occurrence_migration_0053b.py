from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]
errors = []

def require(path, text, label):
    p = ROOT / path
    if not p.exists():
        errors.append(f"ausente: {path}")
        return
    data = p.read_text(encoding="utf-8")
    if text not in data:
        errors.append(f"{label} ausente em {path}")

build = json.loads((ROOT / "apps/web/build-info.json").read_text(encoding="utf-8"))
if build.get("build") != "20260807-0053d":
    errors.append(f"build incorreto: {build.get('build')!r}")

require("packages/occurrence-runtime/src/OccurrenceResolver.js", "class OccurrenceResolver", "OccurrenceResolver")
require("packages/occurrence-runtime/src/OccurrenceResolver.js", "createOccurrenceRef", "OccurrenceRef canônica")
require("packages/selection-operations/src/SelectionOperations.js", "occurrenceResolver", "migração de SelectionOperations")
require("packages/property-registry/src/SelectionPropertyService.js", "occurrenceResolver", "migração de propriedades/Inspector")
require("packages/object-inspector/src/ObjectInspector.js", "occurrenceResolver", "migração do Inspector")
require("apps/web/bootstrap/createWebRuntime.js", "new OccurrenceResolver({ sandbox })", "resolver único no runtime")
require("apps/web/bootstrap/createWebRuntime.js", 'register("occurrence.runtime.status"', "diagnóstico do resolver")
require("apps/web/bootstrap/createWebRuntime.js", 'register("complexity.status"', "diagnóstico Big-O")
require("apps/web/bootstrap/createWebRuntime.js", "complexityReporter", "auditoria de complexidade")
require("packages/selection-operations/src/SelectionOperations.js", "this.occurrenceResolver.descendantIds", "delete por ocorrência")
require("packages/selection-operations/src/SelectionOperations.js", "return this.occurrenceResolver.object(id)", "transformação por ocorrência")
require("packages/property-registry/src/SelectionPropertyService.js", "this.occurrenceResolver.object(id)", "Inspector por ocorrência")

# Guardrail: os novos contratos não podem importar renderer/Three/DOM.
for rel in [
    "packages/occurrence-runtime/src/OccurrenceResolver.js",
    "packages/occurrence-contracts/src/OccurrenceRef.js",
    "packages/occurrence-contracts/src/ResolvedOccurrence.js",
]:
    data=(ROOT/rel).read_text(encoding="utf-8")
    for forbidden in ("three", "renderer-three", "document.", "window."):
        if forbidden in data:
            errors.append(f"dependência proibida {forbidden!r} em {rel}")

if errors:
    print("Auditoria 0053b falhou:")
    for error in errors:
        print("-", error)
    raise SystemExit(1)
print("Auditoria 0053b aprovada: OccurrenceResolver canônico, Inspector/Delete/Transform migrados e telemetria Big-O ativa.")
