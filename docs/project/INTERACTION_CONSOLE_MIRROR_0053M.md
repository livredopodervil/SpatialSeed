# SpatialSeed 0053m — mirror, console compacto e criação por arrasto

## Contratos fechados

- Escala com determinante negativo usa geometria refletida, winding corrigido,
  tangentes com handedness invertida e matriz de instância positiva.
- A regra vale para objetos regulares, famílias explícitas, tubos em batches
  heterogêneos e conjuntos de traços, inclusive ao cruzar a paridade durante
  preview ou animação.
- O painel inferior esquerdo é móvel, redimensionável e persistente. Ele mantém
  o resumo de seleção/build e acrescenta uma entrada curta para o mesmo
  `DevConsole` público; a saída compacta resume testes, mutações e erros sem
  despejar estruturas JSON extensas. O console completo permanece disponível.
- Fora de campos editáveis, `Ctrl/Cmd+C` executa duplicação e `Ctrl/Cmd+D`
  executa repetição. Em `input` e `textarea`, o comportamento textual nativo é
  preservado.
- Em `ObjectPlacementController`, o ponto pressionado permanece como centro da
  nova primitiva. O arrasto determina uma escala uniforme baseada nos limites
  da geometria; um toque sem arrasto mantém escala unitária.

## Capacidades preservadas, ainda não reintegradas

1. **Câmeras 0030:** alvo persistente por ponto/objeto (`aim`), precedência
   explícita entre preview manual e animação, restauração correta ao limpar uma
   camada e visibilidade coerente dos helpers. Deve ser adaptado ao
   `LocallyResolvedObjectHierarchy`, não copiado sobre o runtime temporal atual.
2. **Âncoras cinemáticas:** `anchorRef` já resolve a matriz efetiva do alvo, mas
   ainda não define juntas, graus de liberdade, limites, propagação, detecção de
   ciclos nem serialização de um esqueleto animável.
3. **Player:** o player somente-leitura e o exportador da linha 0043c precisam
   consumir o formato atual, aparências, ocorrências/DAG e animação temporal.
4. **Ajuda e atlas de capacidades:** o catálogo e o painel recuperados devem ser
   gerados a partir dos registros atuais de comandos, queries, ferramentas,
   geometria e testes; atalhos não podem permanecer duplicados à mão.
5. **Documentação 0049a:** tutorial e material de usabilidade devem ser triados
   contra a UI atual e incorporados como documentação, sem trazer código antigo.

A antiga linha de UI descartada não é fonte de implementação desta fila.
