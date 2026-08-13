#!/usr/bin/env python3
"""Audit the non-destructive PWA update and recovery path."""

from __future__ import annotations

import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
BUILD_INFO = ROOT / "apps/web/build-info.json"
INDEX = ROOT / "apps/web/index.html"
BOOT = ROOT / "apps/web/boot.js"
WORKER = ROOT / "apps/web/service-worker.js"
PLATFORM_INDEX = ROOT / "packages/platform-web/src/index.js"
PWA_REGISTRATION = ROOT / "packages/platform-web/src/PwaRegistration.js"
RESET = ROOT / "apps/reset-spatialseed-cache.html"
BOOTSTRAP_PLATFORM_IMPORTERS = (
    ROOT / "apps/web/bootstrap/bindWebInterface.js",
    ROOT / "apps/web/bootstrap/createWebRuntime.js",
)


def require(source: str, marker: str, message: str) -> None:
    if marker not in source:
        raise SystemExit(message)


def forbid(source: str, marker: str, message: str) -> None:
    if marker in source:
        raise SystemExit(message)


def require_build_query(path: Path, source: str, build: str) -> None:
    tokens = set(re.findall(r"[?&]build=([0-9A-Za-z._-]+)", source))
    stale = sorted(token for token in tokens if token != build)
    if stale:
        raise SystemExit(
            f"{path.relative_to(ROOT)} contém builds antigos: {', '.join(stale)}"
        )


def main() -> int:
    build = json.loads(BUILD_INFO.read_text(encoding="utf-8"))["build"]
    index = INDEX.read_text(encoding="utf-8")
    boot = BOOT.read_text(encoding="utf-8")
    worker = WORKER.read_text(encoding="utf-8")
    platform_index = PLATFORM_INDEX.read_text(encoding="utf-8")
    pwa_registration = PWA_REGISTRATION.read_text(encoding="utf-8")
    reset = RESET.read_text(encoding="utf-8")

    require(
        index,
        f'./boot.js?build={build}',
        "A entrada boot.js não está versionada com o build publicado.",
    )
    require(index, 'id="pwa-update-button"', "Botão Atualizar agora ausente.")
    require(index, 'id="pwa-repair-button"', "Ação manual de reparo ausente.")
    require(
        boot,
        "const pwaRegistration = registerPwa(buildInfo",
        "O observador PWA não é registrado no início do bootstrap.",
    )
    if (
        "void pwaRegistration.checkForUpdate();" not in boot
        and "await pwaRegistration.checkForUpdate();" not in boot
    ):
        raise SystemExit("O bootstrap não verifica atualizações explicitamente.")
    if boot.index("const pwaRegistration = registerPwa(buildInfo") > boot.index(
        'import(`./main.js?build=${cacheKey}`)'
    ):
        raise SystemExit("O observador PWA é instalado tarde demais.")
    forbid(
        boot,
        "ensureCurrentServiceWorker",
        "O bootstrap ainda contém o fluxo bloqueante antigo.",
    )
    require(
        boot,
        "requiresPwaHandoff(buildInfo, pwaState)",
        "O bootstrap não bloqueia runtime misto sob controlador antigo.",
    )
    require(
        pwa_registration,
        'updateViaCache: "none"',
        "O registro PWA ainda permite cache na atualização do service worker.",
    )
    require(
        pwa_registration,
        "waitForMatchingWorker(",
        "A atualização não aguarda o worker da versão publicada.",
    )
    forbid(
        boot,
        "location.replace(resetUrl)",
        "O bootstrap ainda executa reparo automático destrutivo.",
    )
    require(
        boot,
        "await pwaRegistration.updateNow();",
        "O botão de atualização não aciona o handoff controlado.",
    )
    require(
        boot,
        'fetch(url, { cache: "no-store" })',
        "build-info publicado ainda pode ser servido pelo cache antigo.",
    )
    require(
        worker,
        "isControlPlaneRequest(url)",
        "O service worker não prioriza a rede para metadados de versão.",
    )
    require(
        pwa_registration,
        'candidate.postMessage({ type: "SKIP_WAITING" });',
        "A atualização explícita não ativa o worker aguardando.",
    )
    require(
        worker,
        'event.data?.type !== "SKIP_WAITING"',
        "O worker não aceita ativação explícita.",
    )
    install_block = worker.split('self.addEventListener("install"', 1)[1].split(
        'self.addEventListener("activate"', 1
    )[0]
    forbid(
        install_block,
        "skipWaiting",
        "O worker ainda força atualização antes da decisão do usuário.",
    )
    require(
        worker,
        "const exact = await cache.match(request);",
        "O cache não respeita primeiro a chave exata do build.",
    )
    require(
        worker,
        "cache.match(request, { ignoreSearch: true })",
        "O fallback offline sem query foi removido.",
    )
    require(
        reset,
        "spatialSeedRegistrations",
        "O reparo não limita os registros ao SpatialSeed.",
    )
    require(
        reset,
        'name.startsWith("spatialseed-static-")',
        "O reparo não limita a limpeza aos caches do SpatialSeed.",
    )
    for forbidden in ("indexedDB.deleteDatabase", "localStorage.clear", "sessionStorage.clear"):
        forbid(reset, forbidden, "O reparo apaga dados do usuário.")

    for path, source in (
        (INDEX, index),
        (BOOT, boot),
        (PLATFORM_INDEX, platform_index),
        (PWA_REGISTRATION, pwa_registration),
    ):
        require_build_query(path, source, build)
    for path in BOOTSTRAP_PLATFORM_IMPORTERS:
        source = path.read_text(encoding="utf-8")
        expected = f'platform-web/src/index.js?build={build}'
        require(source, expected, f"{path.relative_to(ROOT)} usa platform-web antigo.")

    if not RESET.is_file():
        raise SystemExit("A página externa de reparo está ausente.")
    try:
        RESET.relative_to(ROOT / "apps/web")
    except ValueError:
        pass
    else:
        raise SystemExit("A página de reparo não pode ficar sob o escopo PWA.")

    print(f"Auditoria da atualização PWA aprovada para o build {build}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
