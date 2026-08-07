#!/usr/bin/env python3
"""Static audit for the SpatialSeed 0050c independent temporal animation overlays."""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BUILD = "20260806-0050c"


def read(relative: str) -> str:
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
    build = json.loads(read("apps/web/build-info.json"))
    if build.get("build") != BUILD:
        raise SystemExit(
            f"Build incorreto: {build.get('build')!r}; esperado {BUILD}."
        )

    runtime = read(
        "packages/animation-runtime/src/TemporalAnimationRuntime.js"
    )
    for marker in (
        "temporalRuntime.register",
        'phase: "animation"',
        "timeDomains.create",
        "timeDomains.pause",
        "timeDomains.resume",
        "consumeTemporalEvents(events",
        'type: FRAME_EVENT',
        "lastAppliedSignature",
        "EvolutionResult.identity()",
        "idempotent: !segment.timeDependent",
        "surface.applyAnimationFrame",
        "surface.restoreAnimationTargets",
        "this.instances = new Map()",
        "sceneChanged(changes = [])",
    ):
        require(runtime, marker, f"Contrato temporal de animação ausente: {marker}")

    command_service = read(
        "packages/animation-runtime/src/AnimationCommandService.js"
    )
    for marker in (
        "startSegments",
        "timeDomainId",
        "createAnimationEvaluator(track.program)",
        "program.timeDependent",
        "sharedRuntimeInstanceId",
        "animation-command-service-v4-independent-instances",
    ):
        require(
            command_service,
            marker,
            f"Serviço de animação não integra o runtime temporal: {marker}"
        )

    program = read("packages/animation-runtime/src/AnimationProgram.js")
    require(
        program,
        "timeDependent: usesTimeVariables(source)",
        "Programa afim não distingue dependência temporal."
    )

    procedure = read(
        "packages/animation-runtime/src/AnimationProcedureService.js"
    )
    for marker in (
        "catalog.invocationSource",
        "programs.run",
        "plan.result?.value",
        'kind: "program"',
        'kind: "composition"',
    ):
        require(
            procedure,
            marker,
            f"Integração de procedimentos incompleta: {marker}"
        )

    panel = read("packages/animation-panel/src/AnimationPanel.js")
    for marker in (
        "[data-animation-time-domain]",
        "[data-animation-procedure]",
        'this.execute("animation.procedure"',
        "this.subscribe(snapshot",
        "[data-animation-instances]",
        'this.execute("animation.instance.stop"',
    ):
        require(panel, marker, f"Painel de animação incompleto: {marker}")
    forbid(
        panel,
        "setInterval(",
        "Painel de animação ainda mantém polling permanente."
    )

    html = read("apps/web/index.html")
    for marker in (
        "data-animation-time-domain",
        "data-animation-procedure",
        "data-animation-play-procedure",
        "data-animation-instances",
    ):
        require(html, marker, f"Controle de animação ausente: {marker}")

    bootstrap = read("apps/web/bootstrap/createWebRuntime.js")
    for marker in (
        "new TemporalAnimationRuntime",
        "animationRuntime.consumeTemporalEvents",
        '"animation.procedure"',
        '"animation.procedures.describe"',
        '"animation.instance.pause"',
        '"animation.instance.stop"',
        "new AnimationProcedureService",
        "onError: error => animationRuntime.fault(error)",
        "subscribe: listener => sharedAnimations.subscribe(listener)",
    ):
        require(bootstrap, marker, f"Integração web de animação ausente: {marker}")

    legacy = read("packages/animation-runtime/src/AnimationRuntime.js")
    require(
        legacy,
        "EvolutionResult.changed([], { value: evaluated })",
        "Compatibilidade de quadro unitário não foi corrigida."
    )

    print(
        "Auditoria 0050c aprovada: animações afins e procedimentos usam o runtime temporal."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
