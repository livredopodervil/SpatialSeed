#!/usr/bin/env python3
"""Static contract audit for SpatialSeed 0050a event-driven time."""

from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BUILD = "20260806-0050a"


def require_file(relative: str) -> str:
    path = ROOT / relative
    if not path.is_file():
        raise SystemExit(f"Arquivo ausente: {relative}")
    return path.read_text(encoding="utf-8")


def require(text: str, marker: str, message: str) -> None:
    if marker not in text:
        raise SystemExit(message)


def forbid(text: str, marker: str, message: str) -> None:
    if marker in text:
        raise SystemExit(message)


def main() -> int:
    build_info = json.loads(require_file("apps/web/build-info.json"))
    if build_info.get("build") != BUILD:
        raise SystemExit(
            f"Build incorreto: {build_info.get('build')!r}; esperado {BUILD}."
        )

    index = require_file("apps/web/index.html")
    require(index, f'./boot.js?build={BUILD}', "boot.js não usa o build 0050a.")

    renderer = require_file(
        "packages/renderer-three/src/ThreeRegionRenderer.js"
    )
    require(
        renderer,
        f'RenderDemandScheduler.js?build={BUILD}',
        "Renderer não importa RenderDemandScheduler."
    )
    require(
        renderer,
        'this.invalidateRender("initial")',
        "Renderer não agenda o primeiro quadro sob demanda."
    )
    require(
        renderer,
        'reason: "no-changes"',
        "applyChanges vazio não é tratado como identidade."
    )
    require(
        renderer,
        "getRenderDemandDiagnostics()",
        "Diagnóstico de demanda visual ausente."
    )
    require(
        renderer,
        "#animationAppliedMatrices",
        "Cache incremental de matrizes de animação ausente."
    )
    require(
        renderer,
        "numericArrayEqual(previousMatrix, transform.matrix)",
        "Matrizes inalteradas não são filtradas."
    )
    forbid(
        renderer,
        "requestAnimationFrame(this.animate)",
        "O loop permanente de requestAnimationFrame ainda existe."
    )
    if re.search(r"\n\s*this\.animate\(\);\n\s*}\n", renderer):
        raise SystemExit("O construtor ainda inicia animate() permanentemente.")

    scheduler = require_file(
        "packages/renderer-three/src/RenderDemandScheduler.js"
    )
    for marker in (
        "invalidate(reason",
        "acquireContinuous(owner",
        "releaseContinuous(token",
        "wakeAt(timestampMs",
        "if (this.#dirty)",
    ):
        require(scheduler, marker, f"Contrato do scheduler ausente: {marker}")

    temporal = require_file("packages/temporal-runtime/src/TemporalRuntime.js")
    require(
        temporal,
        "Promise.all",
        "Operações da mesma fase não são avaliadas em paralelo."
    )
    require(
        temporal,
        "EvolutionKind.FIXED_POINT",
        "Pontos fixos não são reconhecidos pelo runtime temporal."
    )
    require(
        temporal,
        "EvolutionKind.SLEEP_UNTIL",
        "Agendamento sleep-until ausente."
    )
    require(
        temporal,
        "readiness(globalTime",
        "Runtime temporal não expõe prontidão causal."
    )
    require(
        temporal,
        "lastEvaluationLocalTime",
        "Tempo local inalterado ainda pode ser reavaliado."
    )
    require(
        temporal,
        "subscribe(listener)",
        "Mudanças temporais não acordam o controlador."
    )
    require(
        temporal,
        "bumpDependencies(dependencyIds",
        "Lote de dependências incrementais ausente."
    )
    require(
        temporal,
        "if (operation.idempotent)",
        "Identidade idempotente não entra automaticamente em ponto fixo."
    )

    controller = require_file(
        "packages/temporal-runtime/src/TemporalExecutionController.js"
    )
    for marker in (
        "acquireFrameDemand",
        "releaseFrameDemand",
        "evaluateParallel",
        "nextWakeGlobalTime",
        'invalidateRender("temporal-commit")',
    ):
        require(
            controller,
            marker,
            f"Controlador temporal incompleto: {marker}"
        )

    domains = require_file(
        "packages/temporal-runtime/src/AnalyticTimeDomains.js"
    )
    require(
        domains,
        "anchorParentTime",
        "Relógios temporais não são analíticos."
    )
    require(
        domains,
        "effectiveRate",
        "Composição de taxas temporais ausente."
    )

    transform_group = require_file(
        "packages/temporal-runtime/src/TemporalTransformGroup.js"
    )
    for marker in (
        'type: "selection.transform"',
        "previousSignature",
        "timeDomainId",
    ):
        require(
            transform_group,
            marker,
            f"Grupo temporal de transformações incompleto: {marker}"
        )

    graph = require_file(
        "packages/temporal-runtime/src/IncrementalPropertyGraph.js"
    )
    require(
        graph,
        "invalidateConsumers",
        "Grafo incremental não invalida apenas consumidores."
    )

    animation = require_file(
        "packages/animation-runtime/src/AnimationRuntime.js"
    )
    require(
        animation,
        "EvolutionResult.normalize",
        "AnimationRuntime não usa resultados de evolução explícitos."
    )
    require(
        animation,
        "#releaseFrameDemand",
        "AnimationRuntime não libera demanda de quadros."
    )

    bootstrap = require_file("apps/web/bootstrap/createWebRuntime.js")
    for marker in (
        f'temporal-runtime/src/index.js?build={BUILD}',
        "const timeDomains = new AnalyticTimeDomains()",
        "const temporalRuntime = new TemporalRuntime",
        "new TemporalExecutionController",
        "snapshot: () => commandSandbox.getSnapshot()",
        "temporalDependencyIdsForChanges(changes)",
        "temporalRuntime.bumpDependencies(",
        'temporalRuntime.bumpDependency("selection")',
        'temporalRuntime.bumpDependency("editor")',
        '"time.domain.create"',
        '"time.domain.rate.set"',
        '"time.target.assign"',
        '"time.status"',
        '"time.execution"',
        '"time.render-demand"',
        "temporalRuntime,",
        "temporalExecution,",
    ):
        require(bootstrap, marker, f"Integração web ausente: {marker}")

    print("Auditoria 0050a aprovada: tempo analítico e renderização sob demanda.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
