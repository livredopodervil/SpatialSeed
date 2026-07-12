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

- região autoritativa e versionada;
- sandbox especulativo com undo/redo, propostas e substituição limpa de estado;
- renderer Three.js e renderer textual;
- seleção por toque e console, inclusive seleção múltipla;
- pivôs mediana, limites, ativo, absoluto e relativo;
- transformação global/local, snapping, grade e vértices;
- duplicação, repetição afim e exclusão;
- Object Inspector com materiais e texturas;
- salvamento, abertura e novo projeto `.spatialseed`;
- camada unificada de comandos;
- testes automatizados no navegador;
- benchmarks reproduzíveis pelo console;
- 8 testes-base aprovados;
- linha de base medida para 100, 1.000 e 5.000 objetos.

## Invariantes

1. Three.js e o Viewer não são estado autoritativo.
2. Seleção, pivô, gizmos e previews pertencem ao nível editorial.
3. A região não conhece manipulações intermediárias do editor.
4. Interface, Inspector, console e agentes executam comandos canônicos.
5. Undo/redo pertence ao sandbox, não à região.
6. Editar pivô não altera o objeto.
7. Operações persistentes produzem mudanças ou deltas identificáveis.
8. Snapshots compartilhados são imutáveis.
9. Objetos idênticos compartilham protótipos sempre que possível.
10. Edição individual de instância compartilhada usa copy-on-write.
11. Atualizações são pequenas, auditáveis e reversíveis.
12. Diagnosticar e medir antes de otimizar.
13. Não pedir grandes edições manuais no celular.
14. Quando etapas dependem entre si, fornecer uma etapa por vez.
15. Sincronizar, verificar hashes, reiniciar e abrir o navegador antes de testar.
16. Toda otimização mantém ou amplia os testes automatizados.
17. Não introduzir dependência obrigatória de Node.js ou npm.

## Fluxo

```bash
cd ~/SpatialSeed-monorepo
git status --short
git diff
bash tools/seedctl test
bash tools/seedctl seed
```

`bash tools/seedctl test` sincroniza, verifica hashes, reinicia o servidor sem cache e abre a aplicação.

## Console

Comandos separados por `;` ou quebra de linha:

```text
help
commands
inspect input
inspect selection
inspect sandbox
list objects
select box-1
clear
create box
position 0 1 0
move 1 0 0
rotate 0 15 0
scale 1 2 1
pivot median
pivot bounds
pivot active
pivot absolute 0 1 0
pivot relative 0 1 0
duplicate
repeat
delete
undo
redo
vertices on
snap move 0.5
snap rotate 15
snap scale 0.1
snap grid on
gizmo
test all
benchmark scene 1000 10 100
benchmark compare
benchmark history
benchmark clear
```

## Próxima prioridade

Consolidar a arquitetura para mundo distribuído antes de ampliar ferramentas visuais.

1. criar `WorldSnapshot`, `WorldDelta` e `CommitEnvelope`;
2. separar ViewerClient, EditorSession, SandboxReplica e RegionAuthority;
3. adicionar protótipos e instâncias;
4. implementar copy-on-write;
5. introduzir snapshot interno imutável sem clones para consumidores internos;
6. notificar subscribers com uma única referência compartilhada;
7. medir custo de notificações;
8. aplicar deltas incrementais ao renderer;
9. introduzir `THREE.InstancedMesh`;
10. ampliar testes de fronteira, sincronização e instâncias.

Referências: `docs/DISTRIBUTED_WORLD_ARCHITECTURE.md`, `docs/PERFORMANCE_BASELINE.md`, `docs/NEXT_ARCHITECTURE.md`.

## Protocolo para nova LLM

1. Ler `PROJECT_SEED.md`.
2. Ler `docs/DISTRIBUTED_WORLD_ARCHITECTURE.md`.
3. Ler `docs/PERFORMANCE_BASELINE.md`.
4. Pedir `git status --short`.
5. Pedir `bash tools/seedctl verify`.
6. Não gerar código antes de conhecer o estado real.
7. Preservar funcionalidades existentes.
8. Preferir módulos pequenos e contratos explícitos.
9. Não misturar estado editorial, especulativo, autoritativo e visual.
10. Preferir patch mínimo, testável e reversível.
11. Executar `test all` após mudanças estruturais.
12. Repetir benchmarks equivalentes após otimizações.
13. Documentar decisões.
14. Regenerar esta semente após mudanças importantes.

