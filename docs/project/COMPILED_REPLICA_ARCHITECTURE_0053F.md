# SpatialSeed 0053f — Compiled Replica Architecture

## Escopo

Este incremento generaliza para duplicações e assemblies duas ideias já usadas
com sucesso pela distribuição por caminho: fonte compartilhada e cache de
transformações para renderização. Os arquivos da distribuição por caminho não
foram alterados.

## Modelo

Uma definição de assembly é compilada uma vez por identidade imutável de
`instanceGraph.definitions`. A compilação produz templates de projeção contendo
`path`, `parentPath`, `definitionId`, transformação local, pivot e payload da
folha. Cópias posteriores da mesma definição apenas instanciam os templates;
não percorrem novamente o DAG de definições.

No renderer, `ReplicaRenderIndex` mantém o índice `root -> render members` e as
matrizes mundiais canônicas. Preview ou commit da raiz de um grupo usa esse
índice diretamente. Não há scan da cena nem traversal da definição durante o
arrasto.

A representação lógica permanece a do InstanceGraph: uma cópia de assembly é
somente `definitionId + local transform + overrides`.

## Complexidade

Se K é o número de nós/folhas da definição e N o número de cópias:

- primeira compilação da definição: O(K);
- traversal da definição nas N-1 cópias seguintes: O(1), cache hit;
- materialização das folhas renderizáveis de cada réplica: O(K), inevitável no
  backend atual para produzir instâncias GPU;
- duplicação lógica do assembly: O(1);
- memória lógica adicional por cópia: O(1), além de overrides;
- lookup dos membros renderizados de uma raiz: O(K) para devolver K IDs, sem
  scan global;
- preview/commit de raiz: O(K) writes de renderer no backend atual, mas O(1)
  lógica semântica e zero traversal de definição;
- cena estática: nenhum trabalho periódico novo.

Uma etapa futura pode levar a matriz raiz para a GPU e reduzir os K writes de
renderer ao mover uma réplica grande, sem mudar os contratos introduzidos aqui.

## Invariantes

- PathToolService e PathInstancePreviewCache permanecem byte a byte iguais ao
  baseline 0053e.
- Preview não escreve estado lógico.
- Uma alteração de root não recompila a definição.
- Uma cópia não duplica geometria nem definição.
- Groups-of-groups usam o mesmo `instanceRootId` para lookup de todos os
  descendentes renderizados.

## Diagnóstico

```text
runtime query instance.graph.projection
runtime query render.replica.status
runtime query transform.hierarchy.status
runtime query complexity.status
```

`instance.graph.projection.compiledDefinitions` expõe compilações e cache hits.
`render.replica.status` expõe raízes, membros e garante
`definitionTraversals = 0` e `sceneScans = 0` no índice do renderer.
