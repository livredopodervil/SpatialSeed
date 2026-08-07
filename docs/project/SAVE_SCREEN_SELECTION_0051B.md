# 0051b — correção de salvar e seleção em tela

## Sintomas corrigidos

1. O botão **Salvar** deixava de produzir o arquivo depois da introdução de
   `PersistentObjectArray` no 0051a.
2. Seleção retangular e laço ficavam instáveis, sobretudo para objetos pequenos
   na projeção ou com origem geométrica afastada do volume visível.

## Causa do salvar

`Sandbox.getState()` passou a devolver um shell imutável contendo
`PersistentObjectArray`, implementado como `Proxy`. `AppearanceRuntime` fazia
`structuredClone(scene)`. O algoritmo de structured clone não clona Proxy e
lançava `DataCloneError` antes que `BrowserProjectFileGateway` recebesse o
projeto preparado.

A correção mantém a coleção persistente para leitura normal, mas na fronteira
explícita de serialização clona apenas o shell da cena depois de retirar
`objects`. Os objetos são materializados pela iteração normal já existente.
Não se reintroduz `structuredClone` global no caminho normal do editor.

## Causa da seleção retangular/laço

`ScreenSelectionIndex` já armazenava `bounds` projetados para cada objeto, mas
`screenSelectionGestureContains()` ignorava esses bounds em `rectangle` e
`lasso` e testava apenas o ponto central. Isso tornava o resultado muito
sensível à distância, ao tamanho projetado e à origem local do objeto.

A correção usa:

- interseção retângulo × bounds projetados;
- interseção polígono do laço × bounds projetados;
- centro calculado a partir do bounding box geométrico, não do pivot/origem;
- projeção dos oito cantos do bounding box local transformado;
- extensão mínima de 6 CSS px para estabilizar objetos subpixel/distantes.

Seleção de componentes de malha continua usando pontos, pois suas entradas não
possuem bounds de objeto.

## Relação com 0051a

A correção não remove:

- `PersistentObjectArray`;
- recursos geométricos compartilhados;
- copy-on-write;
- spatial shards;
- frustum culling por shard;
- `SpatialObjectIndex` para picking por raio;
- espelho por escala negativa;
- atualização localizada de objetos.

## Validação

- `project.save` com `PersistentObjectArray`: aprovado;
- retângulo × bounds: aprovado;
- laço × bounds: aprovado;
- índice de seleção em tela: aprovado;
- temporal runtime: 19/19;
- animation runtime event-driven: 4/4;
- DevConsole runtime bridge: 3/3;
- auditorias de spatial scaling, overlays, previews, temporal, mesh e PWA:
  aprovadas.

A validação visual final de gestos depende do navegador/dispositivo.
