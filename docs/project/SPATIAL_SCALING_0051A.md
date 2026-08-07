# SpatialSeed 0051a — escalabilidade espacial e objetos compartilhados

## Objetivo

O incremento 0051a remove caminhos cujo custo crescia com o número total de
objetos mesmo quando apenas um objeto era alterado. O princípio operacional é:

> uma mudança local deve tocar o objeto alterado, seu pequeno shard espacial e
> os consumidores que dependem dele; não a cena inteira.

## 1. Estado persistente por chunks

`state.objects` permanece compatível com Array para os consumidores existentes,
mas passa a ser uma coleção persistente em chunks de 256 entradas. Alterar um
objeto substitui somente sua entrada e o chunk que a contém.

Uma atualização unitária deixa de fazer `objects.slice()`/`objects.map()` sobre
N objetos. O custo de cópia estrutural passa a ser limitado ao chunk, mais o
vetor curto de referências aos chunks.

O Sandbox mantém índices incrementais:

- `id -> object`;
- `id -> posição no armazenamento`;
- `parentId -> filhos`.

`getState()` não faz `structuredClone` do mundo. Exportação/serialização usa uma
materialização explícita.

## 2. Duplicatas leves e copy-on-write

Duplicar uma malha não copia seus arrays de geometria. A duplicata recebe um
novo envelope lógico e novos vetores de transformação, mas mantém referências
imutáveis aos recursos pesados da origem. `prototypeId` identifica a linhagem.

Assim, para uma geometria G e N cópias, o armazenamento da geometria tende a
`O(G + N)` em vez de `O(N*G)`.

Se uma operação altera um recurso estrutural da cópia, o reducer atribui um
novo `prototypeId`/`derivedFromPrototypeId`: a cópia deixa de compartilhar essa
identidade, isto é, copy-on-write sem copiar recursos durante simples
transformações.

## 3. Spatial shards

Objetos com a mesma geometria/material continuam usando instancing, mas um
batch gigante é subdividido por célula espacial e por segmentos de no máximo
256 instâncias.

Parâmetros do baseline:

- célula espacial: 32 unidades;
- capacidade de shard: 256 instâncias.

Cada shard tem bounds próprios. O frustum culling do Three.js opera sobre
esses bounds pequenos, portanto um batch visível não mantém dezenas de milhares
de instâncias distantes artificialmente visíveis.

Mover um objeto através de uma fronteira espacial migra somente esse objeto
entre shards. Durante preview/animação, o shard pequeno pode ficar
temporariamente sem culling para evitar migração a cada frame; o custo fica
limitado a no máximo 256 instâncias, não ao batch global.

## 4. Índice espacial para picking

`SpatialObjectIndex` é um grid 3D incremental de AABBs. Cada mudança de bounds
remove/adiciona apenas os vínculos celulares do objeto afetado.

O picking usa travessia DDA das células interceptadas pelo raio:

1. percorre somente células atravessadas pelo raio;
2. filtra candidatos por AABB;
3. executa raycast geométrico exato apenas nos candidatos;
4. para instâncias regulares usa um Mesh-probe individual, evitando o raycast
   de todas as instâncias de um `InstancedMesh`;
5. famílias/heterogeneous batches continuam limitadas por shards pequenos.

A seleção por área permanece uma consulta deliberadamente global e mantém seu
índice de tela cacheado; ela não roda no caminho de alteração unitária.

## 5. Frustum culling

O culling passa a ter granularidade espacial. Quando a matriz de uma instância
muda, somente o shard correspondente fica `boundsDirty`. Esse shard é
imediatamente mantido seguro para render e seus bounds são recalculados de
forma diferida; concluído o cálculo, `frustumCulled` volta a `true`.

O custo do recálculo de bounds fica limitado ao tamanho do shard.

## 6. Escala negativa = espelho

Escala zero continua inválida. Escala negativa é uma operação de espelho.

`THREE.InstancedMesh` não aceita matrizes de instância com determinante
negativo. Portanto o renderer usa duas representações de recurso:

- geometria normal;
- geometria `mirror:x`, com posições/normais refletidas e winding dos
  triângulos corrigido.

A matriz da instância é convertida para determinante positivo. O produto
visual corresponde à transformação lógica negativa, sem quebrar culling ou
raycast.

## 7. UI e subscribers

O Inspector mantém o conjunto de IDs relevantes e ignora notificações de
objetos não relacionados. O serviço de propriedades resolve seleção e
subárvores através dos índices do Sandbox, sem `getState()` global.

O painel de câmera deixa de reconstruir hierarquia/lista em toda mudança do
mundo; alterações sem relação com câmeras são ignoradas. O Outline/ResourceTree
usa o Sandbox como hierarquia autoritativa.

## 8. Complexidade esperada

Para N objetos, S objetos selecionados, A objetos animados e K candidatos ao
raio:

- alteração de um objeto: independente de N no caminho principal, limitada a
  um chunk + índices + shard;
- duplicação de objeto com geometria grande: não copia a geometria;
- propriedades da seleção: proporcional a S/subárvore selecionada;
- animação: proporcional aos objetos animados e shards afetados;
- picking: proporcional às células atravessadas + K raycasts exatos;
- culling: por shard espacial, não por batch monolítico;
- renderização GPU ainda depende da geometria efetivamente visível.

Operações estruturalmente globais, como importação completa, recuperação,
seleção em área ou certas mudanças de hierarquia, podem continuar O(N). Elas
não fazem parte do caminho quente de editar um único objeto.

## 9. Diagnóstico

No console:

```text
runtime query performance.locality.diagnostics
runtime query time.render-demand
```

Em `performance.locality.diagnostics`, verificar:

- `sandbox.objectStorage.persistent: true`;
- `renderer.spatialIndex.objects`;
- `renderer.spatialIndex.statistics.rayCandidates`;
- `renderer.spatialShards`;
- `renderer.spatialShardMigrations`.

O número de candidatos de picking deve depender da vizinhança espacial do raio,
não do número total de objetos da cena.
