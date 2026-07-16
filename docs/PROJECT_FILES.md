# Arquivos de projeto

O formato inicial do Spatial Seed é um JSON autocontido com extensão `.spatialseed`.

Módulos:

- `ProjectSerializer`: cria o documento persistível;
- `ProjectValidator`: valida e normaliza;
- `ProjectService`: prepara, abre e cria documentos sem depender do DOM;
- `BrowserProjectFileGateway`: escolhe o seletor nativo quando disponível e
  preserva download/input como fallback compatível.

O arquivo salva cena, objetos, materiais, texturas, editor, pivô e configuração do renderer. Não salva seleção, logs nem histórico de undo/redo.

O comando `project.save` devolve um documento preparado (`text`, `filename`,
`mediaType` e `bytes`). A camada web decide como transportá-lo. Isso permite
que console, interface e automações compartilhem a mesma serialização sem que o
núcleo do projeto dispare efeitos visuais.
