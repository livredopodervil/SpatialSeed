# 0053b — migração para OccurrenceResolver canônico

**Build:** `20260807-0053b`

## Escopo atômico

Este incremento não altera o formato persistente, o renderer, mesh edit, previews ou o DAG. Ele introduz uma única fronteira operacional, `OccurrenceResolver`, e migra somente os clientes que mais sofriam com a diferença entre objeto autoritativo e ocorrência projetada:

- Inspector/propriedades;
- Delete;
- Move;
- Rotate;
- Scale;
- diagnóstico de ocorrência.

O contrato é que qualquer alvo selecionável seja convertido para `OccurrenceRef` antes de ser resolvido. IDs legados e IDs projetados `@ig/...` são aceitos apenas na borda de compatibilidade.

## Fluxo

```text
UI / Console
   ↓ command/query
Selection / Inspector
   ↓ OccurrenceRef
OccurrenceResolver
   ↓
Sandbox + InstanceGraph (compatibilidade interna temporária)
```

Os clientes migrados não precisam mais conhecer `InstanceGraph`, `isInstanceNode`, `resolveInstanceOccurrence` ou a distinção entre uma raiz autoritativa e um descendente projetado.

## Big-O alvo

Defina `H` como profundidade do caminho, `S` como seleção, `K` como alvos alterados e `Lr` como folhas do ramo explicitamente solicitado.

| operação | alvo 0053b |
|---|---:|
| resolver ocorrência, cold | `O(H)` |
| resolver ocorrência, cache | `O(1)` |
| Inspector, seleção | `O(S·H)` cold, `O(S)` cacheado |
| Delete de uma ocorrência | `O(H)` semântico |
| Delete com limpeza de seleção do ramo | `O(Lr)` somente quando requerido |
| Move/Rotate/Scale de K ocorrências | `O(K·H)` cold, `O(K)` cacheado |
| cena total não relacionada | não deve ser percorrida |

O `OccurrenceResolver` mantém cache derivado por `sandbox.revision`; qualquer alteração invalida esse cache inteiro nesta primeira implementação. Isso mantém a correção sem introduzir uma segunda política de invalidação prematuramente. A etapa seguinte poderá tornar a invalidação granular por `OccurrenceRevision`.

## Telemetria

Novas consultas:

```text
runtime query occurrence.runtime.status
runtime query complexity.status
```

`occurrence.runtime.status` expõe chamadas, hits/misses, passos de caminho e descendentes visitados. `complexity.status` contém os últimos scopes instrumentados de Inspector, Delete e transformações.

## Invariantes

1. `OccurrenceRef` não contém geometria nem tipos Three.js.
2. `OccurrenceResolver` não importa renderer, DOM ou Three.js.
3. Inspector resolve alvos através do resolver.
4. Delete resolve descendentes através do resolver.
5. Move/Rotate/Scale resolvem os objetos selecionados através do resolver.
6. IDs projetados permanecem intactos nos comandos enviados ao reducer; o reducer existente continua responsável pela persistência do override.
7. Nenhum snapshot global é necessário para resolver um alvo individual.

## Limite deliberado

O reducer ainda possui adaptação própria para ocorrências. O 0053b não tenta removê-la. Primeiro validamos funcionalmente que todos os clientes selecionados convergem para a mesma fronteira. O próximo incremento pode substituir a lógica duplicada do reducer por `EditPatch` canônico sem tocar no renderer.
