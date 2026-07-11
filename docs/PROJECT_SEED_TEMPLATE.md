# Spatial Seed — semente de continuidade

## Projeto

Navegador/editor espacial modular para Android + Termux + navegador.

## Ambiente

```text
Repositório: ~/SpatialSeed-monorepo
Cópia pública: ~/storage/shared/SpatialSeed-monorepo
Aplicação: http://127.0.0.1:8082/apps/web/
```

Não presumir Node.js ou npm. Python, Git e curl estão disponíveis.

## Estado funcional

- região autoritativa;
- sandbox com undo/redo;
- propostas explícitas;
- renderer Three.js e renderer textual;
- seleção por toque e console;
- seleção múltipla;
- pivôs mediana, limites, ativo e personalizado;
- gizmos de transformação;
- diagnóstico de input;
- painel do desenvolvedor;
- console seguro;
- Object Inspector;
- cor, dimensões e textura com tiling, offset, rotação e wrapping.

## Invariantes

1. Three.js não é estado autoritativo.
2. Seleção, pivô e ferramentas pertencem ao editor.
3. Gizmo, Inspector e console produzem comandos.
4. Undo/redo pertence ao sandbox.
5. Editar pivô não altera o objeto.
6. Atualizações devem ser pequenas, auditáveis e reversíveis.
7. Diagnosticar antes de corrigir.
8. Não pedir grandes edições manuais no celular.
9. Quando etapas dependem entre si, fornecer uma etapa por vez.
10. Sincronizar e verificar hashes antes de testar.

## Fluxo

```bash
cd ~/SpatialSeed-monorepo
git status --short
git diff
bash tools/seedctl sync
bash tools/seedctl verify
bash tools/seedctl serve
bash tools/seedctl seed
```

## Console

Comandos separados por `;` ou quebra de linha:

```text
help
inspect input
inspect selection
list objects
select box-1
select box-1 box-2
clear
pivot median
pivot bounds
pivot active
pivot custom 0 1 0
move 1 0 0
undo
redo
```

## Próxima prioridade

Melhorar gizmos e ferramentas de transformação:

- personalização visual;
- eixo, plano e centro claramente distintos;
- melhor operação touch;
- snapping configurável;
- feedback visual do modo ativo;
- testes pelo console antes da interface.

## Protocolo para nova LLM

1. Ler este arquivo.
2. Pedir `git status --short`.
3. Pedir `bash tools/seedctl verify`.
4. Não gerar código antes de conhecer o estado real.
5. Preservar funcionalidades existentes.
6. Preferir patch mínimo.
7. Documentar decisões.
8. Regenerar esta semente após mudanças importantes.
