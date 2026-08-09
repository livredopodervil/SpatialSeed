# Contratos canônicos de dados — 0053a

**Estado:** normativo, sem migração funcional de clientes neste incremento.  
**Baseline:** `20260807-0053a`.

## Regra central

Toda entidade manipulável é endereçada por `OccurrenceRef`; toda leitura operacional retorna `ResolvedOccurrence`; toda mutação futura deve produzir `EditPatch`; todo preview é descrito por `PreviewDescriptor`; o renderer deverá receber `RenderNode`/`RenderDelta`.

### OccurrenceRef

Identidade estrutural persistível: `rootInstanceId + path`. Não contém geometria, matriz efetiva, objeto Three.js ou cache.

Custo alvo: criação `O(H)`, comparação `O(H)`, resolução futura cold `O(H)` e cache hit `O(1)`.

### ResolvedOccurrence

View descartável contendo definição efetiva, transformação, refs de geometria/aparência, bounds e revisões. Nunca é autoritativa.

### EditPatch

Lista de operações semânticas pequenas. Alterar `K` ocorrências deve produzir `O(K)` operações; nenhuma operação unitária pode exigir snapshot integral.

### PreviewDescriptor

Estado transitório isolado. Não entra em project save, undo ou InstanceGraph.

### RenderNode / RenderDelta

Projeção já resolvida para render. O renderer não deve consultar definição, hierarquia ou Sandbox para interpretar semântica.

## Invariantes de separação

- UI nunca depende de estruturas internas do renderer.
- Renderer nunca muta o ProjectModel.
- Preview nunca entra no estado persistente.
- Temporal runtime produz canais/overlays, não mutações de GPU diretas.
- Nenhum `OccurrenceRef` contém recursos pesados.
- Nenhum `RenderNode` contém `definition`, `instanceGraph`, `sandbox`, `project` ou `threeObject`.
