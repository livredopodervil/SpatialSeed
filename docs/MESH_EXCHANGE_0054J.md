# Mesh Exchange 0054j

## Objetivo

O build 0054j introduz a primeira porta de intercâmbio de malhas do SpatialSeed. O formato inicial é STL, escolhido por sua simplicidade e ampla utilização para superfícies trianguladas. STL é tratado exclusivamente como formato de transporte: após a importação, a superfície é convertida para o descritor canônico `buffer` do SpatialSeed; a edição, renderização, colisão e persistência não dependem do arquivo STL.

## Arquitetura

A implementação é dividida em três camadas.

`packages/mesh-exchange` contém o codec STL e o serviço de aplicação. Não importa Three.js, DOM nem APIs de arquivo do navegador. `StlCodec` lê STL ASCII e binário, produz uma superfície triangulada canônica e escreve STL binário ou ASCII. `MeshExchangeService` depende somente de portas injetadas para seleção, leitura de objeto, matriz mundial, triangulação e criação de geometria.

`packages/mesh-exchange-three` é o adaptador de projeção da representação atual para triângulos exportáveis. Ele usa o `GeometryRegistry` e Three.js somente para materializar a superfície final de cada objeto e aplicar sua matriz mundial. Espelhamentos com determinante negativo invertem a ordem dos vértices de cada triângulo para preservar a orientação.

`BrowserAssetFileGateway`, em `platform-web`, encapsula abertura e salvamento de arquivos binários no navegador, com File System Access API quando disponível e fallback por input/download. A lógica STL não conhece essa camada.

## Importação STL

A importação aceita STL ASCII ou binário. Por padrão, vértices coincidentes são reunidos com uma tolerância proporcional à diagonal da geometria. Isso é necessário porque STL descreve triângulos independentes e não contém conectividade topológica explícita. O resultado é um descritor `buffer` com posições e índices, criado como um objeto comum do SpatialSeed e imediatamente elegível para edição de malha.

A opção `mergeVertices=false` conserva a sopa de triângulos original. `scale` permite uma conversão explícita de unidade, pois STL não define unidade física.

STL não transporta UV, materiais, hierarquia, animações ou identidade topológica. Esses dados não podem ser recuperados do arquivo e não são inferidos silenciosamente.

## Exportação STL

A exportação opera sobre a seleção de objetos. Cada objeto é materializado pelo `GeometryRegistry`, triangulado e transformado para coordenadas mundiais. Seleções múltiplas são agregadas num único STL. O formato binário é o padrão; ASCII permanece disponível pelo contrato de serviço.

A exportação é uma projeção da superfície final: não altera o documento, não preserva materiais/UV/hierarquia e não modifica os objetos selecionados.

## Interface e comandos

A interface web expõe `Importar STL` e `Exportar STL`. A entrada usa `.stl`; a saída sugere o nome do objeto ativo ou `spatialseed-selection.stl` para múltiplos objetos.

Comandos públicos:

- `mesh.import.stl` — importa dados STL já lidos pelo adaptador de plataforma.
- `mesh.export.stl` — prepara o STL da seleção atual.
- `mesh.exchange.formats` — enumera formatos disponíveis e suas capacidades.

## Evolução

O contrato foi desenhado para receber novos formatos sem alterar o editor ou o renderer. glTF/GLB é o próximo candidato natural para intercâmbio rico, porque pode representar hierarquia, materiais e animações. Formatos adicionais devem entrar como codecs/adaptadores registrados, não como lógica especial no `MeshEditController`.
