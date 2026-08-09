#!/usr/bin/env python3
"""Audit 0052c occurrence compatibility, mesh entry and PWA handoff."""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BUILD = "20260807-0052c"


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def require(source: str, marker: str, message: str) -> None:
    if marker not in source:
        raise SystemExit(message)


def main() -> int:
    build_info = json.loads(read("apps/web/build-info.json"))
    if build_info.get("build") != BUILD:
        raise SystemExit(
            f"Build incorreto: {build_info.get('build')!r}; esperado {BUILD}."
        )

    coordinated = read("packages/local-viewers/src/CoordinatedSandbox.js")
    selection = read("packages/selection-operations/src/SelectionOperations.js")
    mesh = read("packages/mesh-editor-core/src/MeshEditController.js")
    commands = read("packages/editor-commands/src/EditorCommands.js")
    index = read("apps/web/index.html")
    boot = read("apps/web/boot.js")
    pwa = read("packages/platform-web/src/PwaRegistration.js")

    for method in (
        "getObjectDescendantIds(ids, options)",
        "getInstanceOccurrence(id)",
        "getObjectWorldMatrix(id)",
        "getObjectParentWorldMatrix(id)",
        "getRawObject(id)",
    ):
        require(
            coordinated,
            method,
            f"CoordinatedSandbox não encaminha {method}.",
        )

    require(
        selection,
        'typeof this.sandbox.getObjectDescendantIds === "function"',
        "Delete ainda depende obrigatoriamente do método de descendentes.",
    )
    require(
        mesh,
        "this.sandbox.getObject?.(objectId)",
        "MeshEditController ainda procura apenas objetos materializados.",
    )
    require(
        mesh,
        "this.sandbox.getObjectWorldMatrix?.(objectId)",
        "MeshEditController não resolve matriz mundial de ocorrência.",
    )
    require(
        mesh,
        "this.#syncSelection({ notify: false });",
        "A seleção inicial da malha não é sincronizada após ativar o gizmo.",
    )
    require(
        commands,
        'editContext.setSubjectLevel("vertex", { selectAll });',
        "mesh.edit.enter não sincroniza o nível de edição.",
    )
    require(
        commands,
        'editContext.setTool("translate");',
        "mesh.edit.enter não ativa explicitamente a ferramenta inicial.",
    )

    require(index, 'id="pwa-update-button"', "Botão Atualizar agora ausente.")
    require(index, 'id="pwa-repair-button"', "Botão de reparo PWA ausente.")
    require(
        boot,
        "requiresPwaHandoff(buildInfo, pwaState)",
        "Bootstrap não bloqueia mistura entre build novo e controller antigo.",
    )
    require(
        pwa,
        'updateViaCache: "none"',
        "Registro do service worker ainda permite cache na atualização.",
    )
    require(
        pwa,
        "waitForMatchingWorker(",
        "Atualização não aguarda o worker do build publicado.",
    )
    require(
        pwa,
        'candidate.postMessage({ type: "SKIP_WAITING" });',
        "Atualização explícita não promove o worker aguardando.",
    )

    print(
        "Auditoria 0052c aprovada: delete por ocorrência, edição de malha "
        "em cópias, sincronização inicial do gizmo e atualização PWA segura."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
