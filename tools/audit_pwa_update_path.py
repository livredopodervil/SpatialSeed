#!/usr/bin/env python3
"""Audit the PWA bootstrap path that recovers from a stale controller."""

from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
BUILD_INFO = ROOT / "apps/web/build-info.json"
INDEX = ROOT / "apps/web/index.html"
BOOT = ROOT / "apps/web/boot.js"
WORKER = ROOT / "apps/web/service-worker.js"
RESET = ROOT / "apps/reset-spatialseed-cache.html"


def require(source: str, marker: str, message: str) -> None:
    if marker not in source:
        raise SystemExit(message)


def main() -> int:
    build = json.loads(BUILD_INFO.read_text(encoding="utf-8"))["build"]
    index = INDEX.read_text(encoding="utf-8")
    boot = BOOT.read_text(encoding="utf-8")
    worker = WORKER.read_text(encoding="utf-8")

    require(
        index,
        f'./boot.js?build={build}',
        "A entrada boot.js não está versionada com o build publicado.",
    )
    require(
        boot,
        "await ensureCurrentServiceWorker(buildInfo);",
        "O bootstrap não verifica o service worker antes dos módulos da aplicação.",
    )
    if boot.index("await ensureCurrentServiceWorker(buildInfo);") > boot.index(
        'import(`./main.js?build=${cacheKey}`)'
    ):
        raise SystemExit("A verificação do service worker ocorre tarde demais.")
    require(
        boot,
        "resolvePwaLocations(import.meta.url)",
        "O bootstrap não usa a fronteira canônica de localização PWA.",
    )
    require(
        boot,
        "scope:locations.scopeUrl",
        "O bootstrap não registra o worker com escopo absoluto da mesma origem.",
    )
    require(
        boot,
        '"../reset-spatialseed-cache.html",',
        "O bootstrap não possui rota de recuperação fora do escopo PWA.",
    )
    require(
        worker,
        "await self.skipWaiting();",
        "O novo service worker não assume o controle imediatamente.",
    )
    require(
        worker,
        "const exact = await cache.match(request);",
        "O cache ainda ignora o identificador de build na busca principal.",
    )
    require(
        worker,
        "cache.match(request, { ignoreSearch: true })",
        "O fallback offline sem query foi removido.",
    )
    if not RESET.is_file():
        raise SystemExit("A página externa de redefinição do cache está ausente.")
    try:
        RESET.relative_to(ROOT / "apps/web")
    except ValueError:
        pass
    else:
        raise SystemExit("A página de redefinição não pode ficar sob o escopo PWA.")

    print(f"Auditoria da atualização PWA aprovada para o build {build}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
