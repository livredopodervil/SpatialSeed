> **OBSOLETO — SNAPSHOT HISTÓRICO.** Este arquivo descreve o marco `0019g-c2`
> e foi superado pelos marcos `0022` a `0026`. Não o use para determinar o
> estado atual. Consulte o [`README.md`](../../README.md), o manifesto
> [`apps/web/build-info.json`](../../apps/web/build-info.json) e execute
> `runtime test all` no build efetivamente carregado. O conteúdo abaixo foi
> preservado sem alterações como registro histórico.

# Estado atual confirmado

Build funcional: `20260713-0019g-c2`.

## Confirmado

- seleção única e múltipla;
- pivô e gizmo;
- duplicação em lote;
- duplicação afim cumulativa;
- `repeat` por matriz delta;
- geometria, materiais e texturas compartilhados;
- renderer incremental;
- `THREE.InstancedMesh`;
- picking por `instanceId`;
- highlight por `instanceColor`;
- limites espaciais atualizados apenas nos lotes alterados.

## Testes

`49 aprovados; 0 falhas`.

## Pendências

- expressões no console;
- vírgula decimal;
- tolerância de toque;
- grupos hierárquicos;
- distribuição pública/offline;
- navegador e editor de arquivos.
