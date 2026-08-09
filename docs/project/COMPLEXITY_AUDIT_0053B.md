# Auditoria de complexidade 0053b

A auditoria passa a distinguir complexidade **semântica**, **operacional**, **visual** e **transitória**. Não se considera aceitável inferir desempenho apenas a partir de tempo de parede.

## Contadores instrumentados nesta etapa

`OccurrenceResolver` acumula:

- `resolveCalls`;
- `cacheHits` / `cacheMisses`;
- `pathSteps`;
- `descendantQueries`;
- `descendantsVisited`;
- `invalidations`.

Os scopes de complexidade registram, conforme a operação:

- `resolveCalls`;
- `resolveCacheHits`;
- `resolveCacheMisses`;
- `instancesVisited`;
- `pathSteps`;
- `descendantsVisited`;
- `editTargetsVisited`;
- `patchOperations`;
- `committedOperations`;
- `propertiesResolved`.

## Contextos

### Cena parada

Trabalho periódico esperado: `O(1)` analítico e zero renderizações após estabilização.

### Inspector

Com `S` alvos e profundidade média `H`, primeira leitura: `O(SH)`. Com cache da mesma revisão: `O(S)`. Não deve haver `structuredClone(world)` nem varredura de `scene.objects`.

### Delete

Excluir uma raiz autoritativa: `O(1)` semântico. Excluir um descendente: `O(H)` para resolver e `O(1)` para gravar o override `hidden`. A expansão de descendentes existe apenas para limpar seleção/local UI quando explicitamente necessária.

### Transformações

Mover/rotacionar/escalar `K` ocorrências: `O(KH)` cold e `O(K)` cacheado para resolução. O custo do renderer continua separado e não é atribuído ao modelo semântico.

## Consulta

```text
runtime query complexity.status
```

Um budget excedido é uma regressão arquitetural mesmo que o dispositivo testado ainda pareça rápido.
